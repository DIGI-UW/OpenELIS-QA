# OpenELIS QA Skill — Sharpening Workplan

**Owner:** Casey
**Drafted:** 2026-05-12
**Companion to:** `skill-critique-2026-05-12.md` (the problem analysis) and `SKILL-v6.md` (the v6 baseline with 10 additions already applied).

The v6 SKILL.md closes the most egregious gaps: it stops PASS from meaning "page renders," forbids 404 bugs without live capture, mandates round-trip writes, introduces a maturity rubric, and adds Chains + Personas + Dashboard Reconciliation as first-class suites. This workplan is what comes *after* v6: where to push the skill next, in what order, with measurable acceptance criteria for each step.

The plan is organized into four phases. Each phase is independently shippable; you don't have to do them in order if priorities shift, but the dependencies are noted.

---

## Phase A — Stabilize v6 (2 weeks, single sprint)

**Goal:** Make the v6 additions actually run on the next test session and produce different-shaped reports. Catch any rubric ambiguities before they ossify.

### A1. Pilot v6 against testing.openelis-global.org

- Run **one** complete v6 session: Step 0.5 Calibration + Step 0.6 Data Census + Chains A (Order Lifecycle) and B (Rejection Workflow) + Personas PA (Receptionist) and PD (Lab Manager) + Y-RECON Dashboard Reconciliation.
- **Acceptance:** Produce a session report that explicitly tags every TC with one of the six Acceptance Criteria forms (RENDER/FUNCTION/PERSIST/ROUND-TRIP/CROSS-LINK/REPORTABLE) and one of M0–M5 per module.
- **Risk:** Some TCs will be ambiguous — write down the call you made and feed it back into v7 as worked examples.

### A2. Build a maturity dashboard

- One HTML page (`maturity-dashboard.html` in the repo) that reads the latest session report and shows a colored grid: module × maturity. Green M3+, yellow M2, orange M1, red M0.
- **Acceptance:** A reviewer looking at the grid for 10 seconds can pick out the modules a lab actually needs to be cautious about.
- Reuse the existing `qa-dashboard.html` styling.

### A3. Bug-list calibration sweep

- For each open Jira ticket referenced in SKILL Section 8, run the calibration step (Step 0.5).
- **Outcome:** A delta document listing tickets to close (resolved), tickets to keep open (still present), and tickets to amend (changed evidence).
- This is a one-time backlog cleanup; subsequent sessions only need to calibrate the top 5–10 critical.

### A4. Drop the Step 0.5/0.6 workflow into the openelis-bug-revalidation companion skill

- The `openelis-bug-revalidation` skill already has its own multi-method protocol. Reference Step 0.5 in its preamble so the two skills don't drift.
- **Acceptance:** A single "calibration mental model" referenced from both skills.

---

## Phase B — Automate the chains in Playwright (3–4 weeks)

**Goal:** Turn each Chain in SKILL Section 11 into a Playwright spec under `tests/chains/`. The Playwright runner becomes the source of truth for chain pass/fail; the SKILL describes the *intent* and the Playwright spec describes the *implementation*.

### B1. Chain A: Order Lifecycle spec

- `tests/chains/chain-a-order-lifecycle.spec.ts`
- Steps: Add Order via wizard with existing patient → assert `sample_human` row written (via direct API or DB peek) → enter result → validate → fetch Patient Status Report PDF → assert lab number on PDF → fetch FHIR Observation → assert value matches.
- **Reuses:** existing `pages/OrderEntryPage.ts` POM. Add a new `pages/PatientReportPdfPage.ts`.
- **Acceptance:** FAILs cleanly on a v3.2.1.5 instance (because BUG-37 is present) and PASSes on v3.2.1.6 (if BUG-37 is fixed).

### B2. Chain B: Rejection → NCE → Report spec

- `tests/chains/chain-b-rejection.spec.ts`
- Steps: Reject sample at Order Entry → fetch NCE list, assert NCE created → fetch Rejection Report PDF for today, assert sample appears → fetch Dashboard metrics, assert `ordersRejectedToday` incremented.
- **Acceptance:** Currently FAILs at every join point. Each leg gets a separate `expect()` so the report shows which join is broken.

### B3. Chain C+D: Reflex and Calculated Values

- Blocked by BUG-31 (Accept checkbox hang) for the result-entry step. Two options:
  - (a) Drive the result write via API (bypasses the broken checkbox UI) — pragmatic, leaves UI gap unverified.
  - (b) Wait for BUG-31 fix and run via UI.
- **Acceptance:** API-driven version of both chains lands in Phase B and confirms whether the reflex/calc engines actually trigger. UI version is a Phase C follow-on.

### B4. Chain I: Site Branding → Report

- One of the easier chains. PUT `/rest/site-branding` then generate Patient Status Report PDF, parse PDF text with `pdf-parse`, assert lab name and color appear.
- **Acceptance:** Catches NOTE-29 (header "null" when site name not configured) automatically.

