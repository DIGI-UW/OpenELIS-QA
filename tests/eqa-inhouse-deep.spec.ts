/**
 * tests/eqa-inhouse-deep.spec.ts
 *
 * In-house blinded samples, deep: a QA officer blinds three Glucose aliquots with sealed targets,
 * deals them to two analysts, and the lab scores each analyst once the panel is unblinded.
 * Catalogue: eqa-deep.md (TC-EQAIH-*).
 *
 * The practice (CLIA competency element 5, ISO 15189 6.2 and 7.3.7.3 alternative assessment,
 * WHO LQMS ch.10, GLI blinded rechecking): blinded samples go through the routine pipeline so the
 * analyst "cannot tell them apart" from patient samples; the target stays sealed until results are
 * final; each result counts for the analyst it was assigned to; a transcription slip is a failure,
 * an equipment fault is not. What each case holds the system to:
 *   - the wizard seals and distributes, and says who must run what (OGC-1245) (01);
 *   - blinded orders look like any other order: no EQA tag on Results, no clinician callback
 *     (OGC-1249) (02, 03); targets hidden from the bench until unblinding (04);
 *   - unblinding scores against the sealed ranges; a sample nobody ran is a missed deadline (05);
 *   - competency is credited to the sealed analyst, not to whoever typed the result (OGC-1245) (06);
 *   - the failure count equals the evidence rows marked Failure after triage (OGC-1252) (07).
 *
 * Data: in-house scheme "QA-EQA-DEEP IH <stamp>" on Glucose (test 3), roster qa_labtech and
 * qa_validator (dealt round-robin: S01 and S03 to qa_labtech, S02 to qa_validator). Results are
 * entered by admin. Nothing deleted.
 *
 * Written 2026-10-12 against local develop a4200e2d (images 10-12 06:09 UTC).
 */
import { test, expect } from '@playwright/test';
import { api, ready, day, fixtures, enterResult, validate, asUser, note } from './helpers/eqa-deep';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

type Fx = {
  schemeId: string; schemeName: string; roster: Array<{ id: string; name: string }>;
  cycleName: string; cycleId: string; panelId: string;
  codes: Record<string, string>; sampleIds: Record<string, string>; analystOf: Record<string, string>; followupId: string;
};
const { F, save } = fixtures<Fx>('inhouse');
const GLUCOSE = '3';
const LABTECH = '113';
const VALIDATOR = '114';
const SAMPLES = [
  { key: 'S01', target: '5.0', low: '4.5', high: '5.5', value: '5' }, // within range: acceptable (Glucose reports 0 decimals)
  { key: 'S02', target: '10.0', low: '9', high: '11', value: '14' }, // outside: unacceptable
  { key: 'S03', target: '7.0', low: '6.3', high: '7.7', value: null }, // nobody runs it: missed
];

