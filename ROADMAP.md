# OpenELIS QA Testing — Roadmap & Next Steps

**Created:** 2026-03-27
**Updated:** 2026-03-29 (Phase 19 complete)
**Current State:** Phase 19 complete, 272 TCs, ~93% pass rate. Phase 19 tested deeper interaction on Analyzers, Notifications, User panel, Global Search.

---

## Completed Phases

| Phase | Date | Suites | TCs | Pass Rate | Key Findings |
|-------|------|--------|-----|-----------|--------------|
| 1 (Smoke) | 03-23 | A-D | 2 | 50% | BUG-1 cascade |
| 2 (Frontend) | 03-24 | H,I,J,K,T,V | 27 | 100% | Frontend healthy |
| 3 (Sidebar) | 03-24 | AA-AP | 24 | 92% | Reports 404, Billing/NoteBook 404 |
| 4 (Admin) | 03-24 | AQ-AX | 28 | 100% | All 28 admin pass |
| 5 (Deep Interaction) | 03-25 | 11 DEEP | 32 | 100% | BUG-16 (i18n), NOTE-2 (a11y) |
| 6 (Deep E2E) | 03-25 | 8 DEEP | 21 | 100% | All pass |
| 7 (Referral/Pathology) | 03-27 | 7 DEEP | 14 | 71% | BUG-18/19 (referral broken) |
| Script Validation | 03-27 | — | — | — | Fixed structural TS errors, compliance analysis |
| 8 (Write Op Deep) | 03-27 | BS-BX | 6 | 50% | BUG-1,3,7a,8 CONFIRMED; BUG-14,18,19 RESOLVED; BUG-20 NEW |
| 9 (Regression/XMod) | 03-27 | BY-CB | 8 | 100% | All regression pass; cross-module data consistent; NOTE-3 (API typos) |
| 10 (Security) | 03-28 | CC-CH | 6 | 83% | No rate limiting (BUG-22); CSP weak (NOTE-4); good SQL/XSS protection |
| 11 (Performance) | 03-28 | CI-CL | 4 | 100% | All API p50 ~370ms (network-dominated); no memory leaks; SPA shell 40ms DCL |
| 12 (Accessibility) | 03-28 | CM-CR | 6 | 33% | Critical: color contrast 1.08:1, no H1, 90% small touch targets, no skip link, no live regions |
| 13 (i18n Infra) | 03-28 | CS-CT | 2 | 100% | Locale switch works, persists across nav; html lang never updates (NOTE-13); API locale-agnostic (by design) |
| 14 (E2E/Reports) | 03-28 | CU-CX | 4 | 75% | ~~BUG-23 RETRACTED~~ Report UI works via path-based routing; ReportPrint API works; FHIR Patient/Obs OK; test data wiped (NOTE-14) |
| 15 (Notif/Error) | 03-28 | CY-DB | 4 | 100% | Notification system functional (empty data); API error leak reconfirms NOTE-7; session timeout works; SPA uses path-based routing (corrects BUG-23) |
| 16 (Deep Ops) | 03-29 | DC-DI | 22 | 100% | PDF via form works; null report header; "labratory" typo; FHIR 5 resources confirmed; Workplan 4 sub-pages OK; EQA Distribution functional |
| 17 (Module Deep) | 03-29 | DJ-DQ | 15 | 93% | Storage dashboard rich; Cold Storage monitoring functional; Pathology/IHC/Cytology dashboards OK; Billing href=null (stub); NoteBook blank page; Aliquot functional |
| 18 (NCE/Analyzers/Help) | 03-29 | DR-DZ | 9 | 89% | Non-Conform 3 pages OK; Analyzers rich (List/Errors/Types); Help: User Manual PDF works, Video Tutorials + Release Notes stub buttons |
| 19 (Deep Interaction) | 03-29 | EA-EH | 8 | 88% | Analyzer kebab 6 actions; Delete {name} bug; Analyzer Types creation; Notifications panel; User panel; Global Search works |

---

## Completed Refactoring

### Refactoring Phase A — Quick Wins ✅
- [x] `auth.setup.ts` created with cached session pattern
- [x] `playwright.config.ts` created with 16 project definitions
- [x] Compliance analysis completed (`testing-constitution-compliance.md`)

### Refactoring Phase B — File Splitting & POM ✅
- [x] 10 Page Object classes created in `pages/` directory
- [x] 15 feature-specific test files created in `tests/` directory
- [x] Monolithic spec preserved as reference (`openelis-e2e.spec.ts`)

### Refactoring Phase C — Selector Modernization & TS Strict ✅
- [x] Replace `text=...` selectors → `getByText()` (183 replacements; 0 remaining)
- [x] Replace `button:has-text(...)` → `getByRole('button', { name: })` (127 standalone replaced; 56 compound selectors preserved)
- [x] Fix TypeScript strict-mode: 57 null-safe `textContent` patterns (`?? ''`), 43 `page.$()` → `page.locator()` modernizations
- [x] Total: 410 selector/TS changes, 436 test blocks preserved, 185 describe blocks intact

---

## Future Testing Phases

### Phase 8 — Write Operation Deep Testing ✅ COMPLETE
**Focus:** Exercise all confirmed-broken write operations with detailed error capture
**Tested in:** New React/Carbon UI (v3.2.1.3)

| Test | Bug | Result | Details |
|------|-----|--------|---------|
| BS-DEEP: TestAdd | BUG-1 | **CONFIRMED** | POST `/rest/TestAdd` → HTTP 500. Form silently resets to step 1. |
| BT-DEEP: UserCreate | BUG-3 | **CONFIRMED** | POST `/rest/UnifiedSystemUser` → HTTP 500 ("Check server logs"). Save button disabled. **NEW BUG-20:** Login Name field permanently shows invalid state (React `invalid: true` with no `invalidText`). |
| BU-DEEP: PanelCreate | BUG-7a | **CONFIRMED & UPGRADED** | POST `/rest/PanelCreate` → HTTP 500. Previously "silent failure" — actually server 500. UI resets form silently. |
| BV-DEEP: TestModify | BUG-8 | **CONFIRMED & WORSE** | POST `/rest/TestModifyEntry` → HTTP 200 (false success). Normal ranges NOT persisted. Panel association LOST (severe data integrity bug). |
| BW-DEEP: FHIR | BUG-14 | **RESOLVED** | `/fhir/metadata` → HTTP 200. Valid CapabilityStatement (HAPI FHIR 7.0.2, R4, 5 resources). |
| BX-DEEP: Referral | BUG-18/19 | **RESOLVED** | Referral dropdowns (org, reason) work in expanded logbook row. POST saves correctly — new referral created with org "Doherty Institute", reason "Test not performed". |

**Bonus findings:**
- All `patient-photos/{id}/true` endpoints return HTTP 500 (potential BUG-21)
- Referral UI is in expanded row of LogbookResults, not a standalone page

### Phase 9 — Regression & Cross-Module Integrity ✅ COMPLETE
**Focus:** Verify that working features haven't regressed
**Completed:** 2026-03-27

**Results Summary:**

**Phase 9A — Regression Tests (4 test cases, 4 PASS)**
| Test | Suite | Name | Result | Details |
|------|-------|------|--------|---------|
| BY-REG-01 | BY | API Endpoint Health Check | PASS | 12/14 core endpoints (Patient search, logbook, test mgmt, FHIR, etc.) return HTTP 200 |
| BY-REG-02 | BY | Admin MasterListsPage | PASS | All 20+ admin items render correctly; Organization Management loads with 4,726 orgs |
| BY-REG-03 | BY | Add Order Page | PASS | Multi-step wizard (Patient Info → Program → Sample → Order) fully functional |
| BY-REG-04 | BY | LogbookResults Page | PASS | Test unit dropdown loads 14 sections; Hematology returns 14 results with correct table |

**Phase 9B — Cross-Module Data Flow (2 test cases, 2 PASS)**
| Test | Suite | Name | Result | Details |
|------|-------|------|--------|---------|
| BZ-XMOD-01 | BZ | Order Tracing (26CPHL00008K) | PASS | Order appears consistently in LogbookResults (WBC=7.5) AND ReferredOutTests (status=SENT); referredOut flag consistent |
| BZ-XMOD-02 | BZ | Validation Consistency (26CPHL00008M) | PASS | Order in LogbookResults (WBC=8.5) AND AccessionValidation (result=8.5, accepted=false); perfect data match |

**Phase 9C — Dashboard KPI Accuracy (1 test case, 1 PASS with NOTE)**
| Test | Suite | Name | Result | Details |
|------|-------|------|--------|---------|
| CA-KPI-01 | CA | Dashboard Metrics vs Actual | PASS (with NOTE) | Dashboard API `/rest/home-dashboard/metrics` returns JSON correctly. Discrepancy explained: dashboard counts ORDERS (104) while logbook shows individual TESTS (249 across 76 orders). NOTE-3: API field name typos detected (patiallyCompletedToday, orderEnterdByUserToday, unPritendResults, incomigOrders, averageTurnAroudTime) |

**Phase 9D — Patient Data Consistency (1 test case, 1 PASS)**
| Test | Suite | Name | Result | Details |
|------|-------|------|--------|---------|
| CB-PAT-01 | CB | Patient Identity Across Modules | PASS | Logbook patients verified in patient-search: "Test, CPHL" (IDs 14/15), "Abby, Sebby" (ID 103), "QANEWPATIENT, Test" (ID 125) — all consistent |

**Phase 9 Key Findings:**
- All 8 tests passed (100% pass rate)
- Regression testing confirms Phase 5–7 features remain stable
- Cross-module data flow validated: order data consistent from entry through validation
- Dashboard metric discrepancy is architectural (order-level vs test-level counting), not a bug
- NOTE-3 (NEW): Dashboard metrics API field names contain typos — cosmetic issue, low priority
- BUG-21 reconfirmed: All patient-photos endpoints return HTTP 500 (seen in network activity during LogbookResults)

### Phase 10 — Security & Edge Cases ✅ COMPLETE
**Focus:** Security posture and boundary testing
**Completed:** 2026-03-28

**Results Summary:**

**Phase 10A — CSRF & Session Security (1 test case, 1 PASS with NOTES)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CC-CSRF-01 | CSRF & Session Security Audit | PASS | No CSRF meta tag, BUT CSP header present. POST without token → 500 (unclear if CSRF or validation). Security headers solid: X-Frame-Options=SAMEORIGIN, X-Content-Type-Options=nosniff, HSTS present. CSP weakness: includes `unsafe-inline` + `unsafe-eval` (NOTE-4). X-XSS-Protection=0 (modern best practice with CSP). Referrer-Policy NOT SET (NOTE-5). HTTP methods restricted correctly (PUT/DELETE/PATCH → 405). |

