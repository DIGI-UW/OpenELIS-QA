# Bug Calibration Delta — 2026-05-12

**Method:** Document-based calibration of every BUG-* and NOTE-* entry in SKILL Section 8 against the most recent QA reports. No live retesting in this pass — destructive bugs (BUG-31 Carbon Accept checkbox, BUG-38 NCE POST) intentionally not re-triggered per the v6.1 blocking-bug etiquette.

**Sources cross-referenced:**
- `QA-revalidation-2026-04-20.md` (the most complete recent calibration pass; testing.openelis-global.org v3.2.1.6)
- `qa-report-20260421-extended.md` Section 7 (Known Bug Status — v3.2.1.6 table)
- `qa-report-20260420-full.md`
- `test-case-gaps-v3216.md`
- mgtest QA reports for v3.2.1.5 (phases 42-56)
- Inline notes in `SKILL-v6.md` Section 8 bug table

**Inventory:** 91 unique entries (53 BUG-*, 38 NOTE-*; one duplicate of BUG-30 in the bug table cleaned up below).

---

## Executive Summary

| Action | Count | What it means for Jira |
|---|---|---|
| **CLOSE — Resolved** | 9 | Fix confirmed via recent evidence. Close ticket with resolution. |
| **CLOSE — False positive** | 6 | Wrong endpoint pattern in the original probe; never a real bug. Already triaged in 2026-04-20 but Jira tickets may still be open. Close with explanation. |
| **CLOSE — Retracted** | 2 | Test method error (hash URL vs path URL); not a defect. |
| **KEEP OPEN — Still present** | 19 | Recent evidence confirms the bug is current on the actively-tested instance. |
| **KEEP OPEN — mgtest-only regression** | 8 | Failing on `mgtest.openelis-global.org` v3.2.1.5 only; testing v3.2.1.6 has the fix or different state. |
| **KEEP OPEN — Stable, low-priority** | 27 | Cosmetic / typo / a11y / i18n notes; not retested every cycle but no evidence of resolution. |
| **NEEDS RETEST — Live session required** | 18 | No evidence on v3.2.1.6 (testing) since CSRF enforcement was added; need a session with CSRF token to distinguish real bug from CSRF-masked 500. |
| **CHANGED — Update ticket** | 2 | Symptom is different now; ticket description needs amending before next session. |

**Net Jira actions today:** 9 closes (resolved) + 6 closes (false positive) + 2 closes (retracted) = **17 Jira tickets ready to close immediately**.

**Next live session priority list (top 7):** BUG-1 with CSRF, BUG-3 with CSRF, BUG-7a with CSRF, BUG-8 (TestModify data corruption — patient safety), BUG-37 (patient-order linkage), BUG-31 (Carbon Accept checkbox — needs non-destructive evidence path), BUG-38 (NCE POST hang — needs non-destructive evidence path).

---

## CLOSE — Resolved (9)

These bugs have evidence of fix in v3.2.1.6 (testing) or v3.2.1.3 (historical). Close the Jira ticket.

| ID | Jira | Evidence | Date confirmed |
|---|---|---|---|
| **BUG-9** | OGC-? | All 33 report sidebar links resolve to form pages (HTTP 200). Phase 23 Suite FJ. | 2026-04-21 |
| **BUG-10** | OGC-? | `/Aliquot` renders Search Sample form with HTTP 200. | 2026-04-21 |
| **BUG-11 / BUG-15** | OGC-? (visual blocked by OGC-591) | API HTTP 200 confirmed; React component now mounts. NoteBook Dashboard implemented on v3.2.1.5 with KPI cards. | 2026-04-21 |
| **BUG-14** | — | `/api/fhir/metadata` returns valid HAPI FHIR 7.0.2 R4 CapabilityStatement with 5 resources. Already marked Resolved in SKILL. | 2026-03 (v3.2.1.3) |
| **BUG-18** | OGC-449 | Referral organization and reason dropdowns work in expanded logbook results row. Already marked Resolved in SKILL. | 2026-03 (v3.2.1.3) |
| **BUG-19** | OGC-493 | LogbookResults POST processes referral data correctly. Already marked Resolved in SKILL. | 2026-03 (v3.2.1.3) |
| **BUG-21** | OGC-495 | All `/rest/patient-photos/{id}/true` endpoints return HTTP 200 with body `{"data":""}`. | 2026-04-20 |
| **BUG-32** | OGC-534 | `GET /rest/LogbookResults` returns HTTP 200 in 214ms with 14 orders. | 2026-04-20 |
| **BUG-56** | OGC-567 | `GET /api/OpenELIS-Global/fhir/metadata` returns valid HAPI FHIR R4 CapabilityStatement. (Path is `/api/OpenELIS-Global/fhir/metadata`, not `/fhir/metadata`.) | 2026-04-20 |

