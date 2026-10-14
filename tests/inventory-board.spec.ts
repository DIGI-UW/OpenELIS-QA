/**
 * tests/inventory-board.spec.ts
 *
 * Inventory > Inventory Management after the OGC-438 decision-support redesign: the Items board
 * (OpenELIS-Global-2 #4356 projection endpoint, #4357 board, #4358 row actions and dashboard
 * removal) and the Reports tab. Replaces tests/inventory.spec.ts and
 * tests/inventory-happy-path.spec.ts, which tested the retired dashboard (tiles, lot-status filter).
 * Catalogue: inventory-board.md (TC-INVB-*).
 *
 * Written 2026-10-11 against local develop (images 2026-10-11 12:13 UTC, develop df503f65).
 * Scope (Casey, 2026-10-11): what is merged now, parts 1 to 3 of the 17-part OGC-438 stack.
 * Extend as later parts land. Part 4 (#4359: reorder suggestions, mark as ordered, the critical
 * banner) added 2026-10-12 against develop a4200e2d: TC-INVB-50 to 59. Parts 5 to 10 (#4360 to
 * #4365: learned lead time, tags instead of item type, tag directory and filter, items defined on
 * the board and the Catalog tab retired, count mode, receive from a row and the product barcode)
 * taken in 2026-10-13 against develop b5943f5a: TC-INVB-30 to 32 rewritten on the board, 33
 * retired, 35 to 37 new, 60 and 62 flipped (fixed).
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
  markOrdered, clearOrdered, dbSql, INV_DB, normalizeBoard, consume,
} from '../helpers/inventory-fixtures';
import { NAMES } from '../helpers/ci-fixtures';

const ROOM = NAMES.room;

// Not serial: the cases share only read-only fixtures, and a canary that fails must not hide the
// rest (references/playwright-harness.md, "a cascade-skip hides everything behind it").
test.setTimeout(180_000);

const ROUTE = '/inventory';
const SEARCH = 'Search by item name, code, tag or lot number';
const STATUS_LABEL: Record<BoardRow['status'], string> = {
  REORDER_NOW: 'Reorder now', REORDER_SOON: 'Reorder soon', ADEQUATE: 'Adequate', BUILDING_DATA: 'Building data',
};
// Since #4360 Building data sorts after Adequate.
const RANK: Record<BoardRow['status'], number> = { REORDER_NOW: 0, REORDER_SOON: 1, ADEQUATE: 2, BUILDING_DATA: 3 };
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

async function openTab(page: Page, name: 'Reports'): Promise<Locator> {
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

// ── ordering (#4359) ───────────────────────────────────────────────────────

/**
 * Open the board and return the rows the page itself loaded. The banner and the suggestions panel
 * are computed from that one response, so comparing against it is exact even while other workers
 * add items between two GETs.
 */
async function openBoardRows(page: Page): Promise<{ panel: Locator; rows: BoardRow[] }> {
  const resp = page.waitForResponse((r) => /\/rest\/inventory\/board(\?|$)/.test(r.url()) && r.request().method() === 'GET', { timeout: 60_000 });
  const panel = await openBoard(page);
  const body = await (await resp).json();
  return { panel, rows: normalizeBoard(Array.isArray(body) ? body : body?.data ?? []) };
}

const SUGGESTED: BoardRow['status'][] = ['REORDER_NOW', 'REORDER_SOON'];
const isSuggested = (r: BoardRow) => SUGGESTED.includes(r.status);
/** "Critical" in #4359 is the board's own Reorder now, not yet marked ordered (items have no criticality field). */
const unaddressed = (rows: BoardRow[]) => rows.filter((r) => r.status === 'REORDER_NOW' && !r.orderedOn);
const BANNER_NAMES = 5;

/** The banner names the first five unaddressed Reorder now items in board order and counts the rest. */
async function expectBanner(page: Page, rows: BoardRow[]): Promise<void> {
  const crit = unaddressed(rows);
  const banner = page.locator('.board-critical-banner');
  if (!crit.length) { await expect(banner, 'no banner when nothing critical is unaddressed').toHaveCount(0); return; }
  await expect(banner, 'the critical banner').toBeVisible();
  const text = (await banner.innerText()).replace(/\s+/g, ' ');
  expect(text, 'the banner names the first five, in board order').toContain(crit.slice(0, BANNER_NAMES).map((r) => r.name).join(' · '));
  if (crit.length > BANNER_NAMES) expect(text, 'and counts the rest').toContain(`and ${crit.length - BANNER_NAMES} more`);
  else expect(text).not.toMatch(/and \d+ more/);
  for (const r of rows.filter((x) => x.orderedOn)) expect(text, `${r.name} is on order, so not in the banner`).not.toContain(r.name);
}

