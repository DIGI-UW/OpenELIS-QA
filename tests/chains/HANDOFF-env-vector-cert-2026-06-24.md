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

---

# UPDATE — same-day live verification (later on 2026-06-24)

Several flows that were "documented, pin later" above are now **verified end-to-end via the UI**. Use these to harden Chains M/N and to add a compliance-eval assertion.

## Vector E2E — VERIFIED (Chain M can graduate from GAP)
Order **DEV…021** driven all the way through:
- **Create**: Add Vector Order → Generate Lab Number → Site MULAGO → Animal/Organism 1: Sample Type *Adult Mosquito*, **Quantity in Pool = 25**, test *Wolbachia sp.-Sekuensing* → Save & Next. **Saves fine** (OGC-1060 was operator error — a TEST must be selected; same as Env). Label & Store: a pool of 25 becomes **per-specimen barcodes LABNO.2 – LABNO.26**; "Skip storage" → Save & Next. QA Review: tick 4 checks → Save & Next → **Complete** ("Order Complete — Processing", 25 organisms).
- **Worklist** `/vector/identification`: lot **DEV…021-P01**, Group *Nyamuk dewasa*, 0/25, Not Started.
- **Identify** (`VE_VECTOR_IDENTIFY(sampleId)`): inline form fields = **Species** (type-ahead from configured species list, e.g. *Aedes aegypti*), **Method** select `method-NN` (Morphological | Molecular | Morphological + Molecular), **Confidence** select `confidence-NN` (Confirmed | Presumptive), **Lifecycle Stage** select `lifecycleStage-NN` (Adult/Larva/Pupa/Egg), Notes → **Save Identification** → toast "Identification saved", progress 1/25, lot → In Progress. (Method/Confidence are native `<select>` — set via the native-setter pattern §6.1, ids `method-<row>` / `confidence-<row>`.)
- **Deconvolution / Split** (`VE_VECTOR_DECON`): pool-row "↗ Split" → modal "Split into Sub-pools": pool count (default ~5, or "Split to individuals"); assignment = Assign randomly / Auto sub-pool by species / Assign manually; per-test checkboxes; "Preview Grouping →" shows proposed sub-pools; **Save Pools** → creates **DEV…021-P01-S1 … -S5** (each independently Split-able), Decon column → "Decon in progress".
- ⚠ **New minor bug** to file/watch: the Split success toast reads **"25 sub-pools created (null–null)"** — it actually created 5 sub-pools and the ID range shows `null–null`. Labelling only (sub-pools are correct). Add an assertion that the toast count == requested pool count and the ID range is non-null.

## Compliance evaluation — VERIFIED both ways (add to Chain N / a results spec)
At Results › By Order, after **save + server-eval** (NOT live-on-type), the **"Status — Per Regulation"** column shows:
- pH **7** on a PP 22/2021-linked order (DEV…012) → green **"PASS — PP 22/2021"**.
- pH **99** (DEV…024) → red **"FAIL — PP 22/2021"** + row flagged nonconforming (⚑).
- Alphanumeric/qualitative results are **not** flagged (numeric-only — by design).
The column only renders after the result is saved and re-loaded. A standard created via Compliance Standards Admin (e.g. "UAT-001 — UAT Test Standard") appears in the order-entry "Applicable Compliance Standards" multiselect (round-trip confirmed).

## Add Species / Add Sample Type — VERIFIED (two different admin areas)
- **Species**: `/MasterListsPage/vectorSurveillanceSetup/species` → "+ Add species" → Genus*, Species*, Subspecies, Sample type*, Pathogen category, Lifecycle category → Save species.
- **Sample Type**: `/MasterListsPage/SampleTypeManagement` → "Create New Sample Type" → English* + French* → Next; new type is **Inactive until tests are assigned** (Test Assignment). Generic registry shared with clinical (vector organism types live here too).
