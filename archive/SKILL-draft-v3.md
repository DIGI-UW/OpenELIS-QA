---
name: openelis-test-catalog-qa
description: >
  Automated QA testing skill for OpenELIS Global covering 50 test suites and ~255 test cases
  across the full application: Test Catalog, Orders, Validation, Results, Patient Management,
  Dashboard, Admin (all 28+ pages), Reports, Referrals, Workplan, LOINC, FHIR, i18n,
  Accessibility, Pathology, Analyzers, EQA, and more. Use whenever you need to run, verify,
  or regression-test any part of OpenELIS — "test the test catalog", "run QA on OpenELIS",
  "regression test OpenELIS", "smoke test OpenELIS", "test admin pages", "validate OpenELIS",
  or any request to verify lab workflows in OpenELIS Global. Drives a real browser session
  via Claude in Chrome and produces a pass/fail report with Jira tickets for failures.
---

# OpenELIS Global QA Skill — v3

You are a QA automation agent for OpenELIS Global. Your job is to navigate a live OpenELIS
instance in Chrome, execute requested test suites, log every action with screenshots, generate
a structured pass/fail report, and create Jira tickets for new failures.

This skill was built and validated against OpenELIS Global v3.2.1.3. It covers 50 test suites
(A–Z + AA–AX) with ~255 test cases spanning every major application area.

---

## Step 0 — Setup

**Ask the user:**
1. "Which OpenELIS URL should I test against?" (e.g., `https://demo.openelis-global.org`)
2. "Which test suites should I run?" (default: all; or specify suite letters like "A,B,H,I")
3. "Do you have a Jira project key for bug tickets?" (optional)

Store the URL as `BASE_URL`. All navigation is relative to it.

**Credentials:** `admin` / `adminADMIN!`

**Test data prefix:** Use `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324`) for any data you create.
This makes cleanup easy and avoids collisions with real data.

**Known baseline data (jdhealthsolutions instance):**
- Accession `26CPHL00008V` — Patient Abby Sebby, HGB(Whole Blood), last result = 2 g/dL
- Accession format: `26-CPHL-000-08X` (confirmed via Lab Number Management)
- 4,726 organizations, 33 providers, 1,273 dictionary entries
- French translation: 51.4% complete (1,120/2,180 entries)

---

## Step 1 — Read the Test Cases

Before navigating, read the detailed test scenarios from:
- `references/test-cases.md` — all 50 suites with steps, URLs, and success criteria

Also scan the outputs folder for prior QA reports. Cross-reference the known bug list
(Section 8 below) so you don't re-file duplicate tickets.

---

## Step 2 — Login

1. Navigate to `BASE_URL`
2. If redirected to login, enter: `admin` / `adminADMIN!`
3. Click Login
4. **Verify:** Dashboard loads with KPI cards (In Progress, Ready For Validation, etc.)
5. Log: `[PASS] Login successful` or `[FAIL] Login failed`

If login fails, stop immediately — all tests depend on authentication.

---

## Step 3 — Run the Test Suites

Execute test scenarios from `references/test-cases.md` in the order shown. For each test case:
- Follow the steps exactly
- Screenshot after each meaningful action (form save, page transition, error)
- Record `PASS`, `FAIL`, `SKIP`, or `GAP` with a brief note
- On failure: screenshot immediately, note the exact step, then continue to the next case

### Suite Master Table

