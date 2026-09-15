/**
 * Reference Lab Results — the FHIR contract behind the page.
 * Touches OGC-802 (returned result cards), OGC-805 (inbound DiagnosticReport routing)
 * and OGC-809 (peer Task state).
 *
 * WHY THIS FILE EXISTS, AND WHAT IT SETTLES
 * Two of the epic's eighteen stories were believed to need a SECOND OpenELIS instance
 * to test. They do not. The investigation on 2026-09-15 established the following, and
 * these cases are what keeps it true.
 *
 * 1. THERE ARE TWO FHIR SURFACES AND THEY ARE DIFFERENT SERVERS.
 *
 *      /api/OpenELIS-Global/fhir      the webapp's own read facade. Reachable from the
 *                                     browser with a session cookie. Serves exactly
 *                                     [Device, DiagnosticReport, Location, Observation,
 *                                     Organization, Patient, Practitioner,
 *                                     ServiceRequest, Specimen] and NOT Task.
 *      https://fhir.openelis.org:8443/fhir/
 *                                     the HAPI JPA store (container external-fhir-api),
 *                                     which is what org.openelisglobal.fhirstore.uri
 *                                     points at and the only place referral Tasks live.
 *                                     It requires a CLIENT CERTIFICATE; plain TLS gets
 *                                     `tlsv13 alert certificate required`.
 *
 *    So a Playwright test cannot read a referral Task directly, and a test that tried
 *    would get `HAPI-0302: Unknown resource type 'Task'` — a 404 that looks like a bug
 *    in the referral code and is not. RLR-FHIR-03 pins that boundary so nobody spends
 *    an afternoon rediscovering it.
 *
 * 2. INBOUND RESULTS ARE PULLED, NEVER PUSHED. There is no endpoint on this instance
 *    that accepts a DiagnosticReport from a peer. `FhirApiWorkFlowServiceImpl
 *    .fetchReturnedResultsFromStore` polls `org.openelisglobal.remote.source.uri` with
 *    exactly two searches:
 *
 *      Task?_id=<referral fhirTaskUuid>&status=completed&_include=Task:based-on
 *      ServiceRequest?status=completed&based-on=ServiceRequest/<original>
 *                    &_revinclude=Observation:based-on&_revinclude=DiagnosticReport:based-on
 *
 *    With `remote.source.uri` EMPTY — the shipped default in this stack's
 *    common.properties — `getRemoteStoreIdentifier()` returns empty and the method
 *    returns an empty list before issuing a request. The entire inbound path is inert,
 *    which is why "Returned — needs action" and "Reconciled today" read 0 forever on a
 *    stock instance no matter how much referral data exists.
 *
 * 3. A SECOND INSTANCE IS NOT REQUIRED. Pointing `remote.source.uri` at the SAME HAPI
 *    store the instance already writes to, and then writing peer-shaped resources into
 *    it, drives the real code path end to end. Measured 2026-09-15:
 *
 *      before: {"outstanding":3,"returned":0,"reconciledToday":0,"rejectedThisWeek":1}
 *      after the peer fixtures + one poll cycle:
 *              {"outstanding":2,"returned":1,"reconciledToday":0,"rejectedThisWeek":1}
 *      after PUT .../referrals/3/accept -> 204:
 *              {"outstanding":2,"returned":0,"reconciledToday":1,"rejectedThisWeek":1}
 *
 *    and the Returned row carried a live result card built from the peer's Observation:
 *      {"testName":"Glucose","value":"11.2","units":"mmol/L",
 *       "referenceRange":"3.9 – 5.6","interpretation":"Abnormal",
 *       "note":"QA_AUTO peer-returned result fixture"}
 *
 *    The fixtures are committed at `fixtures/fhir/referral/` with the capture recipe.
 *
 * SO WHAT DO THESE CASES ASSERT?
 * Only things that are true on ANY instance: the contract the dashboard DTO publishes,
 * and the shape of a returned result card WHEN one exists. Whether a returned referral
 * exists at all depends on a stack-level property this repository does not control, so
 * RLR-FHIR-04 states its precondition and says plainly which property is missing rather
 * than passing on an empty list. That is the difference between a test that is green
 * because the feature works and one that is green because it looked at nothing.
 *
 * Measured against itechuw/openelis-global-2:develop (product @ 5fe0ecb) on 2026-09-15.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const ROUTE = '/SampleShipment/reference-lab-results';
const REST = '/api/OpenELIS-Global/rest';
const FHIR = '/api/OpenELIS-Global/fhir';

/** FHIR R4 Task.status codes. The DTO maps ReferralStatus onto this vocabulary. */
const TASK_STATUS_CODES = [
  'draft', 'requested', 'received', 'accepted', 'rejected', 'ready', 'cancelled',
  'in-progress', 'on-hold', 'failed', 'completed', 'entered-in-error',
];

