# Order Entry — Consolidated Fix Ticket (Lane-based redesign)

**Project:** OGC · **Type:** Epic / fix-list · **Priority:** High
**Env confirmed:** indonesiademo v3.2.1.10 (demo, not prod) · **Date:** 2026-07-22
**Spec of record:** Order Entry FRS v3 — Three Domain-Scoped Workflows (25 Jun 2026); Sample Collection Redesign epic (OGC-537) sub-tasks NAV/ORD/COL/LBL; Referral addendum v2.1.
**Backing analysis:** `Order-Entry-Legacy-vs-3Lane-Crosswalk.xlsx` (legacy→new crosswalk, delivered-vs-spec, gap summary).
**Supersedes:** the earlier `order-entry-qa-ticket-DRAFT.md` (items OGC-A…H are absorbed below).

## Context

Order entry was decoupled into three domain-scoped workflows on a shared wizard:
- **Clinical** — 4 steps: Enter Order → Collect → Label & Store → QA Review.
- **Environmental / Vector** — 3 steps (no Collect): Enter Order → Label & Store → QA Review. Env uses an inline per-sample manifest; Vector adds Lifecycle Stage / Trap Type / Quantity in Pool / Traps·Nights.
- Two legacy paradigms still coexist: `/SamplePatientEntry` (Add Order) and `/SampleBatchEntrySetup` (Batch Order Entry).

This ticket consolidates every confirmed finding — delivered-vs-spec misses, legacy→new regressions, and UX friction — into one fix list. Confirmation basis is marked per item: **[live]** verified on the demo this pass, **[code]** verified in `develop` source, **[owner]** confirmed by product owner (QA handoff), **[known]** documented known defect.

## Severity summary

| ID | Finding | Sev | Confirm |
|----|---------|-----|---------|
| OGC-A | Collect step can't add/select tests — dead-ends | P1 | owner |
| OGC-I | No sample rejection / NCE at collection (COL-4 replacement never shipped) | P1 | code |
| OGC-J | Duplicate QA checklist (built-in + Sample Acceptance) on QA Review | P1 | code |
| OGC-B | Provider search creates duplicate providers ("+Add new" on the no-match path) | P1 | owner |
| OGC-C | Clinical Sample 1 non-removable, defaults to Serum | P1 | live |
| OGC-R | Silent empty-order: two-phase save drops sample when requester unbound | P1 | code/prior-live |
| OGC-P | sampleXML date-locale mismatch → 400 when day-of-month > 12 | P1 | known |
| OGC-AB | Reject-or-continue decision on a failed sample not wired | P1 | code/owner |
| OGC-K | Site/Provider required by spec but not enforced as a gate | High | live/code |
| OGC-M | Forced "Skip storage" click + label-print required to advance (G10 not fully fixed) | High | code |
| OGC-U | Refer-out workflow not delivered (only an Enter-step checkbox) | High | code |
| OGC-T | Legacy result-reporting (SMS/Email) & order attachments absent and not in spec | High | code |
| OGC-Q | Consent advisory-only and clinical-only (Env/Vector capture none) | Med | code |
| OGC-O | Collection date auto-fills to today, discards entry date (TAT risk) | Med | code |
| OGC-N | Label & Store storage UI lags the current standalone Sample Storage module | Med | code |
| OGC-L | Clinical Ward/Unit/Department field not rendered | Med | code |
| OGC-D | Vector shows clinical copy / step mismatch (no Collect step) | Med | owner |
| OGC-E | Provider search is manual-click; all other searches auto-fire at 2 chars | Med | live |
| OGC-F | Requester section labels differ across lanes | Med | owner |
| OGC-G | Disabled "Save & Next" gives no explanation (no tooltip/aria) | Med | live |
| OGC-S | Label printing via popup — silently eaten by popup blockers | Med | code |
| OGC-H | Paradigm fragmentation: 3 new lanes + 2 legacy routes coexist | Med | owner |
| OGC-V | Misc legacy field gaps (sample temp, specimen origin, next-visit, sampling-performed, remember-site) | Low | code |

---

## P1 — must fix

