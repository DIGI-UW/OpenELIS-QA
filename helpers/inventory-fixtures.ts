/**
 * helpers/inventory-fixtures.ts
 *
 * Data for the Inventory items board (OGC-438, OpenELIS-Global-2 #4356 to #4358) and the API
 * calls the board specs make. Written 2026-10-11 against local develop (images 2026-10-11 12:13 UTC).
 *
 * TWO KINDS OF FIXTURE
 *
 * 1. Read-only items, find-or-create by a fixed "QA INV ..." name, so a second run changes nothing:
 *      QA INV Building  stock above its threshold, never used        -> Building data
 *      QA INV Low       stock at or below its threshold               -> Reorder now, no date
 *      QA INV Empty     no lot at all                                 -> Reorder now, Out of stock
 *      QA INV FEFO      five lots: expired, earliest usable, latest usable, failed QC, pending QC
 *                       -> use-first is the earliest-expiring PASSED, unexpired lot; on hand counts
 *                          passed and pending stock only
 *      QA INV Steady / QA INV Soon / QA INV PastDue
 *                       thirty usage records each, made through the API. The projection needs
 *                       usage spread over the last 30 days, and the API always stamps usage "now",
 *                       so redateHistory() (or scripts/seed-inventory-history.sh, the same SQL)
 *                       re-dates them one per day. Only where the DB is reachable (local develop,
 *                       the develop-stack CI stack, both at localhost:10443): on
 *                       testing.openelis-global.org the projection cases skip and say why.
 *
 *    Nothing in a spec may change these. A case that acts on a row makes its own item.
 *    Also ensures the "QA CI Room" storage room (helpers/ci-fixtures.ts), which Receive stock needs.
 *
 * 2. Throwaway items, `QA INV <tag> <stamp>`, made by makeItem() for one case and left behind
 *    (inventory has no delete; DELETE answers 405). They are deactivated when the case ends so the
 *    board, which lists active items only, does not fill up.
 *
 * WHY THE NUMBERS. The board's rule (InventoryProjectionCalculator, #4356):
 *    median daily use m over a 30-day window, spread s = MAD x 1.4826
 *    runOutEarly = today + floor(onHand / (m + s)), runOutLate = today + ceil(onHand / (m - s))
 *    orderBy     = runOutEarly - leadTime
 *    Reorder now  at or below threshold, or orderBy already passed
 *    Reorder soon (onHand - threshold) / (m + s) <= leadTime
 *    Building data when m == 0 (more than half the window had no use) and stock is above threshold
 * With one usage record per day of the same size, s = 0 and the dates are exact:
 *    Steady  receive 400, use 5/day  -> on hand 250, threshold 20, lead 7  -> Adequate,  runs out today+50
 *    Soon    receive 160, use 2/day  -> on hand 100, threshold 10, lead 48 -> Reorder soon, order by today+2
 *    PastDue receive 160, use 4/day  -> on hand 40,  threshold 5,  lead 30 -> Reorder now, order by today-20
 * Lead time can only be set when an item is created: PUT /items/{id} drops leadTimeDays and the
 * item form has no field for it, although the board tells the user to "set to improve".
 */
import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { api, ready, ensureRoom, type ApiResult } from './ci-fixtures';

export { api, ready };

export const INV = {
  building: 'QA INV Building',
  low: 'QA INV Low',
  empty: 'QA INV Empty',
  fefo: 'QA INV FEFO',
  steady: 'QA INV Steady',
  soon: 'QA INV Soon',
  pastDue: 'QA INV PastDue',
} as const;

/** The history items and what each must look like once its usage is re-dated. */
export const HISTORY = [
  { name: INV.steady, receive: 400, perDay: 5, threshold: 20, lead: 7, status: 'ADEQUATE' },
  { name: INV.soon, receive: 160, perDay: 2, threshold: 10, lead: 48, status: 'REORDER_SOON' },
  { name: INV.pastDue, receive: 160, perDay: 4, threshold: 5, lead: 30, status: 'REORDER_NOW' },
] as const;

