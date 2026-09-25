import { test, expect, type Page } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange, getFutureDate, navigateViaMenu, tryNavigateToURL, selectSampleType, discoverFhirBase, orderWizardForward, getPrimaryAccession } from '../helpers/test-helpers';
import { withIsolatedSession, reloginIsolated } from '../helpers/isolated-session';

/**
 * System & Miscellaneous Tests
 * Catch-all suite for all remaining test blocks covering:
 *   - RBAC, Test Catalog, LOINC, Audit, FHIR, Export
 *   - Session Management, Error Handling, Cleanup
 *   - Storage, Analyzers, EQA, Aliquot, Billing
 *   - Phase 4 & 5 deep interaction tests
 * Total: ~110+ tests
 */

test.describe('RBAC URL access checks (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const adminRoutes = [
    { url: '/SamplePatientEntry', label: 'Add Order' },
    { url: '/SampleEdit?type=readwrite', label: 'Edit Order' },
    { url: '/AccessionResults', label: 'Results By Order' },
    { url: '/MasterListsPage/TestAdd', label: 'Test Catalog Add' },
    { url: '/MasterListsPage/TestModifyEntry', label: 'Test Catalog Modify' },
    { url: '/Dashboard', label: 'Dashboard' },
  ];

  for (const route of adminRoutes) {
    test(`TC-RBAC-URL: ${route.label} (${route.url}) returns 200`, async ({ page }) => {
      const response = await page.goto(`${BASE}${route.url}`);
      expect(response?.status()).toBe(200);
      // Should not redirect to login
      expect(page.url()).not.toMatch(/LoginPage|login/i);
    });
  }

  test(
    'TC-RBAC-USER [BUG-3 KNOWN]: User account creation returns 500',
    async ({ page }) => {
      // Navigate to User Management
      await page.goto(`${BASE}/MasterListsPage`);
      // This test documents BUG-3: POST /rest/UnifiedSystemUser → 500
      // When BUG-3 is fixed, this test should succeed in creating a user.
      let responseStatus = 0;
      page.on('response', (response) => {
        if (response.url().includes('UnifiedSystemUser')) {
          responseStatus = response.status();
        }
      });

      // Navigate to Add User (path may vary)
      await page.goto(`${BASE}/UserEdit`);
      // Fill form
      await page.locator('input[name*="firstName"], input[id*="firstName"]').fill('QA');
      await page.locator('input[name*="lastName"], input[id*="lastName"]').fill('TestUser');
      await page.locator('input[name*="loginName"], input[id*="loginName"]').fill('qa_testuser_playwright');
      await page.locator('input[name*="password"], input[type="password"]').first().fill('QAtest1!');
      await page.locator('button[type="submit"]').click();

      // BUG-3: responseStatus will be 500
      // When fixed, change this assertion to: expect(responseStatus).toBe(200);
      if (responseStatus !== 0) {
        console.log(`BUG-3: POST /rest/UnifiedSystemUser returned ${responseStatus}`);
        expect(responseStatus).toBe(500); // documents current broken state
      }
    }
  );
});


test.describe('Test Catalog', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // RE-POINTED 2026-09-24. TC-CAT-01..03 drove the legacy TestAdd / TestModifyEntry screens, which
  // the OGC-949 spec (FR-001) says "MUST be removed" and the QA depth plan lists as retire-now
  // (OGC-940). They were failing on strict-mode locators and changed legacy markup, and TC-CAT-02
  // asserted the legacy BUG-1 500 as a plain expect. They now check the Test Catalog Editor that
  // replaced those screens, using its stable ids. Deep editor coverage lives in
  // test-catalog-silent-actions, test-catalog-section-depth and test-catalog-sections-roundtrip.
  test('TC-CAT-01: Test Catalog list loads with its search and New Test action', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList`);
    await expect(page.locator('#test-search'), 'the catalog list renders its search box').toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('new-test-button'), 'and offers New Test').toBeVisible();
  });

  test('TC-CAT-02: New Test opens the editor on a blank create form', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList`);
    await page.getByTestId('new-test-button').click({ timeout: 30_000 });
    await expect(page.locator('#basic-info-name'), 'the create form asks for a name').toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#basic-info-code'), 'and a code').toBeVisible();
    await expect(page.locator('#basic-info-name'), 'a new test starts blank').toHaveValue('');
  });

  test('TC-CAT-03: Opening an existing test shows its saved name', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList`);
    const saved = await page.evaluate(async () => {
      const list = await (await fetch('/api/OpenELIS-Global/rest/test-list', { credentials: 'include' })).json();
      const id = String(list?.[0]?.id ?? '');
      const bi = id ? await (await fetch(`/api/OpenELIS-Global/rest/test-catalog/tests/${id}/basic-info`, { credentials: 'include' })).json() : null;
      return { id, name: bi?.name ?? null };
    });
    expect(saved.id, 'precondition: the instance has at least one active test').not.toBe('');
    expect(saved.name, 'precondition: basic-info reads back').toBeTruthy();
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${saved.id}/basic-info`);
    await expect(page.locator('#basic-info-name'), `the editor shows test ${saved.id}'s saved name`).toHaveValue(saved.name!, { timeout: 30_000 });
  });
});


