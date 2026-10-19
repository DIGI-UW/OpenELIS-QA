/**
 * tests/report-print-queue.spec.ts
 *
 * Reports > Report Print Queue (/ReportPrintQueue), V1 for patient reports:
 * OpenELIS-Global-2 #4753 (OGC-431, FRS OGC-1031 r4 slices 1 to 4), merged to develop
 * 2026-10-16, with the redesigned patient report of #4747 (OGC-932) printing through it.
 * Catalogue: report-print-queue-test-cases.md. AC numbers are FRS §12 (v2.5).
 *
 * Each case seeds its own orders for one QA patient ("Rpqqa, Queue", national id
 * QARPQ...) through helpers/report-queue.ts, so no case depends on another and the
 * suite can run on any stack with the develop catalogue (GPT/ALAT 1, Glucose 3,
 * Creatinine 4 on serum).
 *
 * Kind: Guard passes today and protects it. Tripwire asserts the intended behaviour
 * and carries test.fail() while develop differs; it goes red ("Expected to fail, but
 * passed") the day it is fixed, and the marker comes off.
 *
 * Written 2026-10-19 against testing.openelis-global.org (3.3.0-SNAPSHOT, queue
 * install date 2026-10-16 19:19 UTC).
 */
import { test, expect, Page } from '@playwright/test';
import { readPdf, isPdf } from '../helpers/report-pdf';
import {
  API, SERUM, TEST_IDS, QueueSeed, archivedSha, detail, enterOn, j, list, order, print, queueContext, row, validateOnly,
} from '../helpers/report-queue';

test.setTimeout(240_000);
const T = TEST_IDS;
let seed: QueueSeed;

test.beforeEach(async ({ page }) => {
  seed = await queueContext(page);
});

async function archivedText(page: Page, versionId: number): Promise<string> {
  const r = await page.request.get(`${API}/reportQueue/versions/${versionId}/pdf`);
  const buf = Buffer.from(await r.body());
  expect(r.status(), `archived PDF of version ${versionId}`).toBe(200);
  expect(isPdf(buf), 'the archive holds a PDF').toBe(true);
  return (await readPdf(buf)).text;
}

/** GPT/ALAT and Glucose ordered; GPT entered and validated, Glucose never resulted. */
async function partialOrder(page: Page) {
  const o = await order(page, seed, [{ type: SERUM, tests: [T.GPT, T.Glucose] }]);
  await enterOn(page, o.labNo, { [T.GPT]: '25' });
  await validateOnly(page, o.labNo);
  return o;
}

