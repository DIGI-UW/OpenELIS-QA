# OpenELIS Global QA Roadmap — 2026-04-03
**Instance:** testing.openelis-global.org (v3.2.1.4)
**Baseline:** 853 TCs executed, 813 passed (~95.3% pass rate as of Phase 32 retest)

---

## 1. Current Test Coverage Summary

| Phase | Date | TCs | Pass | Fail | Key Areas |
|-------|------|-----|------|------|-----------|
| 1–4 (Rounds 1-4) | 2026-03-23/24 | 78 | 55 | 23 | Test Catalog, Orders, RBAC, Admin pages |
| 5–6 (Phases 4-5) | 2026-03-25 | 53 | 53 | 0 | Deep interaction (Patient, Workplan, Reports, Analyzers) |
| 7–10 (Phases 6-9) | 2026-03-27 | 43 | 36 | 7 | Referral, Pathology, Write Ops, Regression |
| 11–16 (Phases 10-15) | 2026-03-28 | 26 | 22 | 4 | Security, Performance, Accessibility, i18n, FHIR |
| 17–22 (Phases 16-22) | 2026-03-29/30 | 76 | 73 | 3 | Storage, Pathology, NCE, Analyzers, Reports |
| 23–30 (Phases 23-30) | 2026-03-31 – 04-01 | 220 | 212 | 8 | Admin deep (all 24 sub-pages), All sidebar pages |
| 31–32 (Phases 31-32) | 2026-04-02 | 40 | 37 | 3 | API survey, Order E2E, BUG-37 |
| 33 (Phase 33) | 2026-04-03 | 12 | 12 | 0 | v3.2.1.4 new features, Jira cleanup |
| **Retest** | 2026-04-03 | 2 | 1 | 1 | BUG-37 CONFIRMED, BUG-38 RETRACTED |
| **TOTAL** | | **~853** | **~813** | **~40** | |

---

## 2. Full Application Feature Map (v3.2.1.4)

### 2a. Sidebar Sections & Pages — All 32 Sections, 70+ Unique Paths

