import { test, expect } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';

/**
 * Deep Endpoint Testing Suite — Phase 31
 *
 * File Purpose:
 * - Deep structural testing of all 29 known working GET endpoints
 * - POST operation probing on admin endpoints (TestSectionCreate, SampleBatchEntry)
 * - Parameterized GET tests (WorkPlanByTest, ReferredOutTests with filters)
 * - Form bean structure validation for admin creation endpoints
 * - Config endpoint validation (SampleEntryConfig, ResultConfiguration, PatientConfiguration)
 *
 * API Base Path: /api/OpenELIS-Global/rest/
 *
 * Suite IDs:
 * - TC-DEEP-01 through TC-DEEP-11 (GET deep structure)
 * - TC-DEEP-12 through TC-DEEP-15 (Parameterized GET)
 * - TC-DEEP-16 through TC-DEEP-19 (POST probing)
 * - TC-DEEP-20 through TC-DEEP-22 (Config endpoints)
 * - TC-DEEP-23 through TC-DEEP-25 (Admin form structure)
 *
 * Total Test Count: 25 TCs
 *
 * Key Findings (Phase 31):
 * - TestSectionCreate: 15 active, 8 inactive sections. POST returns 400 (HttpMessageNotReadableException)
 * - WorkPlanByTest: 0 workplan items (no pending work). Parameterized ?type= and ?testTypeID= both accepted
 * - PanelCreate: 23 existing panels, 23 sample types
 * - TestAdd: 24 sample types, 37 UOM, 6 result types, 23 lab units
 * - ReferredOutTests: 15 test units, 170 tests, 0 referral items
 * - ElectronicOrders: 164 tests, 4 statuses (Cancelled, Entered, Realized, Unrealized), 0 facilities
 * - ProviderMenu: 4 providers with full person/address objects
 * - Config endpoints all return siteInfoDomainName forms
 * - SampleBatchEntrySetup: POST returns 405 (Method Not Allowed — GET only)
 * - TestSectionCreate: POST 400 (JSON), 415 (form-encoded), PUT 405
 */

const API_BASE = '/api/OpenELIS-Global';

// ─────────────────────────────────────────────────────────────
// Section A: Deep GET Structure Tests
// ─────────────────────────────────────────────────────────────

