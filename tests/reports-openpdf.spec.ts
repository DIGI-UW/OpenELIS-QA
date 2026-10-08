/**
 * tests/reports-openpdf.spec.ts
 *
 * Every report reachable from the Reports menu, generated from its own screen and
 * read back page by page, after the reports moved from JasperReports to OpenPDF
 * (OpenELIS-Global-2 #4531 to #4552 and the review remediation #4649, merged to
 * develop 2026-10-08). Catalogue: reports-openpdf-test-cases.md.
 *
 * The data the reports are checked against is seeded once per worker by
 * helpers/report-pdf.ts `seedReportData`: one QA patient ("Rptqa, Thérèse",
 * national id QARPT...) with six orders, complete, partial, multi-page, waiting for
 * validation, rejected and not started.
 *
 * A screen's Generate control opens ReportPrint in a new window. The cases take the
 * URL the screen requested and read the PDF it answers, so a case fails on what a user
 * would get: a 500, an HTML page, or an error-notice PDF where a report was expected.
 *
 * Kind (see the catalogue): Guard passes today and protects it. Tripwire asserts the
 * intended behaviour and carries test.fail() while develop differs; it goes red
 * ("Expected to fail, but passed") the day it is fixed, and the marker comes off.
 *
 * Written 2026-10-08 against local develop images of 2026-10-08 18:53 UTC (includes
 * 1156e683a, #4649).
 */
import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  API, ERROR_NOTICE, PdfDoc, ReportSeed, SERUM, TEST_IDS, enterResults, fetchReport, generateUrl, placeOrder,
  seedReportData, setDate, validateAll,
} from '../helpers/report-pdf';
import { ensureInactiveLabUnitWithTest } from '../helpers/ci-fixtures';

// Not serial: one red case must not skip the rest (a cascade-skip hides everything behind it).
// The seed runs again in a fresh worker after a failure, which is cheap.
test.setTimeout(240_000);

let seed: ReportSeed;

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ ...(testInfo.project.use as any) });
  const page = await ctx.newPage();
  seed = await seedReportData(page);
  fs.mkdirSync(testInfo.project.outputDir, { recursive: true });
  fs.writeFileSync(path.join(testInfo.project.outputDir, 'report-seed.json'), JSON.stringify(seed, null, 1));
  await ctx.close();
});

/** Lines of the patient report that belong to one order, from its identity line to the next order's notice. */
function orderBlock(doc: PdfDoc, lab: string): string[] {
  const all = doc.pages.flatMap((p) => p.lines);
  const start = all.findIndex((l) => l.includes(`Lab Number ${lab}`) && l.startsWith('Patient code'));
  if (start < 0) return [];
  const rest = all.slice(start + 1);
  const end = rest.findIndex((l) => /^Results (Complete|Partial) Report$/.test(l) || (l.startsWith('Patient code') && !l.includes(lab)));
  return [all[start], ...(end < 0 ? rest : rest.slice(0, end))];
}

/** The completion notice printed above an order's details. */
function noticeFor(doc: PdfDoc, lab: string): string {
  const all = doc.pages.flatMap((p) => p.lines);
  const at = all.findIndex((l) => l.includes(`Lab Number ${lab}`) && l.startsWith('Patient code'));
  for (let i = at; i >= 0; i--) if (/^Results (Complete|Partial) Report$/.test(all[i])) return all[i];
  return '';
}

async function patientReport(page: Page, from: string, to: string): Promise<PdfDoc> {
  await page.goto('/Report?type=patient&report=patientCILNSP_vreduit');
  await page.getByRole('button', { name: 'Report By Lab Number' }).click();
  await page.locator('#from').fill(from);
  await page.locator('#to').fill(to);
  const url = await generateUrl(page);
  const r = await fetchReport(page, url);
  expect(r.status, `Patient Status Report answers 200 (${url})`).toBe(200);
  expect(r.pdf, `Patient Status Report is a PDF, not ${r.contentType}`).not.toBeNull();
  expect(r.pdf!.text, 'a report, not the error notice').not.toMatch(ERROR_NOTICE);
  return r.pdf!;
}