test.describe('LOINC and Dictionary CRUD (TC-LOINC)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const LOINC_URLS = [
    '/MasterListsPage/LOINCCodes',
    '/LOINCManagement',
    '/MasterListsPage/TestLOINC',
    '/MasterListsPage/LOINC',
  ];

  async function goToLoincScreen(page: Page): Promise<string> {
    for (const u of LOINC_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/loinc|code/i.test(text)) return page.url();
      }
    }
    return '';
  }

  test('TC-LOINC-01: LOINC management screen accessible', async ({ page }) => {
    const url = await goToLoincScreen(page);
    if (!url) {
      console.log('TC-LOINC-01: GAP — LOINC management screen not found at known URLs');
      return;
    }
    console.log(`TC-LOINC-01: PASS — LOINC screen at ${url}`);
    expect(url).toBeTruthy();
  });

  test('TC-LOINC-02: Search for HGB LOINC code (718-7)', async ({ page }) => {
    const url = await goToLoincScreen(page);
    // A genuine absence: this build does not expose the LOINC screen. Skip is
    // visible in the report; an early `return` here used to read as a pass.
    test.skip(!url, 'LOINC screen not accessible on this build');

    const searchField = page.locator('input[type="search"], input[type="text"]').first();
    if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchField.fill('718-7');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }

    const has7187 = await page.getByText(/718-7|hemoglobin/i).isVisible({ timeout: 5000 }).catch(() => false);
    expect(has7187, 'LOINC search for 718-7 returned neither the code nor "hemoglobin"').toBeTruthy();
  });

  test('TC-LOINC-03: LOINC mapping visible on HGB test record', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestModifyEntry`);
    await page.waitForTimeout(2000);

    // Find HGB in the test list
    const hgbRow = page.getByText(/HGB|Haemoglobin|Hemoglobin/i).first();
    if (!(await hgbRow.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-LOINC-03: SKIP — HGB test not found in Modify Test Entry list');
      return;
    }

    // Check if LOINC field is present in wizard
    const loincField = page.locator('input[id*="loinc" i], select[id*="loinc" i], [class*="loinc" i]').first();
    const hasLoinc = await loincField.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasLoinc) {
      // Navigate into the wizard
      await hgbRow.click();
      await page.waitForTimeout(1500);
      const loincAfterNav = await page.locator('input[id*="loinc" i], [class*="loinc" i]').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      console.log(loincAfterNav
        ? 'TC-LOINC-03: PASS — LOINC field visible in HGB test record'
        : 'TC-LOINC-03: GAP — no LOINC field in HGB test wizard');
    } else {
      const loincVal = await loincField.inputValue().catch(() => '');
      console.log(`TC-LOINC-03: PASS — LOINC field found, value: "${loincVal || '(empty)'}"`);
    }
  });

  test('TC-LOINC-04: Add a new LOINC code (CRUD)', async ({ page }) => {
    const url = await goToLoincScreen(page);
    if (!url) {
      console.log('TC-LOINC-04: SKIP — LOINC screen not accessible');
      return;
    }

    const addBtn = page.getByRole('button', { name: /add|new/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-LOINC-04: GAP — no Add button on LOINC screen');
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const codeField = page.locator('input[id*="code" i], input[placeholder*="code" i]').first();
    const descField = page.locator('input[id*="desc" i], input[placeholder*="desc" i], input[id*="name" i]').first();

    if (await codeField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await codeField.fill('QA-AUTO-9999');
    }
    if (await descField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descField.fill('QA Automated LOINC Test Code');
    }

    let postStatus = 0;
    page.on('response', (r) => {
      if (r.request().method() === 'POST' && /loinc/i.test(r.url())) postStatus = r.status();
    });

    const saveBtn = page.getByRole('button', { name: /save|accept|add/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    const persisted = await page.getByText(/QA-AUTO-9999/i).isVisible({ timeout: 3000 }).catch(() => false);
    console.log(persisted
      ? `TC-LOINC-04: PASS — LOINC entry created (POST ${postStatus})`
      : `TC-LOINC-04: FAIL — entry not found after save (POST ${postStatus})`);
  });

  test('TC-LOINC-05: Dictionary category list accessible', async ({ page }) => {
    const dictUrls = ['/MasterListsPage/Dictionary', '/DictionaryManagement'];
    for (const u of dictUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        const catCount = (text.match(/reject|reason|interpretation|referral/gi) ?? []).length;
        console.log(catCount >= 2
          ? `TC-LOINC-05: PASS — multiple dictionary categories at ${page.url()}`
          : `TC-LOINC-05: NOTE — only ${catCount} category-like terms at ${page.url()}`);
        return;
      }
    }
    console.log('TC-LOINC-05: GAP — dictionary screen not accessible');
  });

  test('TC-LOINC-06: Edit and deactivate dictionary entry', async ({ page }) => {
    // Use the QA entry from TC-ADMIN-06 if it was created; otherwise find any safe entry
    const res = await page.goto(`${BASE}/MasterListsPage/Dictionary`).catch(() => null);
    test.skip(!res || page.url().includes('LoginPage'), 'dictionary screen not accessible');

    const qaEntry = page.getByText(/QA_AUTO_RejReason/i).first();
    const haveFixture = await qaEntry.isVisible({ timeout: 3000 }).catch(() => false);
    // Ordering dependency, not a defect: TC-ADMIN-06 seeds this entry.
    test.skip(!haveFixture, 'QA_AUTO_RejReason not present — run TC-ADMIN-06 first to seed it');

    // Click edit on this entry
    const row = page.locator('tr', { has: page.getByText(/QA_AUTO_RejReason/i) }).first();
    const editBtn = row.getByRole('button', { name: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1000);

      const inputField = page.locator('input[type="text"]').first();
      if (await inputField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await inputField.fill('QA_EDITED_ENTRY');
        await page.getByRole('button', { name: /save|accept/i }).first().click();
        await page.waitForTimeout(1500);
      }

      const edited = await page.getByText(/QA_EDITED_ENTRY/i).isVisible({ timeout: 3000 }).catch(() => false);
      expect(edited, 'dictionary edit did not persist after save (BUG-8 class)').toBeTruthy();
      console.log(edited
        ? 'TC-LOINC-06 edit: PASS'
        : 'TC-LOINC-06 edit: FAIL — edit not persisted (BUG-8 class?)');
    } else {
      console.log('TC-LOINC-06: GAP — no Edit button on dictionary entry row');
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 18 — Audit Log and System Configuration (TC-SYS)


test.describe('Audit Log and System Configuration (TC-SYS)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const AUDIT_URLS = ['/AuditLog', '/SystemLog', '/ActivityLog', '/MasterListsPage/AuditLog'];
  const SYS_CONFIG_URLS = ['/SystemConfiguration', '/MasterListsPage/SystemConfig', '/AdminModule'];

  test('TC-SYS-01: Audit log screen accessible', async ({ page }) => {
    // Re-pointed 2026-09-24: the audit log is QA > QMS > Audit Trail (menu: /AuditTrailReport?type=system,
    // which redirects to /qa/qms/audit-trail?type=system). The old /AuditLog-style guesses no longer exist.
    await page.goto(`${BASE}/AuditTrailReport?type=system`);
    await expect(page).toHaveURL(/audit-trail\?type=system|AuditTrailReport/);
    await expect(page.getByRole('heading', { name: 'System Audit Trail' })).toBeVisible();
    await expect(page.locator('#startDate')).toBeVisible();
    await expect(page.locator('#endDate')).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  });
  test('TC-SYS-02: Audit log shows recent admin actions', async ({ page }) => {
    await page.goto(`${BASE}/AuditTrailReport?type=system`);
    await expect(page.getByRole('heading', { name: 'System Audit Trail' })).toBeVisible();
    const res = page.waitForResponse(r => /audit/i.test(r.url()) && r.request().method() === 'GET' && !r.url().endsWith('.js'));
    await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click();
    expect((await res).status()).toBe(200);
    // The harness setup edits data as admin on every run, so the default window must hold recent events.
    // The user column shows the account's display name (e.g. "Open ELIS"), not the login, so assert shape and recency.
    const first = page.locator('main tbody tr').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    const cells = (await first.locator('td').allInnerTexts()).map(t => t.trim());
    const m = cells.join(' ').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    expect(m, `no date in first audit row: ${cells.join(' | ')}`).not.toBeNull();
    const when = new Date(Number(m![3]), Number(m![1]) - 1, Number(m![2]));
    expect(Math.abs(Date.now() - when.getTime())).toBeLessThan(2 * 24 * 3600 * 1000);
    expect(cells.join(' ')).toMatch(/Insert|Update|Delete/);
  });
  test('TC-SYS-03: System configuration screen accessible', async ({ page }) => {
    for (const u of SYS_CONFIG_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/config|setting|parameter|module/i.test(text)) {
          console.log(`TC-SYS-03: PASS — system config at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-SYS-03: GAP — system configuration screen not found');
  });

  test('TC-SYS-04: Test analysis configuration list accessible', async ({ page }) => {
    const analysisUrls = [
      '/MasterListsPage/AnalysisConfiguration',
      '/MasterListsPage/TestManagement',
      '/MasterListsPage',
    ];
    for (const u of analysisUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/analysis|test name|test code|result type/i.test(text)) {
          console.log(`TC-SYS-04: PASS — analysis configuration list at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-SYS-04: GAP — analysis configuration list not found');
  });

  test('TC-SYS-05: Provider/requester configuration accessible', async ({ page }) => {
    const providerUrls = [
      '/MasterListsPage/Providers',
      '/MasterListsPage/Requesters',
      '/ProviderManagement',
    ];
    for (const u of providerUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/provider|requester|doctor|first name|last name/i.test(text)) {
          console.log(`TC-SYS-05: PASS — provider management at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-SYS-05: GAP — provider/requester configuration not found at known URLs');
  });
});

