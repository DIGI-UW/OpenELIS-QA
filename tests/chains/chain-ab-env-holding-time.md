# Chain AB — Environmental Holding-Time + Sertifikat Hasil Uji

**Status:** authored from a live UI verification pass on `34.212.225.107` (v3.2.1.10), 2026-06-24.
**Run:** `npx playwright test --project=chain-ab`
**Parameters (env vars):**
- `HT_ACCESSION` — a back-dated (expired) environmental order, still at Results Entry, whose test has an SOP max holding time (e.g. pH(Groundwater)=1440 min). Used by Steps 2–3.
- `CERT_ACCESSION` — a validated + compliance-standard-linked environmental order that *should* appear in Laporan Hasil. Optional; used by Step 4 to flip the OGC-1064 catch to PASS when fixed.

When the env vars are unset the data-dependent steps record **GAP** and continue (SKILL §11.5) — they never fail the chain or fabricate a pass.

## What it covers (gaps in Chains M/N/Y/Z)
| Step | Tier | Behaviour |
|---|---|---|
| 1 | FUNCTION | An active compliance standard exists (PP 22/2021) — precondition for holding-time + cert. |
| 2 | CROSS-LINK | An expired sample shows the **"Holding Time Exceeded"** notification + red-boxed result field at Results Entry. |
| 3 | PERSIST | On save, an **Internal** note is written: *"Result entered after SOP max holding time was exceeded."* |
| 4 | KNOWN BUG | **OGC-1064** — Laporan Hasil lists no validated+standard-linked order, so no Sertifikat Hasil Uji can be generated (catch, à la Chain A/BUG-37). |

## Verified click-path (for hardening the UI steps)
**Holding-time config** — Admin → Test Management → Modify tests (`/MasterListsPage/TestModifyEntry`): pick Sample Type (type-ahead, e.g. "Drinking Water") → click the test (e.g. **pH**) → Configuration tab → **Next** to the **"QC Acceptance Thresholds"** section → field **"SOP Max Holding Time (minutes)"** (pH(Groundwater) ships at **1440**). Alongside: Blank Threshold, RPD Threshold %, Recovery Window %.

**Trigger** — create an env order (site MULAGO `WS-001`, test pH) with the per-sample **Collected** datetime ≥ holding-time older than now (e.g. 2 days ago) → Label & Store (Skip storage) → QA Review (4 checks) → **Submit**. Open **Results › By Order**, enter the accession → the **"Holding Time Exceeded — The SOP max holding time has been exceeded for: pH(Groundwater)"** toast fires and the pH result field is drawn with a **red box**. Enter a value, tick Accept, **Save** → expand the row → Notes column shows the Internal note. (Result Save / Validation prompt a 21 CFR Part 11 e-signature unless disabled in **Admin → General Configuration → Site Configuration**.)

## To harden before merge (repo §6.5b)
- Pin the result-entry + holding-time endpoints with `captureAround` and assert on the API note rather than `LogbookResults` text scan (Step 3).
- Optionally self-seed `HT_ACCESSION` via a UI order-entry helper so the chain is hermetic.
