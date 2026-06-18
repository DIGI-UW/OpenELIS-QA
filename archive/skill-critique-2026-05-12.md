# OpenELIS QA Skill — Critique & Proposed Improvements

**Date:** 2026-05-12
**Author:** Claude (Cowork)
**Subject:** Why the current `openelis-test-catalog-qa` skill misses partial features and broken cross-module links, and what to change.
**Trigger:** Casey noticed the Inventory module has a partially-formed storage feature that a human reviewer would have flagged — but no test run mentioned it. This document explains why, finds the rest of the same class of miss, and proposes concrete skill edits.

---

## Executive summary

The skill is excellent at breadth — 167 suites, 1097 TCs, every page enumerated, every dropdown counted. But the dominant PASS criterion is **"the page renders and the expected DOM elements exist."** That criterion is too weak in three predictable ways:

1. **Half-built features pass.** A module with a working list view and broken write path looks the same as a finished module if you only check that the list view renders. Inventory storage locations are exactly this — the dropdown shows up, the modal opens, and `POST /rest/inventory-storage-locations` returns HTTP 500 (BUG-40). The recorded "workaround" is to receive lots with `storageLocation:null` — which silently accepts that the feature doesn't work and stops asking questions. A lab inventory manager opening this module would call it broken in 30 seconds.

2. **API-path guesses produce false positives.** The 2026-04-20 revalidation closed 6 bugs (OGC-535, OGC-562, OGC-563, OGC-565, OGC-566, OGC-568) because the automation invented REST endpoints from page names (`/rest/dictionary`, `/rest/provider`, `/rest/labUnit`, `/rest/calculatedValue`) instead of capturing what the browser actually calls. Bugs were filed against 404s on paths the app never uses. The mirror of the partial-feature miss: same root cause (testing patterns, not user behavior), opposite symptom.

3. **Cross-module flows go untested.** Each screen passes in isolation. The "rejected sample → Rejection Report → NCE → dashboard counter" chain only got tested because Phase 23 explicitly invented Chain B; it exposed BUG-29 (rejection data sits in `sample_item` but never reaches `qa_event`). Most other chains have never been walked: order → result → validation → patient report PDF; reflex rule defined → result entered → reflex test auto-ordered; EQA program → shipment → participant result → score; cold-chain excursion → alert fired → corrective action linked.

The fix is not "more tests." It's a different acceptance criterion (workflow outcomes, not render checks), a small set of canonical end-to-end chains, a feature-maturity rubric so partial features get rated honestly, and a hard rule that no 404 becomes a bug ticket without live network capture.

The rest of this document is in three parts:
- **Part 1.** Suspect features the current testing approach is likely under-flagging, with the lab-readiness impact for each. (The Inventory case plus ~18 others.)
- **Part 2.** Ten methodology gaps in the current skill, each tied to specific bugs that prove it.
- **Part 3.** Proposed skill additions — concrete text you can paste into `SKILL.md`: new suite categories, mandatory acceptance criteria, persona walk-throughs, a partial-feature audit pass, and a calibration step at session start.

---

## Part 1 — Suspect features (lab-readiness audit)

Each entry lists what the current tests confirm, what they don't, and what a lab actually needs.

### A. Inventory module — the seed case

**What tests confirm:** Inventory landing page renders. Three tables (Items, Lots, Catalog) render. Item Type dropdown has 5 values. `POST /rest/inventory/items` 201s. `POST /rest/inventory/management/receive` 201s. Dashboard KPIs (1 lot, 0 low/expiring/expired) display correctly.

**What tests don't confirm:**
- Storage locations cannot be created (`POST /rest/inventory-storage-locations` → 500, BUG-40). The receive-lot modal has a "Storage Location" dropdown with no values; lots are saved with `storageLocation:null` and the test phase recorded this as "PASS — workaround available."
- The active filter `?isActive=true` is silently ignored (BUG-41) — deactivated items are returned alongside active ones, so any user looking at "current stock" sees inventory they cannot use.
- Inventory Reports tab renders six report types and an Export Format dropdown, but the dropdown is empty and `POST /rest/inventory/reports/generate` → 404 (BUG-45). The Generate button sends `{}` to a non-existent endpoint. Six entries of vapor.
- Column headers in both the Lots table and the Catalog show the literal i18n key `label.button.action` instead of "Actions" (BUG-44). On a French install this string survives untranslated.
- The "Receive New Inventory Lot" modal has two unresolved i18n keys (`storage.location.add.button`, `storage.location.add.title`) and the Deactivate dialog has `dangerDeactivate` (BUG-47).

**Lab impact:** A lab cannot track where reagents are physically stored. Cannot view a clean "active reagents" list. Cannot generate inventory reports (regulatory and budgeting). Cannot use the module in French. Deactivation dialog uses a raw template key.

**Why it passed:** No round-trip read-back of what was written. No probe of the Inventory Reports backend. No `?isActive` filter assertion. The fields-render and POST-returns-201 checks all succeeded, so "PASS" was awarded.

---

### B. Cold Storage / Freezer Monitoring

**What tests confirm:** `/FreezerMonitoring` renders 5 tabs (Dashboard, Corrective Actions, Historical Trends, Reports, Settings). 9-column storage-units table renders. Add Device dialog has Modbus/BACnet fields. Compliance footer shows "v2.1.0 | CAP, CLIA, FDA, WHO | HIPAA." Settings has 4 sub-tabs.

**What tests don't confirm:**
- An alert has never actually fired. Tests record "0 alerts" as empty-state PASS.
- A temperature excursion has never reached the audit trail. The Historical Trends "Export CSV" button has never produced a CSV.
- A corrective action has never been linked to an excursion (the join is the whole point of the module for CAP/CLIA compliance).
- Settings → Reports uses `mm/dd/yyyy` date pickers while the rest of the system uses `dd/mm/yyyy`. Untested whether the Generate Report button on the Reports tab actually emits a PDF or 404s.
- Modbus TCP and BACnet UDP configurations exist but no test has connected a real sensor or simulated traffic.

