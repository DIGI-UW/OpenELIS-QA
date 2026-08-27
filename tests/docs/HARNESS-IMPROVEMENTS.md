# Harness improvement backlog

Collected while driving the app by hand in a real browser (2026-08-24, testing 3.2.2.0). Each item
is something that cost time, produced a wrong reading, or would remove a whole class of flake.
Ordered by what it saves, not by effort.

## Landed

### 1. Run-level session guard — `tests/helpers/session-guard-reporter.ts`

`session.ts` and `api-json.ts` already solved the mid-run session lapse, but only for callers that
route through `api-json`. Measured coverage across 159 spec files:

| path | files |
|---|---|
| imports `tests/helpers/api-json` (has recovery) | **2** |
| raw `request` fixture | 23 |
| in-page `await fetch(...)` | 76 |

So the guard existed at ~1% coverage. The `all-tc` run on 2026-08-24 lapsed repeatedly — `LoginPage`
180 times in the log — and reported **57 passed / 91 failed** against a 72/2 baseline hours earlier.
None of those 91 were product defects.

The reporter fixes it without touching 159 specs: keepalive ping every `SESSION_KEEPALIVE_MS`
(default 4 min), self-heal through the same `reauthenticate()` that rewrites `.auth/user.json`, and
a **RUN CONTAMINATED** verdict plus `.session-guard/contaminated.json` when a lapse plausibly
reached the results. Proven live: it detected the login page and re-authenticated in 2.6 s mid-run.

**Trap:** `--reporter=line` on the CLI *replaces* the config's reporter list and silently disables
the guard. Verified both ways in the same run.


### 9. Order-form commit rules lifted into `order-helpers.ts` -- LANDED 2026-08-25
Save & Next stays `cds--btn--disabled` and fires no request until the sampling site is committed via
its result row's **Select**, and at least one of Requesting Organization or Requestor is committed.
The affordance changes once the record exists: first use offers `+ Add new organization "…"`,
afterwards only **Select** works — so an add-new-only spec passes once and fails forever after.
`N/M steps` is a completion counter, not a wizard position: read the button state.
Encoded in `coded-result-chain.docs.spec.ts`; should be lifted into `order-helpers.ts`.

Now exported as `setById`, `commitRow`, `clickAddNew`, `generateLabNumberOnForm`,
`commitSiteAndRequester`, `selectSampleTypeOnOrderForm`, `openTestsAndPanels`, `tickByExactLabel`,
`saveAndNextEnabled`, `clickThroughSaveAndNext`. First reuse is
`tests/docs/catalog-feature-chains.docs.spec.ts`, which drove a full order end to end without
restating a single rule.

**Two traps the lift exposed, both now encoded:**

* The clinical wizard is **`/order/clinical/enter`**. `/SamplePatientEntry` also renders an input
  whose id is `labNumber`, but there it is the *Previous* Lab Number search box, which Generate
  never fills. Pointing a chain at the wrong route fails as *no lab number was generated* -- which
  reads like a broken Generate button, not a wrong page.
* `tickByExactLabel` now ticks **visible** labels only. The Tests and Panels accordion keeps a
  section per sample type in the DOM, so a panel offered under several types has a matching label
  in each, including collapsed sections a user can never reach. Taking the first match ticks an
  arbitrary section.

### 11. Read-backs assert STATUS, not just shape -- LANDED 2026-08-25
A `|| []` fallback turned an HTTP 500 into a plausible "0 tests" and read as a data gap rather than
a server error (OGC-1120). Any read-back helper should surface the status.

`tests/helpers/api-json.ts` now exports `getJsonWithStatus`, `getJsonOk` and
`ServerErrorResponseError`, and `parseOrThrow` throws on `status >= 500`. 4xx is still tolerated on
purpose: probing for a 404 is a legitimate pattern in this suite, and turning it into a throw would
break the endpoint-discovery specs.

### 12. Every config that sets `use.storageState` needs a `setup` dependency -- LANDED 2026-08-25 (partly)

`chains-features.config.ts` set `storageState` but declared no `setup` project, so it reused
whatever cookie happened to be on disk. When that cookie was a day old, every request came back as
the **login page with HTTP 200 and an HTML body**, and the failure surfaced as a JSON
`SyntaxError` on an unexpected `<` -- which reads like a broken endpoint, not an expired session.
Fixed there by declaring a `setup` project matching `auth.setup.ts` and depending on it.

**`census.config.ts` still has this gap.** Its 126/1 result on 2026-08-25 is only valid because the
auth file happened to be fresh at the time.

### 15. The suite now tests itself -- LANDED 2026-08-27

`preflight.spec.ts` + `preflight.config.ts`. No network, no browser, no auth: it reads the repo and
grades the harness against the mistakes that have actually cost runs. Finishes in ~0.2s. Run it
BEFORE a long suite.

| check | what it catches |
|---|---|
| PF-1 | a config that sets `storageState` with no `setup` dependency |
| PF-2 | a spec whose default BASE names a different host than the config running it |
| PF-3 | a `testMatch` that matches no file -- zero tests, exit 0, a green run that tested nothing |
| PF-4 | informational: specs no config will ever run (160 of 221 today) |

It found three real problems on its first run, none of which anyone had noticed:

