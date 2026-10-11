/**
 * tests/inventory-board.spec.ts
 *
 * Inventory > Inventory Management after the OGC-438 decision-support redesign: the Items board
 * (OpenELIS-Global-2 #4356 projection endpoint, #4357 board, #4358 row actions and dashboard
 * removal), the Catalog tab and the Reports tab. Replaces tests/inventory.spec.ts and
 * tests/inventory-happy-path.spec.ts, which tested the retired dashboard (tiles, lot-status filter).
 * Catalogue: inventory-board.md (TC-INVB-*).
 *
 * Written 2026-10-11 against local develop (images 2026-10-11 12:13 UTC, develop df503f65).
 * Scope (Casey, 2026-10-11): what is merged now, parts 1 to 3 of the 17-part OGC-438 stack.
 * Extend as later parts land.
 *
 * DATA. helpers/inventory-fixtures.ts. Read-only fixtures are found or made in beforeAll and never
 * changed here; every case that acts on a row makes its own throwaway item and deactivates it at
 * the end. The projection cases (TC-INVB-10 to 12) need usage spread over 30 days, which only the
 * database can do: beforeAll re-dates it when BASE is localhost:10443 (local develop, develop-stack
 * CI); on testing.openelis-global.org those three skip and say why.
 *
 * HOW THE BOARD IS READ. Every UI assertion is checked against GET /rest/inventory/board or the lot
 * endpoints, so a row that renders but disagrees with the server fails.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import * as fs from 'fs';
import {
  INV, HISTORY, api, ready, board, boardRow, allItems, lotsOf, usageOf, transactionsOf, makeItem, receiveLot, createItem,
  deactivate, ensureInventoryFixtures, redateHistory, historySeeded, HISTORY_GAP, isoDay, type BoardRow,
} from '../helpers/inventory-fixtures';
import { NAMES } from '../helpers/ci-fixtures';

const ROOM = NAMES.room;

// Not serial: the cases share only read-only fixtures, and a canary that fails must not hide the
// rest (references/playwright-harness.md, "a cascade-skip hides everything behind it").
test.setTimeout(180_000);

const ROUTE = '/inventory';
const SEARCH = 'Search by item name, lot number or barcode';
const STATUS_LABEL: Record<BoardRow['status'], string> = {
  REORDER_NOW: 'Reorder now', REORDER_SOON: 'Reorder soon', ADEQUATE: 'Adequate', BUILDING_DATA: 'Building data',
};
const RANK: Record<BoardRow['status'], number> = { REORDER_NOW: 0, REORDER_SOON: 1, ADEQUATE: 2, BUILDING_DATA: 2 };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanup: number[] = [];

// ── page helpers ───────────────────────────────────────────────────────────

function itemsPanel(page: Page): Locator {
  return page.getByRole('tabpanel', { name: 'Items' });
}

async function openBoard(page: Page): Promise<Locator> {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const panel = itemsPanel(page);
  await expect(panel.locator('.board-item-name').first(), 'the items board renders rows').toBeVisible({ timeout: 45_000 });
  return panel;
}

async function openTab(page: Page, name: 'Catalog' | 'Reports'): Promise<Locator> {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.getByRole('tab', { name }).click();
  const panel = page.getByRole('tabpanel', { name });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return panel;
}

/** The parent row of an item, matched on its exact name. */
function itemRow(panel: Locator, name: string): Locator {
  return panel.locator('tr.cds--parent-row').filter({ has: panel.page().locator('.board-item-name', { hasText: new RegExp(`^${esc(name)}$`) }) });
}

/** Expand an item's row and return the lots area under it. */
async function expand(panel: Locator, name: string): Promise<Locator> {
  const row = itemRow(panel, name);
  await expect(row, `${name} is on the board`).toHaveCount(1, { timeout: 30_000 });
  const btn = row.locator('button.cds--table-expand__button');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  const area = row.locator('xpath=following-sibling::tr[1]');
  await expect(area.getByText('Lot Number').first(), `${name}: the lot table opens`).toBeVisible({ timeout: 15_000 });
  return area;
}

async function itemAction(panel: Locator, name: string, action: RegExp): Promise<Locator> {
  const page = panel.page();
  await itemRow(panel, name).getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
  const dlg = page.getByRole('dialog').last();
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  return dlg;
}