async function dateReport(page: Page, route: string, from: string, to: string, select?: string): Promise<{ url: string; r: Awaited<ReturnType<typeof fetchReport>> }> {
  await page.goto(route);
  await setDate(page, 'startDate', from);
  await setDate(page, 'endDate', to);
  if (select !== undefined) await page.locator('select#type').selectOption(select);
  const url = await generateUrl(page);
  return { url, r: await fetchReport(page, url) };
}

// ------------------------------------------------------------ patient status report
test.describe('Patient Status Report (PatientResultsPdf)', () => {
  test('TC-RPTPDF-01 by lab number range: one OpenPDF document on the site paper, the patient, every order', async ({ page }) => {
    const doc = await patientReport(page, seed.complete, seed.ordered);
    expect(doc.producer, 'built by OpenPDF, not the retired Jasper path').toMatch(/OpenPDF/);
    expect(doc.pages.length, 'six orders, 30 result rows: more than one page').toBeGreaterThan(1);
    for (const p of doc.pages) expect([p.width, p.height], 'A4 portrait, the default reportPaperSize').toEqual([595, 842]);
    expect(doc.text, 'patient name with its accent, as entered').toContain(seed.patientName);
    expect(doc.text, 'national id').toContain(seed.nationalId);
    for (const lab of [seed.complete, seed.partial, seed.large, seed.awaiting, seed.rejected, seed.ordered]) {
      expect(orderBlock(doc, lab).length, `order ${lab} has its results block`).toBeGreaterThan(1);
    }
  });

  test('TC-RPTPDF-02 results, flags, ranges and units print as stored; Complete vs Partial per order', async ({ page }) => {
    const doc = await patientReport(page, seed.complete, seed.partial);
    const a = orderBlock(doc, seed.complete);
    const row = (name: string) => a.find((l) => l.startsWith(name)) ?? '';
    expect(row('Creatinine'), 'Creatinine 4 below 6-13: value, Validated, flag B, range, unit').toMatch(/4\.00 Validated B 6\.00-13\.00 mg\/dl/);
    expect(row('Amylase'), 'Amylase 600 above 1-486: flag E').toMatch(/600 Validated E 1-486 Ul\/l/);
    expect(row('GPT/ALAT'), 'GPT 25 in 7-40: no flag').toMatch(/25 Validated 7-40 Ul\/l/);
    expect(noticeFor(doc, seed.complete), 'every test validated').toBe('Results Complete Report');
    expect(noticeFor(doc, seed.partial), 'one test never resulted').toBe('Results Partial Report');
    expect(orderBlock(doc, seed.partial).join('\n'), 'the unresulted test is listed In progress').toMatch(/HDL cholesterol.*In progress/);
    expect(doc.pages.at(-1)!.lines.join('\n'), 'legend at the foot').toMatch(/Legend B = Below Normal E = Above Normal/);
    expect(doc.text, 'signature box').toMatch(/Signature \/ Validation/);
  });

  test('TC-RPTPDF-03 unvalidated results are not printed; a rejected sample says so', async ({ page }) => {
    const doc = await patientReport(page, seed.awaiting, seed.rejected);
    const w = orderBlock(doc, seed.awaiting).join('\n');
    expect(w, 'awaiting validation is shown as such').toMatch(/Waiting/);
    expect(w, 'the entered value 30 is not released on the report').not.toMatch(/Amylase \(Serum\) 1 30\b/);
    expect(orderBlock(doc, seed.rejected).join('\n'), 'rejected sample').toMatch(/Rejected/);
  });

  test('TC-RPTPDF-04 every continuation page names the patient and order it belongs to', async ({ page }) => {
    const doc = await patientReport(page, seed.complete, seed.ordered);
    doc.pages.forEach((p, i) => {
      expect(p.lines.some((l) => /^Patient code \S+ Lab Number DEV\d+/.test(l)),
        `page ${i + 1} carries a patient code / lab number line`).toBe(true);
      expect(p.lines.join('\n'), `page ${i + 1} carries the legend`).toMatch(/Legend B = Below Normal/);
    });
  });

  test('TC-RPTPDF-05 the lab number prints whole in the order details box on A4', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 (images 18:53 UTC): on A4 the details box's
    // Lab Number cell is too narrow for a 20-character accession, so it wraps as
    // "DEV0126000000000210" / "5". The Jasper template printed it on one line; on Letter
    // (wider) it fits. PatientResultsPdf.addOrderDetails column widths {100, 100, ...}.
    test.fail();
    const doc = await patientReport(page, seed.complete, seed.complete);
    expect(doc.pages[0].lines.some((l) => l.startsWith(`Lab Number ${seed.complete}`)),
      `the details row reads "Lab Number ${seed.complete}" on one line`).toBe(true);
  });
});

