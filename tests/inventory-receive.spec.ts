/**
 * tests/inventory-receive.spec.ts
 *
 * Inventory > Inventory Management > Receive: scan-first receiving of a whole delivery
 * (OGC-438 part 11, OpenELIS-Global-2 #4366, merged 14 Oct 2026). Catalogue: inventory-receive.md
 * (TC-INVR-*).
 *
 * What #4366 claims: scan a GS1 label, type the quantity, add the line, scan the next box; every
 * field stays editable; an item that does not track lots asks only for the quantity (a batch or
 * expiry read off its label is dropped); the parser reads application identifiers 01, 10, 17 and
 * 21, skips other fixed-length identifiers and stops at anything else; an impossible date leaves
 * the expiry empty; a partly read line shows its raw scan; confirming saves the whole delivery in
 * one transaction through POST /rest/inventory/management/receive/batch; the Items tab no longer
 * shows stale stock after a receive.
 *
 * #4368 (OGC-438 part 12, merged 15 Oct) moved Receive from a tab to its own route,
 * /inventory/receive, with a menu row under Inventory (Items, Receive, Reports), and put a role
 * guard (RESULTS or ADMIN) on every inventory REST controller. The cases follow the route.
 *
 * Written 2026-10-15 against local develop.
 *
 * DATA. Every case makes its own throwaway items (helpers/inventory-fixtures.ts makeItem /
 * createItem) with a numeric product barcode unique to the run, and deactivates them at the end.
 * A GS1 label is built from that barcode: GTIN-14 is the 12-digit UPC-A with two leading zeros.
 *
 * HOW IT IS READ. Every save is checked against the lot endpoint (GET /inventory/lots/item/{id}),
 * so a line that shows as received but did not land, or landed twice, fails.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import { api, ready, makeItem, createItem, lotsOf, deactivate, boardRow, receiveLot } from '../helpers/inventory-fixtures';

test.setTimeout(180_000);

const ROUTE = '/inventory/receive';
const BOARD = '/inventory';
const BATCH = '/inventory/management/receive/batch';
const BATCH_RE = /\/rest\/inventory\/management\/receive\/batch$/;
const GS = '\u001d'; // ASCII 29, what a scanner sends for GS1's FNC1
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanup: number[] = [];

let seq = 0;
/** A 12-digit UPC-A unique to this run and case. */
function upc12(): string {
  seq += 1;
  return `6${String(Date.now()).slice(-9)}${String(seq).padStart(2, '0')}`;
}
const gtin14 = (upc: string) => `00${upc}`;
/** A GS1 element string: 01 GTIN, 17 expiry (YYMMDD), 10 lot (variable, last). */
const label = (upc: string, yymmdd: string, lot: string) => `01${gtin14(upc)}17${yymmdd}10${lot}`;

/** yyyy-mm-dd of a stored expiry, whatever shape the lot endpoint serves it in. */
const day = (v: string | number | null | undefined) => (v == null ? null : new Date(v).toISOString().slice(0, 10));

// ── page helpers ───────────────────────────────────────────────────────────

/** Open /inventory/receive and wait for the item list it loads (GET /inventory/board). */
async function openReceive(page: Page): Promise<Locator> {
  const loaded = page.waitForResponse((r) => /\/rest\/inventory\/board(\?|$)/.test(r.url()) && r.request().method() === 'GET', { timeout: 60_000 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const panel = page.locator('.receive-delivery');
  await expect(panel.locator('#delivery-scan'), 'the scan field is there').toBeVisible({ timeout: 30_000 });
  expect((await loaded).status(), 'the item list loads').toBe(200);
  return panel;
}

async function scan(panel: Locator, code: string) {
  const f = panel.locator('#delivery-scan');
  await f.fill(code);
  await f.press('Enter');
}

/** The item ComboBox's input. */
const itemInput = (panel: Locator) => panel.locator('input#delivery-item');

async function chooseItem(panel: Locator, name: string) {
  await itemInput(panel).fill(name);
  await panel.page().getByRole('option', { name: new RegExp(esc(name)) }).first().click();
}

async function setQty(panel: Locator, qty: number) {
  await panel.locator('#delivery-quantity').fill(String(qty));
}

async function addLine(panel: Locator) {
  await panel.getByRole('button', { name: /^Add to delivery$/ }).click();
}

const lineRows = (panel: Locator) => panel.locator('table tbody tr');

/** Confirm the delivery and return the batch POST's response. */
async function confirm(panel: Locator, lines: number) {
  const page = panel.page();
  const name = new RegExp(`^Receive ${lines} lines?$`);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => BATCH_RE.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 }),
    panel.getByRole('button', { name }).click(),
  ]);
  return resp;
}