async function lotAction(area: Locator, lotNumber: string, action: RegExp): Promise<Locator> {
  const page = area.page();
  await area.getByRole('button', { name: `Actions for lot ${lotNumber}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
  const dlg = page.getByRole('dialog').last();
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  return dlg;
}

/**
 * Pick an option in a Carbon Dropdown inside a dialog, by its label. The options are looked up
 * inside the dialog: Carbon keeps closed modals mounted, so a page-wide option query can land on
 * a hidden modal's list and time out.
 */
async function pick(dlg: Locator, label: RegExp, option: RegExp): Promise<void> {
  await dlg.getByRole('combobox', { name: label }).click();
  await dlg.getByRole('option', { name: option }).first().click();
}

/** Submit a dialog and return the response of the write it makes. */
async function submit(dlg: Locator, button: RegExp, url: RegExp) {
  const page = dlg.page();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => url.test(r.url()) && r.request().method() !== 'GET', { timeout: 30_000 }),
    dlg.getByRole('button', { name: button }).click(),
  ]);
  return resp;
}

/** Fill the Log usage dialog (the item is chosen already when it opens from a row). */
async function logUsage(page: Page, dlg: Locator, itemName: string | null, qty: number) {
  if (itemName) {
    await dlg.locator('#quick-log-usage-item').fill(itemName);
    await page.getByRole('option', { name: new RegExp(esc(itemName)) }).first().click();
  }
  await dlg.locator('#quick-log-usage-quantity').fill(String(qty));
  return submit(dlg, /^Record Usage$/, /\/rest\/inventory\/management\/consume/);
}

async function rowNames(panel: Locator): Promise<string[]> {
  return panel.locator('tr.cds--parent-row .board-item-name').allInnerTexts();
}

// ── fixtures ───────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const log: string[] = [];
  await ensureInventoryFixtures(page, log);
  const redate = redateHistory();
  console.log(`[inventory-board] fixtures: ${log.join('; ') || 'all present'}; history re-date: ${redate ?? 'no DB (projection cases skip)'}`);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (!cleanup.length) return;
  const page = await browser.newPage();
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await ready(page);
  for (const id of cleanup) await deactivate(page, id);
  await page.close();
});

// ── the board ──────────────────────────────────────────────────────────────

test.describe('Items board (OGC-438 #4357)', () => {
  test('TC-INVB-00 [canary]: Inventory Management opens on the Items board with its columns, and the board endpoint serves the fixtures', async ({ page }) => {
    const panel = await openBoard(page);
    await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
    for (const t of ['Items', 'Catalog', 'Reports']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Items' })).toHaveAttribute('aria-selected', 'true');
    const headers = (await panel.locator('thead').first().locator('.cds--table-header-label').allInnerTexts()).map((h) => h.trim()).filter(Boolean);
    expect(headers, 'board columns').toEqual(['Item', 'On hand', 'Usage trend', 'Runs out', 'Order by', 'Status', 'Actions']);
    const names = (await board(page)).map((r) => r.name);
    for (const n of Object.values(INV)) expect(names, `${n} is served by GET /inventory/board`).toContain(n);
  });

  test('TC-INVB-01: the board lists every active item once and no inactive item, and the screen agrees with the endpoint', async ({ page }) => {
    const panel = await openBoard(page);
    const rows = await board(page);
    const items = await allItems(page);
    const active = items.filter((i) => i.isActive === 'Y').map((i) => i.name).sort();
    const served = rows.map((r) => r.name);
    expect(new Set(served).size, 'one row per item').toBe(served.length);
    expect([...served].sort(), 'board rows are exactly the active items').toEqual(active);
    expect(await rowNames(panel), 'the screen lists what the endpoint serves, in its order').toEqual(served);
  });

  test('TC-INVB-02: on hand counts usable and awaiting-QC stock only, never expired or failed-QC lots', async ({ page }) => {
    const panel = await openBoard(page);
    const row = await boardRow(page, INV.fefo);
    const lots = await lotsOf(page, row!.itemId);
    const counted = lots.filter((l) => l.countsAsAvailableStock).reduce((s, l) => s + Number(l.currentQuantity), 0);
    expect(counted, 'FIRST + LATER + PENDING').toBe(30);
    expect(row!.onHand, 'board on hand = lots that count').toBe(counted);
    expect(lots.find((l) => l.lotNumber === 'QAINVFEFO-EXPIRED')!.countsAsAvailableStock, 'expired lot').toBe(false);
    expect(lots.find((l) => l.lotNumber === 'QAINVFEFO-QCFAIL')!.countsAsAvailableStock, 'failed-QC lot').toBe(false);
    await expect(itemRow(panel, INV.fefo).locator('td').nth(2)).toHaveText(/^30\s*tests$/);
  });

  test('TC-INVB-03: without usage history the status follows the threshold: Out of stock, at-or-below threshold, Building data', async ({ page }) => {
    const panel = await openBoard(page);
    const cases: Array<[string, BoardRow['status'], RegExp]> = [
      [INV.empty, 'REORDER_NOW', /Out of stock/],
      [INV.low, 'REORDER_NOW', /Too few days of use to project a run-out date/],
      [INV.building, 'BUILDING_DATA', /Too few days of use to project a run-out date/],
    ];
    for (const [name, status, runsOut] of cases) {
      const r = await boardRow(page, name);
      expect(r?.status, `${name} status from the endpoint`).toBe(status);
      expect(r?.runOutEarly ?? null, `${name} has no run-out date`).toBeNull();
      const row = itemRow(panel, name);
      await expect(row.locator('td').nth(4), `${name} Runs out`).toHaveText(runsOut);
      await expect(row.getByText(STATUS_LABEL[status], { exact: true }), `${name} status tag`).toBeVisible();
    }
  });

  test('TC-INVB-04: rows that need action come first (Reorder now, then Reorder soon, then the rest)', async ({ page }) => {
    await openBoard(page);
    const rows = await board(page);
    const ranks = rows.map((r) => RANK[r.status]);
    expect(ranks, `served order: ${rows.map((r) => `${r.name}:${r.status}`).join(', ')}`).toEqual([...ranks].sort((a, b) => a - b));
  });

  test('TC-INVB-05: an expanded row lists its lots, marks the earliest-expiring usable lot "Use first", flags expired and failed-QC lots, and its per-location split adds up to on hand', async ({ page }) => {
    const panel = await openBoard(page);
    const area = await expand(panel, INV.fefo);
    const lotRow = (n: string) => area.locator('tr').filter({ hasText: n });
    await expect(area.getByText('Use first', { exact: true }), 'exactly one lot is use-first').toHaveCount(1);
    await expect(lotRow('QAINVFEFO-FIRST').getByText('Use first', { exact: true })).toBeVisible();
    await expect(lotRow('QAINVFEFO-EXPIRED').getByText('Expired', { exact: true })).toBeVisible();
    await expect(lotRow('QAINVFEFO-EXPIRED').getByText('Use first')).toHaveCount(0);
    await expect(lotRow('QAINVFEFO-QCFAIL').getByText('Failed QC: dispose')).toBeVisible();
    await expect(lotRow('QAINVFEFO-PENDING').getByText('Use first')).toHaveCount(0);
    const split = await area.getByText(/^By location:/).innerText();
    const sum = [...split.matchAll(/:\s*([\d.]+)\s*tests/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(sum, `per-location split "${split}" adds up to on hand`).toBe((await boardRow(page, INV.fefo))!.onHand);
  });

  test('TC-INVB-06: search finds an item by its name, by one of its lot numbers and by a lot barcode', async ({ page }) => {
    const panel = await openBoard(page);
    const fefo = await boardRow(page, INV.fefo);
    const lot = (await lotsOf(page, fefo!.itemId)).find((l) => l.lotNumber === 'QAINVFEFO-LATER')!;
    expect(lot.barcode, 'the lot has a barcode').toBeTruthy();
    const box = panel.getByPlaceholder(SEARCH);
    for (const term of [INV.fefo, 'QAINVFEFO-LATER', lot.barcode!]) {
      await box.fill(term);
      await expect(itemRow(panel, INV.fefo), `"${term}" finds ${INV.fefo}`).toHaveCount(1);
      await expect(itemRow(panel, INV.building), `"${term}" hides other items`).toHaveCount(0);
    }
    await box.fill('');
    await expect(itemRow(panel, INV.building)).toHaveCount(1);
  });

  test('TC-INVB-07: the status filter shows exactly the rows the endpoint gives that status', async ({ page }) => {
    const panel = await openBoard(page);
    const rows = await board(page);
    for (const status of ['BUILDING_DATA', 'REORDER_NOW'] as const) {
      await page.locator('#inventory-board-status-filter').selectOption({ label: STATUS_LABEL[status] });
      const want = rows.filter((r) => r.status === status).map((r) => r.name);
      await expect.poll(() => rowNames(panel), { message: `filter ${STATUS_LABEL[status]}` }).toEqual(want);
    }
    await page.locator('#inventory-board-status-filter').selectOption({ label: 'All' });
    await expect.poll(() => rowNames(panel)).toEqual(rows.map((r) => r.name));
  });

  test('TC-INVB-08: every row\'s status follows the board rule (threshold, enough history, order-by date)', async ({ page }) => {
    await openBoard(page);
    const today = isoDay(0);
    for (const r of await board(page)) {
      const floor = r.lowStockThreshold ?? 0;
      const label = `${r.name} (onHand ${r.onHand}, threshold ${r.lowStockThreshold}, median ${r.medianDailyUse}, orderBy ${r.orderByDate})`;
      if (r.onHand <= floor) expect(r.status, `${label}: at or below threshold`).toBe('REORDER_NOW');
      else if (!(r.medianDailyUse > 0)) expect(r.status, `${label}: too little history`).toBe('BUILDING_DATA');
      else if (r.orderByDate && r.orderByDate < today) expect(r.status, `${label}: order-by passed`).toBe('REORDER_NOW');
      else expect(['REORDER_SOON', 'ADEQUATE'], label).toContain(r.status);
    }
  });
});

// ── projections (need the DB to spread usage over 30 days) ───────────────────

test.describe('Run-out projection (OGC-438 #4356)', () => {
  const TITLES: Record<string, [string, string]> = {
    [INV.steady]: ['TC-INVB-10', 'steady use well ahead of the lead time projects run-out and order-by dates and reads Adequate'],
    [INV.soon]: ['TC-INVB-11', 'stock that reaches its threshold within the lead time reads Reorder soon, with the order-by date still ahead'],
    [INV.pastDue]: ['TC-INVB-12', 'an order-by date already passed reads Reorder now although stock is above the threshold'],
  };
  for (const h of HISTORY) {
    const [id, title] = TITLES[h.name];
    test(`${id}: ${title}`, async ({ page }) => {
      await openBoard(page);
      const r = await boardRow(page, h.name);
      test.skip(!historySeeded(r), HISTORY_GAP);
      const onHand = h.receive - h.perDay * 30;
      const runOut = Math.floor(onHand / h.perDay);
      expect(r!.medianDailyUse, 'median daily use').toBe(h.perDay);
      expect(r!.onHand, 'on hand after 30 days of use').toBe(onHand);
      expect(r!.runOutEarly, 'runs out (early)').toBe(isoDay(runOut));
      expect(r!.runOutLate, 'runs out (late): no spread with a constant daily use').toBe(isoDay(Math.ceil(onHand / h.perDay)));
      expect(r!.leadTimeDays, 'lead time set at creation').toBe(h.lead);
      expect(r!.leadTimeTier).toBe('SET');
      expect(r!.orderByDate, 'order by = run-out minus lead time').toBe(isoDay(runOut - h.lead));
      expect(r!.status).toBe(h.status);
      const panel = await openBoard(page);
      const row = itemRow(panel, h.name);
      await expect(row.getByText(STATUS_LABEL[h.status], { exact: true })).toBeVisible();
      if (h.name === INV.pastDue) await expect(row.locator('td').nth(5), 'order-by reads past due').toContainText(/past/i);
      else await expect(row.locator('td').nth(4), 'runs out shows a date').not.toContainText(/Too few days/);
    });
  }
});

// ── row actions (throwaway items) ──────────────────────────────────────────

test.describe('Row actions (OGC-438 #4358)', () => {
  test('TC-INVB-20: Log usage records a consumption: on hand drops, a usage record is written and the lot logs CONSUMPTION, not an adjustment', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Log', { qty: 20 });
    cleanup.push(it.id);
    const before = (await usageOf(page, it.id)).length;
    const panel = await openBoard(page);
    await panel.getByRole('button', { name: /^Log usage$/ }).click();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg).toBeVisible();
    const resp = await logUsage(page, dlg, it.name, 3);
    expect(resp.status(), `consume: ${await resp.text()}`).toBe(200);
    await expect(dlg).toBeHidden({ timeout: 15_000 });
    expect((await boardRow(page, it.name))!.onHand, 'on hand 20 - 3').toBe(17);
    expect((await usageOf(page, it.id)).length, 'one usage record').toBe(before + 1);
    const tx = (await transactionsOf(page, it.lotId!)).map((t) => t.transactionType);
    expect(tx, 'lot transactions').toContain('CONSUMPTION');
    expect(tx).not.toContain('ADJUSTMENT');
    await expect(itemRow(panel, it.name).locator('td').nth(2)).toHaveText(/^17\s*tests$/, { timeout: 15_000 });
  });

  test('TC-INVB-21: Record Usage from a row draws the earliest-expiring usable lot and never an expired one', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'FEFO');
    cleanup.push(it.id);
    const expired = await receiveLot(page, it.id, { number: `QAIX${it.id}`, qty: 10, expiresInDays: -2, qc: 'PASSED' });
    const first = await receiveLot(page, it.id, { number: `QAIA${it.id}`, qty: 10, expiresInDays: 10, qc: 'PASSED' });
    const later = await receiveLot(page, it.id, { number: `QAIB${it.id}`, qty: 10, expiresInDays: 60, qc: 'PASSED' });
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, it.name, /^Record Usage$/);
    const resp = await logUsage(page, dlg, null, 4);
    expect(resp.status(), `consume: ${await resp.text()}`).toBe(200);
    const q = Object.fromEntries((await lotsOf(page, it.id)).map((l) => [l.id, Number(l.currentQuantity)]));
    expect(q[first], 'the earliest-expiring usable lot is drawn').toBe(6);
    expect(q[expired], 'the expired lot is untouched').toBe(10);
    expect(q[later], 'the later lot is untouched').toBe(10);
  });

  test('TC-INVB-22: logging more than the usable stock is refused, says so, and changes nothing (awaiting-QC stock counts as on hand but cannot be used)', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Over', { qty: 5 });
    cleanup.push(it.id);
    await receiveLot(page, it.id, { number: `QAIP${it.id}`, qty: 10, expiresInDays: 90 });
    expect((await boardRow(page, it.name))!.onHand, 'on hand counts the pending lot').toBe(15);
    const usage = (await usageOf(page, it.id)).length;
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, it.name, /^Record Usage$/);
    await expect(dlg.getByText(/15 tests on hand/), 'the dialog reports on hand').toBeVisible();
    const resp = await logUsage(page, dlg, null, 8);
    expect(resp.status(), 'only 5 tests are usable (QC passed)').toBeGreaterThanOrEqual(400);
    await expect(dlg, 'the dialog stays open').toBeVisible();
    await expect(dlg.locator('.cds--inline-notification, [role="alert"], [role="status"], .cds--form-requirement').first(), 'the refusal is shown in the dialog').toBeVisible();
    expect((await boardRow(page, it.name))!.onHand, 'nothing consumed').toBe(15);
    expect((await usageOf(page, it.id)).length, 'no usage record').toBe(usage);
  });

  test('TC-INVB-23: Adjust Quantity corrects a count as an ADJUSTMENT and writes no usage (the projection ignores it)', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Adj', { qty: 20 });
    cleanup.push(it.id);
    const panel = await openBoard(page);
    const area = await expand(panel, it.name);
    const dlg = await lotAction(area, it.lotNumber!, /^Adjust Quantity$/);
    await dlg.locator('#newQuantity').fill('18');
    await pick(dlg, /Reason for Adjustment/, /^Data Entry Error Correction$/);
    const resp = await submit(dlg, /^Adjust$/, /\/rest\/inventory\/lots\/\d+\/adjust/);
    expect(resp.status(), `adjust: ${await resp.text()}`).toBeLessThan(300);
    expect(Number((await lotsOf(page, it.id))[0].currentQuantity)).toBe(18);
    expect((await transactionsOf(page, it.lotId!)).map((t) => t.transactionType)).toContain('ADJUSTMENT');
    expect((await usageOf(page, it.id)).length, 'an adjustment is not usage').toBe(0);
    expect((await boardRow(page, it.name))!.onHand).toBe(18);
  });

  test('TC-INVB-24: Update QC Status to Failed takes the lot out of on hand and out of use-first, and flags it for disposal', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'QC', { qty: 20, threshold: 1 });
    cleanup.push(it.id);
    const panel = await openBoard(page);
    const area = await expand(panel, it.name);
    await expect(area.getByText('Use first', { exact: true })).toHaveCount(1);
    const dlg = await lotAction(area, it.lotNumber!, /^Update QC Status$/);
    await expect(dlg.getByRole('button', { name: /^Update$/ }), 'Update waits for a new status').toBeDisabled();
    await pick(dlg, /New QC Status/, /^Failed$/);
    // A failure needs a note: Update without one says "Please provide notes explaining QC failure".
    await dlg.locator('#notes').fill('QA: control out of range');
    const resp = await submit(dlg, /^Update$/, /\/rest\/inventory\/lots\/\d+\/qc-status/);
    expect(resp.status(), `qc: ${await resp.text()}`).toBeLessThan(300);
    expect((await lotsOf(page, it.id))[0].qcStatus).toBe('FAILED');
    expect((await boardRow(page, it.name))!.onHand, 'failed-QC stock does not count').toBe(0);
    const area2 = await expand(await openBoard(page), it.name);
    await expect(area2.getByText('Failed QC: dispose')).toBeVisible();
    await expect(area2.getByText('Use first', { exact: true })).toHaveCount(0);
  });

  test('TC-INVB-25: Dispose Lot retires the lot: it leaves on hand and the item turns Reorder now', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Disp', { qty: 20, threshold: 5 });
    cleanup.push(it.id);
    const panel = await openBoard(page);
    const area = await expand(panel, it.name);
    // Carbon prefixes danger controls' names with "danger": anchor at the start for the menu item
    // and at the end for the button.
    const dlg = await lotAction(area, it.lotNumber!, /^Dispose Lot/);
    await pick(dlg, /Disposal Reason/, /./);
    const resp = await submit(dlg, /Dispose$/, /\/rest\/inventory\/lots\/\d+\/dispose/);
    expect(resp.status(), `dispose: ${await resp.text()}`).toBeLessThan(300);
    expect((await lotsOf(page, it.id))[0].status).toBe('DISPOSED');
    const r = await boardRow(page, it.name);
    expect(r!.onHand).toBe(0);
    expect(r!.status).toBe('REORDER_NOW');
    expect((await transactionsOf(page, it.lotId!)).map((t) => t.transactionType)).toContain('DISPOSAL');
  });

  test('TC-INVB-26: Receive stock from a row creates the lot with its number, quantity, expiry and storage location, and on hand rises', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Recv', { threshold: 5 });
    cleanup.push(it.id);
    const lotNumber = `QAIR${it.id}`;
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, it.name, /^Receive stock$/);
    await expect(dlg.getByText(it.name).first(), 'the row\'s item is preselected').toBeVisible();
    await dlg.locator('#lotNumber').fill(lotNumber);
    await dlg.locator('#currentQuantity').fill('12');
    // Carbon's DatePicker (flatpickr) ignores a plain fill: set the date the way a pick does.
    const exp = new Date(Date.now() + 90 * 86_400_000);
    await dlg.locator('#expirationDate').evaluate((el: any, iso: string) => el._flatpickr?.setDate(new Date(iso), true), exp.toISOString());
    const us = `${String(exp.getMonth() + 1).padStart(2, '0')}/${String(exp.getDate()).padStart(2, '0')}/${exp.getFullYear()}`;
    await expect(dlg.locator('#expirationDate'), 'the expiration date is set').toHaveValue(us);
    await dlg.getByRole('button', { name: /Assign storage location/ }).click();
    const picker = page.getByRole('dialog').filter({ has: page.getByText('Search for a storage location') });
    await expect(picker).toBeVisible();
    await picker.getByRole('combobox', { name: 'Room' }).click();
    await picker.getByRole('option', { name: ROOM }).first().click();
    await picker.getByRole('button', { name: /^Confirm$/ }).click();
    await expect(picker).toBeHidden();
    await expect(dlg.getByText('Not assigned'), 'a location is chosen').toHaveCount(0);
    const resp = await submit(dlg, /^Save$/, /\/rest\/inventory\/management\/receive/);
    expect(resp.status(), `receive: ${await resp.text()}`).toBe(201);
    await expect(dlg).toBeHidden({ timeout: 20_000 });
    const lots = await lotsOf(page, it.id);
    expect(lots.map((l) => l.lotNumber)).toEqual([lotNumber]);
    expect(Number(lots[0].currentQuantity)).toBe(12);
    expect(lots[0].qcStatus, 'a received lot waits for QC').toBe('PENDING');
    expect(lots[0].expirationDate, 'an expiration date is stored').toBeTruthy();
    expect(new Date(lots[0].expirationDate as any).toISOString().slice(0, 10), 'expiry kept as the day picked').toBe(isoDay(90));
    const loc = await api(page, 'GET', `/storage/inventory-lots/${lots[0].id}`);
    expect(loc.status, `location of the new lot: ${loc.text}`).toBe(200);
    expect(loc.body?.hierarchicalPath ?? loc.body?.locationId, 'the lot has a storage location').toBeTruthy();
    expect((await boardRow(page, it.name))!.onHand, 'pending stock counts as on hand').toBe(12);
  });

  test('TC-INVB-27: Edit item details saves a new threshold and the row\'s status follows it', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Edit', { qty: 20, threshold: 5 });
    cleanup.push(it.id);
    expect((await boardRow(page, it.name))!.status).toBe('BUILDING_DATA');
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, it.name, /^Edit item details$/);
    await dlg.locator('#lowStockThreshold').fill('50');
    const resp = await submit(dlg, /^Save$/, /\/rest\/inventory\/items\/\d+$/);
    expect(resp.status(), `update item: ${await resp.text()}`).toBe(200);
    const r = await boardRow(page, it.name);
    expect(r!.lowStockThreshold).toBe(50);
    expect(r!.status, '20 on hand is at or below 50').toBe('REORDER_NOW');
  });
});

// ── catalog and reports (carried over from tests/inventory.spec.ts) ─────────

test.describe('Catalog and Reports tabs', () => {
  test('TC-INVB-30: Add Catalog Item creates an active item that is listed in the catalog and on the board (was TC-INV-04/06)', async ({ page }) => {
    const panel = await openTab(page, 'Catalog');
    const name = `QA INV Cat ${Date.now().toString().slice(-7)}`;
    await panel.getByRole('button', { name: /^Add Catalog Item$/i }).click();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg).toBeVisible();
    await dlg.locator('#name').fill(name);
    await dlg.getByRole('combobox', { name: /Item Type/i }).click();
    await page.getByRole('option', { name: /^Reagent$/ }).click();
    await dlg.locator('#units').fill('tests');
    await dlg.locator('#lowStockThreshold').fill('5');
    await dlg.locator('#stabilityAfterOpening').fill('30');
    const resp = await submit(dlg, /^Save$/, /\/rest\/inventory\/items$/);
    expect(resp.status(), `create: ${await resp.text()}`).toBe(201);
    cleanup.push(Number((await resp.json()).id));
    await expect(dlg).toBeHidden({ timeout: 15_000 });
    const r = await boardRow(page, name);
    expect(r, 'the new item is on the board').toBeTruthy();
    expect(r!.status, 'no stock: at or below threshold').toBe('REORDER_NOW');
    const cat = await openTab(page, 'Catalog');
    await cat.getByPlaceholder(/search/i).first().fill(name).catch(() => undefined);
    await expect(cat.locator('tr').filter({ hasText: name }).getByText('Active', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('TC-INVB-31: a Reagent cannot be saved without its stability after opening (was TC-INV-05)', async ({ page }) => {
    const panel = await openTab(page, 'Catalog');
    await panel.getByRole('button', { name: /^Add Catalog Item$/i }).click();
    const dlg = page.getByRole('dialog').last();
    await dlg.locator('#name').fill(`QA INV NoStab ${Date.now().toString().slice(-7)}`);
    await dlg.getByRole('combobox', { name: /Item Type/i }).click();
    await page.getByRole('option', { name: /^Reagent$/ }).click();
    await dlg.locator('#units').fill('tests');
    await dlg.locator('#stabilityAfterOpening').fill('');
    let posted = false;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/rest\/inventory\/items$/.test(r.url())) posted = true; });
    await dlg.getByRole('button', { name: /^Save$/ }).click();
    await expect(dlg.getByText(/stability/i).filter({ hasText: /required|must|enter/i }).first()).toBeVisible();
    await expect(dlg).toBeVisible();
    expect(posted, 'nothing is sent').toBe(false);
  });

  test('TC-INVB-32: the catalog Item Type filter lists only items of that type (was TC-INV-07)', async ({ page }) => {
    await openBoard(page);
    // A non-reagent the filter must hide.
    const rdt = `QA INV RDT ${Date.now().toString().slice(-7)}`;
    const rdtId = await createItem(page, rdt, { itemType: 'RDT', threshold: 2 });
    cleanup.push(rdtId);
    const panel = await openTab(page, 'Catalog');
    const search = panel.getByRole('searchbox').or(panel.locator('input[id^="table-toolbar-search"]')).first();
    await search.fill(rdt);
    await expect(panel.locator('tbody tr').filter({ hasText: rdt }), 'the RDT is listed before filtering').toHaveCount(1);
    await search.fill('');
    // The first of the two "All" dropdowns in the toolbar is Item Type, the second Status.
    await panel.getByRole('combobox').first().click();
    const opts = await panel.getByRole('option').allInnerTexts();
    expect(opts.some((o) => /reagent/i.test(o)), `type options: ${opts.join(', ')}`).toBe(true);
    await panel.getByRole('option', { name: /reagent/i }).first().click();
    await expect(panel.locator('tbody tr').first()).toBeVisible();
    const rows = (await panel.locator('tbody tr').allInnerTexts()).map((r) => r.replace(/\s+/g, ' '));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r, 'every listed item is a reagent').toMatch(/reagent/i);
    await search.fill(rdt);
    await expect(panel.locator('tbody tr').filter({ hasText: rdt }), 'the RDT is filtered out').toHaveCount(0);
  });

  test('TC-INVB-33: the catalog Action column is labelled, not a raw i18n key (was TC-INV-03, BUG-61 fixed)', async ({ page }) => {
    const panel = await openTab(page, 'Catalog');
    await expect(panel.getByRole('columnheader', { name: /^Actions?$/ }).first()).toBeVisible();
    expect(await panel.innerText()).not.toContain('label.button.action');
  });

  test('TC-INVB-34: a deactivated item leaves the board; activating it brings it back with its stock', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Deact', { qty: 3 });
    cleanup.push(it.id);
    expect(await boardRow(page, it.name), 'on the board while active').toBeTruthy();
    const d = await api(page, 'PUT', `/inventory/items/${it.id}/deactivate`, {});
    expect(d.status, d.text).toBeLessThan(300);
    expect(await boardRow(page, it.name), 'gone once inactive').toBeUndefined();
    await expect(itemRow(await openBoard(page), it.name)).toHaveCount(0);
    const a = await api(page, 'PUT', `/inventory/items/${it.id}/activate`, {});
    expect(a.status, a.text).toBeLessThan(300);
    expect((await boardRow(page, it.name))?.onHand, 'back with its stock').toBe(3);
  });

  test('TC-INVB-40: the Reports tab offers the stock-levels and low-stock reports and a Generate button (was TC-INV-08)', async ({ page }) => {
    const panel = await openTab(page, 'Reports');
    await panel.getByRole('combobox', { name: /Report Type/i }).click();
    const options = await page.getByRole('option').allInnerTexts();
    expect(options.some((o) => /stock levels/i.test(o)), `report types: ${options.join(' | ')}`).toBe(true);
    expect(options.some((o) => /low stock/i.test(o)), 'low stock report').toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: /^Generate$/ })).toBeEnabled();
  });

  test('TC-INVB-41: Generate on the Stock Levels report downloads a non-empty PDF and says so', async ({ page }) => {
    const panel = await openTab(page, 'Reports');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      panel.getByRole('button', { name: /^Generate$/ }).click(),
    ]);
    const file = await download.path();
    const head = fs.readFileSync(file!).subarray(0, 4).toString();
    expect(head, 'PDF magic').toBe('%PDF');
    expect(fs.statSync(file!).size, 'not empty').toBeGreaterThan(1000);
    await expect(panel.getByText(/Report generated and downloaded successfully/)).toBeVisible();
  });

  test('TC-INVB-42: the downloaded report keeps its file extension [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-11, no ticket yet: Casey decides). ReportsAPI.generate in
    // frontend/src/components/inventory/InventoryService.js reads the name with the greedy
    // /filename="?(.+)"?/i, so the closing quote of `filename="stock-levels.pdf"` is captured and
    // the browser saves "stock-levels.pdf_". Every format is affected (.pdf_, .csv_, .xlsx_).
    // printLabel in the same file uses the lazy (.+?) and is fine.
    test.fail();
    const panel = await openTab(page, 'Reports');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      panel.getByRole('button', { name: /^Generate$/ }).click(),
    ]);
    expect(download.suggestedFilename(), 'the saved file name').toMatch(/\.pdf$/);
  });
});
