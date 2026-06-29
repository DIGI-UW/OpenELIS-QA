# Test Catalog → Order → Result → Validation — deep chain plan + write-flow patterns

**Date:** 29 Jun 2026 · **Target:** testing.openelis-global.org 3.2.1.10 · patterns discovered live (Chrome).
**Goal (per Casey):** verify the new Test Catalog concepts end-to-end — **edit a test** + **add a new test** (with a **method linked**, **panel assigned + a new panel created**, result config) → **order** it → **enter a result** → **validate** — landing-checking each handoff. Plus RENDER/FUNCTION on the two config pages.

## Write-flow interaction patterns (the key to automating each step)

| Flow | How to drive it (verified live) | Read-back |
|---|---|---|
| **Edit Domain** | select the domain radio (real click on `label[for=domain-X] .cds--radio-button__label-text`) → a **"Change test domain?"** dialog opens → click **Confirm** → bottom **Save**. *Confirming the dialog is mandatory; without it nothing persists.* ✅ automated + passing (TC-DEEP-DOMAIN) | `GET /rest/test-catalog/tests/<id>/basic-info` → `domain` |
| **Link method** | **+ Link Method** → modal "Link Method": **Select a method to link** (combobox) + **Effective Date** + **Set as default** toggle → confirm **+ Link Method** → **Save** | `GET …/tests/<id>` methods, or Methods table row |
| **Create method** | **+ Create New Method** → (modal, same shape; creates + links) | as above |
| **Assign to panel** | **Add to panel** typeahead combobox → pick a panel → row appears (Panel/Position/Actions) → **Save** | Panels table / `…/tests/<id>` |
| **Create panel** | **Create new panel** (inline) — quick-add; note says full config (sample type, ordering modules) is at **Master Lists → Panel Management** | Panel Management list |
| **Add NEW test** | editor **Save as new test…** opens **no modal** (Δ-DUP defect) → use the **legacy "Add new tests"** page off `/MasterListsPage/testManagementConfigMenu` | Test Catalog list (search by name/code) |

General Carbon rules (from the deep suite): editor renders fast; use a **real** click on the visible target (not force/DOM, which flip the attribute but skip React state); **always confirm any modal/dialog that gates a change** before asserting; read back via the REST endpoint (different surface).

## Chain (landing check at each handoff — a break is a FAIL at that step)

```
TC-CHAIN-CAT-01 — Catalog edit/add → Order → Result → Validation   [CROSS-LINK]
 Pre: an orderable test exists; a test section + sample type configured (Data Census)
 1. Add a new test QA_AUTO_<MMDD> (legacy Add-new-tests; editor Duplicate is Δ-DUP)
        → landing: appears in Test Catalog list (search by code)                    [ROUND-TRIP]
 2. Open it in the editor; set Domain (+confirm dialog), link a Method, assign a Panel,
    create a new Panel, configure Sample & Results (result type/unit) → Save
        → landing: each reads back via /rest/test-catalog/tests/<id> + section tables  [PERSIST]
 3. Confirm the test is orderable and appears in Order Entry test picker               [CROSS-LINK]
 4. Place an order for a patient with the test                                          [ROUND-TRIP]
 5. Enter a result for it (Results by unit/order)                                       [PERSIST]
 6. Validate the result                                                                 [ROUND-TRIP]
 Fail rule: any handoff that doesn't land = FAIL at that step.
```

Hazards to design around: Carbon checkbox `.click()` hangs (DOM/skip); the order→result→validation legs reuse the existing env/vector chain helpers; some legs may be **API-substituted** (tagged) where a Carbon control blocks, keeping the data path proven while the UI gap stays visible.

## Config pages (RENDER/FUNCTION, task #75)
- **Order Entry Configuration** (`/SampleEntryConfigurationMenu`) — Modify/Select table; **shows 0 items on testing** → investigate/flag (config not seeded or not loading).
- **Result Reporting Configuration** (`/resultReportingConfiguration`) — 3 integrations (Result Reporting / Malaria Surveillance / Malaria Case Report), each Enabled/Disabled + URL + Queue Size + Save.

## Status
- Patterns discovered (task #73 ✅). Domain edit automated + passing.
- Next: author `tests/chains/chain-cat-*.spec.ts` + the config RENDER/FUNCTION spec, run green, iterate per write-flow, push to OpenELIS-QA. This is a multi-step build; each write flow + the order/result/validation legs gets verified incrementally.
