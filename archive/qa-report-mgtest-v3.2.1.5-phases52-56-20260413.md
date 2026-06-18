# QA Report — OpenELIS Global v3.2.1.5 (mgtest)
## Phases 52–56 · 2026-04-13

**Server:** mgtest.openelis-global.org ("Madagascar OpenELIS")  
**Version:** v3.2.1.5  
**Tester:** QA Automation Agent (openelis-test-catalog-qa skill)  
**Date:** 2026-04-13  
**Phases covered:** 52, 53, 54, 55, 56 (Rounds 94–98)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total TCs (this report) | 23 |
| Pass | 22 |
| Fail | 1 |
| Pass Rate | 95.7% |
| New Bugs | 0 |
| Phases | 52–56 |

**mgtest cumulative totals (Phases 42–56):** 109 TCs · 81 PASS · 28 FAIL · **74.3% pass rate**

**Overall cumulative (all servers, Phases 1–56):** 1,097 TCs · 1,011 PASS · 86 FAIL · **92.2% pass rate** · 31 open bugs

---

## Phase 52 — Pathology / IHC / Cytology Dashboards (5 TCs)

**Round 94 · 5 PASS · 0 FAIL**

### Test Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-52-01 | PathologyDashboard page loads | PASS | `/PathologyDashboard` — status cards (Submitted, InProgress, Completed), case listing table renders |
| TC-52-02 | PathologyDashboard search & filter controls | PASS | Assignee dropdown, status filter, date range inputs present |
| TC-52-03 | ImmunohistochemistryDashboard page loads | PASS | `/ImmunohistochemistryDashboard` — consistent layout with PathologyDashboard |
| TC-52-04 | CytologyDashboard page loads | PASS | `/CytologyDashboard` — consistent layout; same status card pattern |
| TC-52-05 | Pathology dashboard case status consistency | PASS | 0 cases across all three dashboards (no pathology workload on mgtest) — empty state renders correctly |

### Notes

- All three specialty dashboards (Pathology, IHC, Cytology) share the same status-card + case-table design
- Empty state (0 cases) renders cleanly without errors on all three pages
- Design consistent with v3.2.1.4 (previously validated in suites BI-DEEP, BJ-DEEP, BK-DEEP)

---

## Phase 53 — Cold Storage Monitoring (4 TCs)

**Round 95 · 4 PASS · 0 FAIL**

### Test Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-53-01 | Cold Storage Monitoring page loads | PASS | `/ColdStorage` renders "Cold Storage Monitoring" heading |
| TC-53-02 | Cold storage device listing — empty state | PASS | 0 devices on mgtest; empty state message renders correctly (no errors) |
| TC-53-03 | Temperature monitoring tabs visible | PASS | Temperature/Humidity/Events tabs present even with 0 devices |
| TC-53-04 | Storage sub-module integration | PASS | `/Storage/samples`, `/Storage/rooms`, `/Storage/devices`, `/Storage/shelves` all functional |

### Notes

- mgtest has **0 cold storage devices** configured (vs 2 on jdhealthsolutions v3.2.1.4)
- Empty state is graceful — no JS errors, no broken UI
- Cold storage monitoring is a v3.2.1.5 feature — confirmed present and accessible on mgtest

---

## Phase 54 — Non-Conforming Events & Workplan (6 TCs)

**Round 96 · 5 PASS · 1 FAIL**

### Test Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-54-01 | ReportNonConformingEvent page loads | PASS | `/ReportNonConformingEvent` — redesigned as a 5-section creation form in v3.2.1.5 |
| TC-54-02 | NCE form section structure | PASS | Sections: Reporter & Event Context, Classification (Category/Subcategory/Severity), Details, Attachments, Link to Samples |
| TC-54-03 | WorkPlanByTest loads correctly | PASS | **BUG-55 FIXED** — `/WorkPlanByTest` loads without React Router `/api/` redirect |
| TC-54-04 | WorkPlanByPanel loads correctly | PASS | **BUG-55 FIXED** — `/WorkPlanByPanel` loads correctly |
| TC-54-05 | WorkPlanByTestSection loads correctly | PASS | **BUG-55 FIXED** — `/WorkPlanByTestSection` loads correctly |
| TC-54-06 | Patient Status Report accessible | **FAIL** | **BUG-57 CONFIRMED** — `/Report?type=patient` redirects to Dashboard; report is inaccessible |

