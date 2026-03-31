---
name: openelis-test-catalog-qa
description: >
  Automated QA testing skill for OpenELIS Global covering all major application areas:
  Test Catalog, Order Workflow, Edit Order, RBAC, Validation, Results By Unit,
  Non-conforming Samples, Patient Management, Dashboard KPIs, Order Search,
  Admin Configuration, Lab Reports, Referral Management, and Workplan/Sample Tracking.
  Use this skill whenever you need to run, verify, or regression-test any part of
  OpenELIS — including test management (create/edit/search/deactivate/reactivate),
  test configuration (panels, result types, normal ranges), sample type management,
  the end-to-end order workflow, result entry, result validation (approve/reject/refer),
  the lab section worklist (By Unit), non-conforming sample handling, patient search
  and demographics management, dashboard KPI verification, order search and lookup,
  admin config (reference labs, dictionary, test sections), lab report generation,
  referral management (refer out, receive results), and workplan/sample reception.
  Also use when the user says "test the test catalog", "run QA on OpenELIS",
  "check if test management works", "regression test OpenELIS", "verify OpenELIS test CRUD",
  "test order entry", "verify I can order a test", "test validation", "test the worklist",
  "check non-conforming samples", "test patient search", "verify the dashboard",
  "test referrals", "check the workplan", "test lab reports", or asks to validate
  any lab operations in OpenELIS Global.
  This skill uses Claude in Chrome to drive a real browser session against a live OpenELIS
  instance and produces a pass/fail report, step-by-step log, and Jira tickets for failures.
---

# OpenELIS Test Catalog QA Skill — v2

You are a QA automation agent for OpenELIS Global. Your job is to:
1. Navigate to an OpenELIS instance in Chrome
2. Execute the requested test suites
3. Log every action and capture screenshots of key states
4. Generate a structured pass/fail report
5. Create Jira bug tickets for any new failures

---

## Step 0 — Setup

**Ask the user:**
1. "Which OpenELIS URL should I test against? (e.g., `https://demo.openelis-global.org`)"
2. "Which test suites should I run?" (default: all)

Store the URL as `BASE_URL`. All navigation will be relative to it.

**Credentials:** `admin` / `adminADMIN!`

**Test data prefix:** Use `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324`) for any created data.

**Known baseline accession (jdhealthsolutions instance):**
- `26CPHL00008V` — Patient Abby Sebby, HGB(Whole Blood), last result = 2 g/dL

---

## Step 1 — Read the Test Cases

Before navigating, read ALL relevant test scenarios from:
- `references/test-cases.md` — detailed steps, navigation paths, and success criteria

Also scan `/outputs/openelis-test-catalog-qa/` for prior QA reports. Cross-reference
against the known bug list (below) so you don't re-file duplicate tickets.

---

## Step 2 — Login

1. Navigate to `BASE_URL`
2. If redirected to login page, enter: `admin` / `adminADMIN!`
3. Click Login
4. **Verify:** Dashboard loads (KPI cards visible)
5. Log: `[PASS] Login successful` or `[FAIL] Login failed`

If login fails, stop and report immediately. All subsequent tests depend on this.

---

## Step 3 — Run the Test Suites

Execute test scenarios in the order shown. For each:
- Follow steps from `references/test-cases.md` exactly
- Screenshot after each meaningful action (form save, page transition, error)
- Record `PASS`, `FAIL`, `SKIP`, or `GAP` with a brief note
- On failure: screenshot immediately, note the exact step, continue to the next case

### Available Suites