**Lab impact:** This is a CAP/CLIA/WHO regulatory feature. A lab that activates it on the strength of test passes and only discovers in an audit that excursions weren't logged has a serious problem. The footer says "compliant" but compliance has not been demonstrated.

---

### C. Pathology / IHC / Cytology dashboards

**What tests confirm:** Three dashboards exist (`/PathologyDashboard`, `/ImmunohistochemistryDashboard`, `/CytologyDashboard`). Each has 3 or 4 stat cards, a status dropdown, an assignee dropdown, a search field, and a results table. Pathology has 10 workflow stages (Grossing → Cutting → Processing → Slicing → Staining → Ready for Pathologist → Additional Request → Completed). IHC has 4 stages. Cytology has 5 (including Preparing slides → Screening → Ready for Cytopathologist).

**What tests don't confirm:**
- A case has never been advanced through stages. Has anyone clicked "Grossing → Cutting" and verified the case moves to the new stage, notifies the next tech, and updates the audit trail?
- The "Technician Assigned" / "Assigned Technician" / "Select Technician" columns are named inconsistently across the three dashboards (noted in Phase 23AM but treated as a UX nit, not a workflow blocker). No test verifies that selecting a tech actually queues the case for them.
- IHC and Cytology each have an "Additional Request" or escalation step that has never been exercised.
- No test confirms a finished case appears anywhere outside the Pathology dashboards — does it surface on patient results? On reports? In FHIR DiagnosticReport?

**Lab impact:** A histology or cytology section that adopts OpenELIS on the basis of these dashboards may discover during use that no case can be progressed, or that completing a case doesn't propagate to the patient record.

---

### D. EQA module

**What tests confirm:** `/EQAManagement`, `/EQAParticipants`, `/EQADistribution`, `/EQAResults`, `/EQAMyPrograms` all return HTTP 200. `/rest/eqa/programs` 200s. `/rest/eqa/distributions` 200s. `POST /rest/eqa/programs` 200s and persists. `PUT /rest/eqa/programs/1` 200s with verified field update. EQA sample order flow goes to `/SamplePatientEntry?isEQA=true` with patient fields locked.

**What tests don't confirm:**
- The whole module depends on `eqaEnabled=true` in Order Entry Configuration. Phase 27 caught this — but only after a prior round filed and then had to cancel 7 Jira tickets (OGC-518 through OGC-524). The skill now lists "Suite FK must run first" but the underlying problem — the sidebar shows EQA items that are functional dead-ends when the config is off — is still there.
- `/rest/eqa/samples/dashboard` returns 404 (BUG-39). The main EQA dashboard renders with all zeros and dashes as a fallback. A lab manager sees a "Performance Summary" that is structurally a placeholder.
- `/rest/eqa/participants` and `/rest/eqa/results` are 404s. The pages render thanks to client-side fallbacks but have no backend data path.
- No test has ever distributed a shipment to a real participant, received their result back, and scored it. The "Bulk Upload Results" button has never been clicked with a file.
- The EQA Sample wizard locks patient fields — but does the resulting sample correctly mark `is_eqa=true` in `sample_item`, exclude itself from Patient Status reports, and include itself in EQA Distribution scoring? Untested.

**Lab impact:** EQA is regulatory-mandated in many countries (ISO 15189, WHO PT schemes). A lab seeing five EQA pages with a Dashboard, Participants, and Results page would reasonably assume the workflow works.

---

### E. Reflex Tests

**What tests confirm:** `/MasterListsPage/reflex` lists 7-12 rules with cards showing Toggle, Active, "+ Rule". `POST /rest/reflexrule` 201s with payload `{ruleName, overall: ANY|ALL, active, conditions, actions}`. Phase 28 created a "High ALT Reflex" rule and verified it via API.

**What tests don't confirm:**
- A reflex rule has never been observed to fire. No test enters a result that should trigger a rule and confirms the downstream test gets auto-ordered.
- BUG-31 (Accept checkbox renderer hang) has been blocking results entry. This single bug has prevented the entire downstream chain — reflex, calculated values, result-driven workflows — from being verified for ~10 phases.
- The rule UI has an "Add Notification" toggle in the action structure. No test has verified that a notification fires when the rule triggers.

**Lab impact:** Reflex testing is a flagship LIMS feature. A hospital lab counts on reflex rules to add follow-up tests automatically (HIV positive → confirmatory; abnormal CBC → manual differential). Saying "PASS" for the admin page while never confirming the rule fires is the same as saying the smoke detector passes inspection because it was installed.

---

### F. Calculated Values

**What tests confirm:** `/MasterListsPage/calculatedValue` lists 2-5 rules. `POST /rest/test-calculation` 200s. `GET /rest/math-functions` returns 14 operators including clinical functions IS_IN_NORMAL_RANGE / IS_OUTSIDE_NORMAL_RANGE / AND / OR. De Ritis Ratio (`TEST_RESULT÷TEST_RESULT`) and QA Test Calc (`TEST_RESULT×INTEGER(2)`) confirmed in admin.

**What tests don't confirm:**
- A calculation has never been observed to run. No test enters GPT/ALAT and GOT/ASAT and confirms the De Ritis Ratio appears on Patient Results, Validation, or any downstream report.
- The PATIENT_ATTRIBUTE operand type is enumerated in the skill but never exercised. Can a calculation depend on patient age or sex? Untested.
- The 14 math functions are listed but only the arithmetic ones have ever been used. Range-based functions (IS_IN_NORMAL_RANGE) are clinical-decision-relevant and unverified.

**Lab impact:** Computed clinical decision support is a marquee LIMS feature. eGFR from creatinine + age + sex, A/G ratio from albumin and total protein, FENa, anion gap — many of these are computed values labs depend on. If the engine doesn't actually run, the lab will silently lose them.

---

### G. Patient-Order linkage (BUG-37)

**What tests confirm:** Add Order 4-step wizard renders. Patient search returns rows. Patient selection updates React state with `patientPK="6"` and `patientUpdateStatus="UPDATE"`. POST payload includes `patientPK`. Submit shows a green checkmark ("Succesfuly saved" — typo NOTE-24).

