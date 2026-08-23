# Vector / Environmental reference data — where it lives and why `testing` has none

Measured 2026-08-23 against both instances in the same session, admin session on each.

## The finding

Every vector and environmental vocabulary the domain order wizards read is **fully populated on
indonesiademo and completely empty on testing** — 17 of 17 categories, zero entries each.

| Category (exact `categoryName`) | indonesiademo | testing | Reached by |
|---|---|---|---|
| `Sampling Site Type` | 8 | 0 | `/rest/vector/dictionary/sampling-site-types` |
| `Environmental Zone` | 6 | 0 | `/rest/vector/dictionary/environmental-zones` |
| `Sample Container` | 7 | 0 | `/rest/vector/dictionary/sample-containers` |
| `Env Collection Method` | 7 | 0 | `/rest/vector/dictionary/env-collection-methods` |
| `Env Weather` | 9 | 0 | `/rest/vector/dictionary/env-weather` |
| `vecLifecycleStages` | 5 | 0 | `/rest/vector/dictionary/lifecycle-stages` |
| `vecPathogens` | 9 | 0 | `/rest/vector/dictionary/pathogens` |
| `vecTrapType` | 8 | 0 | generic categories endpoint only |
| `vecRestingContext` | 3 | 0 | generic |
| `vecCollectionTimeOfDay` | 5 | 0 | generic |
| `vecPathogenResult` | 4 | 0 | generic |
| `vecPlasmodiumSpecies` | 6 | 0 | generic |
| `vecPhysiologicalState` | 5 | 0 | generic |
| `vecBloodmealHostSpecies` | 8 | 0 | generic |
| `vecInsecticideResistanceGenotype` | 4 | 0 | generic |
| `vecWhoInsecticideSusceptibilityClass` | 3 | 0 | generic |
| `vecVirusIsolationResult` | 3 | 0 | generic |

Generic endpoint: `GET /rest/dictionary/categories/{categoryName}/entries` -> `[{code,label}]`
(`DictionaryRestController`, roles RESULTS/ADMIN/RECEPTION/VALIDATION/PATHOLOGIST/CYTOPATHOLOGIST).
It takes the category name verbatim, so it probes any category without needing a bespoke route.

Species-scoped category *lists* also exist and are suffix-filtered, not domain-filtered:
`/rest/vector/dictionary/pathogen-categories` (`categoryName` ends with `Pathogens`) and
`/rest/vector/dictionary/lifecycle-categories` (ends with `Cycle`/`Stages`/`FullCycle`/`NoCycle`).
On indonesiademo those return 9 and 6 entries. On testing, `lifecycle-categories` returns exactly
one row — **`AIDS Stages`** — because it ends with "Stages". A clinical category leaking into a
vector admin picker is a consequence of the suffix filter, worth knowing before reading that list
as vector configuration.

## Provenance — this data ships in the product

It is not demo-only hand entry. It is checked in:

* `src/main/resources/configuration/dictionaries/vector-dictionaries.csv` (and the mirror under
  `volume/configuration/backend/dictionaries/`) — columns
  `category,dictEntry,localAbbreviation,isActive,sortOrder,loincCode,localization:en|fr|es|id`.
* `src/main/resources/liquibase/3.4.x.x/023-vector-dictionary-entries.xml` loads it.
* Later FRS section A.7 additions (`vecTrapType`, `vecRestingContext`, `vecPathogenResult`,
  `vecPlasmodiumSpecies`, ...) arrive in the same CSV; trap-effort observation types come in
  `liquibase/3.5.x.x/059-vector-trap-effort-observation-types.xml`.

`testing` runs 3.2.2.0, which predates that changelog, so the categories were never created there.
That is the whole explanation for the empty dropdowns — not missing product code.

## Why the QA harness cannot seed it

`POST /rest/Dictionary` (ADMIN) inserts a dictionary **entry**, and it requires
`selectedDictionaryCategoryId` — an existing category. There is **no REST controller for
dictionary categories** anywhere in the backend: `DictionaryCategoryService.getAll()` is only ever
read. So a harness can add entries to categories that exist, and cannot create the 17 categories
that do not. Loading the CSV via liquibase (or a DB-side insert) is the only route.