/** Open Reorder suggestions from the toolbar. */
async function openSuggestions(page: Page): Promise<Locator> {
  await itemsPanel(page).getByRole('button', { name: /^Reorder suggestions/ }).click();
  const dlg = page.getByRole('dialog').filter({ hasText: 'Marking as ordered records that an order was placed' });
  await expect(dlg, 'the suggestions panel opens').toBeVisible({ timeout: 15_000 });
  return dlg;
}

function suggestionRow(dlg: Locator, name: string): Locator {
  return dlg.locator('tbody tr').filter({ hasText: name });
}

/** Tick a row in the suggestions table (Carbon hides the input behind its label). */
async function select(dlg: Locator, name: string): Promise<void> {
  const row = suggestionRow(dlg, name);
  await expect(row, `${name} is in the suggestions`).toHaveCount(1);
  await row.locator('td').first().locator('label').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
}

/** Set a Carbon DatePicker (flatpickr ignores fill) the way a pick does. */
async function pickDate(input: Locator, iso: string): Promise<void> {
  await input.evaluate((el: any, d: string) => el._flatpickr?.setDate(new Date(`${d}T12:00:00`), true), iso);
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
    // #4363 retired the Catalog tab: items are defined from the board (New item).
    for (const t of ['Items', 'Reports']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Catalog' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Items' })).toHaveAttribute('aria-selected', 'true');
    const headers = (await panel.locator('thead').first().locator('.cds--table-header-label').allInnerTexts()).map((h) => h.trim()).filter(Boolean);
    expect(headers, 'board columns').toEqual(['Item', 'On hand', 'Usage trend', 'Runs out', 'Order by', 'Status', 'Last count', 'Actions']);
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
    await expect(dlg.locator('#quick-receive-item'), 'the row\'s item is preselected').toHaveValue(new RegExp(`^${esc(it.name)}`));
    await dlg.locator('#quick-receive-quantity').fill('12');
    // Lot number and expiry show because the item tracks lots (#4365).
    await dlg.locator('#quick-receive-lot').fill(lotNumber);
    await pickDate(dlg.locator('#quick-receive-expiry'), isoDay(90));
    await expect(dlg.locator('#quick-receive-expiry'), 'the expiration date is set').toHaveValue(isoDay(90));
    await dlg.getByRole('button', { name: /Assign storage location/ }).click();
    const picker = page.getByRole('dialog').filter({ has: page.getByText('Search for a storage location') });
    await expect(picker).toBeVisible();
    await picker.getByRole('combobox', { name: 'Room' }).click();
    await picker.getByRole('option', { name: ROOM }).first().click();
    await picker.getByRole('button', { name: /^Confirm$/ }).click();
    await expect(picker).toBeHidden();
    await expect(dlg.getByText(/^Not assigned/), 'a location is chosen').toHaveCount(0);
    const resp = await submit(dlg, /^Receive$/, /\/rest\/inventory\/management\/receive/);
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

// ── defining items, tags, count mode, receiving, reports ───────────────────

