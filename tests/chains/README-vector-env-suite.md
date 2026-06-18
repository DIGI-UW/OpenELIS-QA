# Vector & Environmental catalog suite (Chains M & N)

New for v3.2.1.10. Codifies the Vector surveillance and Environmental sampling
domains — the headline feature of the indonesiadev run that previously had **zero**
catalog coverage (see run report `qa-report-indonesiadev-vector-env-20260615.md`
§§2–10 and the §17 coverage-gap list).

Run: `npx playwright test --project=chain-m` and `--project=chain-n`.

## Maturity of these specs
Route-render, dictionary, reachability, and known-bug **regression watches** are
real assertions. Steps that need the domain's **order-creation / Split POST
payloads** are marked `GAP` (not failures) until those endpoints are captured
via a §6.5a live-network capture — exactly how Chains C/D started before BUG-31
was disproven. Replace the `GAP` placeholders with real round-trip assertions
once the payloads are pinned.

## Chain M — Vector Surveillance (`chain-m-vector-surveillance.spec.ts`)
| Step | What it checks | Acceptance | Notes |
|---|---|---|---|
| 1 | `/order/vector/enter` renders the 4-step wizard (Enter → Label & Store → QA Review → Complete) + Bionomics context | RENDER | GAP if deep-link 404s (OGC-1053) — reach via sidebar |
| 2 | Generic Sample dead-branch guard | RENDER | GAP until Generic Sample removed; then assert ABSENCE |
| 3 | Vector dictionaries (species / trap=3 / lifecycle=5) populated | FUNCTION | GAP if endpoint unresolved — capture from `/vector/identification` |
| 4 | **OGC-1049** watch: `?sampleTypeId=N` dictionary filter returns empty | FUNCTION | Known bug; flips to PASS when fixed |
| 5 | `/vector/identification` renders species/method/confidence/lifecycle | RENDER | needs a seeded vector accession for full fields |
| 6 | Pathogen results route through the normal Results screen (two-stage) | CROSS-LINK | confirms no vector-specific pathogen-results page (by design) |
| 7 | Pool deconvolution / Split → sub-pools "Awaiting Review" | FUNCTION | GAP pending Split POST capture; pooling = N member items by `vectorPoolId` |

## Chain N — Environmental Sampling (`chain-n-environmental-sampling.spec.ts`)
| Step | What it checks | Acceptance | Notes |
|---|---|---|---|
| 1 | `/order/environmental/enter` renders Per-Sample Manifest + Compliance Standards + Collection Conditions | RENDER | GAP if deep-link 404s (OGC-1053) |
| 2 | Compliance-standards list populated (e.g., PP 22/2021) | FUNCTION | GAP if endpoint unresolved |
| 3 | **OGC-1048** watch: default collection date not persisted unless re-picked | PERSIST | Known bug; GAP until create POST captured |
| 4 | Per-sample manifest carries GPS + container per row | FUNCTION | GAP pending payload capture |
| 5 | Environmental results use the normal Results screen | CROSS-LINK | shared Results module, no env-specific results page |

## Known-bug links
- **OGC-1048** — collection-date default not persisted (vector + env order entry).
- **OGC-1049** — dictionary filtered by `?sampleTypeId=N` returns empty for all ids.
- **OGC-1053** — SPA deep-link/basename limitation: some routes 404 on direct URL (works via sidebar).

## Follow-ups to graduate GAP → real assertion
1. Capture the vector & environmental **order-creation POST** (Network tab on each wizard's final step).
2. Capture the **Vector Identification** species-ID save + **pool Split** POST.
3. Pin the **vector dictionary** and **compliance-standard** list endpoints.
