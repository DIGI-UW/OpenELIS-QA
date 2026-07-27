#!/usr/bin/env node
/**
 * Fold the deep cross-module CHAIN suite (tests/chains/, lives on origin/main) into the freshness
 * manifest. The local working folder is a feature-branch snapshot that does NOT contain tests/chains/,
 * so spec-discovery never saw them and the coverage map under-reported several workflows (Compliance,
 * Batch entry, Workplan, Audit trail, EQA, …) that in fact have deep chain coverage on main.
 *
 * These are recorded with kind:'chain', depth:'deep' (depthLock so the behaviour-classifier leaves
 * them alone — their source isn't in this tree), status:'unknown' (present on main; not run THIS
 * cycle — freshness genuinely unknown here), branch:'main', and their SILNAS/vector/env target.
 *
 * Usage: node scripts/fold-chains.mjs   (idempotent — updates in place, no dupes)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'spec-freshness.json');

const IDEMO = 'indonesiademo'; // SILNAS + vector/env surfaces
// [file-stem, area, target, one-line note]
const CHAINS = [
  ['chain-a-order-lifecycle', 'order', 'testing', 'Clinical order create→receive→result→validate→report round-trip'],
  ['chain-ab-env-holding-time', 'environmental', IDEMO, 'Env holding-time exceedance flag through the sample lifecycle'],
  ['chain-b-rejection', 'validation', 'testing', 'Sample rejection lifecycle (reject reason → status → downstream block)'],
  ['chain-c-reflex-trigger', 'reflex', 'testing', 'Reflex rule fires on a qualifying result and spawns the reflex test'],
  ['chain-d-calculated-value', 'calc', 'testing', 'Calculated-value engine: inputs → derived output test on save'],
  ['chain-e-sample-validation-lifecycle', 'validation', 'testing', 'Result entry → validation → release state machine'],
  ['chain-f-eqa-distribution', 'eqa', 'testing', 'EQA distribution → panel → result submission round-trip'],
  ['chain-g-cold-chain-excursion', 'storage', IDEMO, 'Cold-chain excursion recorded against a stored sample item'],
  ['chain-h-permission-enforcement', 'security', 'testing', 'Role/permission enforcement across protected routes+actions'],
  ['chain-i-site-branding-to-report', 'report', 'testing', 'Site branding config propagates onto a generated report'],
  ['chain-j-audit-trail-coverage', 'audit', 'testing', 'Audit-trail records mutations across modules (coverage sweep)'],
  ['chain-k-fhir-round-trip', 'fhir', 'testing', 'FHIR export/import round-trip of an order + result'],
  ['chain-l-lab-number-uniqueness', 'order', 'testing', 'Lab-number uniqueness/collision handling across concurrent orders'],
  ['chain-m-vector-surveillance', 'vector', IDEMO, 'Vector surveillance: trap→species ID→result→dashboard'],
  ['chain-n-environmental-sampling', 'environmental', IDEMO, 'Environmental sampling order→result→compliance evaluation'],
  ['chain-o-referral-roundtrip', 'referral', 'testing', 'Referral out→reference-lab result→acceptance round-trip'],
  ['chain-p-patient-merge', 'patient', 'testing', 'Patient merge consolidates orders/results without loss'],
  ['chain-q-batch-order-entry', 'batch', 'testing', 'Batch order entry creates N orders in one submission'],
  ['chain-r-sample-shipment', 'referral', 'testing', 'Sample shipment manifest → dispatch → receipt'],
  ['chain-s-aliquot-lineage', 'storage', 'testing', 'Aliquot lineage: parent→child sample linkage & tracking'],
  ['chain-t-workplan-worklist', 'workplan', 'testing', 'Workplan build → worklist → result entry cross-link'],
  ['chain-u-print-barcode', 'barcode', 'testing', 'Barcode label generation & print payload for a sample'],
  ['chain-w-pathology-case', 'pathology', 'testing', 'Pathology case lifecycle (accession→report)'],
  ['chain-x-electronic-orders', 'eorder', 'testing', 'Inbound electronic order (eOrder) → sample creation'],
  ['chain-y-compliance-reporting', 'compliance', IDEMO, 'SILNAS compliance dashboard + report; carries OGC-1059 regression watch (complianceReport 500)'],
  ['chain-z-compliance-standards-admin', 'compliance', IDEMO, 'Compliance standards admin CRUD + activation round-trip'],
];

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const byFile = new Map(m.specs.map((s) => [s.file, s]));
let added = 0, updated = 0;
for (const [stem, area, target, note] of CHAINS) {
  const file = `tests/chains/${stem}.spec.ts`;
  const rec = {
    file, kind: 'chain', depth: 'deep', depthLock: true, area, target, branch: 'main',
    status: 'unknown', lastResult: 'not-run-this-cycle',
    drift: target === IDEMO ? ['silnas-target'] : [],
    notes: note,
  };
  if (byFile.has(file)) { Object.assign(byFile.get(file), rec); updated++; }
  else { m.specs.push(rec); added++; }
}
m.specs.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
const c = {}; m.specs.forEach((s) => (c[s.status] = (c[s.status] || 0) + 1));
console.log(`chains: +${added} added, ${updated} updated · manifest now ${m.specs.length} specs · status ${JSON.stringify(c)}`);
