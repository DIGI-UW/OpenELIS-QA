/**
 * tests/eqa-participant-deep.spec.ts
 *
 * EQA participant lane, deep: this laboratory taking part in an external PT scheme, on the screens
 * a lab uses (My EQA Schemes, My Cycles, Add Order, Results, Validation, This Lab's Follow-Up).
 * Catalogue: eqa-deep.md (TC-EQAPT-*).
 *
 * What a participating lab must do (ISO 15189 7.3.7.3, CLIA 42 CFR 493.801 and 493.823, WHO LQMS
 * ch.10, SLIPTA 8.21), and what each case holds the system to:
 *   - enrol in the scheme with the tests it covers (OGC-1260) (01);
 *   - receive the panel, note its condition, accession each item like a patient sample (02, 03);
 *   - test and validate in the routine pipeline; results reach the submission step without delay
 *     (OGC-1257) (05);
 *   - submit once, before the deadline, and keep what was submitted (OGC-1255) (06, 07, 08, 09, 14, 15, 16);
 *   - read the provider's scores and investigate every unacceptable result against the right
 *     sample and target (OGC-1244) (10, 11, 17);
 *   - the screens speak of schemes, not programs (OGC-1261, English only) (12, 18).
 *
 * Data: scheme "QA-EQA-DEEP Part <stamp>" on Glucose (test 3, reported to 0 decimals), with a
 * cycle-level review. Cycle 1 has two EQA orders (provider sample ids PT-A and PT-B); cycles 2 and
 * 3 have one each (PT-C, PT-D), so each submission case starts from a cycle ready to submit.
 * Nothing is deleted. TC-EQAPT-07 moves cycle 3's deadline into the past in the database (local
 * stack only).
 *
 * Written 2026-10-12 against local develop a4200e2d (images 10-12 06:09 UTC).
 */
import { test, expect } from '@playwright/test';
import { api, ready, db, day, fixtures, myCycle, until, placeEqaOrder, enterResult, validate, asUser, note } from './helpers/eqa-deep';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

type Fx = {
  schemeId: string; scheme2Id: string; schemeName: string; scheme2Name: string; provider: string;
  enrollmentId: string; cycleId: string; test: { name: string; sampleTypeId: string };
  labNo: Record<string, string>; validatedAt: number; cycle2: string; cycle3: string;
};
const { F, save } = fixtures<Fx>('participant');
const GLUCOSE = '3';
const PT = (k: string) => `PT-${k}-${F.S}`;

/** Another round of the same scheme with one panel item, validated: a cycle ready to submit. */
async function readyCycle(page: any, k: string): Promise<string> {
  const r = await api(page, 'POST', '/eqa/cycles/mine', { schemeName: F.schemeName, cycleName: `QA-EQA-DEEP Cycle ${k} ${F.S}`, distributionDate: day(0), submissionDeadline: day(14) });
  expect(r.status, r.text).toBe(201);
  const id = String(r.json.id);
  const labNo = await placeEqaOrder(page, { cycleId: id, enrollmentId: F.enrollmentId, providerSampleId: PT(k), testName: F.test.name, sampleTypeId: F.test.sampleTypeId });
  expect(await enterResult(page, labNo, '7'), `result ${k} saved`).toBe(200);
  expect(await validate(page, labNo), `${k} released`).toBe(200);
  await expect.poll(async () => (await myCycle(page, id)).status, { timeout: 60_000 }).toBe('READY_TO_SUBMIT');
  return id;
}