### BUG-55 FIXED — Workplan Routes Restored

**Previously:** All WorkPlanBy* routes (`/WorkPlanByTest`, `/WorkPlanByPanel`, `/WorkPlanByTestSection`, `/WorkPlanByPriority`) redirected to `/api/` due to React Router `basename` misconfiguration.

**Now on current mgtest build:** All 4 routes load their correct pages. The React Router basename fix was deployed between Phase 44 testing (earlier today) and Phase 54 retesting. All WorkPlan pages functional.

### BUG-57 Still Active

`/Report?type=patient` continues to redirect to the Dashboard root rather than rendering the Patient Status Report. All report-type URLs (`/Report?type=*`) are broken. This is a known deployment gap in v3.2.1.5.

### NCE Form Redesign — v3.2.1.5 New Feature

The `ReportNonConformingEvent` page was redesigned in v3.2.1.5:
- **v3.2.1.4:** Simple 4-field patient search form
- **v3.2.1.5:** Full 5-section creation form with: Reporter & Event Context, Classification (Category/Subcategory dropdown, Severity radio: Low/Medium/High/Critical), Details (free-text), Attachments (file upload), Link to Samples (accession lookup)

This is a significant UX improvement enabling direct NCE creation rather than requiring a patient search first.

---

## Phase 55 — Notifications, Alerts & Help Menu (4 TCs)

**Round 97 · 4 PASS · 0 FAIL**

### Test Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-55-01 | Notification bell in header | PASS | Bell icon renders, notification panel opens with 0 unread messages; "Mark all as Read" and "Show read" controls visible |
| TC-55-02 | Alerts page loads | PASS | `/Alerts` renders with stat cards, filter controls, and paginated alert table |
| TC-55-03 | Help menu opens | PASS | Help menu in header renders "User Manual", "Video Tutorials", "Release Notes" items |
| TC-55-04 | Video Tutorials / Release Notes stubs confirmed | PASS | **NOTE-21 CONFIRMED on mgtest** — "Video Tutorials" and "Release Notes" buttons render but have no functional URL (stub behavior, same as v3.2.1.4) |

### Notes

- Notifications system: functional UI with 0 active notifications on mgtest
- Alerts page structure: consistent with v3.2.1.4 (previously validated in suite R-DEEP)
- **NOTE-21:** Video Tutorials and Release Notes are stub buttons — confirmed on both v3.2.1.4 (jdhealthsolutions) and v3.2.1.5 (mgtest). No action URL configured; clicking does nothing. This is a planned-but-not-yet-implemented feature.
- User Manual link: functional (opens documentation URL)

---

## Phase 56 — Print Barcode, Aliquot, Notebook & Patient Results (4 TCs)

**Round 98 · 4 PASS · 0 FAIL**

### Test Cases

| ID | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-56-01 | PrintBarcode page loads | PASS | `/PrintBarcode` — "Print Bar Code Labels" page with Pre-Print Barcodes (labelSets/orderLabelsPerSet/specimenLabelsPerSet inputs, min=1/max=100, totalLabelsToPrint read-only), Sample section (13-option sample type select), Print Barcodes for Existing Orders (labNumber input), Pre-Print Labels and Submit buttons |
| TC-56-02 | Aliquot page loads | PASS | `/Aliquot` — "Search Sample" page with accession number input (placeholder "Enter Accession No.") and Search button |
| TC-56-03 | NotebookDashboard loads | PASS | **NEW in v3.2.1.5** — `/NotebookDashboard` renders with KPI cards (Total Entries, Drafts, Pending Review, Finalized This Week), Projects/All Entries tabs, "New Entry" button, Entry Title table column |
| TC-56-04 | PatientResults page loads | PASS | `/PatientResults` — "Patient Results" search form with patientId (Enter Patient Id), labNumber (Enter Previous Lab Number), lastName, firstName, date-picker (dd/mm/yyyy), gender radio (Male/Female), Unique Health ID, National ID, Data Source Name inputs; Search and External Search buttons |

### Notable Finding: NotebookDashboard Newly Implemented in v3.2.1.5