| Section | Sub-Items / Pages | Coverage Status |
|---------|------------------|-----------------|
| **Dashboard** | `/Dashboard` | ✅ Fully tested |
| **Generic Sample** | `/GenericSample/Edit` | ❌ **NEW — untested** |
| **Order** | `/SamplePatientEntry` (Add), `/SampleEdit` (Edit), `/ElectronicOrders`, `/SampleBatchEntrySetup`, `/PrintBarcode`, `/genericProgram` | ✅ Page load tested; ⚠️ **BUG-37 (patient linkage broken)** |
| **Study** | (sub-items under Order) | 🔵 Partial — page structure only |
| **Patient** | `/PatientManagement`, `/PatientHistory`, `/PatientMerge`, `/SampleManagement` | ✅ CRUD tested; `/SampleManagement` **NEW — untested** |
| **Storage** | `/Storage/rooms`, `/Storage/devices`, `/Storage/shelves`, `/Storage/racks`, `/Storage/boxes`, `/Storage/samples` | ✅ All 6 tabs tested, CRUD room create/edit verified |
| **Cold Storage Monitoring** | `/FreezerMonitoring?tab=0` | ✅ 5 tabs tested |
| **Analyzers** | `/analyzers`, `/analyzers/errors`, `/analyzers/types` | ✅ UI tested; ⚠️ **Full config + result routing NOT tested** |
| **Non-Conform** | `/ReportNonConformingEvent`, `/ViewNonConformingEvent`, `/NCECorrectiveAction` | ✅ Page load; ⚠️ **NCE creation write op NOT tested** |
| **EQA Tests** | `/EQADistribution` | ✅ Shipment wizard tested |
| **EQA Management** | `/EQAManagement`, `/EQAMyPrograms`, `/EQAOrders`, `/EQAParticipants`, `/EQAResults` | ❌ **NEW — all 5 pages untested** |
| **Workplan** | `/WorkPlanByTest`, `/WorkPlanByPanel`, `/WorkPlanByTestSection`, `/WorkPlanByPriority` | ✅ All 4 page structures; ⚠️ **result entry via workplan NOT tested** |
| **Results** | `/LogbookResults`, `/PatientResults`, `/AccessionResults`, `/ReferredOutTests`, `/RangeResults`, `/StatusResults`, `/analyzers` (results) | ✅ Page load; ❌ **ACTUAL result entry blocked by BUG-31/32 (checkbox hang + LogbookResults freeze)** |
| **Validation** | `/ResultValidation`, `/AccessionValidation`, `/AccessionValidationRange`, `/ResultValidationByTestDate` | ✅ Page load + save workflow tested (TC-EU); ⚠️ **Rejection workflow NOT verified end-to-end** |
| **Virology** | ARV (5 report types), EID (2), VL (1), Indeterminate (3) = `/Report?type=patient&report=patientARV*` etc. | ❌ **NEW — page renders verified (1 spot check), PDF generation untested** |
| **Reports → Routine** | Patient Status (`patientCILNSP_vreduit`), CSV Export | ✅ PDF tested |
| **Reports → Aggregate** | Statistics, Summary of All Tests, HIV Test Summary (`indicatorCDILNSPHIV`) | ✅ Statistics+Summary tested; HIV Test Summary **NEW — untested** |
| **Reports → Management** | Rejection, Activity (×3), Referred Out, Non Conformity (×2), Delayed Validation, Audit Trail | ✅ All tested |
| **Reports → ARV/EID/VL** | 12 new virology report types | ❌ **NEW — PDF generation untested** |
| **Reports → Indicator/Export** | Viral Load Data Export (`Trends`), General Export (`CIStudyExport`), Routine CSV | ❌ **NEW — untested** |
| **Reports → retroCI NC** | By Date, By Unit/Reason, By Labno, NC Notification, Follow-up Required | ❌ **NEW — untested** |
| **Billing** | (href=null stub) | ✅ Confirmed stub (NOTE-18) |
| **Inventory** | `/inventory` (Dashboard, Catalog, Reports tabs) | ❌ **NEW — page render verified, no CRUD tested** |
| **Help** | `/docs/UserManual` (PDF redirect) | ✅ User Manual verified (new URL) |
| **Process Documentation** | `/docs/UserManual`, `/documentation/*.pdf` | ✅ New route confirmed |
| **Admin (MasterListsPage)** | 24 sub-pages | ✅ All fully tested (Rounds 4, 23-30) |
| **Pathology** | `/PathologyDashboard`, `/ImmunohistochemistryDashboard`, `/CytologyDashboard` | ✅ All 3 dashboards tested |
| **EQA (old)** | `/EQADistribution` | ✅ Shipment wizard tested |
| **Alerts** | `/Alerts` | ✅ Tested |
| **Aliquot** | `/Aliquot` | ✅ Page load |
| **NoteBook** | `/NotebookDashboard` | ❌ Blank page (BUG-11/15) |

---

## 3. New in v3.2.1.4 (vs Previous Roadmap)

| Feature | Location | Priority | Notes |
|---------|----------|----------|-------|
| **Inventory Management** | `/inventory` | 🔴 High | Full CRUD module: lots, catalog, reports. Completely untested. |
| **EQA Management** (5 pages) | `/EQAManagement` etc. | 🔴 High | "Enter New EQA Test", Bulk Upload, Performance Summary — all new. |
| **Virology module** (Sidebar section) | 12 report types | 🟡 Medium | ARV/EID/VL/Indeterminate reports. Page renders OK, PDF gen untested. |
| **Generic Sample** | `/GenericSample/Edit` | 🟡 Medium | New data entry path for non-patient samples. |
| **Sample Management** | `/SampleManagement` | 🟡 Medium | Returns 200 — purpose unclear, needs investigation. |
| **HIV Test Summary** | `/Report?type=indicator&report=indicatorCDILNSPHIV` | 🟡 Medium | New report type. |
| **retroCI Non-Conform reports** | `/Report?type=patient&report=retroCI*` | 🟡 Medium | 5 new Côte d'Ivoire-specific NC report variants. |
| **Viral Load / General Exports** | `Trends`, `CIStudyExport`, `CISampleRoutineExport` | 🟡 Medium | Export report variants. |
| **Process Documentation section** | `/docs/UserManual`, PDF links | 🟢 Low | Sidebar section; User Manual PDF confirmed. |
| **Language: Español** | User panel | 🟢 Low | EN/FR/ES confirmed (ID not present). |
| **BUG-33 FIXED** | `/rest/DictionaryMenu` | ✅ | Was HTTP 500 in v3.2.1.3, now HTTP 200. |
| **BUG-1 FIXED** | `/rest/TestAdd` | ✅ | Test creation now works (confirmed Phase 25). |
| **BUG-20 FIXED** | User Create form | ✅ | Login Name field no longer shows false invalid state. |
| **BUG-34 CHANGED** | `/rest/organizationManagement` | ⚠️ | Still broken: changed from HTTP 500 → HTTP 404. |

