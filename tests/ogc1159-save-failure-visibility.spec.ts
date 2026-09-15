/**
 * OGC-1159 — a rejected order save must be reported to the user, in words they can read.
 *
 * THE DEFECT
 * `/order/environmental/enter` with Requesting Organization and Requestor both blank returns
 * HTTP 400 with a correct, well-formed field error, and the UI surfaces NOTHING: no inline
 * notification, no toast, no field highlight, no navigation. The user cannot tell a rejected
 * save from an unresponsive button. A secondary defect: where a notice IS shown, it prints
 * the raw i18n key rather than a sentence.
 *
 * WHAT THE SEPTEMBER REVALIDATION FOUND, AND WHY IT IS WORSE THAN FILED
 * `OrderContext.jsx` grew a `readSaveFailure` that maps `body.fieldErrors[]` into state, and
 * `order/SaveFailureNotice.jsx` renders it as a Carbon InlineNotification — the mechanism
 * the ticket asked for was built. It is mounted in `steps/OrderEnter.jsx`,
 * `steps/ClinicalOrderEnter.jsx` and `steps/VectorOrderEnter.jsx`.
 * `steps/EnvironmentalOrderEnter.jsx` has no import and no mount. So the fix landed on two
 * lanes out of three and missed this ticket's lane. And `SaveFailureNotice` renders
 * `{field}: {message}` verbatim with no `FormattedMessage`, while neither
 * `errors.requester.org.or.requestor.required` nor `errors.no.sample` exists in
 * `frontend/src/languages/en.json` — so every lane that does show the notice shows a key.
 *
 * IT IS FIXED. BOTH HALVES. Measured on two different develop frontend builds on
 * 2026-09-15 with the same driver, the same stack and the same instance — the wizard driven
 * for real with a lab number, a sampling site, a sample type, one test, and the requester
 * left blank, exactly as the ticket's reproduction steps say:
 *
 *   itechuw/openelis-global-2-frontend:develop, image built 2026-09-11
 *     ENVIRONMENTAL  POST /rest/SamplePatientEntry -> 400
 *                    {"globalErrors":[],"fieldErrors":[{"field":"sampleOrderItems",
 *                     "defaultMessage":"errors.requester.org.or.requestor.required"}], ...}
 *                    visible notifications afterwards: []              <- SILENCE, as filed
 *     VECTOR         POST -> 400, identical body
 *                    visible notification: "The order was not saved sampleOrderItems:
 *                    errors.requester.org.or.requestor.required sampleOrderItems:
 *                    errors.requester.org.or.requestor.required"       <- RAW KEY, as filed
 *
 *   itechuw/openelis-global-2-frontend:develop, image pulled 2026-09-15 (same day)
 *     ENVIRONMENTAL  POST -> 400, identical body
 *                    visible notification: "The order was not saved sampleOrderItems:
 *                    Enter at least one of Requesting Organization or Requester contact.
 *                    sampleOrderItems: Enter at least one of Requesting Organization or
 *                    Requester contact."
 *     VECTOR         POST -> 400, identical body, the same resolved sentence
 *
 * Two builds, opposite results, one driver. The notice is now mounted on the Environmental
 * lane and the key resolves to a sentence on both lanes, so the revalidation's two
 * recommendations — mount `SaveFailureNotice` in `steps/EnvironmentalOrderEnter.jsx`, and
 * resolve `defaultMessage` through the i18n bundle — have both landed.
 *
 * THE BACKEND IS UNCHANGED AND WAS NEVER THE PROBLEM: the 400 body is byte-identical across
 * the two builds, still carrying the raw key as its `defaultMessage`. The whole difference
 * is client-side, which is what the revalidation predicted.
 *
 * ALL FOUR CASES WERE WRITTEN AS FLIP-WHEN-FIXED TRIPWIRES AND THREE WERE UNMARKED THE SAME
 * DAY. ENV-1, ENV-2 and VEC-2 carried `test.fail()` on the strength of the 2026-09-11
 * measurement; on the newer image the run reported "Expected to fail, but passed" for all
 * three. The correct response to a red flip-when-fixed case is to delete the marker and
 * keep the assertion, which is what happened. From here these four guard the fix against
 * regression.
 *
 * THE MESSAGE STILL PRINTS TWICE ("... Requester contact. sampleOrderItems: Enter at least
 * one ...") and still leads with the raw field name `sampleOrderItems`. Neither is asserted
 * on: neither is this ticket, and inventing assertions for cosmetic findings nobody has
 * triaged is how a suite starts failing for opinions. Recorded here so it is not lost.
 *
 * WHAT THESE CASES ASSERT
 * The SPEC, not the behaviour: a failed save must surface a human-readable message. Two
 * distinct assertions, because they fail for different reasons and get fixed by different
 * changes:
 *   (a) something visible appears at all      — fixed by mounting SaveFailureNotice
 *   (b) what appears is not a raw i18n key    — fixed by adding the keys to en.json and
 *                                               resolving them in the notice
 *
 * ENV-2 AND VEC-2 STILL ASSERT THAT A MESSAGE EXISTS BEFORE ASSERTING THAT IT IS READABLE,
 * even though a message now exists on both lanes. That guard is not redundant: "no visible
 * message contains a raw i18n key" is trivially true of a lane that shows no message at all,
 * so without it a regression back to silence would turn ENV-1 red and leave ENV-2 green,
 * reporting the readability of nothing.
 *
 * VEC-1 is the CANARY. It drives the identical path on a lane where the notice IS mounted
 * and is NOT marked test.fail(). Without it, a broken driver — a wizard that never reaches
 * Save, a selector that never matches — would make every tripwire here report a confirmed
 * defect, because a tripwire counts any throw as its expected failure (harness ref 12.31).
 */