export const HISTORY_DAYS = 30;

export interface BoardRow {
  itemId: number; code: string; name: string; itemType: string; units: string;
  onHand: number; lowStockThreshold: number | null; medianDailyUse: number;
  basisDate: string | null; stale: boolean; runOutEarly: string | null; runOutLate: string | null;
  leadTimeDays: number; leadTimeTier: 'SET' | 'OBSERVED' | 'DEFAULT'; orderByDate: string | null;
  trendPercent: number | null; status: 'REORDER_NOW' | 'REORDER_SOON' | 'ADEQUATE' | 'BUILDING_DATA';
}

export interface Lot {
  id: number; lotNumber: string; currentQuantity: number; initialQuantity: number; qcStatus: string;
  status: string; expirationDate: string | number | null; barcode: string | null; expired: boolean;
  availableForUse: boolean; countsAsAvailableStock: boolean; inventoryItem: { id: number; name: string };
}

const list = (b: any): any[] => (Array.isArray(b) ? b : b?.data ?? b?.rows ?? b?.items ?? []);
const ok = (r: ApiResult) => r.status >= 200 && r.status < 300;

/** Midnight UTC `days` from today, the way the lot form stores a calendar date. */
export function calendarDate(days: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)).toISOString();
}

/** yyyy-mm-dd, `days` from today in UTC (the server's LocalDate.now() on CI and local). */
export function isoDay(days = 0): string {
  return calendarDate(days).slice(0, 10);
}

export async function board(page: Page): Promise<BoardRow[]> {
  const r = await api(page, 'GET', '/inventory/board');
  expect(r.status, `GET /inventory/board: ${r.text}`).toBe(200);
  return list(r.body) as BoardRow[];
}

export async function boardRow(page: Page, name: string): Promise<BoardRow | undefined> {
  return (await board(page)).find((r) => r.name === name);
}

export async function allItems(page: Page): Promise<any[]> {
  return list((await api(page, 'GET', '/inventory/items/all')).body);
}

export async function lotsOf(page: Page, itemId: number): Promise<Lot[]> {
  const r = await api(page, 'GET', `/inventory/lots/item/${itemId}`);
  expect(r.status, `GET lots of item ${itemId}: ${r.text}`).toBe(200);
  return list(r.body) as Lot[];
}

export async function usageOf(page: Page, itemId: number): Promise<any[]> {
  return list((await api(page, 'GET', `/inventory/usage/item/${itemId}`)).body);
}

export async function transactionsOf(page: Page, lotId: number): Promise<any[]> {
  return list((await api(page, 'GET', `/inventory/transactions/lot/${lotId}`)).body);
}

/** POST /inventory/items. leadTimeDays only sticks here (see the header). */
export async function createItem(page: Page, name: string, opts: { threshold?: number; lead?: number; units?: string; itemType?: string } = {}): Promise<number> {
  const r = await api(page, 'POST', '/inventory/items', {
    name, itemType: opts.itemType ?? 'REAGENT', units: opts.units ?? 'tests', category: 'QA',
    lowStockThreshold: opts.threshold ?? 5, leadTimeDays: opts.lead, stabilityAfterOpening: 30,
    storageRequirements: 'QA fixture', calibrationRequired: 'N', individualTracking: 'N', isActive: 'Y',
  });
  expect(r.status, `create item ${name}: ${r.text}`).toBeLessThan(300);
  return Number(r.body?.id);
}

