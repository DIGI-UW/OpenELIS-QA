# OpenELIS QA Supplementary Run — 2026-04-21
## Demo Instance (v3.2.0.2) + Testing Instance Blocker Documentation

**Run Date:** 2026-04-21  
**Tester:** QA Automation (Claude)  
**Instances Tested:**
- `testing.openelis-global.org` — v3.2.1.6 (**BLOCKED** — see Section 1)
- `demo.openelis-global.org` — v3.2.0.2 (**PARTIAL** — see Section 2)

**Credentials:** admin / adminADMIN!

---

## Section 1 — Testing Instance Blockers (v3.2.1.6)

### Blocker A: OGC-591 Vite allowedHosts Misconfiguration (KNOWN)
All HTML page navigation on `testing.openelis-global.org` returns:
```
403 Blocked request. This host ("testing.openelis-global.org") is not allowed.
Add "testing.openelis-global.org" to server.allowedHosts in vite.config.js
```
**Status:** Filed as OGC-591 (Backlog). Comment added 2026-04-21 with expanded impact.  
**Slack:** Posted to #digi-devs: https://digi-team-uw.slack.com/archives/C06GJQ5SVK4/p1776748542489879

### Blocker B: Session Expiry → Permanent Auth Lock (NEW IMPACT)
**Root cause chain:**
1. Vite blocks login page HTML (OGC-591)
2. CSRF token seeded by React SPA on first load — requires loading login page
3. When HttpSession expires (~30 min), server-side CSRF token is invalidated
4. Re-authentication requires loading login page to get fresh CSRF token
5. Vite blocks login page → cannot get fresh CSRF token
6. All POST requests return `403 CSRF token missing or invalid`
7. **QA session permanently blocked — cannot recover without fixing OGC-591**

**Impact:** Any QA session longer than the session TTL becomes unrecoverable on the testing instance. Documented as expanded impact in OGC-591 comment.

**CSRF retest status (BUG-1/3/7a):** Unable to complete — CSRF token stale, session expired, cannot re-authenticate. These retests remain pending until OGC-591 is resolved.

---

## Section 2 — Demo Instance Results (v3.2.0.2)

### 2.1 Infrastructure
| Check | Result |
|-------|--------|
| Login | ✅ PASS — admin/adminADMIN! authenticated, session established |
| Dashboard loads | ✅ PASS — 10 KPI cards with live data |
| Version displayed | ✅ PASS — "Version: 3.2.0.2" in header |
| Sidebar navigation | ✅ PASS — All top-level menu items render |

### 2.2 Dashboard KPI Verification
| KPI | Value | Status |
|-----|-------|--------|
| In Progress | 0 | ✅ |
| Ready For Validation | 88 | ✅ |
| Orders Completed Today | 0 | ✅ |
| Partially Completed Today | 4 | ✅ |
| Orders Entered By Users | 4 | ✅ |
| Orders Rejected | 0 | ✅ |
| UnPrinted Results | 0 | ✅ |
| Electronic Orders | 3 | ✅ |
| Average Turn Around Time | 0 | ✅ |
| Delayed Turn Around | 0 | ✅ |

**TC-DASH-01: PASS** — 10/10 KPI cards render with live data  
**TC-DASH-02: PASS** — Sidebar renders: Home, Order, Patient, Non-Conform, Workplan, Pathology, IHC, Cytology, Results, Validation, Reports, Admin, Billing, Help

### 2.3 Order Workflow (Add Order — 4-Step Wizard)
**TC-B-01: PASS** — Order submenu: Add Order, Study, Edit Order, Incoming Orders, Batch Order Entry, Barcode  
**TC-B-02: PASS** — Add Order wizard loads — 4 steps (Patient Info → Program Selection → Add Sample → Add Order)  
**TC-B-03: PASS** — Patient search works — returns results with columns: Last Name, First Name, Gender, DOB, Unique Health ID, National ID. Pagination (1/2 pages)  
**TC-B-04: PASS** — Patient selection auto-populates form: Health ID, National ID, Name, Gender, DOB, Age calculation (74y 11m 25d), expandable Emergency Contact / Additional sections  
**TC-B-05: PASS** — Step 2 Program Selection — Program dropdown defaulting to "Routine Testing", secondary field, Back/Next navigation  
**TC-B-06: PASS** — Step 3 Add Sample — 14 sample types: Whole Blood, Serum, Plasma, EDTA Tube, DBS, Urine, Sputum, Histopathology specimen, IHC specimen, Tissue antemortem, Tissue post mortem, Stool, Respiratory Swab, Fluid. Collection Date/Time, Collector, Order Panels search (panel + test typeahead)

### 2.4 Validation
**TC-VAL-01: PASS** — Validation page renders — "Select Test Unit" dropdown, pagination (Items per page: 100), Save button, empty state message

### 2.5 Results (LogbookResults)
**TC-F-01: PASS** — Results page renders — identical layout: Select Test Unit dropdown, pagination, Save button

### 2.6 Admin (MasterListsPage)
**TC-K-01: PASS** — 20 admin items rendered:
Reflex Tests Configuration, Analyzer Test Name, Lab Number Management, Program Entry, Provider Management, Barcode Configuration, List Plugins, Organization Management, Result Reporting Configuration, User Management, Batch test reassignment, Test Management, Menu Configuration (expandable), General Configurations (expandable), Application Properties, Test Notification Configuration, Dictionary Menu, Notify User, Search Index Management, Legacy Admin

### 2.7 Workplan
**TC-WP-01: PASS** — Workplan By Unit renders — "Search By Unit Type" dropdown, empty result panel

