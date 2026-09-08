#!/usr/bin/env node
/**
 * Duplicate TC-ID gate (ratchet).
 *
 * Two distinct defects, both of which make a sweep's numbers lie:
 *
 *  CLONE     — the same TC ID, title and body in two files. Both copies run,
 *              so the case is counted twice and every failure is double
 *              counted. Sweep 4 double-counted 34 failures this way.
 *
 *  COLLISION — the same TC ID on two DIFFERENT tests. "TC-IO-03 failed" stops
 *              being traceable to a case in the catalogue, because there are
 *              two TC-IO-03s that check unrelated things.
 *
 * Like scripts/lint-assert-gate.mjs this is a ratchet, not a cliff: the known
 * backlog lives in .dupe-ids-baseline.json and CI fails only on NEW duplicates.
 * Run with --update after deliberately resolving some.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE = '.dupe-ids-baseline.json';
const update = process.argv.includes('--update');

const files = execSync("git ls-files '*.spec.ts'", { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('archive/'));

function testsIn(src, file) {
  const out = [];
  for (const m of src.matchAll(/\btest(?:\.\w+)*\(\s*['"`](TC-[A-Za-z0-9]+-\d+)([^'"`]*)['"`]/g)) {
    let i = src.indexOf('{', m.index), depth = 0, end = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    out.push({
      id: m[1],
      title: (m[1] + m[2]).trim(),
      file,
      body: src.slice(m.index, end + 1).replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

const all = [];
for (const f of files) all.push(...testsIn(readFileSync(f, 'utf8'), f));

const byId = new Map();
for (const t of all) {
  if (!byId.has(t.id)) byId.set(t.id, []);
  byId.get(t.id).push(t);
}

const found = { clones: [], collisions: [] };
for (const [id, occ] of byId) {
  const inFiles = [...new Set(occ.map((o) => o.file))].sort();
  if (inFiles.length < 2) continue;
  const kind = new Set(occ.map((o) => o.body)).size === 1 ? 'clones' : 'collisions';
  found[kind].push({ id, files: inFiles });
}

const key = (e) => `${e.id}|${e.files.join(',')}`;
const current = {
  clones: found.clones.map(key).sort(),
  collisions: found.collisions.map(key).sort(),
};

if (update) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline written: ${current.clones.length} clones, ${current.collisions.length} collisions`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`${BASELINE} missing — run: npm run dupe-ids:baseline`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

let failed = false;
for (const kind of ['clones', 'collisions']) {
  const known = new Set(base[kind] ?? []);
  const added = current[kind].filter((k) => !known.has(k));
  if (added.length) {
    failed = true;
    const label = kind === 'clones'
      ? 'NEW duplicate test cases (same ID, same body, in two files — both will run)'
      : 'NEW TC-ID collisions (same ID on different tests — breaks traceability)';
    console.error(`\n✗ ${label}:`);
    for (const a of added) {
      const [id, fs] = a.split('|');
      console.error(`    ${id}\n      ${fs.split(',').join('\n      ')}`);
    }
  }
}

if (failed) {
  console.error('\nGive the new case its own TC ID, or import the existing one rather than');
  console.error('copying it. If a duplicate is genuinely intended, run:');
  console.error('  npm run dupe-ids:baseline    (and say why in the PR)\n');
  process.exit(1);
}

const shrunk =
  (base.clones?.length ?? 0) - current.clones.length +
  ((base.collisions?.length ?? 0) - current.collisions.length);
console.log(
  `✓ No new duplicate TC IDs. Backlog: ${current.clones.length} clones, ` +
  `${current.collisions.length} collisions.` +
  (shrunk > 0 ? ` (${shrunk} resolved since baseline — run npm run dupe-ids:baseline to bank it.)` : '')
);