/** POST /inventory/management/receive, then set QC (the board counts PASSED and PENDING stock). */
export async function receiveLot(page: Page, itemId: number, lot: { number: string; qty: number; expiresInDays: number; qc?: 'PASSED' | 'PENDING' | 'FAILED' }): Promise<number> {
  const r = await api(page, 'POST', '/inventory/management/receive', {
    inventoryItem: { id: itemId }, lotNumber: lot.number, currentQuantity: lot.qty, initialQuantity: lot.qty,
    expirationDate: calendarDate(lot.expiresInDays), receiptDate: calendarDate(0), qcStatus: 'PENDING', status: 'ACTIVE', barcode: null,
  });
  expect(r.status, `receive ${lot.number}: ${r.text}`).toBeLessThan(300);
  const id = Number(r.body?.id);
  if (lot.qc && lot.qc !== 'PENDING') {
    const q = await api(page, 'PUT', `/inventory/lots/${id}/qc-status`, { qcStatus: lot.qc, notes: 'QA fixture' });
    expect(q.status, `QC ${lot.qc} on ${lot.number}: ${q.text}`).toBeLessThan(300);
  }
  return id;
}

/** POST /inventory/management/consume: the Log usage path (FEFO over PASSED, unexpired lots). */
export async function consume(page: Page, itemId: number, quantity: number): Promise<ApiResult> {
  return api(page, 'POST', '/inventory/management/consume', { itemId: String(itemId), quantity });
}

export async function deactivate(page: Page, itemId: number): Promise<void> {
  await api(page, 'PUT', `/inventory/items/${itemId}/deactivate`, {});
}

async function findItem(page: Page, name: string): Promise<any | undefined> {
  return (await allItems(page)).find((i) => i.name === name);
}

/** A throwaway item for one case, with an optional QC-passed lot. */
export async function makeItem(page: Page, tag: string, opts: { threshold?: number; qty?: number; expiresInDays?: number; lead?: number } = {}): Promise<{ id: number; name: string; lotId?: number; lotNumber?: string }> {
  const stamp = `${Date.now()}`.slice(-7);
  const name = `QA INV ${tag} ${stamp}`;
  const id = await createItem(page, name, { threshold: opts.threshold ?? 5, lead: opts.lead });
  if (!opts.qty) return { id, name };
  const lotNumber = `QAI${tag.replace(/\W/g, '').slice(0, 6).toUpperCase()}${stamp}`;
  const lotId = await receiveLot(page, id, { number: lotNumber, qty: opts.qty, expiresInDays: opts.expiresInDays ?? 180, qc: 'PASSED' });
  return { id, name, lotId, lotNumber };
}

/**
 * Find-or-create every read-only fixture. Safe to call from a spec's beforeAll and from
 * ci-fixtures.setup.ts: an item that exists is left exactly as it is.
 */