* `multicomponent`, `rtype` and `workplan` configs all set `storageState` with no setup project --
  the same gap as item 12, in three more places. Fixed.
* `seed-data.setup.ts` read `process.env.BASE_URL` defaulting to **testing**, while
  `regression-seed.config.ts` sets `baseURL` from `process.env.BASE` defaulting to an **IP**. Two
  env var names, two defaults, in a file that WRITES DATA -- pointing the seeder at the config
  target would still have seeded testing, silently. Now navigates relatively so the config is the
  single source of truth.
* `personas-roles.config.ts` appeared to match nothing -- a false alarm from the preflight itself,
  which only counted `.spec.ts` and `.setup.ts` and so could not see `.guard.ts`. Fixed in the
  preflight.

**Writing the detector was itself instructive.** Its first cut accused 17 configs that were all
fine, because it looked for `.setup.ts` while the tree spells the same regex three ways --
`auth[.]setup[.]ts`, `auth\.setup\.ts`, and plain. Its second cut accused four QC suites of
cross-instance running, because it took the first URL in the file and those specs name their
capture instance in a header COMMENT. Both are the same lesson the suite keeps teaching: a detector
that has not been checked against known-good input is a finding generator, not a test.

## Open

### 2. Give the harness its own account
`OE_USER` / `OE_PASS` are already env-overridable, so this is provisioning, not code. A human
working in the UI as `admin` while a suite runs as `admin` is a live hazard: on 2026-08-24 a Chrome
session and a suite were both authenticated as `admin`, the browser tab was kicked to `/login`, and
the suite logged 180 login-page answers. Two mechanisms are plausible — concurrent-session eviction
and plain inactivity timeout — and neither has been isolated. A separate account removes one of
them for free.

### 3. There is no admin setting for the login-session timeout
Checked all 32 rows of `/rest/SiteInformationMenu`: the only timeout-shaped property is
`esigSessionTimeoutMinutes` (e-signature, 30 min). The app's own inactivity modal — Carbon
"Still There? User session is about to time out." — is a frontend component, pre-rendered **hidden**
on every page. So the run length cannot be made safe by configuration; the keepalive is the lever.

### 4. Deep-link the Test Catalogue editor sections
`/MasterListsPage/TestCatalogEditor/{testId}/{section}` is a stable route. All 14 sections resolve:
`basic-info`, `sample-results`, `methods`, `ranges`, `storage`, `panels`, `labels`, `terminology`,
`reagents`, `analyzers`, `alerts`, `reflex-calc`, `localization`, `display-order`. Specs currently
search the list and click a row; deep-linking removes that preamble and its flake.

### 5. Filter the hidden "Still There?" modal out of text assertions
It is in the DOM of every page with `visibility: hidden; opacity: 0`. Any `innerText` or heading
scrape picks it up, so a spec can "see" a session-timeout dialog that is not showing. Assert on
visibility, not on text presence.

### 6. React side-nav needs trusted clicks
Scripted `.click()` on the editor's side-nav items does not route; only a real browser-level click
does. Same family as the existing Carbon-checkbox rule (click the visible label, never the hidden
input) — worth stating together in one "what does not work from `page.evaluate`" section.

### 7. Never treat a client-side write log as evidence of persistence
An injected `window.fetch` recorder was silently replaced by the SPA mid-flow, producing a
zero-write log for an order that had definitely saved. Read the record back from the server.

### 8. Cheap UI oracles worth asserting on
* **Sample Type Editor** — columns Name / Sample Domain / Status / **Tests**. One screen shows
  domain↔test wiring that currently costs several API calls. Page 1 today: Clinical 16,
  Environmental 2, Vector 2, with four zero-test sample types visible.
* **Panel Editor** — columns Panel Name / LOINC / Tests / Domain / **Sample Types (derived)**.
* **Lab Units** — Name / Domain / Status / Tests.

### 10. Test names in the catalog list are decorated
`GET /rest/test-catalog/tests?domain=…` returns `QA Native Env Assay(QA Native Env Matrix)`. An
equality match on `name` never fires, the reuse path falls through to a create, and the create 409s
on the code. Strip a trailing parenthetical and match on `code` as well.


### 13. A 200 with an HTML body is the most misleading failure shape in this suite

Three separate times now it has cost real time: an expired session answers **HTTP 200** with the
login page, so a status assertion passes and the *next* line fails on parsing or on a missing
fixture. Item 12 is one instance; OGC-1120 was another. Any helper that expects JSON should check
the content type, or at minimum report *this looks like the login page* rather than surfacing a raw
`SyntaxError`.

### 14. Screenshot coordinates are not CSS pixels

The `claude-in-chrome` `computer` tool works in screenshot space. On the display used on 2026-08-25
the factor was `1372 / window.innerWidth = 0.9528`, so feeding `getBoundingClientRect()` values
missed by about 5% of the offset from the origin -- enough to land on the wrong control near the
bottom of a long form, and enough to produce a **false defect report** (a Create NCE button that
appeared to issue no network request) which was really a mis-aimed click. Read coordinates off a
fresh screenshot, and confirm an action fired by comparing
`performance.getEntriesByType('resource')` before and after, rather than by looking for a visible
effect.
