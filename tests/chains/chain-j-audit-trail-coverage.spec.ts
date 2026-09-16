/**
 * tests/chains/chain-j-audit-trail-coverage.spec.ts
 *
 * SKILL §11 Chain J — Audit Trail Coverage
 *
 * What this chain proves: sensitive actions (edit reference range,
 * change patient DOB, grant admin role, deactivate a user) produce
 * audit log entries with identifying information (who, when, what
 * changed from, what changed to).
 *
 * Why this matters: the audit trail is the regulatory bedrock of every
 * accredited lab. If editing a reference range doesn't produce an
 * audit entry, a silent data corruption (BUG-8 territory) is invisible
 * to investigators. Phase 21 confirmed the audit trail VIEWER works
 * — but never confirmed whether it covers all sensitive actions.
 *
 * Run individually:
 *   npx playwright test --project=chain-j
 */

import { test, expect } from '@playwright/test';
import { API, BASE, acquireAnyAccession, apiCall, markStep } from './_common';

// The shape /rest/AuditTrailReport actually answers, captured from the endpoint rather than
// assumed. It is `user` / `timeStamp` / `item` / `identifier` -- NOT userId / timestamp /
// entity / entityId, which is what this chain used to look for, and why Step 5 reported
// "an auditor cannot reconstruct who did what when" against rows that name both plainly.
interface AuditEntry {
  timeStamp?: number;
  date?: string;
  time?: string;
  action?: string;      // 'I' insert | 'U' update
  user?: string;        // "ELIS,Open"
  item?: string;        // "Patient"
  attribute?: string;   // "new" | "update"
  identifier?: string;  // human label of the changed field
  newValue?: string;
  oldValue?: string;
  className?: string;
}


/** The accession this chain audits. Resolved once in Step 1. */
let auditAccession = '';

/**
 * Read one accession's audit trail. `/rest/AuditTrailReport` requires `accessionNumber`
 * and is ADMIN-only; it answers `{accessionNumber, log[], sampleOrderItems,
 * patientProperties}` -- note `log`, not `entries`.
 */
async function readAuditTrail(page: import('@playwright/test').Page) {
  return apiCall<{ log?: AuditEntry[]; entries?: AuditEntry[] } | AuditEntry[]>(
    page,
    `/api/OpenELIS-Global/rest/AuditTrailReport?accessionNumber=${encodeURIComponent(auditAccession)}`
  );
}

function auditEntriesOf(body: unknown): AuditEntry[] {
  if (Array.isArray(body)) return body as AuditEntry[];
  const b = body as { log?: AuditEntry[]; entries?: AuditEntry[] } | null;
  return b?.log ?? b?.entries ?? [];
}