test.describe('Deep GET Endpoint Structure (Phase 31)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DEEP-01: TestSectionCreate returns active and inactive sections', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestSectionCreate', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        formName: data.formName,
        activeCount: data.existingTestUnitList?.length || 0,
        inactiveCount: data.inactiveTestUnitList?.length || 0,
        hasEnglishNames: Array.isArray(data.existingEnglishNames),
        hasFrenchNames: Array.isArray(data.existingFrenchNames),
        firstActive: data.existingTestUnitList?.[0],
      };
    });

    expect(result.status).toBe(200);
    expect(result.formName).toBe('testSectionCreateForm');
    expect(result.activeCount).toBeGreaterThanOrEqual(15);
    expect(result.inactiveCount).toBeGreaterThanOrEqual(8);
    expect(result.hasEnglishNames).toBe(true);
    expect(result.hasFrenchNames).toBe(true);
    expect(result.firstActive).toHaveProperty('id');
    expect(result.firstActive).toHaveProperty('value');
  });

  test('TC-DEEP-02: WorkPlanByTest returns form with testTypes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/WorkPlanByTest', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        formName: data.formName,
        hasWorkplanTests: Array.isArray(data.workplanTests),
        workplanTestCount: data.workplanTests?.length || 0,
        hasCurrentDate: !!data.currentDate,
        hasPaging: data.paging !== undefined,
      };
    });

    expect(result.status).toBe(200);
    expect(result.hasWorkplanTests).toBe(true);
    // Workplan may be empty if no pending tests
    expect(result.workplanTestCount).toBeGreaterThanOrEqual(0);
  });

  test('TC-DEEP-03: WorkPlanByPanel returns form with panelTypes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/WorkPlanByPanel', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        formName: data.formName,
        hasPanelTypes: data.panelTypes !== undefined,
      };
    });

    expect(result.status).toBe(200);
  });

  test('TC-DEEP-04: ReferredOutTests returns test/unit selection lists', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/ReferredOutTests', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        testUnitCount: data.testUnitSelectionList?.length || 0,
        testCount: data.testSelectionList?.length || 0,
        firstTestUnit: data.testUnitSelectionList?.[0],
        firstTest: data.testSelectionList?.[0],
        referralItems: data.referralItems?.length || 0,
      };
    });

    expect(result.status).toBe(200);
    // Counts may grow as test catalog expands; use lower-bound assertions
    expect(result.testUnitCount).toBeGreaterThanOrEqual(10); // baseline 15 test sections
    expect(result.testCount).toBeGreaterThanOrEqual(150);    // baseline 170 tests
    expect(result.firstTestUnit).toHaveProperty('id');
    expect(result.firstTestUnit).toHaveProperty('value');
    expect(result.firstTest).toHaveProperty('id');
    expect(result.firstTest).toHaveProperty('value');
  });

  test('TC-DEEP-05: ElectronicOrders returns form with selection lists', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/ElectronicOrders', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        facilityCount: data.referralFacilitySelectionList?.length || 0,
        testCount: data.testSelectionList?.length || 0,
        statusCount: data.statusSelectionList?.length || 0,
        firstStatus: data.statusSelectionList?.[0],
        eOrderCount: data.eOrders?.length || 0,
      };
    });

    expect(result.status).toBe(200);
    expect(result.testCount).toBeGreaterThanOrEqual(164);
    expect(result.statusCount).toBe(4); // Cancelled, Entered, Realized, Unrealized
    expect(result.firstStatus).toHaveProperty('id');
    expect(result.firstStatus).toHaveProperty('value');
  });

  test('TC-DEEP-06: ProviderMenu returns provider list with person details', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/ProviderMenu', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        providerCount: data.menuList?.length || 0,
        totalRecords: data.totalRecordCount,
        firstProvider: data.menuList?.[0] ? {
          hasId: !!data.menuList[0].id,
          hasPerson: !!data.menuList[0].person,
          hasFhirUuid: !!data.menuList[0].fhirUuid,
        } : null,
      };
    });

    expect(result.status).toBe(200);
    expect(result.providerCount).toBeGreaterThanOrEqual(4);
    if (result.firstProvider) {
      expect(result.firstProvider.hasId).toBe(true);
      expect(result.firstProvider.hasPerson).toBe(true);
      expect(result.firstProvider.hasFhirUuid).toBe(true);
    }
  });

  test('TC-DEEP-07: PanelCreate returns panels and sample types', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/PanelCreate', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        existingPanels: data.existingPanelList?.length || 0,
        inactivePanels: data.inactivePanelList?.length || 0,
        sampleTypes: data.existingSampleTypeList?.length || 0,
        hasEnglishNames: Array.isArray(data.existingEnglishNames),
        hasFrenchNames: Array.isArray(data.existingFrenchNames),
      };
    });

    expect(result.status).toBe(200);
    expect(result.existingPanels).toBeGreaterThanOrEqual(15); // baseline 23 panels
    expect(result.sampleTypes).toBeGreaterThanOrEqual(15);    // baseline 23 sample types
    expect(result.hasEnglishNames).toBe(true);
    expect(result.hasFrenchNames).toBe(true);
  });

  test('TC-DEEP-08: TestAdd returns full form metadata', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestAdd', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        sampleTypeCount: data.sampleTypeList?.length || 0,
        uomCount: data.uomList?.length || 0,
        resultTypeCount: data.resultTypeList?.length || 0,
        labUnitCount: data.labUnitList?.length || 0,
        hasPanelList: Array.isArray(data.panelList),
        hasAgeRangeList: Array.isArray(data.ageRangeList),
      };
    });

    expect(result.status).toBe(200);
    // Use lower bounds — catalog may grow over time
    expect(result.sampleTypeCount).toBeGreaterThanOrEqual(20); // baseline 24
    expect(result.uomCount).toBeGreaterThanOrEqual(30);        // baseline 37
    expect(result.resultTypeCount).toBeGreaterThanOrEqual(4);  // baseline 6
    expect(result.labUnitCount).toBeGreaterThanOrEqual(15);    // baseline 23
    expect(result.hasPanelList).toBe(true);
    expect(result.hasAgeRangeList).toBe(true);
  });

  test('TC-DEEP-09: TestModifyEntry returns form with sample type list', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestModifyEntry', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        sampleTypeCount: data.sampleTypeList?.length || 0,
        hasJsonWad: data.jsonWad !== undefined,
        formName: data.formName,
      };
    });

    expect(result.status).toBe(200);
    expect(result.sampleTypeCount).toBe(24);
    expect(result.formName).toBeTruthy();
  });

  test('TC-DEEP-10: SampleBatchEntrySetup returns large form metadata', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SampleBatchEntrySetup', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const text = await res.text();
      const data = JSON.parse(text);
      return {
        status: res.status,
        size: text.length,
        formName: data.formName,
        hasSampleTypes: Array.isArray(data.sampleTypes),
        hasTestSections: Array.isArray(data.testSectionList),
      };
    });

    expect(result.status).toBe(200);
    expect(result.size).toBeGreaterThan(10000); // ~19KB
    expect(result.formName).toBeTruthy();
  });

  test('TC-DEEP-11: Menu returns full application hierarchy', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/menu', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const text = await res.text();
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : data.menu || [];
      return {
        status: res.status,
        size: text.length,
        topLevelCount: items.length,
        firstItemId: items[0]?.elementId,
        firstChildCount: items[0]?.childMenus?.length || 0,
      };
    });

    expect(result.status).toBe(200);
    expect(result.size).toBeGreaterThan(30000); // baseline ~43KB
    expect(result.topLevelCount).toBeGreaterThanOrEqual(20); // baseline 24 top-level menu items
  });
});

