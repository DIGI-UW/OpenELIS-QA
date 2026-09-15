/**
 * One definition of "a test case ID", shared by every script that counts them.
 *
 * Getting this wrong is the recurring failure in this repo's tooling. The first
 * coverage script used `TC-[A-Za-z0-9]+-\d+`, which silently dropped 575 of
 * master-test-cases.md's 1504 case headings — every multi-segment ID such as
 * TC-ADMIN-SITEINFO-TABLE-01 — and reported the remainder as if it were the
 * whole catalogue. Shapes that must all match:
 *
 *   TC-01                          bare (references/test-cases.md, some of master)
 *   TC-HP-01                       the common case
 *   TC-ADMIN-SITEINFO-TABLE-01     multi-segment
 *   TC-RPT-R01                     letter-prefixed number
 *   CLEANUP-01                     teardown cases
 *   TC-DEEP-FILTER                 no number at all (test-catalog-mgmt-deep.md)
 *
 * And cases are DECLARED in two layouts, not one. The older catalogues use
 * headings; every per-feature suite written since (analyzer guided setup, label
 * presets, test catalog management) uses a Markdown TABLE row:
 *
 *     ### TC-HP-01 — Rule with ALL Overall Option        <- heading form
 *     | TC-LP-01 | List renders with the 5 system presets | RENDER | PASS |
 *
 * Reading only the heading form is what made those suites invisible to the
 * coverage report, so their tested cases were counted as gaps.
 *
 * If you change this, run `npm run catalogue:selftest` — it asserts each shape.
 */
// Loose scanning (prose, "which IDs does this file mention"): require a numeric
// terminal, so ordinary hyphenated capitals in text are not swept up.
export const CASE_ID = /\b(?:TC|CLEANUP)-(?:[A-Z0-9]+-)*[A-Z]?\d+\b/g;

// Anchored positions — a heading, a table cell, a test() title — are constrained
// enough by their surroundings to also admit the all-alphabetic terminal
// (TC-DEEP-FILTER). Do NOT use this pattern for loose scanning.
const ANCHORED = '(?:TC|CLEANUP)-[A-Z0-9]+(?:-[A-Z0-9]+)*';

/** A heading that DECLARES a case, e.g. `### TC-HP-01 — Title` or `#### TC-HP-01: Title`. */
export const CASE_HEADING = new RegExp(
  `^#{2,6}[ \\t]+(${ANCHORED})[ \\t]*(?:[—–:-][ \\t]*(.*))?$`, 'gm');

/** A test(...) call in a spec that CLAIMS a case ID. */
export const TEST_CALL = new RegExp(
  `\\btest(?:\\.\\w+)*\\s*\\(\\s*['"\`](${ANCHORED})`, 'g');

/** A table row that declares a case: `| TC-LP-01 | Title | ... |`. */
export const CASE_ROW = new RegExp(
  `^[ \\t]*\\|[ \\t]*(${ANCHORED})[ \\t]*\\|([^|\\n]*)`, 'gm');

/** Every case a file DECLARES, in either layout. id -> title. */
export function declaredIn(src) {
  const out = new Map();
  for (const m of src.matchAll(CASE_HEADING))
    if (!out.has(m[1])) out.set(m[1], (m[2] ?? '').trim());
  for (const m of src.matchAll(CASE_ROW))
    if (!out.has(m[1])) out.set(m[1], (m[2] ?? '').trim().replace(/\*\*/g, ''));
  return out;
}

/** @deprecated use declaredIn — kept so an old caller cannot silently see half the cases. */
export function headingsIn(src) { return declaredIn(src); }
export function idsMentionedIn(src) {
  return new Set(String(src).match(CASE_ID) ?? []);
}
export function testIdsIn(src) {
  const out = new Set();
  for (const m of src.matchAll(TEST_CALL)) out.add(m[1]);
  return out;
}