**Bonus — partially resolved (keep open but downgrade):**

- **BUG-1** — Server no longer crashes (`POST /rest/TestAdd` returns HTTP 200 not 500). But test creation still fails per BUG-12 (form inputs lack `name` attributes; server returns validation error "jsonWad: NotBlank"). **Action:** Downgrade BUG-1 from Critical to Medium and merge it into BUG-12. The 500-crash aspect is resolved; the broken form-field serialization remains.

---

## CLOSE — False positive / wrong endpoint pattern (6)

These bugs were filed against guessed REST endpoint paths that the application never calls. Real endpoint behavior confirmed working via live network capture during the 2026-04-20 revalidation. Close ticket with the "false positive" explanation. **The v6.1 Section 6.5 rule was added specifically to stop this class.**

| ID | Jira | Bug claim | Reality |
|---|---|---|---|
| **BUG-34** | OGC-535 | `GET /rest/organizationSearch` → 404 | Organization is at JSP `/api/OpenELIS-Global/Organization` plus `/rest/OrganizationMenu` (200). |
| **BUG-50** | OGC-565 | `GET /rest/provider` → 404 | Provider Management is JSP `/api/OpenELIS-Global/ProviderMenu`; `/rest/ProviderMenu` returns 200. |
| **BUG-51** | OGC-562 | `GET /rest/dictionary` → 404 | Dictionary is JSP `/api/OpenELIS-Global/DictionaryMenu` (200, 701 entries) plus `/rest/DictionaryMenu` (200). |
| **BUG-52** | OGC-563 | `GET /rest/patient/search` → 404 | Patient search uses `/rest/patient-search-results` (200, confirmed via live network capture). UI works. |
| **BUG-53** | OGC-566 | `GET /rest/referrals` → 404 | The Referred Out Tests React page renders all 4 search panels correctly. The old path was never a valid endpoint. |
| **BUG-54** | OGC-568 | Multiple admin REST paths → 404 | `/rest/calculatedValue`, `/rest/organization/1/providers`, `/rest/testSections`, `/rest/labUnit` — none are valid app endpoints. Admin pages use JSP or differently-named REST paths. |

**Action:** Close each Jira with comment referencing the actual working path. SKILL Section 6.5 prevents recurrence.

---

## CLOSE — Retracted (2)

| ID | Reason |
|---|---|
| **BUG-23** | Test method error — used hash-based URLs (`#/RoutineReport`) which the SPA doesn't use. Report routes work via sidebar clicks (path-based, `/Report?type=patient&report=...`). Already marked retracted in SKILL Validation History Phase 14/15. |
| **BUG-57** | Same root cause as BUG-23. `/rest/report/*` was never the report generation endpoint; reports use JSP `/api/OpenELIS-Global/ReportPrint`. Phase 18 (2026-04-20) confirmed Generate button opens PDF viewer correctly. **Note:** BUG-57 also has a mgtest-only manifestation (React Router redirect to Dashboard) that may still apply on `mgtest.openelis-global.org` v3.2.1.5 — see "KEEP OPEN — mgtest-only" below. |

For BUG-57: close the testing.openelis-global.org branch; if mgtest is in scope, file a separate, scoped ticket for the React Router basename issue.

---

## KEEP OPEN — Still present on testing.openelis-global.org v3.2.1.6 (19)

Recent evidence confirms still broken on the actively tested instance.

