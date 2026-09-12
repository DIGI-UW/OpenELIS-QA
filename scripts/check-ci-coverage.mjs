#!/usr/bin/env node
/**
 * scripts/check-ci-coverage.mjs — the "does CI actually run it" gate.
 *
 * NOT THE SAME CHECK AS check-orphans.mjs, and the difference is the whole point.
 *
 *   check-orphans.mjs  asks: is every spec reachable by SOME config?
 *   this script asks:   is every spec run by a config CI ACTUALLY EXECUTES?
 *
 * The orphan gate has passed cleanly for weeks. It was still true, on 2026-09-12, that
 * develop-stack ran 2 of the repository's 40 configs: 69 of 227 spec files. The other 158
 * were reachable, owned, green in the orphan map, and executed by nobody on any schedule.
 * A spec that only a config no one runs can reach is not coverage either, and the existing
 * gate is structurally unable to say so.
 *
 * HOW
 * Reads ci-suites.json, asks Playwright itself which files each listed config resolves
 * (`--list`, never static parsing of testMatch — several configs build their patterns
 * dynamically), and compares the union against every spec in the tree.
 *
 * A file may legitimately stay out of CI: it drives a different instance, it is a media
 * capture, it is a scratch probe that asserts nothing. Record it in the `excluded` array
 * of ci-suites.json with a reason. Everything else fails this check. There is no third
 * option, which is the property that stops the list going quietly stale.
 *
 * Usage:
 *   node scripts/check-ci-coverage.mjs           # check (CI)
 *   node scripts/check-ci-coverage.mjs --map     # print the full config -> files map
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'ci-suites.json');
const SKIP_DIRS = new Set([
  'node_modules', 'archive', 'test-results', 'playwright-report',
  'regression-results', '.git', 'evals',
  // 'app' is the develop-stack workflow's checkout of OpenELIS-Global-2, cloned INTO this
  // repository so the stack's compose file and bind mounts are on the runner's disk. It
  // brings the product's own frontend *.spec.ts files with it, and no Playwright config
  // here collects those -- correctly, they are not ours.
  //
  // This was invisible locally, where app/ does not exist, and failed the first sharded CI
  // run with "70 spec file(s) are run by NO config". The same checkout is already called
  // out in the workflow for causing an EACCES on app/volume during spec collection, which
  // is the same root cause wearing a different hat: a foreign tree inside ours that every
  // walk has to know about.
  'app',
]);
const MAP_ONLY = process.argv.includes('--map');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      // Belt and braces for the 'app' case above: ANY nested checkout is somebody else's
      // tree, whatever it happens to be called. Naming one directory fixes today's failure;
      // this stops the next clone-into-the-workspace from reintroducing it.
      if (existsSync(join(p, '.git'))) continue;
      walk(p, out);
    } else if (e.endsWith('.spec.ts')) out.push(relative(ROOT, p));
  }
  return out;
}

/** Ask Playwright which files a config resolves. Never parse testMatch by hand. */
function filesFor(config) {
  let out;
  try {
    out = execFileSync('npx', ['playwright', 'test', '-c', config, '--list', '--reporter=line'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // A config that collects nothing exits non-zero. That is itself worth reporting,
    // so fall through with whatever it printed rather than throwing.
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  const found = new Set();
  for (const m of out.matchAll(/[A-Za-z0-9_./-]+\.spec\.ts/g)) {
    found.add(m[0].replace(/^\.\//, ''));
  }
  return found;
}

if (!existsSync(MANIFEST)) {
  console.error(`✗ ${relative(ROOT, MANIFEST)} is missing. It is the source of truth for what CI runs.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const allSpecs = walk(ROOT).sort();

// Every suite must declare which shard runs it. Without this, adding a config to the
// manifest would look complete, pass the coverage check, and then be run by no shard --
// the same "looks covered, executes never" failure this whole file exists to prevent,
// reintroduced one level up.
const SHARD_COUNT = Number(process.env.CI_SHARDS ?? 4);
const badShard = manifest.suites.filter(s =>
  !Number.isInteger(s.shard) || s.shard < 1 || s.shard > SHARD_COUNT);
if (badShard.length) {
  console.log(`\n\u2717 ${badShard.length} suite(s) have no valid shard (expected 1..${SHARD_COUNT}):`);
  for (const s of badShard) console.log(`  ${s.config}: shard=${JSON.stringify(s.shard)}`);
  process.exitCode = 1;
}
const perShard = {};
for (const s of manifest.suites) perShard[s.shard] = (perShard[s.shard] || 0) + 1;
console.log(`shards: ${JSON.stringify(perShard)}`);

const covered = new Map();   // spec -> [configs]
for (const suite of manifest.suites) {
  const files = filesFor(suite.config);
  for (const f of files) {
    if (!covered.has(f)) covered.set(f, []);
    covered.get(f).push(suite.config);
  }
  console.log(`  ${String(files.size).padStart(4)}  ${suite.config}`);
}

if (MAP_ONLY) {
  console.log('\n--- spec -> configs ---');
  for (const s of allSpecs) console.log(`${s}: ${(covered.get(s) || ['(NONE)']).join(', ')}`);
  process.exit(0);
}

const excluded = new Map((manifest.excluded || []).map(e => [e.match, e.why]));
const docsGlob = /^tests\/docs\//;

const uncovered = allSpecs.filter(s => !covered.has(s));
const unexplained = uncovered.filter(s => !excluded.has(s) && !docsGlob.test(s));
const docsOut = uncovered.filter(s => docsGlob.test(s));
const explained = uncovered.filter(s => excluded.has(s));
const doubled = [...covered.entries()].filter(([, c]) => c.length > 1);

console.log(`\n${allSpecs.length} spec files · ${manifest.suites.length} configs in CI · ${covered.size} covered`);
console.log(`  ${explained.length} excluded with a reason · ${docsOut.length} in the on-demand docs tier`);

if (doubled.length) {
  console.log(`\n${doubled.length} file(s) collected by more than one CI config (they run twice; not an error):`);
  for (const [f, cfgs] of doubled) console.log(`  ${f}: ${cfgs.join(', ')}`);
}

// Stale exclusions are as bad as missing ones: an entry that no longer matches any real
// file is a reason nobody can check, sitting in the manifest looking authoritative.
const stale = [...excluded.keys()].filter(m => !allSpecs.includes(m) && !m.endsWith('.setup.ts'));
if (stale.length) {
  console.log(`\n✗ ${stale.length} exclusion(s) name a file that does not exist. Remove them:`);
  for (const m of stale) console.log(`  ${m}`);
}

if (unexplained.length) {
  console.log(`\n✗ ${unexplained.length} spec file(s) are run by NO config that CI executes, and no reason is recorded.`);
  console.log('  Either add a config that collects them to "suites", or add them to "excluded" with a reason.');
  for (const s of unexplained) console.log(`  ${s}`);
}

if (unexplained.length || stale.length || process.exitCode === 1) process.exit(1);
console.log('\n✓ every spec file is either run by CI or excluded with a stated reason.');
