#!/usr/bin/env node
/**
 * Workflow-coverage map for OpenELIS. Rolls the per-spec freshness manifest up to the level of
 * USER WORKFLOWS and shows, per workflow, the test DEPTH covering it: deep (E2E / round-trip / chain),
 * shallow (contract / REST / single-surface assertion), smoke (render/capture/probe), or NONE.
 * Also surfaces canonical workflows that have no spec at all. Reads spec-freshness.json; writes
 * workflow-coverage.json + workflow-coverage.html (self-contained board / Cowork artifact).
 *
 * Usage: node scripts/workflow-coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec-freshness.json'), 'utf8'));

// kind → depth tier
const DEPTH = {
  'deep-roundtrip': 'deep', 'guard-e2e': 'deep', 'runtime-e2e': 'deep', 'e2e': 'deep', 'chain': 'deep',
  'contract': 'shallow', 'runtime': 'shallow', 'guard': 'shallow',
  'docs-capture': 'smoke', 'probe': 'smoke', 'misc': 'smoke', 'seed': 'smoke',
};

// First-match rules map a spec (basename + area) to a workflow.
const RULES = [
  [/\bbatch\b|batch-order/, 'Batch entry'],
  [/\bfhir\b/, 'FHIR interoperability'],
  [/permission|\bsecurity\b|\bxss\b|csrf|sqli/, 'Security & permissions'],
  [/vector/, 'Order entry — Vector'],
  [/\benv\b|environmental/, 'Order entry — Environmental'],
  [/clinical-flow|samplepatiententry|order-entry|legacy-clinical|patient-order|order-446|add-order|order-lifecycle|lab-number|electronic-order|\beorder\b/, 'Order entry — Clinical'],
  [/results-unified-worklist|results-entry|multicomponent|titer/, 'Results entry'],
  [/critical-indicator/, 'Result flags (critical/abnormal)'],
  [/result-validation|validation/, 'Result validation & release'],
  [/compliance/, 'Compliance reporting'],   // before /nce/ — compliance specs carry area=nce but are their own workflow
  [/report|laporan/, 'Reporting'],
  [/mn-sampletypes/, 'Test Catalog — sample-type m:n'],
  [/result-types/, 'Test Catalog — result types'],
  [/activation/, 'Test Catalog — activation gate'],
  [/reflex/, 'Reflex tests'],
  [/calc/, 'Calculated values'],
  [/test-catalog|catalog|editor|sections|modals/, 'Test Catalog — editor'],
  [/add-patient|patient/, 'Patient management'],
  [/provider|organization|\borg\b/, 'Provider & Organization admin'],
  [/analyzer|instrument|westgard|\bqc\b/, 'Analyzers & QC'],
  [/storage|freezer|inventory/, 'Storage & Inventory'],
  [/eqa/, 'EQA'],
  [/nce|capa|conform/, 'Non-conformance / CAPA'],
  [/shipment|referral|referred|acceptance/, 'Referrals, shipment & sample acceptance'],
  [/workplan/, 'Workplan'],
  [/barcode|label/, 'Labels & Barcode'],
  [/pathology/, 'Pathology'],
  [/cytology/, 'Cytology'],
  [/ihc|immunohis/, 'Immunohistochemistry'],
  [/esig|signature/, 'Electronic signatures'],
  [/study/, 'Study management'],
  [/locale|bahasa/, 'Localization (i18n)'],
  [/audit/, 'Audit trail'],
  [/notebook/, 'Electronic lab notebook'],
  [/dictionary|user-dict/, 'Dictionary & config admin'],
  [/config-pages|site-band|home|hero/, 'Dashboard / site config'],
  [/device-fields/, 'Analyzers & QC'],
  [/min-stock/, 'Storage & Inventory'],
  [/discover|timing|dom-probe|ranges-discover|drift|dump|find-|cleanup|patch-|explore|handoff|ht-final|seed-cases|seed-orders/, 'Exploration / tooling'],
];

// Canonical workflows that SHOULD exist — any with no spec show as uncovered.
const CANONICAL = [
  ...new Set(RULES.map((r) => r[1])),
  'Batch entry', 'Alerts & notifications', 'Accessibility (WCAG)',
];

function workflowOf(spec) {
  const hay = (spec.file.split('/').pop() + ' ' + (spec.area || '')).toLowerCase();
  for (const [re, wf] of RULES) if (re.test(hay)) return wf;
  return 'Unmapped';
}

// Build workflow → { deep/shallow/smoke spec lists, status counts }
const wf = {};
for (const name of CANONICAL) wf[name] = { deep: [], shallow: [], smoke: [], status: { fresh: 0, partial: 0, drift: 0, unknown: 0 } };
for (const s of manifest.specs) {
  const name = workflowOf(s);
  wf[name] = wf[name] || { deep: [], shallow: [], smoke: [], status: { fresh: 0, partial: 0, drift: 0, unknown: 0 } };
  const tier = s.depth || DEPTH[s.kind] || 'smoke';   // prefer behaviour-classified depth (scripts/classify-depth.mjs)
  wf[name][tier].push(s.file.split('/').pop());
  wf[name].status[s.status] = (wf[name].status[s.status] || 0) + 1;
}

// Coverage verdict per workflow: deepest tier present.
const tierOf = (w) => (w.deep.length ? 'deep' : w.shallow.length ? 'shallow' : w.smoke.length ? 'smoke' : 'none');
const rows = Object.entries(wf).sort((a, b) => {
  const rank = { none: 0, smoke: 1, shallow: 2, deep: 3 };
  return rank[tierOf(a[1])] - rank[tierOf(b[1])] || a[0].localeCompare(b[0]);
});

const coverage = { target: manifest.target, build: manifest.currentBuild, generated: new Date().toISOString().slice(0, 10), workflows: {} };
rows.forEach(([name, w]) => { coverage.workflows[name] = { coverage: tierOf(w), deep: w.deep.length, shallow: w.shallow.length, smoke: w.smoke.length, status: w.status }; });
fs.writeFileSync(path.join(ROOT, 'workflow-coverage.json'), JSON.stringify(coverage, null, 2) + '\n');

// ── Render ──
const TIER = { deep: { c: '#0043ce', label: 'Deep' }, shallow: { c: '#4589ff', label: 'Shallow' }, smoke: { c: '#8a3ffc', label: 'Smoke' }, none: { c: '#da1e28', label: 'None' } };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const cell = (n, on) => `<td class="c" style="${n ? 'background:' + on + '22;font-weight:600' : 'color:#c6c6c6'}">${n || '·'}</td>`;
const statusChip = (st) => ['drift', 'partial', 'unknown', 'fresh'].filter((k) => st[k]).map((k) => `<span class="s ${k}">${st[k]} ${k[0]}</span>`).join(' ');
const covCounts = rows.reduce((a, [, w]) => (a[tierOf(w)] = (a[tierOf(w)] || 0) + 1, a), {});

const body = rows.map(([name, w]) => {
  const t = tierOf(w);
  return `<tr><td><span class="dot" style="background:${TIER[t].c}"></span>${esc(name)}</td>
    <td class="cov" style="color:${TIER[t].c}">${TIER[t].label}</td>
    ${cell(w.deep.length, TIER.deep.c)}${cell(w.shallow.length, TIER.shallow.c)}${cell(w.smoke.length, TIER.smoke.c)}
    <td>${statusChip(w.status)}</td></tr>`;
}).join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenELIS — Workflow Coverage</title><style>
:root{color-scheme:light;font-family:'IBM Plex Sans',system-ui,sans-serif}
body{margin:0;background:#f4f4f4;color:#161616;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#525252;font-size:13px;margin-bottom:14px}
.pill{display:inline-flex;align-items:center;gap:6px;border:2px solid;border-radius:16px;padding:3px 12px;margin:0 6px 8px 0;font-size:13px;background:#fff}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #e0e0e0}
th{background:#e8e8e8;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
td.c,th.c{text-align:center;width:64px}.cov{font-weight:600}
.s{font-size:10px;padding:1px 5px;border-radius:8px;margin-right:2px;white-space:nowrap}
.s.fresh{background:#defbe6;color:#0e6027}.s.partial{background:#fcf4d6;color:#684e00}.s.drift{background:#fff1f1;color:#a2191f}.s.unknown{background:#e8e8e8;color:#525252}
.legend{margin-top:14px;font-size:12px;color:#525252}
</style></head><body>
<h1>OpenELIS — Workflow Coverage</h1>
<div class="sub">Target <b>${esc(manifest.target)}</b> · build <b>${esc(manifest.currentBuild)}</b> · ${rows.length} workflows · generated ${esc(coverage.generated)}</div>
<div>${['deep', 'shallow', 'smoke', 'none'].map((k) => `<span class="pill" style="border-color:${TIER[k].c}"><span class="dot" style="background:${TIER[k].c}"></span>${TIER[k].label} <b>${covCounts[k] || 0}</b></span>`).join('')}</div>
<table><thead><tr><th>Workflow</th><th>Coverage</th><th class="c">Deep</th><th class="c">Shallow</th><th class="c">Smoke</th><th>Spec status</th></tr></thead><tbody>${body}</tbody></table>
<div class="legend"><b>Depth</b>: Deep = E2E / round-trip / chain · Shallow = contract / REST / single-surface assertion · Smoke = render / capture / probe · None = no spec covers this workflow.
Spec status counts (fresh/partial/drift/unknown) come from the freshness board. Rows sorted weakest-coverage first.</div>
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'workflow-coverage.html'), html);
console.log('workflows:', rows.length, '· coverage:', JSON.stringify(covCounts));