| Suite | ID Range | Area | Key Known Issues |
|-------|----------|------|-----------------|
| A — Test Catalog | TC-01 to TC-08 | Create/edit/deactivate/reactivate tests, panels, ranges | BUG-1 (TestAdd POST 500), BUG-7/7a (PanelCreate), BUG-8 (TestModifyEntry silent fail) |
| B — Order Workflow | TC-09 to TC-11 | Add sample, place order, enter results, flags | TC-11 flags require BUG-8 fix |
| C — Edit Order | TC-EO-01 to TC-EO-04 | Modify placed orders, edit results | BUG-4 (new accession on modify) |
| D — RBAC | TC-RBAC-01 to TC-RBAC-10 | Receptionist + lab tech role flows, access control | BUG-3 (user creation POST 500) |
| E — Validation | TC-VAL-01 to TC-VAL-08 | Approve/reject/refer results, notes, flag overrides | TC-VAL-06 SKIP until BUG-8 fixed |
| F — Results By Unit | TC-BU-01 to TC-BU-05 | Lab section worklist, filter, enter results | URL must be discovered at runtime |
| G — Non-conforming | TC-NC-01 to TC-NC-05 | Rejected samples, NC flag, validation of NC orders | — |
| H — Patient Mgmt | TC-PAT-01 to TC-PAT-06 | Patient search (ID/name/partial), history, create/edit | — |
| I — Dashboard | TC-DASH-01 to TC-DASH-04 | KPI cards, values, clickable links, role access | — |
| J — Order Search | TC-OS-01 to TC-OS-05 | Lookup by accession/patient/date, status, print label | — |
| K — Admin Config | TC-ADMIN-01 to TC-ADMIN-06 | Lab config, reference labs, orgs, dictionary CRUD | Possible BUG-8 class on CRUD |
| L — Reports | TC-RPT-01 to TC-RPT-05 | Lab report access, demographics, results, labels, batch | URLs vary; some may be GAP |
| M — Referral | TC-REF-01 to TC-REF-06 | Refer out, external lab dropdown, receive results, validate | BUG-2 (dropdown reverts) |
| N — Workplan | TC-WP-01 to TC-WP-06 | Workplan filter, result entry, queue management, sample reception | URL must be discovered |
| O — LOINC/Dict | TC-LOINC-01 to TC-LOINC-06 | LOINC screen, search, mapping, add code, dict categories/CRUD | Possible BUG-8 class on CRUD |
| P — System/Audit | TC-SYS-01 to TC-SYS-05 | Audit log, system config, analysis config, providers | — |
| Q — Batch | TC-BATCH-01 to TC-BATCH-06 | Multi-patient batch orders, bulk result entry, validation, pagination | — |
| R — HL7/FHIR | TC-EO-01 to TC-EO-05 | FHIR metadata, Patient/ServiceRequest/DiagnosticReport, e-order submission | — |
| S — Export | TC-EXP-01 to TC-EXP-05 | CSV export (results, workplan), PDF report, validation export, dashboard export | Many may be GAP |
| T — i18n | TC-I18N-01 to TC-I18N-05 | Language switcher, French toggle, date format, translated report | — |
| U — Session | TC-SESS-01 to TC-SESS-05 | Session timeout, logout, stale token, login errors, concurrency | Security suite |
| V — Accessibility | TC-A11Y-01 to TC-A11Y-05 | Keyboard nav, form labels, contrast, ARIA landmarks, error association | WCAG 2.1 AA smoke |
| W — Error Handling | TC-ERR-01 to TC-ERR-06 | Invalid input, empty search, XSS, extreme values, 404, double submit | Security + robustness |
| X — Performance | TC-PERF-01 to TC-PERF-06 | Load times, search latency, KPI render, memory leak indicator | Advisory thresholds |
| Y — Data Integrity | TC-DI-01 to TC-DI-06 | Cross-module consistency, round-trip precision, orphan detection | Cross-module |
| Z — Cleanup | TC-CLEAN-01 to TC-CLEAN-05 | Deactivate QA patients, LOINC, dict entries, users; document residual | Run last |
| AA — Results By Patient/Order | TC-RBP-01–06 | Results By Patient, By Order screen load, search, display | — |
| AB — Validation By Order/Range/Date | TC-VBO-01–05 | Validation By Order, By Range, By Date screen load, search | — |
| AC — Merge Patient | TC-MP-01–04 | Patient merge screen load, search duplicates, select, merge | — |
| AD — NC Corrective Actions | TC-NCA-01–05 | NC events queue, corrective actions screen, create, save, history | — |
| AE — Routine Reports | TC-RPT-R01–05 | Patient Status, Statistics, Summary of All Tests reports | — |
| AF — Management Reports | TC-RPT-M01–05 | Rejection, Referred Out, Delayed Validation, Audit Trail reports | — |
| AG — WHONET & Export Reports | TC-RPT-W01–05 | WHONET report, date range filtering, no-data handling, export | — |

---

## Suite X — Performance Smoke (TC-PERF)

**Context:** Timing thresholds are advisory. Document actual times. Only hard-fail on extreme outliers (>10s login, >15s validation queue).

**TC-PERF-01 — Login page load time**
Measure DOMContentLoaded time. Target: < 3s. Hard fail: > 10s.

**TC-PERF-02 — Add Order step transition time**
Click Next on each wizard step. Measure time to new content render. Target: < 2s per step.

**TC-PERF-03 — Results search latency**
Search `26CPHL00008V`. Measure time from Enter to results visible. Target: < 3s.

**TC-PERF-04 — Validation queue load time**
Navigate to Validation. Measure time to first pending row visible. Also count DOM nodes (>5000 = concern).

**TC-PERF-05 — Dashboard KPI render time**
Navigate to Dashboard. Measure time to KPI cards showing values (not spinners). Target: < 4s.

**TC-PERF-06 — Memory leak indicator**
Record `performance.memory.usedJSHeapSize` before and after 10 navigations. > 2x growth = potential leak.

---

## Suite Y — Data Integrity (TC-DI)

**Context:** Verifies that the same data appears identically across modules. Critical for clinical safety — a result value that rounds differently between the result entry view and the lab report could cause a misdiagnosis.

**TC-DI-01 — Accession consistent across modules**
Collect patient name, test, result from: Results By Order, Order Search, Validation, Patient History, FHIR API. All must match.

**TC-DI-02 — Patient demographics consistent**
Collect name, DOB, gender, ID from: Patient Search, Add Order, Results, Lab Report, FHIR. All must match.

**TC-DI-03 — Result value round-trip**
Enter `13.57`. Verify it displays as `13.57` (not `14` or `13.6`) in Results, Validation, Report, FHIR.

**TC-DI-04 — Order count consistency**
Compare Dashboard "Awaiting" KPI, Results By Order pending count, and Workplan pending count. Target: within ±2.