| ID | Severity | Evidence | Next action |
|---|---|---|---|
| **BUG-2 EXTENDED** | High | Carbon checkbox `.click()` 60s hang. Not retested in 04-20 (no checkbox testing). | Re-confirm via non-destructive evidence path (DOM inspection of Carbon Checkbox React fiber). |
| **BUG-3** | High | `POST /rest/UnifiedSystemUser` → 500 with correct payload shape. **Uncertain** whether CSRF token would change this. | Retest WITH CSRF token. |
| **BUG-4** | Medium | ModifyOrder generates new accession. Not retested since v3.2.1.3. | Live retest. |
| **BUG-6** | Low | Duplicate sample type in test name "HGB(Whole Blood)(Whole Blood)". | Confirm via Test Catalog read. |
| **BUG-7a** | High | `POST /rest/PanelCreate` silent fail. CSRF-masked candidate. | Retest WITH CSRF token. |
| **BUG-8** | **Critical (patient safety)** | TestModify silently drops normal ranges. Cannot retest without an existing test ID (TestAdd GET returns empty on testing). | Highest priority for next session — needs a seeded test. |
| **BUG-12** | Medium | TestAdd form Reporting Test Name inputs lack `name` attributes. Re-confirmed 2026-04-20: `jsonWad` POST field is blank. | Open issue against OpenELIS upstream; this is now the actual root cause of BUG-1. |
| **BUG-13** | Critical | `GET /TestModifyEntry` HTTP 500 after failed TestAdd. Documented as "RESOLVED" in Phase 29 (HTTP 200) but not confirmed against v3.2.1.6. | Confirm with live retest. |
| **BUG-17** | Low | "Accesion" typo. Still present 2026-04-20. Static text. | Open upstream PR for the typo. |
| **BUG-20** | Medium | Login Name field permanently invalid. Phase 24 said likely fixed in v3.2.1.4. Phase 41 reconfirmed with CSS class `defalut`. | Live retest with the User Create form. |
| **BUG-22** | Medium | No rate limiting. 5 rapid requests to `/rest/home-dashboard/metrics` → all 200, no 429. | Open upstream. |
| **BUG-29** | High | Rejection workflow silo — rejection captured in `sample_item` but never reaches `qa_event`. Rejection Report PDF returns 503. | This is Chain B in v6 — will fail every session until fixed. |
| **BUG-31** | High | Carbon Accept checkbox 60s renderer hang. **Do NOT re-trigger** per v6.1 etiquette — use indirect evidence path: DOM inspection of checkbox React props or API-substitute the result entry. | Live retest with indirect path only. |
| **BUG-37** | High | Patient-order linkage failure. Cannot retest without order data on this instance. | Live retest with a freshly-created order. |
| **BUG-38** | **Critical** | `POST /rest/reportnonconformingevent` hangs indefinitely. **Do NOT re-trigger** — exhausts Chrome connection pool. | Confirm via server logs / OpenELIS team only. |
| **BUG-42** | Medium | `ReportPrint?report=X` → 500 for `statisticsReport` and `auditTrail`. | Live retest. |
| **BUG-43** | Low | `/GenericSample/Results` breadcrumb shows raw i18n key `sample.label.generic`. | Open upstream. |
| **BUG-44** | Low | Inventory Lots and Catalog show `label.button.action` instead of "Actions". | Open upstream. |
| **BUG-45** | Medium | `POST /rest/inventory/reports/generate` → 404. Export Format dropdown empty. | Backend endpoint not implemented; open upstream. |

---

## KEEP OPEN — mgtest-only regression (8)

These bugs apply to `mgtest.openelis-global.org` v3.2.1.5 but the corresponding feature works correctly on testing.openelis-global.org v3.2.1.4 or v3.2.1.6. mgtest v3.2.1.5 has multiple REST endpoint regressions specific to that build. **Action:** Keep tickets open but tag with `mgtest-only` label so they don't block testing-instance work.

| ID | mgtest status |
|---|---|
| **BUG-46** | Calculated Value admin: REGRESSED on mgtest v3.2.1.5 (`/rest/calculatedValue` 404). Fixed in v3.2.1.4. |
| **BUG-48** | Partial: `PatientConfigurationMenu` fixed in v3.2.1.5; 3 of 4 General Config sub-pages still blank (SampleEntry, OrderEntry, Printer). |
| **BUG-50** | Provider Management UNKNOWN_ row on v3.2.1.5 — **but the underlying API path bug is a false positive on testing** (see CLOSE above). The mgtest manifestation is real and different: it's a UI-degradation symptom of a missing data path, not the same bug. Recommend a new mgtest-only ticket and close BUG-50 on testing. |
| **BUG-55** | React Router basename — FIXED Phase 54 mgtest, no longer applies. **Move to CLOSE.** |
| **BUG-57** | Reports redirect to Dashboard on mgtest. Different from the testing-instance retraction. Keep open as mgtest-only. |
| **BUG-58** | (Not in table — referenced in Validation History; needs investigation.) |
| **BUG-59** | 9 of 15 admin sub-pages blank on mgtest v3.2.1.5. |
| **BUG-60** | LogbookResults filter ineffective on mgtest — **but on testing v3.2.1.6 retracted as false positive** (wrong param name in old test). The mgtest behavior may be a real backend issue (`testResult` objects have no `testSectionId` field). Recommend new mgtest-only ticket, close BUG-60 on testing. |

Update for BUG-55: also move to **CLOSE — Resolved** since Phase 54 confirmed all WorkPlanBy* routes restored.

---

## KEEP OPEN — Stable cosmetic / a11y / i18n (27)

