#!/usr/bin/env node
/**
 * scripts/lint-assert-gate.mjs
 *
 * The assertion gate. Runs ESLint's `playwright/expect-expect` over the specs
 * and compares the result to .assert-baseline.json.
 *
 *   - A NEW violation, or a file whose count went UP  -> exit 1 (blocking).
 *   - Counts that went DOWN, or files that disappeared -> the baseline is stale;
 *     re-run with --update and commit it. Reported, not failed.
 *
 * Same contract as the whole-repo typecheck backlog in the CI workflow: the
 * number is visible and can only go down. It exists because the alternative —
 * turning the rule on hard against 296 pre-existing violations — makes main
 * unmergeable, and a gate people route around is worth less than no gate.
 *
 * Keyed on FILE, not line, so ordinary edits do not churn the baseline.
 *
 * Usage:
 *   node scripts/lint-assert-gate.mjs            # check (CI)
 *   node scripts/lint-assert-gate.mjs --update   # rewrite the baseline
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, '.assert-baseline.json');
const RULE = 'playwright/expect-expect';
const update = process.argv.includes('--update');

let raw = '';
try {
  raw = execFileSync(
    'npx',
    ['eslint', '--no-warn-ignored', 'tests/**/*.spec.ts', '*.spec.ts', '-f', 'json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
} catch (e) {
  // ESLint exits non-zero when it reports errors; the JSON is still on stdout.
  raw = e.stdout || '';
  if (!raw) {
    console.error('ESLint produced no output:', e.stderr || e.message);
    process.exit(2);
  }
}

const results = JSON.parse(raw);
const current = {};
const otherRules = [];
for (const file of results) {
  const rel = file.filePath.replace(`${ROOT}/`, '');
  for (const m of file.messages) {
    if (m.ruleId === RULE) current[rel] = (current[rel] || 0) + 1;
    else if (m.severity === 2) otherRules.push(`${rel}:${m.line} ${m.ruleId || '(parse)'} — ${m.message}`);
  }
}

const total = Object.values(current).reduce((a, b) => a + b, 0);

if (update) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify({ rule: RULE, total, files: sorted }, null, 2)}\n`);
  console.log(`Baseline updated: ${total} known violations across ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

// Any OTHER error-severity rule (e.g. no-focused-test) is always blocking —
// those have no backlog and must never accumulate one.
if (otherRules.length) {
  console.error(`\n${otherRules.length} blocking lint error(s) outside the assertion backlog:\n`);
  for (const l of otherRules.slice(0, 40)) console.error(`  ${l}`);
  process.exit(1);
}

if (!existsSync(BASELINE)) {
  console.error(`No ${BASELINE}. Run: npm run lint:baseline`);
  process.exit(2);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const known = base.files || {};

const regressions = [];
for (const [file, count] of Object.entries(current)) {
  const allowed = known[file] || 0;
  if (count > allowed) regressions.push({ file, allowed, count });
}
const improvements = [];
for (const [file, allowed] of Object.entries(known)) {
  const count = current[file] || 0;
  if (count < allowed) improvements.push({ file, allowed, count });
}

if (regressions.length) {
  console.error('\n✗ New test(s) with no assertions.\n');
  console.error('  A test that reaches its end without asserting cannot fail, so it');
  console.error('  cannot tell you anything. See Section 12 of');
  console.error('  references/playwright-harness.md.\n');
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.count} violations, baseline allows ${r.allowed}`);
  }
  console.error('\n  Add a real assertion. Do not raise the baseline to make this pass.\n');
  process.exit(1);
}

console.log(`✓ No new assertion-free tests. Backlog: ${total} across ${Object.keys(current).length} files.`);
if (improvements.length) {
  const fixed = improvements.reduce((a, i) => a + (i.allowed - i.count), 0);
  console.log(`\n${fixed} violation(s) fixed since the baseline — nice. Refresh it with:`);
  console.log('  npm run lint:baseline && git add .assert-baseline.json');
  for (const i of improvements.slice(0, 10)) console.log(`  ${i.file}: ${i.allowed} -> ${i.count}`);
}
