/**
 * tests/ogc803-804-referral-accept-reject.spec.ts
 *
 * OGC-803 — Accept-to-Analysis (reception model)
 * OGC-804 — Reject + terminal close + re-collection notification
 *
 * Both stories are IN REVIEW. This file is the regression cover for what they shipped.
 *
 * ============================================================================
 * WHAT THE PRODUCT DOES, MEASURED 2026-09-15 AGAINST
 * itechuw/openelis-global-2:develop AT https://localhost:10443
 * ============================================================================
 *
 * THE TWO ACTIONS LIVE ON ONE ROW. Accept and Reject are both RETURNED-only:
 * `ReferenceLabResults.jsx` renders them on `ReturnedTable` rows and in `ExpandPanel`
 * under `mode === "returned"`, and nowhere else. A referral is in Returned when its
 * status is COMPLETED and it is neither `manually_entered` nor `reconciled`
 * (`ReferenceLabResultsServiceImpl.belongsInBucket`).
 *
 * THE ENDPOINTS.
 *   PUT /rest/reference-lab-results/referrals/{id}/accept   -> 204 | 404 | 409 | 500
 *   PUT /rest/reference-lab-results/referrals/{id}/reject   -> 204 | 400 | 404 | 409 | 500
 *        body {reasonCode, reasonText}; reasonText is @NotBlank, reasonCode is not.
 * Both are `@PreAuthorize("hasAnyRole('RESULTS','VALIDATION','ADMIN')")`.
 *
 * WHAT ACCEPT ACTUALLY WRITES, read out of the database after a run:
 *   result            id 3, analysis_id 56, value 11.2      <- the peer's Observation
 *   analysis 56       status_id 6 = Finalized               <- released, not "not validated"
 *   referral 3        reconciled = t, reconciled_at, reconciled_by
 *   referral_status_history  COMPLETED -> COMPLETED,
 *       notes = 'REFERRAL_RESULT_RECEIVED {"analysisId":"56","source":"fhir"}'
 *   alert             REFERRAL_CRITICAL_RESULT, CRITICAL, entity Result/3,
 *       context {"range":"","value":"11.2","deepLink":"/result?analysisId=56",
 *                "testCode":"3","analysisId":"56"}
 *
 * WHAT REJECT ACTUALLY WRITES:
 *   referral          status REJECTED, reject_reason_code, reject_reason_text
 *   analysis          status_id 29 = RejectedByReferenceLab   (measured on 58 and 64)
 *   referral_status_history  REQUESTED -> REJECTED,
 *       notes = 'REFERRAL_RESULT_REJECTED [<code>] <text>'
 *   alert             REFERRAL_REJECTED, CRITICAL, entity Referral/<id>,
 *       context {"reasonCode":...,"reasonText":...,"referralId":...}
 *   plus the OGC-589 notification REFERRAL_REJECTED_NEEDS_RECOLLECTION, fired after
 *   commit, and a best-effort FHIR publish. Neither is asserted here: both are
 *   fire-and-forget by design and a test that failed on an unreachable FHIR store would
 *   be reporting the store, not the story.
 *
 * The database readings above are evidence for this header, not assertions. Everything
 * the cases assert is read back through the application's own API or its own screen —
 * a spec that reached into the schema would go green on a build that wrote the right
 * rows and showed the user nothing.
 *
 * ============================================================================
 * THIS SUITE CONSUMES ITS SUBJECTS, AND THEY CANNOT BE MADE FROM INSIDE
 * ============================================================================
 * Nothing in this instance can put a referral into Returned. `markReferralCompleted` is
 * called from exactly one place — `FhirApiWorkFlowServiceImpl.beginTaskImportResultsPath`,
 * a @Scheduled poll over `org.openelisglobal.remote.source.uri` — and
 * `markReferralCompletedFromManualEntry` sets `manually_entered`, which routes the row to
 * History instead. So the only way to fill the bucket is to BE the peer lab and write the
 * four resources the poll looks for into the FHIR store. That needs a client certificate
 * out of the webapp container's keystore, which is why it is a shell script and not a
 * fixture:
 *
 *     ./scripts/mint-returned-referral.sh <referralId>      # one Returned referral
 *
 * A full pass of this file spends TWO of them (one Accepted, one Rejected). The cases
 * that need one say so by name when the bucket is empty; none of them skips, because a
 * case that quietly passes on an empty dashboard reports "no bug" having looked at
 * nothing.
 *
 * For the same reason this file is NOT in the CI shards — see `ci-suites.json`,
 * `excluded`. It is a local-stack suite, run after minting.
 *
 * ============================================================================
 * FLIP-WHEN-FIXED
 * ============================================================================
 * AR-803-04 is the only marked case. It asserts the SPEC — that an Accept which cannot
 * be performed says so — and is `test.fail()` while the product answers 204 and does
 * nothing. A failure there is good news: delete the marker, keep the assertion. See
 * OGC-1215, which is the same silent-no-op defect reached through reject/dispatch.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest';
const ROUTE = '/SampleShipment/reference-lab-results';
const MINT = './scripts/mint-returned-referral.sh';

interface ResultCard {
  testName?: string;
  value?: string;
  units?: string;
  referenceRange?: string;
  interpretation?: string;
  note?: string;
}
interface Referral {
  id: string;
  labNumber?: string;
  status?: string;
  requestor?: string;
  outcome?: string;
  reconciledAt?: string;
  results?: ResultCard[];
}
interface Alert {
  id?: number | string;
  alertType?: string;
  severity?: string;
  alertEntityType?: string;
  alertEntityId?: number | string;
  contextData?: unknown;
  message?: string;
}

/** Every read goes through the page so it carries the session cookie and the CSRF token. */
async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; ct: string; text: string }> {
  return page.evaluate(
    async ([m, p, b]) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(p as string, {
        method: m as string,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'en',
          'X-CSRF-Token': csrf,
        },
        body: b === null ? undefined : (b as string),
      });
      return {
        status: res.status,
        ct: res.headers.get('content-type') || '',
        // Generous, deliberately: an earlier cut at 2000 chars silently truncated a
        // three-referral view payload into invalid JSON, and the parse error read like a
        // product fault. Errors are short; view bodies are not.
        text: (await res.text().catch(() => '')).slice(0, 400_000),
      };
    },
    [method, path, body === undefined ? null : JSON.stringify(body)] as const
  );
}

