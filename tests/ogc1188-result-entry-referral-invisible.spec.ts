/**
 * tests/ogc1188-result-entry-referral-invisible.spec.ts
 *
 * OGC-1188 — a test referred out from RESULT ENTRY produces a referral that is
 * permanently invisible and permanently unadvanceable.
 *
 * ============================================================================
 * WHAT THE PRODUCT DOES, MEASURED 2026-09-15 AGAINST
 * itechuw/openelis-global-2:develop (product @ 5fe0ecb) AT https://localhost:10443
 * ============================================================================
 *
 * THE UI. On this build every legacy results route — /result, /LogbookResults,
 * /AccessionResults — redirects to `/Results`, the unified worklist
 * (`components/resultPage/unified/UnifiedResults.tsx`, OGC-1020). `/Results?
 * accessionNumber=<labNo>` loads that accession's analyses directly. Expanding a row
 * exposes "Refer this test" (`[data-testid="referral-toggle-<rowKey>"]`), which opens
 * `ReferralAction.tsx`: reference laboratory, reason, and a date that defaults to today.
 * There is deliberately no "test to perform" field — the referred test IS the row's test.
 *
 * THE REQUEST IT ISSUES. Saving the row posts, verbatim from a captured run:
 *
 *   POST /api/OpenELIS-Global/rest/results-entry/analysis/73/result
 *   {"testResult":{ ... "refer":true,"referredOut":true,
 *                   "referralItem":{"referralReasonId":"1","referredInstituteId":"29",
 *                                   "referredSendDate":"14/09/2026","referredTestId":"3"} ...}}
 *   -> 200 {"resultId":"12","analysisStatusId":"15","reflex":[],"calculated":[]}
 *
 * So the save SUCCEEDS and the analysis moves to ReferredOut. Nothing on screen or in
 * the response says anything is wrong. Everything below is about what that wrote.
 *
 * WHAT IT WROTE. `ResultUtil.handleReferrals` builds a `Referral` with
 * `status = ReferralStatus.SENT` — a `@Deprecated` legacy value — and a `ReferralSet`
 * carrying only a `ReferralResult`. It never creates a `ReferralSubcontract`. Read
 * straight out of the database after the run above:
 *
 *   id | status | subcontract_id | analysis_id
 *   12 | SENT   |  (null)        | 73
 *
 * against an Order-Entry referral from the same seed, which carries one:
 *
 *   id | status    | subcontract_id | analysis_id
 *    4 | REQUESTED | 3              | 57
 *
 * TWO CONSEQUENCES, BOTH OBSERVED.
 *
 *  1. INVISIBLE. `ReferenceLabResultsServiceImpl` buckets by status, and SENT is in
 *     none of them:
 *       OUTSTANDING_STATUSES = REQUESTED, RECEIVED, IN_PROGRESS
 *       RETURNED_STATUSES    = COMPLETED
 *       HISTORY_STATUSES     = REJECTED, CANCELLED, COMPLETED
 *     Measured: metrics were {"outstanding":3,"returned":1,"reconciledToday":1,
 *     "rejectedThisWeek":2} before the save and byte-identical after it, and the
 *     accession appeared in none of view=outstanding|returned|history.
 *
 *  2. UNADVANCEABLE. `ReferralServiceImpl.transition()` returns early for any referral
 *     whose subcontract is null, so no lifecycle call can move it. The two ways to try
 *     fail DIFFERENTLY, and both are worth pinning:
 *
 *       POST /rest/referrals/12/dispatch-subcontract  -> HTTP 500
 *            The guard returns, then the controller calls `subcontract.getId()` on the
 *            still-null subcontract. An NPE, surfaced as an opaque 500.
 *       PUT  /rest/reference-lab-results/referrals/12/reject -> HTTP 204
 *            A success response. The referral is still SENT afterwards and
 *            `referral_status_history` holds zero rows for it. Nothing happened and the
 *            API said it did. This is the worse of the two.
 *
 * Net: the row sits in the database looking healthy, appears in no view of the Reference
 * Lab Results dashboard, and no action can rescue it.
 *
 * ============================================================================
 * HOW TO READ THIS FILE — the flip-when-fixed convention
 * ============================================================================
 * Same posture as tests/ogc1192-env-order-visibility.spec.ts and
 * tests/modify-order-field-binding.spec.ts. Every case here asserts the SPEC — what a
 * referral created from Result Entry is supposed to do — so while OGC-1188 is present
 * they are marked `test.fail()` and the suite is GREEN. **A failure here is good news:
 * it means the fix landed.** The correct response to a red flip-when-fixed case is to
 * DELETE the `test.fail()` marker and keep the assertion exactly as it stands, never to
 * weaken what it asserts.
 *
 * RE-1188-01 and RE-1188-06 are NOT marked. They are the canaries, and without them the
 * four tripwires would be uninterpretable:
 *   01 proves the driver works at all — that the UI really referred a test out and the
 *      save really persisted a referral. A broken driver would otherwise turn every
 *      tripwire "green" for the wrong reason, which is the one failure mode a
 *      flip-when-fixed suite cannot tolerate.
 *   06 proves the dashboard and its API are not simply broken for everything, by showing
 *      an ORDER ENTRY referral against the SAME reference lab and the SAME test IS
 *      visible in the same view at the same moment. That contrast is the finding.
 *
 * ============================================================================
 * PRECONDITIONS ARE ASSERTED, NEVER SKIPPED
 * ============================================================================
 * A case that passes because Result Entry failed to load, or because no test was
 * available to refer, is worse than no case at all — it reports "no bug" having looked
 * at nothing. `beforeAll` therefore fails loudly and names the missing thing: no
 * reference lab in REFERRAL_ORGANIZATIONS, no baseline patient, the order not created,
 * the worklist row absent, the refer control absent, the save not issued. Nothing here
 * returns early.
 *
 * TEST DATA. One order per run, requester "QA Seeder", carrying one Glucose analysis
 * that ends up ReferredOut. It cannot be tagged in the referral row itself: the unified
 * UI sends no `referrer`, so `handleReferrals` writes a blank `requester_name` and the
 * `QA_AUTO <TAG>` convention `helpers/referral-seed.ts` relies on is unavailable on this
 * path. The accession is logged on every run.
 */
