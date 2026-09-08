// Flat ESLint config. Narrow on purpose: this repo's lint gate exists to stop
// ONE class of defect — a test that runs, goes green, and proves nothing.
//
// Why (2026-09-03, OGC-1192 post-mortem): a scan of the repo found 215 named
// test cases with zero assertions, 36 of which can print the word "FAIL" to
// the console and still pass, e.g.
//
//     const ok = await thing.isVisible().catch(() => false);
//     console.log(ok ? 'TC-X: PASS' : 'TC-X: FAIL');   // <- test passes either way
//
// `playwright/expect-expect` makes that shape impossible to ADD. The existing
// backlog is held in .assert-baseline.json and can only shrink — same contract
// as the typecheck backlog in .github/workflows/typecheck.yml.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import { ASSERT_FUNCTION_NAMES } from './scripts/assertions.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'regression-results/**', 'archive/**', 'evals/**'] },
  js.configs.recommended,
  // The repo carries `// eslint-disable-next-line no-console` comments from an
  // era when no-console was on. It is off here (specs log deliberately), so
  // those directives are unused — reporting them would bury the real signal.
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['**/*.spec.ts', '**/*.setup.ts'],
    ...playwright.configs['flat/recommended'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // THE GATE. A test block that reaches its end without asserting fails lint.
      // assertFunctionNames lists helpers that assert on the test's behalf, so a
      // genuine helper-based assertion is not a false positive. Do NOT add
      // markStep here: markStep only fails on 'FAIL', so a markStep('PASS')-only
      // test asserts nothing and must still be caught.
      // The list is derived from scripts/assertions.mjs so this gate and the
      // coverage report agree on what an assertion is. They did not: the two
      // names that used to sit here (expectRowCount, assertNoServerErrors) do
      // not exist anywhere in the repo, while three helpers that really do call
      // expect() and throw were missing, so tests using only those were
      // reported as assertion-free.
      //
      // Still deliberately ABSENT: markStep (throws only on the FAIL verdict,
      // so a markStep('PASS')-only test proves nothing) and assertIdentity
      // (returns {ok, detail} and throws nothing — the caller must assert).
      'playwright/expect-expect': ['error', {
        assertFunctionNames: ASSERT_FUNCTION_NAMES,
      }],
      // Self-reported verdicts are the same disease in prose form; these two
      // catch the mechanical half (a test that is skipped or focused by accident).
      'playwright/no-skipped-test': 'off',   // handled by the declared-gaps work, not here
      'playwright/no-focused-test': 'error',
      'playwright/no-conditional-expect': 'off', // large existing backlog; separate pass
      // Noise that would bury the signal in a repo this size.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-undef': 'off',
    },
  },
);
