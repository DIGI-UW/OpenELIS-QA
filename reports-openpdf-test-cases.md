# Reports after the OpenPDF port: test cases

**Spec:** `tests/reports-openpdf.spec.ts` (helper `helpers/report-pdf.ts`)
**Written:** 2026-10-08 against local develop images of 2026-10-08 18:53 UTC, which carry the JasperReports retirement R1 (OpenELIS-Global-2 #4531 to #4552) and its review remediation #4649 (1156e683a), on Casey's ask to seed data and test every report.
**Scope:** every report reachable from the Reports menu on the develop configuration, generated from its own screen. Each case takes the ReportPrint (or PrintWorkplanReport, coldstorage) request the screen made and reads the answer page by page with pdfjs-dist, so a 500, an HTML page or the error-notice PDF where a report was expected all fail.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while develop differs, and goes red ("Expected to fail, but passed") the day it is fixed; then delete the marker. **Port** in the Origin column means the difference came with the OpenPDF port; **Pre-existing** means the code is unchanged by the port.

Data: `seedReportData` creates one QA patient (`Rptqa, Thérèse`, national id `QARPT...`) and six orders on the server's today: complete (GPT 25, Glucose 1, Creatinine 4 low, Amylase 600 high, validated), partial (Total Cholesterol validated, HDL never resulted), large (18 haematology tests on whole blood and 6 biochemistry tests on serum, validated), awaiting (Amylase and Triglycerides entered, not validated), rejected (Amylase, rejected at entry), ordered (Glucose and Triglycerides, nothing entered).

## Patient Status Report (PatientResultsPdf)

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-01 | By lab number range: one OpenPDF document, A4 portrait on every page, the patient name with its accent, the national id, a results block for each of the six orders | Guard | #4546 |
| TC-RPTPDF-02 | Results, flags (B, E, none), ranges and units print as stored; Results Complete Report vs Results Partial Report per order; the unresulted test reads In progress; legend and signature box | Guard | #4546, #4649 (per-order completion) |
| TC-RPTPDF-03 | Results waiting for validation are not released on the report; a rejected sample reads Rejected | Guard | #4546 |
| TC-RPTPDF-04 | Every page carries a patient code / lab number line and the legend | Guard | #4649 (continuation identity) |
| TC-RPTPDF-05 | The lab number prints whole in the order details box on A4 | Tripwire | Port: the 20-character accession wraps ("DEV0126000000000210" / "5"); the Jasper template printed it on one line, and on Letter it fits |

## Activity, rejection and referral reports

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-10 | Activity Report by unit (Biochemistry, today) lists the complete order with its Creatinine result; headings repeat on every page | Guard | #4538 |
| TC-RPTPDF-11 | Activity Report by test produces the report, not a 500 | Tripwire | Port (#4538): `ActivityReport.initializeReport` dropped `createReportParameters()`, `ActivityReportByTest` NPEs on `reportParameters.put` |
| TC-RPTPDF-12 | Rejection Report (CSV) has a row for the rejected sample with the reason chosen at entry | Guard | CSV, unchanged |
| TC-RPTPDF-13 | Referred Out Tests Report for QA_AUTO Reference Lab Alpha (created by referral-seed.setup) lists referrals and names the destination on every page | Guard | #4541, #4649 |
| TC-RPTPDF-14 | A report with nothing to print answers the readable notice PDF ("It is not possible to create the report at this time", "No reports met printing criteria") | Guard | #4537 |

## Aggregate reports

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-20 | Statistics Report (all units, priorities, time frames): A3 for an A4 site, and this month's Creatinine column counts the seeded validated tests | Guard | #4544 |
| TC-RPTPDF-21 | Summary of All Tests for 1 January to today renders its table | Guard | #4542 |
| TC-RPTPDF-22 | Summary of All Tests ending today counts today's validated tests | Tripwire | Pre-existing: the upper date is midnight at its start and the query uses BETWEEN, so tests started later that day are left out; the screen refuses a future end date |
| TC-RPTPDF-23 | Delayed Validation (the menu's link) answers a PDF listing Biochemistry with the seeded waiting results | Guard | #4537 |
| TC-RPTPDF-24 | Delayed Validation still answers when a waiting result sits in an inactive lab unit (the case creates that state with the ci-fixtures inactive unit test, then validates it) | Tripwire | Pre-existing: `ValidationBacklogReport.loadBuckets` finds no bucket for an inactive unit and NPEs, so the report is a 500 for everyone |

## Printed workplans (WorkplanPdf)

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-30 | Workplan by unit (Biochemistry): title "Work plan: Biochemistry" on every page, and every lab number the screen sent is on the sheet | Guard | #4535, #4649 |
| TC-RPTPDF-31 | Workplan by test prints which test it is for | Tripwire | Pre-existing: the screen sends the test id as `testSectionId` and an empty `testTypeID`, the controller names the plan from `testTypeID`, so the title is "Work plan:" and the sheet has no test column |

## Cold storage (FreezerTemperatureReportPdf)

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-40 | Daily Log from the Reports tab: title, period, the compliance statement | Guard | #4539, #4649 (compliance wording) |
| TC-RPTPDF-41 | Weekly Log on the screen produces the weekly log | Tripwire | Pre-existing: `coldStorage/Reports.jsx` maps Daily, Weekly and Monthly Log all to `freezerDailyLogReport`; the server answers `weekly` and `monthly` |

## Printed Reports Configuration

| ID | Case | Kind | Origin / ticket |
| --- | --- | --- | --- |
| TC-RPTPDF-50 | With reportPaperSize Letter and reportPageNumbers true (set through the admin form, restored after): the patient report is Letter with "Page n" on each page and the lab number on one line; the activity report is Letter landscape and ends "Page N of N" | Guard | #4546 (paper size setting) |

## Not automated here

- Study (RetroCI) reports: the menus are active on develop, but with no study observation data every one answers the "No reports met printing criteria" notice; `retroCInonConformityNotification` answers 500 (`specificationList` null) when called without its lab number list.
- Non Conformity Reports (By Date, By Unit and Reason) read `sample_qaevent`, which nothing in the current UI writes (the local stack has 0 rows); TC-RPTPDF-14 checks only that the empty answer is the notice PDF.
- Pathology, cytology and immunohistochemistry patient reports are still Jasper (R3 of the retirement roadmap); not reached from Reports.
- HIV Test Summary renders; its "Account" row label (French "Nombre") is unchanged by the port.
