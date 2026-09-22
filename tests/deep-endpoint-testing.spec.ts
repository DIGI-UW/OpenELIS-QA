/*
 * CENSUS ASSERTIONS REPLACED 2026-09-22.
 *
 * Seven cases in this file asserted a MINIMUM COUNT of rows — "at least 15
 * active test sections", "at least 164 tests", "at least 30 units of measure",
 * "exactly 24 sample types". Every one of those numbers was read off whatever
 * instance the case was first written against, and every one of them fails on
 * an instance configured differently: testing serves 10 active sections and the
 * case demanded 15. A failure there reports the size of somebody's catalog, not
 * whether the endpoint works, and it fails loudest on exactly the instance a
 * new deployment would use.
 *
 * What replaced them, per Casey 2026-09-22 ("I want to prove the endpoint
 * works"):
 *   * the envelope is asserted by SHAPE — the list is present and is an array,
 *     not absent and not a scalar, which is what a half-populated form looks
 *     like;
 *   * a selection list the screen CANNOT FUNCTION WITHOUT is asserted non-empty
 *     (a Test Add form with no sample types cannot add a test). That holds on
 *     any working instance without naming a number;
 *   * the first row is asserted to carry the fields the screen reads;
 *   * a list that is a fixed ENUM keeps its exact count, because there the
 *     count IS the contract — statusSelectionList is the four electronic-order
 *     states, not a configurable catalog;
 *   * where two endpoints serve the same list, they are asserted to AGREE.
 *     TestAdd and TestModifyEntry both publish sampleTypeList; a mismatch is a
 *     real defect on any instance, and no threshold can catch it.
 */
