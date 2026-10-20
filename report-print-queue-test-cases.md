# Report Print Queue (patient reports, V1): test cases

**Spec:** `tests/report-print-queue.spec.ts` (helper `helpers/report-queue.ts`, config `rpq.config.ts`)
**Written:** 2026-10-19 against testing.openelis-global.org (3.3.0-SNAPSHOT), on Casey's ask to test the new patient report print queue. **Extended 2026-10-20** with screen-driven cases (Results, Validation, the queue row Print, a critical-range test, Reports users scoped to one lab unit) on Casey's OK, against testing with #4771 (Mozzy's follow-ups from the 19 Oct pass). Product change: OpenELIS-Global-2 #4753 (OGC-431, FRS OGC-1031 r4 V1, slices 1 to 4, merged 2026-10-16), printing the redesigned patient report of #4747 (OGC-932). AC numbers are FRS §12 (v2.5).

**Scope:** `/ReportPrintQueue` for patient reports: the list on open, states and print status, the time window, preferences, printing, reprints, versions and the archive, the Patient Status Report path, lookups by lab number, range and patient, the home dashboard tile. V2 (certificates, exports, reissue, batch print and ZIP) is out of scope.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while develop differs, and goes red ("Expected to fail, but passed") the day it is fixed; then delete the marker.

Data: every case creates its own orders for one QA patient (`Rpqqa, Queue`, national id `QARPQ...`) per run, on serum with GPT/ALAT (1), Glucose (3) and Creatinine (4). `validateOnly` accepts only the case's own lab number, because AccessionValidation by accession number answers every pending result from that number onwards.

## The list

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-01 | The page lists released reports on open with one list request and no Search press | Guard | AC-1, FR-1.1 |
| TC-RPQ-02 | The first released result lists the order as Partial 1/2, Unprinted, nothing issued | Guard | AC-2 |
| TC-RPQ-03 | A rejected sample's tests do not count in released/total | Guard | FR-2.2 |
| TC-RPQ-04 | State = Amended with Unprinted lists only amended unprinted rows and matches the tile; State = Partial lists only partial rows | Guard | AC-24, FR-9.1 |
| TC-RPQ-05 | The 24 hour window hides printed rows released before it and keeps every unprinted row | Guard | AC-16 (printed half), FR-3.8. Compares every unprinted row across pages (testing holds more than 100) |
| TC-RPQ-06 | Items per page and time window persist per user on the server | Guard | FR-10.5 |

