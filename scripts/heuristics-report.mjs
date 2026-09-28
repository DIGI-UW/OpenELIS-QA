#!/usr/bin/env node
/**
 * Roll up the UX heuristic results (helpers/ux-heuristics.ts) written under
 * test-results (any depth) under heuristics/ into heuristics-report.md for review.
 *
 * usage: node scripts/heuristics-report.mjs [results-dir] [out.md]
 *
 * The report lists every fail and warn, grouped by heuristic, with the page and the reason,
 * followed by a per-heuristic tally. Each line has a blank "Verdict ok?" column for the reviewer:
 * mark it "no" with a note and the rule gets tuned (references/ux-heuristics.md).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || 'test-results';
const out = process.argv[3] || 'heuristics-report.md';
const NAMES = {
  H1: 'Form resets or moves on after Save', H2: 'Page opens at the top', H3: 'Feedback appears where the user is looking',
  H4: 'Disabled primary action says why', H5: 'No false "unsaved changes"', H6: 'Reload keeps the page usable',
  H7: 'One date format, the site format', H8: 'No horizontal scroll (laptop, tablet)', H9: 'No raw keys, enums or [object Object]',
  H10: 'Primary action reachable by keyboard', H11: 'Dropdown values are not cut off',
};

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/[\\/]heuristics[\\/][^\\/]+\.json$/.test(p)) acc.push(p);
  }
  return acc;
}

// Casey's rulings: findings marked deferred are listed separately, not as open work.
let deferred = [], falseAlarm = [];
try {
  const dec = JSON.parse(readFileSync(new URL('../references/heuristics-decisions.json', import.meta.url), 'utf8'));
  deferred = dec.deferred || []; falseAlarm = dec.falseAlarm || [];
} catch { /* no decisions file */ }
const match = list => r => list.find(d => d.id === r.id && d.page === r.page && (!d.detail || new RegExp(d.detail).test(r.detail)));
const isDeferred = match(deferred);
const isFalseAlarm = match(falseAlarm);

const rows = [];
let ruledOut = 0;
for (const f of walk(root)) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of j.results || []) {
    if (r.verdict !== 'pass' && isFalseAlarm(r)) { ruledOut++; continue; }
    rows.push({ ...r, test: j.test });
  }
}
if (!rows.length) { console.error(`no heuristic results under ${root}`); process.exit(1); }


const tally = {};
for (const r of rows) {
  tally[r.id] ??= { pass: 0, warn: 0, fail: 0 };
  tally[r.id][r.verdict]++;
}
const ids = Object.keys(NAMES).filter(id => tally[id]);
let md = `# UX heuristic pass\n\nGenerated ${new Date().toISOString().slice(0, 16)}Z from ${rows.length} checks${ruledOut ? ` (${ruledOut} more left out: ruled false alarms in references/heuristics-decisions.json)` : ''}.\n\n`;
md += '| Heuristic | Pass | Warn | Fail |\n|---|---|---|---|\n';
for (const id of ids) md += `| ${id} ${NAMES[id]} | ${tally[id].pass} | ${tally[id].warn} | ${tally[id].fail} |\n`;
for (const id of ids) {
  const bad = rows.filter(r => r.id === id && r.verdict !== 'pass' && !isDeferred(r));
  if (!bad.length) continue;
  md += `\n## ${id} ${NAMES[id]}\n\n| Verdict | Page | Step | Reason | Verdict ok? |\n|---|---|---|---|---|\n`;
  for (const r of bad.sort((a, b) => (a.verdict === b.verdict ? a.page.localeCompare(b.page) : a.verdict === 'fail' ? -1 : 1))) {
    md += `| ${r.verdict} | \`${r.page}\` | ${r.step || ''} | ${String(r.detail).replace(/\|/g, '/')} | |\n`;
  }
}
const later = rows.filter(r => r.verdict !== 'pass' && isDeferred(r));
if (later.length) {
  md += `\n## Deferred by Casey (references/heuristics-decisions.json)\n\n| Heuristic | Verdict | Page | Reason | Note |\n|---|---|---|---|---|\n`;
  for (const r of later) md += `| ${r.id} | ${r.verdict} | \`${r.page}\` | ${String(r.detail).replace(/\|/g, '/')} | ${isDeferred(r).note} |\n`;
}
writeFileSync(out, md);
console.log(`${out}: ${rows.length} checks, ${rows.filter(r => r.verdict === 'fail').length} fail, ${rows.filter(r => r.verdict === 'warn').length} warn`);
