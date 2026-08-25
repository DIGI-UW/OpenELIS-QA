import { test, expect } from '@playwright/test';

/**
 * admin-route-census — a CHEAP UI ORACLE over every admin route.
 *
 * WHY THIS EXISTS
 * The 2026-08-25 manual click-through found 51 routes reachable from /MasterListsPage. Walking
 * them by hand takes an afternoon and proves only that they rendered on the day someone looked.
 * This spec walks all of them on every run and applies one consistent oracle, so a route that
 * starts rendering an empty shell, a stack trace, or a login page is caught by the suite rather
 * than by the next person who happens to click it.
 *
 * WHAT THE ORACLE CHECKS (deliberately shallow — breadth, not depth)
 *   1. The URL did not bounce to a login page. A lapsed session is the single most common cause
 *      of a false red here; the session-guard reporter heals it, this assertion names it.
 *   2. The page painted real chrome: a Carbon heading, table, form, tile or side-nav. A route
 *      that resolves to an empty root div fails.
 *   3. No server error leaked into the DOM — no stack trace, no Whitelabel Error Page, no
 *      HTTP 500/404 text.
 *   4. No uncaught page error and no 5xx API response while the route settled.
 *
 * WHAT IT DOES NOT CHECK
 * Field-level behaviour, save paths, or permissions. Those live in admin-config.spec.ts and the
 * per-feature suites. Do not grow this file into those — its value is that it stays cheap enough
 * to run every time.
 *
 * READING A FAILURE
 * One route failing is usually a real regression on that route. Many routes failing at once is
 * almost always the session, not the product — read the [session-guard] summary line first.
 */

const ROUTES: Array<{ id: string; path: string; label: string }> = [
  { id: 'reflex', path: '/MasterListsPage/reflex', label: 'Reflex Tests Management' },
  { id: 'calculatedValue', path: '/MasterListsPage/calculatedValue', label: 'Calculated Value Tests Management' },
  { id: 'SampleTypeEditor', path: '/MasterListsPage/SampleTypeEditor', label: 'Sample Type Editor' },
  { id: 'TestCatalogList', path: '/MasterListsPage/TestCatalogList', label: 'Test Catalogue Editor' },
  { id: 'PanelEditor', path: '/MasterListsPage/TestCatalogList?entity=panels', label: 'Panel Editor' },
  { id: 'LabUnitManagement', path: '/MasterListsPage/LabUnitManagement', label: 'Lab Units' },
  { id: 'AnalyzerTestName', path: '/MasterListsPage/AnalyzerTestName', label: 'Analyzer Test Name' },
  { id: 'labNumber', path: '/MasterListsPage/labNumber', label: 'Lab Number Management' },
  { id: 'program', path: '/MasterListsPage/program', label: 'Program Entry' },
  { id: 'providerMenu', path: '/MasterListsPage/providerMenu', label: 'Provider Management' },
  { id: 'labelPresets', path: '/MasterListsPage/labelPresets', label: 'Label Presets' },
  { id: 'PluginFile', path: '/MasterListsPage/PluginFile', label: 'List Plugins' },
  { id: 'vs-species', path: '/MasterListsPage/vectorSurveillanceSetup/species', label: 'Species' },
  { id: 'vs-trap-types', path: '/MasterListsPage/vectorSurveillanceSetup/trap-types', label: 'Trap Types' },
  { id: 'vs-sampling-sites', path: '/MasterListsPage/vectorSurveillanceSetup/sampling-sites', label: 'Sampling Sites' },
  { id: 'vs-manual-entry', path: '/MasterListsPage/vectorSurveillanceSetup/manual-entry-fields', label: 'Manual Entry Field Map' },
  { id: 'organizationManagement', path: '/MasterListsPage/organizationManagement', label: 'Organization Management' },
  { id: 'resultReportingConfiguration', path: '/MasterListsPage/resultReportingConfiguration', label: 'Result Reporting Configuration' },
  { id: 'userManagement', path: '/MasterListsPage/userManagement', label: 'User Management' },
  { id: 'batchTestReassignment', path: '/MasterListsPage/batchTestReassignment', label: 'Batch test reassignment' },
  { id: 'testManagementConfigMenu', path: '/MasterListsPage/testManagementConfigMenu', label: 'Test Management (legacy)' },
  { id: 'globalMenuManagement', path: '/MasterListsPage/globalMenuManagement', label: 'Global Menu Configuration' },
  { id: 'billingMenuManagement', path: '/MasterListsPage/billingMenuManagement', label: 'Billing Menu Configuration' },
  { id: 'nonConformityMenuManagement', path: '/MasterListsPage/nonConformityMenuManagement', label: 'Non-Conform Menu Configuration' },
  { id: 'patientMenuManagement', path: '/MasterListsPage/patientMenuManagement', label: 'Patient Menu Configuration' },
  { id: 'studyMenuManagement', path: '/MasterListsPage/studyMenuManagement', label: 'Study Menu Configuration' },
  { id: 'NonConformityConfigurationMenu', path: '/MasterListsPage/NonConformityConfigurationMenu', label: 'NonConformity Configuration' },
  { id: 'MenuStatementConfigMenu', path: '/MasterListsPage/MenuStatementConfigMenu', label: 'MenuStatement Configuration' },
  { id: 'WorkPlanConfigurationMenu', path: '/MasterListsPage/WorkPlanConfigurationMenu', label: 'WorkPlan Configuration' },
  { id: 'SiteInformationMenu', path: '/MasterListsPage/SiteInformationMenu', label: 'Site Information' },
  { id: 'SiteBrandingMenu', path: '/MasterListsPage/SiteBrandingMenu', label: 'Site Branding' },
  { id: 'ResultConfigurationMenu', path: '/MasterListsPage/ResultConfigurationMenu', label: 'Result Entry Configuration' },
  { id: 'PatientConfigurationMenu', path: '/MasterListsPage/PatientConfigurationMenu', label: 'Patient Entry Configuration' },
  { id: 'PrintedReportsConfigurationMenu', path: '/MasterListsPage/PrintedReportsConfigurationMenu', label: 'Printed Report Configuration' },
  { id: 'SampleEntryConfigurationMenu', path: '/MasterListsPage/SampleEntryConfigurationMenu', label: 'Order Entry Configuration' },
  { id: 'ValidationConfigurationMenu', path: '/MasterListsPage/ValidationConfigurationMenu', label: 'Validation Configuration' },
  { id: 'SAC-all', path: '/MasterListsPage/SampleAcceptanceChecklist/all', label: 'Sample Acceptance Checklist - all domains' },
  { id: 'SAC-clinical', path: '/MasterListsPage/SampleAcceptanceChecklist/clinical', label: 'Sample Acceptance Checklist - clinical' },
  { id: 'SAC-environmental', path: '/MasterListsPage/SampleAcceptanceChecklist/environmental', label: 'Sample Acceptance Checklist - environmental' },
  { id: 'SAC-vector', path: '/MasterListsPage/SampleAcceptanceChecklist/vector', label: 'Sample Acceptance Checklist - vector' },
  { id: 'commonproperties', path: '/MasterListsPage/commonproperties', label: 'Application Properties' },
  { id: 'testNotificationConfigMenu', path: '/MasterListsPage/testNotificationConfigMenu', label: 'Test Notification Configuration' },
  { id: 'DictionaryMenu', path: '/MasterListsPage/DictionaryMenu', label: 'Dictionary Menu' },
  { id: 'NotifyUser', path: '/MasterListsPage/NotifyUser', label: 'Notify User' },
  { id: 'SearchIndexManagement', path: '/MasterListsPage/SearchIndexManagement', label: 'Search Index Management' },
  { id: 'loggingManagement', path: '/MasterListsPage/loggingManagement', label: 'Logging Configuration' },
  { id: 'languageManagement', path: '/MasterListsPage/languageManagement', label: 'Language Management' },
  { id: 'translationManagement', path: '/MasterListsPage/translationManagement', label: 'Translation Management' },
  { id: 'externalConnections', path: '/MasterListsPage/externalConnections', label: 'External Connections' },
  { id: 'dataExportStatus', path: '/MasterListsPage/dataExportStatus', label: 'FHIR Data Export Status' },
  { id: 'calendarManagement', path: '/MasterListsPage/calendarManagement', label: 'Calendar Management' },
];