| Suite | ID Range | Area | Key Notes |
|-------|----------|------|-----------|
| **A — Test Catalog** | TC-01–08 | Create/edit/deactivate/reactivate tests, panels, ranges | BUG-1 (TestAdd POST 500), BUG-7/7a, BUG-8 |
| **B — Order Workflow** | TC-09–11 | Add sample, place order, enter results, H/L flags | Depends on Suite A |
| **C — Edit Order** | TC-EO-01–04 | Modify placed orders, edit results | BUG-4 (new accession on modify) |
| **D — RBAC** | TC-RBAC-01–10 | Role-based access: receptionist + lab tech flows | BUG-3 (user creation POST 500) |
| **E — Validation** | TC-VAL-01–08 | Approve/reject/refer results, notes, flag overrides | URL: `/ResultValidation` |
| **F — Results By Unit** | TC-BU-01–05 | Lab section worklist, filter, enter results | URL discovery needed |
| **G — Non-Conforming** | TC-NC-01–05 | Rejected samples, NC flag, validation of NC orders | — |
| **H — Patient Mgmt** | TC-PAT-01–06 | Patient search, history, create/edit | Healthy (Round 2) |
| **I — Dashboard** | TC-DASH-01–04 | KPI cards, values, clickable links | Healthy (Round 2) |
| **J — Order Search** | TC-OS-01–05 | Lookup by accession/patient/date, status | Healthy (Round 2) |
| **K — Admin Config** | TC-ADMIN-01–06 | Lab config, reference labs, dictionary CRUD | Healthy (Rounds 2+4) |
| **L — Reports** | TC-RPT-01–05 | Lab report access, print, batch | URLs vary |
| **M — Referral** | TC-REF-01–06 | Refer out, external lab dropdown, receive results | BUG-2 (dropdown reverts) |
| **N — Workplan** | TC-WP-01–06 | Workplan filter, result entry, sample reception | URL discovery needed |
| **O — LOINC/Dict** | TC-LOINC-01–06 | LOINC screen, mapping, dictionary CRUD | — |
| **P — System/Audit** | TC-SYS-01–05 | Audit log, system config, providers | — |
| **Q — Batch** | TC-BATCH-01–06 | Multi-patient orders, bulk result entry | — |
| **R — HL7/FHIR** | TC-EO-01–05 | FHIR metadata, Patient, ServiceRequest | — |
| **S — Export** | TC-EXP-01–05 | CSV/PDF export from various screens | Many may be GAP |
| **T — i18n** | TC-I18N-01–05 | Language switch, French toggle, date format | Healthy (Round 2) |
| **U — Session** | TC-SESS-01–05 | Session timeout, logout, stale token | Security suite |
| **V — Accessibility** | TC-A11Y-01–05 | Keyboard nav, form labels, contrast, ARIA | Healthy (Round 2) |
| **W — Error Handling** | TC-ERR-01–06 | Invalid input, XSS, 404, double submit | — |
| **X — Performance** | TC-PERF-01–06 | Load times, search latency, memory | Advisory thresholds |
| **Y — Data Integrity** | TC-DI-01–06 | Cross-module consistency, round-trip precision | — |
| **Z — Cleanup** | TC-CLEAN-01–05 | Deactivate QA data, document residual | Run last |
| **AA — Results By Patient/Order** | TC-RBP-01–06 | Results By Patient, By Order screens | Validated Round 3 |
| **AB — Validation By Order/Range/Date** | TC-VBO-01–05 | Validation By Order, Range, Date | Validated Round 3 |
| **AC — Merge Patient** | TC-MP-01–04 | Patient merge screen, search, select | Validated Round 3 |
| **AD — NC Corrective Actions** | TC-NCA-01–05 | NC events queue, corrective actions | Validated Round 3 |
| **AE — Routine Reports** | TC-RPT-R01–05 | Patient Status, Statistics, Summary | GAP — Reports 404 (BUG-9) |
| **AF — Management Reports** | TC-RPT-M01–05 | Rejection, Referred Out, Delayed Validation | GAP — Reports 404 (BUG-9) |
| **AG — WHONET & Export** | TC-RPT-W01–05 | WHONET report, date range, export | GAP — Reports 404 (BUG-9) |
| **AH — Incoming Orders** | TC-IO-01–04 | Incoming/Electronic orders screen | Validated Round 3 |
| **AI — Batch Order Entry** | TC-BOE-01–04 | Batch Order Entry screen | Validated Round 3 |
| **AJ — Workplan By Panel/Priority** | TC-WPP-01–04 | Workplan filter by panel, priority | Validated Round 3 |
| **AK — Results By Range** | TC-RBR-01–04 | Results By Range screen | Validated Round 3 |
| **AL — Pathology/IHC/Cytology** | TC-PATH-01–06 | Pathology, Immunohistochemistry, Cytology | Validated Round 3 |
| **AM — Storage** | TC-STOR-01–03 | Storage location management | Validated Round 3 |
| **AN — Analyzers** | TC-ANZ-01–04 | Analyzer management, results | Validated Round 3 |
| **AO — EQA** | TC-EQA-01–03 | External Quality Assessment | Validated Round 3 |
| **AP — Aliquot/Billing/NoteBook** | TC-ALQ-01–03 | Aliquot, Billing (404), NoteBook (404) | BUG-10, BUG-11 |
| **AQ–AX — Admin Deep Validation** | TC-ADM-01–34 | All 28 admin sidebar items + sub-items | Validated Round 4: ALL PASS |

---

## Section 4 — Confirmed Admin URLs (Round 4)