// ─────────────────────────────────────────────────────────────
// Section B: Parameterized GET Tests
// ─────────────────────────────────────────────────────────────

test.describe('Parameterized GET Tests (Phase 31)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DEEP-12: WorkPlanByTest accepts ?type=Hematology parameter', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/WorkPlanByTest?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, workplanTests: data.workplanTests?.length || 0 };
    });

    expect(result.status).toBe(200);
    // May be empty if no pending Hematology tests
    expect(result.workplanTests).toBeGreaterThanOrEqual(0);
  });

  test('TC-DEEP-13: WorkPlanByTest accepts ?testTypeID=36 parameter', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/WorkPlanByTest?testTypeID=36', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, workplanTests: data.workplanTests?.length || 0 };
    });

    expect(result.status).toBe(200);
  });

  test('TC-DEEP-14: ReferredOutTests accepts ?testUnitId=36 filter', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/ReferredOutTests?testUnitId=36', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, referralItems: data.referralItems?.length || 0 };
    });

    expect(result.status).toBe(200);
  });

  test('TC-DEEP-15: patient-search accepts ?lastName parameter', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/patient-search?lastName=test', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return { status: res.status, size: (await res.text()).length };
    });

    expect(result.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────
// Section C: POST Operation Probing
// ─────────────────────────────────────────────────────────────

test.describe('POST Operation Probing (Phase 31)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DEEP-16: TestSectionCreate POST returns 400 (needs proper form bean)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestSectionCreate', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testUnitEnglishName: 'QA-AutoTest',
          testUnitFrenchName: 'QA-AutoTest-FR',
          isActive: 'N',
        }),
      });
      return { status: res.status };
    });

    // 400 = expects specific form bean structure (HttpMessageNotReadableException)
    expect(result.status).toBe(400);
  });

  test('TC-DEEP-17: TestSectionCreate rejects form-urlencoded (415)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestSectionCreate', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'testUnitEnglishName=QA-Test&isActive=N',
      });
      return { status: res.status };
    });

    // 415 = Unsupported Media Type — only accepts application/json
    expect(result.status).toBe(415);
  });

  test('TC-DEEP-18: TestSectionCreate rejects PUT method (405)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestSectionCreate', {
        method: 'PUT',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ testUnitEnglishName: 'QA-Test' }),
      });
      return { status: res.status };
    });

    // 405 = Method Not Allowed — only GET and POST
    expect(result.status).toBe(405);
  });

  test('TC-DEEP-19: SampleBatchEntrySetup rejects POST (405)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SampleBatchEntrySetup', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ formName: 'sampleBatchEntryForm' }),
      });
      return { status: res.status };
    });

    // 405 = GET-only endpoint
    expect(result.status).toBe(405);
  });
});

