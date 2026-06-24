# Handoff — Env/Vector live UI verification (34.212.225.107, v3.2.1.10, 2026-06-24)

Source: an interactive UAT pass on the SILNAS release server. This file captures the
verified click-paths so the **create-payload GAPs in Chains M/N** and the admin flows in
**Chain Z** can be pinned (per §6.5b "capture before commit"), and documents the new
**Chain AB** (holding-time + OGC-1064).

Login: `admin` / `adminADMIN!`. Sampling site seeded: **MULAGO (`WS-001`)** — the order-entry
site picker matches a **name/code prefix** ("MUL" or "WS"), NOT arbitrary substrings ("a"
returns nothing → looks empty but isn't).

## 1. Environmental order entry — the OGC-1060 "fix"
Chains N GAPs on create because the payload wasn't pinned. The UI flow that succeeds:
1. Order › Add Order › Add Environmental Order › Enter Order (`/order/environmental/enter`).
2. **Generate Lab Number**. Collection Date defaults today (back-date here for holding-time tests).
3. Sampling Site → type `MUL` → **Select** `WS-001 — MULAGO`.
4. Default Collection Conditions → **Collection Method** = Grab Sample (required).
5. (For a certificate) Applicable Compliance Standards → tick **PP 22/2021 — Water Quality**.
6. Per-Sample Manifest row: **Sample Type** = Groundwater → the **"Tests & Panels — required"**
   link turns red; open it and tick a test (**pH**). **This test selection is what clears the
   misleading "add a patient or sampling site" error (OGC-1060, now Low).** Optionally set the
   per-sample **Collected** datetime (back-date for holding-time).
7. **Save & Next** → Label & Store (tick **Skip storage for unassigned samples** → Save) →
   QA Review (tick all 4 checklist items) → **Submit**.

Endpoint to pin: `POST /rest/SamplePatientEntry` (shared) — expand `VE_CREATE` payload with
Sampling Site, Collection Method, manifest rows (sampleType + container + collected), Tests.

## 2. Vector order entry + species ID + deconvolution (Chain M)
- Order › Add Order › Add Vector Order › Enter Order — organism-based (no compliance block /
  GPS manifest). Generate Lab Number → site (MULAGO) → optional **Collection Context** bionomics
  (Time of Day / Resting Context / Human-Biting Catch / Notes) → Sample/Animal/Organism: Sample
  Type (e.g. Adult Mosquito), Lifecycle Stage, Trap Type, **Quantity in Pool**, test/panel →
  Save & Next → Label & Store → QA Review → Submit.
- Pools then land in **Results › Vector Identification** (`/vector/identification`) — VERIFIED
  shell: status chips Pending/Not Started/Partial ID/Deconvolution/Complete; columns Lot ID,
  Sampling Site, Collection Date, Group, Progress, ID Status, Decon; empty-state "No lots in this
  queue." Expand a lot → Species Distribution + per-specimen table → **Identify** (species +
  Confirmed/Presumptive).
- **Deconvolution**: a pool with a returned positive result shows **Split** → sub-pools get
  `LABNO.X-Y` child accessions; the "Decon" column advances PENDING→DECON_IN_PROGRESS.
- Endpoints (already in `_common.ts`): `VE_VECTOR_WORKLIST`, `VE_VECTOR_IDENTIFY(sampleId)`,
  `VE_VECTOR_DECON`. Pin the identify/decon POST bodies from these UI saves (Chain M GAPs on them).
  Note: pools may also arrive as lab-to-lab **FHIR referrals** (Order › Incoming Orders) carrying a
  pre-assigned species ID (morph-ID skipped).

## 3. Define a new Compliance Standard (Chain Z)
Admin → Test Management → **Compliance Standards Administration** (`/MasterListsPage/ComplianceStandardsAdmin`):
- **Add Standard** → header (Standard Name, Issuing Body, Regulation Number, Version, Status
  Draft/Active/Superseded/Archived, Effective Date, Expiry Date, Country/Region, Description).
- **GOTCHA:** Save stays disabled until (a) the **Effective Date is picked via the calendar**
  (a typed/scripted value alone does NOT enable Save) AND (b) ≥1 **Applicable Sample Type** is
  added (Select sample type → Add → chip).
- Save → "Compliance standard saved." → Edit panel → **Parameter Groups & Linked Tests** →
  Add Parameter Group (name + description) → link tests with limit types (High ≤, Low ≥, Normal
  Range, Borderline ⚑, Qualitative) → Save Standard.
- Created live: "UAT Test Standard - Drinking Water" (Active). Endpoints: `COMPLIANCE_STANDARDS`
  (POST), `COMPLIANCE_STANDARD_PARAM_GROUPS(id)`, `COMPLIANCE_STANDARD_LINKED_TESTS(id)`.

## 4. Validation + e-signature
- Validation › Routine → Select Test Unit (e.g. Water Quality) → grid: Result chip (green=within
  holding time, **orange=exceeded**), U(k=2), Save (=accept), Retest, Notes, **Past Notes**
  (the holding-time Internal note carries here). Tick Save → Save.
- **21 CFR Part 11 e-signature** prompts on result Save ("Authored") and Validation
  ("Validated and Released"). Toggle: **Admin → General Configuration → Site Configuration**
  (turned OFF during this pass to run unattended).

## 5. Holding-time + OGC-1064 → Chain AB (this PR)
See `chain-ab-env-holding-time.md`. Holding-time config = "SOP Max Holding Time (minutes)" under
Modify tests → Configuration → QC Acceptance Thresholds (pH=1440). Expired sample → Results Entry
"Holding Time Exceeded" + red box → on save, Internal note "Result entered after SOP max holding
time was exceeded." **OGC-1064**: Laporan Hasil (`/LaporanHasil`) lists no validated+standard-linked
order (DEV…012, PASS) → no Sertifikat Hasil Uji can be generated; contradicts OGC-552 AC.
