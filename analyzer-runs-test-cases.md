# Runs: analyzer messages open runs the worklist names and opens (OGC-1200 slice 1)

Spec: `tests/ogc-1200-runs.spec.ts`, config `ogc1200.config.ts`. Written 5 Nov 2026 against testing.openelis-global.org (develop 424e927f, #4939). FRS: openelis-work `designs/results-validation/runs.md` v0.5 and `runs-breakdown.md` slice 1.

Fixture on testing: order DEV01260000000001634 has Creatinine, Amylase, Total cholesterol and HDL staged in RUN-16 (analyser "QA BX-3010 01 (Chem)", from the 27 Oct analyser round). Triglicerides on the same order has no staged value. Override with `RUN_ORDER` and `RUN_ID` on another server. Nothing here saves a result, except TC-RUN-12, which is opt-in.

| TC | What | FR | Tier | Status |
|---|---|---|---|---|
| TC-RUN-01 | A pending test whose value waits in an open run shows "Waiting in RUN-x" with source and time, and has no entry field; a test with no staged value stays editable | FR-D3 | RENDER | Guard (5 Nov, testing 424e927f, 2 of 2) |
| TC-RUN-02 | The Runs chip reads "Runs: {open} open, {held} held" from /rest/result-runs and lists every run | FR-D1 | ROUND-TRIP | Guard (5 Nov, 2 of 2) |
| TC-RUN-03 | The Waiting tag opens /Results?run=x with the filters notice, Run settings, "{done} of {total} rows dispositioned" and one row per staged value | FR-E1, FR-E1b, FR-E3 | ROUND-TRIP | Guard (5 Nov, 2 of 2) |
| TC-RUN-04 | View raw expands inline (no dialog) as a JSON object, and the raw endpoint answers an object | FR-E8 | FUNCTION | Guard (5 Nov, 2 of 2) |
| TC-RUN-05 | Back to all results restores the worklist's accession filter | FR-E1b | FUNCTION | Guard (5 Nov, 2 of 2) |
| TC-RUN-06 | An unknown run shows the not-found message; the API answers 404 | FR-E1 | FUNCTION | Guard (5 Nov, 2 of 2) |
| TC-RUN-07 | With Lab Unit Biochemistry the chip counts only that unit's runs and each list line shows id, source, analyser, time, progress and state | FR-D1, D-043 | ROUND-TRIP | Guard (5 Nov, 2 of 2) |
| TC-RUN-08 | Saving a waiting test answers 409 naming the run on both save paths (results-entry single save and LogbookResults), and nothing is written | FR-D3 | PERSIST | Guard (5 Nov, 2 of 2) |
| TC-RUN-09 | Expanding a waiting row offers no result input and no Save | FR-D3 | RENDER | Guard (5 Nov, 2 of 2) |
| TC-RUN-10 | In French the run screens show readable text, never raw keys (English until Transifex delivers run.*) | i18n | RENDER | Guard (5 Nov, 2 of 2) |
| TC-RUN-11 | The run header's link opens the analyser import page; its breadcrumb names the analyser with no MISSING_TRANSLATION console errors | #4939 also-fixed | RENDER | Guard (5 Nov, 2 of 2) |
| TC-RUN-12 | Ignoring a run's last value on the import page completes the run (Complete, n of n) and drops it from the chip | FR-A3, FR-E5 | CROSS-LINK | Opt-in (`RUN_COMPLETE_ID`); not run yet: it removes a staged value |

## Not covered

- A new analyser message opening a run (needs the Bridge; the dev team's `frontend/playwright/harness/ogc-1200-analyzer-runs.spec.ts` covers it on a dev stack).
- Visibility for a user limited to other lab units (D-043); only admin is used.
- Slices 2 onward: whole-run chip counts and paging, Accept on the run view, the /AnalyzerResults redirect and menu retirement, QC verdicts and holds.

## Leads seen 5 Nov (not filed; cards in the session doc)

- Run settings Method shows the analyser type's profile id (`site.655a82b7-...`, `cepheid-genexpert-astm`) instead of its name.
- Opening the Runs chip renders the list inline in the chip row and stretches the neighbouring chips; slice 1 planned a popover.