**TC-DI-05 — Validation status propagation**
After validating a result, verify all modules show "validated" (not "pending"). Dashboard KPI should decrement.

**TC-DI-06 — Orphan detection**
Scan results table for rows with blank patient, blank accession, or unknown test. Any = data integrity issue.

---

## Suite Z — Cleanup (TC-CLEAN)

**Context:** Run this suite LAST. Deactivate rather than delete. Document what cannot be cleaned.

**TC-CLEAN-01 — Deactivate QA patient** (`QA_PAT_<MMDD>` from TC-PAT-05)
**TC-CLEAN-02 — Deactivate QA LOINC entry** (`QA-AUTO-9999` from TC-LOINC-04)
**TC-CLEAN-03 — Deactivate QA dictionary entries** (`QA_AUTO_RejReason`, `QA_EDITED_ENTRY`)
**TC-CLEAN-04 — Deactivate QA user accounts** (`qa_recept`, `qa_labtech` from SETUP)
**TC-CLEAN-05 — Document residual data** — orders and results cannot be deleted; inventory everything that remains.

---

## Suite U — Session Management (TC-SESS)

**TC-SESS-01 — Session timeout after idle**
Login. Wait for timeout period. Attempt navigation. Verify redirect to login.

**TC-SESS-02 — Logout clears session**
Login. Navigate to data page. Logout. Verify login redirect. Press Back. Verify session is fully cleared.

**TC-SESS-03 — Stale URL redirect**
Without logging in, navigate directly to a protected URL. Verify redirect to login page.

**TC-SESS-04 — Login error consistency**
Enter invalid username → note error. Enter valid username with wrong password → note error. Both errors should be identical (prevents credential enumeration).

**TC-SESS-05 — Concurrent sessions**
Login in two browser contexts simultaneously. Verify both remain active (or document if one is invalidated).

---

## Suite V — Accessibility / WCAG Smoke (TC-A11Y)

**TC-A11Y-01 — Keyboard navigation**
Tab through main menu. Verify all items reachable. Verify visible focus indicator. Enter activates focused item.

**TC-A11Y-02 — Form labels**
On Add Order, count inputs that lack `<label>`, `aria-label`, or `aria-labelledby`. Target: all critical fields labeled.

**TC-A11Y-03 — Color contrast**
On Results page, extract foreground/background colors. Flag any text below WCAG AA 4.5:1 ratio.

**TC-A11Y-04 — ARIA landmarks**
Check page for `<main>`, `<nav>`, `<header>`, `<footer>` or equivalent roles. Target: at least 2 landmarks.

**TC-A11Y-05 — Error messages associated**
Trigger a form error. Verify the error element is linked via `aria-describedby` or `aria-errormessage`.

---

## Suite W — Error Handling (TC-ERR)

**TC-ERR-01 — Invalid accession**
Enter `INVALID_ACCESSION_999` in Results By Order. Verify graceful "not found" message (no stack trace, no crash).

**TC-ERR-02 — Empty search**
Submit patient search with all fields blank. Verify no crash.

**TC-ERR-03 — XSS prevention**
Enter `<script>alert(1)</script>` in a text field. Verify alert does not fire. CRITICAL security check.

**TC-ERR-04 — Extreme result values**
Enter `-5`, `999999999`, `abc` as result values. Verify graceful handling — no crash, no silent save of invalid data.

**TC-ERR-05 — 404 page**
Navigate to `<BASE>/ThisPageDoesNotExist`. Verify clean error page with no stack trace or server details.

**TC-ERR-06 — Double submit prevention**
On Add Order submit, double-click rapidly. Verify only one order is created.

---

## Suite R — FHIR Integration (TC-EO)

**FHIR Base Discovery:** Try `<BASE>/fhir` and `<BASE>/api/fhir`. Hit `/metadata` first to confirm availability.

**TC-EO-01 — FHIR metadata endpoint**
GET `<FHIR_BASE>/metadata`. Verify CapabilityStatement JSON with FHIR R4 version and supported resources.

**TC-EO-02 — FHIR Patient lookup**
GET `<FHIR_BASE>/Patient?identifier=0123456`. Verify Abby Sebby is returned in the FHIR Bundle.

**TC-EO-03 — FHIR ServiceRequest for lab orders**
GET ServiceRequest or DiagnosticReport filtered to patient 0123456. Verify at least one entry exists for a known order.

**TC-EO-04 — FHIR DiagnosticReport includes results**
GET DiagnosticReport for patient 0123456. Verify result references to Observations with values and LOINC codes.

**TC-EO-05 — Electronic order submission via FHIR**
POST a minimal ServiceRequest (subject=Patient/0123456, code=HGB/718-7, status=active). Verify 201 Created. Then check the OpenELIS UI worklist for the order. If FHIR is read-only, document as GAP.

---

## Suite S — Export and Download (TC-EXP)

**Context:** Many OpenELIS screens may not have export buttons. Document each as GAP if absent — this is common and not necessarily a bug, but valuable to catalog for future feature work.

**TC-EXP-01 — Results export to CSV**
On Results → By Order, look for Export/Download CSV button. If found, verify downloaded CSV contains matching data.

**TC-EXP-02 — Workplan export to CSV**
On the Workplan screen, look for Export. Verify pending tests are listed.

