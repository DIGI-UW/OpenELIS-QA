/**
 * helpers/referral-seed.ts — reference-lab referral fixtures.
 *
 * WHY THIS EXISTS
 * The Reference Lab Results page (`/SampleShipment/reference-lab-results`, OGC-798..815)
 * is built and shipped, and every one of its four metric tiles reads 0 on a stock stack
 * because nothing has ever created a referral. There is nothing to test until something
 * does. This is that something.
 *
 * WHAT IT CREATES, AND BY WHAT MECHANISM — all of it through the REST calls the
 * application's own screens make. Nothing here writes to the database.
 *
 *   1. Three reference-lab organizations, POST /rest/Organization with
 *      `selectedTypes: ['6']`. Six is `organization_type.short_name = 'referralLab'`;
 *      `DisplayListService.createReferralOrganizationList()` is
 *      `getOrganizationsByTypeName("organizationName", "referralLab")`, so an
 *      organization without that link is invisible to every referral screen.
 *      Before this ran, `GET /rest/displayList/REFERRAL_ORGANIZATIONS` returned `[]`
 *      on an instance holding 27 organizations. That empty list is the blocker: with
 *      no reference lab to pick, no referral can be created through any UI.
 *
 *   2. One order per referral, POST /rest/SamplePatientEntry with `useReferral: true`
 *      and a populated `referralItems[]`. This is the ONLY creation path that produces
 *      a dashboard-visible referral, and the reason is worth writing down:
 *
 *        SamplePatientEntryServiceImpl.persistOrderEntryReferrals
 *          -> ReferralSetServiceImpl.createDraftReferralSetsForOrderEntry
 *             -> Referral(status = DRAFT) + a ReferralSubcontract row
 *
 *      The OTHER creation path — ticking "refer out" at Result Entry, which goes
 *      through `ResultUtil.handleReferrals` — writes `ReferralStatus.SENT` and NO
 *      subcontract row. SENT is a @Deprecated legacy value and is not in
 *      OUTSTANDING_STATUSES, RETURNED_STATUSES or HISTORY_STATUSES, so such a referral
 *      appears in no dashboard bucket at all; and `ReferralServiceImpl.transition()`
 *      returns early for any referral whose subcontract is null, so it can never be
 *      advanced either. Seeding through Result Entry would produce rows that look
 *      right in the database and are invisible on the page. See the QA note in
 *      tests/reference-lab-results-fhir-contract.spec.ts.
 *
 *   3. The state transitions, each through its own endpoint:
 *        POST /rest/referrals/{id}/dispatch-subcontract          DRAFT -> REQUESTED
 *        PUT  /rest/reference-lab-results/referrals/{id}/reject  REQUESTED -> REJECTED
 *
 *      `handoffDatetime` must be `dd/MM/yyyy HH:mm` on this instance —
 *      `DateUtil.convertStringDateToTimestamp` parses with
 *      `timestamp.format.formatKey` for the configured date locale, and a date with no
 *      time is rejected with `400 {"error":"handoffDatetime could not be parsed"}`.
 *      That is a silent-looking 400 that costs an hour if you have not seen it.
 *
 * WHAT IT CANNOT CREATE, AND WHY THAT IS A FINDING NOT A GAP IN THIS FILE
 * The "Returned — needs action" and "Reconciled today" tiles cannot be populated on a
 * single instance through any API. Both require `ReferralStatus.COMPLETED`, and the
 * only writers of COMPLETED are:
 *
 *   - `markReferralCompleted`, called ONLY from `FhirApiWorkFlowServiceImpl
 *     .beginTaskImportResultsPath`, a poll over `org.openelisglobal.remote.source.uri`.
 *     That property is EMPTY in this stack's common.properties, and
 *     `fetchReturnedResultsFromStore` returns an empty list immediately when
 *     `getRemoteStoreIdentifier()` is empty, which it is when there are no remote
 *     store paths to expand `Practitioner/*` against. The whole inbound path is inert.
 *   - `markReferralCompletedFromManualEntry`, which sets `manually_entered = true`,
 *     and `belongsInBucket` routes a manually-entered COMPLETED row to History, never
 *     to Returned. So even manual entry cannot fill the Returned tile — by design.
 *   - `acceptReferral` (the Reconciled path) calls `fetchReturnedResults` first and
 *     throws `IllegalStateException` when it comes back empty. Same dependency.
 *
 * So this seed populates OUTSTANDING and REJECTED THIS WEEK honestly, and leaves
 * RETURNED and RECONCILED TODAY at zero rather than faking them with a DB write.
 * Specs assert the zeroes as a documented consequence, not as a pass.
 *
 * IDEMPOTENT, BUT REPLENISHING. Re-running asks the INSTANCE which `QA_AUTO <TAG>`
 * referrals it already holds — not `.auth/referral-seed.json`, which is per-checkout
 * while the instance is shared — and skips a tag only when the referral wearing it is
 * still in the state the plan promised. A fixture that has since been consumed (the
 * OGC-803/804 suite accepts one referral and rejects another) no longer satisfies its
 * step and is re-created. Presence alone used to be the test, and it quietly starved
 * every suite that needed an outstanding referral. The organizations are matched on
 * `organizationName` and are never re-created.
 *
 * EVERYTHING IS PREFIXED `QA_AUTO` so it can be found and cleaned up.
 *
 * Output: `.auth/referral-seed.json`.
 */

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { BASE } from './base-url';

