# Inventory Receive, scan-first delivery (OGC-438 part 11): test cases

**Spec:** `tests/inventory-receive.spec.ts` (helper `helpers/inventory-fixtures.ts`)
**Written:** 2026-10-15 against local develop (backend image 2026-10-15 13:33 UTC, develop 7472c304).
**Scope:** OpenELIS-Global-2 #4366 (merged 14 Oct 2026, Samuel Male): the Receive tab on Inventory Management, the GS1 label parser (`gs1.js`), and the new `POST /rest/inventory/management/receive/batch` endpoint that saves a whole delivery in one transaction. Receive stock from a board row and the product barcode (#4365) stay in `inventory-board.md` (TC-INVB-36). Since #4368 (15 Oct) Receive is its own page, `/inventory/receive`, under Inventory > Receive, and every inventory REST controller needs the Results or Admin role.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while the product differs, and goes red the day it is fixed (remove the marker then).

## Data

Every case makes its own throwaway items, `QA INV <tag> <stamp>`, each with a numeric product barcode unique to the run (a 12-digit UPC-A), and deactivates them when the suite ends (inventory has no delete). A GS1 label is built from that barcode: `01` + the GTIN-14 (the UPC-A with two leading zeros), `17` + expiry YYMMDD, `10` + batch. ASCII 29 stands for the FNC1 group separator a scanner sends after a variable-length field.

Every save is checked against `GET /rest/inventory/lots/item/{id}`.

## The Receive page

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVR-00 | Canary: /inventory/receive has the heading Receive and the crumbs Home / Inventory / Receive, and opens on the purpose line, the Scan the box field, item, batch, expiry, quantity and Add to delivery, with no lines and no Receive button | Canary | #4366, #4368 |
| TC-INVR-01 | A GS1 label selects the item by its product barcode (a UPC-A read as GTIN-14) and fills batch and expiry; the scan field clears; the scanner's Enter writes nothing | Guard | #4366 |
| TC-INVR-02 | Two lines confirmed together are one batch POST (201); "2 lines received."; both lots land with batch, expiry and quantity; the Items page shows the new stock | Guard | #4366, #4368 |
| TC-INVR-03 | A batch typed by hand survives a scan that carries none; a scanned batch and expiry are replaced by the next scan, even with blanks | Guard | #4366 |
| TC-INVR-04 | An item that does not track lots shows no batch or expiry field; a batch and expiry on its label are not sent or stored | Guard | #4366 |
| TC-INVR-05 | A production date (AI 11) is skipped; an identifier the parser does not know (AI 91) marks the line "Partly scanned" with its raw scan; an impossible date (month 13) leaves the expiry empty and flags the line | Guard | #4366 gs1.js |
| TC-INVR-06 | A code that is not GS1 is named as not recognised with its raw text; the line can be entered by hand and received | Guard | #4366 |
| TC-INVR-07 | An unknown product barcode is named and offered as a New item, with the barcode carried into the item form | Guard | #4366, #4365 |
| TC-INVR-08 | Scanning an unknown box after a known one clears the chosen item, so the unknown box cannot be added under the previous product | Tripwire (found 15 Oct, not filed): the previous product stays chosen and the new batch is filed under it | #4366 handleScan |
| TC-INVR-09 | A lot already past its expiry is warned about and can still be received | Guard | #4366 |
| TC-INVR-10 | Remove drops one line, the Receive button count follows, Discard delivery drops the rest; nothing is written | Guard | #4366 |
| TC-INVR-11 | A line with no item, or a quantity of 0, is refused with a message and not added | Guard | #4366 |
| TC-INVR-12 | A save that fails on a dropped connection keeps the lines and says so; confirming again saves the delivery once | Guard | connectivity requirement |
| TC-INVR-13 | After Add to delivery the cursor is back in the scan field, so the next box is scanned without a click | Guard | #4366 focusScan; UX heuristic |
| TC-INVR-14 | Leaving Receive by the menu with lines not yet received asks before dropping them | Tripwire (found 15 Oct, not filed): nothing asks and the lines are gone on return | UX heuristic |

## The batch endpoint

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-INVR-20 | One bad line (unknown item) rolls the whole delivery back: a 4xx, and nothing from the good line is stored | Guard | #4366 InventoryCountIntegrationTest |
| TC-INVR-21 | A line carrying an existing lot id creates a new lot and leaves the existing one untouched | Guard | #4366 |
| TC-INVR-22 | An empty delivery answers 201 with an empty list; a null line is skipped | Guard | #4366 |
| TC-INVR-23 | A quantity of 0 or less is refused by the server (400) and not stored | Tripwire (found 15 Oct, not filed): quantity 0 answers 500 (nothing stored) | server validation |
| TC-INVR-24 | A body that is not a list is a 400, not a 500 | Guard | #4366 controller |
| TC-INVR-25 | Reception cannot receive stock or read the board by API (403); nothing is stored | Guard | #4368, OGC-1489 item 8 |
