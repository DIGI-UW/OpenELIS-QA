/**
 * tests/validation-review.spec.ts
 *
 * The Validation queue and its review panel — OGC-1027 (signals), OGC-1028
 * (review panel, per-row release and modify), OGC-1029 (guarded bulk release),
 * OGC-1030 (auto-validated rows, stale-page guard), plus the #4301 submenu fix.
 *
 * ============================================================================
 * WHAT THE PRODUCT DOES, MEASURED 2026-09-20 AGAINST
 * https://testing.openelis-global.org (develop)
 * ============================================================================
 *
 * FIVE ROUTES, ONE COMPONENT. /validation, /ResultValidation,
 * /AccessionValidation, /AccessionValidationRange and /ResultValidationByTestDate
 * all render StudyValidation, and SearchForm picks its mode from
 * window.location.pathname. Each route carries its own React key since #4301;
 * without one the router reused the mounted instance, the mode effect never
 * re-ran, and switching submenus changed the URL while leaving the previous
 * submenu's form on screen. VR-02 is the regression cover for that, and it has
 * to navigate IN-APP — a fresh load of each route always worked, which is why
 * the bug survived.
 *
 * THE SEARCH. GET /rest/AccessionValidation?accessionNumber=&date=&unitType=
 * &doRange= answers a ResultValidationForm:
 *   { searchFinished, paging, resultList[], qcFailureList[], testSections[],
 *     accessionNumber, testDate, testSection, ... }
 * Each resultList row carries, among 53 fields:
 *   analysisId, testId, resultId, result, normalRange, resultFlag, resultType,
 *   isAccepted, isRejected, qcStatus, nonconforming, nceOpen, ackPending,
 *   critical, normal, modified, valid, autoValidated, analysisNotes, enteredBy,
 *   analysisLastupdated
 * `analysisLastupdated` is epoch millis and is the stale-page token.
 *
 * THE ACTIONS, all measured, not inferred:
 *   POST AccessionValidation/analysis/{id}/release  body = the row
 *        -> 200 {"analysisId":"158","outcome":"released"}; the row leaves the queue
 *        -> 409 {"error":"notAwaitingValidation"} on a second release
 *        -> 409 {"error":"stale","analysisId","modifiedAt","modifiedBy",
 *                "analysisLastupdated"} when the row's token is not current
 *        -> 404 (empty body) for an analysis id that does not exist
 *   POST AccessionValidation/analysis/{id}/modify   body = the row
 *        corrects a result WITHOUT releasing it; revision advances so the
 *        queue's Modified signal lights. 403 modifyRoleRequired and
 *        400 modificationReasonRequired are config-gated.
 *   POST AccessionValidation/release-clear          body = BulkReleaseRequest
 *        -> 403 {"error":"bulkReleaseDisabled"} when ALLOW_BULK_RELEASE_CLEAR is off
 *        -> 400 {"error":"noRows"} for an empty list
 *        -> 200 {released:[], skipped:[{analysisId, reason}]}
 *   POST AccessionValidation/qc-acknowledgment {accessionNumber, justification}
 *        -> 204
 *   GET  AccessionValidation/auto-validated?accessionNumber= -> 200 []
 *
 * THE CLEAR LANE (ValidationSignals.isClear, the rule the bulk release is
 * guarded by): a known reference range AND normal AND qcStatus === "PASS" AND
 * not nceOpen AND not modified AND not critical AND not nonconforming AND not
 * ackPending. Fail-safe by design: QC that was never evaluated is "UNKNOWN",
 * and UNKNOWN is not clear. On an instance with no QC data NOTHING is ever
 * clear, so VR-11 asserts the half that is always assertable and is the half
 * that matters — that a row the server does not derive as Clear is SKIPPED and
 * never released — and reports the row's actual signals so a reader can see why.
 *
 * ============================================================================
 * E-SIGNATURE IS NOT COVERED HERE
 * ============================================================================
 * The page's release ceremony can be gated by E-Sign when the site turns it on.
 * That has its own cover in tests/electronic-signature.spec.ts and the three
 * docs specs; duplicating it here would mean two suites disagreeing about the
 * same ceremony. The QC-failure acknowledgment, which is a plain API call and
 * belongs to this page, IS covered (VR-12).
 *
 * ============================================================================
 * SUBJECTS
 * ============================================================================
 * Unlike the referral suite, this one can make its own: an order through the
 * legacy lane plus a result entry puts an analysis into TechnicalAcceptance,
 * which is exactly what the validation queue serves. Each case that consumes a
 * subject seeds its own, because release is destructive — a shared one would
 * make the case order load-bearing.
 *
 * COST: a full pass creates eight orders and eight patients on the target, and
 * releases four analyses. That is deliberate on an instance that exists to be
 * tested, and it is why the file takes about six minutes. If it ever points at
 * something that is not a test instance, this is the paragraph that says why it
 * must not.
 */