test.describe('EQA participant lane, deep (TC-EQAPT)', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TC-EQAPT-00 [setup]: two regional schemes on Glucose exist on this instance', async ({ page }) => {
    F.provider = `QA-EQA-DEEP External PT Co ${F.S}`;
    for (const k of ['schemeId', 'scheme2Id'] as const) {
      if (F[k]) continue;
      const name = `QA-EQA-DEEP Part${k === 'scheme2Id' ? '2' : ''} ${F.S}`;
      // The first scheme asks for a cycle-level review, so My Cycles shows Review & submit.
      const r = await api(page, 'POST', '/eqa/programs', { name, provider: F.provider, schemeType: 'REGIONAL_PT', requiresCycleReview: k === 'schemeId' });
      expect([200, 201], `create ${name}: ${r.text}`).toContain(r.status);
      F[k] = String(r.json.id);
      if (k === 'schemeId') F.schemeName = name; else F.scheme2Name = name;
      const t = await api(page, 'PUT', `/eqa/programs/${F[k]}/tests`, { testIds: [Number(GLUCOSE)] });
      expect(t.status, t.text).toBe(200);
    }
    const info = await api(page, 'GET', `/test-catalog/tests/${GLUCOSE}/basic-info`);
    F.test = { name: info.json.name, sampleTypeId: String(info.json.sampleTypeId) };
    // The scheme really is stored: read it back by id and in the list.
    const back = await api(page, 'GET', `/eqa/programs/${F.schemeId}`);
    expect(back.json?.name).toBe(F.schemeName);
    save();
    note('EQAPT-00', { schemes: [F.schemeId, F.scheme2Id], test: F.test });
  });

  test('TC-EQAPT-01: enrolling in a scheme fills in the tests the scheme covers (OGC-1260)', async ({ page }) => {
    await page.goto('/qa/eqa/my-programs', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Enroll in Scheme/i }).click();
    // Wait for the form's lists, then pick: the ordinary way a user does it.
    await expect(page.locator('#enrollment-tests'), 'the Tests field is shown').toBeVisible({ timeout: 30_000 });
    await page.locator('#enrollment-scheme').selectOption(F.schemeName);
    await expect(page.locator('#enrollment-provider')).toHaveValue(F.provider);
    await page.waitForTimeout(2000);
    note('EQAPT-01.field', { shown: (await page.locator('#enrollment-tests').innerText()).slice(0, 120) });
    const post = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rest/eqa/my-programs') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Save Enrollment$/ }).click();
    const res = await post;
    const sent = res.request().postDataJSON();
    note('EQAPT-01.post', { status: res.status(), testIds: sent.testIds });
    expect(res.status(), await res.text()).toBe(201);
    expect((sent.testIds ?? []).map(String), 'the scheme\'s test is in the enrollment').toEqual([GLUCOSE]);
    await expect(page.getByText(/Scheme enrollment created successfully/i)).toBeVisible({ timeout: 15_000 });
    F.enrollmentId = String((await res.json()).id);
    save();
  });

  test('TC-EQAPT-13: picking the scheme before the test list has loaded still fills its tests (OGC-1260) [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, OGC-1260). The scheme picker is live at once; the Tests
    // field appears only when four lists have loaded. A pick made in between is resolved against
    // the still-empty test list (InlineEnrollmentForm.pickScheme filters `tests`), so the
    // enrollment is saved with no tests. On a slow line (every site QA serves) that is the usual
    // case, which is likely what Casey saw on 6 Oct. ALL_TESTS is held back 6 s here to show it.
    test.fail();
    await page.route('**/rest/displayList/ALL_TESTS', async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue(); });
    await page.goto('/qa/eqa/my-programs', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Enroll in Scheme/i }).click();
    await expect(page.locator('#enrollment-scheme').locator(`option[value="${F.scheme2Name}"]`)).toBeAttached({ timeout: 15_000 });
    await page.locator('#enrollment-scheme').selectOption(F.scheme2Name);
    await expect(page.locator('#enrollment-tests')).toBeVisible({ timeout: 30_000 });
    const post = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rest/eqa/my-programs') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Save Enrollment$/ }).click();
    const res = await post;
    const sent = res.request().postDataJSON();
    note('EQAPT-13.post', { status: res.status(), testIds: sent.testIds });
    expect((sent.testIds ?? []).map(String), 'the scheme\'s test is in the enrollment').toEqual([GLUCOSE]);
  });

  test('TC-EQAPT-02: a cycle is opened for the scheme; a damaged panel cannot be received without a note', async ({ page }) => {
    if (!F.cycleId) {
      const r = await api(page, 'POST', '/eqa/cycles/mine', { schemeName: F.schemeName, cycleName: `QA-EQA-DEEP Cycle ${F.S}`, distributionDate: day(0), submissionDeadline: day(14) });
      expect(r.status, r.text).toBe(201);
      F.cycleId = String(r.json.id);
      save();
    }
    const damaged = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/receipt`, { labEnrollmentId: F.enrollmentId, receivedTempC: 22, integrityOk: false });
    expect(damaged.status, `damaged panel without a note: ${damaged.text}`).toBe(422);
    expect((await myCycle(page, F.cycleId)).status, 'nothing was received').toBe('PLANNED');
  });

  test('TC-EQAPT-03: two panel items are received through Add Order and linked to the cycle', async ({ page }) => {
    F.labNo = F.labNo ?? {};
    for (const k of ['A', 'B']) {
      if (F.labNo[k]) continue;
      F.labNo[k] = await placeEqaOrder(page, { cycleId: F.cycleId, enrollmentId: F.enrollmentId, providerSampleId: PT(k), testName: F.test.name, sampleTypeId: F.test.sampleTypeId });
      save();
    }
    const c = await myCycle(page, F.cycleId);
    const linked = (c.samples ?? []).map((x: any) => x.labNo);
    expect(linked, 'both lab numbers are on the cycle').toEqual(expect.arrayContaining([F.labNo.A, F.labNo.B]));
    expect(c.status, 'receipt moves the cycle on').not.toBe('PLANNED');
    const receipt = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/receipt?labEnrollmentId=${F.enrollmentId}`);
    note('EQAPT-03.receipt', receipt.json);
  });

  test('TC-EQAPT-04: Enter Order (v4) offers this lab\'s enrollments as the EQA scheme [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12 in code, checked here). The v4 order form's EQA Scheme list
    // is filled from /rest/eqa/programs (every scheme on the instance, provider-run and in-house)
    // and its value is stored as sample_eqa.eqa_enrollment_id, which is a lab enrollment id. There
    // is no cycle field, so an EQA order placed here never reaches a cycle ("Uncycled EQA orders").
    test.fail();
    await page.goto('/order/clinical/enter', { waitUntil: 'domcontentloaded' });
    const box = page.locator('label[for="isEQASample"]');
    await expect(box).toBeVisible({ timeout: 30_000 });
    await box.click();
    await expect(page.locator('#eqaProgramId')).toBeVisible({ timeout: 15_000 });
    const offered = await page.locator('#eqaProgramId option').evaluateAll((os) => os.map((o: any) => ({ v: o.value, t: o.textContent?.trim() })).filter((o) => o.v));
    const mine = (await api(page, 'GET', '/eqa/my-programs')).json ?? [];
    note('EQAPT-04', { offered: offered.slice(0, 12), myEnrollments: mine.map((m: any) => `${m.id}:${m.programName}`).slice(0, 12) });
    const mineIds = new Set(mine.filter((m: any) => m.isActive !== false).map((m: any) => String(m.id)));
    for (const o of offered) expect(mineIds.has(o.v), `"${o.t}" (value ${o.v}) is one of this lab's enrollments`).toBe(true);
  });

  test('TC-EQAPT-05: once both results are validated the cycle is ready to submit within seconds (OGC-1257)', async ({ page }) => {
    expect(await enterResult(page, F.labNo.A, '6'), 'result A saved').toBe(200);
    expect(await enterResult(page, F.labNo.B, '12'), 'result B saved').toBe(200);
    expect(await validate(page, F.labNo.A), 'A released').toBe(200);
    expect(await validate(page, F.labNo.B), 'B released').toBe(200);
    const t0 = Date.now();
    F.validatedAt = t0; save();
    const status = await until(page, '/eqa/cycles/mine', (j) => {
      const c = (j ?? []).find((x: any) => String(x.id) === F.cycleId);
      return c && /READY_TO_SUBMIT|SUBMITTED/.test(c.status) ? c.status : undefined;
    }, 360_000, 2000);
    const secs = Math.round((Date.now() - t0) / 1000);
    note('EQAPT-05', { status, secondsAfterLastRelease: secs });
    expect(secs, 'Ready to submit follows the last validation (the 5-minute sweep is the fallback, not the path)').toBeLessThan(30);
  });

  test('TC-EQAPT-06: Review & submit double-clicked sends one submission and never a 500 (OGC-1255)', async ({ page }) => {
    const c = await myCycle(page, F.cycleId);
    test.skip(c.status !== 'READY_TO_SUBMIT', `cycle is ${c.status}`);
    await page.goto('/qa/eqa/my-cycles', { waitUntil: 'domcontentloaded' });
    await page.locator('#cycle-bucket-filter').selectOption('all');
    await page.getByTestId(`cycle-row-${F.cycleId}`).click();
    const btn = page.getByTestId(`cycle-expanded-${F.cycleId}`).getByRole('button', { name: /^Review & submit$/ });
    await expect(btn, 'the scheme asks for review, so the button is there').toBeVisible({ timeout: 30_000 });
    const posts: number[] = [];
    page.on('response', (r) => { if (/review-submit$/.test(r.url()) && r.request().method() === 'POST') posts.push(r.status()); });
    await btn.dblclick();
    await page.waitForTimeout(5000);
    note('EQAPT-06.ui', { posts });
    expect(posts.filter((s) => s >= 500), 'no server error').toEqual([]);
    expect(posts.length, 'one request for a double click').toBe(1);
    await expect(page.getByText(/Cycle submitted to provider/i), 'the screen says it went').toBeVisible({ timeout: 15_000 });
    expect((await myCycle(page, F.cycleId)).status).toBe('SUBMITTED');
  });

  test('TC-EQAPT-14: two Review & submit calls at once: one submission, the other refused, no 500 (OGC-1255)', async ({ page }) => {
    if (!F.cycle2) { F.cycle2 = await readyCycle(page, 'C'); save(); }
    const c = await myCycle(page, F.cycle2);
    test.skip(c.status !== 'READY_TO_SUBMIT', `cycle is ${c.status}`);
    const [a, b] = await Promise.all([
      api(page, 'POST', `/eqa/cycles/${F.cycle2}/review-submit`),
      api(page, 'POST', `/eqa/cycles/${F.cycle2}/review-submit`),
    ]);
    note('EQAPT-14', { a: [a.status, a.text.slice(0, 160)], b: [b.status, b.text.slice(0, 160)] });
    expect([a.status, b.status].filter((s) => s >= 500), 'no server error').toEqual([]);
    expect([a.status, b.status].filter((s) => s === 200).length, 'exactly one submission').toBe(1);
    expect((await myCycle(page, F.cycle2)).status).toBe('SUBMITTED');
  });

  test('TC-EQAPT-15: a manual submission needs the provider\'s reference', async ({ page }) => {
    if (!F.cycle3) { F.cycle3 = await readyCycle(page, 'D'); save(); }
    const blank = await api(page, 'POST', `/eqa/cycles/${F.cycle3}/submit-manual?labEnrollmentId=${F.enrollmentId}`, { manualSubmissionReference: '   ' });
    expect(blank.status, `blank reference: ${blank.text}`).toBe(400);
    expect((await myCycle(page, F.cycle3)).status, 'still not submitted').toBe('READY_TO_SUBMIT');
  });

  test('TC-EQAPT-16: Submit by hand is refused while nothing on the cycle is validated', async ({ page }) => {
    // Code review (2026-10-12) suspected submit-manual had no status check; it refuses a cycle with
    // no validated result (400). Submitting part of a panel by hand is still possible: see eqa-deep.md.
    let id = (F as any).cycle4 as string | undefined;
    if (!id) {
      const r = await api(page, 'POST', '/eqa/cycles/mine', { schemeName: F.schemeName, cycleName: `QA-EQA-DEEP Cycle E ${F.S}`, distributionDate: day(0), submissionDeadline: day(14) });
      expect(r.status, r.text).toBe(201);
      id = String(r.json.id);
      await placeEqaOrder(page, { cycleId: id, enrollmentId: F.enrollmentId, providerSampleId: PT('E'), testName: F.test.name, sampleTypeId: F.test.sampleTypeId });
      (F as any).cycle4 = id; save();
    }
    const before = (await myCycle(page, id)).status;
    expect(before, 'no result entered yet').not.toMatch(/READY_TO_SUBMIT|SUBMITTED/);
    const r = await api(page, 'POST', `/eqa/cycles/${id}/submit-manual?labEnrollmentId=${F.enrollmentId}`, { manualSubmissionReference: `QA-EARLY-${F.S}` });
    note('EQAPT-16', { before, status: r.status, body: r.text.slice(0, 160) });
    expect(r.status >= 400 && r.status < 500, `a cycle with nothing validated cannot be submitted (got ${r.status})`).toBe(true);
    expect((await myCycle(page, id)).status, 'still not submitted').toBe(before);
  });

  test('TC-EQAPT-07: a submission after the deadline is refused or marked late [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). CLIA 493.823(c) and every PT scheme: results returned
    // after the closing date score 0. The participant side never checks the round deadline (auto,
    // review and manual submission), and nothing on the participant result records lateness.
    test.skip(db('select 1') === null, 'moves the deadline in the database (local stack only)');
    const c = await myCycle(page, F.cycle3);
    test.skip(c.status !== 'READY_TO_SUBMIT', `cycle is ${c.status}`);
    const id = Number(F.cycle3);
    db(`update clinlims.eqa_cycle set planned_end_date = current_date - 2 where id = ${id}`);
    db(`update clinlims.eqa_round set submission_deadline = current_date - 2 where cycle_id = ${id}`);
    db(`update clinlims.sample_eqa set eqa_deadline = current_date - 2 where cycle_id = ${id}`);
    test.fail();
    const late = await api(page, 'POST', `/eqa/cycles/${F.cycle3}/submit-manual?labEnrollmentId=${F.enrollmentId}`, { manualSubmissionReference: `QA-REF-${F.S}` });
    const rows = db(`select submission_status, coalesce(submitted_at::text,'') from clinlims.eqa_participant_result where cycle_id = ${id}`);
    note('EQAPT-07', { status: late.status, body: late.text.slice(0, 200), rows });
    expect(late.status, 'two days after the deadline the submission is refused').toBeGreaterThanOrEqual(400);
  });

  test('TC-EQAPT-08: submitting a second time is refused cleanly; what was submitted cannot be edited', async ({ page }) => {
    const c = await myCycle(page, F.cycleId);
    if (c.status === 'READY_TO_SUBMIT') {
      const r = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/submit-manual?labEnrollmentId=${F.enrollmentId}`, { manualSubmissionReference: `QA-REF-${F.S}` });
      expect(r.status, r.text).toBe(200);
    }
    expect((await myCycle(page, F.cycleId)).status).toBe('SUBMITTED');
    const again = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/submit-manual?labEnrollmentId=${F.enrollmentId}`, { manualSubmissionReference: `QA-REF2-${F.S}` });
    expect(again.status, `second submission: ${again.text}`).toBe(400);
    const pr = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/participant-results`);
    const rows = pr.json ?? [];
    note('EQAPT-08.rows', rows.map((r: any) => ({ id: r.id, s: r.submissionStatus, v: r.resultValue, code: r.providerSampleCode })));
    expect(rows.length, 'two results on the cycle').toBe(2);
    const edit = await api(page, 'PATCH', `/eqa/participant-results/${rows[0].id}/status`, { status: 'DRAFT' });
    expect(edit.status, `a submitted result back to draft: ${edit.text}`).toBeGreaterThanOrEqual(400);
    expect(edit.status).toBeLessThan(500);
  });

  test('TC-EQAPT-09: score import: a Results user cannot; two samples of one analyte need sample_code', async ({ page, browser }) => {
    const csvNoCode = `analyte_name,performance_status,z_score,target_value\n${F.test.name},ACCEPTABLE,0.1,5.0\n`;
    await asUser(browser, process.env.OE_LABTECH_USER ?? 'qa_labtech', process.env.OE_LABTECH_PASS ?? 'QAlabtech1!', async (p) => {
      const r = await api(p, 'POST', `/eqa/cycles/${F.cycleId}/score-intake/csv`, { csv: csvNoCode, labEnrollmentId: F.enrollmentId });
      note('EQAPT-09.labtech', { status: r.status });
      expect(r.status, 'score import is a QA officer act').toBe(403);
    });
    const r = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/score-intake/csv`, { csv: csvNoCode, labEnrollmentId: F.enrollmentId });
    expect(r.status, `two Glucose samples, no sample_code: ${r.text}`).toBe(400);
    expect((await myCycle(page, F.cycleId)).status, 'nothing scored').toBe('SUBMITTED');
  });

  test('TC-EQAPT-10: scores land on the right sample; the follow-up shows each sample\'s value and target (OGC-1244)', async ({ page }) => {
    const csv = [
      'analyte_name,performance_status,z_score,target_value,sample_code',
      `${F.test.name},QUESTIONABLE,2.4,5.0,${PT('A')}`,
      `${F.test.name},UNACCEPTABLE,-2.8,15.0,${PT('B')}`,
    ].join('\n') + '\n';
    const r = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/score-intake/csv`, { csv, labEnrollmentId: F.enrollmentId });
    note('EQAPT-10.import', { status: r.status, body: r.json });
    expect(r.status, r.text).toBe(200);
    expect(r.json.scored).toBe(2);
    await expect.poll(async () => (await myCycle(page, F.cycleId)).status, { timeout: 30_000 }).toBe('SCORED');
    const fu = await api(page, 'GET', '/eqa/followups');
    const row = (fu.json ?? []).find((x: any) => String(x.cycleId) === F.cycleId);
    note('EQAPT-10.followup', row ?? null);
    expect(row, 'the cycle is in This Lab\'s Follow-Up').toBeTruthy();
    const bySample = Object.fromEntries((row.results ?? []).map((x: any) => [x.sampleCode, x]));
    expect(Number(bySample[PT('A')]?.reported), 'sample A: what this lab reported').toBeCloseTo(6, 3);
    expect(Number(bySample[PT('A')]?.target), 'sample A: its own target').toBeCloseTo(5.0, 3);
    expect(Number(bySample[PT('B')]?.reported), 'sample B: what this lab reported').toBeCloseTo(12.0, 3);
    expect(Number(bySample[PT('B')]?.target), 'sample B: its own target').toBeCloseTo(15.0, 3);
    // The screen: This Lab's Follow-Up shows the unacceptable sample with its value and target.
    await page.goto('/qa/eqa/follow-up-queue', { waitUntil: 'domcontentloaded' });
    const tr = page.getByRole('row').filter({ hasText: `QA-EQA-DEEP Cycle ${F.S}` }).first();
    await expect(tr, 'the cycle is on the queue').toBeVisible({ timeout: 30_000 });
    await tr.getByRole('button', { name: /^Triage$/ }).click();
    const panel = page.getByTestId(`triage-${row.id}`);
    await expect(panel, 'the triage panel opens').toBeVisible({ timeout: 15_000 });
    const panelText = (await panel.innerText()).replace(/\s+/g, ' ');
    note('EQAPT-10.screen', panelText.slice(0, 500));
    expect(panelText, 'sample B is named').toContain(PT('B'));
    expect(panelText, 'with what this lab reported').toMatch(/\b12(\.0+)?\b/);
    expect(panelText, 'and its own target').toMatch(/\b15(\.0+)?\b/);
  });

  test('TC-EQAPT-11: |z| under 3 is triaged by a person, not escalated on its own', async ({ page }) => {
    // External unacceptable with |z| <= 3 and every questionable are queued for a human; only
    // |z| > 3 (or no z) opens an NCE by itself (EqaScoreNceServiceImpl.tierFor).
    const nce = db(`select count(*) from clinlims.nc_event where trigger_source_type ilike 'EQA%' and trigger_source_id in (select id::text from clinlims.eqa_participant_result where cycle_id = ${Number(F.cycleId)})`);
    note('EQAPT-11.nce', { nce });
    if (nce !== null && /^\d+$/.test(nce)) expect(nce, 'no NCE opened by itself for |z| <= 3').toBe('0');
    const fu = await api(page, 'GET', '/eqa/followups');
    const row = (fu.json ?? []).find((x: any) => String(x.cycleId) === F.cycleId);
    expect(row?.followupStatus, 'waiting on the lab').toMatch(/OPEN|NOTIFIED/);
  });

  test('TC-EQAPT-17: dismissing an unacceptable result without saying why is refused [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). SLIPTA 8.21, CAP and ISO 15189 7.3.7.3: every unacceptable
    // PT result gets a documented investigation (cause, corrective action). The provider register
    // already refuses Resolve without notes; This Lab's Follow-Up closes one with a category alone.
    test.fail();
    const fu = await api(page, 'GET', '/eqa/followups');
    const row = (fu.json ?? []).find((x: any) => String(x.cycleId) === F.cycleId);
    const noNotes = await api(page, 'POST', `/eqa/followups/${row.id}/dismiss`, { category: 'TRANSCRIPTION_ERROR' });
    note('EQAPT-17.dismissNoNotes', { status: noNotes.status, body: noNotes.text.slice(0, 200) });
    expect(noNotes.status, 'dismissing without notes is refused').toBe(400);
  });

  test('TC-EQAPT-12: the EQA screens say "scheme", not "program" (OGC-1261, English)', async ({ page }) => {
    const leftovers: string[] = [];
    for (const path of ['/qa/eqa/my-programs', '/qa/eqa/my-cycles', '/qa/eqa/management', '/qa/eqa/provider/schemes', '/qa/eqa/follow-up-queue', '/qa/eqa/provider/follow-ups', '/qa/eqa/in-house', '/qa/eqa/analyst-competency']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const text = await page.locator('main').innerText().catch(() => '');
      for (const m of text.match(/[^\n]*\bProgram(me)?s?\b[^\n]*/g) ?? []) leftovers.push(`${path}: ${m.trim().slice(0, 100)}`);
    }
    note('EQAPT-12', leftovers);
    expect(leftovers, 'English wording left over from "Program"').toEqual([]);
  });

  test('TC-EQAPT-18: the Add scheme modal and the server\'s messages say "scheme" too (OGC-1261, English) [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). The screens are relabelled; two places are not: the
    // server's validation messages ("Program name is required", EQAProgramRestController and the
    // enrollment controller) and the Add scheme modal's label, which reads "Enroll in a new
    // external quality assessment scheme" on a form that creates a scheme (eqa.admin.form.subtitle).
    test.fail();
    const leftovers: string[] = [];
    await page.goto('/qa/eqa/management', { waitUntil: 'domcontentloaded' });
    const add = page.getByRole('button', { name: /Add New EQA Scheme|Add scheme|New scheme/i }).first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();
    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    for (const line of (await modal.innerText()).split('\n')) if (/Enroll in a new external quality assessment scheme/i.test(line)) leftovers.push(`Add scheme modal: ${line.trim()}`);
    const e1 = await api(page, 'POST', '/eqa/programs', { schemeType: 'IN_HOUSE' });
    const e2 = await api(page, 'POST', '/eqa/my-programs', { provider: 'x' });
    for (const e of [e1, e2]) if (/program/i.test(e.text)) leftovers.push(`server message: ${e.text.slice(0, 100)}`);
    note('EQAPT-18', leftovers);
    expect(leftovers, 'wording left over').toEqual([]);
  });
});