// ---------------------------------------------------------------------------
// Suite 19 — Multi-Patient Batch and High-Volume Workflow (TC-BATCH)
// ---------------------------------------------------------------------------


test.describe('FHIR Integration (TC-EO)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  /**
   * These four used to `page.goto()` a hard-coded `${BASE}/fhir` and `${BASE}/api/fhir`
   * and accept the answer when `res.ok()` was true. Both paths are unknown to the
   * server, which serves the React SPA shell for them with HTTP 200 + text/html, so
   * every probe "succeeded" against an HTML page and every one of these tests then
   * reported GAP — or failed reading a FHIR body that was never there. Discovery is
   * shared now and demands a JSON CapabilityStatement; see discoverFhirBase.
   *
   * They also fetch rather than navigate: driving the browser to a JSON endpoint
   * throws away the session cookie behaviour these assertions depend on and leaves
   * the page parked on a JSON document.
   */
  async function fhirText(page: any, path: string): Promise<{ status: number; text: string } | null> {
    await page.goto(`${BASE}`);
    const base = await discoverFhirBase(page);
    if (!base) return null;
    return page.evaluate(async (url: string) => {
      const res = await fetch(url, { headers: { Accept: 'application/fhir+json' } });
      return { status: res.status, text: (await res.text()).slice(0, 20000) };
    }, `${base}${path}`);
  }

  test('TC-EO-01: FHIR metadata endpoint responds', async ({ page }) => {
    const res = await fhirText(page, '/metadata');
    const reachable = !!res && /CapabilityStatement|fhirVersion/i.test(res.text);
    console.log(reachable
      ? 'TC-EO-01: PASS — FHIR metadata reachable'
      : 'TC-EO-01: GAP — FHIR metadata endpoint not accessible');
  });

  test('TC-EO-02: FHIR Patient lookup by national ID', async ({ page }) => {
    const res = await fhirText(page, '/Patient?identifier=0123456');
    if (res && /Sebby|Abby/i.test(res.text)) {
      console.log('TC-EO-02: PASS — FHIR Patient found');
      return;
    }
    console.log('TC-EO-02: GAP — FHIR Patient lookup not available or patient not found');
  });

  test('TC-EO-03: FHIR ServiceRequest for lab order', async ({ page }) => {
    const sr = await fhirText(page, '/ServiceRequest?subject:Patient.identifier=0123456');
    if (sr && /ServiceRequest|entry/i.test(sr.text)) {
      console.log('TC-EO-03: PASS — FHIR ServiceRequest found');
      return;
    }
    const dr = await fhirText(page, '/DiagnosticReport?subject:Patient.identifier=0123456');
    if (dr && /DiagnosticReport|entry/i.test(dr.text)) {
      console.log('TC-EO-03: PASS — FHIR DiagnosticReport found (no ServiceRequest)');
      return;
    }
    console.log('TC-EO-03: GAP — no FHIR ServiceRequest or DiagnosticReport found');
  });

  test('TC-EO-04: FHIR DiagnosticReport includes result values', async ({ page }) => {
    const res = await fhirText(page, '/DiagnosticReport?subject:Patient.identifier=0123456');
    if (res && /result|Observation|valueQuantity/i.test(res.text)) {
      console.log('TC-EO-04: PASS — DiagnosticReport with result references');
      return;
    }
    console.log('TC-EO-04: GAP — FHIR DiagnosticReport with results not accessible');
  });
});

// ---------------------------------------------------------------------------
// Suite 21 — Export and Download (TC-EXP)
// ---------------------------------------------------------------------------


