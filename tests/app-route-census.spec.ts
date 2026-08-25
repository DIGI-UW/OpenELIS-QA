import { test, expect } from '@playwright/test';

/**
 * app-route-census — the same cheap oracle as admin-route-census, over the NON-admin app.
 *
 * WHY IT IS A SEPARATE FILE
 * The admin census walks configuration screens; this one walks the working surfaces an actual
 * lab uses — order entry, patient, storage, analyzers, non-conformity, workplan, pathology,
 * results, validation, and the report parameter forms. They fail for different reasons and are
 * usually triaged by different people, so they get separate files and can be run separately.
 *
 * ROUTES DELIBERATELY EXCLUDED
 *   /docs/UserManual and the two static /documentation/*.pdf links — not app routes.
 *   /ReportPrint?... — that one generates a document rather than a parameter form.
 *
 * The oracle, the settle time, and the failure-reading advice are identical to
 * admin-route-census.spec.ts; read the header there for the reasoning.
 */

const ROUTES: Array<{ id: string; path: string; label: string }> = [
  { id: 'SamplePatientEntry', path: '/SamplePatientEntry', label: 'Add Order' },
  { id: 'order-clinical', path: '/order/clinical', label: 'Clinical order dashboard' },
  { id: 'order-clinical-enter', path: '/order/clinical/enter', label: 'Clinical - Enter Order' },
  { id: 'order-clinical-collect', path: '/order/clinical/collect', label: 'Clinical - Collect Sample' },
  { id: 'order-clinical-label', path: '/order/clinical/label', label: 'Clinical - Label and Store' },
  { id: 'order-clinical-qa', path: '/order/clinical/qa', label: 'Clinical - QA Review' },
  { id: 'order-env', path: '/order/environmental', label: 'Environmental order dashboard' },
  { id: 'order-env-enter', path: '/order/environmental/enter', label: 'Environmental - Enter Order' },
  { id: 'order-env-label', path: '/order/environmental/label', label: 'Environmental - Label and Store' },
  { id: 'order-env-qa', path: '/order/environmental/qa', label: 'Environmental - QA Review' },
  { id: 'order-vector', path: '/order/vector', label: 'Vector order dashboard' },
  { id: 'order-vector-enter', path: '/order/vector/enter', label: 'Vector - Enter Order' },
  { id: 'order-vector-label', path: '/order/vector/label', label: 'Vector - Label and Store' },
  { id: 'order-vector-qa', path: '/order/vector/qa', label: 'Vector - QA Review' },
  { id: 'SampleEdit', path: '/SampleEdit?type=readwrite', label: 'Edit Order' },
  { id: 'ElectronicOrders', path: '/ElectronicOrders', label: 'Incoming Orders' },
  { id: 'SampleBatchEntrySetup', path: '/SampleBatchEntrySetup', label: 'Batch Order Entry' },
  { id: 'PrintBarcode', path: '/PrintBarcode', label: 'Barcode' },
  { id: 'EnvironmentalDashboard', path: '/EnvironmentalDashboard', label: 'Compliance Dashboard' },
  { id: 'PatientManagement', path: '/PatientManagement', label: 'Add/Edit Patient' },
  { id: 'PatientHistory', path: '/PatientHistory', label: 'Patient History' },
  { id: 'PatientEntry-initial', path: '/PatientEntryByProject?type=initial', label: 'Patient Initial Entry' },
  { id: 'PatientEntry-verify', path: '/PatientEntryByProject?type=verify', label: 'Patient Double Entry' },
  { id: 'PatientEdit-rw', path: '/PatientEditByProject?type=readwrite', label: 'Patient Edit' },
  { id: 'PatientEdit-ro', path: '/PatientEditByProject?type=readonly', label: 'Patient View' },
  { id: 'PatientMerge', path: '/PatientMerge', label: 'Merge Patient' },
  { id: 'Storage-sample-items', path: '/Storage/sample-items', label: 'Storage - Sample Items' },
  { id: 'Storage-rooms', path: '/Storage/rooms', label: 'Storage - Rooms' },
  { id: 'Storage-devices', path: '/Storage/devices', label: 'Storage - Devices' },
  { id: 'Storage-shelves', path: '/Storage/shelves', label: 'Storage - Shelves' },
  { id: 'Storage-racks', path: '/Storage/racks', label: 'Storage - Racks' },
  { id: 'Storage-boxes', path: '/Storage/boxes', label: 'Storage - Boxes' },
  { id: 'SampleShipment', path: '/SampleShipment', label: 'Sample Shipment' },
  { id: 'analyzers', path: '/analyzers', label: 'Analyzers List' },
  { id: 'analyzers-errors', path: '/analyzers/errors', label: 'Analyzer Error Dashboard' },
  { id: 'analyzers-types', path: '/analyzers/types', label: 'Analyzer Types' },
  { id: 'analyzers-qc-db', path: '/analyzers/qc/db', label: 'QC Dashboard' },
  { id: 'analyzers-qc-rule', path: '/analyzers/qc/rule-config', label: 'QC Rule Configuration' },
  { id: 'analyzers-qc-lots', path: '/analyzers/qc/control-lots', label: 'QC Control Lots' },
  { id: 'NceDashboard', path: '/NceDashboard', label: 'All NCEs' },
  { id: 'ReportNCE', path: '/ReportNonConformingEvent', label: 'Report Non-Conforming Event' },
  { id: 'ViewNCE', path: '/ViewNonConformingEvent', label: 'View New Non-Conforming Events' },
  { id: 'NCECorrectiveAction', path: '/NCECorrectiveAction', label: 'NCE Corrective actions' },
  { id: 'Alerts', path: '/Alerts', label: 'Alerts' },
  { id: 'WorkPlanByTest', path: '/WorkPlanByTest?type=test', label: 'WorkPlan By Test Type' },
  { id: 'WorkPlanByPanel', path: '/WorkPlanByPanel?type=panel', label: 'WorkPlan By Panel' },
  { id: 'WorkPlanByTestSection', path: '/WorkPlanByTestSection?type=', label: 'WorkPlan By Unit' },
  { id: 'WorkPlanByPriority', path: '/WorkPlanByPriority?type=priority', label: 'WorkPlan By Priority' },
  { id: 'PathologyDashboard', path: '/PathologyDashboard', label: 'Pathology' },
  { id: 'IHCDashboard', path: '/ImmunohistochemistryDashboard', label: 'Immunohistochemistry' },
  { id: 'CytologyDashboard', path: '/CytologyDashboard', label: 'Cytology' },
  { id: 'Results', path: '/Results', label: 'Results Entry' },
  { id: 'ReferredOut', path: '/SampleShipment/reference-lab-results', label: 'Referred Out results' },
  { id: 'genericProgram', path: '/genericProgram', label: 'Order Programs' },
  { id: 'vector-identification', path: '/vector/identification', label: 'Vector Identification' },
  { id: 'ResultValidation', path: '/ResultValidation?type=&test=', label: 'Validation - Routine' },
  { id: 'RV-Immunology', path: '/ResultValidationRetroC?type=Immunology&test=', label: 'Validation - Immunology/Hematology' },
  { id: 'RV-Biochemistry', path: '/ResultValidationRetroC?type=Biochemistry&test=', label: 'Validation - Biochemistry' },
  { id: 'RV-serology', path: '/ResultValidationRetroC?type=serology', label: 'Validation - Serology' },
  { id: 'AccessionValidation', path: '/AccessionValidation', label: 'Validation - By Order' },
  { id: 'AccessionValidationRange', path: '/AccessionValidationRange', label: 'Validation - By Range' },
  { id: 'RVByTestDate', path: '/ResultValidationByTestDate', label: 'Validation - By Date' },
  { id: 'Report-patientStatus', path: '/Report?type=patient&report=patientCILNSP_vreduit', label: 'Report - Patient Status' },
  { id: 'Report-statistics', path: '/Report?type=indicator&report=statisticsReport', label: 'Report - Statistics' },
  { id: 'Report-rejection', path: '/Report?type=indicator&report=sampleRejectionReport', label: 'Report - Rejection' },
  { id: 'Report-activityByTest', path: '/Report?type=indicator&report=activityReportByTest', label: 'Report - Activity By Test Type' },
  { id: 'Report-referredOut', path: '/Report?type=patient&report=referredOut', label: 'Report - Referred Out Tests' },
  { id: 'Report-routineCSV', path: '/Report?type=routine&report=CISampleRoutineExport', label: 'Report - Routine CSV' },
  { id: 'Audit-system', path: '/AuditTrailReport?type=system', label: 'Audit - System Events' },
  { id: 'Audit-order', path: '/AuditTrailReport?type=order', label: 'Audit - Order Events' },
  { id: 'TATReport', path: '/TATReport', label: 'Turn Around Time' },
  { id: 'LaporanHasil', path: '/LaporanHasil', label: 'Compliance Report' },
  { id: 'VectorSurveillanceReport', path: '/VectorSurveillanceReport', label: 'Vector Surveillance Report' },
  { id: 'Aliquot', path: '/Aliquot', label: 'Aliquot' },
  { id: 'NotebookDashboard', path: '/NotebookDashboard', label: 'NoteBook' },
  { id: 'inventory', path: '/inventory', label: 'Inventory Management' },
];