**TC-EXP-03 — Patient report export to PDF**
On the lab report for `26CPHL00008V`, look for PDF/Print/Download. Verify patient and result data in PDF.

**TC-EXP-04 — Validation report export**
On the Validation screen, look for Export/Print. Verify pending/completed validation data.

**TC-EXP-05 — Dashboard KPI export**
On the Dashboard, look for Export. Verify KPI counts in exported file.

---

## Suite T — Localization / i18n (TC-I18N)

**Language Switch Discovery:** Try: `?lang=fr`, `?locale=fr`, FR link/button in header/footer, language dropdown selector.

**TC-I18N-01 — Language switcher present**
On any page, look for language selector (dropdown, FR/EN links, globe icon). Record available languages.

**TC-I18N-02 — Switch to French**
Activate French locale. Verify menu items and form labels are translated. Verify layout is not broken.

**TC-I18N-03 — Switch back to English**
After French, switch to English. Verify all labels revert with no residual French text.

**TC-I18N-04 — Date format follows locale**
In English vs French locale, observe the date format on Add Order. Document actual formats.

**TC-I18N-05 — Lab report in translated language**
With French active, generate report for `26CPHL00008V`. Verify template text is in French while data values remain correct.

---

## Suite O — LOINC and Dictionary Deep CRUD (TC-LOINC)

**URL Discovery:**
```
/MasterListsPage/LOINCCodes
/LOINCManagement
/MasterListsPage/TestLOINC
/MasterListsPage/LOINC
```

**TC-LOINC-01 — LOINC management screen accessible**
Try URL candidates. Verify a LOINC management screen loads with a searchable list. Record the URL.

**TC-LOINC-02 — Search for HGB LOINC code**
Search for `718-7` or `Hemoglobin`. Verify code `718-7` with description "Hemoglobin [Mass/volume] in Blood" is returned.

**TC-LOINC-03 — LOINC mapping on test record**
In Test Modify Entry for HGB, find the LOINC field. Verify a LOINC code is configured or that a LOINC picker is available.

**TC-LOINC-04 — Add a LOINC code (CRUD)**
Click Add. Enter code `QA-AUTO-9999`, description `QA Automated LOINC Test Code`. Save. Verify entry appears. Mark for CLEANUP. If save fails silently, document as BUG-8 class.

**TC-LOINC-05 — Dictionary category list**
Navigate to Dictionary management. Verify multiple categories are visible (Rejection Reasons, Result Interpretation, etc.).

**TC-LOINC-06 — Edit and deactivate dictionary entry**
Edit the `QA_AUTO_RejReason` entry (from TC-ADMIN-06) to `QA_EDITED_ENTRY`. Verify edit persists. Deactivate. Verify inactive status. Reactivate.

---

## Suite P — Audit Log and System Configuration (TC-SYS)

**URL Discovery:**
```
Audit: /AuditLog, /SystemLog, /ActivityLog, /MasterListsPage/AuditLog
Config: /SystemConfiguration, /MasterListsPage/SystemConfig, /AdminModule
```

**TC-SYS-01 — Audit log screen accessible**
Try audit log URLs. Verify screen loads with a table of events showing timestamp, user, and action.

**TC-SYS-02 — Audit log shows recent QA actions**
Apply today's date filter. Look for actions by `admin` from this session. Verify at least one entry appears.

**TC-SYS-03 — System configuration screen accessible**
Try config URLs. Verify at least one configurable parameter is visible. Do NOT change values.

**TC-SYS-04 — Test analysis configuration list**
Find the analysis configuration screen. Verify it shows: test name, test code, sample type, result type, active status for each configured analysis.

**TC-SYS-05 — Provider/requester configuration**
Navigate to Providers/Requesters admin. Find a known requester from the Add Order flow. Verify name, site, contact are shown.

---

## Suite Q — Multi-Patient Batch Workflow (TC-BATCH)

**Context:** Simulates high-volume lab day. Place multiple orders, enter results in bulk via By Unit, validate in batch. Detects race conditions, accession collisions, and pagination bugs.

**TC-BATCH-01 — Place 3 orders**
Place 3 orders (may reuse patient Abby Sebby). Verify each generates a unique accession number. Record as `BATCH_ACC_1/2/3`.

**TC-BATCH-02 — All 3 orders searchable**
Search for each batch accession in Results → By Order. Verify each is found with correct patient and test data.

**TC-BATCH-03 — Batch result entry via By Unit**
In By Unit → Hematology, verify at least 2 batch orders appear. Enter results (e.g., `11.0`, `14.2`) for all visible rows. Click Save. Verify no silent failures.

**TC-BATCH-04 — Validation queue shows all pending**
Navigate to Validation. Verify pending rows include results from at least 2 batch accessions. Verify patient names are not cross-contaminated.

**TC-BATCH-05 — Approve multiple results in one session**
Accept/approve up to 3 checkboxes in the validation queue. Click Save/Validate. Verify all rows transition to validated state. Navigate to Results → By Order to confirm.

**TC-BATCH-06 — Pagination / long queue**
In any list view (Results By Order, Validation, Workplan), check for pagination controls. If present: navigate to page 2 and verify distinct (non-duplicate) rows. If absent: document that single-page scrolling is used.

---