interface Referral {
  id: string;
  labNumber?: string;
  status?: string;
  fhirTaskUuid?: string | null;
  manuallyEntered?: boolean;
  resultSummary?: string;
  results?: {
    testName?: string;
    value?: string;
    units?: string;
    referenceRange?: string;
    interpretation?: string;
    note?: string;
  }[];
}

async function openPage(page: Page): Promise<void> {
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Reference Lab Results', level: 1 }),
    `the Reference Lab Results H1 never rendered; the SPA catch-all serves 200 text/html ` +
      `for unrouted paths, so this is the route being gone or the component throwing`
  ).toBeVisible({ timeout: 20_000 });
}

async function fetchRaw(page: Page, path: string): Promise<{ status: number; ct: string; body: string }> {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { Accept: 'application/json, application/fhir+json' } });
    return { status: r.status, ct: r.headers.get('content-type') || '', body: (await r.text()).slice(0, 4000) };
  }, path);
}

async function readReferrals(page: Page, view: string): Promise<Referral[]> {
  const res = await fetchRaw(page, `${REST}/reference-lab-results/referrals?view=${view}`);
  expect(
    res.ct,
    `GET ${REST}/reference-lab-results/referrals?view=${view} answered ${res.status} ${res.ct}; ` +
      `text/html means the SPA catch-all served it. The REST base is /api/OpenELIS-Global/rest, not /rest.`
  ).toContain('application/json');
  return JSON.parse(res.body) as Referral[];
}

