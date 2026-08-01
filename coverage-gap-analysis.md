# OpenELIS Global v3.2.1.3 — Test Coverage Gap Analysis

**Date:** 2026-03-24
**Audited against:** Live instance at `https://www.jdhealthsolutions-openelis.com`
**Existing suites:** A–Z (148 test cases across 26 suites)

---

## Complete Live Menu Map

Below is every menu item discovered in the live hamburger menu and Admin page, mapped against our existing test coverage.

### Legend
- **COVERED** = existing test case(s) exercise this screen
- **PARTIAL** = some paths tested but sub-screens missing
- **GAP** = no test coverage at all

---

## 1. Hamburger Menu Items

### Order
| Menu Item | Status | Covered By |
|---|---|---|
| Add Order | COVERED | Suite B (TC-ORD-01–06) |
| Incoming Orders | **GAP** | — |
| Batch Order Entry | **GAP** | — |
| Electronic Orders | PARTIAL | Suite R (TC-EO-01–05, FHIR inbound) |

### Patient
| Menu Item | Status | Covered By |
|---|---|---|
| Add/Edit Patient | COVERED | Suite H (TC-PAT-01–06) |
| Patient Search | COVERED | Suite H (TC-PAT-01) |
| Merge Patient | **GAP** | — |

### Alerts
| Menu Item | Status | Covered By |
|---|---|---|
| Alerts (top-level) | **GAP** | — |

### EQA Distributions
| Menu Item | Status | Covered By |
|---|---|---|
| EQA Distributions | **GAP** | — |

### Storage
| Menu Item | Status | Covered By |
|---|---|---|
| Storage Management | **GAP** | — |
| Cold Storage Monitoring | **GAP** | — |

### Analyzers
| Menu Item | Status | Covered By |
|---|---|---|
| Analyzer List | **GAP** | — |
| Error Dashboard | **GAP** | — |
| Analyzer Types | **GAP** | — |

### Non-Conform
| Menu Item | Status | Covered By |
|---|---|---|
| Report Non-Conforming Event | COVERED | Suite F (TC-NC-01–06) |
| View New Non-Conforming Events | **GAP** | — |
| Corrective Actions | **GAP** | — |

### Workplan
| Menu Item | Status | Covered By |
|---|---|---|
| By Test Type | COVERED | Suite N (TC-WP-01–06) |
| By Panel | **GAP** | — |
| By Unit | COVERED | Suite N (TC-WP-02) |
| By Priority | **GAP** | — |

### Pathology
| Menu Item | Status | Covered By |
|---|---|---|
| Pathology (top-level) | **GAP** | — |

### Immunohistochemistry
| Menu Item | Status | Covered By |
|---|---|---|
| Immunohistochemistry | **GAP** | — |

### Cytology
| Menu Item | Status | Covered By |
|---|---|---|
| Cytology | **GAP** | — |

### Results
| Menu Item | Status | Covered By |
|---|---|---|
| By Unit | COVERED | Suite C (TC-RES-01–06) |
| By Patient | **GAP** | — |
| By Order | **GAP** | — |
| Referred Out | COVERED | Suite M (TC-REF-01–06) |
| By Range of Order Numbers | **GAP** | — |
| By Test, Date or Status | **GAP** | — |
| Order Programs | **GAP** | — |

### Validation
| Menu Item | Status | Covered By |
|---|---|---|
| Routine | COVERED | Suite D (TC-VAL-01–06) |
| By Order | **GAP** | — |
| By Range of Order Numbers | **GAP** | — |
| By Date | **GAP** | — |

### Reports
| Menu Item | Status | Covered By |
|---|---|---|
| **Routine > Patient Status Report** | PARTIAL | Suite L (TC-RPT-01) |
| **Aggregate Reports > Statistics Report** | **GAP** | — |
| **Aggregate Reports > Summary of All Tests** | **GAP** | — |
| **Management Reports > Rejection Report** | **GAP** | — |
| **Management Reports > Activity Reports > Referred Out Tests Report** | **GAP** | — |
| **Management Reports > Non Conformity > Delayed Validation** | **GAP** | — |
| **Management Reports > Non Conformity > Audit Trail** | PARTIAL | Suite P (TC-SYS-03) |
| **WHONET Report** | **GAP** | — |

### Billing
| Menu Item | Status | Covered By |
|---|---|---|
| Billing (top-level) | **GAP** | — |

### Aliquot
| Menu Item | Status | Covered By |
|---|---|---|
| Aliquot (top-level) | **GAP** | — |

### NoteBook
| Menu Item | Status | Covered By |
|---|---|---|
| NoteBook (top-level) | **GAP** | — |

### Help
| Menu Item | Status | Covered By |
|---|---|---|
| User Manual | **GAP** (low priority) | — |

---

## 2. Admin Page Items

