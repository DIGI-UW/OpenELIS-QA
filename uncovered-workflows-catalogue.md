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
Seed a STAT order with collection time older than the STAT threshold and no result. **Expected:** the Overdue STAT tile increments and a STAT Overdue row appears. Automated (test.fail): `tests/stat-overdue-alert.spec.ts`. **Criterion:** FUNCTION. **Today:** tile stays 0 with DEV...0008 (STAT, 36 h, unresulted) and DEV...0277 (STAT, received 2 days ago) (R58, re-check pending).

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
**Today:** PREPARING_SLIDES (R53). Automated (test.fail): `tests/table-labels.spec.ts`. **Criterion:** RENDER.

## Immunohistochemistry (TC-IHCW)

### TC-IHCW-01: Referring a completed pathology case to IHC creates the IHC case
Observed working 2026-09-27 (DEV...090). Automated: `tests/pathology-workflow.spec.ts` (a pathology case referred with no requested stains still creates the IHC case). **Criterion:** ROUND-TRIP.

### TC-IHCW-02: The Stage column shows a translated stage, not an enum
**Expected:** "In Progress". **Today:** IN_PROGRESS. Automated (test.fail): `tests/table-labels.spec.ts`. **Criterion:** RENDER.

### TC-IHCW-03: An IHC case reaches Ready for Pathologist and Completed, with a report
**Expected:** tiles and filters follow the case; report contains the stain results. **Criterion:** FUNCTION.

### TC-IHCW-04: IHC markers entered on the case are stored
Enter two markers with results. **Expected:** reopening shows both with their results. **Criterion:** PERSIST.

### TC-IHCW-05: The dashboard pages at a usable size
**Today:** Items per page 1. **Criterion:** RENDER.

### TC-IHCW-06: An empty IHC case cannot be saved as Completed
**Today:** saved (R51). Automated (test.fail): `tests/pathology-workflow.spec.ts`. **Criterion:** PERSIST.

## Electronic lab notebook (TC-ELNW)

### TC-ELNW-01: A notebook entry saves with all required metadata and appears under its project
Seed an experiment type (Dictionary: NoteBook Experiment Type, with Local Abbreviation). **Expected:** Total Entries and Drafts increment; the entry is listed under QA Notebook Project 1. **Criterion:** ROUND-TRIP.

### TC-ELNW-02: Save with a required metadata field empty says what is missing
**Expected:** inline error naming the field. **Today:** on the project form, clearing the required Objective shows "Successfully saved" but keeps the old value (R59). The project pencil on the dashboard opens /NoteBookEntryForm/<id>. Automated (test.fail): `tests/notebook-project.spec.ts`. **Criterion:** FUNCTION.

### TC-ELNW-03: A draft submitted for review moves to Pending Review, then Finalized
**Expected:** the tiles follow the entry; a finalized entry is read-only. **Criterion:** FUNCTION.

### TC-ELNW-04: Filters by status, experiment type, tag and date narrow the list
**Criterion:** FUNCTION.

### TC-ELNW-05: An edited project Objective is kept
Canary for TC-ELNW-02. Observed working 2026-09-27. Automated: `tests/notebook-project.spec.ts`. **Criterion:** ROUND-TRIP.

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

## Electronic signatures (TC-ESIGW; the page-level TC-ESIG-01..13 live in tests/electronic-signature.spec.ts)

### TC-ESIGW-01: Validating a result writes an entry to the e-signature log
Validate a QA result. **Expected:** /qa/qms/e-signature-log lists user, time, record and meaning. **Criterion:** ROUND-TRIP.

### TC-ESIGW-02: The e-signature log filters by user and date
**Criterion:** FUNCTION.

### TC-ESIGW-03: With e-signatures enabled, Results Save requires certification/signature
Turn on site setting electronicSignatureEnabled, enter a result, Save. **Expected:** the Electronic Signature Certification (first use) or Sign dialog opens; Cancel saves nothing. Observed working 2026-09-27 up to the dialog. Completing it needs the signer's password; automate only with the suite's own login credentials if approved. Restore the setting afterwards. **Criterion:** FUNCTION.

### TC-ESIGW-04: With e-signatures enabled, Validate & release requires a signature
Same as TC-ESIGW-03 on the Validation review panel. Observed working 2026-09-27 up to the dialog. **Criterion:** FUNCTION.

