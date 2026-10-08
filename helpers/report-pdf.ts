/**
 * helpers/report-pdf.ts
 *
 * Reads the PDFs the report screens produce, and seeds the data the report specs
 * check them against (tests/reports-openpdf.spec.ts).
 *
 * Why pdfjs-dist. The reports moved from JasperReports to OpenPDF on 2026-10-08
 * (OpenELIS-Global-2 #4531 to #4552, #4649). The tiny extractor in
 * tests/chains/_common.ts sees text operators, not lines or pages, so it cannot say
 * "this lab number is split over two lines" or "this page has no identity line".
 * pdfjs-dist gives each text run with its position, which is enough to rebuild the
 * lines of every page. It reads the PDF independently of the library that wrote it.
 */
import { Page, expect } from '@playwright/test';

export const API = '/api/OpenELIS-Global/rest';
export const REPORT_PRINT = '/api/OpenELIS-Global/ReportPrint';

export interface PdfPage {
  width: number;
  height: number;
  /** Text runs joined into lines, top to bottom; runs on one line separated by a single space. */
  lines: string[];
  /** Raw runs with their position on the page as viewed (y down from the top). */
  runs: Array<{ str: string; x: number; y: number }>;
}

export interface PdfDoc {
  producer: string;
  pages: PdfPage[];
  /** Every line of every page, joined by newlines. */
  text: string;
}

/** True when the bytes are a PDF at all (a 500 or an HTML page is not). */
export function isPdf(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function readPdf(buf: Buffer): Promise<PdfDoc> {
  // pdfjs-dist ships ESM only; the legacy build runs in Node without a DOM.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const meta = await doc.getMetadata().catch(() => ({ info: {} }));
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const content = await p.getTextContent();
    const runs = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => {
        // into viewport space (y down), so rotated (landscape) pages read in reading order
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        return { str: it.str as string, x: t[4] as number, y: t[5] as number };
      });
    // group runs whose baselines are within 2pt into one line
    const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: string[] = [];
    let cur: typeof runs = [];
    let y = Number.NaN;
    for (const r of sorted) {
      if (cur.length && Math.abs(r.y - y) > 2) {
        lines.push(cur.sort((a, b) => a.x - b.x).map((c) => c.str.trim()).join(' '));
        cur = [];
      }
      if (!cur.length) y = r.y;
      cur.push(r);
    }
    if (cur.length) lines.push(cur.sort((a, b) => a.x - b.x).map((c) => c.str.trim()).join(' '));
    pages.push({ width: Math.round(vp.width), height: Math.round(vp.height), lines, runs });
  }
  await doc.destroy();
  return { producer: String((meta.info as any)?.Producer ?? ''), pages, text: pages.map((p) => p.lines.join('\n')).join('\n') };
}

/** The OpenELIS "report could not be produced" notice, which is itself a valid PDF. */
export const ERROR_NOTICE = /It is not possible to create the report at this time/;

/**
 * Fetch a report URL the page opened (or would open) with the session's cookies,
 * and read it. Fails with the body when the server did not answer a PDF.
 */
export async function fetchReport(page: Page, url: string): Promise<{ status: number; buf: Buffer; pdf: PdfDoc | null; contentType: string }> {
  const res = await page.request.get(url, { timeout: 240_000 });
  const buf = await res.body();
  const contentType = res.headers()['content-type'] || '';
  return { status: res.status(), buf, contentType, pdf: isPdf(buf) ? await readPdf(buf) : null };
}

/**
 * Click a report screen's Generate control and return the ReportPrint URL it requested.
 * The screens call window.open(url); listening for the request is faster and more
 * reliable than waiting for the popup to finish loading a PDF in a headless browser.
 */
export async function generateUrl(page: Page, button: RegExp = /Generate Printable Version/i): Promise<string> {
  const req = page.context().waitForEvent('request', { predicate: (r) => r.url().includes('/ReportPrint'), timeout: 60_000 });
  await page.getByRole('button', { name: button }).first().click();
  const url = (await req).url();
  for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => {});
  return url;
}