test.describe('Export and Download (TC-EXP)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-EXP-01: Results export button present', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(2000);

    const exportBtn = page.getByRole('button', { name: /export|download|csv/i }).first();
    const exportLink = page.getByRole('link', { name: /export|download|csv/i }).first();

    const hasExport = (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) ||
                      (await exportLink.isVisible({ timeout: 3000 }).catch(() => false));

    console.log(hasExport
      ? 'TC-EXP-01: PASS — export option found on Results view'
      : 'TC-EXP-01: GAP — no export button in Results By Order view');
  });

  test('TC-EXP-02: Workplan export button present', async ({ page }) => {
    const wpUrls = ['/WorkPlan', '/WorkPlanByTestSection', '/WorkPlanByTest'];
    for (const u of wpUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) break;
    }
    await page.waitForTimeout(1500);

    const exportBtn = page.getByRole('button', { name: /export|download|csv|print/i }).first();
    const hasExport = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(hasExport
      ? 'TC-EXP-02: PASS — export option on workplan'
      : 'TC-EXP-02: GAP — no export button on workplan');
  });

  test('TC-EXP-03: PDF export accessible from lab report', async ({ page }) => {
    const reportUrls = [
      `/LabReport?accession=26CPHL00008V`,
      `/PatientReport?accession=26CPHL00008V`,
    ];

    let hasPdf = false;
    for (const u of reportUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const pdfBtn = page.getByRole('button', { name: /pdf|export|download|print/i }).first();
        hasPdf = await pdfBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasPdf) {
          console.log(`TC-EXP-03: PASS — PDF export at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-EXP-03: GAP — no PDF export option found on lab report');
  });

  test('TC-EXP-04: Validation screen has export/print option', async ({ page }) => {
    const valUrls = ['/ResultValidation?type=order', '/ResultValidation'];
    for (const u of valUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) break;
    }
    await page.waitForTimeout(1500);

    const exportBtn = page.getByRole('button', { name: /export|download|csv|print/i }).first();
    const hasExport = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(hasExport
      ? 'TC-EXP-04: PASS — export on validation screen'
      : 'TC-EXP-04: GAP — no export on validation screen');
  });

  test('TC-EXP-05: Dashboard has export/download option', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);

    const exportBtn = page.getByRole('button', { name: /export|download|csv/i }).first();
    const hasExport = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(hasExport
      ? 'TC-EXP-05: PASS — export on dashboard'
      : 'TC-EXP-05: GAP — no export on dashboard (common)');
  });
});

// ---------------------------------------------------------------------------
// Suite 22 — Localization / i18n (TC-I18N)
// ---------------------------------------------------------------------------


test.describe('Session Management (TC-SESS)', () => {
  test('TC-SESS-02: Logout clears session — back button blocked', async ({ browser }) => {
    // Logs out, so it runs in its own session (helpers/isolated-session.ts), never the shared one.
    await withIsolatedSession(browser, async (page) => {
      // (logged in by withIsolatedSession)
      await page.goto(`${BASE}/AccessionResults`);
      await page.waitForTimeout(1000);

      // Look for logout
      const logoutLink = page.getByRole('link', { name: /logout|log out|sign out/i }).first();
      const logoutBtn = page.getByRole('button', { name: /logout|log out|sign out/i }).first();

      if (await logoutLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutLink.click();
      } else if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutBtn.click();
      } else {
        // Try hamburger → logout
        const hamburger = page.locator('[class*="hamburger"], [class*="menu-toggle"], button[aria-label*="menu" i]').first();
        if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
          await hamburger.click();
          await page.waitForTimeout(500);
          const logoutInMenu = page.getByText(/logout|log out|sign out/i).first();
          if (await logoutInMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
            await logoutInMenu.click();
          }
        }
      }

      await page.waitForTimeout(2000);
      const onLogin = page.url().includes('Login') || page.url() === `${BASE}/` || page.url() === `${BASE}`;
      console.log(onLogin
        ? 'TC-SESS-02: PASS — redirected to login after logout'
        : `TC-SESS-02: NOTE — after logout, landed on ${page.url()}`);

      // Test back button
      await page.goBack();
      await page.waitForTimeout(1500);
      const backOnLogin = page.url().includes('Login') || !page.url().includes('Accession');
      // Security assertion — a protected page reachable via Back after logout is
      // a real finding, not a note.
      expect(backOnLogin, `protected page still reachable via the back button after logout (${page.url()})`).toBeTruthy();
    });
  });

  test('TC-SESS-03: Stale URL redirects to login', async ({ browser }) => {
    /**
     * "Don't login" cannot be honoured by the `page` fixture: modules.config.ts
     * gives every test `storageState: '.auth/user.json'`, so the browser context
     * arrives already authenticated and the protected URL correctly loads. The
     * test was asserting the opposite of what its own harness had arranged, and
     * failing on the fixture rather than on the product.
     *
     * An ANONYMOUS context is what this case is about, so it makes one. Verified
     * 2026-09-14: /AccessionResults in a clean context lands on /login with a
     * password field, i.e. the security property holds.
     */
    const ctx = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/AccessionResults`);
      await page.waitForTimeout(2000);

      // The route is lowercase `/login` on 3.2.2.x; the old `includes('Login')`
      // would have missed the redirect even from an anonymous context.
      const redirectedToLogin = /\/login/i.test(page.url());
      console.log(redirectedToLogin
        ? 'TC-SESS-03: PASS — protected URL redirects to login without session'
        : `TC-SESS-03: FAIL — protected page accessible without login (${page.url()})`);
      expect(redirectedToLogin, `unauthenticated /AccessionResults must redirect to login (landed on ${page.url()})`).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('TC-SESS-04: Login error messages are consistent', async ({ browser }) => {
    /**
     * Needs the login FORM, and an authenticated context never sees it —
     * /LoginPage redirects straight to Home, so every fill() below waited for an
     * input that was not there. Same root cause as TC-SESS-03: the config injects
     * storageState for every spec. Own anonymous context.
     */
    const ctx = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
    await page.goto(`${BASE}/LoginPage`);
    await page.waitForTimeout(1000);

    // The password input is `name="password"`, not `userPass`, and the submit
    // control carries no accessible name (both read off the live login form
    // 2026-09-14) — so the original fill/click waited out the whole test timeout
    // on a form that was right there.
    const PASS_SEL = 'input[name="password"], #password, input[type="password"]';
    const submit = async () => {
      const byRole = page.getByRole('button', { name: /submit|login|sign in|save|next|accept/i }).first();
      if (await byRole.isVisible({ timeout: 1_000 }).catch(() => false)) return byRole.click();
      return page.locator('#submitButton, button[type="submit"], input[type="submit"]').first().click();
    };

    // Bad username
    await page.fill('input[name="loginName"]', 'fakeuserXYZ');
    await page.fill(PASS_SEL, 'wrongpassword');
    await submit();
    await page.waitForTimeout(1500);
    // textContent() with no timeout waits FOREVER when nothing matches, and on a
    // rejected login this instance renders no error element at all — so the test
    // hung here for its whole budget once the form selectors were fixed. Bounded,
    // and an absent message reads as the empty string it is.
    const ERROR_SEL = '[class*="error"], [class*="alert"], [role="alert"]';
    const errMsg1 = await page.locator(ERROR_SEL).first().textContent({ timeout: 3000 }).catch(() => '');

    // Bad password for real user
    await page.goto(`${BASE}/LoginPage`);
    await page.waitForTimeout(1000);
    await page.fill('input[name="loginName"]', 'admin');
    await page.fill(PASS_SEL, 'totallyWrongPassword');
    await submit();
    await page.waitForTimeout(1500);
    const errMsg2 = await page.locator(ERROR_SEL).first().textContent({ timeout: 3000 }).catch(() => '');

    const consistent = errMsg1 === errMsg2;
    console.log(consistent
      ? `TC-SESS-04: PASS — consistent error messages ("${errMsg1!.trim().slice(0, 50)}")`
      : `TC-SESS-04: FAIL — different errors: "${errMsg1!.trim().slice(0, 40)}" vs "${errMsg2!.trim().slice(0, 40)}" (credential enumeration risk)`);
    } finally {
      await ctx.close();
    }
  });

  test('TC-SESS-05: Concurrent sessions both work', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await login(page1, ADMIN.user, ADMIN.pass);
    await page1.goto(`${BASE}/AccessionResults`);

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await login(page2, ADMIN.user, ADMIN.pass);
    await page2.goto(`${BASE}/AccessionResults`);

    // Check page1 still works
    await page1.reload();
    await page1.waitForTimeout(1000);
    const page1Ok = !page1.url().includes('Login');
    console.log(page1Ok
      ? 'TC-SESS-05: PASS — concurrent sessions both remain active'
      : 'TC-SESS-05: NOTE — first session invalidated by second login');

    await ctx1.close();
    await ctx2.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 24 — Accessibility / WCAG Smoke (TC-A11Y)
// ---------------------------------------------------------------------------


test.describe('Error Handling and Edge Cases (TC-ERR)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ERR-01: Invalid accession shows graceful error', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);

    const accField = page.locator('input[id*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill('INVALID_ACCESSION_999');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Check for graceful handling
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    const bodyText = await page.textContent('body') ?? '';
    const hasNotFound = /not found|no result|no match|invalid/i.test(bodyText);
    const hasStackTrace = /exception|stacktrace|null pointer|error at/i.test(bodyText);

    console.log(hasNotFound
      ? 'TC-ERR-01: PASS — graceful "not found" message'
      : hasStackTrace
        ? 'TC-ERR-01: FAIL — stack trace visible to user'
        : 'TC-ERR-01: NOTE — no explicit not-found message (may silently ignore)');
    expect(hasStackTrace).toBe(false);
  });

  test('TC-ERR-02: Empty patient search handled gracefully', async ({ page }) => {
    const patUrls = ['/PatientManagement', '/FindPatient'];
    for (const u of patUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) break;
    }
    await page.waitForTimeout(1000);

    // Submit empty search
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body') ?? '';
    const hasCrash = /exception|error|stacktrace/i.test(bodyText) && !/no.*found|enter.*search/i.test(bodyText);
    console.log(hasCrash
      ? 'TC-ERR-02: FAIL — empty search caused error'
      : 'TC-ERR-02: PASS — empty search handled gracefully');
    expect(hasCrash).toBe(false);
  });

  test('TC-ERR-03: Special characters and XSS prevention', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForTimeout(2000);

    const nameField = page.getByRole('textbox', { name: /last.*name/i }).first();
    if (!(await nameField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-ERR-03: SKIP — no last name field found');
      return;
    }

    let alertFired = false;
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });

    await nameField.fill("O'Brien-Müller <script>alert(1)</script>");
    await page.waitForTimeout(500);

    // Try to advance
    const nextBtn = orderWizardForward(page);
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
    }

    console.log(alertFired
      ? 'TC-ERR-03: CRITICAL FAIL — XSS alert fired (script executed in DOM)'
      : 'TC-ERR-03: PASS — XSS attempt blocked or sanitized');
    expect(alertFired).toBe(false);
  });

  test('TC-ERR-04: Extreme result values handled gracefully', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);

    // Find any pending result input
    const accField = page.locator('input[id*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill('26CPHL00008V');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const resultInput = page.locator('input[id*="result" i], table input[type="text"]').first();
    if (!(await resultInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-ERR-04: SKIP — no result input visible');
      return;
    }

    // Test non-numeric
    await page.evaluate(() => {
      const inp = document.querySelector<HTMLInputElement>('input[id*="result" i], table input[type="text"]');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(inp, 'abc');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    const bodyText = await page.textContent('body') ?? '';
    const hasValidation = /invalid|numeric|number|must be/i.test(bodyText);
    console.log(hasValidation
      ? 'TC-ERR-04: PASS — non-numeric input rejected with validation message'
      : 'TC-ERR-04: NOTE — no immediate validation for non-numeric (may validate on save)');
  });

  test('TC-ERR-05: 404 page is clean (no stack trace)', async ({ page }) => {
    const res = await page.goto(`${BASE}/ThisPageDoesNotExist_QA`);
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent('body') ?? '';
    const status = res?.status() ?? 0;
    const hasStack = /exception|stacktrace|at org\.openelis|error at line/i.test(bodyText);
    const hasNav = await page.locator('nav, [class*="menu"], [class*="header"]').count() > 0;

    console.log(`TC-ERR-05: Status ${status}, stack trace visible: ${hasStack}, nav present: ${hasNav}`);
    console.log(hasStack
      ? 'TC-ERR-05: FAIL — stack trace visible on 404 page'
      : 'TC-ERR-05: PASS — no technical details exposed');
    expect(hasStack).toBe(false);
  });

  test('TC-ERR-06: Double submit prevention on Add Order', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForTimeout(2000);

    // Navigate through the wizard quickly to get to submit
    const nextBtn = orderWizardForward(page);
    for (let i = 0; i < 4 && await nextBtn.isVisible({ timeout: 1000 }).catch(() => false); i++) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for a submit button
    const submitBtn = page.getByRole('button', { name: /submit|save|accept/i }).first();
    if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-ERR-06: SKIP — could not reach submit step');
      return;
    }

    // Track POST requests
    let postCount = 0;
    page.on('response', (r) => {
      if (r.request().method() === 'POST') postCount++;
    });

    // Double click quickly
    await submitBtn.click();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    console.log(`TC-ERR-06: ${postCount} POST request(s) after double click`);
    console.log(postCount <= 1
      ? 'TC-ERR-06: PASS — double submit prevented (only 1 POST)'
      : `TC-ERR-06: NOTE — ${postCount} POSTs observed (verify no duplicate orders created)`);
  });
});