## Suite L — Lab Reports and Print (TC-RPT)

**URL Discovery for reports:** Try:
```
/PrintLabel?accession=<ACC>
/LabReport?accession=<ACC>
/PatientReport?accession=<ACC>
Reports menu in hamburger navigation
```

**TC-RPT-01 — Lab report accessible from results view**
From Results → By Order, look for a Print / Lab Report button on the order row. Click it. Verify a print dialog, PDF, or preview appears. If absent, document as GAP.

**TC-RPT-02 — Lab report contains patient demographics**
Generate the lab report for `26CPHL00008V`. Verify patient name, DOB/ID, and collection date appear. Screenshot the header.

**TC-RPT-03 — Lab report contains test results**
In the generated lab report, verify HGB test name and result value are present. Reference range column may be blank (BUG-8). Document what is and isn't shown.

**TC-RPT-04 — Label print from order confirmation**
From order search or confirmation for `26CPHL00008V`, find Print Labels. Click it. Verify a label/barcode preview appears. If absent, document as GAP.

**TC-RPT-05 — Batch report (multiple orders)**
Find Reports section in hamburger nav. If found, set date range to today and generate. Verify multiple orders appear. If no Reports section, document as GAP.

---

## Suite M — Referral Management (TC-REF)

**Context:** BUG-2 — Carbon Select `onChange` silent fail — is expected to affect TC-REF-02 (external lab dropdown). Use the Carbon native setter workaround:
```javascript
const sel = document.querySelector('select[id*="lab" i]');
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
setter.call(sel, sel.options[1].value);
sel.dispatchEvent(new Event('change', { bubbles: true }));
```

**TC-REF-01 — Referral section visible in Add Order**
In Add Order → Add Sample step, verify a Referral checkbox/section is present. Toggle it. Verify external lab dropdown, reason, and test name fields expand.

**TC-REF-02 — External lab dropdown populates [BUG-2]**
With referral enabled, attempt to select a lab. Verify selection persists or reverts. Apply workaround. Document result: PASS(workaround) / BUG-2 CONFIRMED.

**TC-REF-03 — Place a referred order**
Complete the order with referral to Central Public Health Laboratory. Submit. Record `REFERRAL_ACCESSION`. Verify referred-out status indicator in Results → By Order.

**TC-REF-04 — Referred order in referral worklist**
Try: `/ReferredOut`, `/Referrals`, `/ReferralManagement`. Verify `REFERRAL_ACCESSION` appears with external lab name and referral date.

**TC-REF-05 — Receive referred results back**
In the referral worklist, click Receive Results for `REFERRAL_ACCESSION`. Enter value `55`. Save. Verify the external result appears in Results → By Order.

**TC-REF-06 — Referred result flows into validation**
Navigate to Validation. Search `REFERRAL_ACCESSION`. Verify external result and referral origin are shown. Approve the result. Verify validated status.

---

## Suite N — Workplan and Sample Tracking (TC-WP)

**URL Discovery:** Try in order:
```
/WorkPlan
/WorkPlanByTestSection
/WorkPlanByTest
/WorkPlanByPanel
Hamburger → Workplan
```

**TC-WP-01 — Workplan screen loads**
Navigate to workplan. Verify it loads with a test type/section filter. Record the URL.

**TC-WP-02 — Filter by test type**
Select **Hematology** from the section dropdown (use Carbon workaround if needed). Verify table shows only Hematology pending tests.

**TC-WP-03 — Enter result from workplan**
Find a pending result row. Enter `13.5`. Save. Navigate to Results → By Order for the same accession. Verify `13.5` persists.

**TC-WP-04 — Completed tests leave pending queue**
After TC-WP-03, return to the workplan. Verify the saved test either disappears from the queue or shows a "Saved/Complete" indicator. Document observed behavior.

**TC-WP-05 — Sample reception screen**
Try: `/SampleLogin`, `/SpecimenEntry`, `/BarcodedSamples`. Verify the screen has an accession/barcode field. Enter `26CPHL00008V` — verify order is retrieved. If absent, document as GAP.

**TC-WP-06 — Workplan count matches dashboard KPI**
Note the "Awaiting Result Entry" KPI from the Dashboard. Count pending workplan rows. Verify counts are within ±5 (accounting for timing between views).

---

## Suite H — Patient Management (TC-PAT)

**URL Discovery:** Try in order:
```
/PatientManagement
/FindPatient
/PatientResults
/SamplePatientEntry
Hamburger → Patient → Search Patient
```

**TC-PAT-01 — Patient search page loads**
Navigate to patient search. Verify a search form is present (at minimum one of: ID, name, or DOB field). Record the URL.

**TC-PAT-02 — Search by national ID**
In the National ID field, enter `0123456`. Search. Verify Abby Sebby is returned with correct demographics.

**TC-PAT-03 — Partial last-name search**
Enter `Seb` in the last-name field. Verify Abby Sebby appears. Then search `ZZZNOTEXIST` — verify empty-state message. If partial search is unsupported, document as GAP.

**TC-PAT-04 — View patient order history**
Select Abby Sebby from results. Verify patient detail view shows demographics + at least one historical order (from TC-09).

