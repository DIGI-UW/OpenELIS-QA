/**
 * tests/reports-output-correctness.spec.ts
 *
 * Routine Reports: does the report that comes back match what was asked for?
 * Written 2026-09-27 against testing 3.2.3.0 after a hand walk-through in Chrome
 * (release-qa-3.2.3 R26, R44).
 *
 * Coverage before this file: reports.spec.ts, data-export.spec.ts and
 * app-route-census.spec.ts check that report PAGES render and that a generate
 * does not 500 for one happy path. None reads the generated output, so a unit
 * filter that returns the wrong unit's rows passed everything.
 *
 * How a report is generated here is exactly how the UI does it: open the report
 * page, set the dates on the page's own flatpickr, pick the option, press
 * "Generate Printable Version", catch the URL the page hands to window.open, and
 * fetch that URL in the same session. Nothing here composes a ReportPrint URL by
 * hand.
 *
 * Dates: a full page load currently gives every no-future-date picker a maxDate of
 * 9 January (R26, TC-DP-01 below). To test the REPORT rather than that picker bug,
 * genReport() lifts the maxDate before setting dates. TC-DP-01 covers the picker.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

interface Generated { status: number; contentType: string; text: string; url: string }

function ddmmyyyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function openReport(page: Page, type: string, report: string): Promise<void> {
  await page.goto(`${BASE}/Report?type=${type}&report=${report}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#startDate'), `${report} page shows its Start Date picker`).toBeAttached({ timeout: 20_000 });
}

/** Set dates and (optionally) the option whose text matches, press Generate, fetch the result. */
async function genReport(page: Page, opts: { from: Date; to: Date; option?: RegExp }): Promise<Generated> {
  const picked = await page.evaluate(({ from, to, option }) => {
    const setFp = (id: string, v: string) => {
      const el = document.getElementById(id) as (HTMLInputElement & { _flatpickr?: any }) | null;
      if (!el || !el._flatpickr) throw new Error(`#${id} has no flatpickr`);
      el._flatpickr.set('maxDate', null);   // see file header: isolates the report from R26
      el._flatpickr.setDate(v, true, 'd/m/Y');
    };
    setFp('startDate', from);
    setFp('endDate', to);
    if (!option) return 'no option';
    const re = new RegExp(option.source, option.flags);
    const sel = [...document.querySelectorAll('main select')].find(s => [...(s as HTMLSelectElement).options].some(o => re.test(o.text))) as HTMLSelectElement | undefined;
    if (!sel) throw new Error(`no select on the page offers an option matching ${re}`);
    const opt = [...sel.options].find(o => re.test(o.text))!;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.text;
  }, { from: ddmmyyyy(opts.from), to: ddmmyyyy(opts.to), option: opts.option ? { source: opts.option.source, flags: opts.option.flags } : undefined } as never);
  expect(picked, 'the requested option was selected').toBeTruthy();

  await page.evaluate(() => {
    (window as any).__opened = [];
    window.open = ((u?: string | URL) => { (window as any).__opened.push(String(u)); return null; }) as typeof window.open;
  });
  await page.getByRole('button', { name: /Generate Printable Version/i }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__opened.length), {
    timeout: 10_000, message: 'Generate hands a report URL to window.open',
  }).toBeGreaterThan(0);
  return page.evaluate(async () => {
    const url = (window as any).__opened[0] as string;
    const r = await fetch(url);
    const contentType = (r.headers.get('content-type') || '').split(';')[0];
    const text = /pdf/.test(contentType) ? '' : await r.text();
    return { status: r.status, contentType, text, url };
  });
}

/** Distinct values of one CSV column (simple CSV: the export does not quote these columns). */
function column(csv: string, name: string): string[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const i = header.indexOf(name);
  expect(i, `CSV header has a "${name}" column (header: ${lines[0].slice(0, 200)})`).toBeGreaterThanOrEqual(0);
  return lines.slice(1).map(l => l.split(',')[i]);
}

const today = new Date();
const monthAgo = new Date(today.getTime() - 26 * 86400000);   // Export Routine CSV and activity reports cap the range

// OGC-1360: every Export Routine CSV run leaks one DB connection and the pool is
// maxTotal=20 with an infinite wait, so ~20 exports hang the whole instance until a
// webapp restart (testing was down 06:08Z-08:00Z on 2026-09-27). The CSV export
// cases below therefore only run when a person opts in and can restart the server.
// FLIP-WHEN-FIXED: once OGC-1360 is fixed, delete this guard so they run every time.
const LEAKY_EXPORTS_OK = process.env.QA_ALLOW_LEAKY_EXPORTS === '1';
const LEAKY_REASON = 'OGC-1360: Export Routine CSV leaks a DB connection per run; set QA_ALLOW_LEAKY_EXPORTS=1 to run';