### OGC-A · Collect step cannot add or select tests — workflow dead-end
- **User impact:** If reception didn't pre-add tests at Enter Order, the phlebotomist opens Collect and sees "No tests ordered — go back to Step 1." Work bounces back to a different person at a different desk. Core purpose of the decoupling defeated.
- **Root cause / evidence [owner]:** `OrderCollect.jsx` renders `RequestedTestsSection` (assign existing tests to samples) but there is no Add-Sample test/panel selector; the only path to add tests is Step 1.
- **Fix (spec §4.1.1 / COL-1, story OGC-1069):** At Collect, render the standard OE Add-Sample UI per sample — Sample Type → optional Filter by Lab Unit → Order Panels (search+checklist) → Order Tests (search by name **or** code). Step-1 entries pre-fill as unlinked pre-population. Collector is the authority on what was drawn.
- **Files:** `order/steps/OrderCollect.jsx`, `order/steps/sections/RequestedTestsSection.jsx` (+ new Add-Sample section).

### OGC-I · No sample rejection / NCE at collection
- **User impact:** A tech who receives a hemolyzed/mislabeled specimen has nowhere to reject or flag it; they must leave the order flow entirely.
- **Root cause / evidence [code]:** Legacy rejection dropdown was intentionally replaced by per-sample NCE (epic COL-4), but the NCE control was never wired — only an inert `collect.sample.nce.link` stub exists. Net: neither reject nor NCE is available.
- **Fix:** Ship per-sample "Report NCE" at Collect (COL-4) wired to the NCE module, pre-filling sample context; a failed QA item can also pre-fill an NCE (FRS §5). Confirm whether a lightweight reject is still wanted alongside NCE.
- **Files:** `order/steps/sections/SampleCollectionCard.jsx`, NCE module hook.