**TC-PAT-05 — Create a new patient**
Navigate to Add Patient. Fill: Last=`QA_Patient`, First=`Automated`, ID=`QA_PAT_<MMDD>`, DOB=`01/01/1990`, Gender=Male. Save. Verify patient is searchable. Mark for CLEANUP.

**TC-PAT-06 — Edit patient demographics**
Open Abby Sebby's record. Change phone to `555-0001`. Save. Re-open and verify the change persists. If no edit capability, document as GAP.

---

## Suite I — Dashboard KPIs (TC-DASH)

**TC-DASH-01 — Dashboard loads with KPI cards**
Navigate to the dashboard home. Verify at least 2 KPI cards are visible with numeric counts. Screenshot.

**TC-DASH-02 — KPI values are non-zero after QA runs**
After suites B and E have run, revisit the dashboard. Verify at least one KPI card shows a count > 0. If all show 0 while pending work exists, this is a FAIL.

**TC-DASH-03 — KPI card links navigate to filtered views**
Click the "Ready for Validation" (or highest-count) KPI card. Verify it navigates to a contextually relevant filtered view (not the same dashboard page).

**TC-DASH-04 — Dashboard accessible to all roles**
Log in as `qa_labtech`. Verify dashboard loads. Verify it is not blank. Role-scoped data differences are acceptable — inaccessibility is a FAIL.

---

## Suite J — Order Search and Lookup (TC-OS)

**URL Discovery:** Try in order:
```
/SampleEdit?type=readwrite
/SampleEdit
/OrderSearch
/FindOrder
Hamburger → Order → Search Order
```

**TC-OS-01 — Lookup by accession number**
Enter `26CPHL00008V`. Verify patient Abby Sebby and HGB test are returned.

**TC-OS-02 — Lookup by patient ID**
Enter patient ID `0123456`. Verify all orders for Abby Sebby are listed. If patient ID search field is absent, document as GAP.

**TC-OS-03 — Date range filter**
Set From = today, To = today. Verify QA orders appear. Set to future dates — verify empty state. If no date filter, document as GAP.

**TC-OS-04 — Order status reflects workflow progress**
Search `26CPHL00008V`. Verify displayed status is consistent with actual workflow state (has result / validated / etc.).

**TC-OS-05 — Print label from order detail**
Open `26CPHL00008V` detail. Look for Print Labels button. If present, click and verify a dialog/PDF is generated. Close without printing. If absent, document as GAP.

---

## Suite K — Admin Configuration (TC-ADMIN)

**TC-ADMIN-01 — Lab configuration page loads**
Try: `/MasterListsPage/LabConfiguration`, `/ConfigurationPage`. Verify lab name and address fields are displayed.

**TC-ADMIN-02 — Reference labs list accessible**
Verify the list that backs the Referral dropdown in Add Order is accessible. It should include Central Public Health Laboratory, Doherty Institute, etc.

**TC-ADMIN-03 — Organization/site list contains Adiba SC**
Navigate to Organizations/Sites admin screen. Search for `Adiba`. Verify Adiba SC is present (as it appears in Add Order site picker).

**TC-ADMIN-04 — Dictionary entries (rejection reasons) accessible**
Navigate to Dictionary / Reference Data config. Find Rejection Reasons category. Verify at least one entry (e.g., Hemolysis, Clotted, Insufficient Volume).

**TC-ADMIN-05 — Test sections list contains Hematology and Biochemistry**
Navigate to Test Sections management. Verify Hematology and Biochemistry are both listed. Absence explains By Unit filter failures.

**TC-ADMIN-06 — Dictionary CRUD**
In Rejection Reasons dictionary, click Add. Enter `QA_AUTO_RejReason`. Save. Verify entry appears. Edit to `QA_AUTO_RejReason_EDITED`. Save. Verify edit persists. Deactivate. If writes fail silently, document as BUG-8 class.

---

## Suite E — Validation Workflow (TC-VAL)

**URL Discovery:** Try in order until one returns a non-login 200:
```
/ResultValidation?type=routine
/ResultValidation?type=order
/ResultValidation
/ResultsValidation
/UnderResultValidation
```
Record the working URL in your log.

**TC-VAL-01 — Screen loads**
Navigate to the Validation screen. Verify it loads (not 403/redirect). Screenshot initial state. Record the URL.

**TC-VAL-02 — Search by order**
In By Order view, search for `26CPHL00008V`. Verify HGB result row appears.
If accession not in queue (already validated), use the most recent QA accession from report log.

**TC-VAL-03 — Accept/Approve a result**
Locate the Accept checkbox on a result row. Check it. Click Save/Validate.
Verify the row transitions to validated (disappears from pending, or shows approved badge).

**TC-VAL-04 — Reject a result**
Find Reject button/checkbox on a result row. Click it.
Verify a **rejection reason** field appears. Select/enter a reason. Save.
Verify rejected status indicator on the row.

**TC-VAL-05 — Add a note**
Find the Notes field on a result row (speech bubble icon or inline text input).
Enter: `QA automated validation note`. Save.
Re-open the result via Results → By Order. Verify the note persists.
If no Notes field: document as GAP.