**What tests don't confirm:**
- The order is actually linked to the patient. Phase 32 and the Phase 70 retest both confirmed: Modify Order on the same accession shows "No Patient Information Available." Current Tests table is empty. Workplan and Logbook return 0 results for the order.
- The patient was created (`PatientID=6` in patient-search) but `sample_human` was never written.

**Lab impact:** Catastrophic. Orders without patients cannot be reported, billed, or fulfilled. A green checkmark indicating success while the database state is broken is the worst-case failure mode — the user moves on and doesn't notice until weeks later, when results return.

**Why it slipped before Phase 32:** Earlier suites tested the wizard's steps individually (Step 1 renders, Step 4 submits) and verified the green confirmation page. The submit-and-then-fetch read-back was not part of the standard pattern.

---

### H. Rejection workflow chain (BUG-29)

**What tests confirm:** Order Entry has a "Reject Sample" checkbox. Edit Order has a "Reject Sample" checkbox. Rejection Report sidebar item exists. NCE Dashboard renders. Dashboard has an "Orders Rejected Today" KPI.

**What tests don't confirm — and Phase 23 caught only because it ran an explicit chain:**
- Rejecting a sample at Order Entry stores data in `sample_item` fields but does NOT create a `qa_event` or NCE record.
- Rejection Report PDF returns HTTP 503 ("Check server logs").
- The View New Non-Conforming Events page shows "No Data Found" for the rejected sample.
- The Dashboard "Orders Rejected Today" KPI stays at 0.

**Lab impact:** A lab cannot audit sample rejections. Pre-analytic error rate (hemolysis, clotting, mislabel, insufficient volume) is a quality metric every accredited lab tracks. The feature looks present on every screen and is broken at the cross-module join.

---

### I. NCE submission (BUG-38, re-assigned)

**What tests confirm:** Report Non-Conforming Event page renders. 4-option Search By dropdown works. Specimen selection table populates after search. Pre-population of form fields from selection works. Navigation through the form steps works.

**What tests don't confirm:**
- The final `POST /rest/reportnonconformingevent` hangs indefinitely. No NCE has ever been successfully submitted via the form. The Phase 35 attempt caused Chrome's 6-connection-per-origin pool to exhaust and blocked all other API calls.

**Lab impact:** A user attempting to file an NCE will appear to be filing it (the form moves through steps) and then never gets confirmation. They will likely refile, possibly multiple times, with no idea any of their submissions are in limbo.

---

### J. Workplan bulk Save / Save All Normal

**What tests confirm:** Validation Routine page renders with Save / Retest / Notes columns and three bulk actions (Save All Normal / Save All Results / Retest All Tests). Test Unit dropdown loads 14 units.

**What tests don't confirm:**
- Clicking "Save All Normal" — does it persist normal results for every row? Or does it 200 and silently drop, like BUG-8 (TestModify silently corrupts ranges)?
- The "Result" column is read-only on the Validation page. A bench tech using "Save All Normal" cannot review what they are committing.
- No test has populated 20 results, saved all normal, and then confirmed all 20 are in the validated state in a subsequent read.

**Lab impact:** A high-volume lab depends on bulk validation. If 1 in 50 results is silently lost on bulk save, the lab won't notice until a patient asks for a missing result.

---

### K. Bar code label printing

**What tests confirm:** Print Bar Code Labels page renders with two sections (Pre-Print Barcodes and Print Bar Codes for Existing Orders). Numeric steppers and Total Labels read-out work. Sample Type dropdown enumerates correctly. Lab Number input has a 23-char counter.

**What tests don't confirm:**
- Clicking "Pre-Print Labels" — does it produce a PDF? Send to a printer? The button has never been clicked in a confirmed-output test.
- The encoded barcode — is it scannable? Does the encoded string match the lab number format? No test has decoded a generated barcode.
- The "Pre-Print Barcodes" math (label sets × order labels per set + specimen labels per set) — has it been verified against a known output?

**Lab impact:** Barcode-driven workflow is core. If labels don't print or aren't scannable, the lab falls back to handwriting accession numbers, which is error-prone.

---

### L. Storage Boxes grid assignment

**What tests confirm:** `/Storage/boxes` renders a unique grid-based coordinate UI. Rack → Box/Plate → grid cells render. Barcode input field exists. "Assign sample to box" panel renders.

**What tests don't confirm:**
- Clicking coordinate B3 and assigning a sample — does it persist? Does subsequent retrieval find the sample at B3? (Round-trip never tested.)
- Can the same coordinate be double-assigned (data integrity bug)?
- When a sample is moved from B3 to C4, is the move audited?
- The 3 racks identically named "RACK 1 (TB PC2)" in Phase 39 — does an assignment to one disambiguate from the others?

**Lab impact:** Sample mis-location is a real-world QA event. If the storage system silently allows double-assignment, samples will be lost.

---

### M. Audit trail completeness

**What tests confirm:** Audit Trail page renders. Lab Number search works. A 21-event history is visible for accession `26-CPHL-000-08K`.

**What tests don't confirm:**
- Which actions actually emit audit entries? Has anyone deleted a result and confirmed the deletion is logged? Edited a patient DOB? Granted admin permission to a user? Toggled `eqaEnabled` in admin? Changed a reference range?
- Are the audit entries tamper-resistant? Can an admin retroactively edit one?

**Lab impact:** The audit trail is the bedrock of every regulated lab. If editing reference ranges (the BUG-8 territory) doesn't produce an audit entry, a silent data corruption becomes invisible.

---

### N. FHIR resources actually round-trip

**What tests confirm:** `/api/OpenELIS-Global/fhir/metadata` returns a HAPI FHIR 7.0.2 CapabilityStatement (R4) declaring 5 resources: Patient, Observation, Practitioner, Organization, OperationDefinition. Phase 14 showed Patient and Observation GETs return 200.

