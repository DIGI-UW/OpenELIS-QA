# Uncovered workflows catalogue (written 2026-09-27)

**Why:** `workflow-coverage.json` rates these workflows `none` or `smoke`: no spec reads back anything a user did there. Existing catalogue entries for them (TC-CYT-01/02, TC-IHC-01, TC-NOTE-01/02, TC-MENU-05, TC-HP-STUDYMENU-01) only check that a page loads.
**Target:** testing.openelis-global.org 3.2.3.0. **Source:** Chrome walk-through on 2026-09-27 (project doc `release-qa-3.2.3.md`, R19, R26, R32, R48-R50) plus `coverage-thin-2026-09-27.md`.
**Status:** catalogued, not yet automated unless a spec is named. Each case states the observable result; "Today" records what 3.2.3.0 does where it differs.
**Data rule:** seed everything with the QA_ / QA- prefix; a missing record is a seeding task, not a finding.

## Cross-cutting: timezone (TC-TZ)

Found on 2026-09-27 with the browser at UTC+10 (Port Moresby). CI runs in UTC and hides all of these. Automate with `test.use({ timezoneId: 'Pacific/Port_Moresby' })` and a second run at `America/Los_Angeles`.

### TC-TZ-01: A no-future-date picker allows today after a full page load
Open any report page by URL, read `#startDate._flatpickr.config.maxDate`. **Expected:** today in the browser zone. **Today:** Fri 9 Jan 2026 at UTC+10, correct in UTC (R26). Automated: TC-DP-01 (now zone-pinned). **Criterion:** FUNCTION.

### TC-TZ-02: Order Programs shows the received date the order was saved with
Seed an order received after 14:00 local at UTC+10, open /genericProgram. **Expected:** the row's Received Date equals SampleEdit `receivedDateForDisplay`. **Today:** shown as the next day (R48). Automated (test.fail, zone-pinned): `tests/order-entry-defaults.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-TZ-03: IHC and Cytology dashboards date a case on the local day it was requested
Create a pathology case early in the local morning at UTC+10, refer to IHC. **Expected:** Request Date is the local date, in the site date format. **Today:** IHC shows the UTC date in ISO format (2026-09-26 for a 27/09 order). **Criterion:** RENDER.

### TC-TZ-04: Alert Created timestamps are real times
Trigger an alert (reject a referral). **Expected:** Created is within minutes of now. **Today:** 1/22/1970 (R19). Automated (test.fail): `tests/alerts-correctness.spec.ts`. **Criterion:** RENDER.

### TC-TZ-05: Add Order Reception Time defaults to the browser's local time
Open Add Order at UTC+10. **Expected:** the hour/minute default to the local clock. **Today:** UTC (08:50 at 18:52 local, R52). Automated (test.fail, zone-pinned): `tests/order-entry-defaults.spec.ts`. **Criterion:** FUNCTION.

### TC-TZ-06: Validation shows the local time a result was entered
Enter a result at UTC+10, open its Validation review panel. **Expected:** "Entered on" is the local time. **Today:** UTC shown as local (09:12 for 19:12, R55). Automated (test.fail, zone-pinned): `tests/validation-review-panel.spec.ts`. **Criterion:** RENDER.

### TC-TZ-07: IHC test-date pickers default to the local clock
**Today:** UTC (08:59 at 18:59 local, R53a). **Criterion:** FUNCTION.

## Alerts & notifications (TC-ALRT)

### TC-ALRT-00: The alerts table lists rows with a type and a status
Canary for TC-TZ-04 and TC-ALRT-04/05. Automated: `tests/alerts-correctness.spec.ts`. **Criterion:** RENDER.

### TC-ALRT-01: Critical alert tile counts only open critical alerts
Seed one open and one acknowledged critical alert. **Expected:** Critical Alerts tile = 1; after acknowledging the open one, 0. Observed working 2026-09-27. **Criterion:** FUNCTION.

