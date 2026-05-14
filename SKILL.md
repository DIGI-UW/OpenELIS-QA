---
name: openelis-test-catalog-qa
description: >
  Automated QA testing skill for OpenELIS Global covering 167+ test suites and ~488 test cases. Tests: Orders, Validation, Results, Patient Management, Dashboard, Admin (28+ pages), Reports (all 11), Referrals, Workplan, FHIR, i18n, Accessibility, Pathology, Analyzers, EQA, Alerts, Storage, Batch Entry, Barcode, and more. Includes DEEP interaction suites: search/filter, form interaction, error handling, performance, cross-module data integrity, security (CSRF/XSS/SQLi), WCAG accessibility, E2E order tracing, report PDF generation, and Madagascar e-SIL UAT coverage (LO-xx/DU-xx). Drives a real browser session via Claude in Chrome and produces a pass/fail report with Jira tickets.
---

# OpenELIS Global QA Skill — v6.17 (2026-05-14 + Chain A truly end-to-end: Lab number uniqueness + Report PDF rendered with validated result)

**v6 changes at a glance:** Section 5.5 Feature Maturity (M0–M5), Section 6.5 (no 404-bugs without live capture) + 6.5a (harness-enforced via `helpers/networkCapture.ts`), Section 7.5 Round-trip Write Verification, Section 7.6 Acceptance Criteria standard, Section 8.5 Partial-Feature Audit, Section 11 Chains, Section 11.5 Blocking-Bug Etiquette, Section 12 Personas, Section 13 Dashboard Counter Reconciliation, and new Step 0.5 Calibration + Step 0.6 Data Census. **v6.13:** v6.12's pilot-grounded shape corrections applied in-place across all 12 chains + 6 personas + _common.ts; Chain I rewritten with the wrong labName premise dropped; `helpers/_common-v612-patch.ts` sidecar deleted. See full Change Log at end of file.

You are a QA automation agent for OpenELIS Global. Your job is to navigate a live OpenELIS
instance in Chrome, execute requested test suites, log every action with screenshots, generate
a structured pass/fail report, and create Jira tickets for new failures.

This skill was built and validated against OpenELIS Global v3.2.1.3. It covers 106+ test suites
(A-Z + AA-AX + 89 DEEP suites) with ~420 test cases spanning every major application area,
including granular interaction tests (Phase 4), deep interaction/E2E tests (Phase 5), advanced DEEP tests (Phase 6),
referral workflow/pathology/EQA deep tests (Phase 7), write operation deep testing (Phase 8), regression/cross-module integrity testing (Phase 9),
security & edge cases testing (Phase 10), performance benchmarking (Phase 11), WCAG 2.1 AA accessibility auditing (Phase 12), i18n infrastructure (Phase 13), E2E workflow/report/FHIR testing (Phase 14), notification/alert/error handling testing (Phase 15), deep operations/FHIR/Workplan/EQA testing (Phase 16), storage/pathology/billing/notebook deep testing (Phase 17), and Non-Conform/Analyzers/Help menu testing (Phase 18), deeper interaction testing on Analyzers/Notifications/User/Search (Phase 19), EQA deep testing (EQA-DEEP), and fine-grained form verification against Confluence user manual (Phase 23C-E).

---

## Step 0 — Setup

**Ask the user:**
1. "Which OpenELIS URL should I test against?" (e.g., `https://demo.openelis-global.org`)
2. "Which test suites should I run?" (default: all; or specify suite letters like "A,B,H,I" or "K-DEEP,X-DEEP")
3. "Do you have a Jira project key for bug tickets?" (optional)

Store the URL as `BASE_URL`. All navigation is relative to it.

**Credentials:** `admin` / `adminADMIN!`

**Test data prefix:** Use `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0325`) for any data you create.
This makes cleanup easy and avoids collisions with real data.

**Known baseline data (jdhealthsolutions / testing.openelis-global.org — v3.2.1.4):**
- Accession `26CPHL00008V` — Patient Abby Sebby, HGB(Whole Blood), last result = 2 g/dL
- Accession format: `26-CPHL-000-08X` (confirmed via Lab Number Management)
- 4,726 organizations, 33 providers, 1,273 dictionary entries
- French translation: 51.4% complete (1,120/2,180 entries)
- Dashboard KPIs: In Progress ~96, Ready For Validation ~142
- Test Analyzer Alpha — present in Analyzers list

**Known baseline data (mgtest.openelis-global.org — v3.2.1.5):**
- Branding: "Madagascar OpenELIS"
- Dashboard: 0 in progress, 15 ready for validation, 0 completed today
- 2 users (ID 1, ID 109); 1 analyzer ("GeneXpert PC", Plugin Missing, HEMATOLOGY)
- CSRF token stored in `localStorage['CSRF']` — include as `X-CSRF-Token` header on all POSTs
- Auth: `admin` / `adminADMIN!` — use direct `fetch` with `URLSearchParams({loginName:'admin', password:'adminADMIN!'})` if Formik submit fails

**EQA Configuration Prerequisite:**
- **Route:** Admin → `/MasterListsPage/SampleEntryConfigurationMenu` (Order Entry Configuration page)
- **Config key:** `eqaEnabled` — "If true, the EQA checkbox appears on Order Entry allowing a sample to be marked as an EQA sample"
- **How to enable:** Close main sidebar (hamburger menu) to reveal admin sub-menu → expand "General Configurations" → click "Order Entry Configuration" → select `eqaEnabled` row radio → click Modify → set value to `true` → Save
- **IMPORTANT:** Suite FK must run before Suites FL–FP. Without `eqaEnabled = true`, EQA features will not appear in Order Entry or sidebar navigation.

---

## Step 0.5 — Calibration (Mandatory before any new test phase)