import { test, expect } from '@playwright/test';
import { apiSession } from '../helpers/test-helpers';

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
    // API-only file: no page.goto, no locator, no getByRole anywhere in it.
    // apiSession() gives it an authenticated origin without booting the SPA,
    // which login() would do at a measured ~49s per test.
    await apiSession(page);
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
        activeIsArray: Array.isArray(data.existingTestUnitList),
        inactiveIsArray: Array.isArray(data.inactiveTestUnitList),
        hasEnglishNames: typeof data.existingEnglishNames === 'string',
        hasFrenchNames: typeof data.existingFrenchNames === 'string',
        firstActive: data.existingTestUnitList?.[0],
      };
    });

    expect(result.status).toBe(200);
    expect(result.formName).toBe('testSectionCreateForm');
    // The screen cannot list test units it was not given, so BOTH lists must be
    // arrays and the active one must have something in it. How many is the
    // instance's business: testing has 10 active sections and this case used to
    // demand 15.
    expect(result.activeIsArray, 'existingTestUnitList must be an array').toBe(true);
    expect(result.inactiveIsArray, 'inactiveTestUnitList must be an array').toBe(true);
    expect(result.activeCount, 'a configured instance must serve at least one active test unit').toBeGreaterThan(0);
    // existingEnglishNames / existingFrenchNames are STRINGS — the controller
    // joins the configured names into one blob (getExistingTestNames returns a
    // String, and every *CreateForm declares these as String). These assertions
    // used to be Array.isArray(...) === true, which is false for a string, so
    // they had never once passed on any instance. Same defect shape as the
    // census thresholds: an expectation about a contract nobody checked.
    expect(result.hasEnglishNames, 'existingEnglishNames must be the joined name string').toBe(true);
    expect(result.hasFrenchNames, 'existingFrenchNames must be the joined name string').toBe(true);
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
        testIsArray: Array.isArray(data.testSelectionList),
        statusCount: data.statusSelectionList?.length || 0,
        firstStatus: data.statusSelectionList?.[0],
        eOrderCount: data.eOrders?.length || 0,
      };
    });

    expect(result.status).toBe(200);
    // The test list is a catalog, so its size is configuration; that it is
    // served at all, and not empty, is the contract. 164 was this instance's
    // catalog on the day the case was written.
    expect(result.testIsArray, 'testSelectionList must be an array').toBe(true);
    expect(result.testCount, 'the order-search form cannot filter by test with no tests').toBeGreaterThan(0);
    // statusCount stays EXACT, because this list is an enum and not a catalog:
    // StatusService.ExternalOrderStatus is Entered, Cancelled, Realized,
    // NonConforming, AwaitingSpecimen. That is FIVE. The old assertion demanded
    // 4 and named them "Cancelled, Entered, Realized, Unrealized" - a count that
    // was already stale (AwaitingSpecimen was added by OGC-1145) and a name,
    // "Unrealized", that is not in the enum at all. If the enum grows again this
    // should fail and be updated deliberately; that is the point of pinning an
    // enum rather than a catalog.
    expect(result.statusCount,
      'ExternalOrderStatus has five members: Entered, Cancelled, Realized, NonConforming, AwaitingSpecimen')
      .toBe(5);
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
        menuIsArray: Array.isArray(data.menuList),
        totalRecords: data.totalRecordCount,
        firstProvider: data.menuList?.[0] ? {
          hasId: !!data.menuList[0].id,
          hasPerson: !!data.menuList[0].person,
          hasFhirUuid: !!data.menuList[0].fhirUuid,
        } : null,
      };
    });

    expect(result.status).toBe(200);
    // menuList is a paged view of whatever providers exist. Its length is the
    // instance's provider count; what this case can honestly claim is that the
    // list is served and that its paging header agrees with it.
    expect(result.menuIsArray, 'menuList must be an array').toBe(true);
    expect(result.totalRecords, 'totalRecordCount must be reported alongside menuList').not.toBeUndefined();
    expect(Number(result.totalRecords) >= result.providerCount,
      `totalRecordCount ${result.totalRecords} is smaller than the ${result.providerCount} rows served`).toBe(true);
    if (result.firstProvider) {
      expect(result.firstProvider.hasId).toBe(true);
      expect(result.firstProvider.hasPerson).toBe(true);
      // fhirUuid is NOT required. Provider.fhirUuid is a nullable UUID and
      // getFhirUuidAsString() returns "" when it is unset, so a provider that
      // predates FHIR sync legitimately has none. Asserting it on an arbitrary
      // first row reported the state of one record, not a contract. Logged so a
      // reader can still see the coverage.
      // eslint-disable-next-line no-console
      console.log(`TC-DEEP-06: first provider fhirUuid present = ${result.firstProvider.hasFhirUuid}`);
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
        panelsIsArray: Array.isArray(data.existingPanelList),
        inactiveIsArray: Array.isArray(data.inactivePanelList),
        sampleTypesIsArray: Array.isArray(data.existingSampleTypeList),
        // existingPanelList is a List<SampleTypePanel>: ONE ENTRY PER ACTIVE
        // SAMPLE TYPE, each {typeOfSampleName, panels?}. So its length is the
        // sample-type count, never the panel count - which is what the old
        // "at least 15 panels" assertion was really measuring.
        panelGroupNames: Array.isArray(data.existingPanelList)
          ? data.existingPanelList.map((g: { typeOfSampleName?: unknown }) => String(g?.typeOfSampleName ?? '')).sort()
          : null,
        inactiveGroupNames: Array.isArray(data.inactivePanelList)
          ? data.inactivePanelList.map((g: { typeOfSampleName?: unknown }) => String(g?.typeOfSampleName ?? '')).sort()
          : null,
        sampleTypeNames: Array.isArray(data.existingSampleTypeList)
          ? data.existingSampleTypeList.map((t: { value?: unknown }) => String(t?.value ?? '')).sort()
          : null,
        hasEnglishNames: typeof data.existingEnglishNames === 'string',
        hasFrenchNames: typeof data.existingFrenchNames === 'string',
      };
    });

    expect(result.status).toBe(200);
    // Panels and sample types are both catalogs. What the Panel Create screen
    // needs is that all four lists arrive as arrays and that a panel cannot be
    // built without a sample type to hang it on.
    expect(result.panelsIsArray, 'existingPanelList must be an array').toBe(true);
    expect(result.inactiveIsArray, 'inactivePanelList must be an array').toBe(true);
    expect(result.sampleTypesIsArray, 'existingSampleTypeList must be an array').toBe(true);
    expect(result.sampleTypes, 'a panel cannot be created without a sample type').toBeGreaterThan(0);
    // The real contract, from PanelCreateController.setupDisplayItems: both panel
    // lists are built by walking SAMPLE_TYPE_ACTIVE, so each carries exactly one
    // group per active sample type. A group missing from either list is a form
    // the screen cannot render, on an instance with any number of panels.
    expect(result.panelGroupNames,
      'existingPanelList must carry one group per active sample type').toEqual(result.sampleTypeNames);
    expect(result.inactiveGroupNames,
      'inactivePanelList must carry one group per active sample type').toEqual(result.sampleTypeNames);
    // existingEnglishNames / existingFrenchNames are STRINGS — the controller
    // joins the configured names into one blob (getExistingTestNames returns a
    // String, and every *CreateForm declares these as String). These assertions
    // used to be Array.isArray(...) === true, which is false for a string, so
    // they had never once passed on any instance. Same defect shape as the
    // census thresholds: an expectation about a contract nobody checked.
    expect(result.hasEnglishNames, 'existingEnglishNames must be the joined name string').toBe(true);
    expect(result.hasFrenchNames, 'existingFrenchNames must be the joined name string').toBe(true);
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
        sampleTypeIsArray: Array.isArray(data.sampleTypeList),
        uomIsArray: Array.isArray(data.uomList),
        resultTypeIsArray: Array.isArray(data.resultTypeList),
        labUnitIsArray: Array.isArray(data.labUnitList),
        hasPanelList: Array.isArray(data.panelList),
        hasAgeRangeList: Array.isArray(data.ageRangeList),
      };
    });

    expect(result.status).toBe(200);
    // Use lower bounds — catalog may grow over time
    // Four selection lists the Test Add form cannot work without. Asserted
    // non-empty and array-shaped rather than against this instance's counts
    // (which were 24 / 37 / 6 / 23 on the day the case was written).
    for (const [name, count, isArray] of [
      ['sampleTypeList', result.sampleTypeCount, result.sampleTypeIsArray],
      ['uomList', result.uomCount, result.uomIsArray],
      ['resultTypeList', result.resultTypeCount, result.resultTypeIsArray],
      ['labUnitList', result.labUnitCount, result.labUnitIsArray],
    ] as Array<[string, number, boolean]>) {
      expect(isArray, `${name} must be an array`).toBe(true);
      expect(count, `Test Add cannot add a test with an empty ${name}`).toBeGreaterThan(0);
    }
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
      // TestAdd publishes the same sampleTypeList. Two screens disagreeing about
      // which sample types exist is a real defect on ANY instance, and no count
      // threshold can catch it — which is what this case asserted before
      // (exactly 24, the number this instance happened to hold that week).
      const addRes = await fetch('/api/OpenELIS-Global/rest/TestAdd', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const addData = addRes.ok ? await addRes.json() : null;
      const ids = (l: unknown) => (Array.isArray(l) ? l.map((x: { id?: unknown }) => String(x?.id ?? '')).sort() : null);
      return {
        status: res.status,
        sampleTypeCount: data.sampleTypeList?.length || 0,
        sampleTypeIsArray: Array.isArray(data.sampleTypeList),
        hasJsonWad: data.jsonWad !== undefined,
        formName: data.formName,
        modifyIds: ids(data.sampleTypeList),
        addStatus: addRes.status,
        addIds: ids(addData?.sampleTypeList),
      };
    });

    expect(result.status).toBe(200);
    expect(result.sampleTypeIsArray, 'sampleTypeList must be an array').toBe(true);
    expect(result.sampleTypeCount, 'a test cannot be modified with no sample types to choose from').toBeGreaterThan(0);
    expect(result.formName).toBeTruthy();
    expect(result.addStatus, 'TestAdd must answer so the two lists can be compared').toBe(200);
    expect(result.modifyIds,
      `TestModifyEntry and TestAdd disagree about the sample types: `
      + `TestModifyEntry served ${result.modifyIds?.length} and TestAdd ${result.addIds?.length}`)
      .toEqual(result.addIds);
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
    // API-only file: no page.goto, no locator, no getByRole anywhere in it.
    // apiSession() gives it an authenticated origin without booting the SPA,
    // which login() would do at a measured ~49s per test.
    await apiSession(page);
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
    // API-only file: no page.goto, no locator, no getByRole anywhere in it.
    // apiSession() gives it an authenticated origin without booting the SPA,
    // which login() would do at a measured ~49s per test.
    await apiSession(page);
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
    // API-only file: no page.goto, no locator, no getByRole anywhere in it.
    // apiSession() gives it an authenticated origin without booting the SPA,
    // which login() would do at a measured ~49s per test.
    await apiSession(page);
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
    // API-only file: no page.goto, no locator, no getByRole anywhere in it.
    // apiSession() gives it an authenticated origin without booting the SPA,
    // which login() would do at a measured ~49s per test.
    await apiSession(page);
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
        hasEnglishNames: typeof data.existingEnglishNames === 'string',
        hasFrenchNames: typeof data.existingFrenchNames === 'string',
      };
    });

    expect(result.status).toBe(200);
    expect(result.hasExistingPanels).toBe(true);
    expect(result.hasInactivePanels).toBe(true);
    expect(result.hasSampleTypes).toBe(true);
    // existingEnglishNames / existingFrenchNames are STRINGS — the controller
    // joins the configured names into one blob (getExistingTestNames returns a
    // String, and every *CreateForm declares these as String). These assertions
    // used to be Array.isArray(...) === true, which is false for a string, so
    // they had never once passed on any instance. Same defect shape as the
    // census thresholds: an expectation about a contract nobody checked.
    expect(result.hasEnglishNames, 'existingEnglishNames must be the joined name string').toBe(true);
    expect(result.hasFrenchNames, 'existingFrenchNames must be the joined name string').toBe(true);
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

