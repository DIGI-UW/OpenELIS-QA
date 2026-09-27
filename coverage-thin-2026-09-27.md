# Where Playwright coverage is thin (3.2.3.0 release walk-through, 2026-09-27)

Two inputs:
1. `workflow-coverage.json` (regenerated today with `refresh-freshness`, `classify-depth --write`, `workflow-coverage`). Tier = deepest spec the classifier finds for a workflow.
2. The 3.2.3.0 hand walk-through in Chrome (project doc `release-qa-3.2.3.md`). For each area it records what a person found that no spec caught.

The classifier's tier is an upper bound. "Deep" means at least one spec round-trips something in that workflow, not that the workflow's risky paths are covered. The third column is the honest one.

## 1. No coverage or smoke only (classifier)

| Workflow | Tier | What the walk-through found | Next spec |
|---|---|---|---|
| Programs & order questionnaires | none | OGC-781 in Acceptance: domain filter, inline editor, Visual/JSON builder, deactivate/reactivate, questionnaire round trip into an env order all work by hand; Code still shown; no builder context switch | Program CRUD + questionnaire answer round trip (seed program by REST, answer in Add Environmental Order, read back on reopen) |
| Study management | none | Order > Study opens the legacy JSP UI (raw key "sidenav.label.environmental.compliance" in its menu) | Render + one legacy study entry, or retire the menu |
| Alerts & notifications | none | R18 STAT notification garbles the lab number; R19 alerts dated 1970 | Notification text contains the searchable lab number; alert startTime renders in the current year |
| Accessibility (WCAG) | none | not walked | axe pass on the 10 busiest pages |
| Cytology | smoke | dashboard only; no case walked | Cytology order to case to report |
| Immunohistochemistry | smoke | Refer to IHC from a completed pathology case creates the IHC case (works); stage shows raw "IN_PROGRESS" | Pathology case to IHC referral to IHC case listed |
| Electronic lab notebook | smoke | Save silently does nothing when required MetaData fields are empty; experiment types empty on a stock install | Project create with seeded experiment type; Save with missing required fields must say so |
| Localization (i18n) | smoke | R32: many English strings in French, wrong translations | Key-coverage check on Add Clinical Order and Dashboard in fr |
| Provider & Organization admin | smoke | duplicate organization names accepted | Duplicate-name guard |

## 2. Classified deep, but the risky path was untested (found by hand)

| Workflow | Tier | Missed by the suite | Status after this branch |
|---|---|---|---|
| Custom data export | deep (new) | OGC-483 AC misses (duplicate names, no 20-limit, no rename); OGC-481 Review stuck on Queued; R38 orders without a collection date silently excluded | TC-DXS-01..06 added. R38 still needs a spec (seed an order with no collection date, finalize, export, expect it or a warning) |
| Reporting | deep | R43 activity reports 500 on patientless samples; R44 Routine CSV unit filter wrong; R45 Statistics Report has no year control and 500s (and may hang the server) | TC-RPTOUT-01..04 added (R44). R43 waits for a REST env-order seed. R45 deliberately NOT automated until it is safe to run |
| Order entry: Environmental / Vector | deep | OGC-1192: env and vector orders land on the Clinical dashboard; site lost on reload; lab number used on page load. `ogc1192-env-order-visibility.spec.ts` still encodes the 3.2.2.0 state and its create payload no longer matches (400), so the whole file is BLOCKED | Recapture the env payload, update OGC1192-1..9 to the 3.2.3.0 state, add vector routing case |
| Patient management | deep | R40 merge confirmation shows "No identifiers recorded" | TC-MP-07a/b added. (R41, order on a merged patient, is by design: TC-MP-06) |
| Dictionary & config admin | deep (new) | R35 sample type description dropped; R36 dictionary Add silent 400; R37 preset name lower-cased | TC-ASD-01..06 added |
| Results entry | deep | R42 status chips count the page, not the worklist | TC-RWC-01/02 added |
| Date pickers (cross-cutting) | not a workflow | R26 maxDate 9 January on full page load, clamps typed dates | TC-DP-01/02 added |
| Pathology | deep | completion + report + IHC referral works by hand; case can be Completed with no slides or report | Spec for the full case lifecycle to Completed with report stored |
| Storage & Inventory | deep | inventory lot receive with storage works; Low Stock tile unexplained | Lot receive + tiles |
| Referrals | deep | R23 referred tests enter local Validation instead of auto-validating on return (Casey's rule) | Tripwire: returned referral result lands validated, never in the local queue |
| Validation | deep | R4 "Entered by: Not recorded" while History names the user | Tripwire on enteredBy |

## 3. Coverage that looks present but is broken (harness drift)

These make the map look better than the suite is. Each needs fixing before its workflow's tier means anything.

- `admin-config.spec.ts` (16 fail locally): page titles renamed ("Label Presets", "Common Properties"); data from the old demo DB ("Mulago", "Anga", "CPHL").
- `order-creation-e2e.spec.ts` (13 fail): the Add Order page no longer starts with `#nationalId`; program count assumption (10+) wrong on a reset instance.
- `results-by-range.spec.ts`, `results-by-status.spec.ts` (TC-RBR-*): /RangeResults and /StatusResults now redirect to the unified /Results.
- Chain G: reports Cold Storage "not deployed"; /FreezerMonitoring is live.
- Chains B and E: legacy SampleEdit/LogbookResults bodies (400).
- `ogc1192-env-order-visibility.spec.ts`: see above.

## 4. How to keep this current

After adding specs: `node scripts/refresh-freshness.mjs && node scripts/classify-depth.mjs --write && node scripts/workflow-coverage.mjs`, then update section 2 by hand from the latest walk-through. The classifier cannot tell which paths matter; the walk-through can.

## 5. Update, later on 2026-09-27

- **New catalogue** `uncovered-workflows-catalogue.md` (56 cases, indexed) for every workflow rated none/smoke: timezone (new cross-cutting section), alerts, programs, study, cytology, IHC, notebook, org admin, e-signatures, i18n, accessibility. Grounded in a Chrome walk of each module.
- **Cytology is no longer smoke-only:** `tests/cytology-workflow.spec.ts` seeds an orderable Cytology test when missing, orders it through the Add Order wizard with the Cytology program, and checks case creation (TC-CYTW-01), questionnaire carry-over (TC-CYTW-07) and the R51 tripwire (TC-CYTW-06, empty case completed).
- **Timezone is the biggest blind spot.** CI runs in UTC; at UTC+10 the walk found R26 (picker maxDate 9 Jan), R48 (Order Programs date +1 day), R52 (Reception Time defaults to UTC) and UTC dates on IHC. The R26 specs are now pinned to Pacific/Port_Moresby. Recommend a second CI project with `timezoneId` set east of UTC.
- **Harness drift fixed:** merge-panel radios renamed in 3.2.3.0 (`#patientN-<id>`), row labels cover a photo avatar (label clicks opened an overlay), two results tables per page, saved-report list paging, report option lists loading after the pickers, dictionary Local Abbreviation required and unique. TC-DXS-05 now asserts a Download control (a negative check passed by race).
- **Still open:** ELN entry creation path not found from the dashboard; Study legacy pages; R43 activity-report tripwire; ogc1192 spec rewrite for 3.2.3.0 (payload works again with seeded ids: sample type QA_Surface Water, test QA_Water pH, site QA-VS-01).
