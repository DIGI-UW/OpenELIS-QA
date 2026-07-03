# indonesiademo Demo-Data Seed Capability

Re-runnable seed specs for populating a demo instance. Built to live in the **OpenELIS-QA** Playwright harness (they import its `./capture` and `./order-helpers`). The local `~/Documents/OpenELIS QA` dir is not git-tracked, so these are packaged here to check into the OpenELIS-QA repo under `tests/docs/`.

## Run
Refresh auth once against the target BASE, then run each seeder **in its own invocation** (see note below):
```
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=setup
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-orgs.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-providers.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org SEED_N=20 npx playwright test --project=docs tests/docs/seed-orders.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-compliance.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-calc.docs.spec.ts
BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-reflex.docs.spec.ts
```
> **Run one seeder per `npx playwright test` invocation.** Chaining multiple seed specs in a single
> invocation caused later admin-create POSTs to fail on this build; running each on its own is reliable.

## Specs
- **seed-orgs** — 10 referring clinics (type 5), 10 sampling sites (type 12), 2 reference labs (type 6) via `POST /rest/Organization`. Idempotent by name.
- **seed-providers** — 10 providers via `POST /rest/Provider/FhirUuid`. Body is the admin-UI shape `{ person:{ lastName, firstName, workPhone, fax, email }, active }` (an earlier 500 was from sending `primaryPhone` + a stray `providerType`). Idempotent by last+first name. ✓ verified (10 created).
- **seed-orders** — orders across Clinical / Vector / Environmental through the 4-step wizard (`order-helpers`), `SEED_N` per domain. 30/30/30 clinical state mix (registered / results / results+validated) via `/rest/LogbookResults` + `/rest/AccessionValidation`.
- **seed-compliance** — 5 environmental compliance standards via `POST /rest/compliance/standards`; new records land as DRAFT, then `PUT /rest/compliance/standards/{id}` with `status:ACTIVE` activates. `/active` is what the env order form reads. ✓ verified (5 active).
- **seed-calc** — 2 calculated values via `POST /rest/test-calculation`. Self-grounding, idempotent by stable name.
- **seed-reflex** — 2 reflex rules via `POST /rest/reflexrule`. Self-grounding, idempotent by stable name. Run after seed-calc.

## Calc / reflex constraint (important)
Calc values and reflex rules share a hard rule on this build: **a test may hold only ONE role across the whole
calc+reflex system** (calc target, calc operand, reflex trigger, reflex added-test). DEACTIVATED rows still
occupy the test — there is no delete via the REST API — and tests that already carry base-dataset
test-analyte/reflex linkages are also unusable and are **not visible via the API**. Operand/target/trigger/added
tests must also belong to the rule's own sample type (the `test-display-beans` list can leak tests orderable on
other sample types). The seeders therefore build a best-effort global taint set and use **server-as-oracle
trial-and-error** over untainted, same-sample numeric tests (failed creates roll back — service methods are
`@Transactional`). If an instance's calc/reflex test space is already saturated, free some tests at the DB level first.

## Verified on indonesiademo (older build, no unified test-catalog REST)
Orgs (22), providers (10), clinical orders + results + validation, vector + env orders, compliance standards (5 active),
2 calculated values, 1 reflex rule. See the status note in chat for the remaining reflex rule + cleanup guidance.

## Known limitations / follow-ups
- **Reflex rule #2** and reliable calc/reflex re-seeding need a DB-level cleanup of grounding artifacts (see chat).
- **Env & Vector results** don't use `/rest/LogbookResults` — vector uses the identification/deconvolution workflow, env uses compliance results. Their orders seed as *registered*; wiring their result entry is a follow-up.
- Not yet built: **5 each pathology / IHC / cytology cases** (case-based workflows).
- Helper endpoint for later: `/rest/sample-type-tests?sampleType=<id>` returns tests for a sample type (useful for an API-only clinical order path).
