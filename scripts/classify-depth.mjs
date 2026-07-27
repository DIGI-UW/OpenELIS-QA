#!/usr/bin/env node
/**
 * Behaviour-based test-depth classifier for the freshness manifest.
 *
 * The workflow-coverage roll-up used to key depth purely off each spec's `kind`
 * (which is really just "which folder it lives in"). That understates specs that
 * live under tests/docs/ but actually drive a full user journey — clinical-flow,
 * order-446, multicomponent-runtime, etc. This classifier reads each spec's SOURCE
 * and infers what it actually DOES, then writes an explicit `depth` onto every spec.
 *
 * Signals (counted from source):
 *   ord  — order-journey verbs: placeLegacyOrder/placeOrder/SamplePatientEntry/assert*Persisted
 *   res  — result-side actions: openResultEntryByAccession/LogbookResults/result?type/sample-results/Load results/validate
 *   exp  — assertions: expect( / assert
 *   rest — REST contract calls: apiCall/createTestViaRest/setComponentViaRest//rest//request.(get|post|put)
 *   shot — screenshots only: shot( / screenshot(
 *
 * Rules (first match wins):
 *   seeder/tooling — data factories (seed-*) and maintenance/discovery scripts don't VERIFY a
 *               workflow, they set it up. Forced to smoke regardless of signal weight, so they
 *               never inflate a workflow's coverage tier.
 *   deep    — a full round-trip that verifies the workflow's core loop, either:
 *               an ORDER journey            — ord>=2  OR  (ord>=1 && res>=1), OR
 *               a REST write+read-back round-trip with assertions — rest>=3 && exp>=6
 *   shallow — meaningful single-surface assertion / REST contract, no round-trip:
 *               exp>=3  OR  rest>=3
 *   smoke   — everything else (render / capture / probe / navigation only)
 *
 * A spec may pin its own depth with `depthLock: true` in the manifest — this script
 * leaves those untouched. Missing source files fall back to the kind-derived tier.
 *
 * Usage: node scripts/classify-depth.mjs [--write]
 *   (dry-run prints the diff table; --write persists `depth` into spec-freshness.json)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'spec-freshness.json');
const WRITE = process.argv.includes('--write');

const KIND_DEPTH = {
  'deep-roundtrip': 'deep', 'guard-e2e': 'deep', 'runtime-e2e': 'deep', 'e2e': 'deep', 'chain': 'deep',
  'contract': 'shallow', 'runtime': 'shallow', 'guard': 'shallow',
  'docs-capture': 'smoke', 'probe': 'smoke', 'misc': 'smoke', 'seed': 'smoke',
};

const count = (src, re) => (src.match(re) || []).length;

// Seeders + maintenance/discovery tooling: setup scripts, not workflow verification → always smoke.
const NONTEST = /(^|\/)(seed-|cleanup-|patch-|find-|dump-|discover|_discover|_timing|handoff-|drift-fix)/;

function classify(file, src) {
  const ord = count(src, /placeLegacyOrder|placeOrder|SamplePatientEntry|assertOrderPersisted|assertSamplePersisted/g);
  const res = count(src, /openResultEntryByAccession|LogbookResults|result\?type|sample-results|Load results|\bvalidate\b/g);
  const exp = count(src, /expect\(|\bassert\w*/g);
  const rest = count(src, /apiCall|createTestViaRest|setComponentViaRest|\/rest\/|request\.(get|post|put)/g);
  const shot = count(src, /shot\(|screenshot\(/g);
  let depth;
  if (NONTEST.test(file.split('/').pop() ? '/' + file.split('/').pop() : file)) depth = 'smoke';
  else if (ord >= 2 || (ord >= 1 && res >= 1) || (rest >= 3 && exp >= 6)) depth = 'deep';
  else if (exp >= 3 || rest >= 3) depth = 'shallow';
  else depth = 'smoke';
  return { depth, sig: { ord, res, exp, rest, shot } };
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const rows = [];
let changed = 0;
for (const s of manifest.specs) {
  const kindTier = KIND_DEPTH[s.kind] || 'smoke';
  if (s.depthLock) { rows.push([s.file, s.depth || kindTier, s.depth || kindTier, 'locked']); continue; }
  const abs = path.join(ROOT, s.file);
  if (!fs.existsSync(abs)) { const d = kindTier; if (s.depth !== d) { s.depth = d; changed++; } rows.push([s.file, kindTier, d, 'no-src→kind']); continue; }
  const { depth, sig } = classify(s.file, fs.readFileSync(abs, 'utf8'));
  const before = s.depth || kindTier;
  if (s.depth !== depth) changed++;
  s.depth = depth;
  const moved = kindTier !== depth ? `${kindTier}→${depth}` : depth;
  rows.push([s.file, kindTier, depth, `o${sig.ord} r${sig.res} e${sig.exp} R${sig.rest} s${sig.shot} ${moved !== depth ? '· ' + moved : ''}`]);
}

// Print only the specs whose behaviour-depth differs from their kind-derived tier.
const diffs = rows.filter(([f, k, d]) => k !== d);
console.log(`\n${diffs.length} specs reclassified (behaviour ≠ kind):\n`);
for (const [f, k, d, note] of diffs) console.log(`  ${d.padEnd(7)} ${f.replace('tests/docs/', '').padEnd(42)} ${note}`);
const tally = rows.reduce((a, [, , d]) => (a[d] = (a[d] || 0) + 1, a), {});
console.log('\nDepth tally:', JSON.stringify(tally), WRITE ? `· wrote ${changed} depth fields` : '· dry-run (pass --write to persist)');

if (WRITE) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
