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

### 9. Order-form commit rules belong in a shared helper
Save & Next stays `cds--btn--disabled` and fires no request until the sampling site is committed via
its result row's **Select**, and at least one of Requesting Organization or Requestor is committed.
The affordance changes once the record exists: first use offers `+ Add new organization "…"`,
afterwards only **Select** works — so an add-new-only spec passes once and fails forever after.
`N/M steps` is a completion counter, not a wizard position: read the button state.
Encoded in `coded-result-chain.docs.spec.ts`; should be lifted into `order-helpers.ts`.

### 10. Test names in the catalog list are decorated
`GET /rest/test-catalog/tests?domain=…` returns `QA Native Env Assay(QA Native Env Matrix)`. An
equality match on `name` never fires, the reuse path falls through to a create, and the create 409s
on the code. Strip a trailing parenthetical and match on `code` as well.

### 11. Assert read-back STATUS, not just shape
A `|| []` fallback turned an HTTP 500 into a plausible "0 tests" and read as a data gap rather than
a server error (OGC-1120). Any read-back helper should surface the status.