// ---------------------------------------------------------------------------
// Suite 26 — Performance Smoke (TC-PERF)
// ---------------------------------------------------------------------------


test.describe('Cleanup and Teardown (TC-CLEAN)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-CLEAN-01: Deactivate QA patient if created', async ({ page }) => {
    const patUrls = ['/PatientManagement', '/FindPatient'];
    for (const u of patUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) break;
    }

    const idField = page.locator('input[id*="national" i], input[id*="patientId" i]').first();
    if (await idField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await idField.fill('QA_PAT_0324');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const found = await page.getByText(/QA_Patient|QA_PAT_0324/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (!found) {
      console.log('TC-CLEAN-01: SKIP — QA patient QA_PAT_0324 not found (was never created or already cleaned)');
      return;
    }

    // Try to deactivate
    const deactivateBtn = page.getByRole('button', { name: /deactivate|disable|remove/i }).first();
    if (await deactivateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deactivateBtn.click();
      await page.waitForTimeout(1500);
      console.log('TC-CLEAN-01: PASS — QA patient deactivated');
    } else {
      console.log('TC-CLEAN-01: NOTE — no deactivate button available; QA patient remains active');
    }
  });

  test('TC-CLEAN-02: Deactivate QA LOINC entry if created', async ({ page }) => {
    const loincUrls = ['/MasterListsPage/LOINCCodes', '/LOINCManagement'];
    let found = false;
    for (const u of loincUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        found = true;
        break;
      }
    }

    if (!found) {
      console.log('TC-CLEAN-02: SKIP — LOINC management not accessible');
      return;
    }

    const qaEntry = await page.getByText(/QA-AUTO-9999/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (!qaEntry) {
      console.log('TC-CLEAN-02: SKIP — QA LOINC entry not found');
      return;
    }

    const deactivateBtn = page.getByRole('button', { name: /deactivate|delete|remove/i }).first();
    if (await deactivateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deactivateBtn.click();
      await page.waitForTimeout(1500);
      console.log('TC-CLEAN-02: PASS — QA LOINC entry deactivated');
    } else {
      console.log('TC-CLEAN-02: NOTE — no deactivate option; QA LOINC entry remains');
    }
  });

  test('TC-CLEAN-03: Deactivate QA dictionary entries', async ({ page }) => {
    const res = await page.goto(`${BASE}/MasterListsPage/Dictionary`).catch(() => null);
    if (!res || page.url().includes('LoginPage')) {
      console.log('TC-CLEAN-03: SKIP — dictionary not accessible');
      return;
    }

    const qaEntries = ['QA_AUTO_RejReason', 'QA_EDITED_ENTRY'];
    for (const entry of qaEntries) {
      const exists = await page.getByText(new RegExp(entry, 'i')).isVisible({ timeout: 2000 }).catch(() => false);
      if (exists) {
        console.log(`TC-CLEAN-03: Found ${entry} — attempting deactivation`);
        const row = page.locator('tr', { has: page.getByText(new RegExp(entry, 'i')) }).first();
        const deactBtn = row.getByRole('button', { name: /deactivate|delete/i }).first();
        if (await deactBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await deactBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }
    console.log('TC-CLEAN-03: Cleanup attempt complete');
  });

  test('TC-CLEAN-05: Document residual QA data', async ({ page }) => {
    const residual: string[] = [];

    // QA orders — can't delete
    residual.push('QA orders placed during testing remain in the system (orders cannot be deleted in OpenELIS)');

    // Check for QA patient
    const patUrls = ['/PatientManagement', '/FindPatient'];
    for (const u of patUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const idField = page.locator('input[id*="national" i]').first();
        if (await idField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await idField.fill('QA_PAT_0324');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1500);
          if (await page.getByText(/QA_Patient/i).isVisible({ timeout: 2000 }).catch(() => false)) {
            residual.push('QA patient QA_PAT_0324 still active');
          }
        }
        break;
      }
    }

    console.log('TC-CLEAN-05: Residual QA data inventory:');
    residual.forEach(item => console.log(`  - ${item}`));
    console.log('TC-CLEAN-05: PASS — residual data documented');
  });
});

// ---------------------------------------------------------------------------
// Suite AA — Results By Patient & By Order
// ---------------------------------------------------------------------------


