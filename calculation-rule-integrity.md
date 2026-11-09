# Calculated value rule integrity

Spec: `tests/calculation-rule-integrity.spec.ts`. Written 31 Oct 2026 against testing.openelis-global.org (develop 615942a7), when 01 to 04 were tripwires. Ticket: OGC-1587. Fixed by #4908 (develop a21c3123, on testing 2 Nov 2026): 01 to 04 flipped to guards, and 05 to 10 were added for the rest of the fix. All cases are guards.

Refusals answer 400 (404 for a missing rule) with `{ messageKey, messageArgs }`, and the cases assert the key. Every rule a case creates is deactivated after that case. Rule names carry a per-run suffix, and tests are picked from those no active rule uses. Rules are written as "out = in * 2" on Serum.

### TC-CALCI-00: An ordinary rule with a fresh name saves

Canary. B = C * 2 under a new name saves with 200. If it does not, every refusal below is a harness problem, not the product.

### TC-CALCI-01: A rule that reads its own test is refused

A = A * 2 answers 400 `calculation.error.selfReference`, and nothing is stored. On 31 Oct it saved with 200.

### TC-CALCI-02: A rule that closes a loop is refused

With B = C * 2 active, C = B * 2 answers 400 `calculation.error.cycle`.

### TC-CALCI-03: A second active rule for the same test is refused

With A = C + 0 active, A = B + 0 answers 400 `calculation.error.duplicateDestination`, and the refusal names the existing rule.

### TC-CALCI-04: A value entered before the rule's input is kept

With B = C * 2 active, enter B = 5.5, then C = 3: B stays 5.5. On 31 Oct a self-reading rule turned an entered 5.5 into 11.0 (order DEV01260000000001755).

### TC-CALCI-05: An empty result is still calculated

With B = C * 2 active, enter only C = 3: B is stored as 6. This proves 04 and 06 are not passing because the rule never runs.

### TC-CALCI-06: A calculated value edited by hand is not recalculated

B is calculated as 6 from C = 3. Then B is saved by hand as 7, and C changes to 4: B stays 7.

### TC-CALCI-07: A rule saved switched off cannot be switched on into a conflict

With A = C + 0 active, A = B + 0 saves switched off (200). Switching it on (`/activate-test-calculation/{id}`) answers 400 `calculation.error.duplicateDestination`, and the rule stays off.

### TC-CALCI-08: A rule name already in use is refused

The same name answers 400 `calculation.error.duplicateName`, and so does the name padded with spaces. Once the first rule is switched off, the name answers 400 `calculation.error.duplicateNameInactive`.

### TC-CALCI-09: Saving a rule that no longer exists answers 404

A save with an id that doesn't exist answers 404 `calculation.error.notFound`, not 500, and creates no rule.

### TC-CALCI-10: A three-rule loop is refused and named

With B = C * 2 and C = D * 2 active, D = B * 2 answers 400 `calculation.error.cycle`, and `messageArgs.cycle` names all three rules.

Not covered here: the Calculated Value admin screen showing these messages. The dev spec `ogc-1587-calculation-rule-integrity.spec.ts` drives the screen's switch-on refusal.

## Bounded evaluator (#4852, TC-CALCB)

Spec: `tests/calculated-results-bounded.spec.ts`, config `calc.config.ts`. Added 9 Nov 2026 on testing (develop c470bd68, which carries #4852 at 6a44dda30). All guards.

Contract (from the diff and `docs/upgrades/calculated-results.md`): operators `+ - * / ( ) == != >= <= && ||` and the normal-range operations after a test result; operands are bounded decimals (exponents allowed), test results and patient age; 1 to 256 operations, depth 32. A rule outside that set answers 400 `error.invalid.calculation.logic`. A non-finite result is skipped and overwrites nothing.

| ID | Case | Seen 9 Nov |
|---|---|---|
| TC-CALCB-01 | B = C * 2 with C = 20 stores `40`, not `40.0` | 40 |
| TC-CALCB-02 | B = C / 0: C saves, B stays empty (3.3.0 stored 9.2E16, develop before #4852 stored Infinity) | empty |
| TC-CALCB-03 | B = C / 30000000 with C = 1 stores a usable number | `3.3333333333333334E-8` |
| TC-CALCB-04 | `Math.max(` in a rule is refused 400, nothing stored | 400 |
| TC-CALCB-05 | C && 2 (logic on numbers) is refused 400 | 400 |
| TC-CALCB-06 | Patient Weight as an operand is refused 400 | 400 |
| TC-CALCB-07 | A constant outside the decimal grammar (`0x10`) is refused 400; `1e3` is allowed by design | 400 |
| TC-CALCB-08 | B = C >= 10 with C = 12 stores `true` (record: a condition rule writes true/false, as before #4852) | true |

Seen in the UI on 9 Nov (probe, not automated): the editor offers only Patient Age(Years) as a patient attribute, and a refused save shows "The calculation is invalid. Check its operations and numeric values." The key has no French yet.

Not covered: switching on a stored rule that uses an unsupported operation (the upgrade note says activation answers 400 and evaluation skips it). Test it on an upgrade stack, not on testing.
