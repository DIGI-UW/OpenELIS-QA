# indonesiademo Demo-Data Seed Capability

Re-runnable seed specs for populating a demo instance. Built to live in the **OpenELIS-QA** Playwright harness (they import its `./capture` and `./order-helpers`). The local `~/Documents/OpenELIS QA` dir is not git-tracked, so these are packaged here to check into the OpenELIS-QA repo under `tests/docs/`.

## Run
```
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-orgs.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-providers.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org SEED_N=20 npx playwright test --project=docs tests/docs/seed-orders.docs.spec.ts
```
(Run `--project=setup` once first to refresh `.auth/user.json` against the target BASE.)

## Specs
- **seed-orgs** — creates 10 referring clinics (type 5), 10 sampling sites (type 12), 2 reference labs (type 6) via `POST /rest/Organization`. Idempotent (skips existing names).
- **seed-providers** — 10 providers via `POST /rest/Provider/FhirUuid`. ⚠ Currently returns HTTP 400 (the Provider/Person request body needs the full bean shape — TODO: read `Provider.java`/`Person.java` valueholders for required fields).
- **seed-orders** — creates orders across Clinical / Vector / Environmental through the 4-step wizard (reusing `order-helpers`), `SEED_N` per domain. Applies a 30/30/30 state mix (registered / results / results+validated) to **clinical** via `/rest/LogbookResults` + `/rest/AccessionValidation`.

## Verified on indonesiademo (older build, no unified test-catalog REST)
- Org create + type IDs (5/12/6). ✓
- Clinical order create + result entry + **validation** (no e-sig change needed — validate-FAILED=0). ✓
- Vector + Environmental order create. ✓

## Known limitations / follow-ups
- **Env & Vector results** don't use `/rest/LogbookResults` — vector uses the identification/deconvolution workflow, env uses compliance results. Their orders seed as *registered*; wiring their result entry is a follow-up.
- **Providers** 400 — needs the exact `Provider`/`Person` JSON.
- Not yet built: **5 compliance regulations**, **2 calculated values** (`/rest/test-calculations`), **2 reflex rules**, **5 each pathology / IHC / cytology cases** (case-based workflows).
- Helper endpoint for later: `/rest/sample-type-tests?sampleType=<id>` returns tests for a sample type (useful for an API-only clinical order path).
