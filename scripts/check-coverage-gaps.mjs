#!/usr/bin/env node
/**
 * Coverage: every catalogue vs the code, with two things the first version got
 * wrong and one it never asked.
 *
 * IDENTITY. A case is (catalogue, id), not id alone. 14 ids are declared in two
 * catalogues — the bare TC-NN forms shared by master-test-cases.md and
 * references/test-cases.md, plus three shared with the edit-order suite. Keying
 * a single map by id collapsed them, so a test for master's TC-01 credited the
 * unrelated TC-01 in references/test-cases.md and reported that file as 42%
 * covered when its real figure is 0%. Such ids are now reported as AMBIGUOUS:
 * a test naming one cannot be attributed, so it counts as neither covered nor
 * gap, and the fix is to rename them, not to guess.
 *
 * SUBSTANCE. "Covered" meant "some test declares this id". A test that asserts
 * nothing cannot fail, and one that always skips never runs, so a case whose
 * every test is hollow is reported as covered while proving nothing. 80 cases
 * were in that state. Coverage is now split into REAL and HOLLOW.
 *
 * Report-only by default; --strict fails when real coverage drops or the gap
 * grows past .coverage-gaps-baseline.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { declaredIn } from './catalogue-ids.mjs';
import { assertsSomething, alwaysSkips } from './assertions.mjs';

const BASELINE = '.coverage-gaps-baseline.json';
const strict = process.argv.includes('--strict');
const update = process.argv.includes('--update');
const json = process.argv.includes('--json');

const CALL = /\btest(?:\.\w+)*\s*\(/g;
const ID_AT = /^\(\s*['"`]((?:TC|CLEANUP)-[A-Z0-9]+(?:-[A-Z0-9]+)*)([^'"`]*)/;

/** Whole test(...) call, parenthesis-matched — brace-matching finds `({ page })`. */
function testsIn(src) {
  const out = [];
  for (const m of src.matchAll(CALL)) {
    const open = m.index + m[0].length - 1;
    let i = open, d = 0, q = null, end = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
      if (c === '(') d++; else if (c === ')') { d--; if (!d) { end = i; break; } }
    }
    if (end < 0) continue;
    const idm = src.slice(open, open + 300).match(ID_AT);
    if (!idm) continue;
    const body = src.slice(m.index, end + 1);
    out.push({
      id: idm[1],
      asserts: assertsSomething(body),
      alwaysSkips: alwaysSkips(body),
    });
  }
  return out;
}

const idx = JSON.parse(readFileSync('catalogues.json', 'utf8'));

// --- declared, keyed by catalogue
const declaredBy = new Map();       // file -> Map(id -> title)
const homesOf = new Map();          // id -> [file]
for (const c of idx.catalogues) {
  const d = declaredIn(readFileSync(c.file, 'utf8'));
  declaredBy.set(c.file, d);
  for (const id of d.keys()) {
    if (!homesOf.has(id)) homesOf.set(id, []);
    homesOf.get(id).push(c.file);
  }
}
const ambiguous = new Set([...homesOf.entries()].filter(([, f]) => f.length > 1).map(([id]) => id));

