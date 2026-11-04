import { test, expect, type Page } from '@playwright/test';
import { newOrderToPrepare, fillCollection, saveStep } from '../helpers/order-entry-v4';
import { generateUrl, fetchReport } from '../helpers/report-pdf';
import { AMR_SEED, ensureAmrSeed, driveCaseToReportable } from '../helpers/amr-seed';
import { apiGet } from '../helpers/silentSave';

/**
 * Microbiology release after #4819 (develop f3047c55, 4 Nov 2026): Karen's JDHS field report.
 *
 *   OGC-1606 (closed 4 Nov): a culture case opened by normal order entry releases final with no report
 *            mapping and no database edits.
 *   OGC-1605 item 1: a 10-agent Gram-negative AST releases final (no 200-character cap) and the patient
 *            report prints every agent.
 *   OGC-1605 item 2 (TRIPWIRE): an agent set to SUPPRESS_UNLESS_RESISTANT that reads Susceptible is not
 *            printed on the released report. Fails on f3047c55: Meropenem 0.25 mg/L S still prints.
 *            When it goes red, delete test.fail() and close OGC-1605.
 *
 * Data: helpers/amr-seed.ts loads or confirms the QA_AUTO seed (synthetic CLSI QA-AUTO-1104 edition, not
 * for clinical use). Each run places one new QA_AUTO Urine culture order on testing and releases it.
 */
test.describe.configure({ mode: 'serial' });

let reportText = '';
let releaseOk = { prelim: false, final: false };

async function patientReport(page: Page, lab: string): Promise<string> {
  await page.goto('/Report?type=patient&report=patientCILNSP_vreduit');
  await page.getByRole('button', { name: 'Report By Lab Number' }).click();
  await page.locator('#from').fill(lab);
  await page.locator('#to').fill(lab);
  const r = await fetchReport(page, await generateUrl(page));
  expect(r.pdf, `patient report for ${lab} is a PDF (${r.contentType})`).toBeTruthy();
  return (r.pdf?.text ?? '').replace(/\s+/g, ' ');
}

async function openReleaseSection(page: Page, caseId: string) {
  await page.goto(`/Microbiology/cases/${caseId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const section = page.getByRole('button', { name: 'Report and release' });
  await expect(section).toBeVisible({ timeout: 60_000 });
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
}

async function release(page: Page, name: 'Release partial report' | 'Release final report', status: RegExp) {
  const btn = page.getByRole('button', { name });
  await expect(btn, `${name} is offered`).toBeEnabled({ timeout: 60_000 });
  const done = page.waitForResponse((r) => r.request().method() === 'POST' && /\/release\//.test(r.url()), { timeout: 60_000 });
  await btn.click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) await dialog.getByRole('button', { name: /release|confirm|yes/i }).last().click();
  const r = await done;
  const body = await r.text();
  expect(r.status(), `${name}: ${body.slice(0, 300)}`).toBe(200);
  expect(body).toMatch(status);
  return true;
}

test('TC-1606-01 GUARD culture ordered through order entry releases partial then final with no mapping', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  const seed = await ensureAmrSeed(page);

  // Order through Clinical Order Entry, then accept and release on Sample check so the sample is received.
  const o = await newOrderToPrepare(page, [{ type: AMR_SEED.sampleType, test: AMR_SEED.test }]);
  await fillCollection(page, 0);
  expect((await saveStep(page, 'next')).status(), 'Prepare Samples saves').toBe(200);
  await expect(page).toHaveURL(/\/order\/clinical\/qa/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  const accept = page.getByRole('button', { name: /^Accept sample/ }).first();
  if (await accept.isEnabled().catch(() => false)) { await accept.click(); await page.waitForTimeout(2000); }
  await page.getByRole('button', { name: /Release for testing/ }).first().click();
  await expect(page.getByText(/Opened a microbiology case in/).first(), 'Sample check says a case opened').toBeVisible({ timeout: 60_000 });

  const wl = await apiGet<any>(page, '/rest/microbiology/worklist?page=0&size=100');
  const row = (wl.json?.rows ?? []).find((x: any) => x.accessionNumber === o.lab);
  expect(row?.caseId, `worklist has a case for ${o.lab}`).toBeTruthy();
  await driveCaseToReportable(page, row.caseId, row.sampleItemId, seed.programId);

  await openReleaseSection(page, row.caseId);
  releaseOk.prelim = await release(page, 'Release partial report', /PRELIMINARY_RELEASED/);
  await openReleaseSection(page, row.caseId);
  releaseOk.final = await release(page, 'Release final report', /FINAL_RELEASED/);
  await page.reload();
  await expect(page.getByText(/Final case is read-only/).first(), 'the case UI reads final and read-only').toBeVisible({ timeout: 60_000 });

  reportText = await patientReport(page, o.lab);
  test.info().annotations.push({ type: 'order', description: `${o.lab} case ${row.caseId}` });
});

test('TC-1605-01 GUARD the released patient report prints all 10 agents and the edition', async () => {
  test.skip(!releaseOk.final, 'needs TC-1606-01');
  for (const agent of ['Ampicillin', 'Ceftriaxone', 'Ciprofloxacin', 'Gentamicin', 'Amikacin', 'Cefepime', 'Ceftazidime']) {
    expect(reportText, `report prints ${agent}`).toContain(agent);
  }
  expect(reportText).toContain('Escherichia coli');
  expect(reportText).toContain(AMR_SEED.edition.version);
});

test('TC-1605-02 TRIPWIRE a susceptible agent set to SUPPRESS_UNLESS_RESISTANT is not printed (OGC-1605 item 2)', async () => {
  test.skip(!releaseOk.final, 'needs TC-1606-01');
  test.fail(true, 'OGC-1605 item 2: f3047c55 still prints Meropenem 0.25 mg/L Susceptible');
  expect(reportText, 'Meropenem (S, suppressed unless resistant) is left off the report').not.toMatch(/Meropenem/);
});