### TC-ESIGW-05: No result-finalizing path skips the signature when e-signatures are enabled
Check every path that finalizes a result: Results, Validation (single and "Release all clear"), Reference Lab Results "Enter result", referral auto-validation (R23), analyzer import, Pathology/Cytology/IHC sign-out. **Expected:** each asks for a signature and writes an E-Signature Log entry. **Today:** Results, Validation and Reference Lab Results checked (all prompt); the others unchecked. **Criterion:** FUNCTION.

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
**Automated** (2026-09-28): `tests/a11y-control-names.spec.ts` checks every visible control on every menu page. Known misses (R74) are allow-listed by count.

## Environmental compliance dashboard (TC-ENVC)

/EnvironmentalDashboard ("Compliance Dashboard" in the menu). Not in any catalogue before 2026-09-27.

### TC-ENVC-01: Environmental orders in the date range are counted
Seed two env orders at a QA- sampling site. **Expected:** Total Orders and Sites Monitored include them. **Today:** 0 / 0 with env orders present (R34 = OGC-1192). Automated (test.fail): `tests/ogc1192-env-order-visibility.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-ENVC-02: A result outside the compliance standard appears under Exceedance Summary
Enter a QA_Water pH result above the QA Water Quality Standard threshold. **Expected:** one exceedance row with lab number, site, parameter, result, threshold; Compliance Rate drops. **Criterion:** ROUND-TRIP.

### TC-ENVC-03: Filtering by sampling site and standard narrows every tile and table
**Criterion:** FUNCTION.

### TC-ENVC-04: Drill down by site lists that site's orders
**Criterion:** FUNCTION.

### TC-ENVC-05: Export PDF contains the same figures as the tiles
**Criterion:** ROUND-TRIP.

## Cross-cutting: tables (TC-TBL)

### TC-TBL-00: The Inventory table offers several page sizes
Canary for TC-TBL-01. Automated: `tests/table-labels.spec.ts`. **Criterion:** RENDER.

### TC-TBL-01: Every paged table offers the standard page sizes
Results, Validation, Cytology, IHC, Order dashboards. **Expected:** 10/20/50/100 (as Inventory and Alerts do). **Today:** one option equal to the current row count (R55). Automated (test.fail): `tests/table-labels.spec.ts`. **Criterion:** FUNCTION.

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

## Modify Order (TC-MOP)

### TC-MOP-00: Modify Order saves an unchanged order
Canary for TC-MOP-01. Automated: `tests/modify-order-priority.spec.ts`. **Criterion:** PERSIST.

### TC-MOP-02: Modify Order changes the priority to STAT
Works ("STAT" is both label and enum). Automated: `tests/modify-order-priority.spec.ts`. **Criterion:** PERSIST.

### TC-MOP-01: Modify Order changes the priority to one whose label differs from its code (Routine)
**Today:** posts the label ("Routine") instead of the enum; 400 and "Oops, Server error please contact administrator" (R62). Automated (test.fail): `tests/modify-order-priority.spec.ts`. **Criterion:** PERSIST.

### TC-MOP-03: Modify Order adds a test to an existing sample
Assign a test in "Available Tests", Submit. **Expected:** the order lists both tests. Observed working 2026-09-27 (DEV...0276: QA Grp 10067 added beside Glucose). **Criterion:** ROUND-TRIP.

## Order workflow steps (TC-OWF)

Collect -> Label & Store -> QA Review for an existing order (/order/clinical/collect, scan the lab number).

### TC-OWF-00: An existing order loads by lab number on the Collect page
Canary for TC-OWF-01/02. Automated: `tests/order-workflow-steps.spec.ts`. **Criterion:** RENDER.

### TC-OWF-01: The workflow progress counter matches the steps shown Complete
**Today:** lags one step (2/4 with three Complete; 3/4 with four Complete) (R63a). Automated (test.fail): `tests/order-workflow-steps.spec.ts`. **Criterion:** RENDER.

### TC-OWF-02: A freshly loaded or saved order shows no "Unsaved changes" banner
**Today:** banner shown on load and after Save/Submit (R63b). Automated (test.fail): `tests/order-workflow-steps.spec.ts`. **Criterion:** RENDER.

### TC-OWF-03: Label & Store assigns a storage location that reads back
Pick room, device, shelf; Save. Observed working 2026-09-27 (DEV...0285 -> QA Main Lab Room > QA Fridge 1 > Shelf A; one movement record). **Criterion:** ROUND-TRIP.

### TC-OWF-04: QA Review acceptance checklist accepts the sample
Pass each item, Accept sample, Submit. Observed working 2026-09-27 (status Accepted). **Criterion:** PERSIST.

### TC-OWF-05: QA Review shows the received date of a received order
**Today:** "Received —" (R63d). **Criterion:** RENDER.

## Sample Shipment integrity (TC-SHIPI)

Create Box -> Mark Ready -> Send -> Receive, and the Unassigned Samples list. Existing `sample-shipment.spec.ts` and Chain R check that the pages render and boxes round-trip; nothing checked that a box only carries samples bound for its destination, or that reception is limited to inbound boxes.

### TC-SHIPI-00: Unassigned Samples lists referred samples with Add to Box
Canary for TC-SHIPI-01..04. Automated: `tests/shipment-integrity.spec.ts`. **Criterion:** RENDER.

### TC-SHIPI-01: A referral the reference lab REJECTED is not offered for shipping
**Today:** REJECTED referrals listed with Add to Box, no status column (R64b). Automated (test.fail). **Criterion:** FUNCTION.

### TC-SHIPI-02: Create Box refuses (or warns on) a sample referred to a different facility
**Today:** added silently; the box saves, sends and the manifest lists the sample under the wrong lab (R64a). Automated (test.fail; never saves). **Criterion:** FUNCTION.

### TC-SHIPI-03: Receive Box refuses an outbound box sent by this lab
**Today:** reception form shown; Confirm Reception marks it RECEIVED and the dashboard counts it DELIVERED (R65a). Automated (test.fail). **Criterion:** FUNCTION.

### TC-SHIPI-04: The Receive view expects exactly the samples in the box
**Today:** "1 accepted / 2 expected" and a phantom "No matching order" specimen for a 1-sample box (R65b). Automated (test.fail). **Criterion:** RENDER.

### TC-SHIPI-05: Sending a box marks each referral in it as sent
Send a box; each referral's sent date becomes the box send time and its status moves on. **Today:** works for a normal referral (BOX-2026-0004), not for a REJECTED one (R64c). **Criterion:** PERSIST.

### TC-SHIPI-06: Looking up a box on Receive does not write
Scan a box id and leave. **Today:** the scan POSTs reconcile-shipment (R65c). **Criterion:** FUNCTION.

### TC-SHIPI-07: A Ready to Send box can be recalled to Draft
manifest-data says canRecall: true. **Today:** no Recall action on the box page (R65f). **Criterion:** FUNCTION.

### TC-SHIPI-08: Receive form controls are labelled
Each row's reception status select and notes input have an accessible name. **Today:** empty labels (R65d). **Criterion:** A11Y.

### TC-SHIPI-09: Box capacity is enforced when adding samples
Capacity 1, scan two samples. Observed working 2026-09-27 (1 / 1, second not added). **Criterion:** FUNCTION.

### TC-SHIPI-10: Box Label Prefix rejects characters that break IDs (space, slash)
**Today:** "Q A/1" saves with no message. **Criterion:** FUNCTION.

### TC-SHIPI-11: Cancel Referral and Mark as Lost dialogs name the referral's destination and test
**Today:** both fields empty (R73). Reason is required (button disabled until typed): working. **Criterion:** RENDER.

## Aliquot workflow (TC-ALQW)

`tests/aliquot.spec.ts` (TC-ALQ-01..13) checks that the page loads and searches. Nothing split a sample and read the aliquot back.

### TC-ALQW-00: A sample with a quantity is listed with it on the Aliquot page
Canary. Seeds an order with 4 mL Serum (`seedOrder(page, tag, { quantity, uomId })`). Automated: `tests/aliquot-workflow.spec.ts`. **Criterion:** RENDER.

### TC-ALQW-01: "Show Aliquoting" on its own opens the aliquoting section
**Today:** label toggles, row stays closed (R66a). Automated (test.fail). **Criterion:** FUNCTION.

### TC-ALQW-02: An aliquot carrying the sample's test saves and reads back
Add Aliquot, full quantity, move the test to it, Save. **Expected:** `<accession>-1.1` appears in /rest/SampleItem. Automated. **Criterion:** ROUND-TRIP.

### TC-ALQW-03: Saving an aliquot with no test either saves it or says why not
**Today:** with the test left on the parent, Save does nothing and says nothing (R66c); for a sample with no tests at all the request carries sampleItems: [], 200, page resets, nothing said (R66b). Automated (test.fail). **Criterion:** FUNCTION.

### TC-ALQW-04: Saving with quantity left unallocated explains itself
**Today:** Save does nothing, no message (R66c). **Criterion:** FUNCTION.

### TC-ALQW-05: Aliquot quantity cannot exceed the parent's remaining quantity
Observed working 2026-09-27 (7 entered, capped to 5). **Criterion:** FUNCTION.

### TC-ALQW-06: An aliquoted sample shows its existing aliquots when searched again
Search the accession after TC-ALQW-02. **Expected:** the aliquot is listed with its test and the parent shows its remaining quantity. **Criterion:** ROUND-TRIP.

### TC-ALQW-07: Results and Workplan list the test under the aliquot's ID after the move
**Criterion:** CROSS-LINK.

## Cold Storage navigation (TC-CSN)

### TC-CSN-00: /FreezerMonitoring opens with its five tabs, Dashboard selected
Canary. Automated: `tests/cold-storage-nav.spec.ts`. **Criterion:** RENDER.

### TC-CSN-01: The sidebar's Cold Storage entries (?tab=1..4) open the matching tab
**Today:** every entry shows the Dashboard (R67). Automated (test.fail). **Criterion:** FUNCTION.

## Generic Sample round trip (TC-GSR)

`tests/generic-sample.spec.ts` (TC-GEN) checks the five pages render. Nothing saved a generic sample and opened it again.

### TC-GSR-00: A generic sample order saves
Generate Lab Number, Serum, 3 mL, From, Collector, Save. **Expected:** "Successfully saved"; the sample exists. Automated: `tests/generic-sample-roundtrip.spec.ts`. **Criterion:** PERSIST.

### TC-GSR-01: Edit Order opens the generic sample just saved
**Today:** "No sample found"; the lookup answers 500 (R68). Automated (test.fail). **Criterion:** ROUND-TRIP.

### TC-GSR-02: An edit on Edit Order saves and reads back
Change quantity and collector, Save, search again. **Blocked by** TC-GSR-01. **Criterion:** ROUND-TRIP.

### TC-GSR-03: A generic sample saved with a notebook carries the notebook's fields
Pick "QA Notebook Project 1" in Notebook Selection, fill its fields, save; the fields read back. **Criterion:** ROUND-TRIP.

### TC-GSR-04: Generic Sample Import validates and imports a CSV
Upload a 2-row CSV, Validate, Import; both samples exist with their sample type and quantity. The page gives no template or column list, so the expected headers are not known yet. **Criterion:** ROUND-TRIP.

### TC-GSR-06: Import rejects a file with none of the expected columns
**Today:** "foo,bar" validates as Valid and imports a sample with no sample item (R69). Automated (test.fail; validate only). **Criterion:** FUNCTION.

### TC-SMG-01: Sample Management refuses an over-quantity aliquot, then splits the sample into equal aliquots
Observed working 2026-09-28 ("exceeds remaining quantity (3)"; 2 mL into 2 x 1 mL, 201). Automated: `tests/generic-sample-roundtrip.spec.ts`. **Criterion:** ROUND-TRIP.

### TC-SMG-02: Sample Management Add Tests attaches a test to a generic sample item
Observed working 2026-09-28 (HIV INFANT VIRAL LOAD on DEV...0372-1.1; the test list offers only tests mapped to the item's sample type). **Criterion:** ROUND-TRIP.

### TC-SMG-03: Print Barcode for a selected aliquot prints that aliquot's own ID
**Today:** prints the parent order's labels (LabelMakerServlet?labNo=<order>), so aliquots share a barcode (R76). **Criterion:** FUNCTION.

### TC-GSR-05: Sample Unit Of Measure offers sample units only
**Today:** the list mixes result units (mg/dl, ppm, pg, Ct) with sample units (mL, tubes, slides). **Criterion:** RENDER.

## Provider Management (TC-PRVW)

### TC-PRVW-00: A provider with a valid email is added
Canary. Automated: `tests/provider-admin.spec.ts`. **Criterion:** PERSIST.

### TC-PRVW-01: A malformed email is flagged on the field, not answered with a server error
**Today:** 500, generic toast, modal closes (R70). Automated (test.fail). **Criterion:** FUNCTION.

### TC-PRVW-02: The phone field enforces its hinted format
**Today:** "abcdefg" saves (R70). **Criterion:** FUNCTION.

### TC-PRVW-03: Adding a provider whose name matches an existing one warns first
**Today:** accepted silently (R70, same as R60 for organizations). **Criterion:** FUNCTION.

### TC-PRVW-04: Modify changes a provider and Deactivate hides it from Add Order's requester search
**Criterion:** CROSS-LINK.

## Home dashboard counts (TC-HDB)

The tiles were checked for rendering only. None was cross-checked against the orders it claims to count.

### TC-HDB-00: The Partially Completed Today tile shows a count and opens its list
Canary. Automated: `tests/home-dashboard-counts.spec.ts`. **Criterion:** RENDER.

### TC-HDB-01: Seeding an order with no tests finished does not raise the Partially Completed count
**Today:** the count rises by one per new order (R71). Automated (test.fail). **Criterion:** FUNCTION.

### TC-HDB-05: The Partially Completed list matches the tile's number
**Today:** tile 182, list 171 rows, newest orders missing (R71). **Criterion:** CROSS-LINK.

### TC-HDB-02: Ready For Validation equals the Validation page's count
Home said 13; 13 analyses were in Technical Acceptance (agrees on 2026-09-27). **Criterion:** CROSS-LINK.

### TC-HDB-03: Orders Completed Today counts orders whose every test was finalized today
Agrees on 2026-09-27 (26 = orders with all tests released today). **Criterion:** CROSS-LINK.

### TC-HDB-04: Each tile states its unit (orders vs tests) and its time window
**Today:** "Awaiting Result Entry" counts tests across all days beside tiles that count today's orders (R71). **Criterion:** RENDER.

## Patient Status Report printing (TC-PSR)

### TC-PSR-01: Printing an order's Patient Status Report removes it from UnPrinted Results
Observed working 2026-09-27 (DEV...0266, 0317; count 25 -> 23). **Criterion:** CROSS-LINK.

### TC-PSR-02: One malformed stored result does not fail the whole report
**Today:** a dictionary-type result holding "9.9" makes Report By Lab Number return a raw 500 (R72). Needs a dedicated seed that does not rely on the modify endpoint's missing validation. **Criterion:** FUNCTION.

### TC-PSR-03: The validation modify endpoint rejects a value that is not one of the test's dictionary options
**Today:** accepted and stored (R72). Automating it as a tripwire would corrupt an order on every run while the defect stands; run by hand against a throwaway order. **Criterion:** FUNCTION.

## UI text sweep (TC-UIX)

### TC-UIX-01: No page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error
Visits every active /rest/menu route (about 140) and scans the main area, including screen-reader-only text. Already-filed hits are listed in the spec's KNOWN map, so it fails only on something new. Automated: `tests/ui-text-sweep.spec.ts` (read-only). **Criterion:** RENDER.

### TC-UIX-02: No Admin page shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading
Same scan over every /MasterListsPage link in the Admin navigation. Automated: `tests/ui-text-sweep.spec.ts`. **Criterion:** RENDER.

## Enter Order unsaved-changes guard (TC-OEG)

### TC-OEG-00: The three Enter Order pages load
Canary. Automated: `tests/order-entry-unsaved-guard.spec.ts`. **Criterion:** RENDER.

### TC-OEG-01: An untouched Enter Order page shows no "Unsaved changes" and does not block leaving
One case per domain (Clinical, Environmental, Vector). **Today:** banner on load and a "Leave site?" prompt on exit on all three (R75). Automated (test.fail). **Criterion:** FUNCTION.

### TC-OEG-02: After typing into the form, leaving does ask
The guard must still work once there is something to lose. **Criterion:** FUNCTION.

## Report connection leaks (TC-LEAK)

### TC-LEAK-01: Running each report once leaves no database connection "idle in transaction"
Needs read access to `pg_stat_activity` (SSH), so it is manual. Run every report in the Reports menu once over a one-day range, excluding the Statistics Report with "All" time frames. Then check that no connection sits "idle in transaction" with a report query. **Today:** Export Routine CSV (R46, OGC-1360) and Rejection Report (R77) each leak one connection per run. Do not automate either as a routine test while the leak stands: about 20 runs take the instance down. The harness already skips Export Routine CSV unless QA_ALLOW_LEAKY_EXPORTS=1, and no spec generates the Rejection Report. **Criterion:** FUNCTION.

## Result rejection (TC-RREJ)

Needs the Result Configuration setting allowResultRejection turned on (restore it afterwards).

### TC-RREJ-01: "Reject result" appears only when allowResultRejection is on
Observed working 2026-09-28 (present with true, absent with false). **Criterion:** FUNCTION.

### TC-RREJ-02: A rejected test with a reason goes to Validation as a rejection, not as an abnormal result
**Today:** status Technical Rejected, but the Validation row carries "Abnormal" on the empty result. **Criterion:** RENDER.

### TC-RREJ-03: Releasing a rejected test prints the rejection clearly on the patient report
**Today:** Finalized with a blank result; the report shows Status "Validated" plus the reason as a note. Product call on wording. **Criterion:** CROSS-LINK.