test.describe('In-house blinded EQA, deep (TC-EQAIH)', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TC-EQAIH-00 [setup]: an in-house Glucose scheme with two analysts on its roster', async ({ page }) => {
    if (!F.schemeId) {
      F.schemeName = `QA-EQA-DEEP IH ${F.S}`;
      const r = await api(page, 'POST', '/eqa/programs', { name: F.schemeName, schemeType: 'IN_HOUSE', description: 'QA deep in-house lane' });
      expect([200, 201], r.text).toContain(r.status);
      F.schemeId = String(r.json.id);
      expect((await api(page, 'GET', `/eqa/programs/${F.schemeId}`)).json?.name, 'stored').toBe(F.schemeName);
      save();
    }
    expect((await api(page, 'PUT', `/eqa/programs/${F.schemeId}/tests`, { testIds: [Number(GLUCOSE)] })).status).toBe(200);
    const ros = await api(page, 'PUT', `/eqa/programs/${F.schemeId}/analysts`, { systemUserIds: [Number(LABTECH), Number(VALIDATOR)] });
    expect(ros.status, ros.text).toBe(200);
    const got = await api(page, 'GET', `/eqa/programs/${F.schemeId}/analysts`);
    F.roster = (got.json ?? []).map((a: any) => ({ id: String(a.systemUserId), name: a.displayName }));
    expect(F.roster.map((a) => a.id)).toEqual([LABTECH, VALIDATOR]);
    save();
    note('EQAIH-00', F.roster);
  });

  test('TC-EQAIH-01: the wizard seals and distributes three blinded samples and names both analysts (OGC-1245)', async ({ page }) => {
    F.cycleName = `QA-EQA-DEEP IH Cycle ${F.S}`;
    await page.goto('/qa/eqa/in-house/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#inhouse-scheme').locator(`option[value="${F.schemeId}"]`)).toBeAttached({ timeout: 30_000 });
    await page.locator('#inhouse-scheme').selectOption(F.schemeId);
    await page.locator('#inhouse-cycle-name').fill(F.cycleName);
    await page.locator('#inhouse-start').fill(day(0));
    await page.locator('#inhouse-unblind').fill(day(7));
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Samples & prep
    for (let i = 1; i < SAMPLES.length; i++) await page.getByRole('button', { name: /^Add sample$/ }).click();
    for (const s of SAMPLES) {
      await expect(page.locator(`#test-${s.key} option[value="${GLUCOSE}"]`)).toBeAttached({ timeout: 15_000 });
      await page.locator(`#test-${s.key}`).selectOption(GLUCOSE);
      await page.locator(`#target-${s.key}`).fill(s.target);
      await page.locator(`#unit-${s.key}`).fill('mmol/L');
      await page.locator(`#low-${s.key}`).fill(s.low);
      await page.locator(`#high-${s.key}`).fill(s.high);
    }
    await page.locator('#inhouse-lot').fill(`QAIH-${F.S}`);
    await page.locator('#inhouse-aliquots').fill('3');
    await page.locator('label[for="inhouse-homogeneity"]').click();
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Analysts: the roster is already on the scheme; the default deal is round-robin.
    await expect(page.locator('#inhouse-assignment-mode')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Confirm & seal
    const seal = page.waitForResponse((r) => /\/panels\/\d+\/seal-and-distribute$/.test(r.url()), { timeout: 60_000 });
    await page.getByRole('button', { name: /Seal panel & distribute/i }).click();
    const res = await seal;
    const body = await res.json().catch(() => ({}));
    note('EQAIH-01.seal', { status: res.status(), body: JSON.stringify(body).slice(0, 400) });
    expect(res.status(), 'seal and distribute').toBe(200);
    await expect(page.getByText(/Panel sealed and distributed/i)).toBeVisible({ timeout: 30_000 });
    F.panelId = String(body.id);
    F.cycleId = String(body.cycleId ?? body.cycle?.id ?? '');
    save();
    const sealedText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    note('EQAIH-01.screen', sealedText.slice(0, 600));
    for (const a of F.roster) expect(sealedText, `the sealed screen names ${a.name}`).toContain(a.name.replace(/\s+/g, ' '));
    await expect(page.getByText(/No analyst is assigned to any sample/i)).toHaveCount(0);
  });

  test('TC-EQAIH-08: each blinded order carries its blind code as the lab number and its sealed analyst', async ({ page }) => {
    const samples = await api(page, 'GET', `/eqa/panels/${F.panelId}/samples`);
    expect(samples.status).toBe(200);
    F.codes = Object.fromEntries((samples.json ?? []).map((s: any) => [s.sampleCode, s.blindCode]));
    const codeOfSample: Record<string, string> = Object.fromEntries((samples.json ?? []).map((s: any) => [String(s.id), s.sampleCode]));
    F.sampleIds = Object.fromEntries(Object.entries(codeOfSample).map(([id, code]) => [code, id]));
    expect(Object.keys(F.codes).sort()).toEqual(['S01', 'S02', 'S03']);
    if (!F.cycleId) F.cycleId = String((await api(page, 'GET', `/eqa/panels/${F.panelId}`)).json?.cycleId ?? '');
    const pr = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/participant-results`);
    note('EQAIH-08.results', pr.json);
    F.analystOf = {};
    for (const r of pr.json ?? []) {
      const code = codeOfSample[String(r.panelSampleId)];
      if (code) F.analystOf[code] = String(r.assignedAnalystId);
    }
    save();
    expect(F.analystOf, 'round-robin deal: S01 and S03 to qa_labtech, S02 to qa_validator').toEqual({ S01: LABTECH, S02: VALIDATOR, S03: LABTECH });
  });

  test('TC-EQAIH-02: a blinded order shows no EQA tag on Results (OGC-1249) [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). #4457 hides the tag on the legacy Results page; the unified
    // Results page shows "EQA · <priority>" for every EQA row (orderContextSections.tsx) and never
    // reads the eqaInHouse flag the server now sends. A visible EQA tag unblinds the sample.
    test.fail();
    await page.goto('/Results', { waitUntil: 'domcontentloaded' });
    const search = page.locator('main').getByRole('searchbox', { name: /lab number/i });
    await search.fill(F.codes.S01);
    await search.press('Enter');
    const row = page.locator('tr').filter({ hasText: F.codes.S01 }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole('button', { name: /expand/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const shown = await page.locator('main').innerText();
    note('EQAIH-02', { eqaWord: /\bEQA\b/.test(shown), excerpt: (shown.match(/[^\n]*\bEQA\b[^\n]*/) || [''])[0].slice(0, 120) });
    expect(shown, 'the blinded row gives itself away').not.toMatch(/\bEQA\b/);
  });

  test('TC-EQAIH-03: Results offers the sealed analyst for each blinded sample (OGC-1245) [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). #4458 opens the "Analyst (EQA)" picker on the sealed
    // analyst on the legacy Results page. The unified Results page has no analyst control at all
    // (no component uses eqa.result.analyst), so the bench cannot see or correct who ran the
    // sample; the sealed assignment stands whoever actually ran it.
    test.fail();
    await page.goto('/Results', { waitUntil: 'domcontentloaded' });
    const search = page.locator('main').getByRole('searchbox', { name: /lab number/i });
    await search.fill(F.codes.S02);
    await search.press('Enter');
    await expect(page.locator('tr').filter({ hasText: F.codes.S02 }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Analyst \(EQA\)/i).first(), 'an analyst field for the EQA row').toBeVisible({ timeout: 10_000 });
  });

  test('TC-EQAIH-04: the sealed targets are hidden from the bench until the panel is unblinded', async ({ page, browser }) => {
    await asUser(browser, process.env.OE_LABTECH_USER ?? 'qa_labtech', process.env.OE_LABTECH_PASS ?? 'QAlabtech1!', async (p) => {
      const r = await api(p, 'GET', `/eqa/panels/${F.panelId}/samples`);
      note('EQAIH-04', { status: r.status, sample: (r.json ?? [])[0] });
      expect(r.status).toBe(200);
      for (const s of r.json ?? []) {
        expect(s.targetValue ?? null, `${s.sampleCode} target`).toBeNull();
        expect(s.acceptanceRangeLow ?? null, `${s.sampleCode} range`).toBeNull();
      }
      const unblind = await api(p, 'POST', `/eqa/panels/${F.panelId}/unblind`);
      expect(unblind.status, 'the bench cannot unblind').toBe(403);
    });
    const admin = await api(page, 'GET', `/eqa/panels/${F.panelId}/samples`);
    expect((admin.json ?? []).find((s: any) => s.sampleCode === 'S02')?.targetValue, 'the QA officer can see it').toBeTruthy();
  });

  test('TC-EQAIH-05: results entered and validated; unblinding scores S01 acceptable, S02 unacceptable, S03 missed', async ({ page }) => {
    for (const s of SAMPLES.filter((x) => x.value)) {
      expect(await enterResult(page, F.codes[s.key], s.value!), `${s.key} saved`).toBe(200);
      expect(await validate(page, F.codes[s.key]), `${s.key} released`).toBe(200);
    }
    const u = await api(page, 'POST', `/eqa/panels/${F.panelId}/unblind`);
    note('EQAIH-05.unblind', { status: u.status, body: u.text.slice(0, 300) });
    expect(u.status, u.text).toBe(200);
    const pr = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/participant-results`);
    const codeOf = Object.fromEntries(Object.entries(F.sampleIds).map(([code, id]) => [id, code]));
    const by = Object.fromEntries((pr.json ?? []).map((r: any) => [codeOf[String(r.panelSampleId)], r]));
    note('EQAIH-05.results', Object.fromEntries(Object.entries(by).map(([k, r]: any) => [k, { v: r.resultValue, s: r.submissionStatus, p: r.performanceStatus, a: r.assignedAnalystId }])));
    expect(by.S01?.performanceStatus).toBe('ACCEPTABLE');
    expect(by.S02?.performanceStatus).toBe('UNACCEPTABLE');
    expect(by.S03?.submissionStatus, 'nobody ran S03').toBe('MISSED_DEADLINE');
  });

  test('TC-EQAIH-06: competency credits each result to its sealed analyst, not to admin who typed it (OGC-1245)', async ({ page }) => {
    const c = await api(page, 'GET', '/eqa/analyst-competency');
    expect(c.status).toBe(200);
    const mine = (a: any) => (a.history ?? []).filter((h: any) => String(h.cycleId) === F.cycleId);
    const byId = Object.fromEntries((c.json.analysts ?? []).map((a: any) => [String(a.analystId), a]));
    const lt = mine(byId[LABTECH] ?? {}); const va = mine(byId[VALIDATOR] ?? {}); const ad = mine(byId['1'] ?? {});
    note('EQAIH-06', { labtech: lt, validator: va, admin: ad });
    expect(va.some((h: any) => /UNACCEPTABLE/.test(`${h.eventType} ${h.outcome}`)), 'S02 failure is qa_validator\'s').toBe(true);
    expect(lt.some((h: any) => /MISSED/.test(`${h.eventType} ${h.outcome}`)), 'S03 missed deadline is qa_labtech\'s').toBe(true);
    expect(ad.length, 'nothing from this cycle is credited to admin').toBe(0);
  });

  test('TC-EQAIH-07: after a transcription dismissal the failure count equals the rows marked Failure (OGC-1252)', async ({ page }) => {
    const fu = await api(page, 'GET', '/eqa/followups');
    const row = (fu.json ?? []).find((x: any) => String(x.cycleId) === F.cycleId);
    note('EQAIH-07.followup', row ?? null);
    expect(row, 'the in-house unacceptable result is queued for triage').toBeTruthy();
    F.followupId = String(row.id); save();
    const d = await api(page, 'POST', `/eqa/followups/${F.followupId}/dismiss`, { category: 'TRANSCRIPTION_ERROR', notes: 'QA: 14 typed for 10.4; analyst retrained on result entry' });
    expect(d.status, d.text).toBe(200);
    const c = await api(page, 'GET', '/eqa/analyst-competency');
    for (const a of c.json.analysts ?? []) {
      const flagged = (a.history ?? []).filter((h: any) => h.failure).length;
      expect(flagged, `${a.analystName}: rows marked Failure vs the failure count`).toBe(a.failureCount);
    }
    const va = (c.json.analysts ?? []).find((a: any) => String(a.analystId) === VALIDATOR);
    const mine = (va?.history ?? []).filter((h: any) => String(h.cycleId) === F.cycleId);
    note('EQAIH-07.validator', mine);
    expect(mine.filter((h: any) => h.failure).length, 'S02 counts once for qa_validator: a transcription slip is a failure').toBe(1);
    // The screen: the same numbers on Analyst Competency.
    await page.goto('/qa/eqa/analyst-competency', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(va.analystName).first()).toBeVisible({ timeout: 30_000 });
  });
});