const ERROR_MARKERS = [
  'Whitelabel Error Page',
  'HTTP Status 500',
  'HTTP Status 404',
  'java.lang.',
  'org.springframework.',
  'Internal Server Error',
];

test.describe('TC-APP-CENSUS — every working route renders', () => {
  for (const route of ROUTES) {
    test(`TC-APPCENSUS-${route.id}: ${route.label} renders`, async ({ page }) => {
      const pageErrors: string[] = [];
      const serverErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('response', (r) => {
        if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
      });

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // These surfaces fetch working data on mount, so they settle slower than the admin ones.
      await page.waitForTimeout(2500);

      const url = page.url();
      expect(url, `${route.label} bounced to a login page — read the session-guard summary`)
        .not.toMatch(/login/i);

      const chrome = await page
        .locator('h1, h2, h3, .cds--data-table, table, form, .cds--side-nav, .cds--tile')
        .count();
      expect(chrome, `${route.label} painted no heading, table, form, tile or side-nav`)
        .toBeGreaterThan(0);

      const text = (await page.locator('body').innerText().catch(() => '')) ?? '';
      for (const marker of ERROR_MARKERS) {
        expect(text, `${route.label} shows "${marker}"`).not.toContain(marker);
      }

      expect(pageErrors, `${route.label} raised uncaught page errors`).toEqual([]);
      expect(serverErrors, `${route.label} triggered 5xx responses`).toEqual([]);

      const rows = await page.locator('.cds--data-table tbody tr, table tbody tr').count();
      console.log(`census ${route.id} :: chrome=${chrome} rows=${rows} path=${new URL(url).pathname}`);
    });
  }
});