### TC-ALRT-02: Acknowledge requires a resolution comment for critical alerts
Open Acknowledge on a critical alert. **Expected:** the confirm button is disabled until a comment is typed. Observed working. **Criterion:** FUNCTION.

### TC-ALRT-03: Acknowledge sets the alert to Acknowledged, not Resolved
**Expected:** status Acknowledged after Acknowledge; a separate Resolve action moves it to Resolved. **Today:** Acknowledge sets Resolved (R50). **Criterion:** PERSIST.

### TC-ALRT-04: An acknowledged alert can still be resolved from the UI
**Expected:** the Actions cell of an Acknowledged row offers Resolve. **Today:** empty (R50). Automated (test.fail): `tests/alerts-correctness.spec.ts`. **Criterion:** FUNCTION.

### TC-ALRT-05: The Alert Type filter offers every type present in the table
**Expected:** "Referral Rejected" is a filter option and filtering by it lists those rows. **Today:** not offered (R50). Automated (test.fail): `tests/alerts-correctness.spec.ts`. **Criterion:** FUNCTION.

### TC-ALRT-06: A STAT order past its turnaround shows under Overdue STAT Orders
Seed a STAT order with collection time older than the STAT threshold and no result. **Expected:** the Overdue STAT tile increments and a STAT Overdue row appears. **Criterion:** FUNCTION. **Today:** tile stays 0 with DEV...0008 (STAT, 36 h, unresulted) and DEV...0277 (STAT, received 2 days ago) (R58, re-check pending).

### TC-ALRT-07: A sample past its expiry shows under Samples Expiring
Seed a sample whose expiry is within the warning window. **Expected:** the tile and a Sample Expiration row appear. **Criterion:** FUNCTION.

### TC-ALRT-08: A STAT order notification carries the searchable lab number
Save a STAT order. **Expected:** the bell notification text contains the lab number exactly as the search box accepts it. **Today:** garbled (R18). **Criterion:** RENDER.

### TC-ALRT-09: Alert search filters the table by message text
Type part of a message into Search alerts. **Expected:** only matching rows remain; clearing restores all. **Criterion:** FUNCTION.

## Programs & order questionnaires (TC-PRGW)

