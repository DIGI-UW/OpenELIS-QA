#!/usr/bin/env node
/**
 * Duplicate TC-ID gate (ratchet).
 *
 * Three categories, because they need different fixes:
 *
 *   CLONE      same ID, same title, byte-identical body. Both copies run, so
 *              the case is counted twice. Safe to de-duplicate mechanically.
 *
 *   DRIFTED    same ID and title, DIFFERENT body — two implementations of one
 *              case, usually diverged selectors or helpers. Both run and both
 *              report under the same ID, so a sweep line is ambiguous AND the
 *              two can disagree. Cannot be de-duplicated without deciding
 *              which implementation is correct.
 *
 *   COLLISION  same ID, different title — genuinely different tests wearing
 *              one identifier. "TC-IO-03 failed" stops tracing to a case.
 *
 * PARSER NOTE (2026-09-08): this file originally located a test body with
 * `src.indexOf('{', ...)` and brace-matching. That finds the destructuring
 * brace in `async ({ page })`, not the function body, so every test truncated
 * to its header — and since both sides truncated identically, unrelated tests
 * compared "equal" and the gate reported 72 exact clones that do not exist.
 * The real count is 0. Match the PARENTHESES of the test(...) call instead;
 * that is what `extract` below does. The lesson is 12.13's: a helper that
 * looks like it answers a question can quietly answer a different one.
 *
 * Ratchet, not a cliff: the backlog lives in .dupe-ids-baseline.json and CI
 * fails only on NEW duplicates. Run with --update after resolving some.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE = '.dupe-ids-baseline.json';
const update = process.argv.includes('--update');
const CALL = /\btest(?:\.\w+)*\s*\(/g;

/** Every `test(...)` call with a TC ID, captured whole — args, callback and all. */
function extract(src) {
  const out = [];
  for (const m of src.matchAll(CALL)) {
    const open = m.index + m[0].length - 1;
    let i = open, depth = 0, quote = null, end = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) continue;
    const idm = src.slice(open, open + 300)
      .match(/^\(\s*['"`](TC-[A-Za-z0-9]+-[A-Za-z]?\d+)([^'"`]*)['"`]/);
    if (!idm) continue;
    out.push({
      id: idm[1],
      title: (idm[1] + idm[2]).trim(),
      body: src.slice(m.index, end + 1).replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

const files = execSync("git ls-files '*.spec.ts'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('archive/'));

const byId = new Map();
for (const f of files)
  for (const t of extract(readFileSync(f, 'utf8'))) {
    if (!byId.has(t.id)) byId.set(t.id, []);
    byId.get(t.id).push({ ...t, file: f });
  }

const found = { clones: [], drifted: [], collisions: [] };
for (const [id, occ] of byId) {
  const inFiles = [...new Set(occ.map((o) => o.file))].sort();
  if (inFiles.length < 2) continue;
  const oneBody = new Set(occ.map((o) => o.body)).size === 1;
  const oneTitle = new Set(occ.map((o) => o.title)).size === 1;
  const kind = oneBody ? 'clones' : oneTitle ? 'drifted' : 'collisions';
  found[kind].push(`${id}|${inFiles.join(',')}`);
}
const current = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.sort()]));

if (update) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline written: ${current.clones.length} clones, ${current.drifted.length} drifted, ${current.collisions.length} collisions`);
  process.exit(0);
}
if (!existsSync(BASELINE)) { console.error(`${BASELINE} missing — run: npm run dupe-ids:baseline`); process.exit(1); }
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

const LABEL = {
  clones: 'NEW clones (same ID, same body, two files — both will run)',
  drifted: 'NEW drifted duplicates (same ID and title, different body — the two can disagree)',
  collisions: 'NEW TC-ID collisions (same ID, different tests — breaks traceability)',
};
let failed = false;
for (const kind of ['clones', 'drifted', 'collisions']) {
  const known = new Set(base[kind] ?? []);
  const added = current[kind].filter((k) => !known.has(k));
  if (!added.length) continue;
  failed = true;
  console.error(`\n✗ ${LABEL[kind]}:`);
  for (const a of added) {
    const [id, fs] = a.split('|');
    console.error(`    ${id}\n      ${fs.split(',').join('\n      ')}`);
  }
}
if (failed) {
  console.error('\nGive the new case its own TC ID, or import the existing one rather than');
  console.error('copying it. If a duplicate is genuinely intended:');
  console.error('  npm run dupe-ids:baseline    (and say why in the PR)\n');
  process.exit(1);
}
console.log(`✓ No new duplicate TC IDs. Backlog: ${current.clones.length} clones, ${current.drifted.length} drifted, ${current.collisions.length} collisions.`);
