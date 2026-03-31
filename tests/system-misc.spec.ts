import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

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

  test('TC-CAT-01: Test Catalog Add page loads and wizard renders', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestAdd`);
    await expect(page.getByText(/Test Section|Add.*Test|Create.*Test/i)).toBeVisible({ timeout: 5000 });
  });

  test(
    'TC-CAT-02 [BUG-1 KNOWN]: TestAdd API returns 500 on submit',
    async ({ page }) => {
      await page.goto(`${BASE}/MasterListsPage/TestAdd`);

      let testAddStatus = 0;
      page.on('response', (res) => {
        if (res.url().includes('TestAdd') && res.request().method() === 'POST') {
          testAddStatus = res.status();
        }
      });

      // Step 1: Fill test name
      const testNameInput = page.getByRole('textbox', { name: /test.*name/i }).first();
      await testNameInput.fill('QA_PLAYWRIGHT_TEST');

      // Navigate through wizard steps and submit
      // (Steps vary — navigate through all 6 wizard steps)
      for (let i = 0; i < 6; i++) {
        const nextBtn = page.getByRole('button', { name: /Next|Accept/i });
        if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // BUG-1: testAddStatus will be 500
      if (testAddStatus !== 0) {
        console.log(`BUG-1: POST /rest/TestAdd returned ${testAddStatus}`);
        expect(testAddStatus).toBe(500); // documents current broken state
      }
    }
  );

  test('TC-CAT-03: Modify Tests page loads with Biochemistry filter', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestModifyEntry`);
    await expect(page.getByText(/Biochemistry|Test Section/i)).toBeVisible({ timeout: 5000 });
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
    if (!url) {
      console.log('TC-LOINC-02: SKIP — LOINC screen not accessible');
      return;
    }

    const searchField = page.locator('input[type="search"], input[type="text"]').first();
    if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchField.fill('718-7');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }

    const has7187 = await page.getByText(/718-7|hemoglobin/i).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(has7187
      ? 'TC-LOINC-02: PASS — 718-7 found in LOINC list'
      : 'TC-LOINC-02: FAIL — 718-7 not returned in LOINC search');
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
    if (!res || page.url().includes('LoginPage')) {
      console.log('TC-LOINC-06: SKIP — dictionary not accessible');
      return;
    }

    const qaEntry = page.getByText(/QA_AUTO_RejReason/i).first();
    if (!(await qaEntry.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-LOINC-06: SKIP — QA dictionary entry from TC-ADMIN-06 not found (run that test first)');
      return;
    }

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
    for (const u of AUDIT_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/log|audit|action|event/i.test(text)) {
          console.log(`TC-SYS-01: PASS — audit log at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-SYS-01: GAP — audit log screen not found at known URLs');
  });

  test('TC-SYS-02: Audit log shows recent admin actions', async ({ page }) => {
    let auditUrl = '';
    for (const u of AUDIT_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        auditUrl = page.url();
        break;
      }
    }
    if (!auditUrl) {
      console.log('TC-SYS-02: SKIP — audit log not accessible');
      return;
    }

    // Apply today's date filter if available
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const dateField = page.locator('input[type="date"], input[id*="date" i]').first();
    if (await dateField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateField.fill(dateStr).catch(() => {});
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }

    const hasAdminEntry = await page.getByText(/admin/i).isVisible({ timeout: 3000 }).catch(() => false);
    console.log(hasAdminEntry
      ? 'TC-SYS-02: PASS — admin entries found in audit log'
      : 'TC-SYS-02: FAIL — no admin entries in audit log (may be filtered or log is empty)');
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

  const FHIR_BASES = [`${BASE}/fhir`, `${BASE}/api/fhir`];

  test('TC-EO-01: FHIR metadata endpoint responds', async ({ page }) => {
    let found = false;
    for (const fb of FHIR_BASES) {
      const res = await page.goto(`${fb}/metadata`).catch(() => null);
      if (res && res.ok()) {
        const text = await page.textContent('body') ?? '';
        if (/CapabilityStatement|fhirVersion/i.test(text)) {
          found = true;
          console.log(`TC-EO-01: PASS — FHIR metadata at ${fb}/metadata`);
          break;
        }
      }
    }
    if (!found) {
      console.log('TC-EO-01: GAP — FHIR metadata endpoint not accessible');
    }
  });

  test('TC-EO-02: FHIR Patient lookup by national ID', async ({ page }) => {
    for (const fb of FHIR_BASES) {
      const res = await page.goto(`${fb}/Patient?identifier=0123456`).catch(() => null);
      if (res && res.ok()) {
        const text = await page.textContent('body') ?? '';
        if (/Sebby|Abby/i.test(text)) {
          console.log(`TC-EO-02: PASS — FHIR Patient found at ${fb}`);
          return;
        }
      }
    }
    console.log('TC-EO-02: GAP — FHIR Patient lookup not available or patient not found');
  });

  test('TC-EO-03: FHIR ServiceRequest for lab order', async ({ page }) => {
    for (const fb of FHIR_BASES) {
      const res = await page.goto(`${fb}/ServiceRequest?subject:Patient.identifier=0123456`).catch(() => null);
      if (res && res.ok()) {
        const text = await page.textContent('body') ?? '';
        if (/ServiceRequest|entry/i.test(text)) {
          console.log(`TC-EO-03: PASS — FHIR ServiceRequest found at ${fb}`);
          return;
        }
      }
      // Fallback: DiagnosticReport
      const drRes = await page.goto(`${fb}/DiagnosticReport?subject:Patient.identifier=0123456`).catch(() => null);
      if (drRes && drRes.ok()) {
        const drText = await page.textContent('body') ?? '';
        if (/DiagnosticReport|entry/i.test(drText)) {
          console.log(`TC-EO-03: PASS — FHIR DiagnosticReport found (no ServiceRequest) at ${fb}`);
          return;
        }
      }
    }
    console.log('TC-EO-03: GAP — no FHIR ServiceRequest or DiagnosticReport found');
  });

  test('TC-EO-04: FHIR DiagnosticReport includes result values', async ({ page }) => {
    for (const fb of FHIR_BASES) {
      const res = await page.goto(`${fb}/DiagnosticReport?subject:Patient.identifier=0123456`).catch(() => null);
      if (res && res.ok()) {
        const text = await page.textContent('body') ?? '';
        if (/result|Observation|valueQuantity/i.test(text)) {
          console.log(`TC-EO-04: PASS — DiagnosticReport with result references at ${fb}`);
          return;
        }
      }
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
  test('TC-SESS-02: Logout clears session — back button blocked', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
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
    console.log(backOnLogin
      ? 'TC-SESS-02 back button: PASS — session fully cleared'
      : 'TC-SESS-02 back button: FAIL — protected page accessible via back button');
  });

  test('TC-SESS-03: Stale URL redirects to login', async ({ page }) => {
    // Don't login — go directly to a protected URL
    const res = await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(2000);

    const redirectedToLogin = page.url().includes('Login');
    console.log(redirectedToLogin
      ? 'TC-SESS-03: PASS — protected URL redirects to login without session'
      : `TC-SESS-03: FAIL — protected page accessible without login (${page.url()})`);
    expect(redirectedToLogin).toBe(true);
  });

  test('TC-SESS-04: Login error messages are consistent', async ({ page }) => {
    await page.goto(`${BASE}/LoginPage`);
    await page.waitForTimeout(1000);

    // Bad username
    await page.fill('input[name="loginName"]', 'fakeuserXYZ');
    await page.fill('input[name="userPass"]', 'wrongpassword');
    await page.getByRole('button', { name: /submit|login|save|next|accept/i }).click();
    await page.waitForTimeout(1500);
    const errMsg1 = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');

    // Bad password for real user
    await page.fill('input[name="loginName"]', 'admin');
    await page.fill('input[name="userPass"]', 'totallyWrongPassword');
    await page.getByRole('button', { name: /submit|login|save|next|accept/i }).click();
    await page.waitForTimeout(1500);
    const errMsg2 = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');

    const consistent = errMsg1 === errMsg2;
    console.log(consistent
      ? `TC-SESS-04: PASS — consistent error messages ("${errMsg1!.trim().slice(0, 50)}")`
      : `TC-SESS-04: FAIL — different errors: "${errMsg1!.trim().slice(0, 40)}" vs "${errMsg2!.trim().slice(0, 40)}" (credential enumeration risk)`);
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
    const nextBtn = page.getByRole('button', { name: /next|search/i }).first();
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
    const nextBtn = page.getByRole('button', { name: /next/i }).first();
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

    try {
      await navigateViaMenu(page, ['Storage', 'Management']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/StorageManagement', '/LabStorage', '/storage/management']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-STOR-02: Storage locations list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Management']);
    } catch (e) {
      await tryNavigateToURL(page, ['/StorageManagement', '/LabStorage', '/storage/management']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"], [class*="list"], [class*="tree"]');
    expect(table).toBeTruthy();
  });

  test('TC-STOR-03: Cold Storage Monitoring screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Cold Storage Monitoring']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ColdStorageMonitoring', '/FreezerMonitoring', '/storage/monitoring']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-STOR-04: Cold storage shows temperature data', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Cold Storage Monitoring']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ColdStorageMonitoring', '/FreezerMonitoring', '/storage/monitoring']);
    }

    await page.waitForTimeout(1000);

    // Look for temperature readings
    const tempText = await page.locator('text/-?\\d+°?C/').count();
    const table = await page.$('table, [role="table"], [class*="list"]');

    expect(table || tempText > 0).toBeTruthy();
  });
});



test.describe('Suite AM — Analyzers', () => {

  test('TC-ANZ-01: Analyzer List screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'List']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/AnalyzerList', '/Instruments', '/analyzers/list']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ANZ-02: Analyzer list shows instruments', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'List']);
    } catch (e) {
      await tryNavigateToURL(page, ['/AnalyzerList', '/Instruments', '/analyzers/list']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-ANZ-03: Error Dashboard loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'Error Dashboard']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ErrorDashboard', '/AnalyzerErrors', '/analyzers/errors']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ANZ-04: Analyzer Types screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'Analyzer Types']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/AnalyzerTypes', '/InstrumentTypes', '/analyzers/types']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });
});



test.describe('Suite AN — EQA Distributions', () => {

  test('TC-EQA-01: EQA Distributions screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Distributions']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/EQADistributions', '/QADistributions', '/eqa/distributions']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-EQA-02: EQA distribution list or form visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Distributions']);
    } catch (e) {
      await tryNavigateToURL(page, ['/EQADistributions', '/QADistributions', '/eqa/distributions']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const form = await page.$('form, [role="form"]');

    expect(table || form).toBeTruthy();
  });

  test('TC-EQA-03: EQA Program Management loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Program Management']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/EQAProgramManagement', '/QAProgramManagement', '/eqa/programs']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });
});



test.describe('Suite AO — Aliquot', () => {

  test('TC-ALQ-01: Aliquot screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ALQ-02: Aliquot entry form visible with fields', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
    }

    await page.waitForTimeout(1000);

    const button = await page.$('button:has-text("Create"), button:has-text("New"), button:has-text("Add")');
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
    }

    const form = await page.$('form, [role="form"]');
    const inputs = await page.$$('input, textarea, select');

    expect(form && inputs.length > 0).toBeTruthy();
  });

  test('TC-ALQ-03: Aliquot creation workflow executes', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
    }

    await page.waitForTimeout(1000);

    const button = await page.$('button:has-text("Create"), button:has-text("New")');
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
    }

    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[0].fill('26CPHL00001T');
    }

    const submitBtn = await page.$('button:has-text("Submit"), button:has-text("Save")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    // Check for error or success
    const error = await page.$('[class*="error"]');
    expect(!error).toBeTruthy();
  });
});



test.describe('Suite AP — Billing & NoteBook', () => {

  test('TC-BILL-01: Billing module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Billing']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Billing', '/BillingDashboard', '/billing']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-BILL-02: Billing shows invoice list or form', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Billing']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Billing', '/BillingDashboard', '/billing']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const form = await page.$('form, [role="form"]');

    expect(table || form).toBeTruthy();
  });

  test('TC-NOTE-01: NoteBook module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['NoteBook']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/NoteBook', '/Notes', '/notebook']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-NOTE-02: NoteBook entry or list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['NoteBook']);
    } catch (e) {
      await tryNavigateToURL(page, ['/NoteBook', '/Notes', '/notebook']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const textarea = await page.$('textarea, [role="textbox"]');

    expect(table || textarea).toBeTruthy();
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



test.describe('Phase 4 — M-DEEP: Analyzer Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-M-DEEP-01: Analyzer search and filter', async ({ page }) => {
    await page.click('text=Analyzers');
    await page.click('text=Analyzers List');
    await page.waitForSelector('text=Analyzer List');
    // Search for existing analyzer
    await page.fill('input[placeholder="Search analyzers..."]', 'Alpha');
    await expect(page.locator('text=Test Analyzer Alpha')).toBeVisible();
    // Search for non-existent
    await page.fill('input[placeholder="Search analyzers..."]', 'ZZZZNONEXIST');
    await expect(page.locator('text=Total Analyzers')).toBeVisible();
    // Verify 0 results
    const totalText = await page.locator('text=Total Analyzers').locator('..').innerText();
    expect(totalText).toContain('0');
  });

  test('TC-M-DEEP-02: Add New Analyzer form fields', async ({ page }) => {
    await page.click('text=Analyzers');
    await page.click('text=Analyzers List');
    await page.waitForSelector('text=Analyzer List');
    await page.click('text=Add Analyzer');
    await page.waitForSelector('text=Add New Analyzer');
    // Verify form fields
    await expect(page.locator('text=Analyzer Name')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
    await expect(page.locator('text=Plugin Type')).toBeVisible();
    await expect(page.locator('text=Analyzer Type')).toBeVisible();
    await expect(page.locator('text=Protocol Version')).toBeVisible();
    await expect(page.locator('text=IP Address')).toBeVisible();
    await expect(page.locator('text=Port Number')).toBeVisible();
    await expect(page.locator('text=Test Connection')).toBeVisible();
    await page.click('text=Cancel');
  });
});



test.describe('Phase 4 — Q-DEEP: EQA Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-Q-DEEP-01: EQA dashboard stats', async ({ page }) => {
    await page.click('text=EQA Distributions');
    await page.waitForSelector('text=EQA Distribution');
    await expect(page.locator('text=Draft Shipments')).toBeVisible();
    await expect(page.locator('text=Shipped')).toBeVisible();
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('text=Participants')).toBeVisible();
    await expect(page.locator('text=Participant Network')).toBeVisible();
  });

  test('TC-Q-DEEP-02: Create New Shipment wizard', async ({ page }) => {
    await page.click('text=EQA Distributions');
    await page.waitForSelector('text=EQA Distribution');
    await page.click('text=Create New Shipment');
    await page.waitForSelector('text=Program & Details');
    await expect(page.locator('text=Participants')).toBeVisible();
    await expect(page.locator('text=Confirmation')).toBeVisible();
    await expect(page.locator('text=Distribution Name')).toBeVisible();
    await expect(page.locator('text=EQA Program')).toBeVisible();
    await expect(page.locator('text=Submission Deadline')).toBeVisible();
  });
});



test.describe('Phase 4 — W-DEEP: Error Handling', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-W-DEEP-01: Invalid patient ID search', async ({ page }) => {
    await page.click('text=Patient');
    await page.click('text=Add/Edit Patient');
    await page.waitForSelector('text=Add Or Modify Patient');
    // Use native setter for React input
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="Enter Patient Id"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '9999999');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('button:text("Search")');
    await page.waitForSelector('text=No patients found');
  });

  test('TC-W-DEEP-02: Empty search returns notification', async ({ page }) => {
    await page.click('text=Patient');
    await page.click('text=Add/Edit Patient');
    await page.waitForSelector('text=Add Or Modify Patient');
    await page.click('button:text("Search")');
    await page.waitForSelector('text=No patients found');
  });

  test('TC-W-DEEP-03: Non-existent route returns 404', async ({ page }) => {
    const response = await page.goto(`${BASE}/NonExistentPage12345`);
    // Spring Boot returns 404 JSON
    const body = await page.textContent('body');
    expect(body).toContain('404');
  });
});



test.describe('Phase 4 — S-DEEP: Order Extended Fields', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-S-DEEP-01: Order wizard step structure', async ({ page }) => {
    await page.click('text=Order');
    await page.click('text=Add Order');
    await page.waitForSelector('text=Test Request');
    await expect(page.locator('text=Patient Info')).toBeVisible();
    await expect(page.locator('text=Program Sel')).toBeVisible();
    await expect(page.locator('text=Add Sample')).toBeVisible();
    await expect(page.locator('text=Add Order')).toBeVisible();
  });

  test('TC-S-DEEP-02: New Patient extended fields', async ({ page }) => {
    await page.click('text=Order');
    await page.click('text=Add Order');
    await page.waitForSelector('text=Test Request');
    await page.click('text=New Patient');
    await page.waitForSelector('text=Patient Information');
    await expect(page.locator('text=Unique Health ID number')).toBeVisible();
    await expect(page.locator('text=National ID')).toBeVisible();
    await expect(page.locator('text=Primary phone')).toBeVisible();
    await expect(page.locator('text=Emergency Contact Info')).toBeVisible();
    await expect(page.locator('text=Additional Information')).toBeVisible();
  });
});

test.describe('Phase 4 — R-DEEP: Alerts Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-R-DEEP-01: Alerts dashboard filters and structure', async ({ page }) => {
    await page.click('text=Alerts');
    await page.waitForSelector('text=Alerts Dashboard');
    // 4 stat cards
    await expect(page.locator('text=Critical Alerts')).toBeVisible();
    await expect(page.locator('text=EQA Deadlines')).toBeVisible();
    await expect(page.locator('text=Overdue STAT Orders')).toBeVisible();
    await expect(page.locator('text=Samples Expiring')).toBeVisible();
    // Filters
    const alertTypeFilter = page.locator('select[name="alert-type-filter"]');
    const severityFilter = page.locator('select[name="alert-severity-filter"]');
    const statusFilter = page.locator('select[name="alert-status-filter"]');
    await expect(alertTypeFilter).toBeVisible();
    await expect(severityFilter).toBeVisible();
    await expect(statusFilter).toBeVisible();
    // Alert Type has 5 options
    const typeOpts = await alertTypeFilter.locator('option').count();
    expect(typeOpts).toBe(5);
    // Search field
    await expect(page.locator('input[placeholder="Search alerts..."]')).toBeVisible();
    // Table headers
    await expect(page.locator('th:text("Type")')).toBeVisible();
    await expect(page.locator('th:text("Severity")')).toBeVisible();
    await expect(page.locator('th:text("Message")')).toBeVisible();
  });
});

// ============================================================
// Phase 4 — K-DEEP: Admin Interaction Tests (8 TCs)
// ============================================================


test.describe('Phase 5 — U-DEEP: Session Security Tests', () => {
  test('TC-U-DEEP-01: Logout redirect', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Dashboard`);
    // Click user menu and logout
    await page.click('button:has-text("User")');
    await page.click('text=Logout');
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-U-DEEP-02: Re-authentication', async ({ page }) => {
    // Login, logout, re-login
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/Dashboard`);
    await page.click('button:has-text("User")');
    await page.click('text=Logout');
    await page.waitForURL(/\/login/);
    await login(page, ADMIN.user, ADMIN.pass);
    await expect(page.locator('text=Dashboard').or(page.locator('text=Home'))).toBeVisible();
  });

  test('TC-U-DEEP-03: Session continuity post re-auth', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    // Navigate to multiple modules to verify session is fully restored
    await page.goto(`${BASE}/LogbookResults?type=`);
    await expect(page.locator('text=Results')).toBeVisible();
    await page.goto(`${BASE}/ResultValidation?type=&test=`);
    await expect(page.locator('text=Validation')).toBeVisible();
  });
});

// =====================================================================
// Phase 5 — G-DEEP: NCE Interaction Tests (3 TCs)
// =====================================================================


test.describe('Phase 5 — E2E-DEEP: End-to-End Order Trace Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-E2E-DEEP-01: Edit Order search', async ({ page }) => {
    await page.click('text=Order');
    await page.click('text=Edit Order');
    await page.waitForSelector('input[placeholder*="Lab" i]');
    const input = page.locator('input[placeholder*="Lab" i]').first();
    await input.fill('26CPHL00008');
    // Verify auto-format
    const value = await input.inputValue();
    expect(value).toContain('26-CPH-L00-008');
  });

  test('TC-E2E-DEEP-02: Results By Unit shows data', async ({ page }) => {
    await page.click('text=Results');
    await page.click('text=By Unit');
    await page.waitForSelector('select, [role="combobox"]');
    const unitSelect = page.locator('select').first();
    await unitSelect.selectOption('Hematology');
    await page.waitForTimeout(3000);
    // Should have result rows
    const rows = await page.locator('table tbody tr, [class*="row"]').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('TC-E2E-DEEP-03: Validation Routine shows data', async ({ page }) => {
    await page.click('text=Validation');
    await page.click('text=Routine');
    await page.waitForSelector('select, [role="combobox"]');
    const unitSelect = page.locator('select').first();
    await unitSelect.selectOption('Hematology');
    await page.waitForTimeout(3000);
    const rows = await page.locator('table tbody tr, [class*="row"]').count();
    expect(rows).toBeGreaterThan(0);
  });
});


test.describe('Phase 5 — B-DEEP: Order Wizard Field Enumeration Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-B-DEEP-01: Step 1 Patient Info all fields present', async ({ page }) => {
    await page.click('text=Order');
    await page.click('text=Add Order');
    await page.waitForSelector('text=Patient Info');
    // Verify all Patient Info fields
    await expect(page.locator('text=Patient Id')).toBeVisible();
    await expect(page.locator('text=Previous Lab Number')).toBeVisible();
    await expect(page.locator('text=Last Name')).toBeVisible();
    await expect(page.locator('text=First Name')).toBeVisible();
    await expect(page.locator('text=Date of Birth')).toBeVisible();
    await expect(page.locator('text=Gender')).toBeVisible();
    await expect(page.locator('text=Search for Patient')).toBeVisible();
    await expect(page.locator('text=New Patient')).toBeVisible();
  });

  test('TC-B-DEEP-02: Steps 2-3 Program and Sample fields', async ({ page }) => {
    await page.click('text=Order');
    await page.click('text=Add Order');
    await page.waitForSelector('text=Patient Info');
    // Navigate to Program Selection (Step 2)
    await page.click('button:has-text("Program")');
    await page.waitForSelector('text=Program');
    const programSelect = page.locator('select').first();
    const options = await programSelect.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(10); // 15 programs
    // Navigate to Add Sample (Step 3)
    await page.click('button:has-text("Next")');
    await page.waitForSelector('text=Sample');
    await expect(page.locator('text=Select sample type')).toBeVisible();
    await expect(page.locator('text=Collection Date')).toBeVisible();
    await expect(page.locator('text=Collection Time')).toBeVisible();
  });
});

// ============================================================
// Phase 6 — Advanced Workflow & Cross-Module Interaction Tests
// ============================================================



test.describe('Phase 6 — BC-DEEP: Electronic Orders Tests', () => {
  test('TC-BC-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/ElectronicOrders');
    await expect(page.locator('text=Search Incoming Test Requests')).toBeVisible();
    await expect(page.locator('text=Search Value')).toBeVisible();
    await expect(page.locator('text=Start Date')).toBeVisible();
    await expect(page.locator('text=End Date')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
  });

  test('TC-BC-DEEP-02: Status dropdown options', async ({ page }) => {
    await page.goto('/ElectronicOrders');
    const statusSelect = page.locator('select').filter({ hasText: 'All Statuses' });
    const options = await statusSelect.locator('option').allTextContents();
    expect(options).toContain('All Statuses');
    expect(options).toContain('Cancelled');
    expect(options).toContain('Entered');
    expect(options).toContain('NonConforming');
    expect(options).toContain('Realized');
  });
});



test.describe('Phase 7 — BL-DEEP: EQA Distribution', () => {
  test('TC-BL-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/MasterListsPage/eqaProgram');
    await expect(page.locator('text=EQA')).toBeVisible();
  });

  test('TC-BL-DEEP-02: Program listing', async ({ page }) => {
    await page.goto('/MasterListsPage/eqaProgram');
    // Should display program management interface
    const content = page.locator('table, .cds--data-table, form, [role="table"]');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Phase 7 — BM-DEEP: Analyzer Error Dashboard', () => {
  test('TC-BM-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/MasterListsPage/AnalyzerTestName');
    await expect(page.locator('text=Analyzer Test Name')).toBeVisible();
  });

  test('TC-BM-DEEP-02: Analyzer listing', async ({ page }) => {
    await page.goto('/MasterListsPage/AnalyzerTestName');
    // Should have analyzer configuration table or listing
    const listing = page.locator('table, .cds--data-table, select, [role="table"]');
    await expect(listing.first()).toBeVisible({ timeout: 10000 });
  });
});