export async function ensureInventoryFixtures(page: Page, log: string[] = []): Promise<Record<string, number>> {
  await ready(page);
  const ids: Record<string, number> = {};
  // Receive stock needs somewhere to put the lot: the storage picker offers rooms (TC-INVB-26).
  await ensureRoom(page, log);
  const have = async (name: string) => (await findItem(page, name))?.id as number | undefined;

  ids.building = (await have(INV.building)) ?? await (async () => {
    const id = await createItem(page, INV.building, { threshold: 5 });
    await receiveLot(page, id, { number: 'QAINVBLD01', qty: 40, expiresInDays: 200, qc: 'PASSED' });
    log.push(`created ${INV.building}`);
    return id;
  })();

  ids.low = (await have(INV.low)) ?? await (async () => {
    const id = await createItem(page, INV.low, { threshold: 10 });
    await receiveLot(page, id, { number: 'QAINVLOW01', qty: 4, expiresInDays: 200, qc: 'PASSED' });
    log.push(`created ${INV.low}`);
    return id;
  })();

  ids.empty = (await have(INV.empty)) ?? await (async () => {
    const id = await createItem(page, INV.empty, { threshold: 5 });
    log.push(`created ${INV.empty}`);
    return id;
  })();

  ids.fefo = (await have(INV.fefo)) ?? await (async () => {
    const id = await createItem(page, INV.fefo, { threshold: 1 });
    await receiveLot(page, id, { number: 'QAINVFEFO-EXPIRED', qty: 10, expiresInDays: -3, qc: 'PASSED' });
    await receiveLot(page, id, { number: 'QAINVFEFO-FIRST', qty: 10, expiresInDays: 15, qc: 'PASSED' });
    await receiveLot(page, id, { number: 'QAINVFEFO-LATER', qty: 10, expiresInDays: 120, qc: 'PASSED' });
    await receiveLot(page, id, { number: 'QAINVFEFO-QCFAIL', qty: 10, expiresInDays: 5, qc: 'FAILED' });
    await receiveLot(page, id, { number: 'QAINVFEFO-PENDING', qty: 10, expiresInDays: 8 });
    log.push(`created ${INV.fefo}`);
    return id;
  })();

  for (const h of HISTORY) {
    const key = h.name === INV.steady ? 'steady' : h.name === INV.soon ? 'soon' : 'pastDue';
    const found = await have(h.name);
    if (found) { ids[key] = found; continue; }
    const id = await createItem(page, h.name, { threshold: h.threshold, lead: h.lead });
    await receiveLot(page, id, { number: `QAINVH${key.toUpperCase()}`, qty: h.receive, expiresInDays: 365, qc: 'PASSED' });
    for (let day = 0; day < HISTORY_DAYS; day++) {
      const c = await consume(page, id, h.perDay);
      expect(c.status, `${h.name} usage ${day + 1}: ${c.text}`).toBe(200);
    }
    log.push(`created ${h.name} with ${HISTORY_DAYS} usage records (re-date with scripts/seed-inventory-history.sh)`);
    ids[key] = id;
  }
  return ids;
}

/**
 * The database container, only on a local docker stack. INV_DB names it; it defaults to the
 * oedevqa container when BASE is localhost:10443 (local develop and the develop-stack CI stack)
 * and is off everywhere else. Same rule as tests/helpers/locations.ts.
 */
const BASE = process.env.BASE ?? process.env.BASE_URL ?? '';
export const INV_DB = process.env.INV_DB ?? (/localhost:10443/.test(BASE) ? 'openelisglobal-database-dev' : '');

/** The SQL in scripts/seed-inventory-history.sh: one usage record per day, today going back. */
export const REDATE_SQL = `WITH f AS (SELECT id FROM clinlims.inventory_item WHERE name IN ('QA INV Steady', 'QA INV Soon', 'QA INV PastDue')),
r AS (SELECT u.id, row_number() OVER (PARTITION BY u.inventory_item_id ORDER BY u.id) AS rn FROM clinlims.inventory_usage u JOIN f ON f.id = u.inventory_item_id)
UPDATE clinlims.inventory_usage u SET usage_date = date_trunc('day', now()) - ((r.rn - 1) * interval '1 day') + interval '1 hour'
FROM r WHERE u.id = r.id AND r.rn <= 30`;

/** Re-date the history fixtures' usage. Returns what psql said, or null when no DB is reachable. */
export function redateHistory(): string | null {
  if (!INV_DB) return null;
  try {
    return execFileSync('docker', ['exec', '-i', INV_DB, 'psql', '-U', 'clinlims', '-d', 'clinlims', '-At', '-c', REDATE_SQL],
      { encoding: 'utf8', env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` } }).trim();
  } catch (e) {
    return `DB-ERROR ${(e as Error).message.split('\n').slice(0, 2).join(' ')}`;
  }
}

/** True once redateHistory() / seed-inventory-history.sh has spread the usage over the window. */
export function historySeeded(row: BoardRow | undefined): boolean {
  return !!row && row.medianDailyUse > 0;
}

export const HISTORY_GAP =
  'usage history is not spread over the last 30 days: run scripts/seed-inventory-history.sh where the DB is reachable '
  + '(local develop, develop-stack CI). The API stamps usage "now", so this cannot be seeded on testing.';