### OGC-J · Duplicate QA checklist on QA Review
- **User impact:** QA officers see and must tick two overlapping checklists; submit is gated on the built-in one, which is plain checkboxes (no Pass/Fail/**N/A**), so an item can't be legitimately marked not-applicable.
- **Root cause / evidence [code]:** `OrderQA.jsx` renders its own checklist from `/rest/qa-checklist` (4 items seeded from `qa-checklist-items.csv`, category `QAChecklistItem`) **and** the Sample Acceptance Checklist (S-09/OGC-580) is the one FRS §5 designates for this page.
- **Fix:** Remove the built-in checklist from `OrderQA.jsx` — delete the `checklistItems`/`verifiedItems` state, the `/rest/qa-checklist/config` + `/by-lab-number` loads, `saveChecklist()`, and the "QA Checklist" `<Tile>`. Render only the Sample Acceptance Checklist. Move the submit gate (`canProceed={allItemsComplete}`) onto the Sample Acceptance Checklist's per-domain enforcement (Mandatory blocks; Optional/Off don't).
- **Seed-item disposition [owner decision]:** the 4 orphaned seed rows go into Samuel's path **if** the Sample Acceptance Checklist has a CSV/dictionary seed; otherwise **drop** them (delete `qa-checklist-items.csv`). Confirm whether S-09 reads the `QAChecklistItem` dictionary — if it does, they already live in Samuel's path (keep); if S-09 has its own store, drop the CSV.
- **Files:** `order/steps/OrderQA.jsx`; `volume/configuration/backend/dictionaries/qa-checklist-items.csv`.

### OGC-B · Provider search creates duplicate providers
- **User impact [owner]:** The "+ Add new provider" affordance on the no-match path lets reception create duplicates instead of finding the existing record; duplicate "Doctor" records already exist. Pollutes every downstream report.
- **Root cause:** Add-new is offered on the no-result state; combined with manual-search (OGC-E) users hit "no match → add new" before a real search resolves. (Backend `/rest/provider/search` returns 200 with correct substring/case-insensitive matches — this is a UX trap, not a data bug.)
- **Fix (FRS §5):** Gate add-new by the Order Entry configuration — when restricted, show it **disabled with an admin message**; when allowed, only after an explicit search returns no match. Same treatment for Requesting Organization / Requestor. Edit-lock found records until "Edit details".
- **Files:** `order/steps/sections/RequesterSection.jsx`.

### OGC-C · Clinical Sample 1 is non-removable and defaults to Serum
- **User impact [live]:** Confirmed — no "Remove Sample" control on Sample 1, and it defaults to Serum. You can't represent a true no-sample-yet order; a phantom Serum sample rides along and satisfies the advance gate.
- **Fix (FRS §5):** Sample type is optional pre-population; Sample 1 must be removable and must not default to a type. A new order should carry zero samples until one is added.
- **Files:** `order/steps/sections/SampleTestSection.jsx`, `order/OrderContext.jsx` (initial sample seeding).

### OGC-R · Silent empty-order on the two-phase save
- **User impact:** An order can report "saved" but come back with `order.samples: []` — techs find an empty, unresultable order. "I saved it and it's gone" is the most corrosive failure a LIMS can have.
- **Root cause / evidence [code + prior-live]:** Step 1 `saveOrderEntry` writes `sample_type_requests`; Steps 2–4 `saveOrder` write `sample_items`. If the requester (Site+Provider) never binds, `SamplePatientEntry` returns 200 while dropping the sample. The QA harness `assertSamplePersisted` guard exists specifically because this reproduced on live testing.
- **Fix:** Ensure a selected Site/Provider actually binds to the order (tie to OGC-K); surface server field errors instead of a generic "Save failed"; add a post-save assertion that persisted `order.samples` is non-empty and warn if not.
- **Files:** `order/OrderContext.jsx` (save pipeline), `order/api/sampleTypeRequestApi.js`, `order/steps/sections/RequesterSection.jsx`.

### OGC-P · sampleXML date-locale mismatch → 400 for day-of-month > 12
- **User impact [known]:** In DD/MM locales (Indonesia, Francophone), the sampleXML emits MM/DD/YYYY, so any order dated after the 12th of the month throws a server 400 surfaced as a generic "Save failed" — roughly half of every month fails intermittently with no clear cause.
- **Fix (FRS §6):** Serialize all sampleXML dates in the configured Site date locale (Admin → General Configuration → Site Information); surface the server's date-format error to the user.
- **Files:** sampleXML builder in `order/OrderContext.jsx` / save utils.

### OGC-AB · Reject-or-continue decision on a failed sample not wired
- **User impact:** When a sample is non-conforming or fails an acceptance/QA check, there is no wired path to either **reject the sample** (capture reason, stop testing, route to rejection/NCE) or **continue with testing anyway** (documented override recording who decided and why). The checklist is advisory checkboxes with no Fail branch and rejection/NCE is an inert stub, so the accept/reject decision has nowhere to go.
- **Root cause / evidence [code/owner]:** No Fail→outcome branch on the Sample Acceptance / QA checklist; rejection and NCE unwired (see OGC-I, OGC-J).
- **Fix:** On a failed acceptance item (or explicit reject action) present the choice — **Reject sample** (reason from REJECTION_REASONS and/or open a per-sample NCE, set rejected status, exclude from testing/worklist) or **Continue with testing** (record override reason + user + timestamp, proceed, leave an audit trail). Sample status and worklist must reflect the decision.
- **Depends on:** OGC-I (NCE wiring), OGC-J (checklist enforcement), S-09 Sample Acceptance Checklist Pass/Fail/N/A.

---

## High

### OGC-K · Site/Provider required by spec but not enforced
- **[live/code]** Only Lab Number gates Save & Next; Site/Provider are optional to advance, though FRS §5/§7 require them (config-driven, same API as legacy) and OpenELIS breaks downstream without them (see OGC-R).
- **Fix:** Honour the existing Order Entry / Patient Entry configuration for required fields; enforce Site + Provider for clinical; mark required fields visibly.

### OGC-M · Forced "Skip storage" click + label-print gating to advance
- **[code]** `OrderLabel.jsx` `canProceed = (printedLabels.has('order')||printedLabels.has('sample')) && (allSamplesHaveStorage || storageSkipped)`. Every order needs a printed label **and** either storage assigned or the "Skip storage" checkbox — two ceremonial clicks on every single order.
- **Fix (FRS §5 / G10):** Storage is optional to advance with **no** forced skip click (unassigned = processed immediately). Label printing is optional to advance.

### OGC-U · Refer-out workflow not delivered
- **[code]** Only an Enter-step "refer to reference lab" checkbox exists; the referral addendum v2.1 (sample-level refer-out at Label & Store, `REFERRED_OUT` status, dashboard filters, X-01 notification) is absent. Legacy had a full per-test referral form.
- **Fix:** Implement refer-out at Label & Store per addendum v2.1, reusing the existing Refer Out module.

### OGC-T · Legacy result-reporting & order attachments absent (and not in spec)
- **[code]** Legacy `OrderResultReporting` (per-test patient/provider SMS+Email matrix) and order attachments (drag-drop file upload) have no equivalent in the new flow **and** are not in FRS v3.
- **Action:** Product decision — declare intentionally out-of-scope, or add to the spec and build. Flagged so it's a conscious choice, not an accidental drop.

---

## Medium

### OGC-Q · Consent advisory-only and clinical-only
- **[code]** Consent lives on the Collect step (clinical). It's advisory (does not gate submit), and because Env/Vector have no Collect step, **they capture no consent at all**. Decide whether consent should gate for clinical, and whether Env/Vector need any consent/received-at-lab capture.

### OGC-O · Collection date auto-fills to today, discards entry date
- **[code]** `OrderCollect.jsx` intentionally drops the stored entry date and auto-fills collection date/time to today. For specimens drawn earlier/offsite the tech must remember to correct it — silent-wrong dates corrupt turnaround-time stats. **Fix:** don't overwrite a real collection date; make the auto-fill an explicit, editable suggestion.

### OGC-N · Storage UI lags the standalone module
- **[code]** Label & Store embeds `storage/LocationPicker/LocationPickerInline` — a shared but simpler entry point than the current standalone Sample Storage assign UI (`StorageLocationModal` / `SampleStorage/`). **Fix:** point Label & Store at the current shared assign-storage component and keep them in sync.

### OGC-L · Clinical Ward/Unit/Department field missing
- **[code]** FRS §4.1 requires a Ward/Unit/Department sub-unit of the ordering facility (disabled until a facility is chosen; maps to legacy `requesterDepartmentId`). Not rendered. **Fix:** add it to `RequesterSection` (clinical only).

### OGC-D · Vector shows clinical copy / step mismatch
- **[owner]** Vector shows helper text like "specify later during collection" though it has no Collect step. **Fix:** domain-correct helper text per lane.

### OGC-E · Provider search inconsistent (manual-click)
- **[live]** Provider search needs a Search-button click; site and all other searches auto-fire at 2 chars. **Fix:** make provider search auto-fire like the others (feeds OGC-B).

### OGC-F · Requester labels differ across lanes
- **[owner]** "Site/Provider Search" (clinical) vs "Requesting Organization/Requestor Search" (env/vector). **Fix:** harmonize via `common.*` i18n keys (ties to openelis-ui-vocabulary).

### OGC-G · Disabled "Save & Next" gives no reason
- **[live]** Confirmed the disabled button carries no tooltip/`aria-describedby`. **Fix:** add a tooltip/inline hint naming the missing required field(s).

### OGC-S · Label printing via popup, silently blocked
- **[code]** `window.open` for `/LabelMakerServlet`; popup blockers eat it (there is a toast, but users read it as "printing is broken"). **Fix:** confirm the popup path is reliable or move to an in-page/download print flow.

### OGC-H · Paradigm fragmentation
- **[owner]** Three new lanes + two live legacy routes (`/SamplePatientEntry`, `/SampleBatchEntrySetup`). **Fix:** choose the target paradigm; deprecate/restyle the legacy routes (NAV-7).

---

## Low

### OGC-V · Misc legacy field gaps (batch)
- **[code]** Present in legacy, absent in new: Sample Temperature and Specimen Origin (OGC-651), Next-visit date, Sampling-performed / test-location code + "If other", "Remember site & requester", explicit Request date, provider fax/email entry + validation, GPS capture on clinical/vector (new keeps only Env new-site manual lat/long). Address opportunistically or fold into the relevant step.

---

## Environmental & Vector — lane-specific pain (net-new)

Both lanes run 3 steps (Enter → Label & Store → QA Review) with **no Collect step** — so consent, received-at-lab, and reject/NCE (which live on the clinical Collect step) are absent here. Verified live on indonesiademo. (GPS/coordinate fields *are* present on both lanes — not a gap.)

- **OGC-AC · No received-at-lab timestamp on env/vector** [live] — Med→High. Received-at-lab is auto-captured only on clinical Collect; env/vector never record lab receipt. Needed for chain-of-custody / holding-time. Fix: capture received date/time on Enter or Label & Store for env/vector.
- **OGC-AD · No bulk / CSV intake for env & vector** [live] — High. Field visits yield many samples (box/plate/traps) hand-entered one-by-one. CSV import was specced (COL-6…10) but deferred (OGC-1075). Biggest env/vector time sink. Fix: deliver the deferred CSV bulk intake.
- **OGC-AE · Reject / NCE has no home on env/vector** [live] — High. I and AB were framed on clinical Collect, which env/vector lack; a contaminated water sample or damaged trap can't be flagged. Fix: place reject/NCE + decision on env/vector Enter or Label & Store; scope I/AB to all three lanes.
- **OGC-AF · Test-defined holding time not surfaced/enforced** [owner/live] — Med. Holding time is **defined by the test** (the test catalog specifies the max time its sample can be held) — not a value the user types. The flow should **derive and display** the holding-time limit from the ordered test(s) and, with received-at-lab (AC), drive a holding-time clock / over-hold flag. Today it isn't surfaced. Fix: read max holding time from the test catalog, show the deadline, flag breaches; do not add a manual field. (Depends on test-catalog holding-time attribute + AC.)
- **OGC-AG · Stepper/copy inconsistencies** [live] — Low/Med. Vector's stepper shows a "Complete" step env's doesn't; vector shows clinical copy "specify later during collection" (see D). Fix: normalize stepper across lanes; domain-correct helper copy.

Net: env/vector read as the clinical flow with patient bits hidden — inheriting clinical scaffolding/copy and losing Collect-step capabilities with no replacement home.

---

## Cross-cutting acceptance criteria (Definition of Done)

1. From a fresh clinical order, a collector can add a sample and select panels/tests **at Collect** (by name or code); no "go back to Step 1" dead-end (OGC-A).
2. A collector can report an NCE / flag a non-conforming sample from Collect (OGC-I).
3. QA Review shows exactly **one** checklist (Sample Acceptance Checklist); submit gating follows its per-domain Mandatory/Optional/Off setting; seed items disposition resolved (OGC-J).
4. Provider/site/requestor: add-new only after an explicit no-match search and only when config allows; found records edit-locked; no accidental duplicates (OGC-B, OGC-E).
5. A new order starts with zero samples; Sample 1 is removable and untyped (OGC-C).
6. Required fields honour Order Entry config; Site+Provider bind to the order and persist; a saved order never comes back with empty samples; server field errors surface (OGC-K, OGC-R).
7. Orders dated after the 12th save cleanly in DD/MM locales (OGC-P).
8. Storage and label printing are optional to advance with no forced skip click (OGC-M).
9. Collection date is not silently overwritten to today (OGC-O).
10. Env/Vector helper text matches their actual steps; requester labels harmonized (OGC-D, OGC-F).
11. Disabled Save & Next explains why (OGC-G).
12. A failed/non-conforming sample presents a Reject vs Continue-with-testing decision, each with a recorded reason and correct downstream sample status (OGC-AB).

## Notes & dependencies
- **S-09 / Sample Acceptance Checklist** (Samuel, OGC-580) is not in the `develop` snapshot inspected — OGC-J and the seed disposition depend on how S-09 stores its items.
- **Test Catalog lab-unit→domain assignment** and **OGC-391/392 RBAC** underpin per-domain visibility/scoping (FRS §2), not covered here.
- Confirmation legend: [live] verified on indonesiademo this pass · [code] verified in develop source · [owner] product-owner/QA handoff · [known] documented known defect. Items marked [code]-only for absence (OGC-T, OGC-U, parts of OGC-V) should get a final live check on the deployed build since it runs ahead of `develop`.
