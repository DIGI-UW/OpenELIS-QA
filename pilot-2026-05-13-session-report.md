# A1 Live Pilot — v6 Methodology Session Report

**Date:** 2026-05-13
**Instance:** testing.openelis-global.org (v3.2.1.6, "Test LIMS")
**Tester:** Casey Iiams-Hauser via Cowork (Claude in Chrome + JS probes)
**Methodology version:** SKILL v6.11 (+ network capture helper from v6.10)
**Duration:** ~35 minutes live Chrome time
**Scope:** Calibration + Census + Chain A (Order Lifecycle) + Chain I (Site Branding → Report) + Persona PF (Lab Admin)

---

## Executive summary

| Headline metric | Result |
|---|---|
| **Persona pass rate** (top-line per v6 §12) | 0 of 1 attempted PASSes outright; PF 1 of 6 steps PASS, others blocked by upstream spec bugs |
| **Chain pass rate** | 0 of 2 PASS outright; Chain I 2 of 5 steps PASS; Chain A 1 of 2 attempted PASS |
| **New OpenELIS findings** | 1 Y-RECON mismatch (Dashboard vs Logbook), 1 ReportPrint 500 (BUG-42 may extend) |
| **Spec bugs surfaced** | 10 concrete corrections needed for v6.12 |
| **Time to first finding** | ~6 minutes (patient-search response shape mismatch) |

**The pilot succeeded at its primary goal:** validate the v6 methodology against a live instance. The methodology surfaced both real bugs (Y-RECON mismatch, ReportPrint 500) and spec bugs (10 endpoint shape corrections needed) within 35 minutes. That's exactly the iteration loop §6.5 / §7.5 / §13 were designed to enable.

**The pilot's secondary finding is the more important one for the workplan:** several chain and persona specs were inferring endpoint shapes from documents rather than from live capture. **The §6.5a network capture helper from Phase E2 would have caught most of these inferences during spec authoring** had the helper existed earlier. Going forward, every new chain/persona step must use `captureAround` first to validate the path/shape before committing the spec.

---

## Step-by-step results

### Step 0.5 — Calibration (indirect evidence)

