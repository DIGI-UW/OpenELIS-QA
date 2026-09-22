/**
 * tests/edit-order-cancel-test.spec.ts
 *
 * CAN A PLACED TEST ORDER BE CANCELLED FROM THE EDIT ORDER SCREEN?
 *
 * Casey asked the question on 2026-09-15 and nothing in this repository answered it:
 * `tests/modify-order-field-binding.spec.ts` and `edit-order-rbac-test-cases.md` cover
 * what Edit Order BINDS and who may open it, not what it can UNDO. This file is that
 * answer, and the regression cover that keeps it answered.
 *
 * ============================================================================
 * WHAT THE PRODUCT DOES, MEASURED AGAINST
 * itechuw/openelis-global-2:develop AT https://localhost:10443
 * ============================================================================
 *
 * THE SCREEN. `/ModifyOrder` is a three-step wizard (`ModifyOrder.jsx`):
 *   0  Program selection      EditOrderEntryAdditionalQuestions
 *   1  Sample                 EditSample          <- "Cancel Test" lives here
 *   2  Order                  AddOrder            <- [data-cy="submit-order"]
 * Step 1 renders the Current Tests table from `OrderCurrentTestsHeaders`, whose last
 * column is `canceled`, headed "Cancel Test" and rendered as a Carbon Checkbox. There is
 * also a "Remove Sample" column, which is a different and larger action: it cancels the
 * whole sample item rather than one test.
 *
 * THE RULE ABOUT WHO MAY CANCEL WHAT. `SampleEditRestController.getCurrentTestInfo`:
 *
 *     boolean canCancel = allowedToCancelAll
 *         || (!matches(status, AnalysisStatus.Canceled)
 *             && matches(status, AnalysisStatus.NotStarted));
 *
 * `allowedToCancelAll` is admin, or a member of ABLE_TO_CANCEL_ROLE_NAMES. So an ordinary
 * user may cancel a test that has not been started, and only a privileged user may cancel
 * one that already carries results. This suite runs as the harness's admin user, which
 * means it exercises the permissive arm; the restricted arm is called out at the end of
 * this header as an untested edge rather than silently implied to be covered.
 *
 * THE BACKEND. `SampleEditServiceImpl` builds a cancel list from the ticked items, sets
 * each analysis to `AnalysisStatus.Canceled`, and writes a Result of value "cancel"
 * against any analysis that had one. The GET that repopulates the screen excludes
 * Canceled analyses (`getAnalysesBySampleItemsExcludingByStatusIds`), which is what makes
 * the disappearance below a trustworthy signal rather than a rendering accident.
 *
 * ============================================================================
 * WHAT THESE CASES ASSERT, AND WHY IN THIS ORDER
 * ============================================================================
 * EO-CANCEL-01 is the canary. It proves the order was created, the screen found it, and
 * the test is listed with a Cancel Test control that is not disabled. Without it the two
 * cases below could both "pass" against a screen that never loaded the order.
 *
 * EO-CANCEL-02 does the cancellation through the wizard, with real clicks on the visible
 * Carbon label (the input itself is hidden; clicking it hangs for ~60s — harness ref).
 *
 * EO-CANCEL-03 asks the only question the lab actually cares about: is the test gone from
 * the work the lab is expected to do. A cancelled analysis that still appears on the
 * worklist would be worse than no cancel button at all.
 *
 * TEST DATA. One patient and one order per run, via `seedModifiableOrder` — the same
 * shim `modify-order-field-binding.spec.ts` uses. This suite CONSUMES its order (that is
 * what cancelling means), so it cannot share a fixture with anything else and does not
 * try to. The accession is logged on every run.
 *
 * ============================================================================
 * THE SECOND ACTION: REMOVE SAMPLE
 * ============================================================================
 * The same table carries a "Remove Sample" column, and it is a bigger hammer: it cancels
 * EVERY analysis on the sample item, not one test. Two details make it worth its own
 * cases rather than a footnote to the ones above.
 *
 *   1. It is gated on the whole sample, not the row. `getCurrentTestInfo` computes
 *      `canRemove` by ANDing `canCancel` across every analysis on the item, so one
 *      started test makes the entire sample unremovable for an ordinary user. That is a
 *      different rule from the per-test one, and a suite that only exercised the per-test
 *      path would never notice it changing.
 *   2. The control is rendered on the FIRST row of each sample item only (`accession !==
 *      ""` in EditSample.jsx, and only the first item of a group is given an accession),
 *      so a one-test order cannot tell "removed the sample" apart from "cancelled the
 *      only test". The remove cases therefore seed TWO tests on one sample item, which is
 *      what `seedModifiableOrder({ testIds: [...] })` was added for.
 *
 * NOT COVERED HERE, deliberately, and worth saying out loud:
 *   - the non-admin arm of `canCancel` / `canRemove` (a started analysis, an ordinary
 *     user). It needs a second storage state; `rbac.config.ts` is where that belongs.
 *   - an order with two sample ITEMS, where removing one must leave the other alone.
 */