**What tests don't confirm:**
- Has a Patient ever been POSTed to FHIR and a `GET /Patient/{id}` confirmed all fields round-trip? Are extensions preserved? Are demographics encoded correctly?
- Does an order placed in the UI produce a `ServiceRequest` resource accessible via FHIR (and conversely, can a `ServiceRequest` POSTed externally create an order)? This is the integration point for the EMRs OpenELIS is meant to talk to.
- A `DiagnosticReport` ever produced? With correct `subject`, `basedOn`, `result` references?
- The 04-20 report shows `/rest/report/*` endpoints all 404 — the Reports module isn't wired to REST. Is it also disconnected from FHIR `DiagnosticReport`?

**Lab impact:** OpenELIS markets FHIR R4. Implementers integrating with OpenSRP, OpenMRS, or any FHIR-native EHR rely on these resources. A CapabilityStatement that declares support without round-trip verification is a trust-but-don't-verify integration footgun.

---

### O. Notification / Alert subsystem

**What tests confirm:** Bell icon in header. Notification panel slides in. Subscribe / Reload / Mark all as Read buttons render. Alerts Dashboard renders with 4 stat cards and 3 filter dropdowns. `/rest/notifications` 200s, `/rest/alerts` 200s.

**What tests don't confirm:**
- No notification has ever been received in a test. Bodies of `/rest/notifications` and `/rest/alerts` are always empty.
- `/rest/notification/pnconfig` 404s on every page load (NOTE-28). The push notification config is half-wired.
- The Subscribe button — does it actually subscribe? Trigger anything?
- A critical alert configured in admin (e.g., temperature excursion, STAT overdue) — has any path from event to notification panel ever been observed?
- Email + SMS toggles exist in Cold Storage Settings → Alert Settings. Have they ever produced an email or SMS?

**Lab impact:** Active alerting is the difference between a system that supports lab operations and one that decorates them.

---

### P. Order Programs / FHIR Questionnaire

**What tests confirm:** Program Entry admin page has a FHIR Questionnaire JSON editor (Phase 23X). 16 programs are configured. `/genericProgram` shows 146 entries with First Name, Last Name, Program Name, Code, Accession, Received Date, and Questionnaire columns.

**What tests don't confirm:**
- When an order is placed under a program, does the questionnaire render on the form? Capture responses? Persist them?
- Are the responses queryable as FHIR `QuestionnaireResponse`?
- Does updating a program's questionnaire JSON affect new orders only, or retroactively?

**Lab impact:** Program-based studies (ANC, ARV, TB DOT, EID) rely on the questionnaire pattern. If the JSON loads in admin but doesn't render on order entry, the program data is unusable.

---

### Q. Lab number generation across paths

**What tests confirm:** Generate button on Add Order produces a sequential lab number. Different formats exist (`SITEYEARNUM`, `Legacy`, `CPHL`). On `mgtest` v3.2.1.5 the format is `DEV01260000000000001`.

**What tests don't confirm:**
- Is generation consistent across the Add Order wizard, Batch Order Entry, EQA Sample entry, and Generic Sample entry?
- What happens at the 99,999th order of the year? Does the counter roll? Reset? Collide?
- Does Batch Order Entry generate a contiguous block, or one-at-a-time with possible interleaving from another concurrent order?

**Lab impact:** Two orders with the same accession is a sample-identification disaster. A counter-rollover bug at year-end is the kind of bug that hits exactly once and ruins a day.

---

### R. User permissions actually enforced

**What tests confirm:** Add User form has 6 global roles, 15 lab units, 5 per-unit permissions. Modify User exists. Search/Active/Administrator/Lab Unit Roles filters render.

**What tests don't confirm:**
- Has a user been created with "Receptionist" role, logged in, and verified they CANNOT access Validation? Result entry? Admin pages? The permission system is a UI without an enforcement test.
- Lab-unit-restricted users — when a tech is only assigned Hematology, does the Validation page actually filter to Hematology, or does the UI show everything and rely on the user not clicking?

**Lab impact:** A regulatory finding. Access control without enforcement testing means the system can be claimed to enforce roles when it doesn't.

---

### S. Search index / "Start Reindexing"

**What tests confirm:** `/SearchIndexManagement` admin page renders a single "Start Reindexing" button.

**What tests don't confirm:**
- Has the button ever been clicked? Did anything happen? Did logs record activity? Did patient search behavior change?

**Lab impact:** If search becomes degraded over time and the reindex button does nothing, support tickets multiply.

---

### T. Plugin loading (`/PluginFile`)

**What tests confirm:** Page renders, "No plugins found" empty state.

**What tests don't confirm:**
- Has a plugin ever been loaded and exercised? The analyzer integration architecture documented elsewhere (1.2-style profiling, ASTM, HL7, MLLP) routes through plugins. If the plugin loader is broken, every analyzer integration spec is theory.

**Lab impact:** The whole analyzer integration roadmap depends on this.

---

## Part 2 — Methodology gaps in the current skill

Each gap is tied to bugs or near-misses that prove it. Numbers are illustrative, not exhaustive.

### Gap 1 — "Page renders = PASS" is the default

**Symptom:** The TC table format in the SKILL is `Suite | ID Range | Area | Key Notes`. The validation column does not distinguish render-PASS from workflow-PASS. Reports like 2026-04-20 conclude "Overall health: GOOD" with 31/34 PASS — while Inventory storage, EQA, reflex, calculated values, and rejection workflow are all partial.

**Pattern proving it:** BUG-29 (rejection chain) was found only because Phase 23 invented an explicit chain. BUG-37 (patient-order linkage) was caught in Phase 32 because the wizard's submit was followed by a Modify Order read-back. In both cases, the standard render-PASS test passed.

**Fix (Part 3):** Every TC must declare an explicit Acceptance Criterion that is a workflow outcome, and PASS / RENDER-PASS / FUNCTIONAL-PASS must be distinguished in the report.

---

### Gap 2 — API path guessing produces false positives

**Symptom:** Six bug tickets closed in 2026-04-20 because the skill probed invented paths (`/rest/dictionary`, `/rest/provider`, `/rest/referrals`, `/rest/calculatedValue`, `/rest/labUnit`, `/rest/testSections`, `/rest/organizationSearch`) and filed 404s as bugs. The actual app uses a hybrid pattern: legacy JSP at `/api/OpenELIS-Global/<PageName>` plus REST at `/rest/<actual-endpoint>` where the endpoint name often doesn't match the page name.