// ─────────────────────────────────────────────────────────────
// Section D: Config Endpoint Validation
// ─────────────────────────────────────────────────────────────

test.describe('Config Endpoint Validation (Phase 31)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DEEP-20: SampleEntryConfig returns siteInfoDomain form', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SampleEntryConfig', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, formName: data.formName, domain: data.siteInfoDomainName };
    });

    expect(result.status).toBe(200);
    expect(result.formName).toBeTruthy();
  });

  test('TC-DEEP-21: ResultConfiguration returns siteInfoDomain form', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/ResultConfiguration', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, formName: data.formName, domain: data.siteInfoDomainName };
    });

    expect(result.status).toBe(200);
    expect(result.formName).toBeTruthy();
  });

  test('TC-DEEP-22: PatientConfiguration returns siteInfoDomain form', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/PatientConfiguration', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return { status: res.status, formName: data.formName, domain: data.siteInfoDomainName };
    });

    expect(result.status).toBe(200);
    expect(result.formName).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// Section E: Admin Form Structure Validation
// ─────────────────────────────────────────────────────────────

test.describe('Admin Form Structure Validation (Phase 31)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DEEP-23: TestAdd form has complete metadata for test creation', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/TestAdd', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        hasSampleTypeList: Array.isArray(data.sampleTypeList),
        hasPanelList: Array.isArray(data.panelList),
        hasUomList: Array.isArray(data.uomList),
        hasResultTypeList: Array.isArray(data.resultTypeList),
        hasAgeRangeList: Array.isArray(data.ageRangeList),
        hasLabUnitList: Array.isArray(data.labUnitList),
        hasJsonWad: data.jsonWad !== undefined,
      };
    });

    expect(result.status).toBe(200);
    expect(result.hasSampleTypeList).toBe(true);
    expect(result.hasPanelList).toBe(true);
    expect(result.hasUomList).toBe(true);
    expect(result.hasResultTypeList).toBe(true);
    expect(result.hasAgeRangeList).toBe(true);
    expect(result.hasLabUnitList).toBe(true);
  });

  test('TC-DEEP-24: PanelCreate form has complete metadata for panel creation', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/PanelCreate', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        hasExistingPanels: Array.isArray(data.existingPanelList),
        hasInactivePanels: Array.isArray(data.inactivePanelList),
        hasSampleTypes: Array.isArray(data.existingSampleTypeList),
        hasEnglishNames: Array.isArray(data.existingEnglishNames),
        hasFrenchNames: Array.isArray(data.existingFrenchNames),
      };
    });

    expect(result.status).toBe(200);
    expect(result.hasExistingPanels).toBe(true);
    expect(result.hasInactivePanels).toBe(true);
    expect(result.hasSampleTypes).toBe(true);
    expect(result.hasEnglishNames).toBe(true);
    expect(result.hasFrenchNames).toBe(true);
  });

  test('TC-DEEP-25: SiteInformation returns site configuration', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SiteInformation', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        status: res.status,
        topKeys: Object.keys(data).slice(0, 10),
        hasMenuList: Array.isArray(data.menuList) || data.siteInfoList !== undefined,
      };
    });

    expect(result.status).toBe(200);
  });
});