### B5. Chain coverage report

- `tests/chains/coverage.md`: which chains are spec'd, which are blocked, what data is required for each.
- **Acceptance:** Single page that tells you what's run and what's not.

---

## Phase C — Persona walk-throughs as Playwright specs (2–3 weeks)

**Goal:** Each persona becomes a single spec that exercises every screen the persona touches in their day, with assertions tied to "could the persona finish the day?"

### C1. PB (Bench Tech, Hematology)

- Most important persona because BUG-31 (Accept checkbox) directly blocks them.
- Spec walks: open Workplan filtered Hematology → click first sample → enter result → save → repeat 3× → bulk-save normals on remaining 7.
- **Acceptance:** Currently FAILs at the Accept checkbox step. Failure message: "Bench tech cannot complete a routine result entry day."

### C2. PA (Receptionist)

- Spec: National-ID search → if found, place order → if not, create patient + place order → print barcode → confirm order in Edit Order.
- **Reuses:** Chain A internals.

### C3. PC (Validating Biologist)

- Spec: Open Validation Routine Hematology → review row → add note → Save → confirm row leaves queue → Patient Results lookup → assert validated state.

### C4. PD (Lab Manager)

- Spec: Dashboard load → drill into Orders In Progress → cross-check against LogbookResults count → pull Rejection Report → pull Statistics Report.
- **Reuses:** Y-RECON reconciliation logic.

### C5. PE (QA Officer)

- Spec: NCE Dashboard → corrective action on open NCE → Non-Conformity Report → Cold-Chain compliance footer.

### C6. PF (Lab Administrator)

- Spec: First-time setup walk. Site Branding update → barcode config → TestAdd → analyzer mapping → enable EQA → create new user → check User Manual link.
- **Most likely persona to surface hidden requirements** (the EQA toggle being the canonical example).

### C7. Persona pass-rate as a top-line metric

- The session report's executive summary leads with persona pass rate, not TC pass rate. "5/6 personas can complete their day." This is the metric a lab manager would actually care about.

---

## Phase D — Spec-walks and FRS cross-reference (4 weeks, ongoing)

**Goal:** For each major module, locate the FRS (or user manual) section and add one explicit TC per spec requirement. This is the methodology gap from the critique (Gap 10).

### D1. Identify spec sources

- The repo already has `madagascar-uat-test-suite.md` (Madagascar e-SIL UAT). Map each LO-xx/DU-xx requirement to a TC in the catalog. Some are covered; some aren't — produce the diff.
- For modules without a FRS, write a one-page mini-spec ("what a lab needs from this module") and use that as the baseline. The user does this kind of spec work routinely.

### D2. EQA spec-walk (already started in Phase 27)

- Phase 27 (EQA-DEEP) did this for EQA against FRS v1.0 + Addendum v3.0 and found 15 spec gaps + 3 divergences. That session is the prototype for what spec-walks look like.
- Re-run on v3.2.1.6 after Chain F is implemented; close out the 7 cancelled tickets (OGC-518–524) properly.

### D3. Inventory spec-walk

- Inventory is the seed case for this whole workplan. The FRS (if it exists) or a fresh mini-spec should cover: receive lot, track location, deactivate item, generate reports, lot-traceability, expiration tracking, low-stock alerts, audit.
- For each, an explicit TC. Currently BUG-40/41/45/47 (and the silent storage-location workaround) tell us most of these are M1.

### D4. Pathology / IHC / Cytology spec-walk

- Map the 10-stage Pathology workflow to actual histology lab workflow (College of American Pathologists publishes the spec). Each stage transition is a TC. Each role boundary (tech vs. pathologist) is a permission TC.
- Outcome: a Pathology Module Readiness Rubric — can a histology lab actually run cases on this?

### D5. FHIR spec-walk

- The FHIR R4 CapabilityStatement declares 5 resources. For each, write a round-trip TC (POST → GET → diff). Plus integration TCs: place an order, fetch as `ServiceRequest`; complete an order, fetch as `DiagnosticReport`.
- This is Chain K in Playwright form.

### D6. Per-module spec docs in `references/`

- The skill already has a `references/` directory. Add `references/specs/inventory.md`, `references/specs/eqa.md`, etc. Each is short — 1–2 pages — and is the source of truth for what the module *should* do. The skill is updated to read these before testing the module.

---

## Phase E — Tooling and infrastructure (parallel, ongoing)

These items run alongside the above phases.

### E1. Test data seeding script

- A Playwright/Node script that, given a fresh OpenELIS instance, seeds 50 patients, 100 orders across 5 lab sections, 20 in-progress, 10 ready-for-validation, 5 rejected. Uses `QA_AUTO_*` prefix.
- **Acceptance:** Step 0.6 Data Census can run the seed script when census finds zero data, instead of halting.
- This unblocks every E2E/persona suite from the "empty instance" failure mode.

### E2. Live network capture helper

