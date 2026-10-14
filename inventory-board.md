# Inventory items board (OGC-438): test cases

**Spec:** `tests/inventory-board.spec.ts` (helper `helpers/inventory-fixtures.ts`, SQL in `scripts/seed-inventory-history.sh`)
**Written:** 2026-10-11 against local develop df503f65 (images 2026-10-11 12:13 UTC).
**Scope (Casey, 2026-10-11):** what is merged now, parts 1 to 3 of the 17-part OGC-438 stack: the run-out projection endpoint (OpenELIS-Global-2 #4356), the Items board (#4357), and the board's row actions with the dashboard removed (#4358). Extend as later parts land.
**Part 4 added 2026-10-12** against develop a4200e2d (images 2026-10-12 06:09 UTC): #4359, reorder suggestions, mark as ordered, the critical banner (TC-INVB-50 to 63).
**Parts 5 to 10 taken in 2026-10-13** against develop b5943f5a (images 2026-10-13 14:33 UTC): #4360 learned lead time, #4361 tags instead of item type, #4362 tag directory and filter, #4363 items defined on the board and the Catalog tab retired, #4364 count mode, #4365 receive from a row and the product barcode. TC-INVB-30 to 32 rewritten on the board, TC-INVB-33 retired, TC-INVB-35 to 37 new, TC-INVB-60 and 62 flipped to guards.
**Reports recut 2026-10-14** (#4367, images 2026-10-14 17:22 UTC): six reports became four (Received, Consumed, Stock on hand, Expiring) with Run report on screen; TC-INVB-40 to 42 rewritten, TC-INVB-42 flipped to a guard (OGC-1489 item 1), TC-INVB-43 new (OGC-1489 item 3). #4366 scan-first receive is not covered yet.
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
| TC-INVB-00 | Canary: Inventory Management opens on the Items tab (heading Inventory Items, tabs Items / Reports, no Catalog tab since #4363) with columns Item, On hand, Usage trend, Runs out, Order by, Status, Last count, Actions; GET /inventory/board serves every read-only fixture | Canary | #4357, #4363, #4364 |
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
| TC-INVB-26 | Receive stock from a row: the row's item is preselected; quantity, lot number and expiry (shown because the item tracks lots; stored as the day picked) and storage location are stored, QC waits as Pending, on hand rises | Guard | #4358, #4365 |
| TC-INVB-27 | Edit item details saves a new threshold and the row's status follows it | Guard | #4358 |

## Catalog and Reports tabs

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-30 | New item on the board defines an active item; a typed tag is folded to the directory's spelling (reagent -> Reagent); the board says it was defined and lists it (was the Catalog tab's Add Catalog Item, TC-INV-04/06) | Guard | #4361, #4363 |
| TC-INVB-31 | New item refuses a blank name and sends nothing (the stability-after-opening rule went with item types in #4361) | Guard | #4363 |
| TC-INVB-32 | The board's tag filter shows only items carrying the chosen tag (was the catalog Item Type filter, TC-INV-07) | Guard | #4362 |
| TC-INVB-34 | A deactivated item leaves the board; activating it brings it back with its stock | Guard | #4357 (active items only) |
| TC-INVB-35 | Count mode: a counted quantity that differs corrects the lot as one adjustment (no usage), on hand follows, and the row's last count is today | Guard | #4364 |
| TC-INVB-36 | Receive stock finds the item from its product barcode; the scanner's Enter does not submit; an unknown code is named and offered as a new item | Guard | #4365 |
| TC-INVB-37 | A lead time set after the item exists is kept and the board shows it as set (it used to stick only at create) | Guard | #4360 |
| TC-INVB-40 | The Reports tab offers Received, Consumed, Stock on hand and Expiring, with Run report and Export (rewritten 14 Oct for the #4367 recut; was TC-INV-08) | Guard | carried over |
| TC-INVB-41 | Exporting Stock on hand as PDF downloads a non-empty PDF and says so | Guard | Reports tab |
| TC-INVB-42 | The downloaded report keeps its file extension (CSV and PDF) | Guard (was a tripwire; fixed 14 Oct, #4367) | OGC-1489 item 1 |
| TC-INVB-43 | Run report shows Stock on hand on screen; an item tagged RDT is reported by its tag, not as REAGENT | Guard (new 14 Oct) | OGC-1489 item 3 |

## Ordering (#4359)

"Critical" in #4359 is the board's own Reorder now, not yet marked ordered: items have no criticality field. A suggestion is a row the board badges Reorder now or Reorder soon. Marking records that an order was placed; OpenELIS places none. Every case uses its own throwaway items; the banner and panel are compared with the board response the page itself loaded.

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVB-50 | Reorder suggestions lists exactly the rows badged Reorder now or Reorder soon, and the toolbar button counts them | Guard | #4359 |
| TC-INVB-51 | The critical banner names the first five unaddressed Reorder now items in board order, counts the rest ("and N more"), and its action opens the suggestions | Guard | #4359 |
| TC-INVB-52 | Mark as ordered with a note and expected date: one request with the item, note and date; "1 item marked as ordered."; the row keeps Reorder now and gains "On order · date"; the item leaves the banner and stays in the suggestions, tagged On order | Guard | #4359 |
| TC-INVB-53 | Not ordered after all clears the mark, note and date, and the item is critical again; it is disabled when nothing selected is on order | Guard | #4359 |
| TC-INVB-54 | Marking a selection is one request for every selected item, and each is stamped | Guard | #4359 |
| TC-INVB-55 | Re-marking keeps the first order stamp and replaces the note and date (needs the DB to age the stamp; skips on testing) | Guard | #4359 |
| TC-INVB-56 | When the mark fails (a bare 500, what the controller sends) the panel stays open with the error, no success message, nothing stamped | Guard | #4359 |
| TC-INVB-57 | A malformed expected date is refused with 400 and stamps nothing; clearing an item never marked changes nothing | Guard | #4359 |
| TC-INVB-58 | Export CSV downloads reorder-suggestions.csv, one line per suggestion, order-by as an ISO date | Guard | #4359 |
| TC-INVB-59 | With nothing to order (board response rewritten to all Adequate) the panel says "Nothing needs ordering right now.", offers no mark, and there is no banner or count | Guard | #4359 |
| TC-INVB-60 | A receipt closes the On order mark (orderedOn and note cleared), so an item restocked and short again is critical again. Ruled 13 Oct (Casey: the next receipt closes the mark); fixed by #4365 | Guard (flipped 13 Oct) | found 2026-10-12 |
| TC-INVB-61 | An id that is not an item is skipped, not a 500 that drops the whole selection (the service means to skip; get() throws) | Tripwire | OGC-1489 |
| TC-INVB-62 | With the critical banner showing, the board still takes typed input and the focus is not held in the banner. Fixed 13 Oct (banner role status); on 12 Oct it trapped the focus 3 of 3 | Guard (flipped 13 Oct) | found 2026-10-12 |
| TC-INVB-63 | The note given with a mark (requisition or PO reference) can be read on the board. Today it shows nowhere: Carbon's Tag drops the title it is passed, and the panel and CSV leave it out; only the API returns it | Tripwire | OGC-1489 |

## Retired 2026-10-11

The dashboard (metric tiles, lot-status filter, pagination) was removed by OpenELIS-Global-2 #4358. Not replaced:

| Old id (TC- prefix dropped so the gate does not count it twice) | What it checked | Now |
| --- | --- | --- |
| INV-01 (spec) | Dashboard tab shows 4 KPI cards | retired, no dashboard |
| INV-02 (spec) | Catalog tab reachable with headers | folded into INVB-33, itself retired 13 Oct (see below) |
| INV-EXT-01..06 (spec) | API probes (catalog list, dashboard KPIs, write-then-verify, active filter, rapid tab switching, concurrent reads) | KPI probe retired; the rest are covered by TC-INVB-01, 30, 34 |
| INVHP-01..07 | Happy path through the dashboard tiles, ending with the INV-D1 tripwire (OGC-1421, Done) | replaced by TC-INVB-20 to 26 |

## Retired 2026-10-13

#4363 removed the Catalog tab; items are defined from the board.

| Old id (TC- prefix dropped) | What it checked | Now |
| --- | --- | --- |
| INVB-33 | The catalog Action column is labelled, not a raw i18n key | retired with the Catalog tab; the board's column names are checked by TC-INVB-00 |