import { test, expect, Page } from '@playwright/test';
import { readReferralSeed } from '../helpers/referral-seed';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest';
const RESULTS_ROUTE = '/Results';
const DASHBOARD_ROUTE = '/SampleShipment/reference-lab-results';

/** The test ordered, referred, and matched against the Order-Entry control. */
const TEST_ID = '3';
const TEST_NAME = 'Glucose';
/** Sample type id 2 = Serum, the type `helpers/referral-seed.ts` orders test 3 against. */
const SAMPLE_TYPE_ID = '2';
/** The reference lab both halves of the contrast are sent to. Seeded by referral-seed.ts. */
const CONTRAST_LAB = 'QA_AUTO Reference Lab Alpha';

/** `ReferralStatus` values that are actually part of the shipped lifecycle. SENT is not. */
const LIVE_STATUSES = ['DRAFT', 'REQUESTED', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'];

interface Raw { status: number; ct: string; body: string }
interface Metrics {
  outstanding: number;
  returned: number;
  reconciledToday: number;
  rejectedThisWeek: number;
  referralStuckThresholdDays: number;
}
interface DashboardRow { id: string; labNumber?: string; referenceLabName?: string; tests?: string[]; status?: string }
interface ReferralItem { referralId?: string; referralStatus?: string; referredInstituteId?: string; referredInstituteName?: string }

/**
 * Every API read goes through here and every one is CONTENT-TYPE CHECKED. The SPA
 * catch-all answers 200 text/html for any path it does not route, so `res.ok()` alone
 * cannot tell an API response from an HTML page — and the REST base is
 * `/api/OpenELIS-Global/rest/...`, never a bare `/rest/...`.
 */
async function raw(page: Page, method: string, path: string, body?: unknown): Promise<Raw> {
  return page.evaluate(
    async (a: { method: string; path: string; body: string | null }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch(a.path, {
        method: a.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Language': 'en',
          'X-CSRF-Token': csrf,
        },
        body: a.body === null ? undefined : a.body,
      });
      return { status: r.status, ct: r.headers.get('content-type') || '', body: (await r.text()).slice(0, 40_000) };
    },
    { method, path, body: body === undefined ? null : JSON.stringify(body) }
  );
}

