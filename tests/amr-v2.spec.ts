import { test, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * AMR / Microbiology V2 (OGC-1383, stack PR #4671..#4734) — first automated pass.
 *
 * Target: pngtest.openelis-global.org (V2 stack build, 3.3.0-SNAPSHOT). Run:
 *   BASE=https://pngtest.openelis-global.org npx playwright test --config=amr.config.ts
 *
 * Fixture: the QA_AMR fixture built on pngtest on 2026-10-19 (see claude/qa-session-2026-10-19-amr-v2-pngtest.md):
 *   tests 380 Bacterial culture (Urines, Bacteria, CULTURE role), 381 Blood culture (Whole Blood, sets),
 *   382 TB culture (Sputum, Mycobacteriology), 383 Xpert MTB/RIF (Sputum, DIRECT), 384 Gram stain (no case);
 *   case for AMR_CASE_ACCESSION (default DEV01260000000000002): 2 urines, BAP-1 growth, ISO-1 E. coli,
 *   AST AMP 32 R / CIP 0.12 S / CRO 2 I against CLSI QA-SYNTH-2026, partial then final release.
 * Test ids can be overridden with AMR_TEST_* env vars when the fixture is rebuilt elsewhere.
 *
 * GUARD tests assert behaviour that works today. TRIPWIRE tests assert the spec and FAIL until the
 * finding is fixed; flip them to guards when they pass 3 of 3.
 *
 * STATUS (2 Nov 2026): run twice on pngtest on 19 Oct 2026: 15 guards pass; 10 tripwires fail as
 * observed; T03 and T06 skip until an open fixture case exists. Every tripwire carries test.fail() and
 * names where the fix is tracked (test ids TC-AMR-Tnn are the AMR-Tnn tripwires the v3.2 FRS cites): the server fixes are OGC-1522 to OGC-1527 (Samuel), the rest are
 * acceptance criteria (AC-Q-nn) of the Microbiology v3.2 FRS, epic OGC-1528. When a tripwire goes red,
 * the fix has landed: delete its test.fail() and it becomes a guard.
 *
 * Not in CI: the fixture exists only on pngtest, which CI does not target (ci-suites.json `excluded`).
 *
 * Dates and times follow the server's time zone by design (Casey, 19 Oct and 2 Nov 2026), and a
 * setting for it in the admin menu is designed. The old AMR-T01 (date of birth a day early in a
 * browser west of UTC, finding A1) asserted the opposite and was removed. Do not re-add it.
 */

const API = '/api/OpenELIS-Global/rest';
const MICRO = `${API}/microbiology`;
const T = {
  bacterialCulture: process.env.AMR_TEST_BACT ?? '380',
  bloodCulture: process.env.AMR_TEST_BC ?? '381',
  tbCulture: process.env.AMR_TEST_TB ?? '382',
  xpert: process.env.AMR_TEST_XPERT ?? '383',
  gram: process.env.AMR_TEST_GRAM ?? '384',
};
const ST = { urines: '1', wholeBlood: '4', sputum: '32' };
const CASE_ACCESSION = process.env.AMR_CASE_ACCESSION ?? 'DEV01260000000000002';

async function csrf(page: Page): Promise<string> {
  await page.goto('/');
  return (await page.evaluate(() => localStorage.getItem('CSRF'))) ?? '';
}

async function getJson(req: APIRequestContext, url: string) {
  // pngtest returns a transient 503 on the first GET of several catalog endpoints; retry like the SPA does.
  for (let i = 0; i < 4; i++) {
    const r = await req.get(url);
    if (r.status() !== 503) return { status: r.status(), body: await r.json().catch(() => null) };
    await new Promise((z) => setTimeout(z, 1000));
  }
  throw new Error(`503 x4 on ${url}`);
}

async function preview(page: Page, token: string, specimens: object[]) {
  const r = await page.request.post(`${MICRO}/order-preview`, {
    headers: { 'X-CSRF-Token': token },
    data: { specimens },
  });
  expect(r.status()).toBe(200);
  return r.json();
}

async function fixtureCase(page: Page) {
  const { body } = await getJson(page.request, `${MICRO}/cases/by-accession?accessionNumber=${CASE_ACCESSION}`);
  const row = body?.rows?.[0];
  test.skip(!row, `fixture case ${CASE_ACCESSION} not found on this instance`);
  return row as { id: string; stage: string; birthDate: number };
}

test.describe('AMR V2 guards', () => {
  test('TC-AMR-G01 worklist route renders and is in the side nav', async ({ page }) => {
    await page.goto('/Microbiology/worklist');
    await expect(page.getByRole('heading', { name: 'Microbiology worklist' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Microbiology worklist' })).toBeVisible();
  });

  test('TC-AMR-G02 UAT scenario endpoint is not exposed', async ({ page }) => {
    const r = await page.request.get(`${MICRO}/uat/scenarios`);
    expect(r.status()).toBe(404);
  });

  test('TC-AMR-G03 admin: Program has Show on Microbiology case and Reporting track; catalog has Opens a case', async ({ page }) => {
    const { body: prog } = await getJson(page.request, `${API}/program/7`);
    expect(prog).toHaveProperty('showOnMicroCase');
    expect((prog.reportingTracks ?? []).map((t: any) => t.value)).toEqual(expect.arrayContaining(['Bacterial', 'TB']));
    const { body: bi } = await getJson(page.request, `${API}/test-catalog/tests/${T.bacterialCulture}/basic-info`);
    expect(bi).toHaveProperty('opensMicrobiologyCase');
    expect(bi).toHaveProperty('microbiologyCaseRole');
  });

  test('TC-AMR-G04 preview: two urines with a bacterial culture open ONE Bacteria case; Gram stain stays in Results (AC-01, AC-103)', async ({ page }) => {
    const token = await csrf(page);
    const p = await preview(page, token, [
      { sampleTypeId: ST.urines, container: '', bodySite: '', testIds: [T.bacterialCulture, T.gram] },
      { sampleTypeId: ST.urines, container: '', bodySite: '', testIds: [T.bacterialCulture] },
    ]);
    expect(p.cases).toHaveLength(1);
    expect(p.cases[0].specimens).toHaveLength(2);
    expect(p.ordinaryTests.map((t: any) => t.testId)).toContain(T.gram);
  });

  test('TC-AMR-G05 preview: TB culture + Xpert on one sputum open one Mycobacteriology case', async ({ page }) => {
    const token = await csrf(page);
    const p = await preview(page, token, [{ sampleTypeId: ST.sputum, container: '', bodySite: '', testIds: [T.tbCulture, T.xpert] }]);
    expect(p.cases).toHaveLength(1);
    expect(p.cases[0].testNames).toHaveLength(2);
  });

  test('TC-AMR-G06 preview: urine culture + sputum TB culture open two cases in their own lab units', async ({ page }) => {
    const token = await csrf(page);
    const p = await preview(page, token, [
      { sampleTypeId: ST.sputum, container: '', bodySite: '', testIds: [T.tbCulture] },
      { sampleTypeId: ST.urines, container: '', bodySite: '', testIds: [T.bacterialCulture] },
    ]);
    expect(p.cases).toHaveLength(2);
    expect(new Set(p.cases.map((c: any) => c.labUnitId)).size).toBe(2);
  });

  test('TC-AMR-G07 preview: wrong blood-culture set assignment warns but does not block (AC-104)', async ({ page }) => {
    const token = await csrf(page);
    const p = await preview(
      page,
      token,
      [1, 1, 1, 2].map((s, i) => ({
        sampleTypeId: ST.wholeBlood,
        container: i % 2 ? 'Anaerobic bottle' : 'Aerobic bottle',
        bodySite: '',
        testIds: [T.bloodCulture],
        cultureSetNumber: s,
      })),
    );
    const codes = p.cases[0].setWarnings.map((w: any) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['REPEATED_CONTAINER', 'SINGLE_BOTTLE']));
  });

  test('TC-AMR-G08 final-released case refuses writes with 409 MICROBIOLOGY_CASE_LOCKED (AC-45)', async ({ page }) => {
    const c = await fixtureCase(page);
    test.skip(c.stage !== 'FINAL_RELEASED', 'fixture case is not final-released');
    const token = await csrf(page);
    const r1 = await page.request.post(`${MICRO}/cases/${c.id}/notes`, {
      headers: { 'X-CSRF-Token': token },
      data: { text: 'QA lock probe', noteType: 'INTERNAL' },
    });
    expect(r1.status()).toBe(409);
    expect(await r1.text()).toContain('MICROBIOLOGY_CASE_LOCKED');
    const r2 = await page.request.put(`${MICRO}/cases/${c.id}/order-detail`, {
      headers: { 'X-CSRF-Token': token },
      data: { culturePurpose: 'DIAGNOSTIC', patientOrigin: 'INPATIENT', clinicalHistory: 'QA lock probe' },
    });
    expect(r2.status()).toBe(409);
  });

  test('TC-AMR-G09 breakpoint interpretation on the fixture case: AMP R, CIP S, CRO R (amended retest, MIC 8)', async ({ page }) => {
    const c = await fixtureCase(page);
    const { body } = await getJson(page.request, `${MICRO}/cases/${c.id}/report`);
    const sus = body.isolates.flatMap((i: any) => i.susceptibilities);
    const by = Object.fromEntries(sus.map((s: any) => [s.agent, s.interpretation]));
    // The fixture case was amended in sweep 2: CRO retested at 8 and selected for report, so CRO now reads R
    // (the original run had CRO 2 = I). Reset this to INTERMEDIATE if the fixture is rebuilt.
    expect(by).toMatchObject({ Ampicillin: 'RESISTANT', Ciprofloxacin: 'SUSCEPTIBLE', Ceftriaxone: 'RESISTANT' });
  });

  test('TC-AMR-G10 culture media never consume stock: fixture lot still at its received quantity', async ({ page }) => {
    const { body: lots } = await getJson(page.request, `${API}/inventory/lots?itemId=1`);
    const lot = (lots ?? []).find((l: any) => l.lotNumber === 'QABAP-LOT1');
    test.skip(!lot, 'fixture lot QABAP-LOT1 not found');
    expect(lot.currentQuantity).toBe(lot.initialQuantity);
  });

  test('TC-AMR-G11 report versions read Partial then Final in the case UI (AC-29, version list)', async ({ page }) => {
    const c = await fixtureCase(page);
    await page.goto(`/Microbiology/cases/${c.id}?scope=REPORT`);
    await expect.poll(async () => page.locator('#micro-report-version option').count(), { timeout: 20_000 }).toBeGreaterThan(1);
    const opts = await page.locator('#micro-report-version option').allTextContents();
    expect(opts.join('|')).toMatch(/1 · Partial/);
    expect(opts.join('|')).toMatch(/2 · Final/);
  });
});

test.describe('AMR V2 tripwires (fail until fixed)', () => {
  test('TC-AMR-T02 TRIPWIRE the word "Preliminary" never reaches the case UI (AC-29)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: the timeline reads "Preliminary Report Released" (A2, A28). v3.2 AC-Q-10, OGC-1528.
    test.fail();
    const c = await fixtureCase(page);
    // The fixture case is final now, so the header no longer says it; the timeline still does
    // ("Preliminary Report Released"). Wait for the timeline to load before asserting.
    await page.goto(`/Microbiology/cases/${c.id}?scope=HISTORY`);
    await expect(page.getByText(/Work stage:/)).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toContainText(/Final Report Released|Final report released/i, { timeout: 20_000 });
    await expect(page.locator('main')).not.toContainText(/Preliminary|Interim/);
  });

  test('TC-AMR-T03 TRIPWIRE blocked final release answers 4xx with a reason, not 500', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: POST release/final answers 500 (A3), 3 of 3. OGC-1522.
    test.fail();
    const token = await csrf(page);
    const { body } = await getJson(page.request, `${MICRO}/bench`); // bench rows carry stage + origin
    const target = (body?.rows ?? []).find((r: any) => r.stage === 'PRELIM_RELEASED' && !r.origin);
    test.skip(!target, 'no partially released case missing required clinical information');
    const r = await page.request.post(`${MICRO}/cases/${target.id}/release/final`, {
      headers: { 'X-CSRF-Token': token },
      data: { confirmedIncomingIds: [] },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('TC-AMR-T04 TRIPWIRE time to positivity reads "N day(s) N hours N minutes" (AC-95)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: BC-1A shows "0d 0h 0m" (A8). v3.2 R-CULT-4, OGC-1528.
    test.fail();
    // Uses the blood culture fixture (BC-1A positive); the urine case has no positive bottle.
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc, 'blood culture fixture missing');
    await page.goto(`/Microbiology/cases/${bc.id}?scope=CULTURE`);
    const block = page.locator('main');
    await expect(block).toContainText('Time to positivity', { timeout: 20_000 });
    // Read the value printed right after the label (BC-1A shows e.g. "0d 0h 0m" today).
    let ttp = '';
    await expect.poll(async () => {
      const t = (await block.textContent()) ?? '';
      ttp = t.match(/Time to positivity[^0-9]{0,40}(\d+d \d+h \d+m|\d+ (?:days?|hours?|minutes?)(?: \d+ (?:hours?|minutes?))*)/)?.[1] ?? '';
      return ttp;
    }, { timeout: 20_000 }).not.toBe('');
    expect(ttp).not.toMatch(/^\d+d \d+h \d+m$/);
  });

  test('TC-AMR-T05 TRIPWIRE AST table never shows the literal "None" for empty values', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: the superseded CRO row shows "None" under Selected for report (A9). v3.2 R-AST-2, OGC-1528.
    test.fail();
    const c = await fixtureCase(page);
    await page.goto(`/Microbiology/cases/${c.id}?scope=AST`);
    await expect(page.getByText('Antimicrobial agent').first()).toBeVisible(); // two runs after the amendment retest
    const cells = await page.locator('table td').allTextContents();
    expect(cells.map((t) => t.trim())).not.toContain('None');
  });

  test('TC-AMR-T06 TRIPWIRE isolate ID method list excludes HIV / syphilis kit methods', async ({ page }) => {
    // FLIP-WHEN-FIXED. Not yet run: needs an open case with an unidentified isolate (A5). v3.2 AC-Q-40, OGC-1528.
    test.fail();
    const c = await fixtureCase(page);
    await page.goto(`/Microbiology/cases/${c.id}?scope=ISOLATES`);
    await page.waitForLoadState('networkidle');
    const identify = page.getByRole('button', { name: /Identify organism|Re-identify/ }).first();
    test.skip((await identify.count()) === 0 || !(await identify.isEnabled()), 'case is locked; needs an open case');
    await identify.click();
    const opts = await page.locator('#isolate-identificationMethod option').allTextContents();
    expect(opts.join('|')).not.toMatch(/HIV_TEST_KIT|SYPHILIS_TEST_KIT|Diane Test/);
  });

  test('TC-AMR-T07 TRIPWIRE bench excludes final-released cases', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: the bench lists the FINAL_RELEASED case (A15). OGC-1525.
    test.fail();
    const { body } = await getJson(page.request, `${MICRO}/bench`);
    const stages = (body?.rows ?? []).map((r: any) => r.stage);
    expect(stages).not.toContain('FINAL_RELEASED');
  });

  test('TC-AMR-T08 TRIPWIRE organism required fields are marked and errors use field labels', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: Initial significance is not marked required (A12). OGC-1527 (server message), v3.2 R-ADM-1.
    test.fail();
    await page.goto('/MasterListsPage/MicrobiologyReference/organisms?edit=new');
    const label = page.locator('label', { hasText: 'Initial significance' });
    await expect(label).toContainText('*');
  });
});

// ---------------------------------------------------------------------------
// Sweep 2 (19 Oct, later): blood culture sets, TB/DST, transfer, related cases, extensions.
// Fixture orders on pngtest: DEV01260000000000003 (4 x Whole Blood, sets 1,1,2,2, bottles BC-1A..BC-2B,
// BC-1A positive), DEV01260000000000004 (Sputum TB case: Xpert + TB culture, MTB ISO-1, DST RIF R / INH R /
// LVX S validated = MDR; Urines case transferred Bacteria -> Mycobacteriology).
// ---------------------------------------------------------------------------
const BC_ACCESSION = process.env.AMR_BC_ACCESSION ?? 'DEV01260000000000003';
const TB_ACCESSION = process.env.AMR_TB_ACCESSION ?? 'DEV01260000000000004';

async function casesFor(page: Page, accession: string) {
  const { body } = await getJson(page.request, `${MICRO}/cases/by-accession?accessionNumber=${accession}`);
  return (body?.rows ?? []) as Array<{ id: string; labUnit: string; specimenType: string; stage: string }>;
}

test.describe('AMR V2 guards, sweep 2', () => {
  test('TC-AMR-G12 inoculation time in the future is refused (AC-95)', async ({ page }) => {
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc, 'blood culture fixture missing');
    const token = await csrf(page);
    const { body: shell } = await getJson(page.request, `${MICRO}/cases/${bc.id}/shell`);
    const r = await page.request.post(`${MICRO}/cases/${bc.id}/cultures`, {
      headers: { 'X-CSRF-Token': token },
      data: {
        sourceSampleItemId: shell.samples[0].sampleItemId, parentId: null, subculturePurpose: 'CLINICAL_DIAGNOSTIC',
        containerIdentifier: 'QA-FUTURE', mediumItemId: 1, lotId: 1, notTracked: false, atmosphereId: '1395',
        temperature: 35, duration: 5, durationUnit: 'DAYS', inoculatedAt: new Date(Date.now() + 3 * 3600e3).toISOString(),
      },
    });
    expect(r.status()).toBe(400);
    expect(await r.text()).toContain('MICROBIOLOGY_CULTURE_INOCULATED_TIME');
  });

  test('TC-AMR-G13 one positive bottle while the others keep incubating (AC-54)', async ({ page }) => {
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc, 'blood culture fixture missing');
    const { body } = await getJson(page.request, `${MICRO}/cases/${bc.id}/cultures`);
    const rows = (body.rows ?? body) as any[];
    expect(rows.filter((r) => r.positiveAt).length).toBe(1);
    expect(rows.filter((r) => !r.outcome).length).toBeGreaterThanOrEqual(3);
  });

  test('TC-AMR-G14 RIF R + INH R (validated) classifies MDR (AC-27)', async ({ page }) => {
    const tb = (await casesFor(page, TB_ACCESSION)).find((c) => c.specimenType === 'Sputum');
    test.skip(!tb, 'TB fixture missing');
    const { body } = await getJson(page.request, `${MICRO}/cases/${tb!.id}/ast`);
    expect(body.dst.classification).toBe('MDR');
  });

  test('TC-AMR-G15 transfer writes a CASE_TRANSFERRED timeline entry (AC-04)', async ({ page }) => {
    const urine = (await casesFor(page, TB_ACCESSION)).find((c) => c.specimenType === 'Urines');
    test.skip(!urine, 'transferred fixture missing');
    expect(urine!.labUnit).toBe('Mycobacteriology');
    const { body } = await getJson(page.request, `${MICRO}/cases/${urine!.id}/timeline`);
    const arr = Array.isArray(body) ? body : body.rows ?? [];
    expect(arr.map((e: any) => e.activityType)).toContain('CASE_TRANSFERRED');
  });
});

