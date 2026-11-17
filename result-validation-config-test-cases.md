# Result & Validation Configuration, typed dates, workplan paging (OGC-1364, OGC-1635, OGC-1647)

Written 17 Nov 2026 against testing.openelis-global.org (develop 0937523e6), during the coverage pass for merges that landed while develop-stack CI was dark (27 Oct to 13 Nov).

## OGC-1364 Result & Validation Configuration

Spec: `tests/ogc-1364-result-validation-config.spec.ts` (modules.config.ts). PRs #5013, #5069, #5073, #5077, #5093, #5094. Replaces TC-1515-13b (the settings table is retired). Leaves "Use the validation policy" as it finds it, since testing is shared; changes only the critical result message and restores it. The dev team's `ogc-1364-*` specs turn the policy on and drive overrides and sign-off on their own stack.

| TC | What | Tier | Status |
|---|---|---|---|
| TC-1364-01 | Grouped switches with a Save per group; no Modify table; plain names; Save disabled until a change | RENDER | Guard (17 Nov, 2 of 2) |
| TC-1364-02 | The technician-name autofill switches are disabled while "Require the technician name" is off | FUNCTION | Guard (17 Nov, 2 of 2) |
| TC-1364-03 | Every description says what On does in plain words: no "If true", no raw keys | RENDER | Guard. Red on testing until its next deploy: testing's en_US.json (0937523e6) still had the Transifex "If true" text; develop's has the plain text |
| TC-1364-04 | A changed setting is saved by its group, reads back after reload and on GET /rest/ResultConfiguration | ROUND-TRIP | Guard (17 Nov, 2 of 2) |
| TC-1364-05 | A save from a page that loaded an older version answers 409, the page says why in plain words and reloads the newer value, which stands | PERSIST | Guard (17 Nov, 2 of 2) |
| TC-1364-06 | The policy flag decides the Validation group: off, "validate all results" is a switch; on, the policy section replaces it. GET /rest/validation-policy/lab-units lists active units with id, name and domain | FUNCTION | Guard (17 Nov, 2 of 2, flag off) |
| TC-1364-07 | In French the page shows French text (Enregistrer, Activé/Désactivé) and no raw keys | RENDER | Guard. Red on testing until its next deploy (fr.json at 0937523e6 has no resultSettings.* keys) |

Not covered here: a saved result following the policy or a lab unit override (CROSS-LINK, needs the flag on; dev specs cover it on their stack), sequential sign-off and "Sign level k for all clear" (#5073, #5077).

## OGC-1635 typed dates

Spec: `tests/ogc-1635-typed-dates.spec.ts`. PRs #5088, #5095. Driven on Reference Lab Results (/SampleShipment/reference-lab-results).

| TC | What | Tier | Status |
|---|---|---|---|
| TC-TDATE-01 | A typed date range, then a click elsewhere, reaches the page and filters the table | FUNCTION | Guard (17 Nov, 2 of 2) |
| TC-TDATE-02 | A year shorter than four digits is marked invalid, with a message naming the field format | FUNCTION | Guard (17 Nov, 2 of 2) |
| TC-TDATE-03 | An impossible date (45/13/2026) is marked invalid and kept for correction, not rolled over | FUNCTION | Guard (17 Nov, 2 of 2) |

Not covered: the other 26 screens that took the shared DatePicker in #5095 (the dev team's guard test fails when a file imports Carbon's DatePicker again).

## OGC-1647 workplan paging

Spec: `tests/workplan.spec.ts`, describe "Workplan paging, total and print (OGC-1647)". Skips where no panel has more than one page (the CI stack).

| TC | What | Tier | Status |
|---|---|---|---|
| TC-WPP-09 | A workplan longer than one page shows its pages, a Total Tests line and an enabled Print Workplan | RENDER | Guard, canary for TC-WPP-10 (17 Nov, testing: Bilan Biochimique, 15 pages) |
| TC-WPP-10 | Total Tests counts the whole queue and Print Workplan posts every page | FUNCTION | Tripwire, OGC-1647 (17 Nov: Total Tests = 100 over 15 pages, print posted 100 rows) |

## Planned, not yet written

- OGC-1611 container types (#5010, #5047, #5062): a test's expected container reaches Prepare Samples as a proposal and the saved sample item carries the container type (CROSS-LINK). Needs a QA-only test with an expected container: testing has no test using one (every container type reads testsUsing 0). The dev team's `ogc-1611-*` specs cover the admin page and the test containers section.
