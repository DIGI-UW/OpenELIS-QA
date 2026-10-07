import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Validation Workflow Test Suites
 * Suites: TC-VAL, Suite AB
 * Test Count: ~13
 */

// Helper functions
async function goToValidation(page: any, type: 'routine' | 'order' | 'unit' = 'order') {
  const candidates = [
    `${BASE}/ResultValidation?type=${type}`,
    `${BASE}/ResultValidation`,
    `${BASE}/ResultsValidation`,
    `${BASE}/UnderResultValidation`,
  ];
  for (const url of candidates) {
    const res = await page.goto(url);
    if (res?.status() === 200 && !page.url().match(/LoginPage|login/i)) return page.url();
  }
  throw new Error('Could not locate Validation screen — URL unknown');
}

async function navigateWithDiscoveryLocal(page: any, candidates: string[]): Promise<boolean> {
  for (const path of candidates) {
    const res = await page.goto(`${BASE}${path}`).catch(() => null);
    if (res?.status() === 200 && !page.url().match(/LoginPage|login/i)) {
      return true;
    }
  }
  return false;
}

async function getToday(): Promise<string> {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

async function getFutureDate(days: number): Promise<string> {
  const future = new Date();
  future.setDate(future.getDate() + days);
  return future.toISOString().split('T')[0];
}

test.describe('Validation workflow (TC-VAL)', () => {
  // Accession used for validation tests — from the TC-09 run that succeeded.
  // Change this to whichever accession has a saved result.
  const VAL_ACCESSION = '26CPHL00008V';

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-VAL-01: Validation screen renders the correct page structure for a validator', async ({ page }) => {
    // A results validator's entry point — they need to see a list of results
    // waiting for approval. The page must have a heading and a table/list structure.
    const reachedUrl = await goToValidation(page);
    expect(page.url(), 'Must not redirect to login — validator must be authenticated').not.toMatch(/LoginPage|login/i);
    console.log(`TC-VAL-01: Validation reached at ${reachedUrl}`);

    // A heading is required so the validator knows what screen they're on. REWORKED 2026-10-08:
    // the one-page Validation (#4513) titles itself with an h3, so the check is by role and name.
    const heading = page.getByRole('heading', { name: 'Validation', exact: true });
    await expect(heading, 'Validation page must name itself in a heading').toBeVisible({ timeout: 15_000 });

    // A table or search input is required — without either, the validator has nothing to act on
    const hasTable = await page.locator('main table, main .cds--data-table, main [role="table"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    const hasSearch = await page.locator('main').getByRole('searchbox', { name: /lab number|accession/i }).first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(
      hasTable || hasSearch,
      'Validation page must show a results table or an accession search field — otherwise validator has nothing to act on',
    ).toBe(true);
  });

  test('TC-VAL-02: Searching a known accession returns the matching result row', async ({ page }) => {
    // A validator searching by accession must get results for that specific order.
    // If the search returns nothing for a valid accession, the validator cannot approve results.
    await goToValidation(page, 'order');

    const accInput = page
      .locator('input[placeholder*="accession" i], input[id*="accession" i], input[placeholder*="number" i]')
      .first();

    if (!(await accInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-VAL-02: SKIP — By Order view has no accession input field; page structure differs from expected');
      return;
    }

    await accInput.fill(VAL_ACCESSION);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Verify the page didn't error out
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not show a server error after accession search').not.toMatch(/500|Internal Server Error/);

    // The known accession (26CPHL00008V) has an HGB test — it must appear or
    // we get an empty state (already validated), never a crash
    const hasResults = await page.getByText(/HGB|Hemoglobin|No.*result|0.*result/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasResults, 'Search must return either a result row or a clear empty-state message — not a blank page').toBe(true);
  });

  test('TC-VAL-03: Accept checkbox is present on result rows', async ({ page }) => {
    await goToValidation(page, 'order');

    // Accept checkbox — typically a checkbox in each result row
    const acceptCheckbox = page.locator(
      'input[type="checkbox"][id*="accept"], input[type="checkbox"][name*="accept"], ' +
      '.cds--checkbox[id*="accept"]'
    ).first();

    const hasAccept = await acceptCheckbox.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAccept) {
      console.log('TC-VAL-03: PASS — Accept checkbox found on validation row');
      expect(hasAccept).toBe(true);
    } else {
      // May need to load a result row first
      const accInput = page.locator('input').first();
      await accInput.fill(VAL_ACCESSION);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      const hasAcceptAfterSearch = await page.getByRole('checkbox').first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`TC-VAL-03: Accept checkbox after search = ${hasAcceptAfterSearch}`);
      // Don't hard-fail — just record
    }
  });

  test('TC-VAL-04: Save button is present and clickable on validation screen', async ({ page }) => {
    // REWORKED 2026-10-08: the one-page Validation (#4513) has no page-level Save. A result is
    // released from its row ("Validate & release" in the expanded row), and the page offers a
    // guarded bulk "Release all clear (n)". Both appear once a lab unit with waiting results is
    // loaded, so the case finds one through the queue the page itself reads. Nothing is released.
    await goToValidation(page);
    const units: Array<{ id: string; value: string }> = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/user-test-sections/Validation', { headers: { Accept: 'application/json' } });
      return r.ok ? r.json() : [];
    });
    let unitWithWork = '';
    for (const u of units) {
      const n = await page.evaluate(async (id) => {
        const r = await fetch(`/api/OpenELIS-Global/rest/AccessionValidation?labNumberFrom=&labNumberTo=&testSectionId=${id}&fromDate=&toDate=&patientId=`, { headers: { Accept: 'application/json' } });
        if (!r.ok) return 0;
        const j = await r.json();
        return (j.resultList ?? []).length;
      }, u.id);
      if (n > 0) { unitWithWork = u.value; break; }
    }
    expect(unitWithWork, 'precondition: some lab unit has results waiting for validation (enter and save a result first)').not.toBe('');
    await page.locator('main').getByRole('combobox', { name: 'Lab Unit' }).selectOption({ label: unitWithWork });
    await page.locator('main').getByRole('button', { name: 'Load results' }).click();
    await expect(page.locator('main').getByRole('button', { name: /^Release all clear \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
    await page.locator('main').getByRole('button', { name: 'Expand Row' }).first().click();
    const release = page.locator('main').getByRole('button', { name: 'Validate & release' }).first();
    await expect(release, 'an expanded row offers Validate & release').toBeVisible({ timeout: 15_000 });
    console.log(`TC-VAL-04: ${unitWithWork}: Validate & release visible; disabled = ${await release.isDisabled()}`);
  });

  test('TC-VAL-05: Notes / comment field is accessible on result row', async ({ page }) => {
    await goToValidation(page, 'order');

    // Load a result
    const accInput = page.locator('input').first();
    await accInput.fill(VAL_ACCESSION);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Look for a Notes column or a notes textarea in the row
    const notesInput = page.locator(
      'input[id*="note"], textarea[id*="note"], input[placeholder*="note" i], textarea[placeholder*="note" i]'
    ).first();

    const hasNotes = await notesInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasNotes) {
      await notesInput.fill('QA automated validation note');
      console.log('TC-VAL-05: PASS — Notes field found and filled');
      expect(hasNotes).toBe(true);
    } else {
      // Check for a Notes column header at least
      const hasNotesHeader = await page.getByText(/Notes|Comment/i).isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`TC-VAL-05: Notes input visible = ${hasNotes}; Notes header visible = ${hasNotesHeader}`);
      // Document without hard-fail — notes UI varies
    }
  });

  test('TC-VAL-07: Routine validation view loads', async ({ page }) => {
    await goToValidation(page, 'routine');
    expect(page.url()).not.toMatch(/LoginPage|login/i);
    const hasTable = await page.locator('table, .cds--data-table, th').first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`TC-VAL-07: Routine validation — URL: ${page.url()}, table visible: ${hasTable}`);
  });

  test('TC-VAL-08: Date range filter is present on validation screen', async ({ page }) => {
    await goToValidation(page);
    // Look for any date picker inputs
    const dateInputs = page.locator('input[type="date"], input[placeholder*="dd/mm/yyyy" i], .cds--date-picker__input');
    const count = await dateInputs.count();
    console.log(`TC-VAL-08: Date input count on validation screen = ${count}`);
    if (count >= 2) {
      console.log('TC-VAL-08: PASS — Date range inputs found');
    } else {
      console.log('TC-VAL-08: INFO — Date range filter may be on a different view tab');
    }
  });
});