### TC-PRGW-01: A program created in admin is offered on Add Order
Create QA_ program with a questionnaire in Admin > Programs. **Expected:** it appears in the Program dropdown on Add Clinical Order. Observed working 2026-09-27 (program 12, QA Prog Zero927, offered immediately). Automated: `tests/programs-admin.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-PRGW-02: Questionnaire answers entered on the order are stored and shown on Order Programs
Answer every question type on an order. **Expected:** Order Programs lists the order under the program; opening it shows the same answers. **Criterion:** ROUND-TRIP.

### TC-PRGW-03: Each order appears once on Order Programs
**Expected:** Total Entries equals the number of distinct accessions. **Today:** DEV...090 listed twice (R49). Automated (test.fail): `tests/programs-admin.spec.ts`. **Criterion:** RENDER.

### TC-PRGW-04: The Questionnaire column is readable
**Expected:** a link or label that opens the answers. **Today:** raw UUID (R49). Automated (test.fail): `tests/programs-admin.spec.ts`. **Criterion:** RENDER.

### TC-PRGW-05: A deactivated program is no longer offered for new orders but existing orders keep it
Deactivate QA_ program. **Expected:** gone from Add Order; old orders still show it on Order Programs. Reactivate restores it. Deactivation observed working 2026-09-27 (confirm dialog, then gone from Add Order); the keep-on-existing-orders half still needs a program with orders. Automated: `tests/programs-admin.spec.ts`. **Criterion:** PERSIST.

### TC-PRGW-06: Search by accession number on Order Programs finds the order
**Expected:** exactly that order's row(s). Observed working 2026-09-27. **Criterion:** FUNCTION.

### TC-PRGW-07: An environmental program questionnaire round-trips into an env order
Create an env program with a questionnaire, place an env order with answers. **Expected:** answers visible on the order and on Order Programs. **Criterion:** ROUND-TRIP.

## Study management (TC-STDY)

### TC-STDY-00: Every Study page renders its content
Canary for TC-STDY-01/05. Automated: `tests/study-pages.spec.ts`. **Criterion:** RENDER.

### TC-STDY-01: Every Study menu entry opens a page without a raw message key
**Expected:** no "sidenav.label..." or other raw keys; each page has a heading. **Today:** the legacy study UI shows "sidenav.label.environmental.compliance" (coverage-thin). Automated (test.fail): `tests/study-pages.spec.ts`. **Criterion:** RENDER.

### TC-STDY-02: A study electronic order can be entered and found again
Enter a QA- study e-order via /StudyElectronicOrders. **Expected:** saved and retrievable by its number. **Criterion:** ROUND-TRIP.

### TC-STDY-03: General Export (CIStudyExport) contains the study sample just entered
**Expected:** the export row for the sample carries the entered fields. **Criterion:** ROUND-TRIP.

### TC-STDY-04: Study audit trail report lists the edit just made
Edit a study sample field. **Expected:** the audit trail report shows old and new values, user and time. **Criterion:** ROUND-TRIP.

### TC-STDY-05: View study electronic orders is in the user's language
**Today:** French search prompt "Rechercher par code Patient ou par Site de prise en charge" in the English locale (R53h). Automated (test.fail): `tests/study-pages.spec.ts`. **Criterion:** RENDER.

## Cytology (TC-CYTW)

### TC-CYTW-01: A cytology order creates a case on the Cytology dashboard
Order a Cytology-unit test on a QA patient. **Expected:** Cases in Progress increments and the case row shows the lab number. Needs an orderable Cytology-unit test; the spec seeds QA_Cytology Pap Smear when missing. Passed by hand 2026-09-27 (DEV...0256, case 9). Automated: `tests/cytology-workflow.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-CYTW-02: A case moves through Preparing slides, Screening, Ready for Cytopathologist, Completed
**Expected:** each status filter lists the case at that stage only; the Awaiting Cytopathologist tile counts it at Ready. **Criterion:** FUNCTION.

### TC-CYTW-03: A completed cytology case produces a report with the entered diagnosis
**Expected:** report PDF opens and contains the diagnosis text. **Criterion:** ROUND-TRIP.

### TC-CYTW-04: The dashboard pages at a usable size
**Expected:** default Items per page of 10 or more. **Today:** 1. **Criterion:** RENDER.

### TC-CYTW-05: Search by lab number or family name finds the case
**Criterion:** FUNCTION.

### TC-CYTW-06: A case cannot be Completed without slides, adequacy, a report and a cytopathologist
Set Status = Completed on a fresh case and Save. **Expected:** refused with a message naming what is missing. **Today:** saved; the case leaves every worklist (R51). Automated (test.fail): `tests/cytology-workflow.spec.ts`. **Criterion:** PERSIST.

