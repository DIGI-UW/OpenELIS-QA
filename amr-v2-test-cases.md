# Microbiology / AMR V2: test cases

**Spec:** `tests/amr-v2.spec.ts`, config `amr.config.ts` (not in CI; see `ci-suites.json`).
**Written:** 19 Oct 2026 against pngtest.openelis-global.org (Microbiology V2 stack, OGC-1383, 3.3.0-SNAPSHOT), two sweeps. Moved into the repo 2 Nov 2026.
**Fixture (pngtest, QA_AMR):**
- Tests 380 Bacterial culture (Urines), 381 Blood culture (Whole Blood, collected in sets), 382 TB culture (Sputum), 383 Xpert MTB/RIF (Sputum), 384 Gram stain.
- Synthetic breakpoint standard CLSI QA-SYNTH-2026 and medium lot QABAP-LOT1 (20 plates).
- Orders:
  - DEV01260000000000002: urine case, E. coli, AST AMP/CIP/CRO, final, then amended.
  - DEV01260000000000003: blood culture, 4 bottles in 2 sets, BC-1A positive.
  - DEV01260000000000004: sputum TB case (MDR) plus a urine case transferred to Mycobacteriology.
- Override the ids with `AMR_TEST_*`, `AMR_CASE_ACCESSION`, `AMR_BC_ACCESSION` and `AMR_TB_ACCESSION` when the fixture is rebuilt elsewhere.

**IDs:** TC-AMR-Gnn are guards and TC-AMR-Tnn tripwires; the v3.2 FRS and the QA handoff cite them as AMR-Gnn and AMR-Tnn.

**Tripwires** carry `test.fail()` and name where the fix is tracked:
- server fixes: OGC-1522 to OGC-1527;
- everything else: an acceptance criterion of the Microbiology v3.2 FRS (Part C, AC-Q-nn), epic OGC-1528.

When a tripwire goes red, the fix has landed: remove its `test.fail()`.

**Time zone rule (Casey, 19 Oct and 2 Nov 2026):** dates and times follow the server's time zone. This is never a bug, and an admin setting for it is designed. The original AMR-T01 (TC-AMR-T01) (date of birth a day early in a browser west of UTC, finding A1) was removed for that reason.

| ID | Case | Kind |
| --- | --- | --- |
| TC-AMR-G01 | The microbiology worklist route renders and is in the side nav | Guard |
| TC-AMR-G02 | The UAT scenario endpoint is not exposed (404) | Guard |
| TC-AMR-G03 | Program has Show on Microbiology case and Reporting track; the catalog has Opens a Microbiology case | Guard |
| TC-AMR-G04 | Preview: two urines with a bacterial culture open one Bacteria case; Gram stain stays in Results (AC-01, AC-103) | Guard |
| TC-AMR-G05 | Preview: TB culture and Xpert on one sputum open one Mycobacteriology case | Guard |
| TC-AMR-G06 | Preview: a urine culture and a sputum TB culture open two cases in their own lab units | Guard |
| TC-AMR-G07 | Preview: a wrong blood culture set assignment warns but does not block (AC-104) | Guard |
| TC-AMR-G08 | A final-released case refuses writes with 409 MICROBIOLOGY_CASE_LOCKED (AC-45) | Guard |
| TC-AMR-G09 | Breakpoint interpretation on the fixture case: AMP R, CIP S, CRO R after the amended retest | Guard |
| TC-AMR-G10 | Culture media never consume stock: the fixture lot keeps its received quantity | Guard |
| TC-AMR-G11 | Report versions read Partial, then Final | Guard |
| TC-AMR-G12 | An inoculation time in the future is refused (AC-95) | Guard |
| TC-AMR-G13 | One bottle positive while the others keep incubating (AC-54) | Guard |
| TC-AMR-G14 | RIF R and INH R, validated, classify as MDR (AC-27) | Guard |
| TC-AMR-G15 | Transfer writes a CASE_TRANSFERRED timeline entry (AC-04) | Guard |
| TC-AMR-T02 | "Preliminary" never reaches the case UI (A2, A28) | Tripwire, v3.2 AC-Q-10 |
| TC-AMR-T03 | A blocked final release answers 4xx with a reason, not 500 (A3) | Tripwire, OGC-1522; skips until an open fixture case exists |
| TC-AMR-T04 | Time to positivity reads as days, hours and minutes in words (A8) | Tripwire, v3.2 R-CULT-4 |
| TC-AMR-T05 | The AST table never shows the literal "None" (A9) | Tripwire, v3.2 R-AST-2 |
| TC-AMR-T06 | The isolate identification method list has no HIV or syphilis kit methods (A5) | Tripwire, v3.2 AC-Q-40; skips until an open fixture case exists |
| TC-AMR-T07 | The bench excludes final-released cases (A15) | Tripwire, OGC-1525 |
| TC-AMR-T08 | Organism required fields are marked, and errors use field labels (A12) | Tripwire, OGC-1527 |
| TC-AMR-T09 | A blood culture case header reads "2 sets, 4 bottles" (A20) | Tripwire, OGC-1523 |
| TC-AMR-T10 | An extension with reason Other and no note is refused (A23) | Tripwire, OGC-1524 |
| TC-AMR-T11 | Cases from one order list each other as related (A22) | Tripwire, v3.2 R-LINK-1 |
| TC-AMR-T12 | A multi-sample case offers Split (A21) | Tripwire, v3.2 R-LINK-2 |


## Release on testing after #4819 (tests/amr-release-ogc1605-1606.spec.ts, 4 Nov 2026)

Runs on testing.openelis-global.org with the QA_AUTO seed (helpers/amr-seed.ts, fixtures/amr-qa/). Each run places one QA_AUTO Urine culture order and releases it.

| TC | What it checks | Kind |
|---|---|---|
| TC-1606-01 | A culture ordered through Clinical Order Entry opens a case, and releases partial then final with no report mapping; the case reads "Final case is read-only" | Guard, OGC-1606 (closed 4 Nov) |
| TC-1605-01 | The released Patient Status Report prints E. coli, the 10-agent panel and the edition (no 200-character cap) | Guard, OGC-1605 item 1 |
| TC-1605-02 | A Susceptible agent set to SUPPRESS_UNLESS_RESISTANT (Meropenem) is left off the released report | Tripwire, OGC-1605 item 2 |

**Not covered:**
- Roles and lab-unit rights (needs a non-admin pngtest login).
- Incoming analyzer results, referral dispatch, labels and bench sheets, reflex rules on cultures.
- NCE from a case, French, offline behaviour and narrow layout.

The v3.2 FRS Part C lists the acceptance criteria that QA adds tripwires for once v3 is built.