The NotebookDashboard was completely blank (empty page, no content) in the v3.2.1.4 jdhealthsolutions instance. In v3.2.1.5 mgtest, the page now renders a full dashboard with:
- KPI stat cards: Total Entries, Drafts, Pending Review, Finalized This Week
- Navigation tabs: Projects, All Entries
- "New Entry" action button
- Entry table with Entry Title column

This represents a new feature implementation between v3.2.1.4 and v3.2.1.5.

---

## Phase 52–56 Summary

| Phase | Focus | TCs | Pass | Fail | Key Findings |
|-------|-------|-----|------|------|--------------|
| 52 | Pathology/IHC/Cytology Dashboards | 5 | 5 | 0 | All 3 specialty dashboards load; 0 cases on mgtest (expected) |
| 53 | Cold Storage Monitoring | 4 | 4 | 0 | 0 devices on mgtest; graceful empty state |
| 54 | Non-Conforming Events & Workplan | 6 | 5 | 1 | **BUG-55 FIXED** (all WorkPlanBy* pages now load); **BUG-57 CONFIRMED** (Reports redirect); NCE form redesigned to 5-section creation form |
| 55 | Notifications, Alerts & Help | 4 | 4 | 0 | NOTE-21 confirmed on mgtest; Alerts page functional |
| 56 | Print Barcode, Aliquot, Notebook, Patient Results | 4 | 4 | 0 | NotebookDashboard NEW in v3.2.1.5; all pages load correctly |
| **TOTAL** | | **23** | **22** | **1** | **95.7% pass rate** |

---

## Bug Status After Phases 52–56

### No New Bugs Filed This Session

All findings in Phases 52–56 are either:
- Confirmations of previously filed bugs (BUG-57: Reports broken)
- Previously noted architectural observations (NOTE-21: Help stub buttons)
- Positive findings (BUG-55 FIXED, NotebookDashboard new feature)

### Previously Known Bugs Observed/Confirmed

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| BUG-57 | High | Open | `/Report?type=patient` redirects to Dashboard — confirmed Phase 54 |
| BUG-52 | High | Open | `GET /rest/patient/search → 404` — affects Patient Management (confirmed Phase 50, still active) |
| BUG-55 | Medium | **FIXED** | React Router basename misconfiguration for WorkPlanBy* routes — **CONFIRMED FIXED** in current mgtest build |
| NOTE-21 | Low | Known | Video Tutorials and Release Notes are stub buttons — confirmed on mgtest v3.2.1.5 |

### BUG-55 Resolution Details

BUG-55 was filed during Phase 44 testing when `/WorkPlanByTest`, `/WorkPlanByPanel`, `/WorkPlanByTestSection`, and `/WorkPlanByPriority` all redirected to `/api/` due to a React Router `basename` misconfiguration. Between Phase 44 and Phase 54 testing (both on 2026-04-13), the fix was deployed to mgtest. All 4 WorkPlanBy* routes now load their correct pages.

---

## Technical Notes

### Session Timeout Handling
The "Still There?" idle timeout dialog appeared periodically during testing. Dismissal method:
```javascript
[...document.querySelectorAll('[role="dialog"]')].forEach(d => d.remove());
document.body.classList.remove('cds--body--with-modal-open');
```

### mgtest Build Version Note
The `BUG-55` Workplan fix was live on mgtest during Phase 54 testing but was NOT present during Phase 44 testing (both on 2026-04-13). This confirms the mgtest instance was updated intraday — QA test results should note deployment date AND approximate time when confirming fixes.

---

## Cumulative Status After Phase 56

| Server | Version | Phases | TCs | Pass | Fail | Rate |
|--------|---------|--------|-----|------|------|------|
| jdhealthsolutions | v3.2.1.4 | 1–41 | 988 | 930 | 58 | 94.1% |
| mgtest | v3.2.1.5 | 42–56 | 107 | 79 | 28 | 73.8% |
| **TOTAL** | | **1–56** | **1,095** | **1,009** | **86** | **92.1%** |

**Open bugs:** 31 total (no new bugs in Phases 52–56)  
**Bugs confirmed fixed:** BUG-55 (Workplan routes)  
**Phases complete:** 56

---

*Report generated by openelis-test-catalog-qa automation skill · 2026-04-13*
