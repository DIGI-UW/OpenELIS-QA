# Module happy paths: pathology, IHC, EQA, inventory, accessibility

**Spec files** (all under `tests/`, collected by `modules-utc.config.ts`):
`pathology-ihc-happy-path.spec.ts`, `eqa-participant-happy-path.spec.ts`, `inventory-happy-path.spec.ts`, `a11y-axe-scan.spec.ts` (baseline `tests/a11y-axe-baseline.json`).
**Target:** local develop, images 2026-10-01 17:48 UTC. **Written:** 2026-10-02.
**Why:** the five "thin" happy-path areas in `claude/coverage-thin-3.2.3.md`. Each flow is driven through the UI, checked against the dashboard tiles the user sees, and read back through REST.

Tripwires (`test.fail`, flip when fixed) hold confirmed defects so the run stays green until the fix lands.

## Pathology case to report (TC-PATHHP)

| ID | What it proves |
| --- | --- |
| PATHHP-00 | Setup: the login holds the Pathologist role |
| PATHHP-01 | A new pathology order is listed, and In Progress goes up by 1 |
| PATHHP-02 | Grossing with 2 blocks saves |
| PATHHP-03 | Staining with 2 slides saves |
| PATHHP-04 | Ready for pathologist with a pathologist assigned; Awaiting Review goes up by 1 |
| PATHHP-05 | Gross, microscopy and conclusion text, Add Report, Generate (PDF), Completed; In Progress goes down by 1 |
| PATHHP-06 | Every text field reads back; the case is listed under the Completed filter |
| PATHHP-07 | TRIPWIRE: a save with "Ready for release" ticked answers 500 (`No row with the given identifier exists: [Analysis#<id>]`) |

## Pathology to IHC (TC-IHCHP)

| ID | What it proves |
| --- | --- |
| IHCHP-01 | Under review, refer to IHC with a marker; the IHC case is listed |
| IHCHP-02 | The marker is on the IHC case |
| IHCHP-03 | Report type chosen, generated (PDF), Completed; the Complete tile goes up by 1 |
| IHCHP-04 | TRIPWIRE: the IHC release save answers 500 (same cause as PATHHP-07) |

## EQA participant cycle (TC-EQAHP)

| ID | What it proves |
| --- | --- |
| EQAHP-00 | An enrolment that matches a programme exists |
| EQAHP-01 | New cycle from My Cycles answers 201; the row shows Planned |
| EQAHP-02 | Receive opens Add Order in EQA mode with cycle and programme preselected; the order submits |
| EQAHP-03 | The cycle lists the lab number and provider sample id; the lab number links to the order |
| EQAHP-04 | Result entered and validated on unified Results; the cycle moves to Ready to submit or Submitted |
| EQAHP-04b | Submit by hand with a reference typed key by key (verifies the OGC-1246 typing fix); Awaiting goes up by 1 |
| EQAHP-05 | A scores CSV imports; the cycle is Scored |
| EQAHP-06 | The performance report downloads as a PDF |

## Inventory: lot receive and tiles (TC-INVHP)

| ID | What it proves |
| --- | --- |
| INVHP-01 | A reagent added to the catalog is listed and counts as Low Stock until a lot arrives |
| INVHP-02 | A lot received into a storage room (20 tests, expiring in 20 days) moves Total Lots and Expiring Soon, not Low Stock |
| INVHP-03 | QC marked Passed |
| INVHP-04 | Usage of 15 leaves 5; the item is Low Stock again |
| INVHP-05 | Lot details show it; transactions hold RECEIPT and CONSUMPTION; the storage location is stored |
| INVHP-06 | Dispose: status DISPOSED, quantity 0 |
| INVHP-07 | TRIPWIRE, INV-D1: Expiring Soon (and Expired) still count a disposed lot |

## Accessibility scan (TC-AXE)

axe-core, WCAG 2.1 A and AA, on 14 screens: Home, Add Order, Enter Order, Results, Validation, Patient, Pathology dashboard and case view, EQA My Cycles, Inventory, Storage, Locations, Admin, Alerts. A screen fails on a serious or critical rule that is not in its baseline entry. Every violation (any impact) is attached as `axe-<page>.json`. Regenerate with `A11Y_WRITE_BASELINE=1`.

Baseline on 2026-10-02 (known debt, shrink as fixes land):

| Screen | Rules |
| --- | --- |
| Validation | aria-required-children |
| Pathology case view | label (Gross Exam, Microscopy Exam and Text Conclusion text areas have no name) |
| Inventory | aria-allowed-attr |
| Storage | aria-allowed-attr, button-name |