// ─────────────────────────────────────────────────────────────
// Section F: Panel creation, walked (2026-09-22)
//
// Everything above this line about panels is a GET. TC-DEEP-07 and TC-DEEP-24
// both read /rest/PanelCreate and assert its lists arrive; neither ever created
// a panel, so nothing in this repository covered the write path — which is
// exactly where the panel DOMAIN is decided, and exactly what Casey could not
// get to work ("even if I have environmental tests, I can't seem to make
// environmental panels ... it just sticks at clinical", 2026-09-22).
//
// The contract, read off origin/develop @ 1e5d582 before these cases were
// written:
//   * Panel.domain (panel/valueholder/Panel.java:38) defaults to "CLINICAL",
//     and Domain.normalize() sends every blank or unrecognized value to
//     CLINICAL. So a create path that never SETS a domain silently mints a
//     clinical panel; it does not fail, and nothing in the response says so.
//   * The Test Catalog editor CAN express a domain, two ways:
//     POST /rest/test-catalog/panels carries CreatePanelRequest.domain
//     (OGC-1140, inline create from a test), and
//     PUT /rest/test-catalog/panels/{id}/basic-info carries
//     PanelBasicInfoRequest.domain (OGC-224). The Panel Editor's Save uses BOTH,
//     in that order: POST {name, active:false} then PUT {name, description,
//     domain, active} — PanelBasicInfoSection.jsx:91-108. The POST in that pair
//     sends NO domain, so the PUT is the only thing that carries the operator's
//     choice, and TC-DEEP-28 is what proves the pair works.
//   * The LEGACY screen cannot express a domain at all. PanelCreateForm has no
//     domain field, and PanelCreateRestController.createPanel() (line 190)
//     never calls setDomain. Every panel created there is CLINICAL. TC-DEEP-29
//     pins that, so it fails the day it is fixed.
//   * The domain guard refuses to move a panel away from its member tests
//     (TestCatalogEditorRestController:2143-2148) and answers 422 with an EMPTY
//     BODY. TC-DEEP-30 pins the empty body, because that is why the editor can
//     only say "error.panel.save": the server hands it nothing to say.
//
// These create rows. Casey, 2026-09-22 and standing: "These will always be test
// instances" — seed freely; the rows are named QA-PNL* so they are findable.
// ─────────────────────────────────────────────────────────────