**TC-VAL-06 — Override abnormal flag (SKIP if BUG-8 not fixed)**
Find a result with H/L flag. Accept it. Observe if an override confirmation appears.
Document: flag cleared? acknowledged? blocks validation?
**SKIP** this case and note: "BUG-8 — normal ranges not persisted, flags not generated."

**TC-VAL-07 — Routine view**
Navigate to `/ResultValidation?type=routine`. Verify it loads. Screenshot data table (or empty state).

**TC-VAL-08 — Date range filter**
On the validation screen, look for date inputs. If present, set From = 7 days ago, To = today.
Run the filter. Verify results fall within the date bounds.

---

## Suite F — Results By Unit Worklist (TC-BU)

**URL Discovery:** Try in order:
```
/AccessionResults?type=testSection
/ResultsUpdate
/WorkPlan
/WorkPlanByTestSection
Hamburger → Results → By Unit / By Section
```

**TC-BU-01 — Page loads**
Navigate to By Unit. Verify a section selector and data table are present. Record the URL.

**TC-BU-02 — Filter by test section**
Select **Hematology** from the section dropdown. Verify table shows only Hematology tests.
Switch to **Biochemistry**. Verify table updates. Screenshot both views.

**TC-BU-03 — Enter result from worklist**
Find a pending HGB result. Enter `14.5`. Save.
Navigate to Results → By Order for the same accession. Verify `14.5` appears. (Data consistency check.)

**TC-BU-04 — Completed results leave pending queue**
After TC-BU-03, return to By Unit → Hematology. Verify the entered test either:
(a) is removed from the pending queue, or (b) shows a "Saved/Complete" indicator.
Document which behavior occurs.

**TC-BU-05 — Lab tech access (RBAC)**
Log out. Log in as `qa_labtech` / `QAlabtech1!`.
Navigate to Results → By Unit. Verify page loads and result input is editable.
`PASS` = accessible + editable; `FAIL` = access denied.

---

## Suite G — Non-Conforming Samples (TC-NC)

**Context:** The Add Sample step (Step 3 of Add Order wizard) has a "Reject Sample" checkbox that marks the sample as non-conforming (NC).

**TC-NC-01 — Reject Sample checkbox visible**
Navigate to Add Order → Step 3 (Add Sample). Select Whole Blood. Verify "Reject Sample" checkbox is present. Screenshot.

**TC-NC-02 — Rejection reason UI**
Check "Reject Sample". Verify a rejection reason dropdown or text field appears. List available reason options in your log.

**TC-NC-03 — Place NC order + verify flag**
Complete the full Add Order flow with Reject Sample checked and a reason selected. Submit.
Record `NC_ACCESSION` from the confirmation screen.
Navigate to Results → By Order, search `NC_ACCESSION`.
Verify: warning icon/NC badge visible; the test row appears.

**TC-NC-04 — Result entry behavior on NC order**
On `NC_ACCESSION`, attempt to enter a result (e.g., `15`). Save.
Document: blocked? warning shown? saves normally? silent fail?
Mark `PASS` if behavior is clearly communicated to the user; `FAIL` if silent failure.

**TC-NC-05 — NC order in validation queue**
Navigate to Validation → By Order. Search `NC_ACCESSION`.
Verify: order appears; NC indicator visible to validator; validator can see rejection context.

---

## Step 4 — Cleanup

Deactivate/delete all `QA_AUTO_` prefixed data. Log cleanup failures but don't count as test failures.

---

## Step 5 — Generate the Report

Read `references/report-template.md`. Produce a QA report.

**Save as:** `outputs/openelis-test-catalog-qa/qa-report-[YYYYMMDD-HHMM].md`