## Printing and versions

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-10 | Print from the row creates v1, opens the PDF, archives it with a 64-character SHA-256 that matches the stored bytes | Guard | AC-3 |
| TC-RPQ-11 | Printing again returns byte-identical content and adds a reprint, not a version | Guard | AC-6, BR-5 |
| TC-RPQ-12 | Releasing the rest makes it Final, Unprinted; printing makes v2 "Added: Glucose", not amended, no corrected banner | Guard | AC-4 |
| TC-RPQ-13 | A changed printed result makes it Amended, Unprinted; the print is an amended v2 with "Version 2. Corrected report." and a "Glucose old → new" summary; a later release keeps Amended | Guard | AC-5 |
| TC-RPQ-14 | Four prints of one unprinted order at once issue one version and three reprints | Guard | FR-6.2 (lock) |
| TC-RPQ-15 | A Patient Status Report print makes the queue row Printed with v1 and an archived hash | Guard | AC-19, FR-6.8 |
| TC-RPQ-16 | Refusals: nothing released 409, unknown order 404, no CSRF token 403, non-numeric patient id 400 | Guard | FR-6.1 |
| TC-RPQ-17 | Every printed patient report carries "Version n" | Guard | FR-4.6 (tripwire 19 Oct, fixed by #4771) |

## Lookups

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-20 | A scanned lab number applies on Enter, disables the other filters, and Clear search restores them | Guard | AC-15 |
| TC-RPQ-21 | A lookup on an order with nothing released says "Nothing released yet on this order" | Guard | FR-2.4 (tripwire 19 Oct, fixed by #4771) |
| TC-RPQ-22 | A range typed high to low is refused with a message, not shown as "Nothing to print" | Guard | FR-3.3 (tripwire 19 Oct, fixed by #4771; the page says "The To lab number is before the From lab number") |
| TC-RPQ-23 | Search by patient lists every released order of that patient | Guard | FR-3.4 |

## Around the page

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-30 | The home "UnPrinted Results Today" tile equals the queue's Unprinted count for today | Guard | AC-23 (tripwire 19 Oct, fixed by #4771) |
| TC-RPQ-31 | At 1280 px with the side nav pinned, a seeded order's Print button is on screen | Guard | Heuristic. Column widths follow the rows shown: one seeded order fits; a full page of testing's data (all time, 100 rows) ran 1009 px in a 992 px area on 20 Oct, so the widest rows still push Print off screen. Data-dependent, so a note, not a check |

## Through the screens (2026-10-20)

Orders are placed through REST (order entry is being rewritten); results go in on `/Results`, release on `/validation` (Release all clear, or Review then Validate & release), and printing is the row's Print button. Tests used: Total cholesterol (7), HDL cholesterol (8), Triglycerides (9), untouched by testing's QA_AUTO calculation rules.

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-40 | Entered on Results, released on Validation: Partial 2/3, Unprinted; row Print issues v1 with "Version 1 · Issued" | Guard | AC-2, AC-3, FR-4.6 |
| TC-RPQ-41 | A correction on Results, re-released on Validation, reprints as amended v2 "HDL cholesterol 0.50 → 0.60" with the corrected banner | Guard | AC-5 |
| TC-RPQ-42 | A correction awaiting validation is not due to print and makes no version; once validated it prints as one corrected version naming old and new value | Tripwire | OGC-1529. Ruling (Casey, 20 Oct): a new version only after validation; unvalidated results do not show in reports. Today the edit alone makes it Amended to print, a print gives "Removed: HDL cholesterol", the next "Added: HDL cholesterol" |
| TC-RPQ-43 | A critical result (QA test, critical above 400) acknowledged at entry and at validation: no tag while unreleased, Critical tag once released, PDF prints 450.0 and CRITICAL | Guard | FR-1.4 Critical tag |
| TC-RPQ-44 | A Reports user on Hematology: Biochemistry order not listed, not found by lookup, 404 on detail, print and archived PDF; the Biochemistry user sees it | Guard | BR-9 (lead 19 Oct, fixed by #4771) |
| TC-RPQ-45 | A Reception-only user: no menu entry, 403 on list, detail, PDF, preferences and print | Guard | §8 |
| TC-RPQ-46 | Sort by Lab No (server), Time window and Items per page from the page, saved and kept over a reload, page 2, Clear filters keeps the window | Guard | FR-1.8, FR-3.2, FR-3.8, FR-10.5 |
| TC-RPQ-47 | A Patient Status Report range over two printed orders adds a reprint to each, no new version | Guard | AC-19, BR-5 |

## Not automated (manual, 2026-10-19)

- AC-21 legacy: a document_track print shows Printed v1, "Not archived (issued before 10/16/2026)"; a pre-install unprinted order is not listed but the Lab No lookup finds it. Passed by hand; the data depends on the stack's history.
- AC-22 French: every new `reportQueue.*` string, the menu entry and the page title stay English. New keys ship in `en.json` only and reach French through Transifex, so this waits on the next sync.
- AC-18 chips: Facility and Requester show their labels as chips. Passed by hand.
- Role gate and scope: covered by TC-RPQ-44 and 45 since 20 Oct. A Reports-less user who opens /ReportPrintQueue directly gets a blank page rather than being sent Home (FRS §8), manual.
- Ward filter: not covered; no facility on testing has subunits.

## Harness lessons

- `AccessionValidation?accessionNumber=X` returns every pending result from X onwards; accept only X's items.
- A LogbookResults POST with a finalized row still carrying its `result` object answers 400; drop `result` from every row.
- QA users for TC-RPQ-44 and 45 (qa_rpq_heme, qa_rpq_bio, qa_rpq_recept) are created by `pageAs` when they cannot log in; their test-only passwords are in `helpers/report-queue-ui.ts` (override with RPQ_* env vars).
- testing has QA_AUTO calculation rules (ids 1 to 7) that write GPT/ALAT, Creatinine and Amylase from GOT/ASAT, GPT/ALAT, Creatinine and Amylase, some with an empty operator. A change to GPT/ALAT is recalculated to an empty value ("Result Missing Calculation Parameters"), and a Creatinine result adds an Amylase value. Use cholesterol, HDL, triglycerides or Glucose (Glucose is not offered on order entry v4 on testing).