test.describe('Report Print Queue: the list', () => {
  test('TC-RPQ-01 the queue lists released reports on open, with one list request and no Search press (AC-1)', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => { if (/\/rest\/reportQueue\?/.test(r.url())) calls.push(r.url()); });
    const first = page.waitForResponse((r) => /\/rest\/reportQueue\?/.test(r.url()));
    await page.goto('/ReportPrintQueue');
    const res = await first;
    expect(res.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Report Print Queue' })).toBeVisible();
    await expect(page.getByText('To print', { exact: true })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    expect(calls.length, `list requests on open: ${calls.join(' | ')}`).toBe(1);
  });

  test('TC-RPQ-02 the first released result lists the order as Partial 1/2, Unprinted, nothing issued (AC-2)', async ({ page }) => {
    const o = await partialOrder(page);
    const r = await row(page, o.labNo);
    expect([r.state, r.printStatus, r.releasedCount, r.totalCount, r.version ?? null]).toEqual(['PARTIAL', 'UNPRINTED', 1, 2, null]);
    await page.goto(`/ReportPrintQueue?labNo=${o.labNo}`);
    const tr = page.locator('table tbody tr', { hasText: o.labNo });
    await expect(tr).toContainText('Partial 1/2');
    await expect(tr).toContainText('Unprinted');
  });

  test('TC-RPQ-03 a rejected sample\'s tests do not count in released/total (FR-2.2)', async ({ page }) => {
    const reasons = (await j(page, `${API}/displayList/REJECTION_REASONS`)).body as any[];
    const o = await order(page, seed, [{ type: SERUM, tests: [T.Glucose] }, { type: SERUM, tests: ['5'], rejected: String(reasons[0].id) }]);
    await enterOn(page, o.labNo, { [T.Glucose]: '0.8' });
    await validateOnly(page, o.labNo);
    const r = await row(page, o.labNo);
    expect([r.state, r.releasedCount, r.totalCount]).toEqual(['FINAL', 1, 1]);
  });

  test('TC-RPQ-04 State = Amended with Unprinted lists only amended unprinted reports; Partial only partial ones (AC-24)', async ({ page }) => {
    const amended = await list(page, 'states=AMENDED&printStatus=UNPRINTED&window=all&pageSize=100');
    for (const r of amended.rows) expect([r.labNumber, r.state, r.printStatus]).toEqual([r.labNumber, 'AMENDED', 'UNPRINTED']);
    expect(amended.total, 'the Amended to print tile counts the same rows').toBe(amended.amendedToPrint);
    const partial = await list(page, 'states=PARTIAL&window=all&pageSize=100');
    for (const r of partial.rows) {
      expect(r.state, r.labNumber).toBe('PARTIAL');
      expect(r.releasedCount, r.labNumber).toBeLessThan(r.totalCount);
    }
  });

  test('TC-RPQ-05 the time window hides printed rows released before it and keeps every unprinted row (AC-16, FR-3.8)', async ({ page }) => {
    const all = await list(page, 'window=all&pageSize=100');
    const day = await list(page, 'window=24h&pageSize=100');
    const since = Date.now() - 24 * 3600 * 1000 - 60_000;
    for (const r of day.rows.filter((x: any) => x.printStatus === 'PRINTED')) {
      expect(new Date(r.released).getTime(), `${r.labNumber} printed and inside 24 h`).toBeGreaterThan(since);
    }
    const unprintedAll = all.rows.filter((x: any) => x.printStatus === 'UNPRINTED').map((x: any) => x.labNumber).sort();
    const unprintedDay = day.rows.filter((x: any) => x.printStatus === 'UNPRINTED').map((x: any) => x.labNumber).sort();
    expect(unprintedDay).toEqual(unprintedAll);
  });

  test('TC-RPQ-06 items per page and time window persist per user on the server (FR-10.5)', async ({ page }) => {
    const before = (await j(page, `${API}/reportQueue/preferences`)).body;
    try {
      const put = await j(page, `${API}/reportQueue/preferences`, { method: 'PUT', body: { timeWindow: '30d', pageSize: 50 } });
      expect(put.status).toBe(200);
      const b = await list(page, '');
      expect([b.timeWindow, b.pageSize]).toEqual(['30d', 50]);
    } finally {
      await j(page, `${API}/reportQueue/preferences`, { method: 'PUT', body: before });
    }
  });
});

