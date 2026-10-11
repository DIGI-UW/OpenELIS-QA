# Inventory items board (OGC-438): test cases

**Spec:** `tests/inventory-board.spec.ts` (helper `helpers/inventory-fixtures.ts`, SQL in `scripts/seed-inventory-history.sh`)
**Written:** 2026-10-11 against local develop df503f65 (images 2026-10-11 12:13 UTC).
**Scope (Casey, 2026-10-11):** what is merged now, parts 1 to 3 of the 17-part OGC-438 stack: the run-out projection endpoint (OpenELIS-Global-2 #4356), the Items board (#4357), and the board's row actions with the dashboard removed (#4358). Extend as later parts land.
**Replaces:** `tests/inventory.spec.ts` (TC-INV-*) and `tests/inventory-happy-path.spec.ts` (TC-INVHP-*), which tested the retired dashboard. Catalog and report cases were carried over under new ids; dashboard-only cases are retired (see the end of this file).

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while the product differs, and goes red the day it is fixed (remove the marker then).

## Data

Read-only fixtures, found or made in `beforeAll` (and in `ci-fixtures.setup.ts` on CI), never changed by a case:

| Item | Shape | Board status |
| --- | --- | --- |
| QA INV Building | 40 in stock, threshold 5, never used | Building data |
| QA INV Low | 4 in stock, threshold 10 | Reorder now, no date |
| QA INV Empty | no lot, threshold 5 | Reorder now, Out of stock |
| QA INV FEFO | five lots: expired, earliest usable (+15 d), later usable (+120 d), failed QC (+5 d), pending QC (+8 d) | on hand 30; use-first is the +15 d lot |
| QA INV Steady | received 400, 30 days at 5/day, threshold 20, lead 7 | Adequate, runs out today+50 |
| QA INV Soon | received 160, 30 days at 2/day, threshold 10, lead 48 | Reorder soon, order by today+2 |
| QA INV PastDue | received 160, 30 days at 4/day, threshold 5, lead 30 | Reorder now, order by today-20 |

The projection needs usage spread over the last 30 days and the API stamps usage "now", so the three history items are re-dated in the database (`redateHistory()`, the same SQL as `scripts/seed-inventory-history.sh`). That runs only where BASE is localhost:10443 (local develop, develop-stack CI). On testing.openelis-global.org TC-INVB-10 to 12 skip and say why.

Every case that acts on a row makes its own throwaway item `QA INV <tag> <stamp>` and deactivates it afterwards (inventory has no delete). Receive stock uses the `QA CI Room` storage room.

## Items board

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-00 | Canary: Inventory Management opens on the Items tab (heading Inventory Items, tabs Items / Catalog / Reports) with columns Item, On hand, Usage trend, Runs out, Order by, Status, Actions; GET /inventory/board serves every fixture | Guard | #4357 |
| TC-INVB-01 | One row per active item and none for an inactive item; the screen lists exactly what the endpoint serves, in its order | Guard | #4357 |
| TC-INVB-02 | On hand counts usable and awaiting-QC stock only, never an expired or failed-QC lot (QA INV FEFO = 30) | Guard | #4356 countsAsAvailableStock |
| TC-INVB-03 | Without usage history the status follows the threshold: Out of stock, at or below threshold (Reorder now), above it (Building data), with "Too few days of use to project a run-out date" | Guard | #4356 |
| TC-INVB-04 | Rows that need action sort first: Reorder now, then Reorder soon, then the rest | Guard | #4357 |
| TC-INVB-05 | An expanded row lists its lots; exactly one is "Use first" (the earliest-expiring, unexpired, QC-passed lot); expired lots are tagged Expired, failed-QC lots "Failed QC: dispose"; the By location split adds up to on hand | Guard | #4357, #4358 |
| TC-INVB-06 | Search finds an item by name, by one of its lot numbers and by a lot barcode, and hides the others | Guard | #4357 |
| TC-INVB-07 | The status filter shows exactly the rows the endpoint gives that status; All restores the list | Guard | #4357 |
| TC-INVB-08 | Every row's status follows the board rule: at or below threshold is Reorder now; above it with too little history is Building data; a passed order-by date is Reorder now; otherwise Reorder soon or Adequate | Guard | #4356 |

## Run-out projection (needs the database)

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-10 | Steady use well ahead of the lead time: median daily use, run-out early and late, order-by = run-out minus lead time (tier SET), Adequate | Guard | #4356 |
| TC-INVB-11 | Stock that reaches its threshold within the lead time reads Reorder soon, with the order-by date still ahead | Guard | #4356 |
| TC-INVB-12 | An order-by date already passed reads Reorder now although stock is above the threshold, and the Order by cell says past due | Guard | #4356 |

## Row actions

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-20 | Log usage (toolbar button) records a consumption: on hand drops, a usage record is written, the lot logs CONSUMPTION and no ADJUSTMENT | Guard | #4358 Log usage modal |
| TC-INVB-21 | Record Usage from a row draws the earliest-expiring usable lot and never an expired one | Guard | #4358 FEFO fix |
| TC-INVB-22 | Logging more than the usable stock is refused in the dialog and changes nothing; awaiting-QC stock counts as on hand but cannot be consumed | Guard | #4358 |
| TC-INVB-23 | Adjust Quantity corrects a count as an ADJUSTMENT and writes no usage, so the projection ignores it | Guard | #4358 |
| TC-INVB-24 | Update QC Status to Failed (with the required note) takes the lot out of on hand and out of use-first and flags it for disposal | Guard | #4358 |
| TC-INVB-25 | Dispose Lot sets DISPOSED, logs DISPOSAL, drops the lot from on hand; the item turns Reorder now | Guard | #4358 |
| TC-INVB-26 | Receive stock from a row: lot number, quantity, expiry (as the day picked) and storage location are stored, QC waits as Pending, on hand rises | Guard | #4358 |
| TC-INVB-27 | Edit item details saves a new threshold and the row's status follows it | Guard | #4358 |

## Catalog and Reports tabs

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-30 | Add Catalog Item creates an active item listed in the catalog and on the board (was TC-INV-04, TC-INV-06) | Guard | carried over |
| TC-INVB-31 | A Reagent cannot be saved without its stability after opening; nothing is sent (was TC-INV-05) | Guard | carried over |
| TC-INVB-32 | The catalog Item Type filter lists only items of that type (was TC-INV-07) | Guard | carried over |
| TC-INVB-33 | The catalog Action column is labelled, not a raw i18n key (was TC-INV-03, BUG-61 fixed) | Guard | carried over |
| TC-INVB-34 | A deactivated item leaves the board; activating it brings it back with its stock | Guard | #4357 (active items only) |
| TC-INVB-40 | The Reports tab offers the stock-levels and low-stock reports and an enabled Generate (was TC-INV-08) | Guard | carried over |
| TC-INVB-41 | Generate on the Stock Levels report downloads a non-empty PDF and says so | Guard | Reports tab |
| TC-INVB-42 | The downloaded report keeps its file extension (today it saves as `stock-levels.pdf_`) | Tripwire | found 2026-10-11 |

## Retired 2026-10-11

The dashboard (metric tiles, lot-status filter, pagination) was removed by OpenELIS-Global-2 #4358. Not replaced:

| Old id (TC- prefix dropped so the gate does not count it twice) | What it checked | Now |
| --- | --- | --- |
| INV-01 (spec) | Dashboard tab shows 4 KPI cards | retired, no dashboard |
| INV-02 (spec) | Catalog tab reachable with headers | folded into TC-INVB-33 |
| INV-EXT-01..06 (spec) | API probes (catalog list, dashboard KPIs, write-then-verify, active filter, rapid tab switching, concurrent reads) | KPI probe retired; the rest are covered by TC-INVB-01, 30, 34 |
| INVHP-01..07 | Happy path through the dashboard tiles, ending with the INV-D1 tripwire (OGC-1421, Done) | replaced by TC-INVB-20 to 26 |
