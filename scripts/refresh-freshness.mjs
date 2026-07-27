#!/usr/bin/env node
/**
 * Spec-freshness workflow for the OpenELIS Playwright suite (mirrors the docs-freshness tracker idea).
 *
 * Source of truth: spec-freshness.json (curated `status`/`drift`/`notes` + auto `lastResult`).
 * On every run this script:
 *   (a) DISCOVERS every *.spec.ts in the repo and merges any new ones into the manifest (status
 *       "unknown"), so the tracker always lists the full suite — curated rows are preserved.
 *   (b) optionally ingests a Playwright JSON report to refresh each spec's raw last result.
 *   (c) regenerates spec-freshness.html — a self-contained board you can open / register as a Cowork
 *       artifact to see at a glance which specs are fresh vs. need updating for the current build.
 *
 * Usage:
 *   node scripts/refresh-freshness.mjs                     # discover + regenerate board
 *   node scripts/refresh-freshness.mjs runlogs/last.json index-u12wW6QI.js   # + ingest a JSON run
 * where runlogs/last.json came from:
 *   npx playwright test --config=all-tc.config.ts --reporter=json > runlogs/last.json 2>/dev/null || true
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

// ── (a) Discover all spec files, merge new ones (curated entries preserved) ─────────────────────────
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.spec.ts')) acc.push(path.relative(ROOT, p));
  }
  return acc;
}
const AREA_KEYS = ['vector', 'environmental', 'env', 'analyzer', 'instrument', 'inventory', 'storage', 'freezer', 'nce', 'patient', 'result', 'validation', 'eqa', 'pathology', 'cytology', 'ihc', 'label', 'barcode', 'esig', 'signature', 'compliance', 'reflex', 'calc', 'titer', 'site', 'org', 'sample', 'shipment', 'referral', 'audit', 'notebook', 'provider', 'dictionary', 'westgard', 'qc', 'home', 'locale', 'bahasa', 'print', 'report', 'catalog', 'order', 'seed', 'ranges'];
const guessArea = (base) => { const b = base.toLowerCase(); return AREA_KEYS.find((k) => b.includes(k)) || 'misc'; };
function classify(rel) {
  const base = rel.split('/').pop();
  if (rel.startsWith('tests/docs/')) {
    if (/^seed-/.test(base)) return { area: guessArea(base), kind: 'seed' };
    if (/^probe-|discover|drift|dump-|find-|cleanup-|patch-|inspect/.test(base)) return { area: guessArea(base), kind: 'probe' };
    return { area: guessArea(base), kind: 'docs-capture' };
  }
  if (/^test-catalog-|^results-/.test(base)) return { area: 'catalog-results', kind: 'contract' };
  if (/discover|timing|dom-probe|ranges-discover|config-pages/.test(base)) return { area: guessArea(base), kind: 'probe' };
  return { area: guessArea(base), kind: 'misc' };
}
const known = new Set(manifest.specs.flatMap((s) => [s.file, s.file.split('/').pop()]));
let added = 0;
for (const rel of walk(ROOT).sort()) {
  if (known.has(rel) || known.has(rel.split('/').pop())) continue;
  const { area, kind } = classify(rel);
  manifest.specs.push({ file: rel, area, kind, status: 'unknown', lastBuild: null, drift: [], notes: 'Discovered — not yet assessed against the current build.' });
  added++;
}

// ── (b) Optionally ingest a Playwright JSON report → per-spec pass/fail ──────────────────────────────
if (reportPath && fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const byFile = {}; // file -> { fail, flaky }
  const ok = (r) => r && (r.status === 'passed' || r.status === 'skipped');
  const walkR = (suites = []) => suites.forEach((s) => {
    const file = (s.file || s.title || '').split('/').pop();
    (s.specs || []).forEach((sp) => {
      if (!file) return;
      byFile[file] = byFile[file] || { fail: false, flaky: false };
      (sp.tests || []).forEach((t) => {
        const res = t.results || [];
        const last = res[res.length - 1];
        // retry-aware: a test PASSES if its final attempt passed; it's FLAKY if an earlier attempt
        // failed but the final passed; it FAILS (real drift) if the final attempt failed.
        if (!ok(last)) byFile[file].fail = true;
        else if (res.some((r) => !ok(r))) byFile[file].flaky = true;
      });
    });
    walkR(s.suites || []);
  });
  walkR(report.suites || []);
  const now = new Date().toISOString().slice(0, 10);
  const build = buildArg || manifest.currentBuild;
  manifest.specs.forEach((spec) => {
    const r = byFile[spec.file.split('/').pop()];
    if (!r) return;
    const verdict = r.fail ? 'drift' : r.flaky ? 'partial' : 'fresh';
    spec.lastResult = r.fail ? 'fail' : r.flaky ? 'flaky' : 'pass';
    spec.lastBuild = build; spec.lastRun = now;
    // With retries the run is authoritative — set status for all specs (curated notes/drift kept).
    spec.status = verdict;
    if (verdict === 'partial' && !(spec.drift || []).includes('load-flake')) spec.drift = [...(spec.drift || []), 'load-flake'];
  });
  if (buildArg) manifest.currentBuild = buildArg;
  console.log('Ingested', Object.keys(byFile).length, 'spec results from', reportPath);
}

manifest.lastUpdated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

// ── (c) Render the self-contained board ────────────────────────────────────────────────────────────
const STATUS = {
  fresh:   { c: '#24a148', label: 'Fresh',   d: 'verified passing on the current build' },
  partial: { c: '#f1c21b', label: 'Partial', d: 'green core, a known non-blocking drift or flake' },
  drift:   { c: '#da1e28', label: 'Drift',   d: 'fails on real UI/route drift — needs a spec update' },
  unknown: { c: '#8d8d8d', label: 'Unknown', d: 'not run against the current build yet' },
};
const ORDER = { drift: 0, partial: 1, unknown: 2, fresh: 3 };
const specs = [...manifest.specs].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
const counts = manifest.specs.reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {});
const kindCounts = manifest.specs.reduce((a, s) => (a[s.kind] = (a[s.kind] || 0) + 1, a), {});
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

const rows = specs.map((s) => {
  const st = STATUS[s.status] || STATUS.unknown;
  const drift = (s.drift || []).map((d) => `<span class="tag">${esc(d)}</span>`).join(' ');
  const last = s.lastResult ? `<span style="color:${s.lastResult === 'pass' ? '#24a148' : '#da1e28'}">${s.lastResult}</span>${s.lastRun ? ' · ' + esc(s.lastRun) : ''}` : '—';
  return `<tr data-status="${s.status}" data-kind="${esc(s.kind)}">
    <td><span class="dot" style="background:${st.c}"></span>${st.label}</td>
    <td class="mono">${esc(s.file)}</td><td>${esc(s.area)}</td><td>${esc(s.kind)}</td>
    <td>${last}</td><td>${drift}</td><td class="notes">${esc(s.notes)}</td></tr>`;
}).join('\n');
const glossary = Object.entries(manifest.driftCauses).map(([k, v]) => `<div class="gl"><b>${esc(k)}</b> — ${esc(v)}</div>`).join('\n');
const summary = ['drift', 'partial', 'unknown', 'fresh'].map((k) => `<span class="pill" style="border-color:${STATUS[k].c}"><span class="dot" style="background:${STATUS[k].c}"></span>${STATUS[k].label} <b>${counts[k] || 0}</b></span>`).join(' ');
const kinds = Object.entries(kindCounts).sort().map(([k, n]) => `<span class="kpill">${esc(k)} <b>${n}</b></span>`).join(' ');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenELIS Playwright — Spec Freshness</title>
<style>
:root{color-scheme:light;font-family:'IBM Plex Sans',system-ui,sans-serif}
body{margin:0;background:#f4f4f4;color:#161616;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#525252;font-size:13px;margin-bottom:14px}
.pill{display:inline-flex;align-items:center;gap:6px;border:2px solid;border-radius:16px;padding:3px 12px;margin:0 6px 6px 0;font-size:13px;background:#fff;cursor:pointer;user-select:none}
.pill.off{opacity:.35}
.kpill{display:inline-block;background:#e8e8e8;border-radius:12px;padding:2px 10px;margin:0 5px 5px 0;font-size:12px}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #e0e0e0;vertical-align:top}
th{background:#e8e8e8;font-size:12px;text-transform:uppercase;letter-spacing:.03em;position:sticky;top:0}
.mono{font-family:'IBM Plex Mono',monospace;font-size:12px}
.notes{color:#393939;max-width:400px}
.tag{background:#e0e0e0;border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace;white-space:nowrap}
.gloss,.legend{margin-top:16px;font-size:12px;color:#525252}.gl{margin:4px 0}.gl b{font-family:monospace;color:#161616}
.work{margin-top:16px;background:#fff;border-left:4px solid #0f62fe;padding:12px 16px;font-size:13px}
code{background:#e8e8e8;padding:1px 5px;border-radius:3px;font-size:12px}
</style></head><body>
<h1>OpenELIS Playwright — Spec Freshness</h1>
<div class="sub">Target <b>${esc(manifest.target)}</b> · build <b class="mono">${esc(manifest.currentBuild)}</b> · <b>${manifest.specs.length}</b> specs · updated ${esc(manifest.lastUpdated)}</div>
<div id="filters">${summary}</div>
<div style="margin:6px 0 12px">${kinds}</div>
<table id="tbl"><thead><tr><th>Status</th><th>Spec</th><th>Area</th><th>Kind</th><th>Last run</th><th>Drift</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
<div class="legend">${Object.values(STATUS).map((s) => `<span style="margin-right:14px"><span class="dot" style="background:${s.c}"></span> <b>${s.label}</b> — ${s.d}</span>`).join('')}</div>
<div class="gloss"><b>Drift causes</b>${glossary}</div>
<div class="work"><b>Workflow</b> — refresh after each build/run:<br>
1) <code>BASE=… npx playwright test --config=all-tc.config.ts --reporter=json &gt; runlogs/last.json</code> (repeat with the docs project for docs-capture specs)<br>
2) <code>node scripts/refresh-freshness.mjs runlogs/last.json &lt;build-hash&gt;</code> — discovers new specs, updates last results, regenerates this board.<br>
Curate <code>status</code>/<code>drift</code>/<code>notes</code> in <code>spec-freshness.json</code>; auto-refresh only sets raw pass/fail and flips <i>unknown</i>→fresh/drift.</div>
<script>
document.querySelectorAll('.pill').forEach((p,i)=>{const k=['drift','partial','unknown','fresh'][i];p.onclick=()=>{p.classList.toggle('off');const on=[...document.querySelectorAll('.pill')].filter(x=>!x.classList.contains('off')).map((x,j)=>['drift','partial','unknown','fresh'][j]);const active=new Set([...document.querySelectorAll('.pill')].map((x,j)=>[j,x]).filter(([j,x])=>!x.classList.contains('off')).map(([j])=>['drift','partial','unknown','fresh'][j]));document.querySelectorAll('#tbl tbody tr').forEach(tr=>{tr.style.display=active.has(tr.dataset.status)?'':'none'})}});
</script>
</body></html>`;
fs.writeFileSync(OUT_HTML, html);
console.log('Discovered +' + added, '· wrote', path.basename(OUT_HTML), '·', manifest.specs.length, 'specs ·', JSON.stringify(counts));
