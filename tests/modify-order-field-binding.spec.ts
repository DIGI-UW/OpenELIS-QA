/**
 * OpenELIS Global — Modify Order (Edit Order): field-binding and save-gate regressions.
 *
 * FLIP-WHEN-FIXED. Every assertion in this file encodes behaviour measured live. A
 * [DEFECT] case asserts the BROKEN behaviour, so a failure is good news: it means the
 * defect was fixed and the assertion should be inverted, not that the harness drifted.
 *
 * ============================================================================
 * 2026-09-15 — FOUR OF THE SIX DEFECT CASES WENT RED. THEY HAVE BEEN FLIPPED.
 * ============================================================================
 * The whole config was run against a LOCAL develop stack
 * (itechuw/openelis-global-2:develop, image built 2026-09-11, reported version
 * 3.2.2.0, BASE=https://localhost:10443) on 2026-09-15:
 *
 *     6 failed · 1 skipped · 2 passed
 *
 * That is the flip-when-fixed signal this file exists to raise, and the six
 * failures were NOT one fault: they were five different consequences of the
 * same product change plus one harness fault of our own.
 *
 *   MO-1  RED   the ORDER step no longer has an inline Lab Number input at all.
 *               A live DOM dump of every input on the step (2026-09-15) lists
 *               `#reassign-labNo` — inside the hidden accession-REASSIGNMENT
 *               modal — and nothing else labNo-shaped. The number is a heading.
 *               The mis-binding to `newAccessionNumber` is gone because the
 *               mis-bound control is gone.                       -> FLIPPED
 *   MO-2  RED   `input#order_nextVisitDate` now renders "14/10/2026", which is
 *               exactly the order's nextVisitDate.               -> FLIPPED
 *   MO-3  n/a   RETRACTED 2026-09-15. Not a defect: received date is auto-set by
 *               configuration and is NOT NULL in the schema, and an Edit Order
 *               save provably leaves a stored value alone. Repurposed into the
 *               assertion the original never made.               -> RETRACTED
 *   MO-4  RED   form state now carries "QA_AUTO Referring Clinic";
 *               loadOrderValues no longer blanks referringSiteName. -> FLIPPED
 *   MO-5  RED   its premise (an empty, unvalidated Lab Number input) dissolved
 *               with the input. RETARGETED — see the case.
 *   MO-6  RED   not a defect case at all: a positive assertion whose first line
 *               filled the removed `#labNo`. Our locator, our fault. REPAIRED.
 *   MO-7  RED   `[data-cy="generate-labNumber"]` does not exist on the ORDER
 *               step. The only generate affordance left is
 *               `[data-cy="reassign-generate-labNumber"]`, which lives in the
 *               hidden reassignment modal.                       -> FLIPPED
 *
 * The four flipped cases keep their IDs and each carries a note recording what
 * it used to assert. The tables and narrative below are the ORIGINAL 2026-09-01
 * findings and are kept deliberately: they are the evidence the ticket was
 * raised on, and deleting them would erase why these cases exist.
 */

/*
 * ORIGINAL FINDINGS, 2026-09-01, testing.openelis-global.org (v3.2.2.0)
 * --------------------------------------------------------------------
 *
 * THE SHAPE OF THE DEFECT
 * -----------------------
 * `/SampleEdit` -> `/ModifyOrder?accessionNumber=...` loads the order correctly — the REST
 * payload is complete and the React form state is populated — and then renders a form that
 * misrepresents that state, in BOTH directions:
 *
 *   field               REST payload        React form state    rendered input
 *   ------------------  ------------------  ------------------  ------------------
 *   labNo               DEV...564           DEV...564           (empty)      <- MO-1
 *   nextVisitDate       25/08/2026          25/08/2026          (empty)      <- MO-2
 *   receivedDate        (absent)            (absent)            today        <- MO-3
 *   referringSiteName   QA_AUTO Ref Clinic  ""                  QA_AUTO ...  <- MO-4
 *
 * Two exact code sites account for it:
 *
 *   frontend/src/components/addOrder/AddOrder.jsx
 *     value={ isModifyOrder
 *       ? orderFormValues.newAccessionNumber    // "" on an ordinary edit
 *       : orderFormValues.sampleOrderItems.labNo }
 *
 *   frontend/src/components/modifyOrder/ModifyOrder.jsx  (loadOrderValues)
 *     data.sampleOrderItems.referringSiteName = "";       // required field discarded on load
 *
 * `newAccessionNumber` is the field for REASSIGNING a sample's accession number. Binding the
 * ordinary Lab Number input to it is what produces both the empty box and MO-7 below.
 *
 * WHY MO-7 IS THE ONE THAT MATTERS
 * --------------------------------
 * Because Lab Number renders empty and carries a red required asterisk, the natural user
 * action is to click "Generate" beside it. Doing so writes a NEW accession number into
 * `newAccessionNumber`, and submitting silently REASSIGNS the specimen's identifier.
 * Measured end-to-end 2026-09-01 on a disposable order:
 *
 *   before:  DEV01260000000000519  (Mulago, 1x WBC, patient Parker)
 *   action:  open Modify Order -> Next -> Next -> click Generate -> Submit
 *   after:   DEV01260000000000519 -> gone (exists:false, no tests)
 *            DEV01260000000000644 -> holds the order, same site, same test
 *
 * ...and the confirmation screen's PRINT LABELS panel then offered the OLD number,
 * DEV01260000000000519, so a label printed from that screen carries a dead accession
 * number. Specimen identity changed silently; the barcode handed to the user was wrong.
 *
 * MO-7 asserts the HAZARD without executing it (it proves Generate arms a different number
 * and that Submit is enabled). The destructive end-to-end proof is MO-7-DESTRUCTIVE, which
 * is skipped unless MO_DESTRUCTIVE=1 — it orphans an accession number every time it runs,
 * and that is not something a routine suite should do to a shared instance.
 *
 * NOT A DEFECT (measured, recorded so nobody re-raises it)
 * -------------------------------------------------------
 * A plain save — Lab Number typed back correctly, nothing else touched — writes NOTHING
 * wrong. Full before/after field diff on DEV01260000000000519 came back empty: site name,
 * next-visit date, provider, priority and tests all preserved. The backend ignores the
 * blanked and fabricated values. MO-6 pins that down so the ticket cannot drift into
 * claiming data corruption that does not happen.
 *
 * Run:
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=modify-order.config.ts
 */

