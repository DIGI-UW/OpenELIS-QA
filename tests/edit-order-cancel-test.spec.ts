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
 * NOT COVERED HERE, deliberately, and worth saying out loud:
 *   - the non-admin arm of `canCancel` (a started analysis, an ordinary user). It needs a
 *     second storage state; `rbac.config.ts` is where that belongs.
 *   - "Remove Sample", which cancels every analysis on the sample item.
 *   - whether cancelling the last remaining test leaves the SAMPLE in a sensible state.
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
  status?: string;
  canCancel?: boolean;
  hasResults?: boolean;
}

/** Shared across the serial cases: seeded once, then acted on. */
let accession = '';
let testName = '';

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