// ------------------------------------------------------------ management reports
test.describe('Activity, rejection and referral reports (ManagementReportPdf, ReferredOutReport)', () => {
  test('TC-RPTPDF-10 Activity Report by unit lists the order with its results', async ({ page }) => {
    const { url, r } = await dateReport(page, '/Report?type=indicator&report=activityReportByTestSection', seed.date, seed.date, '56');
    expect(r.status, url).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    const t = r.pdf!.text;
    expect(t).not.toMatch(ERROR_NOTICE);
    expect(t).toMatch(/Activity Report/);
    expect(t).toMatch(/Unit: Biochemistry/);
    expect(t, 'the complete order and its Creatinine result').toMatch(new RegExp(`${seed.complete} Creatinine .*4\\.00 mg/dl`));
    // every page that carries rows also carries the column headings (a last page may hold only the sign-off line)
    for (const p of r.pdf!.pages.slice(1).filter((pg) => pg.lines.some((l) => /^DEV\d+/.test(l)))) {
      expect(p.lines.join('\n'), 'column headings repeat on a continuation page').toMatch(/Lab No/);
    }
  });

  test('TC-RPTPDF-11 Activity Report by test produces the report (not a 500)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Regression from #4538, observed 2026-10-08: every valid request
    // answers 500. ActivityReport.initializeReport no longer calls createReportParameters(),
    // so ActivityReportByTest.buildReportContent NPEs on reportParameters.put("underlineResults", false).
    test.fail();
    const { url, r } = await dateReport(page, '/Report?type=indicator&report=activityReportByTest', seed.date, seed.date, TEST_IDS.Creatinine);
    expect(r.status, `Activity Report by test answers 200 (${url})`).toBe(200);
    expect(r.pdf?.text ?? '', 'lists the complete order').toContain(seed.complete);
  });

  test('TC-RPTPDF-12 Rejection Report (CSV) lists the rejected sample with its reason', async ({ page }) => {
    const { url, r } = await dateReport(page, '/Report?type=indicator&report=sampleRejectionReport', seed.date, seed.date);
    expect(r.status, url).toBe(200);
    const csv = r.buf.toString('utf8');
    const line = csv.split(/\r?\n/).find((l) => l.startsWith(seed.rejected)) ?? '';
    expect(line, 'a row for the rejected sample').not.toBe('');
    expect(line, 'with the reason chosen at entry').toContain(seed.rejectReason.slice(0, 30));
  });

  test('TC-RPTPDF-13 Referred Out Tests Report lists the seeded referrals and names the destination on every page', async ({ page }) => {
    await page.goto('/Report?type=patient&report=referredOut');
    const options = await page.locator('select#locationcode option').evaluateAll((os) => os.map((o: any) => ({ v: o.value, t: o.textContent })));
    const lab = options.find((o) => /QA_AUTO Reference Lab Alpha/.test(String(o.t)));
    expect(lab, 'the referral seed laboratory is offered (modules.config runs referral-seed.setup first)').toBeTruthy();
    await setDate(page, 'startDate', `01/01/${seed.date.slice(6)}`);
    await setDate(page, 'endDate', seed.date);
    await page.locator('select#locationcode').selectOption(lab!.v);
    const url = await generateUrl(page);
    const r = await fetchReport(page, url);
    expect(r.status, url).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    expect(r.pdf!.text, 'the seeded referrals are listed, not the "nothing to print" notice').not.toMatch(ERROR_NOTICE);
    r.pdf!.pages.forEach((p, i) => expect(p.lines.join('\n'), `page ${i + 1} names the destination`).toMatch(/External Referrals Report: QA_AUTO Reference Lab Alpha/));
    expect(r.pdf!.text).toMatch(/DEV\d+-\d+/);
  });

  test('TC-RPTPDF-14 a report with nothing to print is the readable notice PDF, not an error', async ({ page }) => {
    const { url, r } = await dateReport(page, '/Report?type=patient&report=haitiNonConformityByDate', '01/01/2020', '02/01/2020');
    expect(r.status, url).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    expect(r.pdf!.text).toMatch(ERROR_NOTICE);
    expect(r.pdf!.text).toMatch(/No reports met printing criteria/);
  });
});