import { test, expect, Page } from '@playwright/test';
import { seedModifiableOrder } from '../helpers/data-factory';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

/** Opt-in gate for the one test that mutates a real accession number. */
const RUN_DESTRUCTIVE = process.env.MO_DESTRUCTIVE === '1';

type OrderPayload = {
  accessionNumber: string;
  labNo: string;
  referringSiteName: string;
  referringSiteId: string;
  providerFirstName: string;
  providerLastName: string;
  nextVisitDate?: string;
  receivedDate?: string;
  requestDate?: string;
  tests: string[];
};

/** Reads an order straight off the same endpoint ModifyOrder itself loads from. */
async function fetchOrder(page: Page, accession: string): Promise<OrderPayload | null> {
  return page.evaluate(async (acc) => {
    const r = await fetch(
      `/api/OpenELIS-Global/rest/SampleEdit?patientId=&accessionNumber=${acc}`,
      { headers: { Accept: 'application/json' }, credentials: 'include' },
    );
    const text = await r.text();
    // A lapsed session answers 200 with the login PAGE; treat that as "no order", never as data.
    if (text.trimStart().startsWith('<')) return null;
    const j = JSON.parse(text);
    const s = j.sampleOrderItems;
    if (!s || !s.labNo) return null;
    return {
      accessionNumber: j.accessionNumber,
      labNo: s.labNo,
      referringSiteName: s.referringSiteName ?? '',
      referringSiteId: s.referringSiteId ?? '',
      providerFirstName: s.providerFirstName ?? '',
      providerLastName: s.providerLastName ?? '',
      nextVisitDate: s.nextVisitDate,
      receivedDate: s.receivedDate,
      requestDate: s.requestDate,
      tests: (j.existingTests || []).map((t: any) => t.testName),
    };
  }, accession);
}

/**
 * Gets an order that Modify Order can actually reach the final step with — i.e.
 * one whose provider last name is non-empty (see MO-5: a blank one silently
 * disables Submit for ever), which carries a next-visit date, no received date,
 * a referring site and at least one test.
 *
 * IT SEEDS THAT ORDER RATHER THAN HOPING FOR ONE (2026-09-14). This used to scan
 * accessions DEV0126...000500–000600 and assert one matched. On the CI develop
 * stack nothing in that window does — the instance holds a single order, with no
 * provider and no tests — so all seven MO cases died in the fixture on "the
 * instance holds at least one order with a provider last name and a test" and
 * the OGC-1191 regressions were never executed at all. A FLIP-WHEN-FIXED suite
 * that cannot run is worse than a failing one: it reports on a Highest-priority
 * defect it never looked at.
 *
 * It REUSES a suitable order when the instance already has one and only seeds
 * when it does not, so a re-run (or a worker restart after a failure, which
 * re-imports this module) does not leave a trail of orders behind. The result is
 * cached per worker: these seven cases want the SAME order, not seven.
 */
let seeded: Promise<OrderPayload> | null = null;