| Admin Item | Status | Covered By |
|---|---|---|
| Reflex Tests Configuration | **GAP** | — |
| Analyzer Test Name | **GAP** | — |
| Lab Number Management | **GAP** | — |
| Program Entry | **GAP** | — |
| EQA Program Management | **GAP** | — |
| Provider Management | **GAP** | — |
| Barcode Configuration | **GAP** | — |
| List Plugins | **GAP** | — |
| Organization Management | PARTIAL | Suite K (TC-ADMIN-04, org listing) |
| Result Reporting Configuration | **GAP** | — |
| User Management | COVERED | Suite K (TC-ADMIN-01–03) |
| Batch test reassignment and c... | **GAP** | — |
| Test Management | COVERED | Suite A (TC-01–04), Suite B, Suite E |
| Menu Configuration | **GAP** | — |
| General Configurations | **GAP** | — |
| Application Properties | **GAP** | — |
| Test Notification Configuration | **GAP** | — |
| Dictionary Menu | PARTIAL | Suite O (TC-LOINC-04–06) |
| Notify User | **GAP** | — |
| Search Index Management | **GAP** | — |
| Logging Configuration | **GAP** | — |
| Localization | PARTIAL | Suite T (TC-I18N-01–05) |
| Legacy Admin | **GAP** | — |

---

## 3. Gap Summary

### Fully Uncovered Top-Level Areas (12)
1. **Alerts** — notification/alert queue
2. **EQA Distributions** — external quality assessment
3. **Storage** — sample storage management + cold chain monitoring
4. **Analyzers** — instrument list, error dashboard, types
5. **Pathology** — pathology workflow module
6. **Immunohistochemistry** — IHC workflow module
7. **Cytology** — cytology workflow module
8. **Billing** — billing/invoicing module
9. **Aliquot** — sample aliquoting workflow
10. **NoteBook** — lab notebook feature
11. **Incoming Orders** — orders received from external systems
12. **Batch Order Entry** — bulk order creation

### Partially Covered Areas with Significant Gaps (7)
1. **Results** — only By Unit and Referred Out tested; missing By Patient, By Order, By Range, By Test/Date/Status, Order Programs (5 sub-screens)
2. **Validation** — only Routine tested; missing By Order, By Range, By Date (3 sub-screens)
3. **Reports** — only Patient Status Report partially tested; missing Statistics, Summary of All Tests, Rejection, Activity, Delayed Validation, WHONET (6+ sub-screens)
4. **Non-Conform** — only Report NC Event tested; missing View New NC Events queue, Corrective Actions (2 sub-screens)
5. **Workplan** — only By Test Type and By Unit; missing By Panel, By Priority (2 sub-screens)
6. **Admin** — only User Mgmt and Test Mgmt covered well; 15+ admin screens untested
7. **Patient** — Add/Edit and Search covered; missing Merge Patient

### Gap Counts
| Category | Total Menu Items | Covered | Partial | Gap |
|---|---|---|---|---|
| Hamburger Menu | ~45 | 10 | 4 | ~31 |
| Admin Page | 23 | 3 | 3 | 17 |
| **TOTAL** | **~68** | **13** | **7** | **~48** |

**Current coverage: ~29% of discoverable UI surface**

---

## 4. Prioritized Gap Backlog

### Priority 1 — Clinical Workflow Gaps (patient safety)
| Gap | Risk | Suggested Suite |
|---|---|---|
| Results > By Patient | Techs can't find patient results | AA |
| Results > By Order | Can't look up specific order results | AA |
| Validation > By Order | Supervisors can't validate by order | AB |
| Validation > By Date | Can't validate by date range | AB |
| Merge Patient | Duplicate patient data risk | AC |
| Corrective Actions (NC) | Regulatory compliance | AD |

### Priority 2 — Reporting Gaps (regulatory/management)
| Gap | Risk | Suggested Suite |
|---|---|---|
| Statistics Report | Can't generate aggregate stats | AE |
| Summary of All Tests | Missing test summary reporting | AE |
| Rejection Report | Can't track rejection rates | AF |
| Referred Out Tests Report | Missing referral tracking report | AF |
| WHONET Report | AMR surveillance compliance | AG |
| Delayed Validation Report | Can't monitor TAT compliance | AG |

### Priority 3 — Operational Gaps
| Gap | Risk | Suggested Suite |
|---|---|---|
| Incoming Orders / Batch Order Entry | Can't process bulk/external orders | AH |
| Workplan By Panel / By Priority | Incomplete workplan navigation | AI |
| Results By Range / By Test-Date-Status | Missing result search modes | AJ |
| Order Programs | Program-based ordering not tested | AJ |