These NOTE-* and minor BUG-* entries are stable findings — not retested every cycle, but no evidence of resolution and not destructive to leave open. **Action:** Batch into upstream PRs by category.

**Typos (5):** BUG-17 "Accesion", NOTE-17 "labratory", NOTE-24 "Succesfuly", NOTE-26 "Orginal", NOTE-30 "Accesion", NOTE-31 "Recieved", NOTE-34 "panels"→"sample types" copy-paste, plus NC By Date title missing space, External Referrals "labratory". **Batch upstream PR opportunity.**

**Untranslated i18n keys (7):** BUG-16 (banner.menu.alerts, eqa.distribution), BUG-43 (sample.label.generic), BUG-44 (label.button.action), BUG-47 (4 Inventory modal keys), NOTE-13 (`<html lang>` not updated), NOTE-28 (raw key `report.labName.two`), NOTE-35 (Legacy Admin top nav). **Translation Management work — could be one PR adding the missing keys to messages bundle.**

**Accessibility (5):** NOTE-2, NOTE-8, NOTE-9, NOTE-10, NOTE-11, NOTE-12. Mix of skip-link, focus indicator, heading hierarchy, aria-live, touch target, color contrast. **Carbon sidebar overhaul candidate.**

**Security informational (4):** NOTE-4 (CSP unsafe-inline), NOTE-5 (Referrer-Policy missing), NOTE-6 (input reflection in JSON), NOTE-7/15 (Exception leak in errors). **One upstream issue listing all four.**

**UX / cosmetic (10+):** NOTE-1 (raw 404 JSON), NOTE-3 (API field typos), NOTE-16 (PDF header "null"), NOTE-18 (Billing stub), NOTE-19 (NoteBook blank — now resolved on v3.2.1.5), NOTE-20 (NCE naming inconsistencies), NOTE-21 (Help video/release stubs), NOTE-22 (Delete `{name}` placeholder), NOTE-23 (search empty state), NOTE-25 (Order submit despite validation), NOTE-27 (PDF "null" in Contact Tracing), NOTE-29 ("undefined undefined ♀ Female"), NOTE-32 (Billing href empty), NOTE-33 (NoteBook blank — now resolved), NOTE-36 (Global Search non-functional), NOTE-37 ("Accesion"), NOTE-38/39 (duplicate dropdown options — config issue), NOTE-40 (duplicate workplan test entries), NOTE-41 (Billing href empty — duplicate of NOTE-32), NOTE-42 (NoteBook blank page — now resolved).

**Recommended:** Consolidate duplicates (NOTE-32 ≈ NOTE-41 ≈ BUG-10; NOTE-19 ≈ NOTE-33 ≈ NOTE-42 ≈ BUG-11/15). Close duplicates.

---

## NEEDS RETEST — Live session required (18)

CSRF token enforcement is new in v3.2.1.6. Prior 500 responses to POST endpoints may have been CSRF-masking errors, not real bugs. Until retested WITH CSRF token, status is genuinely uncertain.

| ID | Why retest |
|---|---|
| **BUG-1** | TestAdd POST 500 → likely CSRF-masked; server now returns 200 + validation error per 04-21 evidence. Confirm with CSRF + valid payload. |
| **BUG-3** | UserCreate POST 500 → CSRF-masked candidate. |
| **BUG-7a** | PanelCreate silent fail → CSRF-masked candidate. |
| **BUG-4** | ModifyOrder accession behavior — unverified since v3.2.1.3. |
| **BUG-7** | PanelCreate Next button — likely same as BUG-7a. |
| **BUG-8** | TestModify data corruption — patient safety; need a seeded test to retest. **Highest priority.** |
| **BUG-13** | TestModifyEntry GET 500 → Phase 29 says HTTP 200 now, but not on v3.2.1.6 specifically. |
| **BUG-20** | Login Name invalid flag — Phase 24 says likely fixed. |
| **BUG-30** | bannerHeading Modify spinner — not retested since v3.2.1.3. |
| **BUG-31** | Carbon Accept checkbox hang — use indirect evidence only. |
| **BUG-37** | Patient-order linkage — needs fresh order. Highest priority. |
| **BUG-38** | NCE POST hang — indirect evidence only; check server logs. |
| **BUG-39** | EQA samples dashboard 404 — confirm with EQA enabled. |
| **BUG-40** | Inventory storage POST 500 — retest with CSRF + clean payload. |
| **BUG-41** | Inventory active filter ignored — retest GET. |
| **BUG-42** | Two reports return 500 — retest after Reports module verified. |
| **BUG-49** | menuConfiguration parent route blank — retest. |
| **BUG-61** | Multiple admin React endpoints return 404 — needs the live admin walk. |