import { test, expect, Page } from '@playwright/test';
import {
  generateLabNumber,
  selectSite,
  selectOrAddSite,
  clickButton,
  selectSampleTypeAgnostic,
  fillUnsetSelects,
  pickTestAgnostic,
  selectComplianceStandard,
} from './docs/order-helpers';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

/**
 * A string that looks like an i18n key rather than a sentence: all-lowercase dotted
 * segments, e.g. `errors.no.sample`, `errors.requester.org.or.requestor.required`. Anchored,
 * and applied to whitespace-separated TOKENS rather than to whole sentences, so ordinary
 * prose that happens to end in a full stop cannot match.
 */
const LOOKS_LIKE_I18N_KEY = /^[a-z]+(\.[a-z.]+)+$/;

/** Every token in `text` that looks like an unresolved i18n key. */
function rawKeysIn(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/[.,;:]+$/, ''))
    .filter((t) => t.length > 3 && LOOKS_LIKE_I18N_KEY.test(t));
}

type Attempt = {
  lab: string;
  posts: { status: number; body: string }[];
  notices: string[];
};

/**
 * Drive a real order-entry wizard to a real backend rejection.
 *
 * Follows OGC-1159's own reproduction steps: generate a lab number, select a sampling site,
 * set a sample type and one test, leave Requesting Organization and Requestor completely
 * empty, click Save & Next. The wizard's `canSave` does not include the requester, so the
 * button is live and the 400 is reachable exactly as filed.
 *
 * The three Carbon traps this routes around are documented in tests/docs/order-helpers.ts
 * and are the reason this drives through those helpers rather than through raw locators:
 * Generate Lab Number needs an in-page DOM click, the Sampling Site is a typeahead that must
 * be committed through its Select/Add affordance, and Carbon checkboxes only update React
 * state when the VISIBLE LABEL is clicked (clicking the hidden input hangs for ~60s).
 */