import { test, expect, Page } from '@playwright/test';
import { BASE, apiCall, createLegacyOrder, enterResultsForLabNumber } from './chains/_common';

const REST = '/api/OpenELIS-Global/rest';

/** One row of the validation queue, as the server serves it. */
interface ValidationRow extends Record<string, unknown> {
  analysisId?: string;
  testId?: string;
  resultId?: string;
  result?: string;
  normalRange?: string;
  qcStatus?: string;
  analysisLastupdated?: string;
  nonconforming?: boolean;
  nceOpen?: boolean;
  ackPending?: boolean;
  critical?: boolean;
  normal?: boolean;
  modified?: boolean;
  autoValidated?: boolean;
}

interface ValidationForm {
  searchFinished?: boolean;
  resultList?: ValidationRow[];
  qcFailureList?: unknown[];
  testSections?: Array<{ id?: string; value?: string }>;
}

/** The queue as the page itself reads it. doRange=false is the by-order lane. */
async function queueFor(page: Page, labNo: string): Promise<{ status: number; form: ValidationForm }> {
  const g = await apiCall<ValidationForm>(
    page, `${REST}/AccessionValidation?accessionNumber=${encodeURIComponent(labNo)}&doRange=false`);
  return { status: g.status, form: (g.body as ValidationForm) || {} };
}

/**
 * Seed one accession whose analysis is awaiting validation: create the order,
 * enter a result, and confirm the queue serves it. Returns the queue row, so a
 * case never has to guess at an analysis id.
 *
 * `value` decides which lane the row lands in: the default is deliberately far
 * outside every reference range on this build, so the row is NOT normal and the
 * Clear lane cannot claim it.
 */
async function seedAwaitingRow(
  page: Page,
  value = '7',
): Promise<{ labNo: string; row: ValidationRow } | null> {
  const order = await createLegacyOrder(page, { log: (m) => console.log('[validation-review] ' + m) });
  if (!order) return null;
  const entry = await enterResultsForLabNumber(page, order.labNo, { defaultNumeric: value });
  if (!entry.ok) {
    console.log('[validation-review] result entry failed: ' + entry.reason);
    return null;
  }
  const { form } = await queueFor(page, order.labNo);
  const row = (form.resultList || [])[0];
  if (!row) return null;
  return { labNo: order.labNo, row };
}

/** Everything the Clear lane looks at, in one line, so a skip reason is readable. */
function signalsOf(row: ValidationRow): string {
  return `normalRange="${row.normalRange ?? ''}" normal=${row.normal} qcStatus=${row.qcStatus} `
    + `nceOpen=${row.nceOpen} modified=${row.modified} critical=${row.critical} `
    + `nonconforming=${row.nonconforming} ackPending=${row.ackPending}`;
}