test.describe('Report Print Queue: printing and versions', () => {
  test('TC-RPQ-10 Print creates v1, opens the PDF, archives it with a 64-character SHA-256 (AC-3)', async ({ page }) => {
    const o = await partialOrder(page);
    await page.goto(`/ReportPrintQueue?labNo=${o.labNo}`);
    const tr = page.locator('table tbody tr', { hasText: o.labNo });
    const resp = page.waitForResponse((r) => /\/rest\/reportQueue\/print/.test(r.url()) && r.request().method() === 'POST');
    const popup = page.context().waitForEvent('page', { timeout: 20_000 }).catch(() => null);
    await tr.getByRole('button', { name: 'Print', exact: true }).click();
    const r = await resp;
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('application/pdf');
    expect(r.headers()['x-report-version']).toBe('1');
    expect(await popup, 'the PDF opens in a new tab').not.toBeNull();
    await expect(tr).toContainText('Printed');
    const d = await detail(page, o.sampleId);
    expect(d.versions.length).toBe(1);
    expect(d.versions[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    const a = await archivedSha(page, d.versions[0].id);
    expect(a.sha).toBe(d.versions[0].sha256);
  });

  test('TC-RPQ-11 printing a Printed row again returns the archived bytes and adds a reprint, not a version (AC-6)', async ({ page }) => {
    const o = await partialOrder(page);
    const first = await print(page, o.sampleId);
    const again = await print(page, o.sampleId);
    expect([again.status, again.version, again.reprint]).toEqual([200, '1', 'true']);
    expect(again.sha).toBe(first.sha);
    const d = await detail(page, o.sampleId);
    expect(d.versions.length).toBe(1);
    expect(d.versions[0].reprints.length).toBe(1);
  });

  test('TC-RPQ-12 releasing the rest makes it Final, Unprinted; printing makes v2 "Added: ..." with no corrected banner (AC-4)', async ({ page }) => {
    const o = await partialOrder(page);
    await print(page, o.sampleId);
    await enterOn(page, o.labNo, { [T.Glucose]: '0.9' });
    await validateOnly(page, o.labNo);
    const r = await row(page, o.labNo);
    expect([r.state, r.printStatus]).toEqual(['FINAL', 'UNPRINTED']);
    const p = await print(page, o.sampleId);
    expect([p.version, p.reprint]).toEqual(['2', 'false']);
    const d = await detail(page, o.sampleId);
    const v2 = d.versions.find((v: any) => v.version === 2);
    expect([v2.amended, v2.changeSummary]).toEqual([false, 'Added: Glucose']);
    const text = await archivedText(page, v2.id);
    expect(text).toContain('Results: final report');
    expect(text).not.toContain('Corrected report');
    expect((await row(page, o.labNo)).printStatus).toBe('PRINTED');
  });

  test('TC-RPQ-13 a changed printed result makes it Amended; the reprint is an amended version with the corrected banner, and later releases keep Amended (AC-5)', async ({ page }) => {
    const o = await order(page, seed, [{ type: SERUM, tests: [T.GPT, T.Glucose, T.Creatinine] }]);
    await enterOn(page, o.labNo, { [T.GPT]: '25', [T.Glucose]: '0.9' });
    await validateOnly(page, o.labNo);
    await print(page, o.sampleId);
    await enterOn(page, o.labNo, { [T.Glucose]: '0.95' });
    await validateOnly(page, o.labNo);
    const amended = await row(page, o.labNo);
    expect([amended.state, amended.printStatus]).toEqual(['AMENDED', 'UNPRINTED']);
    const p = await print(page, o.sampleId);
    expect(p.version).toBe('2');
    const d = await detail(page, o.sampleId);
    const v2 = d.versions.find((v: any) => v.version === 2);
    expect(v2.amended).toBe(true);
    expect(v2.changeSummary).toMatch(/Glucose .*0\.9\d* → 0\.95/);
    const text = await archivedText(page, v2.id);
    expect(text).toMatch(/Version 2\. Corrected report\./);
    await enterOn(page, o.labNo, { [T.Creatinine]: '9' });
    await validateOnly(page, o.labNo);
    expect((await row(page, o.labNo)).state, 'Amended stays after a further release').toBe('AMENDED');
  });

  test('TC-RPQ-14 four prints of one unprinted order at once issue one version (lock)', async ({ page }) => {
    const o = await partialOrder(page);
    const outs = await Promise.all([1, 2, 3, 4].map(() => print(page, o.sampleId)));
    expect(outs.map((x) => x.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(outs.map((x) => x.sha)).size).toBe(1);
    const d = await detail(page, o.sampleId);
    expect(d.versions.length).toBe(1);
    expect(d.versions[0].reprints.length).toBe(3);
  });

  test('TC-RPQ-15 a Patient Status Report print makes the queue row Printed with the same version (AC-19)', async ({ page }) => {
    const o = await partialOrder(page);
    const r = await page.request.get(`/api/OpenELIS-Global/ReportPrint?report=patientCILNSP_vreduit&type=patient&accessionDirect=${o.labNo}&highAccessionDirect=&dateOfBirthSearchValue=&selPatient=&referringSiteId=&onlyResults=false&_onlyResults=on&dateType=RESULT_DATE&lowerDateRange=&upperDateRange=`);
    expect(r.status()).toBe(200);
    const q = await row(page, o.labNo);
    expect([q.printStatus, q.version]).toEqual(['PRINTED', 1]);
    const d = await detail(page, o.sampleId);
    expect(d.versions[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('TC-RPQ-16 refusals: nothing released 409, unknown order 404, no CSRF token 403, bad patient id 400', async ({ page }) => {
    const o = await order(page, seed, [{ type: SERUM, tests: [T.Glucose] }]);
    expect((await print(page, o.sampleId)).status).toBe(409);
    expect((await print(page, 99_999_999)).status).toBe(404);
    expect((await j(page, `${API}/reportQueue/orders/99999999`)).status).toBe(404);
    const noCsrf = await page.evaluate(async ({ api, id }) => (await fetch(`${api}/reportQueue/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sampleId: id }) })).status, { api: API, id: o.sampleId });
    expect(noCsrf).toBe(403);
    expect((await j(page, `${API}/reportQueue?patientId=abc`)).status).toBe(400);
  });

  test('TC-RPQ-17 every printed patient report carries "Version n" (FR-4.6 footer)', async ({ page }) => {
    test.fail(true, 'FR-4.6: non-amended versions print only "Issued ... Page 1 of 1"; the version number appears only in the corrected banner');
    const o = await partialOrder(page);
    await print(page, o.sampleId);
    const d = await detail(page, o.sampleId);
    expect(await archivedText(page, d.versions[0].id)).toMatch(/Version 1/);
  });
});

test.describe('Report Print Queue: lookups', () => {
  test('TC-RPQ-20 a scanned lab number applies on Enter, clears and disables the other filters, and Clear search restores them (AC-15)', async ({ page }) => {
    const o = await partialOrder(page);
    await page.goto('/ReportPrintQueue');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
    const input = page.getByPlaceholder('Scan or type lab number');
    await input.fill(o.labNo);
    await input.press('Enter');
    // TableExpandRow renders a hidden expansion row under each order, so count rows that carry a lab number.
    await expect(page.locator('table tbody tr').filter({ hasText: /DEV\d{10,}/ })).toHaveCount(1);
    await expect(page.locator('table tbody tr', { hasText: o.labNo })).toHaveCount(1);
    await expect(page.getByText('Other filters are off while you look up a specific order')).toBeVisible();
    await expect(page.locator('#queue-state')).toHaveClass(/cds--list-box--disabled/);
    await expect(page.locator('#queue-facility-input')).toBeDisabled();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByText('Other filters are off while you look up a specific order')).toHaveCount(0);
    await expect(page.locator('#queue-facility-input')).toBeEnabled();
  });

  test('TC-RPQ-21 a lookup on an order with nothing released says so (FR-2.4)', async ({ page }) => {
    test.fail(true, 'FR-2.4: the row shows dashes and a disabled Print; the reason is only a title attribute on the disabled button');
    const o = await order(page, seed, [{ type: SERUM, tests: [T.Glucose] }]);
    await page.goto(`/ReportPrintQueue?labNo=${o.labNo}`);
    await expect(page.locator('table tbody tr', { hasText: o.labNo })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Nothing released yet on this order')).toBeVisible({ timeout: 5_000 });
  });

  test('TC-RPQ-22 a range typed high to low is refused with a message, not shown as "Nothing to print" (FR-3.3)', async ({ page }) => {
    test.fail(true, 'FR-3.3: no validation; the reversed range shows the "every released report has been printed" empty state');
    const hi = await partialOrder(page);
    await page.goto('/ReportPrintQueue');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
    await page.locator('label[for="queue-lab-range"]').click();
    await page.getByPlaceholder('Scan or type lab number').fill(hi.labNo);
    const to = page.getByLabel('To lab number');
    await to.fill(hi.labNo.slice(0, -3) + '001');
    await to.press('Enter');
    await expect(page.getByText(/must come before/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Every released report in this view has been printed/)).toHaveCount(0);
  });

  test('TC-RPQ-23 Search by patient lists every released order of that patient (FR-3.4)', async ({ page }) => {
    const a = await partialOrder(page);
    const b = await partialOrder(page);
    const pk = String(seed.ctx.patient.patientPK);
    const res = await list(page, `patientId=${pk}&pageSize=100`);
    expect(res.lookup).toBe(true);
    const labs = res.rows.map((r: any) => r.labNumber);
    expect(labs).toEqual(expect.arrayContaining([a.labNo, b.labNo]));
  });
});

test.describe('Report Print Queue: around the page', () => {
  test('TC-RPQ-30 the home Unprinted Results tile counts what the queue lists as Unprinted for today (AC-23)', async ({ page }) => {
    test.fail(true, 'AC-23: the tile counts results (analyses) through patientReportHasBeenDone, the queue counts orders; 5 vs 3 on 2026-10-19');
    await partialOrder(page);
    const metrics = (await j(page, `${API}/home-dashboard/metrics`)).body;
    const today = new Date().toISOString().slice(0, 10);
    const q = await list(page, 'printStatus=UNPRINTED&window=all&pageSize=100');
    const queueToday = q.rows.filter((r: any) => String(r.released).startsWith(today)).length;
    expect(Number(metrics.unPritendResults)).toBe(queueToday);
  });

  test('TC-RPQ-31 at 1280 px with the side nav pinned, the first row\'s Print button is on screen (heuristic)', async ({ page }) => {
    test.fail(true, 'Heuristic: the table is 1151 px wide in a 992 px area; Version and Action need horizontal scrolling');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/ReportPrintQueue');
    const btn = page.locator('table tbody tr').first().getByRole('button', { name: 'Print', exact: true });
    await expect(btn).toBeAttached({ timeout: 20_000 });
    const box = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); return { right: r.right, vw: window.innerWidth }; });
    expect(box.right).toBeLessThanOrEqual(box.vw);
  });
});