async function attemptSaveWithoutRequester(page: Page, lane: 'environmental' | 'vector'): Promise<Attempt> {
  const posts: { status: number; body: string }[] = [];
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' && /SamplePatientEntry/i.test(r.url())) {
      let body = '';
      try { body = (await r.text()).slice(0, 1000); } catch { body = '<unreadable>'; }
      posts.push({ status: r.status(), body });
    }
  });

  await page.goto(`${BASE}/order/${lane}/enter`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const lab = await generateLabNumber(page);
  const sited = (await selectSite(page, 'QA').catch(() => false))
    || (await selectOrAddSite(page, 'QA_AUTO Site').catch(() => false));
  const sampleType = await selectSampleTypeAgnostic(page, lane, { prefer: /water|adult\s*mosquito|blood/i });
  await fillUnsetSelects(page, /^sampleType/i).catch(() => []);
  await page.waitForTimeout(800);
  const ticked = sampleType ? await pickTestAgnostic(page, sampleType.id, /^p\s*H$/i).catch(() => '') : '';
  if (lane === 'environmental') await selectComplianceStandard(page, /./).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  console.log(`[${lane}] lab=${lab} site=${sited} sampleType=${JSON.stringify(sampleType)} test=${JSON.stringify(ticked)}`);

  await clickButton(page, /save & next|save and next/i, 6000);
  await page.waitForTimeout(4000);

  const notices = await page.evaluate(() => {
    const visible = (e: Element) => !!((e as HTMLElement).offsetParent || e.getClientRects().length);
    const sel = [
      '.cds--inline-notification',
      '.cds--actionable-notification',
      '.cds--toast-notification',
      '.cds--form-requirement',
      '[role="alert"]',
      '[role="status"]',
    ].join(',');
    return [...document.querySelectorAll(sel)]
      .filter(visible)
      .map((e) => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });

  console.log(`[${lane}] POSTs=${JSON.stringify(posts)}`);
  console.log(`[${lane}] visible notices=${JSON.stringify(notices)}`);
  return { lab, posts, notices };
}

/**
 * Assert that this attempt really did produce the rejection the case is about.
 *
 * Without this every assertion below could pass — or fail — for reasons that have nothing to
 * do with the defect: a wizard that never reached Save sends no POST and shows no notice,
 * which is indistinguishable from silence-after-400 unless the 400 is proved separately.
 */
function assertReached400(a: Attempt, lane: string) {
  expect(
    a.lab,
    `[${lane}] the wizard generated a lab number, so the form was really driven`,
  ).toMatch(/\w/);
  expect(
    a.posts.length,
    `[${lane}] Save & Next actually submitted: exactly one POST to /rest/SamplePatientEntry ` +
    'reached the server. Zero means the button never fired and nothing below is measuring ' +
    'the defect.',
  ).toBeGreaterThan(0);
  const last = a.posts[a.posts.length - 1];
  expect(
    last.status,
    `[${lane}] the backend REJECTED the save (this is the precondition for the whole file; ` +
    `got ${last.status} with body ${last.body.slice(0, 200)})`,
  ).toBe(400);
  expect(
    last.body,
    `[${lane}] and the rejection carries a field error the UI could have rendered`,
  ).toMatch(/fieldErrors/);
}

test.describe('OGC-1159 — a failed order save must say so, readably', () => {
  test('ENV-1: an Environmental save rejected with HTTP 400 puts something visible on the screen', async ({ page }) => {
    // OGC-1159, half 1: the lane the ticket was filed against. The recommended fix was one
    // import — mount `SaveFailureNotice` in `steps/EnvironmentalOrderEnter.jsx` the way
    // `ClinicalOrderEnter.jsx` and `VectorOrderEnter.jsx` already did — and it has landed.
    //
    // FLIP-WHEN-FIXED MARKER REMOVED 2026-09-15. Against the 2026-09-11 develop frontend the
    // POST returned 400 and a scan of every visible .cds--inline-notification /
    // .cds--actionable-notification / .cds--toast-notification / .cds--form-requirement /
    // [role=alert] / [role=status] afterwards returned [] — total silence, exactly as filed —
    // so this case carried `test.fail()`. Against the frontend pulled the same day it
    // reported "Expected to fail, but passed" and the notice was there. Marker deleted,
    // assertion untouched.
    test.setTimeout(240_000);

    const a = await attemptSaveWithoutRequester(page, 'environmental');
    assertReached400(a, 'environmental');

    expect(
      a.notices,
      'a save the server refused must be reported to the user. Nothing visible appeared, so ' +
      'a rejected save is indistinguishable from an unresponsive button.',
    ).not.toEqual([]);
  });

  test('ENV-2: the message an Environmental failure shows is a sentence, not a raw i18n key', async ({ page }) => {
    // OGC-1159, half 2, on the lane the ticket was filed against.
    //
    // FLIP-WHEN-FIXED MARKER REMOVED 2026-09-15. On the 2026-09-11 frontend this failed for
    // ENV-1's reason — the Environmental lane showed nothing at all — and was marked
    // `test.fail()` accordingly. On the newer frontend it reports the resolved sentence
    // "Enter at least one of Requesting Organization or Requester contact." and passes.
    //
    // The "a message exists" assertion below is KEPT rather than dropped as redundant: "no
    // visible message is a raw key" is trivially true of a lane showing no message, so
    // without it a regression back to silence would turn ENV-1 red and leave this one green,
    // certifying the readability of nothing.
    test.setTimeout(240_000);

    const a = await attemptSaveWithoutRequester(page, 'environmental');
    assertReached400(a, 'environmental');

    expect(
      a.notices.length,
      'ENV-2 precondition, which is ENV-1\'s subject: a message has to exist before it can be ' +
      'readable. If this line is the one that fails, the defect being reported is ENV-1\'s.',
    ).toBeGreaterThan(0);

    const keys = a.notices.flatMap(rawKeysIn);
    expect(
      keys,
      'the failure message must be human-readable. Tokens matching /^[a-z]+(\\.[a-z.]+)+$/ are ' +
      'unresolved i18n keys leaking through SaveFailureNotice, which renders {field}: {message} ' +
      'verbatim while the keys are absent from en.json.',
    ).toEqual([]);
  });

  test('VEC-1: a Vector save rejected with HTTP 400 puts something visible on the screen', async ({ page }) => {
    // THE CANARY, and NOT marked test.fail(). It drives the identical path on a lane where
    // `SaveFailureNotice` IS mounted, so it passes today and proves the driver above really
    // reaches a real rejection and really can see a notice when one is rendered.
    //
    // It earned its keep immediately: it is what made "the Environmental lane shows a
    // notice now" a product fact rather than a possible harness accident, because the same
    // driver produced the same notice on the lane that always had one.
    //
    // Measured 2026-09-15: POST 400, and the page shows
    // "The order was not saved sampleOrderItems: errors.requester.org.or.requestor.required …"
    test.setTimeout(240_000);

    const a = await attemptSaveWithoutRequester(page, 'vector');
    assertReached400(a, 'vector');

    expect(
      a.notices,
      'the Vector lane mounts SaveFailureNotice, so a rejected save is reported. If THIS goes ' +
      'red, the driver is broken and the Environmental results above mean nothing.',
    ).not.toEqual([]);
  });

  test('VEC-2: the message a Vector failure shows is a sentence, not a raw i18n key', async ({ page }) => {
    // OGC-1159, half 2, on the lane where the raw key was observable while the defect was
    // open. This is the independent evidence that the raw-key half was real and
    // lane-independent, and that it is now closed on both lanes rather than papered over on
    // one.
    //
    // FLIP-WHEN-FIXED MARKER REMOVED 2026-09-15. On the 2026-09-11 frontend this lane
    // rendered
    //   "The order was not saved sampleOrderItems: errors.requester.org.or.requestor.required
    //    sampleOrderItems: errors.requester.org.or.requestor.required"
    // because `SaveFailureNotice` printed {field}: {message} verbatim and neither
    // errors.requester.org.or.requestor.required nor errors.no.sample existed in
    // frontend/src/languages/en.json. On the newer frontend the same 400 renders
    //   "... sampleOrderItems: Enter at least one of Requesting Organization or Requester
    //    contact. ..."
    // The backend still sends the raw key as its defaultMessage, so the resolution is
    // happening on the client — which means this assertion is guarding the client-side
    // lookup, and is exactly what would catch a future backend key that nobody added to the
    // bundle.
    test.setTimeout(240_000);

    const a = await attemptSaveWithoutRequester(page, 'vector');
    assertReached400(a, 'vector');

    expect(
      a.notices.length,
      'VEC-2 precondition: the Vector lane renders a notice (VEC-1 is the canary for this)',
    ).toBeGreaterThan(0);

    const keys = a.notices.flatMap(rawKeysIn);
    expect(
      keys,
      'the notice must not print unresolved i18n keys at the user — tokens matching ' +
      '/^[a-z]+(\\.[a-z.]+)+$/ inside ' + JSON.stringify(a.notices),
    ).toEqual([]);
  });
});
