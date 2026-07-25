#!/usr/bin/env node
/**
 * Spec-freshness workflow for the OpenELIS Playwright suite (mirrors the docs-freshness tracker idea).
 *
 * Source of truth: spec-freshness.json (curated `status`/`drift`/`notes` + auto `lastResult`).
 * This script (a) optionally ingests a Playwright JSON report to refresh each spec's raw last result,
 * then (b) regenerates spec-freshness.html — a self-contained board you can open / register as a
 * Cowork artifact to see at a glance which specs are fresh vs. need updating for the current build.
 *
 * Usage:
 *   # Regenerate the board from the current manifest:
 *   node scripts/refresh-freshness.mjs
 *
 *   # Run the suite, capture JSON, and refresh statuses + board in one go:
 *   BASE=https://testing.openelis-global.org \
 *     npx playwright test --config=all-tc.config.ts --reporter=json > runlogs/last.json 2>/dev/null || true
 *   node scripts/refresh-freshness.mjs runlogs/last.json index-u12wW6QI.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'spec-freshness.json');
const OUT_HTML = path.join(ROOT, 'spec-freshness.html');

const reportPath = process.argv[2];
const buildArg = process.argv[3];

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// ── (a) Optionally ingest a Playwright JSON report → per-spec pass/fail ────────────────────────────
if (reportPath && fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const byFile = {}; // file -> {pass, fail}
  const walk = (suites = []) => suites.forEach((s) => {
    const file = (s.file || s.title || '').split('/').pop();
    (s.specs || []).forEach((sp) => {
      const ok = (sp.tests || []).every((t) => (t.results || []).every((r) => r.status === 'passed' || r.status === 'skipped'));
      if (file) { byFile[file] = byFile[file] || { pass: 0, fail: 0 }; ok ? byFile[file].pass++ : byFile[file].fail++; }
    });
    walk(s.suites || []);
  });
  walk(report.suites || []);
  const now = new Date().toISOString().slice(0, 10);
  const build = buildArg || manifest.currentBuild;
  manifest.specs.forEach((spec) => {
    const r = byFile[spec.file];
    if (!r) return;
    spec.lastResult = r.fail === 0 ? 'pass' : 'fail';
    spec.lastBuild = build;
    spec.lastRun = now;
    if (spec.status === 'unknown') spec.status = r.fail === 0 ? 'fresh' : 'drift';
  });
  if (buildArg) manifest.currentBuild = buildArg;
  manifest.lastUpdated = now;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Updated', Object.keys(byFile).length, 'spec results from', reportPath);
}

// ── (b) Render the self-contained board ────────────────────────────────────────────────────────────
const STATUS = {
  fresh:   { c: '#24a148', label: 'Fresh',   d: 'verified passing on the current build' },
  partial: { c: '#f1c21b', label: 'Partial', d: 'green core, a known non-blocking drift or flake' },
  drift:   { c: '#da1e28', label: 'Drift',   d: 'fails on real UI/route drift — needs a spec update' },
  unknown: { c: '#8d8d8d', label: 'Unknown', d: 'not run against the current build yet' },
};
const counts = manifest.specs.reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {});
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

const rows = manifest.specs.map((s) => {
  const st = STATUS[s.status] || STATUS.unknown;
  const drift = (s.drift || []).map((d) => `<span class="tag">${esc(d)}</span>`).join(' ');
  const last = s.lastResult ? `<span style="color:${s.lastResult === 'pass' ? '#24a148' : '#da1e28'}">${s.lastResult}</span>${s.lastRun ? ' · ' + esc(s.lastRun) : ''}` : '—';
  return `<tr>
    <td><span class="dot" style="background:${st.c}"></span>${st.label}</td>
    <td class="mono">${esc(s.file)}</td>
    <td>${esc(s.area)}</td><td>${esc(s.kind)}</td>
    <td>${last}</td>
    <td>${drift}</td>
    <td class="notes">${esc(s.notes)}</td>
  </tr>`;
}).join('\n');

const glossary = Object.entries(manifest.driftCauses).map(([k, v]) => `<div class="gl"><b>${esc(k)}</b> — ${esc(v)}</div>`).join('\n');
const summary = ['fresh', 'partial', 'drift', 'unknown'].map((k) => `<span class="pill" style="border-color:${STATUS[k].c}"><span class="dot" style="background:${STATUS[k].c}"></span>${STATUS[k].label} <b>${counts[k] || 0}</b></span>`).join(' ');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenELIS Playwright — Spec Freshness</title>
<style>
:root{font-family:'IBM Plex Sans',system-ui,sans-serif}
body{margin:0;background:#f4f4f4;color:#161616;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#525252;font-size:13px;margin-bottom:16px}
.pill{display:inline-flex;align-items:center;gap:6px;border:2px solid;border-radius:16px;padding:3px 12px;margin-right:6px;font-size:13px;background:#fff}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e0e0e0;vertical-align:top}
th{background:#e8e8e8;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
.mono{font-family:'IBM Plex Mono',monospace;font-size:12px}
.notes{color:#393939;max-width:420px}
.tag{background:#e0e0e0;border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace;white-space:nowrap}
.legend,.gloss{margin-top:18px;font-size:12px;color:#525252}
.gl{margin:4px 0}.gl b{font-family:monospace;color:#161616}
.work{margin-top:18px;background:#fff;border-left:4px solid #0f62fe;padding:12px 16px;font-size:13px}
code{background:#e8e8e8;padding:1px 5px;border-radius:3px;font-size:12px}
</style></head><body>
<h1>OpenELIS Playwright — Spec Freshness</h1>
<div class="sub">Target <b>${esc(manifest.target)}</b> · build <b class="mono">${esc(manifest.currentBuild)}</b> · updated ${esc(manifest.lastUpdated)}</div>
<div>${summary}</div>
<table><thead><tr><th>Status</th><th>Spec</th><th>Area</th><th>Kind</th><th>Last run</th><th>Drift causes</th><th>Notes</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="legend">${Object.values(STATUS).map((s) => `<span style="margin-right:14px"><span class="dot" style="background:${s.c}"></span> <b>${s.label}</b> — ${s.d}</span>`).join('')}</div>
<div class="gloss"><b>Drift causes</b>${glossary}</div>
<div class="work"><b>Workflow</b> — refresh after each build/run:<br>
1) <code>BASE=… npx playwright test --config=all-tc.config.ts --reporter=json &gt; runlogs/last.json</code><br>
2) <code>node scripts/refresh-freshness.mjs runlogs/last.json &lt;build-hash&gt;</code> — updates each spec's last result + regenerates this board.<br>
Curate <code>status</code>/<code>drift</code>/<code>notes</code> by hand in <code>spec-freshness.json</code> (auto-refresh only sets the raw pass/fail + flips <i>unknown</i>→fresh/drift).</div>
</body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log('Wrote', OUT_HTML, '·', manifest.specs.length, 'specs ·', JSON.stringify(counts));
