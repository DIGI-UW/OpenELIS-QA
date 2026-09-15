#!/usr/bin/env node
/**
 * Keeps `catalogues.json` honest.
 *
 * A catalogue that nothing indexes is invisible: the coverage report reads the
 * index, so a per-feature suite written in its own .md — analyzer guided setup,
 * label presets, test catalog management — simply does not exist as far as the
 * gap analysis is concerned, and every case in it looks like it was never
 * written. That is how "607 cases have no test" came to include work that had
 * in fact been catalogued and tested.
 *
 * This walks every tracked .md and fails when a file DECLARES case headings but
 * is neither indexed nor explicitly excluded. Adding a catalogue is one line in
 * catalogues.json; deciding a file is not a catalogue is one line in `notCatalogues`
 * WITH a reason.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { declaredIn } from './catalogue-ids.mjs';

const INDEX = 'catalogues.json';
if (!existsSync(INDEX)) { console.error(`${INDEX} missing.`); process.exit(1); }
const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
const indexed = new Set(idx.catalogues.map((c) => c.file));
const excused = new Map((idx.notCatalogues ?? []).map((e) => [e.file, e.reason]));
// A trailing "/" excuses a whole directory (archive/ holds historical run reports
// that restate cases; indexing them would count old runs as catalogue entries).
const excusedDirs = [...excused.keys()].filter((k) => k.endsWith('/'));
const isExcused = (f) => excused.has(f) || excusedDirs.some((d) => f.startsWith(d));

const md = execSync("git ls-files '*.md'", { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = { unindexed: [], missingFile: [], empty: [], unexplained: [] };

for (const f of md) {
  const n = declaredIn(readFileSync(f, 'utf8')).size;
  if (!n) continue;
  if (indexed.has(f) || isExcused(f)) continue;
  problems.unindexed.push({ file: f, cases: n });
}
for (const c of idx.catalogues) {
  if (!existsSync(c.file)) { problems.missingFile.push(c.file); continue; }
  const n = declaredIn(readFileSync(c.file, 'utf8')).size;
  if (!n) problems.empty.push(c.file);
}
for (const [f, reason] of excused) if (!reason || reason.length < 12) problems.unexplained.push(f);

// A case's identity is (catalogue, id). An id declared in TWO catalogues cannot
// be attributed: a test naming it credits whichever the tool happens to key
// first, which is how references/test-cases.md was reported 42% covered when
// its real figure is 0%. Existing collisions are grandfathered in
// `knownAmbiguous`; new ones fail.
const homes = new Map();
for (const c of idx.catalogues) {
  if (!existsSync(c.file)) continue;
  for (const id of declaredIn(readFileSync(c.file, 'utf8')).keys()) {
    if (!homes.has(id)) homes.set(id, []);
    homes.get(id).push(c.file);
  }
}
const grandfathered = new Set(idx.knownAmbiguous ?? []);
const collisions = [...homes.entries()].filter(([, f]) => f.length > 1);
problems.newAmbiguous = collisions.filter(([id]) => !grandfathered.has(id));
problems.staleAmbiguous = [...grandfathered].filter((id) => !homes.has(id) || homes.get(id).length < 2);

let bad = false;
if (problems.unindexed.length) {
  bad = true;
  console.error('\n✗ Catalogue files that nothing indexes:');
  for (const p of problems.unindexed) console.error(`    ${String(p.cases).padStart(4)} cases   ${p.file}`);
  console.error('\n  A catalogue outside the index is invisible to the coverage report, so its');
  console.error('  cases read as "never written". Add it to catalogues.json, or list it under');
  console.error('  notCatalogues with a reason if it only quotes IDs rather than defining them.');
}
if (problems.missingFile.length) {
  bad = true;
  console.error('\n✗ Indexed but the file is gone (stale index):');
  problems.missingFile.forEach((f) => console.error(`    ${f}`));
}
if (problems.empty.length) {
  bad = true;
  console.error('\n✗ Indexed but declares no cases (wrong file, or headings changed shape):');
  problems.empty.forEach((f) => console.error(`    ${f}`));
}
if (problems.newAmbiguous?.length) {
  bad = true;
  console.error('\n✗ NEW ambiguous case ids — the same id declared in two catalogues:');
  for (const [id, files] of problems.newAmbiguous)
    console.error(`    ${id}\n      ${files.join('\n      ')}`);
  console.error('\n  A test naming one of these cannot be attributed to a case, so it is');
  console.error('  counted as neither covered nor gap. Give the new case a prefixed id');
  console.error('  (e.g. TC-TCAT-01 rather than TC-01).');
}
if (problems.staleAmbiguous?.length) {
  bad = true;
  console.error('\n✗ knownAmbiguous lists ids that are no longer ambiguous — remove them:');
  problems.staleAmbiguous.forEach((id) => console.error(`    ${id}`));
}
if (problems.unexplained.length) {
  bad = true;
  console.error('\n✗ Excluded without a real reason:');
  problems.unexplained.forEach((f) => console.error(`    ${f}`));
}
if (bad) process.exit(1);

const total = idx.catalogues.reduce((s, c) => s + declaredIn(readFileSync(c.file, 'utf8')).size, 0);
console.log(`✓ Catalogue index complete: ${idx.catalogues.length} catalogues, ${total} cases declared, ${excused.size} files excluded by name.`);
if (grandfathered.size) console.log(`  (${grandfathered.size} ids are ambiguous across catalogues and grandfathered; renaming them is tracked in open-questions.md)`);