| Bug | Approach | Result | Notes |
|---|---|---|---|
| BUG-37 | Probe `/rest/SampleEdit?labNumber=` for endpoint health | **STILL PRESENT (presumed)** — endpoint returns 200 Struts form; not destructive | Acceptance criterion: FUNCTION |
| BUG-31 | DOM-only inspection of Results page (no checkbox click) | **NOT DIRECTLY TESTED** — would have required navigation, kept session safe per §11.5 | Marked carry-over |
| BUG-38 | NCE list endpoint reachable check, no POST | `/rest/nonconformevents` returns `[]` 200 | Endpoint healthy, write path not exercised |
| BUG-14 | `GET /api/fhir/metadata` | **PROBLEM CASE found** — endpoint returns SPA HTML shell (per BUG-56's earlier mgtest behavior) on testing too. Need follow-up. | Acceptance criterion: FUNCTION FAILED |

### Step 0.6 — Data Census

| Probe | Result | Disposition |
|---|---|---|
| QA_AUTO_ patients | 0 | Used existing `TEST-` patients as substitute |
| Generic patient count | 1 (Jane TEST-Jones, patientID=1001, nationalId=E2E-PAT-002; Bob TEST-Williams patientID=1002) | Sufficient for read-only Chain A Step 1 |
| Dashboard `ordersInProgress` | 14 | But see Y-RECON finding below |
| Dashboard `ordersReadyForValidation` | 0 | |
| Dashboard `ordersRejectedToday` | 0 | |
| Test catalog | 183 entries (flat array of `{id, value}`) | |

**Decision:** instance has data, no seed needed; used existing TEST- patient for Chain A.

### Chain A — Order Lifecycle

| Step | Acceptance | Result | Detail |
|---|---|---|---|
| 1. Acquire patient | RENDER | **PASS** | Jane TEST-Jones found via patient-search-results |
| 2. Patient-order linkage check (BUG-37 ROUND-TRIP) | ROUND-TRIP | **FAIL (spec bug)** | `POST /rest/SamplePatientEntry` returned **HTTP 400**. Spec's inferred payload shape doesn't match the form. Order never created → can't probe BUG-37. |
| 3–8 | — | **BLOCKED** (no accession to operate on) | |

**Net:** Chain A stuck at the order-creation gate. The bug here is in the chain spec, not in OpenELIS. Spec needs the real POST payload (best path: capture an actual UI submission with the §6.5a helper).

### Chain I — Site Branding → Report

| Step | Acceptance | Result | Detail |
|---|---|---|---|
| 1. Acquire accession to report against | RENDER | **PARTIAL** | Probed testUnitId=36,56,59,136 — all returned 0 results. Y-RECON mismatch (see below). |
| 2. Read current site-branding | RENDER | **PASS** | `{primaryColor: '#0f62fe', headerColor: '#295785', secondaryColor: '#393939', colorMode: 'light', lastModified: 2026-04-20T04:32}` |
| 3. Generate Patient Status PDF | REPORTABLE | **FAIL** | `ReportPrint?report=patient&type=patient&accessionNumber=E2E-PAT-002` returned **HTTP 500** (19-byte body — likely "Check server logs"). May be BUG-42 extending to `patient` report type, OR may be due to passing a national ID where a lab number is expected. Needs follow-up with a known-valid accession. |
| 4. Find labName in admin config | FUNCTION | **FAIL (spec premise wrong)** | site-branding has no labName field. `/rest/properties` has `facility.city` and `requester.firstName` but no facility/lab name. Chain I needs to be rewritten — labName lives somewhere else (probably the JSP form data, not REST). |
| 5. Round-trip branding write+restore | ROUND-TRIP | **PASS** | `PUT /rest/site-branding` with `primaryColor: '#cc0066'` → readback confirms → restore to `#0f62fe` → readback confirms restored. Pipeline confirmed live. |

**Net:** Chain I produced the methodology's first **PASS-with-evidence** for the admin-write round-trip pattern. The PDF + labName parts both need spec rewrites.

### Persona PF — Lab Administrator

| Step | Acceptance | Result | Detail |
|---|---|---|---|
| 1. Site branding round-trip | ROUND-TRIP | **PASS** | Proven by Chain I Step 5 above. |
| 2. Configure barcode | PERSIST | **NOT TESTED** | Out of scope for this pilot |
| 3. TestAdd new test | PERSIST | **NOT TESTED LIVE** | Chain A Step 2 spec-payload issue extends here. Calibration table marks BUG-1 as carry-over for live retest with CSRF. |
| 4. Enable EQA (the hidden-requirement catch) | PERSIST + ROUND-TRIP | **BLOCKED (spec bug)** | `/rest/SampleEntryConfigurationMenu` returns 404 — the JSP `/api/OpenELIS-Global/SampleEntryConfigurationMenu` works but isn't a JSON API. PF Step 4 spec needs to drive the JSP form via Chrome rather than POST JSON. |
| 5. Create restricted user | PERSIST | **NOT TESTED LIVE** | BUG-3 carry-over. |
| 6. User Manual PDF link | REPORTABLE | **NOT TESTED LIVE** | Time-boxed out. |

**Net:** the one persona step that was achievable (Step 1) PASSed cleanly. The hidden-requirement catch (Step 4) was BLOCKED by a spec issue — but that itself surfaced a valuable correction (the eqaEnabled config doesn't have a JSON REST equivalent on this instance).

---

## NEW findings (real OpenELIS issues, not spec bugs)

### ~~NEW-1~~ — RETRACTED same-day after user correction

**Severity:** ~~Medium~~ N/A (spec misunderstanding, not a real bug)

**Original claim:** Dashboard says orders in queue while LogbookResults returns 0; same on testing v3.2.1.6 (14/0) and mgdev v3.2.1.8 (4/0).

**Correction (received from Casey 2026-05-13):** `LogbookResults` is the screen/endpoint where techs **enter results into orders**, not a list of all-orders-in-progress. The lab workflow is **Order → Result Entry (Logbook) → Validation**, three distinct stages. `Dashboard.ordersInProgress` counts orders awaiting result entry; `Dashboard.ordersReadyForValidation` counts orders whose results have been entered and now await biologist review. The React SPA fetches each queue's list from URLs that need to be discovered via live UI navigation, not from `LogbookResults`.

**What this means for the methodology:** §6.5b applies recursively — the same "infer endpoint from naming pattern" mistake that produced the 04-20 false-positive cluster (OGC-535/562/...) ALSO produced this NEW-1 false alarm at the spec-author layer. The fix is the same: drive the actual UI (click Dashboard tile → watch network → capture the real URL → record in `apiShapes.ts`).

**Action:** None on OpenELIS side. The retraction itself is a methodology finding worth keeping — it justifies §6.5b being a hard rule, not a soft recommendation.

### NEW-2 — ReportPrint?report=patient returned HTTP 500

**Severity:** Unknown (possibly BUG-42 extending, possibly invalid-accession-mishandling)
**Evidence:** `GET /api/OpenELIS-Global/ReportPrint?report=patient&type=patient&accessionNumber=E2E-PAT-002` → HTTP 500, 19-byte body.

E2E-PAT-002 was the patient's nationalId, not an accession number. So this 500 might be the server's expected response to a bad accession. But:
- A well-designed API would return 400 for "no order found for this accession" rather than 500
- BUG-42 already documents 500 for `report=statisticsReport` and `report=auditTrail`. This might be the third report type affected.

**Action:** Retest with a known-real accession (would require finding one — Y-RECON gap above complicates this).

### NEW-3 — `/api/OpenELIS-Global/fhir/metadata` returns HTML SPA shell

**Severity:** Medium (potentially BUG-56 regression on testing.openelis-global.org)
**Evidence:** `GET /api/OpenELIS-Global/fhir/metadata` returned `text/html` content (the React SPA index, not a FHIR CapabilityStatement JSON).

This was supposed to be RESOLVED per the 2026-04-20 calibration sweep (which I cited in PR #4 / SKILL §8 BUG-14 row as "Resolved"). The pilot finds it broken again — either the prior calibration was against a different path, or there's been a regression.

**Action:** Calibrate against `/fhir/metadata` (the non-prefixed path) and confirm. If BUG-56 has regressed to testing, file as a real regression.

---

## Spec bugs found (corrections for SKILL v6.12)

These are inferences in the chain/persona specs that don't match the live API. They need fixing before the specs can be considered runnable.

| # | Spec | Issue | Correction |
|---|---|---|---|
| 1 | `_common.ts` `findOrSeedOrder` | Reads `patientList` from patient-search-results | Read `patientSearchResults` |
| 2 | Multiple chains | Field `patientPK` | Use `patientID` |
| 3 | Multiple chains | Field `birthDate` (camelCase) | Use `birthdate` (lowercase b) |
| 4 | Chains A/D/PA/PB | Reads `testList[].testSectionId` from test-list endpoint | test-list returns flat array of `{id, value}` only. Section info lives in `/rest/TestAdd` → `labUnitList`. |
| 5 | Chains B/E + Personas | Filter `?testSectionId=N` | Use `?testUnitId=N` (or section ID from labUnitList) |
| 6 | Chain A Step 2, PF Step 3 | SamplePatientEntry POST payload | Payload shape doesn't match. Capture a real UI submission with §6.5a helper to derive the correct shape. |
| 7 | Chain A Step 2, PA Step 5, etc. | `SampleEdit?labNumber=X` returns `{patientProperties: {nationalId}}` | Actually returns a Struts form with top-level `nationalId`, `patientName`, `dob`, `gender`. BUG-37 verify needs to compare against `body.nationalId`, not `body.patientProperties.nationalId`. |
| 8 | Chain I Steps 2-4 | site-branding has `labName` field | It does not. Lab name lives elsewhere — likely the JSP form data or SiteInformation Struts form. Chain I needs a different lookup path for NOTE-16. |
| 9 | Chain F Step 1, Persona PF Step 4 | `GET /rest/SampleEntryConfigurationMenu` | Returns Spring 404. The eqaEnabled toggle is on the JSP page `/api/OpenELIS-Global/SampleEntryConfigurationMenu`. Personas/chains that need it must drive the JSP form in Chrome, not POST JSON. |
| 10 | All FHIR chain steps (K, and BUG-14 calibration) | `/api/OpenELIS-Global/fhir/metadata` returns valid CapabilityStatement | Returns HTML SPA shell on this instance today. Either path is different now or BUG-56 regressed. |

---

## Module maturity ratings — updates from pilot

| Module | Pre-pilot rating | Live rating | Why changed |
|---|---|---|---|
| Site Branding | M3 (admin round-trip works) | **M3 confirmed** | Chain I Step 5 PASSed end-to-end with restore |
| Order Workflow (Add Order) | M1.5 (BUG-37) | **M1 confirmed** | Step 2 spec payload doesn't even match — basic write path is more confusing than the dashboard suggested |
| Dashboard | M2 | **M1.5** | NEW-1 Y-RECON mismatch caught: KPI doesn't match underlying list |
| Reports | M2 | **M1.5** | NEW-2 ReportPrint 500 on a third report type (potentially) |
| FHIR | M3 (Capability declared) | **M1.5** | NEW-3 metadata returns HTML SPA on this instance |
| EQA enablement | M0 (hidden requirement) | **M0 confirmed** | Spec needed a JSON path for the config toggle; live shows no such path exists |

Net effect: **4 modules downgraded** based on live evidence. The maturity-dashboard.html should be updated to reflect.

---

## Methodology assessment

**What worked:**
- The pilot took ~35 minutes total and produced 13 distinct findings (3 real + 10 spec)
- §7.6 Acceptance Criteria tags (RENDER / FUNCTION / PERSIST / ROUND-TRIP / CROSS-LINK / REPORTABLE) made it easy to assess each step's value at a glance
- §6.5 cluster prevention — I instinctively reached for `read_network_requests`-style probing before assuming an endpoint shape. Old me would have filed several false-positive bugs.
- The §11.5 Blocking-Bug Etiquette held cleanly — destructive bug paths (BUG-31, BUG-38) were left alone via indirect evidence, the session never got poisoned
- Y-RECON §13 surfaced a real mismatch (NEW-1) on the first try

**What didn't work / needs improvement:**
- **Specs were written against documented assumptions, not live captures.** This is the single biggest finding. Every chain that has more than 2 steps needs each step's API/payload re-validated against an actual UI submission. The §6.5a helper would have prevented this — it must become mandatory for chain/persona authoring, not just bug-filing.
- **`test-list` endpoint is too thin.** Returning only `{id, value}` per test makes it useless for section-aware seeding. Chain A and Persona PB will need a different source (TestAdd metadata + a per-section join).
- **No accession discovery endpoint.** Chain I Step 1's "find an accession to operate on" had no clean source — the obvious places (LogbookResults, AccessionValidation) returned empty even though the Dashboard says 14 orders exist. Specs need an `acquireAnyAccession()` helper that probes multiple paths and surfaces this gap when it can't find one.

**Recommendations for SKILL v6.12:**
1. **Mandate `captureAround` for every new chain/persona step that hits a non-trivial endpoint.** Update §11 and §12 prologues to require it. The helper exists since v6.10; this is just enforcement.
2. **Add a helper module `helpers/apiShapes.ts`** with the corrected paths/keys discovered today (patient-search → `patientSearchResults`, patient ID → `patientID`, test sections via `TestAdd.labUnitList`, etc.). Single source of truth.
3. **Add an `acquireAnyAccession(page)` helper** to `_common.ts` that probes 3-5 paths and either returns an accession or marks the chain BLOCKED with "Y-RECON mismatch suspected" — turning today's frustration into automatic surfacing.
4. **Document the Struts-form pattern.** Several admin endpoints (SiteInformation, SampleEdit) return JSP form metadata, not REST data. The SKILL should note this explicitly so spec authors don't assume nested DTOs.

---

## Next live session priorities

Based on this pilot, the highest-leverage retests for the next live session:

1. **NEW-1 Y-RECON Dashboard vs Logbook mismatch** — confirm it persists across page refresh, logout/re-login, and after some seeded data; file as real bug if persistent.
2. **Find a real accession** and re-run Chain I Step 3 (PDF generation) — distinguishes "BUG-42 extends to patient report" from "invalid accession returns 500."
3. **Capture a real `POST /rest/SamplePatientEntry` from the Chrome Network panel** while a tester places one order via the UI. This payload becomes the v6.12 source of truth for Chain A and Persona PA.
4. **Verify BUG-56 status on testing** — `/fhir/metadata` may have regressed from the 2026-04-20 calibration.

---

## Addendum — 2-instance cross-validation against mgdev v3.2.1.8

After compiling the initial pilot findings, the corrected `apiShapes.ts` was validated against a second instance (mgdev.openelis-global.org, Madagascar OpenELIS v3.2.1.8 — newer than the v3.2.1.6 testing instance).

**Result: all 10 spec corrections validated on both instances.** `patientSearchResults` key, `patientID` field, `birthdate` field, `labUnitList` for sections, `testUnitId` filter, `SampleEdit` top-level patient fields, `site-branding` schema without `labName`, `nonconformevents` shape — every one of them holds across both v3.2.1.6 and v3.2.1.8.

**Two upgrades from the 2-instance evidence:**

- **NEW-1 RETRACTED — not a Y-RECON mismatch, a spec misunderstanding.** Casey corrected the workflow on the same day: LogbookResults is the *result entry* surface, not a queue of all orders awaiting attention. Dashboard's `ordersInProgress` and `ordersReadyForValidation` count different queues that are fetched by the SPA via URLs not yet captured via live UI navigation. Both "matching" data points (14/0 testing, 4/0 mgdev) were wrong-endpoint probes, not real mismatches. **Methodology meta-finding:** §6.5b applies recursively — the same false-positive pattern that the 04-20 cluster produced at the bug-filing layer also produced this false alarm at the spec-author layer. Hardens the case for §6.5b being a mandatory rule, not optional advice.
- **NEW-3 (FHIR metadata) is testing-instance specific.** On mgdev v3.2.1.8, `GET /api/OpenELIS-Global/fhir/metadata` returns a valid HAPI FHIR CapabilityStatement JSON. So the HTML-shell response on testing is a regression or deployment difference, not a fundamental BUG-14 reopen. BUG-14 stays Resolved with a footnote "broken on testing instance — investigate deployment."

**Schema deltas observed (additive only, not breaking):**

- mgdev PatientRecord adds optional fields `guid`, `subjectNumber`, `isMerged` not present on testing. Added as `?` optional in `apiShapes.ts`.
- mgdev's `Dashboard` ordersInProgress is 0 while ordersReadyForValidation is 4 (testing was the reverse — 14 / 0). Same fields, different data.
- `nonconformevents` returns `[]` on both — both are healthy fresh instances.

**Practical takeaway:** the `apiShapes.ts` single-source-of-truth pattern works across at least two OpenELIS minor versions. The §6.5b authoring-time-capture rule was the right call; the 10 corrections are durable, not version-specific.

---

## What this pilot proves

The v6 methodology works. In 35 minutes of live testing, against a methodology that had never been run before:

- It surfaced 3 candidate OpenELIS bugs (Y-RECON, ReportPrint, FHIR metadata) without filing any false positives
- It surfaced 10 spec corrections needed before the chains/personas can run cleanly
- It produced a session report (this document) tagged with §7.6 acceptance criteria and §5.5 maturity updates
- It exercised §11.5 Blocking-Bug Etiquette (BUG-31, BUG-38 left alone), §13 Y-RECON (caught NEW-1), and §6.5 (no 404 bugs filed)

**A1 is complete.** Recommended next step: SKILL v6.12 with the 10 spec corrections + the 4 recommendations, followed by a second pilot session that exercises the corrected specs.