**Phase 10B — XSS Injection (1 test case, 1 PASS)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CD-XSS-01 | XSS Injection Testing | PASS | Patient search: all 4 XSS payloads (script tag, img onerror, svg onload, event handler) NOT reflected. Safe. LogbookResults: input reflected in JSON but Content-Type is `application/json` (browsers won't execute). Low-risk unless frontend uses `dangerouslySetInnerHTML` (NOTE-6). |

**Phase 10C — SQL Injection (1 test case, 1 PASS)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CE-SQLI-01 | SQL Injection Testing | PASS | Patient search: all 4 SQLi payloads (single quote, OR 1=1, UNION SELECT, DROP TABLE) returned empty JSON arrays with no SQL errors. Parameterized queries working correctly. LogbookResults accession search: OR 1=1 returned 0 results (not all records). Safe. |

**Phase 10D — Concurrent Session Handling (1 test case, 1 PASS)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CF-CONCURRENT-01 | Concurrent Request Handling | PASS | 20 simultaneous requests to `/rest/home-dashboard/metrics`: all 200 OK. 50 rapid sequential requests: all 200 OK. No session invalidation or degradation. |

**Phase 10E — Rate Limiting (1 test case, 1 FAIL)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CG-RATE-01 | Login Rate Limiting | **FAIL** | 30 rapid wrong-password attempts to `/rest/validateLogin`: all returned 403 (rejected) but NO escalation to 429 (Too Many Requests) and NO account lockout. 50 rapid API requests to authenticated endpoints: all 200, no 429. **BUG-22 (NEW, Medium): No rate limiting on login or API endpoints. Brute-force attacks possible.** |

**Phase 10F — Authorization & Error Handling (1 test case, 1 PASS with NOTES)**
| Test | Name | Result | Details |
|------|------|--------|---------|
| CH-AUTH-01 | Authorization & Information Leakage | PASS | `credentials:omit` request to `/rest/UnifiedSystemUser`: returns 200 with HTML shell (11890 bytes, not JSON) — SPA redirect to login. Auth IS enforced. Error responses (404 endpoints): contain "Exception" keyword — minor server info leakage (NOTE-7). |

**Phase 10 Key Findings:**
- All 6 tests run; 5 PASS, 1 FAIL (83% pass rate)
- **BUG-22 (NEW, Medium):** No rate limiting on login endpoint or API endpoints. Brute-force attacks possible.
- **NOTE-4 (NEW):** CSP includes `unsafe-inline` and `unsafe-eval`, significantly weakening Content Security Policy
- **NOTE-5 (NEW):** Referrer-Policy header not set
- **NOTE-6 (NEW):** User input reflected in JSON API responses (LogbookResults labNumber parameter). Low risk with application/json Content-Type.
- **NOTE-7 (NEW):** Error responses contain "Exception" text, leaking server implementation details
- SQL injection and XSS protections are solid (parameterized queries, input encoding)
- CSRF protection unclear — POST without token returns 500, not 403 (could be validation error)

### Phase 11 — Performance Benchmarking ✅ COMPLETE (2026-03-28)
**Focus:** Quantitative performance metrics
**Result:** 4 test suites, 4 PASS (100% pass rate)

**11A — API Response Time Benchmarks (TC-CI-API-01) — PASS**
- 10 endpoints tested, 10 iterations each
- All p50/p95/p99 in ~367-398ms range (extremely consistent)
- Response times dominated by ~365ms network RTT to server
- No endpoint-specific bottlenecks detected

**11B — Page Load Benchmarks (TC-CJ-PAGE-01) — PASS**
- Dashboard SPA shell: DCL=40ms, 26 resources, 53KB total transfer, 13 API calls
- Slowest initial API: site-branding@355ms
- SampleEntry: 442ms/59KB, LogbookResults: 414ms/24KB, ReferredOut: 182ms/21KB
- Validation: 178ms/1KB, MasterLists: 182ms/8KB

**11C — Large Dataset Stress (TC-CK-STRESS-01) — PASS**
- Mycobacteriology (96 rows): 2207ms — acceptable for large result set
- Parallel 14-section load: 3454ms total
- TestAdd (largest single payload): 729ms/56KB
- Patient search (16 results): 180ms — fast

**11D — Memory Leak Detection (TC-CL-MEMORY-01) — PASS**
- API-level: 0.1MB growth (0.27%) across 10 API fetches — negligible
- SPA navigation: 2MB growth (5.28%) across 10 route changes — normal deferred GC
- DOM nodes: perfectly stable at 853 across all navigations — no React component leaks
- No actionable memory leak detected

### Phase 12 — Accessibility Deep Audit ✅ COMPLETE (2026-03-28)
**Focus:** WCAG 2.1 AA comprehensive compliance
**Result:** 6 test suites, 2 PASS, 4 FAIL (33% pass rate)

**12A — axe-core Full Page Scan (TC-CM-AXE-01) — FAIL**
- Scanned 7 pages (Dashboard, FindOrder, LogbookResults, ResultSearch, MasterLists, SampleAdd, WorkPlan, OrgManagement)
- All pages have identical 5 violations (shell-level, not page-specific):
  - `color-contrast` (serious, 8 nodes): white #fff on #f5f6f8 = 1.08:1 ratio (needs 4.5:1)
  - `listitem` (serious, 20 nodes): Carbon sidebar `<li>` elements inside `<span role="none">` instead of `<ul>`
  - `list` (serious, 1 node): `cds--side-nav__items` UL has non-li direct children
  - `duplicate-id` (minor, 1 node): SVG `id="maximizeIcon"` duplicated
  - `page-has-heading-one` (moderate, 1 node): no H1 heading on any page
- 39 rules PASS per page; 2 incomplete

**12B — Keyboard Navigation (TC-CN-KBD-01) — PARTIAL PASS**
- 101 focusable elements detected; tab order uses natural DOM order (no positive tabindex abuse)
- 11/20 tested elements have visible focus indicators; 9/20 lack visible focus outline/box-shadow
- **No skip navigation link** present — keyboard users must tab through entire sidebar
- No keyboard traps detected
- NOTE-8: 45% of elements lack visible focus indicator

**12C — Heading Hierarchy (TC-CO-HEADING-01) — FAIL**
- No H1 on any page; heading order starts at H5, then H3×10, H4×1
- Violates WCAG 1.3.1 (Info and Relationships) and WCAG 2.4.6 (Headings and Labels)
- NOTE-9: Heading hierarchy completely broken across all pages

**12D — ARIA & Landmarks (TC-CP-ARIA-01) — PASS**
- Proper landmark structure: main=1, nav=2, banner=1, contentinfo=1
- 18 aria-expanded attributes for collapsible menus
- Missing: `role="search"` on search inputs, `role="complementary"` for sidebar
- **0 aria-live regions, 0 role="alert", 0 role="status"** — dynamic content invisible to screen readers
- NOTE-10: No live regions for dynamic content announcements

**12E — Color Contrast (TC-CQ-CONTRAST-01) — FAIL**
- 8 elements on every page with 1.08:1 contrast ratio (white #ffffff on #f5f6f8)
- WCAG AA minimum is 4.5:1 for normal text, 3:1 for large text
- All failing elements are 14px (10.5pt) — requires 4.5:1 minimum
- These appear to be in the sidebar/shell area (affects all pages identically)

**12F — Touch Targets & Form A11y (TC-CR-TOUCH-01) — FAIL**
- 87/97 (90%) interactive targets below 44×44px WCAG 2.5.5 recommended minimum
- All form inputs have proper labels (0 unlabeled inputs found)
- No autocomplete attributes on name/address fields (WCAG 1.3.5)
- `lang="en"` properly set on HTML element
- Base font size 16px (appropriate)
- NOTE-11: 90% of touch targets undersized

---

## Bug Tracking Summary

| Bug | Severity | Status | Jira |
|-----|----------|--------|------|
| BUG-1 | Critical | Open | OGC-448 |
| BUG-2 EXT | High | Open | OGC-467/468 |
| BUG-3 | High | Open | OGC-448 |
| BUG-4 | Medium | Open | — |
| BUG-6 | Low | Open | — |
| BUG-7/7a | Medium/High | Open | OGC-450/451 |
| BUG-8 | Critical | Open | OGC-452 |
| BUG-9 | High | Open | — |
| BUG-10 | Low | Open | OGC-469/470 |
| BUG-11/15 | Medium | Open | OGC-471/472 |
| BUG-12 | Medium | Open | OGC-473/474 |
| BUG-13 | Critical | Open | OGC-475/476 |
| BUG-14 | High | **Resolved (P8)** | OGC-477 ✅ |
| BUG-16 | Medium | Open | — |
| BUG-17 | Low | Open | — |
| BUG-18 | Critical | **Resolved (P8)** | OGC-449 ✅ |
| BUG-19 | Critical | **Resolved (P8)** | OGC-493 ✅ |
| BUG-20 | Medium | **New (P8)** | OGC-494 |
| BUG-21 | Low | **New (P8)** | OGC-495 |
| BUG-22 | Medium | **New (P10)** | OGC-496 |
| NOTE-1 | Low (UX) | Open | — |
| NOTE-2 | Low (a11y) | Open | — |
| NOTE-3 | Low (Code Review) | **New (P9)** | — |
| NOTE-4 | Low (Security) | **New (P10)** | — |
| NOTE-5 | Low (Security) | **New (P10)** | — |
| NOTE-6 | Low (Security) | **New (P10)** | — |
| NOTE-7 | Low (Security) | **New (P10)** | — |
| NOTE-8 | Medium (a11y) | **New (P12)** | OGC-497 |
| NOTE-9 | Medium (a11y) | **New (P12)** | OGC-497 |
| NOTE-10 | Medium (a11y) | **New (P12)** | OGC-497 |
| NOTE-11 | Low (a11y) | **New (P12)** | OGC-497 |
| NOTE-12 | Serious (a11y) | **New (P12)** | OGC-497 |
| NOTE-13 | Low (i18n) | **New (P13)** | OGC-498 |
| BUG-23 | ~~High~~ | **RETRACTED (P15)** — false positive, hash-based URL test error | — |
| NOTE-14 | Medium (Data) | **New (P14)** | — |
| NOTE-15 | Low (Security) | **New (P15)** — reconfirms NOTE-7 | OGC-499 |

---

### Phase 13 — i18n Infrastructure ✅ COMPLETE (2026-03-28)
**Focus:** Locale switching mechanism, API locale support (translations managed in Transifex — not tested here)
**Result:** 2 test suites, 2 PASS (100% pass rate)

- Locale selector (en/fr) works correctly, persists across SPA navigation
- 42% of visible text nodes changed when switching to French
- **NOTE-13 (NEW, Low):** `<html lang="en">` never updates to `lang="fr"` when locale is switched — screen readers won't detect language change
- API is locale-agnostic (identical responses regardless of Accept-Language header) — i18n is purely client-side React state, which is expected for Transifex-managed translations

### Phase 14 — End-to-End Workflow, Report & Integration ✅ COMPLETE (2026-03-28)
**Focus:** Report UI rendering, ReportPrint API, FHIR integration endpoints, data availability for E2E tracing
**Result:** 4 test suites, 3 PASS, 1 FAIL (75% pass rate — corrected after BUG-23 retraction)

**14A — Report UI Rendering (TC-CU-RPTUI-01) — ~~FAIL~~ PASS (corrected in P15)**
- Tested 7 report routes: RoutineReport, StudyReport, AggregateReportByDate, ActivityReport, NonConformityReport, PatientReport, StatisticsReport
- ~~BUG-23 RETRACTED:~~ Initial test used hash-based URLs (`#/RoutineReport`) which are wrong. SPA uses **path-based routing** (`/Report?type=patient&report=patientCILNSP_vreduit`). Sidebar link clicks navigate correctly and render report forms with 24+ form inputs.
- **Correction:** Phase 14 actual pass rate is 75% (3 PASS, 1 FAIL for data availability only)

**14B — Report API / ReportPrint (TC-CV-RPTAPI-01) — PASS**
- POST `/rest/ReportPrint` with patientCILNSP_vreduit → 200, returns 1440-byte PDF
- POST with patientCILNSP → 200, returns 1440-byte PDF
- POST with statisticsReport → 500 (server error)
- POST with labNumberRangeReport → 200, 0 bytes (no data in range, endpoint functional)
- GET `/rest/reports` → 200, namespace available
- Backend report generation works; the problem is the UI can't reach it

**14C — FHIR Integration (TC-CW-FHIR-01) — PASS**
- `/fhir/metadata` → 200, 5695 bytes (HAPI FHIR capability statement)
- `/fhir/Patient?_count=3` → 200, Bundle with 3 entries
- `/fhir/Observation?_count=1` → 200
- `/fhir/ServiceRequest` → 404 (not implemented)
- `/fhir/DiagnosticReport` → 404 (not implemented)
- `/fhir/Task` → 404, `/fhir/Specimen` → 404
- FHIR R4 base resources (Patient, Observation) functional; clinical workflow resources not yet exposed

**14D — Data Availability for E2E Tracing (TC-CX-DATA-01) — FAIL**
- **NOTE-14 (NEW, Medium):** Test instance data appears wiped — all logbook types return 0 results, patient search returns 0, referredOut returns 0
- Dashboard still shows 104 in-progress + 142 ready-for-validation (stale cache or different data source)
- E2E order lifecycle tracing not possible without test data
- Previous sessions had data (96 mycobacteriology rows, 16 patients, referral orders) — indicates periodic data reset on test instance

### Phase 15 — Notification, Alert & Error Handling ✅ COMPLETE (2026-03-28)
**Focus:** Notification panel, alert system, API error handling, session timeout, SPA routing verification
**Result:** 4 test suites, 4 PASS (100% pass rate)

**15A — Notification Panel (TC-CY-NOTIF-01) — PASS**
- Bell button in header opens notification panel correctly
- Panel has Subscribe, Reload, Mark All Read buttons — all functional
- `/rest/notifications` returns empty array (no notifications configured)
- Panel renders correctly with "no notifications" state

**15B — Alert System (TC-CZ-ALERT-01) — PASS**
- `/rest/alerts` API returns empty array (no active alerts)
- `/Alerts` page accessible via sidebar click (path-based routing)
- Alert system infrastructure present and functional; no test data to validate alert display

**15C — API Error Response Audit (TC-DA-ERROR-01) — PASS**
- Invalid endpoints return 404 with "Exception" text in response body
- **NOTE-15 (NEW, Low):** Reconfirms NOTE-7 — error responses leak server stack trace / "Exception" keyword. Should return generic error messages.
- Malformed POST bodies to valid endpoints return appropriate 4xx/5xx without stack traces in response headers

**15D — Session Timeout & SPA Routing (TC-DB-SESSION-01) — PASS**
- "Still There?" inactivity dialog appears correctly and is dismissable
- SPA uses **path-based routing** (e.g., `/Report?type=patient&report=...`, `/FindOrder`, `/SamplePatientEntry`)
- Sidebar link clicks navigate correctly — this discovery led to **BUG-23 retraction**
- Report pages render full forms (24+ inputs) when accessed via correct path-based URLs

**CRITICAL ROUTING DISCOVERY:**
OpenELIS Global uses **path-based routing** (`/SamplePatientEntry`, `/Report?type=patient&report=patientCILNSP_vreduit`), NOT hash-based routing (`#/RoutineReport`). Sidebar links use `href="/..."` attributes. Hash-based URLs were coincidentally working for some routes but are NOT the canonical routing pattern. All Playwright tests using `/#/...` routes should be corrected to use path-based URLs or sidebar click navigation.

---

### Phase 16 — Deep Operations (Print/PDF, Batch, Concurrency, FHIR, Workplan/EQA) ✅ COMPLETE (2026-03-29)
**Focus:** Print/PDF workflows, batch operations, multi-user concurrency, FHIR resource deep testing, Workplan sub-pages, EQA Distributions
**Result:** 7 test areas, 22 test cases, 100% pass rate

**16A — Print/PDF Workflow Deep Testing (14 report links + PDF generation)**
- All 14 report sidebar links render correctly via path-based routing
- PDF generation works via "Generate Printable Version" form submission (POST /ReportPrint with CSRF context)
- Direct fetch() to ReportPrint returns 403 (expected — requires form-based CSRF context)
- **NOTE-16 (NEW, Low):** PDF report header displays "null" instead of lab/site name — missing SiteInformation configuration
- **NOTE-17 (NEW, Low):** Typo "labratory" (should be "laboratory") in External Referrals Report sidebar link

**16B — Batch Operations Deep Testing**
- Batch Test Reassignment page (/MasterListsPage/batchTestReassignment) renders correctly
- Sample type dropdown, current test dropdown, replacement test dropdown all functional
- Ok/Cancel buttons present and interactive
- Checkboxes for "Check all not started" and "Check all in progress" present

**16C — Multi-User Concurrency Testing**
- 20 parallel API requests to /rest/home-dashboard/metrics: all returned HTTP 200 within 3160ms
- No session invalidation, no degradation, no error responses
- Server handles concurrent requests correctly

**16D — FHIR Resources Deep Testing**
- CapabilityStatement confirms exactly 5 declared resource types: Observation, OperationDefinition, Organization, Patient, Practitioner
- 4 working resources: Patient (200), Observation (200), Practitioner (200), Organization (200)
- 8 undeclared resources return 404: ServiceRequest, DiagnosticReport, Task, Specimen, Encounter, Location, Medication, MedicationRequest
- OperationDefinition declared but not tested (not a data resource)
- **Discovery:** Practitioner and Organization are functional (previously untested)

**16E — Workplan & EQA Distribution Deep Testing**
- Workplan has 4 sub-pages, all render correctly via sidebar click navigation:
  - By Test Type (/WorkPlanByTest?type=test) — 302 test type options in dropdown
  - By Panel (/WorkPlanByPanel?type=panel) — panel type dropdown functional
  - By Unit (/WorkPlanByTestSection?type=) — unit type dropdown functional
  - By Priority (/WorkPlanByPriority?type=priority) — 5 priority options (Routine, ASAP, STAT, Timed, Future STAT)
- **IMPORTANT:** Direct URL navigation to /WorkPlan redirects to API path (/api/OpenELIS-Global/WorkPlan) and returns 404. Must use sidebar click navigation.
- EQA Distribution page (/EQADistribution) renders fully:
  - Status cards: Draft Shipments, Shipped, Completed, Participants
  - Filter dropdown: All Shipments, Draft, Prepared, Shipped, Completed
  - Action buttons: Create New Shipment, Manage Participants
  - EQA Shipments section with "No distributions found" empty state
  - Participant Network section with Total/Active Participants and Average Response Rate

**Phase 16 Key Findings:**
- **NOTE-16 (NEW, Low):** Report PDF header shows "null" — missing site name configuration
- **NOTE-17 (NEW, Low):** Typo "labratory" in External Referrals Report link text
- FHIR resource mapping now fully documented (5 declared, 4 data resources functional)
- All Workplan sub-pages require sidebar click navigation (not direct URLs)
- EQA Distribution module is present and functional with comprehensive UI

---

### Phase 17 — Remaining Module Deep Testing ✅ COMPLETE (2026-03-29)
**Focus:** Storage Management & Cold Storage Monitoring, Pathology/IHC/Cytology dashboards, Billing, Aliquot, NoteBook
**Result:** 8 test areas, 15 test cases, 14 PASS, 1 FAIL (93% pass rate)

**17A — Storage Management Dashboard**
- Storage Management Dashboard (/Storage/samples) renders comprehensive UI:
  - Summary cards: Total Sample Items (2), Active (2), Disposed (0)
  - Storage Locations: 12 rooms, 14 devices, 12 shelves, 4 racks
  - 6 tab navigation: Sample Items, Rooms, Devices, Shelves, Racks, Boxes
  - Search by sample ID or location, filter by locations, filter by status
  - Data table with real data: Blood Film, Sputum, Plasma samples with accession numbers, hierarchical locations
  - 67 total data rows across all tabs
- Cold Storage Dashboard (/FreezerMonitoring?tab=0) renders fully:
  - System Status: Online with live timestamp
  - 5 tabs: Dashboard, Corrective Actions, Historical Trends, Reports, Settings
  - Status cards: Total Storage Units, Normal Status, Warnings, Critical Alerts
  - Search by Unit ID or Name, filter by Status and Device Type
  - Storage Units table with proper column headers
  - "No storage units found" empty state (no monitoring configured)

**17B — Pathology/IHC/Cytology Dashboards**
- Pathology Dashboard (/PathologyDashboard) — PASS:
  - Status cards: In Progress, Awaiting Pathology Review, Additional Pathology Requests, Complete (weekly)
  - Search by Family Name, "My cases" filter, "In Progress" dropdown
  - Table: Stage, Last Name, First Name, Technician Assigned, Pathologist Assigned, Lab Number
- Immunohistochemistry Dashboard (/ImmunohistochemistryDashboard) — PASS:
  - Same structure as Pathology with IHC-specific labels
  - Status: Cases in Progress, Awaiting Immunohistochemistry Review, Complete (weekly)
- Cytology Dashboard (/CytologyDashboard) — PASS:
  - Similar structure with cytology-specific labels
  - "Select Technician" and "CytoPathologist Assigned" columns
  - "Items per page" selector with pagination

**17C — Billing**
- **NOTE-18 (NEW, Medium):** Billing sidebar link has `href=null` — clicking it does nothing. No Billing page exists in the React SPA. This is a stub/placeholder sidebar entry with no implemented page behind it.

**17D — Aliquot**
- Aliquot page (/Aliquot) — PASS:
  - "Search Sample" with "Enter Accession Number" input (0/23 max length)
  - "Search" button
  - Clean, minimal UI appropriate for aliquot management

**17E — NoteBook**
- **NOTE-19 (NEW, Medium):** NoteBook Dashboard (/NotebookDashboard) renders a completely blank page — no header, no sidebar, no content. Page title is just "OpenELIS" (not the full LIMS title). The route exists but the component renders nothing. This is a broken page.

**Phase 17 Key Findings:**
- **NOTE-18 (NEW, Medium):** Billing sidebar link is a stub (href=null) with no page implemented
- **NOTE-19 (NEW, Medium):** NoteBook Dashboard renders blank page — broken route/component
- Storage module is surprisingly comprehensive with real data and 6-tab management interface
- Cold Storage Monitoring is a fully-featured temperature monitoring module
- All 3 specialty dashboards (Pathology, IHC, Cytology) follow consistent design patterns

---

### Phase 18 — Non-Conform, Analyzers Deep, Help Menu (2026-03-29)

| Sub-phase | Scope | Suites | TCs | Pass Rate |
|-----------|-------|--------|-----|-----------|
| 18A | Non-Conform module (3 sub-pages) | DR-DT | 3 | 100% |
| 18B | Analyzers deep (List, Error Dashboard, Types) | DU-DW | 3 | 100% |
| 18C | Help menu (User Manual, Video Tutorials, Release Notes) | DX-DZ | 3 | 67% |
| **Total** | | **9 suites** | **9 TCs** | **89%** |

**18A — Non-Conform Module**
- **Report Non-Conforming Event** (`/ReportNonConformingEvent`): Fully functional search form with Search By dropdown (Last Name, First Name, Patient ID Code, Lab Number), Text Value input, Search button. Validation works ("Please Enter Value"), search returns "No data found" for non-matches. PASS.
- **View New Non-Conforming Events** (`/ViewNonConformingEvent`): Same search form pattern. Renders correctly. PASS.
  - **NOTE-20 (NEW, Low):** Heading reads "View New Non Conform Event" — inconsistent naming: missing hyphen and "-ing" suffix vs sidebar label "View New Non-Conforming Events". Also "Nonconforming Events Corrective Action" heading on the corrective actions page uses yet another naming style (one word, no hyphen).
- **Corrective Actions** (`/NCECorrectiveAction`): Same search form pattern. Renders correctly. PASS.

**18B — Analyzers Deep**
- **Analyzers List** (`/analyzers`): Rich management dashboard with summary cards (Total=1, Active=0, Inactive=0, Plugin Warnings=1), search bar, Status filter, data table (Name, Type, Connection, Test Units, Status, Last Modified, Actions). Real data: "Test Analyzer Alpha" — HEMATOLOGY, 192.168.1.100:5000, Plugin Missing badge. "Add Analyzer +" button. PASS.
- **Error Dashboard** (`/analyzers/errors`): Comprehensive error tracking with summary cards (Total Errors=0, Unacknowledged=0, Critical=0, Last 24 Hours=0), 3 filter dropdowns (Error Type, Severity, Analyzer), data table (Timestamp, Analyzer, Type, Severity, Message, Status, Actions), "Acknowledge All" button. PASS.
- **Analyzer Types** (`/analyzers/types`): Type management with search, "Create New Analyzer Type +" button, data table (Name, Description, Protocol, Plugin Class, Identifier Pattern, Generic Plugin, Plugin Loaded, Instances, Status). 2 real rows: "Test Analyzer Type" and "Test Type ASTM", both ASTM protocol, Active. PASS.

**18C — Help Menu**
- **User Manual** (sidebar Help > User Manual, header Help panel > User Manual): Opens `/docs/UserManual` → redirects to `/OpenELIS-Global/documentation/OEGlobal_UserManual_en.pdf` in new tab. 196-page PDF with proper OpenELIS Global branding. PASS.
- **NOTE-21 (NEW, Medium):** Video Tutorials and Release Notes buttons in header Help panel are non-functional stubs — `<button>` elements with no href, no onclick handler, no navigation. Clicking them does nothing. They appear in the header Help dropdown but not in the sidebar Help menu.

**Phase 18 Key Findings:**
- **NOTE-20 (NEW, Low):** Non-Conform heading naming inconsistencies across pages
- **NOTE-21 (NEW, Medium):** Video Tutorials and Release Notes Help buttons are non-functional stubs
- Analyzers module is surprisingly comprehensive with real analyzer data and full CRUD interface
- Non-Conform module follows consistent search-form pattern across all 3 sub-pages
- Help architecture split: sidebar has only User Manual; header panel has all 3 items

---

### Phase 19 — Deeper Interaction Testing (2026-03-29)

| Sub-phase | Scope | Suites | TCs | Pass Rate |
|-----------|-------|--------|-----|-----------|
| 19A | Analyzer Actions Menu (kebab, 6 actions) | EA-EB | 2 | 50% |
| 19B | Analyzer Search + Type Creation | EC-ED | 2 | 100% |
| 19C | Notifications + User panels | EE-EF | 2 | 100% |
| 19D | Global Search (match + no-match) | EG-EH | 2 | 100% |
| **Total** | | **8 suites** | **8 TCs** | **88%** |

**19A — Analyzer Actions Menu Deep**
- Kebab menu on Analyzers List has 6 actions: Field Mappings, Test Connection, Configure File Import, Copy Mappings, Edit, Delete
- **Field Mappings** (`/analyzers/2/mappings`): Full mapping config page with stats cards, Pending Unmapped Codes, Query Analyzer / Test Mapping / Save Mappings buttons, Analyzer Fields table, Mappings Summary panel. PASS.
- **Edit**: Opens pre-populated modal with all analyzer fields (Name, Status, Plugin Type, Analyzer Type, Protocol Version, IP, Port). PASS.
- **Configure File Import**: Opens "Add File Import Configuration" modal with Analyzer, File Format (CSV), Import Directory, File Pattern, Archive Directory, Error Directory, Column Mappings (JSON). PASS.
- **Copy Mappings**: Opens modal with Source Analyzer info, Target Analyzer dropdown, overwrite warning. PASS.
- **Delete**: Opens confirmation dialog but shows literal `{name}` placeholder instead of actual analyzer name. FAIL.
  - **NOTE-22 (NEW, Low):** Delete Analyzer confirmation dialog text shows `{name}` template variable instead of interpolated analyzer name ("Test Analyzer Alpha").

**19B — Analyzer Search & Type Creation**
- **Analyzer List Search**: Search box filters table in real-time, URL updates with `?search=` param. "Test" matches, "zzzzz" returns empty table with 0 counts. PASS.
- **Create New Analyzer Type**: Modal with Name (required), Description, Protocol (ASTM default), Plugin Class Name, Identifier Pattern (regex helper text), Generic Plugin checkbox, Active checkbox (default checked). "Name is required" validation fires correctly. PASS.

**19C — Notifications & User Panels**
- **Notifications Panel**: Slide-in from right with Reload, Subscribe on this Device, Mark all as Read, Show read buttons. Empty state illustration with "You're all caught up" message. Arrow button for full notifications page. PASS.
- **User Panel**: Shows Open ELIS link, Logout button, Select Locale dropdown (English), Version: 3.2.1.3. PASS.

**19D — Global Search**
- **Matching Search**: Searching "patient" returns instant dropdown with "Results: 1" badge, patient card showing "QANEWPATIENT Test ♀ Female 15/06/1990, National ID: QA-NP-001" with avatar initials "QT". PASS.
- **Non-Matching Search**: "xyznonexistent" returns no dropdown, no results, no empty state message.
  - **NOTE-23 (NEW, Low):** Global search shows no "No results found" empty state message for non-matching queries — just nothing happens. Minor UX gap.

**Phase 19 Key Findings:**
- **NOTE-22 (NEW, Low):** Delete Analyzer dialog shows `{name}` placeholder — template variable not interpolated
- **NOTE-23 (NEW, Low):** Global search has no empty state for zero results
- Analyzer module has comprehensive CRUD with 6 kebab actions including File Import Config and Copy Mappings
- Notifications panel supports push subscription ("Subscribe on this Device")
- Global search is patient-centric with instant results and rich patient cards

---

### Phase 20 — Deep Form Submission, CRUD, Calculated Values & Reflex Tests (Completed 2026-03-30)

**Suites added:** 12 | **Test cases added:** 27 | **Pass rate:** ~93% (25/27)

**Phase 20A — Add Order CRUD:**
- TC-ORD-CREATE-01: Order creation via 4-step wizard (Patient→Program→Sample→Order) — PASS
- TC-ORD-CREATE-02: Auto-generated lab number format validation (YY-SITE-NNN-NNL) — PASS
- TC-ORD-READ-01: Edit Order loads persisted data by accession number — PASS
- TC-ORD-UPDATE-01: Edit Order allows field modification and re-save — PASS
- TC-ORD-CANCEL-01: Sample step has removeSample/canceled checkboxes — PASS
- **NOTE-24 (OGC-510, Low):** Typo "Succesfuly saved" on order success page
- **NOTE-25 (OGC-511, Medium):** Submit button enables despite "Requester Last Name is required" validation error

**Phase 20B-C — Reflex & Calculated Values Admin:**
- TC-REFLEX-API-01: 14 active reflex rules returned via REST API — PASS
- TC-REFLEX-ADMIN-01: Reflex Tests Management link redirects to legacy page (not yet migrated to React) — PASS (expected)
- TC-CALC-ADMIN-01: Calculated Value Tests link redirects to legacy page (not yet migrated to React) — PASS (expected)

**Phase 20D — Patient CRUD:**
- TC-PAT-CREATE-01: New Patient form — create with National ID, name, gender, DOB, phone — PASS
- TC-PAT-READ-01: Search patient by last name, view in results table — PASS
- TC-PAT-READ-02: Select patient from results, form populates all saved fields — PASS
- TC-PAT-UPDATE-01: Modify first name and save, verify update persists — PASS
- TC-PAT-AGE-CALC-01: DOB auto-calculates Age/Years/Months/Days — PASS
- TC-PAT-PHONE-VAL-01: Phone field validates xxxx-xxxx format — PASS
- TC-PAT-HISTORY-01: Patient History page loads with search form — PASS
- TC-PAT-MERGE-01: Patient Merge page loads with 3-step wizard — PASS

**Phase 20E — Results Entry & Validation Workflow:**
- TC-RESVAL-LOAD-01: ResultValidation page loads with test unit dropdown, shows Hematology results — PASS
- TC-RESVAL-TABLE-01: Validation table has correct columns (Sample Info, Test Name, Normal Range, Result, Save, Retest, Notes, Past Notes) — PASS
- TC-RESVAL-BULK-01: Bulk actions present — Save All Normal, Save All Results, Retest All Tests — PASS
- TC-ACCVAL-SEARCH-01: AccessionValidation search by accession number returns correct result — PASS
- TC-LOGBOOK-LOAD-01: LogbookResults (Results Entry) page loads with editable results table — PASS
- TC-PATRES-LOAD-01: PatientResults page loads with patient search form — PASS
- TC-ACCRES-LOAD-01: AccessionResults page loads with accession search — PASS
- TC-RESVALDATE-LOAD-01: ResultValidationByTestDate page loads with date picker — PASS
- TC-RESVAL-WORKFLOW-01: Full validation workflow — check Save → click Save → result removed from queue (5→4) — PASS
- **NOTE-26 (OGC-512, Low):** Typo "Orginal Result" in Past Notes column (should be "Original Result")

**Phase 20 Key Findings:**
- **NOTE-24 (OGC-510, Low):** Typo "Succesfuly saved" on order success page heading
- **NOTE-25 (OGC-511, Medium):** Order submit button enables despite active validation errors in React state
- **NOTE-26 (OGC-512, Low):** Typo "Orginal Result" in validation Past Notes column
- Reflex Tests and Calculated Values admin pages are legacy-only (not yet migrated to React)
- Patient form phone validation blocks Save even when phone is empty (optional field triggers validation)
- DOB→Age auto-calculation works correctly (35y 9m 14d for 15/06/1990)
- No success toast/notification shown after patient save — form just silently clears
- Normal Range column empty on all validation/results rows (no reference ranges configured)
- Dashboard metrics: 105 awaiting result entry, 142 awaiting review

**Phase 21 — Report Generation, Data Export, Electronic Orders, Referrals, Audit Trail (7 suites, 12 TCs — 12 PASS, 0 FAIL):**
- TC-RPT-PATIENT-01: Patient Status Report page loads with 3 parameter sections (By Patient/Lab Number/Site) — PASS
- TC-RPT-PATIENT-PDF-01: Patient Status Report PDF generation by lab number — PASS (NOTE-27: null values in Contact Tracing fields)
- TC-RPT-STATS-01: Statistics Report page loads with lab unit/priority/timeframe/year parameters — PASS
- TC-RPT-STATS-PDF-01: Statistics Report PDF generation (Hematology, 2026) — PASS
- TC-RPT-SUMMARY-01: Test Report Summary page loads with date range pickers — PASS
- TC-RPT-SUMMARY-PDF-01: Test Report Summary PDF generation (3-page report with real data) — PASS (NOTE-28: report.labName.two i18n key leak)
- TC-RPT-AUDIT-01: Audit Trail page loads with Lab No search and results table — PASS
- TC-RPT-AUDIT-02: Audit Trail search returns 21 audit items with full order lifecycle — PASS
- TC-RPT-CSV-01: WHONET/CSV Export page loads with date/study type/date type parameters — PASS
- TC-EORDER-01: Electronic Orders (Incoming Test Requests) page loads with dual search modes — PASS
- TC-REFERRAL-01: Referrals page loads with patient search, results table, date/test/unit filtering — PASS
- TC-RPT-MENU-01: Report menu tree — 11 report pages across 4 categories (Routine, Aggregate, Management, WHONET) — PASS
- **NOTE-27 (OGC-513, Low):** Patient Status Report PDF shows literal "null" for Contact Tracing Index Name/Record Number
- **NOTE-28 (OGC-514, Low):** Summary of All Tests report header shows raw i18n key `report.labName.two` instead of resolved lab name

**Phase 22 — Management Reports Complete, Batch Entry, Barcode, Batch Reassignment (6 suites, 12 TCs — 12 PASS, 0 FAIL):**
- TC-RPT-REJECT-01: Rejection Report page loads with date range pickers — PASS
- TC-RPT-ACTIVITY-TEST-01: Activity Report By Test — date range + test type dropdown — PASS
- TC-RPT-ACTIVITY-PANEL-01: Activity Report By Panel — date range + panel type dropdown — PASS
- TC-RPT-ACTIVITY-UNIT-01: Activity Report By Test Section — date range + unit type dropdown — PASS
- TC-RPT-REFERRED-01: External Referrals Report — date range + referral center dropdown — PASS
- TC-RPT-NC-DATE-01: Non Conformity Report by Date — date range pickers — PASS
- TC-RPT-NC-UNIT-01: Non Conformity Report by Unit and Reason — date range pickers — PASS
- TC-RPT-DELAYED-01: Delayed Validation — auto-generates PDF with 141 tests across 14 sections — PASS
- TC-BATCH-ENTRY-01: Batch Order Entry Setup — order fields, barcode config, optional fields — PASS
- TC-BARCODE-01: Print Bar Code Labels — label sets, specimen labels, site name, sample type — PASS
- TC-BATCH-REASSIGN-01: Batch Test Reassignment — sample type, current/replacement test dropdowns — PASS
- TC-SAMPLE-ENTRY-01: Add Order / SamplePatientEntry 4-step wizard — PASS
- Observation: "Non ConformityReport by Date" title missing space (cosmetic, same as "StatisticsReport")
- All 3 Activity Report sub-pages follow consistent date range + type dropdown pattern
- Delayed Validation is parameterless — directly generates PDF (unique among report pages)

---

### Phase 23 — E2E Rejection Workflow Verification (30 Mar 2026)

**Objective**: Verify that samples rejected via Order Entry and Edit Order appear in the Rejection Report and Non-Conforming Events.

**Test Steps Executed**:
1. **Reject at Order Entry** — Created order 26CPHL00009M, rejected Whole Blood sample with reason "Incorrect quantity of the sample", selected HGB test. Saved successfully. ✅
2. **Reject via Edit Order** — Modified existing order 26CPHL00008L, added new Whole Blood sample with "Reject Sample" checked, reason "The sample received is coagulated", selected HGB test. Saved successfully. ✅
3. **Rejection Report PDF** — Navigated to Reports > Management Reports > Rejection Report, set date range 01/03/2026–30/03/2026, clicked Generate Printable Version. **HTTP 503 "Check server logs"**. ❌ FAIL
4. **Non-Conforming Events** — Searched View New Non-Conforming Events by Lab Number for both 26CPHL00009M and 26CPHL00008L. **"No Data Found"** for both. ❌ FAIL
5. **Dashboard Counter** — "Orders Rejected: Rejected By Lab Today" remained at 0 after both rejections. ❌ FAIL

**Bugs Found**:
- **OGC-515** (High): Rejected samples not appearing in Rejection Report or Non-Conforming Events; Report PDF returns 503. Samples rejected via "Reject Sample" checkbox are stored in sample_item fields but NOT created as qa_event/NCE records, making them invisible to reporting and quality management workflows.

**Phase 23 Results**: 5 test steps, 2 PASS (rejection saves), 3 FAIL (report/NCE/dashboard)
**Cumulative**: 328 TCs, 150+ suites, ~92% pass rate across Phases 1-23

---

### Phase 23B — Admin Configuration Deep Testing (2026-03-30)

**Objective**: Deep test all General Configuration sub-pages, Provider Management, and Organization Management under the Admin section (`/MasterListsPage`). Document page structure, form types, field inventories, and interaction patterns.

**Pages Tested (10 General Config sub-pages + 2 CRUD management)**:

| # | Page | Route | Items | Form Types |
|---|------|-------|-------|------------|
| 1 | Site Information | `/SiteInformationMenu` | 20 | Boolean, Text |
| 2 | Site Branding | `/SiteBrandingMenu` | N/A | File upload, Color picker, Checkbox |
| 3 | NonConformity Configuration | `/NonConformityConfigurationMenu` | 4 | Boolean |
| 4 | MenuStatement Configuration | `/MenuStatementConfigMenu` | 0 | (empty) |
| 5 | WorkPlan Configuration | `/WorkPlanConfigurationMenu` | 3 | Boolean |
| 6 | Result Entry Configuration | `/ResultConfigurationMenu` | 13 | Boolean, Text |
| 7 | Patient Entry Configuration | `/PatientConfigurationMenu` | 7 | Boolean |
| 8 | Printed Report Configuration | `/PrintedReportsConfigurationMenu` | 9 | Boolean, Text, Image |
| 9 | Order Entry Configuration | `/SampleEntryConfigurationMenu` | 14 | Boolean, Text, Numeric |
| 10 | Validation Configuration | `/ValidationConfigurationMenu` | 4 | Text (charset regex) |
| 11 | Provider Management | `/providerMenu` | 40 providers | CRUD modal (Add/Modify/Deactivate) |
| 12 | Organization Management | `/organizationManagement` | 4726 orgs | CRUD full-page form |

**Three Config Edit Form Types Discovered**:
1. **Boolean**: True/False radio buttons (e.g., "24 hour clock")
2. **Text**: Standard text input (e.g., "Address line 1 label" = "Street")
3. **Image**: File upload + preview + "Remove Image" checkbox (e.g., headerLeftImage)

**Bugs Found**:
- **BUG-30** (Medium): bannerHeading Modify causes indefinite loading spinner — selecting the bannerHeading config item and clicking Modify results in a permanent loading spinner. Reproduced twice. Likely caused by the bilingual text value format.

**Phase 23B Results**: 20 TCs (Suites FJ + FK), 19 PASS, 1 FAIL (bannerHeading hang)
**Cumulative**: 348 TCs, 152+ suites, ~92% pass rate across Phases 1-23B

---

### Phase EQA-DEEP — EQA Module Deep Testing (March 31, 2026)

**Scope:** Comprehensive deep testing of all EQA module pages in v3.2.1.3, cross-referenced against the EQA FRS v1.0 (targeting v3.2.3.0) and the Enrollment Addendum v3.0. Explored live pages, documented all UI elements, form fields, dropdown options, and mapped implementation against spec.

**Pages Tested:**

| # | Page | Route | Key Elements | Status |
|---|------|-------|-------------|--------|
| 1 | EQA Distribution Dashboard | `/EQADistribution` | 4 stat cards, shipment filter, Create/Manage buttons, Shipments section, Participant Network | PASS |
| 2 | Create New Shipment Wizard | `/EQADistribution/create` | 3-step stepper, Distribution Name/Program/Deadline fields | PASS |
| 3 | Alerts Dashboard | `/Alerts` | 4 summary cards, 3 filter dropdowns, search, 6-column data table | PASS |
| 4 | Admin Program Management | `/MasterListsPage/eqaProgram` | 3 stat cards, 3 tabs (Programs/Participants/Settings) | PASS |
| 5 | Add Program Modal | (modal on eqaProgram) | 5 fields: Name, Provider (6 opts), Category (14 opts), Frequency (4 opts), Description | PASS |
| 6 | Participants Tab | (tab on eqaProgram) | Select Program dropdown, empty state | PASS |
| 7 | System Settings Tab | (tab on eqaProgram) | Notification (3 toggles), Integration (FHIR), Performance (Z-Score), Save | PASS |

**Spec-vs-Implementation Gap Analysis:**

| Spec Feature | Spec Reference | v3.2.1.3 Status | Notes |
|-------------|---------------|-----------------|-------|
| EQA Tests sidebar parent | Addendum §1 | NOT IMPLEMENTED | Targets v3.2.3.0 |
| EQA Management sidebar parent | Addendum §1 | NOT IMPLEMENTED | Targets v3.2.3.0 |
| EQA Tests → Orders (listing) | FR-010 | NOT IMPLEMENTED | Targets v3.2.3.0 |
| EQA Tests → My Programs (self-enrollment) | FR-013 | NOT IMPLEMENTED | Targets v3.2.3.0 |
| EQA toggle on Order Entry | FR-001, BR-001 | NOT IMPLEMENTED | eqaEnabled=false in config |
| Results & Analysis views | FR-006, FR-007 | NOT IMPLEMENTED | Statistical analysis not built |
| EQA sample visual indicators | FR-002 | NOT IMPLEMENTED | No EQA badges in work queues |
| Provider as typeahead text | BR-012 | DIVERGENT | Live uses fixed dropdown (6 options) vs spec's free-text typeahead |
| Alert severity levels | FR-009 | PARTIAL | Live has 2 (Warning, Critical) vs spec's 4 (Critical, High, Medium, Low) |
| Alert table columns | FR-009 | PARTIAL | Live has 6 columns vs spec's 8 (missing Lab Section, Due Date, Lab Number, Assigned To) |
| Program modal fields | FR-011.1 | EXTENDED | Live adds Category and Frequency beyond spec |
| Alerts Dashboard | FR-009, FR-012 | IMPLEMENTED | Fully functional standalone dashboard |
| EQA Distribution | FR-004, FR-005 | IMPLEMENTED | Dashboard + Create wizard functional |
| Admin EQA Programs | FR-008, FR-011.1 | IMPLEMENTED | Full CRUD with 3 tabs |
| System Settings (Notifications/Integration/Perf) | BR-008, FR-010 | IMPLEMENTED | Toggles, thresholds, Z-Score config |

**Phase EQA-DEEP Results**: 44 TCs (Suites FK + FL + FM + FN + FO + FP), FK pending live validation, FL–FP: 41 PASS, 0 FAIL
**Jira Tickets Filed then CANCELLED**: 7 issues (OGC-518 through OGC-524) were created and then cancelled. Reason: EQA module requires enabling via Admin → General Configuration → EQA Enabled before features appear. Testing was against an incomplete version (v3.2.1.3) without this config toggle enabled. All tickets transitioned to Done with cancellation comments. Re-test needed after enabling EQA configuration.
**Cumulative**: 389 TCs, 157+ suites, ~92% pass rate across Phases 1-EQA-DEEP

### Phase 23 — Fine-Grained Form Verification (2026-03-31)

Cross-referenced against Confluence User Manual (uwdigi.atlassian.net/wiki/spaces/oeg).

#### Phase 23A — Admin General Configuration Sub-Pages (10/10 PASS)
All 10 General Config sub-pages verified:
- Site Information: 20 config keys
- Site Branding: 3 logo uploads, 3 color pickers, Save/Cancel/Reset
- NonConformity Configuration: 4 keys
- WorkPlan Configuration: 3 keys
- Result Entry Configuration: 13 keys (URL: /MasterListsPage/ResultConfigurationMenu — NOT ResultEntryConfigurationMenu)
- Patient Entry Configuration: 7 keys
- Printed Report Configuration: 9 keys
- Order Entry Configuration: 14 keys (includes eqaEnabled)
- Validation Configuration: 4 charset keys (NOTE: docs described biological validation settings — actual page has charset rules only)
- MenuStatement Configuration: 0 items, empty state (undocumented in Confluence)

**Doc-vs-Reality Gaps:**
- Validation Config: Confluence docs described "Two-person Validation", "Validation Timeout" etc. — actual page has charset validation rules only
- Site Branding: has Header Color field not in docs; docs mentioned Report Logo and Site Name Display which don't exist
- MenuStatement Configuration: completely undocumented

#### Phase 23B — Results By Test, Date or Status (PASS)
- Verified filter fields: date picker, 303 test names, 7 analysis statuses, 4 sample statuses
- Confluence says "By Test Date" — actual UI is "By Test, Date or Status" with richer filtering

#### Phase 23C — User Management Form Verification (ALL PASS)

**User List Page** (`/MasterListsPage/userManagement`):
- 24 users total, pagination (20 per page)
- Search: live filter "Search By User Names..."
- Filters: "By Lab Unit Roles" dropdown, "Only Active" checkbox (filters to 18), "Only Administrator" checkbox (filters to 1)
- Table: Select, First Name, Last Name, Login Name, Password Expiration Date, Account Locked, Account Disabled, Is Active, User Time Out (minutes)
- Actions: Modify (enabled on select), Deactivate (enabled on select), Add (always active)

**Add User Form** (`/MasterListsPage/userEdit?ID=0`):
- Fields: Login Name*, Password* (pre-filled with rules), Repeat Password*, First Name*, Last Name*, Password Expiration Date* (default 01/04/2036), User Time Out (minutes)* (default 480), Account Locked (Y/N, default N), Account Disabled (Y/N, default N), Is Active (Y/N, default Y)
- **BUG-20 RECONFIRMED**: Login Name field has `data-invalid="true"`, `aria-invalid="true"`, CSS class `cds--text-input--invalid` even with valid value. Also has typo in class: `defalut` instead of `default`
- Roles section:
  - Global Roles (6): Analyser Import, Audit Trail, Cytopathologist, Global Administrator, Pathologist, User Account Administrator
  - Lab Unit Roles: dropdown with 15 lab units (All Lab Units, HIV, Malaria, Microbiology, Molecular Biology, Mycobacteriology, Sero-Surveillance, Biochemistry, Hematology, Immunology, Cytology, Serology, Virology, Pathology, Immunohistochemistry)
  - Per-unit permissions (5): All Permissions, Reception, Reports, Results, Validation
  - "Copy Permissions From User" with Apply button
  - Add New Permission / Remove Permission buttons
- Save (disabled until valid) + Exit buttons

**Modify User Form** (`/MasterListsPage/userEdit?ID=1-2`):
- Same fields as Add, pre-populated with selected user data
- Login Name does NOT show invalid state in modify mode (BUG-20 is Add-only)

#### Phase 23D — Edit Order (Modify Order) Detailed Verification (ALL PASS)

**Search Page** (`/SampleEdit?type=readwrite`):
- Search By Accession Number: text field (0/23 char limit), Submit button
- Search By Patient: Patient Id, Previous Lab Number (0/23), Last Name, First Name, Date of Birth, Gender (Male/Female), Client Registry Search toggle, Search + External Search buttons
- Patient Results table: Last Name, First Name, Gender, DOB, Unique Health ID, National ID, Data Source Name

**Modify Order — Step 1 (Program Selection)**:
- Patient header card: avatar, name, gender, DOB, National ID, Accession Number
- Program dropdown (read-only): Routine Testing
- Next button

**Modify Order — Step 2 (Add Sample)**:
- Current Tests table: Lab Number, Sample Type, Collection Date (editable), Collection Time (editable), Remove Sample, Test Name, Results Recorded, Cancel Test
- Available Tests table: Lab Number, Sample Type, Test Name, Assign checkbox
- Available tests for Whole Blood: WBC, RBC, HGB, HCT, MCV (5 tests)
- Add Order section: Sample type dropdown, Reject Sample checkbox, Quantity, Sample Unit Of Measure (26+ units), Collection Date/Time, Collector, Storage Location (with Expand), Label quantities (Order + Specimen labels with +/-), Order Panels search, Available Tests search, Refer test to reference lab checkbox, Add Sample + button

**Modify Order — Step 3 (Add Order)**:
- 21 fields total:
  - Lab Number* (0/23), Priority (ROUTINE, ASAP, STAT, Timed, Future STAT)
  - Request Date, Received Date, Reception Time, Date of next visit
  - Search Site Name*, ward/dept/unit (Inpatient Ward, Outpatient Clinic, Emergency)
  - Search Requester*, Provisional Clinical Diagnosis
  - Requester's FirstName*, Requester's LastName*, Requester Phone, Requester's Fax Number, Requester's Email
  - Patient payment status (normalCash, normalInsurance, reducedCash, reducedInsurance)
  - Sampling performed for analysis (B1, J0, J15, M1, M3, M6, M12, Other), if Other specify
  - Remember site and requester checkbox
- RESULT REPORTING section
- Back + Submit buttons

#### Phase 23E — Batch Order Entry Setup Verification (ALL PASS)

**Setup Page** (`/SampleBatchEntrySetup`):
- ORDER section: Current Date, Current Time, Received Date, Reception Time
- Form* dropdown: Routine, EID, Viral Load
- Sample section (appears after Form selection): Sample Type dropdown (Whole Blood for Routine)
- Panels (for Whole Blood): NFS, Typage lymphocytaire, Dengue Serology (with search)
- Available Tests (for Whole Blood, 16): WBC, RBC, HGB, HCT, MCV, MCH, MCHC, PLT, RDW, MPV, LYM#, MON#, MXD#, NEU#, EOS#, BAS# (with search)
- Configure Barcode Entry: Methods (On Demand, Pre-Printed)
- Optional Fields: Facility (Site Name + Ward/Dept/Unit), Patient Info
- Next (enables after selecting ≥1 test) + Cancel buttons

#### Phase 23F — Results & Validation Pages Field-Level Verification (ALL PASS)

**Results sidebar sub-pages (6):**

1. **By Unit** (`/LogbookResults?type=`) — PASS
   - Select Test Unit dropdown: 14 units (HIV, Malaria, Microbiology, Molecular Biology, Mycobacteriology, Sero-Surveillance, Biochemistry, Hematology, Immunology, Cytology, Serology, Virology, Pathology, Immunohistochemistry)
   - Results table columns: expand arrow, copy icon, Sample Info (accession, patient, ID, gender, DOB), avatar, Test Date, Analyzer Result, Test Name, Normal Range, Accept checkbox, Result (editable)
   - NC alert banner: "⚠ = Sample or Order is nonconforming or Test has been rejected"
   - Expanded row detail: Methods dropdown (27 options: EIA, PCR, STAIN, CULTURE, PROBE, BIOCHEMICAL, Diane Test, HPLC, DNA SEQUENCING, AUTO, MANUAL, HIV_TEST_KIT, SYPHILIS_TEST_KIT, GeneXpert, AUTOMATED, WGS, RT-PCR, Illumina MiniSeq, Multiple Tube Method, MPN Method, Membrane Filtration, Microscopy, Immunoassay, DST, AST, RDT, LPA, ID), Upload file button, "Refer test to a reference lab" checkbox, Referral Reason dropdown (10 options: Test not performed, Confirmation requested, Further testing required, Reagent expired, Reagents unavailable, Equipment failure, Verification of EQA, Specimen sent for serotyping, EQA by Repeat Testing, Other), Institute field, Storage Location
   - Hematology: 14 results, 1 page
   - Pagination: Items per page (10/20/30/50/100), page selector
   - Save button

2. **By Patient** (`/PatientResults`) — PASS
   - Search: Patient Id, Previous Lab Number (0/23), Last Name, First Name, Date of Birth (dd/mm/yyyy), Gender (Male/Female radio), Client Registry Search toggle (false), Search + External Search buttons
   - Patient Results table: Last Name, First Name, Gender, Date of Birth, Unique Health ID number, National ID, Data Source Name
   - Pagination + Save

3. **By Order** (`/AccessionResults`) — PASS
   - Search: Enter Accession Number (0/23), placeholder "Enter Accession No.", Search button
   - Empty results table, Pagination + Save

4. **Referred Out** (`/ReferredOutTests`) — PASS
   - 3 search methods:
     - Search Referrals By Patient (same fields as By Patient + Patient Results table)
     - Results By Date / Test / Unit: Date Type dropdown (Sent Date, Result Date), Start/End Date, Select Test Unit, Select Test Name, "Search Referrals By Unit(s) & Test(s)" button
     - Results By Lab Number: "Scan OR Enter Manually" (0/23), "Search Referrals By Lab Number" button
   - Bottom: "Referred Tests Matching Search:", "Print Selected Patient Reports" button, "Select None" button

5. **By Range of Order numbers** (`/RangeResults`) — PASS
   - Search: "From Accesion Number" (0/23), "To Accesion Number" (0/23) — **NOTE-30: typo "Accesion" instead of "Accession" in both labels**
   - Search button, empty results table, Pagination + Save

6. **By Test, Date or Status** (`/StatusResults?blank=true`) — PASS
   - Search: Enter Collection Date (dd/mm/yyyy), Enter Recieved Date (dd/mm/yyyy) — **NOTE-31: typo "Recieved" instead of "Received"**, Select Test Name (200+ tests), Select Analysis Status (5: Not started, Canceled, Accepted by technician, Not accepted by technician, Not accepted by biologist), Select Sample Status (2: No tests have been run for this sample, Some tests have been run on this sample)
   - Search button, empty results table, Pagination + Save

**Results → Analyzer sub-menu:** Test Analyzer Alpha (1 analyzer)
**Results → Order Programs link:** `/genericProgram`

**Validation sidebar sub-pages (4):**

1. **Routine** (`/ResultValidation?type=&test=`) — PASS
   - Select Test Unit dropdown: same 14 units as Results By Unit
   - Empty results table, Pagination + Save

2. **By Order** (`/AccessionValidation`) — PASS
   - Enter Accession Number (0/23), placeholder "Enter Lab No", Search, Pagination + Save

3. **By Range of Order Numbers** (`/AccessionValidationRange`) — PASS
   - "Load Next 99 Records Starting at Lab Number" (0/23), placeholder "Enter Lab No", Search, Pagination + Save

4. **By Date** (`/ResultValidationByTestDate`) — PASS
   - Enter Test Date (dd/mm/yyyy with calendar), Search, Pagination + Save

**Phase 23F New Notes:**
- NOTE-30: Typo "Accesion" (missing 's') on RangeResults page in both "From" and "To" labels
- NOTE-31: Typo "Recieved" (i/e transposed) on StatusResults page date label

#### Phase 23G — Workplan & Non-Conform Pages Field-Level Verification (ALL PASS)

**Workplan sidebar sub-pages (4):**

1. **By Test Type** (`/WorkPlanByTest?type=test`) — PASS
   - "Search By Test Type" heading
   - Select Test Type dropdown: 302 test types (full catalog)
   - "Test Type" column header below

2. **By Panel** (`/WorkPlanByPanel?type=panel`) — PASS
   - "Search By Panel Type" heading
   - Select Panel Type dropdown: 41 panels (Xpert MTB/RIF Ultra, Xpert MTB/XDR, TB FL-DST, TB SL-DST, AFR, Poliovirus Testing, NFS, Coliform Analysis ×2, Water Testing ×2, Typage lymphocytaire, Serologie VIH, Bilan Biochimique, Dengue, Dengue Serology, Measles IgM, Faeces M/C/S, FL-DST/SL-DST (Sputum), AST panels ×12, M. leprae Microscopy, P. falciparum/Malaria Detected, and more)

3. **By Unit** (`/WorkPlanByTestSection?type=`) — PASS
   - "Search By Unit Type" heading
   - Select Unit Type dropdown: 14 units (same as Results/Validation)

4. **By Priority** (`/WorkPlanByPriority?type=priority`) — PASS
   - "Search By Priority" heading
   - Select Priority dropdown: 5 options (Routine, ASAP, STAT, Timed, Future STAT — matches Edit Order)

**Non-Conform sidebar sub-pages (3):**

1. **Report Non-Conforming Event** (`/ReportNonConformingEvent`) — PASS
   - "Report Non-Conforming Event (NCE)" heading
   - Search By dropdown (4 options: Last Name, First Name, Patient Identification Code, Lab Number)
   - Text Value text field, Search button

2. **View New Non-Conforming Events** (`/ViewNonConformingEvent`) — PASS
   - "View New Non Conform Event" heading
   - Same search form as Report NCE (Search By + Text Value + Search)

3. **Corrective actions** (`/NCECorrectiveAction`) — PASS
   - "Nonconforming Events Corrective Action" heading
   - Same search form (Search By + Text Value + Search)

### Phase 23H — Add Order Wizard (Full 4-Step) Field-Level Verification
**Date:** 2026-03-31
**Focus:** Complete field inventory of the Add Order 4-step wizard at `/SamplePatientEntry`

**Step 1 — Patient Info** (2 tabs):

*Search for Patient tab:*
- Patient Id (text, placeholder "Enter Patient Id")
- Previous Lab Number (text, 0/23 counter)
- Last Name (text)
- First Name (text)
- Date of Birth (date picker dd/mm/yyyy)
- Gender (radio: Male, Female)
- Search button, External Search button
- Client Registry Search toggle (default: false)
- Patient Results table: 7 columns (Last Name, First Name, Gender, Date of Birth, Unique Health ID number, National ID, Data Source Name)
- Pagination: Items per page 100

*New Patient tab:*
- Add Photo (upload area)
- Unique Health ID number (text)
- National ID* (required, red validation "National ID Required")
- Last Name (text)
- First Name (text)
- Primary phone:xxxx-xxxx (text)
- Gender* (required, radio: Male, Female)
- Date of Birth* (required, date picker dd/mm/yyyy)
- Age/Years, Months, Days (numeric calculators)
- **Emergency Contact Info** (expandable accordion):
  - Contact last name, Contact first name, Contact Email, Contact Phone:xxxx-xxxx
- **Additional Information** (expandable accordion):
  - Quick Address Search (search field, "type at least 2 characters")
  - Health Region dropdown: 21 regions (Papua New Guinea provinces: Autonomous Region of Bougainville, Central, Chimbu, East New Britain, East Sepik, Eastern Highlands, Enga, Gulf, Hela, Jiwaka, Madang, Manus, Milne Bay, Morobe, New Ireland, Northern, Southern Highlands, West New Britain, West Sepik, Western, Western Highlands)
  - Health District dropdown: cascading (dependent on Health Region selection)
  - Education dropdown: 4 options (none, primary, secondary, upper)
  - Marital Status dropdown: 7 options (Defacto, Never married, divorced, livingWith, married, single, widowed) — **NOTE-32:** HTML id="maritialStatus" (typo, should be "maritalStatus"); helper text "Enter Martial Status" (typo, should be "Marital")
  - Nationality dropdown: 294 nationalities (AFGHAN through ZIMBABWEAN)
  - Specify Other nationality (text)

**Step 2 — Program Selection:**
- Program dropdown (id="additionalQuestionsSelect"): 15 programs
  1. Routine Testing
  2. People living with HIV Program - Initial Visit
  3. People living with HIV Program - Follow-up Visit
  4. Cytology
  5. Immunohistochemistry
  6. Histopathology
  7. National Tuberculosis Program
  8. HIV Program Early Infant Diagnosis
  9. HIV Viral Load
  10. AFR Case Investigation Form
  11. SLIDE BANK COLLECTION DATA
  12. Water Testing
  13. Food Testing
  14. Polio Environmental Surveillance
  15. Acute Flaccid Paralysis CIF

**Step 3 — Add Sample:**
- Sample 1* (required section with "Remove Sample" link)
- Select sample type dropdown: 1 type visible for Routine Testing ("Whole Blood") — NOTE: likely program-dependent
- Reject Sample checkbox
- Quantity (numeric text)
- Sample Unit Of Measure dropdown: 45 units (ppl, %, ppm, mm3, mg/dl, mlU/ml, u/L, ug/dL, g/dl, million/uL, mille/mm^3, K/mm^3, pg, mns, micron^3, cp/mL, ui/ml, mU/ml, mm/h, Vol%, million/mm^3, g/l, Ul/l, mg/L, ug/l, UI/L, copies/ml, mille/mm3, fl, /mm3, copies/mL, μl, million/mm3, g/dL, 10^3/µl, 10^6/µl, Cell/µl, parasites/uL blood, Ratio, ISR, cfu/100ml, ºC, ntu, FAC, copies)
- Collection Date (date picker dd/mm/yyyy)
- Collection Time (auto-populated, e.g., 08:41)
- Collector (text)
- Storage Location: Not assigned / Expand
- **Label quantities:**
  - Order labels (numeric, default 1, +/- controls)
  - Specimen labels sample 1 (numeric, default 1, +/- controls)
  - Running total: 2
- **Order Panels:**
  - Search through available panels (search field, "Choose Available panel")
  - Search through available tests (search field, "Choose Available Test")
- Refer test to a reference lab (checkbox)
- Add Sample + (button to add additional samples)
- Back / Next navigation

**Step 4 — Add Order:**
- Lab Number* (required, 0/23 counter, "Scan OR Enter Manually OR Generate" link)
- Priority dropdown: 5 options (ROUTINE, ASAP, STAT, Timed, Future STAT)
- Request Date (date picker dd/mm/yyyy)
- Received Date (date picker dd/mm/yyyy)
- Reception Time (hh:mm, auto-populated)
- Date of next visit (date picker dd/mm/yyyy)
- Search Site Name* (required, search/autocomplete)
- ward/dept/unit dropdown: cascading (dependent on Site selection)
- Search Requester* (required, search/autocomplete)
- Provisional Clinical Diagnosis (text)
- Requester's FirstName* (required)
- Requester's LastName* (required)
- Requester Phone (text)
- Requester's Fax Number (text)
- Requester's Email (text)
- Patient payment status dropdown: 4 options (normalCash, normalInsurance, reducedCash, reducedInsurance)
- Sampling performed for analysis dropdown: 8 options (B1, J0, J15, M1, M3, M6, M12, Other)
- if Other specify: (text, conditional on "Other" selection)
- Remember site and requester (checkbox)
- **RESULT REPORTING** section (heading visible)
- Back / Submit buttons (Submit disabled until form complete)

**Phase 23H Summary:** 4-step wizard with ~60+ fields verified. 15 programs, 21 health regions, 294 nationalities, 45 units of measure, 5 priorities. NOTE-32 new (marital status typo in HTML id and helper text). All 4 steps render correctly and navigation works.

### Phase 23I — Reports Pages Field-Level Verification
**Date:** 2026-03-31
**Focus:** Complete field inventory of all Report pages accessible from the Reports sidebar

**Reports sidebar hierarchy (8 pages total):**

1. **Patient Status Report** (`/Report?type=patient&report=patientCILNSP_vreduit`) — PASS
   - 3 expandable accordion sections:
     - **Report By Patient:** Reuses patient search component (Patient Id, Previous Lab Number 0/23, Last Name, First Name, Date of Birth, Gender, Search/External Search, Client Registry Search toggle, Patient Results table 7 columns)
     - **Report By Lab Number:** From (0/23) and To (0/23) text fields with "Scan or Enter Manually" instructions
     - **Report By Site:** Site Name (search), ward/dept/unit dropdown, "Only Reports with results" checkbox, Date Type dropdown (Result Date), Start Date, End Date
   - "Generate Printable Version" button

2. **Statistics Report** (`/Report?type=indicator&report=statisticsReport`) — PASS
   - Lab unit checkboxes (15): All, HIV, Malaria, Microbiology, Molecular Biology, Mycobacteriology, Sero-Surveillance, Biochemistry, Hematology, Immunology, Cytology, Serology, Virology, Pathology, Immunohistochemistry
   - Priority checkboxes (6): All, Routine, ASAP, STAT, Timed, Future STAT
   - Time frame checkboxes (3): All, Normal Work hours (9h-15h30), Out of Normal Work Hours (15h31-8h59)
   - Year dropdown (2026)
   - "Generate Printable Version" button

3. **Test Report Summary (Summary of All Tests)** (`/Report?type=indicator&report=indicatorHaitiLNSPAllTests`) — PASS
   - Start Date, End Date, "Generate Printable Version" button (grayed until dates selected)

4. **Rejection Report** (`/Report?type=indicator&report=sampleRejectionReport`) — PASS
   - Start Date, End Date, "Generate Printable Version" button

5. **External Referrals Report (Referred Out Tests)** (`/Report?type=patient&report=referredOut`) — PASS
   - Start Date, End Date (date range for referrals)
   - "Referral center or labratory is required" heading (known typo from Phase 16)
   - Referral Center or Laboratory dropdown: 6 centers (Central Public Health Laboratory, Doherty Institute, Queensland Mycobacterium Reference Laboratory, Research Institute for Tropical Medicine, SYD PATH Pathology, Victorian Infectious Diseases Reference Laboratory)
   - "Generate Printable Version" button

6. **Delayed Validation** (direct API: `/api/OpenELIS-Global/ReportPrint?type=indicator&report=validationBacklog`) — PASS
   - Opens PDF in new tab: "Tests Awaiting Validation" report
   - Shows Lab Manager name (Mr Willie Porau), date, and all 15 lab sections with backlog totals
   - Baseline data captured: HIV 32, Malaria 25, Microbiology 9, Molecular Biology 7, Mycobacteriology 50, Sero-Surveillance 14, Biochemistry 0, Hematology 4, Immunology 0, Cytology 0, Serology 0, Virology 0, Pathology 0, Immunohistochemistry 0

7. **Audit Trail** (`/AuditTrailReport`) — PASS
   - Lab No field (0/23), "View Report" button
   - Patient Results table: 7 columns (Time, Item, Action, Identifier, User, Old Value, New Value)
   - Pagination: Items per page 30

8. **WHONET Report** (`/Report?type=patient&report=ExportWHONETReportByDate`) — PASS
   - "Export a CSV File by Date" heading
   - Start Date, End Date, "Generate Printable Version" button

### Phase 23J — Patient Pages Field-Level Verification
**Date:** 2026-03-31
**Focus:** Complete field inventory of all Patient sidebar pages (3 pages)

1. **Add/Edit Patient** (`/PatientManagement`) — PASS
   - "Add Or Modify Patient" heading, breadcrumb "Home / Add Or Modify Patient /"
   - Dual-tab interface: "Search for Patient" (active) / "New Patient"
   - Search tab: Same reusable patient search component as Add Order Step 1 and Patient Status Report (Patient Id, Previous Lab Number 0/23, Last Name, First Name, Date of Birth, Gender, Search/External Search, Client Registry Search toggle, Patient Results table 7 columns)
   - New Patient tab: Same new patient form as Add Order Step 1 (all fields including Emergency Contact Info and Additional Information accordions)

2. **Patient History** (`/PatientHistory`) — PASS
   - "Patient History" heading, breadcrumb "Home / Patient History /"
   - Patient search form only (no tabs): Patient Id, Previous Lab Number 0/23, Last Name, First Name, Date of Birth, Gender, Search/External Search, Client Registry Search toggle, Patient Results table 7 columns

3. **Merge Patient** (`/PatientMerge`) — PASS
   - "Merge Patient Records" heading, breadcrumb "Home / Merge Patient Records /"
   - 3-step wizard: Select Patients → Select Primary → Confirm Merge
   - Step 1: "Select First Patient" (Patient Id, First Name, Last Name, Gender, Date of Birth, Search/External Search buttons grayed), "No patient selected" placeholder, then "Select Second Patient" section

**Phase 23J Summary:** All 3 Patient pages verified. Patient search component is shared/reused across Add Order, Patient Status Report, Add/Edit Patient, and Patient History. Merge Patient uses a simplified 3-step wizard variant.

**Phase 23 Cumulative (through 23J)**: 419+ TCs + ~100 new field-level verifications (30 from 23C-E + 20 from 23F + 15 from 23G + 15 from 23H + 10 from 23I + 10 from 23J), ~94% pass rate

### Phase 23K — Storage (2 modules, 11 tabs/sub-tabs) — ALL PASS

**Storage Management Dashboard** (`/Storage/samples`)

1. **Dashboard KPIs** — PASS
   - 3 stat cards: TOTAL SAMPLE ITEMS: 2, ACTIVE: 2, DISPOSED: 0
   - STORAGE LOCATIONS badge: 12 rooms, 14 devices, 12 shelves, 4 racks

2. **Sample Items tab** (`/Storage/samples`) — PASS
   - Search: "Search by sample ID or location..."
   - Filters: "Filter by locations..." text input, "Filter by Status" dropdown (All, Active, Disposed)
   - Table 8 columns: SampleItem ID, Sample Accession, Sample Type, Status, Location, Assigned By, Assigned Date, Actions
   - Sample types: Blood Film, Sputum, Plasma, Whole Blood
   - Location format: "Lab > Freezer1 > 1", "TB PC2 > Fridge > TOPSHELF"
   - Status: green "Active" badges, Actions: 3-dot menu

3. **Rooms tab** (`/Storage/rooms`) — PASS
   - Search: "Search by room name or code..."
   - Filter: "Filter by Status" dropdown
   - "Add Room" button (blue)
   - Table 6 columns: Name (sortable ↕), Code, Devices, Samples, Status, Actions
   - 12 rooms: TB PC2 (TBPC2, 4 devices), TB PC3, STORE ROOM 1/2 (CPHLSR-1/2), REPOSITORY ROOM (CPHLRR, 1 device), COLD ROOM (CPHLCR, 2 devices), STORAGE CONTAINER, TRAINING ROOM (2 devices), TB PC2 (TBPC2-1, 2 devices), VL_Freezer, Lab (LAB, 3 devices), -40 (40 devices)
   - Each row expandable (chevron), Actions: 3-dot menu

4. **Devices tab** (`/Storage/devices`) — PASS
   - Search: "Search by device name or code..."
   - Filters: "Filter by Room" dropdown, "Filter by Status" dropdown
   - "Add Device" button (blue)
   - Table 7 columns: Name, Code, Room, Type, Occupancy, Status, Actions
   - Device types: refrigerator (blue badge), cabinet (grey badge), other (grey badge)
   - Occupancy: "0/1,000 (0%)" with "Manual Limit" label and progress bar + green checkmark
   - Visible devices: TB PC2 (refrigerator), CUPBOARD 1 (cabinet), BENCH (other), UNDER BENCH (FLOOR) (other)

5. **Shelves tab** (`/Storage/shelves`) — PASS
   - Search: "Search by shelf label..."
   - Filters: Filter by Room, Filter by Device, Filter by Status (3 dropdowns)
   - "Add Shelf" button (blue)
   - Table 5 columns: Shelf, Device, Room, Occupancy, Status, Actions
   - Shelves: TRAY 1 (0/1,000), TOP SHELF A (0/500), SHELF B (0/500), SHELF C (0/500), TOP SHELF (0/1,000)
   - All with "Manual Limit" labels, progress bars, green checkmarks

6. **Racks tab** (`/Storage/racks`) — PASS
   - Search: "Search by rack label..."
   - Filters: Filter by Room, Filter by Device, Filter by Status (3 dropdowns)
   - "Add Rack" button (blue)
   - Table 8 columns: Rack, Room, Shelf, Device, Dimensions, Occupancy, Status, Actions
   - 4 racks (all named "RACK 1" in different locations), Dimensions: "-", Occupancy: 0/0 (0%)

7. **Boxes tab** (`/Storage/boxes`) — PASS
   - Unique grid-based assignment UI (not a table like other tabs)
   - Description: "Manage boxes/plates, or select a rack and box to assign samples to coordinates."
   - **Grid Assignment** section: "Select rack" dropdown → "Select box/plate" dropdown + "Add Box/Plate" button
   - Grid preview: "Select a box to view its grid."
   - **Assign sample to box** panel: "Sample item ID or barcode" text input, "Notes (optional)" text input, "Assign" button (disabled until selection)

**Cold Storage Monitoring** (`/FreezerMonitoring?tab=0`) — Cold Storage Monitoring v2.1.0

8. **Dashboard tab** — PASS
   - Header: "Cold Storage Dashboard — Real-time temperature monitoring & compliance"
   - System Status: Online (green checkmark), last update timestamp, "Refresh" link
   - 4 KPI cards: Total Storage Units: 0, Normal Status: 0, Warnings: 0, Critical Alerts: 0
   - Search: "Search by Unit ID or Name", Filters: Status (All Status), Device Type (All Device Types)
   - Storage Units table 9 columns: Unit ID, Status, Unit Name, Device Type, Location, Current Temp, Target Temp, Protocol, Last Reading — "No storage units found."
   - Active Alerts (0): "No active alerts"

9. **Corrective Actions tab** — PASS
   - Description: "Track maintenance and repair actions for cold storage devices"
   - Search icon + "All" filter dropdown, "Add New Action +" button (blue)
   - Table 8 columns: Action ID, Status, Device, Summary, Performed By, Created, Last Updated By, Actions
   - Pagination: Items per page: 5, 0-0 of 0 items

10. **Historical Trends tab** — PASS
    - Title: "Historical Temperature Trends"
    - Filters: Freezer ("All Freezers"), Time Range ("Last 24 Hours")
    - Chart controls: Zoom In, Zoom Out, Reset, Export CSV (download icon)
    - Chart area: "No readings available for the selected filters."
    - Stats: Average Temperature (-), Min Temperature (- blue), Max Temperature (- red), Data Points (0)

11. **Reports tab** — PASS
    - Title: "Regulatory Reports"
    - Form: Report Type ("Daily Log"), Freezer ("All Freezers"), Export Format ("PDF"), Start/End date pickers
    - "Generate Report" button (blue)
    - Regulatory Compliance info: CAP, CLIA, FDA, WHO compliance noted
    - Sub-tabs: "Temperature Excursions" (Temperature Excursion History), "Audit Trail"

12. **Settings tab** — PASS
    - Title: "System Configuration" (gear icon)
    - 4 sub-tabs: Device Management, Temperature Thresholds, Alert Settings, System Settings
    - **Device Management**: 2 configured devices (QA_AUTO_Freezer ID 2, freezer, INACTIVE, port 502 TCP, TB PC2; TB PC2 ID 1, refrigerator, INACTIVE, port 502 TCP, TB PC2). Actions: edit/power/delete icons. Pagination.
    - **Temperature Thresholds**: QA_AUTO_Freezer (Target -20°C, Warning -18°C, Critical -15°C, Poll 60s), TB PC2 (Target 2°C, Warning -18°C, Critical -15°C, Poll 60s)
    - **Alert Settings**: "Alert Configuration" — Email/SMS checkboxes for 3 alert types: Temperature Alerts, Equipment Failure, Inventory Alerts (all unchecked)
    - **System Settings**: Read-only mode (deprecation notice). Protocol Config: Modbus TCP 502, BACnet UDP 47808. Security: 2FA toggle (off), Session Timeout 30 min. System Info: v2.1.0, PostgreSQL 14.5, Uptime 0d 0h 0m
    - Footer: "Cold Storage Monitoring v2.1.0 | Compliant with CAP, CLIA, FDA, and WHO guidelines | HIPAA Compliant Data Handling"

**Phase 23K Summary:** Both Storage modules fully verified — Storage Management (6 tabs with hierarchical room→device→shelf→rack→box structure and grid-based sample assignment) and Cold Storage Monitoring (5 tabs covering real-time monitoring, corrective actions, historical trends, regulatory reports, and granular system configuration). Total ~120 fields/controls verified.

**Phase 23 Cumulative (through 23K)**: 476+ TCs, ~451 passed, ~94% pass rate

### Phase 23L — Edit Order — PASS

**Edit Order / Modify Order** (`/SampleEdit?type=readwrite`)
- "Modify Order" heading, breadcrumb "Home /"
- **Section 1 — Search By Accession Number**: "Enter Accession Number" label with 0/23 counter, "Enter Lab No" text input, "Submit" button (blue)
- **Section 2 — Search By Patient**: Reusable patient search component (Patient Id, Previous Lab Number 0/23, Last Name, First Name, Date of Birth dd/mm/yyyy, Gender Male/Female radio, Search/External Search buttons, Client Registry Search toggle false)
- Patient Results table 7 columns: Last Name, First Name, Gender, Date of Birth, Unique Health ID number, National ID, Data Source Name
- Pagination: Items per page 100, page navigation

### Phase 23M — Barcode — PASS

**Print Bar Code Labels** (`/PrintBarcode`)
- "Print Bar Code Labels" heading, breadcrumb "Home /"
- **Pre-Print Barcodes section**: Number of label sets (1, -/+ stepper), Number of order labels per set (1, -/+ stepper), Number of specimen labels per set (1, -/+ stepper), Total Labels to Print (2, editable with clear X), Search Site Name text input
- **Sample section**: Sample Type dropdown ("Select sample type"), NOTE about facility/sample/test printing on every label, "Pre-Print Labels" button (disabled until configured)
- **Print Barcodes for Existing Orders section**: Enter Accession Number (0/23 counter), "Enter Lab No" text input, "Submit" button (blue)

### Phase 23N — Incoming Orders — PASS

**Search Incoming Test Requests** (`/ElectronicOrders`)
- "Search Incoming Test Requests" heading, breadcrumb "Home /"
- **Search by value**: "Search by family name, national ID number, lab number from referring lab, or passport number", Search Value text input, "All Info" checkbox, Search button (blue)
- **Search by Date, and Status**: Description about date range for referrals/electronic requests, Start Date (dd/mm/yyyy calendar), End Date (dd/mm/yyyy calendar), Status dropdown (All Statuses, Cancelled, Entered, NonConforming, Realized — 4 statuses), "All Info" checkbox, Search button (blue)

### Phase 23O — Pathology / IHC / Cytology — ALL PASS

1. **Pathology** (`/PathologyDashboard`) — PASS
   - 4 KPI cards: Cases in Progress: 0, Awaiting Pathology Review: 0, Additional Pathology Requests: 0, Complete (Week 24/03/2026 - 31/03/2026): 0
   - Search: "Search by LabNo or Family Name", Filters: "My cases" checkbox, Status dropdown
   - **10-stage workflow** status filter: Status, All, In Progress, Grossing, Cutting, Processing, Slicing for Slides, Staining, Ready for Pathologist, Additional Pathologist Request, Completed
   - Table 7 columns: Request Date, Stage, Last Name, First Name, Technician Assigned, Pathologist Assigned, Lab Number

2. **Immunohistochemistry** (`/ImmunohistochemistryDashboard`) — PASS
   - 3 KPI cards (no "Additional Requests"): Cases in Progress: 0, Awaiting Immunohistochemistry Review: 0, Complete (weekly): 0
   - Same search/filter UI, but **4-stage workflow**: Status, All, In Progress, Ready for Pathologist, Completed
   - Table 7 columns: Request Date, Stage, Last Name, First Name, Assigned Technician, Assigned Pathologist, Lab Number

3. **Cytology** (`/CytologyDashboard`) — PASS
   - 3 KPI cards: Cases in Progress: 0, Awaiting Cytopathologist Review: 0, Complete (weekly): 0
   - Same search/filter UI, but **5-stage workflow**: Status, All, In Progress, Preparing slides, Screening, Ready for Cytopathologist, Completed
   - Table 7 columns (different naming): Request Date, Status (not Stage), Last Name, First Name, Select Technician, CytoPathologist Assigned, Lab Number

**Key architectural finding:** All three dashboards (Pathology/IHC/Cytology) share the same layout pattern (KPI cards + search/filter + table) but differ in: KPI count (4 vs 3), workflow stages (10 vs 4 vs 5), and column naming conventions.

### Phase 23P — Analyzers (3 pages) — ALL PASS

1. **Analyzers List** (`/analyzers`) — PASS
   - "Analyzers > Analyzer List" heading, subtitle "Manage laboratory analyzers and field mappings"
   - "Add Analyzer +" button (blue)
   - 4 KPI cards: Total Analyzers: 1, Active: 0, Inactive: 0, Plugin Warnings: 1 (red text)
   - Search: "Search analyzers...", Filter: Status ("All Statuses")
   - Table 7 columns: Name, Type, Connection, Test Units, Status, Last Modified, Actions
   - 1 analyzer: Test Analyzer Alpha ("Plugin Missing" red badge), HEMATOLOGY, 192.168.1.100:5000, 1 unit(s), Setup status

2. **Error Dashboard** (`/analyzers/errors`) — PASS
   - "Analyzers > Error Dashboard", subtitle "View and manage analyzer errors and alerts"
   - "Acknowledge All" button (blue)
   - 4 KPI cards: Total Errors: 0, Unacknowledged: 0, Critical: 0, Last 24 Hours: 0
   - Search: "Search errors...", 3 Filters: Error Type ("All Types"), Severity ("All Severities"), Analyzer ("All")
   - Table 7 columns: Timestamp, Analyzer, Type, Severity, Message, Status, Actions

3. **Analyzer Types** (`/analyzers/types`) — PASS
   - "Analyzer Types" heading
   - Search: "Search analyzer types...", "Create New Analyzer Type +" button (blue)
   - Table 8 columns: Name, Description, Protocol, Plugin Class, Identifier Pattern, Generic Plugin, Plugin Loaded, Instances, Status
   - 2 types: Test Analyzer Type (ASTM, generic, not loaded, 0 instances, Active), Test Type ASTM (ASTM, generic, not loaded, 0 instances, Active)

**Phase 23L-P Summary:** 8 pages verified across Edit Order, Barcode, Incoming Orders, Pathology/IHC/Cytology, and Analyzers. Key findings: Pathology has 10 workflow stages vs IHC (4) vs Cytology (5), all three share layout pattern. Analyzer Types use ASTM protocol with plugin architecture. Edit Order reuses the shared patient search component.

**Phase 23 Cumulative (through 23P)**: 484+ TCs, ~459 passed, ~94% pass rate

---

### Phase 23Q-T — EQA Distribution, Non-Conform, Workplan, Aliquot, Billing, NoteBook, Help (2026-03-31)

**Goal:** Complete field-level verification of all remaining untested sidebar pages.

#### Phase 23R: EQA Distribution
- **Route:** `/EQADistribution`
- 4 KPI cards: Draft Shipments (0, Being prepared), Shipped (0, Awaiting responses), Completed (0, All responses received), Participants (0, Enrolled)
- Filter dropdown: All Shipments, Draft, Prepared, Shipped, Completed
- Action buttons: "Create New Shipment +" and "Manage Participants"
- EQA Shipments section: "No distributions found"
- Participant Network: Total 0, Active 0, Average Response Rate —

#### Phase 23S: Non-Conform (3 pages) + Workplan (4 pages)

**Non-Conform** — all 3 share identical search interface:
1. **Report NCE** (`/ReportNonConformingEvent`) — Search By (Last Name/First Name/Patient ID Code/Lab Number), Text Value, Search button — PASS
2. **View New NCE** (`/ViewNonConformingEvent`) — same layout — PASS
3. **Corrective Actions** (`/NCECorrectiveAction`) — same layout — PASS

**Workplan** — all 4 share same layout: single dropdown + results table:
1. **By Test Type** (`/WorkPlanByTest?type=test`) — 303 test types — PASS
2. **By Panel** (`/WorkPlanByPanel?type=panel`) — 42 panel types — PASS
3. **By Unit** (`/WorkPlanByTestSection?type=`) — 15 unit types — PASS
4. **By Priority** (`/WorkPlanByPriority?type=priority`) — 6 priorities (Routine/ASAP/STAT/Timed/Future STAT) — PASS

#### Phase 23T: Aliquot, Billing, NoteBook, Help
1. **Aliquot** (`/Aliquot`) — Accession Number search (0/23 char limit) — PASS
2. **Billing** — Empty href, no route, no page — FAIL (NOTE-32: not implemented)
3. **NoteBook** (`/NotebookDashboard`) — Blank page, empty root — FAIL (NOTE-33: not implemented)
4. **Help** — "User Manual" sub-item → external PDF (`OEGlobal_UserManual_en.pdf`) — PASS

**Phase 23Q-T Summary:** 12 TCs, 10 passed, 2 failed (Billing + NoteBook not implemented). EQA Distribution dashboard fully rendered with shipment management. Non-Conform and Workplan pages all functional. Aliquot and Help work correctly.

**Phase 23 Cumulative (through 23T)**: 496+ TCs, ~469 passed, ~94.6% pass rate

---

### Phase 23U-W — Batch Order Entry Deep, Alerts Dashboard, Admin Deep Pages (2026-03-31)

**Goal:** Deep field-level verification of Batch Order Entry form-specific rendering, Alerts Dashboard filters, and 6 untested Admin sub-pages.

#### Phase 23U: Batch Order Entry — Form-Specific Conditional Rendering
- **Route:** `/SampleBatchEntrySetup`
- **ORDER section:** Current Date (dd/mm/yyyy) + Current Time (hh:mm), Received Date + Reception Time
- **Form dropdown (required *):** Routine, EID, Viral Load — each reveals different Sample section:
  - **Routine** → Sample Type dropdown (Whole Blood) → Panels (NFS, Typage lymphocytaire, Dengue Serology with search) + Available Tests (16 CBC tests: WBC, RBC, HGB, HCT, MCV, MCH, MCHC, PLT, RDW, MPV, LYM#, MON#, MXD#, NEU#, EOS#, BAS# with search)
  - **EID** → Specimen Collected (Dry Tube, Dry Blood Spot) + Tests (DNA PCR)
  - **Viral Load** → Specimen Collected (Dry Tube, EDTA Tube, Dry Blood Spot) + Tests (Viral Load Test)
- **Configure Barcode Entry:** Methods (On Demand, Pre-Printed)
- **Optional Fields:** Facility (checkbox + Site Name), Patient Info (checkbox + Ward/Dept/Unit dropdown)
- **Actions:** Next (disabled until form selected), Cancel

#### Phase 23V: Alerts Dashboard
- **Route:** `/Alerts`
- 4 KPI cards: Critical Alerts (0), EQA Deadlines (0), Overdue STAT Orders (0), Samples Expiring (0)
- 3 filter dropdowns:
  - Alert Type: (blank), EQA Deadline, Sample Expiration, STAT Overdue, Unacknowledged Critical
  - Severity: (blank), Warning, Critical
  - Status: (blank), Open, Acknowledged, Resolved
- Search: "Search alerts..."
- 6-column table: Type, Severity, Message, Status, Created, Actions

#### Phase 23W: Admin Sub-Pages Deep Verification (6 pages)
1. **Barcode Configuration** (`/MasterListsPage/barcodeConfiguration`) — PASS
   - "Number Bar Code Label" — Default (Order=1, Specimen=1, Slide=1, Block=1, Freezer=1), Maximum (Order=10, Specimen=1, Slide=1, Block=1, Freezer=1)
   - "Bar Code Label Elements" — 5 label types with Height×Width in mm: Order (25×45), Specimen (25×45), Block (10×25), Slide (20×30), Freezer (25.4×76.2)
   - Save/Cancel buttons

2. **List Plugins** (`/MasterListsPage/PluginFile`) — PASS
   - Single-column table (Plugin Name), "No plugins found"

3. **Result Reporting Configuration** (`/MasterListsPage/resultReportingConfiguration`) — PASS
   - 3 reporting endpoints: Result Reporting (Disabled, URL="disable", Queue=0), Malaria Surveillance (Disabled, placeholder URL, Queue=0), Malaria Case Report (Disabled)
   - Each with Enabled/Disabled radio buttons, URL text input, Queue Size display

4. **Test Notification Configuration** (`/MasterListsPage/testNotificationConfigMenu`) — PASS
   - 7-column table: Test Id, Test names, Patient Email (checkbox), Patient SMS (checkbox), Provider Email (checkbox), Provider SMS (checkbox), Edit (gear icon)
   - 25+ test rows (ABON Tri-line HIV, Acid-Fast Microscopy, Allplex SARS-CoV-2, Amikacin, etc.)
   - Save/Exit buttons

5. **Notify User** (`/MasterListsPage/NotifyUser`) — PASS
   - Message textarea, "User to be notified *" (required) text input, Submit button

6. **Search Index Management** (`/MasterListsPage/SearchIndexManagement`) — PASS
   - "Start Reindexing" heading with explanatory text, "Start Reindexing" button

7. **Logging Configuration** (`/MasterListsPage/loggingManagement`) — PASS
   - Log Level dropdown: ALL, TRACE, DEBUG, INFO, WARN, ERROR, FATAL, OFF (default: INFO)
   - Logger Name text input (default: "org.openelisglobal", examples: org.openelisglobal, root)
   - "Apply Log Level" button

**Phase 23U-W Summary:** 10 TCs, all pass. Batch Order Entry shows form-specific conditional rendering (3 distinct sample sections for Routine/EID/Viral Load). Alerts Dashboard has 4 KPIs and 3 filter dimensions. 7 Admin sub-pages verified with full field inventories.

---

### Phase 23X — Remaining Admin Sub-Pages + Non-Executable Test Scripts (2026-03-31)

**Scope:** Test Management, Menu Configuration (5 sub-types), Reflex Tests Configuration (2 sub-pages), Localization (2 sub-pages), Application Properties, Program Entry, EQA Program Management, Legacy Admin. Plus non-executable detailed test scripts for Add Program, Reflex Tests CRUD, and Calculated Value Tests CRUD.

**Executed Test Cases (read-only verification):**

1. **Test Management** (`/MasterListsPage/testManagementConfigMenu`) — PASS
   - "Spelling corrections" section with 7 rename options: test names, panels, sample types (NOTE-34: description copy-paste error says "panels"), test sections, unit of measure entries, result list options, method names
   - Each is a clickable link card

2. **Global Menu Configuration** (`/MasterListsPage/globalMenuManagement`) — PASS
   - "Show Child Elements" toggle (default On), "Side Nav Active" master checkbox
   - Hierarchical checkbox tree with ~80+ menu items spanning: Home, Alerts, EQA Programs, Generic Sample, EQA Distributions, Order (7 sub), Patient (4 sub), Storage (Storage Mgmt 5 sub + Cold Storage 5 sub), Analyzers (3 sub), Non-Conform (3 sub), Workplan (4 sub), Pathology, IHC, Cytology, Results (8+ sub), Validation (Routine + Study sub-tree), Reports (Routine/Aggregate/Management/Study/WHONET), Admin, Billing, Aliquot, NoteBook, Inventory, Help
   - Submit button at bottom
   - Menu Configuration has 5 sub-types: Global, Billing, Non-Conform, Patient, Study

3. **Reflex Tests Management** (`/MasterListsPage/reflex`) — PASS
   - ~12 reflex rule cards: HIV Antibody S, Organism ID (T/U), MPN (Treated/Untreated), MPOX RT-PCR, Xpert MTB/RIF, Cryptococcus A, Malaria PCR/Detection, P.falciparum, Faeces Culture, HIV Antibody C
   - Each card: Rule Name (clickable link), Toggle Rule (Off/On), Active: true checkbox, "Deactivate Rule" button
   - All rules: Toggle Off, Active true
   - "+ Rule" button at bottom

4. **Calculated Value Tests Management** (`/MasterListsPage/calculatedValue`) — PASS
   - 6 Measles calculations: Positive, Negative, Borderline, IgM Positive, IgM Negative, IgM Borderline
   - All: Toggle Off, Active false
   - Same card layout as Reflex Tests
   - "+ Rule" button at bottom

5. **Language Management** (`/MasterListsPage/languageManagement`) — PASS
   - 2 languages: en (Fallback, Active, Sort 1) and fr (Francais, Active, Sort 2)
   - Table with Locale Code, Display Name, Status, Sort Order, Actions (edit/star/delete)
   - "Add Language +" button

6. **Translation Management** (`/MasterListsPage/translationManagement`) — PASS
   - Translation Progress: 2180 total entries, English 100%, Francais 51.4% (1060 missing)
   - Select Language dropdown, "Show Missing Only" + "Export CSV" buttons, search
   - Editable table: ID, Description, Fallback (English), Translation, Actions

7. **Application Properties** (`/MasterListsPage/commonproperties`) — PASS
   - 34 key-value property inputs (paging sizes all 99, FHIR config, poll frequencies, etc.)

8. **Program Entry** (`/MasterListsPage/program`) — PASS
   - 16 programs in dropdown, 15 test sections, FHIR Questionnaire JSON editor with Edit Json toggle

9. **EQA Program Management** (`/MasterListsPage/eqaProgram`) — PASS
   - 3 KPIs (Active Programs 0, Enrolled Participants 0, Total Participants 0), 3 tabs, "Add Program +" button, "No EQA programs found"

10. **Legacy Admin** (opens new tab: `/api/OpenELIS-Global/MasterListsPage`) — PASS
    - Old JSP-style 2.x interface with top nav and 21 admin links
    - Orange "training installation" banner
    - NOTE-35: "banner.menu.aliquot" and "sidenav.label.notebook" raw i18n keys in top nav

**Non-Executable Test Scripts Written (Suites GU, GV, GW):**
- **Suite GU** — Add New Program (2 TCs): Create program + verify in Order Entry + Batch Order Entry; Create programs for all 15 test sections
- **Suite GV** — Reflex Tests CRUD (3 TCs): Create new rule + verify fires on trigger result; Toggle existing rule On/Off; Edit rule details
- **Suite GW** — Calculated Value Tests CRUD (3 TCs): Create new calculation + verify computes; Activate existing Measles calculation; Full 6-rule Measles matrix test

**Phase 23X Summary:** 16 executed TCs (all PASS) + 8 non-executable scripted TCs (NOT EXECUTED). 2 new NOTEs: NOTE-34 (copy-paste description error in Test Management), NOTE-35 (untranslated i18n keys in Legacy Admin).

**Phase 23 Cumulative (through 23X)**: 522+ TCs executed, ~495 passed, ~94.8% pass rate. 8 additional non-executable scripts catalogued.

---

### Phase 23Y — Dashboard KPI Drill-Downs (2026-03-31)

**Scope:** Test all 10 Dashboard KPI tile expand/collapse drill-down views.

**Dashboard Layout:** 4×3 grid (last row has 2), each tile has expand icon (↗) in top-right corner.

**KPI Tiles (Row 1):**
1. **In Progress** (Awaiting Result Entry: 105) — PASS
2. **Ready For Validation** (Awaiting Review: 141) — PASS
3. **Orders Completed Today** (Total Orders Completed Today: 0) — PASS
4. **Partially Completed Today** (Total Orders Completed Today: 0) — PASS

**KPI Tiles (Row 2):**
5. **Orders Entered By Users** (Entered by users Today: 0) — PASS
6. **Orders Rejected** (Rejected By Lab Today: 0) — PASS
7. **UnPrinted Results** (UnPrinted Results Today: 0) — PASS
8. **Electronic Orders** (Electronic Orders: 0) — PASS

**KPI Tiles (Row 3):**
9. **Average Turn Around time** (Reception to Validation: 0) — PASS
10. **Delayed Turn Around** (More Than 96 hours: 0) — PASS

**Three Drill-Down Types Discovered:**

1. **Table with lab section tabs** (8 tiles: #1-7, #10) — Expands to show: title card + count, horizontal scrollable tab filters (All, HIV, Malaria, Microbiology, Molecular Biology, Mycobacteriology, Sero-Surveillance, Biochemistry, Hematology, Immunology, Cy...), 5-column table (Priority, Order Date, Patient Id, Lab Number [clickable links with copy icon], Test Name), top pagination (page X/Y with arrows), bottom pagination ("Items per page 100", "X-Y of Z items", "N of M page"). In Progress showed 105 items across 2 pages with real data (ROUTINE/ASAP priorities, test names like Bioline HIV/Syphilis Duo, WBC, Measles IgM, EUROIMMUN, Acid-Fast Microscopy, Poliovirus Sequencing, P. falciparum Gametocytes). Empty state: shows table headers + "0-0 of 0 items".

2. **Table without lab section tabs** (1 tile: #8 Electronic Orders) — Same table layout but no tab filters. Just the 5-column table directly. Electronic orders are HL7/FHIR incoming so lab section filtering not applicable.

3. **Sub-KPI cards** (1 tile: #9 Average Turn Around time) — Instead of a table, shows 3 sub-KPI metric cards: Reception To Validation Average Time (0), Reception To Result Average Time (0), Result To Validation Average Time (0). Breaks turnaround into 3 workflow segments.

**Phase 23Y Summary:** 10 TCs, all PASS. All 10 dashboard KPI tiles tested for expand/collapse drill-down. 3 distinct drill-down types documented. Expand/collapse toggle works correctly for all tiles.

**Phase 23 Cumulative (through 23Y)**: 532+ TCs executed, ~505 passed, ~94.9% pass rate. 8 non-executable scripts catalogued.

---

## Key Files

| File | Purpose |
|------|---------|
| `openelis-e2e.spec.ts` | Playwright test spec (389 TCs, 157+ suites) |
| `master-test-cases.md` | Full test case catalog (Phases 1-EQA-DEEP) |
| `qa-report-20260325-1430.md` | Main QA report with all findings |
| `SKILL-v4.md` | QA skill definition for Claude automation |
| `testing-constitution-compliance.md` | Compliance analysis vs repo conventions |
| `ROADMAP.md` | This file — roadmap and next steps |
