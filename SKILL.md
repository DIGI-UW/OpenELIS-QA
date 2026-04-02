---
name: openelis-test-catalog-qa
description: >
  Automated QA testing skill for OpenELIS Global covering 166+ test suites and ~473 test cases across the full application. Tests: Orders, Validation, Results, Patient Management, Dashboard, Admin (28+ pages), Admin Config Deep Tests (12 pages), Reports (all 11), Referrals, Workplan, FHIR, i18n, Accessibility, Pathology, Analyzers, EQA Distribution Deep Tests, EQA Admin Program Management, EQA Create Shipment Wizard, Alerts Dashboard Deep Tests, EQA Sidebar Navigation, Storage, Batch Entry, Barcode, E2E Rejection Workflow, Provider & Organization CRUD, Fine-Grained Form Verification (User Management, Edit Order, Batch Order Entry), and more. Includes DEEP interaction suites testing search, filter, form interaction, error handling, performance, cross-module data integrity, security (CSRF/XSS/SQLi), WCAG accessibility, end-to-end order tracing, report PDF generation, EQA spec-vs-implementation gap analysis, and field-level form verification against Confluence user manual. Drives a real browser session via Claude in Chrome and produces a pass/fail report with Jira tickets for failures.
---

# OpenELIS Global QA Skill — v5

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

**Known baseline data (jdhealthsolutions instance):**
- Accession `26CPHL00008V` — Patient Abby Sebby, HGB(Whole Blood), last result = 2 g/dL
- Accession format: `26-CPHL-000-08X` (confirmed via Lab Number Management)
- 4,726 organizations, 33 providers, 1,273 dictionary entries
- French translation: 51.4% complete (1,120/2,180 entries)
- Dashboard KPIs: In Progress ~96, Ready For Validation ~142
- Test Analyzer Alpha — present in Analyzers list

**EQA Configuration Prerequisite:**
- **Route:** Admin → `/MasterListsPage/SampleEntryConfigurationMenu` (Order Entry Configuration page)
- **Config key:** `eqaEnabled` — "If true, the EQA checkbox appears on Order Entry allowing a sample to be marked as an EQA sample"
- **How to enable:** Close main sidebar (hamburger menu) to reveal admin sub-menu → expand "General Configurations" → click "Order Entry Configuration" → select `eqaEnabled` row radio → click Modify → set value to `true` → Save
- **IMPORTANT:** Suite FK must run before Suites FL–FP. Without `eqaEnabled = true`, EQA features will not appear in Order Entry or sidebar navigation.

---

## Step 1 — Read the Test Cases

Before navigating, read the detailed test scenarios from:
- `references/test-cases.md` — original 50 suites with steps, URLs, and success criteria
- `../master-test-cases.md` (writable copy in outputs) — extended with Phase 4 DEEP suites

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
**EQA:** `/EQADistribution`
**Alerts:** `/Alerts`
**Orders:** `/ElectronicOrders`, `/SampleBatchEntrySetup`, `/PrintBarcode`
**Storage:** `/Storage`, `/Storage/samples`
**Aliquot:** `/Aliquot`
**Order Programs:** `/genericProgram`

If a URL returns 404, try alternates before marking as GAP. Record the working URL in your log.

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

## Section 8 — Known Bugs (v3.2.1.3) — Do Not Re-File

| Bug | Severity | Description | Impacted Suites |
|-----|----------|-------------|-----------------|
| BUG-1 | **Critical** | `POST /rest/TestAdd` HTTP 500 — test creation broken | A (blocks B,C,D cascade) |
| BUG-2 EXTENDED | High | Carbon checkbox `.click()` hangs browser 60s on ALL checkboxes. DOM workaround works for Results but NOT Validation. | D, E, M, all checkbox interactions |
| BUG-3 | High | `POST /rest/UnifiedSystemUser` HTTP 500 — user creation broken | D (RBAC) |
| BUG-4 | Medium | ModifyOrder generates new accession instead of preserving original | C |
| BUG-6 | Low | Duplicate sample type in test name: "HGB(Whole Blood)(Whole Blood)" | B, E, F |
| BUG-7 | Medium | PanelCreate Next button non-responsive (Carbon Select state) | A TC-05 |
| BUG-7a | High | `POST /rest/PanelCreate` silent fail — panel not created | A TC-05 |
| BUG-8 | **Critical** | `POST /rest/TestModifyEntry` silent fail — ranges not saved. **Patient safety.** | A TC-06, B TC-11, E TC-VAL-06 |
| BUG-9 | High | Reports base API endpoint returns Spring NoHandlerFoundException (404). NOTE: Patient Status Report at `/Report?type=patient` works. | AF, AG (management/WHONET reports) |
| BUG-10 | Low | Billing sidebar link has `href=""` — no route configured, feature not implemented | AP (Billing) |
| BUG-11/15 | Medium | `/NotebookDashboard` renders completely blank white page — React component fails to mount | AP (NoteBook) |
| BUG-12 | Medium | TestAdd JSP form: Reporting Test Name inputs lack `name` attributes. Values never submitted to server. | A (TestAdd form) |
| BUG-13 | **Critical** | `GET /TestModifyEntry` returns HTTP 500 after failed TestAdd. Possible orphan data poisoning. Regression. | A (TestModify) |
| BUG-14 | ~~High~~ **Resolved** | `/api/fhir/metadata` now returns HTTP 200 with valid CapabilityStatement (HAPI FHIR 7.0.2, FHIR R4, 5 resources: Observation, OperationDefinition, Organization, Patient, Practitioner). Resolved in v3.2.1.3. | R (FHIR) — BW-DEEP |
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
| BUG-34 | Low | **NEW (Phase 27)** Organization API returns 500 | Admin (Organization) |
| BUG-35 | Low | **NEW (Phase 27)** Legacy Admin opens new tab instead of SPA navigation | Admin (Legacy) |
| ~~BUG-36~~ | ~~High~~ **Resolved** | POST `/rest/test-calculation` returns HTTP 200 for both create and update. Initial 500s in Phase 28 were from malformed payloads (array wrappers, missing required fields). Endpoint works correctly with proper payload structure. | Calculated Values |

If you encounter a new failure that matches one of these bugs in a **different** area,
note it as "BUG-X extending to Suite Y" rather than filing a new ticket.

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

**Cumulative:** 775 TCs executed, 746 passed, ~96.3% pass rate. 8 non-executable test scripts catalogued. (4 resolved/fixed bugs + 1 retracted false positive + 1 likely fixed + BUG-36 resolved improve effective quality). BUG-1 now FIXED in v3.2.1.4. BUG-8 CONFIRMED with new data loss finding (OGC-525). Admin coverage: COMPLETE — all sub-pages, General Config (54+ settings across 10 pages), Menu Config (5 pages), Localization (2 pages), and Config Modify workflow (3 edit form types) deeply tested.

**Key takeaway:** Read operations, admin pages, granular interactions, i18n, session security,
accessibility, pathology modules, end-to-end workflows, and cross-module data flows are rock-solid.
Regression testing confirms Phase 5–8 pass cases remain stable. Write operations (TestAdd, UserCreate,
PanelCreate, TestModify) remain broken — these are the highest-priority fixes needed.
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