### TC-CYTW-07: Program questionnaire answers from the order appear on the case view
Observed working 2026-09-27 (Nature of Specimen, Source of Smear, Reason for Smear). Automated: `tests/cytology-workflow.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-CYTW-08: Technician and cytopathologist lists offer only real users with the right role
**Today:** system accounts ("External,Service", "Daemon,System") are offered (R53). **Criterion:** RENDER.

### TC-CYTW-09: Status is shown as a translated label, not an enum
**Today:** PREPARING_SLIDES (R53). **Criterion:** RENDER.

## Immunohistochemistry (TC-IHCW)

### TC-IHCW-01: Referring a completed pathology case to IHC creates the IHC case
Observed working 2026-09-27 (DEV...090). **Criterion:** ROUND-TRIP.

### TC-IHCW-02: The Stage column shows a translated stage, not an enum
**Expected:** "In Progress". **Today:** IN_PROGRESS. **Criterion:** RENDER.

### TC-IHCW-03: An IHC case reaches Ready for Pathologist and Completed, with a report
**Expected:** tiles and filters follow the case; report contains the stain results. **Criterion:** FUNCTION.

### TC-IHCW-04: IHC markers entered on the case are stored
Enter two markers with results. **Expected:** reopening shows both with their results. **Criterion:** PERSIST.

### TC-IHCW-05: The dashboard pages at a usable size
**Today:** Items per page 1. **Criterion:** RENDER.

## Electronic lab notebook (TC-ELNW)

### TC-ELNW-01: A notebook entry saves with all required metadata and appears under its project
Seed an experiment type (Dictionary: NoteBook Experiment Type, with Local Abbreviation). **Expected:** Total Entries and Drafts increment; the entry is listed under QA Notebook Project 1. **Criterion:** ROUND-TRIP.

### TC-ELNW-02: Save with a required metadata field empty says what is missing
**Expected:** inline error naming the field. **Today:** on the project form, clearing the required Objective shows "Successfully saved" but keeps the old value (R59). The project pencil on the dashboard opens /NoteBookEntryForm/<id>. **Criterion:** FUNCTION.

### TC-ELNW-03: A draft submitted for review moves to Pending Review, then Finalized
**Expected:** the tiles follow the entry; a finalized entry is read-only. **Criterion:** FUNCTION.

### TC-ELNW-04: Filters by status, experiment type, tag and date narrow the list
**Criterion:** FUNCTION.

## Provider & Organization admin (TC-ORGW)

### TC-ORGW-00: A new organization saves and is listed
Canary for TC-ORGW-02. Automated: `tests/org-admin.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-ORGW-01: A new organization saves and is offered as a referring site on Add Order
**Criterion:** ROUND-TRIP.

### TC-ORGW-02: A duplicate organization name is refused
Organization Management > Add, name of an existing organization. **Today:** accepted (R60: organization 15 "QA Auto Clinic", toast "Organization Information Updated Succesfully."). Automated (test.fail): `tests/org-admin.spec.ts`. **Criterion:** PERSIST.

### TC-ORGW-03: A new provider saves and is offered as requester on Add Order
**Criterion:** ROUND-TRIP.

### TC-ORGW-04: Deactivating an organization removes it from Add Order but keeps it on existing orders
**Criterion:** PERSIST.

### TC-ORGW-05: Add Order Site Name search matches a multi-word name as it is typed
Type "QA Aut" for "QA Auto Clinic". **Expected:** the clinic is suggested. Observed working by hand 2026-09-27 (one input event per character lists the sites; they are preloaded in referringSiteList). Two Playwright runs typing key by key saw "No suggestions available"; treated as a harness timing issue, the spec uses fill(). **Criterion:** FUNCTION.

## Electronic signatures (TC-ESIG)

### TC-ESIG-01: Validating a result writes an entry to the e-signature log
Validate a QA result. **Expected:** /qa/qms/e-signature-log lists user, time, record and meaning. **Criterion:** ROUND-TRIP.

### TC-ESIG-02: The e-signature log filters by user and date
**Criterion:** FUNCTION.

## Localization (TC-I18NK)

### TC-I18NK-01: Add Clinical Order in French has no English strings
Switch locale to Francais. **Expected:** every label, button and message is French. **Today:** many English strings (R32). **Criterion:** RENDER.

### TC-I18NK-02: Order Dashboard in French has no English strings
**Criterion:** RENDER.

### TC-I18NK-03: No raw message keys on any menu page, in either locale
Walk the menu (`/rest/menu`) and look for dotted lower-case keys. **Criterion:** RENDER.

### TC-I18NK-04: Add Order payment status options are translated labels
**Today:** raw keys normalCash / normalInsurance / reducedCash / reducedInsurance (R53). Automated (test.fail): `tests/order-entry-defaults.spec.ts`. **Criterion:** RENDER.

## Accessibility (TC-AXE)

