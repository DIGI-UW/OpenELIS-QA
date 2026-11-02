# Calculated value rule integrity

Spec: `tests/calculation-rule-integrity.spec.ts`. Written 31 Oct 2026 against testing.openelis-global.org (develop 615942a7). TC-CALCI-00 is a guard; 01 to 04 are tripwires (`test.fail()`) until the rule API refuses these rules. Every rule the spec creates is deactivated in `afterAll`. Rule names carry a per-run suffix (the API refuses an existing name, even an inactive one), and tests are picked from those no active rule uses. Ticket: OGC-1587.

### TC-CALCI-00: An ordinary rule with a fresh name saves

Guard and canary. B = C * 2 under a new name saves with 200. If it does not, a refusal in 01 to 04 is a harness problem, not a fix.

### TC-CALCI-01: A rule that reads its own test is refused
A rule whose output test is also one of its operands (Albumin = Albumin * 2) is refused with a 4xx. Today it saves with 200.

### TC-CALCI-02: A rule that closes a cycle is refused
With ALP = BUN * 2 active, BUN = ALP * 2 is refused. Today both save, and result entry stores order-dependent values.

### TC-CALCI-03: A second active rule for the same test is refused
Two active rules writing the same test are refused (or the second one is). Today both save.

### TC-CALCI-04: An entered result is not overwritten by a rule that reads it
With a self-referencing rule active, a technician's 5.5 is stored as 5.5. Today it is stored as 11.0 (observed on testing, order DEV01260000000001755). With ten such rules left on testing by earlier QA runs, entering GPT/ALAT and GOT/ASAT answered 500 (StaleStateException) and saved nothing.