**Report must include:**
- Summary table: TC ID | Suite | Scenario | Result | Notes
- Pass rate: X/Y (%)
- Full bug details for each FAIL: step that failed, expected, actual, network evidence
- GAP documentation for absent features
- Known bugs cross-referenced (don't re-file BUG-1 through BUG-8 unless newly impacting a new area or newly fixed)
- Appendix: full action log with timestamps

---

## Step 6 — Create Jira Tickets for New Failures

For each **new** FAIL (not in the known bug list):
- **Project:** Ask user for project key
- **Issue Type:** Bug
- **Summary:** `[QA Auto] TC-XX failed: <short description>`
- **Description:** Environment, TC ID, step failed, expected, actual, severity
- **Labels:** `automated-qa`, plus the suite tag (`validation`, `by-unit`, `non-conforming`, `test-catalog`, etc.)

If Jira is unavailable, include formatted bug reports under "Failures Requiring Attention" in the QA report.

---

## Known Bugs (v3.2.1.3) — Do Not Re-File

| Bug | Severity | Description | Impacted Suites |
|-----|----------|-------------|-----------------|
| BUG-1 | Critical | `POST /rest/TestAdd` HTTP 500 — test creation broken | Suite A |
| BUG-2 | High | Carbon Select `onChange` — Referral dropdowns revert to empty | Suite B (referral) |
| BUG-3 | High | `POST /rest/UnifiedSystemUser` HTTP 500 — user creation broken | Suite D |
| BUG-4 | Medium | ModifyOrder generates new accession instead of preserving original | Suite C |
| BUG-6 | Low | Duplicate sample type in test name: "HGB(Whole Blood)(Whole Blood)" | Suites B, E, F |
| BUG-7 | Medium | PanelCreate Next button non-responsive (Carbon Select state) | Suite A TC-05 |
| BUG-7a | High | `POST /rest/PanelCreate` silent fail — panel not created | Suite A TC-05 |
| BUG-8 | **Critical** | `POST /rest/TestModifyEntry` silent fail — ranges/result type not saved. **Patient safety.** | Suites A TC-06, B TC-11, E TC-VAL-06 |

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Element not found | Scroll, wait 2s, retry once. Still missing → `FAIL "UI element not found"` |
| URL 404/403 | Try alternate URLs from discovery list. Still fails → `GAP "feature not accessible"` |
| Page load timeout (>10s) | `FAIL "Page load timeout"` |
| Error banner / modal | Screenshot → `FAIL` with the error text |
| Session timeout ("Still There?") | Click modal to dismiss, re-auth, resume from last known step |
| Silent save failure (form resets, no error) | Verify via GET API or navigate-away-and-back check → `FAIL "Silent save failure (BUG-8 class)"` |

---

## React/Carbon Component Workarounds

When a Carbon dropdown or button doesn't respond to normal interaction:

```javascript
// Carbon Select — trigger React onChange via native setter
const sel = document.getElementById('SELECT_ID');
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
setter.call(sel, 'TARGET_VALUE');
sel.dispatchEvent(new Event('change', { bubbles: true }));

// Carbon TextInput — trigger React onInput via native setter
const input = document.getElementById('INPUT_ID');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(input, 'TARGET_VALUE');
input.dispatchEvent(new Event('input', { bubbles: true }));

// Submit via React fiber if Submit button is unresponsive
const form = document.querySelector('form');
const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
form[fk]?.pendingProps?.onSubmit?.({
  preventDefault: () => {}, stopPropagation: () => {},
  target: form, currentTarget: form,
  nativeEvent: new Event('submit')
});
```

---

## Suite AA — Results By Patient & By Order (TC-RBP)

Navigate to **Results** menu → **By Patient** or **By Order**. Test data: patient `Abby Sebby` (ID: `0123456`), accession `26CPHL00008T`.
- URLs to discover: `/PatientResults`, `/ResultsByPatient`, `/patient/results`, `/AccessionResults`, `/OrderResults`
- Verify page loads, not login redirect. Test search by name/ID (By Patient) and by accession (By Order).
- Check result table columns: test name, result value, status.

---

## Suite AB — Validation By Order/Range/Date (TC-VBO)

Navigate to **Validation** menu → **By Order**, **By Range**, or **By Date**. 
- By Order: search accession `26CPHL00008T`, verify validation queue displays.
- By Range: enter from/to accession numbers, verify filtering.
- By Date: enter date range, verify queue loads (or is empty without error).
- URLs: `/ValidationByAccession`, `/ValidationByOrder`, `/ValidationByOrderRange`, `/ValidationByDate`, `/validation/order`, `/validation/range`, `/validation/date`.

---

## Suite AC — Merge Patient (TC-MP)

Navigate to **Patient** menu → **Merge Patient**. Search for duplicates using patient `Abby Sebby`.
- URLs: `/MergePatient`, `/PatientMerge`, `/patient/merge`.
- Verify search field, autocomplete dropdown, and ability to select two patients.
- Attempt merge; document whether it completes successfully or if feature is blocked/broken.

---

## Suite AD — Non-Conform Corrective Actions (TC-NCA)

Navigate to **Non-Conform** menu → **View Non-Conforming Events** or **Corrective Actions**.
- NC Events: verify queue table loads, displays recent events with accession/date columns.
- Corrective Actions: verify create button, action list, form fields (description, assigned-to, due date).
- URLs: `/NCQueue`, `/NonConformingQueue`, `/nc/events`, `/CorrectiveActions`, `/NonConformingCorrectiveActions`, `/nc/actions`.

---

## Suite AE — Routine Reports (TC-RPT-R)

Navigate to **Reports** menu → find Patient Status Report, Statistics Report, Summary of All Tests.
- URLs candidates: `/PatientStatusReport`, `/StatisticsReport`, `/SummaryReport`, `/reports/patient-status`, `/reports/statistics`.
- Verify report screen loads, not login redirect. Check for date range filters, generate/view buttons.
- Document which reports are accessible vs. GAP.

---

## Suite AF — Management Reports (TC-RPT-M)

Navigate to **Reports** menu → find Rejection Report, Referred Out Tests Report, Delayed Validation, Audit Trail.
- URLs: `/RejectionReport`, `/ReferredOutReport`, `/DelayedValidationReport`, `/AuditTrail`, `/reports/rejection`, `/reports/referred-out`.
- Verify each loads. Test date range filters. Check for export or download buttons.
- Verify data displays (or GAP if report not implemented).

---

## Suite AG — WHONET & Export Reports (TC-RPT-W)

Navigate to **Reports** menu → find WHONET Report and Export options.
- URLs: `/WHONETReport`, `/ExportReport`, `/reports/whonet`, `/reports/export`.
- Verify WHONET report loads, date range selectable. Test export/download for CSV/PDF.
- Test no-data scenario (future date range) — verify "no data" message vs. error.
- Verify export format (CSV, PDF) downloads correctly.