---

## 4. Critical Testing Gaps — Write Operations & Cross-Module Flows

### 4a. ❌ NEVER SUCCESSFULLY TESTED — Highest Priority

| Gap | Blocker | What needs testing |
|-----|---------|-------------------|
| **Results entry via UI** | BUG-31 (checkbox hang), BUG-32 (LogbookResults freeze) | Enter a numeric result in Results By Unit, verify it saves |
| **Result rejection** | Same blockers | Check "Reject" on a result, verify NCE created, verify in Rejection Report |
| **Patient-order linkage** | BUG-37 (backend doesn't persist) | Submit order → verify patient appears on Modify Order |
| **Analyzer configuration end-to-end** | Never attempted | Add analyzer → configure test mappings → see results route to it |
| **User creation full flow** | BUG-3 (improved but 400) | Create user → log in as that user → verify role restrictions |

### 4b. ⚠️ PARTIALLY TESTED — Needs Write Op Verification

| Gap | What's tested | What's missing |
|-----|--------------|----------------|
| **Validation workflow** | Page load + save checkbox via DOM workaround | Real accept → verify flagged H/L/Critical; real reject → verify in report |
| **NCE creation** | View page load only | Submit NCE form → verify in NC Events queue → corrective action |
| **Referral full flow** | POST save works (BUG-18/19 resolved) | Referral → receive result → verify in Referred Out Tests report |
| **Test modification** | BUG-8 confirmed (drops select values) | After fix: modify test → verify ranges persisted → verify flags appear |
| **Panel creation** | BUG-7a — silent fail (marked Done in Jira) | Re-verify in v3.2.1.4: create panel → verify in panel list → orderable |
| **Site branding → report** | Branding UI tested | Upload header logo → generate report → verify logo appears on PDF |
| **Site info → patient report** | Config values read only | Set lab name/director → generate Patient Status PDF → verify text present |
| **Order rejection** | Never tested | Mark order as rejected → verify in Rejection Report |
| **Workplan result entry** | Workplan page loads | Select test from Workplan → enter result there → verify in validation queue |

### 4c. ❌ NEW FEATURES — Not Tested At All

| Feature | Priority | Tests needed |
|---------|----------|-------------|
| **Inventory: Add New Lot** | 🔴 High | Create lot → verify in table → check quantity tracking |
| **Inventory: Add Catalog Item** | 🔴 High | Create catalog item → Add lot against it → verify |
| **Inventory: Reports** | 🟡 Med | Generate Stock Levels Report → verify PDF/export |
| **EQA: Enter New EQA Test** | 🔴 High | Full EQA sample entry workflow |
| **EQA: Bulk Upload Results** | 🔴 High | Upload result file → verify parsed |
| **EQA: Performance Summary** | 🟡 Med | Create EQA data → verify metrics calculate |
| **EQA: Participants** | 🟡 Med | Add participant → verify in table |
| **Virology ARV report PDF** | 🟡 Med | Generate ARV Initial V1 PDF → verify renders |
| **Generic Sample Edit** | 🟡 Med | Navigate, document structure, test submission |
| **Sample Management** | 🟡 Med | Navigate, document purpose, test flows |
| **HIV Test Summary report** | 🟡 Med | Generate PDF → verify content |
| **Viral Load Data Export** | 🟡 Med | Run export → verify file |
| **retroCI NC reports** | 🟢 Low | Spot check PDF generation |

---

## 5. Critical End-to-End Test Chains (Not Yet Run)

### Chain A: Full Result Lifecycle (HIGHEST PRIORITY)
```
1. Create order (SamplePatientEntry) with test selected
2. Check Workplan → verify order appears
3. Results → By Unit → select section → enter numeric result
4. Validation → By Test → verify result in queue
5. Accept result → verify removed from queue
6. Generate Patient Status Report → verify result appears with H/L flag
7. Verify Audit Trail shows: Order → Result Entered → Validated
```

### Chain B: Rejection → Non-Conform → Report
```
1. Create order with test
2. Results By Unit → enter result → mark as rejected (Non-conform)
3. NCE auto-created → verify in ViewNonConformingEvent
4. Generate Rejection Report → verify rejected sample appears
5. Generate Non-Conformity By Date report → verify count
6. Non-Conform → Corrective Actions → add corrective action
7. Verify NCE status updated
```

### Chain C: Site Config → Report Branding
```
1. Admin → Printed Report Config → upload header logo (PNG)
2. Admin → Site Information → set lab name, lab director name
3. Admin → Site Branding → set primary color
4. Generate Patient Status Report PDF
5. Verify: lab logo appears in header
6. Verify: lab director name appears
7. Verify: lab name appears (currently shows "null" — BUG-16/NOTE-16)
```

### Chain D: Analyzer Full Setup
```
1. Admin → Analyzers → Add Analyzer → fill all fields (name, type, port, plugin)
2. Admin → Analyzer Test Names → map analyzer test to OpenELIS test
3. Analyzer → Analyzer Results → verify analyzer in dropdown
4. Submit test result through analyzer → verify routed correctly
5. Verify result appears in Results By Unit under correct section
```

### Chain E: New Test → Order → Results → Flags
```
1. Admin → Test Management → Add New Test (BUG-1 now fixed!)
   → name: "QA_Auto_TestApr2026", section: Biochemistry, result type: Numeric
   → normal range: Low=5 High=100, critical: Low=2 High=150
2. Admin → Test Modification → verify test saved correctly (check for BUG-8)
3. Add Order → select new test
4. Results By Unit → enter value=1 (critically low)
5. Verify Critical Low flag appears (red indicator)
6. Validate result → verify flag preserved in validation
7. Generate Patient Report → verify flag appears on PDF
```

### Chain F: User RBAC Full Flow
```
1. Admin → User Management → Add User (BUG-3 improved?)
   → Lab Tech role only (no Admin)
2. Log in as new user
3. Verify: can access Results By Unit ✓
4. Verify: cannot access Admin Management (redirected or 403)
5. Verify: can enter results but not validate (if roles configured)
6. Log back in as admin → deactivate test user
```

### Chain G: EQA Full Workflow (NEW in v3.2.1.4)
```
1. EQA Management → Enter New EQA Test
2. EQA Distribution → Create New Shipment → configure → send
3. EQA Management → Enter results for EQA samples
4. EQA Management → Bulk Upload Results → test file upload
5. View Performance Summary → verify metrics update
6. EQA Management → Submit → verify status changes to "Submitted"
```

### Chain H: Inventory Full CRUD
```
1. Inventory → Catalog → Add Catalog Item (name, type, units, threshold)
2. Inventory → Add New Lot → link to catalog item (quantity, expiry)
3. Verify: lot appears in Inventory Items table
4. Verify: summary cards update (Total Lots = 1)
5. Inventory → Reports → Stock Levels Report → Generate → verify lot appears
6. Set quantity below threshold → verify Low Stock card increments
7. Deactivate item → verify removed from active list
```

### Chain I: Virology Report PDF Verification
```
1. Navigate to ARV Initial Version 1 report
2. Enter a lab number range (From/To)
3. Click Generate Printable Version
4. Verify PDF generates (HTTP 200, Content-Type: application/pdf)
5. Verify PDF header shows lab name (checking for NOTE-16 "null" regression)
6. Repeat for EID Version 1 and VL Version Nationale
```

---

## 6. Recommended Test Phases (Next 8 Sessions)

### Phase 34 — Result Lifecycle E2E (Chain A) 🔴
**Goal:** Get a result entered, validated, and visible in a report.
**Approach:** Use JS DOM workaround for checkbox to bypass BUG-31.
**TCs:** ~10 | **Risk:** HIGH (BUG-31/32 may block)
**Key assertions:**
- Result value saves correctly
- H/L flag triggers when outside normal range
- Validated result appears on Patient Status Report PDF

### Phase 35 — Rejection Chain (Chain B) 🔴
**Goal:** Reject a result → verify it flows into NCE and Rejection Report.
**TCs:** ~8
**Key assertions:**
- NCE auto-created on rejection
- Rejection Report shows rejected sample
- Non-Conform module NCE queue updates

### Phase 36 — Site Config → Report Branding (Chain C) 🟡
**Goal:** Upload logo and site name → verify they appear on generated PDFs.
**TCs:** ~6
**Key assertions:**
- Logo visible in report header
- Lab name resolves (BUG-16: currently shows "null")
- Lab director name appears

### Phase 37 — New Test + Range Flags (Chain E) 🔴
**Goal:** Create test with normal range → order it → verify H/L/Critical flags.
**TCs:** ~8
**Key assertion:** BUG-8 (test modify drops values) — verify ranges actually persist after TestModify.

### Phase 38 — Inventory CRUD (Chain H) 🟡
**Goal:** Full inventory workflow — catalog item → lot → report.
**TCs:** ~8
**Key assertions:**
- `label.button.action` i18n bug in table header
- Deactivation modal placeholder bug (same as NOTE-22)
- Low stock threshold triggers correctly

### Phase 39 — EQA Management New Pages (Chain G) 🟡
**Goal:** New EQA Management workflow.
**TCs:** ~10
**Key assertions:**
- Enter New EQA Test form submits
- Bulk Upload Results processes file
- Performance Summary metrics calculate

### Phase 40 — Analyzer Full Setup (Chain D) 🟡
**Goal:** Add analyzer → map tests → verify routing.
**TCs:** ~8
**Key assertions:**
- New analyzer appears in `/analyzers` list
- Test mapping saved to `/MasterListsPage/AnalyzerTestName`
- Analyzer Results page shows new analyzer option

### Phase 41 — Virology Reports + New Report Types (Chain I) 🟡
**Goal:** Generate PDFs for all 12 new virology report types.
**TCs:** ~12
**Key assertions:**
- Each report type returns valid PDF
- Lab header correct (checking NOTE-16 regression)
- From/To lab number range filter works

### Phase 42 — User RBAC + Generic Sample (Chain F) 🟢
**Goal:** Create user → verify role restrictions → test Generic Sample flow.
**TCs:** ~10

---

## 7. Known Bug Status (as of 2026-04-03)

| Bug | Jira | Severity | Status | Action Needed |
|-----|------|----------|--------|---------------|
| BUG-1 (TestAdd 500) | OGC-448 | Critical | ✅ **FIXED in v3.2.1.4** | Done |
| BUG-2 EXT (checkbox hang) | OGC-468 | High | 🔴 **STILL OPEN** — Reopened 2026-04-03 | Fix required; Chain A/B blocked |
| BUG-3 (UserCreate 500) | — | High | ⚠️ Improved (now 400) | Needs full retest |
| BUG-7/7a (PanelCreate) | OGC-450/451 | Med/High | ✅ Marked Done in Jira | Needs re-verify in v3.2.1.4 |
| BUG-8 (TestModify data loss) | OGC-452, OGC-525 | Critical | 🔴 **CONFIRMED WORSE** in v3.2.1.4 | Phase 37 Chain E |
| BUG-16 (FR i18n keys) | — | Med | 🔴 Still present | Phase 34+ spot check |
| BUG-20 (Login Name invalid) | OGC-494 | Med | ✅ **FIXED in v3.2.1.4** | Done |
| BUG-21 (patient-photos 500) | OGC-495 | Low | 🔴 Likely still present | Background; low priority |
| BUG-22 (no rate limiting) | OGC-496 | Med | 🔴 Likely still present | Security; Phase 42 |
| BUG-31 (checkbox hang) | OGC-468 | High | 🔴 **CONFIRMED in v3.2.1.4** | Blocks Chains A/B |
| BUG-32 (LogbookResults freeze) | OGC-534 | High | 🔴 **CONFIRMED in v3.2.1.4** | Filed 2026-04-03 |
| BUG-33 (Dictionary 500) | — | Med | ✅ **FIXED in v3.2.1.4** | Done |
| BUG-34 (Org 404) | OGC-535 | Med | 🔴 Changed 500→404 | Filed 2026-04-03 |
| BUG-37 (Patient-order linkage) | OGC-533 | High | 🔴 **CONFIRMED** (2× retested) | Filed 2026-04-03 |
| NOTE-16 (null in PDF header) | OGC-502 | Low | 🔴 Likely present | Verify in Chains C/I |
| NOTE-22 (Delete {name} placeholder) | — | Low | 🔴 Present | Check in Inventory deactivation too |

---

## 8. Immediate Actions (This Session)

1. **Attempt Chain A (Result Lifecycle)** via DOM workaround — bypass BUG-31 using `cb.checked=true; dispatchEvent(change)` and verify if React state updates
2. **Attempt Chain C (Site Config → Report)** — verify lab name/logo appear on PDF
3. **Test Inventory Add New Lot** — full CRUD write operation
4. **Test EQAManagement → Enter New EQA Test** — form submission
5. **Spot-check BUG-7a re-verify** — create panel → verify in v3.2.1.4

---

*Generated: 2026-04-03 by OpenELIS QA Agent*
*Next commit: contains Phase 33 results + this roadmap*