/** Count batch POSTs the page makes from now on. */
function countBatchPosts(page: Page): { n: number } {
  const c = { n: 0 };
  page.on('request', (r) => { if (BATCH_RE.test(r.url()) && r.method() === 'POST') c.n += 1; });
  return c;
}

async function item(page: Page, tag: string, opts: { trackLots?: boolean } = {}) {
  const upc = upc12();
  if (opts.trackLots === false) {
    const stamp = `${Date.now()}`.slice(-7);
    const name = `QA INV ${tag} ${stamp}`;
    const id = await createItem(page, name, { upc, trackLots: false });
    cleanup.push(id);
    return { id, name, upc };
  }
  const it = await makeItem(page, tag, { upc });
  cleanup.push(it.id);
  return { ...it, upc };
}

test.afterAll(async ({ browser }) => {
  if (!cleanup.length) return;
  const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(BOARD, { waitUntil: 'domcontentloaded' });
  await ready(page);
  for (const id of cleanup) await deactivate(page, id);
  await ctx.close();
});

// ── the screen ─────────────────────────────────────────────────────────────

test.describe('Inventory Receive: scan-first delivery (OGC-438 #4366)', () => {
  test('TC-INVR-00: canary: Inventory > Receive is its own page (/inventory/receive, heading Receive, crumbs Home / Inventory / Receive) and opens on the scan field, the line fields and Add to delivery, with no lines yet', async ({ page }) => {
    const panel = await openReceive(page);
    await expect(page.getByRole('heading', { level: 1 }), 'the page heading').toHaveText(/^Receive$/);
    const crumbs = (await page.locator('.cds--breadcrumb-item').allInnerTexts()).map((t) => t.trim().replace(/\/$/, '').trim());
    expect(crumbs, 'the breadcrumb').toEqual(['Home', 'Inventory', 'Receive']);
    await expect(panel.getByText(/Nothing is saved until you confirm the whole delivery/), 'the purpose line').toBeVisible();
    await expect(panel.getByLabel(/^Scan the box$/), 'the scan field is labelled').toBeVisible();
    for (const id of ['#delivery-item', '#delivery-lot', '#delivery-expiry', '#delivery-quantity']) {
      await expect(panel.locator(id).first(), `${id} is shown`).toBeVisible();
    }
    await expect(panel.getByRole('button', { name: /^Add to delivery$/ })).toBeVisible();
    await expect(lineRows(panel), 'no lines yet').toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Receive \d+ lines?$/ }), 'nothing to confirm yet').toHaveCount(0);
  });

  test('TC-INVR-01: a GS1 label selects the item by its product barcode (UPC-A read as GTIN-14) and fills batch and expiry; the field clears and the scanner Enter saves nothing', async ({ page }) => {
    const posts = countBatchPosts(page);
    await openReceive(page);
    const it = await item(page, 'RcvScan');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'QALOT1'));
    await expect(itemInput(panel), 'the scanned product is chosen').toHaveValue(new RegExp(`^${esc(it.name)}`));
    await expect(panel.locator('#delivery-lot'), 'batch from AI 10').toHaveValue('QALOT1');
    await expect(panel.locator('#delivery-expiry'), 'expiry from AI 17').toHaveValue('2027-12-31');
    await expect(panel.locator('#delivery-scan'), 'ready for the next box').toHaveValue('');
    expect(posts.n, 'a scan writes nothing').toBe(0);
  });

  test('TC-INVR-02: two lines confirmed together are one batch POST; both lots land with their batch, expiry and quantity; the Items page shows the new stock', async ({ page }) => {
    await openReceive(page);
    const a = await item(page, 'RcvA');
    const b = await item(page, 'RcvB');
    const panel = await openReceive(page);
    const posts = countBatchPosts(page);
    await scan(panel, label(a.upc, '280131', 'QAA1'));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(a.name)}`));
    await setQty(panel, 12);
    await addLine(panel);
    await scan(panel, label(b.upc, '280229', 'QAB1'));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(b.name)}`));
    await setQty(panel, 3);
    await addLine(panel);
    await expect(lineRows(panel), 'two lines').toHaveCount(2);
    await expect(lineRows(panel).nth(0)).toContainText('QAA1');
    await expect(lineRows(panel).nth(0)).toContainText('12');
    expect(posts.n, 'adding lines writes nothing').toBe(0);
    const resp = await confirm(panel, 2);
    expect(resp.status(), await resp.text()).toBe(201);
    expect(posts.n, 'exactly one write for the delivery').toBe(1);
    await expect(panel.getByText(/^2 lines received\.$/), 'says how many were received').toBeVisible();
    await expect(lineRows(panel), 'the delivery is cleared').toHaveCount(0);
    const la = await lotsOf(page, a.id);
    const lb = await lotsOf(page, b.id);
    expect(la.map((l) => [l.lotNumber, Number(l.currentQuantity), day(l.expirationDate)])).toEqual([['QAA1', 12, '2028-01-31']]);
    expect(lb.map((l) => [l.lotNumber, Number(l.currentQuantity), day(l.expirationDate)])).toEqual([['QAB1', 3, '2028-02-29']]);
    // #4366 fixed the Items tab showing stale stock after a receive; since #4368 Items is its own page.
    await page.goto(BOARD, { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr.cds--parent-row').filter({ has: page.locator('.board-item-name', { hasText: new RegExp(`^${esc(a.name)}$`) }) });
    await expect(row, 'the new item is on the board').toHaveCount(1, { timeout: 30_000 });
    await expect(row, 'with the received stock').toContainText('12 tests');
    expect((await boardRow(page, a.name))?.onHand).toBe(12);
  });

  test('TC-INVR-03: a batch typed by hand survives a scan that carries none; a scanned batch is replaced by the next scan, even with a blank', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvKeep');
    const panel = await openReceive(page);
    await panel.locator('#delivery-lot').fill('TYPED-1');
    await scan(panel, gtin14(it.upc));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(it.name)}`));
    await expect(panel.locator('#delivery-lot'), 'the typed batch is kept').toHaveValue('TYPED-1');
    await scan(panel, label(it.upc, '271130', 'SCAN-1'));
    await expect(panel.locator('#delivery-lot')).toHaveValue('SCAN-1');
    await scan(panel, gtin14(it.upc));
    await expect(panel.locator('#delivery-lot'), "the previous label's batch is not left on the next box").toHaveValue('');
    await expect(panel.locator('#delivery-expiry')).toHaveValue('');
  });

  test('TC-INVR-04: an item that does not track lots asks only for the quantity; a batch and expiry on its label are dropped from the saved lot', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvLotless', { trackLots: false });
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'DROPME'));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(it.name)}`));
    await expect(panel.locator('#delivery-lot'), 'no batch field').toHaveCount(0);
    await expect(panel.locator('#delivery-expiry'), 'no expiry field').toHaveCount(0);
    await setQty(panel, 4);
    await addLine(panel);
    const resp = await confirm(panel, 1);
    expect(resp.status(), await resp.text()).toBe(201);
    const sent = JSON.parse(resp.request().postData() || '[]');
    expect(sent[0]?.lotNumber ?? null, 'no batch is sent').toBeNull();
    expect(sent[0]?.expirationDate ?? null, 'no expiry is sent').toBeNull();
    const lots = await lotsOf(page, it.id);
    expect(lots, 'one lot').toHaveLength(1);
    expect(Number(lots[0].currentQuantity)).toBe(4);
    expect(lots[0].lotNumber ?? '', 'the label batch is not stored').not.toBe('DROPME');
    expect(lots[0].expirationDate ?? null, 'no expiry stored').toBeNull();
  });

  test('TC-INVR-05: a production date (AI 11) is skipped; an identifier the parser does not know marks the line "Partly scanned" with the raw scan; an impossible date leaves the expiry empty', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvPart');
    const panel = await openReceive(page);
    // 11 production date (fixed length, skipped), 17 expiry, 10 lot, GS, 21 serial.
    await scan(panel, `01${gtin14(it.upc)}1124010117271231` + `10QAP1${GS}21SER9`);
    await expect(panel.locator('#delivery-lot'), 'read past the production date').toHaveValue('QAP1');
    await expect(panel.locator('#delivery-expiry')).toHaveValue('2027-12-31');
    await addLine(panel);
    await expect(lineRows(panel).nth(0).getByText(/^Partly scanned$/), 'a fully read line is not flagged').toHaveCount(0);
    // 91 (company internal, variable length) is not in the parser's table: it stops there.
    const raw = `01${gtin14(it.upc)}91QAINTERNAL`;
    await scan(panel, raw);
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(it.name)}`));
    await addLine(panel);
    const second = lineRows(panel).nth(1);
    await expect(second.getByText(/^Partly scanned$/), 'flagged').toBeVisible();
    await expect(second, 'with the raw scan').toContainText(raw);
    // 13th month.
    await scan(panel, `01${gtin14(it.upc)}17271331`);
    await expect(panel.locator('#delivery-expiry'), 'no invented date').toHaveValue('');
    await addLine(panel);
    await expect(lineRows(panel).nth(2).getByText(/^Partly scanned$/), 'flagged too').toBeVisible();
  });

  test('TC-INVR-06: a code that is not GS1 is named as not recognised; the line can be entered by hand and received', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvHand');
    const panel = await openReceive(page);
    await scan(panel, 'QR-FROM-ANOTHER-SYSTEM');
    await expect(panel.getByText(/^That code was not recognised\. Enter the line by hand\.$/)).toBeVisible();
    await expect(panel.getByText('QR-FROM-ANOTHER-SYSTEM'), 'the raw code is shown').toBeVisible();
    await chooseItem(panel, it.name);
    await panel.locator('#delivery-lot').fill('HAND-1');
    await panel.locator('#delivery-expiry').fill('2028-06-30');
    await setQty(panel, 9);
    await addLine(panel);
    const resp = await confirm(panel, 1);
    expect(resp.status(), await resp.text()).toBe(201);
    const lots = await lotsOf(page, it.id);
    expect(lots.map((l) => [l.lotNumber, Number(l.currentQuantity), day(l.expirationDate)])).toEqual([['HAND-1', 9, '2028-06-30']]);
  });

  test('TC-INVR-07: an unknown product barcode is named and offered as a new item, with the barcode carried into the item form', async ({ page }) => {
    const panel = await openReceive(page);
    const unknown = gtin14(upc12());
    await scan(panel, `01${unknown}17271231` + '10QAU1');
    await expect(panel.getByText(unknown), 'the unknown code is named').toBeVisible();
    await panel.getByRole('button', { name: /^New item$/ }).click();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => dlg.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)), { message: 'the barcode is filled in', timeout: 10_000 }).toContain(unknown);
  });

  test('TC-INVR-08: scanning an unknown box after a known one clears the chosen item, so the unknown box cannot be added under the previous product', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvPrev');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'KNOWN1'));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(it.name)}`));
    const unknown = gtin14(upc12());
    await scan(panel, `01${unknown}17280630` + '10OTHER1');
    await expect(panel.getByText(unknown), 'the second box is unknown').toBeVisible();
    await expect(panel.locator('#delivery-lot')).toHaveValue('OTHER1');
    // TRIPWIRE (found 2026-10-15, not filed): handleScan sets the item only when the barcode matches,
    // so the previous box's product stays chosen and Add to delivery files batch OTHER1 under it.
    test.fail();
    await expect(itemInput(panel), 'the previous product is no longer chosen').toHaveValue('', { timeout: 5_000 });
  });

  test('TC-INVR-09: a lot already past its expiry is warned about and can still be received', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvOld');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '240131', 'OLD1'));
    await expect(panel.getByText(/^This lot is already past its expiry date$/)).toBeVisible();
    await addLine(panel);
    const resp = await confirm(panel, 1);
    expect(resp.status(), await resp.text()).toBe(201);
    const lots = await lotsOf(page, it.id);
    expect(lots.map((l) => [l.lotNumber, day(l.expirationDate)])).toEqual([['OLD1', '2024-01-31']]);
  });

  test('TC-INVR-10: Remove drops one line and Discard delivery drops them all; neither writes anything', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvDisc');
    const panel = await openReceive(page);
    const posts = countBatchPosts(page);
    for (const lot of ['D1', 'D2', 'D3']) {
      await scan(panel, label(it.upc, '271231', lot));
      await expect(panel.locator('#delivery-lot')).toHaveValue(lot);
      await addLine(panel);
    }
    await expect(lineRows(panel)).toHaveCount(3);
    await lineRows(panel).filter({ hasText: 'D2' }).getByRole('button', { name: /^Remove$/ }).click();
    await expect(lineRows(panel)).toHaveCount(2);
    await expect(lineRows(panel).filter({ hasText: 'D2' }), 'the removed line').toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Receive 2 lines$/ }), 'the count follows').toBeVisible();
    await panel.getByRole('button', { name: /^Discard delivery$/ }).click();
    await expect(lineRows(panel)).toHaveCount(0);
    expect(posts.n, 'nothing was written').toBe(0);
    expect(await lotsOf(page, it.id), 'no lot').toHaveLength(0);
  });

  test('TC-INVR-11: a line with no item, or a quantity of 0, is refused with a message and not added', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvRefuse');
    const panel = await openReceive(page);
    await addLine(panel);
    await expect(panel.locator('.cds--inline-notification--error'), 'no item').toBeVisible();
    await expect(lineRows(panel)).toHaveCount(0);
    await chooseItem(panel, it.name);
    await setQty(panel, 0);
    await addLine(panel);
    await expect(panel.locator('.cds--inline-notification--error'), 'no quantity').toBeVisible();
    await expect(lineRows(panel)).toHaveCount(0);
  });

  test('TC-INVR-12: a delivery whose save fails on a dropped connection keeps its lines and says so; confirming again saves it once', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvDrop');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'NET1'));
    await setQty(panel, 5);
    await addLine(panel);
    let drop = true;
    await page.route(BATCH_RE, (route) => (drop ? (drop = false, route.abort('connectionreset')) : route.continue()));
    await panel.getByRole('button', { name: /^Receive 1 line$/ }).click();
    await expect(panel.locator('.cds--inline-notification--error'), 'the failure is shown').toBeVisible({ timeout: 30_000 });
    await expect(lineRows(panel), 'nothing typed is lost').toHaveCount(1);
    const resp = await confirm(panel, 1);
    expect(resp.status(), await resp.text()).toBe(201);
    const lots = await lotsOf(page, it.id);
    expect(lots.map((l) => [l.lotNumber, Number(l.currentQuantity)]), 'saved exactly once').toEqual([['NET1', 5]]);
  });

  test('TC-INVR-13: after Add to delivery the cursor is back in the scan field, so the next box can be scanned without a click', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvFocus');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'F1'));
    await setQty(panel, 2);
    await addLine(panel);
    await expect(panel.locator('#delivery-scan'), 'focus is on the scan field').toBeFocused();
    await page.keyboard.type(label(it.upc, '271231', 'F2'));
    await page.keyboard.press('Enter');
    await expect(panel.locator('#delivery-lot'), 'the next scan lands').toHaveValue('F2');
  });

  test('TC-INVR-14: leaving Receive by the menu with lines not yet received asks before dropping them', async ({ page }) => {
    await openReceive(page);
    const it = await item(page, 'RcvLeave');
    const panel = await openReceive(page);
    await scan(panel, label(it.upc, '271231', 'L1'));
    await expect(itemInput(panel)).toHaveValue(new RegExp(`^${esc(it.name)}`));
    await addLine(panel);
    await expect(lineRows(panel)).toHaveCount(1);
    const items = page.locator('a[href$="/inventory"]');
    await expect(items.first(), 'the menu links to Items').toBeAttached();
    // A menu click, as a user leaves (the menu may be collapsed, so the click is dispatched).
    await items.first().dispatchEvent('click');
    const asked = page.getByRole('dialog').filter({ hasText: /unsaved|discard|leave|not been received/i });
    const sawPrompt = await asked.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false);
    if (!sawPrompt) {
      await page.locator('a[href$="/inventory/receive"]').first().dispatchEvent('click');
      await expect(page.locator('.receive-delivery #delivery-scan')).toBeVisible({ timeout: 30_000 });
      test.info().annotations.push({ type: 'observed', description: `no prompt; lines after coming back: ${await lineRows(page.locator('.receive-delivery')).count()}` });
    }
    // TRIPWIRE (found 2026-10-15, not filed; UX heuristic): nothing asks, and the lines are gone on return.
    test.fail();
    expect(sawPrompt, 'a confirmation before the delivery is dropped').toBe(true);
  });
});