test.describe('Panel creation write path (2026-09-22)', () => {
  test.beforeEach(async ({ page }) => {
    await apiSession(page);
  });

  test('TC-DEEP-26: POST /rest/test-catalog/panels creates a readable panel', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const name = `QA-PNL-${String(Date.now()).slice(-6)}`;
      const post = await fetch('/api/OpenELIS-Global/rest/test-catalog/panels', {
        method: 'POST', headers: H, body: JSON.stringify({ name, active: false }),
      });
      const created = await post.json().catch(() => null);
      const id = created?.id ?? null;
      const get = id
        ? await fetch(`/api/OpenELIS-Global/rest/test-catalog/panels/${id}`, { headers: H })
        : null;
      const read = get ? await get.json().catch(() => null) : null;
      return {
        name,
        postStatus: post.status,
        id,
        getStatus: get?.status ?? 0,
        readName: read?.name ?? null,
        readDomain: read?.domain ?? null,
        readActive: read?.active ?? null,
        readTestCount: read?.testCount ?? null,
      };
    });

    expect(result.postStatus, 'POST /test-catalog/panels must create (201)').toBe(201);
    expect(result.id, 'the create response must carry the new panel id').toBeTruthy();
    expect(result.getStatus, 'the created panel must be readable back').toBe(200);
    expect(result.readName, 'the panel must come back under the name it was created with').toBe(result.name);
    // Panel.java:38 — a create that names no domain lands on CLINICAL. This is
    // the DEFAULT, asserted so that a change of default is visible here.
    expect(result.readDomain, 'a domainless create defaults to CLINICAL (Panel.java:38)').toBe('CLINICAL');
    expect(result.readActive, 'a panel created with active:false starts inactive').toBe(false);
    expect(result.readTestCount, 'a fresh panel has no member tests').toBe(0);
  });

  test('TC-DEEP-27: POST /rest/test-catalog/panels honours a non-clinical domain', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const name = `QA-PNLV-${String(Date.now()).slice(-6)}`;
      const post = await fetch('/api/OpenELIS-Global/rest/test-catalog/panels', {
        method: 'POST', headers: H, body: JSON.stringify({ name, active: false, domain: 'VECTOR' }),
      });
      const created = await post.json().catch(() => null);
      const id = created?.id ?? null;
      const get = id
        ? await fetch(`/api/OpenELIS-Global/rest/test-catalog/panels/${id}`, { headers: H })
        : null;
      const read = get ? await get.json().catch(() => null) : null;
      return { postStatus: post.status, id, getStatus: get?.status ?? 0, readDomain: read?.domain ?? null };
    });

    expect(result.postStatus).toBe(201);
    expect(result.id).toBeTruthy();
    expect(result.getStatus).toBe(200);
    // CreatePanelRequest.domain -> panel.setDomain(Domain.normalize(body.domain)).
    // If this reads CLINICAL, the create path is dropping the caller's choice —
    // the defect Casey reported, at the API level.
    expect(result.readDomain, 'the created panel must keep the domain the create asked for').toBe('VECTOR');
  });

  test('TC-DEEP-28: the Panel Editor two-step create persists the chosen domain', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const name = `QA-PNLE-${String(Date.now()).slice(-6)}`;
      // Step 1 — exactly what PanelBasicInfoSection.jsx:94 posts: no domain.
      const post = await fetch('/api/OpenELIS-Global/rest/test-catalog/panels', {
        method: 'POST', headers: H, body: JSON.stringify({ name, active: false }),
      });
      const created = await post.json().catch(() => null);
      const id = created?.id ?? null;
      // Step 2 — exactly what saveExisting() PUTs, carrying the radio choice.
      const put = id
        ? await fetch(`/api/OpenELIS-Global/rest/test-catalog/panels/${id}/basic-info`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({ name, description: '', domain: 'ENVIRONMENTAL', active: false }),
          })
        : null;
      const saved = put ? await put.json().catch(() => null) : null;
      const get = id
        ? await fetch(`/api/OpenELIS-Global/rest/test-catalog/panels/${id}`, { headers: H })
        : null;
      const read = get ? await get.json().catch(() => null) : null;
      return {
        postStatus: post.status,
        id,
        putStatus: put?.status ?? 0,
        savedDomain: saved?.domain ?? null,
        readDomain: read?.domain ?? null,
      };
    });

    expect(result.postStatus).toBe(201);
    expect(result.putStatus, 'the basic-info save must succeed on a fresh panel').toBe(200);
    // Both the PUT's own answer and an independent re-read, because a save that
    // echoes the right value and stores the wrong one is the failure mode that
    // makes an operator say "it sticks at clinical".
    expect(result.savedDomain, 'the save must answer with the chosen domain').toBe('ENVIRONMENTAL');
    expect(result.readDomain, 'a fresh read must show the chosen domain').toBe('ENVIRONMENTAL');
  });

  test('TC-DEEP-29: FLIP-WHEN-FIXED — legacy /rest/PanelCreate is CLINICAL-only', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const B = '/api/OpenELIS-Global/rest';
      const form = await (await fetch(`${B}/PanelCreate`, { headers: H })).json();
      const types: Array<{ id?: unknown }> = Array.isArray(form?.existingSampleTypeList)
        ? form.existingSampleTypeList : [];
      const sampleTypeId = types.length ? String(types[0]?.id ?? '') : '';
      const stamp = String(Date.now()).slice(-6);

      // (a) Ask for a domain. PanelCreateForm has no such property, so Jackson
      // refuses the whole request — 400, HttpMessageNotReadableException. The
      // domain is not merely ignored here: it cannot be expressed at all.
      const withDomain = await fetch(`${B}/PanelCreate`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          panelEnglishName: `QA-PNLD-${stamp}`, panelFrenchName: `QA-PNLD-${stamp}`,
          sampleTypeId, panelLoinc: '99999-9', domain: 'ENVIRONMENTAL',
        }),
      });

      // (b) The same create the legacy screen really sends. A LOINC is required
      // in practice (see TC-DEEP-31), so one is supplied.
      const name = `QA-PNLL-${stamp}`;
      const ok = await fetch(`${B}/PanelCreate`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          panelEnglishName: name, panelFrenchName: name,
          sampleTypeId, panelLoinc: '99999-9',
        }),
      });
      const panels = await (await fetch(
        `${B}/test-catalog/panels?includeInactive=true`, { headers: H },
      )).json();
      const mine = Array.isArray(panels) ? panels.find((p: { name?: string }) => p?.name === name) : null;
      return {
        sampleTypeId,
        withDomainStatus: withDomain.status,
        okStatus: ok.status,
        found: !!mine,
        domain: mine?.domain ?? null,
      };
    });

    expect(result.sampleTypeId, 'the legacy create needs an active sample type').toBeTruthy();
    // The form cannot carry a domain — a request that names one is rejected
    // outright rather than honoured or quietly dropped.
    expect(result.withDomainStatus,
      'PanelCreateForm has no domain property, so a domain makes the body unreadable').toBe(400);
    expect(result.okStatus, 'the legacy create must be accepted').toBe(200);
    expect(result.found, 'the legacy create must actually persist a panel').toBe(true);
    // THE DEFECT, asserted as it stands: createPanel() never calls setDomain, so
    // the panel lands on CLINICAL and no request can say otherwise. When the
    // legacy screen learns about domains this flips to a FAILURE, which is the
    // signal to rewrite this case to assert the requested domain.
    expect(result.domain,
      'DEFECT: legacy PanelCreate can only store CLINICAL').toBe('CLINICAL');
  });

  test('TC-DEEP-31: FLIP-WHEN-FIXED — legacy /rest/PanelCreate answers 200 and creates nothing without a LOINC', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const B = '/api/OpenELIS-Global/rest';
      const form = await (await fetch(`${B}/PanelCreate`, { headers: H })).json();
      const types: Array<{ id?: unknown }> = Array.isArray(form?.existingSampleTypeList)
        ? form.existingSampleTypeList : [];
      const sampleTypeId = types.length ? String(types[0]?.id ?? '') : '';
      const name = `QA-PNLN-${String(Date.now()).slice(-6)}`;
      const post = await fetch(`${B}/PanelCreate`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          panelEnglishName: name, panelFrenchName: name, sampleTypeId, panelLoinc: '',
        }),
      });
      const body = await post.text();
      const panels = await (await fetch(
        `${B}/test-catalog/panels?includeInactive=true`, { headers: H },
      )).json();
      const found = Array.isArray(panels) && panels.some((p: { name?: string }) => p?.name === name);
      return { sampleTypeId, status: post.status, echoedName: body.includes(name), found };
    });

    expect(result.sampleTypeId, 'the legacy create needs an active sample type').toBeTruthy();
    // THE DEFECT: postPanelCreate() swallows the insert failure —
    // `catch (LIMSRuntimeException e) { LogEvent.logDebug(e); }`
    // (PanelCreateRestController:145) — then returns the form with HTTP 200 and
    // the submitted name echoed back. Nothing was written. The screen has no way
    // to tell an operator that their panel does not exist.
    expect(result.status, 'the endpoint answers 200 even when the insert fails').toBe(200);
    expect(result.echoedName, 'and echoes the name back, which reads as success').toBe(true);
    expect(result.found,
      'DEFECT: no panel was created, and the 200 said otherwise').toBe(false);
  });

  test('TC-DEEP-30: FLIP-WHEN-FIXED — the domain guard refuses with an empty body', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const B = '/api/OpenELIS-Global/rest/test-catalog';
      // Seed a panel that HAS a clinical member test, so the guard has something
      // to refuse. Nothing here depends on the instance's existing panels.
      const tests = await (await fetch(`${B}/tests?domain=CLINICAL&pageSize=1`, { headers: H })).json();
      const testId = tests?.rows?.[0]?.testId ?? null;
      const name = `QA-PNLG-${String(Date.now()).slice(-6)}`;
      const created = await (await fetch(`${B}/panels`, {
        method: 'POST', headers: H, body: JSON.stringify({ name, active: false, domain: 'CLINICAL' }),
      })).json().catch(() => null);
      const id = created?.id ?? null;
      const addTests = id && testId
        ? await fetch(`${B}/panels/${id}/tests`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({ tests: [{ testId, position: 1 }] }),
          })
        : null;
      const move = id
        ? await fetch(`${B}/panels/${id}/basic-info`, {
            method: 'PUT', headers: H, body: JSON.stringify({ domain: 'ENVIRONMENTAL' }),
          })
        : null;
      const moveBody = move ? await move.text() : null;
      const read = id ? await (await fetch(`${B}/panels/${id}`, { headers: H })).json().catch(() => null) : null;
      return {
        testId,
        id,
        addStatus: addTests?.status ?? 0,
        moveStatus: move?.status ?? 0,
        moveBodyLength: moveBody === null ? -1 : moveBody.trim().length,
        readDomain: read?.domain ?? null,
        readTestCount: read?.testCount ?? null,
      };
    });

    expect(result.testId, 'the guard probe needs one clinical test to seed a member').toBeTruthy();
    expect(result.id, 'the guard probe needs its own panel').toBeTruthy();
    expect(result.addStatus, 'a clinical test must be accepted into a clinical panel').toBe(200);
    expect(result.readTestCount, 'the seeded panel must really have a member').toBe(1);
    // The guard itself is correct per the OGC-224 FRS: a panel never mixes
    // domains. What is wrong is HOW it refuses.
    expect(result.moveStatus, 'moving a panel away from its member tests must be refused').toBe(422);
    // THE DEFECT: the refusal carries no body, so the editor has no reason to
    // show and falls back to a generic "error.panel.save" — or, as observed in
    // Chrome on testing 2026-09-22, shows nothing at all while leaving the radio
    // on the domain that was NOT saved. A body here flips this to a FAILURE,
    // which is the signal that the server started explaining itself.
    expect(result.moveBodyLength,
      'DEFECT: the 422 is empty — the UI has nothing to tell the operator').toBe(0);
    expect(result.readDomain, 'the refused move must leave the stored domain alone').toBe('CLINICAL');
  });
});

