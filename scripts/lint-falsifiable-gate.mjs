#!/usr/bin/env node
/**
 * scripts/lint-falsifiable-gate.mjs
 *
 * The falsifiability gate. Companion to `scripts/lint-assert-gate.mjs`, and
 * deliberately does NOT overlap it.
 *
 *   lint-assert-gate.mjs  owns "this test asserts NOTHING"
 *                         (ESLint playwright/expect-expect, .assert-baseline.json)
 *   THIS FILE             owns "this test asserts something that CANNOT FAIL"
 *
 * ESLint's rule is satisfied by the presence of an `expect`. It cannot see that
 * `expect(n).toBeGreaterThanOrEqual(0)` is true of every count, that
 * `status === 0 || (status >= 200 && status < 300)` passes when no request was
 * ever sent, or that a case which opens with
 *   if (!url) { console.log('SKIP'); return; }
 * silently opts out on every run. That last pattern is the big one: an audit on
 * 2026-09-10 found 482 of 1,157 blocks unfalsifiable, and self-skip-return
 * accounted for 319 of them — nearly two thirds — all invisible to the assert
 * gate because they do carry an `expect` further down, after a `return` that
 * always fires.
 *
 * WHY A RATCHET. Same reasoning as lint-assert-gate.mjs, and the same contract:
 * per-FILE counts, visible, and they can only go down. Turning this on hard
 * against the existing backlog would make main unmergeable, and a gate people
 * route around is worth less than no gate.
 *
 *   node scripts/lint-falsifiable-gate.mjs             # check (CI)
 *   node scripts/lint-falsifiable-gate.mjs --update    # re-record after real fixes
 *   node scripts/lint-falsifiable-gate.mjs --report    # per-file breakdown
 *
 * A `test.fail()` inside a case body is EXEMPT. That is a tripwire documenting a
 * known defect: it asserts the correct behaviour and turns red the day the bug is
 * fixed, which is the opposite of unfalsifiable. See harness ref 12.31 for why
 * each tripwire also needs an ordinary canary over the same path.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TESTS = path.join(ROOT, 'tests');
const BASELINE = path.join(ROOT, '.falsifiable-baseline.json');

/**
 * ONLY real test blocks. `test.describe`, `beforeEach` and `test.step` are not
 * tests; counting them inflated the first audit's numbers by ~200 (harness
 * 12.31).
 */
