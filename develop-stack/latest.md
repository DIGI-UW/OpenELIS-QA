# develop-stack: develop ``



Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/38791266222 · TZ UTC · 2026-10-15T21:36:57.731Z

**134 NEW FAILURE(S)**: 134 failing = 0 known + 134 new; 0 known reds now pass. (Baseline is in bootstrap mode: new failures are reported, not gated.)

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 351 | 8 | 8 | 0 |
| census | 126 | 3 | 3 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 3 | 3 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 3 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 2 | 0 |
| lp | 7 | 3 | 3 | 0 |
| modify-order | 7 | 1 | 1 | 0 |
| modules | 1171 | 88 | 88 | 0 |
| multicomponent | 3 | 0 | 0 | 0 |
| ogc1192 | 9 | 0 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 |
| personas-admin | 10 | 2 | 2 | 0 |
| personas-roles | 13 | 1 | 1 | 0 |
| pr3987 | 10 | 3 | 3 | 0 |
| preflight | 4 | 0 | 0 | 0 |
| probe-combo | 3 | 0 | 0 | 0 |
| qa | 0 | 1 | 1 | 0 |
| rbac | 57 | 0 | 0 | 0 |
| regression-chains | 84 | 13 | 13 | 0 |
| regression-seed | 13 | 1 | 1 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 2 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (134)

- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-home: Home dashboard has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-add-order: Add Order (legacy wizard) has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-enter-order: Enter Order (v4) has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-results: Results Entry has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-validation: Validation has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-patient: Patient Management has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-pathology-dashboard: Pathology dashboard has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-pathology-case: Pathology case view has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-eqa-my-cycles: EQA My Cycles has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-inventory: Inventory Management has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-storage: Storage Management has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-locations: Locations & Organizations has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-admin: Admin landing has no new serious or critical WCAG violations`
- `modules|modules|tests/a11y-axe-scan.spec.ts|Accessibility scan, WCAG 2.1 A/AA (TC-AXE) > TC-AXE-alerts: Alerts has no new serious or critical WCAG violations`
- `modules|modules|tests/app-shell.spec.ts|Logout (OGC-1448) > TC-SHELL-02: after Logout the login page does not report the server as unreachable [FLIP-WHEN-FIXED]`
- `modules|modules|tests/app-shell.spec.ts|Page titles (OGC-1448) > TC-SHELL-10: each screen #4681 walked has exactly one h1, its title`
- `modules|modules|tests/calculated-values-ui.spec.ts|Calculated Values — UI round-trip (TC-CALC-UI) > TC-CALC-UI-02: dictionary/relational calc built in the UI persists testId + dictionary value`
- `modules|modules|tests/calculated-values.spec.ts|Calculated Values Management (Phase 28) > TC-CALC-05c: POST /rest/test-calculation updates existing rule`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-04-low: a failed save on a record low in a long list is reported where the user pressed Save (OGC-1263)`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-04-ok: a save that succeeds on a record low in a long list says so where the user is looking (control for TC-LORG-04)`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-07g: the default sort (Name) lists records in name order across pages (FR-B1, FR-B2) [FIXED OGC-1363]`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-28t: exporting the referral labs and re-importing that file in Replace mode changes nothing (AC12)`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-18: edits keep the FHIR UUID; Shipment Settings still points at its organization; FHIR and legacy reads still answer (FR-A5)`
- `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-13: Submit order and verify success message`
- `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-14: Print labels and Done buttons appear after submission`
- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-02: legacy Add Order: Next then Back keeps an unticked test unticked (OGC-1388) [FIXED OGC-1388]`
- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-11: Enter Order: a late response for the previous sample type does not replace the list (OGC-1266)`
- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-12: Enter Order: a failed tests request does not leave "Loading" forever (OGC-1266)`
- `modules|modules|tests/order-entry-release-blockers.spec.ts|Order entry — release blockers > BLK-LAB-4 — a field marked required to sighted users is marked required in the DOM`
- `modules|modules|tests/order-entry-release-blockers.spec.ts|Order entry — the patient blockers > BLK-AL-2 — National ID, when the config requires it, is marked required in the DOM`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1419 collector optional on Prepare Samples > TC-OEV4-COL-01 no collector: checklist never asks for one, Save and next saves`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1419 collector optional on Prepare Samples > TC-OEV4-COL-02 the Collector field is not marked required`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1419 collector optional on Prepare Samples > TC-OEV4-COL-03 a collector saves, reads back, and clearing it saves blank`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1422 labels from Prepare Samples > TC-OEV4-LBL-01 Print all labels returns one PDF holding every label the section counts`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1422 labels from Prepare Samples > TC-OEV4-LBL-02 a changed quantity is saved before printing and reads back as saved`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1422 labels from Prepare Samples > TC-OEV4-LBL-03 a quantity above the preset maximum is never stored`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1422 labels from Prepare Samples > TC-OEV4-LBL-04 a failed PDF says so and Retry prints`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1422 labels from Prepare Samples > TC-OEV4-LBL-05 a blocked print window falls back to a download and says so`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1423 Refer Out from Prepare Samples > TC-OEV4-REF-01 a staged referral is not stored until the step is saved, and a reload drops it`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1423 Refer Out from Prepare Samples > TC-OEV4-REF-02 partial referral: one of two tubes referred, the order still needs Sample check`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1423 Refer Out from Prepare Samples > TC-OEV4-REF-03 every tube referred: order entry finishes at Prepare Samples and the test leaves the worklist`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1423 Refer Out from Prepare Samples > TC-OEV4-REF-04 a referred tube cannot be referred a second time`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1423 Refer Out from Prepare Samples > TC-OEV4-REF-05 a save that fails keeps the staged referral and stores nothing`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-05 Add new organization lists the facility named the same apart from common words`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-08 Received by reads "(you)" with Change, and Change opens a user search`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-09 Mark tested elsewhere from the row menu: Tag, value saved, and Not tested elsewhere undoes it`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-10 Tested elsewhere records the performing laboratory (FR-B20)`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-12 the clinical sample row has no retired fields; it has the Handling group`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-13 a handling mismatch shows one Tag, offers a non-conformity, and never blocks the save`
- `modules|modules|tests/order-entry-v4-acceptance.spec.ts|OGC-1424 M14 order entry clean-up > TC-OEV4-M14-14 Same for all samples copies Arrived as to every primary sample`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-NET network resilience > TC-OEV4-NET-04 a save that never reaches the server keeps the form and says not saved (R-NET-7, was TC-NET-04, gate G8)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-NET network resilience > TC-OEV4-NET-05 a save whose response is lost can be retried without an "in use" dead end or a second order (R-NET-4, was TC-NET-05)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-NET network resilience > TC-OEV4-NET-06 a slow save disables the button and a double click sends one request (R-NET-6, R-NET-7, was TC-NET-06, gate G9)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-DATA data integrity > TC-OEV4-DATA-01 one collected sample shows once, one label row, request marked collected (R-DATA-1, was TC-OEW-05)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-DATA data integrity > TC-OEV4-DATA-02 a member test alone saves no panel (R-DATA-2, was TC-OEW-03)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-DATA data integrity > TC-OEV4-DATA-05 Back to Enter Order and forward keeps the collection date and time (R-DATA-5, was TC-OEW-06, gate G3)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-TIME one clock > TC-OEV4-TIME-01 collection and received defaults come from one clock (R-TIME-1, was TC-OEW-08)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-TIME one clock > TC-OEV4-TIME-02 today in the lab saves from a browser 10 h ahead of the server (R-TIME-2, was TC-OEW-07)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-FLOW-02 the counter and the steps agree after Enter Order is saved (R-FLOW-2, was TC-ODB-02)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-FLOW-03 Sample check: every item passed, Release for testing completes the order (R-FLOW-1, M6 step 6, was TC-OEW-11, gate G5)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-FLOW-04 Optional checklist: releasing with items unanswered asks for a reason (M6 step 4)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-FLOW-05 answers chosen but not yet accepted are not called "unanswered" (R-UX-1, M6)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-UX-01 Enter Order and Prepare Samples show no raw i18n keys (R-UX-1)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-FLOW and R-UX > TC-OEV4-UX-03 a duplicate lab number is refused in plain language and the other order is untouched (R-UX-1, was TC-OEW-13, gate G4)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|Regression gate (acceptance script G1 to G11) > TC-OEV4-GATE-02 what is saved matches what was selected, per sample (G2, was TC-OEW-02)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|Regression gate (acceptance script G1 to G11) > TC-OEV4-GATE-06 the dashboard Continue resumes an order at the step it stopped (G6, was TC-OEW-16)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|Regression gate (acceptance script G1 to G11) > TC-OEV4-GATE-07 a saved order reads back with its sample, test, facility and received date (G7, was TC-EO-05)`
- `modules|modules|tests/pathology-ihc-happy-path.spec.ts|Pathology and IHC happy path (TC-PATHHP, TC-IHCHP) > TC-PATHHP-02: grossing with two blocks is saved and read back`
- `modules|modules|tests/reference-lab-results-fhir-contract.spec.ts|Reference Lab Results — FHIR contract (OGC-802 / 805 / 809) > RLR-FHIR-04 [OGC-802/805]: a returned referral carries the peer result card, or says why none exists`
- `modules|modules|tests/reflex-testing-ui.spec.ts|Reflex Tests — UI round-trip (TC-REFLEX-UI) > TC-REFLEX-UI-01: rule built in the UI persists condition testId AND action reflexTestId`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Tests Management (Phase 28) > TC-REFLEX-01: Reflex Tests Management page loads with rule builder`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Tests Management (Phase 28) > TC-REFLEX-04b: POST /rest/reflexrule creates a new rule via API`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Rule Lifecycle Tests (Phase 28 Extended) > TC-REFLEX-07: Create reflex rule and verify it appears in GET /rest/reflexrules`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Rule Lifecycle Tests (Phase 28 Extended) > TC-REFLEX-09: Inactive reflex rule is visible in the list`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT) > TC-REFLEX-EXT-01: Rule with GREATER_THAN condition saves and round-trips correctly`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT) > TC-REFLEX-EXT-02: Rule with ALL operator requires all conditions to match`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT) > TC-REFLEX-EXT-03: Deactivating a rule preserves it in list with active=false`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT) > TC-REFLEX-EXT-05: Reflex rule notification flag is stored correctly`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT) > TC-REFLEX-EXT-06: Multiple active rules coexist without interference`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-02 results, flags, ranges and units print as stored; Complete vs Partial per order`
- `modules|modules|tests/reports-output-correctness.spec.ts|Routine Reports: output matches the request > TC-RPTOUT-04: Activity report by test type returns a PDF`
- `modules|modules|tests/reports-output-correctness.spec.ts|Date pickers on a full page load (R26) > TC-DP-01: after a full load the picker maxDate is today, not 9 January`
- `modules|modules|tests/sample-shipment.spec.ts|Shipment API Extended (TC-SHIP-EXT) > TC-SHIP-EXT-02: Facilities API returns destination labs list`
- `modules|modules|tests/session-security.spec.ts|Suite U-DEEP — Security Headers & Rate Limiting (TC-SESS-09–16) > TC-SESS-16: Session expiry returns 401/302, not 500`
- `modules|modules|tests/table-labels.spec.ts|Tables > TC-TBL-00: CANARY the Inventory table offers several page sizes`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-01: no page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-02: no Admin page shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `qa|setup|auth.setup.ts|authenticate`
- `regression-chains|chain-ab|tests/chains/chain-ab-env-holding-time.spec.ts|Chain AB — Env Holding-Time + Sertifikat Hasil Uji > Step 2 — Expired sample shows "Holding Time Exceeded" + boxed result (CROSS-LINK)`
- `regression-chains|chain-b|tests/chains/chain-b-rejection.spec.ts|Chain B — Rejection → NCE → Report > Step 3 — Reject the sample via API substitute (PERSIST)`
- `regression-chains|chain-c|tests/chains/chain-c-reflex-trigger.spec.ts|Chain C — Reflex Trigger > Step 2 — Find matching reflex rule (FUNCTION)`
- `regression-chains|chain-d|tests/chains/chain-d-calculated-value.spec.ts|Chain D — Calculated Value > Step 4 — Verify all operand results persisted (ROUND-TRIP)`
- `regression-chains|chain-e|tests/chains/chain-e-sample-validation-lifecycle.spec.ts|Chain E — Sample Validation Lifecycle > Step 2 — Enter initial (wrong) result via API (PERSIST, §11.5)`
- `regression-chains|chain-f|tests/chains/chain-f-eqa-distribution.spec.ts|Chain F — EQA Distribution > Step 3 — Create EQA distribution / shipment (PERSIST)`
- `regression-chains|chain-g|tests/chains/chain-g-cold-chain-excursion.spec.ts|Chain G — Cold-Chain Excursion > Step 1 — Cold Storage device exists (FUNCTION)`
- `regression-chains|chain-k|tests/chains/chain-k-fhir-round-trip.spec.ts|Chain K — FHIR Round-trip > Step 5 — POST a new Patient via FHIR (PERSIST, write surface)`
- `regression-chains|chain-m|tests/chains/chain-m-vector-surveillance.spec.ts|Chain M — Vector Surveillance (deep round-trip) > Step 1 — Vector Identification worklist read-back contract (ROUND-TRIP)`
- `regression-chains|chain-n|tests/chains/chain-n-environmental-sampling.spec.ts|Chain N — Environmental Sampling (deep round-trip) > Step 4 — Env order create -> read-back (ROUND-TRIP)`
- `regression-chains|chain-o|tests/chains/chain-o-referral-roundtrip.spec.ts|Chain O — Referral round-trip > Step 2 — Search returns referral rows with contract fields (CROSS-LINK)`
- `regression-chains|chain-w|tests/chains/chain-w-pathology-case.spec.ts|Chain W — Pathology case lifecycle > Step 4 — Case detail endpoint is wired (CROSS-LINK)`
- `regression-chains|chain-y|tests/chains/chain-y-compliance-reporting.spec.ts|Chain Y — SILNAS compliance reporting > Step 1 — Compliance dashboard summary contract (ROUND-TRIP)`
- `all-tc|test-catalog|test-catalog-chaos-admin.spec.ts|Test Catalog chaos: Sample Types (TC-CX-STY) > TC-CX-STY-03: the domain rule holds from the sample type side: a vector test cannot be linked to a clinical sample type`
- `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-5: Basic Info save round-trips the name, the French name, the Active toggle and a truncated description`
- `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-10: deactivating a lab unit that still holds an assigned test is allowed without a prompt (CONTRACT FACT — unbuilt OGC-189 AC, FLIP-WHEN-FIXED)`
- `all-tc|test-catalog|test-catalog-lab-unit-management.spec.ts|Lab Unit Management — first-increment CRUD contract (OGC-189, PR #4121) > LU-5: assigned-tests contract returns the expected per-test shape for a populated lab unit (ROUND-TRIP)`
- `all-tc|test-catalog|test-catalog-lab-unit-visibility.spec.ts|Lab unit visibility — choosers vs viewers (OGC-189) > G-2: [FLIP-WHEN-FIXED] the filtering is inverted — the VIEWER hides inactive units while the CHOOSER offers them`
- `all-tc|test-catalog|test-catalog-lab-unit-visibility.spec.ts|Lab unit visibility — choosers vs viewers (OGC-189) > G-4: [GUARDRAIL] no lab unit holding content is hidden from every viewer at once`
- `all-tc|test-catalog|test-catalog-section-depth.spec.ts|Localization > TC-SD-21: a renamed test shows its new name in the test pickers`
- `all-tc|test-catalog|tests/reference-lab-results-fhir-contract.spec.ts|Reference Lab Results — FHIR contract (OGC-802 / 805 / 809) > RLR-FHIR-04 [OGC-802/805]: a returned referral carries the peer result card, or says why none exists`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-DOMAIN: domain change is guarded by sample-type consistency (422) [CONTRACT]`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-METHOD-LINK: link a method reads back via REST [ROUND-TRIP]`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-PANEL-ASSIGN: assign test to a panel reads back via REST [ROUND-TRIP]`
- `e2e|e2e|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- `e2e|e2e|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `e2e|e2e|test-catalog-titer-runtime.spec.ts|Test Catalog editor — Titer result type at runtime > TCC-T: Titer test → order → renders an interactive result-entry control → save → validate`
- `guards|guards|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- `guards|guards|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `rtype|rtype|tests/result-type-coverage.spec.ts|TC-RTYPE — result type coverage > TC-RTYPE-1: no configured test declares a result type the results UI cannot render`
- `rtype|rtype|tests/result-type-coverage.spec.ts|TC-RTYPE — result type coverage > TC-RTYPE-2: the editor does not offer a type the results UI cannot render`
- `census|census|tests/app-route-census.spec.ts|TC-APP-CENSUS — every working route renders > TC-APPCENSUS-analyzers: Analyzers List renders`
- `census|census|tests/app-route-census.spec.ts|TC-APP-CENSUS — every working route renders > TC-APPCENSUS-analyzers-errors: Analyzer Error Dashboard renders`
- `census|census|tests/app-route-census.spec.ts|TC-APP-CENSUS — every working route renders > TC-APPCENSUS-analyzers-types: Analyzer Types renders`
- `lp||label-presets.spec.ts|TC-LP-03: filter narrows the list (FUNCTION)`
- `lp||label-presets.spec.ts|TC-LP-05: editing a preset dimension in the UI saves and reads back [ROUND-TRIP]`
- `lp||label-presets.spec.ts|TC-LP-09: a successful save shows a confirmation [FUNCTION]`
- `modify-order|modify-order|tests/modify-order-field-binding.spec.ts|Modify Order — field binding and save gate (FLIP-WHEN-FIXED) > MO-5: [DEFECT] the field that hard-blocks Submit is not marked required, and its error is never wired to the input`
- `personas-admin|persona-pd|tests/personas/persona-pd-lab-manager.spec.ts|Persona PD — Lab Manager > Step 3 — Pull Rejection Report PDF (REPORTABLE, BUG-29 catch)`
- `personas-admin|persona-pf|tests/personas/persona-pf-lab-administrator.spec.ts|Persona PF — Lab Administrator (first-time setup) > Step 4 — Enable EQA (the hidden-requirement catch)`
- `personas-roles|persona-pa-role|tests/personas/persona-pa-receptionist.spec.ts|Persona PA — Receptionist > Step 4 — Place order on Routine Testing program (PERSIST)`
- `pr3987|pr3987-patient|patient-photo-pr3987.spec.ts|item 10 — photo dialogs escape the disabled fieldset and keep their controls live`
- `pr3987|pr3987-patient|patient-photo-pr3987.spec.ts|follow-up — Add Order photo remains editable on a read-only patient panel`
- `pr3987|pr3987-fhir|fhir-specimen-terminology-pr3987.spec.ts|PR #3987 — FHIR terminology reaches, and respects, the specimen > items 3 + 6 + 4 — specimen codings emitted, filtered per specimen, names distinct`
- `regression-seed|ci-fixtures|ci-fixtures.setup.ts|ci-fixture: inactive lab unit holding a test (G-2, G-4)`

## Known reds by ticket

