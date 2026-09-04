#!/usr/bin/env node
/**
 * scripts/check-orphans.mjs — the orphan gate.
 *
 * Every spec file must be reachable by at least one Playwright config. A spec
 * no config can run is not coverage; it is a file that looks like coverage in
 * a directory listing and executes never.
 *
 * WHY (2026-09-04): an audit after OGC-1192 found 46 spec files — 866 tests,
 * the bulk of the module coverage — that no config could run. They had been
 * dead for a long time and nothing said so. `openelis-e2e.spec.ts`, quarantined
 * in #94, was the same problem spotted one file at a time.
 *
 * HOW: asks Playwright itself which files each config resolves (`--list`),
 * rather than parsing testMatch regexes by hand — several configs build their
 * patterns dynamically, so static parsing gets the wrong answer.
 *
 * A file may be intentionally unrunnable (a fixture, a helper that ends in
 * .spec.ts, something parked). Record it in .orphan-allowlist.json with a
 * reason. Everything else fails.
 *
 * Usage:
 *   node scripts/check-orphans.mjs             # check (CI)
 *   node scripts/check-orphans.mjs --list      # print the reachability map
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = join(ROOT, '.orphan-allowlist.json');
const SKIP_DIRS = new Set(['node_modules', 'archive', 'test-results', 'playwright-report', 'regression-results', '.git', 'evals']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out);
    } else if (e.name.endsWith('.spec.ts')) {
      out.push(relative(ROOT, join(dir, e.name)));
    }
  }
  return out;
}

const specs = walk(ROOT).sort();
const configs = readdirSync(ROOT).filter(f => f.endsWith('.config.ts')).sort();

const reachable = new Map(); // basename -> [configs]
for (const cfg of configs) {
  let out = '';
  try {
    out = execFileSync('npx', ['playwright', 'test', '--config', cfg, '--list'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    out = e.stdout || '';
    if (!out) { console.warn(`  (warn) ${cfg} could not be listed — skipping`); continue; }
  }
  for (const m of out.matchAll(/[A-Za-z0-9_./-]+\.spec\.ts/g)) {
    const base = m[0].split('/').pop();
    if (!reachable.has(base)) reachable.set(base, []);
    if (!reachable.get(base).includes(cfg)) reachable.get(base).push(cfg);
  }
}

const allow = existsSync(ALLOWLIST) ? JSON.parse(readFileSync(ALLOWLIST, 'utf8')) : { files: {} };
const allowed = new Set(Object.keys(allow.files || {}));

const orphans = specs.filter(s => !reachable.has(s.split('/').pop()) && !allowed.has(s));
const dupes = [...reachable.entries()].filter(([, c]) => c.length > 1);

if (process.argv.includes('--list')) {
  for (const s of specs) {
    const c = reachable.get(s.split('/').pop());
    console.log(`${c ? c.join(', ') : 'ORPHAN'}\t${s}`);
  }
  process.exit(0);
}

console.log(`${specs.length} spec files, ${configs.length} configs, ${specs.length - orphans.length} reachable.`);

if (dupes.length) {
  console.log(`\n${dupes.length} file(s) reachable from more than one config (not an error, but they run twice):`);
  for (const [f, c] of dupes.slice(0, 15)) console.log(`  ${f}: ${c.join(', ')}`);
}

if (orphans.length) {
  console.error(`\n✗ ${orphans.length} spec file(s) no config can run:\n`);
  for (const o of orphans) console.error(`  ${o}`);
  console.error(`
  A spec no config runs is not coverage — it looks like coverage in a
  directory listing and executes never. See modules.config.ts.

  Fix by adding the file to a config's testMatch (modules.config.ts sweeps
  tests/*.spec.ts automatically, so a new module suite there needs nothing).
  If the file is intentionally unrunnable, record it in .orphan-allowlist.json
  with a reason.
`);
  process.exit(1);
}

console.log('✓ every spec file is reachable by at least one config.');
