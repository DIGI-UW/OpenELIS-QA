# Report Print Queue (patient reports, V1): test cases

**Spec:** `tests/report-print-queue.spec.ts` (helper `helpers/report-queue.ts`, config `rpq.config.ts`)
**Written:** 2026-10-19 against testing.openelis-global.org (3.3.0-SNAPSHOT), on Casey's ask to test the new patient report print queue. Product change: OpenELIS-Global-2 #4753 (OGC-431, FRS OGC-1031 r4 V1, slices 1 to 4, merged 2026-10-16), printing the redesigned patient report of #4747 (OGC-932). AC numbers are FRS §12 (v2.5).

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
| TC-RPQ-05 | The 24 hour window hides printed rows released before it and keeps every unprinted row | Guard | AC-16 (printed half), FR-3.8 |
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
| TC-RPQ-17 | Every printed patient report carries "Version n" | Tripwire | FR-4.6: non-amended versions print "Issued ... Page 1 of 1" only |

## Lookups

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-20 | A scanned lab number applies on Enter, disables the other filters, and Clear search restores them | Guard | AC-15 |
| TC-RPQ-21 | A lookup on an order with nothing released says "Nothing released yet on this order" | Tripwire | FR-2.4: dashes and a disabled Print; the reason is only a title attribute |
| TC-RPQ-22 | A range typed high to low is refused with a message, not shown as "Nothing to print" | Tripwire | FR-3.3: no validation; the empty state says every report has been printed |
| TC-RPQ-23 | Search by patient lists every released order of that patient | Guard | FR-3.4 |

## Around the page

| ID | Case | Kind | FRS |
| --- | --- | --- | --- |
| TC-RPQ-30 | The home "UnPrinted Results Today" tile equals the queue's Unprinted count for today | Tripwire | AC-23: the tile counts results (5), the queue counts orders (3), 2026-10-19 |
| TC-RPQ-31 | At 1280 px with the side nav pinned, the first row's Print button is on screen | Tripwire | Heuristic: Version and Action need horizontal scrolling |

## Not automated (manual, 2026-10-19)

- AC-21 legacy: a document_track print shows Printed v1, "Not archived (issued before 10/16/2026)"; a pre-install unprinted order is not listed but the Lab No lookup finds it. Passed by hand; the data depends on the stack's history.
- AC-22 French: every new `reportQueue.*` string, the menu entry and the page title stay English. New keys ship in `en.json` only and reach French through Transifex, so this waits on the next sync.
- AC-18 chips: Facility and Requester show their labels as chips. Passed by hand.
- Role gate: not rechecked (the reception login stalled in the harness). The controller is `hasAnyRole('REPORTS','ADMIN')`; detail, print and `/versions/{id}/pdf` do not apply the lab-unit scope (static read, a lead for BR-9).

## Harness lessons

- `AccessionValidation?accessionNumber=X` returns every pending result from X onwards; accept only X's items.
- A LogbookResults POST with a finalized row still carrying its `result` object answers 400; drop `result` from every row.
- testing has QA_AUTO calculation rules (ids 3 and 6) that compute GPT/ALAT from GOT/ASAT and GPT/ALAT with an empty operator. Any change to a GPT/ALAT result is recalculated to an empty value ("Result Missing Calculation Parameters"). Correct Glucose, not GPT, when a case needs an amendment.
