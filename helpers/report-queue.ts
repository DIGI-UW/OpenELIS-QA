/**
 * helpers/report-queue.ts
 *
 * Seeds and drives the Report Print Queue (OGC-431, FRS OGC-1031 r4 V1) for
 * tests/report-print-queue.spec.ts. Orders go in through the REST calls the screens
 * make (helpers/report-pdf.ts placeOrder / enterResults); the queue is read and
 * printed through /rest/reportQueue, the endpoints the page itself calls.
 *
 * Two traps found on 2026-10-19, both handled here:
 *  - AccessionValidation?accessionNumber=X answers every result waiting for
 *    validation from X onwards, not only X's. `validateOnly` accepts X's items and
 *    leaves the rest, so one case cannot release another case's results.
 *  - A LogbookResults POST that carries an already finalized row with its `result`
 *    object answers 400 (error.request.unreadable). `enterOn` drops `result` from
 *    every row, as the screen does.
 */
import { Page, expect } from '@playwright/test';
import { API, OrderContext, SERUM, TEST_IDS, placeOrder, serverToday } from './report-pdf';

export { API, SERUM, TEST_IDS };

export async function j(page: Page, url: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; body: any }> {
  return page.evaluate(async ({ url, init }) => {
    const r = await fetch(url, {
      method: init?.method || 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const t = await r.text();
    let b: unknown = t;
    try { b = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, body: b as any };
  }, { url, init });
}

export interface PrintOutcome { status: number; version: string | null; reprint: string | null; bytes: number; sha: string; contentType: string | null }

/** POST /rest/reportQueue/print, as the row's Print button does; the PDF's SHA-256 is taken in the page. */
export async function print(page: Page, sampleId: number): Promise<PrintOutcome> {
  return page.evaluate(async ({ api, sampleId }) => {
    const r = await fetch(`${api}/reportQueue/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: JSON.stringify({ sampleId }),
    });
    const buf = await r.arrayBuffer();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { status: r.status, version: r.headers.get('X-Report-Version'), reprint: r.headers.get('X-Report-Reprint'), bytes: buf.byteLength, sha, contentType: r.headers.get('content-type') };
  }, { api: API, sampleId });
}

/** SHA-256 of the archived bytes of one version (GET /rest/reportQueue/versions/{id}/pdf). */
export async function archivedSha(page: Page, versionId: number): Promise<{ status: number; sha: string | null }> {
  return page.evaluate(async ({ api, versionId }) => {
    const r = await fetch(`${api}/reportQueue/versions/${versionId}/pdf`);
    const buf = await r.arrayBuffer();
    if (!buf.byteLength) return { status: r.status, sha: null };
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { status: r.status, sha };
  }, { api: API, versionId });
}

export async function list(page: Page, query: string): Promise<any> {
  const r = await j(page, `${API}/reportQueue?${query}`);
  expect(r.status, `GET /rest/reportQueue?${query}`).toBe(200);
  return r.body;
}

/** The queue row for one lab number (a Lab No lookup). */
export async function row(page: Page, labNo: string): Promise<any> {
  const b = await list(page, `labNo=${labNo}`);
  expect(b.rows?.length, `the lookup finds ${labNo}`).toBe(1);
  return b.rows[0];
}

export async function detail(page: Page, sampleId: number): Promise<any> {
  const r = await j(page, `${API}/reportQueue/orders/${sampleId}`);
  expect(r.status, `GET /rest/reportQueue/orders/${sampleId}`).toBe(200);
  return r.body;
}

/** LogbookResults read-modify-write by test id, with `result` dropped from every row (see the header). */
export async function enterOn(page: Page, labNo: string, values: Record<string, string>): Promise<number> {
  const g = await j(page, `${API}/LogbookResults?labNumber=${labNo}`);
  const form = g.body;
  let n = 0;
  for (const it of (form?.testResult ?? []) as any[]) {
    delete it.result;
    const v = values[String(it.testId)];
    if (v === undefined) continue;
    it.reportable = it.reportable === 'N' ? false : true;
    it.resultValue = v; it.shadowResultValue = v; it.isModified = true;
    n++;
  }
  const p = await j(page, `${API}/LogbookResults`, { method: 'POST', body: form });
  expect(p.status, `results save on ${labNo}: ${JSON.stringify(p.body).slice(0, 160)}`).toBe(200);
  return n;
}

/** Accept only this lab number's results waiting for validation (see the header). */
export async function validateOnly(page: Page, labNo: string): Promise<number> {
  const g = await j(page, `${API}/AccessionValidation?accessionNumber=${labNo}`);
  const form = g.body;
  let n = 0;
  for (const it of (form?.resultList ?? []) as any[]) {
    const mine = !it.accessionNumber || String(it.accessionNumber) === labNo;
    it.isAccepted = mine;
    if (mine) n++;
  }
  const p = await j(page, `${API}/AccessionValidation`, { method: 'POST', body: form });
  expect(p.status, `validation saves on ${labNo}`).toBe(200);
  return n;
}

export interface QueueSeed { ctx: OrderContext; date: string }

/** One QA patient ("Rpqqa, Queue", national id QARPQ...) for every order a run creates. */
export async function queueContext(page: Page): Promise<QueueSeed> {
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 60_000 });
  const date = await serverToday(page);
  const sites = (await j(page, `${API}/displayList/SAMPLE_PATIENT_REFERRING_CLINIC`)).body as any[];
  expect(sites?.length, 'a referring clinic exists').toBeGreaterThan(0);
  const stamp = String(Date.now()).slice(-7);
  const ctx: OrderContext = { date, siteId: String(sites[0].id), patient: {
    nationalId: `QARPQ${stamp}`, subjectNumber: `QARPQS${stamp}`, lastName: 'Rpqqa', firstName: 'Queue', gender: 'F',
    birthDateForDisplay: '15/03/1985', aka: '', streetAddress: '', city: '', primaryPhone: '', email: '', guid: '',
  } };
  return { ctx, date };
}

/** Place an order and return its lab number and queue sample id (the id comes from the lookup). */
export async function order(page: Page, seed: QueueSeed, samples: Array<{ type: string; tests: string[]; rejected?: string }>): Promise<{ labNo: string; sampleId: number }> {
  const labNo = await placeOrder(page, seed.ctx, samples);
  const b = await list(page, `labNo=${labNo}`);
  return { labNo, sampleId: Number(b.rows[0].sampleId) };
}
