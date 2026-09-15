/**
 * What counts as an assertion, in one place.
 *
 * The coverage report and the ESLint gate both have to answer "does this test
 * actually check anything?", and they disagreed. `check-coverage-gaps` matched
 * `expect(` and so missed `expect.poll(` — which is how TC-DEEP-TERMINOLOGY, a
 * test with a real REST round-trip assertion, was reported as proving nothing.
 * ESLint meanwhile allowed two helper names that do not exist in this repo and
 * omitted three that do.
 *
 * DELIBERATELY NOT ASSERTIONS:
 *   markStep(...)     — only throws on the 'FAIL' verdict (harness ref 12.1), so
 *                       a markStep('PASS')-only test still proves nothing. This
 *                       matches the ESLint config's long-standing reasoning.
 *   assertIdentity()  — despite the name, it RETURNS {ok, method, detail} and
 *                       throws nothing. The caller has to assert on .ok. A
 *                       function named assert* that does not assert is a trap;
 *                       renaming it is tracked in open-questions.md.
 */

/** Helper functions that themselves call expect() and throw on failure. */
export const ASSERTION_HELPERS = [
  'assertOrderPersisted',    // tests/docs/order-helpers.ts — expect(ok).toBeTruthy()
  'assertSamplePersisted',   // tests/docs/order-helpers.ts — expect(samples.length)…
  'expectNoErrorPage',       // test-catalog-mgmt.spec.ts — expect(url).not.toContain…
];

/** Names ESLint's playwright/expect-expect should accept. `expect` covers expect.poll/soft/fail. */
export const ASSERT_FUNCTION_NAMES = ['expect', ...ASSERTION_HELPERS];

/**
 * Strip comments and string literals, so PROSE is never read as code.
 *
 * This is not hypothetical. TC-ANZ-M3-20 carries the comment
 *   "an earlier revision of this case silently test.skip()'d on that"
 * and a raw-text scan read that as an unconditional skip, reporting one of the
 * suite's most important round-trip tests as proving nothing. The inverse is
 * worse: a comment that merely mentions `expect(` would make a genuinely
 * assertion-free test look checked, which is the exact failure these gates
 * exist to catch.
 */
export function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length && !(src[i] === q && src[i - 1] !== '\\')) i++;
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * Does this test body assert anything? Covers `expect(`, any `expect.x(` form
 * (poll, soft, fail), and the helpers above. Comments and strings are stripped
 * first — see codeOnly.
 */
const RE = new RegExp(
  String.raw`\bexpect\s*(?:\.\s*\w+\s*)?\(|\b(?:${ASSERTION_HELPERS.join('|')})\s*\(`
);
export function assertsSomething(body) {
  return RE.test(codeOnly(body));
}

/**
 * Is this test skipped no matter what? A `test.skip(cond, reason)` guard is a
 * declared precondition, not a disabled test; only a bare `test.skip()` or a
 * body that opens with an unconditional skip counts.
 */
export function alwaysSkips(body) {
  const code = codeOnly(body);
  return /\btest\.skip\s*\(\s*\)/.test(code) || /\btest\.fixme\s*\(\s*\)/.test(code);
}