async function readView(page: Page, view: 'outstanding' | 'returned' | 'history'): Promise<Referral[]> {
  const res = await api(page, 'GET', `${REST}/reference-lab-results/referrals?view=${view}`);
  expect(
    res.ct,
    `GET referrals?view=${view} answered ${res.status} ${res.ct}. text/html means the SPA ` +
      `catch-all served it: the REST base is /api/OpenELIS-Global/rest, not /rest.`
  ).toContain('application/json');
  return JSON.parse(res.text) as Referral[];
}

async function readAlerts(page: Page, entityType?: string, entityId?: string): Promise<Alert[]> {
  // Both parameters or neither: AlertRestController falls back to getAll() unless it has
  // the pair, and an empty entityId fails to bind to its Long.
  const q = entityType && entityId ? `?entityType=${entityType}&entityId=${entityId}` : '';
  const res = await api(page, 'GET', `${REST}/alerts${q}`);
  expect(res.ct, `GET /alerts answered ${res.status} ${res.ct}`).toContain('application/json');
  return JSON.parse(res.text) as Alert[];
}

/** Alert.contextData comes back as a JSON object on some builds and a string on others. */
function ctx(alert: Alert): Record<string, unknown> {
  const raw = alert.contextData;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw ?? '{}')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Reference Lab Results', level: 1 }),
    'the Reference Lab Results H1 never rendered; the SPA catch-all answers 200 text/html ' +
      'for unrouted paths, so this is the route being gone or the component throwing'
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * One Returned referral, or a failure that names what to do about it. Never returns
 * undefined and never skips: the whole point of these cases is that something was in the
 * bucket and got acted on.
 */
async function takeReturned(page: Page, forWhat: string): Promise<Referral> {
  const rows = await readView(page, 'returned');
  expect(
    rows.length,
    `nothing is in "Returned — needs action", so there is no referral to ${forWhat}. ` +
      `This is a fixture state, not a product failure: only the peer-lab poll writes ` +
      `COMPLETED. Mint one and re-run:\n` +
      `    ${MINT} <referralId>     (any REQUESTED referral; see view=outstanding)\n` +
      `A full pass of this file needs two.`
  ).toBeGreaterThan(0);
  return rows[0];
}