/** `organization_type.id` for `short_name = 'referralLab'`, read live from
 *  `GET /rest/organization/types` on 2026-09-15 and asserted at seed time rather
 *  than trusted, because an id is exactly the kind of thing a distro reseed moves. */
export const REFERRAL_LAB_TYPE_SHORT_NAME = 'referralLab';

export const QA_REFERRAL_PREFIX = 'QA_AUTO Reference Lab';

export const REFERENCE_LABS = [
  { organizationName: `${QA_REFERRAL_PREFIX} Alpha`, shortName: 'QAARLA' },
  { organizationName: `${QA_REFERRAL_PREFIX} Beta`, shortName: 'QAARLB' },
  { organizationName: `${QA_REFERRAL_PREFIX} Gamma`, shortName: 'QAARLG' },
] as const;

/**
 * The referrals to seed. `sentDaysAgo` is what the "Stuck (> N days)" filter and the
 * aging banner key off: `daysOutstanding` is computed from `sentDate` at read time,
 * and the banner fires on `daysOutstanding > referralStuckThresholdDays` (default 7,
 * STRICTLY greater). STUCK_A and STUCK_B are 12 days out so the banner has a subject
 * and the count is 2, not 1 — a count of 1 cannot distinguish "the banner counted the
 * stuck rows" from "the banner counted anything at all".
 */
export const REFERRAL_PLAN = [
  { tag: 'STUCK_A', labIndex: 0, sentDaysAgo: 12, priority: 'STAT', end: 'requested' },
  { tag: 'STUCK_B', labIndex: 0, sentDaysAgo: 12, priority: 'ROUTINE', end: 'requested' },
  { tag: 'FRESH', labIndex: 1, sentDaysAgo: 2, priority: 'ROUTINE', end: 'requested' },
  { tag: 'REJECTED', labIndex: 2, sentDaysAgo: 4, priority: 'ROUTINE', end: 'rejected' },
  { tag: 'DRAFT', labIndex: 0, sentDaysAgo: 1, priority: 'ROUTINE', end: 'draft' },
] as const;

export const REFERRAL_SEED_PATH = path.join(process.cwd(), '.auth', 'referral-seed.json');

export interface SeededReferral {
  tag: string;
  accession: string;
  referralId: string | null;
  referenceLabId: string;
  referenceLabName: string;
  sentDaysAgo: number;
  endState: string;
  actualStatus: string | null;
}

export interface ReferralSeedState {
  referenceLabs: { id: string; name: string }[];
  referrals: SeededReferral[];
  metricsAfter: Record<string, number> | null;
  setupTimestamp: string;
  errors: string[];
}

export function readReferralSeed(): ReferralSeedState | null {
  try {
    if (fs.existsSync(REFERRAL_SEED_PATH)) {
      return JSON.parse(fs.readFileSync(REFERRAL_SEED_PATH, 'utf8')) as ReferralSeedState;
    }
  } catch {
    /* regenerated on next run */
  }
  return null;
}

function writeReferralSeed(state: ReferralSeedState): void {
  const dir = path.dirname(REFERRAL_SEED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REFERRAL_SEED_PATH, JSON.stringify(state, null, 2));
}

/** dd/MM/yyyy — the date format this instance's REST layer parses. */
function dmy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

/**
 * The whole seeding routine, as it runs INSIDE the page. Hoisted to module scope so
 * that `runReferralSeed` (the full fixture set, skipping what the instance already
 * holds) and `createDispatchedReferral` (one throwaway referral, always created) can
 * share one implementation instead of two drifting copies. It must stay closure-free:
 * Playwright serialises it, so it may only read `args`.
 */
