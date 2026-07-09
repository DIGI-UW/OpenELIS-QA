# Test Catalog editor — round-trip Playwright suite

`test-catalog-sections-roundtrip.spec.ts` — deterministic, re-runnable coverage of the new
Test Catalog editor (sections A–G), codified from the manual Chrome QA runs of 2026-07-06→08.

**Approach:** drive the real editor UI with Playwright (its `fill()`/`selectOption()`/`check()`
fire React's `onChange` reliably — no native-setter hacks needed), then **verify through the REST
read-back endpoint** so every write carries round-trip evidence. Pure-API guards cover the bugs.

## Run it

```bash
# from the OpenELIS-QA repo root
BASE=https://testing.openelis-global.org \
OE_USER=admin OE_PASS='adminADMIN!' \
npx playwright test test-catalog-sections-roundtrip.spec.ts

# single test
npx playwright test test-catalog-sections-roundtrip.spec.ts -g "Valid range"
```

Env: `BASE` (instance URL), `OE_USER`/`OE_PASS`, `SERUM_ID` (default 2).
New tests are created with the `QA_AUTO_<MMDD>` prefix (deactivate/reactivate cleanup — never hard-delete).

## What it covers

| Test | Group | Asserts |
|---|---|---|
| TCA-03 | A | Duplicate code → field error "A test with this code already exists.", no create (list total unchanged). |
| TCC-10 | C | Two components render as an accordion, both persist (`/sample-results`), reorder round-trips (top component changes). |
| TCC-D | C | Dictionary result type + select-list options round-trip: `resultType=D`, 2 options with `value`/`valueName`/`sortOrder`, and the `normal` flag. Uses the guided result-type chooser (FR-28) + dictionary typeahead. |
| TCC-M | C | **Guard**: advanced Multi-select type persists (`M`) but its select-list options do **not** (OGC-1123) — flips when fixed. Advanced chooser offers Multi-select / Cascading / Titer / Alpha; M and A type-selection round-trip. |
| TCD | D | Reference range **Normal + Critical + Valid** round-trips (`lowValid/highValid`), bound to the chosen **component** (`componentId`, FR-19). |
| TCF-02 | F | Add-to-existing-panel and remove-membership round-trip (`/panels`). |
| TCF-02b | F | **Guard**: inline "Create new panel" is a no-op (OGC-1122) — flips when fixed. |
| TCF-03 | F | Methods: Link Method (EIA) persists — API read-back `/rest/test/{id}/methods`. |
| TCF-04 | F | Labels: Specimen Label preset + override persist — API read-back `/rest/api/tests/{id}/labelConfig`. |
| TCF-05 | F | Alerts: rule with Critical trigger + Email persists — API read-back `/rest/test-catalog/{id}/alerts`. |
| OGC-1116 | G | Created + activated test appears in `/rest/test-list` (orderable; note: reindex-dependent). |
| OGC-1115 | guard | Deactivate still non-functional (`POST /deactivate`→404, `DELETE /activate`→405). |
| OGC-1120 | guard | `/rest/sample-type-tests` → 500 without param, 200 with `?sampleType`. |
| OGC-1114 | guard | Top-toolbar Save does not persist Basic Info edits (API read-back unchanged). |
| TCC-T | full-flow | **(sibling file `test-catalog-titer-runtime.spec.ts`)** Titer (T) config → activate → panel-orderable → place Serum order → assert an interactive result-entry control renders → save → validate. Closes the Titer runtime gap the manual wizard couldn't reach (panel selection dropped by native-setter clicks; Playwright `.check()` fires onChange). |

**Guard pattern:** the OGC-1114/1115/1120/1122 tests PASS while the bug is present and are marked
FIXME — when a fix lands, the assertion flips and the test fails, prompting an update.

## Endpoints (verified 2026-07-08 · testing.openelis-global.org v3.2.1.10)

```
GET  /rest/test-catalog/tests?search=&page=&pageSize=     -> { total, rows:[{id,name}] }
POST /rest/test-catalog/tests                             (create; Inactive by default)
GET/PUT /rest/test-catalog/tests/{id}/basic-info          (top-toolbar Save is a no-op — OGC-1114; Name now read-only)
GET  /rest/test-catalog/tests/{id}/sample-results         -> { components:[{id,label,code,resultType,displayOrder,options}] }
GET  /rest/test-catalog/tests/{id}/ranges                 -> { ranges:[{componentId,minAge,lowNormal,highNormal,lowCritical,highCritical,lowValid,highValid}], coverage }
GET  /rest/test-catalog/tests/{id}/panels                 -> { memberships:[{panelId,panelName,position}] }
GET  /rest/test-catalog/tests/{id}/terminology            -> { mappings:[{id,source,code}] }
POST /rest/test-catalog/tests/{id}/activate               (200)   ·  POST .../deactivate -> 404  ·  DELETE .../activate -> 405
GET  /rest/test-list                                      -> [{id,value}]   (orderable list)
GET  /rest/sample-type-tests?sampleType={id}              -> { panels:[{testIds}] }  ·  no param -> 500

# Methods/Labels/Alerts live in THREE other namespaces (discovered 2026-07-08 via perf-timing capture):
GET  /rest/test/{id}/methods                              -> [{methodId,methodName,isDefault,effectiveDate}]
GET  /rest/api/tests/{id}/labelConfig                     -> { allowOrderEntryOverride, links:[...presets] }
GET  /rest/test-catalog/{id}/alerts                       -> [{name,enabled,triggerType,notifyEmail,...}]   (NB: no /tests/ segment)
```

## Result-type coverage (type-selection round-trip, verified 2026-07-08)
All 7 types persist their `resultType` code via the guided chooser (+ Advanced/legacy disclosure for M/C/T/A):
`N` Numeric · `D` Single-select/dictionary · `R` Free text · `M` Multi-select · `C` Cascading multi-select · `T` Titer · `A` Alpha.
**Options:** dictionary (D) options persist (TCC-D). **Multi-select (M) and Cascading (C) options do NOT persist** — the shared "Select-list options" editor is a no-op for both (OGC-1123; guarded by TCC-M). Cascading renders the same flat editor as multi-select (no grouped/hierarchical UI yet, despite its description).

## Known gaps (not yet automatable here)
- **Result-entry controls at runtime** for non-numeric types — configured/verified in the editor. **Dictionary (D) now confirmed live end-to-end (2026-07-08):** test 382 ordered via the Bilan Biochimique panel (order DEV01260000000000003) renders a native `<select>` at Results → By Order with exactly its two configured options; result saved + validated/released. Titer/Multi-select/Cascading runtime controls still need their own placed orders.
- **Grouped/hierarchical cascading options** — not present in the UI (renders the flat editor); revisit if a dedicated cascading structure ships.
- **LOINC routing, no-LOINC/dup-LOINC warnings** — need a FHIR/analyzer feed.
- **Critical-vs-abnormal indicator** (OGC-1121) — now guarded by `test-catalog-critical-indicator.spec.ts` (TCG-02): creates a numeric test with Normal 5–100 / Critical 2–150, orders it, and asserts a critical value (200) is styled identically to an abnormal one (120) — PASS while the bug is present, flips when a distinct critical marker ships. The **group editor** (FR-8–14) remains uncovered.

Sibling specs: `test-catalog-result-types.spec.ts`, `test-catalog-editor-regressions.spec.ts`, `test-catalog-downstream.spec.ts`, `test-catalog-titer-runtime.spec.ts` (Titer full-flow, TCC-T).

Run the Titer full-flow deterministically:

```bash
BASE=https://testing.openelis-global.org OE_USER=admin OE_PASS='adminADMIN!' \
npx playwright test test-catalog-titer-runtime.spec.ts
```