test.describe('Validation queue and review panel', () => {
  test.describe.configure({ mode: 'serial' });

  test('VR-00 [canary]: the queue serves a ResultValidationForm whose rows carry every field the later cases read', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'could not put an analysis into the validation queue — every case below is meaningless until this works').toBeTruthy();

    const { form } = await queueFor(page, seeded!.labNo);
    expect(form.searchFinished, 'searchFinished false on a search that found a sample').toBe(true);
    expect(Array.isArray(form.resultList), 'resultList is not an array').toBe(true);
    expect(Array.isArray(form.qcFailureList), 'qcFailureList is not an array').toBe(true);

    const row = seeded!.row;
    // Named one by one rather than as a count: a drifted field name is the exact
    // failure this canary exists to catch, and a count would not say which.
    for (const field of ['analysisId', 'testId', 'result', 'normalRange', 'qcStatus',
      'analysisLastupdated', 'nonconforming', 'nceOpen', 'ackPending', 'critical',
      'normal', 'modified', 'autoValidated']) {
      expect(Object.prototype.hasOwnProperty.call(row, field),
        `queue row is missing "${field}"; keys served were [${Object.keys(row).join(',')}]`).toBe(true);
    }
    expect(String(row.analysisLastupdated ?? ''),
      'analysisLastupdated is the stale-page token and must be epoch millis').toMatch(/^[0-9]{10,}$/);
  });

  test('VR-01: each validation submenu, loaded fresh, renders its own search form', async ({ page }) => {
    test.setTimeout(240_000);
    // route -> the control that ONLY that submenu shows.
    const lanes: Array<{ route: string; expect: string; locator: string }> = [
      { route: '/ResultValidation', expect: 'Select Test Unit', locator: '#unitType' },
      { route: '/AccessionValidation', expect: 'Enter Accession Number', locator: '#accessionNumber' },
      { route: '/AccessionValidationRange', expect: 'Load Next 99 Records Starting at Lab Number', locator: '#accessionNumber' },
      { route: '/ResultValidationByTestDate', expect: 'Enter Test Date', locator: 'input' },
    ];
    for (const lane of lanes) {
      await page.goto(lane.route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#root > *', { timeout: 30_000 });
      await page.waitForTimeout(6000);
      await expect(page.locator(lane.locator).first(),
        `${lane.route} did not render ${lane.locator}`).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(lane.expect, { exact: false }).first(),
        `${lane.route} should label its search "${lane.expect}"`).toBeVisible({ timeout: 20_000 });
    }
  });

  test('VR-02: switching submenu without a page load renders the new submenu, not the previous one (#4301)', async ({ page }) => {
    test.setTimeout(240_000);
    // The bug was invisible on a fresh load and only appeared on an in-app
    // navigation, so this case must NOT call page.goto for the second route.
    await page.goto('/ResultValidationByTestDate', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root > *', { timeout: 30_000 });
    await page.waitForTimeout(6000);
    await expect(page.getByText('Enter Test Date', { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    const link = page.locator('a[href="/AccessionValidation"]').first();
    const reachable = await link.count();
    expect(reachable,
      'no in-app link to /AccessionValidation in the rendered navigation, so the #4301 regression '
      + 'cannot be exercised; a fresh load of the route always worked and proves nothing').toBeGreaterThan(0);

    await link.click();
    await page.waitForTimeout(6000);
    expect(page.url(), 'the click did not change the route').toContain('/AccessionValidation');
    await expect(page.getByText('Enter Accession Number', { exact: false }).first(),
      'the URL changed to /AccessionValidation but the page still shows the previous submenu — this is #4301')
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Enter Test Date', { exact: false })).toHaveCount(0);
  });

  test('VR-03: a by-order search returns only that sample, and an unknown accession is an empty result, not an error', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const { status, form } = await queueFor(page, seeded!.labNo);
    expect(status).toBe(200);
    const accessions = new Set((form.resultList || []).map(r => String(r.accessionNumber ?? '')));
    expect(Array.from(accessions),
      'the by-order lane served rows from another sample').toEqual([seeded!.labNo]);

    const nothing = await queueFor(page, 'DEV999999999999999999');
    expect(nothing.status, 'an unknown accession should be an empty search, not a server error').toBe(200);
    expect((nothing.form.resultList || []).length).toBe(0);
  });

  test('VR-04: the routine and test-date lanes answer the same envelope', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    // The test unit list is served by the queue itself, so the lane is driven
    // with a real section id rather than a guessed one.
    const seed = await apiCall<ValidationForm>(page, `${REST}/AccessionValidation?doRange=true`);
    const sections = (seed.body as ValidationForm)?.testSections || [];
    expect(sections.length,
      'the queue served no test sections, so the routine lane cannot be driven').toBeGreaterThan(0);

    const unit = await apiCall<ValidationForm>(
      page, `${REST}/AccessionValidation?unitType=${encodeURIComponent(String(sections[0].id))}&doRange=true`);
    expect(unit.status, `routine lane for unit ${sections[0].id} ("${sections[0].value}")`).toBe(200);
    expect(Array.isArray((unit.body as ValidationForm)?.resultList)).toBe(true);

    const today = new Date();
    const dmy = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const byDate = await apiCall<ValidationForm>(page, `${REST}/AccessionValidation?date=${encodeURIComponent(dmy)}&doRange=true`);
    expect(byDate.status, `test-date lane for ${dmy}`).toBe(200);
    expect(Array.isArray((byDate.body as ValidationForm)?.resultList)).toBe(true);
  });

  test('VR-05: releasing an awaiting row reports it released and takes it out of the queue', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const rel = await apiCall<{ analysisId?: string; outcome?: string }>(
      page, `${REST}/AccessionValidation/analysis/${seeded!.row.analysisId}/release`,
      { method: 'POST', body: seeded!.row });
    expect(rel.status, `release answered ${rel.status}: ${JSON.stringify(rel.body).slice(0, 300)}`).toBe(200);
    expect((rel.body as { outcome?: string })?.outcome).toBe('released');

    // PERSIST: the verdict is the queue, not the 200.
    const after = await queueFor(page, seeded!.labNo);
    expect((after.form.resultList || []).map(r => String(r.analysisId)),
      `analysis ${seeded!.row.analysisId} reported released but is still awaiting validation`)
      .not.toContain(String(seeded!.row.analysisId));
  });

  test('VR-06: a second release of the same analysis is refused, not silently repeated', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const first = await apiCall<unknown>(page, `${REST}/AccessionValidation/analysis/${seeded!.row.analysisId}/release`,
      { method: 'POST', body: seeded!.row });
    expect(first.status, 'the first release must succeed for this case to mean anything').toBe(200);

    const again = await apiCall<{ error?: string }>(
      page, `${REST}/AccessionValidation/analysis/${seeded!.row.analysisId}/release`,
      { method: 'POST', body: seeded!.row });
    expect(again.status,
      `a released analysis answered ${again.status} to a second release; a silent 200 here would let two `
      + `validators each believe they released it`).toBe(409);
    expect((again.body as { error?: string })?.error).toBe('notAwaitingValidation');
  });

  test('VR-07: a release from a stale page is refused and names who moved it', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    // A token that cannot be current. The guard reads any mismatch as stale, which
    // is the same state a second validator's save would produce.
    const stale = await apiCall<{ error?: string; modifiedAt?: string; modifiedBy?: string; analysisId?: string }>(
      page, `${REST}/AccessionValidation/analysis/${seeded!.row.analysisId}/release`,
      { method: 'POST', body: { ...seeded!.row, analysisLastupdated: '1' } });

    expect(stale.status,
      `a stale release answered ${stale.status}; anything but 409 means the guard let one validator `
      + `overwrite another's work`).toBe(409);
    const body = (stale.body as { error?: string; modifiedAt?: string; modifiedBy?: string }) || {};
    expect(body.error).toBe('stale');
    expect(String(body.modifiedBy ?? ''),
      'the refusal must name who moved the row, or the validator cannot act on it').not.toBe('');
    expect(String(body.modifiedAt ?? ''),
      'the refusal must say when the row moved').not.toBe('');

    // And the row is untouched: a refused release must not half-apply.
    const after = await queueFor(page, seeded!.labNo);
    expect((after.form.resultList || []).map(r => String(r.analysisId)),
      'the stale release was refused but the row left the queue anyway').toContain(String(seeded!.row.analysisId));
  });

  test('VR-08: releasing an analysis that does not exist answers 404, not 200', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(BASE);
    const missing = await apiCall<unknown>(page, `${REST}/AccessionValidation/analysis/99999999/release`,
      { method: 'POST', body: { analysisId: '99999999' } });
    expect(missing.status,
      `release on a nonexistent analysis answered ${missing.status}`).toBe(404);
  });

  test('VR-09: modify corrects a result without releasing it, and the row stays in the queue', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const corrected = { ...seeded!.row, result: '9.9', note: 'QA: corrected during validation review' };
    const mod = await apiCall<{ error?: string }>(
      page, `${REST}/AccessionValidation/analysis/${seeded!.row.analysisId}/modify`,
      { method: 'POST', body: corrected });

    // 403/400 are the two CONFIGURED refusals, and on an instance that sets them
    // this case has not found a defect. Say which, rather than failing blindly.
    if (mod.status === 403 || mod.status === 400) {
      const why = (mod.body as { error?: string })?.error ?? '';
      expect(['modifyRoleRequired', 'modificationReasonRequired'],
        `modify was refused with an undocumented reason: ${mod.status} ${JSON.stringify(mod.body).slice(0, 200)}`)
        .toContain(why);
      test.info().annotations.push({ type: 'config', description: `modify gated on this instance: ${why}` });
      return;
    }

    expect(mod.status, `modify answered ${mod.status}: ${JSON.stringify(mod.body).slice(0, 300)}`).toBe(200);

    const after = await queueFor(page, seeded!.labNo);
    const still = (after.form.resultList || []).find(r => String(r.analysisId) === String(seeded!.row.analysisId));
    expect(still,
      'modify released the row. It must not: a correction that silently releases skips the validator '
      + 'review the correction was made for').toBeTruthy();
    expect(still!.modified,
      'the corrected row does not carry the Modified signal, so a validator cannot tell it changed').toBe(true);
  });

  test('VR-10: bulk release refuses an empty list, or says bulk release is off', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(BASE);
    const empty = await apiCall<{ error?: string }>(page, `${REST}/AccessionValidation/release-clear`,
      { method: 'POST', body: { accessionNumber: '', rows: [] } });

    const why = (empty.body as { error?: string })?.error ?? '';
    expect([400, 403],
      `release-clear answered ${empty.status} to an empty list: ${JSON.stringify(empty.body).slice(0, 200)}`)
      .toContain(empty.status);
    if (empty.status === 403) {
      expect(why).toBe('bulkReleaseDisabled');
      test.info().annotations.push({ type: 'config', description: 'ALLOW_BULK_RELEASE_CLEAR is off on this instance' });
      return;
    }
    expect(why, 'an empty bulk release must be refused as noRows').toBe('noRows');
  });

  test('VR-11: bulk release never releases a row the server does not derive as Clear', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    // '7' is outside every reference range on this build, so the row is not normal
    // and cannot be Clear however the other signals read.
    const seeded = await seedAwaitingRow(page, '7');
    expect(seeded, 'seeding failed').toBeTruthy();
    console.log(`[validation-review] VR-11 subject signals: ${signalsOf(seeded!.row)}`);

    const bulk = await apiCall<{ released?: string[]; skipped?: Array<{ analysisId?: string; reason?: string }>; error?: string }>(
      page, `${REST}/AccessionValidation/release-clear`,
      { method: 'POST', body: { accessionNumber: seeded!.labNo, doRange: false, rows: [seeded!.row] } });

    if (bulk.status === 403) {
      expect((bulk.body as { error?: string })?.error).toBe('bulkReleaseDisabled');
      test.info().annotations.push({ type: 'config', description: 'ALLOW_BULK_RELEASE_CLEAR is off on this instance' });
      return;
    }
    expect(bulk.status, `release-clear answered ${bulk.status}: ${JSON.stringify(bulk.body).slice(0, 300)}`).toBe(200);

    const body = (bulk.body as { released?: string[]; skipped?: Array<{ analysisId?: string; reason?: string }> }) || {};
    const released = (body.released || []).map(String);
    expect(released,
      `the bulk release released analysis ${seeded!.row.analysisId}, which is NOT Clear `
      + `(${signalsOf(seeded!.row)}). The guard exists precisely to stop this.`)
      .not.toContain(String(seeded!.row.analysisId));

    const skip = (body.skipped || []).find(s => String(s.analysisId) === String(seeded!.row.analysisId));
    expect(skip,
      `analysis ${seeded!.row.analysisId} was neither released nor reported as skipped; a row that `
      + `vanishes from both lists leaves the validator with no account of what happened`).toBeTruthy();
    expect(skip!.reason,
      `skipped for "${skip!.reason}" — expected notClear for a row with ${signalsOf(seeded!.row)}`)
      .toBe('notClear');

    // And it is still there to be worked.
    const after = await queueFor(page, seeded!.labNo);
    expect((after.form.resultList || []).map(r => String(r.analysisId)))
      .toContain(String(seeded!.row.analysisId));
  });

  test('VR-12: a QC-failure acknowledgment is accepted for the batch', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const ack = await apiCall<unknown>(page, `${REST}/AccessionValidation/qc-acknowledgment`,
      { method: 'POST', body: { accessionNumber: seeded!.labNo, justification: 'QA automated check: acknowledging for regression cover' } });
    expect(ack.status,
      `qc-acknowledgment answered ${ack.status}: ${JSON.stringify(ack.body).slice(0, 200)}`).toBe(204);
  });

  test('VR-13: the auto-validated rows endpoint answers an array for an accession', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(BASE);
    const seeded = await seedAwaitingRow(page);
    expect(seeded, 'seeding failed').toBeTruthy();

    const auto = await apiCall<unknown[]>(page,
      `${REST}/AccessionValidation/auto-validated?accessionNumber=${encodeURIComponent(seeded!.labNo)}`);
    expect(auto.status).toBe(200);
    expect(Array.isArray(auto.body),
      `auto-validated answered ${JSON.stringify(auto.body).slice(0, 200)} instead of an array; the page `
      + `renders this straight into a table and a non-array would empty it silently`).toBe(true);
  });
});