**Pattern proving it:** BUG-57 retracted (Reports uses `/api/OpenELIS-Global/ReportPrint`, not `/rest/report/*`). BUG-60 retracted in v3.2.1.6 (filter uses `?testSectionId`, not `?labUnit`). BUG-50, 51, 52, 53, 54 retracted.

**Fix (Part 3):** A hard rule — no 404 becomes a bug without a `read_network_requests` capture from the actual user-driven flow that confirms the app calls that path.

---

### Gap 3 — No cross-module chains as first-class

**Symptom:** The catalog organizes by module (Order Entry, Results, Validation, Reports, Admin, ...). Each module's tests pass while inter-module joins fail. The "Phase 23 Chain B" rejection workflow only exists because the user asked for it.

**Pattern proving it:** BUG-29 (rejection → NCE → report → counter). BUG-37 (order → patient linkage). The reflex / calculated values cluster (admin → result entry → downstream test) is untested. The cold-chain excursion → corrective action chain is untested. The EQA shipment → participant result → score chain is untested.

**Fix (Part 3):** Add a top-level "Chains" suite category with 8–12 canonical chains. Chains are mandatory, not optional.

---

### Gap 4 — No persona-driven walkthroughs

**Symptom:** Tests are organized by screen, not by who-does-what-when. A receptionist's daily workflow crosses 5+ screens; a validating biologist's crosses 4; a lab manager's crosses 6; an admin's crosses ~10. None of these end-to-end days has been walked.

**Pattern proving it:** Plenty of admin pages render (Phase 23U–W, 23X). Few are tied to the lab manager who actually configures the system on Day 1. If a lab manager couldn't set up the system following the user manual, the testing wouldn't notice.

**Fix (Part 3):** Add a Personas suite category. Six personas, one walkthrough each.

---

### Gap 5 — No feature-maturity rubric

**Symptom:** "PASS" is binary. A stub page (NoteBook on v3.2.1.4: blank white page) and a fully functional page (Patient Management) both can be "PASS — page renders" depending on the criterion. Inventory storage scores PASS-with-workaround instead of FAIL or PARTIAL.

**Pattern proving it:** NoteBook on v3.2.1.4 was filed as NOTE-19 (low severity) but it was a critical "feature does not exist" gap. Inventory storage locations is a similar case — recorded as a workaround rather than rated as M1 (form-only, no backend).

**Fix (Part 3):** Add a Feature Maturity rubric (M0–M5). Every module gets an explicit rating. Reports tally features by maturity, not by pass count.

---

### Gap 6 — No mandatory round-trip write verification

**Symptom:** A write that returns 200 is often called PASS. BUG-8 (TestModify silently drops ranges) is exactly the bug class that gets through.

**Pattern proving it:** BUG-8 (HTTP 200 with data loss). BUG-37 (HTTP 200 with broken patient link). The Phase 35 Site Branding test wisely round-tripped the color change; the Phase 32 order creation submit did not, which is how BUG-37 took a phase to notice.

**Fix (Part 3):** Every write TC must be paired with a read-back TC that asserts every written field is preserved and returns through a different endpoint (e.g., write via wizard, read via API).

---

### Gap 7 — "No data" empty states are treated as PASS

**Symptom:** When the test instance has no data, every list view renders an empty state — and the empty state often looks correct. E2E suites silently pass because there's nothing to E2E with. Phase 14 NOTE-14 noticed "all logbook types return 0 results, patient search returns 0" and continued the test run.

**Pattern proving it:** Dashboard `15 ready for validation` while Validation queue shows 0 (BUG-60 territory: filter ineffective). Patient counters say one thing, list views show another. The catalog has no "if counts are zero everywhere, halt and reseed" gate.

**Fix (Part 3):** Add a session-start "data census" sanity check. If the test instance has been reset or wiped, skip workflow E2E suites and re-seed before continuing.

---

### Gap 8 — No "dashboard-to-reality" reconciliation

**Symptom:** Dashboard KPIs are tested for "matches the JSON the API returned." They are not tested for "matches the actual queryable list view." BUG-29 caught the rejected-count drift; counter-drift bugs in general are not surfaced.

**Pattern proving it:** Phase 29 found dashboard showed "24 ordersInProgress" while 13 logbook sections were empty. NOTE-3 (API typos in metric field names: `patiallyCompletedToday`, `orderEnterdByUserToday`, `unPritendResults`, `incomigOrders`, `averageTurnAroudTime`) was filed cosmetic, but the underlying issue — these counters are computed in a path that doesn't mirror the list views — is structural.

**Fix (Part 3):** Add a "Counter Reconciliation" suite that, for each Dashboard KPI, fetches the underlying list and asserts `len(list) == counter`. Mismatches are FAIL.

---

### Gap 9 — Bug-list and skill drift

**Symptom:** BUG-38 was retracted then re-assigned. BUG-23 was filed and retracted. OGC-468 (BUG-31) was incorrectly marked Done and had to be reopened. BUG-46 was fixed in v3.2.1.4 and regressed in v3.2.1.5. These oscillations indicate sessions are running without a calibration step against the prior bug list.

**Pattern proving it:** Documented in Validation History rounds 24, 61, 62, 65, 71.

**Fix (Part 3):** Add a session-start calibration step: re-verify the top 5–10 critical open bugs are still present, with the documented evidence. Bugs that retest as resolved get a "verified resolved" comment; bugs that retest as different (e.g., 500 → 200 with broken data) get a comment with the new evidence. No new test phase begins until calibration is done.

---

### Gap 10 — No "feature-to-spec" cross-check

**Symptom:** The FRS documents and the Confluence user manual describe what each feature should do. The tests describe what the feature does. Nothing compares the two.

**Pattern proving it:** The EQA module FRS v1.0 + Addendum v3.0 was only consulted in Phase 27 (EQA-DEEP), and that consultation surfaced 15 spec gaps + 3 spec divergences. For most other modules, no spec comparison exists. Pathology, IHC, Cytology have rich UIs but no test references the histopathology workflow spec.

