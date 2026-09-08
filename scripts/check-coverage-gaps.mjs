#!/usr/bin/env node
/**
 * Coverage report: every catalogue vs the code.
 *
 * "Are we missing QA checks?" is a question about the CATALOGUE against the
 * CODE. It cannot be answered by running more tests — a test that exists says
 * nothing about one that does not. The retired gap-suites tried and could not.
 *
 * Two corrections are baked in, both from getting this wrong:
 *   - It reads EVERY catalogue in catalogues.json, not just master-test-cases.md.
 *     The per-feature suites (analyzer guided setup, label presets, test catalog
 *     management, edit-order RBAC) are catalogues too, and reading only master
 *     reported their tested cases as gaps.
 *   - It uses the shared ID grammar in catalogue-ids.mjs, which handles
 *     multi-segment IDs. The first version's regex dropped 575 of master's 1504
 *     case headings without saying so.
 *
 * Report-only by default; --strict fails when the unimplemented count grows
 * past .coverage-gaps-baseline.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { declaredIn, testIdsIn } from './catalogue-ids.mjs';

const BASELINE = '.coverage-gaps-baseline.json';
const strict = process.argv.includes('--strict');
const update = process.argv.includes('--update');
const json = process.argv.includes('--json');

const idx = JSON.parse(readFileSync('catalogues.json', 'utf8'));

// --- catalogued: id -> { title, catalogue }
const catalogued = new Map();
const perCatalogue = [];
for (const c of idx.catalogues) {
  const h = declaredIn(readFileSync(c.file, 'utf8'));
  perCatalogue.push({ ...c, declared: h.size, ids: [...h.keys()] });
  for (const [id, title] of h)
    if (!catalogued.has(id)) catalogued.set(id, { title, catalogue: c.file, area: c.area });
}

// --- implemented
const specs = execSync("git ls-files '*.spec.ts'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('archive/'));
const implemented = new Map();
for (const f of specs)
  for (const id of testIdsIn(readFileSync(f, 'utf8'))) {
    if (!implemented.has(id)) implemented.set(id, []);
    implemented.get(id).push(f);
  }

const missing = [...catalogued.keys()].filter((id) => !implemented.has(id));
const uncatalogued = [...implemented.keys()].filter((id) => !catalogued.has(id));

// group missing by catalogue, then by ID prefix inside it
const byCat = new Map();
for (const id of missing) {
  const c = catalogued.get(id).catalogue;
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(id);
}

if (json) {
  const areas = new Map();
  for (const id of missing) {
    const meta = catalogued.get(id);
    const key = id.replace(/^(TC|CLEANUP)-/, '').replace(/-[A-Z]?\d+$/, '') || 'ungrouped';
    if (!areas.has(key)) areas.set(key, { prefix: key, catalogue: meta.catalogue, cases: [] });
    areas.get(key).cases.push({ id, title: meta.title });
  }
  const totalPer = new Map();
  for (const [id, meta] of catalogued) {
    const key = id.replace(/^(TC|CLEANUP)-/, '').replace(/-[A-Z]?\d+$/, '') || 'ungrouped';
    totalPer.set(key, (totalPer.get(key) ?? 0) + 1);
  }
  writeFileSync('gaps.json', JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    catalogued: catalogued.size, implemented: implemented.size,
    missing: missing.length, uncatalogued: uncatalogued.length,
    catalogues: perCatalogue.map(({ file, area, declared }) => ({
      file, area, declared, missing: (byCat.get(file) ?? []).length })),
    areas: [...areas.values()].map((a) => ({ ...a, total: totalPer.get(a.prefix) ?? a.cases.length,
      missing: a.cases.length })).sort((x, y) => y.missing - x.missing),
  }, null, 2));
  console.log('wrote gaps.json');
  process.exit(0);
}

console.log('=== Coverage: catalogues vs code ===\n');
console.log(`  catalogues indexed  ${idx.catalogues.length}`);
console.log(`  catalogued cases    ${catalogued.size}`);
console.log(`  implemented cases   ${implemented.size}`);
console.log(`  UNIMPLEMENTED       ${missing.length}`);
console.log(`  uncatalogued        ${uncatalogued.length}   (a test claims an ID no catalogue declares)`);

console.log('\n--- per catalogue ---');
for (const c of perCatalogue.sort((a, b) => b.declared - a.declared)) {
  const gap = (byCat.get(c.file) ?? []).length;
  const pct = c.declared ? Math.round((c.declared - gap) / c.declared * 100) : 0;
  console.log(`  ${String(pct).padStart(3)}%  ${String(c.declared - gap).padStart(4)}/${String(c.declared).padEnd(4)}  ${c.area}`);
  console.log(`        ${c.file}`);
}

const areas = new Map();
for (const id of missing) {
  const key = id.replace(/^(TC|CLEANUP)-/, '').replace(/-[A-Z]?\d+$/, '') || 'ungrouped';
  if (!areas.has(key)) areas.set(key, []);
  areas.get(key).push(id);
}
console.log('\n--- largest untested areas ---');
[...areas.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([k, ids]) => {
  console.log(`  ${String(ids.length).padStart(3)}  ${k}`);
  console.log(`         ${ids[0]} — ${catalogued.get(ids[0]).title.slice(0, 68)}`);
});

if (update) {
  writeFileSync(BASELINE, JSON.stringify({
    catalogued: catalogued.size, implemented: implemented.size,
    unimplemented: missing.length, uncatalogued: uncatalogued.length,
  }, null, 2) + '\n');
  console.log(`\nbaseline written: ${missing.length} unimplemented, ${uncatalogued.length} uncatalogued`);
  process.exit(0);
}
if (strict && existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (missing.length > base.unimplemented) {
    console.error(`\n✗ unimplemented grew ${base.unimplemented} -> ${missing.length}.`);
    process.exit(1);
  }
  console.log(`\n✓ coverage did not regress (baseline ${base.unimplemented}).`);
}
