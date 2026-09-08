#!/usr/bin/env node
/**
 * Coverage-gap report: the catalogue vs the code.
 *
 * "Are we missing QA checks somewhere?" is a question about the CATALOGUE
 * against the CODE. It cannot be answered by running more browser tests — a
 * test that exists tells you nothing about a test that does not. The old
 * gap-suites tried to answer it by being test suites, and an audit on
 * 2026-09-08 found 98 of their 107 cases were byte-identical clones of module
 * specs: they re-ran covered ground and reported it as gap closure.
 *
 * This reads the case IDs declared in master-test-cases.md (the catalogue) and
 * the IDs actually implemented in *.spec.ts, and reports the difference both
 * ways:
 *
 *   UNIMPLEMENTED — catalogued but no test exists. The real gap list.
 *   UNCATALOGUED  — a test exists under an ID the catalogue never defined.
 *                   Either the catalogue is stale or the ID is wrong; both
 *                   break traceability from a sweep line back to a case.
 *
 * Report-only by default (prints and exits 0) so it can run every CI build.
 * --strict makes it exit 1 when the unimplemented count grows past the
 * baseline in .coverage-gaps-baseline.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE = '.coverage-gaps-baseline.json';
const strict = process.argv.includes('--strict');
const update = process.argv.includes('--update');
const ID = '[A-Za-z0-9]+-[A-Za-z]?\\d+';

// --- catalogue: an ID is DECLARED only by a case heading, not a passing mention
const cat = readFileSync('master-test-cases.md', 'utf8');
const catalogued = new Map(); // id -> heading text
for (const m of cat.matchAll(new RegExp(`^#{2,4}\\s+(TC-${ID})\\s*[—\\-:]\\s*(.+)$`, 'gm'))) {
  if (!catalogued.has(m[1])) catalogued.set(m[1], m[2].trim());
}

// --- code
const files = execSync("git ls-files '*.spec.ts'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('archive/'));
const implemented = new Map(); // id -> [files]
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(new RegExp(`\\btest(?:\\.\\w+)*\\(\\s*['"\`](TC-${ID})`, 'g'))) {
    if (!implemented.has(m[1])) implemented.set(m[1], []);
    if (!implemented.get(m[1]).includes(f)) implemented.get(m[1]).push(f);
  }
}

const unimplemented = [...catalogued.keys()].filter((id) => !implemented.has(id)).sort();
const uncatalogued = [...implemented.keys()].filter((id) => !catalogued.has(id)).sort();

// group the gap list by suite prefix so it reads as areas, not a wall of IDs
const bySuite = new Map();
for (const id of unimplemented) {
  const k = id.replace(/^TC-/, '').replace(/-[A-Za-z]?\d+$/, '');
  if (!bySuite.has(k)) bySuite.set(k, []);
  bySuite.get(k).push(id);
}

console.log('=== Coverage gaps: catalogue vs code ===\n');
console.log(`  catalogued cases   ${catalogued.size}`);
console.log(`  implemented cases  ${implemented.size}`);
console.log(`  UNIMPLEMENTED      ${unimplemented.length}   (catalogued, no test)`);
console.log(`  uncatalogued       ${uncatalogued.length}   (test exists, catalogue does not define the ID)`);

console.log('\n--- unimplemented, by area (the actual gap list) ---');
[...bySuite.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, ids]) => {
  console.log(`  ${String(ids.length).padStart(3)}  ${k}`);
  ids.slice(0, 3).forEach((id) => console.log(`         ${id} — ${catalogued.get(id)}`));
  if (ids.length > 3) console.log(`         … and ${ids.length - 3} more`);
});

if (uncatalogued.length) {
  console.log('\n--- uncatalogued IDs (traceability holes) ---');
  uncatalogued.slice(0, 20).forEach((id) => console.log(`  ${id}  [${implemented.get(id).join(', ')}]`));
  if (uncatalogued.length > 20) console.log(`  … and ${uncatalogued.length - 20} more`);
}

if (update) {
  writeFileSync(BASELINE, JSON.stringify({ unimplemented: unimplemented.length, uncatalogued: uncatalogued.length }, null, 2) + '\n');
  console.log(`\nbaseline written: ${unimplemented.length} unimplemented, ${uncatalogued.length} uncatalogued`);
  process.exit(0);
}

if (strict && existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (unimplemented.length > base.unimplemented) {
    console.error(`\n✗ unimplemented grew ${base.unimplemented} -> ${unimplemented.length}.`);
    console.error('  A new catalogued case needs a test, or the case should be removed from the catalogue.');
    process.exit(1);
  }
  console.log(`\n✓ coverage did not regress (baseline ${base.unimplemented} unimplemented).`);
}