import { test, expect, Page } from '@playwright/test';
import { seedModifiableOrder } from '../helpers/data-factory';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest';
/**
 * TWO routes, and picking the wrong one costs an hour: `/SampleEdit` is the SEARCH screen
 * (`modifyOrder/Index.jsx` -> `SearchOrder.jsx`, the `#labNumber` box), and `/ModifyOrder`
 * is the wizard it hands off to. Opening `/ModifyOrder` directly renders the app shell
 * with no search box and no order.
 */
const SEARCH_ROUTE = '/SampleEdit';

interface SampleEditItem {
  testId?: string;
  testName?: string;
  analysisId?: string;
  sampleItemId?: string;
  status?: string;
  canCancel?: boolean;
  hasResults?: boolean;
}

/** Shared across the serial cases: seeded once, then acted on. */
let accession = '';
let testName = '';

/** The remove-sample half seeds its own two-test order; these are its subjects. */
let removeAccession = '';
let removeTestNames: string[] = [];

/** Glucose and Amylase, both orderable against sample type 2 on this instance. */
const TWO_TESTS = [process.env.QA_TEST_ID || '3', process.env.QA_TEST_ID_2 || '5'];

async function readCurrentTests(page: Page, acc: string): Promise<SampleEditItem[]> {
  const res = await page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { Accept: 'application/json' } });
    return { ct: r.headers.get('content-type') || '', status: r.status, body: await r.text() };
  }, `${REST}/SampleEdit?accessionNumber=${acc}`);
  expect(
    res.ct,
    `GET ${REST}/SampleEdit?accessionNumber=${acc} answered ${res.status} ${res.ct}. text/html ` +
      `means the SPA catch-all served it: the REST base is /api/OpenELIS-Global/rest, not /rest.`
  ).toContain('application/json');
  const form = JSON.parse(res.body) as { existingTests?: SampleEditItem[] };
  return form.existingTests ?? [];
}

/** Open Edit Order on an accession and land on step 1, where the tests are. */
async function openSampleStep(page: Page, acc: string): Promise<void> {
  await page.goto(`${BASE}${SEARCH_ROUTE}`, { waitUntil: 'domcontentloaded' });

  // `.first()`: the search screen renders TWO elements carrying id="labNumber" (the
  // accession box and the patient-search panel's own field), so the bare id is a strict-mode
  // violation. The duplicate id is a small accessibility defect in its own right.
  const search = page.locator('#labNumber').first();
  await expect(search, 'the Edit Order accession search box never rendered').toBeVisible({
    timeout: 20_000,
  });
  await search.fill(acc);
  await page.getByRole('button', { name: 'Submit' }).first().click();

  // The wizard opens on step 0. "Current Tests" is on step 1.
  await expect(
    page.getByRole('heading', { name: /Order|Test Request/i }).first(),
    `Edit Order did not load order ${acc}`
  ).toBeVisible({ timeout: 20_000 });
  // `exact: true`: the Current Tests table's Carbon pagination contributes a DISABLED
  // "Next Page" button, and a loose name match picks that one and waits 30s for a button
  // that will never be enabled.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('Current Tests', { exact: false }).first(),
    'the Current Tests table never appeared on step 1 of the wizard'
  ).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: 'serial' });