test.describe.configure({ mode: 'serial' });

test.describe('Reference Lab Results — Accept and Reject (OGC-803 / OGC-804)', () => {
  test('AR-00 [canary]: the three dashboard views answer JSON and the buckets are disjoint', async ({
    page,
  }) => {
    await openDashboard(page);
    const [outstanding, returned, history] = await Promise.all([
      readView(page, 'outstanding'),
      readView(page, 'returned'),
      readView(page, 'history'),
    ]);

    // Without this the rest of the file is uninterpretable: every case below reads a
    // referral out of one bucket and asserts it moved to another, and a dashboard that
    // returned everything everywhere would satisfy that without the action working.
    const ids = (rs: Referral[]) => new Set(rs.map((r) => r.id));
    const o = ids(outstanding);
    const r = ids(returned);
    const h = ids(history);
    for (const [aName, a, bName, b] of [
      ['outstanding', o, 'returned', r],
      ['outstanding', o, 'history', h],
      ['returned', r, 'history', h],
    ] as const) {
      const both = [...a].filter((x) => b.has(x));
      expect(both, `referral(s) ${both.join(', ')} are in both ${aName} and ${bName}`).toHaveLength(0);
    }

    expect(
      outstanding.length + returned.length + history.length,
      'every bucket is empty — the referral seed has never run against this instance. ' +
        'Run referral-seed.setup.ts first; see helpers/referral-seed.ts.'
    ).toBeGreaterThan(0);

    console.log(
      `[AR-00] outstanding=${outstanding.length} returned=${returned.length} history=${history.length}`
    );
  });

  test('AR-803-01: Accept posts the peer result to the patient record and moves the row to History as Reconciled', async ({
    page,
  }) => {
    await openDashboard(page);
    const subject = await takeReturned(page, 'accept');

    // The value the peer returned, as the dashboard itself shows it before the Accept.
    // Asserting the posted result against THIS, rather than against a constant, is what
    // makes the case about the transfer instead of about the fixture.
    const card = (subject.results || [])[0];
    expect(
      card,
      `returned referral ${subject.id} (${subject.labNumber}) carries no result card, so ` +
        `there is nothing for Accept to post. enrichReturnedResults live-reads the ` +
        `Observations from the FHIR store — an empty card list means that read failed.`
    ).toBeTruthy();
    const peerValue = String(card!.value ?? '').trim();
    expect(peerValue, 'the peer result card has no value').not.toBe('');

    const accept = await api(page, 'PUT', `${REST}/reference-lab-results/referrals/${subject.id}/accept`);
    expect(
      accept.status,
      `PUT accept on returned referral ${subject.id} answered ${accept.status} ${accept.text}`
    ).toBe(204);

    const [returnedAfter, historyAfter] = await Promise.all([
      readView(page, 'returned'),
      readView(page, 'history'),
    ]);
    expect(
      returnedAfter.map((x) => x.id),
      `referral ${subject.id} is still in "Returned — needs action" after being accepted`
    ).not.toContain(subject.id);

    const inHistory = historyAfter.find((x) => x.id === subject.id);
    expect(inHistory, `referral ${subject.id} is in no bucket at all after Accept`).toBeTruthy();
    expect(
      inHistory!.outcome,
      `History shows referral ${subject.id} with outcome "${inHistory!.outcome}"`
    ).toBe('Reconciled');

    // The peer flagged this result High, so acceptReferral must raise the OGC-803 alert,
    // and its payload is the only place the API exposes what was actually posted.
    const critical = (await readAlerts(page))
      .filter((a) => a.alertType === 'REFERRAL_CRITICAL_RESULT')
      .map((a) => ({ a, c: ctx(a) }));
    const posted = critical.find((x) => String(x.c.value ?? '').trim() === peerValue);
    expect(
      posted,
      `no REFERRAL_CRITICAL_RESULT alert carries the peer's value ${peerValue}. ` +
        `Alerts seen: ${JSON.stringify(critical.map((x) => x.c)).slice(0, 600)}`
    ).toBeTruthy();
    expect(String(posted!.a.severity), 'a critical peer result must be a CRITICAL alert').toBe('CRITICAL');
    expect(
      String(posted!.c.analysisId ?? ''),
      'the alert must name the analysis the result was posted to'
    ).not.toBe('');
    expect(
      String(posted!.c.deepLink ?? ''),
      'the alert must deep-link to the analysis so the lab can act on it'
    ).toContain('analysisId=');

    console.log(`[AR-803-01] accepted referral ${subject.id} (${subject.labNumber}), value ${peerValue}`);
  });

  test('AR-803-02: a second Accept on the same referral is a no-op, not a second post', async ({ page }) => {
    await openDashboard(page);
    const history = await readView(page, 'history');
    const reconciled = history.find((r) => r.outcome === 'Reconciled');
    expect(
      reconciled,
      'no reconciled referral exists to re-accept; AR-803-01 must run first (this file is serial)'
    ).toBeTruthy();

    const before = (await readAlerts(page, 'Referral', reconciled!.id)).length;
    const again = await api(
      page,
      'PUT',
      `${REST}/reference-lab-results/referrals/${reconciled!.id}/accept`
    );
    // 204 is the shipped answer, and here it is defensible: the row IS reconciled, so the
    // caller's intent is already satisfied. The assertion that matters is that nothing
    // was written a second time.
    expect(again.status, `a repeat Accept answered ${again.status} ${again.text}`).toBe(204);

    const after = await readView(page, 'history');
    const still = after.find((r) => r.id === reconciled!.id);
    expect(still?.outcome, 'a repeat Accept changed the outcome').toBe('Reconciled');
    expect(
      (await readAlerts(page, 'Referral', reconciled!.id)).length,
      'a repeat Accept raised another alert; it must not re-post anything'
    ).toBe(before);
  });

  test('AR-803-03: Accept on a referral that does not exist answers 404, not 204', async ({ page }) => {
    await openDashboard(page);
    const res = await api(page, 'PUT', `${REST}/reference-lab-results/referrals/99999999/accept`);
    expect(
      res.status,
      `PUT accept on a non-existent referral answered ${res.status}. A 204 here would mean ` +
        `a client cannot tell a successful Accept from one aimed at nothing.`
    ).toBe(404);
  });

  test('AR-803-04: Accept on a referral that is not returned is refused, not silently reported as success', async ({
    page,
  }) => {
    test.fail();
    await openDashboard(page);
    const outstanding = await readView(page, 'outstanding');
    expect(
      outstanding.length,
      'no outstanding referral to aim a premature Accept at; run referral-seed.setup.ts'
    ).toBeGreaterThan(0);
    const subject = outstanding[0];

    const res = await api(page, 'PUT', `${REST}/reference-lab-results/referrals/${subject.id}/accept`);

    // THE SPEC. Accepting a referral whose results have not come back cannot succeed, so
    // it must not be reported as success. Today `acceptReferral` returns early on any
    // status other than COMPLETED and the controller answers 204 — the same silent no-op
    // as OGC-1215, reached through a different door. 409 is what the controller already
    // answers for IllegalStateException, so the shape exists; nothing raises it here.
    expect(
      res.status,
      `PUT accept on ${subject.status} referral ${subject.id} answered ${res.status}: a success ` +
        `code for an operation that did nothing. See OGC-1215.`
    ).toBe(409);

    const stillOutstanding = await readView(page, 'outstanding');
    expect(
      stillOutstanding.map((x) => x.id),
      'the referral moved, so the call was not the no-op this case is about'
    ).toContain(subject.id);
  });

  test('AR-804-01: the Reject modal offers the non-conformity reasons, a required detail, a warning and a danger confirm', async ({
    page,
  }) => {
    await openDashboard(page);
    const subject = await takeReturned(page, 'reject');

    await page.getByRole('button', { name: /Returned/ }).click();
    const row = page.locator('tr', { hasText: String(subject.labNumber) }).first();
    await expect(row, `no Returned row for ${subject.labNumber}`).toBeVisible({ timeout: 15_000 });
    // Carbon's danger--ghost button prepends a visually hidden "danger" span, so the
    // accessible name is "danger Reject". Matching on the visible word, anchored, keeps
    // this from also matching "Reject and notify clinician" later.
    await row.getByRole('button', { name: /(^|\s)Reject$/ }).click();

    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal, 'the Reject modal never opened').toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText('Reject returned result')).toBeVisible();

    // OGC-804 names these eight non-conformity types. They are the reject reason
    // vocabulary; a build that quietly shortened the list would still reject fine.
    const reasons = modal.locator('#reject-reason-code option');
    await expect(reasons).toHaveCount(8);
    await expect(reasons).toHaveText([
      'Insufficient volume',
      'Wrong sample type',
      'Damaged container',
      'Temperature deviation',
      'Hemolyzed',
      'Clotted',
      'Mislabeled',
      'Other',
    ]);

    const details = modal.locator('#reject-reason-text');
    await expect(details, 'the required free-text detail field is missing').toBeVisible();
    // The 500-character cap OGC-804 asks for is NOT asserted here — it is not enforced.
    // AR-804-06 is the tripwire for it.

    await expect(
      modal.getByText('This action cannot be undone'),
      'the modal must warn before the only destructive action in this feature'
    ).toBeVisible();
    await expect(
      modal.getByText(/Rejecting closes the originating test terminally/),
      'the warning must say what rejecting does to the originating test'
    ).toBeVisible();

    const confirm = modal.getByRole('button', { name: 'Reject and notify clinician' });
    await expect(confirm, 'the confirm button must name the consequence, not say "OK"').toBeVisible();
    await expect(
      confirm,
      'the confirm button must be the danger variant'
    ).toHaveClass(/cds--btn--danger/);

    // Leave the fixture as it was found: this case inspects, it does not spend.
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toBeHidden({ timeout: 10_000 });
  });

  test('AR-804-06: the reject detail is capped at the 500 characters the story specifies', async ({
    page,
  }) => {
    test.fail();
    await openDashboard(page);
    const subject = await takeReturned(page, 'inspect the reject modal');

    await page.getByRole('button', { name: /Returned/ }).click();
    const row = page.locator('tr', { hasText: String(subject.labNumber) }).first();
    await expect(row, `no Returned row for ${subject.labNumber}`).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /(^|\s)Reject$/ }).click();
    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // THE SPEC. OGC-804 asks for "Required free-text TextArea (maxCount 500)". The
    // component is written `<TextArea ... maxCount={500} />`, but Carbon only applies
    // maxLength and renders the counter when `enableCounter` is also set, so today the
    // field carries no maxlength and shows no counter: a user can type past the stated
    // limit with nothing to tell them. `reject_reason_text` is a `text` column so
    // nothing breaks, but `referral_status_history.notes` is VARCHAR(500) and
    // `markReferralRejected` silently caps the note it writes there — so the audit trail
    // quietly holds less than the user typed.
    //
    // Either enforcement satisfies this: the attribute, or a visible counter.
    const details = modal.locator('#reject-reason-text');
    const maxlength = await details.getAttribute('maxlength');
    const counter = modal.locator('.cds--label__counter');
    const counterShown = (await counter.count()) > 0;
    expect(
      maxlength === '500' || counterShown,
      `the detail field has maxlength="${maxlength}" and ${counterShown ? 'a' : 'no'} character ` +
        `counter, so the 500-character limit is neither enforced nor shown. Carbon needs ` +
        `enableCounter alongside maxCount.`
    ).toBe(true);

    await modal.getByRole('button', { name: 'Cancel' }).click();
  });

  test('AR-804-02: rejecting from the Returned row closes the referral and raises the rejection alert', async ({
    page,
  }) => {
    await openDashboard(page);
    const subject = await takeReturned(page, 'reject through the UI');
    const detail = `QA_AUTO rejected by AR-804-02 at ${new Date().toISOString()}`;

    await page.getByRole('button', { name: /Returned/ }).click();
    const row = page.locator('tr', { hasText: String(subject.labNumber) }).first();
    await expect(row, `no Returned row for ${subject.labNumber}`).toBeVisible({ timeout: 15_000 });
    // Carbon's danger--ghost button prepends a visually hidden "danger" span, so the
    // accessible name is "danger Reject". Matching on the visible word, anchored, keeps
    // this from also matching "Reject and notify clinician" later.
    await row.getByRole('button', { name: /(^|\s)Reject$/ }).click();

    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.locator('#reject-reason-code').selectOption('hemolyzed');
    await modal.locator('#reject-reason-text').fill(detail);
    await modal.getByRole('button', { name: 'Reject and notify clinician' }).click();
    await expect(modal, 'the modal stayed open, so the reject did not go through').toBeHidden({
      timeout: 20_000,
    });

    const [returnedAfter, historyAfter] = await Promise.all([
      readView(page, 'returned'),
      readView(page, 'history'),
    ]);
    expect(
      returnedAfter.map((x) => x.id),
      `referral ${subject.id} is still in Returned after being rejected`
    ).not.toContain(subject.id);
    const closed = historyAfter.find((x) => x.id === subject.id);
    expect(closed, `referral ${subject.id} is in no bucket after being rejected`).toBeTruthy();
    expect(closed!.outcome, `History shows outcome "${closed!.outcome}"`).toBe('Rejected');

    // OGC-804 requires a lab-side acknowledgment trigger, and the alert is where the
    // reason code and free text become readable again — they appear in no DTO.
    const alerts = (await readAlerts(page, 'Referral', subject.id)).filter(
      (a) => a.alertType === 'REFERRAL_REJECTED'
    );
    expect(
      alerts.length,
      `no REFERRAL_REJECTED alert for referral ${subject.id}; the lab is never told`
    ).toBeGreaterThan(0);
    const c = ctx(alerts[alerts.length - 1]);
    expect(String(c.reasonCode ?? ''), 'the alert must carry the reason code that was chosen').toBe(
      'hemolyzed'
    );
    expect(String(c.reasonText ?? ''), 'the alert must carry the detail the user typed').toBe(detail);
    expect(
      String(alerts[alerts.length - 1].severity),
      'a rejected referral needs re-collection; that is a CRITICAL alert'
    ).toBe('CRITICAL');

    console.log(`[AR-804-02] rejected referral ${subject.id} (${subject.labNumber}) as hemolyzed`);
  });

  test('AR-804-03: a reject with no detail is refused and changes nothing', async ({ page }) => {
    await openDashboard(page);
    const outstanding = await readView(page, 'outstanding');
    expect(outstanding.length, 'no outstanding referral; run referral-seed.setup.ts').toBeGreaterThan(0);
    const subject = outstanding[0];

    const res = await api(page, 'PUT', `${REST}/reference-lab-results/referrals/${subject.id}/reject`, {
      reasonCode: 'other',
      reasonText: '   ',
    });
    expect(
      res.status,
      `a reject with a blank detail answered ${res.status} ${res.text}. reasonText is @NotBlank, ` +
        `and a rejection with no stated reason is exactly what the clinician cannot act on.`
    ).toBe(400);

    const after = await readView(page, 'outstanding');
    expect(
      after.map((x) => x.id),
      'the referral was rejected anyway despite the 400'
    ).toContain(subject.id);
  });

  test('AR-804-04: Reject on a referral that does not exist answers 404', async ({ page }) => {
    await openDashboard(page);
    const res = await api(page, 'PUT', `${REST}/reference-lab-results/referrals/99999999/reject`, {
      reasonCode: 'other',
      reasonText: 'QA_AUTO nonexistent referral probe',
    });
    expect(res.status, `PUT reject on a non-existent referral answered ${res.status}`).toBe(404);
  });

  test('AR-804-05: a reconciled result cannot be rejected afterwards', async ({ page }) => {
    await openDashboard(page);
    const history = await readView(page, 'history');
    const reconciled = history.find((r) => r.outcome === 'Reconciled');
    expect(
      reconciled,
      'no reconciled referral to aim this at; AR-803-01 must run first (this file is serial)'
    ).toBeTruthy();

    const res = await api(
      page,
      'PUT',
      `${REST}/reference-lab-results/referrals/${reconciled!.id}/reject`,
      { reasonCode: 'other', reasonText: 'QA_AUTO reject-after-accept probe' }
    );
    expect(
      res.status,
      `rejecting an already-reconciled referral answered ${res.status} ${res.text}. The result is ` +
        `in the patient record by then; a rejection that appeared to succeed would leave the ` +
        `record and the referral disagreeing.`
    ).toBe(409);

    const after = await readView(page, 'history');
    expect(
      after.find((r) => r.id === reconciled!.id)?.outcome,
      'the reconciled referral was rejected anyway'
    ).toBe('Reconciled');
  });
});
