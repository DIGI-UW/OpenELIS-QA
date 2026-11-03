---
name: catalog-csv
description: >
  This skill should be used for OpenELIS Global test catalog work as CSV: "make a catalog CSV",
  "convert this spreadsheet to the catalog loader", "validate the catalog before deploy",
  "import the catalog", "why did the loader skip these rows", distro catalogs (Indonesia, PNG,
  Madagascar), and QA of the configuration loader and the Admin > Import Catalog (CSV) page
  (test-sections, sample-types, tests, result-components, panels, dictionaries, test-results,
  result-limits, terminology, sample-handling, reflex-rules).
metadata:
  version: "0.1.0"
---

# OpenELIS Test Catalog in CSV: authoring, validation, live import

The catalog loader in `DIGI-UW/OpenELIS-Global-2` (`ConfigurationInitializationService` plus one
`DomainConfigurationHandler` per domain) reads `configs/configuration/backend/<domain>/<instanceId>/*.csv`
at container start and upserts the test catalog. Since **OGC-1193** (merged 16 Sep 2026, `5bd1ccc`) and
**OGC-1194** (merged 17 Sep 2026, `6e381be`, PR #4329) the same files also load from
**Admin > Test Catalogue Management > Import Catalog (CSV)**, and the contract now covers most of what the
Test Catalog editor can set.

**Evidence basis.** Sections 1 to 4 are read from `develop` at tree `923b63c` (static prediction).
Live-verified on `testing.openelis-global.org` 3.2.2.0 on 21 Sep 2026: the page exists at
`/MasterListsPage/CatalogImport`; `GET /rest/configuration/import/domains` returns
`["test-sections","sample-types","tests","result-components","panels","result-limits","sample-handling","terminology","reflex-rules"]`;
and a Preview of a domain-named `test-sections` plus `sample-types` pair returned created / updated / skipped
per file, with zero skips and an empty decision queue.
The pre-OGC-1193 behaviour earlier versions of this skill documented (the localized-name collapse,
`Name(<last specimen>)` descriptions, one bad row killing the file, no upload endpoint) is **gone**. Keep
distinguishing static prediction from live observation in everything you write.

Canonical guide (rewritten 21 Sep 2026, version 7): https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1266122780
In-repo docs: `volume/configuration/README.md` (rewritten by PR #4329), `docs/configuration/README.md` (older).
Reference distro: `DIGI-UW/openelis-indonesia-distro` (instances `jakarta`, `bogor`).
Design canon: **OGC-1145 (Done)**, one test many specimens (m:n, per-specimen override). The loader now
implements this deliberately. D-028 "specimen-is-identity" is dead; the design skill's
`test-catalog-data-model.md` / `decision-log.md` may still show it active, which is stale.
Requirements and gap register: `test-catalog-csv-loader-v2-frs.md` (read its **Delivery status (21 Sep 2026)**
section first) and `cphl-csv-catalog-gap-analysis.md`, on Casey's Mac in `~/dev/oe-catalog-import/deliverables/`.

## 0. Tooling (scripts)

Scripts live in `openelis-work/tools/test-catalog-csv/`; originals from the Sep-2026 CPHL exercise are in
`~/dev/oe-catalog-import/bundle/` on Casey's Mac.

| Script | Purpose | State |
|---|---|---|
| `db2catalog.sh INSTANCE OUTDIR [PREFIX]` (needs `PGURL`) | **Preferred source.** Exports an existing OpenELIS DB into CSVs plus `uom.txt`. Column names verified on 3.2.1.10. Review workbooks lack result type, units, sig digits, normal flag, categories, abbreviations, LOINC and translations; the DB has them. | Partly updated 21 Sep 2026: `reflex-rules` now uses the shipped column names (and warns that the legacy model carries no specimen), and `panels` exports plain test names. **Still does not export `result-components`, `result-limits`, `terminology` or `sample-handling`**, so a DB is no longer a complete CSV source. |
| `xlsx2catalog.py WORKBOOK --out DIR --instance ID --prefix P [--mode safe\|faithful] [--locales en,fr]` | Converts an "Active Tests Review" workbook (one sheet per section plus Panels and Reflex Rules) into CSVs and writes `review.csv` with every inferred or unrepresentable value. | `safe` mode's duplicate-name suffixing is obsolete now that `localCode` loads, but its **parenthesis stripping is still needed** (see 3.1). Never run `--expand-panels` against a current build. |
| `validate_catalog.py BACKEND_DIR --instance ID [--uom-list uom.txt] [--json report.json]` | Static pre-deploy validation mirroring the loader's real rules. Exit 1 on any ERROR. | **Stale and now misleading.** It still flags the localization collapse and predicts `Name(<last specimen>)` descriptions, neither of which happens. Rewrite against section 3; until then the import page's Preview is the better check. |
| `run-import.sh INSTANCE [timeoutSec]` | Boots db+fhir+webapp from a distro clone with a fresh DB and cleared checksums, waits for the loader, writes `results/<instance>/{startup.log,loader.log,counts.txt}`. | Still correct. |

Docker on Mac: `brew install colima docker docker-compose`; `colima start --cpu 6 --memory 12 --vm-type vz --vz-rosetta`;
add `cliPluginsExtraDirs: ["/opt/homebrew/lib/docker/cli-plugins"]` to `~/.docker/config.json`; images are amd64.

Workflow: **source, then CSVs, then a Preview on a stack you may dirty (or `run-import.sh`), then read the
SUMMARY lines and DB counts, compare to source, write up.** Never trust a created/updated count alone: rows
can be skipped and the file still records a checksum.

## 1. File layout, load order, and the two ways in

```
configs/configuration/backend/
  test-sections/<inst>/*.csv      order 100
  sample-types/<inst>/*.csv       order 100
  tests/<inst>/*.csv              order 200   needs sections + sample types
  result-components/<inst>/*.csv  order 210   needs tests
  panels/<inst>/*.csv             order 300   needs tests
  dictionaries/<inst>/*.csv       order 300
  test-results/<inst>/*.csv       order 310   needs tests + dictionaries
  result-limits/<inst>/*.csv      order 320   needs tests (+ components)
  terminology/<inst>/*.csv        order 320   needs tests (+ components)
  sample-handling/<inst>/*.csv    order 320   needs tests
  reflex-rules/<inst>/*.csv       order 330   needs tests (+ components)
  (roles, locales, nce-*, address-hierarchy, vector-*, compliance-*, questionnaires: other loaders)
```

- **Instance scoping is generic for every domain.** Any file under `<domain>/<inst>/` hides base files for
  that domain. Filesystem wins over classpath; never merged.
- **Checksums:** `<backend>/<domain>-checksums.properties`, key = bare filename, SHA-256. Delete to force a
  reload; renaming a file also makes it new, so it loads again.
  `POST /rest/configuration/domains/reload` (ADMIN, body `{domains:[], force}`) re-reads **disk**.
- Config dir must be writable by uid 8443 or every boot re-imports.
- **Admin > Test Catalogue Management > Import Catalog (CSV)** (`/MasterListsPage/CatalogImport`, ADMIN only,
  REST under `/rest/configuration/import/*`) is the other way in. **Preview** evaluates every row against the
  live database inside a transaction it rolls back, so the plan is the outcome rather than a guess. **Apply**
  copies the files into the configuration tree and loads them, so start-up and the page stay one mechanism.
- **A file's area is read from the start of its file name, longest match first**, and is overridable per file
  in the UI. `cphl-tests.csv` matches nothing and is refused with "Cannot tell which catalog domain ...";
  `tests-cphl.csv` works. Name every file after its area.
- **`dictionaries` and `test-results` cannot be previewed or uploaded.** Neither overrides `supportsDryRun()`,
  so the page will not take them; they load only at start-up or through the reload API. This is the biggest
  practical gap in the page: a catalog with new dictionary entries still needs a file drop plus restart, or a
  reload call, before its `test-results` rows can resolve.
- **Apply bypasses checksums for the uploaded files only** (`forcedFiles`), leaving the rest of the shipped
  catalog alone, which is why a four-file upload takes about 7 seconds rather than 35.
- Every load (start-up, reload API, preview, apply) is an **import run** with a stored summary of
  `<domain>/<file>: created= updated= skipped=` lines. Apply auto-closes queue items that have become
  resolvable; Preview does not.

## 2. Columns (header match case-insensitive, unknown columns ignored, short rows padded)

| Domain | Required | Optional (nothing else is read) |
|---|---|---|
| test-sections | `testSectionName` (<=20, `test_section.name`) | `description`, `isActive`, `sortOrder`, `isExternal`, `domain` (**not validated**), `localization:xx` |
| sample-types | `description` (<=40), `localAbbreviation` (<=10) | `domain` (default `H`, create only), `isActive`, `sortOrder`, `loinc` (recorded as a LOINC/SAME_AS mapping), `localization:xx` |
| tests | `testName`, `testSection` | `sampleType` (`\|`), `loinc`, `isActive`, `isOrderable`, `sortOrder`, `unitOfMeasure`, **`isReportable`**, **`notifyResults`**, **`localCode`** (<=10), **`reportingName`**, **`domain`**, **`amr`**, `localization:xx` |
| result-components | `testName`, `code` | `sampleType` (legacy disambiguator only), `label`, `resultType` (D/N/A/R/T/M/C), `unitOfMeasure`, `significantDigits`, `displayOrder`, `isPrimary`, `showOnReport`, `defaultResult`, `allowMultipleReadings` |
| panels | `panelName` (<=20, `panel.name`) | `sampleTypes` (`\|`), `tests` (`\|`, **plain test names now**), `isActive` (only literal `N` deactivates), `sortOrder`, `loinc`, `domain` (CLINICAL/ENVIRONMENTAL/VECTOR, validated), `localization:xx` |
| dictionaries | `category` (<=50), `dictEntry` | `localAbbreviation`, `isActive` (stored raw; **blank rewrites to Y**), `sortOrder`, `loincCode`, `localization:xx` |
| test-results | `testName`, `resultType` (D/N/A/R/T/M/C) | `resultValue`, `dictionaryCategory`, `sortOrder`, `isQuantifiable`, `isActive`, `isNormal`, `significantDigits`, `flags`, `significance` (POSITIVE/NEGATIVE/INDETERMINATE) |
| result-limits | `testName` | `sampleType`, `componentCode`, `gender` (M/F), `minAge`, `maxAge` (years), `lowNormal`, `highNormal`, `lowCritical`, `highCritical`, `lowValid`, `highValid` |
| terminology | `testName`, `source` (LOINC/SNOMED/CIEL/OCL), `code` | `sampleType`, `componentCode`, `relationship` (SAME_AS default, BROADER_THAN, NARROWER_THAN), `displayName` |
| sample-handling | `testName` | `sampleType`, `storageCondition`, `storageConditionCustom`, `storageDuration`, `storageDurationUnit`, `stabilityNotes`, `protectFromLight`, `doNotFreeze`, `doNotRefrigerate`, `disposalMethod`, `disposalTimeframe`, `disposalUnit`, `specialInstructions` |
| reflex-rules | `ruleName` | `overall` (ANY default / ALL), `active`, `conditionTest`, `conditionSampleType`, `conditionComponent`, `relation` (EQUALS default; BETWEEN needs `value2`), `value`, `value2`, `reflexTest`, `reflexSampleType`, `internalNote`, `externalNote`, `addNotification` |

DB limits: `test.description` unique (`test_desc_uk`), capped at 60 by the loader when renaming a legacy
variant; `test.local_code` 10 unique; `panel_item.test_name` 20 (truncated silently);
`dictionary_category.local_abbrev` 10 (loader auto-generates 5, with 1..99 collision suffixes);
`unit_of_measure.name` 26. Units are still **never created**: an unknown `unitOfMeasure` is dropped silently
in `tests` and **throws** (skipping the row) in `result-components`.

## 3. Loader semantics you must design around

1. **One row is one test, with all its specimens.** `sampleType=A|B` creates one test named by its plain
   `testName`, linked to both, written through `TestCatalogCreationService` so it takes the same shape as a
   test created in the editor. Identity is `localCode` when that column is filled, then the plain name by
   exact and then normalized description. **Translations never identify a test.** Legacy `Name(Specimen)`
   records are recognised by `LegacyTestVariantFinder`, updated in place for the specimens the row lists, and
   renamed to the row's spelling; a variant for a specimen the row does not list is a different test and is
   left alone.
   **The normalizer trap survives.** `TestDescriptionNormalizer.normalizeDescription` still concatenates the
   base name with the **first parenthesised part** and strips punctuation, so `Amikacin (AK)` and
   `Amikacin (AK) Zone Diameter (mm)` both reduce to `amikacinak`, and `Amoxicillin-Clavulanate` equals
   `Amoxicillin/Clavulanate`. Exact description is tried first, so re-running the same file is safe, and a
   collision already in the database makes `uniqueResult()` throw and skip that row rather than merge it. But
   on a first load, the second of two colliding names can still resolve onto the first. Keep parentheses out
   of `testName` and give colliding tests a `localCode`.
2. **Per-row transactions and a SUMMARY line** in `tests`, `sample-types`, `test-sections`, `panels` and the
   five attribute domains: a row the database rejects is skipped with its line number and reason while the
   rest of the file loads, and each file closes with
   `SUMMARY file=... domain=... created= updated= skipped=`. **`dictionaries` and `test-results` are the
   exception:** still one `@Transactional` per file, no SUMMARY line, so one DB-level failure can still
   poison the file.
3. **Unit of work varies.** One row: `tests`, `sample-types`, `test-sections`, `panels`, `sample-handling`.
   One group: `result-components` and `terminology` (per `testName|sampleType`), `result-limits` (per
   `testName`), `reflex-rules` (per `ruleName`). When a group fails, **every row of that group** is reported
   skipped with the same reason.
4. **Blank cells do not mean the same thing everywhere.** Leave unchanged: `result-components`,
   `sample-handling`, `terminology` (except `relationship`, always rewritten to SAME_AS). Hard defaults:
   `result-limits`, where blank `maxAge`, `highNormal`, `highCritical`, `highValid` become positive infinity,
   `lowNormal` and `lowValid` negative infinity, and **`lowCritical` also becomes positive infinity**, which
   is almost certainly not what an author means. `reflex-rules` clears `conditionComponent` when blank.
   `dictionaries` rewrites a blank `isActive` to Y. In `test-results`, a blank leaves an existing value alone
   but takes a default on create, and `significance` distinguishes an absent column (unchanged) from a
   present-but-blank cell (cleared).
5. **`result-limits` replaces**: the rows of one test are that test's complete numeric ranges (dictionary
   limits and reporting ranges untouched). `terminology` and `result-components` **merge**: what the file does
   not mention is kept.
6. **Two CSV parsers are in the tree.** `result-components`, `result-limits`, `terminology`,
   `sample-handling`, `reflex-rules` and `panels` use `CsvParsingUtil` with the RFC 4180 `""` escape.
   `tests`, `sample-types`, `test-sections`, `dictionaries` and `test-results` still carry the naive copy that
   toggles on every `"`, so a doubled quote desynchronises the rest of that line.
7. **No BOM handling anywhere.** A UTF-8 BOM prefixes the first header name, the required-column check fails
   and the file aborts on line 1. This is the most common "my CSV is not formatted right".
8. **No multi-line cells anywhere.** One physical line per row. A `#` at the start of a line makes it a
   comment, including a data row whose first cell starts with `#`. Blank and comment lines still advance the
   reported line number, so line numbers match a text editor (header = line 1).
9. **Names that do not resolve are queued, not lost.** A lab unit, specimen or test name the catalog does not
   know becomes an item in **Needs your decision**, folded by spelling and counted, which an implementer
   points at the right record, skips, or remembers as an alias so later imports resolve it by themselves.
   Queue items **survive a preview and a rolled-back row**, deliberately, so previewing a catalog whose
   upstream records are not there yet leaves a mess on a shared instance. Two gaps: `panels` queues unmatched
   member **tests** but only logs unmatched **sample types**, and `sample-types` queues nothing at all.
10. **Additive-only links.** Panel members, panel sample-type links and test-to-sample-type links are only ever
    added, never removed. Deletions never happen anywhere; retire with `isActive=N`.
11. **`test-results` still fans out by prefix.** Resolution is localized name, then description, then name,
    and failing those it applies the row to **every** active test whose description starts with
    `testName + "("`. Write base names. `D`/`M`/`C` need `resultValue` plus, in practice,
    `dictionaryCategory`: the name-only fallback returns nothing when the text exists in more than one
    category (CPHL: "Negative" in 15). A dictionary value is stored as the dictionary **id**.
12. **Reflex rules read `overall` and `active` from the group's first row only**, and a blank specimen column
    means "the test's only linked specimen", which throws when the test has zero or several. A microbiology
    catalog therefore needs both specimen columns filled.
13. **Preview judges rows independently.** A row that depends on a record another row, or another file in the
    same upload, would create is reported as skipped. The page says so in its own words. Do not report a
    preview skip as a defect without re-checking after Apply.
14. **Performance.** CPHL, 394 rows, on Rosetta with 6 vCPU: minutes, not seconds, for a full catalog at
    start-up (pre-v2 timings: tests 434s, panels 130s, test-results 116s, webapp start 806s). Set the
    healthcheck `start_period` to 900s or more. The import page is far faster because it re-reads only what
    was uploaded.

## 4. Authoring rules (what to emit today)

- UTF-8 **without BOM**, `\n` line endings, header on line 1, quote only cells containing commas, no newlines
  inside a cell. Avoid a literal `"` entirely in `tests`, `sample-types`, `test-sections`, `dictionaries` and
  `test-results`; the other six domains handle `""` correctly.
- **Name the file after its area** (`tests-cphl.csv`, `result-components-cphl.csv`). The import page reads
  the area from the file-name prefix, and it is what makes a multi-file upload self-describing.
- **One row per test, plain `testName`, all specimens in `sampleType` separated by `|`.** No parentheses (3.1
  says why they still bite), no per-specimen duplicate rows. `localization:xx` is now safe on multi-specimen
  rows: it no longer affects identity.
- **Fill `localCode` wherever the source has one.** It is the only identity stable across a rename, it is the
  first thing the loader matches on, and it is how two names that collide under the normalizer stay apart.
- Canonical casing for section and category names; specimen strings exactly as `sample-types.csv` spells
  `description`; `localAbbreviation` <= 10, `description` <= 40, `panelName` <= 20, `testSectionName` <= 20.
- `test-results` by **base** name; panels by **plain test names**.
- Exactly one `isNormal=Y` per dictionary test; `significantDigits` plus `unitOfMeasure` for N tests; LOINC
  only when verified, never LLM-guessed.
- Pre-seed `unit_of_measure`, or expect blanks in `tests` and skipped rows in `result-components`.
- In `result-limits`, **write every bound you mean**, including `lowCritical`. Do not rely on blanks.
- In `reflex-rules`, fill `conditionSampleType` and `reflexSampleType` unless the test truly runs on one
  specimen.
- Load order is dependency order: nothing in the five attribute domains resolves before its test exists. When
  uploading, include the `tests` file in the same upload or apply it first.
- Every inferred value goes into `review.csv` for the lab to confirm.

## 5. Live import check (what "it worked" means)

From the import page: Preview, read "What these files would do" (created / updated / skipped per file, with
line numbers and reasons), clear **Needs your decision**, then Apply and read "What was loaded".

From a container start or the reload API, grep `startup.log` for `SUMMARY file=`, `Created new test`,
`Updated existing test`, `Recognised`, `SKIPPED`, `Skipping row`, `not found (line`, `CONFIGURATION ERROR`,
`Error processing line`, `too long`, `current transaction is aborted`, `ConstraintViolation`, `Failed to load`,
`must have a`, `is empty`.

Then compare DB counts (`test`, `sampletype_test`, `test_result_component`, `dictionary`, `test_result`,
`panel_item`, `result_limit`, terminology, sample-handling and reflex-rule tables) with the source. Clean means
zero problem lines, matching counts, an empty decision queue, and a second load producing no creates. Save
`results/<instance>/` next to the CSVs.

**Previewing against a shared instance is not free:** unresolved names persist from a preview, so preview a
whole catalog only where you may leave a decision queue behind, or upload everything its rows depend on in
the same batch.

## 6. Known drift and open work

**Shipped in OGC-1193 / OGC-1194** (remove these from any gap register): one test per row with its specimens;
identity by `localCode` then normalized plain name; per-row transactions with line-numbered skip reasons;
SUMMARY lines; `isReportable`, `notifyResults`, `localCode`, `reportingName`, `domain`, `amr` on `tests`; the
`result-components`, `result-limits`, `terminology`, `sample-handling` and `reflex-rules` domains; GUI import
with dry-run preview and apply; the shared "Needs your decision" queue with remembered aliases; plain-name
panel members; RFC 4180 quoting in the six domains that use `CsvParsingUtil`.

**Still open:**
- `dictionaries` and `test-results` cannot be previewed or uploaded, have no SUMMARY line, and remain
  whole-file transactions. Top remaining loader gap.
- BOM is still not stripped in any domain.
- The naive parser survives in five domains.
- The normalized-identity key still folds the first parenthesis and drops punctuation (3.1), so the old
  `Amikacin (AK)` collision is not fixed.
- `panels` does not queue unresolved sample types; `sample-types` queues nothing at all.
- `test-sections` accepts any `domain` value without validation, though its javadoc implies otherwise.
- `result-limits` defaults `lowCritical` to positive infinity.
- `panels` swallows an unparseable `sortOrder`; panel membership and specimen links stay additive-only.
- `db2catalog.sh` does not export the four attribute domains, so a DB is no longer a complete CSV source.
- Alignment with the FHIR catalog subscription (OGC-1044, OCL or consolidated server) is still open. The CSV
  contract is now much closer to the editor's model, which should make that easier rather than harder.

## 7. Reporting format for gap work

Lead with the numbers table (source vs loader-documented vs loader-observed: tests, specimen links, result
components, dictionary entries, result rows, panel items, ranges, terminology mappings, reflex rules, validator
errors, timings), then gaps grouped as *model mismatch* / *loader defects* / *unrepresentable attributes* /
*source-data gaps*, each with evidence, severity and the FR that fixes it. Distinguish **static prediction**
from **live observation** in every claim. Frame as national-scale health-system configuration; never LMIC
framing. Specs as `.md`, i18n always included.