// TIMEOUT, measured here on 2026-09-22 and since fixed in modules.config.ts.
// Every case in this file opens Edit Order, and the SPA boot on testing costs 28.3s,
// 32.4s and 50.6s across three consecutive runs — longer than the 30s per-CASE budget
// the config used to set. The EO-CANCEL-01 canary timed out and cascade-skipped all five
// remaining cases, so the suite reported nothing about the product at all. That evidence
// is what moved the config's case budget to 120s (the click budget stays at expect: 15s),
// so this file no longer needs an override of its own — but the measurement is kept here
// because this is where it was taken.
test.describe('Edit Order — cancelling a placed test', () => {
  // Seeded HERE rather than in a beforeAll hook, and both halves of that matter: a page
  // from `browser.newPage()` carries no storage state (so every seeding call would be
  // unauthenticated) and starts on about:blank, where reading `localStorage` for the CSRF
  // token throws SecurityError. The test fixture's page has the session and a real origin.
  test('EO-CANCEL-01 [canary]: the order loads and its test is listed with an enabled Cancel Test control', async ({
    page,
  }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const seeded = await seedModifiableOrder(page);
    accession = seeded.accession;
    console.log(`[edit-order-cancel] seeded order ${accession}`);

    const before = await readCurrentTests(page, accession);
    expect(
      before.length,
      `Edit Order reports no current tests for ${accession}, so there is nothing to cancel. ` +
        `The order was seeded moments ago, so this is the screen or the seed, not the feature.`
    ).toBeGreaterThan(0);

    testName = String(before[0].testName ?? '');
    expect(testName, 'the current test has no name').not.toBe('');

    // A freshly placed test is NotStarted, so canCancel must be true even for a user with
    // no cancel privilege at all. If this is false the permission rule has changed, and
    // EO-CANCEL-02 below would be testing the privileged arm without saying so.
    expect(
      before[0].canCancel,
      `Edit Order says test "${testName}" (status ${before[0].status}) cannot be cancelled, ` +
        `though it has just been placed and has no results`
    ).toBe(true);
    expect(before[0].hasResults, 'the freshly placed test already reports results').toBeFalsy();

    await openSampleStep(page, accession);
    const row = page.locator('tr', { hasText: testName }).first();
    await expect(row, `no Current Tests row for ${testName}`).toBeVisible({ timeout: 15_000 });

    // Carbon hides the real input and paints the label; the label is the control.
    const cancelBox = row.locator('.cds--checkbox-wrapper').last();
    await expect(
      cancelBox,
      'the row renders no Cancel Test checkbox — the column exists in the headers but not in the row'
    ).toBeVisible();
    await expect(
      cancelBox.locator('input'),
      'the Cancel Test checkbox is disabled for a test that has not been started'
    ).toBeEnabled();
  });

  test('EO-CANCEL-02: ticking Cancel Test and submitting cancels the analysis', async ({ page }) => {
    await openSampleStep(page, accession);

    const row = page.locator('tr', { hasText: testName }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Last wrapper in the row is the `canceled` column; "Results Recorded" precedes it and
    // "Remove Sample" precedes that. Clicking the LABEL, never the hidden input.
    await row.locator('.cds--checkbox-wrapper').last().locator('label').click();
    await expect(
      row.locator('.cds--checkbox-wrapper').last().locator('input'),
      'the Cancel Test checkbox did not take the click'
    ).toBeChecked();

    // `exact: true`: the Current Tests table's Carbon pagination contributes a DISABLED
  // "Next Page" button, and a loose name match picks that one and waits 30s for a button
  // that will never be enabled.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
    const submit = page.locator('[data-cy="submit-order"]');
    await expect(submit, 'the wizard never reached the submit step').toBeVisible({ timeout: 20_000 });
    await submit.click();

    // The save is confirmed before the wizard advances (ModifyOrder.jsx only moves to the
    // success page on a 2xx), so a visible success message is the product's own signal.
    await expect(
      page.getByText(/success|saved/i).first(),
      'the order did not save — no success message appeared after Submit'
    ).toBeVisible({ timeout: 30_000 });

    const after = await readCurrentTests(page, accession);
    expect(
      after.map((t) => t.testName),
      `"${testName}" is still listed as a current test on ${accession} after being cancelled. ` +
        `The GET excludes Canceled analyses, so its presence means the analysis was not cancelled.`
    ).not.toContain(testName);
  });

  test('EO-CANCEL-03: the cancelled test is gone from the work the lab is asked to do', async ({
    page,
  }) => {
    await page.goto(`${BASE}/Results?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Not "the page is empty" — the worklist must specifically not offer the cancelled
    // test for result entry. An order whose only test was cancelled legitimately shows
    // nothing; an order that still lists it has not been cancelled in any way that matters.
    await expect(
      page.getByRole('cell', { name: testName, exact: false }),
      `the Results worklist still offers "${testName}" on ${accession} after it was cancelled, ` +
        `so a technician would still be asked to run it`
    ).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe('Edit Order — removing a whole sample', () => {
  test('EO-REMOVE-01 [canary]: a two-test sample lists both tests and offers Remove Sample on the sample row', async ({
    page,
  }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const seeded = await seedModifiableOrder(page, { testIds: TWO_TESTS });
    removeAccession = seeded.accession;
    console.log(`[edit-order-remove] seeded order ${removeAccession} with tests ${TWO_TESTS.join(',')}`);

    const before = await readCurrentTests(page, removeAccession);
    // Two, on ONE sample item. If the payload put them on separate items the remove would
    // only take one of them down and EO-REMOVE-02 would pass for the wrong reason.
    expect(
      before.length,
      `expected two tests on ${removeAccession}, got ${before.length}: ` +
        `${JSON.stringify(before.map((t) => t.testName))}`
    ).toBe(2);
    expect(
      new Set(before.map((t) => t.sampleItemId)).size,
      'the two tests landed on different sample items, so "Remove Sample" would not cover both'
    ).toBe(1);
    removeTestNames = before.map((t) => String(t.testName ?? ''));

    await openSampleStep(page, removeAccession);
    for (const name of removeTestNames) {
      await expect(
        page.locator('tr', { hasText: name }).first(),
        `no Current Tests row for ${name}`
      ).toBeVisible({ timeout: 15_000 });
    }

    // Remove Sample sits on the first row of the sample item only.
    const firstRow = page.locator('tr', { hasText: removeTestNames[0] }).first();
    const boxes = firstRow.locator('.cds--checkbox-wrapper');
    expect(
      await boxes.count(),
      'the sample row should carry three checkboxes: Remove Sample, Results Recorded, Cancel Test'
    ).toBe(3);
    await expect(
      boxes.first().locator('input'),
      'Remove Sample is disabled on a sample whose tests have all not been started'
    ).toBeEnabled();
  });

  test('EO-REMOVE-02: removing the sample cancels every test on it, not just the first', async ({
    page,
  }) => {
    await openSampleStep(page, removeAccession);

    const firstRow = page.locator('tr', { hasText: removeTestNames[0] }).first();
    // First wrapper in the row is `removeSample`; the column order is Remove Sample,
    // Results Recorded, Cancel Test. Clicking the LABEL — the input is hidden.
    await firstRow.locator('.cds--checkbox-wrapper').first().locator('label').click();
    await expect(
      firstRow.locator('.cds--checkbox-wrapper').first().locator('input'),
      'the Remove Sample checkbox did not take the click'
    ).toBeChecked();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const submit = page.locator('[data-cy="submit-order"]');
    await expect(submit, 'the wizard never reached the submit step').toBeVisible({ timeout: 20_000 });
    await submit.click();
    await expect(
      page.getByText(/success|saved/i).first(),
      'the order did not save — no success message appeared after Submit'
    ).toBeVisible({ timeout: 30_000 });

    const after = await readCurrentTests(page, removeAccession);
    // The sample is gone from Edit Order. This is a CONTRACT FACT, not the evidence that
    // the tests were cancelled, and the distinction is the whole point of EO-REMOVE-03:
    // `getSampleItems` drops a cancelled sample item, so this list empties whether the
    // analyses under it were cancelled or not. Asserting only this would report success
    // on a build that cancelled nothing.
    expect(
      after.map((t) => t.testName),
      `${removeAccession} still lists current tests after its sample was removed`
    ).toEqual([]);
  });

  test('EO-REMOVE-03: nothing from the removed sample is left on the work the lab is asked to do', async ({
    page,
  }) => {
    // FLIPPED 2026-09-22. This case carried `test.fail()` from 2026-09-15 to 2026-09-22,
    // asserting the SPEC against a build that did not meet it. On 2026-09-22 it reported
    // "Expected to fail, but passed" against develop, which is the marker doing its job:
    // OGC-1221 is fixed (PR #4326, merged as c2a6b943e), so the marker is removed and this
    // is now an ordinary regression check on the spec.
    //
    // THE SPEC. Removing a sample must cancel every analysis on it. As measured on develop
    // 2026-09-15, BEFORE the fix, it cancelled the sample item and ONLY the ticked row's
    // analysis:
    //
    //   accession DEV01260000000000228, sample_item 177 status 19 (Canceled)
    //     analysis 151 Glucose  status 14 Test Canceled
    //     analysis 152 Amylase  status  4 Not Tested        <- still live
    //
    // ROOT CAUSE, as it was. `SampleEditServiceImpl.createCancelSampleList` walked the rows and used a
    // sticky flag to carry "this sample is being removed" from the first row of a sample
    // item to the rest of the group. It resets that flag on any row whose accession number
    // is non-null — that is how it detects the start of the next group. But
    // `EditSample.jsx:formatTestsObject` rewrites every falsy accessionNumber to `""`
    // (mutating the form objects in place, so the submitted payload carries it), and `""`
    // is not null. The flag therefore resets on EVERY row and the group never extends past
    // the one the user ticked.
    //
    // The consequence was worse than a no-op: the surviving analyses stayed on the
    // worklist, and Edit Order could no longer see them, because its GET drops the cancelled
    // sample item they hang from. They could not be reached to be fixed.
    //
    // THE FIX groups by `sampleItemId` in a Set and drops the sentinel entirely
    // (SampleEditServiceImpl.java:481-498), so the behaviour no longer depends on row order
    // or on what the form does to blank accession numbers.
    await page.goto(`${BASE}/Results?accessionNumber=${removeAccession}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    for (const name of removeTestNames) {
      await expect(
        page.getByRole('cell', { name, exact: false }),
        `the Results worklist still offers "${name}" on ${removeAccession} after the sample was removed`
      ).toHaveCount(0, { timeout: 20_000 });
    }
  });
});
