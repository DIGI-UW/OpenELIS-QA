# Test Catalog Management (unified editor) — QA suite

**Spec:** `test-catalog-requirements-v2.5.md` · umbrella **OGC-949** (Mozzy) · v1 epics OGC-747/927/928/748–756.
**Target:** testing.openelis-global.org (v3.2.1.10). **Verified:** 2026-06-26 — `21 passed (4.2m)`.
**Spec/file:** `test-catalog-mgmt.spec.ts`.

Covers the NEW unified Test Catalog Management editor — **not** the legacy
`/MasterListsPage/testManagementConfigMenu` pages (which still coexist; see Δ-1).

## Routes
- List: `/admin/TestCatalogList?page=1&pageSize=25`
- Editor: `/MasterListsPage/TestCatalogEditor/<testId>/<section-slug>`

## Suites & cases
| ID | Case | Criterion |
|---|---|---|
| TC-CAT-01 | List view loads with rows | RENDER |
| TC-CAT-02 | Filter bar — Domain / Status / AMR / Search | RENDER |
| TC-CAT-03 | Search by name filters the table | FUNCTION |
| TC-CAT-04 | Pagination (page size + page count) | RENDER |
| TC-CAT-05 | Click row → editor opens (Basic Info + Save/Save-as-new/Cancel) | FUNCTION/nav |
| TC-CAT-\<slug\> ×13 | Each SideNav section renders with header + content marker | RENDER |
| TC-CAT-D1 | Δ-1 legacy Test Management menu still routable (FRS D-10 expects decommissioned) | RENDER |
| TC-CAT-D2 | Δ-2 Basic Info name/code/description not yet editable ("later milestone") | RENDER |
| TC-CAT-D5 | Δ-5 v2 sections (Labels/Reagents/Alerts/Reflex&Calc) live; Compliance absent | RENDER |

The 13 sections: basic-info, sample-results, methods, ranges, storage, panels, labels,
terminology, reagents, analyzers, alerts, reflex-calc, display-order. `testId` is **discovered**
from the list (first row), not hardcoded, so the suite is instance-portable.

## Maturity
Module rated **M1** for now: every section is verified at RENDER, list search/open at FUNCTION.
PERSIST/round-trip writes are deferred until name/code/description editing lands (Δ-2) — at which
point Basic Info, Sample & Results, Methods, Ranges, Storage, Panels, Terminology can be upgraded
to PERSIST with read-back diffs.

## Reconciliation deltas (revalidate before any Jira)
- **Δ-1** legacy menu coexists with the new editor (FRS D-10 = decommission at v1).
- **Δ-2** Basic Info name/code/description disabled (in-flight milestone, not a regression).
- **Δ-3** Ranges shows a single table + coverage cards, not the Structured/Table/Visual switcher.
- **Δ-4** List filters are Domain/Status/AMR + search only (spec also lists Section/Sample Type/Result Type).
- **Δ-5** v2 sections (Labels/Reagents/Alerts/Reflex&Calc) are live; FRS §0.2 said v1 hides them.

## Run
```bash
BASE=https://testing.openelis-global.org npx playwright test test-catalog-mgmt.spec.ts
```
Credentials default to `admin`/`adminADMIN!`; override with `OE_USER`/`OE_PASS`.