/** Everything the seven cases below need to be able to say anything at all. */
function isUsable(o: OrderPayload | null): o is OrderPayload {
  return !!o && !!o.providerLastName && !!o.referringSiteName && o.tests.length > 0;
}

/**
 * Look for an order already on the instance that has the shape above, newest
 * first, before creating one.
 *
 * The window is located from the accession generator rather than hard-coded:
 * `GET /rest/SampleEntryGenerateScanProvider` hands back the next number in the
 * sequence, so counting down from it looks at the orders that exist here instead
 * of at a range that happened to be populated on somebody else's instance.
 */
async function findExistingUsableOrder(page: Page): Promise<OrderPayload | null> {
  const newest = await page.evaluate(async () => {
    const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', {
      headers: { Accept: 'application/json' },
    });
    const j = await r.json().catch(() => null);
    return (j && j.body) || null;
  });
  if (!newest) return null;

  const prefix = String(newest).replace(/\d+$/, '');
  const digits = String(newest).slice(prefix.length);
  const top = Number(digits);
  if (!Number.isFinite(top)) return null;

  for (let n = top; n > Math.max(0, top - 60); n--) {
    const acc = prefix + String(n).padStart(digits.length, '0');
    const order = await fetchOrder(page, acc);
    if (isUsable(order)) return order;
  }
  return null;
}

async function findEditableOrder(page: Page): Promise<OrderPayload> {
  if (!seeded) {
    seeded = (async () => {
      const existing = await findExistingUsableOrder(page);
      if (existing) return existing;

      const { accession } = await seedModifiableOrder(page);
      const order = await fetchOrder(page, accession);
      expect(
        order,
        `the seeded order ${accession} reads back off /rest/SampleEdit — if this fails the fixture wrote something the edit screen cannot load`,
      ).toBeTruthy();
      expect(
        order!.providerLastName,
        'the seeded order carries a provider last name (MO-5: without one Submit is disabled for ever)',
      ).toBeTruthy();
      expect(order!.tests.length, 'the seeded order carries at least one test').toBeGreaterThan(0);
      return order!;
    })();
  }
  return seeded;
}

/**
 * The Lab Number input that USED to sit on the ORDER step.
 *
 * MEASURED ON THE DEVELOP BUILD 2026-09-14, confirmed again 2026-09-15: this
 * input is not there any more. The ORDER step shows the number as the heading
 * "Lab Number: DEV...", with no inline text box, and the only `labNo`-ish
 * control in the DOM is `#reassign-labNo` — which lives inside a hidden Carbon
 * MODAL (`.cds--modal-content`, `visibility: hidden`) and is the accession
 * REASSIGNMENT dialog, a different control with a different job.
 *
 * The selector is KEPT, and is still never re-pointed at the reassignment
 * control, because its job changed rather than ended: MO-1 and MO-7 now assert
 * that nothing matching it comes back. Quietly aiming it at `#reassign-labNo`
 * would turn a fixed defect into a green test against something else entirely.
 */
const LAB_NO = '#labNo';

/**
 * The accession-REASSIGNMENT controls, which are a different feature: they
 * change a specimen's identifier on purpose, from inside a modal the user has
 * to open. MO-1 and MO-7 assert they are present-but-not-reachable from the
 * ORDER step, which is what makes "the Lab Number field is gone" a fix rather
 * than a relocation of the same hazard.
 */
const REASSIGN_LAB_NO = '#reassign-labNo';
const REASSIGN_GENERATE = '[data-cy="reassign-generate-labNumber"]';

/**
 * The note every flipped case carries, so the flip is auditable from the test
 * rather than only from the git history.
 */
const FLIP_EVIDENCE =
  'flipped 2026-09-15 on the evidence of a red assert-the-defect run of ' +
  'modify-order.config.ts against the local develop stack (6 failed / 1 skipped / 2 passed)';