const TEST_RE = /\n\s*test\s*(?:\.\s*(skip|fail|only|fixme))?\s*\(\s*(['"`])([\s\S]*?)\2/g;

/** Patterns that make a case incapable of failing. */
const CANNOT_FAIL = [
  // 'no-expect' is deliberately absent: lint-assert-gate.mjs owns it. One
  // problem, one gate — two gates on one pattern means two baselines to
  // reconcile and a disagreement nobody arbitrates.
  ['self-skip-return', (c) => /if\s*\(\s*![\s\S]{0,160}?\)\s*\{[\s\S]{0,400}?\breturn\s*;/.test(c)],
  ['gte-0',            (c) => /toBeGreaterThanOrEqual\(\s*0\s*\)/.test(c)],
  ['expect-true',      (c) => /expect\(\s*(true|1)\s*\)\s*\.toBe/.test(c)],
  ['zero-or-ok',       (c) => /===\s*0\s*\|\|/.test(c)],
  ['either-or-pass',   (c) => /\|\|[^;\n]{0,90}\)?\s*,?[^;]{0,120}\)\s*\.toBe\(\s*true\s*\)/.test(c)],
];

function specFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) specFiles(p, out);
    else if (e.name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

function analyse(file) {
  const src = fs.readFileSync(file, 'utf8');
  const starts = [];
  TEST_RE.lastIndex = 0;
  let m;
  while ((m = TEST_RE.exec(src))) {
    starts.push({ i: m.index, mod: m[1] || '', title: m[3].replace(/\s+/g, ' ').slice(0, 90) });
  }
  const cases = [];
  starts.forEach((s, k) => {
    const body = src.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : src.length);
    // strip comments: prose in a comment must never count as code
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const nExpect = (code.match(/\bexpect\s*\(/g) || []).length;
    const flags = CANNOT_FAIL.filter(([, f]) => f(code, nExpect)).map(([name]) => name);
    // `test.fail()` INSIDE the body is a deliberate tripwire, not hollowness:
    // it turns red when the defect is fixed, which is the opposite of unfalsifiable.
    const tripwire = /\btest\.fail\(\s*\)/.test(code) || s.mod === 'fail';
    if (s.mod === 'skip' || s.mod === 'fixme') flags.push('test.skip');
    cases.push({ title: s.title, flags, tripwire, nExpect });
  });
  const hollow = cases.filter((c) => c.flags.length > 0 && !c.tripwire);
  return { total: cases.length, hollow: hollow.length, cases, hollowCases: hollow };
}

const files = specFiles(TESTS).sort();
const current = {};
const detail = {};
let total = 0, hollowTotal = 0, tripwires = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const r = analyse(f);
  current[rel] = r.hollow;
  detail[rel] = r;
  total += r.total;
  hollowTotal += r.hollow;
  tripwires += r.cases.filter((c) => c.tripwire).length;
}

const mode = process.argv.includes('--update') ? 'update'
  : process.argv.includes('--report') ? 'report' : 'check';

if (mode === 'report') {
  const rows = Object.entries(current).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  console.log(`${total} test blocks · ${hollowTotal} cannot fail (${(100 * hollowTotal / total).toFixed(1)}%) · ${tripwires} deliberate tripwires\n`);
  for (const [f, n] of rows) {
    const d = detail[f];
    console.log(`${String(n).padStart(3)}/${String(d.total).padEnd(3)}  ${f}`);
    for (const c of d.hollowCases.slice(0, 3)) console.log(`         ${c.title}  [${c.flags.join(',')}]`);
    if (d.hollowCases.length > 3) console.log(`         …and ${d.hollowCases.length - 3} more`);
  }
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), total, hollowTotal, files: current }, null, 2) + '\n');
  console.log(`.falsifiable-baseline.json created: ${hollowTotal} of ${total} blocks assert something that cannot fail.`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const worse = [], better = [], added = [];
for (const [f, n] of Object.entries(current)) {
  const b = base.files[f];
  if (b === undefined) { if (n > 0) added.push([f, n]); continue; }
  if (n > b) worse.push([f, b, n]);
  if (n < b) better.push([f, b, n]);
}

if (mode === 'update') {
  fs.writeFileSync(BASELINE, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), total, hollowTotal, files: current }, null, 2) + '\n');
  console.log(`baseline updated: ${hollowTotal} of ${total} cannot fail (was ${base.hollowTotal} of ${base.total}).`);
  for (const [f, b, n] of better) console.log(`  improved  ${f}: ${b} -> ${n}`);
  for (const [f, b, n] of worse) console.log(`  REGRESSED ${f}: ${b} -> ${n}`);
  process.exit(0);
}

console.log(`falsifiable gate: ${hollowTotal} of ${total} blocks cannot fail (baseline ${base.hollowTotal}/${base.total}) · ${tripwires} tripwires`);
for (const [f, b, n] of better) console.log(`  improved: ${f} ${b} -> ${n}  (run --update to ratchet this in)`);

if (worse.length === 0 && added.length === 0) {
  console.log('no file got worse. OK.');
  process.exit(0);
}
console.error('\nFAIL — tests whose assertions cannot fail were added:\n');
for (const [f, b, n] of worse) {
  console.error(`  ${f}: ${b} -> ${n}`);
  for (const c of detail[f].hollowCases) console.error(`      ${c.title}  [${c.flags.join(',')}]`);
}
for (const [f, n] of added) {
  console.error(`  ${f}: NEW FILE with ${n} unfalsifiable case(s)`);
  for (const c of detail[f].hollowCases) console.error(`      ${c.title}  [${c.flags.join(',')}]`);
}
console.error(`
What each flag means, and the fix:
  self-skip-return  \`if (!x) { console.log('SKIP'); return; }\` — a case that opts out
                    when the precondition is missing. SEED the precondition instead, or
                    assert that it exists. A skip that always fires is a case that never runs.
  gte-0             \`expect(n).toBeGreaterThanOrEqual(0)\` is true of every count.
  expect-true       \`expect(true).toBe(true)\`.
  zero-or-ok        \`status === 0 || (status >= 200 && status < 300)\` passes when no
                    request fired at all.
  either-or-pass    "either outcome is a pass" — pick the one the product must do.

If a case genuinely documents a KNOWN DEFECT, put \`test.fail()\` inside its body and
assert the correct behaviour. That is not hollow: it turns red the day the bug is fixed.
Pair it with an ordinary test over the same path (see harness ref 12.31) — a tripwire
counts any throw as its expected failure, so without a canary a broken locator reads as
a confirmed defect.
`);
process.exit(1);