test.describe('Routine Reports: output matches the request', () => {
  test('TC-RPTOUT-01: Export Routine CSV for Biochemistry returns a CSV of Biochemistry rows', async ({ page }) => {
    test.skip(!LEAKY_EXPORTS_OK, LEAKY_REASON);
    // Canary for TC-RPTOUT-02/03: proves the page, the option selection and the CSV
    // parsing work on a unit that is not broken.
    await openReport(page, 'routine', 'CISampleRoutineExport');
    const g = await genReport(page, { from: monthAgo, to: today, option: /^Biochemistry$/ });
    expect(g.status, `Biochemistry export answers 200 (${g.url})`).toBe(200);
    const units = column(g.text, 'Lab Unit');
    expect(units.filter(u => u && u !== 'Biochemistry'), 'every row belongs to Biochemistry').toEqual([]);
  });

  test('TC-RPTOUT-02: Export Routine CSV for Hematology does not error', async ({ page }) => {
    test.skip(!LEAKY_EXPORTS_OK, LEAKY_REASON);
    // FLIP-WHEN-FIXED (R44). Observed 2026-09-27: 500 for every date range tried; Molecular
    // Biology the same. The UI opens a tab showing raw {"status":500,...} JSON.
    test.fail();
    await openReport(page, 'routine', 'CISampleRoutineExport');
    const g = await genReport(page, { from: monthAgo, to: today, option: /^Hematology$/ });
    expect(g.status, `Hematology export answers 200 (${g.url})`).toBe(200);
  });

  test('TC-RPTOUT-03: Export Routine CSV for Cytology returns only Cytology rows', async ({ page }) => {
    test.skip(!LEAKY_EXPORTS_OK, LEAKY_REASON);
    // FLIP-WHEN-FIXED (R44). Observed 2026-09-27 for 01-27 Sep: 168 rows, none Cytology
    // (149 Biochemistry, 8 Molecular Biology, 6 Serology-Immunology, 3 Hematology, 2 Pathology).
    test.fail();
    await openReport(page, 'routine', 'CISampleRoutineExport');
    const g = await genReport(page, { from: monthAgo, to: today, option: /^Cytology$/ });
    expect(g.status).toBe(200);
    const units = column(g.text, 'Lab Unit');
    expect(units.filter(u => u && u !== 'Cytology'), 'no row from another unit').toEqual([]);
  });

  test('TC-RPTOUT-04: Activity report by test type returns a PDF', async ({ page }) => {
    // Canary for the activity-report path (R43 tripwire to follow once an environmental
    // order can be seeded by REST again; see coverage-thin doc).
    await openReport(page, 'indicator', 'activityReportByTest');
    const g = await genReport(page, { from: monthAgo, to: today, option: /^Amylase/ });
    expect(g.status, g.url).toBe(200);
    expect(g.contentType).toBe('application/pdf');
  });
});

test.describe('Date pickers on a full page load (R26)', () => {
  test('TC-DP-02: a no-future-date picker has a maxDate after a full load', async ({ page }) => {
    // Canary for TC-DP-01: the picker and its maxDate option exist.
    await openReport(page, 'indicator', 'activityReportByTest');
    const max = await page.evaluate(() => {
      const el = document.getElementById('startDate') as any;
      return el?._flatpickr?.config?.maxDate ? String(el._flatpickr.config.maxDate) : null;
    });
    expect(max, 'startDate carries a maxDate').toBeTruthy();
  });

  test('TC-DP-01: after a full load the picker maxDate is today, not 9 January', async ({ page }) => {
    // FLIP-WHEN-FIXED (R26). Observed 2026-09-27: maxDate "Fri Jan 09 2026" on a full load of
    // any report page (site date locale fr-FR); in-app navigation to the same URL gives today.
    // Typed dates after 9 Jan are silently clamped.
    test.fail();
    await openReport(page, 'indicator', 'activityReportByTest');
    const max = await page.evaluate(() => {
      const el = document.getElementById('startDate') as any;
      const d = el._flatpickr.config.maxDate as Date;
      return d.toDateString();
    });
    expect(max).toBe(new Date().toDateString());
  });
});