test.describe.serial('Chain J — Audit Trail Coverage', () => {
  let baselineCount = 0;
  // `accessionScoped` matters: /rest/AuditTrailReport is keyed by ACCESSION NUMBER. A change
  // to the shared test catalog (a reference range) is recorded -- ResultLimitServiceImpl sets
  // auditTrailLog = true -- but it belongs to no accession, so it can never appear in this
  // report. Asserting it should was this chain's own bug, not a product gap; the real finding
  // is the RETRIEVAL surface, which Step 6 states on its own terms.
  const probedActions: Array<{ name: string; success: boolean; auditFound: boolean; accessionScoped: boolean; detail?: string }> = [];
  /** patientPK of the patient on `auditAccession`, resolved in Step 1 from patientProperties. */
  let accessionPatientPK = '';
  /** The audit report's own patientProperties projection — the read half of Step 3's edit. */
  let accessionPatientProps: Record<string, unknown> = {};
  /** Step 3's two markers. PERSON-owned (street address) and PATIENT-owned (nationalId).
   *  Steps 4/5 look for the PATIENT one -- the feed that works -- and Step 7 owns the PERSON gap. */
  let personMarker = '';
  let patientMarker = '';

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain J] BASE=${BASE}`);
  });

  test('Step 1 — Baseline one accession\'s audit trail (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    const acq = await acquireAnyAccession(page);
    if (!acq.accession) {
      markStep('J', 1, 'GAP', `No accession to audit (${acq.detail})`, 'Seed an order then re-run.');
      test.info().annotations.push({ type: 'gap', description: 'no accession available' });
      return;
    }
    auditAccession = acq.accession;

    const r = await readAuditTrail(page);
    if (!r.ok) {
      markStep(
        'J',
        1,
        'FAIL',
        `AuditTrailReport HTTP ${r.status} for accession ${auditAccession}`,
        'The endpoint exists and takes accessionNumber; a non-2xx on a real accession is a ' +
          'product failure, not a declarable gap.'
      );
      expect(r.ok).toBeTruthy();
      return;
    }
    baselineCount = auditEntriesOf(r.body).length;
    // patientProperties is a READ-ONLY display projection: it carries subjectNumber,
    // nationalId, names and demographics, but no primary key. So the patient is identified
    // the way the Patient screen itself does it -- search by subject number, take the PK
    // off the search result.
    const pp = (r.body as { patientProperties?: Record<string, unknown> } | null)?.patientProperties;
    if (pp) accessionPatientProps = { ...pp };
    const subject = String(pp?.subjectNumber ?? '');
    if (subject) {
      const found = await apiCall<{ patientSearchResults?: Array<{ patientID?: string }> }>(
        page, `${API}/patient-search-results?subjectNumber=${encodeURIComponent(subject)}`);
      accessionPatientPK = String(found.body?.patientSearchResults?.[0]?.patientID ?? '');
    }
    markStep('J', 1, 'PASS', `Baseline audit rows for ${auditAccession} = ${baselineCount}` + (accessionPatientPK ? `; patient ${accessionPatientPK}` : '; no patientPK in the report'));
  });

  test('Step 2 — Edit a reference range (PERSIST, sensitive action 1)', async ({ page }) => {
    await page.goto(BASE);
    // Reference ranges are ResultLimits, owned by the test-catalog editor, not by a
    // top-level /rest/reference-ranges resource. The real contract is
    //   GET  /rest/test-catalog/tests/{testId}/ranges  -> { ranges: [...], sampleTypes: [...] }
    //   PUT  /rest/test-catalog/tests/{testId}/ranges  <- the same envelope
    // (TestCatalogEditorRestController). The PUT validates gender, age window and
    // sample-type association, so the safest edit is a read-modify-write that nudges
    // highNormal on an existing row and puts the envelope back unchanged otherwise.
    const tests = await apiCall<Array<{ id?: string; value?: string }>>(page, `${API}/test-list`);
    const testId = Array.isArray(tests.body) ? (tests.body[0]?.id ?? tests.body[0]?.value) : undefined;
    if (!testId) {
      markStep('J', 2, 'FAIL', `Could not resolve a test id from /rest/test-list (HTTP ${tests.status})`,
        'The catalog is seeded on every instance; an empty test list is a harness or data failure, not a gap.');
      expect(testId, 'a test id from /rest/test-list').toBeTruthy();
      return;
    }

    const RANGES = `${API}/test-catalog/tests/${testId}/ranges`;
    const before = await apiCall<{ ranges?: Array<Record<string, unknown>> }>(page, RANGES);
    if (!before.ok) {
      markStep('J', 2, 'FAIL', `GET ${RANGES} HTTP ${before.status}`,
        'The endpoint exists on develop; a non-2xx for a real test id is a product failure.');
      expect(before.ok).toBeTruthy();
      return;
    }

    const envelope = (before.body ?? {}) as { ranges?: Array<Record<string, unknown>> };
    const ranges = Array.isArray(envelope.ranges) ? envelope.ranges : [];
    if (ranges.length === 0) {
      // A test with no configured range is normal. Write one rather than declare a gap:
      // minAge 0 / maxAge 200 passes the controller's own age-window validation.
      ranges.push({ minAge: 0, maxAge: 200, lowNormal: 0.1, highNormal: 99.9 });
    } else {
      const cur = Number(ranges[0].highNormal);
      ranges[0].highNormal = Number.isFinite(cur) ? cur + 0.1 : 99.9;
    }

    const put = await apiCall<{ ranges?: Array<Record<string, unknown>> }>(page, RANGES, {
      method: 'PUT',
      body: { ...envelope, ranges },
    });
    probedActions.push({ name: 'edit-reference-range', success: put.ok, auditFound: false, accessionScoped: false, detail: `HTTP ${put.status}` });
    if (!put.ok) {
      markStep('J', 2, 'FAIL', `PUT ${RANGES} HTTP ${put.status}`,
        'Range save is a shipped admin action. A non-2xx on a body the controller itself validates is a product failure, not a declarable gap.');
      expect(put.ok, 'reference range save accepted').toBeTruthy();
      return;
    }
    markStep('J', 2, 'PASS', `Reference range saved for test ${testId} (${ranges.length} row(s))`);
  });

  test('Step 3 — Edit a patient field (PERSIST, sensitive action 2)', async ({ page }) => {
    await page.goto(BASE);
    // Two corrections here. The endpoint is `/rest/PatientManagement` (PatientManagementRestController),
    // not `/rest/patient-management`, and the body is a flat PatientManagementInfo, not one nested
    // under `patientProperties` -- the old shape 404'd, which this chain used to file as a blocked
    // product surface. And the patient has to be the one ON the baselined accession: any other
    // patient's edit is invisible to an accession-scoped audit report by construction.
    if (!accessionPatientPK) {
      markStep('J', 3, 'FAIL', 'Could not resolve a patient PK for the baselined accession via subjectNumber search',
        'Every accession has a patient and patient-search-results is a shipped surface; failing to find it is a failure, not a gap.');
      expect(accessionPatientPK, 'patientPK from the audit report').toBeTruthy();
      return;
    }
    // PatientManagement is validated as a FULL SamplePatientEntry form and deserialized
    // strictly: posting {patientPK, oneField} answers 400, and so does posting the audit
    // report's patientProperties projection (it carries display-only keys the form bean does
    // not declare). The read half that works is the one the patient screen itself uses --
    // `GET /rest/patient-details?patientID=<pk>` -- whose body POSTs back verbatim.
    // Note the capital D: `patientId` is a 400.
    const marker = `QA_AUTO_chain-j_${Date.now()}`;
    const details = await apiCall<Record<string, unknown>>(
      page, `${API}/patient-details?patientID=${encodeURIComponent(accessionPatientPK)}`);
    if (!details.ok || !details.body || !Object.keys(details.body).length) {
      markStep('J', 3, 'FAIL', `patient-details HTTP ${details.status} for patientPK ${accessionPatientPK}`,
        'patient-details is the shipped read for this screen; a non-2xx is a product failure.');
      expect(details.ok, 'patient-details readable').toBeTruthy();
      return;
    }
    // TWO edits in one save, on purpose. A patient record straddles two tables:
    //   PERSON  owns name, address, phone, email
    //   PATIENT owns nationalId, externalId, gender
    // The audit trail treats them differently (see Step 7), so the chain changes one field
    // of each and lets Step 4 say which of the two reached the report.
    personMarker = marker;
    patientMarker = `${String(details.body.nationalId ?? 'qa')}`.replace(/-chainj\d*$/, '') + `-chainj${Date.now() % 100000}`;
    const body: Record<string, unknown> = {
      ...details.body,
      streetAddress: personMarker,   // PERSON-owned
      nationalId: patientMarker,     // PATIENT-owned
    };
    const r = await apiCall<unknown>(page, `${API}/PatientManagement`, { method: 'POST', body });
    probedActions.push({ name: 'edit-patient-address (PERSON)', success: r.ok, auditFound: false, accessionScoped: true, detail: `HTTP ${r.status}` });
    probedActions.push({ name: 'edit-patient-nationalId (PATIENT)', success: r.ok, auditFound: false, accessionScoped: true, detail: `HTTP ${r.status}` });
    if (!r.ok) {
      markStep('J', 3, 'FAIL', `Patient edit HTTP ${r.status} for patientPK ${accessionPatientPK}: ${JSON.stringify(r.body).slice(0, 200)}`,
        'PatientManagement is a shipped write surface. A non-2xx is a product failure, not a declarable gap.');
      expect(r.ok, 'patient edit accepted').toBeTruthy();
      return;
    }
    markStep('J', 3, 'PASS', `Patient ${accessionPatientPK}: streetAddress (PERSON) set to ${marker}, nationalId (PATIENT) bumped`);
  });

  test('Step 4 — Verify each successful action produced an audit entry (CROSS-LINK, REPORTABLE)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000); // audit may be async

    const r = await readAuditTrail(page);
    if (!r.ok) {
      markStep('J', 4, 'FAIL', `AuditTrail HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return;
    }
    const entries = auditEntriesOf(r.body);
    const newCount = entries.length - baselineCount;
    const successfulActions = probedActions.filter(a => a.success && a.accessionScoped);
    const offReport = probedActions.filter(a => a.success && !a.accessionScoped);

    if (successfulActions.length === 0) {
      markStep('J', 4, 'BLOCKED',
        `No accession-scoped sensitive action succeeded — cannot verify audit coverage `
        + `(off-report actions that did land: ${offReport.map(a => a.name).join(', ') || 'none'})`);
      test.info().annotations.push({ type: 'blocked', description: 'no successful accession-scoped action to verify' });
      return;
    }

    // Match each successful action against the new audit entries. We
    // use the QA_AUTO_chain-j prefix in the action payload so audit
    // entries should reference it.
    // Search the PATIENT-owned marker. The PERSON-owned one is deliberately NOT searched here:
    // its absence is a known product gap with its own step (Step 7), and folding it into this
    // assertion is what made Step 5 report "the audit trail records nothing" when in fact it
    // records the PATIENT half faithfully.
    const myEntries = entries.filter(e =>
      e.newValue?.includes(patientMarker) || e.oldValue?.includes(patientMarker)
    );

    if (newCount === 0) {
      markStep('J', 4, 'FAIL',
        `${successfulActions.length} accession-scoped sensitive action(s) succeeded but audit count did not increase (${baselineCount} → ${entries.length})`,
        `Audit trail does not capture these actions. Regulatory gap.`);
      expect(newCount).toBeGreaterThan(0); return;
    }
    if (myEntries.length === 0) {
      markStep('J', 4, 'PARTIAL',
        `Audit count grew by ${newCount} but no entries match QA_AUTO_chain-j signature`,
        `Activity captured but identifying info isn't preserved. Audit entries lack new/old value detail.`);
      test.info().annotations.push({ type: 'partial', description: 'audit captures activity but not detail' });
      return;
    }
    markStep('J', 4, 'PASS',
      `${myEntries.length} audit entries match QA_AUTO_chain-j signature; new total today=${entries.length}`);
  });

  test('Step 5 — Audit entry has who/when/what fields populated (REPORTABLE)', async ({ page }) => {
    await page.goto(BASE);
    const r = await readAuditTrail(page);
    if (!r.ok) {
      markStep('J', 5, 'FAIL', `AuditTrail read returned HTTP ${r.status}`,
        'The endpoint exists on this build, so a non-2xx is a failure and not a declarable gap ' +
        '(known-gaps.ts, "WHAT DOES NOT [belong here]").');
      return;
    }
    const entries = auditEntriesOf(r.body);
    const recent = entries.find(e =>
      e.newValue?.includes(patientMarker) || e.oldValue?.includes(patientMarker)
    );
    if (!recent) {
      // Split deliberately. If Steps 2-3 got a sensitive action through and no audit row
      // carries its signature, that is the audit-coverage gap this chain is for, and it is a
      // FAIL. If every probed action was blocked, there is nothing to have audited, and the
      // register decides.
      const landed = probedActions.filter(a => a.success && a.accessionScoped);
      if (landed.length > 0) {
        markStep('J', 5, 'FAIL',
          `${landed.length} sensitive action(s) succeeded but no audit entry carries the ` +
          `PATIENT-owned marker ${patientMarker}`,
          `Actions: ${landed.map(a => a.name).join(', ')}. Searched ${entries.length} entr(ies) for ` +
          `today. Either the audit trail does not record these actions, or it records them without ` +
          `the changed value.`);
      } else {
        markStep('J', 5, 'BLOCKED', 'No accession-scoped sensitive action landed in Steps 2-3, so nothing to audit',
          'A cascade, not a gap: fix the earlier steps.');
      }
      return;
    }

    const hasUser = !!recent.user;
    const hasTime = !!recent.timeStamp || !!(recent.date && recent.time);
    const hasWhat = !!recent.identifier || !!recent.item;
    const hasOld = recent.oldValue !== undefined;
    const hasNew = !!recent.newValue;

    if (!(hasUser && hasTime && hasWhat && (hasOld || hasNew))) {
      markStep('J', 5, 'FAIL',
        `Audit entry missing required fields: user=${hasUser}, time=${hasTime}, what=${hasWhat}, oldValue=${hasOld}, newValue=${hasNew}`,
        `An auditor cannot reconstruct who did what when from this entry. Regulatory gap.`);
      expect(hasUser && hasTime && hasWhat).toBeTruthy(); return;
    }
    markStep('J', 5, 'PASS',
      `Audit entry is complete: user=${recent.user} at ${recent.date} ${recent.time} changed `
      + `"${recent.identifier}" on ${recent.item} from "${recent.oldValue}" to "${recent.newValue}"`);
  });

  // Step 6 — The System Audit Trail is the non-accession reader, and it round-trips (ROUND-TRIP)
  //
  // Written after a wrong turn worth recording. This chain was about to report "catalog-level
  // audit rows have no retrieval surface" on the strength of /rest/AuditTrailReport being
  // accession-scoped. It is -- and it is not the only reader. `/AuditTrailReport?type=system`
  // (Reports → Audit Trail) is backed by `/rest/systemAuditEvents`, filters by entity type,
  // action, user and date range, and its entity list includes both PERSON and RESULT_LIMITS.
  // So the changes Steps 2 and 3 made ARE auditable through the product. Assert that, rather
  // than a gap that does not exist.
  test('Step 6 — systemAuditEvents returns the PERSON change Step 3 made (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    if (!personMarker) { markStep('J', 6, 'BLOCKED', 'Step 3 did not land, so there is no change to look for'); return; }

    // Captured from the endpoint: entityTypes answers [{id, name}], and the event page is
    // {events, page, pageSize, totalItems, totalPages} -- each event
    // {id, timestamp, user, entityType, entityId, action, changes:{field:{old,new}}}.
    const types = await apiCall<Array<{ name?: string }>>(page, `${API}/systemAuditEvents/entityTypes`);
    const typeList = Array.isArray(types.body) ? types.body.map(t => String(t?.name ?? '')) : [];
    const ev = await apiCall<{ events?: Array<Record<string, unknown>>; totalItems?: number }>(
      page, `${API}/systemAuditEvents?page=1&pageSize=25&entityType=PERSON`);
    if (!ev.ok) {
      markStep('J', 6, 'FAIL', `systemAuditEvents HTTP ${ev.status}`,
        'This endpoint backs a shipped screen; a non-2xx is a product failure, not a gap.');
      expect(ev.ok).toBeTruthy(); return;
    }
    const rows = (ev.body?.events ?? []) as Array<Record<string, unknown>>;
    const hit = rows.some(r => JSON.stringify(r).includes(personMarker));
    markStep('J', 6, hit ? 'PASS' : 'FAIL',
      hit
        ? `PERSON change ${personMarker} is readable in systemAuditEvents (${rows.length} of ${ev.body?.totalItems} rows; entity types include ${typeList.filter(n => ['PERSON', 'PATIENT', 'RESULT_LIMITS'].includes(n)).join(', ')})`
        : `systemAuditEvents answered ${rows.length} PERSON rows and none carries ${personMarker}`,
      hit ? undefined : 'The System Audit Trail screen shows this change in the browser, so a miss here is a contract drift worth chasing, not a gap.');
    expect(hit, 'the PERSON change is readable through systemAuditEvents').toBeTruthy();
  });

  // Step 7 — CONTRACT FACT: the accession-scoped trail omits PERSON rows, by construction
  //
  // Not a defect, and deliberately not a tripwire. AuditTrailViewWorkerImpl.addPatientHistory()
  // gathers the PATIENT feed and leaves the PERSON feed commented out:
  //
  //     // historyService = new HistoryService(sample, HistoryType.PERSON);
  //     // items.addAll(historyService.getAuditTrailItems());
  //
  // So a demographic edit (name, address, phone, email) is absent from ONE accession's trail
  // while the same edit is fully visible in the System Audit Trail (Step 6). PATIENT-owned
  // fields (nationalId, externalId, gender) do reach the accession trail -- Step 4 proves it
  // with the other half of the very same save. This step pins that split so a future change to
  // either feed is noticed. If someone uncomments those lines, this step starts failing and
  // should be RETIRED, not repaired.
  test('Step 7 — accession trail carries the PATIENT half of a save and not the PERSON half (CONTRACT FACT)', async ({ page }) => {
    await page.goto(BASE);
    if (!personMarker || !patientMarker) { markStep('J', 7, 'BLOCKED', 'Step 3 did not land'); return; }
    await page.waitForTimeout(2000);
    const r = await readAuditTrail(page);
    expect(r.ok, 'audit trail readable').toBeTruthy();
    const blob = JSON.stringify(auditEntriesOf(r.body));
    const hasPatient = blob.includes(patientMarker);
    const hasPerson = blob.includes(personMarker);
    markStep('J', 7, hasPatient && !hasPerson ? 'PASS' : 'FAIL',
      `accession trail: PATIENT-owned marker present=${hasPatient}, PERSON-owned marker present=${hasPerson}`,
      hasPerson
        ? 'The PERSON feed appears to have been switched on. Retire this step rather than adjusting it.'
        : 'Both halves came from one save, so this isolates the feed, not the write.');
    expect(hasPatient, 'PATIENT-owned change reaches the accession trail').toBeTruthy();
    expect(hasPerson, 'PERSON-owned change is absent from the accession trail (known split)').toBeFalsy();
  });
});