### Priority 4 — Specialized Modules
| Gap | Risk | Suggested Suite |
|---|---|---|
| Pathology | Entire module untested | AK |
| Immunohistochemistry | Entire module untested | AK |
| Cytology | Entire module untested | AK |
| Storage Management + Cold Chain | Sample storage untested | AL |
| Analyzers (List, Errors, Types) | Instrument integration UI untested | AM |
| EQA Distributions | EQA workflow untested | AN |
| Aliquot | Aliquoting workflow untested | AO |
| Billing | Billing module untested | AP |

### Priority 5 — Admin Configuration Gaps
| Gap | Risk | Suggested Suite |
|---|---|---|
| Reflex Tests Configuration | Auto-reflex rules untested | AQ |
| Analyzer Test Name mapping | Analyzer-LIS mapping untested | AQ |
| Lab Number Management | Accession numbering config untested | AR |
| Program Entry | Program setup untested | AR |
| Provider Management | Provider registry untested | AS |
| Barcode Configuration | Barcode settings untested | AS |
| Result Reporting Configuration | Result routing config untested | AT |
| Menu Configuration | Menu customization untested | AT |
| General Configurations | System settings untested | AU |
| Application Properties | App properties untested | AU |
| Test Notification Configuration | Notification setup untested | AV |
| Search Index Management | Search reindexing untested | AV |
| Logging Configuration | Logging level config untested | AW |
| Legacy Admin | Legacy admin panel untested | AW |
| NoteBook | Lab notebook feature untested | AX |
| Alerts | Notifications/alerts untested | AX |

---

## 5. Recommendation

Our existing 26 suites (A–Z) provide solid coverage of the core lab workflow: Order → Results → Validation → Referral, plus foundational Admin (users, tests), Non-Conforming Events, Dashboard, and cross-cutting concerns (i18n, a11y, performance, data integrity).

**Before writing more suites**, we should **validate the existing 26 suites** against the live instance to confirm they actually pass. Known bugs (BUG-1 through BUG-8) already indicate several expected failures. Live validation will give us confidence in what we have before expanding coverage.

**Suggested next phase (Suites AA–AJ)** would add ~50 test cases covering Priority 1 and Priority 2 gaps — the clinical workflow and reporting screens that matter most for patient safety and regulatory compliance.


---

## 2026-07-01 — Monthly consolidation: new-feature coverage delta

Light pass reconciling the QA catalog against `openelis-design`'s `spec-registry.md` /
`current-state-gotchas.md`. The 26-suite baseline above (2026-03-24) is largely closed by the
DEEP-suite phases in `references/suite-catalog.md`; the items below are the **candidate deltas**
since then. Confidence is limited (no live-app pass this cycle) — each is a candidate to confirm
against `master-test-cases.md`, not an asserted gap.

**Confirmed already covered (spot-checked in master-test-cases.md):** analyzer Field Mappings
(`/analyzers/{id}/mappings`, kebab actions incl. Configure File Import / Copy Mappings); Analyzer
Types (`/analyzers/types`); Average TAT drill-down (TC-GX-KPI-TURNAROUND-01); Sample shipment
boxes (`/SampleShipment` → `/boxes`).