test.describe('Reference Lab Results — FHIR contract (OGC-802 / 805 / 809)', () => {
  test('RLR-FHIR-01: every outstanding referral publishes the FHIR Task uuid that identifies it to the peer', async ({
    page,
  }) => {
    await openPage(page);
    const rows = await readReferrals(page, 'outstanding');
    expect(
      rows.length,
      `no outstanding referrals on this instance, so the DTO contract is not exercised. ` +
        `Run the referral seed (helpers/referral-seed.ts).`
    ).toBeGreaterThan(0);

    for (const r of rows) {
      // This uuid is the join between this instance and the peer: it is the id of the
      // Task in the shared FHIR store, and it is the `_id` the results poll searches on.
      // A referral without it can never have results returned to it — acceptReferral
      // throws `has no FHIR uuid to fetch results for`.
      expect(
        r.fhirTaskUuid,
        `referral ${r.id} (${r.labNumber}) has no fhirTaskUuid; it can never receive results`
      ).toBeTruthy();
      expect(
        String(r.fhirTaskUuid),
        `referral ${r.id} fhirTaskUuid "${r.fhirTaskUuid}" is not a uuid`
      ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  test('RLR-FHIR-02: referral status is published in the FHIR Task vocabulary, not the internal enum', async ({
    page,
  }) => {
    await openPage(page);
    const seen: string[] = [];
    for (const view of ['outstanding', 'returned', 'history']) {
      for (const r of await readReferrals(page, view)) {
        expect(
          r.status,
          `referral ${r.id} in the ${view} view has no status`
        ).toBeTruthy();
        // The internal enum is DRAFT/REQUESTED/RECEIVED/IN_PROGRESS/COMPLETED/
        // CANCELLED/REJECTED (plus the deprecated SENT/CREATED/FINISHED/CANCELED).
        // The DTO is required to hand out FHIR Task codes instead, because that is what
        // a peer and any consumer of this API can be expected to understand. An
        // upper-cased or underscored value here is the mapping having been dropped.
        expect(
          TASK_STATUS_CODES,
          `referral ${r.id} reports status "${r.status}", which is not a FHIR R4 Task.status code. ` +
            `A value like "REQUESTED" or "IN_PROGRESS" means the internal ReferralStatus enum ` +
            `leaked through ReferenceLabResultsServiceImpl.toFhirStatus.`
        ).toContain(String(r.status));
        seen.push(String(r.status));
      }
    }
    expect(seen.length, 'no referrals in any view; run the referral seed').toBeGreaterThan(0);
  });

  test('RLR-FHIR-03 [OGC-809]: the browser-reachable FHIR facade does not serve Task', async ({ page }) => {
    await openPage(page);

    // This is a CHARACTERISATION test, and it is deliberately written to go red if the
    // gap closes. OGC-809 is "inbound peer Task state reads". A test cannot read a
    // referral's Task from anywhere a test can reach: the only FHIR endpoint reachable
    // with a session cookie is the webapp facade, and it does not register a Task
    // provider. The store that does is behind mutual TLS.
    //
    // FLIP-WHEN-FIXED: if a Task provider is added to the facade, this case fails with
    // "Task is now served". That is the signal that OGC-809 became directly testable
    // over HTTP and this file should grow real Task-state assertions instead. Do not
    // relax the assertion; replace it.
    const meta = await fetchRaw(page, `${FHIR}/metadata`);
    expect(
      meta.ct,
      `GET ${FHIR}/metadata answered ${meta.status} ${meta.ct}; the FHIR facade is not where it was`
    ).toContain('fhir+json');
    expect(meta.body, 'the CapabilityStatement is not a CapabilityStatement').toContain('CapabilityStatement');

    const task = await fetchRaw(page, `${FHIR}/Task?_count=1`);
    expect(
      task.status,
      `GET ${FHIR}/Task returned ${task.status}. If this is now 200, Task is served by the ` +
        `webapp facade and OGC-809 can be asserted directly — replace this case rather than relaxing it.`
    ).toBe(404);
    expect(
      task.body,
      `expected HAPI's "Unknown resource type 'Task'" OperationOutcome, got: ${task.body.slice(0, 300)}`
    ).toContain("Unknown resource type 'Task'");
  });

  test('RLR-FHIR-04 [OGC-802/805]: a returned referral carries the peer result card, or says why none exists', async ({
    page,
  }) => {
    await openPage(page);
    // The Returned view ONLY. `enrichReturnedResults` is called for
    // `DashboardView.RETURNED` and for no other view, so a reconciled referral that
    // has moved to History carries no `results` array even though results were
    // returned for it. Looking in History too would make this case fail for a reason
    // that is not a defect.
    const returned = await readReferrals(page, 'returned');
    const history = await readReferrals(page, 'history');
    const withResults = returned.filter((r) => (r.results || []).length > 0);

    // The precondition, stated rather than skipped. A referral only becomes COMPLETED
    // through the results poll, which needs org.openelisglobal.remote.source.uri set.
    expect(
      withResults.length,
      `no referral on this instance carries a returned result payload. That is the expected ` +
        `state when org.openelisglobal.remote.source.uri is EMPTY: ` +
        `FhirApiWorkFlowServiceImpl.fetchReturnedResultsFromStore returns an empty list without ` +
        `issuing a request, so nothing can ever reach COMPLETED. To exercise this, point that ` +
        `property at the instance's own FHIR store and load fixtures/fhir/referral/peer-*.json ` +
        `into it (see that directory's README) — no second OpenELIS instance is needed. ` +
        `Returned rows: ${returned.length} (history rows, for context: ${history.length}).`
    ).toBeGreaterThan(0);

    for (const r of withResults) {
      for (const card of r.results!) {
        // toResultCard maps Observation -> card. testName comes from code.text or the
        // first coding's display, value from valueQuantity/valueString/valueCodeableConcept.
        // A card with neither is an Observation whose value shape the mapper does not
        // handle, which renders as an empty row on the page and is the failure this catches.
        expect(
          card.testName,
          `referral ${r.id} returned a result card with no test name: ${JSON.stringify(card)}`
        ).toBeTruthy();
        expect(
          card.value,
          `referral ${r.id} card "${card.testName}" has no value; ReferenceLabResultsServiceImpl` +
            `.toResultCard handles valueQuantity, valueString and valueCodeableConcept only`
        ).toBeTruthy();
      }
      expect(
        r.resultSummary,
        `referral ${r.id} has ${r.results!.length} result card(s) but no resultSummary for the table row`
      ).toBeTruthy();
    }
  });
});