Do not re-derive this by probing for a create endpoint: it was searched for and does not exist.

## Consequence for the domain order specs

Two of the literals the indonesiademo-derived specs pinned come straight from this CSV —
`1L HDPE bottle` (`Sample Container`) and `Grab Sample`/`Composite 24h` (`Env Collection Method`).
On `testing` those selects render with zero options, so a spec that insists on a container or a
collection method cannot pass there no matter how it is written. `fillUnsetSelects()` is the right
shape for these fields: set whatever the instance offers, and treat "no options" as reference-data
absence rather than a wizard defect. Both env and vector orders do persist without them
(`POST /rest/SamplePatientEntry -> 200`).

## Full indonesiademo vocabularies (the seed target)

* **Sampling Site Type** — Air Monitoring Station, Distribution Point, Food Facility, Monitoring Station, Other, Soil Sampling Site, Treatment Plant, Water Source
* **Environmental Zone** — Agricultural, Industrial, Peri-Urban, Protected Area, Rural, Urban
* **Sample Container** — 1L HDPE bottle, 250mL glass bottle, 500mL glass bottle, Composite jerry can 5L, Filter membrane, Other, Sterile bag
* **Env Collection Method** — Composite 24h, Composite 8h, Depth Integrated, Grab Sample, Other, Passive Sampler, Surface Grab
* **Env Weather** — Clear / Sunny, Drizzle, Foggy, Heavy Rain, Light Rain, Other, Overcast, Partly Cloudy, Windy
* **vecLifecycleStages** — Adult, Egg, Larva, Nymph, Pupa
* **vecPathogens** — Chikungunya, Dengue, Malaria, Plague, Rift Valley Fever, Typhus, West Nile Virus, Yellow Fever, Zika
* **vecTrapType** — BG-Sentinel trap, CDC light trap, Gravid trap, Ovitrap, Human-landing collection, Aspirator, Sweep net, Other (specify in notes)
* **vecRestingContext** — Indoor (endophilic), Outdoor (exophilic), Unknown
* **vecCollectionTimeOfDay** — Dawn, Daylight, Dusk, Night, Unknown
* **vecPathogenResult** — Positive, Negative, Equivocal / Indeterminate, Invalid
* **vecPlasmodiumSpecies** — P. falciparum, P. vivax, P. malariae, P. ovale, Mixed infection, Indeterminate (P. knowlesi ships inactive)
* **vecPhysiologicalState** — Unfed, Blood-fed, Half-gravid, Gravid, Unknown / not assessed
* **vecBloodmealHostSpecies** — Human, Cattle, Dog, Avian (proxy: chicken), Pig, Goat, Mixed-host bloodmeal, No host detected
* **vecInsecticideResistanceGenotype** — Resistant homozygote, Heterozygote, Susceptible homozygote, Indeterminate
* **vecWhoInsecticideSusceptibilityClass** — Susceptible, Possibly resistant, Resistant
* **vecVirusIsolationResult** — Isolated, Not isolated, Inconclusive

Species-scoped subsets on indonesiademo: `aedesAegyptiPathogens`, `aedesAlbopictusPathogens`,
`anophelesPathogens`, `culexPathogens`, `muscaPathogens`, `phlebotomusPathogens`,
`rattusPathogens`, `xenopsyllaPathogens`; lifecycle variants `mosquitoFullCycle`, `fleaFullCycle`,
`flyStages`, `rodentStages`.

## Note on instance-portable ids

`environmental-sample-types` id 38 is **Water** on indonesiademo and **Adult Mosquito** (a VECTOR
type) on testing. Sample-type and dictionary ids are per-instance. Nothing in the harness may pin
them; resolve by name-from-API or by structure.

## Reproducing the measurement

`tests/docs/vector-env-dictionaries.docs.spec.ts` measures every row above against whatever `BASE`
it runs with, so the table can be refreshed per instance instead of trusted.