---

## CHANGED — Update ticket before next session (2)

| ID | Change |
|---|---|
| **BUG-1** | Severity Critical → Medium; merge with BUG-12. Server no longer crashes; form-field serialization is the actual remaining bug. |
| **BUG-32** | Already resolved in 04-20 calibration but if any consumer still references the 60s hang, redirect to BUG-31 (which is the surviving Carbon checkbox hang, different surface). |

---

## Top 5 priorities for the next live session

These five must be retested in person; they cannot be resolved from documents alone.

1. **BUG-8 — TestModify silent data corruption (patient safety).** Seed one test on the instance (assuming BUG-1+12 don't block), modify it, read back, diff the ranges. Highest-impact unverified bug in the catalog.
2. **BUG-37 — Patient-order linkage on Add Order.** Create one order with a known patient, then Modify Order on the new accession and assert patient appears. This is Chain A from SKILL §11 — will fail every session until fixed.
3. **BUG-1 + BUG-3 + BUG-7a — CSRF retest battery.** POST to TestAdd, UserCreate, PanelCreate WITH the X-CSRF-Token header (read from `localStorage['CSRF']`). Distinguish real bugs from CSRF-masked 500s.
4. **BUG-31 — Carbon Accept checkbox.** Use indirect evidence path (DOM inspection of the Carbon Checkbox React fiber, no `.click()`). Confirm hang behavior is still present without triggering it.
5. **BUG-40 / BUG-41 — Inventory storage feature.** Retest the storage-location POST with CSRF and a known-good payload, and re-verify the `?isActive=true` filter. These are the seed example for v6 — important to confirm they're still in the state the methodology was built to surface.

---

## Appendix — Jira ticket actions list (copy-paste ready)

The following can be applied today, without a live OpenELIS session:

```
CLOSE — Resolved:
  OGC-495  BUG-21  patient-photos 500 → 200 confirmed 2026-04-20
  OGC-534  BUG-32  LogbookResults hang resolved 2026-04-20
  OGC-567  BUG-56  FHIR R4 stack deployed and working 2026-04-20
  (?)      BUG-9   Reports 404 resolved 2026-04-21
  (?)      BUG-10  Aliquot 404 resolved 2026-04-21
  (?)      BUG-11/BUG-15  NoteBook API resolved 2026-04-21
  (?)      BUG-14  FHIR metadata resolved in v3.2.1.3
  OGC-449  BUG-18  Referral dropdowns resolved in v3.2.1.3
  OGC-493  BUG-19  Referral POST resolved in v3.2.1.3
  (?)      BUG-55  React Router basename fix confirmed Phase 54

CLOSE — False positive (wrong endpoint pattern):
  OGC-535  BUG-34  /rest/organizationSearch never a valid path
  OGC-565  BUG-50  /rest/provider — Provider Management is JSP-based
  OGC-562  BUG-51  /rest/dictionary — actual is /rest/DictionaryMenu
  OGC-563  BUG-52  /rest/patient/search — actual is /rest/patient-search-results
  OGC-566  BUG-53  /rest/referrals never a valid path
  OGC-568  BUG-54  /rest/calculatedValue + others — never valid paths

CLOSE — Retracted (test method error):
  (?)      BUG-23  hash-URL test method error
  OGC-564  BUG-57  /rest/report/* never the generation endpoint (testing branch only; keep open for mgtest)

DOWNGRADE + MERGE:
  OGC-474  BUG-1  Critical → Medium; merge with BUG-12 (form name attr missing). Server no longer crashes.
```

Once these are applied, the open Jira count drops from ~50 to ~33. The remaining open tickets become a clean priority list for upstream PRs (typos, i18n keys, accessibility batches) and live retests.

---

## What this calibration does NOT cover

- **No live verification.** Doc-based only. The "STILL PRESENT" status of bugs marked "Unverified" in the 04-21 table (BUG-2, BUG-3, BUG-4, BUG-7/7a, BUG-8, BUG-12, BUG-13, BUG-17, BUG-20, BUG-22) is inherited from prior reports, not freshly confirmed. The next live session is required to upgrade those from "presumed still present" to "confirmed still present."
- **Jira API not executed.** The Atlassian MCP is currently disconnected. The Jira actions in the appendix are a list for you to execute via the web UI or via a future MCP session.
- **Duplicates not deduped.** NOTE-19 / NOTE-33 / NOTE-42 (NoteBook blank) and NOTE-32 / NOTE-41 / BUG-10 (Billing stub) are kept separate in the table for traceability. The next SKILL update should consolidate them.