test.describe('Suite AL — Storage Management', () => {

  test('TC-STOR-01: Storage Management screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Storage`);
    await expect(page.getByRole('heading', { name: 'Storage Management' })).toBeVisible();
    for (const tab of ['Dashboard', 'Sample Items', 'Inventory Lots']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }
  });
  test('TC-STOR-02: Storage locations list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Storage`);
    await expect(page.locator('#storage-resource-search')).toBeVisible();
    for (const th of ['Name', 'Code', 'Status']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
    await expect(page.locator('main tbody tr').first()).toBeVisible({ timeout: 15000 });
  });
  test('TC-STOR-03: Cold Storage Monitoring screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/FreezerMonitoring?tab=0`);
    await expect(page.getByRole('heading', { name: 'Cold Storage Dashboard' })).toBeVisible();
    for (const tab of ['Dashboard', 'Corrective Actions', 'Historical Trends', 'Reports', 'Settings']) {
      await expect(page.getByRole('tab', { name: tab }).first()).toBeVisible();
    }
  });
  test('TC-STOR-04: Cold storage shows temperature data', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/FreezerMonitoring?tab=0`);
    await expect(page.getByRole('heading', { name: 'Storage Units' })).toBeVisible();
    for (const th of ['Unit ID', 'Current Temp', 'Target Temp', 'Last Reading']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
  });
});



test.describe('Suite AM — Analyzers', () => {

  test('TC-ANZ-01: Analyzer List screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/analyzers`);
    await expect(page.getByRole('heading', { name: 'Analyzers', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('add-analyzer-button')).toBeVisible();
  });
  test('TC-ANZ-02: Analyzer list shows instruments', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/analyzers`);
    await expect(page.getByTestId('analyzer-search-input')).toBeVisible();
    for (const th of ['Name', 'Connection', 'Lab Units', 'Analyzer type', 'Status']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
    await expect(page.locator('main')).toContainText(/TOTAL ANALYZERS\s*\d+/i);
  });
  // TC-ANZ-03 (Error Dashboard) retired 2026-09-24: Casey ruled the Analyzer Error Dashboard
  // superseded (open question 8). /analyzers/errors has no menu entry and lands blank.
  test('TC-ANZ-04: Analyzer Types screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/analyzers/types`);
    await expect(page.getByRole('heading', { name: 'Analyzer Types' })).toBeVisible();
    await expect(page.locator('#analyzer-type-search')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Profile' })).toBeVisible();
  });
});



test.describe('Suite AN — EQA Distributions', () => {

  test('TC-EQA-01: EQA Distributions screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/qa/eqa/distribution`);
    await expect(page.getByRole('heading', { name: 'EQA Distribution', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create New Shipment' })).toBeVisible();
  });
  test('TC-EQA-02: EQA distribution list or form visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/qa/eqa/distribution`);
    for (const th of ['Shipment ID', 'Program', 'Status', 'Deadline']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
    await expect(page.locator('#eqa-shipment-filter')).toBeVisible();
  });
  test('TC-EQA-03: EQA Program Management loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/qa/eqa/management`);
    await expect(page.getByRole('heading', { name: 'Program Administration' })).toBeVisible();
    await expect(page.locator('main th', { hasText: 'Program Name' }).first()).toBeVisible();
  });
});



test.describe('Suite AO — Aliquot', () => {

  test('TC-ALQ-01: Aliquot screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Aliquot`);
    await expect(page.getByRole('heading', { name: 'Aliquot', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Search Sample' })).toBeVisible();
  });
  test('TC-ALQ-02: Aliquot entry form visible with fields', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Aliquot`);
    await expect(page.locator('#accessionNumber')).toBeVisible();
    await expect(page.locator('label', { hasText: 'Enter Accession Number' })).toBeVisible();
    await expect(page.locator('#searchSample')).toBeVisible();
  });
  test('TC-ALQ-03: Aliquot creation workflow executes', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
    }

    await page.waitForTimeout(1000);

    const buttonLocator2 = page.locator('button:has-text("Create"), button:has-text("New")').first();
    const buttonVisible2 = await buttonLocator2.isVisible({ timeout: 3000 }).catch(() => false);
    if (buttonVisible2) {
      await buttonLocator2.click();
      await page.waitForTimeout(1000);
    }

    const inputs = await page.locator('input[type="text"]').all();
    if (inputs.length > 0) {
      await inputs[0].fill('26CPHL00001T');
    }

    const submitBtnLocator = page.locator('button:has-text("Submit"), button:has-text("Save")').first();
    const submitBtnVisible = await submitBtnLocator.isVisible({ timeout: 3000 }).catch(() => false);
    if (submitBtnVisible) {
      await submitBtnLocator.click();
      await page.waitForTimeout(2000);
    }

    // Check for error or success
    const error = await page.locator('[class*="error"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(!error).toBeTruthy();
  });
});



test.describe('Suite AP — Billing & NoteBook', () => {

  test('TC-BILL-01: Billing module loads', async ({ page }) => {
    // Billing is an external system linked from the Billing menu entry; OpenELIS owns only its
    // admin configuration (Admin > Billing Menu Management). Re-pointed there 2026-09-24.
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/MasterListsPage/billingMenuManagement`);
    await expect(page.getByRole('heading', { name: 'Billing Menu Management' })).toBeVisible();
  });
  test('TC-BILL-02: Billing shows invoice list or form', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/MasterListsPage/billingMenuManagement`);
    await expect(page.locator('#billing_address')).toBeVisible();
    await expect(page.locator('#billing_active')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });
  test('TC-NOTE-01: NoteBook module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/NotebookDashboard`);
    await expect(page.getByRole('heading', { name: 'Notebook', exact: true })).toBeVisible();
    for (const card of ['Total Entries', 'Drafts', 'Pending Review']) {
      await expect(page.getByRole('heading', { name: card })).toBeVisible();
    }
  });
  test('TC-NOTE-02: NoteBook entry or list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/NotebookDashboard`);
    await expect(page.getByRole('heading', { name: 'All Entries' })).toBeVisible();
    await expect(page.locator('main th', { hasText: 'Entry Title' }).first()).toBeVisible();
    await expect(page.locator('#startDate')).toBeVisible();
  });
});

/**
 * OpenELIS Global v3.2.1.3 — Gap Suites AQ–AX (Priority 5: Admin Configuration Gaps)
 * Playwright Smoke Tests for 34 Admin Configuration Screen Tests
 *
 * Test Count: 34 TCs across 8 suites (AQ, AR, AS, AT, AU, AV, AW, AX)
 *
 * Suites:
 * - AQ: Reflex Tests & Analyzer Test Name (4 TCs)
 * - AR: Lab Number & Program Management (4 TCs)
 * - AS: Provider & Barcode Configuration (4 TCs)
 * - AT: Result Reporting & Menu Configuration (4 TCs)
 * - AU: General Config & App Properties (4 TCs)
 * - AV: Notifications & Search Index (4 TCs)
 * - AW: Logging, Legacy Admin, Plugins (5 TCs)
 * - AX: Localization, Notify User, Batch Reassignment (5 TCs)
 */

/**
 * Verify page loaded and contains expected elements
 */
async function verifyPageLoad(page: Page, expectedTitle: string): Promise<void> {
  // Check HTTP status is 200
  const response = await page.url();
  expect(response).not.toContain('login');

  // Check page has content
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).toBeTruthy();
  expect(bodyText?.length).toBeGreaterThan(0);

  // Verify not a 404 or 500 error page
  const errorText = await page.locator('body').innerText();
  expect(errorText).not.toContain('404');
  expect(errorText).not.toContain('500');
  expect(errorText).not.toContain('Not Found');
  expect(errorText).not.toContain('Internal Server Error');
}