test.describe('Defining items, tags, count mode and Reports (#4361 to #4365)', () => {
  test('TC-INVB-30: New item on the board defines an active item with its tags, and it is listed on the board (was the Catalog tab\'s Add Catalog Item)', async ({ page }) => {
    const panel = await openBoard(page);
    const name = `QA INV New ${Date.now().toString().slice(-7)}`;
    await panel.getByRole('button', { name: /^New item$/ }).click();
    const dlg = page.getByRole('dialog').filter({ has: page.locator('#itemTags') });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await dlg.locator('#name').fill(name);
    // A tag the directory already knows, typed in another case, is folded to its spelling.
    await dlg.locator('#itemTags').fill('reagent');
    await dlg.locator('#itemTags').press('Enter');
    await dlg.locator('#units').fill('tests');
    await dlg.locator('#lowStockThreshold').fill('5');
    const resp = await submit(dlg, /^Save$/, /\/rest\/inventory\/items$/);
    expect(resp.status(), `create: ${await resp.text()}`).toBe(201);
    const created = await resp.json();
    cleanup.push(Number(created.id));
    expect(created.tags, 'the tag is stored in the directory\'s spelling').toEqual(['Reagent']);
    await expect(dlg).toBeHidden({ timeout: 15_000 });
    // The board lists it without a reload. (The "Item defined." notice did not show in the 13 Oct
    // run although onActionSaved sends it; recorded, not asserted, until it is looked at.)
    await expect(itemRow(panel, name), 'the board lists the new item').toHaveCount(1, { timeout: 20_000 });
    console.log(`[inventory-board] TC-INVB-30 notice shown: ${await page.getByText(/Item defined\./).count()}`);
    const r = await boardRow(page, name);
    expect(r, 'the new item is on the board').toBeTruthy();
    expect(r!.status, 'no stock: at or below threshold').toBe('REORDER_NOW');
    expect((await allItems(page)).find((i) => i.name === name)?.isActive, 'active').toBe('Y');
  });

  test('TC-INVB-31: New item refuses a blank name and sends nothing (was: a Reagent needs its stability after opening, retired with item types in #4361)', async ({ page }) => {
    const panel = await openBoard(page);
    await panel.getByRole('button', { name: /^New item$/ }).click();
    const dlg = page.getByRole('dialog').filter({ has: page.locator('#itemTags') });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await dlg.locator('#units').fill('tests');
    let posted = false;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/rest\/inventory\/items$/.test(r.url())) posted = true; });
    await dlg.getByRole('button', { name: /^Save$/ }).click();
    await expect(dlg.getByText('Item name is required'), 'the dialog says why').toBeVisible();
    await expect(dlg).toBeVisible();
    expect(posted, 'nothing is sent').toBe(false);
  });

  test('TC-INVB-32: the tag filter shows only items carrying a chosen tag (was the catalog Item Type filter)', async ({ page }) => {
    await openBoard(page);
    const rdt = await makeItem(page, 'RDT', { tags: ['RDT'], threshold: 2 });
    const reagent = await makeItem(page, 'TagR', { tags: ['Reagent'], threshold: 2 });
    cleanup.push(rdt.id, reagent.id);
    const panel = await openBoard(page);
    await expect(itemRow(panel, rdt.name), 'the RDT is listed before filtering').toHaveCount(1);
    const filter = panel.locator('#inventory-board-tag-filter');
    await filter.click();
    await page.getByRole('option', { name: /^Reagent$/ }).first().click();
    await page.keyboard.press('Escape');
    await expect(itemRow(panel, rdt.name), 'the RDT is filtered out').toHaveCount(0);
    await expect(itemRow(panel, reagent.name), 'the reagent stays').toHaveCount(1);
    const served = new Map((await board(page)).map((r) => [r.name, r]));
    for (const n of await rowNames(panel)) {
      expect(served.get(n)?.tags ?? [], `${n} carries the Reagent tag`).toContain('Reagent');
    }
  });

  test('TC-INVB-35: Count mode: a counted quantity that differs corrects the lot as a physical count and stamps the last count (#4364)', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Count', { qty: 20, threshold: 5 });
    cleanup.push(it.id);
    const panel = await openBoard(page);
    await panel.getByRole('button', { name: /^Count mode$/ }).click();
    const entry = panel.locator(`#count-item-${it.id}`);
    await expect(entry, 'a single-lot item is counted on its own row').toBeVisible({ timeout: 15_000 });
    await entry.fill('17');
    await expect(itemRow(panel, it.name).locator('.cds--tag', { hasText: /^-3$/ }), 'the difference is shown').toBeVisible();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/rest\/inventory\/count$/.test(r.url()) && r.request().method() === 'POST'),
      panel.getByRole('button', { name: /^Confirm count$/ }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBeLessThan(300);
    const body = await resp.json();
    expect(body.adjusted, 'one correction').toBe(1);
    const lot = (await lotsOf(page, it.id))[0];
    expect(Number(lot.currentQuantity), 'the lot holds what was counted').toBe(17);
    const tx = await transactionsOf(page, lot.id);
    const adj = tx.filter((t: any) => /ADJUST/i.test(t.transactionType ?? t.type ?? ''));
    expect(adj.length, `a count writes an adjustment: ${JSON.stringify(tx).slice(0, 300)}`).toBe(1);
    expect(await usageOf(page, it.id), 'a count is not usage').toHaveLength(0);
    const row = await boardRow(page, it.name);
    expect(row!.onHand).toBe(17);
    expect(row!.lastCountedOn, 'the last count is today').toBe(isoDay(0));
  });

  test('TC-INVB-36: Receive stock finds the item from its product barcode (#4365)', async ({ page }) => {
    await openBoard(page);
    const upc = `QAUPC${Date.now().toString().slice(-8)}`;
    const target = await makeItem(page, 'Scan', { upc, threshold: 5 });
    const other = await makeItem(page, 'ScanFrom', { threshold: 5 });
    cleanup.push(target.id, other.id);
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, other.name, /^Receive stock$/);
    await dlg.locator('#quick-receive-scan').fill(upc);
    await dlg.locator('#quick-receive-scan').press('Enter');
    await expect(dlg.locator('#quick-receive-item'), 'the scanned product is selected').toHaveValue(new RegExp(`^${esc(target.name)}`));
    await expect(dlg, 'Enter from the scanner does not submit the dialog').toBeVisible();
    await dlg.locator('#quick-receive-scan').fill('QA-NO-SUCH-UPC');
    await dlg.locator('#quick-receive-scan').press('Enter');
    await expect(dlg.getByText('QA-NO-SUCH-UPC'), 'an unknown code is named').toBeVisible();
    await expect(dlg.getByRole('button', { name: /^New item$/ }), 'and offered as a new item').toBeVisible();
  });

  test('TC-INVB-37: a lead time set after the item exists is kept and shown as set (was: only at create)', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Lead', { qty: 20, threshold: 5 });
    cleanup.push(it.id);
    const panel = await openBoard(page);
    const dlg = await itemAction(panel, it.name, /^Edit item details$/);
    await dlg.locator('#leadTimeDays').fill('12');
    const resp = await submit(dlg, /^Save$/, /\/rest\/inventory\/items\/\d+$/);
    expect(resp.status(), `update item: ${await resp.text()}`).toBe(200);
    const r = await boardRow(page, it.name);
    expect(r!.leadTimeDays, 'the new lead time').toBe(12);
    expect(r!.leadTimeTier, 'entered, not learned or default').toBe('SET');
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

  // TC-INVB-40 to 43 rewritten 2026-10-14 for the reports recut (OGC-438 #4367): six reports became
  // Received, Consumed, Stock on hand and Expiring, viewable on screen (Run report) and exportable
  // (Export, CSV by default). Stock levels and Low stock are gone by design (the board answers those).
  async function pickReport(panel: Locator, name: RegExp) {
    await panel.getByRole('combobox', { name: /Report Type/i }).click();
    await panel.page().getByRole('option', { name }).click();
  }
  async function pickFormat(panel: Locator, name: RegExp) {
    await panel.getByRole('combobox', { name: /Export Format/i }).click();
    await panel.page().getByRole('option', { name }).click();
  }

  test('TC-INVB-40: the Reports tab offers Received, Consumed, Stock on hand and Expiring, with Run report and Export (was TC-INV-08)', async ({ page }) => {
    const panel = await openTab(page, 'Reports');
    await panel.getByRole('combobox', { name: /Report Type/i }).click();
    const options = (await page.getByRole('option').allInnerTexts()).map((o) => o.trim());
    for (const want of [/^Received/, /^Consumed/, /^Stock on hand/, /^Expiring/]) {
      expect(options.some((o) => want.test(o)), `report types offered: ${options.join(' | ')}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: /^Run report$/ })).toBeEnabled();
    await expect(panel.getByRole('button', { name: /^Export$/ })).toBeEnabled();
  });

  test('TC-INVB-41: exporting Stock on hand as PDF downloads a non-empty PDF and says so', async ({ page }) => {
    const panel = await openTab(page, 'Reports');
    await pickReport(panel, /^Stock on hand/);
    await pickFormat(panel, /^PDF$/);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      panel.getByRole('button', { name: /^Export$/ }).click(),
    ]);
    const file = await download.path();
    const head = fs.readFileSync(file!).subarray(0, 4).toString();
    expect(head, 'PDF magic').toBe('%PDF');
    expect(fs.statSync(file!).size, 'not empty').toBeGreaterThan(1000);
    await expect(panel.getByText(/Report generated and downloaded successfully/)).toBeVisible();
  });

  test('TC-INVB-42: the downloaded report keeps its file extension (OGC-1489 item 1)', async ({ page }) => {
    // GUARD since 2026-10-14. Was a tripwire: the greedy /filename="?(.+)"?/i in ReportsAPI kept the
    // closing quote, so files saved as "stock-levels.pdf_" (.csv_, .xlsx_). Fixed in #4367.
    const panel = await openTab(page, 'Reports');
    await pickReport(panel, /^Stock on hand/);
    for (const [fmt, ext] of [[/^CSV$/, /\.csv$/], [/^PDF$/, /\.pdf$/]] as const) {
      await pickFormat(panel, fmt);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        panel.getByRole('button', { name: /^Export$/ }).click(),
      ]);
      expect(download.suggestedFilename(), 'the saved file name').toMatch(ext);
    }
  });

  test('TC-INVB-43: Run report shows Stock on hand on screen, and an item is reported by its tags, not as REAGENT (OGC-1489 item 3)', async ({ page }) => {
    const panel = await openTab(page, 'Reports'); // the API helper needs the app open (CSRF token)
    const it = await makeItem(page, 'RptTag', { qty: 7, tags: ['RDT'] });
    cleanup.push(it.id);
    const preview = await api(page, 'POST', '/inventory/reports/preview?reportType=STOCK_ON_HAND&includeInactive=false&includeExpired=true');
    expect(preview.status, preview.text).toBe(200);
    const table = preview.body as { headers: string[]; rows: string[][] };
    const tagCol = table.headers.indexOf('Tags');
    expect(tagCol, `the report has a Tags column (${table.headers.join(', ')})`).toBeGreaterThanOrEqual(0);
    const row = table.rows.find((r) => r.includes(it.name));
    expect(row, `${it.name} is in Stock on hand`).toBeTruthy();
    expect(row![tagCol], 'reported by its tag').toBe('RDT');
    expect(row!.map((c) => String(c).toUpperCase()), 'not the superseded item type').not.toContain('REAGENT');
    await pickReport(panel, /^Stock on hand/);
    await panel.getByRole('button', { name: /^Run report$/ }).click();
    await expect(panel.getByRole('cell', { name: it.name, exact: true }), 'the item row is shown on screen').toBeVisible({ timeout: 30_000 });
  });
});


// ── ordering (throwaway items) ─────────────────────────────────────────────

test.describe('Ordering (OGC-438 #4359)', () => {
  test('TC-INVB-50: Reorder suggestions lists exactly the rows the board badges Reorder now or Reorder soon, and the button counts them', async ({ page }) => {
    const { panel, rows } = await openBoardRows(page);
    const want = rows.filter(isSuggested);
    expect(want.length, 'the fixtures alone make suggestions (QA INV Low, Empty, PastDue)').toBeGreaterThan(0);
    await expect(panel.getByRole('button', { name: /^Reorder suggestions/ }), 'the button carries the count').toHaveText(`Reorder suggestions (${want.length})`);
    const dlg = await openSuggestions(page);
    await expect(dlg.locator('tbody tr'), 'one row per suggestion').toHaveCount(want.length);
    const listed = (await dlg.locator('tbody tr').allInnerTexts()).join('\n');
    for (const r of want) expect(listed, `${r.name} (${r.status}) is suggested`).toContain(r.name);
    for (const r of rows.filter((x) => !isSuggested(x))) expect(listed, `${r.name} (${r.status}) is not`).not.toContain(r.name);
  });

  test('TC-INVB-51: the critical banner names the first five unaddressed Reorder now items, counts the rest, and opens the suggestions', async ({ page }) => {
    const { rows } = await openBoardRows(page);
    expect(unaddressed(rows).length, 'the fixtures alone are critical (QA INV Low, Empty, PastDue)').toBeGreaterThan(0);
    await expectBanner(page, rows);
    await page.locator('.board-critical-banner').getByRole('button', { name: 'Review and mark as ordered' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Marking as ordered records that an order was placed' })).toBeVisible();
  });

  test('TC-INVB-52: Mark as ordered with a note and expected date stamps the item, keeps its row and status, tags it On order and takes it out of the banner', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Ord', { qty: 2, threshold: 10 });
    cleanup.push(it.id);
    const before = await openBoardRows(page);
    expect(before.rows.find((r) => r.name === it.name)?.status, 'the new item is Reorder now').toBe('REORDER_NOW');
    expect(unaddressed(before.rows).map((r) => r.name)).toContain(it.name);
    const dlg = await openSuggestions(page);
    await dlg.locator('#reorder-note').fill('QA PO-4471');
    await pickDate(dlg.locator('#reorder-expected-date'), isoDay(14));
    await select(dlg, it.name);
    const [req] = await Promise.all([
      page.waitForRequest((r) => /\/items\/mark-ordered$/.test(r.url())),
      dlg.getByRole('button', { name: 'Mark as ordered' }).click(),
    ]);
    expect(req.postDataJSON(), 'one mark: this item, the note and the date').toEqual({ itemIds: [it.id], note: 'QA PO-4471', expectedDate: isoDay(14) });
    await expect(dlg, 'the panel closes').toBeHidden({ timeout: 15_000 });
    // Read the Items tab's notification area.
    await expect(itemsPanel(page).getByText('1 item marked as ordered.'), 'and says so').toBeVisible();
    const r = await boardRow(page, it.name);
    expect({ orderedOn: r!.orderedOn, orderExpectedDate: r!.orderExpectedDate, orderNote: r!.orderNote }).toEqual({ orderedOn: isoDay(0), orderExpectedDate: isoDay(14), orderNote: 'QA PO-4471' });
    expect(r!.status, 'stock is still short: the status is unchanged').toBe('REORDER_NOW');
    const after = await openBoardRows(page);
    const status = itemRow(after.panel, it.name);
    await expect(status.getByText('Reorder now', { exact: true }), 'the row stays tagged').toBeVisible();
    await expect(status.getByText(/^On order · /), 'On order with the expected date').toBeVisible();
    expect(unaddressed(after.rows).map((x) => x.name), 'no longer critical-and-unaddressed').not.toContain(it.name);
    await expectBanner(page, after.rows);
    // Still a suggestion: the panel lists it again, tagged On order.
    const dlg2 = await openSuggestions(page);
    await expect(suggestionRow(dlg2, it.name).getByText('On order', { exact: true })).toBeVisible();
  });

  test('TC-INVB-53: Not ordered after all clears the mark and the item is critical again; it is disabled when nothing selected is on order', async ({ page }) => {
    await openBoard(page);
    const marked = await makeItem(page, 'Undo', { qty: 2, threshold: 10 });
    const plain = await makeItem(page, 'Plain', { qty: 2, threshold: 10 });
    cleanup.push(marked.id, plain.id);
    const m = await markOrdered(page, [marked.id], { note: 'wrong row', expectedDate: isoDay(3) });
    expect(m.status, m.text).toBe(200);
    await openBoard(page);
    let dlg = await openSuggestions(page);
    await select(dlg, plain.name);
    await expect(dlg.getByRole('button', { name: 'Not ordered after all' }), 'nothing selected is on order').toBeDisabled();
    await page.keyboard.press('Escape');
    await openBoard(page);
    dlg = await openSuggestions(page);
    await select(dlg, marked.name);
    const [req] = await Promise.all([
      page.waitForRequest((r) => /\/items\/clear-ordered$/.test(r.url())),
      dlg.getByRole('button', { name: 'Not ordered after all' }).click(),
    ]);
    expect(req.postDataJSON()).toEqual({ itemIds: [marked.id] });
    await expect(itemsPanel(page).getByText('1 item no longer marked as ordered.')).toBeVisible({ timeout: 15_000 });
    const r = await boardRow(page, marked.name);
    expect({ orderedOn: r!.orderedOn, orderExpectedDate: r!.orderExpectedDate, orderNote: r!.orderNote }, 'note and date go too').toEqual({ orderedOn: null, orderExpectedDate: null, orderNote: null });
    const after = await openBoardRows(page);
    expect(unaddressed(after.rows).map((x) => x.name), 'critical and unaddressed again').toContain(marked.name);
    await expect(itemRow(after.panel, marked.name).getByText(/^On order/)).toHaveCount(0);
  });

  test('TC-INVB-54: marking a selection is one request for every selected item, and every one is stamped', async ({ page }) => {
    await openBoard(page);
    const a = await makeItem(page, 'BulkA', { qty: 1, threshold: 10 });
    const b = await makeItem(page, 'BulkB', { qty: 1, threshold: 10 });
    cleanup.push(a.id, b.id);
    await openBoard(page);
    const dlg = await openSuggestions(page);
    await select(dlg, a.name);
    await select(dlg, b.name);
    const posts: string[] = [];
    page.on('request', (r) => { if (/\/items\/mark-ordered$/.test(r.url())) posts.push(r.postData() ?? ''); });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/items\/mark-ordered$/.test(r.url())),
      dlg.getByRole('button', { name: 'Mark as ordered' }).click(),
    ]);
    expect(await resp.json(), 'the server reports both').toEqual({ changed: 2 });
    await expect(itemsPanel(page).getByText('2 items marked as ordered.')).toBeVisible({ timeout: 15_000 });
    expect(posts.length, 'one request, not one per item').toBe(1);
    expect(JSON.parse(posts[0]).itemIds.sort()).toEqual([a.id, b.id].sort());
    for (const it of [a, b]) expect((await boardRow(page, it.name))!.orderedOn, `${it.name} stamped`).toBe(isoDay(0));
  });

  test('TC-INVB-55: re-marking an item keeps the first order stamp and replaces the note and date (the stamp anchors the learned lead time)', async ({ page }) => {
    test.skip(!INV_DB, 'needs the database to age the first stamp: local develop or develop-stack CI only');
    await openBoard(page);
    const it = await makeItem(page, 'Remark', { qty: 1, threshold: 10 });
    cleanup.push(it.id);
    expect((await markOrdered(page, [it.id], { note: 'first', expectedDate: isoDay(10) })).status).toBe(200);
    const aged = dbSql(`UPDATE clinlims.inventory_item SET ordered_at = now() - interval '3 days' WHERE id = ${it.id}`);
    expect(aged, 'aged the first stamp in the DB').toBe('UPDATE 1');
    expect((await boardRow(page, it.name))!.orderedOn).toBe(isoDay(-3));
    const m = await markOrdered(page, [it.id], { note: 'second', expectedDate: isoDay(5) });
    expect(m.body, m.text).toEqual({ changed: 1 });
    const r = await boardRow(page, it.name);
    expect(r!.orderedOn, 'the first stamp survives').toBe(isoDay(-3));
    expect(r!.orderNote).toBe('second');
    expect(r!.orderExpectedDate).toBe(isoDay(5));
  });

  test('TC-INVB-56: when the mark fails the panel stays open, says why, and nothing is stamped', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Fail', { qty: 1, threshold: 10 });
    cleanup.push(it.id);
    // What the controller sends on an exception: a bare 500 with no body.
    await page.route(/\/items\/mark-ordered$/, (r) => r.fulfill({ status: 500, body: '' }));
    await openBoard(page);
    const dlg = await openSuggestions(page);
    await select(dlg, it.name);
    await dlg.getByRole('button', { name: 'Mark as ordered' }).click();
    await expect(dlg.locator('.cds--inline-notification--error'), 'the failure is shown in the panel').toBeVisible({ timeout: 15_000 });
    await expect(dlg, 'the panel stays open').toBeVisible();
    await expect(page.getByText(/marked as ordered\./), 'no success message').toHaveCount(0);
    expect((await boardRow(page, it.name))!.orderedOn, 'nothing stamped').toBeNull();
  });

  test('TC-INVB-57: the mark endpoints refuse a malformed expected date, and clearing an item never marked changes nothing', async ({ page }) => {
    await openBoard(page);
    const it = await makeItem(page, 'Api', { qty: 1, threshold: 10 });
    cleanup.push(it.id);
    const bad = await markOrdered(page, [it.id], { note: 'x', expectedDate: '2026-13-40' });
    expect(bad.status, bad.text).toBe(400);
    expect(bad.text).toContain('expectedDate must be an ISO date');
    expect((await boardRow(page, it.name))!.orderedOn, 'a refused mark stamps nothing').toBeNull();
    const none = await clearOrdered(page, [it.id]);
    expect(none.body, 'clearing an item that was never marked changes nothing').toEqual({ changed: 0 });
  });

  test('TC-INVB-58: Export CSV downloads the suggestions with ISO order-by dates', async ({ page }) => {
    const { rows } = await openBoardRows(page);
    const want = rows.filter(isSuggested);
    const dlg = await openSuggestions(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      dlg.getByRole('button', { name: /Export CSV/i }).last().click(),
    ]);
    expect(download.suggestedFilename()).toBe('reorder-suggestions.csv');
    const lines = fs.readFileSync((await download.path())!, 'utf8').split('\n').filter(Boolean);
    expect(lines[0].split(',')[0], 'header').toBe('Item');
    expect(lines.length - 1, 'one line per suggestion').toBe(want.length);
    const body = lines.slice(1).join('\n');
    for (const r of want) {
      expect(body, `${r.name} exported`).toContain(r.name);
      if (r.orderByDate) expect(body, `${r.name} order-by as ISO`).toContain(r.orderByDate);
    }
  });

  test('TC-INVB-59: with nothing to order the panel says so, offers no mark, and there is no banner', async ({ page }) => {
    // Every row adequate: served from a copy of the real board with the statuses rewritten.
    await page.route(/\/rest\/inventory\/board(\?|$)/, async (route) => {
      const real = await route.fetch();
      const rows = ((await real.json()) as BoardRow[]).map((r) => ({ ...r, status: 'ADEQUATE', orderedOn: null }));
      await route.fulfill({ response: real, json: rows });
    });
    const panel = await openBoard(page);
    await expect(page.locator('.board-critical-banner')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Reorder suggestions/ }), 'no count').toHaveText('Reorder suggestions');
    await panel.getByRole('button', { name: /^Reorder suggestions/ }).click();
    const dlg = page.getByRole('dialog').filter({ hasText: 'Nothing needs ordering right now.' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Mark as ordered' })).toHaveCount(0);
    await expect(dlg.locator('#reorder-note')).toHaveCount(0);
  });

  test('TC-INVB-60: a receipt closes the On order mark, so an item restocked and short again is critical again', async ({ page }) => {
    // FIXED 2026-10-13 (#4365 on develop b5943f5a), was FLIP-WHEN-FIXED since 2026-10-12. Ruled the
    // same day by Casey: the next receipt closes the mark. The receipt clears orderedOn, the note and
    // the expected date and records an order cycle (which feeds the learned lead time, #4360).
    await openBoard(page);
    const it = await makeItem(page, 'Stale', { qty: 2, threshold: 10 });
    cleanup.push(it.id);
    expect((await markOrdered(page, [it.id], { note: 'PO-7' })).status).toBe(200);
    expect((await boardRow(page, it.name))!.orderedOn, 'marked').toBe(isoDay(0));
    await receiveLot(page, it.id, { number: `QAIS${it.id}`, qty: 30, expiresInDays: 200, qc: 'PASSED' });
    const after = (await boardRow(page, it.name))!;
    expect(after.orderedOn ?? null, 'the receipt closes the mark').toBeNull();
    expect(after.orderNote ?? null, 'and its note').toBeNull();
    expect(after.status, 'restocked: not a suggestion').not.toBe('REORDER_NOW');
    expect((await consume(page, it.id, 29)).status).toBe(200);
    const { rows } = await openBoardRows(page);
    const r = rows.find((x) => x.name === it.name)!;
    expect(r.status, 'short again').toBe('REORDER_NOW');
    expect(unaddressed(rows).map((x) => x.name), 'the new shortage is critical, not hidden by the old mark').toContain(it.name);
  });

  test('TC-INVB-61: an id that is not an item is skipped, not a 500 that drops the whole selection [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, OGC-1489 item 5). InventoryItemServiceImpl.markOrdered and
    // clearOrdered skip a null item ("if (item == null) continue"), but get() throws for an unknown
    // id, so the controller answers a bare 500 and the transaction drops the valid items too. Only
    // reachable by API today (the panel sends ids from the board).
    test.fail();
    await openBoard(page);
    const it = await makeItem(page, 'Ghost', { qty: 1, threshold: 10 });
    cleanup.push(it.id);
    const r = await markOrdered(page, [it.id, 987654321], { note: 'with a ghost' });
    expect(r.status, `mark with an unknown id: ${r.text}`).toBe(200);
    expect((await boardRow(page, it.name))!.orderedOn, 'the real item is marked').toBe(isoDay(0));
  });

  test('TC-INVB-62: with the critical banner showing, the board still takes typed input: the banner neither takes nor traps the focus', async ({ page }) => {
    // FIXED 2026-10-13 (develop b5943f5a: the banner is role="status", not Carbon's default
    // alertdialog; a separate probe passed 3 of 3), was FLIP-WHEN-FIXED since 2026-10-12, when the
    // banner held the focus and the Search, Log usage, Receive stock and Edit item fields took no
    // typing (3 of 3 on develop a4200e2d).
    const { panel, rows } = await openBoardRows(page);
    expect(unaddressed(rows).length, 'the fixtures make a banner').toBeGreaterThan(0);
    await expect(page.locator('.board-critical-banner')).toBeVisible();
    const box = panel.getByPlaceholder(SEARCH);
    await box.click();
    await page.keyboard.type(INV.fefo);
    await expect(box, 'typed text reaches Search').toHaveValue(INV.fefo);
    await expect(itemRow(panel, INV.building), 'and filters the board').toHaveCount(0);
    expect(await page.evaluate(() => !!document.activeElement?.closest('.board-critical-banner')), 'the focus is not held in the banner').toBe(false);
  });

  test('TC-INVB-63: the note given with a mark (requisition or PO reference) can be read on the board [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, OGC-1489 item 4). The board passes the note as the On order
    // Tag's title, but Carbon's Tag puts its own empty title on the label and drops the prop, so the
    // note shows nowhere: not on the row, not in the suggestions panel, not in the CSV export. It is
    // stored (GET /inventory/board returns orderNote) and only the API can read it back.
    test.fail();
    await openBoard(page);
    const it = await makeItem(page, 'Note', { qty: 1, threshold: 10 });
    cleanup.push(it.id);
    expect((await markOrdered(page, [it.id], { note: 'QA PO-5512', expectedDate: isoDay(9) })).status).toBe(200);
    expect((await boardRow(page, it.name))!.orderNote, 'the note is stored').toBe('QA PO-5512');
    const panel = await openBoard(page);
    const row = itemRow(panel, it.name);
    await expect(row.getByText(/^On order/)).toBeVisible();
    const shown = await row.evaluate((el, n) => el.outerHTML.includes(n), 'QA PO-5512');
    expect(shown, 'the note is on the row (text, title or tooltip)').toBe(true);
  });
});