// ─────────────────────────────────────────────────────────────
// Section G: the new-test lifecycle, walked (2026-09-22)
//
// Written after doing this walk by hand to answer OGC-1116 ("newly created
// tests never become orderable — absent from /rest/test-list") and the FR-20/21
// coverage-gap case on OGC-1119. Both questions took a live instance and a
// sequence of six calls to settle, and neither had any coverage here. The next
// person to ask should get an answer from a run, not from a browser session.
//
// Contract, read off origin/develop @ 1e5d582:
//   * Activation is NOT a basic-info field. `PUT .../basic-info` with
//     active:true on an inactive test answers 409 {"conflict":"activation"}
//     ON PURPOSE (TestCatalogEditorRestController:690-694) — the comment there
//     records that it replaced an earlier 200-and-drop, which "told the caller
//     the activation had been saved when it had not". Deactivation DOES go
//     through basic-info. TC-DEEP-32 pins both halves of that asymmetry.
//   * Activation goes through POST .../activate, and sets `orderable` as well
//     as `is_active`, by design: "Active ⇒ orderable & importable", and Add
//     Order filters on is_active='Y' AND orderable=true. So /rest/test-list
//     membership is the externally observable consequence of activating, which
//     is exactly what OGC-1116 is about.
//   * Activation is gated on completeness. A test with no primary result
//     component is refused with a NAMED reason, not a silent failure.
//   * The coverage report is computed server-side on every ranges load/save;
//     CoverageValidationPanel only renders it. So the gap contract is testable
//     over the API without touching the UI.
//
// Both cases create their own test and leave it INACTIVE, so neither puts an
// orderable QA row into Add Order for whoever else is on the instance.
// ─────────────────────────────────────────────────────────────

