# Vector & Environmental catalog suite (Chains M & N)

New for v3.2.1.10. Codifies the Vector surveillance and Environmental sampling
domains — the headline feature of the indonesiadev run that previously had **zero**
catalog coverage (see run report `qa-report-indonesiadev-vector-env-20260615.md`
§§2–10 and the §17 coverage-gap list).

Run: `npx playwright test --project=chain-m` and `--project=chain-n`.

## Maturity of these specs — DEEP ROUND-TRIP (v6.15)
Rewritten 2026-06-18 from render-only placeholders to **deep round-trip
workflows with a landing check at every handoff**. The real API endpoints were
captured live on indonesiadev v3.2.1.10 (in-page fetch interceptor + direct
probes; see `vector-env-api-captures.md`). Each mutating action now reads the
worklist / order back and asserts the change **landed** — the "linked actions"
the catalog was missing.

Captured endpoints now driven by the suite (constants in `_common.ts`):

| Const | Endpoint | Role |
|---|---|---|
| `VE_CREATE` | `POST /rest/SamplePatientEntry` | order create (shared clinical/vector/env) |
| `VE_VECTOR_WORKLIST` | `GET /rest/vector/identification/worklist` | vector read-back surface (lot rows) |
| `VE_VECTOR_IDENTIFY` | `POST /rest/vector/identification/specimens/{sampleId}/identify` | species ID save |
| `VE_VECTOR_DECON` | `POST /rest/vector/deconvolution/initiate` | pool Split |
| `VE_VECTOR_DICT_LIFECYCLE` | `GET /rest/vector/dictionary/lifecycle-stages` | OGC-1049 unfiltered list (n=5) |
| `VE_ENV_*` | sampling-sites / collection-methods / weather / containers / sample-types / compliance | env order-entry lists |

**Resilience contract:** the suite is registered to run against any instance.
When the Vector/Env domain is absent (older build → 404) or no actionable data
exists, the affected step records `GAP` and continues — it never fabricates a
pass. The mutating legs (identify / decon / env create) discover a real target,
attempt the action, and verify the landing; if the request **body shape** is
rejected (4xx) they record `GAP` with the confirmed endpoint (so a follow-up can
pin the exact payload) rather than failing the whole chain. The full request
bodies were partly masked by the capture tool's output filter — pinning them is
the one remaining follow-up.

## Chain M — Vector Surveillance (`chain-m-vector-surveillance.spec.ts`)
| Step | What it checks | Acceptance | Landing check |
|---|---|---|---|
| 1 | Vector worklist read-back **contract** (real fields: `sampleId`, `vectorPoolId`, `lotExternalId`, `identifiedSpecimens`, `deconvolutionStatus`, …) | ROUND-TRIP | asserts row shape; GAP if domain absent/empty |
| 2 | Species **identify** increments `identifiedSpecimens` for the lot | CROSS-LINK | re-reads worklist, asserts count rose |
| 3 | Pool **deconvolution** advances `deconvolutionStatus` `PENDING → DECON_IN_PROGRESS` | CROSS-LINK | re-reads worklist, asserts status changed |
| 4 | Lifecycle dictionary populated (n=5) + **OGC-1049** filter watch | FUNCTION | `?sampleTypeId=N` empty → known bug |
| 5 | Pathogen results route through the shared Results screen (two-stage) | CROSS-LINK | LogbookResults reachable |

## Chain N — Environmental Sampling (`chain-n-environmental-sampling.spec.ts`)
| Step | What it checks | Acceptance | Landing check |
|---|---|---|---|
| 1 | Order-entry dictionaries populate (sampling-sites, collection-methods, weather, containers, sample-types) | FUNCTION | ≥4 lists non-empty; GAP if domain absent |
| 2 | Applicable compliance standards populate | FUNCTION | non-empty list |
| 3 | Per-sample manifest building blocks (sample-types + containers) populate | FUNCTION | both non-empty |
| 4 | Env order **create → read-back** + **OGC-1048** date watch | ROUND-TRIP | reads order back via `SampleEdit`, asserts samples landed + date persisted |
| 5 | Environmental results use the shared Results screen | CROSS-LINK | LogbookResults reachable |

## Known-bug links
- **OGC-1048** — collection-date default not persisted (vector + env order entry).
- **OGC-1049** — dictionary filtered by `?sampleTypeId=N` returns empty for all ids.
- **OGC-1053** — SPA deep-link/basename limitation: some routes 404 on direct URL (works via sidebar). The deep rewrite avoids deep-links by driving REST endpoints from the app base.

## Remaining follow-up (to flip the last GAPs green)
1. Pin the exact **request bodies** for `VE_VECTOR_IDENTIFY`, `VE_VECTOR_DECON`, and the env `VE_CREATE` envelope (capture the JSON from the UI save actions — the endpoints + URLs are already confirmed).
2. Pin the **species / trap** vector dictionary slugs (lifecycle-stages confirmed; species/trap names differ from the probed guesses).