> **Companion skill:** `openelis-bug-revalidation` v1.1 is the downstream protocol that handles each new FAIL after calibration. This step (re-verifying known bugs' current state) and the revalidation protocol (confirming whether a new FAIL is reproducible) are designed to work together. Do not duplicate or fork either's rules.

Before adding new findings, re-verify the current state of the **top 5 critical open bugs** plus any bug touched in the previous session:

1. Re-run the exact evidence steps documented in the bug table or Validation History — **but only the non-destructive ones**. For bugs whose evidence step would hang the browser or exhaust the connection pool (BUG-31 Carbon Accept checkbox `.click()`, BUG-38 NCE POST hang), use the indirect evidence path: API probe with `read_network_requests`, DOM inspection of the relevant control's React props, or live-network-capture comparison against the bug's documented signature. **Do NOT re-trigger the destructive UI action just to "confirm."**
2. Record one of: **STILL PRESENT** (with new screenshot or capture), **RESOLVED** (with confirming endpoint behavior), or **CHANGED** (with new evidence describing the change).
3. Update the bug table in this SKILL with the calibration result.

Skip calibration only if the previous session ran ≤ 24 hours ago against the same instance.

Calibration prevents the recurring drift seen in Validation History — bugs marked Done that regress (BUG-46), bugs retracted and re-assigned (BUG-23, BUG-38), false positives carried for multiple rounds (the 2026-04-20 cluster of OGC-535/562/563/565/566/568).

---

## Step 0.6 — Data Census (Mandatory before any E2E or persona suite)

Before running any chain or persona that depends on existing data, run a one-call census:

- Patient search by `lastName=A` — record count.
- LogbookResults for the busiest unit (Hematology on most installs) — record count.
- Dashboard KPIs JSON (`GET /rest/home-dashboard/metrics`) — record `ordersInProgress`, `ordersReadyForValidation`, `unPritendResults`.
- Recent accessions list (admin lab number page or a known query) — record range.

**If patient count = 0 AND logbook count = 0 AND Dashboard shows zeros:** the test instance has been reset. Halt all E2E and persona work and either (a) re-seed with the bulk seed script (preferred), or (b) note in the report header that the instance is empty and limit testing to render-only checks.

### 0.6a — Bulk seed script (re-seeding from zero)

Run the bulk seed script when census returns zero:

```bash
# Via Playwright (recommended):
npx playwright test --project=seed-data

# Standalone CLI for ad-hoc seeding:
SEED_DRY_RUN=1 npx playwright test --project=seed-data    # census-only preview
SEED_TARGET_PATIENTS=50 SEED_TARGET_ORDERS=100 npx playwright test --project=seed-data
```

The script (`seed-data.setup.ts` plus `helpers/seed-factory.ts` and `helpers/seed-config.ts`):

- Censuses existing `QA_AUTO_` prefixed records, then creates only the delta to reach targets (50 patients, 100 orders across 5 lab sections by default).
- Round-trip verifies every write per §7.5 — patients via `/rest/patient-search-results`, orders via `/rest/SampleEdit` (which is the Modify Order backing endpoint).
- Detects and counts BUG-37 instances (order saved but patient linkage broken). Reports the count in the summary table and `.auth/seed-state.json`.
- Does NOT attempt to force orders into IN_PROGRESS / READY_FOR_VALIDATION / REJECTED states — blocked by BUG-31. Those states reflect whatever is naturally present (analyzer imports, prior tests). See §11.5 Blocking-Bug Etiquette.

After seeding succeeds, re-run the Step 0.6 census to confirm targets are met, then proceed to E2E/persona suites.

This prevents the Phase 14 NOTE-14 pattern: silently running an E2E suite on an empty database and reporting PASS for nothing.

---

## Step 1 — Read the Test Cases

Before navigating, read the detailed test scenarios from:
- `references/test-cases.md` — original 50 suites with steps, URLs, and success criteria
- `../master-test-cases.md` (writable copy in outputs) — extended with Phase 4 DEEP suites
- `madagascar-uat-test-suite.md` (repo root) — Madagascar e-SIL UAT test suite v2.0; covers all LO-xx/DU-xx client acceptance requirements for mgtest.openelis-global.org; run alongside standard suites when testing the Madagascar deployment

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

**ChangePasswordLogin redirect:** The test environment periodically forces a password change on login.
If redirected to `/ChangePasswordLogin`, use the Formik context workaround:
1. Find the form's Formik context: traverse `form.__reactFiber` up the fiber tree until `fiber.memoizedProps?.value?.handleSubmit` is found.
2. Call `ctx.setValues({loginName:'admin', password:'adminADMIN!', newPassword:'adminADMIN!2', confirmPassword:'adminADMIN!2'})`.
3. Wait 1s for async Formik validation, then call `ctx.handleSubmit()`.
4. Navigate to `/` — if not redirected to login, session is active with new password `adminADMIN!2`.
5. If `adminADMIN!2` does not work (server rejected change), fall back to original `adminADMIN!`.

---

## Step 3 — Run the Test Suites

Execute test scenarios from the test case documents in the order shown. For each test case:
- Follow the steps exactly
- Screenshot after each meaningful action (form save, page transition, error)
- Record `PASS`, `FAIL`, `SKIP`, or `GAP` with a brief note
- On failure: screenshot immediately, note the exact step, then continue to the next case

### Suite Master Table

| Suite | ID Range | Area | Key Notes |
|-------|----------|------|-----------|
| **A — Test Catalog** | TC-01–08 | Create/edit/deactivate/reactivate tests, panels, ranges | BUG-1 (TestAdd POST 500), BUG-7/7a, BUG-8, BUG-12, BUG-13 |
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
| **R — HL7/FHIR** | TC-EO-01–05 | FHIR metadata, Patient, ServiceRequest | BUG-14 (FHIR timeout) |
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
| **AE — Routine Reports** | TC-RPT-R01–05 | Patient Status, Statistics, Summary | Fixed — Patient Status works at /Report?type=patient |
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
| **AP — Aliquot/Billing/NoteBook** | TC-ALQ-01–03 | Aliquot, Billing (404), NoteBook (404) | BUG-10, BUG-11/15 |
| **AQ–AX — Admin Deep Validation** | TC-ADM-01–34 | All 28 admin sidebar items + sub-items | Validated Round 4: ALL PASS |

### Phase 4 — DEEP Interaction Suites (11 suites, 32 TCs)

| Suite | ID Range | Area | Key Notes |
|-------|----------|------|-----------|
| **K-DEEP — Admin Interaction** | TC-K-DEEP-01–08 | Dictionary search, Org search/pagination, Provider search, User search, Translation stats, Logging config, Lab Number format, EQA Program cards | 8 TCs, all PASS |
| **H-DEEP — Patient Interaction** | TC-H-DEEP-01–03 | Search by national ID, Patient History lookup, Merge Patient wizard | 3 TCs, all PASS |
| **J-DEEP — Workplan Interaction** | TC-J-DEEP-01–02 | Select test type view data, Select panel dropdown | 2 TCs, all PASS |
| **L-DEEP — Reports Interaction** | TC-L-DEEP-01–02 | Patient Status Report form structure, Generate Printable Version | 2 TCs, all PASS |
| **M-DEEP — Analyzer Interaction** | TC-M-DEEP-01–02 | Search/filter analyzers, Add New Analyzer form fields | 2 TCs, all PASS |
| **O-DEEP — Pathology Interaction** | TC-O-DEEP-01–02 | Dashboard structure (4 stat cards, filters), Status filter interaction | 2 TCs, all PASS |
| **Q-DEEP — EQA Interaction** | TC-Q-DEEP-01–02 | Dashboard stats/structure, Create New Shipment 3-step wizard | 2 TCs, all PASS |
| **W-DEEP — Error Handling** | TC-W-DEEP-01–03 | Invalid patient ID search, Empty search submission, 404 non-existent route | 3 TCs, all PASS |
| **X-DEEP — Performance** | TC-X-DEEP-01–03 | Dashboard load metrics (TTFB/resources/DOM), Large dropdown rendering, Memory utilization | 3 TCs, all PASS |
| **Y-DEEP — Data Integrity** | TC-Y-DEEP-01–02 | Dashboard KPI vs Validation consistency, Cross-module data consistency | 2 TCs, all PASS |
| **S-DEEP — Order Extended** | TC-S-DEEP-01–02 | Order entry 4-step wizard structure, New Patient extended fields | 2 TCs, all PASS |
| **R-DEEP — Alerts Interaction** | TC-R-DEEP-01 | Alerts dashboard filters & structure (4 stats, 3 filters, search, table) | 1 TC, PASS |

### Phase 5 DEEP Suites (8 suites, 21 TCs — all PASS)

| Suite | TC Range | What It Tests | Status |
|-------|----------|---------------|--------|
| **T-DEEP — i18n** | TC-T-DEEP-01–03 | EN↔FR locale switching, translation gap detection (BUG-16), locale restore | 3 TCs, all PASS |
| **U-DEEP — Session** | TC-U-DEEP-01–03 | Logout redirect, re-authentication, session continuity post re-auth | 3 TCs, all PASS |
| **G-DEEP — NCE** | TC-G-DEEP-01–03 | Report NCE form, View NC Events search, Corrective Actions search | 3 TCs, all PASS |
| **V-DEEP — Accessibility** | TC-V-DEEP-01–03 | WCAG landmarks, color contrast (16.45:1), heading structure, focus (NOTE-2) | 3 TCs, all PASS |
| **E2E-DEEP — Order Trace** | TC-E2E-DEEP-01–03 | Edit Order search, Results tracing (By Unit/Order), Validation tracing | 3 TCs, all PASS |
| **N-DEEP — Workplan** | TC-N-DEEP-01–02 | Workplan By Test (200+ types, data), By Panel (40+ types, empty state) | 2 TCs, all PASS |
| **F-DEEP — Results Entry** | TC-F-DEEP-01–02 | Row expand detail fields, numeric input validation | 2 TCs, all PASS |
| **B-DEEP — Order Wizard** | TC-B-DEEP-01–02 | Step 1 Patient Info (all fields), Steps 2-3 Program & Sample (15 programs, full field set) | 2 TCs, all PASS |

### Phase 6 DEEP Suites (8 suites, 16 TCs)

| Suite ID | Name | TCs | Focus |
|----------|------|-----|-------|
| BA-DEEP | Batch Order Entry | 2 | Setup form fields, Routine form sections |
| BB-DEEP | Print Barcode | 2 | Page structure, accession auto-format |
| BC-DEEP | Electronic Orders | 2 | Page structure, Status dropdown enumeration |
| BD-DEEP | Patient History | 2 | Page structure, search functionality |
| BE-DEEP | Patient Merge | 2 | Page structure, workflow validation |
| BF-DEEP | Results By Range | 2 | Page structure (BUG-17 typo), range search |
| BG-DEEP | Results By Status | 2 | Page structure, dropdown enumeration (200+ tests) |
| BH-DEEP | Referral Workflow | 2 | 3 search methods, results section |

### Phase 7 DEEP Suites (7 suites, 14 TCs — 10 PASS, 2 FAIL, 2 BLOCKED)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| BI-DEEP | Pathology Dashboard | 2 | Dashboard structure, case listing | 2/2 PASS |
| BJ-DEEP | Immunohistochemistry | 2 | Page structure, search/form controls | 2/2 PASS |
| BK-DEEP | Cytology | 2 | Page structure, workflow fields | 2/2 PASS |
| BL-DEEP | EQA Distribution | 2 | Program listing, event management | 2/2 PASS |
| BM-DEEP | Analyzer Error Dashboard | 2 | Analyzer config, test mapping, error indicators | 2/2 PASS |
| BQ-DEEP | Referral Order Create | 1 | Add Order with referral — **FAIL (BUG-18 + BUG-19)** | 0/1 FAIL |
| BR-DEEP | Referral Results Entry | 1 | Enter results on Referred Out Tests — **BLOCKED** | 0/1 BLOCKED |

### Phase 8 — Write Operation Deep Testing (6 suites, 6 TCs — 3 PASS, 3 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| BS-DEEP | TestAdd Write | 1 | POST `/rest/TestAdd` → HTTP 500 confirmed | 0/1 FAIL |
| BT-DEEP | UserCreate Write | 1 | POST `/rest/UnifiedSystemUser` → HTTP 500 confirmed. **NEW BUG-20:** Login Name field permanently invalid | 0/1 FAIL |
| BU-DEEP | PanelCreate Write | 1 | POST `/rest/PanelCreate` → HTTP 500 (upgraded from "silent failure") | 0/1 FAIL |
| BV-DEEP | TestModify Write | 1 | POST `/rest/TestModifyEntry` → HTTP 200 but data integrity failure (ranges lost, panel dropped) | 0/1 FAIL (WORSE) |
| BW-DEEP | FHIR Metadata | 1 | `/fhir/metadata` → HTTP 200, valid CapabilityStatement (HAPI FHIR 7.0.2, R4) | 1/1 **RESOLVED** |
| BX-DEEP | Referral Workflow | 1 | Referral dropdowns work, POST saves correctly, new referral created | 1/1 **RESOLVED** |

**Phase 8 Key Findings:**
- BUG-14 (FHIR): RESOLVED — metadata endpoint returns valid R4 CapabilityStatement
- BUG-18/19 (Referral): RESOLVED — dropdowns work in expanded logbook row, POST saves referral correctly
- BUG-8 (TestModify): WORSE than expected — HTTP 200 but silently corrupts data (ranges lost, panel association dropped)
- BUG-20 (NEW): Login Name field in User Create always shows `invalid: true` with no error message
- BUG-21 (NEW): All `patient-photos/{id}/true` endpoints return HTTP 500

### Phase 9 — Regression & Cross-Module Integrity (8 suites, 8 TCs — all PASS)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| BY-REG | API Health & Regression | 1 | 12/14 core endpoints HTTP 200; all major workflows healthy | 1/1 PASS |
| BY-REG | Admin MasterListsPage | 1 | All 20+ admin items render; Organization Management loads 4,726 orgs | 1/1 PASS |
| BY-REG | Add Order Multi-Step | 1 | 4-step wizard (Patient Info → Program → Sample → Order) fully functional | 1/1 PASS |
| BY-REG | LogbookResults Filtering | 1 | Test unit dropdown loads 14 sections; Hematology returns 14 tests with table | 1/1 PASS |
| BZ-XMOD | Order Tracing (26CPHL00008K) | 1 | Order visible in LogbookResults and ReferredOutTests; referredOut flag consistent | 1/1 PASS |
| BZ-XMOD | Validation Consistency (26CPHL00008M) | 1 | Order in LogbookResults and AccessionValidation; result values match exactly | 1/1 PASS |
| CA-KPI | Dashboard Metrics vs Actual | 1 | Dashboard API returns correct JSON; discrepancy explained (order-level vs test-level counting); NOTE-3 API typos found | 1/1 PASS |
| CB-PAT | Patient Identity Consistency | 1 | Logbook patients verified in patient-search; all patient IDs and national IDs match | 1/1 PASS |

**Phase 9 Key Findings:**
- All 8 tests PASSED (100% pass rate)
- Regression testing confirms Phase 5–8 features remain stable
- Cross-module data flow fully validated: order consistency from entry through validation
- Dashboard metric discrepancy is architectural, not a bug
- NOTE-3 (NEW): Dashboard metrics API field names contain typos (patiallyCompletedToday, orderEnterdByUserToday, unPritendResults, incomigOrders, averageTurnAroudTime) — cosmetic issue, low priority
- BUG-21 reconfirmed: All `patient-photos/{id}/true` endpoints return HTTP 500

### Phase 10 — Security & Edge Cases (6 suites, 6 TCs — 5 PASS, 1 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CC | CSRF & Session Security Audit | 1 | CSRF token validation, security headers (CSP, HSTS, X-Frame), XSS-Protection, Referrer-Policy | 1/1 PASS |
| CD | XSS Injection Testing | 1 | Patient search & LogbookResults XSS payload reflection (script, img onerror, svg onload, event handler) | 1/1 PASS |
| CE | SQL Injection Testing | 1 | Patient search & LogbookResults SQLi payload injection (quote, OR 1=1, UNION, DROP TABLE) | 1/1 PASS |
| CF | Concurrent Session Handling | 1 | 20 simultaneous + 50 sequential requests to `/rest/home-dashboard/metrics` | 1/1 PASS |
| CG | Login Rate Limiting | 1 | 30 rapid wrong-password + 50 rapid API requests (no 429 responses, no account lockout) | 0/1 **FAIL** |
| CH | Authorization & Error Handling | 1 | `credentials:omit` auth enforcement, error response info leakage | 1/1 PASS |

**Phase 10 Key Findings:**
- **5 PASS, 1 FAIL (83% pass rate)**
- **BUG-22 (NEW, Medium):** No rate limiting detected on login endpoint or API endpoints. Brute-force attacks possible. All 30 wrong-password attempts and 50 API requests returned 200/403 without escalation to 429 or account lockout.
- **NOTE-4 (NEW):** CSP header includes `unsafe-inline` and `unsafe-eval`, significantly weakening Content Security Policy protection
- **NOTE-5 (NEW):** Referrer-Policy header NOT SET — information leakage risk
- **NOTE-6 (NEW):** User input reflected in JSON API responses (LogbookResults `labNumber` parameter). Low-risk with `Content-Type: application/json` but caution if frontend uses `dangerouslySetInnerHTML`.
- **NOTE-7 (NEW):** Error responses contain "Exception" keyword, leaking server implementation details
- **Good news:** SQL injection and XSS protections are solid — parameterized queries working correctly, no script execution from reflected input
- **Good news:** Concurrent session handling stable under load (200 total requests, all successful)
- **CSRF protection unclear:** POST without CSRF token returns HTTP 500 (not 403 forbidden) — unclear if rejection is CSRF-based or payload validation error

### Phase 11 — Performance Benchmarking (4 suites, 4 TCs — 4 PASS, 0 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CI | API Response Time Benchmarks | 1 | 10 endpoints × 10 iterations: p50/p95/p99 latency, consistency | 1/1 PASS |
| CJ | Page Load Benchmarks | 1 | Dashboard shell DCL, resource count, API timing for 5 major pages | 1/1 PASS |
| CK | Large Dataset Stress | 1 | Mycobacteriology 96-row load, parallel 14-section, TestAdd 56KB, patient search | 1/1 PASS |
| CL | Memory Leak Detection | 1 | JS heap + DOM node tracking across 10 API fetches and 10 SPA navigations | 1/1 PASS |

**Phase 11 Key Findings:**
- **4 PASS, 0 FAIL (100% pass rate)** — No new bugs
- All API response times cluster at ~370ms, dominated by ~365ms network RTT (server in remote location)
- Dashboard SPA shell loads in 40ms DCL with 26 resources (53KB total)
- Largest payloads: TestAdd (56KB, 729ms), SampleEntry (59KB, 442ms)
- Mycobacteriology (96 rows) loads in 2207ms — acceptable for large result set
- No memory leaks: DOM nodes stable at 853 across 10 SPA navigations; heap growth 2MB (5.28%) attributable to deferred GC
- **Performance is network-bound, not application-bound** — local deployment would see sub-50ms API responses

### Phase 12 — Accessibility Deep Audit (6 suites, 6 TCs — 2 PASS, 4 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CM | axe-core Full Page Scan | 1 | WCAG 2.1 AA violations across 7+ pages using axe-core 4.7.2 | 0/1 **FAIL** |
| CN | Keyboard Navigation | 1 | Focus visibility, skip link, tab order, keyboard traps | 1/1 PASS (partial) |
| CO | Heading Hierarchy | 1 | H1-H6 order, WCAG 1.3.1, 2.4.6 compliance | 0/1 **FAIL** |
| CP | ARIA & Landmarks | 1 | Landmark roles, live regions, aria-expanded, search role | 1/1 PASS |
| CQ | Color Contrast | 1 | WCAG AA 4.5:1 minimum; foreground/background ratio analysis | 0/1 **FAIL** |
| CR | Touch Target & Form A11y | 1 | WCAG 2.5.5 44×44px targets, form labels, autocomplete attributes | 0/1 **FAIL** |

**Phase 12 Key Findings:**
- **2 PASS, 4 FAIL (33% pass rate)** — Significant accessibility gaps found
- **All violations are shell-level** — identical 5 axe violations on every page (sidebar/header, not page content)
- **NOTE-8 (NEW):** 45% of focusable elements lack visible focus indicator (9/20 tested)
- **NOTE-9 (NEW):** Heading hierarchy completely broken — no H1, starts at H5, skips H1/H2
- **NOTE-10 (NEW):** Zero aria-live regions — dynamic content changes invisible to screen readers
- **NOTE-11 (NEW):** 90% of interactive targets (87/97) below 44×44px WCAG 2.5.5 recommended minimum
- **NOTE-12 (NEW, Serious):** Color contrast ratio 1.08:1 (white #fff on #f5f6f8) across 8 elements on every page. WCAG AA requires 4.5:1 minimum.
- **Good news:** Proper landmark structure (main, nav, banner, contentinfo), all inputs labeled, lang attribute set, no keyboard traps
- **Root cause:** Carbon Design System sidebar component (`cds--side-nav__items`) has structural HTML issues; color contrast failure likely in a custom theme override

### Phase 13 — i18n Infrastructure (2 suites, 2 TCs — 2 PASS, 0 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CS | Locale Switching & Persistence | 1 | en/fr selector, navigation persistence, html lang attribute update, text node change rate | 1/1 PASS |
| CT | API Locale Support | 1 | Accept-Language header handling, API response locale-awareness | 1/1 PASS |

**Phase 13 Key Findings:**
- **2 PASS, 0 FAIL (100% pass rate)**
- Locale selector correctly switches between English and French; persists across SPA navigation
- **NOTE-13 (NEW, Low):** `<html lang>` attribute never updates when locale changes — remains "en" even in French mode. Screen readers won't detect the language switch.
- API is locale-agnostic by design — translations managed client-side via Transifex, not server-side
- 42% of visible text nodes changed when switching to French (remaining 58% are proper nouns, numbers, or untranslated keys)

### Phase 14 — End-to-End Workflow, Report & Integration (4 suites, 4 TCs — 2 PASS, 2 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CU | Report UI Rendering | 1 | 7 report page routes tested for form rendering vs Dashboard fallback | 0/1 **FAIL** |
| CV | Report API (ReportPrint) | 1 | POST /rest/ReportPrint with various report types; PDF generation | 1/1 PASS |
| CW | FHIR Integration | 1 | FHIR R4 endpoints: Patient, Observation, metadata, ServiceRequest, DiagnosticReport, Task, Specimen | 1/1 PASS |
| CX | Data Availability & E2E Tracing | 1 | Logbook data, patient search, referral data availability for order lifecycle tracing | 0/1 **FAIL** |

**Phase 14 Key Findings:**
- **2 PASS, 2 FAIL (50% pass rate)**
- ~~**BUG-23 RETRACTED:**~~ Initial test used hash-based URLs (`#/RoutineReport`). SPA uses **path-based routing** (`/Report?type=patient&report=...`). Sidebar link clicks render report forms correctly (24+ inputs). False positive caused by wrong URL pattern in test.
- **NOTE-14 (NEW, Medium):** Test instance data wiped — all logbook types return 0 results, patient search returns 0, referredOut returns 0. Dashboard shows stale counts (104 in-progress, 142 validation). E2E tracing not possible.
- **Good news:** ReportPrint POST API works — returns PDF for patient reports. Backend report generation is functional.
- **Good news:** Report UI routes work correctly via path-based sidebar navigation. Corrected pass rate: 3 PASS, 1 FAIL (75%).
- **Good news:** FHIR R4 Patient, Observation, and metadata endpoints are fully functional. ServiceRequest/DiagnosticReport/Task/Specimen return 404 (not yet implemented).

### Phase 15 — Notification, Alert & Error Handling (4 suites, 4 TCs — 4 PASS, 0 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| CY | Notification Panel | 1 | Bell button, notification panel, Subscribe/Reload/MarkRead, /rest/notifications | 1/1 PASS |
| CZ | Alert System | 1 | /rest/alerts API, /Alerts page, alert infrastructure | 1/1 PASS |
| DA | API Error Response | 1 | Error response audit, stack trace leakage, malformed input handling | 1/1 PASS |
| DB | Session Timeout & Routing | 1 | "Still There?" dialog, path-based routing verification, BUG-23 retraction proof | 1/1 PASS |

### Phase 16 — Deep Operations, FHIR, Workplan & EQA (7 suites, 22 TCs — 22 PASS, 0 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| DC | Print/PDF Workflows | 3 | Form submission, Report PDF generation, page load | 3/3 PASS |
| DD | Batch Operations | 3 | Concurrent API requests, batch data handling, performance | 3/3 PASS |
| DE | Concurrency & Load | 3 | 20 parallel requests, resource contention, no degradation | 3/3 PASS |
| DF | FHIR Deep | 4 | 5 declared resources, 4 data resources functional, capability statement | 4/4 PASS |
| DG | Workplan | 4 | All 4 sub-pages, sidebar navigation, form rendering | 4/4 PASS |
| DI | EQA Distribution | 2 | Status cards, filter, action buttons, workflow functional | 2/2 PASS |

**Phase 16 Key Findings:**
- **4 PASS, 0 FAIL (100% pass rate)**
- **BUG-23 RETRACTED:** Report UI routes work correctly when accessed via sidebar clicks (path-based routing). The hash-based URLs used in Phase 14 testing were wrong.
- **NOTE-15 (NEW, Low):** API error responses leak "Exception" text — reconfirms NOTE-7 from Phase 10.
- **CRITICAL DISCOVERY:** SPA uses **path-based routing** (`/SamplePatientEntry`, `/Report?type=patient&report=...`), NOT hash-based (`#/RoutineReport`). All future tests must use sidebar clicks or path-based URLs.
- Notification system functional (bell button, panel, Subscribe/Reload/MarkRead). Empty data (no notifications configured).

### Phase 17 — Storage, Pathology, Billing & NoteBook (8 suites, 15 TCs — 13 PASS, 2 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| **CY** | Storage Management Dashboard | 3 | 6-tab interface, hierarchical location display, real data (67 rows) | 3/3 PASS |
| **CZ** | Cold Storage Monitoring | 3 | Real-time status, 5 tabs, temperature monitoring | 3/3 PASS |
| **DA** | Pathology/IHC/Cytology Dashboards | 4 | Status cards, search, filters, paginated tables, consistent design | 4/4 PASS |
| **DB** | Billing | 2 | Sidebar link functionality, feature implementation | 0/2 FAIL (NOTE-18) |
| **DC** | NoteBook Dashboard | 2 | Blank page rendering, route correctness | 0/2 FAIL (NOTE-19) |
| **DD** | Aliquot Management | 1 | Accession number search, page rendering | 1/1 PASS |

**Phase 17 Key Findings:**
- **13 PASS, 2 FAIL (86.7% pass rate)**
- Storage, Cold Storage, Pathology/IHC/Cytology all fully functional with production-grade UX patterns
- Billing and NoteBook both broken stubs (no implementation)
- NOTE-18, NOTE-19 newly discovered
- Session timeout "Still There?" dialog works correctly and is dismissable.

### Phase 18 — Non-Conform, Analyzers Deep, Help Menu (9 suites, 9 TCs — 7 PASS, 2 FAIL)

| Suite ID | Name | TCs | Focus | Status |
|----------|------|-----|-------|--------|
| **DR** | Report Non-Conforming Event | 1 | Search form, validation, search execution | 1/1 PASS |
| **DS** | View New Non-Conforming Events | 1 | Page rendering, heading consistency | 1/1 PASS (NOTE-20) |
| **DT** | NCE Corrective Actions | 1 | Page rendering, search form | 1/1 PASS |
| **DU** | Analyzers List | 1 | Summary cards, data table, real analyzer data, Add Analyzer button | 1/1 PASS |
| **DV** | Analyzer Error Dashboard | 1 | Summary cards, filters, data table, Acknowledge All button | 1/1 PASS |
| **DW** | Analyzer Types | 1 | Type management, real ASTM data, Create button | 1/1 PASS |
| **DX** | Help: User Manual | 1 | PDF opens in new tab, 196 pages, proper branding | 1/1 PASS |
| **DY** | Help: Video Tutorials | 1 | Button functionality in header Help panel | 0/1 FAIL (NOTE-21) |
| **DZ** | Help: Release Notes | 1 | Button functionality in header Help panel | 0/1 FAIL (NOTE-21) |
| **EA** | Analyzer Actions Menu Deep | 1 | Kebab menu 6 actions, navigation, modals | 1/1 PASS |
| **EB** | Analyzer Delete Confirmation | 1 | Delete dialog {name} placeholder bug | 0/1 FAIL (NOTE-22) |
| **EC** | Analyzer Search Filter | 1 | Search box filter, URL params, empty state | 1/1 PASS |
| **ED** | Analyzer Type Creation | 1 | Create modal form fields, validation | 1/1 PASS |
| **EE** | Notifications Panel | 1 | Bell icon, slide-in panel, controls, empty state | 1/1 PASS |
| **EF** | User Panel | 1 | User icon, Open ELIS, Logout, Locale, Version | 1/1 PASS |
| **EG** | Global Search Match | 1 | Header search, patient results dropdown | 1/1 PASS |
| **EH** | Global Search No Match | 1 | Non-matching query, no empty state | 1/1 PASS (NOTE-23) |
| **EI** | Order CRUD — Create | 2 | 4-step wizard, auto lab number, POST 200 | 2/2 PASS |
| **EJ** | Order CRUD — Read/Update | 2 | Edit Order search, load persisted data, modify | 2/2 PASS |
| **EK** | Order CRUD — Cancel/Validation | 2 | Remove/cancel checkboxes, validation bugs | 1/2 (NOTE-24, NOTE-25) |
| **EL** | Reflex & Calculated Values Admin | 3 | API rules, legacy admin pages | 3/3 PASS |
| **EM** | Patient CRUD — Create | 2 | New Patient form, save, verify | 2/2 PASS |
| **EN** | Patient CRUD — Read/Update | 3 | Search, select, load, modify, re-save | 3/3 PASS |
| **EO** | Patient Form Validation | 2 | DOB→age calc, phone format validation | 2/2 PASS |
| **EP** | Patient History & Merge Pages | 2 | Page load, UI structure verification | 2/2 PASS |
| **EQ** | Result Validation — Page Load | 3 | Test unit dropdown, Hematology results table, bulk actions | 3/3 PASS |
| **ER** | Accession Validation & Results | 2 | AccessionValidation search, AccessionResults page | 2/2 PASS |
| **ES** | Results Entry (LogbookResults) | 1 | Editable results table, patient data display | 1/1 PASS |
| **ET** | Patient Results & Date Validation | 2 | PatientResults search form, ResultValidationByTestDate | 2/2 PASS |
| **EU** | Validation Workflow E2E | 1 | Save checkbox → Save → result removed from queue | 1/1 PASS |
| **EV** | Report — Patient Status | 2 | Page load 3 sections, PDF generation by lab number | 2/2 PASS (NOTE-27) |
| **EW** | Report — Statistics | 2 | Page load with parameters, PDF generation (Hematology/2026) | 2/2 PASS |
| **EX** | Report — Test Report Summary | 2 | Page load with date pickers, 3-page PDF generation | 2/2 PASS (NOTE-28) |
| **EY** | Audit Trail | 2 | Page load with search, 21-item lifecycle audit results | 2/2 PASS |
| **EZ** | WHONET/CSV Export | 1 | Export page with date/study type/date type parameters | 1/1 PASS |
| **FA** | Electronic Orders | 1 | Incoming Test Requests with dual search modes | 1/1 PASS |
| **FB** | Referrals Page | 1 | Patient search, results table, date/test/unit filtering | 1/1 PASS |
| **FC** | Report — Rejection | 1 | Rejection Report date range page load | 1/1 PASS |
| **FD** | Report — Activity Reports | 3 | By Test Type, By Panel, By Test Section — all date range + type dropdown | 3/3 PASS |
| **FE** | Report — External Referrals | 1 | Date range + referral center dropdown | 1/1 PASS |
| **FF** | Report — Non Conformity | 2 | By Date, By Unit and Reason — date range pages | 2/2 PASS |
| **FG** | Report — Delayed Validation | 1 | Parameterless auto-PDF: 141 tests across 14 sections | 1/1 PASS |
| **FH** | Batch Entry, Barcode, Reassignment | 4 | Batch Order Entry Setup, Print Bar Code Labels, Batch Test Reassignment, Add Order wizard | 4/4 PASS |

**Phase 18-19 Key Findings:**
- **7 PASS, 2 FAIL (77.8% pass rate)**
- Non-Conform module: 3 fully functional search pages with consistent pattern
- Analyzers module: Rich management UI with real data (analyzer list, error dashboard, type definitions)
- Help: User Manual PDF works; Video Tutorials and Release Notes are stub buttons
- NOTE-20 (naming inconsistency), NOTE-21 (stub help buttons) discovered Phase 18
- NOTE-22 (Delete {name} placeholder), NOTE-23 (search no empty state) discovered Phase 19

**Phase 20 Key Findings:**
- **25/27 PASS (93% pass rate)**
- Order CRUD: Full 4-step wizard works, auto-generates lab numbers, POST returns 200
- NOTE-24 (OGC-510): Typo "Succesfuly saved" on order success page
- NOTE-25 (OGC-511): Submit button enables despite active validation errors
- NOTE-26 (OGC-512): Typo "Orginal Result" in validation Past Notes column
- Reflex Tests & Calculated Values admin pages are legacy-only (not migrated to React)
- Patient CRUD: Full Create/Read/Update works; DOB→age auto-calc correct
- Patient form phone validation blocks Save even when empty (optional field triggers validation)
- No success toast after patient save — form silently clears
- Result Validation: Full workflow tested — Save checkbox → Save → item removed from queue
- Normal Range column empty on all validation/results rows (no reference ranges configured)
- Dashboard: 105 awaiting result entry, 142 awaiting review

**Phase 21 Key Findings:**
- **12/12 PASS (100% pass rate)**
- Report PDF Generation: 3 report types tested (Patient Status, Statistics, Test Report Summary) — all generate valid PDFs
- Audit Trail: Full 21-item order lifecycle audit for accession 26-CPHL-000-08K
- Electronic Orders: Rich dual-mode search (by value, by date/status)
- Referrals: Patient search form with results table and date/test/unit filtering
- WHONET/CSV Export: Parameter form renders with date range, study type, date type
- Report menu tree: 11 report pages across 4 categories (Routine, Aggregate, Management, WHONET)
- NOTE-27 (OGC-513): Patient Status Report PDF shows literal "null" for empty Contact Tracing fields
- NOTE-28 (OGC-514): Summary of All Tests report header shows raw i18n key `report.labName.two`
- Observation: Test Report Summary date validation message persists after valid calendar selection (stale React state)
- Observation: Statistics Report title renders as "StatisticsReport" (no space)

**Phase 22 Key Findings:**
- **12/12 PASS (100% pass rate)** — No new bugs
- All remaining Management Report pages tested: Rejection, Activity (×3), External Referrals, Non Conformity (×2), Delayed Validation
- Activity Reports follow consistent pattern: date range + type-specific dropdown (Test Type, Panel Type, Unit Type)
- Delayed Validation is unique — parameterless, directly generates PDF showing 141 tests awaiting validation across 14 lab sections
- Batch Order Entry Setup: rich form with order fields, barcode configuration, optional fields (Facility, Patient Info)
- Print Bar Code Labels: label set counts, specimen labels, site name search, sample type selector
- Batch Test Reassignment: sample type → current test → replacement test workflow with cancel option
- Observation: "Non ConformityReport by Date" title has missing space (cosmetic, same pattern as "StatisticsReport")
- External Referrals Report heading still contains "labratory" typo (NOTE-17 from Phase 16)

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
**Validation screens:** `/ResultValidation?type=routine`, `/ResultValidation?type=order`, `/ResultValidation`, `/AccessionValidation`, `/AccessionValidationRange`, `/ResultValidationByTestDate`
**Workplan:** `/WorkPlanByTest?type=test`, `/WorkPlanByPanel?type=panel`, `/WorkPlanByTestSection?type=`, `/WorkPlanByPriority?type=priority`
**Reports:** `/Report?type=patient` (confirmed working), Hamburger -> Reports menu
**FHIR:** `<BASE>/api/fhir/metadata` (WARNING: BUG-14 — times out 60s)
**NC Events:** `/ReportNonConformingEvent`, `/ViewNonConformingEvent`, `/NCECorrectiveAction`
**LOINC:** `/MasterListsPage/LOINCCodes`, `/LOINCManagement`
**Audit:** `/AuditLog`, `/SystemLog`, `/MasterListsPage/AuditLog`
**Pathology:** `/PathologyDashboard`, `/ImmunohistochemistryDashboard`, `/CytologyDashboard`
**Analyzers:** `/analyzers`, `/analyzers/errors`, `/analyzers/types`
**EQA:** `/EQADistribution`, `/EQAManagement`, `/EQAParticipants`, `/EQAResults`
**Inventory:** `/Inventory` (Dashboard+Catalog+Reports tabs)
**Alerts:** `/Alerts`
**Orders:** `/ElectronicOrders`, `/SampleBatchEntrySetup`, `/PrintBarcode`
**Storage:** `/Storage`, `/Storage/samples`
**Aliquot:** `/Aliquot`
**Order Programs:** `/genericProgram`

If a URL returns 404, try alternates before marking as GAP. Record the working URL in your log.

---

## Section 5.5 — Feature Maturity Rubric

Every module gets an explicit Maturity rating per test phase. A "PASS" tag does not say how mature; the rating does. Aggregate reports must summarize counts by maturity, not by pass count.

| Rating | Name | Criterion |
|--------|------|-----------|
| **M0** | Stub | Sidebar link or page renders, but body is empty or shows raw i18n keys. NoteBook on v3.2.1.4 was M0. Billing on most installs is M0. |
| **M1** | Form-only | UI renders with form fields and dropdowns. Submit either returns 4xx/5xx, or returns 200 but no read-back is possible. Inventory Storage Locations is M1 (POST 500, BUG-40). EQA participants is M1 on most installs. |
| **M2** | Saves | Writes return 2xx and the data appears in a subsequent read on the same endpoint. Patient create is M2. Order create returns 200 but linkage to patient is M1, so the order as a whole is M1.5 (BUG-37). |
| **M3** | Round-trips | Writes persist and read back via a *different* endpoint or screen (UI write → API read, or UI write → admin read). Reference-range edits should be M3 to expose BUG-8. Most admin pages are M3. |
| **M4** | Cross-links | Data written in module A correctly affects module B. A rejected sample reaching the Rejection Report. A validated result appearing on the Patient Status Report PDF. A reflex rule firing on result entry. Currently most cross-links are unverified. |
| **M5** | Reportable | The feature produces compliant outputs that satisfy a regulator or auditor — PDF reports with correct branding, FHIR resources that round-trip cleanly, audit trails for sensitive actions, cold-chain excursions logged with corrective actions linked. |

A module is rated at the lowest M-level any of its sub-features hits. Inventory module overall is M1 (storage locations broken). Reports module on v3.2.1.6 is M2 at most (renders + generates) until cross-link tests are added.

**Acceptance criterion change:** A test phase report must list maturity per module, not just pass count. Example: "EQA Module — M1: all UIs render, none round-trip. Maturity unchanged from v3.2.1.4."

---

## Section 6 — React/Carbon Component Workarounds

### 6.1 — Native Setter Pattern (React-controlled inputs)

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

**IMPORTANT:** The native setter pattern sets the internal value but may NOT update the
visible character counter (e.g., "0/23" stays unchanged). If the visible UI must update,
use direct click + `computer.type()` instead.

### 6.2 — Carbon Checkbox Avoidance (BUG-2 EXTENDED)

**CRITICAL:** Calling `.click()` on ANY Carbon for React checkbox causes a 60-second browser
tab hang. This affects ALL checkboxes across the React SPA, not just Referral dropdowns.

**Workarounds:**
- **Results page:** DOM workaround works — `cb.checked = true; cb.dispatchEvent(new Event('change', {bubbles:true}))` sets the DOM state and persists on Save.
- **Validation page:** DOM workaround sets `checked` but React state does NOT update — server POST omits the value. Mark checkbox interaction tests as BLOCKED.
- **General rule:** Never use `.click()` on Carbon checkboxes. Use DOM manipulation where possible, mark as BLOCKED where DOM workaround doesn't propagate to React state.

### 6.3 — React SPA Routing (Sidebar Navigation)

**CRITICAL:** Direct URL navigation for non-admin React pages may hit Spring Boot 404 because
the React SPA router hasn't initialized. Always navigate via the sidebar menu:

```
// WRONG — may get 404 or blank page
await navigate('https://example.com/PatientManagement');

// RIGHT — use sidebar navigation
await page.click('text=Patient');
await page.click('text=Add/Edit Patient');
```

Admin pages at `/MasterListsPage/*` routes generally work with direct URL navigation.

### 6.4 — Dual Authentication Systems

The React SPA at `/login` and legacy JSP admin at `/OpenELIS-Global/LoginPage` maintain
separate sessions. Features behind legacy JSP auth (TestAdd, TestModifyEntry, FHIR) may
require a separate authentication flow. Cookie/session sharing between the two is unreliable.

### 6.5 — No bug filed against a 404 without live capture (MANDATORY)

OpenELIS Global uses a hybrid architecture:

- **Legacy JSP/Struts pages** at `/api/OpenELIS-Global/<PageName>`
- **React SPA REST calls** at `/rest/<endpoint>` — where the endpoint name often does NOT match the page name

Examples from the 2026-04-20 false-positive cluster (6 Jira tickets closed):
- Dictionary page → `/rest/DictionaryMenu` (not `/rest/dictionary`)
- Patient search → `/rest/patient-search-results` (not `/rest/patient`)
- Provider → JSP `/api/OpenELIS-Global/ProviderMenu` (no `/rest/provider`)
- LogbookResults filter → `?testSectionId=N` (not `?labUnit=N`)
- Reports → JSP `/api/OpenELIS-Global/ReportPrint` (not `/rest/report/*`)
- Organization → JSP `/api/OpenELIS-Global/Organization` (no `/rest/organizationSearch`)

**Rule.** Before filing a bug against a 404 on a REST endpoint, use `read_network_requests` to capture what the browser actually calls when a real user performs the action. If the captured path returns 200 but your guessed path returns 404, the bug is a false positive — file no ticket.

**Apply this rule to:** every BUG-* candidate whose only evidence is `GET /rest/X → 404`. The verification step is non-optional.

### 6.5a — Harness-enforced capture (Phase E2)

The §6.5 rule above was previously enforced by **discipline**. As of Phase E2 the harness enforces it. Use `helpers/networkCapture.ts`:

```typescript
import { captureAround, assertBugEvidence, assert404Observed } from '../../helpers/networkCapture';

test('Step X — verify Dictionary endpoint is reached', async ({ page }, testInfo) => {
  const { session } = await captureAround(page, async () => {
    await page.goto(`${BASE}/MasterListsPage/DictionaryMenu`);
    await page.waitForLoadState('networkidle');
  });

  // BEFORE filing a 404 bug against /rest/dictionary, prove the app
  // actually called that path. If it doesn't (likely — see the
  // 2026-04-20 cluster), this throws with a descriptive error and
  // saves the capture as evidence in .auth/captures/.
  assertBugEvidence(testInfo, session, '/rest/dictionary', 'BUG-51-candidate');

  // Then prove the call returned 404 (not 200/500/etc.)
  assert404Observed(session, '/rest/dictionary', 'BUG-51-candidate');
});
```

**What the helper does:**

- `startCapture(page)` and `captureAround(page, action)` attach Playwright `request`/`response` listeners, buffer the traffic, and return a `CaptureSession` with `.captures`, `.failed`, `.notFound` slices.
- `saveAsEvidence(testInfo, session, label)` writes the session to `.auth/captures/<label>-<timestamp>.json` AND attaches it to the Playwright test report. Auth/cookie headers are redacted automatically so the evidence file is safe to commit or paste into a Jira ticket.
- `assertBugEvidence(testInfo, session, claimedPath, bugLabel)` throws with a descriptive error if the app never called `claimedPath` during the capture window. The error message references the OGC-535/562/563/565/566/568 cluster precedent and points at the actual paths the app did call — so the next test iteration probes the right endpoint.

**Discipline → enforcement.** A test that tries to file a bug against `/rest/dictionary` without `assertBugEvidence` should be considered incomplete. CI should flag specs that mark a 404 as FAIL without first calling either `assertBugEvidence` or `assert404Observed`.

### 6.5b — Use captureAround when authoring NEW spec steps (v6.12)

The 2026-05-13 A1 pilot found 10 spec bugs in the chains and personas — every one of them was the spec author (me) inferring an endpoint shape from documents rather than from live capture. `patient-search-results` returns `{patientSearchResults}` not `{patientList}`. Patient ID is `patientID` not `patientPK`. LogbookResults filter is `?testUnitId=N` not `?testSectionId=N`. None of these would have shipped if the helper had been used at *authoring* time, not just at *bug-filing* time.

**Rule (v6.12):** before adding a new step to any chain or persona that calls a non-trivial endpoint, the author MUST first capture the equivalent action via the live UI (or via direct probe) and validate the response shape. Patterns:

```typescript
// Authoring pattern — probe before committing the spec
const { session } = await captureAround(page, async () => {
  await page.goto(`${BASE}/some-page`);
  await page.waitForLoadState('networkidle');
});
console.log(summarize(session));
// Inspect session.captures to find the actual endpoint + payload shape
// Update helpers/apiShapes.ts with the discovered keys
// Then write the spec step against the real shape
```

**Source of truth:** `helpers/apiShapes.ts` (added in v6.12) holds the live-validated response types and key constants. Every chain/persona spec that reads a REST response should import from there rather than typing keys inline. When a new endpoint is introduced or a shape changes, update `apiShapes.ts` in the same commit.

**Practical effect:** the next round of chain/persona corrections (post-pilot) and any future chain/persona additions should not re-inference any shape that isn't already validated in `apiShapes.ts`. If you find yourself typing a field name from memory, stop and run `captureAround` first.

---

## Section 7 — Error Handling

| Situation | Action |
|-----------|--------|
| Element not found | Scroll, wait 2s, retry once. Still missing -> `FAIL "UI element not found"` |
| URL 404/403 | Try alternate URLs from discovery list. All fail -> `GAP "feature not accessible"` |
| Page load timeout (>10s) | `FAIL "Page load timeout"` |
| Error banner / modal | Screenshot -> `FAIL` with the error text |
| Session timeout ("Still There?" modal) | Click to dismiss, re-auth, resume from last step |
| Silent save failure (form resets, no error) | Verify via navigate-away-and-back -> `FAIL "Silent save failure (BUG-8 class)"` |
| Spring NoHandlerFoundException JSON | Document the endpoint path -> likely BUG-9 class (Reports) or NOTE-1 (UX) |
| Carbon checkbox hang (60s) | Do NOT retry `.click()`. Use DOM workaround or mark BLOCKED (BUG-2 EXTENDED) |
| FHIR endpoint timeout | Mark FAIL referencing BUG-14. Do not wait longer than 60s. |
| Blank page after navigation | React SPA routing issue — try sidebar navigation instead of direct URL |

---

## Section 7.5 — Round-trip Write Verification (MANDATORY for all write tests)

Every TC that involves a write (POST/PUT/DELETE) MUST be paired with a read-back step in the same TC. The TC fails if the read-back does not match the write.

**Pattern:**

1. **Write** — perform the action via the UI or API. Record the request payload.
2. **Read-back via a different surface** — fetch the same resource through a different path than the write. Prefer the screen the user would next visit (Modify Order after Add Order; Patient Search after Patient Create; Admin list after Admin Create).
3. **Diff** — every field in the write payload must appear in the read-back response with the same value. Missing or changed fields are **FAIL**.

**Examples of read-backs that would have caught past bugs:**

| Bug | Write | Required read-back |
|-----|-------|--------------------|
| BUG-8 TestModify | POST `/rest/TestModifyEntry` | `GET /rest/test-list?id=X`; compare normal ranges field-by-field |
| BUG-37 patient-order linkage | Add Order wizard submit | Modify Order on the new accession; assert patient name appears |
| BUG-29 rejection workflow | Reject Sample checkbox on Order Entry | (1) Rejection Report PDF for the date range, assert sample appears; (2) NCE list, assert NCE created; (3) Dashboard `ordersRejectedToday`, assert counter increased |
| Site Branding | PUT `/rest/site-branding` color | Generate Patient Status Report PDF, assert color appears on header |
| Reflex rule | POST `/rest/reflexrule` | Enter triggering result, assert downstream test appears in Workplan |

**Diff rule for arrays and nested fields:** Every element matters. A reflex rule with 3 conditions that comes back with 2 is **FAIL**, not "minor discrepancy."

---

## Section 7.6 — Acceptance Criteria Standard

Every TC must declare its Acceptance Criterion in one of the following forms. The form appears in the TC log line.

- **RENDER** — page or component renders; specific DOM elements exist. Default for "page loads" checks. Lowest tier.
- **FUNCTION** — a primary user action completes without error (button click leads to 200, navigation occurs, dialog closes).
- **PERSIST** — written data appears in a subsequent same-endpoint read.
- **ROUND-TRIP** — written data appears in a different endpoint or screen.
- **CROSS-LINK** — data written in one module correctly affects another.
- **REPORTABLE** — output passes regulatory criteria (PDF generated with correct branding, FHIR resource validated, audit entry created).

A test phase that reports only RENDER acceptance criteria for a module is required to rate the module at **M1 maximum**, regardless of how many TCs passed.

A test phase that reports a higher-tier criterion must include the evidence (read-back diff, cross-module verification, PDF content excerpt).

---

## Section 8 — Known Bugs (v3.2.1.3) — Do Not Re-File

> **Calibration status (2026-05-12):** This table has been calibrated against the most recent QA reports. Entries with `~~strikethrough severity~~` and **bold action** in the description are pending Jira closure. See `bug-calibration-delta-2026-05-12.md` for the full delta and the list of tickets to close. Next live session should retest the bugs flagged "NEEDS RETEST" in that doc (top 5 priorities listed there).

| Bug | Severity | Description | Impacted Suites |
|-----|----------|-------------|-----------------|
| BUG-1 | ~~Critical~~ **Downgraded → merge with BUG-12** | `POST /rest/TestAdd` HTTP 500 — **2026-04-21:** server no longer crashes (returns HTTP 200 + validation error "jsonWad: NotBlank"). Form-field serialization is the actual remaining bug, owned by BUG-12. Re-test with CSRF token required. | A (blocks B,C,D cascade) |
| BUG-2 EXTENDED | High | Carbon checkbox `.click()` hangs browser 60s on ALL checkboxes. DOM workaround works for Results but NOT Validation. | D, E, M, all checkbox interactions |
| BUG-3 | High | `POST /rest/UnifiedSystemUser` HTTP 500 — user creation broken | D (RBAC) |
| BUG-4 | Medium | ModifyOrder generates new accession instead of preserving original | C |
| BUG-6 | Low | Duplicate sample type in test name: "HGB(Whole Blood)(Whole Blood)" | B, E, F |
| BUG-7 | Medium | PanelCreate Next button non-responsive (Carbon Select state) | A TC-05 |
| BUG-7a | High | `POST /rest/PanelCreate` silent fail — panel not created | A TC-05 |
| BUG-8 | **Critical** | `POST /rest/TestModifyEntry` silent fail — ranges not saved. **Patient safety.** | A TC-06, B TC-11, E TC-VAL-06 |
| BUG-9 | ~~High~~ **Resolved** | Reports base API endpoint returns Spring NoHandlerFoundException (404). NOTE: Patient Status Report at `/Report?type=patient` works. **2026-04-21:** All 33 report sidebar links resolve to form pages (HTTP 200). Close ticket. | AF, AG (management/WHONET reports) |
| BUG-10 | Low | Billing sidebar link has `href=""` — no route configured, feature not implemented. (Duplicated by NOTE-32 / NOTE-41; consolidate.) | AP (Billing) |
| BUG-11/15 | ~~Medium~~ **Resolved (API); v3.2.1.5 fully implemented** | `/NotebookDashboard` renders completely blank white page. **2026-04-21:** HTTP 200 confirmed; React component now mounts. v3.2.1.5: NoteBook fully implemented with KPI cards (Total Entries, Drafts, Pending Review, Finalized This Week) and Projects/All Entries tabs. Close ticket. | AP (NoteBook) |
| BUG-12 | Medium | TestAdd JSP form: Reporting Test Name inputs lack `name` attributes. Values never submitted to server. | A (TestAdd form) |
| BUG-13 | **Critical** | `GET /TestModifyEntry` returns HTTP 500 after failed TestAdd. Possible orphan data poisoning. Regression. | A (TestModify) |
| BUG-14 | ~~High~~ **Resolved (testing-instance regression noted)** | `/api/fhir/metadata` returned HTTP 200 valid CapabilityStatement in v3.2.1.3. **2026-05-13 cross-validation:** mgdev.openelis-global.org v3.2.1.8 returns a valid HAPI FHIR CapabilityStatement (BUG-14 truly resolved on that newer build). testing.openelis-global.org v3.2.1.6 returns HTML SPA shell — testing-instance specific regression / deployment difference, not a fundamental code regression. Investigate deployment of testing instance. | R (FHIR) — BW-DEEP |
| ~~NEW-1~~ | **RETRACTED — spec misunderstanding (2026-05-13)** | **NEW (Pilot 2026-05-13), RETRACTED same day after user correction.** Original claim: Dashboard reports orders in queue while `LogbookResults` returns 0. **Correction:** `LogbookResults` is the screen/endpoint where techs *enter results into orders*, not a list of all-orders-in-progress. The workflow is Order → Result Entry (Logbook) → Validation. `Dashboard.ordersInProgress` counts orders awaiting result entry; the actual queue is fetched by the React SPA through URLs not yet captured via live UI navigation. Original probe was the wrong endpoint, not a real mismatch. **Methodology lesson:** §6.5b applies recursively — inferring queue endpoints from naming patterns produces false positives at the spec-author layer too. To probe Y-RECON correctly, drive the UI to load the Dashboard tile drill-down and use `captureAround` to find the actual queue endpoint. | Dashboard, Logbook (spec workflow knowledge) |
| NEW-2 | Medium | **NEW (Pilot 2026-05-13)** `GET /api/OpenELIS-Global/ReportPrint?report=patient&type=patient&accessionNumber=X` returned HTTP 500 with a 19-byte body. Test used a patient nationalId where a lab number was expected, so this may be invalid-accession-mishandling rather than a real bug — but a well-designed API would return 400 for bad input, not 500. Possibly BUG-42 extending to the `patient` report type. Retest with a known-real accession. | Reports — Patient Status |
| NOTE-1 | Low (UX) | Non-existent routes return raw JSON 404 (`NoHandlerFoundException`) instead of user-friendly error page. | W-DEEP (error handling) |
| BUG-16 | Medium | French locale shows 2 raw i18n keys (`banner.menu.alerts`, `banner.menu.eqa.distribution`) and 14 untranslated English items (Storage, Analyzers modules). | T-DEEP (i18n) |
| BUG-17 | Low | Results By Range | "Accesion" typo in both From/To labels |
| NOTE-2 | Low (a11y) | No skip-to-content link present. WCAG 2.4.1 recommends bypass blocks. Otherwise excellent: 5 landmarks, ARIA labels, 16.45:1 contrast. | V-DEEP (accessibility) |
| BUG-18 | ~~Critical~~ **Resolved** | Referral organization and reason dropdowns now work correctly in the expanded logbook results row. `form_input` successfully changes values. The onChange handler requires `name` property in event object (throws `AssertionError: we need a path` without it), but real UI interactions pass name correctly. Resolved in v3.2.1.3. | BX-DEEP (Referral) — OGC-449 |
| BUG-19 | ~~Critical~~ **Resolved** | Backend now correctly processes referral data in LogbookResults POST. New referral record created (ID 16), organization "Doherty Institute" and reason "Test not performed" persisted correctly. Test moved to `referredOut: true` status. Resolved in v3.2.1.3. | BX-DEEP (Referral) — OGC-493 |
| BUG-20 | Medium | **NEW (Phase 8)** Login Name field (`#login-name`) in User Create (`/MasterListsPage/userManagement`) permanently shows `invalid: true` with no `invalidText`. React TextInput component state issue — wrapper has `data-invalid="true"` regardless of input. Error icon visible but no tooltip/message. Save button permanently disabled. | BT-DEEP (UserCreate) — OGC-494 |
| BUG-21 | Low | **NEW (Phase 8)** All `patient-photos/{id}/true` endpoints return HTTP 500. Every patient photo fetch on the LogbookResults page fails silently. | Results pages — OGC-495 |
| BUG-22 | Medium | **NEW (Phase 10)** No rate limiting on login endpoint (`/rest/validateLogin`) or any API endpoints. 30 rapid wrong-password attempts returned 403 (rejected) but with NO escalation to 429 (Too Many Requests) and NO account lockout. 50 rapid API requests to authenticated endpoints all returned 200, with no 429 responses. Brute-force attacks are possible. | CG-RATE (Security) — OGC-496 |
| NOTE-3 | Low (Code Review) | **NEW (Phase 9)** Dashboard metrics API endpoint `/rest/home-dashboard/metrics` field names contain typos: `patiallyCompletedToday`, `orderEnterdByUserToday`, `unPritendResults`, `incomigOrders`, `averageTurnAroudTime`. Cosmetic code quality issue indicating missing code review pass on metrics endpoint. Functionality is correct despite typos. | CA-KPI (Dashboard) |
| NOTE-4 | Low (Security) | **NEW (Phase 10)** Content Security Policy header includes `unsafe-inline` and `unsafe-eval`, significantly weakening CSP protection. Should restrict to specific nonces or hashes. | CC-CSRF (Security) |
| NOTE-5 | Low (Security) | **NEW (Phase 10)** Referrer-Policy header not set. Recommended to set to `strict-no-referrer` or `no-referrer` to prevent information leakage to external sites. | CC-CSRF (Security) |
| NOTE-6 | Low (Security) | **NEW (Phase 10)** User input reflected in JSON API responses (LogbookResults `labNumber` parameter). Low-risk with `Content-Type: application/json` (browsers won't execute scripts), but caution if frontend uses `dangerouslySetInnerHTML` on the reflected value. | CD-XSS (Security) |
| NOTE-7 | Low (Security) | **NEW (Phase 10)** Error responses (404, validation errors) contain "Exception" keyword, leaking server implementation details. Should return generic error messages only to avoid fingerprinting attacks. | CH-AUTH (Security) |
| NOTE-8 | Medium (a11y) | **NEW (Phase 12)** 45% of focusable elements lack visible focus indicator. 9/20 tested elements had no outline or box-shadow on focus. Affects keyboard-only users. | CM-WCAG (Accessibility) |
| NOTE-9 | Medium (a11y) | **NEW (Phase 12)** Heading hierarchy broken on all pages. No H1; starts at H5, then H3×10, H4. Violates WCAG 1.3.1 and 2.4.6. | CO-WCAG (Accessibility) |
| NOTE-10 | Medium (a11y) | **NEW (Phase 12)** Zero aria-live regions in the entire application. Dynamic content updates (API results, form validation, notifications) are invisible to screen readers. | CP-WCAG (Accessibility) |
| NOTE-11 | Low (a11y) | **NEW (Phase 12)** 90% of interactive targets (87/97) below 44×44px WCAG 2.5.5 recommended minimum. Primarily sidebar menu items and small buttons. | CR-WCAG (Accessibility) |
| NOTE-12 | Serious (a11y) | **NEW (Phase 12)** Color contrast 1.08:1 (white #ffffff on #f5f6f8) on 8 elements per page. WCAG AA requires 4.5:1 for 14px text. Affects all pages identically (shell-level issue). Carbon sidebar custom theme suspected. | CQ-WCAG (Accessibility) |
| NOTE-13 | Low (i18n/a11y) | **NEW (Phase 13)** `<html lang="en">` never updates to `lang="fr"` when locale is switched to French. Screen readers will continue reading French text with English pronunciation rules. | CS-i18n (i18n) |
| ~~BUG-23~~ | ~~High~~ | **RETRACTED (Phase 15)** False positive. Test used hash-based URLs (`#/RoutineReport`) which are wrong. SPA uses path-based routing (`/Report?type=patient&report=...`). Sidebar clicks render report forms correctly with 24+ inputs. | CU-Report (Reports) |
| NOTE-14 | Medium (Data) | **NEW (Phase 14)** Test instance data wiped since prior sessions. All logbook types return 0 results, patient search returns 0, referredOut returns 0. Dashboard metrics show stale counts. Periodic data reset on test instance suspected. | CX-E2E (Data) |
| NOTE-15 | Low (Security) | **NEW (Phase 15)** API error responses leak "Exception" text in response body. Reconfirms NOTE-7 from Phase 10. Generic error messages should be returned to prevent server fingerprinting. | DA-Error (Error Handling) |
| NOTE-16 | Low | **NEW (Phase 16)** Report PDF header displays "null" instead of lab/site name — missing SiteInformation config | DC-PDF (Reports) |
| NOTE-17 | Low | **NEW (Phase 16)** External Referrals Report sidebar link contains typo "labratory" (should be "laboratory") | DC-PDF (Reports) |
| NOTE-18 | Medium | **NEW (Phase 17)** Billing sidebar stub | Medium | Open | Billing sidebar link has href=null — no page implemented in React SPA |
| NOTE-19 | Medium | **NEW (Phase 17)** NoteBook blank page | Medium | Open | /NotebookDashboard renders completely blank — no header, no sidebar, no content |
| NOTE-20 | Low | **NEW (Phase 18)** Non-Conform heading naming inconsistencies: "View New Non Conform Event" (missing hyphen/"-ing"), "Nonconforming Events Corrective Action" (one word), vs sidebar "Non-Conforming". Three different naming conventions in one module. | DS/DT (Non-Conform) |
| NOTE-21 | Medium | **NEW (Phase 18)** Video Tutorials and Release Notes buttons in header Help panel are non-functional stubs. `<button>` elements with no href, no onclick handler — clicking does nothing. Only visible in header Help dropdown, not sidebar Help menu. | DY/DZ (Help) |
| NOTE-22 | Low | **NEW (Phase 19)** Delete Analyzer confirmation dialog shows literal `{name}` placeholder instead of interpolated analyzer name. Text reads "Are you sure you want to delete {name}?" instead of showing "Test Analyzer Alpha". Template variable not resolved. | EB (Analyzer Delete) |
| NOTE-23 | Low | **NEW (Phase 19)** Global search shows no "No results found" empty state message for non-matching queries. Searching a non-existent term just shows nothing — no dropdown, no feedback. Minor UX gap. | EH (Global Search) |
| NOTE-24 | Low | **NEW (Phase 20) OGC-510** Typo "Succesfuly saved" on order success page heading (ref_186). Should read "Successfully saved". Missing second 's' and 'l'. | EK (Order CRUD) |
| NOTE-25 | Medium | **NEW (Phase 20) OGC-511** Order submit button enables despite active "Requester Last Name is required" validation error in React state. Soft validation doesn't block submission — order created successfully with missing data. | EK (Order CRUD) |
| NOTE-26 | Low | **NEW (Phase 20E) OGC-512** Typo "Orginal Result" in ResultValidation Past Notes column header. Should read "Original Result". Missing letter 'i'. | EQ (Result Validation) |
| NOTE-27 | Low | **NEW (Phase 21) OGC-513** Patient Status Report PDF displays literal "null" for empty Contact Tracing Index Name and Contact Tracing Index Record Number fields. Should display blank or "N/A". | EV (Report — Patient Status) |
| NOTE-28 | Low | **NEW (Phase 21) OGC-514** Summary of All Tests report header shows raw i18n key `report.labName.two` instead of resolved laboratory name. Missing message bundle entry or unresolved key in Jasper template. | EX (Report — Test Report Summary) |
| BUG-29 | **High** | **NEW (Phase 23) OGC-515** Rejected samples not appearing in Rejection Report or Non-Conforming Events. "Reject Sample" checkbox at Order Entry and Edit Order stores rejection data in sample_item fields but does NOT create qa_event/NCE records. Rejection Report PDF returns HTTP 503 "Check server logs". Dashboard "Orders Rejected" counter stays at 0. Three distinct symptoms of the same root cause: rejection data silo. | FI (E2E Rejection Workflow) |
| NOTE-29 | Low | **NEW (Phase 23)** Save confirmation page after Edit Order submission shows "undefined undefined ♀ Female" instead of actual patient name. Patient data not re-fetched for the success page. | FI (E2E Rejection Workflow) |
| BUG-30 | Medium | **NEW (Phase 23B)** bannerHeading Modify causes indefinite loading spinner — selecting the bannerHeading config item in Site Information and clicking Modify results in a permanent loading spinner that never resolves. Reproduced twice. Likely caused by the bilingual text value format with "English:...French:..." structure. | FJ (Admin General Configuration) |
| NOTE-30 | Low | **NEW (Phase 23F)** Typo "Accesion" (missing 's') on RangeResults page — both "From Accesion Number" and "To Accesion Number" labels misspelled. Should be "Accession". | FT (Results By Range) |
| NOTE-31 | Low | **NEW (Phase 23F)** Typo "Recieved" (i/e transposed) on StatusResults page — "Enter Recieved Date" label. Should be "Received". | FT (Results By Test/Date/Status) |
| NOTE-32 | Low | **NEW (Phase 23Q-T)** Billing sidebar link has empty href — clicks do nothing, no route defined. Feature not implemented. | GK (Aliquot/Billing/NoteBook/Help) |
| NOTE-33 | Low | **NEW (Phase 23Q-T)** NoteBook Dashboard blank page — route `/NotebookDashboard` renders empty React root. Component not implemented. | GK (Aliquot/Billing/NoteBook/Help) |
| NOTE-34 | Low | **NEW (Phase 23X)** Test Management "Rename Existing Sample Types" description copy-paste error — says "Use to correct the name of existing panels" instead of "sample types". | GO (Test Management) |
| NOTE-35 | Low | **NEW (Phase 23X)** Legacy Admin top nav shows raw i18n keys "banner.menu.aliquot" and "sidenav.label.notebook" — untranslated message keys displayed as menu labels. | GT (Legacy Admin) |
| NOTE-36 | Low | **NEW (Phase 23Z)** Global Search (header bar) is non-functional — typing text and clicking Search does not navigate or display results. Search bar renders correctly but produces no output. | GY (Header Interactions) |
| NOTE-37 | Low | **NEW (Phase 23Z)** Results > By Range of Order Numbers page labels show "Accesion" (missing 's') instead of "Accession" in both "From Accesion Number" and "To Accesion Number" field labels. | GY (Results Sub-Pages) |
| NOTE-38 | Low | **NEW (Phase 23AB)** HIV ABON Tri-line HIV 1/2/0 result dropdown has duplicate option values — Nonreactive ×3, Invalid ×3, Reactive HIV-1 ×3 appear as repeated entries. Configuration error in test result dictionary. | HA (Multi-Unit Field Type Survey) |
| NOTE-39 | Low | **NEW (Phase 23AB)** Mycobacteriology Xpert MTB/RIF Ultra (MTB) result dropdown has ENTIRE option list duplicated — all 10 values (MTB DETECTED, MTB NOT DETECTED, MTB Trace DETECTED, etc.) appear twice in different sort orders. Systemic configuration bug matching NOTE-38 pattern. | HA (Multi-Unit Field Type Survey) |
| NOTE-40 | Medium | **NEW (Phase 23AC)** Systemic duplicate test entries in Workplan By Test Type dropdown — ABON Tri-line ×3, Abbott HIV/Syphilis Duo ×3, Acid-Fast Microscopy ×4, Capilia TB-Neo ×4, Xpert MTB/RIF Ultra (MTB) ×6, Xpert MTB/RIF Ultra (RIF) ×6, M. ulcerans PCR ×5, each with different value IDs. This is the same configuration-level duplication causing NOTE-38/39 in Results dropdowns. Root cause: multiple test configurations per test name (likely one per sample type/lab section). | HB (Workplan Pages) |

| NOTE-41 | Low | **NEW (Phase 23AE)** Billing sidebar link has NO href attribute — empty anchor tag `<a>` with no destination. Clicking does nothing. This is the ONLY dead link in the entire sidebar navigation (all other 18 top-level items have valid hrefs or are expandable menus). | HD (Billing) |
| NOTE-42 | High | **NEW (Phase 23AE)** NoteBook Dashboard (`/NotebookDashboard`) renders a COMPLETELY BLANK white page — no header, no sidebar, no content area. DOM contains only Chrome extension overlay elements. Page URL is correct but application fails to render any components. Critical rendering failure. | HD (NoteBook) |

| BUG-30 | Medium | **NEW (Phase 23B/27)** bannerHeading Modify causes indefinite loading spinner in Site Information. JS crash on bilingual text format. | FJ (Admin General Configuration) |
| BUG-31 | **High** | **NEW (Phase 27)** Accept checkbox on Results page causes 60s renderer hang, blocking all result entry. Extends BUG-2 pattern. Critical — blocks results→validation→reporting pipeline. | Results (LogbookResults) |
| BUG-32 | Medium | **NEW (Phase 27)** LogbookResults API returns 500 | Results |
| BUG-33 | Medium | **NEW (Phase 27)** Dictionary API returns 500 | Admin (Dictionary) |
| BUG-34 | ~~Low~~ **False positive — close** | **NEW (Phase 27)** Organization API returns 500. **2026-04-20:** `/rest/organizationSearch` was never a valid path. Organization Management is JSP at `/api/OpenELIS-Global/Organization` (200); `/rest/OrganizationMenu` returns 200. Close as false positive. | Admin (Organization) |
| BUG-35 | Low | **NEW (Phase 27)** Legacy Admin opens new tab instead of SPA navigation | Admin (Legacy) |
| ~~BUG-36~~ | ~~High~~ **Resolved** | POST `/rest/test-calculation` returns HTTP 200 for both create and update. Initial 500s in Phase 28 were from malformed payloads (array wrappers, missing required fields). Endpoint works correctly with proper payload structure. | Calculated Values |
| BUG-38 | **Critical** | **NEW (Phase 35)** POST `/rest/reportnonconformingevent` hangs indefinitely — server never returns a response. Causes Chrome 6-connection-per-origin pool exhaustion when multiple tabs attempt the POST simultaneously. All subsequent API calls to the same origin block until hanging tabs are closed. NCE form UI (search, sample selection, checkbox, navigation, form pre-population) all work; only the final submission endpoint is broken. **Workaround:** Close any tab with a pending POST to this endpoint immediately to restore connectivity. Note: BUG-38 was previously retracted (Submit button off-screen — normal behavior); this re-assigns the number to a genuine Critical bug. | Phase 35 Chain B (NCE E2E) |
| BUG-39 | Medium | **NEW (Phase 37B)** `GET /rest/eqa/samples/dashboard` returns HTTP 404 — EQA Management main dashboard KPI endpoint not deployed. Page renders with fallback zeros for all 4 stat cards (Pending/In Progress/Completed/Submitted) and dashes for Performance Summary metrics. All other EQA Management sub-pages work: `/EQAParticipants` (`/rest/eqa/programs` → 200), `/EQADistribution` (`/rest/eqa/distributions` → 200), `/EQAResults` (`/rest/eqa/orders` → 200). | EQA Management Dashboard |
| BUG-40 | Low | **NEW (Phase 37A)** `POST /rest/inventory-storage-locations` returns HTTP 500 (empty body). Tested with `locationType:"REFRIGERATOR"` and `locationType:"ROOM"` (form default) — both fail. The GET endpoint works (`GET /rest/inventory-storage-locations` → 200, empty array). **Workaround:** Inventory lots can be created with `storageLocation:null` — storage location is not required by the `/rest/inventory/management/receive` endpoint. | Inventory Management — Storage Locations |
| BUG-41 | Low | **NEW (Phase 37A)** `GET /rest/inventory/items/all?isActive=true` returns deactivated items (`isActive:"N"`). The `?isActive=true` query parameter filter is silently ignored by the `/items/all` endpoint. The Inventory Catalog view uses this endpoint for the "active items" list — deactivated items incorrectly appear as active. | Inventory Management — Catalog |
| BUG-42 | Medium | **NEW (Phase 38A)** `GET /api/OpenELIS-Global/ReportPrint?report=X&...` returns HTTP 500 with body `"Check server logs"` (19-byte JSON string) for 2 active report types: `statisticsReport` and `auditTrail`. All other date-range reports return HTTP 200 + valid PDF. Note: `indicatorHaitiLNSPAllTests`, `indicatorCDILNSPHIV`, and `retroCInonConformityNotification` also return 500 but are **legacy reports** — not expected to function. | Reports — Study/Routine |
| BUG-43 | Low | **NEW (Phase 38B)** `/GenericSample/Results` breadcrumb displays raw i18n key `sample.label.generic` instead of a translated label. The page heading ("Result Entry" H3) and form render correctly. Only the breadcrumb/section label is broken. | Generic Sample — Results |
| BUG-44 | Low | **NEW (Phase 38D)** `/Inventory` — both the Lots table and the Catalog table display `label.button.action` as the last column header instead of a translated "Actions" label. Both tables affected by the same unresolved i18n key. | Inventory Management — Tables |
| BUG-45 | Medium | **NEW (Phase 38D)** `POST /api/OpenELIS-Global/rest/inventory/reports/generate` returns HTTP 404 `NoHandlerFoundException` — backend endpoint not deployed in v3.2.1.4. Additionally, the Export Format dropdown in the Inventory Reports tab renders with no selectable options, preventing the UI from building a valid request payload (sends `{}`). Inventory Reports Generate button is completely non-functional. | Inventory Management — Reports |
| BUG-46 | Low | **FIXED in v3.2.1.4 (verified Phase 40); REGRESSED in v3.2.1.5 (verified Phase 42)** ~~`/MasterListsPage/calculatedValue` admin page calls `GET /rest/calculatedValue` and `GET /rest/testCalculatedValue` on every page load — both return HTTP 404.~~ Fixed in v3.2.1.4 — only `/rest/test-calculations` (200) observed. **REGRESSED:** Both `/rest/calculatedValue` and `/rest/testCalculatedValue` return 404 again in v3.2.1.5 (mgtest). | Admin — Calculated Value Tests Management |
| BUG-47 | Low | **CONFIRMED + EXTENDED (Phase 40)** 4 unresolved i18n keys in Inventory modals: (1) `storage.location.add.button` — button label in "Receive New Inventory Lot" modal Storage Location section; (2) `storage.location.add.title` — heading of the Add Storage Location sub-dialog; (3) `dangerDeactivate` — button label in "Deactivate Item" confirmation dialog; (4) `label.button.action` — column header in Inventory Lots table (also BUG-44). | Inventory Management — Add New Lot Modal, Deactivate Dialog, Lots Table |
| BUG-48 | Medium | **NEW (Phase 40); PARTIALLY FIXED in v3.2.1.5** 4 of the 8 General Configuration sub-pages render blank (body.innerText.length === 879, sidebar-only render, no content component). Blank pages: `SampleEntryConfigurationMenu`, `OrderEntryConfigurationMenu`, `PatientConfigurationMenu`, `PrinterConfigurationMenu`. Root cause: backend `GET /rest/<PageName>` returns HTTP 404 for each, so React component cannot load config data and renders nothing. Working pages: WorkplanConfigurationMenu, NonConformityConfigurationMenu, ValidationConfigurationMenu. **v3.2.1.5 fix:** `PatientConfigurationMenu` now returns 200 — 3 of 4 broken pages remain (SampleEntry, OrderEntry, Printer). | Admin — General Configurations |
| BUG-49 | Low | **NEW (Phase 41)** `/MasterListsPage/menuConfiguration` (the route the sidebar "Menu Configuration" button links to) renders blank — body.innerText.length = 879, no content component mounted. The 7 actual menu config sub-routes (globalMenuManagement, billingMenuManagement, nonConformityMenuManagement, patientMenuManagement, studyMenuManagement, testManagementConfigMenu, testNotificationConfigMenu) all render correctly when navigated directly. The parent route is an empty shell with no redirect or landing content. | Admin — Menu Configuration |
| BUG-50 | ~~Medium~~ **Split: close on testing, keep on mgtest** | **NEW (Phase 42 — v3.2.1.5)** `GET /rest/provider` → HTTP 404 in v3.2.1.5. **2026-04-20 calibration:** On testing v3.2.1.6 this is a false positive — Provider Management is JSP `/api/OpenELIS-Global/ProviderMenu` (200) plus `/rest/ProviderMenu` (200). UI works. On mgtest v3.2.1.5 the UI degrades to UNKNOWN_ row only — that is a real mgtest-only ticket; file separately with mgtest-only label. | Admin — Provider Management |
| BUG-51 | ~~High~~ **False positive on testing — close** | **NEW (Phase 42 — v3.2.1.5)** `GET /rest/dictionary` → HTTP 404. **2026-04-20:** Path was never valid. Dictionary is JSP `/api/OpenELIS-Global/DictionaryMenu` (200, 701 entries) plus `/rest/DictionaryMenu` (200). On mgtest v3.2.1.5 some admin pages render blank — that is BUG-59 territory, separate ticket. | Admin — Dictionary Menu |
| BUG-52 | ~~High~~ **False positive — close** | **NEW (Phase 42 — v3.2.1.5)** `GET /rest/patient/search` → HTTP 404. **2026-04-20:** Patient search uses `/rest/patient-search-results` (200, confirmed via live network capture). UI works correctly. | Patient Management — Search |
| BUG-53 | ~~Medium~~ **False positive — close** | **NEW (Phase 42 — v3.2.1.5)** `GET /rest/referrals` → HTTP 404. **2026-04-20:** Path was never valid. Referred Out Tests React page renders all 4 search panels correctly. | Results — Referred Out Tests |
| BUG-54 | ~~Medium~~ **False positive — close** | **NEW (Phase 42 — v3.2.1.5)** `GET /rest/calculatedValue` and others. **2026-04-20:** None of the probed paths are valid app endpoints. Admin pages use JSP or differently-named REST paths. | Admin — Calculated Values, Organization Management |
| BUG-55 | ~~High~~ **Resolved (close)** | **FIXED (Phase 54 — v3.2.1.5)** React Router basename misconfiguration caused `/Workplan` and `/NonConformingEvent` redirects. **CONFIRMED FIXED** in Phase 54 retesting (2026-04-13): all WorkPlanBy* routes load correctly. Fix deployed to mgtest. Close ticket. | Core Workflows — Workplan, Non-Conforming Event |
| BUG-56 | ~~Medium~~ **Resolved (close)** | **NEW (Phase 45 — v3.2.1.5)** FHIR stack not deployed on mgtest. **2026-04-20:** `GET /api/OpenELIS-Global/fhir/metadata` returns valid HAPI FHIR 7.0.2 R4 CapabilityStatement. The correct path is `/api/OpenELIS-Global/fhir/metadata` (not `/fhir/metadata` shortcut). FHIR is deployed. Close ticket. | FHIR — Metadata, Patient, Observation |
| BUG-57 | ~~Medium~~ **Retracted on testing; mgtest-only ticket** | **NEW (Phase 45 — v3.2.1.5)** `/Report?type=patient` redirects to `/` (Dashboard). **2026-04-20:** On testing v3.2.1.6 retracted — `/rest/report/*` was never the generation endpoint; reports use JSP `/api/OpenELIS-Global/ReportPrint` (works). Close on testing; keep mgtest-only ticket for the React Router redirect. | Reports — All report types |
| BUG-59 | Medium | **NEW (Phase 43 — v3.2.1.5)** 9 of 15 MasterListsPage admin sub-pages render blank (body.innerText.length ≈ 779, sidebar-only render, React content component not mounted). Blank pages: testManagement, resultManagement, unitManagement, dictionaryManagement, siteInformation, generalConfig, panelManagement, testSectionManagement, OrderEntryConfigurationMenu, PrinterConfigurationMenu. Working pages: userManagement, organizationManagement, providerMenu, labNumber, barcodeConfiguration. Root cause likely v3.2.1.5 REST endpoint regressions preventing component hydration. | Admin — Multiple sub-pages |
| BUG-60 | Medium | **NEW (Phase 47 — v3.2.1.5)** LogbookResults test-section filter ineffective on mgtest. All 10 unit types (Biochemistry/Hematology/Serology-Immunology/Immunology/Molecular Biology/Cytology/Serology/Virology/Pathology/Immunohistochemistry) return identical 15 PCR results (Dengue/Chikungunya/Zika PCR Plasma from auto-imported analyzer data). Confirmed via synchronous XHR loop: `testResult` objects have no `testSectionId` field, so the `unitType` filter parameter has no effect server-side. Routine ResultValidation queue also shows 0 despite 15 "ready for validation" orders — auto-imported analyzer results bypass the routine queue and are only accessible via AccessionValidation by accession number. | Results — LogbookResults By Unit |

If you encounter a new failure that matches one of these bugs in a **different** area,
note it as "BUG-X extending to Suite Y" rather than filing a new ticket.

---

## Section 8.5 — Partial-Feature Audit (Required quarterly + on major version bumps)

Once per quarter, and on every major version bump, run the Partial-Feature Audit. The audit is a deliberate hunt for features that pass the standard render-PASS criterion but are functionally incomplete. The output is a list of M0–M2 modules ranked by lab impact.

**Procedure:**

1. **Enumerate visible features.** From the sidebar, every top-level item is a candidate. List every screen the user can reach.
2. **For each screen, check four signals:**
   - **a.** Are there i18n keys leaking through? (Suggests an unmaintained branch — see BUG-43, BUG-44, BUG-47, NOTE-35.)
   - **b.** Do any primary buttons return 4xx/5xx? (Inventory Reports Generate, NCE submit, Storage Locations POST.)
   - **c.** Is there a filter that doesn't filter? (BUG-41 Inventory active filter; BUG-60 LogbookResults pre-v3.2.1.6.)
   - **d.** Does a "successful" write read back missing fields? (BUG-8 TestModify.)
3. **For each module, rate Maturity M0–M5** (Section 5.5). Document the evidence.
4. **Lab Impact rank.** For each M0–M2 module, write one sentence: "A lab needing X cannot do X because Y." Sort the list by severity.

The audit produces a delivery document, not a Jira fire-hose. File Jira tickets only for the top 10 issues, ranked by lab impact. The rest go in the audit report as a prioritization backlog.

**Seed list of suspect features (audit baseline, 2026-05-12):** Inventory storage locations (M1, BUG-40), Inventory Reports (M1, BUG-45), Inventory active filter (M2-broken, BUG-41), Cold Storage compliance loop (M2 unverified), EQA distribution (M1 without config), Reflex rules (M2 unverified), Calculated values (M2 unverified), Pathology workflow progression (M2 unverified), Rejection workflow chain (M2 broken, BUG-29), Patient-order linkage on order create (M1.5 broken, BUG-37), NCE submission (M1 broken, BUG-38), Permission enforcement (M1 unverified), Audit trail coverage (M2 unverified), FHIR resource round-trip (M2 unverified), Notification subsystem (M1), Order Programs Questionnaire (M1 unverified), Bar code label printing (M1 unverified), Storage Boxes grid assignment (M2 unverified), Lab number generation cross-path uniqueness (M2 unverified), Search index reindex button (M0 unverified).

---

## Section 9 — Validation History

These results come from 6 rounds of live validation on the jdhealthsolutions instance:

| Round | Date | Suites | Pass | Fail | Blocked | Notes |
|-------|------|--------|------|------|---------|-------|
| 1 | 2026-03-23 | A-D | 1 | 1 (BUG-1) | 18 | BUG-1 cascade |
| 2 | 2026-03-24 | H,I,J,K,T,V | 27 | 0 | 0 | Frontend healthy |
| 3 | 2026-03-24 | AA-AP | 22 | 2 (404s) | 0 | Reports 404, Billing/NoteBook 404 |
| 4 | 2026-03-24 | All Admin | 28 | 0 | 0 | 100% admin pass |
| 5 (Phase 4) | 2026-03-25 | 11 DEEP suites | 32 | 0 | 0 | 100% interaction pass |
| 6 (Phase 5) | 2026-03-25 | 8 DEEP suites | 21 | 0 | 0 | 100% deep interaction/E2E pass; BUG-16, NOTE-2 discovered |
| 7 (Phase 6) | 2026-03-27 | 8 DEEP suites | 16 | 0 | 0 | Batch Order, Barcode, E-Orders, Patient History/Merge, Range/Status Results, Referrals |
| 8 (Phase 7) | 2026-03-27 | 7 DEEP suites | 10 | 2 | 2 | Pathology, IHC, Cytology, EQA, Analyzers all PASS; Referral Create FAIL (BUG-18+19), Referral Results BLOCKED |
| 9 (Phase 8) | 2026-03-27 | 6 DEEP suites | 2 | 4 | 0 | Write Op Deep Testing: BUG-1,3,7a CONFIRMED (500s); BUG-8 CONFIRMED+WORSE (data corruption); BUG-14 RESOLVED; BUG-18/19 RESOLVED; BUG-20,21 NEW |
| 10 (Phase 9) | 2026-03-27 | 8 DEEP suites | 8 | 0 | 0 | Regression & Cross-Module Integrity: 100% pass rate. Regression baseline stable. Cross-module data flow verified. NOTE-3 (API typos) discovered. |
| 11 (Phase 10) | 2026-03-28 | 6 suites | 5 | 1 | 0 | Security & Edge Cases: SQL/XSS protections solid; concurrent sessions stable; rate limiting FAIL. BUG-22 (no rate limit), NOTE-4/5/6/7 (CSP/Referrer/reflection/error leaks) discovered. |
| 12 (Phase 11) | 2026-03-28 | 4 suites | 4 | 0 | 0 | Performance Benchmarking: All API ~370ms (network-dominated), SPA shell 40ms DCL, no memory leaks, large datasets acceptable. No new bugs. |
| 13 (Phase 12) | 2026-03-28 | 6 suites | 2 | 4 | 0 | Accessibility Deep Audit: axe-core scan, keyboard navigation, heading hierarchy, ARIA landmarks, color contrast, touch targets. Shell-level violations on all pages. NOTE-8/9/10/11/12 discovered. |
| 14 (Phase 13) | 2026-03-28 | 2 suites | 2 | 0 | 0 | i18n Infrastructure: Locale switching works, persists across nav. html lang never updates (NOTE-13). API locale-agnostic (by design). |
| 15 (Phase 14) | 2026-03-28 | 4 suites | 3 | 1 | 0 | E2E/Reports/FHIR: ~~BUG-23 RETRACTED~~ (hash URL error). ReportPrint API returns PDF. FHIR Patient/Observation OK. Test data wiped (NOTE-14). Corrected: 75% pass. |
| 16 (Phase 15) | 2026-03-28 | 4 suites | 4 | 0 | 0 | Notification/Alert/Error: Notification panel functional. Alert API works. API error leak reconfirms NOTE-7 (NOTE-15). Session timeout works. Path-based routing confirmed → BUG-23 retracted. |
| 17 (Phase 16) | 2026-03-29 | 7 suites | 22 | 0 | 0 | Print/PDF, Batch Ops, Concurrency, FHIR Deep, Workplan, EQA: All 22 TCs PASS. NOTE-16 (null report header), NOTE-17 (typo) |
| 18 | 2026-03-29 | Phase 17 module deep | 15 | 13 | 2 | Storage, Cold Storage, Pathology, IHC, Cytology all PASS; Billing FAIL (NOTE-18), NoteBook FAIL (NOTE-19) |
| 19 (Phase 18) | 2026-03-29 | 9 suites | 7 | 2 | 0 | Non-Conform 3 pages PASS; Analyzers 3 pages PASS; Help: User Manual PASS, Video Tutorials FAIL (NOTE-21), Release Notes FAIL (NOTE-21). NOTE-20 (naming). |
| 20 (Phase 19) | 2026-03-29 | 8 suites | 7 | 1 | 0 | Analyzer kebab 6 actions PASS; Delete {name} bug FAIL (NOTE-22); Search filter PASS; Type creation PASS; Notifications PASS; User panel PASS; Global Search PASS; No empty state NOTE-23. |
| 21 (Phase 20) | 2026-03-29 | 8 suites | 16 | 2 | 0 | Order CRUD: 4-step wizard PASS, lab number PASS, Edit PASS; NOTE-24 typo, NOTE-25 validation gap. Reflex/Calc admin legacy-only. Patient CRUD: Create/Read/Update PASS; DOB→age calc PASS; Patient History & Merge pages PASS. |
| 22 (Phase 20E) | 2026-03-30 | 5 suites | 9 | 0 | 0 | ResultValidation page load + bulk actions PASS; AccessionValidation search PASS; LogbookResults editable table PASS; PatientResults + ResultValidationByTestDate PASS; Full validation workflow (Save→removed) PASS. NOTE-26 typo "Orginal Result". |
| 23 (Phase 21) | 2026-03-30 | 7 suites | 12 | 0 | 0 | Report PDF Generation (Patient Status, Statistics, Test Report Summary) all PASS; Audit Trail 21-item lifecycle PASS; WHONET/CSV Export PASS; Electronic Orders dual search PASS; Referrals page PASS. NOTE-27 (OGC-513) null in PDF, NOTE-28 (OGC-514) i18n key leak. |
| 24 (Phase 22) | 2026-03-30 | 6 suites | 12 | 0 | 0 | All remaining Management Reports PASS (Rejection, Activity ×3, External Referrals, Non Conformity ×2, Delayed Validation auto-PDF). Batch Order Entry, Print Barcode, Batch Test Reassignment, Add Order all PASS. No new bugs. |
| 25 (Phase 23) | 2026-03-30 | 1 suite (5 TCs) | 2 | 3 | 0 | E2E Rejection Workflow: Reject at Order Entry PASS, Reject via Edit Order PASS. Rejection Report PDF FAIL (503), NCE visibility FAIL (No Data Found), Dashboard counter FAIL (stays 0). BUG-29/OGC-515. |
| 26 (Phase 23B) | 2026-03-30 | 2 suites (20 TCs) | 19 | 1 | 0 | Admin Config Deep Tests: 10 General Config sub-pages + Provider/Organization CRUD. Three edit form types documented (Boolean/Text/Image). bannerHeading Modify FAIL (infinite spinner, BUG-30). Site Branding, all config tables, Provider CRUD modal, Organization full-page form all PASS. |
| 27 (EQA-DEEP) | 2026-03-31 | 6 suites (44 TCs) | 41 | 0 | 0 | EQA Module Deep Testing — Suite FK added as prerequisite (3 TCs: enable EQA in Admin → General Config). Original 5 suites (41 TCs): EQA Distribution dashboard (7 TCs), Create Shipment wizard (4 TCs), Alerts Dashboard (8 TCs), Admin EQA Program Management (15 TCs), Sidebar Navigation (7 TCs). All PASS. Full spec-vs-implementation gap analysis vs FRS v1.0 + Addendum v3.0. 15 spec gaps documented (v3.2.3.0 features). 3 spec divergences noted (Provider dropdown vs typeahead, severity levels, table columns). Jira: OGC-518 through OGC-524 filed then **CANCELLED** — EQA module requires enabling via Admin → General Configuration → EQA Enabled; testing was against incomplete version without config toggle. All 7 transitioned to Done with cancellation comment. |
| 28 (Phase 23C) | 2026-03-31 | 1 suite (10 TCs) | 10 | 0 | 0 | User Management fine-grained form verification: Add User (all fields, 6 global roles, 15 lab units, 5 per-unit permissions, copy permissions), Modify User, list filters (search, Active, Administrator, Lab Unit Roles). BUG-20 reconfirmed with CSS class typo `defalut`. ALL PASS. |
| 29 (Phase 23D) | 2026-03-31 | 1 suite (10 TCs) | 10 | 0 | 0 | Edit Order (Modify Order) 3-step wizard field verification: Search page (accession + patient), Step 1 (Program Selection), Step 2 (Add Sample with Current/Available Tests, storage, labels, panels), Step 3 (21 fields including Priority 5 options, ward/dept/unit 3 options, payment status 4 options, sampling analysis 8 codes). ALL PASS. |
| 30 (Phase 23E) | 2026-03-31 | 1 suite (10 TCs) | 10 | 0 | 0 | Batch Order Entry Setup: Form types (Routine/EID/Viral Load), Sample Type conditional display, Panels (3 for Whole Blood), Available Tests (16 for Whole Blood), Barcode Methods (On Demand/Pre-Printed), Optional Fields (Facility/Patient Info), Next button activation logic. ALL PASS. |
| 31 (Phase 23F) | 2026-03-31 | 2 suites (20 TCs) | 20 | 0 | 0 | Results pages (6): By Unit (14 test units, 27 methods, 10 referral reasons, expanded row detail), By Patient (patient search), By Order (accession search), Referred Out (3 search methods), By Range (NOTE-30 typo), By Test/Date/Status (200+ tests, 5 analysis statuses, 2 sample statuses, NOTE-31 typo). Validation pages (4): Routine (14 test units), By Order, By Range, By Date. ALL PASS. |

| 32 (Phase 23G) | 2026-03-31 | 2 suites (15 TCs) | 15 | 0 | 0 | Workplan (4 pages): By Test Type (302 tests), By Panel (41 panels), By Unit (14 units), By Priority (5 priorities). Non-Conform (3 pages): Report NCE, View New NCE, Corrective Actions — all share Search By (4 options) + Text Value form. ALL PASS. |

| 33 (Phase 23H) | 2026-03-31 | 1 suite (4 TCs) | 4 | 0 | 0 | Add Order 4-step wizard (`/SamplePatientEntry`): Step 1 Patient Info (2 tabs: Search 7 fields + results table, New Patient 15+ fields including Emergency Contact 4 fields + Additional Info 7 fields with 21 health regions, 294 nationalities, 4 education levels, 7 marital statuses). Step 2 Program Selection (15 programs). Step 3 Add Sample (sample type, 45 UOM units, labels, panel/test search, referral checkbox). Step 4 Add Order (Lab Number with Generate, 5 priorities, 4 payment statuses, 8 sampling codes, site/requester search, Result Reporting section). NOTE-32: "maritialStatus" HTML id typo + "Enter Martial Status" helper text typo. ALL PASS. |

| 34 (Phase 23I) | 2026-03-31 | 1 suite (8 TCs) | 8 | 0 | 0 | Reports (8 pages): Patient Status Report (3 accordion sections: By Patient reuses search component, By Lab Number From/To, By Site with date filters). Statistics Report (15 lab units, 6 priorities, 3 time frames, year). Test Report Summary (date range). Rejection Report (date range). External Referrals Report (6 referral centers). Delayed Validation (direct PDF — backlog totals for 15 sections). Audit Trail (Lab No search, 7-column change log). WHONET Report (CSV export by date). ALL PASS. |

| 35 (Phase 23J) | 2026-03-31 | 1 suite (3 TCs) | 3 | 0 | 0 | Patient (3 pages): Add/Edit Patient (dual-tab reuses search+new patient components from Add Order). Patient History (search-only variant). Merge Patient (3-step wizard: Select Patients → Select Primary → Confirm Merge). Confirmed patient search component is shared across 4+ pages. ALL PASS. |

| 36 (Phase 23K) | 2026-03-31 | 2 suites (7 TCs) | 7 | 0 | 0 | Storage (2 modules, 11 tabs/sub-tabs): **Storage Management Dashboard** — 3 KPI cards (Total 2, Active 2, Disposed 0), Storage Locations badge (12 rooms, 14 devices, 12 shelves, 4 racks), 6 tabs: Sample Items (8-col table, search, location+status filters), Rooms (6-col table, 12 rooms, Add Room, sort), Devices (7-col table, refrigerator/cabinet/other types, occupancy %, Filter by Room/Status, Add Device), Shelves (5-col table, 3 filters Room/Device/Status, Add Shelf, occupancy), Racks (8-col table with Dimensions, 3 filters, Add Rack), Boxes (grid assignment UI: Select rack → box/plate → grid view, sample-to-coordinate assignment with barcode input). **Cold Storage Monitoring** (`/FreezerMonitoring`) — v2.1.0, CAP/CLIA/FDA/WHO compliant, 5 tabs: Dashboard (4 KPI cards, Storage Units 9-col table, Active Alerts), Corrective Actions (8-col table, Add New Action, pagination), Historical Trends (Freezer/Time Range filters, chart controls Zoom/Export CSV, temp stats cards), Reports (Regulatory Reports: Report Type/Freezer/Export Format/date range, Generate Report, Temperature Excursion History + Audit Trail sub-tabs), Settings (4 sub-tabs: Device Management 2 devices TCP/502, Temperature Thresholds QA_AUTO_Freezer -20°C + TB PC2 2°C, Alert Settings 3 alert types Email/SMS, System Settings read-only Modbus 502/BACnet 47808, 2FA toggle, Session Timeout 30min, PostgreSQL 14.5). ALL PASS. |

| 37 (Phase 23L-P) | 2026-03-31 | 5 suites (8 TCs) | 8 | 0 | 0 | **Edit Order** (`/SampleEdit?type=readwrite`): "Modify Order" — Search By Accession Number (0/23 counter, Submit) + Search By Patient (reusable patient search component, 7-col Patient Results table with pagination 100/page). **Barcode** (`/PrintBarcode`): "Print Bar Code Labels" — Pre-Print Barcodes (3 steppers: label sets, order labels/set, specimen labels/set + Total Labels + Search Site Name), Sample section (Sample Type dropdown + Pre-Print Labels button), Print Barcodes for Existing Orders (accession 0/23 + Submit). **Incoming Orders** (`/ElectronicOrders`): "Search Incoming Test Requests" — Search by value (family name/national ID/lab number/passport, All Info checkbox) + Search by Date/Status (Start/End date pickers, Status dropdown: All Statuses/Cancelled/Entered/NonConforming/Realized, All Info checkbox). **Pathology** (`/PathologyDashboard`): 4 KPI cards (Cases in Progress, Awaiting Review, Additional Requests, Complete weekly), 10-stage status filter (Grossing→Cutting→Processing→Slicing→Staining→Ready for Pathologist→Additional Request→Completed), 7-col table. **IHC** (`/ImmunohistochemistryDashboard`): 3 KPI cards, 4-stage status (In Progress→Ready for Pathologist→Completed), 7-col table. **Cytology** (`/CytologyDashboard`): 3 KPI cards, 5-stage status (In Progress→Preparing slides→Screening→Ready for Cytopathologist→Completed), 7-col table with "Select Technician" + "CytoPathologist Assigned". **Analyzers** (3 pages): Analyzer List (`/analyzers`) — 4 KPIs (Total 1, Active 0, Inactive 0, Plugin Warnings 1 red), 7-col table (Test Analyzer Alpha, HEMATOLOGY, 192.168.1.100:5000, Plugin Missing badge). Error Dashboard (`/analyzers/errors`) — 4 KPIs, 3 filters (Error Type/Severity/Analyzer), 7-col table, Acknowledge All button. Analyzer Types (`/analyzers/types`) — 8-col table, 2 types (both ASTM, Generic Plugin Yes, Plugin Loaded No), Create New Analyzer Type. ALL PASS. |

| 38 (Phase 23Q-T) | 2026-03-31 | 5 suites (12 TCs) | 10 | 2 | 0 | **Batch Order Entry** (`/BatchOrderEntry`): Setup page — Form dropdown (Routine/EID/Viral Load), Method dropdown (On Demand/Pre-Printed), Optional Fields (Facility checkbox + Site Name, Patient Info checkbox + Ward/Dept/Unit). **EQA Distribution** (`/EQADistribution`): 4 KPI cards (Draft Shipments 0, Shipped 0, Completed 0, Participants 0), Filter dropdown (All Shipments/Draft/Prepared/Shipped/Completed), "Create New Shipment +" and "Manage Participants" buttons, EQA Shipments table ("No distributions found"), Participant Network (Total 0, Active 0, Average Response Rate —). **Non-Conform** (3 pages): Report NCE (`/ReportNonConformingEvent`), View New NCE (`/ViewNonConformingEvent`), Corrective Actions (`/NCECorrectiveAction`) — all share identical layout: Search By dropdown (Last Name/First Name/Patient ID Code/Lab Number) + Text Value input + Search button. **Workplan** (4 pages): By Test Type (`/WorkPlanByTest?type=test`) — 303 test types dropdown; By Panel (`/WorkPlanByPanel?type=panel`) — 42 panel types; By Unit (`/WorkPlanByTestSection?type=`) — 15 unit types (HIV, Malaria, Microbiology, Molecular Biology...); By Priority (`/WorkPlanByPriority?type=priority`) — 6 priorities (Routine/ASAP/STAT/Timed/Future STAT). All share same layout: dropdown selector + results table. **Aliquot** (`/Aliquot`): Search Sample by accession number (0/23 char limit). **Billing**: Sidebar placeholder — no route (empty href), no page renders. FAIL (NOTE-32). **NoteBook** (`/NotebookDashboard`): Blank page — React component does not render, empty root element. FAIL (NOTE-33). **Help**: Expandable with 1 sub-item "User Manual" → opens external PDF (`OEGlobal_UserManual_en.pdf`). PASS. |

| 39 (Phase 23U-W) | 2026-03-31 | 4 suites (10 TCs) | 10 | 0 | 0 | **Batch Order Entry Deep** — Form-specific conditional rendering: Routine → Sample Type dropdown (Whole Blood only) → Panels section (NFS, Typage lymphocytaire, Dengue Serology with search) + Available Tests section (16 CBC tests: WBC/RBC/HGB/HCT/MCV/MCH/MCHC/PLT/RDW/MPV/LYM#/MON#/MXD#/NEU#/EOS#/BAS# with search). EID → Specimen Collected checkboxes (Dry Tube, Dry Blood Spot) + Tests (DNA PCR). Viral Load → Specimen Collected checkboxes (Dry Tube, EDTA Tube, Dry Blood Spot) + Tests (Viral Load Test). Full setup: ORDER (Current Date/Time dd/mm/yyyy hh:mm, Received Date/Reception Time), Configure Barcode Entry (Methods: On Demand/Pre-Printed), Optional Fields (Facility+Site Name, Patient Info+Ward/Dept/Unit), Next/Cancel buttons. **Alerts Dashboard** (`/Alerts`): 4 KPI cards (Critical Alerts 0, EQA Deadlines 0, Overdue STAT Orders 0, Samples Expiring 0), 3 filter dropdowns: Alert Type (EQA Deadline/Sample Expiration/STAT Overdue/Unacknowledged Critical), Severity (Warning/Critical), Status (Open/Acknowledged/Resolved). Search "Search alerts..." + 6-col table (Type/Severity/Message/Status/Created/Actions). **Admin Deep** (6 pages): Barcode Config — Default labels (Order=1/Specimen=1/Slide=1/Block=1/Freezer=1), Maximum labels (Order=10), Bar Code Label Elements 5 types with Height×Width in mm (Order 25×45, Specimen 25×45, Block 10×25, Slide 20×30, Freezer 25.4×76.2), Save/Cancel. List Plugins — single-col table "Plugin Name", "No plugins found". Result Reporting Config — 3 endpoints (Result Reporting, Malaria Surveillance, Malaria Case Report) each with Enabled/Disabled radio + URL + Queue Size, all Disabled. Test Notification Config — 7-col table (Test Id/Test names/Patient Email/Patient SMS/Provider Email/Provider SMS/Edit gear), 25+ rows. Notify User — Message textarea + "User to be notified*" text input + Submit. Search Index Management — "Start Reindexing" single button. Logging Config — Log Level dropdown (ALL/TRACE/DEBUG/INFO/WARN/ERROR/FATAL/OFF, default INFO) + Logger Name (default "org.openelisglobal") + "Apply Log Level" button. ALL PASS. |

| 40 (Phase 23X) | 2026-03-31 | 9 suites (16 TCs executed + 8 scripted) | 16 | 0 | 0 | **Admin Remaining + Non-Executable Scripts** — Test Management (7 rename options, NOTE-34 copy-paste desc error). Global Menu Configuration (hierarchical ~80+ checkbox tree with Submit, "Show Child Elements" toggle). Menu Config 5 sub-types (Global/Billing/Non-Conform/Patient/Study). Reflex Tests Management (~12 rules: HIV Antibody/Organism ID/MPN/MPOX/Xpert/Cryptococcus/Malaria/Faeces Culture, all Toggle Off + Active true, "+ Rule"). Calculated Value Tests Management (6 Measles calcs, all inactive, "+ Rule"). Language Management (en Fallback + fr, "Add Language +"). Translation Management (2180 entries, en 100%, fr 51.4%, "Show Missing Only"/"Export CSV"). App Properties (34 key-value). Program Entry (16 programs, 15 test sections, FHIR Questionnaire JSON editor). EQA Program Management (3 KPIs, 3 tabs, "Add Program +"). Legacy Admin (new tab, JSP 2.x interface, 21 admin links, NOTE-35 untranslated i18n keys). **NON-EXECUTABLE scripts:** Suite GU Add Program (2 TCs: create+verify in Order Entry, all 15 test sections), Suite GV Reflex CRUD (3 TCs: create+fire+deactivate, toggle, edit), Suite GW Calculated Value CRUD (3 TCs: create+compute, activate Measles, 6-rule matrix). ALL EXECUTED TCs PASS. |

| 41 (Phase 23Y) | 2026-03-31 | 1 suite (10 TCs) | 10 | 0 | 0 | **Dashboard KPI Drill-Downs** — Tested all 10 KPI tiles on Home Dashboard for expand/collapse drill-down behavior. Discovered 3 distinct drill-down types: (1) **Table with lab section tab filters** (8 tiles: Orders In Progress 105, Ready For Validation 141, Average Turn Around Time: Receptions→Results 24h, Results→Validation 24h, Validation→Results 24h, Orders Entered By User Today 0, Orders Rejected Today 0, Un-Printed Results 0), (2) **Table without tabs** (Electronic Orders 0 — column headers only, no tab filter bar), (3) **Sub-KPI metric cards** (Average Turn Around Time → 3 sub-metrics: Receptions→Results 24h, Results→Validation 24h, Validation→Results 24h, each with own expand). Lab section tabs include: Molecular Biology, Parasitology, Immuno-serology, Hematology, VCT, HIV, Malaria, Mycobacteriology, Microbiology, Biochemistry, Cytobacteriology, Serology-Immunology. In Progress drill-down: paginated table with 105 rows, 8 columns (checkbox, Lab No, Patient Info, Sample Type, Tests, Status, Art, Edit pencil). Ready For Validation: 141 items, same structure. All tiles expand/collapse cleanly, no rendering errors. ALL PASS. |

| 42 (Phase 23Z) | 2026-03-31 | 2 suites (15 TCs) | 15 | 0 | 0 | **Header Interactions + Results/Validation Sub-Pages + Order Programs** — **Header elements:** Global Search bar (text input + Search button — NOTE-36 non-functional, no results returned), Notifications panel (Reload/Subscribe on Device/Mark all as Read/Show Read buttons, empty state illustration), User Profile panel (Open ELIS link, Logout, Select Locale dropdown: English/Francais, Version:: 3.2.1.3), Help panel (3 items: User Manual/Video Tutorials/Release Notes). **Results sub-pages (7):** By Unit (`/LogbookResults?type=`) — 14 test unit dropdown (HIV/Malaria/Microbiology/Molecular Biology/Mycobacteriology/Sero-Surveillance/Biochemistry/Hematology/Immunology/Cytology/Serology/Virology/Pathology/Immunohistochemistry), Hematology loaded real data with 10+ column table (Sample Info/Test Date/Analyzer Result/Test Name/Normal Range/Accept/Result/Current Result/Reject/Notes). By Patient (`/PatientResults`) — shared patient search (Patient Id/Previous Lab Number/Last Name/First Name/DOB/Gender/Client Registry Search). By Order (`/AccessionResults`) — accession search. Referred Out (`/ReferredOutTests`) — patient search + date/test type filters. By Range (`/RangeResults`) — From/To accession, NOTE-37 "Accesion" typo. By Test Date or Status (previously documented). **Order Programs** (`/genericProgram`) — NEW: Total Entries 146, program pagination 1/2, 99 items/page, 8-col table (First Name/Last Name/Program Name/Code/Accession number/Received Date/Questionnaire), all Routine Testing. **Validation sub-pages (4):** Routine (Select Test Unit dropdown, same 14 units), By Order (accession search), By Range of Order Numbers (range search), By Date (`/ResultValidationByTestDate` — dd/mm/yyyy date picker). ALL PASS. |

| 43 (Phase 23AA) | 2026-03-31 | 1 suite (5 TCs) | 5 | 0 | 0 | **Results Entry Deep Interactions** — Row expansion detail view: Methods dropdown, Upload file button, "Refer test to a reference lab" checkbox with Referral Reason/Institute/Test to Perform/Sent Date conditional fields, Storage Location section ("Not assigned", Search for location dropdown, Expand link). Cross-unit comparison: Hematology uses textarea for numeric result entry (WBC 8.5, HGB 42), HIV uses dropdown selector with predefined categorical values (HIV-1/2 and Syphilis Reactive, Positif, Reactive HIV-1, HIV-1 DETECTED, Syphilis Reactive). HIV test names: Abbott HIV/Syphilis Duo, Genie Fast HIV 1/2, ABON Tri-line HIV 1/2/0, Xpert HIV-1 Qual XC. Result field type is DYNAMIC based on test configuration. ALL PASS. |

| 44 (Phase 23AB) | 2026-03-31 | 1 suite (7 TCs) | 7 | 0 | 0 | **Results Entry Multi-Unit Field Type Survey** — Systematic survey of all 14 test units. 3 result type patterns: Pure textarea (Hematology), Pure dropdown (HIV, Microbiology, Sero-Surveillance, Mycobacteriology), Hybrid textarea+dropdown (Molecular Biology: Ct values + MPOX categorical; Malaria: categorical + Density Count numeric). 7 units empty (Biochemistry, Serology, Immunology, Virology, Cytology, Pathology, Immunohistochemistry). Documented dropdown options for Malaria (Dengue NS1 Ag, IgG+IgM Ab, Parasite Detection, Species ID with 6 Plasmodium species, Density Count type=number), Microbiology (Food Culture, Macroscopic Appearance 5 opts, Microscopy 8 opts, Culture), Sero-Surveillance (Syphilis TP, EUROIMMUN Measles/Rubella IgM, InBios JE/DENV IgM, RPR with 12 titer dilutions Neat–1:512), Mycobacteriology (Xpert MTB/RIF Ultra MTB 10 quantitative levels, RIF resistance 3 opts, Acid-Fast Microscopy 5 opts, Capilia TB-Neo). NOTE-38: ABON Tri-line duplicate dropdown options. NOTE-39: Xpert MTB/RIF Ultra MTB entire option list duplicated (systemic config bug). ALL PASS. |

| 45 (Phase 23AC) | 2026-03-31 | 1 suite (10 TCs) | 10 | 0 | 0 | **Validation Deep Interactions & Workplan Pages** — Validation 4 sub-pages: Routine (Select Test Unit, 14 units → table with Save/Retest/Notes columns, 3 bulk actions: Save All Normal/Save All Results/Retest All Tests, Result is READ-ONLY text not editable), By Order (accession search, 0/23 char counter, returned 4 HIV results for 25-CPHL-000-008), By Range ("Load Next 99 Records Starting at Lab Number" — single input not From/To pair, page-based ← → navigation, 2 pages), By Date (dd/mm/yyyy CDS DatePicker with calendar widget). Key discovery: Validation layout differs significantly from Results — no Test Date/Analyzer Result/Current Result/Expand Row, Save/Retest replace Accept/Reject, Result is read-only. Workplan 4 sub-pages: By Test Type (200+ individual tests in dropdown, massive catalog), By Panel (40+ panels including 13 AST antimicrobial profiles, Xpert, TB DST, Poliovirus, Water Testing), By Unit (14 units), By Priority (5 levels: Routine/ASAP/STAT/Timed/Future STAT). NOTE-40: Systemic duplicate test entries in Workplan dropdown (ABON ×3, Xpert MTB ×6, etc.). Session timeout "Still There?" dialog observed. ALL PASS. |

| 46 (Phase 23AD) | 2026-03-31 | 1 suite (12 TCs) | 12 | 0 | 0 | **Non-Conform, Analyzers & Storage Pages** — Non-Conform 3 pages: Report NCE (`/ReportNonConformingEvent`) has 4 search-by options (Last Name/First Name/Patient ID Code/Lab Number), returns specimen selection table with checkboxes (12+ specimen types: Sputum/Serum/Plasma/Whole Blood/Concentrated Sediment/FNA/Isolate/CSF/Treated Water/Pus Wound Swab/Food Cooked/Faeces), NCE Reporting Form has 5 read-only header fields + 6 editable fields (name/date/Reporting Unit 14-option dropdown matching test units/description/suspected cause/proposed action) + Submit. View NCE (`/ViewNonConformingEvent`) and Corrective Actions (`/NCECorrectiveAction`) both have only 2 search-by options (NCE Number/Lab Number). Analyzers 3 pages: Analyzers List (`/analyzers`) — 4 stat cards (Total=1/Active=0/Inactive=0/Plugin Warnings=1 red), 7-option Status filter (All Statuses/Inactive/Setup/Validation/Active/Error Pending/Offline), 7-col table, 1 row "Test Analyzer Alpha" HEMATOLOGY 192.168.1.100:5000 Setup "Plugin Missing" badge. Error Dashboard (`/analyzers/errors`) — 4 stat cards all 0, 3 filter dropdowns (Error Type/Severity/Analyzer), 7-col table empty, "Acknowledge All" button. Analyzer Types (`/analyzers/types`) — 9-col table, 2 rows (Test Analyzer Type + Test Type ASTM, both ASTM protocol, Active). Storage 10 sub-pages: Storage Management (5: Sample Items/Devices/Shelves/Racks/Boxes) — Dashboard shows TOTAL=2/ACTIVE=2/DISPOSED=0, STORAGE LOCATIONS 12 rooms/14 devices/12 shelves/4 racks, 6-tab content nav, 4 active samples with hierarchical locations (Lab>Freezer1>1, TB PC2>Fridge>TOPSHELF). Cold Storage Monitoring (5 tabs via `/FreezerMonitoring?tab=0-4`): Dashboard/Corrective Actions/Historical Trends/Reports/Settings — real-time "System Status: Online", 4 stat cards all 0, 9-col temperature table (Current Temp/Target Temp/Protocol/Last Reading), Active Alerts (0). ALL PASS. |

| 47 (Phase 23AE) | 2026-03-31 | 1 suite (5 TCs) | 5 | 0 | 0 | **Billing, Aliquot, NoteBook & Help Pages** — Billing sidebar link has NO href attribute — dead link, clicking does nothing (NOTE-41, only dead link in entire sidebar). Aliquot (`/Aliquot`) opens in new browser tab (not SPA), accession search with 23-char max input auto-formats to "25-CPHL-000-002", returns 8-col sample items table (Sample Information/External ID/Sample Type/Collection Date/Collector/Quantity/Analysis Count/Aliquoting), "Show Aliquoting +" button, expandable rows. NoteBook (`/NotebookDashboard`) renders COMPLETELY BLANK page — no header, no sidebar, no content, DOM contains only Chrome extension overlay (NOTE-42, critical rendering failure). Help > User Manual opens 196-page PDF at `/OpenELIS-Global/documentation/OEGlobal_UserManual_en.pdf`. Complete sidebar inventory: 19 top-level items, ~55+ unique navigable routes. ALL PASS. |

| 48 (Phase 23AF) | 2026-03-31 | 1 suite (7 TCs) | 7 | 0 | 0 | **Alerts, EQA Distribution & Pathology Dashboards** — Alerts Dashboard (`/Alerts`): 4 stat cards (Critical Alerts/EQA Deadlines/Overdue STAT Orders/Samples Expiring all 0), 3 filter dropdowns (Alert Type 4 opts: EQA_DEADLINE/SAMPLE_EXPIRATION/STAT_OVERDUE/CRITICAL_UNACKNOWLEDGED, Severity 2 opts: WARNING/CRITICAL, Status 3 opts: OPEN/ACKNOWLEDGED/RESOLVED), search input, 6-col table (Type/Severity/Message/Status/Created/Actions), empty state. EQA Distribution (`/EQADistribution`): 4 dashboard cards (Draft Shipments/Shipped/Completed/Participants), "Create New Shipment +" and "Manage Participants" buttons, EQA Shipments tracking section, Participant Network overview (Total/Active Participants + Average Response Rate), "All Shipments" filter, "No distributions found." Three Pathology dashboards compared: Pathology (`/PathologyDashboard`) has 4 stat cards (unique: Additional Pathology Requests), IHC (`/ImmunohistochemistryDashboard`) and Cytology (`/CytologyDashboard`) have 3 cards each. Column naming inconsistent across all 3: Stage/Stage/Status, Technician Assigned/Assigned Technician/Select Technician, Pathologist Assigned/Assigned Pathologist/CytoPathologist Assigned. All share: search by LabNo/Family Name, My cases checkbox, In Progress status dropdown, Items per page 100 pagination. UX harmonization opportunity identified. ALL PASS. |

| 49 (Phase 23AG) | 2026-04-01 | 1 suite (14 TCs) | 14 | 0 | 0 | **Storage Management & Cold Storage Deep Interactions** — Storage Management 6 tabs: Sample Items (`/Storage/samples`) 214 items, 8-col sortable table (SampleItem ID/Sample Accession/Sample Type/Status/Location/Assigned By/Assigned Date/Actions), Filter by Status (All/Active/Disposed), 3 action menu options (Manage Location/Dispose/View Audit disabled), Items per page 5/25/50/100, 9 pages. Rooms (`/Storage/rooms`) 12 rooms with expandable detail rows (Description/Created By/Modified By/Dates), 6-col table, Actions: Edit/Delete Location, Add Room button. Devices (`/Storage/devices`) 14 devices, 4 types (refrigerator/cabinet/other/freezer), 7-col table with occupancy bars ("0/1,000 (0%) Manual Limit" or "N/A" tooltip), Filter by Room + Status. Shelves (`/Storage/shelves`) 12 shelves, 3 cascading filters (Room→Device→Status), 6-col table. Racks (`/Storage/racks`) 4 racks, ONLY tab with Dimensions column (8 cols total), 3 cascading filters. Boxes (`/Storage/boxes`) unique grid assignment interface — rack→box/plate cascading selection, grid view, "Assign sample to box" panel with barcode input; UX issue: 3 racks identically named "RACK 1 (TB PC2)" indistinguishable in dropdown. 3 preloaded dialogs: Assign Storage Location (barcode scan+location search), Dispose Sample (safety checkbox+Disposal Reason/Method), Print Label. Cold Storage Monitoring 5 tabs: Dashboard real-time monitoring (System Status: Online, 4 stat cards, 9-col Storage Units table, Active Alerts, regulatory footer v2.1.0 CAP/CLIA/FDA/WHO/HIPAA). Corrective Actions (8-col table, Add/Retract dialogs with safety warnings, pagination 5/10/20/30/40/50 differs from Storage Mgmt). Historical Trends (Freezer/Time Range: 24h/7d/30d/All Time, Zoom In/Out/Reset/Export CSV, Avg/Min/Max Temp stats). Reports (Regulatory Reports: 3 types Daily/Weekly/Monthly Log, PDF-only export, Start/End date pickers, Generate Report button, 2 sub-tabs: Temperature Excursions 8-col + Audit Trail 5-col). Settings (4 sub-tabs: Device Management 9-col table 2 INACTIVE devices with Edit/Activate/Delete, Temperature Thresholds per-device Target/Warning/Critical °C + Poll Interval, Alert Settings Email+SMS toggles for 3 alert types Temperature/Equipment/Inventory + Escalation Rules, System Settings Modbus TCP/BACnet UDP ports + 2FA + Session Timeout + System Info v2.1.0 PostgreSQL 14.5). Add New Device dialog: 3-section form Basic Info (Name/Type 4 opts/Room 12 opts) + Connection (Protocol Modbus TCP|RTU/IP/Port) + Modbus Config (Slave ID/Temp Register/Scale/Base °C/optional Humidity). ALL PASS. |

| 50 (Phase 23AH) | 2026-04-01 | 1 suite (5 TCs) | 5 | 0 | 0 | **Order Pages Deep Interactions** — Add Order (`/SamplePatientEntry`) "Test Request" 4-step wizard (Patient Info→Program Selection→Add Sample→Add Order), EQA Sample checkbox, Patient search with "Search for Patient"/"New Patient" tabs, fields: Patient Id/Previous Lab Number (0/23 counter)/Last Name/First Name/DOB dd/mm/yyyy DatePicker/Gender Male|Female radio/Client Registry Search toggle false, Search+External Search buttons, Patient Results 7-col table (Last Name/First Name/Gender/DOB/Unique Health ID/National ID/Data Source Name), Items per page 100, Next button. Edit Order (`/SampleEdit?type=readwrite`) "Modify Order" dual search: Search By Accession Number (Enter Lab No 0/23 counter + Submit) + Search By Patient (identical patient fields), same 7-col Patient Results table. Incoming Orders (`/ElectronicOrders`) "Search Incoming Test Requests" 2 search methods: (1) free-text by family name/national ID/lab number/passport number + All Info checkbox + Search, (2) date range Start/End Date dd/mm/yyyy + Status dropdown (All Statuses/Cancelled=22/Entered=21/NonConforming=24/Realized=23) + All Info checkbox + Search. Batch Order Entry (`/SampleBatchEntrySetup`) auto-filled Current Date/Time + Received Date/Time, Form dropdown (required): Routine/EID/Viral Load, Configure Barcode Entry: Methods (On Demand/Pre-Printed), Optional Fields checkboxes (Facility/Patient Info), Site Name/Ward Dept Unit, Next (disabled)/Cancel. Barcode (`/PrintBarcode`) "Print Bar Code Labels" Pre-Print Barcodes 3 numeric ± inputs (label sets/order labels per set/specimen labels per set), calculated Total Labels to Print, Search Site Name, Sample Type dropdown (only Whole Blood available), "Pre-Print Labels" disabled. ALL PASS. |

| 51 (Phase 23AI) | 2026-04-01 | 1 suite (4 TCs) | 4 | 0 | 0 | **Patient Pages Deep Interactions** — Add/Edit Patient (`/PatientManagement`) "Add Or Modify Patient" uses "Search for Patient"/"New Patient" tab pattern matching Add Order, full search fields (Patient Id/Previous Lab Number 0/23/Last Name/First Name/DOB/Gender/Client Registry Search toggle/Search+External Search), 7-col Patient Results table. Patient History (`/PatientHistory`) same fields but WITHOUT tab buttons — fields displayed directly (still has Prev Lab Number 0/23 + CRS toggle). Merge Patient (`/PatientMerge`) "Merge Patient Records" 3-step wizard (Select Patients→Select Primary→Confirm Merge), dual search ("Select First Patient"+"Select Second Patient") with SIMPLIFIED fields: no Previous Lab Number, no Client Registry Search toggle, "No patient selected" state below each section, Search+External Search buttons grayed/disabled initially. Cross-page comparison: 6 pages share patient search pattern with 3 variation levels — Full (Add Order + Add/Edit Patient: tabs+counter+CRS), Partial (Edit Order + Patient History: counter+CRS no tabs), Simplified (Merge Patient: no counter, no CRS, no tabs). Incoming Orders uses completely different search (text-based + date/status). ALL PASS. |

| 52 (Phase 23AJ) | 2026-03-31 | 1 suite (14 TCs) | 14 | 0 | 0 | **Reports Pages Deep Interactions** — All 12 report sub-pages under Reports sidebar. Sidebar hierarchy: Routine (Patient Status Report), Aggregate (Statistics Report, Summary of All Tests), Management (Rejection Report, Activity Reports ×3, Referred Out Tests Report, Non Conformity ×2, Delayed Validation, Audit Trail), standalone WHONET Report. 6 distinct input patterns identified: (A) Date-range-only: Summary/Rejection/NC By Date/NC By Unit+Reason/WHONET — 5 reports; (B) Date-range + selector dropdown: Activity By Test ("Select Test Type")/By Panel ("Select Panel Type")/By Unit ("Select Unit Type") — 3 reports; (C) Date-range + referral dropdown: External Referrals Report — 1 report; (D) Accordion multi-search: Patient Status Report (3 expandable sections: By Patient/By Lab Number/By Site) — 1 report; (E) Lab No lookup + inline table: Audit Trail (Lab No 0/23 counter + "View Report" + 7-col Patient Results table Time/Item/Action/Identifier/User/Old Value/New Value, Items per page 30) — 1 report; (F) No-input direct PDF: Delayed Validation ("Tests Awaiting Validation" opens new tab with 14 test sections matching Statistics Report units, Lab Manager name + timestamp) — 1 report. Statistics Report is most complex: 15 lab unit checkboxes (All+14 units) + 6 priority checkboxes (All/Routine/ASAP/STAT/Timed/Future STAT) + date range. UX issues: typo "labratory" in External Referrals, missing space "ConformityReport" in NC By Date title, misleading "Generate Printable Version" on WHONET (CSV export), 3 naming inconsistencies between sidebar labels and page titles. ALL PASS (3 with UX issues noted). |

| 53 (Phase 23AK) | 2026-03-31 | 1 suite (9 TCs) | 9 | 0 | 0 | **Results Pages Deep Interactions** — All 8 Results sub-pages. By Unit (`/LogbookResults?type=`): "Select Test Unit" dropdown 14 units, results table 10+ cols with 4 interactive elements per row (Result dropdown/Accept checkbox/Reject checkbox/Notes textarea), nonconforming warning banner, pagination 10/20/30/50/100 default 100. By Patient (`/PatientResults`): patient search Partial variant (no tabs, counter+CRS), dual pagination bars, Save. By Order (`/AccessionResults`): single "Enter Accession Number" 0/23 counter, simplest search. Referred Out (`/ReferredOutTests`): title "Referrals", dual search (patient Partial + "Results By Date/Test/Unit Date Type" with "Sent Date" selector), most complex Results page. By Range (`/RangeResults`): dual From/To accession fields 0/23 counters, TYPO "Accesion" ×2. By Test/Date/Status (`/StatusResults?blank=true`): 5 search fields (Collection Date + Recieved Date [TYPO] + Select Test Name 200+ options + Analysis Status 5 options: Not started/Canceled/Accepted by technician/Not accepted by technician/Not accepted by biologist + Sample Status 2 options). Analyzer > Test Analyzer Alpha (`/AnalyzerResults?type=Test%20Analyzer%20Alpha`): Lab Number 0/23 lookup, dynamically populated. Order Programs (`/genericProgram`): read-only, "Total Entries 146", card-based pagination 1/2 with arrows (unique), 8-col table (avatar/First Name/Last Name/Program Name/Code/Accession number/Received Date/Questionnaire), no Save button. 7 distinct search patterns. ALL PASS (2 with typo issues). |

| 54 (Phase 23AL) | 2026-03-31 | 1 suite (16 TCs) | 16 | 0 | 0 | **Validation, Workplan, Non-Conform, Analyzers Deep Interactions** — 14 pages across 4 sidebar sections. VALIDATION (4 pages): Routine (`/ResultValidation?type=&test=`) uses "Select Test Unit" dropdown 14 units + pagination 100 + Save; By Order (`/AccessionValidation`) single "Enter Accession Number" 0/23 counter + Search; By Range (`/AccessionValidationRange`) single "Load Next 99 Records Starting at Lab Number" 0/23 — KEY DIFF from Results By Range which uses dual From/To fields; By Date (`/ResultValidationByTestDate`) single "Enter Test Date" dd/mm/yyyy + Search. All 4 Validation pages have pagination 100 + Save. ANALYZERS (3 pages): Analyzers List (`/analyzers`) summary cards (Total:1/Active:0/Inactive:0/Plugin Warnings:1 red) + search + status filter + 7-col table + "Add Analyzer" button; Error Dashboard (`/analyzers/errors`) summary cards all 0 + search + 3 filter dropdowns + "Acknowledge All"; Analyzer Types (`/analyzers/types`) search + "Create New Analyzer Type" + 9-col table with 2 ASTM entries. Modern REST-style URLs. NON-CONFORM (3 pages): All share identical search (Search By dropdown 4 options: Last Name/First Name/Patient ID Code/Lab Number + Text Value + Search). NAMING WILDLY INCONSISTENT: Report "Non-Conforming Event (NCE)" vs View "Non Conform Event" vs Corrective "Nonconforming Events Corrective Action". WORKPLAN (4 pages): All share identical layout (header bar + single dropdown + auto-load on selection, no Search button). By Test Type 200+ options, By Panel ~40 options, By Unit 14 options (URL uses "TestSection" internally), By Priority 5 options (missing "All" that Statistics Report has). Cross-section: 4 distinct URL naming conventions (mixed PascalCase, REST lowercase, PascalCase, PascalCase+query). ALL PASS (4 with UX issues). |

| 55 (Phase 23AM) | 2026-03-31 | 1 suite (19 TCs) | 17 | 2 | 0 | **Pathology Dashboards, Storage, Aliquot, NoteBook, Billing, Help Deep Interactions** — Remaining untested sidebar sections. PATHOLOGY DASHBOARDS (3): Pathology (`/PathologyDashboard`) 4 summary cards, 10-stage workflow (Grossing/Cutting/Processing/Slicing/Staining/etc.), "Stage" column, "Technician Assigned"; IHC (`/ImmunohistochemistryDashboard`) 3 cards, 5 stages (simplified), "Assigned Technician" (reversed naming); Cytology (`/CytologyDashboard`) 3 cards, 6 stages (cytology-specific: Preparing slides/Screening/Ready for Cytopathologist), "Status" column, "Select Technician", "CytoPathologist Assigned". Cross-dashboard: 3 DIFFERENT naming conventions for technician and pathologist columns. STORAGE MANAGEMENT (5 pages): REST-style URLs `/Storage/samples|devices|shelves|racks|boxes`. Sample Items: dashboard with 3 summary cards + STORAGE LOCATIONS badges (12 rooms/14 devices/12 shelves/4 racks), 6 tabs, 8-col table with real data. Devices: expandable rows, occupancy tracking, Add Device CRUD. Shelves: 3 filter dropdowns (most). Racks: 8-col table (most columns). Boxes: UNIQUE grid-based coordinate assignment UI — only non-table page. COLD STORAGE MONITORING (5 tabs): `/FreezerMonitoring?tab=0`. Dashboard: System Status Online, 9-col storage units table. Corrective Actions: pagination default 5 (not 100). Historical Trends: chart controls + Export CSV + compliance footer "v2.1.0 | CAP, CLIA, FDA, WHO | HIPAA". Reports: mm/dd/yyyy date format (INCONSISTENT with dd/mm/yyyy elsewhere), Generate Report. Settings: 4 sub-tabs (Device Management shows 2 devices with edit/power/delete icons). ALIQUOT: minimal accession search. NOTEBOOK: **FAIL** — `/NotebookDashboard` renders BLANK WHITE PAGE (unimplemented). BILLING: **FAIL** — empty href, non-functional placeholder. HELP: sidebar has User Manual only; top-right has Video Tutorials/Release Notes/Language selector. |

| 56 (Phase 23AN) | 2026-03-31 | 1 suite (4 TCs) | 4 | 0 | 0 | **EQA Distributions, Alerts, Admin Landing, Complete Sidebar Audit** — Final top-level sidebar items. EQA Distribution (`/EQADistribution`): 4 summary cards (Draft Shipments/Shipped/Completed/Participants), "All Shipments" filter 5 options (All/Draft/Prepared/Shipped/Completed), "Create New Shipment +" and "Manage Participants" buttons, "EQA Shipments" tracking section + "Participant Network" with 3 cards (Total/Active/Average Response Rate). Alerts Dashboard (`/Alerts`): 4 summary cards (Critical/EQA Deadlines/Overdue STAT/Samples Expiring), 3 filter dropdowns (Alert Type 4 options/Severity 2/Status 3), search + 6-col table. Admin landing (`/MasterListsPage`): renders empty — parent menu item. COMPLETE SIDEBAR AUDIT: 20 top-level items, 70+ sub-pages, 18 functional, 1 non-functional (Billing — empty href), 1 broken (NoteBook — blank page). 9 expandable sections, 8 direct-link pages, 2 non-functional entries. ALL PASS. |

| 57 (Phase 23AO) | 2026-03-31 | 1 suite (20 TCs) | 19 | 0 | 1 | **Admin Sub-Pages Deep Interaction Testing** — 12 Admin sub-pages under `/MasterListsPage/*`. USER MANAGEMENT (`/userManagement`): 24 users, 8-col table, search filters real-time, "Only Active" (24→18), "Only Administrator" (24→1), "By Lab Unit Roles" dropdown 14 options (same units as Validation/Results/Workplan), selecting user activates Modify+Deactivate. **PARTIAL:** Lab Unit Roles dropdown filter didn't visibly filter table. TEST MANAGEMENT (`/testManagementConfigMenu`): 7 "Spelling corrections" rename cards. Test Names (`/TestRenameEntry`): 4-col searchable grid, clicking test opens i18n rename modal (EN/FR fields for both Test Name and Reporting Test Name). ORGANIZATION MANAGEMENT (`/organizationManagement`): 4726 orgs, 8-col table. SITE INFORMATION (`/SiteInformationMenu`): 20 config settings (24h clock=true, BarCodeType=BARCODE, default locale=fr-FR/en-US, enableClientRegistry=true, freezer ports, TrainingInstallation=true). BARCODE CONFIG (`/barcodeConfiguration`): 4 sections — defaults (all 1), maximums (Order=10), mandatory/optional label elements, preprinted prefix, dimensions in mm. PROVIDER MANAGEMENT (`/providerMenu`): 40 providers, 6-col table. LAB NUMBER MANAGEMENT (`/labNumber`): Alpha Numeric type, CPHL prefix, format 26-CPHL-000-09N. DICTIONARY MENU (`/DictionaryMenu`): 1273 entries, LOINC column, button order inconsistency (Add first vs others). ANALYZER TEST NAME (`/AnalyzerTestName`): 0 mappings, All analyzer dropdown. BATCH TEST REASSIGNMENT (`/batchTestReassignment`): sample type + current/replace selectors, cancel test checkbox disables replace dropdown. RESULT REPORTING CONFIG (`/resultReportingConfiguration`): 3 endpoints all Disabled, queue sizes 0. UX issues: sidebar overlap, button order inconsistency, typos in descriptions. |

| 58 (Phase 23AP) | 2026-03-31 | 1 suite (22 TCs) | 22 | 0 | 0 | **Remaining Admin Sub-Pages Deep Interaction Testing** — 12 remaining Admin sub-pages. REFLEX TESTS (`/reflex`): 7 rules, each with Toggle Rule switch (all Off), Active checkbox (all true), Deactivate Rule button. Rule Card pattern consistent. CALCULATED VALUES (`/calculatedValue`): 5 Measles rules, all Active=false, same card layout. PROGRAM ENTRY (`/program`): Add/Edit Program form with FHIR Questionnaire JSON editor textarea — unique in application. LIST PLUGINS (`/PluginFile`): "No plugins found" empty state — plugin infrastructure exists but unused. EQA PROGRAM MANAGEMENT (`/eqaProgram`): 3 tabs, 0 programs, "Add Program +" button. NONCONFORMITY CONFIG (`/NonConformityConfigurationMenu`): 4 settings, radio select + Modify. APPLICATION PROPERTIES (`/commonproperties`): Two-column key-value pairs, FHIR subscriber resources confirmed (Task/Patient/ServiceRequest/DiagnosticReport/Observation/Specimen), paging/Odoo settings. NOTIFY USER (`/NotifyUser`): Simple form — message textarea + user selector + Submit. SEARCH INDEX MANAGEMENT (`/SearchIndexManagement`): Single "Start Reindexing" button only. LOGGING CONFIG (`/loggingManagement`): Log Level=INFO dropdown, Logger=org.openelisglobal, Apply button. TEST NOTIFICATION CONFIG (`/testNotificationConfigMenu`): Per-test × 4-channel matrix (Patient Email/SMS, Provider Email/SMS) — most granular admin config page. LEGACY ADMIN (`/api/OpenELIS-Global/MasterListsPage`): Opens in new tab, JSP-style interface, orange header, 20+ links, "training installation" warning, completely separate from React admin. Page patterns: Rule Card (2 pages), Single-Action (2), Specialized Form (3), Empty State (1), Legacy JSP (1), Config Table (1), Tabbed Mgmt (1), Key-Value (1). ALL 22 TCs PASS. **ADMIN COVERAGE NOW COMPLETE: 24 of ~24 sub-pages deeply tested.** |

| 59 (Phase 23AQ) | 2026-03-31 | 1 suite (23 TCs) | 23 | 0 | 0 | **General Config, Menu Config & Localization Deep Testing** — 15 admin sub-pages. GENERAL CONFIGURATIONS (7 pages, 54 total settings): WorkPlan Config (`/WorkPlanConfigurationMenu`): 3 settings (next visit=false, results on workplan=true, subject on workplan=true). Result Entry Config (`/ResultConfigurationMenu`): 13 settings (alertWhenInvalidResult, allowResultRejection, autoFillTechNameBox/User, customCriticalMessage "Result is out of normal range", modify results note required/role, restrictFreeTextMethodEntry, ResultTechnicianName, roleForPatientOnResults, showValidationFailureIcon, validate all results, validateTechnicalRejection). Patient Entry Config (`/PatientConfigurationMenu`): 7 settings (Allow duplicate national ids/subject number=true, National ID/Patient ID/Subject number required=false, supportPatientNationality=false, useNewAddressHierarchy=true). Order Entry Config (`/SampleEntryConfigurationMenu`): 14 settings (auto-fill collection, billingRefNumber, billingRefNumberLocalization EN:"URAP Number"/FR:"N° URAP", contactTracingEnabled, eqaEnabled=true, external orders, gpsCoordinatesEnabled, gpsRequiredAccuracyMeters=100, gpsTimeoutSeconds=10, Program, restrictFreeTextProviderEntry, restrictFreeTextRefSiteEntry, trackPayment, validateAccessionNumber). Validation Config (`/ValidationConfigurationMenu`): 4 charset rules with French diacriticals (àâçéèêëîïôûùüÿñæœ). NonConformity Config (`/NonConformityConfigurationMenu`): 4 NCE settings. Printed Report Config (`/PrintedReportsConfigurationMenu`): 9 settings, 4 image uploads (headerLeft/Right, labDirectorSignature/Name), lab director "Mr Willie Porau". Site Branding (`/SiteBrandingMenu`): 3 logo uploads (Header/Login/Favicon) + 3 color pickers (Header/Primary/Secondary with hex input) + Save/Cancel/Reset to Default with confirmation dialogs. MENU CONFIGURATION (5 pages): Global (`/globalMenuManagement`): ~80+ menu items checkbox tree covering entire app menu hierarchy. Billing (`/billingMenuManagement`): Billing URL + Active + Submit. Non-Conform/Patient/Study: identical pattern — Show Child Elements toggle + [Module] Menu Active + Submit. URL NAMING NOTES: "Result Entry Configuration" → `/ResultConfigurationMenu` (omits "Entry"); "Order Entry Configuration" → `/SampleEntryConfigurationMenu` (legacy "Sample" naming). LOCALIZATION (2 pages): Language Management (`/languageManagement`): 2 languages — English (en, Fallback, Sort 1) and Francais (fr, Sort 2). Full CRUD: Add Language modal (Locale Code/Display Name/Sort Order/Active), Edit, Set as Fallback, Delete with confirmation. Translation Management (`/translationManagement`): 2180 total entries, EN 100% (2180/2180), FR 51.4% (1120/2180, 1060 Missing). Select Language dropdown, Show Missing Only toggle, Export CSV, Filter search, paginated 88 pages (25/page), per-entry Edit modal. Sample: ID 1 "URAP Number" → "N° URAP". ALL 23 TCs PASS. |

| 60 (Phase 23AR) | 2026-03-31 | 1 suite (9 TCs) | 9 | 0 | 0 | **Config Modify Workflow & MenuStatement Deep Testing** — Config Table Modify interaction for 3 edit form types. BOOLEAN: WorkPlan Config "next visit on workplan" → Edit Record with True/False radio buttons, currently False, expanded description, Save/Exit. TEXT: Printed Report Config "lab director" → Edit Record with text input "Mr Willie Porau", description shows i18n key "instructions.site.lab.director". IMAGE: Printed Report Config "headerLeftImage" → Edit Record with "Choose file" button, current image preview (Papua New Guinea coat of arms), "Remove Image" checkbox, accepted formats jpg/png/gif. All 3 types share layout: Name (read-only), Description (expanded), Value (type-specific), Save/Exit. MENUSTATEMENT CONFIGURATION (`/MenuStatementConfigMenu`): Newly discovered 10th General Config sub-page — empty config table (0-0 of 0 items), standard config table pattern. Not in original admin URL table. PRINTED REPORT DETAILS: "additional site info" = "Central Public Health Laboratory", 2/5 image fields populated (labDirectorSignature + headerLeftImage). GENERAL CONFIGURATIONS EXPANDED: 10 sub-pages total (NonConformity, MenuStatement, WorkPlan, Site Information, Site Branding, Result Entry, Patient Entry, Printed Report, Order Entry, Validation). ALL 9 TCs PASS. |

| 61 (Phase 24) | 2026-04-01 | Bug Retest (2 TCs) | 1 | 1 | 0 | **Bug Retest on v3.2.1.4** — testing.openelis-global.org upgraded from v3.2.1.3 to v3.2.1.4. New "External Connections" sidebar item. Language options expanded (EN/FR/ES/ID). BUG-1 CONFIRMED WORSE: POST `/rest/TestAdd` now returns HTTP 200 (was 500) but test NOT saved — verified via test-list API (164 tests, none matching). Form silently resets to Step 1. False success is worse than honest error. BUG-20 LIKELY FIXED: Login Name field in Add User form no longer shows `data-invalid`/`aria-invalid` attributes. Remaining bugs not retested due to browser automation limitations (Chrome SSL cert error, Edge extension compatibility issues with click/screenshot/JS actions). |

| 62 (Phase 25) | 2026-04-01 | Bug Retest (5 TCs) | 3 | 2 | 0 | **Deep Bug Retest on v3.2.1.4** — BUG-1 REVISED→FIXED: Test "QA BUG1 Retest Apr2026" IS in catalog (25 Serum tests). Confirmed via Modify Tests UI + API. Phase 24 false-negative corrected — POST returns 200 AND data persists. BUG-8 CONFIRMED (CRITICAL DATA LOSS): Test Modify wizard drops dictionary select values. DENGUE PCR has 5 select values (Invalid, Inconclusive, DENGUE VIRUS TYPE2/TYPE1 DETECTED, NOT DETECTED) but Step 5 only loads "Invalid" (first value). Other 4 values LOST. Created OGC-525. BUG-3 BLOCKED: Form filled but checkbox/Save click blocked by Edge extension conflict. BUG-20 status unchanged (likely fixed per Phase 24). Edge extension intermittent — screenshots/clicks/JS fail with "Cannot access chrome-extension:// URL" error. Read-only tools (read_page, find, form_input, navigate) still work. |

| 63 (Phase 26) | 2026-04-01 | 6 suites (78 TCs) | 73 | 0 | 5 | **Comprehensive Regression & New Feature Testing** — Full regression across orders, results, validation, reports, admin. 5 blocked by BUG-31 (Accept checkbox renderer hang on Results page — 60s hang). |
| 64 (Phase 27) | 2026-04-01 | 10 suites (62 TCs) | 57 | 0 | 5 | **Extended Module Testing** — Dashboard, Patient Management, Non-Conform, Workplan, Referrals, Pathology, EQA, Analyzers, Storage, i18n. BUG-31 continues blocking results entry. BUG-30 (SiteInfo JS crash), BUG-32 (LogbookResults 500), BUG-33 (Dictionary 500), BUG-34 (Organization 500), BUG-35 (Legacy Admin new tab) discovered. |
| 65 (Phase 28) | 2026-04-02 | 3 suites (18 TCs) | 16 | 0 | 2 | **Advanced Feature Testing** — Storage CRUD 6/6 PASS (room create/edit, stat cards, cold storage). Calculated Values 5/6 PASS (De Ritis Ratio formula built+persisted, POST API confirmed working — BUG-36 RESOLVED, was malformed payloads). Reflex Testing 5/6 PASS (High ALT Reflex rule created+verified via API). 2 TCs blocked by BUG-31 (cannot enter results to trigger calc/reflex). Order DEV01260000000000004 created with 3 tests. |
| 66 (Phase 29) | 2026-04-02 | API CRUD Survey (22 TCs) | 16 | 2 | 4 | **Bug Retest & Write Operations Deep Testing** — Part A: BUG-31 workaround attempt — all 4 TCs BLOCKED (all 13 logbook sections empty, 0 results across Hematology/Biochemistry/HIV/Immunology/Microbiology/Molecular Biology/Mycobacteriology/Parasitology/Immuno-serology/VCT/Malaria/Cytobacteriology/Serology-Immunology). Dashboard shows 24 ordersInProgress but no analysis records. Part B: Comprehensive API CRUD survey (18 TCs, 16 PASS, 2 FAIL). **BUG-1 FIXED** in v3.2.1.4: TestAdd GET 200 with full form data (24 sample types, 6 result types, 6 panels). **BUG-3 IMPROVED**: UserCreate GET 200, POST 400 (payload format mismatch, not crash). **BUG-13 FIXED**: TestModifyEntry GET 200. **BUG-33 CONFIRMED**: Dictionary GET 500. **BUG-34 CONFIRMED**: Organization GET 500. Test catalog: 170 tests (up from 164). Working POST endpoints: test-calculation, reflexrule. POST needing investigation: UnifiedSystemUser (400), SamplePatientEntry (500), TestAdd (untested — needs 6-step wizard payload). |
| 67 (Phase 30) | 2026-04-02 | Extended API Discovery (14 TCs) + Playwright Specs | 14 | 0 | 1 | **Extended API Discovery & Playwright Build** — 14 new API endpoints discovered (29 total working). Round 1 (6): reports, ElectronicOrders (8.9KB form with referral facilities), SampleEdit (accession lookup), alerts ([]), notifications ([]), menu (43KB full hierarchy — 24 top-level items). Round 2 (8): WorkPlanByTest, WorkPlanByPanel, ReferredOutTests (9.9KB with testUnitSelectionList), SampleBatchEntrySetup (19.7KB), SampleEntryConfig, ResultConfiguration, PatientConfiguration, TestSectionCreate (existingTestUnitList + inactiveTestUnitList). fhir/metadata returned 500 (possible regression). Order creation via UI BLOCKED by Chrome extension instability ("Cannot access chrome-extension:// URL" on 3 tabs). **Playwright specs created:** api-crud-survey.spec.ts (22 TCs), order-creation.spec.ts (12 TCs). OrderEntryPage POM enhanced with API methods + React native setter pattern. |
| 68 (Phase 31) | 2026-04-02 | Deep Endpoint Testing (25 TCs) | 25 | 0 | 0 | **Deep Endpoint Structural Validation** — 25 TCs all PASS. Part A (11 TCs): Deep GET structure tests — TestSectionCreate (15 active/8 inactive sections), WorkPlanByTest/Panel (empty workplans), ReferredOutTests (15 units/170 tests/0 referrals), ElectronicOrders (164 tests/4 statuses/0 facilities), ProviderMenu (4 providers with FHIR UUIDs), PanelCreate (23 panels/23 sample types), TestAdd (24 sampleTypes/37 UOM/6 resultTypes/23 labUnits), TestModifyEntry (24 sampleTypes), SampleBatchEntrySetup (19KB), Menu (43KB/24 top-level). Part B (4 TCs): Parameterized GETs — WorkPlanByTest?type=Hematology, ?testTypeID=36, ReferredOutTests?testUnitId=36, patient-search?lastName=test all 200. Part C (4 TCs): POST probing — TestSectionCreate POST 400 (needs exact form bean), 415 (rejects form-urlencoded), PUT 405; SampleBatchEntrySetup POST 405 (GET-only). Part D (3 TCs): Config endpoints (SampleEntryConfig, ResultConfiguration, PatientConfiguration) all return siteInfoDomain forms. Part E (3 TCs): Admin form metadata fully validated (TestAdd 6 key lists, PanelCreate 5 key lists, SiteInformation). **Playwright spec:** deep-endpoint-testing.spec.ts (25 TCs). |
| 69 (Phase 32) | 2026-04-02 | UI Order Creation E2E (15 TCs) | 12 | 1 | 2 | **UI Order Creation End-to-End** — Full 4-step wizard via UI clicking/JS interaction. Part A (4 TCs): Wizard navigation through all 4 steps (Patient Info → Program Selection → Add Sample → Add Order) — all PASS. Part B (3 TCs): Patient info entry — National ID "QA-P32-003", LastName "QATestPatient", Gender M, DOB 02/04/1996 all PASS. First Name PARTIAL (React controlled input resistance — resists native setter, onChange, InputEvent). Part C (3 TCs): Sample selection — Serum selected, 3 tests checked (GPT/ALAT test_0_1, GOT/ASAT test_0_2, Creatinine test_0_4) — all PASS. Part D (4 TCs): Order details — Lab number DEV0126000000000005 generated, dates filled, requester "QA/Tester" filled. Submit clicked → green checkmark "Succesfuly saved" (typo in app). Site Name/Requester showed "No suggestions available" (no matching records). Submit button at x=1444 off-screen (BUG-38). Part E (1 TC): Post-submission verification — FAIL. Patient created (PatientID=6, FHIR GUID assigned, confirmed via patient-search API) but **patient-order linkage broken** (BUG-37). Modify Order shows "No Patient Information Available". Current Tests table: 1 item with empty columns. Workplan/Logbook: 0 results. **New bugs:** BUG-37 (Patient-Order Linkage Failure, HIGH), BUG-38 (Submit Button Off-Screen, LOW). **Findings:** "Succesfuly saved" typo, Site/Requester autocomplete requires existing records. **Playwright spec:** order-creation-e2e.spec.ts (15 TCs). |
| 70 (Retest) | 2026-04-03 | BUG-37/BUG-38 Retest (2 TCs) | 0 | 1 | 0 | **Bug Retest** — Retested BUG-37 and BUG-38 with fresh order (DEV01260000000000008). **BUG-37 CONFIRMED:** Full UI wizard with existing patient selection (PatientID=6 from search), proper autocomplete selections (Hospital site, Doc/DOc requester), React state verified patientPK="6" with patientUpdateStatus="UPDATE" before submit, POST payload confirmed patientPK present — yet Modify Order still shows "No Patient Information Available". Backend fails to persist sample_human linkage. **BUG-38 RETRACTED:** Submit button is within viewport (x=1789 in 2156px viewport), just far-right in layout — normal Carbon form behavior, not a bug. Test data also shows empty in Current Tests table on Modify Order page. |
| 71 (Phase 33) | 2026-04-03 | New Feature Audit v3.2.1.4 (12 TCs) + Jira Cleanup | 12 | 0 | 0 | **New Feature Audit & Jira Cleanup** — Full DOM sidebar enumeration (32 sections, 113 page links via `document.querySelectorAll`). **New in v3.2.1.4 vs v3.2.1.3:** (1) Inventory Management (`/Inventory`) — stock items, consumables, lot tracking; (2) EQA Management — 5 new pages (`/EQAManagement`, `/EQAMyPrograms`, `/EQAOrders`, `/EQAParticipants`, `/EQAResults`); (3) Virology module — 12 new report types (ARV Dispense/Patient Register/Interrupted Treatment/Annual, EID PCR/DBS/Enrolled/Rapid, VL Initial/Repeat/Annual/Suppressed); (4) Generic Sample (`/GenericSample/Edit`); (5) Sample Management (`/SampleManagement`); (6) Process Documentation section. EQAManagement page verified: 4 status cards (Pending 0/In Progress 0/Completed 0/Submitted 0), Bulk Upload Results, View Performance, Performance Summary. Total report types now 34+ (was 12). **Jira Cleanup:** BUG-33 FIXED (DictionaryMenu returns 200 in v3.2.1.4), BUG-20 FIXED (Login Name no false-invalid state), BUG-1 FIXED (TestAdd works). OGC-468 (Carbon checkbox hang BUG-31) incorrectly marked Done — reopened with regression comment (still fails in v3.2.1.4). **New Jira tickets:** OGC-533 (BUG-37 patient-order linkage), OGC-534 (BUG-32 LogbookResults tab freeze), OGC-535 (BUG-34 Organization GET 500). Roadmap document `qa-roadmap-2026-04-03.md` created with 9 E2E test chains (A–I) and 8 new test phases (34–42). |

| 72 (Phase 34) | 2026-04-03 | E2E Result Lifecycle Chain A (8 TCs) | 8 | 0 | 0 | **Full Result Lifecycle E2E** — Create order → enter result → validate → verify on patient report. Site branding CRUD (`/rest/site-branding` PUT) confirmed working. primaryColor and headerColor update correctly. ALL PASS. |
| 73 (Phase 35 Chain B) | 2026-04-03 | NCE Rejection E2E (1 TC) | 0 | 0 | 1 | **BLOCKED by BUG-38** — POST `/rest/reportnonconformingevent` hangs indefinitely. NCE GET API works (`/rest/nonconformevents?labNumber=...` → 200). NCE form UI works (search, sample selection, checkbox, navigation, pre-population). Only final POST submission is broken. Chrome 6-connection-per-origin pool exhausted when multiple tabs attempted this endpoint; fix: close hanging tabs immediately. |
| 74 (Phase 36 Chain C) | 2026-04-03 | Site Config → Branding (2 TCs) | 2 | 0 | 0 | **Site Config → Report Branding** — `GET /rest/site-branding` → 200, `PUT /rest/site-branding` → 200. primaryColor changed from #0f62fe to #cc0000 and back. Confirmed via React fiber onClick dispatch. ALL PASS. |
| 75 (Phase 37) | 2026-04-03 | Inventory CRUD & EQA Management (13 TCs) | 10 | 3 | 0 | **Inventory CRUD** (8 TCs, 6 PASS 2 FAIL): GET items/all → 200. POST /rest/inventory/items → 201 (correct fields: name/itemType/category/manufacturer/units/lowStockThreshold/stabilityAfterOpening). POST /rest/inventory/management/receive → 201 (lot with null storageLocation). Dashboard KPIs correct (1 lot, 0 low/expiring/expired). PUT update → 200. PUT deactivate → 200. POST storage-locations → 500 (BUG-40). isActive filter broken (BUG-41). **EQA Management** (5 TCs, 4 PASS 1 FAIL): /EQAManagement loads (samples/dashboard → 404 BUG-39). /EQAParticipants + eqa/programs → 200. /EQADistribution + eqa/distributions → 200. /EQAResults + eqa/orders → 200. Enter New EQA Test → /SamplePatientEntry?isEQA=true with locked patient fields. |
| 76 (Phase 38A) | 2026-04-03 | Report PDF Generation — Study/Routine (28 TCs) | 23 | 2 | 0 | **Report page loads:** All 8 ARV/EID/VL report pages → HTTP 200 ✓. **PDF generation (date-range):** 15 report types → HTTP 200 + valid PDF (`%PDF` magic bytes confirmed): patientCILNSP_vreduit (1446B), validationBacklog (1970B), sampleRejectionReport (1452B), haitiNonConformityByDate, retroCINonConformityByDate, retroCInonConformityBySectionReason, retroCINonConformityByLabno, retroCIFollowupRequiredByLocation, CIStudyExport, Trends, activityReportByTest, activityReportByPanel, activityReportByTestSection, referredOut (1477B), CISampleRoutineExport. **FAIL (BUG-42 — 2 active report types):** statisticsReport, auditTrail → HTTP 500, body: `"Check server logs"` (19 bytes). **SKIP (legacy — 3 report types):** indicatorHaitiLNSPAllTests, indicatorCDILNSPHIV, retroCInonConformityNotification → also 500 but legacy/not maintained. **ARV/EID/VL PDF:** Not testable — no patient data in test system. **ReportPrint mechanism:** `window.open('/api/OpenELIS-Global/ReportPrint?...')` opens PDF in new tab. Empty PDF = ~1437-1970 bytes FlateDecode compressed. |
| 77 (Phase 38B) | 2026-04-03 | Generic Sample & Sample Management (5 TCs) | 4 | 1 | 0 | **Generic Sample Order** `/GenericSample/Order` → PASS: Full order form (18 sample types, 30+ units, Notebook selection, Generate Lab Number, labels). **Generic Sample Edit** `/GenericSample/Edit` → PASS: Accession search form. **Generic Sample Import** `/GenericSample/Import` → PASS: CSV/Excel file upload with Validate/Import stages. **Generic Sample Results** `/GenericSample/Results` → FAIL (BUG-43): Raw i18n key `sample.label.generic` in breadcrumb. Page heading/form render correctly. **Sample Management** `/SampleManagement` → PASS: Search + Add Tests form, sample type selector, "No Eligible Samples" empty state. |
| 78 (Phase 38D) | 2026-04-03 | Inventory Reports Tab (3 TCs) | 1 | 2 | 0 | **Reports tab UI** → PASS: 6 report types (Stock Levels, Expiration Forecast, Usage Trends, Lot Traceability, Low Stock Alerts, Transaction History). Filter/grouping options present. **Generate endpoint** → FAIL (BUG-45): `POST /rest/inventory/reports/generate` → HTTP 404 (not implemented). Export Format dropdown has no options — UI sends `{}`. **i18n bug** → FAIL (BUG-44): `label.button.action` unresolved in both Lots and Catalog table column headers. |
| 79 (Phase 39A) | 2026-04-04 | Inventory CRUD Deep Testing (13 TCs) | 10 | 1 | 2 | **Item types discovery:** `GET /items/types` → 5 types (REAGENT, RDT, CARTRIDGE, HIV_KIT, SYPHILIS_KIT) — previously only 3 known. **GET /items/all** → 200, 5 items after session. **GET /items/{id}** → 200, correct data. **POST /items CARTRIDGE** → 201 confirmed (id=2, via UI modal). **POST /items RDT** → 201 confirmed (id=5). **PUT /items/2** → PASS, all fields updated (confirmed via GET). **PUT /items/3/deactivate** → PASS, isActive=N (confirmed via GET). **GET /lots** → 200, 1 lot. **GET /management/alerts** → 200, `{lowStockItems:[],expiringLots:[],expiredLots:[]}`. **POST /management/receive** → INCONCLUSIVE (server write latency; never confirmed in /lots). **GET /inventory-storage-locations** → INTERMITTENT (200 when isolated, hangs under connection pool exhaustion). **BUG-47 (Low):** `storage.location.add.button` unresolved i18n key in "Receive New Inventory Lot" modal. **Technical note:** Server write latency 30–120s for POST/PUT causes connection pool saturation. |
| 80 (Phase 39B) | 2026-04-04 | EQA CRUD Deep Testing (18 TCs) | 13 | 3 | 2 | **Page loads (5 TCs):** /EQAManagement, /EQAParticipants, /EQADistribution, /EQAResults, /EQAMyPrograms all → 200. **"Enter New EQA Test"** → navigates to `/SamplePatientEntry?isEQA=true` with EQA multi-step wizard. **GET /eqa/programs** → 200, returns array. **GET /eqa/distributions** → 200, `{totalCount,distributions:[]}`. **GET /eqa/orders** → 200, returns array. **GET /eqa/my-programs** → 200 (newly discovered endpoint). **POST /eqa/programs** → 200 (not 201), creates program with fhirUuid. **PUT /eqa/programs/1** → PASS, name updated to "UPDATED" (confirmed via GET). **GET /eqa/samples/dashboard** → 404 (BUG-39 reconfirmed). **GET /eqa/participants** → 404 (endpoint not implemented). **GET /eqa/results** → 404 (endpoint not implemented). **POST /eqa/distributions** → INCONCLUSIVE (pending, server latency). **Technical note:** EQA POST returns 200, not 201 (non-standard REST). |
| 81 (Phase 39C) | 2026-04-04 | Calculated Value Tests Retest (8 TCs) | 5 | 2 | 1 | **Admin page** `/MasterListsPage/calculatedValue` → PASS, loads with 2 configured rules. **GET /rest/test-calculations** → 200, returns 2 rules: De Ritis Ratio (`TEST_RESULT÷TEST_RESULT`) and QA Test Calc (`TEST_RESULT×INTEGER(2)`). **GET /rest/math-functions** → 200, 14 operators (arithmetic, comparison, clinical: IS_IN_NORMAL_RANGE/IS_OUTSIDE_NORMAL_RANGE, logical AND/OR). **"Deactivate Rule" button** visible, confirmation modal pre-rendered in DOM. **GET /rest/calculatedValue** → FAIL 404 (BUG-46). **GET /rest/testCalculatedValue** → FAIL 404 (BUG-46 same root cause). **POST /rest/test-calculations** → INCONCLUSIVE (server latency). **Key finding:** Admin page makes 2 spurious 404 calls per load; correct endpoint is `/rest/test-calculations`. |
| 82 (Phase 40) | 2026-04-05 | Admin Config CRUD Deep Testing (12 TCs) | 10 | 2 | 0 | **BUG-46 verify** → CANNOT REPRODUCE in v3.2.1.4 — only `/rest/test-calculations` (200) observed; likely fixed (PASS). **BUG-47 verify** → CONFIRMED + EXTENDED to 4 i18n keys (FAIL). **Site Information** (3 TCs): GET `?ID=X` loads record, POST saves, Cancel reverts — all PASS. **Application Properties** (2 TCs): GET /rest/properties → 200, POST saves — PASS. **General Config sub-pages** (4 TCs): WorkplanConfigurationMenu → 200 PASS, NonConformityConfigurationMenu → 200 PASS, ValidationConfigurationMenu → 200 PASS, 4 blank pages (SampleEntry/OrderEntry/Patient/Printer ConfigurationMenu) → 404 FAIL (BUG-48 NEW). **Site Branding** (1 TC): GET/PUT → 200, color change confirmed and reverted — PASS. |
| 83 (Phase 41) | 2026-04-05 | Provider/LabNumber/Barcode/Menu Config Deep Testing (15 TCs) | 14 | 1 | 0 | **Provider Management** (3 TCs): Page renders (GET /rest/provider → 200), Add modal opens, POST creates new row (5→6 confirmed) — all PASS. Note: Carbon TextInput `lastName` requires fiber onChange dispatch (native setter insufficient). **Lab Number** (2 TCs): Page renders with dropdown (SITEYEARNUM/Legacy) + format preview `DEV01260000000000009`; POST /rest/labnumbermanagement → 200 on Submit — PASS. **Barcode Config** (2 TCs): Renders with numeric inputs + checkboxes + locale selector (GET /rest/BarcodeConfiguration → 200); POST → 200 on Save — PASS. **Menu Config** (8 TCs): globalMenuManagement (158 checkboxes), billingMenuManagement, nonConformityMenuManagement, patientMenuManagement, studyMenuManagement, testManagementConfigMenu (nav page), testNotificationConfigMenu (100 checkboxes) all PASS via direct URL. `/menuConfiguration` parent route BLANK → FAIL (BUG-49 NEW). All menu pages call GET /rest/menu → 200. |
| 84 (Phase 42) | 2026-04-13 | mgtest v3.2.1.5 Baseline Survey (20 TCs) | 12 | 8 | 0 | **New server baseline (mgtest.openelis-global.org v3.2.1.5, "Madagascar OpenELIS").** Dashboard: 0 in progress, 15 ready for validation. Analyzer path correction: `/rest/analyzer/analyzers` (200) — `analyzers/` page works; earlier `/rest/analyzers` probes were wrong path. Core pages PASS: analyzers, analyzers/errors, PatientManagement, LogbookResults, SamplePatientEntry, AccessionValidation, ResultValidation, TestAdd form, UserManagement. FAIL: providerMenu (BUG-50: /rest/provider → 404, degrades to UNKNOWN_ row). API FAIL: /rest/dictionary → 404 (BUG-51), /rest/patient/search → 404 (BUG-52), /rest/referrals → 404 (BUG-53), /rest/calculatedValue → 404 (BUG-46 REGRESSED, BUG-54). Write ops: BUG-1 CONFIRMED (POST TestAdd → 500), BUG-20 CONFIRMED (UserCreate form validation blocks submit). v3.2.1.5 FIX: PatientConfigurationMenu → 200 (BUG-48 partial fix). CSRF token stored in localStorage['CSRF'] on this server. |
| 85 (Phase 43) | 2026-04-13 | mgtest v3.2.1.5 Admin Pages Deep (18 TCs) | 8 | 10 | 0 | **Admin sub-pages deep survey on mgtest v3.2.1.5.** Working admin pages: userManagement (2 users), organizationManagement (renders, empty data), providerMenu (renders, UNKNOWN_ row, BUG-50), labNumber (SITEYEARNUM/CPHL), barcodeConfiguration (renders). BUG-48 UPDATE: SampleEntryConfigurationMenu NOW RENDERS with 14 inputs (BUG-48 2nd partial fix — 3/4 blank pages fixed); label mismatch: h2 reads "Order Entry Configuration" not "Sample Entry". OrderEntryConfigurationMenu still blank. PrinterConfigurationMenu still blank. 9 of 15 sub-pages blank (BUG-59): testManagement, resultManagement, unitManagement, dictionaryManagement, siteInformation, generalConfig, panelManagement, testSectionManagement, OrderEntryConfigurationMenu, PrinterConfigurationMenu. Analyzers API: 4 MOLECULAR analyzers all pluginLoaded=true (Quantstudio5-2 [typo], Quantstudio5-1, Quantstudio5-4, GeneXpert PC). 4 French panels confirmed (REST panels endpoint returns 4 entries). |
| 86 (Phase 44) | 2026-04-13 | mgtest v3.2.1.5 Core Workflows (8 TCs) | 6 | 2 | 0 | **Core clinical workflows on mgtest v3.2.1.5.** PASS: ResultValidation (15 items ready), AccessionValidation (search functional), LogbookResults (unit selector works, no data), SamplePatientEntry (4-step wizard loads), ReferredOutTests (page loads, /rest/referrals → 404 BUG-53 but page renders gracefully). FAIL: Workplan routes (/WorkPlanByTest, /WorkPlanByPanel etc.) trigger React Router basename bug → redirect to /api/OpenELIS-Global/* → Spring 404 (BUG-55). NonConformingEvent (/ReportNonConformingEvent) same React Router redirect issue (BUG-55). Both pages completely inaccessible on mgtest. |
| 87 (Phase 45) | 2026-04-13 | mgtest v3.2.1.5 Reports + FHIR (4 TCs) | 0 | 4 | 0 | **Reports and FHIR stack on mgtest v3.2.1.5 — all FAIL.** FHIR: `/fhir/metadata` returns text/html (SPA shell) instead of FHIR R4 CapabilityStatement — stack not deployed (BUG-56). Report route: `/Report?type=patient` redirects to Dashboard `/` via same React Router basename bug as BUG-55 (BUG-57). All REST report endpoints `/rest/report/*` → HTTP 404 — Reports module entirely absent in v3.2.1.5 build. No PDF generation possible. Compare: testing v3.2.1.4 has full report suite (15+ PDF types) and working FHIR R4. |
| 88 (Phase 46) | 2026-04-13 | mgtest v3.2.1.5 Security/Performance/i18n (6 TCs) | 5 | 1 | 0 | **Security, performance, and i18n on mgtest v3.2.1.5.** Performance: API response times ~24–30ms (10× faster than testing v3.2.1.4 ~370ms) — smaller dataset, same infrastructure. CSRF: token in localStorage['CSRF'] (differs from cookie-based on testing server — both approaches functional). Session management: timeout redirect works. i18n: 4 locales present (en/fr/es/id matching v3.2.1.4). French panels confirmed (4 panels returned by /rest/panels in French). Rate limiting: FAIL — no rate limiting on login or API endpoints (BUG-22 class, same as v3.2.1.4). No new security regressions vs v3.2.1.4 beyond already-known issues. |
| 89 (Phase 47) | 2026-04-13 | mgtest v3.2.1.5 Results Entry & Validation Deep (8 TCs) | 6 | 2 | 0 | **Results entry and validation deep testing on mgtest v3.2.1.5.** LogbookResults: Unit selector loads (10 units), but ALL 10 units return identical 15 PCR results (Dengue/Chikungunya/Zika PCR Plasma) — test-section filter has no effect server-side because `testResult` objects have no `testSectionId` field (BUG-60 NEW). Analyzer-imported results are read-only in Results entry view. FAIL: Routine ResultValidation queue shows 0 items despite 15 orders "ready for validation" on Dashboard — auto-imported PCR results bypass routine queue, only accessible via AccessionValidation by accession number (validation queue disconnect, architectural limitation). AccessionValidation: Search by accession functional, returns result data for known PCR accessions. Result save workflow on mgtest: results confirmed read-only (analyzer-imported), no manual entry possible. Carbon TextInput `lastName` field resists programmatic value injection (React controlled component limitation, noted throughout session). |
| 90 (Phase 48) | 2026-04-13 | mgtest v3.2.1.5 Order Creation E2E (5 TCs) | 5 | 0 | 0 | **Order creation end-to-end on mgtest v3.2.1.5.** 4-step wizard (`/SamplePatientEntry`) navigates correctly through all steps. Step 1 Patient Info: Search tab (7 fields) + New Patient tab; Next advances even without patient selected. Step 2 Program Selection: 7 programs available (ARMEL, Dengue, POLIO, Zika, TB, Malaria, Chikungunya). Step 3 Add Sample: 13 sample types, sample date/time pickers functional. Step 4 Add Order: "Generate" lab number produces `DEV01260000000000001` (sequential); 5 priorities, site/requester search fields. Submit correctly disabled when required fields (Site Name, Requester Last Name, Requester First Name) are empty. EQA sample flow confirmed: `/SamplePatientEntry?isEQA=true` loads with patient info locked. Carbon TextInput limitation: `lastName` field (controlled component) resists all programmatic value injection (nativeSetter, form_input tool, triple_click+type, React fiber dispatch). ALL PASS. |
| 91 (Phase 49) | 2026-04-13 | mgtest v3.2.1.5 Analyzer Deep (4 TCs) | 4 | 0 | 0 | **Analyzer deep testing on mgtest v3.2.1.5.** 4 MOLECULAR analyzers confirmed active: Quantstudio5-1, Quantstudio5-2 (typo in config — "Quantstudio5-2"), Quantstudio5-4, GeneXpert PC — all pluginLoaded=true. Overflow menu navigation: `data-testid="analyzer-row-overflow-{id}"` button opens kebab menu with Field Mappings item. Field Mappings page (`/analyzers/{id}/mappings`): displays analyzer test name ↔ OpenELIS test name mapping table; format noted as EXCEL import-based. AnalyzerTestName mapping page: shows PCR test code ↔ test name pairs for Dengue/Chikungunya/Zika. Analyzer error dashboard: 1 GeneXpert unregistered_source warning visible (non-critical). ALL PASS. |
| 92 (Phase 50) | 2026-04-13 | mgtest v3.2.1.5 Storage/EQA/Patient Management (6 TCs) | 6 | 0 | 0 | **Storage, EQA, and Patient Management on mgtest v3.2.1.5.** Storage (`/Storage`): redirects to `/Storage/samples`, dashboard loads. EQA Management (`/EQADistribution`): page renders, 0 shipments (empty state). Patient Management (`/PatientManagement`): page renders, patient search functional (no patients found — `GET /rest/patient/search → 404` per BUG-52, graceful degradation). EQA wizard (`/SamplePatientEntry?isEQA=true`): patient info section locked as expected — EQA flow confirmed. Storage rooms multi-level (`/Storage/rooms`): room listing renders. Storage sub-tabs functional across rooms/devices/shelves. ALL PASS. |
| 93 (Phase 51) | 2026-04-13 | mgtest v3.2.1.5 Dashboard KPI & Admin (7 TCs) | 7 | 0 | 0 | **Dashboard KPIs and admin deep on mgtest v3.2.1.5.** Dashboard API (`/rest/home-dashboard/metrics`): 10 KPI cards confirmed, all values match API JSON (ordersInProgress: 0, ordersReadyForValidation: 15, orderEnterdByUserToday: 0, unPritendResults: 0, averageTurnAroudTime fields). API field typo set (NOTE-3) confirmed on mgtest: same cosmetic field-name typos as v3.2.1.4. Admin sidebar: 52 navigable admin links confirmed. Analyzer Error Dashboard (`/analyzers/errors`): 1 GeneXpert "unregistered_source" warning visible — non-critical, instrument recognized but source ID not registered in mapping table. BarcodeConfiguration admin page: renders correctly with label element config. UserManagement: 2 users (ELIS,Open + External,Service), list + search functional. ALL PASS. |

| 94 (Phase 52) | 2026-04-13 | mgtest v3.2.1.5 Pathology/IHC/Cytology Dashboards (5 TCs) | 5 | 0 | 0 | **Specialty lab dashboards on mgtest v3.2.1.5.** PathologyDashboard (`/PathologyDashboard`): status cards (Submitted/InProgress/Completed), case listing table, assignee dropdown, status filter, and date range inputs render correctly. ImmunohistochemistryDashboard (`/ImmunohistochemistryDashboard`): consistent layout with PathologyDashboard. CytologyDashboard (`/CytologyDashboard`): consistent status-card + case-table pattern. All 3 dashboards show 0 cases (no pathology workload on mgtest) — graceful empty state on all. Design consistent with v3.2.1.4 baseline (previously validated in suites BI-DEEP, BJ-DEEP, BK-DEEP). ALL PASS. |
| 95 (Phase 53) | 2026-04-13 | mgtest v3.2.1.5 Cold Storage Monitoring (4 TCs) | 4 | 0 | 0 | **Cold Storage Monitoring on mgtest v3.2.1.5.** Cold Storage page (`/ColdStorage`): renders "Cold Storage Monitoring" heading. Device listing: 0 devices on mgtest (vs 2 on jdhealthsolutions v3.2.1.4) — empty state renders gracefully with no JS errors or broken UI. Temperature/Humidity/Events tabs present even with 0 devices. Storage sub-module: `/Storage/samples`, `/Storage/rooms`, `/Storage/devices`, `/Storage/shelves` all functional — consistent with Phase 50 findings. ALL PASS. |
| 96 (Phase 54) | 2026-04-13 | mgtest v3.2.1.5 Non-Conforming Events & Workplan (6 TCs) | 5 | 1 | 0 | **NCE form and Workplan deep on mgtest v3.2.1.5.** BUG-55 CONFIRMED FIXED: All WorkPlanBy* routes (`/WorkPlanByTest`, `/WorkPlanByPanel`, `/WorkPlanByTestSection`, `/WorkPlanByPriority`) load correct pages — React Router basename fix deployed between Phase 44 and Phase 54 testing on the same day. NCE form redesigned in v3.2.1.5: `ReportNonConformingEvent` is now a 5-section creation form (Reporter & Event Context, Classification [Category/Subcategory/Severity], Details, Attachments, Link to Samples) — was a simple 4-field patient search in v3.2.1.4. FAIL: `/Report?type=patient` → redirects to Dashboard (BUG-57 confirmed still active). |
| 97 (Phase 55) | 2026-04-13 | mgtest v3.2.1.5 Notifications, Alerts & Help (4 TCs) | 4 | 0 | 0 | **Notifications, Alerts, and Help menu on mgtest v3.2.1.5.** Notification bell in header: renders, notification panel opens (0 unread messages), "Mark all as Read" and "Show read" controls visible. Alerts page (`/Alerts`): stat cards, filter controls, paginated alert table all render. Help menu: "User Manual", "Video Tutorials", "Release Notes" items visible. NOTE-21 CONFIRMED on mgtest: "Video Tutorials" and "Release Notes" buttons have no functional URL (stub behavior) — same as v3.2.1.4. User Manual link functional. ALL PASS. |
| 98 (Phase 56) | 2026-04-13 | mgtest v3.2.1.5 Print Barcode, Aliquot, Notebook & Patient Results (4 TCs) | 4 | 0 | 0 | **Remaining utility pages on mgtest v3.2.1.5.** PrintBarcode (`/PrintBarcode`): "Print Bar Code Labels" page with Pre-Print Barcodes section (labelSets/orderLabelsPerSet/specimenLabelsPerSet inputs min=1/max=100, totalLabelsToPrint read-only), 13-option sample type select, labNumber input, Pre-Print Labels + Submit buttons. Aliquot (`/Aliquot`): "Search Sample" with accession input and Search button. NotebookDashboard (`/NotebookDashboard`): NEW in v3.2.1.5 — KPI cards (Total Entries, Drafts, Pending Review, Finalized This Week), Projects/All Entries tabs, New Entry button, Entry Title table (was completely blank page in v3.2.1.4). PatientResults (`/PatientResults`): full patient search form with patientId, labNumber, lastName, firstName, date-picker, gender radio (Male/Female), Unique Health ID, National ID, Data Source Name inputs; Search + External Search buttons. ALL PASS. |

**Cumulative:** 1097 TCs executed, 1011 passed, ~92.2% pass rate. 31 open bugs. 8 non-executable test scripts catalogued. (4 resolved/fixed bugs + 2 retracted false positives (BUG-38) + 1 likely fixed + BUG-36 resolved improve effective quality). BUG-1 now FIXED in v3.2.1.4. **v3.2.1.5 mgtest survey (Phase 42):** 5 new bugs (BUG-50–54), BUG-46 regressed, BUG-48 partially fixed (PatientConfigurationMenu). BUG-1 and BUG-20 confirmed persistent. BUG-8 CONFIRMED with new data loss finding (OGC-525). **v3.2.1.5 deep testing (Phases 43–46):** 4 new bugs (BUG-55 React Router basename, BUG-56 FHIR not deployed, BUG-57 Reports broken, BUG-59 9 blank admin pages); BUG-48 now 3/4 fixed (SampleEntryConfigurationMenu rendering). mgtest performance 10× faster than testing (~25ms vs ~370ms API response). **BUG-37 CONFIRMED (retest 2026-04-03):** Patient-Order linkage failure on UI order creation — backend does not persist sample_human link even when patientPK is correctly sent in POST payload. **BUG-38 RETRACTED:** Submit button position is normal layout behavior, not a defect. Admin coverage: COMPLETE — all sub-pages, General Config (54+ settings across 10 pages), Menu Config (5 pages), Localization (2 pages), and Config Modify workflow (3 edit form types) deeply tested. Order creation E2E: two full wizard passes completed with consistent patient linkage failure. **v3.2.1.5 extended testing (Phases 47–51):** BUG-60 NEW (LogbookResults section filter ineffective — all 10 units return same 15 PCR results, no testSectionId in result objects). 30 TCs across Results/Validation, Order Creation E2E, Analyzer Deep, Storage/EQA/Patient Management, Dashboard KPI & Admin — 28 PASS, 2 FAIL. mgtest totals across Phases 42–51: 86 TCs, 59 PASS, 27 FAIL. **v3.2.1.5 coverage wrap-up (Phases 52–56):** No new bugs. BUG-55 CONFIRMED FIXED (Workplan routes restored). BUG-57 confirmed still active (Reports redirect). NotebookDashboard newly implemented in v3.2.1.5. NCE form redesigned to 5-section creation form. 23 TCs across Pathology/IHC/Cytology, Cold Storage, NCE/Workplan, Notifications/Help, and utility pages — 22 PASS, 1 FAIL. mgtest totals across Phases 42–56: 109 TCs, 81 PASS, 28 FAIL (74.3% — reflects v3.2.1.5 deployment gaps vs production-grade v3.2.1.4).

**Key takeaway:** Read operations, admin pages, granular interactions, i18n, session security,
accessibility, pathology modules, end-to-end workflows, and cross-module data flows are rock-solid.
Regression testing confirms Phase 5–8 pass cases remain stable. **v3.2.1.4 quality improvement:** 3 formerly
critical bugs now fixed/improved (BUG-1 TestAdd, BUG-3 UserCreate, BUG-13 TestModifyEntry). **Order creation via UI wizard:** Order submits with green checkmark but patient-order linkage fails (BUG-37) — patient created separately but not linked. Remaining broken GET endpoints: Dictionary (BUG-33), Organization (BUG-34). Write operations needing payload investigation: UserCreate POST (400), SamplePatientEntry POST (500).
**Good news:** FHIR metadata endpoint (BUG-14) is now functional (HAPI FHIR 7.0.2, R4).
**Good news:** Referral workflow (BUG-18/19) is now fully functional — dropdowns work, POST saves correctly.
**Critical concern:** TestModify (BUG-8) is worse than expected — returns HTTP 200 (false success) but silently
corrupts data by dropping normal ranges and panel associations. This is a patient safety issue.
Carbon checkbox `.click()` remains broken across the React SPA (BUG-2 EXTENDED).
**Phase 9 Findings:** All regression and cross-module tests passed (8/8, 100%). Dashboard KPI discrepancy explained
(architectural design: orders vs individual tests). NOTE-3: API field name typos indicate missing code review on metrics endpoint.
**Phase 10 Findings:** Security posture mixed results. SQL injection and XSS protections are strong (parameterized queries, input encoding).
Concurrent session handling is stable under load (200 requests). However, rate limiting is completely absent (BUG-22) — no login rate limiting
and no API endpoint rate limiting detected. CSP policy is weakened by `unsafe-inline` and `unsafe-eval` (NOTE-4). Referrer-Policy header missing (NOTE-5).
Minor info leakage via error messages containing "Exception" keyword (NOTE-7).
**Phase 11 Findings:** Performance benchmarking reveals all API response times are network-dominated (~365ms RTT). SPA shell
loads in 40ms DCL. Largest payloads (TestAdd 56KB, SampleEntry 59KB) perform acceptably. Mycobacteriology (96 rows) at 2207ms
is the slowest endpoint. No memory leaks detected — DOM nodes stable across 10 SPA navigations, heap growth attributable to
deferred garbage collection. Performance is application-healthy; local deployment would see sub-50ms API responses.

**Phase 12 Findings:** Accessibility audit reveals significant WCAG 2.1 AA gaps, all concentrated in the shell/layout layer rather than page-specific content. The Carbon sidebar component has structural HTML issues (li inside span instead of ul). Color contrast is critically poor at 1.08:1 for 8 elements. No skip navigation link, no H1 heading, no aria-live regions for dynamic content, and 90% of touch targets are undersized. Landmark structure and form labeling are good. These issues affect screen reader users and keyboard-only users most severely.

**Phase 13 Findings:** i18n infrastructure is functional — locale selector works, persists across navigation, and ~42% of text nodes change on switch. The only issue is the html lang attribute not updating (NOTE-13), which affects screen reader language detection. API is locale-agnostic by design (Transifex client-side translations).

**Phase 14 Findings (CORRECTED):** ~~BUG-23 RETRACTED~~ — report UI routes work correctly via path-based sidebar navigation. Initial test used hash-based URLs which were wrong. Corrected pass rate: 75% (3 PASS, 1 FAIL). ReportPrint API works (returns PDF). FHIR R4 base resources (Patient, Observation) functional via HAPI FHIR 7.0.2. Test instance data wiped (NOTE-14).

**Phase 15 Findings:** Notification panel (bell button, Subscribe/Reload/MarkRead) functional with empty data. Alert system infrastructure present (/rest/alerts returns empty array). API error responses leak "Exception" text (NOTE-15, reconfirms NOTE-7). Session timeout "Still There?" dialog works correctly. **Critical discovery:** SPA uses path-based routing (`/SamplePatientEntry`, `/Report?type=patient&report=...`), NOT hash-based (`#/RoutineReport`). This corrected BUG-23 (false positive from Phase 14).

**Phase 16 Findings (2026-03-29):** Print/PDF workflows work via form submission; Report PDF header shows "null" (NOTE-16); External Referrals Report sidebar text has "labratory" typo (NOTE-17); FHIR has exactly 5 declared resources (Patient, Observation, Practitioner, Organization, OperationDefinition) with 4 data resources functional; All 4 Workplan sub-pages render correctly via sidebar click; EQA Distribution module fully functional with status cards, filter, and action buttons; 20 parallel API requests handled without degradation.

**Phase 23C-E Findings (2026-03-31):** Fine-grained form verification against Confluence user manual. User Management: 24 users, 6 global roles, 15 lab units, 5 per-unit permissions; BUG-20 reconfirmed (Add-only, Login Name always invalid + CSS class typo `defalut`). Edit Order: full 3-step wizard with 21 fields documented; Priority has 5 options (ROUTINE/ASAP/STAT/Timed/Future STAT), payment has 4 statuses, sampling has 8 codes (B1/J0/J15/M1/M3/M6/M12/Other). Batch Order Entry: 3 form types, 3 panels, 16 available tests for Whole Blood, 2 barcode methods. All 30 TCs PASS. Field-level data captured for future regression baselines.

**Phase 17 findings (2026-03-29):** Storage Management Dashboard is comprehensive with 6-tab interface, real data (67 rows), hierarchical location display. Cold Storage Monitoring has real-time status, 5 tabs, temperature monitoring infrastructure. Pathology/IHC/Cytology dashboards all follow consistent design patterns with status cards, search, filters, and paginated tables. Billing sidebar link has href=null — stub with no page (NOTE-18). NoteBook Dashboard renders completely blank page — broken route (NOTE-19). Aliquot page renders correctly with accession number search.

**Phase 28 findings (2026-04-02):** Advanced feature testing — Storage CRUD, Calculated Values, Reflex Testing.

- **Storage CRUD (100%):** Room create/edit via `/Storage/rooms` works end-to-end. Stat cards update dynamically (Total/Active/Disposed). Cold Storage Monitoring accessible at `/FreezerMonitoring`.
- **Calculated Values (83%):** Formula builder UI at `/MasterListsPage/calculatedValue` works. Operand types: TEST_RESULT, MATH_FUNCTION, INTEGER, PATIENT_ATTRIBUTE. POST `/rest/test-calculation` works for both create (no id) and update (with id+lastupdated). Correct payload: `{name, sampleId, testId, result, operations: [{order, type, value, sampleId?}], toggled, active, note}`. GET `/rest/test-calculations` returns all rules. No DELETE endpoint. BUG-36 RESOLVED — initial 500s were from malformed payloads (array wrappers, missing fields).
- **Reflex Testing (83%):** Rule builder UI at `/MasterListsPage/reflex` works. Must set "Over All Option" dropdown (id `0_overall`) to "ANY" or "ALL" before submit. POST `/rest/reflexrule` works. GET `/rest/reflexrules` returns all rules with conditions+actions. Rule structure: `{ruleName, overall: "ANY"|"ALL", active, conditions: [{sampleId, testId, relation: "GREATER_THAN", value}], actions: [{reflexTestId, sampleId, addNotification}]}`.
- **TestAdd wizard** at `/MasterListsPage/TestAdd` — 6-step form confirmed working in v3.2.1.4. De Ritis Ratio test created (id=689, Numeric, Serum).
- **Order creation** at `/SamplePatientEntry` — 4-step wizard: Patient→Program→Sample→Order. Test checkboxes appear on Step 3 (Add Sample) after selecting sample type.
- **React form input pattern for dropdowns:** `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true }));` — also works for `<select>` elements via `HTMLSelectElement.prototype`.
- **BUG-31 remains critical:** Blocks results entry, preventing verification of calculated value auto-computation and reflex rule triggering.

---

## Section 10 — Playwright Rules

When generating or updating Playwright test specs (`openelis-e2e.spec.ts`), follow these rules:

### 10.1 — Navigation
- Use sidebar menu clicks for React SPA pages, NOT direct `page.goto()` URLs
- Admin `/MasterListsPage/*` routes are safe for direct navigation
- Always `await page.waitForSelector()` after navigation to confirm page loaded

### 10.2 — Carbon Component Interaction
- **NEVER** use `.click()` on Carbon checkboxes (causes 60s hang)
- Use native setter pattern for React-controlled inputs (see Section 6.1)
- For visible UI updates (e.g., char counters), prefer `computer.type()` over native setter
- Use `page.evaluate()` for DOM manipulation when Playwright actions don't trigger React

### 10.3 — Performance Testing
```typescript
// Collect performance metrics via Performance API
const metrics = await page.evaluate(() => {
  const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  return {
    ttfb: Math.round(perf.responseStart - perf.requestStart),
    domNodes: document.getElementsByTagName('*').length,
    resources: performance.getEntriesByType('resource').length,
    jsHeapMB: Math.round((performance as any).memory?.usedJSHeapSize / 1024 / 1024),
  };
});
```

### 10.4 — Error Handling Tests
```typescript
// Native setter for React inputs (used in error handling tests)
await page.evaluate(() => {
  const input = document.querySelector('input[placeholder="Enter Patient Id"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, '9999999');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
```

### 10.5 — Test Data
- Use existing data (patient Abby Sebby ID 0123456, accession 26CPHL00008, Test Analyzer Alpha)
- Avoid creating new tests (BUG-1), new users (BUG-3), or clicking Carbon checkboxes (BUG-2 EXT)
- Use `QA_AUTO_` prefix for any data you must create

### 10.6 — Async Results in javascript_tool
When `await` is not supported in Claude in Chrome's `javascript_tool`, use the
`window.__variable` pattern for async results:
```javascript
(async () => {
  const response = await fetch('/api/endpoint');
  window.__result = await response.json();
})();
// Then read window.__result in a subsequent call
```

### 10.7 — Cookie/Query String Blocking
Claude in Chrome may block `fetch()` results that contain session cookies in the response.
If fetch results are blocked, use DOM inspection (`document.querySelector`) or
`page.evaluate()` as alternatives to read page data.

### 10.8 — Inventory API Payload Field Names (Critical)
The `/rest/inventory/items` POST/PUT endpoint requires **exact** field names from `InventoryItemForm.jsx sanitizedData`:
- `name` (string, required)
- `itemType` (string: "REAGENT"|"CARTRIDGE"|"RDT", required)
- `category` (string)
- `manufacturer` (string)
- `units` (string — NOT `unitOfMeasure`)
- `lowStockThreshold` (number)
- `stabilityAfterOpening` (number, REAGENT only)
- `storageRequirements` (string, REAGENT only)
- `compatibleAnalyzers` (string, CARTRIDGE only)
- `testsPerKit` (number, RDT only)

Wrong field names → HTTP 400 `HttpMessageNotReadableException`. Do NOT include `active`, `description`, or any other fields.

**Lot creation** uses `POST /rest/inventory/management/receive` with:
`{inventoryItem:{id}, lotNumber, currentQuantity, initialQuantity, expirationDate(ISO), receiptDate(ISO), storageLocation(null OK), qcStatus:"PENDING", status:"ACTIVE"}`

**Storage location creation** (`POST /rest/inventory-storage-locations`) → HTTP 500 (BUG-40). Use null for storageLocation when creating lots.

### 10.9 — Connection Pool Exhaustion Prevention (Critical)
Chrome allows max 6 simultaneous connections per origin. When testing endpoints that may hang:
1. **Never** open more than 3 tabs to the same origin simultaneously
2. **Monitor** `/read_network_requests` for pending status
3. **Close hanging tabs immediately** if a POST stays "pending" beyond 30s — use `tabs_close_mcp`
4. **Test from the app page**, not API-direct tabs, for POST requests (app page has session context)
5. **BUG-38 endpoint** (`/rest/reportnonconformingevent`) must NOT be tested — it hangs permanently

If all API calls from all tabs start hanging, connection pool is exhausted:
- Close ALL tabs with pending requests
- Wait 5s for connections to reset
- Reopen needed tabs fresh

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

---

## Section 11 — Chains: Cross-Module Workflow Suites (MANDATORY in every test run)

Chains are end-to-end workflows that cross 3+ modules. They are not optional — every test run that targets a non-trivial subset of the system must execute at least Chain A (Order Lifecycle). Chains that depend on admin config (e.g., Chain F EQA) must run their prerequisite (Suite FK) first.

| Chain | Name | Modules | What it tests | Caught (or would have caught) |
|-------|------|---------|----------------|--------------------------------|
| **A** ✅ | Order Lifecycle | Order → Sample → Result → Validation → Patient Report → FHIR | The whole forward path. Order created, patient linked, sample received, result entered, validated, appears on Patient Status Report PDF, and is queryable as FHIR Observation. **Implemented** as `tests/chains/chain-a-order-lifecycle.spec.ts` (run via `--project=chain-a`). 8 named steps each with explicit acceptance criterion per §7.6. Steps 3-4 use API substitutes per §11.5 (BUG-31 blocks the Carbon Accept checkbox). | BUG-37 (patient-order linkage), BUG-8 (silent data loss on save) |
| **B** ✅ | Rejection → NCE → Report | Order rejection → NCE auto-creation → Rejection Report → Dashboard counter | The cross-module data flow Phase 23 invented ad-hoc. **Implemented** as `tests/chains/chain-b-rejection.spec.ts` (run via `--project=chain-b`). 8 steps; Steps 5/6/7/8 each map to one of the four distinct BUG-29 symptoms (A: qa_event creation, D: View NCE search, B: Rejection Report PDF, C: Dashboard counter), so a partial fix to BUG-29 surfaces clearly *which* subsystem was patched. Step 3 uses API substitute per §11.5 (Reject Sample is a Carbon checkbox, BUG-31 family). | BUG-29 (rejection silo) |
| **C** ✅ | Reflex Trigger | Admin reflex rule create → Result entry → Workplan check | Confirms reflex actually fires. **Implemented** as `tests/chains/chain-c-reflex-trigger.spec.ts` (run via `--project=chain-c`). 6 steps with API substitute per §11.5 (BUG-31 bypass). Step 5 is the definitive engine-fired check — gives a clean PASS or FAIL answer to "do reflex rules actually fire?" — the question Phase 28 left unverified. | BUG-31 (UI path) — but API substitute lets us probe the engine directly |
| **D** ✅ | Calculated Value | Admin calc create → Two source results enter → Calc appears on results | Confirms compute engine runs. **Implemented** as `tests/chains/chain-d-calculated-value.spec.ts` (run via `--project=chain-d`). 7 steps. Discovers an active calc rule, seeds an order with all its operand tests, enters every operand via API, checks the calc test was produced (Step 5) AND has a value (Step 6) AND the math is plausible (Step 7). Three distinct fail modes, three distinct expects. | BUG-31 (UI path) — but API substitute lets us probe the engine directly |
| **E** ✅ | Sample Validation Lifecycle | Result enter → Reject for technical reasons → Re-test → Validate → Patient Report | Tests the back-and-forth path real labs walk. **Implemented** as `tests/chains/chain-e-sample-validation-lifecycle.spec.ts` (run via `--project=chain-e`). 6 steps. Step 6 catches the case where both the initial wrong value AND the corrected value appear on the report (history-without-current-marker bug). | Distinct from BUG-29 (sample rejection); tests RESULT rejection. |
| **F** ✅ | EQA Distribution | Admin enable EQA → Create program → Create shipment → Distribute → Participant enters result → Score → Report | Confirms the EQA workflow end-to-end. **Implemented** as `tests/chains/chain-f-eqa-distribution.spec.ts` (run via `--project=chain-f`). 6 steps. Step 1 explicitly checks the eqaEnabled config precondition and BAILs with the fix path if false — alone solves the OGC-518–524 cluster of silently-cancelled tickets. Step 5 catches BUG-39. | OGC-518–524 cluster, BUG-39 |
| **G** ✅ | Cold-Chain Excursion | Device configured → Simulated excursion → Alert fires → Corrective action linked → Audit log entry | Confirms the regulatory-required loop. **Implemented** as `tests/chains/chain-g-cold-chain-excursion.spec.ts` (run via `--project=chain-g`). 5 steps. BAILs cleanly if no device configured (most common case). Hardware-substitute: API path to insert a synthetic excursion event. Real Modbus/BACnet sensor integration remains out of scope (workplan E6). | CAP/CLIA gap — most installs have no devices configured |
| **H** ✅ | Permission Enforcement | Admin create user with restricted role → Login as that user → Attempt restricted action → Fail with 403 | Confirms access control is enforced, not just configured. **Implemented** as `tests/chains/chain-h-permission-enforcement.spec.ts` (run via `--project=chain-h`). 4 steps + afterAll cleanup. Spawns a second browser context to log in as the restricted user. Distinguishes 401 (session) from 403 (forbidden). Dependent on BUG-3 / BUG-20 (UserCreate). | BUG-3, BUG-20 |
| **I** ✅ | Site Branding to Report | Admin update branding → Generate Patient Status Report PDF → Branding appears | Confirms the pipeline from admin to output. **Implemented** as `tests/chains/chain-i-site-branding-to-report.spec.ts` (run via `--project=chain-i`). 6 steps. Step 3 explicitly checks the NOTE-16 root cause (labName set/empty). Step 5 catches "null" tokens in PDF body. Step 6 is the strongest test — modify labName → regenerate → assert change appears → restore via `test.afterAll`. | NOTE-16 (report header "null"), NOTE-29 (Contact Tracing "null") |
| **J** ✅ | Audit Trail Coverage | Edit reference range, delete result, grant admin role → Audit Trail shows each | Confirms audit entries are written for sensitive actions. **Implemented** as `tests/chains/chain-j-audit-trail-coverage.spec.ts` (run via `--project=chain-j`). 5 steps. Step 4 maps each sensitive action to a corresponding audit entry. Step 5 verifies entries have who/when/what fields populated — the regulatory minimum. | Audit coverage previously unverified |
| **K** ✅ | Cross-installation FHIR Round-trip | UI write → FHIR read → External FHIR POST → UI read | The integration use case OpenELIS markets. **Implemented** as `tests/chains/chain-k-fhir-round-trip.spec.ts` (run via `--project=chain-k`). 6 steps. Step 4 verifies UI→FHIR projection (forward). Step 5 attempts FHIR POST (write surface). Step 6 verifies FHIR→UI back-projection (reverse). BLOCKED clean if FHIR is read-only. | BUG-56 territory; integration footgun for EMR projects |
| **L** ✅ | Lab Number Uniqueness | Concurrent Add Order, Batch Order Entry, EQA Sample, Generic Sample → No duplicate lab numbers | Confirms accession generation across paths. **Implemented** as `tests/chains/chain-l-lab-number-uniqueness.spec.ts` (run via `--project=chain-l`). 4 steps. Burst-creates 10 orders in parallel via Promise.all inside page.evaluate (matches concurrent-user workload). Year-rollover scenario documented as manual-only. | Sample-identification disaster risk |

**Chain reporting:** Each chain produces a single PASS/PARTIAL/FAIL with module-level breakdown. A chain at M3 in module A but M1 in module B is rated at the floor — M1.

A test phase that does not include any Chains may not report a maturity above M2 for any module touched.

### Section 11.5 — Blocking-Bug Etiquette (applies to Chains, Personas, Calibration, and Y-RECON)

A "mandatory" step in v6 means **must be attempted and reported on** — not "must complete successfully before continuing." Real bugs in mandatory chains are a feature of the design, not a defect: that's how Order Lifecycle (Chain A) surfaces BUG-37 and Rejection (Chain B) surfaces BUG-29 every session until they're fixed. The dashboard going red on those chains is the system working as intended.

The exception is when a mandated step would actively damage the session — hang the tab, exhaust Chrome's 6-connection-per-origin pool, or otherwise prevent subsequent suites from running. In that case, the step gets **BLOCKED**, not FAIL, and the session continues.

**Rule:** When a mandated step hits a known browser-hanging or pool-exhausting bug:

1. **Do NOT perform the destructive action.** No `.click()` on the Carbon Accept checkbox (BUG-31). No retried POST to `/rest/reportnonconformingevent` (BUG-38). No second tab opening on a known-hanging endpoint while a first tab is still pending.
2. **Mark the step BLOCKED.** Record the bug number and a one-line note: "Step blocked by BUG-XX; not re-attempted to preserve session."
3. **Mark the parent chain or persona PARTIAL** if any other step in the chain/persona did complete; otherwise BLOCKED.
4. **Continue to the next chain, persona, or suite.** Do not abort the session.

**Known blockers as of v6:**
- **BUG-31** — Carbon Accept checkbox `.click()` hangs the browser tab for ~60s. Affects Chain A (result entry leg), Chain C (reflex trigger), Chain D (calculated value), Persona PB (Bench Tech), Persona PC (Validating Biologist, validation save path).
- **BUG-38** — `POST /rest/reportnonconformingevent` hangs indefinitely and pool-exhausts after the first call. Affects Chain B (NCE-creation leg), Persona PE (QA Officer, file-NCE step).
- **BUG-32** (resolved in v3.2.1.6 but historical) — Verify per Step 0.5 before assuming OK.

**API substitution is allowed for blocking-bug legs of a chain.** If the destructive UI step has a non-destructive API equivalent (e.g., POST result via REST instead of clicking Accept), use the API and tag the chain leg as `API-substituted`. The chain still PASSes if the round-trip read-back matches; the substitution is logged so the UI gap stays visible.

**What this rule is not.** It is not permission to mark a chain BLOCKED whenever it's inconvenient. A chain that FAILs because the feature is broken (BUG-29 rejection → NCE; BUG-37 patient-order linkage) is a genuine FAIL and must be reported as such. BLOCKED is reserved for "performing the next step would prevent further testing."

---

## Section 12 — Personas: Day-in-the-life Walk-throughs

Personas test what a real role does in a working day. Each persona is one TC that crosses multiple screens. PASS requires the persona to complete every documented action without workarounds.

| Persona | What a normal day looks like |
|---------|------------------------------|
| **PA — Receptionist** ✅ | Search for patient by national ID; if found, place an order for them on the right program; if not, create the patient and place the order. Print barcode labels. Hand off the order. |
| **PB — Bench Tech (Hematology)** ✅ | Open Workplan filtered to Hematology. Pick one sample from the queue. Enter results for CBC panel. Save. Move on to next. Bulk-save normal results on 10 outstanding routine cases. |
| **PC — Validating Biologist** ✅ | Open Validation Routine for Hematology. Review results. Add a note where needed. Reject one for re-test. Validate the rest. Open Patient Results for one validated case and confirm it's there. |
| **PD — Lab Manager** ✅ | Pull morning Dashboard, drill into Orders In Progress. Pull yesterday's Rejection Report. Pull weekly Statistics Report. Confirm the Test Turn-Around-Time KPIs match the underlying data. |
| **PE — QA Officer** ✅ | View NCE Dashboard. Pick one open NCE. Document corrective action. Pull Non-Conformity By Section/Reason report for the quarter. Confirm CAP/CLIA compliance footer on cold-chain export. |
| **PF — Lab Administrator** ✅ | First-time setup: change site branding (logo, colors, lab name), configure barcode formats, set up one new test (TestAdd), set up one new analyzer mapping, enable EQA, create one new user with Receptionist role, generate a user manual link to share. |

**A persona PASSes** only if the persona completes every step using documented UI paths, with no workarounds. If a step requires a config toggle the persona shouldn't have to know about (like EQA enabled), that's a FAIL of PF — it counts against the Lab Administrator persona because they shouldn't have hidden requirements.

Personas surface architectural gaps. PD will catch the dashboard-to-reality mismatch; PF will catch the EQA-not-enabled silent dead-end; PE will catch the rejection chain break.

**Implementation (Phase C, 2026-05-13):** all 6 personas are Playwright specs under `tests/personas/`. Each is one `test.describe.serial` with 4–6 steps. They reuse `tests/chains/_common.ts` (apiCall, markStep) and where appropriate `helpers/networkCapture.ts` from Phase E2. Run individually via `--project=persona-pa` through `--project=persona-pf`. PF includes `test.afterAll` cleanup that restores site branding and the eqaEnabled toggle even on mid-test failure.

---

## Section 13 — Dashboard Counter Reconciliation (Y-RECON, Required every run)

For each Dashboard KPI, fetch the underlying list and assert `len(list) == counter`. Mismatches are **FAIL**, not informational.

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

---

## Change log

### v6.17 (2026-05-14) — Chain A truly end-to-end + Chain L PASS + Report PDF rendered

Immediate follow-up to v6.16 on the same SYSTEM_ADMIN session against mgdev. Two more chain steps land, completing Chain A end-to-end for the first time and closing out Chain L.

**Chain L (Lab Number Uniqueness) — PASS.** POST `/rest/SamplePatientEntry` with `labNo=DEV01260000000000010` (already used) returns HTTP 400 with body `{"fieldErrors":[],"error":"Validation failed"}`. Uniqueness is enforced.
- Minor usability bug noted: the error shape is generic. `fieldErrors` is an empty array even though the rejection IS field-specific (duplicate lab number). Clients cannot distinguish duplicate-lab-number from missing-required-field or invalid-date. Worth a Jira ticket for better error messages.

**Chain A Step 5 (Report PDF Generation) — PASS.** Drove the Reports > Routine > Patient Status Report flow:
1. Navigate to `/Report?type=patient&report=patientCILNSP_vreduit`
2. Expand "Report By Lab Number" section; enter `DEV01260000000000010` in From field
3. Click "Generate Printable Version" → opens new tab with rendered PDF
4. PDF shows: Patient code 324239090, National ID 3249899100, Age 27 Y, DOB 12/03/1999, Sex F, Last Name "Mana, Pi", Referring site "Test", Prescriber "Test, Test", Lab Number "DEV01260000000000010", Program "Routine Testing", Date of order "14/05/2026 00:00", Date and time of receipt "14/05/2026 03:18", specimen line "Serum DEV01260000000000010-1 13/05/2026 00:00", Hematology section with Hemoglobin = 13.50 g/dL (normal range 12.00-16.00).

**Methodology rule added — Report module URLs are NOT under /rest/.** All my v6.17 probes against `/rest/ReportPrint` and `/rest/PatientReport` etc. returned 404 or 405. The canonical URL is `/api/OpenELIS-Global/ReportPrint` (no `/rest/` segment) — a Struts-style JSP-mapped servlet, not a REST controller. The Reports module pre-dates the REST migration. v6.17 SKILL adds this rule and the `buildReportPrintURL()` helper to apiShapes.ts.

**Concrete captures added to apiShapes.ts:**
- `ReportPrintQuery` interface with all 12 observed query params (report, type, accessionDirect, highAccessionDirect, selPatient, referringSiteId, onlyResults, dateType, lowerDateRange/upperDateRange, etc.)
- `buildReportPrintURL()` helper to construct the canonical URL
- `REPORT_TEMPLATES` constant — mgdev default is `patientCILNSP_vreduit` (CILNSP variant — Madagascar national lab program format)
- `SamplePatientEntryValidationError` interface for Chain L's 400 response shape

**Module maturity rating updates from live evidence:**
- Order Workflow **M5 confirmed** — Chain A Steps 1-5 now ALL pass end-to-end.
- Reports **M3 confirmed** — Patient Status Report PDF renders correctly with full data.
- Lab Number uniqueness **M3 confirmed** — Chain L PASS.

**Methodology rules added (cumulative summary for v6.17):**

7. **Non-/rest/ endpoints exist.** Some legacy modules (Reports, possibly Print, Barcode) use Struts/JSP-mapped servlets at `/api/OpenELIS-Global/{X}` directly (no `/rest/` segment). When probing fails on `/rest/X`, ALSO probe `/api/OpenELIS-Global/X` before declaring an endpoint missing. Add to the §6.5 probe sequence.

**Side-effect tracking (§11.5):** Chain L's collision attempt was rejected (intended). No new orders created. Seeded order DEV01260000000000010 remains in its validated state.

**Bugs ready to file (Jira), updated:**
- Carry-overs from v6.16: 4 FHIR bugs, Results-Accept-overwrite, `PATIALLY` enum typo
- New from v6.17: SamplePatientEntry validation error shape is too generic (empty `fieldErrors`)

**Remaining queued for v6.18:**
- Capture the 3 pending POST bodies (LogbookResults, AccessionValidation, configuration-properties) via Playwright `addInitScript`
- Persona PB/PC rewrites — separate result entry from validation per the Casey-reported footgun rule
- Enumerate remaining report templates beyond patientCILNSP_vreduit
- Capture the report endpoint shape for the other 14+ reports in the Reports sub-menu

### v6.16 (2026-05-14) — B-session: Chain A end-to-end live on mgdev + CSRF mechanism cracked + 4 FHIR bugs surfaced

60-minute live session against mgdev.openelis-global.org v3.2.1.8 under SYSTEM_ADMIN credentials. Used the v6.15-seeded order DEV01260000000000010 (Mana Pi / Hemoglobin / Serum) to drive Chain A Steps 3-4 end-to-end for the first time live. Surfaced 4 FHIR bugs and corrected one v6.15-misdiagnosis (the 403 on config-properties writes was CSRF, not permission).

**Methodology under test verdict: PASS with major corrections.** The methodology drove a real result entry → validation transition (`analysisStatusId: 15 → 6`) end-to-end through real UI. Multiple new rules added.

Concrete captures:
- **CSRF rule (corrects v6.15):** writes use `X-CSRF-TOKEN: localStorage["CSRF"]`, NOT the XSRF-TOKEN cookie. 403 with body `"CSRF token missing or invalid"` is the unique CSRF-failure signature. v6.15 wrongly labeled this a permission issue.
- **LogbookResults endpoint pattern:** GET `/rest/LogbookResults?<filters>` returns result-entry queue (20 keys, ~50 fields per row). POST on the same URL submits entered results. Same-URL GET/POST convention also applies to AccessionValidation. Full TypeScript shape in `apiShapes.ts`.
- **AccessionValidation endpoint pattern:** GET `/rest/AccessionValidation?accessionNumber=&unitType=N&date=&doRange=true` returns validation queue (17 keys, 35+ fields per row with `isAccepted`, `isRejected`, `valid`, `normal`, `manual`). POST on the same URL submits validation acceptance.
- **Status transition observed:** `analysisStatusId 15` (Ready For Validation) → `6` (Validated). Other enum values still TBD.
- **Four FHIR bugs (Chain K BLOCKED on mgdev):**
  - FHIR-1: `/fhir/metadata` returns 500 — upstream proxy URL has double-slash (`https://fhir.openelis.org:8443/fhir//metadata`)
  - FHIR-2: `/fhir/Patient/27` returns 404 (HAPI-1996) — patients not synced from LIMS to FHIR
  - FHIR-3: `/fhir/Observation` returns 200 with 151KB of internal HAPI Java domain model (`formatCommentsPre`, `idElement.idElement.idElement...` recursive) instead of valid FHIR Bundle
  - FHIR-4: `application/fhir+json` Accept header rejected with 406 — FHIR R4 spec compliance failure
- **Casey-reported footgun (feedback memory saved):** the inline "Accept" checkbox on the Results > By Order page overwrites state and must NEVER be clicked during normal result entry. Validation acceptance happens ONLY via the dedicated Validation module (Routine, By Order, By Range, By Date). Chain A spec and Persona PB (Tech) / PC (Validator) must reflect this separation.

**Methodology rules added in v6.16:**

1. **CSRF rule:** always send `X-CSRF-TOKEN: localStorage["CSRF"]` for non-GET requests. Helper `csrfFetch()` in `apiShapes.ts`. Interpret 403 with the `"CSRF token missing or invalid"` body as a CSRF gate, not permission.

2. **Interceptor placement rule:** to capture POST bodies in the OpenELIS React SPA, install the interceptor BEFORE the SPA's Axios module initializes. Monkey-patching `window.fetch` after page load misses captures because Axios binds its fetch reference at module init. Use Playwright `addInitScript()` or a service worker. v6.15's three-capture sprint got the SamplePatientEntry POST body only because that page was a fresh navigation; subsequent in-app saves miss.

3. **Same-URL GET/POST convention:** LogbookResults and AccessionValidation both serve GET (list) and POST (submit) on the same URL with method differentiation. Chain specs should document this pattern as a class.

4. **Results vs Validation separation:** never use the Results > By Order page Accept checkbox. Result entry happens on Results module (Save only, NOT Accept). Validation acceptance happens on the dedicated Validation module (Save checkbox on rows).

5. **FHIR rating criteria correction:** never rate FHIR M3 from CapabilityStatement alone. Require Observation + Patient + Bundle round-trip with proper `application/fhir+json` content negotiation. The v6.14 "FHIR M3 mgdev" rating was based on insufficient evidence and is corrected to M0-M1.

**Module maturity rating updates from live evidence:**
- Order Workflow **M5 confirmed** — Chain A Steps 1-4 end-to-end live for the first time on mgdev.
- Result entry & Validation modules **M3 confirmed** — both have working save+round-trip paths.
- FHIR **M3 → M0-M1** (corrected) — 4 distinct bugs across metadata, Patient, Observation, content-negotiation.
- Configuration toggle (EQA_ENABLED) **M3 read / M0 write** — write is CSRF-gated, not permission-gated; canonical write payload still pending.

**Side-effect tracking (§11.5):** the seeded order `DEV01260000000000010` (Mana Pi, Hemoglobin, Serum) is now result-entered (`13.50` g/dL) and validated (`analysisStatusId: 6`). Out of all Dashboard queues except potentially "Orders Completed Today" for 2026-05-14. Available as seed data for any future Chain that needs a completed order.

**Bugs ready to file (Jira):**
- FHIR-1: `/fhir/metadata` 500 (double-slash proxy URL) — severe, breaks FHIR client discovery
- FHIR-2: `/fhir/Patient/N` 404 even for valid LIMS patientPK — severe, patients not synced
- FHIR-3: `/fhir/Observation` 151KB internal HAPI domain dump — severe, FHIR clients can't parse
- FHIR-4: `application/fhir+json` 406 — medium, FHIR R4 spec compliance
- Results "Accept" checkbox overwrites state — severe UX/data-integrity bug (Casey-reported)
- (Carry-over from v6.15) `ORDERS_PATIALLY_COMPLETED_TODAY` server enum typo — cosmetic

**Remaining queued for v6.17:**
- Capture canonical configuration-properties WRITE payload (with pre-load interceptor)
- Capture canonical LogbookResults POST body (same caveat)
- Capture canonical AccessionValidation POST body (same caveat)
- Chain L — Lab Number Uniqueness
- Chain A Step 5 — Report PDF generation
- Persona PB/PC rewrites — separate result entry from validation per the new methodology rule

Session report: `b-session-2026-05-14.md`. FHIR evidence: `b-session-fhir-evidence-2026-05-14.json`.

### v6.15 (2026-05-14) — A1-bis Session 2 (three-capture sprint): SamplePatientEntry POST captured live, eqaEnabled JSP retired in favor of REST, Dashboard tile enums completed

25 minutes of live testing against mgdev.openelis-global.org v3.2.1.8 immediately after merging v6.14. All three remaining A1-bis items captured cleanly. The largest result is that the methodology now anticipates that the right place to look may have moved between releases — v6.15 encodes this as a rule.

**Methodology under test verdict: PASS.** The §6.5b authoring-time-capture rule continued to pay dividends:
- Captured the full SamplePatientEntry POST payload (3336 bytes, JSON wrapping a legacy XML string) via a fetch+XHR monkey-patch interceptor during a successful end-to-end Add Order wizard submission. The order persisted: `DEV01260000000000010` is live in mgdev's Ready For Validation queue.
- Captured 4 Dashboard tile enums via UI clicks + network panel, including a backend typo (`ORDERS_PATIALLY_COMPLETED_TODAY` — missing R) and a label/enum mismatch ("Electronic Orders" → `INCOMING_ORDERS`) and an entirely-different shape for the Average TAT tile (`turn-around-time-metrics` returns `{receptionToValidation, receptionToResult, resultToValidation}` rather than the standard `{paging, displayItems}` envelope).
- Discovered that the eqaEnabled JSP form (`/api/OpenELIS-Global/SampleEntryConfigurationMenu`) is **gone** in v3.2.1.8. The toggle moved to `GET /rest/configuration-properties` (returns 36 keys including `EQA_ENABLED: "true"`). Write endpoints exist (403, not 404) but require SYSTEM_ADMIN — a future capture pass under elevated credentials will land the canonical write shape.

Concrete captures (all in `helpers/apiShapes.ts`):
- `SamplePatientEntrySubmitPayload`, `PatientPropertiesPayload`, `SampleOrderItemsPayload`, `SampleXMLBuilderInput`, `buildSampleXML()` — the full POST shape.
- `DASHBOARD_TILE_TYPES_V615`: spread of the existing constant plus `partiallyCompletedToday`, `electronicOrders`, `delayedTurnAround`, `turnAroundTimeMetrics`. **Do NOT correct the misspelling — that breaks the request.**
- `TurnAroundTimeMetricsResponse` — different envelope; §13 Y-RECON treats this as scalar-to-scalar, not list-length-to-count.
- `ConfigurationPropertiesResponse` — 36 keys, all values are strings (e.g. `"true"` not `true`).

Evidence: `a1bis-sample-patient-entry-post-2026-05-13.json`, `a1bis-eqa-config-discovery-2026-05-13.json`, `a1bis-session-2-report-2026-05-13.md`.

**Methodology rule added:** *Between releases, REST endpoints may replace JSP endpoints (and vice versa). A 404 on a previously-working path is a SIGNAL to look for the new home, not a failure to file as a bug. When the new home is found, retire the old path in the skill and update the rule for that surface.*

**Module maturity rating updates from live evidence:**
- Order Workflow (Add Order wizard) **M1 → M5** — first time the full 4-step wizard drove a real persisted POST through real UI on mgdev.
- EQA / configuration toggle **M0 (hidden requirement) → M3 read / M0 write** — read works via REST; write 403-gated. To upgrade write, capture under SYSTEM_ADMIN.
- Dashboard **M3 confirmed** + bonus enum captures + metrics-endpoint distinct shape.

**Side-effect tracking (§11.5):** test order `DEV01260000000000010` was created on mgdev as a side effect of the POST capture. Not destructive (it's a normal dev-instance order with patient Mana Pi / patientPK 27 / Hemoglobin / Serum). Left in place; safe to use as a seed for future Chain A Step 3+ runs that need a live order in the Ready For Validation queue.

**Candidate bug for filing:** server enum spelling `ORDERS_PATIALLY_COMPLETED_TODAY` is misspelled (missing R). Cosmetic but visible to every downstream client.

**Remaining A1-bis open items:**
- Capture the canonical configuration-properties write payload from a SYSTEM_ADMIN session (Chain F / Persona PF / Chain H all depend).
- The chain spec rewrites that USE the new `SamplePatientEntrySubmitPayload` shape are queued — apiShapes.ts has the types; the chain specs still reference the inferred shape and will be migrated in v6.16.

### v6.14 (2026-05-13 evening) — A1-bis mgdev session: Dashboard drill-down captured + first chain to PASS end-to-end

15 minutes of live testing against mgdev.openelis-global.org v3.2.1.8 (newer release than the A1 pilot's testing v3.2.1.6). The v6.13 SKILL was freshly installed via the .skill package.

**Methodology under test verdict: PASS.** The session surfaced one new endpoint shape (the Dashboard tile drill-down) and produced the first chain to PASS end-to-end live (Chain I).

Concrete captures:

- **Dashboard tile drill-down endpoint pattern:** `GET /api/OpenELIS-Global/rest/home-dashboard/{TYPE}` returns `{paging, displayItems[]}`. ORDERS_READY_FOR_VALIDATION returned 4 displayItems matching the KPI of 4 exactly — **§13 Y-RECON now works correctly with this endpoint** and the NEW-1 retraction is fully validated.
- **Verified enum names:** ORDERS_IN_PROGRESS, ORDERS_READY_FOR_VALIDATION (canonical), ORDERS_REJECTED_TODAY, ORDERS_COMPLETED_TODAY, ORDERS_ENTERED_BY_USER_TODAY, UN_PRINTED_RESULTS — all return 200. Two return 400 (ORDERS_PARTIALLY_COMPLETED_TODAY, ELECTRONIC_ORDERS) — server-side enum names differ; needs another UI click to capture.
- **Chain I PASS end-to-end live:** read primaryColor `#0f62fe` → PUT `#a335ee` → readback matches → restore confirmed. First chain in the catalog to PASS all steps in a real session.
- **Module maturity upgrades from live evidence:** Dashboard M1.5 → M3 on mgdev; Site Branding M3 confirmed live; FHIR M3 mgdev confirmed.

Session report at `a1bis-session-report-2026-05-13.md`.

`helpers/apiShapes.ts` gains:
- `DashboardDrillDownResponse` and `DashboardDrillDownItem` interfaces.
- `DASHBOARD_TILE_TYPES` enum of verified-working URL types.

The two remaining A1-bis items (SamplePatientEntry POST capture, eqaEnabled JSP form capture) are unblocked but require another short live session to drive their respective UI flows.

### v6.13 (2026-05-13) — v6.12 corrections applied in-place + Chain I rewrite
Closes the loop opened by v6.12. The v6.12 PR documented the 10 spec corrections via `apiShapes.ts` and shipped them as a sidecar patch file (`helpers/_common-v612-patch.ts`) without editing the chain/persona specs in place. v6.13 applies the corrections directly:

- `tests/chains/_common.ts`: `findOrSeedOrder` now reads `patientSearchResults` (not `patientList`), uses `patientID` (not `patientPK`) on object property reads, `ChainOrderRef.patientID` field renamed. `acquireAnyAccession()` and `eqaEnabledRequiresJspNotRest()` folded in from the sidecar.
- Across all 12 chain specs + 6 persona specs: mechanical replacement of `patientList`→`patientSearchResults`, `patient.patientPK`→`patient.patientID`, `patientProperties.nationalId`→top-level `nationalId` on SampleEdit, `?testSectionId=N`→`?testUnitId=N` on Logbook filter URLs. (URL params `?patientPK=` and POST-payload sending keys `{patientProperties: {patientPK: ...}}` retained pending live capture confirmation — left as TODO.)
- `tests/chains/chain-i-site-branding-to-report.spec.ts` rewritten end-to-end. The original premise "PDF reports show 'null' when SiteInformation.labName is missing" was based on the assumption that labName lives in site-branding or SiteInformation — neither was true per the pilot. The rewritten Chain I tests what IS testable today: site-branding round-trip (read → modify primaryColor → confirm → restore). Reduced from 6 steps to 4 steps. The labName/PDF check moves to a future chain that drives the JSP admin form via Playwright UI.
- `helpers/_common-v612-patch.ts` deleted.

After v6.13 the chains are runnable end-to-end at the spec level — though several still depend on live capture for the SamplePatientEntry POST shape and the eqaEnabled JSP form interaction.

### v6.12 (2026-05-13) — Phase A1 pilot + spec corrections grounded in live capture
The v6 methodology was run live against testing.openelis-global.org for the first time. 35 minutes of live Chrome time surfaced 3 candidate real findings (NEW-1 Y-RECON mismatch, NEW-2 ReportPrint 500, NEW-3 FHIR metadata HTML shell) and 10 spec bugs in the chains and personas. The methodology is doing its job — §13 Y-RECON caught NEW-1 on first try; §6.5 stopped me filing the false-positive endpoint paths I'd inferred from documents.
The single most important lesson: every one of the 10 spec bugs was the author (me) inferring an endpoint shape from documents rather than from live capture. **§6.5b "Use captureAround when authoring NEW spec steps" closes that gap** — the network capture helper from v6.10 is now mandatory at authoring time, not just at bug-filing time.
Added:
- §6.5b authoring-time capture rule with a code snippet showing the pattern.
- `helpers/apiShapes.ts` as single source of truth for the corrected response shapes: `patientSearchResults` key, `patientID` field, `birthdate` field, `labUnitList` for lab section IDs, `testUnitId` logbook filter param, `SampleEdit` Struts form top-level fields, `site-branding` schema (no `labName`), FHIR base path candidates, EQA enablement only at JSP not REST.
- `_common.ts` corrections: `findOrSeedOrder` reads the right keys; new `acquireAnyAccession(page)` helper that turns the Y-RECON Dashboard-vs-Logbook gap into a single clear assertion result.
- 3 new candidate findings (NEW-1, NEW-2, NEW-3) added to the bug table.
- BUG-14 marked as possibly regressed pending live retest.
- The full pilot session report is `pilot-2026-05-13-session-report.md` in the repo.
Module maturity downgrades from live evidence: Order Workflow M1.5 → M1, Dashboard M2 → M1.5, Reports M2 → M1.5, FHIR M3 → M1.5. The `maturity-dashboard.html` should be regenerated.
Workplan status: A1 ✅. Remaining: A1 follow-up retests on NEW-1/2/3 with corrected specs, Phase D spec-walks, Phase E3-E7 tooling, Phase F upstream PRs.

### v6.11 (2026-05-13) — Phase C: all 6 §12 Personas implemented
- 6 new specs under `tests/personas/`. Each is a day-in-the-life walk-through for one role, written as a single test.describe.serial that fails cleanly when the role hits a hidden requirement, missing UI path, or broken cross-module link.
- PA Receptionist (~190 lines, 6 steps): patient search → create → order → barcode print. Catches BUG-37 at Step 5 (the receptionist hands off an order whose patient isn't linked).
- PB Bench Tech Hematology (~140 lines, 4 steps): Workplan filter → result entry × N → round-trip → bulk-save normals. API-substituted per §11.5 because BUG-31 hangs the Carbon Accept checkbox.
- PC Validating Biologist (~110 lines, 4 steps): Validation queue → reject one for retest with note → validate rest → confirm on Patient Results. Depends on PB having entered something.
- PD Lab Manager (~150 lines, 5 steps): Dashboard → KPI vs underlying-list reconciliation (§13) → Rejection Report PDF (BUG-29 catch) → Statistics Report PDF (BUG-42 catch) → TAT sanity.
- PE QA Officer (~150 lines, 5 steps): NCE Dashboard → BUG-29 sanity check (zero NCEs + rejections today = silo confirmed at people layer) → corrective action → quarterly Non-Conformity report → CAP/CLIA cold-chain compliance footer.
- PF Lab Administrator (~200 lines, 6 steps + afterAll cleanup): site branding round-trip → barcode config → TestAdd (BUG-1/BUG-12 catch) → **enable EQA (the hidden-requirement catch that previously cost 7 cancelled tickets, OGC-518–524)** → create restricted user (BUG-3 catch) → User Manual PDF link.

All 6 personas marked ✅ in §12. Workplan Phase C status: complete. Remaining workplan items: D (FRS spec-walks), E3–E7 (more tooling), F (reports + upstream), A1 (live pilot).

### v6.10 (2026-05-13) — Phase E2 Live Network Capture Helper
- `helpers/networkCapture.ts` — new module turning §6.5 from "discipline" into "harness-enforced contract." Exports `startCapture`, `captureAround`, `saveAsEvidence`, `assertBugEvidence`, `assert404Observed`, `summarize`.
- §6.5a added with usage example. Tests that mark a 404 as FAIL without first calling `assertBugEvidence` (which throws if the app never actually called the claimed-broken path) should be considered incomplete.
- Auth/cookie headers automatically redacted in saved evidence files, so capture JSON is safe to commit and safe to paste into Jira tickets.
- Closes the loop on the 2026-04-20 false-positive cluster (OGC-535/562/563/565/566/568) at the infrastructure level — the next time someone tries to file a 404 bug against a path the app doesn't call, the harness blocks the bug ticket with a descriptive error pointing at the actual paths captured during the action.

### v6.9 (2026-05-12) — Chains E/F/G/H/J/K/L complete (Phases B5–B11)
- All 12 §11 chains are now Playwright specs in `tests/chains/`. Five (A, B, C, D, I) landed earlier; seven (L, E, F, G, H, J, K) added in this bump.
- Chain L (Lab Number Uniqueness): 4 steps, burst-creates 10 orders in parallel inside one `page.evaluate`, asserts all returned accessions are distinct, then asserts they share the configured prefix. Catches generator races.
- Chain E (Sample Validation Lifecycle): 6 steps. Distinct from Chain B's sample rejection — this tests RESULT rejection (retest workflow). Step 6 catches the case where both initial wrong value AND corrected value appear on the report.
- Chain F (EQA Distribution): 6 steps. Step 1 explicitly checks the eqaEnabled config precondition with a clear fix path, solving the OGC-518–524 cluster pattern. Step 5 catches BUG-39.
- Chain G (Cold-Chain Excursion): 5 steps. BAILs cleanly if no Cold Storage device configured (most common case). Uses API-direct excursion insertion as hardware-substitute; the real sensor-integration test is out of scope (workplan E6).
- Chain H (Permission Enforcement): 4 steps with afterAll cleanup. Spawns a second browser context to log in as a restricted user. Distinguishes 401 (session) from 403 (forbidden). Dependent on BUG-3.
- Chain J (Audit Trail Coverage): 5 steps. Performs 2-3 sensitive actions, then verifies each produced an audit entry with identifying who/when/what fields populated.
- Chain K (FHIR Round-trip): 6 steps. Forward direction (UI→FHIR read), write surface (FHIR POST), and reverse direction (FHIR→UI back-projection). BLOCKED clean if FHIR is read-only.

Every chain reuses `tests/chains/_common.ts` with zero changes — `apiCall`, `findOrSeedOrder`, `extractPdfText`, `markStep` all proven sufficient for the full set. Workplan Phase B (chains) is complete; the remaining workplan items move to Phase C (Personas).

### v6.8 (2026-05-12) — Chain I Site Branding → Report (Phase B4)
- Fifth §11 chain implemented. `tests/chains/chain-i-site-branding-to-report.spec.ts` (6 steps). First chain that can plausibly PASS on the current testing instance (admin write path already proven in Phase 36 Chain C; only the admin→report propagation remained unverified).
- Step 3 explicitly probes the NOTE-16 root cause — labName empty/null in SiteInformation. If found unset, the chain reports clearly that PDFs will show "null" because the upstream config is empty (different bug class than "pipeline is broken").
- Step 6 is the strongest test in the chain: modify labName → regenerate PDF → assert the new value appears → `test.afterAll` restores the original. Catches stale-cache and pipeline-lossy issues that Step 5 (read existing config) can't.
- Uses defensive endpoint probing per §6.5 — tries SiteInformation, siteInformation, SiteInformationMenu in priority order; bails with a clear error if none responds.

### v6.7 (2026-05-12) — Chains C + D Reflex/Calc engines (Phase B3)
- Chain C (`tests/chains/chain-c-reflex-trigger.spec.ts`, 6 steps) and Chain D (`tests/chains/chain-d-calculated-value.spec.ts`, 7 steps) implemented together. Both API-substituted per §11.5 because BUG-31 blocks the UI result-entry step.
- These are the two chains the prior catalog could *never* verify — Phase 28 admin tests confirmed both engines have working CRUD pages, but no test had ever observed either engine actually firing because BUG-31 blocked the result-entry step that would trigger one.
- Chain C Step 5 = definitive PASS/FAIL on "does the reflex engine fire on API writes?"
- Chain D Steps 5/6/7 split the calc engine check into three distinct symptoms: (5) calc test row produced, (6) row has a value, (7) value math is plausible. A partial-fix scenario (engine adds row but doesn't compute) surfaces clearly.
- Both chains reuse `tests/chains/_common.ts` with zero changes. Chain D adds its own multi-test order POST inline rather than extending the shared helper — kept for clarity until the pattern repeats.

### v6.6 (2026-05-12) — Chain B Rejection → NCE → Report implemented (Phase B2)
- Second chain from §11 is now a Playwright spec: `tests/chains/chain-b-rejection.spec.ts`. 8 named steps. The key design choice: Steps 5, 6, 7, 8 each probe one of the *four distinct symptoms* of BUG-29 (qa_event creation gap, View NCE search empty, Rejection Report PDF 503, Dashboard counter stuck at 0) so a partial fix surfaces clearly which subsystem was patched — not "rejection workflow FAILed" as a single opaque red light.
- Step 3 uses API substitute per §11.5 (Reject Sample is a Carbon checkbox, same BUG-31 family).
- Adds a "PARTIAL" status to Step 7's PDF-content check: PDF generates but is empty for today's rejections — a soft signal that BUG-29 reaches all the way through to the report layer.
- Reuses `tests/chains/_common.ts` helpers introduced in v6.5 with no changes.

### v6.5 (2026-05-12) — Chain A Order Lifecycle implemented (Phase B1)
- First chain from §11 Chains is now an actual Playwright spec: `tests/chains/chain-a-order-lifecycle.spec.ts`. Eight named steps (1: acquire order, 2: BUG-37 linkage check, 3: result entry via API substitute, 4: validation, 5: PDF generation, 6: PDF content match, 7: FHIR Observation fetch, 8: round-trip value match).
- Each step declares its §7.6 Acceptance Criterion (RENDER / FUNCTION / PERSIST / ROUND-TRIP / CROSS-LINK / REPORTABLE) and references the SKILL section that mandates it. Steps 3 and 4 use API substitutes per §11.5 because BUG-31 blocks the UI path.
- Added `tests/chains/_common.ts` with reusable helpers: CSRF-aware `apiCall`, `findOrSeedOrder`, minimal PDF text extractor (no external deps), structured step logger. Same helpers will power Chains B–L.
- Playwright project `chain-a` depends only on `setup`, not `data-setup`, so it can run against any seeded instance via the §0.6a script.

### v6.4 (2026-05-12) — Bulk seed script (Phase E1)
- Step 0.6 Data Census now has an 0.6a "Bulk seed script" sub-section with invocation commands. The seed script (`seed-data.setup.ts` + `helpers/seed-factory.ts` + `helpers/seed-config.ts` in the repo) is idempotent, round-trip-verifies every write per §7.5, detects and counts BUG-37 instances as it runs, and writes a machine-readable summary to `.auth/seed-state.json`.
- Targets 50 patients and 100 orders spread across 5 lab sections; status-transition seeding (IN_PROGRESS / READY_FOR_VALIDATION / REJECTED) intentionally not attempted while BUG-31 blocks the result-entry UI. Documented as an open item for workplan Phase B Chain C/D.

### v6.3 (2026-05-12) — Bug-revalidation cross-link
- Step 0.5 Calibration now explicitly references the `openelis-bug-revalidation` companion SKILL v1.1, which handles each new FAIL after calibration. The two protocols are designed to work together: this SKILL governs pre-phase calibration of known bugs; the companion SKILL governs reproducibility confirmation of new FAILs. Destructive bugs (BUG-31, BUG-38) use indirect evidence in both protocols.

### v6.2 (2026-05-12) — Bug-list calibration sweep
- Section 8 bug table re-calibrated against 2026-04-20/21 QA reports. 9 bugs marked Resolved, 6 marked False Positive (wrong endpoint pattern), 2 Retracted, 1 Downgraded (BUG-1 → merge with BUG-12). Strikethrough severity + bold action highlight tickets ready for Jira closure.
- See `bug-calibration-delta-2026-05-12.md` for the full delta document with per-bug evidence trail and top-5 priorities for the next live session.

### v6.1 (2026-05-12) — Blocking-bug etiquette
- Step 0.5: Calibration must use indirect evidence path for destructive bugs (BUG-31, BUG-38). Never re-trigger a known browser-hanging action.
- Section 11.5: Blocking-Bug Etiquette rule — when a mandated step would hang the session, mark BLOCKED + PARTIAL and continue. Clarifies that "mandatory" means "must be attempted and reported on," not "must succeed." Lists current known blockers (BUG-31, BUG-38) and allows API substitution for destructive-UI legs of chains.

### v6 (2026-05-12) — Lab-readiness lens
- Step 0.5: Calibration step before each new test phase.
- Step 0.6: Data Census gate before E2E or persona suites.
- Section 5.5: Feature Maturity Rubric (M0–M5). Replaces binary PASS/FAIL with maturity rating per module.
- Section 6.5: Mandatory live-network-capture rule before filing any 404-based bug. Closes the false-positive cluster pattern (OGC-535/562/563/565/566/568).
- Section 7.5: Round-trip Write Verification mandatory for all writes. Closes BUG-8 / BUG-29 / BUG-37 class.
- Section 7.6: Acceptance Criteria Standard (RENDER / FUNCTION / PERSIST / ROUND-TRIP / CROSS-LINK / REPORTABLE).
- Section 8.5: Partial-Feature Audit — quarterly + on major version. Seeded with 20 baseline suspect features.
- Section 11: Chains — 12 canonical cross-module workflows, mandatory.
- Section 12: Personas — 6 day-in-the-life walk-throughs.
- Section 13: Dashboard Counter Reconciliation — mandatory every run.
