# Search, not manual select (H12, OGC-1514, OGC-1515): test cases

**Specs:** `tests/ux-h12-search-not-select.spec.ts` (the sweep: no long site-data list without a search) and `tests/ogc-1515-searchable-lists.spec.ts` (the new type-to-search boxes work).
**Written:** 2026-10-19 (sweep, Casey's QA folder); moved into the repo 2026-11-04 after OGC-1515 part 1 (#4922) reached testing.
**Rule:** UX heuristic H12 and ruling R-26 in `RULINGS.md`: any list whose contents come from site data gets type-to-filter.

The sweep's guards hold screens that are fixed; its tripwires carry `test.fail()` until OGC-1515 part 2 (#4925) is on testing. The searchable-list cases are read-only, except TC-1515-09, whose POST is refused and changes nothing.

| ID | Case | Screen | Kind | Ticket |
| --- | --- | --- | --- | --- |
| TC-H12-G01 | Tests and panels have a search box | Batch Order Entry | Guard | |
| TC-H12-G02 | Test and panel search on the new-sample section | Modify Order | Guard | |
| TC-H12-01 | Adding a test to the existing sample has a search; list alphabetical | Modify Order | Guard | OGC-1514 |
| TC-H12-02 | Test list is searchable | Workplan by test | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-03 | Search By is searchable | Activity report by test | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-04 | Tests and panels for a sample type are searchable | Print Barcode (pre-print) | Tripwire | OGC-1515 part 2 |
| TC-H12-05 | Sample type and tests are searchable | Batch test reassignment | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-06 | Dictionary category is searchable | Dictionary Add | Tripwire | OGC-1515 part 2 |
| TC-H12-07 | Facility filters are searchable | Sample Shipment | Tripwire | OGC-1515 part 2 |
| TC-H12-08 | Reference lab is searchable | Reference lab results | Tripwire | OGC-1515 part 2 |
| TC-H12-09 | Referral center or laboratory is searchable | Referred out report | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-10 | Sample unit of measure is searchable | Modify Order Add Sample | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-11a | Alert type is searchable | Alerts | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-11b | Entity type is searchable | System audit trail | Guard (4 Nov) | OGC-1515 part 1 |
| TC-H12-12a | Settings table is searchable | Site Information | Tripwire | OGC-1515 part 2 |
| TC-H12-12b | Settings table is searchable | Result Configuration | Tripwire | OGC-1515 part 2 |
| TC-H12-12c | Settings table is searchable | Sample Entry Configuration | Tripwire | OGC-1515 part 2 |
| TC-H12-12d | Log is searchable | QMS e-signature log | Tripwire | OGC-1515 part 2 |
| TC-1515-01 | Test Type: narrows ignoring case and accents, no match leaves nothing, pick loads the worklist | Workplan by test | Guard | OGC-1515 part 1 |
| TC-1515-02 | Panel Type: as above | Workplan by panel | Guard | OGC-1515 part 1 |
| TC-1515-03 | Unit Type: as above | Workplan by test section | Guard | OGC-1515 part 1 |
| TC-1515-04 | Search By is searchable; the by-test report prints a PDF (was 500 for every test) | Activity report by test | Guard | OGC-1515 part 1 |
| TC-1515-05 | Search By is searchable; the report prints a PDF | Activity report by panel | Guard | OGC-1515 part 1 |
| TC-1515-06 | Search By is searchable; the report prints a PDF | Activity report by test section | Guard | OGC-1515 part 1 |
| TC-1515-07 | Printing without a lab asks for it; the lab is searchable; the print carries the lab | Referred out report | Guard | OGC-1515 part 1 |
| TC-1515-08 | Sample type, current test and replacements are searchable; replacements become tags and are not offered twice; a new sample type clears the current test | Batch test reassignment | Guard | OGC-1515 part 1 |
| TC-1515-09 | A replacement list that is a string, or holds a non-id, is refused with 400 naming jsonWad (was 200 and "saved") | Batch test reassignment (API) | Guard | OGC-1515 part 1 |
| TC-1515-10 | Alert Type filter is searchable | Alerts | Guard | OGC-1515 part 1 |
| TC-1515-11 | Entity Type and User filters are searchable | System audit trail | Guard | OGC-1515 part 1 |
| TC-1515-12 | "Include inactive tests" changes the current test list; replacements are active tests only | Batch test reassignment | Guard | OGC-1515 part 1 |
