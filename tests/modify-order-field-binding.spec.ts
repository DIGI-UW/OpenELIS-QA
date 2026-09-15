/**
 * OpenELIS Global — Modify Order (Edit Order): field-binding and save-gate regressions.
 *
 * FLIP-WHEN-FIXED. Every assertion in this file encodes BROKEN behaviour observed live on
 * 2026-09-01 against testing.openelis-global.org (v3.2.2.0). A failure here is good news:
 * it means the defect was fixed and the assertion should be inverted, not that the harness
 * drifted. Each test names what the fixed assertion should become.
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
 * The Lab Number input on the ORDER step.
 *
 * MEASURED ON THE DEVELOP BUILD 2026-09-14, and it matters: this input is not
 * there any more. The ORDER step now shows the number as the heading "Lab
 * Number: DEV...", with no inline text box, and the only `labNo`-ish control in
 * the DOM is `#reassign-labNo` — which lives inside a hidden Carbon MODAL
 * (`.cds--modal-content`, `visibility: hidden`) and is the accession
 * REASSIGNMENT dialog, a different control with a different job. It is
 * deliberately NOT matched here: quietly re-pointing the selector at it would
 * turn a fixed defect into a green test against something else entirely.
 *
 * So MO-1/MO-5/MO-6/MO-7 fail on this build, and that is the FLIP-WHEN-FIXED
 * signal this file exists to raise — see the header. Confirm against the ticket
 * and invert the assertions; do not "repair" the selector.
 */
const LAB_NO = '#labNo';

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
  test('MO-1: [DEFECT] the required Lab Number field renders empty although the order number is loaded and shown above it', async ({ page }) => {
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

    // WHEN FIXED: expect(page.locator(LAB_NO)).toHaveValue(order.accessionNumber)
    await expect(
      page.locator(LAB_NO),
      'DEFECT: the input is bound to newAccessionNumber (empty) instead of sampleOrderItems.labNo',
    ).toHaveValue('');
    expect(state.newAccessionNumber, 'the property the input IS bound to is empty on an ordinary edit').toBe('');
  });

  test('MO-2: [DEFECT] Date of next visit renders empty although the order carries one', async ({ page }) => {
    const order = await findEditableOrder(page);
    test.skip(!order.nextVisitDate, 'located order has no next-visit date to drop');
    await openOrderStep(page, order.accessionNumber);

    const state = await formState(page);
    expect(state.nextVisitDate, 'the date is present in form state').toBe(order.nextVisitDate);

    // WHEN FIXED: expect(...).toHaveValue(order.nextVisitDate)
    await expect(
      page.locator('input#order_nextVisitDate'),
      'DEFECT: a populated next-visit date is not rendered into its field',
    ).toHaveValue('');
  });

  test('MO-3: [DEFECT] Received Date is pre-filled with today although the order has no received date', async ({ page }) => {
    const order = await findEditableOrder(page);
    test.skip(!!order.receivedDate, 'located order already has a received date; nothing to fabricate');
    await openOrderStep(page, order.accessionNumber);

    // WHEN FIXED: expect(page.locator('input#order_receivedDate')).toHaveValue('')
    const rendered = await page.locator('input#order_receivedDate').inputValue();
    expect(
      rendered,
      'DEFECT: an unset received date is shown as a real date, inviting the user to save a value that was never recorded',
    ).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  test('MO-4: [DEFECT] the required Search Site Name is blanked in form state while the screen still shows it', async ({ page }) => {
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

    // ...while ModifyOrder.jsx's loadOrderValues has already emptied the value behind it.
    // WHEN FIXED: expect(state.referringSiteName).toBe(order.referringSiteName)
    const state = await formState(page);
    expect(
      state.referringSiteName,
      'DEFECT: loadOrderValues discards referringSiteName on load; the display is masking an empty required field',
    ).toBe('');
  });

  test('MO-5: [DEFECT] Submit is enabled with the required Lab Number empty, and blocked with NO visible error when an unmarked field is', async ({ page }) => {
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    // Lab Number carries a red asterisk and is empty — yet the form is submittable.
    await expect(page.locator(LAB_NO)).toHaveValue('');
    // WHEN FIXED: expect(submit).toBeDisabled() while labNo is empty
    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await expect(
      submit,
      'DEFECT: the asterisked Lab Number field is not validated at all',
    ).toBeEnabled();

    // The inverse half: the field that DOES block has no asterisk and no error text.
    const markedRequired = await page
      .locator('label')
      .evaluateAll((ls) =>
        ls.filter((l) => (l as HTMLElement).innerText.includes('*')).map((l) => (l as HTMLElement).innerText.trim()),
      );
    expect(
      markedRequired.join(' | '),
      'DEFECT: Requester LastName hard-blocks Submit but is never marked required',
    ).not.toMatch(/LastName/i);

    // And when it does block, nothing on the page says so.
    const visibleErrors = await page
      .locator('.cds--form-requirement, [aria-invalid="true"]')
      .count();
    expect(
      visibleErrors,
      'DEFECT: the validation errors that gate Submit are never rendered — the user sees a dead button and no reason',
    ).toBe(0);
  });

  test('MO-6: a plain save preserves every field — the render desync does NOT corrupt data', async ({ page }) => {
    // Guards the ticket against over-claiming. Measured 2026-09-01: an ordinary save with the
    // Lab Number typed back correctly produced an empty before/after diff.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    await page.locator(LAB_NO).fill(order.accessionNumber);
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

  test('MO-7: [DEFECT] Generate arms a NEW accession number on a screen whose job is editing an existing order', async ({ page }) => {
    // Non-destructive proof of the hazard: shows Generate loads a different identifier and
    // that Submit will act on it. The end-to-end consequence is MO-7-DESTRUCTIVE below.
    const order = await findEditableOrder(page);
    await openOrderStep(page, order.accessionNumber);

    await page.locator('[data-cy="generate-labNumber"]').click();
    await expect
      .poll(async () => (await formState(page)).newAccessionNumber, { timeout: 15000 })
      .not.toBe('');

    const state = await formState(page);
    // WHEN FIXED: Generate should not be offered on Modify Order at all, or must require an
    // explicit "reassign this sample's accession number" confirmation.
    expect(
      state.newAccessionNumber,
      'DEFECT: Generate mints a fresh accession number while editing an existing order',
    ).not.toBe(order.accessionNumber);
    expect(state.accessionNumber, 'the order still believes it is the original').toBe(order.accessionNumber);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true }),
      'DEFECT: nothing stands between that generated number and a one-click commit',
    ).toBeEnabled();
  });

  test('MO-7-DESTRUCTIVE: [DEFECT] submitting after Generate silently reassigns the accession number and then offers the OLD one to print', async ({ page }) => {
    test.skip(
      !RUN_DESTRUCTIVE,
      'orphans a real accession number on the target instance — run with MO_DESTRUCTIVE=1 to reproduce',
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