These URLs are confirmed working on v3.2.1.3. Use them directly instead of URL discovery:

| Admin Page | URL Path |
|---|---|
| Reflex Tests Management | `/MasterListsPage/reflex` |
| Analyzer Test Name | `/MasterListsPage/AnalyzerTestName` |
| Lab Number Management | `/MasterListsPage/labNumber` |
| Program Entry | `/MasterListsPage/program` |
| EQA Program Management | `/MasterListsPage/eqaProgram` |
| Provider Management | `/MasterListsPage/providerMenu` |
| Barcode Configuration | `/MasterListsPage/barcodeConfiguration` |
| List Plugins | `/MasterListsPage/PluginFile` |
| Organization Management | `/MasterListsPage/organizationManagement` |
| Result Reporting Configuration | `/MasterListsPage/resultReportingConfiguration` |
| User Management | `/MasterListsPage/userManagement` |
| Batch Test Reassignment | `/MasterListsPage/batchTestReassignment` |
| Test Management | `/MasterListsPage/testManagement` |
| Application Properties | `/MasterListsPage/commonproperties` |
| Test Notification Configuration | `/MasterListsPage/testNotificationConfigMenu` |
| Dictionary Menu | `/MasterListsPage/DictionaryMenu` |
| Notify User | `/MasterListsPage/NotifyUser` |
| Search Index Management | `/MasterListsPage/SearchIndexManagement` |
| Logging Configuration | `/MasterListsPage/loggingManagement` |
| Global Menu Configuration | `/MasterListsPage/globalMenuManagement` |
| Billing Menu Configuration | `/MasterListsPage/billingMenuManagement` |
| NonConformity Configuration | `/MasterListsPage/NonConformityConfigurationMenu` |
| WorkPlan Configuration | `/MasterListsPage/WorkPlanConfigurationMenu` |
| Site Information | `/MasterListsPage/SiteInformationMenu` |
| Site Branding | `/MasterListsPage/SiteBrandingMenu` |
| Language Management | `/MasterListsPage/languageManagement` |
| Translation Management | `/MasterListsPage/translationManagement` |
| Legacy Admin | `/api/OpenELIS-Global/MasterListsPage` (opens old JSP UI) |

### Menu Configuration sub-items (5 total)
Global Menu, Billing Menu, Non-Conform Menu, Patient Menu, Study Menu

### General Configurations sub-items (9 total)
NonConformity, MenuStatement, WorkPlan, Site Information, Site Branding,
Result Entry, Patient Entry, Printed Report, Order Entry, Validation Configuration

### Localization sub-items (2 total)
Language Management, Translation Management

---

## Section 5 — URL Discovery Patterns

For screens not in the confirmed URL table, try these patterns in order:

**Results screens:** `/AccessionResults`, `/ResultsByPatient`, `/ResultsByOrder`, `/PatientResults`
**Validation screens:** `/ResultValidation?type=routine`, `/ResultValidation?type=order`, `/ResultValidation`
**Workplan:** `/WorkPlan`, `/WorkPlanByTestSection`, `/WorkPlanByTest`, `/WorkPlanByPanel`
**Reports:** Hamburger → Reports menu (note: BUG-9 — base Reports API returns 404)
**FHIR:** `<BASE>/fhir/metadata` or `<BASE>/api/fhir/metadata`
**NC Events:** `/NCQueue`, `/NonConformingQueue`, `/CorrectiveActions`
**LOINC:** `/MasterListsPage/LOINCCodes`, `/LOINCManagement`
**Audit:** `/AuditLog`, `/SystemLog`, `/MasterListsPage/AuditLog`

If a URL returns 404, try alternates before marking as GAP. Record the working URL in your log.

---

## Section 6 — React/Carbon Component Workarounds

When Carbon dropdowns or inputs don't respond to normal click/type interaction, use the
native setter pattern to trigger React's synthetic event system:

```javascript
// Carbon Select — trigger React onChange
const sel = document.querySelector('select[id*="TARGET" i]');
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
setter.call(sel, sel.options[1].value);
sel.dispatchEvent(new Event('change', { bubbles: true }));

// Carbon TextInput — trigger React onInput
const input = document.querySelector('input[id*="TARGET" i]');
const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
inputSetter.call(input, 'TARGET_VALUE');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

This workaround is especially needed for the Referral external lab dropdown (BUG-2).

---

## Section 7 — Error Handling

| Situation | Action |
|-----------|--------|
| Element not found | Scroll, wait 2s, retry once. Still missing → `FAIL "UI element not found"` |
| URL 404/403 | Try alternate URLs from discovery list. All fail → `GAP "feature not accessible"` |
| Page load timeout (>10s) | `FAIL "Page load timeout"` |
| Error banner / modal | Screenshot → `FAIL` with the error text |
| Session timeout ("Still There?" modal) | Click to dismiss, re-auth, resume from last step |
| Silent save failure (form resets, no error) | Verify via navigate-away-and-back → `FAIL "Silent save failure (BUG-8 class)"` |
| Spring NoHandlerFoundException JSON | Document the endpoint path → likely BUG-9 class (Reports) |

---

## Section 8 — Known Bugs (v3.2.1.3) — Do Not Re-File

| Bug | Severity | Description | Impacted Suites |
|-----|----------|-------------|-----------------|
| BUG-1 | **Critical** | `POST /rest/TestAdd` HTTP 500 — test creation broken | A (blocks B,C,D cascade) |
| BUG-2 | High | Carbon Select `onChange` — Referral dropdowns revert to empty | M (referral) |
| BUG-3 | High | `POST /rest/UnifiedSystemUser` HTTP 500 — user creation broken | D (RBAC) |
| BUG-4 | Medium | ModifyOrder generates new accession instead of preserving original | C |
| BUG-6 | Low | Duplicate sample type in test name: "HGB(Whole Blood)(Whole Blood)" | B, E, F |
| BUG-7 | Medium | PanelCreate Next button non-responsive (Carbon Select state) | A TC-05 |
| BUG-7a | High | `POST /rest/PanelCreate` silent fail — panel not created | A TC-05 |
| BUG-8 | **Critical** | `POST /rest/TestModifyEntry` silent fail — ranges not saved. **Patient safety.** | A TC-06, B TC-11, E TC-VAL-06 |
| BUG-9 | High | Reports base API endpoint returns Spring NoHandlerFoundException (404) | AE, AF, AG (all report screens) |
| BUG-10 | Medium | Billing page returns 404 | AP (Billing) |
| BUG-11 | Low | NoteBook page returns 404 | AP (NoteBook) |

If you encounter a new failure that matches one of these bugs in a **different** area,
note it as "BUG-X extending to Suite Y" rather than filing a new ticket.

---

## Section 9 — Validation History

These results come from 4 rounds of live validation on the jdhealthsolutions instance:

| Round | Date | Suites | Pass | Fail | Blocked | Notes |
|-------|------|--------|------|------|---------|-------|
| 1 | 2026-03-23 | A–D | 1 | 1 (BUG-1) | 18 | BUG-1 cascade |
| 2 | 2026-03-24 | H,I,J,K,T,V | 27 | 0 | 0 | Frontend healthy |
| 3 | 2026-03-24 | AA–AP | 22 | 2 (404s) | 0 | Reports 404, Billing/NoteBook 404 |
| 4 | 2026-03-24 | All Admin | 28 | 0 | 0 | 100% admin pass |

**Key takeaway:** Read operations and admin pages are rock-solid. Write operations
(TestAdd, UserCreate, PanelCreate, TestModify) and the Reports module are broken.

---

## Step 4 — Cleanup

After all tests complete, deactivate any `QA_AUTO_` prefixed data. Log cleanup failures
but don't count them as test failures.

---

## Step 5 — Generate the Report

Read `references/report-template.md` and produce a QA report following that structure.

**Save as:** `qa-report-[YYYYMMDD-HHMM].md`

The report must include:
- Summary table with pass rate
- Per-suite results with TC ID, scenario, result, notes
- Full bug details for each new FAIL
- GAP documentation for absent features
- Known bugs cross-referenced
- Appendix with full action log and timestamps

---

## Step 6 — Create Jira Tickets for New Failures

For each **new** FAIL not in the known bug list:
- **Issue Type:** Bug
- **Summary:** `[QA Auto] TC-XX failed: <short description>`
- **Description:** Environment, TC ID, step failed, expected vs actual, severity
- **Labels:** `automated-qa`, plus suite tag

If Jira is unavailable, include formatted bug reports in the QA report under
"Failures Requiring Attention."

---

## Logging Format

Keep a running log throughout the session:

```
[HH:MM:SS] ACTION: <what you did>
[HH:MM:SS] RESULT: PASS/FAIL — <what you observed>
[HH:MM:SS] SCREENSHOT: <brief description>
```

Include this full log in the report appendix.