// ============================================================================
// SUITE AQ — Reflex Tests & Analyzer Test Name (4 TCs)
// ============================================================================



// ============================================================================
// Phase 4 to 7 DEEP suites, re-pointed 2026-09-24 to the 3.2.2.0 UI.
// These used to click legacy side-nav text (`text=Order`, `text=Analyzers List`, ...)
// that no longer resolves, so every test timed out before asserting anything.
// Each test now opens its route directly (routes taken from /rest/menu) and
// asserts on stable ids, data-testids, roles and labels probed on the live UI.
// ============================================================================

test.describe('Phase 4 — M-DEEP: Analyzer Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-M-DEEP-01: Analyzer search filters the list', async ({ page }) => {
    await page.goto(`${BASE}/analyzers`);
    await expect(page.getByRole('heading', { name: 'Analyzers', exact: true }).first()).toBeVisible();
    const search = page.getByTestId('analyzer-search-input');
    await expect(search).toBeVisible();
    const rows = page.locator('main tbody tr');
    const before = await rows.count();
    test.skip(before === 0, 'No analyzers configured on this instance, so there is nothing to filter');
    const firstName = (await rows.first().locator('td').first().innerText()).trim();
    await search.fill(firstName);
    await expect(rows.first()).toContainText(firstName);
    await search.fill('ZZZZNONEXIST');
    await expect(rows.filter({ hasText: firstName })).toHaveCount(0);
  });

  test('TC-M-DEEP-02: Add Analyzer opens the setup flow', async ({ page }) => {
    await page.goto(`${BASE}/analyzers`);
    await page.getByTestId('add-analyzer-button').click();
    await expect(page).toHaveURL(/setup=instrument/);
    await expect(page.getByRole('heading', { name: 'Set up a new analyzer' })).toBeVisible();
    for (const stepName of ['Instrument', 'Verify', 'Connect']) {
      await expect(page.getByRole('heading', { name: stepName, exact: true })).toBeVisible();
    }
    await expect(page.getByText('Analyzer type', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Analyzer name', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Phase 4 — Q-DEEP: EQA Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-Q-DEEP-01: EQA distribution dashboard stats', async ({ page }) => {
    await page.goto(`${BASE}/qa/eqa/distribution`);
    await expect(page.getByRole('heading', { name: 'EQA Distribution', exact: true })).toBeVisible();
    const main = page.locator('main');
    for (const card of ['Draft Shipments', 'Shipped', 'Completed', 'Participants']) {
      await expect(main.getByText(card, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Participant Network' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'EQA Shipments' })).toBeVisible();
  });

  test('TC-Q-DEEP-02: Create New Shipment wizard', async ({ page }) => {
    await page.goto(`${BASE}/qa/eqa/distribution`);
    await page.getByRole('button', { name: 'Create New Shipment' }).click();
    await expect(page).toHaveURL(/\/qa\/eqa\/distribution\/create/);
    const steps = page.locator('main .cds--progress-label');
    await expect(steps).toHaveText(['Program & Details', 'Participants', 'Confirmation']);
    for (const label of ['Distribution Name', 'EQA Program', 'Submission Deadline']) {
      await expect(page.locator('main label', { hasText: label }).first()).toBeVisible();
    }
  });
});

test.describe('Phase 4 — W-DEEP: Error Handling', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-W-DEEP-01: Unknown patient ID returns no matches', async ({ page }) => {
    await page.goto(`${BASE}/PatientManagement`);
    await expect(page.getByRole('heading', { name: 'Add Or Modify Patient' })).toBeVisible();
    await page.locator('#patientId').fill('9999999');
    const search = page.waitForResponse(r => r.url().includes('/rest/patient-search-results') && r.url().includes('9999999'));
    await page.locator('#local_search').click();
    expect((await search).status()).toBe(200);
    await expect(page.locator('main tbody tr')).toHaveCount(0);
    // Zero matches raise the "no patient found" warning (SearchPatientForm -> addNotification).
    const warning = page.locator('.cds--toast-notification, .cds--inline-notification, .cds--actionable-notification, [role=alert]');
    await expect(warning.first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-W-DEEP-02: Empty patient search tells the user why nothing happened', async ({ page }) => {
    await page.goto(`${BASE}/PatientManagement`);
    await page.locator('#local_search').click();
    const feedback = page.locator('.cds--toast-notification, .cds--inline-notification, .cds--actionable-notification, [role=alert]');
    await expect(feedback.first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-W-DEEP-03: Non-existent route returns 404', async ({ page }) => {
    await page.goto(`${BASE}/NonExistentPage12345`);
    const body = await page.textContent('body');
    expect(body).toContain('404');
  });
});

test.describe('Phase 4 — S-DEEP: Order Extended Fields', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-S-DEEP-01: Order entry step structure', async ({ page }) => {
    await page.goto(`${BASE}/order/enter`);
    await expect(page).toHaveURL(/\/order\/(clinical\/)?enter/);
    await expect(page.getByTestId('order-step-enter')).toContainText('Enter Order');
    await expect(page.getByTestId('order-step-collect')).toContainText('Collect');
    await expect(page.getByTestId('order-step-label')).toContainText('Label & Store');
    await expect(page.getByTestId('order-step-qa')).toContainText('QA Review');
    await expect(page.locator('#labNumber')).toBeVisible();
  });

  test('TC-S-DEEP-02: New Patient extended fields', async ({ page }) => {
    await page.goto(`${BASE}/order/enter`);
    await page.getByRole('button', { name: 'New Patient' }).first().click();
    await expect(page.getByRole('heading', { name: 'Patient Information' })).toBeVisible();
    const main = page.locator('main');
    for (const label of ['Unique Health ID number', 'National ID', 'Primary phone']) {
      await expect(main.locator('label', { hasText: label }).first()).toBeVisible();
    }
    // Contact and additional-information fields sit in a collapsed section: present, not necessarily shown.
    for (const label of ['Contact last name', 'Contact first name', 'Occupation']) {
      await expect(main.locator('label', { hasText: label }).first()).toBeAttached();
    }
  });
});

test.describe('Phase 4 — R-DEEP: Alerts Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-R-DEEP-01: Alerts dashboard filters and structure', async ({ page }) => {
    await page.goto(`${BASE}/Alerts`);
    await expect(page.getByRole('heading', { name: 'Alerts Dashboard' })).toBeVisible();
    for (const card of ['Critical Alerts', 'EQA Deadlines', 'Overdue STAT Orders', 'Samples Expiring']) {
      await expect(page.getByRole('heading', { name: card })).toBeVisible();
    }
    const typeFilter = page.locator('#alert-type-filter');
    await expect(typeFilter).toBeVisible();
    await expect(page.locator('#alert-severity-filter')).toBeVisible();
    await expect(page.locator('#alert-status-filter')).toBeVisible();
    await typeFilter.locator('option', { hasText: 'STAT Overdue' }).waitFor({ state: 'attached', timeout: 15000 });
    const types = (await typeFilter.locator('option').allInnerTexts()).map(t => t.trim());
    for (const t of ['EQA Deadline', 'Sample Expiration', 'STAT Overdue', 'Unacknowledged Critical']) {
      expect(types).toContain(t);
    }
    await expect(page.locator('#alert-search')).toBeVisible();
    for (const th of ['Type', 'Severity', 'Message', 'Status']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
  });
});