// ------------------------------------------------------------ indicators and statistics
/**
 * The Delayed Validation menu entry is a direct link (menu_reports_validation_backlog,
 * /ReportPrint?type=indicator&report=validationBacklog). Its button on /RoutineReports
 * sits under the pinned side nav (R3, OGC-1373) and cannot be clicked there, so the case
 * opens the link the menu carries, read from /rest/menu.
 */
async function backlogUrl(page: Page): Promise<string> {
  await page.goto('/');
  const menu = await page.evaluate(async (api) => (await fetch(`${api}/menu`)).json(), API);
  const flat: any[] = [];
  const walk = (n: any) => { if (n) { flat.push(n.menu ?? n); (n.childMenus ?? []).forEach(walk); } };
  (Array.isArray(menu) ? menu : [menu]).forEach(walk);
  const item = flat.find((m) => m?.elementId === 'menu_reports_validation_backlog');
  const action = String(item?.actionURL ?? '/ReportPrint?type=indicator&report=validationBacklog');
  return `/api/OpenELIS-Global${action}`;
}

test.describe('Aggregate reports (IndicatorReport, StatisticsReport, ValidationBacklogReport)', () => {
  test('TC-RPTPDF-20 Statistics Report counts this month\'s validated tests, on the next paper size up', async ({ page }) => {
    await page.goto('/Report?type=indicator&report=statisticsReport');
    for (const id of ['select-all-lab-units', 'select-all-priorities', 'select-all-time-frames']) await page.locator(`label[for="${id}"]`).click();
    const url = await generateUrl(page);
    const r = await fetchReport(page, url);
    expect(r.status, url).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    const [w, h] = [r.pdf!.pages[0].width, r.pdf!.pages[0].height].sort((x, y) => x - y);
    expect([w, h], 'A3 (A4 + 1) for an A4 site').toEqual([842, 1191]);
    const month = Number(seed.date.slice(3, 5));
    const row = r.pdf!.text.split('\n').find((l) => /^Creatinine( \d+){24}$/.test(l)) ?? '';
    expect(row, 'a Creatinine row with 24 month columns').not.toBe('');
    const n = row.split(' ').slice(1).map(Number);
    expect(n[(month - 1) * 2], 'this month: at least the two seeded validated Creatinine tests').toBeGreaterThanOrEqual(2);
  });

  test('TC-RPTPDF-21 Summary of All Tests lists the unit\'s tests for a past range', async ({ page }) => {
    const { url, r } = await dateReport(page, '/Report?type=indicator&report=indicatorHaitiLNSPAllTests', `01/01/${seed.date.slice(6)}`, seed.date);
    expect(r.status, url).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    expect(r.pdf!.text).toMatch(/Summary of All Tests/);
    expect(r.pdf!.text).toMatch(/Not Started In Progress \* Completed Total/);
  });

  test('TC-RPTPDF-22 Summary of All Tests ending today counts today\'s validated tests', async ({ page }) => {
    // FLIP-WHEN-FIXED (not from the port; IndicatorReport.setDateRange is unchanged).
    // Observed 2026-10-08: the upper date becomes midnight at its start, and
    // getAnalysisStartedOrCompletedInDateRange uses BETWEEN, so tests started after
    // 00:00 on the end date are left out. The screen refuses a future end date, so a
    // user cannot include today's work at all.
    test.fail();
    const { url, r } = await dateReport(page, '/Report?type=indicator&report=indicatorHaitiLNSPAllTests', seed.date, seed.date);
    expect(r.status, url).toBe(200);
    const row = (r.pdf?.text ?? '').split('\n').find((l) => /^Creatinine \d+ \d+ \d+ \d+$/.test(l)) ?? 'Creatinine 0 0 0 0';
    expect(Number(row.split(' ')[3]), 'Completed includes the two Creatinine tests validated today').toBeGreaterThanOrEqual(2);
  });

  test('TC-RPTPDF-23 Delayed Validation lists the units with results waiting', async ({ page }) => {
    const url = await backlogUrl(page);
    const r = await fetchReport(page, url);
    expect(r.status, `Delayed Validation answers 200 (${url}); 500 means a waiting result sits in an inactive unit (TC-RPTPDF-24)`).toBe(200);
    expect(r.pdf, 'a PDF').not.toBeNull();
    const row = r.pdf!.text.split('\n').find((l) => /^Biochemistry \d+$/.test(l)) ?? 'Biochemistry 0';
    expect(Number(row.split(' ')[1]), 'the seeded Amylase and Triglycerides wait in Biochemistry').toBeGreaterThanOrEqual(2);
  });

  test('TC-RPTPDF-24 Delayed Validation survives a waiting result in an inactive lab unit', async ({ page }) => {
    // FLIP-WHEN-FIXED (not from the port; ValidationBacklogReport.loadBuckets is unchanged).
    // Observed 2026-10-08: the buckets are built for active units only, so a result
    // waiting in a unit that was deactivated afterwards finds no bucket and the report
    // answers 500 for everyone. This case creates that state, then validates it away.
    test.fail();
    await page.goto('/');
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 60_000 });
    const testId = await ensureInactiveLabUnitWithTest(page, []);
    const ctx = { date: seed.date, siteId: seed.siteId, patient: { patientPK: seed.patientPK, nationalId: seed.nationalId, subjectNumber: '', lastName: 'Rptqa', firstName: 'Thérèse', gender: 'F', birthDateForDisplay: '15/03/1985' } };
    const lab = await placeOrder(page, ctx, [{ type: SERUM, tests: [testId] }]);
    try {
      await enterResults(page, lab, { [testId]: '50' });
      const url = await backlogUrl(page);
      const r = await fetchReport(page, url);
      expect(r.status, `Delayed Validation answers 200 with a result waiting in an inactive unit (${url})`).toBe(200);
    } finally {
      await validateAll(page, lab).catch(() => 0);
    }
  });
});