test.describe('AMR V2 tripwires, sweep 2 (fail until fixed)', () => {
  test('TC-AMR-T09 TRIPWIRE blood culture case header reads "2 sets, 4 bottles" (AC-63, AC-90)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: the header shows only "Whole Blood"; the shell returns collectedInSets false (A20). OGC-1523, v3.2 AC-Q-14.
    test.fail();
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc, 'blood culture fixture missing');
    await page.goto(`/Microbiology/cases/${bc.id}`);
    await expect(page.locator('main')).toContainText(/2 sets,\s*4 bottles/, { timeout: 20_000 });
  });

  test('TC-AMR-T10 TRIPWIRE extension with reason Other and no note is refused (AC-93)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: reason Other with no note answers 200, 3 of 3 (A23). OGC-1524.
    test.fail();
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc || bc.stage === 'FINAL_RELEASED', 'needs the open blood culture fixture');
    const token = await csrf(page);
    const { body } = await getJson(page.request, `${MICRO}/cases/${bc.id}/cultures`);
    const row = ((body.rows ?? body) as any[]).find((r) => !r.outcome);
    const r = await page.request.post(`${MICRO}/cases/${bc.id}/cultures/${row.id}/extension`, {
      headers: { 'X-CSRF-Token': token },
      data: { extendBy: 1, unit: 'HOURS', reasonId: '1407' }, // 1407 = Other on pngtest
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test('TC-AMR-T11 TRIPWIRE cases from one order list each other as related (AC-03, AC-63)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: "No related cases." on both cases of one order (A22). v3.2 R-LINK-1, OGC-1528.
    test.fail();
    const cases = await casesFor(page, TB_ACCESSION);
    test.skip(cases.length < 2, 'needs the two-case order fixture');
    await page.goto(`/Microbiology/cases/${cases[0].id}`);
    await expect(page.getByRole('heading', { name: 'Related cases' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('main')).not.toContainText('No related cases.');
  });

  test('TC-AMR-T12 TRIPWIRE a multi-sample case offers Split (AC-63)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 19 Oct: no Split action; "Correct sample details" opens Modify Order (A21). v3.2 R-LINK-2, OGC-1528.
    test.fail();
    const [bc] = await casesFor(page, BC_ACCESSION);
    test.skip(!bc, 'blood culture fixture missing');
    await page.goto(`/Microbiology/cases/${bc.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Split/ })).toBeVisible({ timeout: 10_000 });
  });
});