test.describe('New-test lifecycle (2026-09-22)', () => {
  test.beforeEach(async ({ page }) => {
    await apiSession(page);
  });

  test('TC-DEEP-32: a new test reaches /rest/test-list only after it is complete and activated', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const B = '/api/OpenELIS-Global/rest/test-catalog';
      const listNames = async () => {
        const res = await fetch('/api/OpenELIS-Global/rest/test-list', { headers: H });
        const rows = await res.json().catch(() => null);
        return Array.isArray(rows) ? rows.map((r: { value?: unknown }) => String(r?.value ?? '')) : null;
      };

      const stamp = String(Date.now()).slice(-6);
      const name = `QA-LIFE-${stamp}`;
      const labUnits = await (await fetch(`${B}/lab-units`, { headers: H })).json();
      const sampleTypes = (await (await fetch('/api/OpenELIS-Global/rest/sample-types', { headers: H })).json())
        ?.data;
      if (!Array.isArray(labUnits) || !labUnits.length || !Array.isArray(sampleTypes) || !sampleTypes.length) {
        return { fatal: 'instance has no lab units or no sample types' };
      }

      const created = await fetch(`${B}/tests`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          name, reportingName: name, code: `QAL${stamp}`,
          labUnitId: String(labUnits[0].id), sampleTypeIds: [String(sampleTypes[0].id)],
          domain: 'CLINICAL', orderable: false,
        }),
      });
      const createdBody = await created.json().catch(() => null);
      const id = createdBody?.testId ?? null;
      if (!id) return { fatal: `create failed (${created.status})` };

      const before = await listNames();

      // full range coverage, so the refusal below can only be about completeness
      const ranges = await fetch(`${B}/tests/${id}/ranges`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ testId: id, ranges: [
          { gender: 'M', minAge: 0, maxAge: null, lowNormal: 1, highNormal: 9 },
          { gender: 'F', minAge: 0, maxAge: null, lowNormal: 1, highNormal: 9 },
        ] }),
      });
      const rangesBody = await ranges.json().catch(() => null);

      const incomplete = await (await fetch(`${B}/tests/${id}/completeness`, { headers: H })).json()
        .catch(() => null);
      const refused = await fetch(`${B}/tests/${id}/activate`, { method: 'POST', headers: H, body: '{}' });

      // activation is not a basic-info field, and asking there is refused rather than dropped
      const viaBasicInfo = await fetch(`${B}/tests/${id}/basic-info`, {
        method: 'PUT', headers: H, body: JSON.stringify({ active: true }),
      });
      const viaBasicInfoBody = await viaBasicInfo.json().catch(() => null);

      const components = await fetch(`${B}/tests/${id}/sample-results`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ testId: id, components: [
          { code: `QAL${stamp}`, label: 'QA lifecycle probe', displayOrder: 1,
            resultType: 'N', isPrimary: true, significantDigits: 2 },
        ] }),
      });
      const complete = await (await fetch(`${B}/tests/${id}/completeness`, { headers: H })).json()
        .catch(() => null);

      const activated = await fetch(`${B}/tests/${id}/activate`, { method: 'POST', headers: H, body: '{}' });
      const activatedBody = await activated.json().catch(() => null);
      const after = await listNames();

      // leave nothing orderable behind for whoever else is on this instance
      const deactivated = await fetch(`${B}/tests/${id}/basic-info`, {
        method: 'PUT', headers: H, body: JSON.stringify({ active: false }),
      });
      const cleaned = await listNames();

      const has = (rows: string[] | null) => !!rows && rows.some((v) => v.includes(name));
      return {
        id, name,
        maleCoverage: rangesBody?.coverage?.male?.status ?? null,
        femaleCoverage: rangesBody?.coverage?.female?.status ?? null,
        incompleteFlag: incomplete?.complete ?? null,
        incompleteMissing: Array.isArray(incomplete?.missing) ? incomplete.missing : null,
        refusedStatus: refused.status,
        basicInfoStatus: viaBasicInfo.status,
        basicInfoConflict: viaBasicInfoBody?.conflict ?? null,
        componentsStatus: components.status,
        completeFlag: complete?.complete ?? null,
        activatedStatus: activated.status,
        activeFlag: activatedBody?.active ?? null,
        orderableFlag: activatedBody?.orderable ?? null,
        inListBefore: has(before), inListAfter: has(after),
        countBefore: before?.length ?? null, countAfter: after?.length ?? null,
        deactivatedStatus: deactivated.status,
        inListAfterDeactivate: has(cleaned),
      };
    });

    expect(result.fatal, `precondition: ${result.fatal ?? ''}`).toBeUndefined();
    expect(result.maleCoverage, 'an unbounded range covers the whole age axis').toBe('COMPLETE');
    expect(result.femaleCoverage, 'an unbounded range covers the whole age axis').toBe('COMPLETE');

    // A fresh test is NOT orderable, and the list is where that is observable.
    expect(result.inListBefore, 'a new inactive test must not be offerable for ordering').toBe(false);

    // Refused for a NAMED reason. A bare 4xx here would be the old silent failure.
    expect(result.incompleteFlag, 'a test with no result component is not complete').toBe(false);
    expect(result.incompleteMissing, 'the completeness report must name what is missing')
      .toContain('NO_PRIMARY_RESULT_TYPE');
    expect(result.refusedStatus, 'activating an incomplete test is refused').toBe(422);

    // The asymmetry: basic-info refuses to activate, on purpose, rather than dropping it.
    expect(result.basicInfoStatus, 'basic-info must not be an activation back door').toBe(409);
    expect(result.basicInfoConflict, 'and must say why it refused').toBe('activation');

    expect(result.componentsStatus).toBe(200);
    expect(result.completeFlag, 'a primary result component completes the test').toBe(true);

    // THE OGC-1116 ASSERTION: activation makes it orderable AND it reaches the list.
    expect(result.activatedStatus, 'a complete test activates').toBe(200);
    expect(result.activeFlag, 'activation sets is_active').toBe(true);
    expect(result.orderableFlag, 'activation sets orderable too — "Active implies orderable"').toBe(true);
    expect(result.inListAfter, 'an activated test must reach /rest/test-list, which Add Order reads')
      .toBe(true);
    expect(result.countAfter, 'the list grew by exactly the one test').toBe((result.countBefore ?? 0) + 1);

    // and the lifecycle is reversible (OGC-1115), which is also this case's cleanup
    expect(result.deactivatedStatus, 'deactivation does go through basic-info').toBe(200);
    expect(result.inListAfterDeactivate, 'a deactivated test leaves the orderable list').toBe(false);
  });

  test('TC-DEEP-33: narrowing an open-ended reference range reports the uncovered tail', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const B = '/api/OpenELIS-Global/rest/test-catalog';
      const stamp = String(Date.now()).slice(-6);
      const labUnits = await (await fetch(`${B}/lab-units`, { headers: H })).json();
      const sampleTypes = (await (await fetch('/api/OpenELIS-Global/rest/sample-types', { headers: H })).json())
        ?.data;
      if (!Array.isArray(labUnits) || !labUnits.length || !Array.isArray(sampleTypes) || !sampleTypes.length) {
        return { fatal: 'instance has no lab units or no sample types' };
      }
      // its own test, so no real catalog row's ranges are disturbed
      const created = await (await fetch(`${B}/tests`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          name: `QA-GAP-${stamp}`, reportingName: `QA-GAP-${stamp}`, code: `QAG${stamp}`,
          labUnitId: String(labUnits[0].id), sampleTypeIds: [String(sampleTypes[0].id)],
          domain: 'CLINICAL', orderable: false,
        }),
      })).json().catch(() => null);
      const id = created?.testId ?? null;
      if (!id) return { fatal: 'create failed' };

      const put = async (ranges: unknown[]) => {
        const res = await fetch(`${B}/tests/${id}/ranges`, {
          method: 'PUT', headers: H, body: JSON.stringify({ testId: id, ranges }),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, male: body?.coverage?.male ?? null };
      };

      // "15+": one range from 0 with no upper bound. Covers the whole axis.
      const open = await put([{ gender: 'M', minAge: 0, maxAge: null, lowNormal: 1, highNormal: 9 }]);
      // narrowed to 15..30: 0-15 AND everything above 30 are now uncovered.
      const narrowed = await put([{ gender: 'M', minAge: 15, maxAge: 30, lowNormal: 1, highNormal: 9 }]);
      return { id, open, narrowed };
    });

    expect(result.fatal, `precondition: ${result.fatal ?? ''}`).toBeUndefined();
    expect(result.open.status).toBe(200);
    expect(result.open.male?.status, 'an unbounded range leaves nothing uncovered').toBe('COMPLETE');
    expect(result.open.male?.gaps, 'and reports no gaps').toEqual([]);

    // FR-20/21. The tail is the half a naive implementation misses: it is easy to
    // notice 0-15 went missing and easy to forget that 30..unbounded did too.
    expect(result.narrowed.status).toBe(200);
    expect(result.narrowed.male?.status, 'narrowing the range opens a gap').toBe('GAP');
    const gaps = (result.narrowed.male?.gaps ?? []) as Array<{ fromAge?: unknown; toAge?: unknown }>;
    expect(gaps.map((g) => [g.fromAge, g.toAge]),
      'both the leading window and the unbounded tail must be reported').toEqual([
      [0, 15],
      [30, 'Infinity'],
    ]);
  });
});