// ------------------------------------------------------------ workplans
test.describe('Printed workplans (WorkplanPdf)', () => {
  async function printWorkplan(page: Page, route: string, value: string): Promise<PdfDoc & { sentLabs: string[] }> {
    await page.goto(route);
    await page.locator('select#select-1').selectOption(value);
    const print = page.locator('#print-top');
    await expect(print, 'the workplan lists tests and offers Print').toBeVisible({ timeout: 60_000 });
    const resp = page.waitForResponse((x) => x.url().includes('PrintWorkplanReport'), { timeout: 120_000 });
    await print.click();
    const sent = await resp;
    // The page reads the PDF as a blob, so Playwright reports an empty body: send the same POST again.
    const again = await page.evaluate(async ({ url, data }) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' }, body: data });
      const b = new Uint8Array(await res.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return { status: res.status, b64: btoa(s) };
    }, { url: sent.url(), data: sent.request().postData() || '' });
    expect(again.status, 'PrintWorkplanReport answers 200').toBe(200);
    const { readPdf, isPdf } = await import('../helpers/report-pdf');
    const buf = Buffer.from(again.b64, 'base64');
    expect(isPdf(buf), 'a PDF').toBe(true);
    for (const p of page.context().pages()) if (p !== page) await p.close().catch(() => {});
    const sentLabs = ((JSON.parse(sent.request().postData() || '{}').workplanTests ?? []) as any[])
      .filter((t) => !t.notIncludedInWorkplan).map((t) => String(t.accessionNumber));
    return { ...(await readPdf(buf)), sentLabs };
  }

  test('TC-RPTPDF-30 Workplan by unit prints the unit and every row the screen listed', async ({ page }) => {
    const doc = await printWorkplan(page, '/WorkPlanByTestSection?type=', '56');
    expect(doc.pages[0].lines[0], 'title').toBe('Work plan: Biochemistry');
    expect(doc.sentLabs.length, 'the screen listed tests to print').toBeGreaterThan(0);
    const missing = [...new Set(doc.sentLabs)].filter((lab) => !doc.text.includes(lab));
    expect(missing, 'every lab number the screen listed is on the printed sheet').toEqual([]);
    for (const p of doc.pages.slice(1)) expect(p.lines.join('\n'), 'title repeats on every page').toMatch(/Work plan: Biochemistry/);
  });

  test('TC-RPTPDF-31 Workplan by test prints which test it is for', async ({ page }) => {
    // FLIP-WHEN-FIXED (not from the port). Observed 2026-10-08: the title is "Work plan:"
    // with nothing after it, and the by-test sheet has no test column, so the printout
    // does not say which test it is. The screen sends the test id as testSectionId and
    // an empty testTypeID; PrintWorkplanReportRestController names the plan from testTypeID.
    test.fail();
    const doc = await printWorkplan(page, '/WorkPlanByTest?type=test', TEST_IDS.Glucose);
    expect(doc.pages[0].lines[0], 'title names the test').toMatch(/^Work plan: \S+/);
  });
});