- Section 6.5 mandates `read_network_requests` capture before filing a 404 bug. Build a helper that auto-captures the first 5 requests during a UI action and saves them next to the screenshot, so the evidence is automatic, not a manual step.
- **Acceptance:** Cuts false-positive bugs to zero on the next bug-filing pass.

### E3. PDF text extraction harness

- Several proposed chain assertions need to parse PDF content (Chain I site branding, Chain F EQA report, Patient Status report verification). Add `pdf-parse` or `pdf-lib` to the Playwright deps; build `helpers/pdfAssert.ts` with `assertPdfContains(buf, text)`.
- **Acceptance:** Chain I FAILs on NOTE-29 (header "null").

### E4. FHIR validator integration

- Use HAPI's validator JAR or `@types/fhir` + a JSON-schema validator. For each Chain K assertion, run the response through `validateR4()` and assert structural correctness, not just field presence.

### E5. Bug-table linter

- Detect drift in the SKILL bug table: bugs with no date, bugs marked Resolved that are referenced as still-blocking in later phases, bugs cited in Validation History but missing from the table.
- **Acceptance:** Run as part of pre-commit on `SKILL.md`.

### E6. Auto-screenshot diffs across versions

- For each major version bump, run a fixed list of pages and produce side-by-side screenshots vs. the prior version's saved baseline. Visual regressions surface independent of test logic.

### E7. Catalog the false-positive bug paths in a "do not retest" list

- The 2026-04-20 cluster (OGC-535, 562, 563, 565, 566, 568) plus BUG-23, BUG-57 retraction, BUG-60 retraction are all "ghost paths." Track them in `references/known-ghost-paths.md` so the skill explicitly skips them.

---

## Phase F — Communication and ecosystem (ongoing)

### F1. Quarterly Lab-Readiness Report

- Once per quarter, produce a 2–3 page report aimed at *integrators* (people considering deploying OpenELIS for a lab). Lists module-level maturity and the Lab Impact ranking for any M0–M2 modules.
- **Acceptance:** The report is something Casey could hand to a Ministry of Health stakeholder evaluating OpenELIS for their country.

### F2. Open-source the partial-feature audit pattern

- Section 8.5 of the SKILL is a methodology other open-source health-IT projects could use. After running the audit twice and refining it, blog post + Confluence page on DIGI-UW's space.

### F3. Skill version policy

- Tag versions clearly in the SKILL.md frontmatter and at the top H1. Bump to v7 when the next round of additions lands. Maintain a CHANGELOG in the repo root (`SKILL-CHANGELOG.md`).

### F4. Feed findings back to OpenELIS-Global upstream

- The Partial-Feature Audit will catch maintainer-fixable issues (i18n key leaks, typos, missing endpoints). Bundle them into focused upstream PRs against `I-TECH-UW/OpenELIS-Global` rather than only filing Jira tickets internally.

---

## Sequencing & dependencies

```
                    Phase A (Stabilize v6)
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
            Phase B     Phase C     Phase D
            (Chains)    (Personas)  (Spec-walks)
                │           │           │
                └───────────┼───────────┘
                            ▼
                    Phase E (Tooling, parallel)
                            │
                            ▼
                    Phase F (Reports + upstream)
```

- Phase A blocks everything; it's the validation that v6 actually works.
- Phases B, C, D can run in parallel once Phase A is done. Phase B Chain B (rejection) is the highest-impact single deliverable because it lights up a chain that *currently fails* and proves the methodology change matters.
- Phase E tooling can land any time; E1 (data seeding) unblocks E2E generally and should land early.
- Phase F is the externalization step — only meaningful after a few internal cycles have stabilized the new rubric.

---

## Acceptance for the workplan as a whole

The workplan is done when:

1. Every Chain in SKILL Section 11 has a Playwright spec under `tests/chains/`.
2. Every Persona in SKILL Section 12 has a Playwright spec under `tests/personas/`.
3. Every M0–M2 module in the seed list (SKILL Section 8.5) has either: a fix, an upstream PR open, or an explicit "won't fix — documented limitation" note in `references/specs/`.
4. A test session produces a maturity dashboard, persona pass rate, chain pass rate, and Y-RECON reconciliation report — not just a list of TCs.
5. The next quarter's Lab-Readiness Report (Phase F1) can be generated from the test artifacts in <1 day.

---

## Out of scope for this workplan

These remain on the wishlist but aren't covered here:

- **Multi-user concurrency testing.** Bench tech A and B both validating the same accession. Needs a real second user session and a different infrastructure model.
- **Performance under realistic load.** The Phase 11 performance suite tests single-request latency. A real lab with 50 concurrent users is a different test discipline.
- **Mobile / tablet UI.** OpenELIS has a responsive UI; mobile-specific testing has never been done.
- **Browser matrix.** All testing is in Chrome. Firefox and Safari are unverified.
- **Disaster recovery / backup-restore.** Out of QA scope; ops concern.

If any of these become priorities, they'll need their own skill, not bolt-ons to this one.