// --- implemented
const specs = execSync("git ls-files '*.spec.ts'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('archive/'));
const tested = new Map();           // id -> [{asserts, alwaysSkips}]
for (const f of specs)
  for (const t of testsIn(readFileSync(f, 'utf8'))) {
    if (!tested.has(t.id)) tested.set(t.id, []);
    tested.get(t.id).push(t);
  }
const isHollow = (id) => tested.get(id).every((t) => !t.asserts || t.alwaysSkips);

// --- per catalogue
const rows = [];
let R = 0, H = 0, G = 0, A = 0, D = 0;
for (const c of idx.catalogues) {
  const d = declaredBy.get(c.file);
  let real = 0, hollow = 0, gap = 0, amb = 0;
  const gapIds = [];
  for (const id of d.keys()) {
    if (ambiguous.has(id)) { amb++; continue; }
    if (!tested.has(id)) { gap++; gapIds.push(id); continue; }
    if (isHollow(id)) hollow++; else real++;
  }
  rows.push({ ...c, declared: d.size, real, hollow, gap, ambiguous: amb, gapIds });
  R += real; H += hollow; G += gap; A += amb; D += d.size;
}
const uncatalogued = [...tested.keys()].filter((id) => !homesOf.has(id));

if (json) {
  const areas = new Map(), totals = new Map();
  for (const c of idx.catalogues)
    for (const [id, title] of declaredBy.get(c.file)) {
      const k = id.replace(/^(TC|CLEANUP)-/, '').replace(/-[A-Z]?\d+$/, '') || 'ungrouped';
      totals.set(k, (totals.get(k) ?? 0) + 1);
      if (ambiguous.has(id) || (tested.has(id) && !isHollow(id))) continue;
      if (!areas.has(k)) areas.set(k, { prefix: k, cat: c.file, cases: [] });
      areas.get(k).cases.push({ id, title, hollow: tested.has(id) });
    }
  writeFileSync('gaps.json', JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    catalogued: D, real: R, hollow: H, missing: G, ambiguous: ambiguous.size, uncatalogued: uncatalogued.length,
    catalogues: rows.map(({ file, area, declared, real, hollow, gap, ambiguous }) =>
      ({ file, area, declared, real, hollow, gap, ambiguous })),
    areas: [...areas.values()].map((a) => ({ ...a, total: totals.get(a.prefix) ?? a.cases.length,
      missing: a.cases.length })).sort((x, y) => y.missing - x.missing),
  }, null, 2));
  console.log('wrote gaps.json');
  process.exit(0);
}

console.log('=== Coverage: catalogues vs code ===\n');
console.log(`  catalogued cases   ${D}`);
console.log(`  REAL coverage      ${R}   (a test that asserts and can run)`);
console.log(`  hollow coverage    ${H}   (a test exists but asserts nothing, or always skips)`);
console.log(`  no test at all     ${G}`);
console.log(`  ambiguous id       ${ambiguous.size}   (declared in two catalogues — cannot attribute; ${A} declared entries)`);
console.log(`  uncatalogued tests ${uncatalogued.length}   (a test claims an id no catalogue declares)`);
console.log(`\n  real coverage ${Math.round(R / D * 100)}%  —  counting hollow as covered would say ${Math.round((R + H) / D * 100)}%`);

console.log('\n--- per catalogue ---');
console.log('  real  hollow   gap   amb   declared   catalogue');
for (const r of rows.sort((a, b) => b.declared - a.declared))
  console.log(`  ${String(r.real).padStart(4)}  ${String(r.hollow).padStart(6)}  ${String(r.gap).padStart(4)}  ${String(r.ambiguous).padStart(4)}  ${String(r.declared).padStart(8)}   ${r.area}`);

if (ambiguous.size) {
  console.log(`\n--- ambiguous ids (${ambiguous.size}) — rename these; a sweep line naming one is untraceable ---`);
  for (const id of [...ambiguous].slice(0, 6)) console.log(`  ${id.padEnd(12)} ${homesOf.get(id).join('  +  ')}`);
  if (ambiguous.size > 6) console.log(`  … and ${ambiguous.size - 6} more`);
}

if (update) {
  writeFileSync(BASELINE, JSON.stringify({ catalogued: D, real: R, hollow: H,
    unimplemented: G, ambiguous: ambiguous.size, uncatalogued: uncatalogued.length }, null, 2) + '\n');
  console.log(`\nbaseline written: real ${R}, hollow ${H}, gap ${G}, ambiguous ${ambiguous.size}`);
  process.exit(0);
}
if (strict && existsSync(BASELINE)) {
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  let bad = false;
  if (R < b.real) { console.error(`\n✗ real coverage fell ${b.real} -> ${R}.`); bad = true; }
  if (ambiguous.size > b.ambiguous) { console.error(`\n✗ ambiguous ids grew ${b.ambiguous} -> ${ambiguous.size}.`); bad = true; }
  if (bad) process.exit(1);
  console.log(`\n✓ real coverage held (baseline ${b.real}).`);
}