**Candidate UNCOVERED / thin (confirm before authoring):**
- **Referral reference-lab view** — `/SampleShipment/reference-lab-results` (the referral-redesign
  canonical in-transit view, D-016) appears covered only at the `/boxes` sub-view. Confirm whether
  the reference-lab-results sub-view + `ReferralStatus` in-transit signalling has a case. Why it
  matters: referral tracking / TAT. (Blocked on open-question #2 for expected status set.)
- **Vector deconvolution chain** — pooled-specimen `LABNO.X-Y` aliquot deconvolution has no deep
  chain case with per-aliquot landing checks. Why it matters: VECTOR result integrity. (Blocked on
  open-question #1 for expected behavior.)
- **Analyzer Maintenance & Service** — `/analyzers/maintenance`, `/analyzers/{id}/configuration`,
  `EquipmentMaintenanceLog` is **specced-not-built** (spec-registry). Not yet testable; **watch**
  for a build, then author. Do not file as a coverage gap while unbuilt.
- **NotebookDashboard** — newly implemented in v3.2.1.5 (per validation-history); confirm coverage
  is beyond RENDER (a PERSIST/ROUND-TRIP case for creating and reading back an entry).

**Not gaps (scope-controlled):** per-test TAT targets (deferred to v8, D-014); home-dashboard
Domain filtering (not built — see openelis-design current-state-gotchas). New admin config pages
(Test Notification, Menu Config, Application Properties) are admin-route coverage — deferred to
`openelis-design/admin-ia-inventory.md`, not maintained here.

---

## Delta — 2026-08-01 (monthly consolidation, live-verified)

This pass had an authenticated session and the full router inventory, so — unlike the
2026-07-01 delta — the routes below are **confirmed to exist**. What is *not* confirmed is
whether each has a test case; that still needs a `master-test-cases.md` check before authoring.

### UNCOVERED — real routes with no obvious case (confirm, then author)

| Route(s) | Why it matters | Confidence |
|---|---|---|
| `/PatientMerge` | Merge is destructive and irreversible in effect; a wrong merge corrupts two patients' histories. Listed as a **GAP** in the 2026-03-24 menu map and still no case. | high — long-standing gap |
| `/FreezerMonitoring` | Cold-chain excursions invalidate specimens. Phase 17/28 exercised it by *render*; no alerting/threshold case. | medium |
| `/ReferredOutTests` | Referral TAT + the D-016 in-transit signal; complements the still-open `/SampleShipment/reference-lab-results` gap. | medium |
| `/TATReport` | The QA-dashboard TAT model (D-014/D-015) has a report surface with no case. | medium |
| `/Storage/{devices,shelves,racks,boxes}` CRUD (+ `/new`, `/:id/edit`) | Phase 28 covered **rooms** CRUD end-to-end; the other four levels of the hierarchy are unexercised. Storage is a 5-level tree — a break at shelf/rack level misplaces specimens. | high |
| `/Storage/sample-items/:id/manage-location` | The actual specimen-relocation action; the route name was wrong in this catalog until today, so it cannot have been tested. | high |
| `/analyzers/:id/qc-rules`, `/analyzers/custom-field-types`, `/analyzers/new` | QC-rule binding per analyzer; the `qc-*` specs cover the REST surface but not these UI routes. | medium |
| `/EQAMyPrograms`, `/EQAOrders`, `/EQADistribution/create` | EQA V2 is **now built** (verified today) — these three routes were never in the catalog. | high |
| `/GenericSample/{Order,Edit,Import,Results}` | A whole generic-sample lane with no cases at all. `/GenericSample/Import` in particular is a write path. | high |
| `/NotebookSampleOrder/:notebookId(/:notebookEntryId)`, `/NoteBookInstanceEntryForm/:notebookid` | NoteBook write paths. Only the dashboard was ever tested (and it was NOTE-19 blank). | medium |
| `/programView/:programSampleId` | Program-scoped sample view; pairs with `/genericProgram`. | low |
| `/AuditTrailReport` | Was tested — if at all — under the wrong names (`/AuditLog`, `/SystemLog`). ISO 15189 traceability surface. Re-verify. | high |
| Test Catalog Reagents tab (`/rest/test-catalog/{testId}/reagents`) | Linkage went from not-built to built; no case exists because it was correctly out of scope until now. | high |

### NEEDS-GUIDANCE — do not author expected results without Casey

Logged as questions in `references/open-questions.md` rather than guessed at:

1. **`/PatientMerge`** — what is the expected end state for the *losing* patient record, given
   No-Hard-Delete? Deactivated-and-linked, or tombstoned? And do that patient's existing
   accessions/results re-point to the surviving record or stay put?
2. **`/GenericSample/Import`** — what is a valid import payload, and what should happen on a
   partial-failure file (all-or-nothing, or accept-good-rows-and-report)? Also whether this
   overlaps the CSV Bulk Sample Intake epic (OGC-1138) or is a separate legacy path.
3. **`/FreezerMonitoring`** — what constitutes a reportable excursion (threshold + duration),
   and does an excursion raise an Alert that requires acknowledgment now that
   `/rest/alerts/{id}/acknowledge` ships?
4. **EQA V2 enrollment lifecycle** — the states an enrollment moves through
   (`/rest/eqa/programs/{id}/enrollments`), and what `/EQAMyPrograms` should show for a
   non-admin participant vs an admin. EQA was specced long before it was built, so the shipped
   states may not match the FRS.
5. **`/Storage` hierarchy** — on deactivating a rack/shelf that still contains sample-items,
   is the expected behavior a block, a cascade, or an orphan-and-warn?

### Re-check (previously asserted, now doubtful)

- **BUG-49** — `/MasterListsPage/menuConfiguration` is absent from the router entirely. Any case
  asserting "renders blank" is asserting the wrong thing; the parent route was never registered.
- Any historical PASS that asserted only *reachability* on `/Inventory`, `/Storage/samples`,
  `/AuditLog`, `/SystemLog`, `/ResultsByPatient`, `/ResultsByOrder`, `/LOINCManagement`, or the
  mis-cased Workplan routes — the SPA 200s on nonexistent paths, so those PASSes proved nothing.

### Now testable (were correctly deferred as unbuilt, no longer are)

EQA V2 · Test↔Reagent linkage · configurable Label Presets (`/MasterListsPage/labelPresets`) ·
alert acknowledgment. **Analyzer Maintenance & Service** (`/analyzers/maintenance`) remains
**absent** from the router — still specced-not-built, still not a coverage gap.