// ── the batch endpoint ─────────────────────────────────────────────────────

const line = (itemId: number, lotNumber: string | null, qty: number, expiry: string | null = '2027-12-31T00:00:00.000Z') =>
  ({ inventoryItem: { id: itemId }, lotNumber, initialQuantity: qty, currentQuantity: qty, expirationDate: expiry });

test.describe('POST /inventory/management/receive/batch (#4366)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BOARD, { waitUntil: 'domcontentloaded' });
    await ready(page);
  });

  test('TC-INVR-20: one bad line rolls back the whole delivery: nothing from the good line is stored', async ({ page }) => {
    const it = await item(page, 'RcvRoll');
    const r = await api(page, 'POST', BATCH, [line(it.id, 'ROLL-OK', 10), line(99_999_999, 'ROLL-BAD', 1)]);
    expect(r.status, `refused, not a 500: ${r.text}`).toBeGreaterThanOrEqual(400);
    expect(r.status, r.text).toBeLessThan(500);
    expect(await lotsOf(page, it.id), 'the good line is rolled back').toHaveLength(0);
  });

  test('TC-INVR-21: a line carrying an existing lot id creates a new lot and leaves the existing one untouched', async ({ page }) => {
    const it = await item(page, 'RcvId');
    const existing = await receiveLot(page, it.id, { number: 'RCV-EXIST', qty: 10, expiresInDays: 200, qc: 'PASSED' });
    const r = await api(page, 'POST', BATCH, [{ ...line(it.id, 'RCV-NEW', 7), id: existing }]);
    expect(r.status, r.text).toBe(201);
    const lots = await lotsOf(page, it.id);
    expect(lots.find((l) => l.id === existing)?.currentQuantity, 'the existing lot is untouched').toBe(10);
    expect(lots.filter((l) => l.lotNumber === 'RCV-NEW').map((l) => Number(l.currentQuantity)), 'a new lot').toEqual([7]);
  });

  test('TC-INVR-22: an empty delivery answers 201 with nothing received; a null line is skipped', async ({ page }) => {
    const e = await api(page, 'POST', BATCH, []);
    expect(e.status, e.text).toBe(201);
    expect(e.body).toEqual([]);
    const it = await item(page, 'RcvNull');
    const n = await api(page, 'POST', BATCH, [null, line(it.id, 'RCV-AFTER-NULL', 2)]);
    expect(n.status, n.text).toBe(201);
    expect(Array.isArray(n.body) ? n.body.length : -1, 'one lot back').toBe(1);
  });

  test('TC-INVR-23: a quantity of 0 or less is refused by the server with a 400, not a 500, and nothing is stored', async ({ page }) => {
    const it = await item(page, 'RcvQty');
    const seen: string[] = [];
    for (const qty of [0, -5]) {
      const r = await api(page, 'POST', BATCH, [line(it.id, `RCV-Q${qty}`, qty)]);
      seen.push(`${qty}: ${r.status} ${r.text.slice(0, 120)}`);
    }
    const stored = await lotsOf(page, it.id);
    test.info().annotations.push({ type: 'observed', description: `${seen.join(' | ')}; lots stored: ${stored.length}` });
    expect(stored, 'nothing stored').toHaveLength(0);
    // TRIPWIRE (found 2026-10-15, not filed): quantity 0 answers 500 (the receive service throws
    // past the controller's IllegalArgumentException catch). The UI refuses 0 before sending.
    test.fail();
    expect(seen.map((x) => x.split(' ')[1]), 'both refused with 400').toEqual(['400', '400']);
  });

  test('TC-INVR-24: a body that is not a list is a 400, not a 500', async ({ page }) => {
    const r = await api(page, 'POST', BATCH, { not: 'a list' });
    expect(r.status, r.text).toBe(400);
  });

  test('TC-INVR-25: Reception cannot receive stock or read the board by API (403); nothing is stored (#4368)', async ({ page, browser }) => {
    const it = await item(page, 'RcvRole');
    const state = '.auth/role-receptionist.json';
    test.skip(!fs.existsSync(state), `${state} missing: run --project=setup-roles (rbac.config.ts) against this BASE first`);
    const ctx = await browser.newContext({ storageState: state, ignoreHTTPSErrors: true });
    const rp = await ctx.newPage();
    await rp.goto('/', { waitUntil: 'domcontentloaded' });
    await ready(rp);
    const w = await api(rp, 'POST', BATCH, [line(it.id, 'RCV-RECEPTION', 1)]);
    expect(w.status, `batch as Reception: ${w.text}`).toBe(403);
    const r = await api(rp, 'GET', '/inventory/board');
    expect(r.status, `board as Reception: ${r.text}`).toBe(403);
    await ctx.close();
    expect(await lotsOf(page, it.id), 'nothing stored').toHaveLength(0);
  });
});