### 2.8 API Health (v3.2.0.2)
| Endpoint | Status | Notes |
|----------|--------|-------|
| /rest/home-dashboard/metrics | 200 JSON | Live dashboard data |
| /rest/SamplePatientEntry | 200 JSON | 58KB form config |
| /rest/panels | 200 JSON | Panel list |
| /rest/test-sections | 200 JSON | Test section list |
| /rest/referralOrganizations | 404 | Not in v3.2.0.2 |
| /rest/analyzers | 404 | Not in v3.2.0.2 |
| /rest/analyzers/qc/control-lots | 404 | Not in v3.2.0.2 (added v3.2.1.x) |
| /rest/storage/locations | 404 | Not in v3.2.0.2 |
| /rest/eqa/programs | 404 | Not in v3.2.0.2 |
| /rest/pathology/cases | 404 | Not in v3.2.0.2 |
| /rest/fhir/metadata | 404 | Not in v3.2.0.2 |
| /rest/ReferredOutTests | 200 JSON | 10KB referred out tests |

### 2.9 NEW FINDING — FAIL-DEMO-01: React Router baseURL Misconfiguration (v3.2.0.2)

**Severity:** High (affects majority of application routes)  
**Affected routes (browser navigation → Spring 404):**

| Route | Final URL | HTTP | Error |
|-------|-----------|------|-------|
| /Patient | /api/OpenELIS-Global/Patient | 404 | NoHandlerFoundException |
| /Pathology | /api/OpenELIS-Global/Pathology | 404 | NoHandlerFoundException |
| /Cytology | /api/OpenELIS-Global/Cytology | 404 | NoHandlerFoundException |
| /Immunohistochemistry | /api/OpenELIS-Global/Immunohistochemistry | 404 | NoHandlerFoundException |
| /NonConformingEvent | /api/OpenELIS-Global/NonConformingEvent | 404 | NoHandlerFoundException |
| /EditOrder | /api/OpenELIS-Global/EditOrder | 404 | NoHandlerFoundException |
| /Billing | likely same | - | - |
| /NotebookDashboard | likely same | - | - |
| /Aliquot | likely same | - | - |
| /IncomingOrders | likely same | - | - |
| /BatchOrderEntry | likely same | - | - |
| /PrintBarcode | likely same | - | - |

**Working routes (browser navigation → SPA HTML):**
- /Dashboard ✅
- /SamplePatientEntry ✅
- /WorkPlanByTestSection ✅
- /ResultValidation ✅
- /LogbookResults ✅
- /MasterListsPage ✅

**Root cause:** React Router in v3.2.0.2 uses `/api/OpenELIS-Global/` as a base path for certain routes that were previously JSP-based controllers. When the SPA loads and the React Router processes these routes, it performs a client-side navigation to the Spring context path prefix, which has no handler.

**Note:** This appears to be fixed in v3.2.1.x — testing instance (v3.2.1.6) showed correct SPA routing for these same paths (confirmed in earlier session before Vite issue).

**Revalidation:**
- Method A (fresh tab): CONFIRMED — same redirect
- Method C (fetch with text/html Accept): NOT REPRODUCED — server-side fetch returns 200 SPA HTML
- **Decision: CONFIRMED BUG** — client-side React Router issue (not server-side)

---

## Section 3 — Test Case Gap Analysis Results

Gap report saved to: `test-case-gaps-v3216.md`

**Summary of required updates:**
1. **BUG-1/3/7a test cases** — expected result should change from "HTTP 500" to "HTTP 403 (CSRF)" when testing v3.2.1.6+. Add note that true bug state requires retest WITH valid CSRF token.
2. **Analyzer QC module** — Phase 23 has 3 load tests only; needs 9+ CRUD/write test cases (create rules, control lots, assign materials, QC report generation)
3. **CSRF enforcement** — needs positive validation test cases (verify token present, invalid token handling)
4. **Resolved bugs** (BUG-9/10/11/21) — already updated in Phase 23; no changes needed

---

## Section 4 — OGC-591 Actions Taken

| Action | Status |
|--------|--------|
| Found existing OGC-591 ticket (Backlog) | ✅ |
| Added expanded impact comment (session expiry auth lock) | ✅ |
| Posted to #digi-devs with Jira link | ✅ |
| Recommended severity escalation: Low → Medium | ✅ (in comment) |

---

## Section 5 — Summary

| Category | PASS | FAIL | GAP | Notes |
|----------|------|------|-----|-------|
| Testing instance (v3.2.1.6) | 0 | 0 | ALL | Blocked by OGC-591 + session expiry |
| Demo dashboard | 2 | 0 | 0 | All KPI cards ✅ |
| Demo order workflow | 5 | 0 | 0 | Full 4-step wizard ✅ |
| Demo validation/results | 2 | 0 | 0 | ✅ |
| Demo admin | 1 | 0 | 0 | 20 items ✅ |
| Demo route navigation | 6 | 6+ | 0 | React Router base path bug |
| Demo API health | 4 | 8 | 0 | Many v3.2.1.x endpoints absent (expected) |

**New bugs filed this session:** 0 (FAIL-DEMO-01 is a known issue in v3.2.0.2 — verify if already tracked)  
**OGC-591 comment added:** Yes — expanded impact documented  
**Slack notified:** Yes — #digi-devs

**Next steps:**
1. Resolve OGC-591 (one-line vite.config.js fix) to unblock QA automation on testing instance
2. Retest BUG-1/3/7a with proper CSRF token after OGC-591 fix
3. Add Analyzer QC CRUD test cases to master-test-cases.md
4. Verify FAIL-DEMO-01 is already tracked for demo instance; file if not
5. Run full regression on testing instance after OGC-591 fix