/** Walks the three-step wizard to the ORDER step, where the fields under test live. */
async function openOrderStep(page: Page, accession: string): Promise<void> {
  await page.goto(`${BASE}/ModifyOrder?accessionNumber=${accession}`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Test Request' })).toBeVisible();

  // Program Selection -> Add Sample -> Add Order
  for (let i = 0; i < 2; i++) {
    await page.locator('button.forwardButton', { hasText: 'Next' }).click();
    await page.waitForTimeout(800);
  }

  // Gate on the STEP, not on one field in it.
  //
  // This used to wait for `#labNo` to be visible, which conflated "the wizard
  // got here" with "the field MO-1 is about still exists". On the develop build
  // the field is gone (see LAB_NO above), so every one of the seven cases died
  // in this helper with the same message and none of them reported on its own
  // subject. The heading is what says we arrived.
  await expect(
    page.getByRole('heading', { name: `Lab Number: ${accession}` }),
    'the wizard reached the ORDER step',
  ).toBeVisible();
}

/** Pulls the live React form state that backs the ORDER step. */
async function formState(page: Page): Promise<any> {
  return page.evaluate(() => {
    // Any element inside the ORDER step's form will do — the fiber walk climbs to
    // the state that backs the whole step. It used to be `#labNo`, which stopped
    // existing on develop and took the state read down with it; #siteName is a
    // field this step still has on both builds.
    const el = document.querySelector('#labNo, #siteName, #order_receivedDate') as any;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
    let fiber = el[key!];
    for (let depth = 0; fiber && depth < 60; depth++) {
      let hook = fiber.memoizedState;
      for (let i = 0; hook && i < 40; i++) {
        const s = hook.memoizedState;
        if (s && typeof s === 'object' && s.sampleOrderItems) {
          return {
            labNo: s.sampleOrderItems.labNo,
            newAccessionNumber: s.newAccessionNumber,
            accessionNumber: s.accessionNumber,
            referringSiteName: s.sampleOrderItems.referringSiteName,
            nextVisitDate: s.sampleOrderItems.nextVisitDate,
          };
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return null;
  });
}

test.beforeEach(async ({ page }) => {
  // Land on a real origin before fetchOrder/findEditableOrder run. Without this the page is
  // still about:blank, the relative fetch has no origin, and every test fails identically
  // with "the instance holds at least one order ... Received: null".
  await page.goto(`${BASE}/SampleEdit`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});

test.describe('Modify Order — field binding and save gate (FLIP-WHEN-FIXED)', () => {
  test('MO-1: the Lab Number is read-only text on the ORDER step — no input bound to newAccessionNumber', async ({ page }) => {
    // FLIPPED 2026-09-15. THIS CASE USED TO ASSERT THE DEFECT:
    //   'MO-1: [DEFECT] the required Lab Number field renders empty although the order
    //    number is loaded and shown above it'
    // and its subject assertion was
    //   await expect(page.locator('#labNo')).toHaveValue('')
    // with the comment "the input is bound to newAccessionNumber (empty) instead of
    // sampleOrderItems.labNo". Measured 2026-09-01 on testing.openelis-global.org v3.2.2.0.
    //
    // EVIDENCE FOR THE FLIP: a red assert-the-defect run of modify-order.config.ts against
    // the local develop stack on 2026-09-15 (6 failed / 1 skipped / 2 passed). MO-1 failed
    // with "element(s) not found" for '#labNo' after the full 15s expect timeout. A DOM dump
    // of every input on the ORDER step, taken on the same build, contains no `#labNo`: the
    // number is a heading, and the one labNo-shaped control in the document is
    // `#reassign-labNo`, inside the hidden reassignment modal. The mis-binding is gone
    // because the mis-bound control is gone.
    //
    // WHAT IT GUARDS NOW: the number stays visible and correct, form state still carries it,
    // and no editable Lab Number field reappears on the ORDER step.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    // The number IS on the page — as static text, immediately above the box that needs it.
    // `.first()`: the develop build renders it twice (heading and section label),
    // and an unqualified getByText is a strict-mode violation, which reads as
    // "the number is missing" when the opposite is true.
    await expect(
      page.getByText(`Lab Number: ${order.accessionNumber}`).first(),
      'the order number is displayed as a heading',
    ).toBeVisible();

    const state = await formState(page);
    expect(state, 'the ORDER step form state is reachable').toBeTruthy();
    expect(state.labNo, 'the value is present in form state the whole time').toBe(order.accessionNumber);

    // The subject of the flip: there is no editable Lab Number box on this step at all,
    // so there is nothing left for the newAccessionNumber binding to mis-populate.
    await expect(
      page.locator(LAB_NO),
      `FIXED (${FLIP_EVIDENCE}): the ORDER step must not carry an inline Lab Number input. ` +
      'One reappearing here is the regression this case exists to catch, because the binding ' +
      'that made it empty was never corrected — the control was removed.',
    ).toHaveCount(0);

    // And the fix must not simply have MOVED the hazard onto the step: the only labNo
    // control in the document belongs to the accession-REASSIGNMENT modal, and that modal
    // is not open, so nothing here can edit the identifier by accident.
    await expect(
      page.locator(REASSIGN_LAB_NO),
      'the reassignment dialog still exists (if it does not, this assertion is guarding nothing ' +
      'and the case needs re-measuring rather than relaxing)',
    ).toHaveCount(1);
    await expect(
      page.locator(REASSIGN_LAB_NO),
      'the reassignment Lab Number input is inside a closed modal, not on the ORDER step',
    ).toBeHidden();

    // Nothing has armed a reassignment just by loading the order.
    expect(
      state.newAccessionNumber || '',
      'no new accession number is armed on an ordinary edit',
    ).toBe('');
  });

  test('MO-2: Date of next visit is rendered from the order that was loaded', async ({ page }) => {
    // FLIPPED 2026-09-15. THIS CASE USED TO ASSERT THE DEFECT:
    //   'MO-2: [DEFECT] Date of next visit renders empty although the order carries one'
    // with the subject assertion
    //   await expect(page.locator('input#order_nextVisitDate')).toHaveValue('')
    // Measured 2026-09-01 on testing.openelis-global.org v3.2.2.0: the payload and the React
    // form state both carried the date and the input rendered blank.
    //
    // EVIDENCE FOR THE FLIP: the red assert-the-defect run on the local develop stack,
    // 2026-09-15 (6 failed / 1 skipped / 2 passed). MO-2 failed with received "14/10/2026"
    // — which is exactly the order's nextVisitDate. The field renders the value now.
    //
    // WHAT IT GUARDS NOW: the rendered value and the form state agree with the payload, in
    // that order, so a re-broken binding shows up as a blank field rather than as nothing.
    const order = await findEditableOrder(page);
    test.skip(!order.nextVisitDate, 'located order has no next-visit date to render');
    await openOrderStep(page, order.accessionNumber);

    const state = await formState(page);
    expect(state.nextVisitDate, 'the date is present in form state').toBe(order.nextVisitDate);

    await expect(
      page.locator('input#order_nextVisitDate'),
      `FIXED (${FLIP_EVIDENCE}): a populated next-visit date must reach its field`,
    ).toHaveValue(order.nextVisitDate!);
  });

  test('MO-3: [CONTRACT FACT] the Edit Order payload omits receivedDate, which is not the same as the order lacking one', async ({
    page,
  }) => {
    // RETRACTED AND REPURPOSED 2026-09-15. THIS CASE USED TO ASSERT A DEFECT:
    //   'MO-3: [DEFECT] Received Date is pre-filled with today although the order has no
    //    received date'
    //   expect(rendered).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    // explained as "an unset received date is shown as a real date, inviting the user to
    // save a value that was never recorded". Every part of that is wrong, and it took a
    // product fact plus two measurements to see it.
    //
    // 1. THE PRODUCT INTENT (Casey, 2026-09-15). Received date and time are normally
    //    AUTO-SET by an order-entry configuration option, and are manually changeable.
    //    They are a different thing from request date and time. A form offering today is
    //    doing its job, not fabricating.
    //
    // 2. AN ORDER CANNOT LACK ONE. `sample.received_date` is NOT NULL at the schema
    //    level -- measured by trying: `UPDATE clinlims.sample SET received_date = NULL`
    //    is refused with "null value in column received_date violates not-null
    //    constraint". "The order carries no receivedDate" was read off the REST payload,
    //    which omits the field. The record always has it.
    //
    // 3. AND A SAVE DOES NOT OVERWRITE IT. Back-dated DEV01260000000000266 to
    //    2026-09-01 07:30, drove the whole wizard and submitted with nothing changed:
    //    received_date still 2026-09-01 07:30 afterwards, `lastupdated` not even touched.
    //    The data-integrity fear the case was built on does not happen.
    //
    // WHY THIS ASSERTS THE OMISSION RATHER THAN THE PRESERVATION. Preservation is the
    // fact worth guarding, and a spec CANNOT SEE IT: the payload does not carry the field,
    // so there is nothing to compare before and after. An earlier draft of this case did
    // exactly that and skipped every run -- a case that never asserts is the failure mode
    // this file exists to avoid. It also submitted the shared fixture mid-file, which
    // disturbed MO-4 and MO-6 downstream. So this case pins the thing it can actually
    // observe, and the preservation evidence lives above, measured where it is visible.
    const order = await findEditableOrder(page);
    expect(
      order.receivedDate ?? '',
      `/rest/SampleEdit exposed a receivedDate (${order.receivedDate}) for ` +
        `${order.accessionNumber}. If the payload has started carrying it, this omission is ` +
        `fixed -- delete this case and assert preservation instead, which is now observable.`
    ).toBe('');
  });

  test('MO-4: the Search Site Name survives load — form state agrees with the screen', async ({ page }) => {
    // FLIPPED 2026-09-15. THIS CASE USED TO ASSERT THE DEFECT:
    //   'MO-4: [DEFECT] the required Search Site Name is blanked in form state while the
    //    screen still shows it'
    // with the subject assertion
    //   expect(state.referringSiteName).toBe('')
    // and the explanation that ModifyOrder.jsx's loadOrderValues ran
    //   data.sampleOrderItems.referringSiteName = "";
    // so the AutoComplete's display was masking an empty required field. Measured
    // 2026-09-01 on testing.openelis-global.org v3.2.2.0.
    //
    // EVIDENCE FOR THE FLIP: the red assert-the-defect run on the local develop stack,
    // 2026-09-15 (6 failed / 1 skipped / 2 passed). MO-4 failed with received
    // "QA_AUTO Referring Clinic" — the payload's referringSiteName, intact in form state.
    //
    // WHAT IT GUARDS NOW: display and state agree. Both halves are asserted, because the
    // defect was precisely that they DISAGREED; checking only the visible one is what let
    // the bug live for as long as it did.
    const order = await findEditableOrder(page);
    test.skip(!order.referringSiteName, 'located order has no referring site');
    await openOrderStep(page, order.accessionNumber);

    // The screen looks correct, because the AutoComplete falls back to referringSiteId...
    //
    // CONTAINS, not equals: the combobox displays the site's DISPLAY LABEL, which
    // is "SHORTNAME - Organization Name", while the REST payload's
    // referringSiteName is the organization name alone (both read live
    // 2026-09-14). An equality check here failed on the formatting of a field
    // this case is only using as a precondition — its subject is the form state
    // asserted below, which is untouched.
    const displayed = await page.locator('#siteName').inputValue();
    expect(displayed, 'the site name is shown on screen').toContain(order.referringSiteName);

    // ...and the value behind the display now matches it, instead of having been emptied by
    // loadOrderValues.
    const state = await formState(page);
    expect(
      state.referringSiteName,
      `FIXED (${FLIP_EVIDENCE}): loadOrderValues must keep referringSiteName, so the required ` +
      'field the user can see is the one the form will submit',
    ).toBe(order.referringSiteName);
  });

  test('MO-5: [DEFECT] the field that hard-blocks Submit is not marked required, and its error is never wired to the input', async ({ page }) => {
    // RETARGETED 2026-09-15. THIS CASE USED TO ASSERT THE DEFECT:
    //   'MO-5: [DEFECT] Submit is enabled with the required Lab Number empty, and blocked
    //    with NO visible error when an unmarked field is'
    // Its subject assertion was
    //   await expect(page.locator('#labNo')).toHaveValue('');
    //   await expect(submit).toBeEnabled();   // "the asterisked Lab Number field is not
    //                                         //  validated at all"
    // Measured 2026-09-01 on testing.openelis-global.org v3.2.2.0.
    //
    // ITS PREMISE DISSOLVED. On the local develop stack (red run, 2026-09-15) MO-5 failed
    // at its very first line, "element(s) not found" for '#labNo', for the same reason as
    // MO-1: the ORDER step has no inline Lab Number input any more. An asterisked field
    // that is not validated cannot be asserted about once the field is gone.
    //
    // RETARGETED RATHER THAN DELETED, because the SECOND half of the original case — the
    // half about ModifyOrderEntryValidationSchema gating Submit invisibly — is the half
    // OGC-1191 suggested fix 4 is still open on, and it is the half with a user-visible
    // cost: a dead Submit button with no stated reason. Deleting the case would have taken
    // that coverage with it.
    //
    // BUT THE MEASUREMENT MOVED THE TARGET, AND THIS IS WORTH READING BEFORE TRUSTING THE
    // BRIEFING THAT SENT ME HERE. The claim was that the schema's errors "are never
    // RENDERED". That is no longer true. Measured live on the ORDER step, 2026-09-15,
    // by emptying #requesterLastName:
    //
    //     Submit           enabled -> DISABLED           (it gates, as before)
    //     rendered text    "Error / Requester Last Name is required"
    //     the element      div.cds--inline-notification__subtitle, inside a Carbon
    //                      InlineNotification
    //     #requesterLastName  aria-invalid    = null
    //                         aria-describedby = null
    //     .cds--form-requirement count          = 0
    //     [aria-invalid="true"] count           = 0
    //     labels bearing "*"                    = ["Search Site Name *"]
    //
    // So a human-readable message DOES appear, and part of fix 4 has landed. What has NOT
    // landed is everything that connects that message to the field it is about: the input
    // is never marked invalid, the notification is never associated with it, and the field
    // is not marked required BEFORE you break it — a user filling the form in has no way to
    // know that Requester's LastName is the one that will stop them.
    //
    // This case asserts THAT, in the file's assert-the-defect convention: it is green while
    // the association is missing and turns red when fix 4 is finished.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    // PRECONDITION 1 — the control this case is about is on the step and populated. Without
    // this, everything below would "pass" on a page that simply failed to render.
    const lastName = page.locator('#requesterLastName');
    await expect(lastName, 'Requester LastName is on the ORDER step').toBeVisible();
    expect(
      await lastName.inputValue(),
      'the fixture order carries a requester last name, so emptying it is a change of state',
    ).not.toBe('');

    // PRECONDITION 2 — Submit is live before we break anything.
    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await expect(submit, 'Submit is enabled on a valid, untouched order').toBeEnabled();

    // DEFECT, part 1: the field that will hard-block Submit carries no required marker
    // while it is still valid. Nothing on the screen warns the user in advance.
    const markedRequired = await page
      .locator('label')
      .evaluateAll((ls) =>
        ls.filter((l) => (l as HTMLElement).innerText.includes('*')).map((l) => (l as HTMLElement).innerText.trim()),
      );
    expect(
      markedRequired.length,
      'at least one field IS asterisked, so a zero here would mean the markers did not render ' +
      'at all and the assertion below would be meaningless',
    ).toBeGreaterThan(0);
    expect(
      markedRequired.join(' | '),
      "DEFECT: Requester's LastName hard-blocks Submit but is never marked required. " +
      'WHEN FIXED: this label carries an asterisk like Search Site Name does, and this ' +
      'assertion inverts to .toMatch(/LastName/i).',
    ).not.toMatch(/LastName/i);

    await lastName.fill('');
    await page.waitForTimeout(1500);

    // The gate itself works, and so does the message. Asserted as the positive control for
    // the defect below: if Submit did not disable, or no message appeared, the association
    // assertions would be probing a state that never happened.
    await expect(
      submit,
      'emptying Requester LastName disables Submit (this is the behaviour under discussion; ' +
      'if it stops happening, this case is measuring nothing)',
    ).toBeDisabled();
    const notice = page.locator('.cds--inline-notification').filter({ hasText: /Requester Last Name is required/i });
    await expect(
      notice,
      'a human-readable reason IS rendered — part of OGC-1191 suggested fix 4 has landed ' +
      '(measured 2026-09-15; the ticket text predates it)',
    ).toBeVisible();

    // DEFECT, part 2: the message is not connected to the field in any way a browser, a
    // screen reader or a keyboard user can follow.
    expect(
      await lastName.getAttribute('aria-invalid'),
      'DEFECT: the input that is blocking the save is never marked invalid. WHEN FIXED: ' +
      "this is 'true' and the assertion inverts.",
    ).toBeNull();
    expect(
      await lastName.getAttribute('aria-describedby'),
      'DEFECT: the error notification is never associated with the field it is about. ' +
      'WHEN FIXED: this points at the element carrying the message.',
    ).toBeNull();
    expect(
      await page.locator('.cds--form-requirement').count(),
      "DEFECT: Carbon's own inline-error slot for the field is unused; the message lives in " +
      'a page-level notification instead. WHEN FIXED: at least one form requirement renders ' +
      'against the offending field.',
    ).toBe(0);
  });

  test('MO-6: a plain save preserves every field — opening and submitting an order changes nothing', async ({ page }) => {
    // Guards the ticket against over-claiming. Measured 2026-09-01: an ordinary save with the
    // Lab Number typed back correctly produced an empty before/after diff.
    //
    // REPAIRED 2026-09-15. THIS CASE IS NOT A DEFECT CASE — it is a positive assertion, and
    // it was failing for a reason that had nothing to do with the product: its first line was
    //   await page.locator('#labNo').fill(order.accessionNumber);
    // which timed out with "waiting for locator('#labNo')" because that input no longer
    // exists (see MO-1). The fill was only ever there to put back a value the DEFECT had
    // blanked; with the defect fixed and the input gone there is nothing to type back, so
    // the line is deleted rather than re-pointed. The case now does what its title says:
    // open the order, submit it untouched, and prove the round trip is lossless.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    // The removed fill, asserted rather than assumed: if an editable Lab Number input comes
    // back, this case must be re-examined instead of quietly submitting an empty one.
    await expect(
      page.locator(LAB_NO),
      'there is no Lab Number input to type back into (see MO-1)',
    ).toHaveCount(0);

    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('Successfully saved')).toBeVisible({ timeout: 20000 });

    const after = await fetchOrder(page, order.accessionNumber);
    expect(after, 'the order is still reachable at its original accession number').toBeTruthy();
    expect(after!.referringSiteName, 'referring site survives the save').toBe(order.referringSiteName);
    expect(after!.providerLastName, 'provider survives the save').toBe(order.providerLastName);
    expect(after!.nextVisitDate, 'next-visit date is not wiped by the empty field').toBe(order.nextVisitDate);
    expect(after!.receivedDate, 'the fabricated received date is not written through').toBe(order.receivedDate);
    expect(after!.tests.sort(), 'the ordered tests are untouched').toEqual(order.tests.sort());
  });

  test('MO-7: the ORDER step offers no Generate control that could mint a new accession number', async ({ page }) => {
    // FLIPPED 2026-09-15. THIS CASE USED TO ASSERT THE DEFECT:
    //   'MO-7: [DEFECT] Generate arms a NEW accession number on a screen whose job is
    //    editing an existing order'
    // It clicked `[data-cy="generate-labNumber"]` and asserted that form state's
    // newAccessionNumber came back different from the order's own accession number while
    // Submit stayed enabled — the non-destructive proof of the reassignment hazard measured
    // end to end on 2026-09-01 (DEV...519 -> DEV...644, with PRINT LABELS then offering the
    // dead number). That narrative is kept in the header; it is why this case exists.
    //
    // EVIDENCE FOR THE FLIP: the red assert-the-defect run on the local develop stack,
    // 2026-09-15 (6 failed / 1 skipped / 2 passed). MO-7 failed with a click timeout on
    // `[data-cy="generate-labNumber"]` — the control is not on the ORDER step. A DOM scan of
    // every generate-ish anchor and button on the same step found exactly one,
    // `[data-cy="reassign-generate-labNumber"]`, and it is inside the closed accession
    // REASSIGNMENT modal.
    //
    // WHAT IT GUARDS NOW: the hazard was removed, not relocated. Reassignment still exists
    // as a deliberate feature behind a modal; what is gone is the one-click path to it from
    // a screen whose job is editing. If either the old control returns, or the reassignment
    // control becomes reachable without opening its dialog, this case goes red.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    await expect(
      page.locator('[data-cy="generate-labNumber"]'),
      `FIXED (${FLIP_EVIDENCE}): no Generate control may sit on the ORDER step — clicking one ` +
      "silently reassigned the specimen's identifier",
    ).toHaveCount(0);

    await expect(
      page.locator(REASSIGN_GENERATE),
      'the reassignment Generate still exists as a deliberate feature (if it does not, this ' +
      'case is guarding nothing and needs re-measuring rather than relaxing)',
    ).toHaveCount(1);
    await expect(
      page.locator(REASSIGN_GENERATE),
      'and it is not reachable from the ORDER step: it lives inside the closed reassignment modal',
    ).toBeHidden();

    // Loading and sitting on the order arms no reassignment at all.
    const state = await formState(page);
    expect(state, 'the ORDER step form state is reachable').toBeTruthy();
    expect(state.accessionNumber, 'the order still believes it is the original').toBe(order.accessionNumber);
    expect(
      state.newAccessionNumber || '',
      `FIXED (${FLIP_EVIDENCE}): no new accession number is armed on the ORDER step`,
    ).toBe('');
  });

  test('MO-7-DESTRUCTIVE: [DEFECT] submitting after Generate silently reassigns the accession number and then offers the OLD one to print', async ({ page }) => {
    // KEPT, UNCHANGED, AND STILL OPT-IN — but read this before running it. 2026-09-15: its
    // premise went with MO-7's. `[data-cy="generate-labNumber"]` is not on the ORDER step on
    // the develop build, so with MO_DESTRUCTIVE=1 this case now FAILS at the click rather
    // than reproducing anything. That is a stated failure, not a mystery.
    //
    // It is not flipped, because there is nothing to invert: the inverse of "submitting
    // after Generate reassigns the specimen" is MO-7 above, which asserts there is no
    // Generate to submit after. It is not deleted either, because it is the only executable
    // record of the end-to-end reassignment that OGC-1191 was raised on, and a build where
    // the ORDER step regains a Generate control is exactly when someone will want to run it.
    test.skip(
      !RUN_DESTRUCTIVE,
      'orphans a real accession number on the target instance — run with MO_DESTRUCTIVE=1 to ' +
      'reproduce; on develop it now fails at the Generate click because that control is gone (see MO-7)',
    );

    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    await page.locator('[data-cy="generate-labNumber"]').click();
    await expect
      .poll(async () => (await formState(page)).newAccessionNumber, { timeout: 15000 })
      .not.toBe('');
    const generated = (await formState(page)).newAccessionNumber;

    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Successfully saved')).toBeVisible({ timeout: 20000 });

    // WHEN FIXED: the original accession still resolves and `generated` never existed.
    const original = await fetchOrder(page, order.accessionNumber);
    const moved = await fetchOrder(page, generated);
    expect(
      original,
      'DEFECT: the sample no longer exists under the accession number it was ordered with',
    ).toBeNull();
    expect(moved, 'DEFECT: the order silently moved to the generated accession number').toBeTruthy();
    expect(moved!.tests.sort(), 'the same tests came along to the new identifier').toEqual(order.tests.sort());

    // The confirmation screen then hands the user a label for the number that no longer exists.
    await expect(
      page.getByText(order.accessionNumber),
      'DEFECT: PRINT LABELS offers the stale accession number, so a label printed here is wrong',
    ).toBeVisible();
  });
});