**Fix (Part 3):** Add a "Spec Walk" step: before testing a module, locate its FRS or user manual section; write one TC per spec requirement that explicitly asserts the requirement is met.

---

## Part 3 — Proposed skill additions

The following sections are written to be pasted into `SKILL.md` more or less as-is. They go after the existing Section 9 (Validation History) and Section 10 (Playwright Rules), and amend Section 0 (Setup) and the suite master table.

### Addition 1 — Amend Section 0 (Setup) to require calibration

Add a new "Step 0.5 — Calibration" after Step 0 — Setup:

```markdown
## Step 0.5 — Calibration (Mandatory before any new test phase)

Before adding new findings, re-verify the current state of the **top 5 critical open bugs** plus any bug touched in the previous session:

1. Re-run the exact evidence steps documented in the bug table or Validation History.
2. Record one of: STILL PRESENT (with new screenshot or capture), RESOLVED (with confirming endpoint behavior), CHANGED (with new evidence describing the change).
3. Update the bug table in this SKILL with the calibration result.

Skip calibration only if the previous session ran ≤ 24 hours ago against the same instance.

Calibration prevents the recurring drift seen in Validation History — bugs marked Done that regress, bugs retracted and re-assigned, false positives carried for multiple rounds.
```

---

### Addition 2 — New mandatory rule for endpoint identification

Add to Section 6 (Workarounds) or Section 7 (Error Handling):