const ERROR_MARKERS = [
  'Whitelabel Error Page',
  'HTTP Status 500',
  'HTTP Status 404',
  'java.lang.',
  'org.springframework.',
  'Internal Server Error',
];

test.describe('TC-ADMIN-CENSUS — every admin route renders', () => {
  for (const route of ROUTES) {
    test(`TC-CENSUS-${route.id}: ${route.label} renders`, async ({ page }) => {
      const pageErrors: string[] = [];
      const serverErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('response', (r) => {
        if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
      });

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // Carbon mounts asynchronously; settle rather than race the first paint.
      await page.waitForTimeout(1500);

      // 1. did not bounce to login
      const url = page.url();
      expect(url, `${route.label} bounced to a login page — read the session-guard summary`)
        .not.toMatch(/login/i);

      // 2. real chrome painted
      const chrome = await page
        .locator('h1, h2, h3, .cds--data-table, table, form, .cds--side-nav, .cds--tile')
        .count();
      expect(chrome, `${route.label} painted no heading, table, form, tile or side-nav`)
        .toBeGreaterThan(0);

      // 3. no server error leaked into the DOM
      const text = (await page.locator('body').innerText().catch(() => '')) ?? '';
      for (const marker of ERROR_MARKERS) {
        expect(text, `${route.label} shows "${marker}"`).not.toContain(marker);
      }

      // 4. clean console and no 5xx while settling
      expect(pageErrors, `${route.label} raised uncaught page errors`).toEqual([]);
      expect(serverErrors, `${route.label} triggered 5xx responses`).toEqual([]);

      // Breadcrumb for the log — row counts make drift visible run over run.
      const rows = await page.locator('.cds--data-table tbody tr, table tbody tr').count();
      console.log(`census ${route.id} :: chrome=${chrome} rows=${rows} path=${new URL(url).pathname}`);
    });
  }
});