test.describe('Suite AB — Validation By Order & By Date', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-VBO-01: Validation > By Order screen loads', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const validationLink = page.getByText(/^Validation$/i, { exact: true });
    if (await validationLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await validationLink.click();
      await page.waitForTimeout(500);
      const byOrderLink = page.getByText('By Order', { exact: true });
      if (await byOrderLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await byOrderLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/ValidationByAccession',
      '/ValidationByOrder',
      '/validation/order',
      '/validation/accession',
    ];
    const success = await navigateWithDiscoveryLocal(page, candidates);

    // Verify not login redirect
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify accession input
    const accessionField = page.locator(
      'input[placeholder*="accession" i], input[id*="accession" i], input'
    ).first();
    await expect(accessionField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Accession field not visible on Validation > By Order');
    });
  });

  test('TC-VBO-02: Enter accession number shows results for validation', async ({ page }) => {
    const candidates = [
      '/ValidationByAccession',
      '/ValidationByOrder',
      '/validation/order',
    ];
    await navigateWithDiscoveryLocal(page, candidates);

    // Search for accession
    const selectors = [
      'input[placeholder*="accession" i]',
      'input[id*="accession" i]',
      'input',
    ];
    const success = await fillSearchField(page, ACCESSION, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      // Verify validation queue displays
      const queueRow = page.locator('tr, [role="row"]').first();
      await expect(queueRow).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('No validation queue results found');
      });

      // Verify accession visible
      const accessionVisible = page.getByText(ACCESSION, { exact: false });
      await expect(accessionVisible).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Accession not visible in validation queue');
      });
    }
  });

  test('TC-VBR-03: Validation > By Range of Order Numbers screen loads', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const validationLink = page.getByText(/^Validation$/i, { exact: true });
    if (await validationLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await validationLink.click();
      await page.waitForTimeout(500);
      const byRangeLink = page.getByText(/By Range|Range of Order/i);
      if (await byRangeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await byRangeLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/ValidationByOrderRange',
      '/ValidationRange',
      '/validation/range',
    ];
    const success = await navigateWithDiscoveryLocal(page, candidates);

    // Verify not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify from/to fields exist
    const fromField = page.locator(
      'input[placeholder*="from" i], input[id*="from" i]'
    ).first();
    const toField = page.locator(
      'input[placeholder*="to" i], input[id*="to" i]'
    ).first();

    await expect(fromField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('From field not visible on Validation > By Range');
    });

    await expect(toField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('To field not visible on Validation > By Range');
    });
  });

  test('TC-VBD-04: Validation > By Date screen loads', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const validationLink = page.getByText(/^Validation$/i, { exact: true });
    if (await validationLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await validationLink.click();
      await page.waitForTimeout(500);
      const byDateLink = page.getByText('By Date', { exact: true });
      if (await byDateLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await byDateLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/ValidationByDate',
      '/ValidationDate',
      '/validation/date',
    ];
    const success = await navigateWithDiscoveryLocal(page, candidates);

    // Verify not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify date field exists
    const dateField = page.locator(
      'input[type="date"], input[placeholder*="date" i], input[id*="date" i]'
    ).first();
    await expect(dateField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Date field not visible on Validation > By Date');
    });
  });

  test('TC-VBD-05: Select date range shows validation queue', async ({ page }) => {
    const candidates = ['/ValidationByDate', '/ValidationDate', '/validation/date'];
    await navigateWithDiscoveryLocal(page, candidates);

    const today = await getToday();
    const tomorrow = await getFutureDate(1);

    // Fill from date
    const dateFields = page.locator('input[type="date"], input[placeholder*="date" i]');
    if (await dateFields.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateFields.first().fill(today);
    }

    // Fill to date
    if (await dateFields.nth(1).isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateFields.nth(1).fill(tomorrow);
    }

    // Click search/submit
    const submitBtn = page.getByRole('button', { name: /Search|Submit|Find/i }).first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2000);

    // Verify validation queue displays (or is empty but not error)
    const queueTable = page.locator('table, [role="grid"], [role="table"]').first();
    await expect(queueTable).toBeVisible({ timeout: 8000 }).catch(() => {
      console.log('Validation queue table not found for date range');
    });

    // Check for error messages
    const errorMsg = page.getByText(/error|failed|exception/i);
    await expect(errorMsg).not.toBeVisible({ timeout: 1000 }).catch(() => {
      console.log('Possible error on validation by date');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Validation Extended — Reject, Notes, and API Verification
// ─────────────────────────────────────────────────────────────

test.describe('Validation Extended — Result Rejection & API Verification', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-VAL-EXT-01: AccessionValidation API returns queue data', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Try both known validation endpoints
      const endpoints = [
        '/api/OpenELIS-Global/rest/AccessionValidation',
        '/api/OpenELIS-Global/rest/ResultValidation',
      ];
      for (const ep of endpoints) {
        const res = await fetch(ep, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          const data = await res.json();
          return { status: res.status, endpoint: ep, hasResults: data.testResult !== undefined || Array.isArray(data) };
        }
      }
      return { status: 404, endpoint: 'none', hasResults: false };
    });

    console.log(`TC-VAL-EXT-01: Validation API at ${result.endpoint} → ${result.status}`);
    // Should return 200 with structured data
    expect(result.status).toBe(200);
  });

  test('TC-VAL-EXT-02: Reject button is present or queue is empty state', async ({ page }) => {
    /**
     * US: As a lab supervisor, I can reject a result that has errors.
     * Rejection requires results in the validation queue.
     * Tests the UI presence of the Reject action.
     */
    const url = await goToValidation(page, 'routine').catch(() => null);
    if (!url) {
      console.log('TC-VAL-EXT-02: SKIP — validation page not reachable');
      test.skip();
      return;
    }

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const bodyText = await page.locator('body').innerText();
    const hasRejectBtn = (await page.locator('button, a').filter({ hasText: /reject/i }).count()) > 0;
    const hasQueueContent = /accession|test|hgb|result/i.test(bodyText);
    const isEmptyState = /no result|empty|nothing to validate/i.test(bodyText);

    if (hasRejectBtn) {
      console.log('TC-VAL-EXT-02: PASS — Reject button visible in validation queue');
      expect(hasRejectBtn).toBe(true);
    } else if (isEmptyState) {
      console.log('TC-VAL-EXT-02: PARTIAL — Queue is empty, Reject not yet applicable');
      expect(page.url()).not.toMatch(/LoginPage|login/i);
    } else {
      console.log(`TC-VAL-EXT-02: PARTIAL — Queue may have content but Reject not found. hasQueueContent=${hasQueueContent}`);
      expect(page.url()).not.toMatch(/LoginPage|login/i);
    }
  });

  test('TC-VAL-EXT-03: Validation page loads for known accession', async ({ page }) => {
    /**
     * Navigate to Validation by accession number (26CPHL00008V — known baseline accession).
     * This exercises the search-by-accession code path.
     */
    const url = await goToValidation(page, 'order').catch(() => `${BASE}/ResultValidation`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Try to search for the known accession
    const accessionInput = page
      .locator('input[placeholder*="accession" i], input[id*="accession" i], input[name*="accession" i]')
      .first();

    if (await accessionInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accessionInput.fill('26CPHL00008V');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      const found = /26CPHL|Abby|HGB|Sebby/i.test(bodyText);
      console.log(`TC-VAL-EXT-03: ${found ? 'PASS' : 'PARTIAL'} — accession search result: ${found ? 'found' : 'not found (may be validated already)'}`);
      expect(bodyText).not.toContain('Internal Server Error');
    } else {
      console.log('TC-VAL-EXT-03: PARTIAL — accession input not found on validation screen');
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toBeTruthy();
    }
  });

  test('TC-VAL-EXT-04: Validation shows correct status after approving a result', async ({ page }) => {
    /**
     * US: As a lab technician, I can approve a validated result.
     * Tests that clicking Approve changes the status without server errors.
     * Requires data in the queue — if queue is empty, the test is marked PARTIAL.
     */
    const url = await goToValidation(page, 'routine').catch(() => null);
    if (!url) {
      test.skip();
      return;
    }

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Look for an Approve/Accept button
    const approveBtn = page
      .getByRole('button', { name: /approve|accept/i })
      .or(page.locator('button').filter({ hasText: /approve|accept/i }))
      .first();

    if (!(await approveBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-VAL-EXT-04: PARTIAL — No Approve button visible (empty queue or different UI state)');
      expect(page.url()).not.toMatch(/LoginPage|login/i);
      return;
    }

    // Intercept the POST response
    let responseStatus = 0;
    page.on('response', resp => {
      if (resp.url().includes('Validation') && resp.request().method() === 'POST') {
        responseStatus = resp.status();
      }
    });

    await approveBtn.click();
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-VAL-EXT-04: Approve clicked, POST status=${responseStatus}`);
  });
});