```markdown
## Section 6.5 — No bug filed against a 404 without live capture

OpenELIS Global uses a hybrid architecture:

- Legacy JSP/Struts pages at `/api/OpenELIS-Global/<PageName>`
- React SPA REST calls at `/rest/<endpoint>` — where the endpoint name often does NOT match the page name.

Examples (from 2026-04-20 false-positive cluster):
- Dictionary page → `/rest/DictionaryMenu` (not `/rest/dictionary`)
- Patient search → `/rest/patient-search-results` (not `/rest/patient`)
- Provider → JSP `/api/OpenELIS-Global/ProviderMenu` (no `/rest/provider`)
- LogbookResults filter → `?testSectionId=N` (not `?labUnit=N`)
- Reports → JSP `/api/OpenELIS-Global/ReportPrint` (not `/rest/report/*`)

**Rule.** Before filing a bug against a 404 on a REST endpoint, use `read_network_requests` to capture what the browser actually calls when a real user performs the action. If the captured path returns 200 but your guessed path returns 404, the bug is a false positive — file no ticket.

**Apply this rule to:** every BUG-* candidate whose only evidence is `GET /rest/X → 404`.
```

---

### Addition 3 — Feature Maturity rubric

Add after Section 5 (URL Discovery):

```markdown
## Section 5.5 — Feature Maturity Rubric

Every module gets an explicit Maturity rating per test phase. A "PASS" tag does not say how mature; the rating does. Aggregate reports must summarize counts by maturity, not by pass count.

| Rating | Name | Criterion |
|--------|------|-----------|
| **M0** | Stub | Sidebar link or page renders, but body is empty or shows raw i18n keys. NoteBook on v3.2.1.4 was M0. Billing on v3.2.1.5 is M0. |
| **M1** | Form-only | UI renders with form fields and dropdowns. Submit either returns 4xx/5xx, or returns 200 but no read-back is possible. Inventory Storage Locations is M1 (POST 500). EQA participants is M1 on most installs. |
| **M2** | Saves | Writes return 2xx and the data appears in a subsequent read on the same endpoint. Patient create is M2. Order create is M2 *at best* — but linkage to patient is M1, so the order as a whole is M1.5. |
| **M3** | Round-trips | Writes persist and read back via a *different* endpoint or screen (UI write → API read, or UI write → admin read). Reference-range edits should be M3 to expose BUG-8. Most admin pages are M3. |
| **M4** | Cross-links | Data written in module A correctly affects module B. A rejected sample reaching the Rejection Report. A validated result appearing on the Patient Status Report PDF. A reflex rule firing on result entry. Currently most cross-links are unverified. |
| **M5** | Reportable | The feature produces compliant outputs that satisfy a regulator or auditor — Pa  PDF reports with correct branding, FHIR resources that round-trip cleanly, audit trails for sensitive actions, cold-chain excursions logged with corrective actions linked. |

A module is rated at the lowest M-level any of its sub-features hits. Inventory module overall is M1 (storage locations broken). Reports module on v3.2.1.6 is M2 at most (renders + generates) until cross-link tests are added.

**Acceptance criterion change:** A test phase report must list maturity per module, not just pass count. "EQA Module — M1: all UIs render, none round-trip. Maturity unchanged from v3.2.1.4."
```

---

### Addition 4 — Round-trip Write Verification as a mandatory pattern

Add to Section 7 (Error Handling) or as a new Section 7.5:

```markdown
## Section 7.5 — Round-trip Write Verification (Mandatory for all write tests)

Every TC that involves a write (POST/PUT/DELETE) MUST be paired with a read-back step in the same TC. The TC fails if the read-back does not match the write.

**Pattern:**

1. **Write** — perform the action via the UI or API. Record the request payload.
2. **Read-back via different surface** — fetch the same resource through a different path than the write. Prefer the screen the user would next visit (Modify Order after Add Order; Patient Search after Patient Create; Admin list after Admin Create).
3. **Diff** — every field in the write payload must appear in the read-back response with the same value. Missing or changed fields are FAIL.

**Examples of read-backs that would have caught past bugs:**

| Bug | Write | Required read-back |
|-----|-------|----|
| BUG-8 TestModify | POST `/rest/TestModifyEntry` | GET `/rest/test-list?id=X`; compare normal ranges field-by-field |
| BUG-37 patient-order linkage | Add Order wizard submit | Modify Order on the new accession; assert patient name appears |
| BUG-29 rejection workflow | Reject Sample checkbox on Order Entry | (1) GET Rejection Report PDF for the date range, assert sample appears; (2) GET NCE list, assert NCE created; (3) GET Dashboard `ordersRejectedToday`, assert counter increased |
| Site Branding | PUT `/rest/site-branding` color | GET Patient Status Report PDF, assert color appears on header |
| Reflex rule | POST `/rest/reflexrule` | Enter triggering result, assert downstream test appears in Workplan |

**Diff rule for arrays and nested fields:** Every element matters. A reflex rule with 3 conditions that comes back with 2 is FAIL.
```

---

### Addition 5 — Cross-Module Workflow Chains as a first-class suite category

Add to Section 3 (Suite Master Table) under a new "Chains" heading:

```markdown
### Chains — Cross-Module Workflow Suites (Mandatory in every test run)

Chains are end-to-end workflows that cross 3+ modules. They are not optional — every test run that targets a non-trivial subset of the system must execute at least Chain A (Order Lifecycle). Chains that depend on admin config (e.g., Chain F EQA) must run their prerequisite first.

| Chain | Name | Modules | What it tests | Caught (or would have caught) |
|-------|------|---------|----|---|
| **A** | Order Lifecycle | Order → Sample → Result → Validation → Patient Report → FHIR | The whole forward path. Order created, patient linked, sample received, result entered, validated, appears on Patient Status Report PDF, and is queryable as FHIR Observation. | BUG-37 (patient-order linkage), BUG-8 (silent data loss on save) |
| **B** | Rejection → NCE → Report | Order rejection → NCE auto-creation → Rejection Report → Dashboard counter | The cross-module data flow Phase 23 invented ad-hoc. | BUG-29 (rejection silo) |
| **C** | Reflex Trigger | Admin reflex rule create → Result entry → Workplan check | Confirms reflex actually fires. | Currently impossible — reflex rules are M1 |
| **D** | Calculated Value | Admin calc create → Two source results enter → Calc appears on results | Confirms compute engine runs. | Currently impossible — calcs are M1 |
| **E** | Sample Validation Lifecycle | Result enter → Reject for technical reasons → Re-test → Validate → Patient Report | Tests the back-and-forth path that real labs walk. | Untested |
| **F** | EQA Distribution | Admin enable EQA → Create program → Create shipment → Distribute → Participant enters result → Score → Report | Confirms the EQA workflow end-to-end. | OGC-518–524 cluster (EQA disabled silently broke everything) |
| **G** | Cold-Chain Excursion | Device configured → Simulated excursion → Alert fires → Corrective action linked → Audit log entry | Confirms the regulatory-required loop. | Untested |
| **H** | Permission Enforcement | Admin create user with restricted role → Login as that user → Attempt restricted action → Fail with 403 | Confirms access control is enforced, not just configured. | Untested |
| **I** | Site Branding to Report | Admin update branding → Generate Patient Status Report PDF → Branding appears | Confirms the pipeline from admin to output. | NOTE-29 (report header "null") |
| **J** | Audit Trail Coverage | Edit reference range, delete result, grant admin role → Audit Trail shows each | Confirms audit entries are written for sensitive actions. | Untested |
| **K** | Cross-installation FHIR Round-trip | UI write → FHIR read → External FHIR POST → UI read | The integration use case OpenELIS markets. | Untested |
| **L** | Lab Number Uniqueness | Concurrent Add Order, Batch Order Entry, EQA Sample, Generic Sample → No duplicate lab numbers | Confirms accession generation across paths. | Untested |

**Chain reporting:** Each chain produces a single PASS/PARTIAL/FAIL with module-level breakdown. A chain at M3 in module A but M1 in module B is rated at the floor — M1.
```

---

### Addition 6 — Personas as a suite category

Add another new section to Section 3:

```markdown
### Personas — Day-in-the-life Walk-throughs

Personas test what a real role does in a working day. Each persona is one TC that crosses multiple screens. PASS requires the persona to complete every documented action without workarounds.

| Persona | What a normal day looks like |
|---------|-------|
| **PA — Receptionist** | Search for patient by national ID; if found, place an order for them on the right program; if not, create the patient and place the order. Print barcode labels. Hand off the order. |
| **PB — Bench Tech (Hematology)** | Open Workplan filtered to Hematology. Pick one sample from the queue. Enter results for CBC panel. Save. Move on to next. Bulk-save normal results on 10 outstanding routine cases. |
| **PC — Validating Biologist** | Open Validation Routine for Hematology. Review results. Add a note where needed. Reject one for re-test. Validate the rest. Open Patient Results for one validated case and confirm it's there. |
| **PD — Lab Manager** | Pull morning Dashboard, drill into Orders In Progress. Pull yesterday's Rejection Report. Pull weekly Statistics Report. Confirm the Test Turn-Around-Time KPIs match the underlying data. |
| **PE — QA Officer** | View NCE Dashboard. Pick one open NCE. Document corrective action. Pull Non-Conformity By Section/Reason report for the quarter. Confirm CAP/CLIA compliance footer on cold-chain export. |
| **PF — Lab Administrator** | First-time setup: change site branding (logo, colors, lab name), configure barcode formats, set up one new test (TestAdd), set up one new analyzer mapping, enable EQA, create one new user with Receptionist role, generate a user manual link to share. |

**A persona PASSes** only if the persona completes every step using documented UI paths, with no workarounds. If a step requires a config toggle the persona shouldn't have to know about (like EQA enabled), that's a FAIL of PF — it counts against the Lab Administrator persona because they shouldn't have hidden requirements.

Personas surface architectural gaps. PD will catch the dashboard-to-reality mismatch; PF will catch the EQA-not-enabled silent dead-end; PE will catch the rejection chain break.
```

---

### Addition 7 — Partial-Feature Audit pass

Add to Section 3 or as a new Section 8.5:

```markdown
## Section 8.5 — Partial-Feature Audit (Required quarterly + on major version)

Once per quarter, and on every major version bump, run the Partial-Feature Audit. The audit is a deliberate hunt for features that pass the standard render-PASS criterion but are functionally incomplete. The output is a list of M0–M2 modules ranked by lab impact.

**Procedure:**

1. **Enumerate visible features.** From the sidebar, every top-level item is a candidate. List every screen the user can reach.
2. **For each screen, check four signals:**
   - **a.** Are there i18n keys leaking through? (Suggests an unmaintained branch — see BUG-43, BUG-44, BUG-47, NOTE-35.)
   - **b.** Do any primary buttons return 4xx/5xx? (Inventory Reports Generate; NCE submit.)
   - **c.** Is there a filter that doesn't filter? (BUG-41 Inventory active filter; BUG-60 LogbookResults pre-v3.2.1.6.)
   - **d.** Does a "successful" write read back missing fields? (BUG-8 TestModify.)
3. **For each module, rate Maturity M0–M5.** Document the evidence.
4. **Lab Impact rank.** For each M0–M2 module, write one sentence: "A lab needing X cannot do X because Y." Sort the list by severity.

The audit produces a delivery document, not a Jira fire-hose. File Jira tickets only for the top 10 issues, ranked by lab impact. The rest go in the audit report as a prioritization backlog.

**Past Partial-Feature audit findings (seed data, 2026-05-12):** Inventory storage locations (M1), Inventory Reports (M1), Cold Storage compliance loop (M2 unverified), EQA distribution (M1 without config), Reflex rules (M2 unverified), Calculated values (M2 unverified), Pathology workflow progression (M2 unverified), Rejection workflow chain (M2 broken), Patient-order linkage on order create (M1.5 broken), NCE submission (M1 broken), Permission enforcement (M1 unverified), Audit trail coverage (M2 unverified), FHIR resource round-trip (M2 unverified), Notification subsystem (M1).
```

---

### Addition 8 — Data Census gate at session start

Amend Step 0 (Setup) or add a Step 0.6:

```markdown
## Step 0.6 — Data Census (Mandatory before any E2E or persona suite)

Before running any chain or persona that depends on existing data, run a one-call census:

- Patient search by `lastName=A` — record count.
- LogbookResults for the busiest unit (Hematology on most installs) — record count.
- Dashboard KPIs JSON — record `ordersInProgress`, `ordersReadyForValidation`, `unPritendResults`.
- Recent accessions list (admin lab number page or a known query) — record range.

If patient count = 0 AND logbook count = 0 AND Dashboard shows zeros: the test instance has been reset. Halt all E2E and persona work and either (a) reseed with the `QA_AUTO_*` prefix dataset, or (b) note in the report header that the instance is empty and limit testing to render-only checks.

This prevents the Phase 14 NOTE-14 pattern: silently running an E2E suite on an empty database and reporting PASS for nothing.
```

---

### Addition 9 — Dashboard-to-Reality reconciliation

Add a new sub-suite to the existing "Y — Data Integrity" suite:

```markdown
### Y-RECON — Dashboard Counter Reconciliation (Required every run)

For each Dashboard KPI, fetch the underlying list and assert `len(list) == counter`. Mismatches are FAIL, not informational.

| KPI | Backing list / query | Assertion |
|-----|----------------------|-----------|
| Orders In Progress | LogbookResults across all units with status=In Progress | Sum equals counter |
| Ready For Validation | AccessionValidation queue size | Equals counter |
| Orders Entered By User Today | Audit Trail filtered to entered=today | Equals counter |
| Orders Rejected Today | Rejection Report for today | Equals counter — currently FAILs per BUG-29 |
| Un-Printed Results | Result list with printed=false | Equals counter |
| Electronic Orders | Incoming Test Requests filtered to "Entered" status | Equals counter |
| Average Turn-Around Time (three sub-KPIs) | Sample audit timestamps; compute median | Within ±10% of displayed value |

The assertion failure mode catches counter-drift bugs that would otherwise be invisible (BUG-29 class).
```

---

### Addition 10 — Acceptance criteria standard

Amend the report format guidance (Step 5) to require explicit acceptance criteria:

```markdown
## Step 5b — Required acceptance criteria per TC

Every TC must declare its Acceptance Criterion in one of the following forms:

- **RENDER** — page or component renders; specific DOM elements exist. Default for "page loads" checks.
- **FUNCTION** — a primary user action completes without error (button click leads to 200, navigation occurs, dialog closes).
- **PERSIST** — written data appears in a subsequent same-endpoint read.
- **ROUND-TRIP** — written data appears in a different endpoint or screen.
- **CROSS-LINK** — data written in one module correctly affects another.
- **REPORTABLE** — output passes regulatory criteria (PDF generated with correct branding, FHIR resource validated, audit entry created).

A test phase that reports only RENDER acceptance criteria for a module is required to rate the module at M1 maximum, regardless of how many TCs passed.

A test phase that reports a higher-tier criterion must include the evidence (read-back diff, cross-module verification, PDF content excerpt).
```

---

## Closing notes

**Where this lands.** Adopting all of Part 3 is a meaningful rewrite of the skill. The highest-leverage subset, if you want to phase it in:

1. **Addition 2** (no 404 → bug without live capture) — closes the false-positive bleeding.
2. **Addition 4** (round-trip write verification) — closes the silent-data-loss class.
3. **Addition 5 Chain A and Chain B** (Order Lifecycle, Rejection Workflow) — closes the cross-module silos and exposes BUG-29 / BUG-37 class issues immediately.
4. **Addition 3** (Feature Maturity rubric) — makes Inventory-storage-shaped issues visible without inventing new suites.
5. **Addition 1** (calibration) — stops the bug-list drift documented in Validation History.

Items 6–10 add depth but the first five close the biggest gaps.

**What this won't catch.** Performance regressions under real load. Multi-user concurrency bugs. Race conditions in the audit trail. Edge-case browser behavior (Firefox vs. Safari vs. mobile). These remain in the skill's blind spots and would benefit from a different testing discipline.

**A note on the Inventory storage example.** Casey called this out because a human reviewer would have seen the storage feature as visibly partial — empty dropdown, broken modal, vapor reports tab. The skill missed it because each individual signal (POST 500, empty dropdown, Generate button on Reports tab) was either logged with a bug number and moved on, or treated as an empty-state PASS. The fix is not noticing harder; it's a rubric that forces "what would a real user trying to do this actually experience?" into the acceptance criterion.