const seedPlanInBrowser = async (args: {
  labs: { organizationName: string; shortName: string }[];
  plan: { tag: string; labIndex: number; sentDaysAgo: number; priority: string; end: string }[];
  typeShortName: string;
  dates: { tag: string; sent: string; handoff: string; today: string }[];
  /** Create every step even if the instance already carries that tag. */
  ignoreExisting?: boolean;
}) => {
  const R = '/api/OpenELIS-Global/rest';
  const csrf = localStorage.getItem('CSRF') || '';
  const errors: string[] = [];

  const getJson = async (p: string): Promise<any> => {
    const r = await fetch(p, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    // The SPA catch-all answers 200 text/html for anything it does not route, so a
    // status check alone is not enough to know this was the API.
    if (!/application\/(problem\+)?json/.test(r.headers.get('content-type') || '')) return null;
    return r.json().catch(() => null);
  };
  const sendJson = async (method: string, p: string, body?: unknown) => {
    const r = await fetch(p, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', 'X-CSRF-Token': csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.text().catch(() => '')).slice(0, 300) };
  };

  // ---- 1. reference-lab organizations -------------------------------------
  const types = (await getJson(`${R}/organization/types`)) || [];
  const refLabType = types.find((t: any) => t.name === args.typeShortName);
  if (!refLabType) {
    errors.push(
      `no organization_type named "${args.typeShortName}" on this instance; ` +
        `DisplayListService.createReferralOrganizationList queries it by that exact name, ` +
        `so no organization can ever become a reference lab here`
    );
  }
  const typeId = refLabType ? String(refLabType.id) : '6';

  let listed = (await getJson(`${R}/displayList/REFERRAL_ORGANIZATIONS`)) || [];
  for (const lab of args.labs) {
    if (listed.some((e: any) => e.value === lab.organizationName)) continue;
    const res = await sendJson('POST', `${R}/Organization?ID=0&startingRecNo=1`, {
      organizationName: lab.organizationName,
      shortName: lab.shortName,
      isActive: 'Y',
      commune: '',
      village: '',
      department: '',
      formName: 'organizationForm',
      formMethod: 'POST',
      cancelAction: 'CancelOrganization',
      submitOnCancel: false,
      cancelMethod: 'POST',
      mlsSentinelLabFlag: 'N',
      parentOrgName: '',
      state: 'MN',
      selectedTypes: [typeId],
    });
    if (res.status !== 200) errors.push(`create ${lab.organizationName}: ${res.status} ${res.body}`);
  }
  listed = (await getJson(`${R}/displayList/REFERRAL_ORGANIZATIONS`)) || [];
  const referenceLabs = args.labs
    .map((l) => listed.find((e: any) => e.value === l.organizationName))
    .filter(Boolean)
    .map((e: any) => ({ id: String(e.id), name: String(e.value) }));
  if (referenceLabs.length < args.labs.length) {
    errors.push(
      `only ${referenceLabs.length}/${args.labs.length} reference labs are visible in ` +
        `REFERRAL_ORGANIZATIONS after seeding`
    );
    if (!referenceLabs.length) return { referenceLabs, referrals: [], metrics: null, errors };
  }

  // ---- 2. the order context ------------------------------------------------
  const sites = (await getJson(`${R}/displayList/SAMPLE_PATIENT_REFERRING_CLINIC`)) || [];
  if (!sites.length) {
    errors.push('no referring clinic (org type 5) — see data-factory.ensureReferringClinic');
    return { referenceLabs, referrals: [], metrics: null, errors };
  }
  const siteId = String(sites[0].id);
  const depts = (await getJson(`${R}/departments-for-site?refferingSiteId=${siteId}`)) || [];
  const pay = (await getJson(`${R}/displayList/PAYMENT_OPTIONS`)) || [];

  // The baseline patient from data.setup.ts. patient-search-results only searches by
  // name: `patientID=`, `nationalId=` and `searchValue=` all answer 200 with an empty
  // list, which reads identically to "no such patient" (data-factory.ts documents this).
  const found = await getJson(`${R}/patient-search-results?lastName=Sebby&firstName=Abby`);
  const pt = ((found && found.patientSearchResults) || [])[0];
  if (!pt) {
    errors.push('baseline patient Abby Sebby not found — run data.setup.ts first');
    return { referenceLabs, referrals: [], metrics: null, errors };
  }

  const TEST_ID = '3';
  const SAMPLE_TYPE_ID = '2';

  // IDEMPOTENCE, and it has to be checked against the INSTANCE, not against
  // `.auth/referral-seed.json`. The state file is per-checkout and the instance is
  // shared: a second checkout, a CI runner with a clean workspace, or a deleted
  // .auth would all re-seed an instance that is already full, and five more orders
  // per run is how a fixture quietly becomes a data problem. `requestor` carries
  // the `QA_AUTO <TAG>` string this seed writes, so the instance can be asked
  // directly which tags it already holds.
  // A tag counts as seeded only when the referral wearing it is STILL IN THE STATE THE
  // PLAN PROMISED. Presence alone is not enough, and the difference is not academic: the
  // OGC-803/804 suite CONSUMES fixtures — it accepts one referral and rejects another —
  // and a consumed STUCK_A is still tagged STUCK_A, still listed, and no longer anything
  // this plan asked for. A presence-only check therefore reported "already seeded" for a
  // bucket it had emptied, and every later run of the suites that need an outstanding
  // referral failed for want of one the seed believed it had.
  const seededState: Record<string, { view: string; outcome: string }> = {};
  for (const view of ['outstanding', 'returned', 'history']) {
    for (const row of (await getJson(`${R}/reference-lab-results/referrals?view=${view}`)) || []) {
      const m = /^QA_AUTO (\S+)$/.exec(String(row.requestor || ''));
      // Last write wins: a tag can only be in one bucket, and if it somehow appears in
      // two the later (more advanced) bucket is the truthful one.
      if (m) seededState[m[1]] = { view, outcome: String(row.outcome || '') };
    }
  }
  const stillSatisfies = (tag: string, end: string): boolean => {
    const found = seededState[tag];
    if (!found) return false;
    // 'draft' is unobservable — a DRAFT referral is in no dashboard view — so a draft
    // step is always re-created. That is deliberate and costs one order per run.
    if (end === 'requested') return found.view === 'outstanding';
    if (end === 'rejected') return found.view === 'history' && found.outcome === 'Rejected';
    return false;
  };

  const referrals: any[] = [];
  for (const step of args.plan) {
    if (!args.ignoreExisting && stillSatisfies(step.tag, step.end)) {
      referrals.push({
        tag: step.tag,
        accession: '(pre-existing)',
        referralId: null,
        referenceLabId: referenceLabs[Math.min(step.labIndex, referenceLabs.length - 1)].id,
        referenceLabName: referenceLabs[Math.min(step.labIndex, referenceLabs.length - 1)].name,
        sentDaysAgo: step.sentDaysAgo,
        endState: step.end,
        actualStatus: 'already seeded',
      });
      continue;
    }
    const d = args.dates.find((x) => x.tag === step.tag)!;
    const lab = referenceLabs[Math.min(step.labIndex, referenceLabs.length - 1)];

    const gen = await getJson(`${R}/SampleEntryGenerateScanProvider`);
    const labNo = gen && gen.body;
    if (!labNo) {
      errors.push(`[${step.tag}] SampleEntryGenerateScanProvider returned no accession`);
      continue;
    }

    const post = await sendJson('POST', `${R}/SamplePatientEntry`, {
      rememberSiteAndRequester: false,
      customNotificationLogic: false,
      patientEmailNotificationTestIds: [],
      patientSMSNotificationTestIds: [],
      providerEmailNotificationTestIds: [],
      providerSMSNotificationTestIds: [],
      patientUpdateStatus: 'NO_ACTION',
      useReferral: true,
      referralItems: [
        {
          referralId: '',
          referredInstituteId: lab.id,
          // MUST equal a test id present in sampleXML: createReferralRowsForItems
          // matches referredTestId against the order's analyses to attach the
          // Referral, and a mismatch silently produces a referral with no analysis.
          referredTestId: TEST_ID,
          referralReasonId: '2',
          referredSendDate: d.sent,
          referrer: `QA_AUTO ${step.tag}`,
          agreementReference: `QA_AUTO-AGR-${step.tag}`,
          handoffDatetime: d.handoff,
          expectedReturnDate: d.today,
          cocContactName: 'QA_AUTO Courier',
          cocContactPhone: '555-0101',
          cocContactEmail: 'qa_auto@example.invalid',
          subcontractNotes: `QA_AUTO seeded referral ${step.tag}`,
          modified: true,
        },
      ],
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
        aka: '', streetAddress: '', city: '', primaryPhone: '', email: '',
        commune: '', education: '', maritialStatus: '', nationality: '',
        healthDistrict: '', healthRegion: '', otherNationality: '',
        occupation: '', customNotes: '', targetDiseaseProgramme: '',
        photo: '', idDocuments: [], mothersName: '', mothersInitial: '',
        addressDepartment: '', insuranceNumber: '', isMerged: false,
      },
      sampleOrderItems: {
        labNo,
        requestDate: d.today,
        receivedDateForDisplay: d.today,
        receivedTime: '08:00',
        nextVisitDate: '',
        priority: step.priority,
        referringSiteId: siteId,
        referringSiteDepartmentId: depts.length ? String(depts[0].id) : '',
        referringSiteCode: '', referringSiteName: '', referringSiteDepartmentName: '',
        referringSiteList: [], referringSiteDepartmentList: [],
        paymentOptionSelection: pay.length ? String(pay[0].id) : '',
        paymentOptions: [], testLocationCode: '', otherLocationCode: '',
        newRequesterName: '', requesterSampleID: '', referringPatientNumber: '',
        providerId: '', providerPersonId: '',
        providerFirstName: 'QA', providerLastName: 'Seeder',
        providerWorkPhone: '', providerFax: '', providerEmail: '', providersList: [],
        externalOrderNumber: '', orderType: '', orderTypes: [], billingReferenceNumber: '',
        facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '',
        facilityFax: '', program: '', programList: [], priorityList: [],
        testLocationCodeList: [], modified: true, readOnly: false,
        sampleId: '', isEQASample: false,
      },
    });
    if (post.status !== 200) {
      errors.push(`[${step.tag}] POST SamplePatientEntry -> ${post.status} ${post.body}`);
      continue;
    }

    // The referral id exists nowhere in the POST response and nowhere in
    // /rest/ReferredOutTests (ReferralDisplayItem carries no id field at all).
    // /rest/order/search is the only read that returns it.
    const order = await getJson(`${R}/order/search?labNumber=${labNo}`);
    let referralId: string | null = null;
    for (const si of (order && order.samples) || []) {
      for (const ri of si.referralItems || []) if (ri.referralId) referralId = String(ri.referralId);
    }
    if (!referralId) {
      errors.push(`[${step.tag}] order ${labNo} saved but no referralId came back from /rest/order/search`);
      continue;
    }

    let actualStatus = 'DRAFT';
    if (step.end !== 'draft') {
      const disp = await sendJson('POST', `${R}/referrals/${referralId}/dispatch-subcontract`, {
        handoffDatetime: d.handoff,
        notes: `QA_AUTO dispatch ${step.tag}`,
      });
      if (disp.status !== 200) {
        errors.push(`[${step.tag}] dispatch -> ${disp.status} ${disp.body}`);
      } else {
        actualStatus = 'REQUESTED';
      }
    }
    if (step.end === 'rejected' && actualStatus === 'REQUESTED') {
      const rej = await sendJson('PUT', `${R}/reference-lab-results/referrals/${referralId}/reject`, {
        reasonCode: '1',
        reasonText: 'QA_AUTO seeded rejection',
      });
      if (rej.status !== 204) errors.push(`[${step.tag}] reject -> ${rej.status} ${rej.body}`);
      else actualStatus = 'REJECTED';
    }

    referrals.push({
      tag: step.tag,
      accession: labNo,
      referralId,
      referenceLabId: lab.id,
      referenceLabName: lab.name,
      sentDaysAgo: step.sentDaysAgo,
      endState: step.end,
      actualStatus,
    });
  }

  const metrics = await getJson(`${R}/reference-lab-results/metrics`);
  return { referenceLabs, referrals, metrics, errors };
};

/**
 * Run the whole seed. Never throws: every failure is pushed onto `state.errors` so a
 * broken instance degrades the fixtures instead of taking the sweep with it, the same
 * contract `data.setup.ts` documents at length.
 */
export async function runReferralSeed(page: Page): Promise<ReferralSeedState> {
  const state: ReferralSeedState = {
    referenceLabs: [],
    referrals: [],
    metricsAfter: null,
    setupTimestamp: new Date().toISOString(),
    errors: [],
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);


  const result = await page.evaluate(seedPlanInBrowser, 
      {
        ignoreExisting: false,
        labs: REFERENCE_LABS.map((l) => ({ ...l })),
        plan: REFERRAL_PLAN.map((p) => ({ ...p })),
        typeShortName: REFERRAL_LAB_TYPE_SHORT_NAME,
        dates: REFERRAL_PLAN.map((p) => ({
          tag: p.tag,
          sent: dmy(daysAgo(p.sentDaysAgo)),
          // `dd/MM/yyyy HH:mm`. A date with no time is a 400 — see the header comment.
          handoff: `${dmy(daysAgo(p.sentDaysAgo))} 09:00`,
          today: dmy(new Date()),
        })),
      });

  state.referenceLabs = result.referenceLabs;
  state.referrals = result.referrals;
  state.metricsAfter = result.metrics;
  state.errors = result.errors;
  writeReferralSeed(state);
  return state;
}

/**
 * Create ONE referral and dispatch it, always — no idempotence check.
 *
 * `runReferralSeed` is deliberately idempotent: it asks the instance which
 * `QA_AUTO <TAG>` referrals it already holds and skips them, because five more orders
 * on every run is how a fixture becomes a data problem. That is exactly wrong for a
 * spec that CONSUMES a referral — rejecting the shared STUCK_A fixture would leave the
 * next run with nothing to reject and no way to notice, because the seed would see the
 * (now REJECTED, still tagged) row and decide its work was done.
 *
 * So a case that spends a referral mints its own here, with a unique tag, and pays one
 * order per run for it. The order is left in place: it is real test data, and the
 * accession is logged.
 *
 * Unlike the seed setup, this THROWS. It is called from a test that cannot proceed
 * without it, and a silent null would become a vacuous pass.
 */
export async function createDispatchedReferral(
  page: Page,
  tag: string,
  opts: { sentDaysAgo?: number; priority?: string; end?: 'draft' | 'requested' | 'rejected' } = {}
): Promise<SeededReferral> {
  const sentDaysAgo = opts.sentDaysAgo ?? 3;
  const step = {
    tag,
    labIndex: 0,
    sentDaysAgo,
    priority: opts.priority ?? 'ROUTINE',
    end: opts.end ?? 'requested',
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const result = await page.evaluate(seedPlanInBrowser, {
    ignoreExisting: true,
    labs: REFERENCE_LABS.map((l) => ({ ...l })),
    plan: [step],
    typeShortName: REFERRAL_LAB_TYPE_SHORT_NAME,
    dates: [
      {
        tag,
        sent: dmy(daysAgo(sentDaysAgo)),
        handoff: `${dmy(daysAgo(sentDaysAgo))} 09:00`,
        today: dmy(new Date()),
      },
    ],
  });

  const made = (result.referrals || [])[0] as SeededReferral | undefined;
  if (!made || !made.referralId) {
    throw new Error(
      `could not mint a referral tagged ${tag} against ${BASE}: ` +
        `${(result.errors || []).join(' | ') || 'the seed reported no error, which means the plan produced no row'}`
    );
  }
  return made;
}

/** True when this instance already carries a full set of QA_AUTO referral fixtures. */
export async function referralFixturesPresent(page: Page): Promise<boolean> {
  const rows = await page.evaluate(async () => {
    const r = await fetch('/api/OpenELIS-Global/rest/reference-lab-results/referrals?view=outstanding', {
      headers: { Accept: 'application/json' },
    });
    if (!/application\/json/.test(r.headers.get('content-type') || '')) return null;
    return (await r.json().catch(() => null)) as { requestor?: string }[] | null;
  });
  if (!rows) return false;
  const mine = rows.filter((x) => (x.requestor || '').startsWith('QA_AUTO'));
  return mine.length >= REFERRAL_PLAN.filter((p) => p.end === 'requested').length;
}

export function formatReferralSeedSummary(state: ReferralSeedState): string {
  const lines = [
    'REFERENCE-LAB REFERRAL SEED',
    `  target          ${BASE}`,
    `  reference labs  ${state.referenceLabs.map((l) => `${l.name}#${l.id}`).join(', ') || '(none)'}`,
    `  referrals       ${state.referrals.length}`,
  ];
  for (const r of state.referrals) {
    lines.push(`    ${r.tag.padEnd(9)} ${r.accession}  referral#${r.referralId}  ${r.actualStatus}  ${r.referenceLabName}`);
  }
  lines.push(`  metrics         ${JSON.stringify(state.metricsAfter)}`);
  if (state.errors.length) {
    lines.push('  errors:');
    for (const e of state.errors) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}
