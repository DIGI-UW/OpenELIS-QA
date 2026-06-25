// Author/refresh the per-capability docs-capture specs from a single route map.
// Each capability lists the real SPA routes (verified against the live nav) and the labeled
// screenshots to take. Re-run any time to regenerate: `node scripts/author-doc-specs.mjs`.
//
// Route map is the source of truth for "which screen documents which capability". Keep it here.
import fs from 'fs';
import path from 'path';

const dir = 'tests/docs';
fs.mkdirSync(dir, { recursive: true });

// pii: extra selectors to mask (DEFAULT_PII is always applied). crop: screenshot just the main panel.
const SPECS = [
  { id: 'results-entry', name: 'Results entry', pii: ['td:has-text("0123456")'], steps: [
    { route: '/GenericSample/Results', label: 'Enter results — search' },
    { route: '/LogbookResults?type=', label: 'Results by unit' },
    { route: '/PatientResults', label: 'Results by patient' },
    { route: '/AccessionResults', label: 'Results by order' },
  ]},
  { id: 'result-validation', name: 'Result validation', steps: [
    { route: '/ResultValidation?type=&test=', label: 'Validation — routine' },
    { route: '/AccessionValidation', label: 'Validation by order' },
    { route: '/ResultValidationByTestDate', label: 'Validation by date' },
  ]},
  { id: 'order-entry', name: 'Order & sample entry', steps: [
    { route: '/SamplePatientEntry', label: 'Add order — patient & sample entry' },
    { route: '/order', label: 'Order workflow dashboard' },
    { route: '/order/enter', label: 'Order workflow — enter order' },
  ]},
  { id: 'patient-order-enhancements', name: 'Patient & order enhancements', steps: [
    { route: '/PatientManagement', label: 'Add / edit patient' },
    { route: '/PatientHistory', label: 'Patient history' },
  ]},
  { id: 'barcode-labels', name: 'Barcode label management', steps: [
    { route: '/PrintBarcode', label: 'Print barcode labels' },
  ]},
  { id: 'electronic-lab-notebook', name: 'Electronic lab notebook', steps: [
    { route: '/NotebookDashboard', label: 'Lab notebook dashboard' },
  ]},
  { id: 'electronic-signatures', name: 'Electronic signatures', steps: [
    { route: '/ResultValidation?type=&test=', label: 'Sign-off during validation' },
    { route: '/AccessionValidation', label: 'Validation by order (sign-off)' },
  ]},
  { id: 'sample-shipment-referral', name: 'Sample shipment & referral', steps: [
    { route: '/SampleShipment', label: 'Sample shipment' },
    { route: '/ReferredOutTests', label: 'Referred-out tests' },
  ]},
  { id: 'sample-storage-management', name: 'Sample storage management', steps: [
    { route: '/Storage/sample-items', label: 'Stored sample items' },
    { route: '/Storage/rooms', label: 'Storage hierarchy — rooms' },
    { route: '/FreezerMonitoring?tab=0', label: 'Freezer monitoring dashboard' },
  ]},
  { id: 'analyzer-framework', name: 'Analyzer integration framework', steps: [
    { route: '/analyzers', label: 'Analyzers list' },
    { route: '/analyzers/types', label: 'Analyzer types' },
    { route: '/analyzers/errors', label: 'Analyzer error dashboard' },
  ]},
  { id: 'analyzer-file-import', name: 'Analyzer file import', steps: [
    { route: '/analyzers', label: 'Analyzers list' },
    { route: '/GenericSample/Import', label: 'Import samples / results' },
  ]},
  { id: 'westgard-qc', name: 'Westgard QC rules & dashboard', steps: [
    { route: '/analyzers/qc/db', label: 'QC dashboard' },
    { route: '/analyzers/qc/rule-config', label: 'Westgard rule configuration' },
    { route: '/analyzers/qc/control-lots', label: 'QC control lots' },
  ]},
  { id: 'nce-capa', name: 'Non-conforming events (NCE) & CAPA', steps: [
    { route: '/NceDashboard', label: 'All non-conforming events' },
    { route: '/ReportNonConformingEvent', label: 'Report a non-conforming event' },
    { route: '/NCECorrectiveAction', label: 'Corrective actions' },
  ]},
  { id: 'eqa', name: 'EQA / proficiency testing', steps: [
    { route: '/EQAManagement', label: 'EQA programs' },
    { route: '/EQAParticipants', label: 'EQA participants' },
    { route: '/EQAResults', label: 'EQA results & analysis' },
  ]},
  { id: 'organizations-management', name: 'Organizations management', steps: [
    { route: '/MasterListsPage', label: 'Administration — master lists' },
  ]},
];

const body = (s) => {
  const piiArr = (s.pii && s.pii.length) ? `\n  const pii = ${JSON.stringify(s.pii)};` : '';
  const piiArg = (s.pii && s.pii.length) ? ', { maskPii: [...DEFAULT_PII, ...pii] }' : '';
  const steps = s.steps.map(st =>
    `  if (await go(page, '${st.route}')) await shot(page, info, ${JSON.stringify(st.label)}${piiArg});`
  ).join('\n');
  return `// Docs-capture flow for capability \`${s.id}\` — ${s.name}.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/${s.id}.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — ${s.name} walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: '${s.id}' });${piiArr}

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

${steps}

  await saveWalkthrough(page, info);
});
`;
};

let n = 0;
for (const s of SPECS) {
  fs.writeFileSync(path.join(dir, `${s.id}.docs.spec.ts`), body(s));
  n++;
}
console.log(`Authored ${n} spec(s) into ${dir}.`);
