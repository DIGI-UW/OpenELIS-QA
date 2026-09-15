#!/usr/bin/env node
/** Asserts the shared ID grammar matches every shape this repo actually uses. */
import { declaredIn, testIdsIn, idsMentionedIn } from './catalogue-ids.mjs';
import assert from 'node:assert';

const HEADINGS = `
## Suite A — Something
### TC-01 — Bare id
#### TC-HP-01: Common case
### TC-ADMIN-SITEINFO-TABLE-01 — Multi segment
#### TC-RPT-R01: Letter-prefixed number
### CLEANUP-01 — Teardown
### TC-DEEP-FILTER — No number at all
### TC-EO-04 — Change Sample Type (If Supported)
#### Not a case heading
`;
const h = declaredIn(HEADINGS);
const want = ['TC-01','TC-HP-01','TC-ADMIN-SITEINFO-TABLE-01','TC-RPT-R01','CLEANUP-01','TC-DEEP-FILTER','TC-EO-04'];
for (const id of want) assert.ok(h.has(id), `heading grammar missed ${id}`);
assert.strictEqual(h.size, want.length, `heading grammar matched extras: ${[...h.keys()]}`);
assert.strictEqual(h.get('TC-HP-01'), 'Common case');
assert.strictEqual(h.get('TC-EO-04'), 'Change Sample Type (If Supported)');

const SPECS = `
test('TC-HP-01: does a thing', async ({ page }) => {});
test.skip('TC-ADMIN-SITEINFO-TABLE-01 — skipped', async ({ page }) => {});
test("TC-RPT-R01: quoted differently", async () => {});
test(\`CLEANUP-01 backtick\`, async () => {});
test('not a case', async () => {});
`;
const t = testIdsIn(SPECS);
for (const id of ['TC-HP-01','TC-ADMIN-SITEINFO-TABLE-01','TC-RPT-R01','CLEANUP-01'])
  assert.ok(t.has(id), `test-call grammar missed ${id}`);
assert.strictEqual(t.size, 4);

const m = idsMentionedIn('see TC-GV-REFLEX-CREATE-02 and TC-01, plus TC-RPT-W05.');
assert.ok(m.has('TC-GV-REFLEX-CREATE-02') && m.has('TC-01') && m.has('TC-RPT-W05'), [...m].join(','));

// --- table layout: how every per-feature suite declares its cases
const TABLE = `
| ID | What it checks | Kind | Result |
|----|----------------|------|--------|
| TC-LP-01 | List renders with the 5 system presets | RENDER | PASS |
| TC-ANZ-M3-04 | "Instrument not listed?" -> Create Profile | FUNCTION | **FAIL** |
| TC-CAT-01 | List view loads with rows | RENDER |
`;
const r = declaredIn(TABLE);
for (const id of ['TC-LP-01','TC-ANZ-M3-04','TC-CAT-01'])
  assert.ok(r.has(id), `table grammar missed ${id}`);
assert.strictEqual(r.get('TC-LP-01'), 'List renders with the 5 system presets');
assert.ok(!r.has('ID'), 'header row must not count as a case');
assert.ok(declaredIn('| TC-DEEP-DUP | Duplicate name rejected | FUNCTION |').has('TC-DEEP-DUP'));

// --- negatives: loose scanning must not sweep up ordinary prose
const prose = idsMentionedIn('The TC-DEEP work and OGC-1057 and RENDER-ONLY notes.');
assert.strictEqual(prose.size, 0, `loose scan over-matched: ${[...prose]}`);
assert.ok(!declaredIn('## Suite A — Test Catalog CRUD (Admin)').size, 'suite heading must not be a case');
assert.ok(!declaredIn('| Section | Read-back endpoint | Shape |').size, 'plain table must not be a case');

// --- both layouts in one file
const MIXED = declaredIn(HEADINGS + TABLE);
assert.strictEqual(MIXED.size, want.length + 3, `mixed-layout count wrong: ${MIXED.size}`);

console.log('✓ ID grammar: 6 id shapes (bare, common, multi-segment, letter-number, CLEANUP, no-number)');
console.log('✓ declaration grammar: heading form AND table-row form, together');
console.log('✓ negatives: prose, suite headings and plain tables are not counted');