### TC-AXE-01: The ten busiest pages have no serious or critical axe violations
Home, Add Clinical Order, Order Dashboard, Results, Validation, Patient search, Reports, Alerts, Pathology dashboard, Admin landing. **Criterion:** RENDER.

### TC-AXE-02: Every dialog traps focus and returns it on close
Acknowledge Alert, Add Dictionary, Add Label Preset. **Criterion:** FUNCTION.

### TC-AXE-03: Every form control has an accessible name
The Carbon toggle on Sample Type Editor has one via its label; check dropdowns in Add Dictionary and the merge panels. **Criterion:** RENDER.

## Environmental compliance dashboard (TC-ENVC)

/EnvironmentalDashboard ("Compliance Dashboard" in the menu). Not in any catalogue before 2026-09-27.

### TC-ENVC-01: Environmental orders in the date range are counted
Seed two env orders at a QA- sampling site. **Expected:** Total Orders and Sites Monitored include them. **Today:** 0 / 0 with env orders present (R34 = OGC-1192). **Criterion:** ROUND-TRIP.

### TC-ENVC-02: A result outside the compliance standard appears under Exceedance Summary
Enter a QA_Water pH result above the QA Water Quality Standard threshold. **Expected:** one exceedance row with lab number, site, parameter, result, threshold; Compliance Rate drops. **Criterion:** ROUND-TRIP.

### TC-ENVC-03: Filtering by sampling site and standard narrows every tile and table
**Criterion:** FUNCTION.

### TC-ENVC-04: Drill down by site lists that site's orders
**Criterion:** FUNCTION.

### TC-ENVC-05: Export PDF contains the same figures as the tiles
**Criterion:** ROUND-TRIP.

## Cross-cutting: tables (TC-TBL)

### TC-TBL-01: Every paged table offers the standard page sizes
Results, Validation, Cytology, IHC, Order dashboards. **Expected:** 10/20/50/100 (as Inventory and Alerts do). **Today:** one option equal to the current row count (R55). **Criterion:** FUNCTION.

### TC-TBL-02: Validation review panel names the user who entered the result
**Expected:** "Entered by" matches the History row's user. **Today:** "Not recorded" (R4, retested 2026-09-27). Automated (test.fail): `tests/validation-review-panel.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-TBL-03: Validation review panel History names the user who entered the result
Canary for TC-TBL-02. Observed working 2026-09-27. Automated: `tests/validation-review-panel.spec.ts`. **Criterion:** RENDER.

## Order entry defaults (TC-OED)

### TC-OED-00: An order placed at UTC+10 stores the received date and time entered
Canary for TC-OED-01, TC-TZ-02, TC-TZ-05. Automated: `tests/order-entry-defaults.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-OED-01: An empty "Date of next visit" stays empty
Place an order through Add Order leaving Date of next visit blank. **Expected:** no next visit date stored; the audit trail shows none. **Today:** today's date is stored (R57). Automated (test.fail, zone-pinned): `tests/order-entry-defaults.spec.ts`. **Criterion:** PERSIST.

### TC-OED-02: The audit trail records the order as entered, with local times
Observed working 2026-09-27 (DEV...0256: patient, order, sample, test, provider, organization rows at 18:40/18:52 local). **Criterion:** ROUND-TRIP.

## Pathology case workflow (TC-PATHW)

Rated deep by the classifier, but no spec drove an order into a case. Shares `helpers/order-wizard.ts` with the Cytology spec.

### TC-PATHW-01: A Histopathology order creates a case on the Pathology dashboard
Automated: `tests/pathology-workflow.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-PATHW-02: Histopathology questionnaire answers appear on the case view
Automated: `tests/pathology-workflow.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-PATHW-03: An empty pathology case cannot be saved as Completed
**Today:** saved (R51; same for Cytology and IHC). Automated (test.fail): `tests/pathology-workflow.spec.ts`. **Criterion:** PERSIST.