/** Type a date into one of the report screens' Carbon date inputs (dd/mm/yyyy). */
export async function setDate(page: Page, id: string, value: string): Promise<void> {
  const el = page.locator(`#${id}`);
  await el.click();
  await el.fill(value);
  await el.press('Enter').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

async function j(page: Page, url: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; body: any }> {
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

/** dd/MM/yyyy for the server's today (the server refuses dates after its own today). */
export async function serverToday(page: Page): Promise<string> {
  const st = await j(page, `${API}/server-time`);
  const iso = String(st.body?.date ?? '');
  expect(iso, 'GET /rest/server-time answers a date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export interface ReportSeed {
  date: string;
  siteId: string;
  nationalId: string;
  patientPK: string;
  patientName: string;
  /** complete: four Biochemistry tests validated, one high, one low */
  complete: string;
  /** partial: one test validated, one never resulted */
  partial: string;
  /** large: two sample types, 24 tests over two units, validated */
  large: string;
  /** results entered, waiting for validation */
  awaiting: string;
  /** sample rejected at entry */
  rejected: string;
  /** ordered, nothing entered (workplans) */
  ordered: string;
  rejectReason: string;
  log: string[];
}

export const SERUM = '2';
export const WHOLE_BLOOD = '4';
// Test ids of the develop dataset that every stack (local and CI) is built from:
// GPT/ALAT 1, Glucose 3, Creatinine 4, Amylase 5, Total Cholesterol 7, HDL 8,
// Triglycerides 9 on serum; the 18 haematology tests 13 to 30 on whole blood.
export const TEST_IDS = { GPT: '1', Glucose: '3', Creatinine: '4', Amylase: '5', Cholesterol: '7', HDL: '8', Triglycerides: '9' };
const HEME = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'];

export interface OrderContext { date: string; siteId: string; patient: Record<string, unknown> }

/** Place an order for the context's patient (created on first use) through POST /rest/SamplePatientEntry. */
export async function placeOrder(page: Page, ctx: OrderContext, samples: Array<{ type: string; tests: string[]; rejected?: string }>): Promise<string> {
  const gen = await j(page, `${API}/SampleEntryGenerateScanProvider`);
  const labNo = String(gen.body?.body ?? '');
  expect(labNo, 'a lab number is generated').not.toBe('');
  const xml = '<?xml version="1.0" encoding="utf-8"?><samples>' + samples.map((s) =>
    `<sample sampleID='${s.type}' date='${ctx.date}' time='07:30' collector='' quantity='' uom='' tests='${s.tests.join(',')}' ` +
    `testSectionMap='' testSampleTypeMap='' panels='' rejected='${s.rejected ? 'true' : 'false'}' rejectReasonId='${s.rejected ?? ''}' ` +
    `initialConditionIds='' numOrderLabels='1' numSpecimenLabels='1'/>`).join('') + '</samples>';
  const status = ctx.patient.patientPK ? 'NO_ACTION' : 'ADD';
  const r = await j(page, `${API}/SamplePatientEntry`, { method: 'POST', body: {
    rememberSiteAndRequester: false, currentDate: ctx.date, customNotificationLogic: false,
    patientEmailNotificationTestIds: [], patientSMSNotificationTestIds: [], providerEmailNotificationTestIds: [], providerSMSNotificationTestIds: [],
    patientUpdateStatus: status, referralItems: [], useReferral: false, warning: false, sampleXML: xml,
    patientProperties: { ...ctx.patient, patientUpdateStatus: status },
    sampleOrderItems: { labNo, requestDate: ctx.date, receivedDateForDisplay: ctx.date, receivedTime: '08:15', priority: 'ROUTINE',
      referringSiteId: ctx.siteId, referringSiteDepartmentId: '', newRequesterName: '', providerFirstName: 'Reportdoc', providerLastName: 'Qarpt', modified: true },
    initialSampleConditionList: [], testSectionList: [],
  } });
  expect(r.status, `order ${labNo} saves: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
  if (!ctx.patient.patientPK) {
    const found = await j(page, `${API}/patient-search-results?nationalID=${ctx.patient.nationalId}&lastName=&firstName=`);
    const pt = (found.body?.patientSearchResults ?? [])[0];
    expect(pt, 'the new QA patient is found by national id').toBeTruthy();
    ctx.patient.patientPK = String(pt.patientID ?? pt.patientId);
  }
  return labNo;
}

/** Enter results by test id: the LogbookResults read-modify-write (see tests/chains/_common.ts). */
export async function enterResults(page: Page, labNo: string, values: Record<string, string>): Promise<void> {
  const g = await j(page, `${API}/LogbookResults?labNumber=${labNo}`);
  const form = g.body;
  for (const it of (form?.testResult ?? []) as any[]) {
    const v = values[String(it.testId)];
    if (v === undefined) continue;
    it.reportable = it.reportable === 'N' ? false : true;
    it.resultValue = v; it.shadowResultValue = v; it.isModified = true;
    delete it.result;
  }
  const p = await j(page, `${API}/LogbookResults`, { method: 'POST', body: form });
  expect(p.status, `results save on ${labNo}`).toBe(200);
}

/** Accept every result waiting for validation on a lab number. */
export async function validateAll(page: Page, labNo: string): Promise<number> {
  const g = await j(page, `${API}/AccessionValidation?accessionNumber=${labNo}`);
  const form = g.body;
  const items = (form?.resultList ?? []) as any[];
  for (const it of items) it.isAccepted = true;
  const p = await j(page, `${API}/AccessionValidation`, { method: 'POST', body: form });
  expect(p.status, `validation saves on ${labNo}`).toBe(200);
  return items.length;
}

/**
 * Create one QA patient and six orders that between them exercise the report
 * states: complete, partial, multi-page, awaiting validation, rejected, not started.
 * Everything goes through the REST calls the screens make. Each call creates new
 * rows, so two runs never share an order.
 *
 * GPT/ALAT and GOT/ASAT are never resulted together here: on 2026-10-08 a
 * LogbookResults POST carrying both answered 500 (stale Result row), which is a
 * result entry question, not a report one.
 */
export async function seedReportData(page: Page): Promise<ReportSeed> {
  const log: string[] = [];
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 60_000 });
  const date = await serverToday(page);
  const sites = (await j(page, `${API}/displayList/SAMPLE_PATIENT_REFERRING_CLINIC`)).body as any[];
  expect(sites?.length, 'a referring clinic exists (ci-fixtures / data.setup create one)').toBeGreaterThan(0);
  const siteId = String(sites[0].id);
  const reasons = (await j(page, `${API}/displayList/REJECTION_REASONS`)).body as any[];
  expect(reasons?.length, 'rejection reasons are configured').toBeGreaterThan(0);
  const stamp = String(Date.now()).slice(-7);
  const nationalId = `QARPT${stamp}`;
  const ctx: OrderContext = { date, siteId, patient: {
    nationalId, subjectNumber: `QARPTS${stamp}`, lastName: 'Rptqa', firstName: 'Thérèse', gender: 'F',
    birthDateForDisplay: '15/03/1985', aka: '', streetAddress: '', city: '', primaryPhone: '', email: '', guid: '',
  } };
  const T = TEST_IDS;
  const order = async (samples: Array<{ type: string; tests: string[]; rejected?: string }>) => {
    const labNo = await placeOrder(page, ctx, samples);
    log.push(`order ${labNo}: ${samples.map((s) => s.tests.join(',')).join(' + ')}`);
    return labNo;
  };

  const complete = await order([{ type: SERUM, tests: [T.GPT, T.Glucose, T.Creatinine, T.Amylase] }]);
  await enterResults(page, complete, { [T.GPT]: '25', [T.Glucose]: '1', [T.Creatinine]: '4', [T.Amylase]: '600' });
  await validateAll(page, complete);

  const partial = await order([{ type: SERUM, tests: [T.Cholesterol, T.HDL] }]);
  await enterResults(page, partial, { [T.Cholesterol]: '2' });
  await validateAll(page, partial);

  const serumLarge = [T.Glucose, T.Creatinine, T.Amylase, T.Cholesterol, T.HDL, T.Triglycerides];
  const large = await order([{ type: WHOLE_BLOOD, tests: HEME }, { type: SERUM, tests: serumLarge }]);
  const lv: Record<string, string> = {};
  HEME.forEach((t, i) => { lv[t] = String(5 + i); });
  serumLarge.forEach((t, i) => { lv[t] = String(1 + i); });
  await enterResults(page, large, lv);
  await validateAll(page, large);

  const awaiting = await order([{ type: SERUM, tests: [T.Amylase, T.Triglycerides] }]);
  await enterResults(page, awaiting, { [T.Amylase]: '30', [T.Triglycerides]: '1' });

  const rejected = await order([{ type: SERUM, tests: [T.Amylase], rejected: String(reasons[0].id) }]);
  const ordered = await order([{ type: SERUM, tests: [T.Glucose, T.Triglycerides] }]);

  return {
    date, siteId, nationalId, patientPK: String(ctx.patient.patientPK), patientName: 'Rptqa, Thérèse',
    complete, partial, large, awaiting, rejected, ordered, rejectReason: String(reasons[0].value).trim(), log,
  };
}