/**
 * The two OPTIONAL display lists this order needs. They are optional in the product
 * sense: `SamplePatientEntry` accepts an empty `referringSiteDepartmentId` and an empty
 * `paymentOptionSelection`, and `helpers/referral-seed.ts` has always passed '' when the
 * list comes back empty. They are read through this rather than `getJson` because
 * `GET /displayList/PAYMENT_OPTIONS` was observed answering
 * `400 application/problem+json` on 2026-09-15 while every other list answered 200 — an
 * instance-level quirk that has nothing to do with OGC-1188 and must not take the case
 * down with it. Anything the order genuinely cannot be saved without still goes through
 * `getJson`, which fails loudly.
 */
async function getListOrEmpty(page: Page, path: string): Promise<{ id: string }[]> {
  const res = await raw(page, 'GET', path);
  if (res.status === 200 && /application\/json/.test(res.ct)) {
    try {
      const parsed = JSON.parse(res.body);
      if (Array.isArray(parsed)) return parsed as { id: string }[];
    } catch {
      /* fall through to the log below */
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[OGC-1188] optional list ${path} answered ${res.status} ${res.ct}; ordering without it`);
  return [];
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  const res = await raw(page, 'GET', path);
  expect(
    res.ct,
    `GET ${path} answered ${res.status} ${res.ct}. text/html means the SPA catch-all served it ` +
      `and this endpoint was never reached — check the /api/OpenELIS-Global prefix.`
  ).toContain('application/json');
  return JSON.parse(res.body) as T;
}

const dmy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Create the order the referral will hang off. This is SETUP, not the subject: it uses
 * the Order Entry REST call with `useReferral:false`, so the order carries a plain,
 * un-referred Glucose analysis and the ONLY referral that ever touches it is the one the
 * Result Entry UI makes below. Creating it through the API rather than the order wizard
 * keeps the case about Result Entry.
 */
async function createPlainOrder(page: Page): Promise<string> {
  const gen = await getJson<{ body?: string }>(page, `${REST}/SampleEntryGenerateScanProvider`);
  const labNo = gen.body;
  expect(labNo, `${REST}/SampleEntryGenerateScanProvider returned no accession number`).toBeTruthy();

  const sites = await getJson<{ id: string }[]>(page, `${REST}/displayList/SAMPLE_PATIENT_REFERRING_CLINIC`);
  expect(
    sites.length,
    'no referring clinic (organization type 5) exists on this instance, so no order can be saved. ' +
      'See helpers/data-factory.ensureReferringClinic.'
  ).toBeGreaterThan(0);
  const siteId = String(sites[0].id);
  const depts = await getListOrEmpty(page, `${REST}/departments-for-site?refferingSiteId=${siteId}`);
  const pay = await getListOrEmpty(page, `${REST}/displayList/PAYMENT_OPTIONS`);

  const found = await getJson<{ patientSearchResults?: Record<string, string>[] }>(
    page,
    `${REST}/patient-search-results?lastName=Sebby&firstName=Abby`
  );
  const pt = (found.patientSearchResults || [])[0];
  expect(
    pt,
    'the baseline patient Abby Sebby is not on this instance. data.setup.ts creates it and ' +
      'modules.config.ts runs that setup before this spec; without a patient there is no order ' +
      'to result and nothing here can be exercised.'
  ).toBeTruthy();

  const today = dmy(new Date());
  const res = await raw(page, 'POST', `${REST}/SamplePatientEntry`, {
    rememberSiteAndRequester: false,
    customNotificationLogic: false,
    patientEmailNotificationTestIds: [],
    patientSMSNotificationTestIds: [],
    providerEmailNotificationTestIds: [],
    providerSMSNotificationTestIds: [],
    patientUpdateStatus: 'NO_ACTION',
    useReferral: false,
    referralItems: [],
    sampleXML:
      '<?xml version="1.0" encoding="utf-8"?><samples><sample ' +
      `sampleID='${SAMPLE_TYPE_ID}' date='' time='' collector='' quantity='' uom='' ` +
      `tests='${TEST_ID}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' ` +
      "rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' " +
      "storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' " +
      "gpsCaptureMethod='' collectionMethod='' sampleTemperature='' specimenOrigin='' " +
      "numOrderLabels='1' numSpecimenLabels='1'/></samples>",
    patientProperties: {
      patientUpdateStatus: 'NO_ACTION',
      patientPK: String(pt.patientID ?? pt.patientId),
      nationalId: pt.nationalId || '',
      subjectNumber: pt.subjectNumber || '',
      lastName: pt.lastName || '',
      firstName: pt.firstName || '',
      gender: pt.gender || '',
      birthDateForDisplay: pt.birthdate || pt.dob || '',
      guid: pt.guid || '',
      aka: '', streetAddress: '', city: '', primaryPhone: '', email: '', commune: '',
      education: '', maritialStatus: '', nationality: '', healthDistrict: '', healthRegion: '',
      otherNationality: '', occupation: '', customNotes: '', targetDiseaseProgramme: '',
      photo: '', idDocuments: [], mothersName: '', mothersInitial: '', addressDepartment: '',
      insuranceNumber: '', isMerged: false,
    },
    sampleOrderItems: {
      labNo,
      requestDate: today,
      receivedDateForDisplay: today,
      receivedTime: '08:00',
      nextVisitDate: '',
      priority: 'ROUTINE',
      referringSiteId: siteId,
      referringSiteDepartmentId: depts.length ? String(depts[0].id) : '',
      referringSiteCode: '', referringSiteName: '', referringSiteDepartmentName: '',
      referringSiteList: [], referringSiteDepartmentList: [],
      paymentOptionSelection: pay.length ? String(pay[0].id) : '',
      paymentOptions: [], testLocationCode: '', otherLocationCode: '',
      newRequesterName: '', requesterSampleID: '', referringPatientNumber: '',
      providerId: '', providerPersonId: '',
      // 'QA'/'Seeder', the same pair helpers/referral-seed.ts uses. Not a free-text tag:
      // the provider name is validated and `providerLastName: 'OGC1188'` is rejected with
      // "invalid name format, possibly illegal character" because of the digits.
      providerFirstName: 'QA', providerLastName: 'Seeder',
      providerWorkPhone: '', providerFax: '', providerEmail: '', providersList: [],
      externalOrderNumber: '', orderType: '', orderTypes: [], billingReferenceNumber: '',
      facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '',
      facilityFax: '', program: '', programList: [], priorityList: [],
      testLocationCodeList: [], modified: true, readOnly: false, sampleId: '', isEQASample: false,
    },
  });
  expect(
    res.status,
    `POST ${REST}/SamplePatientEntry -> ${res.status} ${res.body.slice(0, 300)}. The payload is the ` +
      `one helpers/referral-seed.ts uses with useReferral stripped; a non-200 means the order create ` +
      `contract moved, not that OGC-1188 is fixed.`
  ).toBe(200);
  return String(labNo);
}

/** The referral the Result Entry save left on this accession, as the order read reports it. */
async function readReferralItem(page: Page, labNo: string): Promise<ReferralItem | null> {
  const order = await getJson<{ samples?: { referralItems?: ReferralItem[] }[] }>(
    page,
    `${REST}/order/search?labNumber=${labNo}`
  );
  for (const s of order.samples || []) {
    for (const ri of s.referralItems || []) if (ri.referralId) return ri;
  }
  return null;
}

interface Referred {
  labNo: string;
  analysisId: string;
  referralId: string;
  statusAfterSave: string;
  saveStatus: number;
  savePayload: string;
  metricsBefore: Metrics;
  metricsAfter: Metrics;
}

/**
 * DRIVE THE REAL RESULT ENTRY UI. Not a REST call shaped like it — the entire point of
 * OGC-1188 is that this path behaves differently from Order Entry, so a test that posted
 * the Order Entry payload would prove nothing about it.
 */
async function referOutFromResultEntry(page: Page, labNo: string): Promise<Referred> {
  const metricsBefore = await getJson<Metrics>(page, `${REST}/reference-lab-results/metrics`);

  await page.goto(`${BASE}${RESULTS_ROUTE}?accessionNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('#unifiedResultsSearch'),
    `the Result Entry worklist never rendered at ${RESULTS_ROUTE}. Every legacy results route ` +
      `(/result, /LogbookResults, /AccessionResults) redirects here on this build; the SPA ` +
      `catch-all serves 200 text/html for unrouted paths, so a green goto proves nothing. ` +
      `This is the route being gone or UnifiedResults throwing.`
  ).toBeVisible({ timeout: 20_000 });

  const rows = page.locator('table tbody tr');
  await expect(
    rows,
    `Result Entry loaded but shows no analysis for accession ${labNo}, so there is no test to refer ` +
      `out and nothing below would be exercised. The order was created moments ago with one ` +
      `${TEST_NAME} (test id ${TEST_ID}) on sample type ${SAMPLE_TYPE_ID}.`
  ).not.toHaveCount(0, { timeout: 20_000 });
  await expect(
    page.getByText(labNo, { exact: false }).first(),
    `Result Entry drew rows but none of them is accession ${labNo}; the worklist loaded somebody ` +
      `else's work and referring out of it would prove nothing about this order`
  ).toBeVisible({ timeout: 20_000 });

  // Both spellings: Carbon's own class, and the aria-labelled button the unified
  // worklist actually renders on this build (the class alone matched nothing on
  // 2026-09-15 and the case died here with a message about the wrong thing).
  const expander = page
    .locator('button.cds--table-expand__button, button[aria-label*="xpand"]')
    .first();
  await expect(
    expander,
    `the worklist row for ${labNo} has no expand control, so the refer-out form cannot be opened`
  ).toBeVisible();
  await expander.click();

  const toggle = page.locator('[data-testid^="referral-toggle-"]').first();
  await expect(
    toggle,
    `the expanded row for ${labNo} carries no "Refer this test" control ` +
      `([data-testid^="referral-toggle-"], ReferralAction.tsx / OGC-1023 FR-F1). Without it this ` +
      `spec cannot refer anything out from Result Entry and would otherwise report a clean bill.`
  ).toBeVisible({ timeout: 15_000 });
  await toggle.click();

  const org = page.locator('[id^="referral-org-"]').first();
  const reason = page.locator('[id^="referral-reason-"]').first();
  await expect(org, 'the referral form opened without a reference-laboratory select').toBeVisible();
  const labels = await org.locator('option').allInnerTexts();
  expect(
    labels.map((l) => l.trim()),
    `the reference-laboratory select does not offer "${CONTRAST_LAB}". Both halves of the RE-1188-06 ` +
      `contrast must go to the SAME lab, and that lab is created by helpers/referral-seed.ts. ` +
      `Options seen: ${JSON.stringify(labels)}`
  ).toContain(CONTRAST_LAB);
  await org.selectOption({ label: CONTRAST_LAB });
  await reason.selectOption({ index: 1 });

  // The save posts exactly one analysis. Wait for that request rather than for a
  // wall-clock interval, so a save that never fires is a named failure and not a
  // mysteriously empty assertion later.
  const savePromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/results-entry\/analysis\/\d+\/result$/.test(r.url()),
    { timeout: 25_000 }
  );
  const save = page.getByRole('button', { name: /^Save$/ }).first();
  await expect(save, 'the referral draft did not put the row into a saveable state').toBeVisible();
  await save.click();

  // If e-signatures are enabled on this instance the click opens a modal instead of
  // posting, and there is no password here to sign with. Say that plainly rather than
  // timing out on the response with an unrelated message.
  const modal = page.locator('.cds--modal.is-visible');
  const outcome = await Promise.race([
    savePromise.then((r) => ({ kind: 'saved' as const, res: r })),
    modal
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => ({ kind: 'modal' as const, res: null })),
  ]).catch(() => ({ kind: 'nothing' as const, res: null }));

  expect(
    outcome.kind,
    outcome.kind === 'modal'
      ? 'clicking Save opened the e-signature modal. E-signatures are enabled on this instance and ' +
        'this spec has no credential to sign with, so the Result Entry referral was never saved. ' +
        'Disable e-signature for the automation user or extend this helper to sign.'
      : 'clicking Save issued no POST to /rest/results-entry/analysis/{id}/result within 25s'
  ).toBe('saved');

  const res = outcome.res!;
  const analysisId = (res.url().match(/analysis\/(\d+)\/result/) || [])[1] || '';
  const savePayload = (res.request().postData() || '').slice(0, 4000);
  const saveStatus = res.status();
  expect(
    saveStatus,
    `the Result Entry save returned ${saveStatus}. This case is about what a SUCCESSFUL refer-out ` +
      `writes; a failing save is a different defect.`
  ).toBe(200);
  expect(
    savePayload,
    'the Result Entry save did not carry refer:true — the UI did not actually refer the test out, ' +
      'so nothing below is about a referral'
  ).toContain('"refer":true');

  const metricsAfter = await getJson<Metrics>(page, `${REST}/reference-lab-results/metrics`);

  const item = await readReferralItem(page, labNo);
  expect(
    item,
    `the Result Entry save returned 200 for analysis ${analysisId} but ${REST}/order/search?labNumber=` +
      `${labNo} reports no referralItem. No referral was persisted at all, which is a bigger defect ` +
      `than OGC-1188 and makes every case below untestable.`
  ).toBeTruthy();

  return {
    labNo,
    analysisId,
    referralId: String(item!.referralId),
    statusAfterSave: String(item!.referralStatus || ''),
    saveStatus,
    savePayload,
    metricsBefore,
    metricsAfter,
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('OGC-1188 — a referral made at Result Entry must be visible and actionable', () => {
  let ref: Referred;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await browser.newPage();
    try {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 });

      const labs = await getJson<{ id: string; value: string }[]>(page, `${REST}/displayList/REFERRAL_ORGANIZATIONS`);
      expect(
        labs.length,
        'GET /displayList/REFERRAL_ORGANIZATIONS is empty, so no reference lab can be picked at Result ' +
          'Entry and no referral can be created by any screen. helpers/referral-seed.ts creates three; ' +
          'modules.config.ts runs it as the `referral-data` project before this spec.'
      ).toBeGreaterThan(0);

      const labNo = await createPlainOrder(page);
      ref = await referOutFromResultEntry(page, labNo);

      // eslint-disable-next-line no-console
      console.log(
        `\nOGC-1188 fixture: accession ${ref.labNo}, analysis ${ref.analysisId}, ` +
          `referral ${ref.referralId}, status after save "${ref.statusAfterSave}"\n` +
          `  metrics before ${JSON.stringify(ref.metricsBefore)}\n` +
          `  metrics after  ${JSON.stringify(ref.metricsAfter)}\n`
      );
    } finally {
      await page.close();
    }
  });

  /**
   * RE-1188-01 — THE CANARY. Not marked test.fail(), and must never be.
   *
   * Everything else in this file is a flip-when-fixed tripwire, and a tripwire is only
   * readable if the driver behind it is known to work. If the Result Entry UI stopped
   * offering "Refer this test", or the save stopped posting, every tripwire below would
   * report exactly what it reports today and the suite would keep saying "bug still
   * present" long after the page had been replaced. This case is what distinguishes
   * those two worlds.
   */
  test('RE-1188-01: referring a test out at Result Entry saves, and persists a referral on the order', async () => {
    expect(ref.saveStatus, 'the Result Entry save did not return 200').toBe(200);
    expect(
      ref.savePayload,
      `the save payload must carry the referralItem the UI built. Payload was: ${ref.savePayload.slice(0, 400)}`
    ).toContain('"referralItem"');
    expect(
      ref.referralId,
      `no referral id came back from ${REST}/order/search?labNumber=${ref.labNo} after the save`
    ).toMatch(/^\d+$/);
  });

  /**
   * RE-1188-02 — VISIBILITY. The half the ticket is filed on.
   *
   * MEASURED TODAY: the accession appears in none of the three views and the metrics are
   * byte-identical before and after the save, because `handleReferrals` writes the
   * @Deprecated SENT and SENT is in no bucket. The assertion below is the SPEC.
   */
  test('RE-1188-02: the referral appears on the Reference Lab Results dashboard', async ({ page }) => {
    test.fail(); // OGC-1188: SENT is in no bucket, so the referral is in no view and counted in no tile.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 });

    const outstanding = await getJson<DashboardRow[]>(page, `${REST}/reference-lab-results/referrals?view=outstanding`);
    const returned = await getJson<DashboardRow[]>(page, `${REST}/reference-lab-results/referrals?view=returned`);
    const history = await getJson<DashboardRow[]>(page, `${REST}/reference-lab-results/referrals?view=history`);
    const anywhere = [...outstanding, ...returned, ...history].filter((r) => r.labNumber === ref.labNo);

    // Stated in this order on purpose: "it is in SOME view" is the weaker, more durable
    // claim, and reporting that first makes a partial fix legible instead of looking
    // identical to no fix at all.
    expect(
      anywhere.length,
      `referral ${ref.referralId} (accession ${ref.labNo}, status "${ref.statusAfterSave}") appears in ` +
        `NO view of the Reference Lab Results dashboard — not outstanding (${outstanding.length} rows), ` +
        `not returned (${returned.length}), not history (${history.length}). A referral a user just ` +
        `created is unreachable from the only screen that manages referrals.`
    ).toBeGreaterThan(0);

    expect(
      outstanding.some((r) => r.labNumber === ref.labNo),
      `referral ${ref.referralId} is not in the Outstanding view. A freshly referred-out test has not ` +
        `come back yet, so Outstanding is where it belongs.`
    ).toBe(true);

    expect(
      ref.metricsAfter.outstanding,
      `GET ${REST}/reference-lab-results/metrics reported outstanding=${ref.metricsBefore.outstanding} before ` +
        `the Result Entry refer-out and outstanding=${ref.metricsAfter.outstanding} after it. Referring a ` +
        `test out did not move the tile the lab watches.`
    ).toBeGreaterThan(ref.metricsBefore.outstanding);
  });

  /**
   * RE-1188-03 — THE ROOT CAUSE, pinned on its own so a fix is attributable.
   *
   * 02 and 04 are both downstream of this one line. Asserting the written status
   * separately means a fix that changes the bucket lists without retiring SENT, or vice
   * versa, is legible from the test report rather than only from a debugger.
   */
  test('RE-1188-03: the status written is a live lifecycle status, not the deprecated SENT', async () => {
    test.fail(); // OGC-1188: ResultUtil.handleReferrals writes ReferralStatus.SENT, a @Deprecated value.
    expect(
      LIVE_STATUSES,
      `Result Entry wrote referralStatus "${ref.statusAfterSave}" for referral ${ref.referralId}. ` +
        `SENT is @Deprecated and belongs to none of OUTSTANDING_STATUSES / RETURNED_STATUSES / ` +
        `HISTORY_STATUSES, which is the single line that makes this referral invisible. Order Entry ` +
        `writes DRAFT on the same instance.`
    ).toContain(ref.statusAfterSave);
  });

  /**
   * RE-1188-04 — ADVANCEABILITY. The half the ticket text misses, and arguably worse:
   * even a user who knows the referral exists cannot move it anywhere.
   *
   * MEASURED TODAY: HTTP 500. `transition()` returns early on the null subcontract, then
   * `ReferralSubcontractDispatchRestController` calls `subcontract.getId()` on it — an
   * NPE served as an opaque Internal Server Error. The same call against an Order Entry
   * referral in DRAFT returns 200 and moves it to REQUESTED.
   */
  test('RE-1188-04: the referral can be dispatched to the reference lab like any other', async ({ page }) => {
    test.fail(); // OGC-1188: no referral_subcontract row, so dispatch NPEs -> HTTP 500.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 });

    const res = await raw(page, 'POST', `${REST}/referrals/${ref.referralId}/dispatch-subcontract`, {
      handoffDatetime: `${dmy(new Date())} 09:00`,
      notes: 'OGC-1188 regression case',
    });
    expect(
      res.status,
      `POST ${REST}/referrals/${ref.referralId}/dispatch-subcontract -> ${res.status} ` +
        `${res.body.slice(0, 200)}. A referral created at Result Entry must be dispatchable exactly ` +
        `like one created at Order Entry, which answers 200 here. 500 is the NPE on the null ` +
        `subcontract; 400 would mean the transition was refused.`
    ).toBe(200);

    const after = await readReferralItem(page, ref.labNo);
    expect(
      after?.referralStatus,
      `dispatch answered ${res.status} but referral ${ref.referralId} is still ` +
        `"${after?.referralStatus}" on ${REST}/order/search?labNumber=${ref.labNo}`
    ).toBe('REQUESTED');
  });

  /**
   * RE-1188-05 — THE SILENT NO-OP, and the most dangerous shape this bug takes.
   *
   * Reject answers 204 No Content — an unambiguous success — and changes nothing:
   * measured on 2026-09-15, the referral was still SENT afterwards and
   * `referral_status_history` held zero rows for it. A user rejecting a stuck referral is
   * told it worked. Asserting the STATE after the call, not the status code, is the only
   * way to catch that; a case that stopped at "204, good" would be green on this bug.
   *
   * Ordered after RE-1188-04 deliberately (the describe is serial): on a fixed build the
   * referral is REQUESTED by the time this runs, which is the state a reject is legal from.
   */
  test('RE-1188-05: a 2xx reject actually rejects the referral rather than answering success and doing nothing', async ({
    page,
  }) => {
    test.fail(); // OGC-1188: transition() returns early on the null subcontract; reject is a 204 no-op.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 });

    const before = await readReferralItem(page, ref.labNo);
    const res = await raw(page, 'PUT', `${REST}/reference-lab-results/referrals/${ref.referralId}/reject`, {
      reasonCode: '1',
      reasonText: 'OGC-1188 regression case',
    });
    const after = await readReferralItem(page, ref.labNo);

    expect(
      after?.referralStatus,
      `PUT ${REST}/reference-lab-results/referrals/${ref.referralId}/reject answered ${res.status} ` +
        `(2xx means it succeeded) and the referral went from "${before?.referralStatus}" to ` +
        `"${after?.referralStatus}". The API reported success and nothing changed — no status move, ` +
        `and no referral_status_history row. Either the call must move the referral or it must refuse.`
    ).toBe('REJECTED');
  });

  /**
   * RE-1188-06 — THE CONTRAST, and the second canary. Not marked test.fail().
   *
   * Same instance, same reference laboratory (QA_AUTO Reference Lab Alpha), same
   * test (Glucose), the same moment: the Order Entry referral IS on the dashboard and the
   * Result Entry referral is not. That side-by-side is what makes OGC-1188 a defect in
   * ONE path rather than a dashboard that does not work.
   *
   * The Order Entry half is not created here — `helpers/referral-seed.ts` already makes
   * it, through the same REST calls the order wizard issues, and re-creating it would
   * only add a second order per run. Its presence is asserted, not assumed: if the seed
   * did not run, this case fails naming it rather than silently proving nothing.
   */
  test('RE-1188-06: an Order Entry referral to the same lab for the same test IS on the dashboard', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 });

    const outstanding = await getJson<DashboardRow[]>(page, `${REST}/reference-lab-results/referrals?view=outstanding`);
    const control = outstanding.filter(
      (r) => r.referenceLabName === CONTRAST_LAB && (r.tests || []).some((t) => t.includes(TEST_NAME))
    );

    const seed = readReferralSeed();
    expect(
      control.length,
      `no Order Entry referral to "${CONTRAST_LAB}" for ${TEST_NAME} is in the Outstanding view, so ` +
        `there is nothing to contrast the Result Entry referral against and this case would prove ` +
        `nothing. helpers/referral-seed.ts creates STUCK_A and STUCK_B against that lab and test; ` +
        `modules.config.ts runs it as the \`referral-data\` project. Seed state: ` +
        `${seed ? JSON.stringify(seed.referrals.map((r) => [r.tag, r.accession, r.actualStatus])) : '(no .auth/referral-seed.json)'}. ` +
        `Outstanding rows seen: ${JSON.stringify(outstanding.map((r) => [r.labNumber, r.referenceLabName, r.tests]))}`
    ).toBeGreaterThan(0);

    const mine = outstanding.filter((r) => r.labNumber === ref.labNo);

    // eslint-disable-next-line no-console
    console.log(
      `\nOGC-1188 two-way contrast, ${CONTRAST_LAB} / ${TEST_NAME}, read at the same moment:\n` +
        `  Order Entry  (useReferral + dispatch-subcontract): ${control.length} row(s) in Outstanding, ` +
        `e.g. ${control[0].labNumber} status ${control[0].status}\n` +
        `  Result Entry (refer-out at /Results):              ${mine.length} row(s) in Outstanding, ` +
        `accession ${ref.labNo}, referral ${ref.referralId}, status "${ref.statusAfterSave}"\n`
    );

    // This is the permanent truth the contrast rests on, and it is a real oracle: if the
    // dashboard ever stops showing Order Entry referrals, RE-1188-02's red would mean
    // "the dashboard broke" and not "OGC-1188 was fixed", and nothing else in this file
    // could tell the difference.
    await page.goto(`${BASE}${DASHBOARD_ROUTE}`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Reference Lab Results', level: 1 }),
      `the Reference Lab Results H1 never rendered at ${DASHBOARD_ROUTE}`
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('table').first().getByText(String(control[0].labNumber), { exact: false }).first(),
      `Order Entry referral ${control[0].labNumber} is in the API's outstanding view but is not drawn ` +
        `in the dashboard table`
    ).toBeVisible();
  });
});