// ------------------------------------------------------------ cold storage
test.describe('Cold storage temperature log (FreezerTemperatureReportPdf)', () => {
  async function freezerReport(page: Page, type: 'Daily Log' | 'Weekly Log' | 'Monthly Log'): Promise<{ sent: string; doc: PdfDoc }> {
    await page.goto('/FreezerMonitoring?tab=3');
    await page.getByRole('tab', { name: 'Reports' }).click().catch(() => page.getByRole('button', { name: 'Reports' }).click());
    // Carbon Dropdown: its toggle button carries the current value
    await page.getByRole('combobox', { name: 'Report Type' }).click();
    await page.getByRole('option', { name: type }).click();
    const reqP = page.waitForRequest((r) => r.url().includes('/rest/coldstorage/reports/generate') && r.method() === 'POST', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Generate Report' }).click();
    const req = await reqP;
    const sent = String(JSON.parse(req.postData() || '{}').reportType ?? '');
    const again = await page.evaluate(async ({ url, data }) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' }, body: data });
      const b = new Uint8Array(await res.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return { status: res.status, b64: btoa(s) };
    }, { url: req.url(), data: req.postData() || '' });
    expect(again.status, 'the report generates').toBe(200);
    const { readPdf } = await import('../helpers/report-pdf');
    return { sent, doc: await readPdf(Buffer.from(again.b64, 'base64')) };
  }

  test('TC-RPTPDF-40 Daily Log: title, period and the compliance statement', async ({ page }) => {
    const { doc } = await freezerReport(page, 'Daily Log');
    expect(doc.text).toMatch(/Freezer Temperature Monitoring Report/);
    expect(doc.text).toMatch(/DAILY LOG/);
    expect(doc.text, 'the compliance wording restored in #4649').toMatch(/This report complies with CAP, CLIA, FDA, and WHO guidelines/);
    expect(doc.text).toMatch(/Period: \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
  });

  test('TC-RPTPDF-41 Weekly Log on the screen produces the weekly log', async ({ page }) => {
    // FLIP-WHEN-FIXED (not from the port). Observed 2026-10-08: the screen maps Daily,
    // Weekly and Monthly Log all to reportType "freezerDailyLogReport"
    // (coldStorage/Reports.jsx REPORT_TYPE_MAP), so Weekly and Monthly print the daily
    // log. The server already answers "weekly" and "monthly".
    test.fail();
    const { sent, doc } = await freezerReport(page, 'Weekly Log');
    expect(sent, 'the screen asks for the weekly log').toMatch(/weekly/i);
    expect(doc.text).toMatch(/WEEKLY LOG/);
  });
});

// ------------------------------------------------------------ site settings
test.describe('Printed Reports Configuration: paper size and page numbers', () => {
  async function setConfig(page: Page, name: 'reportPaperSize' | 'reportPageNumbers', value: string) {
    await page.goto('/MasterListsPage/PrintedReportsConfigurationMenu', { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr').filter({ hasText: name }).first();
    await expect(row, `${name} is listed`).toBeVisible({ timeout: 30_000 });
    const modify = page.getByRole('button', { name: /Modify/i }).first();
    const save = page.getByRole('button', { name: /^Save$/i }).first();
    // same two-stage form as ci-fixtures ensureEqaEnabled: the row radio is a hidden input
    await expect(async () => {
      await row.locator('input[type=radio]').first().evaluate((el) => (el as HTMLInputElement).click());
      await expect(modify).toBeEnabled({ timeout: 3_000 });
      await modify.click({ timeout: 5_000 });
      await expect(save).toBeVisible({ timeout: 5_000 });
    }, `Modify on ${name} opens its form`).toPass({ timeout: 45_000 });
    if (name === 'reportPaperSize') {
      // Carbon Dropdown toggle (downshift); its text is the current value
      await page.locator('main button[id$="-toggle-button"]').first().click();
      await page.getByRole('option', { name: value }).click();
    } else {
      await page.locator(`input[type=radio][value="${value}"]`).first().check({ force: true });
    }
    const resp = page.waitForResponse((x) => x.url().includes('PrintedReportsConfiguration') && x.request().method() === 'POST', { timeout: 20_000 });
    await save.click();
    expect((await resp).status(), `${name}=${value} saves`).toBeLessThan(300);
    const list = await page.evaluate(async (api) => (await fetch(`${api}/PrintedReportsConfigurationMenu`)).json(), API);
    expect((list.menuList ?? []).find((x: any) => x.name === name)?.value, `${name} reads back`).toBe(value);
  }

  test('TC-RPTPDF-50 Letter with page numbers: the reports follow the setting, then the saved settings come back', async ({ page }) => {
    test.setTimeout(420_000);
    await page.goto('/');
    const before = await page.evaluate(async (api) => (await fetch(`${api}/PrintedReportsConfigurationMenu`)).json(), API);
    const was = (n: string) => String((before.menuList ?? []).find((x: any) => x.name === n)?.value ?? '');
    const paper = was('reportPaperSize') || 'A4';
    const numbers = was('reportPageNumbers') || 'false';
    await setConfig(page, 'reportPaperSize', 'Letter');
    try {
      await setConfig(page, 'reportPageNumbers', 'true');
      const doc = await patientReport(page, seed.complete, seed.ordered);
      for (const p of doc.pages) expect([p.width, p.height], 'Letter portrait').toEqual([612, 792]);
      doc.pages.forEach((p, i) => expect(p.lines.join('\n'), `patient report page ${i + 1} is numbered`).toMatch(new RegExp(`Page ${i + 1}\\b`)));
      expect(doc.pages[0].lines.some((l) => l.startsWith(`Lab Number ${seed.complete}`)), 'on Letter the lab number fits on one line').toBe(true);
      const act = await dateReport(page, '/Report?type=indicator&report=activityReportByTestSection', seed.date, seed.date, '56');
      const ap = act.r.pdf!.pages;
      expect([ap[0].width, ap[0].height].sort((a, b) => a - b), 'activity report on Letter (landscape)').toEqual([612, 792]);
      expect(ap.at(-1)!.lines.join('\n'), 'last page reads Page N of N').toMatch(new RegExp(`Page ${ap.length} of ${ap.length}`));
    } finally {
      await setConfig(page, 'reportPageNumbers', numbers).catch(() => {});
      await setConfig(page, 'reportPaperSize', paper);
    }
  });
});