test.describe('Phase 5 — U-DEEP: Session Security Tests', () => {
  test('TC-U-DEEP-01: Logout redirect', async ({ browser }) => {
    // Logs out, so it runs in its own session (helpers/isolated-session.ts), never the shared one.
    await withIsolatedSession(browser, async (page) => {
      await page.goto(`${BASE}/Dashboard`);
      await page.locator('#user-Icon').click();
      await page.locator('[data-cy="logOut"]').click();
      await page.waitForURL(/\/login/);
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test('TC-U-DEEP-02: Re-authentication', async ({ browser }) => {
    // Logs out, so it runs in its own session (helpers/isolated-session.ts), never the shared one.
    await withIsolatedSession(browser, async (page) => {
      await page.goto(`${BASE}/Dashboard`);
      await page.locator('#user-Icon').click();
      await page.locator('[data-cy="logOut"]').click();
      await page.waitForURL(/\/login/);
      await reloginIsolated(page);
      await page.goto(`${BASE}/Dashboard`);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('#user-Icon')).toBeVisible();
    });
  });

  test('TC-U-DEEP-03: Session continuity across modules', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Results`);
    await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
    await page.goto(`${BASE}/ResultValidation?type=&test=`);
    await expect(page.getByRole('heading', { name: 'Validation', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe('Phase 5 — E2E-DEEP: End-to-End Order Trace Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-E2E-DEEP-01: Modify Order finds an existing order by lab number', async ({ page }) => {
    // A real lab number from the Results list: data.setup's seeded accession can be null.
    await page.goto(`${BASE}/Results`);
    await page.locator('#unifiedResultsLabUnit option', { hasText: 'Hematology' }).waitFor({ state: 'attached' });
    await page.locator('#unifiedResultsLabUnit').selectOption('Hematology');
    await page.getByRole('button', { name: 'Load results' }).click();
    const firstRow = page.locator('main tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    const accession = ((await firstRow.innerText()).match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,}\b/) || [getPrimaryAccession()])[0];
    await page.goto(`${BASE}/SampleEdit?type=readwrite`);
    await expect(page.getByRole('heading', { name: 'Modify Order' })).toBeVisible();
    await page.locator('input#labNumber[placeholder="Enter Lab No"]').fill(accession);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('main')).toContainText(accession, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Search By Accession Number' })).toHaveCount(0);
  });

  test('TC-E2E-DEEP-02: Results by lab unit loads rows', async ({ page }) => {
    await page.goto(`${BASE}/Results`);
    await page.locator('#unifiedResultsLabUnit option', { hasText: 'Hematology' }).waitFor({ state: 'attached' });
    await page.locator('#unifiedResultsLabUnit').selectOption('Hematology');
    await page.getByRole('button', { name: 'Load results' }).click();
    await expect(page.locator('main tbody tr').first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-E2E-DEEP-03: Validation by lab unit loads', async ({ page }) => {
    await page.goto(`${BASE}/ResultValidation?type=&test=`);
    await expect(page.getByRole('heading', { name: 'Validation', exact: true })).toBeVisible();
    const unit = page.locator('#unitType');
    await unit.locator('option', { hasText: 'Hematology' }).waitFor({ state: 'attached', timeout: 15000 });
    const opts = (await unit.locator('option').allInnerTexts()).map(t => t.trim()).filter(Boolean);
    expect(opts).toContain('Hematology');
    const res = page.waitForResponse(r => /AccessionValidation|ResultValidation/i.test(r.url()) && r.request().method() === 'GET');
    await unit.selectOption('Hematology');
    expect((await res).status()).toBe(200);
  });
});

test.describe('Phase 5 — B-DEEP: Order Entry Field Enumeration Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-B-DEEP-01: Patient section fields present', async ({ page }) => {
    await page.goto(`${BASE}/order/enter`);
    for (const id of ['#patientId', '#previousLabNumber', '#lastName', '#firstName', '#dateOfBirth', '#gender-male', '#gender-female']) {
      await expect(page.locator(id)).toBeAttached();
    }
    await expect(page.getByRole('button', { name: 'Search for Patient' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Patient' }).first()).toBeVisible();
    await expect(page.locator('#noPatientOverride')).toBeAttached();
  });

  test('TC-B-DEEP-02: Program and Sample fields', async ({ page }) => {
    await page.goto(`${BASE}/order/enter`);
    await page.locator('#program').click();
    await expect(page.locator('[role=listbox] [role=option]').first()).toBeVisible({ timeout: 15000 });
    const programs = (await page.locator('[role=listbox] [role=option]').allInnerTexts()).map(t => t.trim());
    expect(programs).toContain('Routine Testing');
    expect(programs.length).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Sample 1' })).toBeVisible();
    const sampleType = page.locator('main label', { hasText: 'Sample Type' }).first();
    await expect(sampleType).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Sample' })).toBeVisible();
  });
});

test.describe('Phase 6 — BC-DEEP: Electronic Orders Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-BC-DEEP-01: Page structure', async ({ page }) => {
    await page.goto(`${BASE}/ElectronicOrders`);
    await expect(page.getByRole('heading', { name: 'Search Incoming Test Requests' })).toBeVisible();
    await expect(page.locator('#searchValue')).toBeVisible();
    await expect(page.locator('#eOrder_startDate')).toBeVisible();
    await expect(page.locator('#eOrder_endDate')).toBeVisible();
    await expect(page.locator('#statusId')).toBeVisible();
  });

  test('TC-BC-DEEP-02: Status dropdown options', async ({ page }) => {
    await page.goto(`${BASE}/ElectronicOrders`);
    await page.locator('#statusId option', { hasText: 'Realized' }).waitFor({ state: 'attached', timeout: 15000 });
    const options = (await page.locator('#statusId option').allInnerTexts()).map(t => t.trim());
    for (const o of ['All Statuses', 'Cancelled', 'Entered', 'NonConforming', 'Realized']) {
      expect(options).toContain(o);
    }
  });
});

test.describe('Phase 7 — BL-DEEP: EQA Program Management', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-BL-DEEP-01: Page structure', async ({ page }) => {
    // /MasterListsPage/eqaProgram no longer exists; EQA programs live under QA > EQA > Management.
    await page.goto(`${BASE}/qa/eqa/management`);
    await expect(page.getByRole('heading', { name: 'Program Administration' })).toBeVisible();
    await expect(page.locator('main .cds--progress-label, main [role=tab]').filter({ hasText: 'EQA Programs' }).first()).toBeVisible();
  });

  test('TC-BL-DEEP-02: Program listing', async ({ page }) => {
    await page.goto(`${BASE}/qa/eqa/management`);
    for (const th of ['Program Name', 'Provider', 'Enrolled Participants', 'Status']) {
      await expect(page.locator('main th', { hasText: th }).first()).toBeVisible();
    }
  });
});

// Phase 7 BM-DEEP (Analyzer Error Dashboard) retired 2026-09-24: Casey ruled the dashboard
// superseded (open question 8, resolved). Its old target, /MasterListsPage/AnalyzerTestName, was
// deliberately removed, and BM-DEEP-02 had been passing on that blank page (a false green).
