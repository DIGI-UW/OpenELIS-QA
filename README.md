# OpenELIS Docs Capture

Generate the **screenshots and short videos** that illustrate the OpenELIS Global user manual,
by driving a live instance with Playwright. Self-contained: its own login + config, following the
`openelis-test-catalog-qa` harness conventions (stored auth, Carbon-safe navigation, stable
fixtures). Outputs land in `docs-media/<capability-id>/` (numbered PNGs + `walkthrough.webm`),
named by the capability `id` from the features inventory so they map back to the manual.

## Setup
```bash
npm install
npm run install:browsers        # one-time: downloads Chromium
```

## Authenticate (once per instance)
Saves storage state to `.auth/user.json`. Credentials default to `admin` / `adminADMIN!`
(override with `OE_USER` / `OE_PASS`).
```bash
BASE=https://testing.openelis-global.org npm run auth
```

## Capture
```bash
# one flow
BASE=https://testing.openelis-global.org npm run capture -- tests/docs/results-entry.docs.spec.ts
# all flows
BASE=https://testing.openelis-global.org npm run capture
```
Target the Indonesia demo for environmental/vector flows:
```bash
BASE=https://indonesiademo.openelis-global.org npm run auth
BASE=https://indonesiademo.openelis-global.org npm run capture -- tests/docs/environmental-order-entry.docs.spec.ts
```

## Author / refresh the specs (route map)
The capability→routes→labels table lives in `scripts/author-doc-specs.mjs`. Edit it and regenerate
every spec deterministically:
```bash
node scripts/author-doc-specs.mjs        # writes tests/docs/<id>.docs.spec.ts for each capability
```
Find routes in `../openelis-work/skills/openelis-screenshots/routes.md` (live nav dump). To add a
new screen: add `{ id, name, steps:[{ route, label }] }` and re-run.
(`scripts/gen-doc-specs.mjs` still scaffolds empty stubs from the inventory worklist if you prefer.)

## Conventions (carried from the QA harness)
- **Navigate by route** with `go(page, '/GenericSample/Results')` — verified status 200 for every
  SPA route. Do NOT click sidebar text: nav anchors are render-hidden when the nav is collapsed.
  (`sidebar()` remains only as a deprecated fallback.)
- **The "Still There?" session modal** overlays the page on idle — `go()`/`shot()` auto-dismiss it
  via `dismissModals()`. Add new modal button text there if one slips through.
- **Never `.click()` a Carbon checkbox** (60s tab hang); use DOM/native-setter to show interactions.
- **Stable fixtures**: patient Abby Sebby (`0123456`), accession `26CPHL00008`. Don't create data; prefix `QA_AUTO_` if unavoidable.
- **Mask PII**: `DEFAULT_PII` is applied to every shot; pass `maskPii: [...]` (or `pii` in the route map) for extra selectors.
- **node is nvm-managed**: prefix shells with `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"`.

## Files
- `playwright.config.ts` — `setup` (testDir `.`) + `docs` projects; `BASE` env selects the instance.
- `auth.setup.ts` — login + ChangePassword handling → `.auth/user.json`.
- `tests/docs/capture.ts` — `go()`, `shot()`, `saveWalkthrough()`, `dismissModals()`, `mainPanel()`, `DEFAULT_PII`.
- `tests/docs/*.docs.spec.ts` — one capture flow per capability (multiple labeled shots + video).
- `scripts/author-doc-specs.mjs` — route map → specs (source of truth). `scripts/gen-doc-specs.mjs` — worklist → empty stubs.
- Reusable skill: `../openelis-work/skills/openelis-screenshots/` (`SKILL.md` + `routes.md`).

---

# OpenELIS QA / regression suite — the Application-Map spine

Beyond docs-capture, this repo is the OpenELIS **QA / regression suite**. It's organized around a
**spine** so that when the app changes, you fix *one place* instead of hunting across 100+ specs.
Every failure we've hit has the same shape: the app's *contract* moved (a route, a form field, a
REST DTO, a feature flag) and the knowledge of the new shape was scattered. The spine centralizes
that knowledge.

```
app-map.json  ──►  app-map.ts        (the machine-readable contract: routes, REST DTOs, flags, fixtures, UI anchors)
      │                 │
      ▼                 ▼
legacy-order-helper.ts  (the "verbs": createTestViaRest, setComponentViaRest, setNormalCriticalRangeViaRest,
      │                  placeLegacySerumOrder, apiCall — REST-first, consume the map)
      ▼
test-catalog-*.spec.ts / results-*.spec.ts   (tiered specs — contract guards + E2E chains)
      ▼
spec-freshness.json ──► scripts/refresh-freshness.mjs ──► spec-freshness.html   (which specs are fresh vs. need updating, per build)
```

## 1. `app-map.json` — the machine-readable application map (start here)
Single source of truth for what the suite depends on and what keeps drifting:
- **routes** — SPA routes + which build/flag gates them (e.g. `/Results` needs `RESULTS_ENTRY_UNIFIED_ROUTE`; clinical orders go through `/SamplePatientEntry`, **not** the broken `/order/enter`).
- **rest.endpoints** — request/response DTO shapes (`POST /tests`, `PUT sample-results`, `PUT ranges` with its `componentId`+`lowCritical` shape) and the CSRF rule (in-page fetch, not the bare `request` fixture).
- **flags** — `RESULTS_ENTRY_UNIFIED_ROUTE`: key, default, where it's toggled (Admin → Result Entry Configuration), what it gates.
- **fixtures** — `labUnitId 56 = Biochemistry`, `sampleTypeId 2 = Serum`, dictionary donor test `312`, requester `Mulago`/`Sarah`, result-type codes, patient-id regex.
- **uiAnchors** — the volatile selectors (login username, Carbon dropdowns, per-row Save) and *why* they drift.
- **driftLedger** — symptom → cause → workaround, keyed by ticket (OGC-1132, OGC-1142-editor, login-attrs, unified-results).

Consume it in code via **`app-map.ts`** (`import { FIXTURES, ROUTES, ENDPOINTS, FLAGS } from './app-map'`). When the app changes, edit `app-map.json` (a one-line diff) and every spec/helper updates.

## 2. Shared helpers (`legacy-order-helper.ts`) — the verbs
REST-first building blocks that dodge the drifted UI. Prefer these over driving the editor UI:
- `createTestViaRest(page, {name, code, ...})` — the **documented add-test workflow** (`POST /tests` → `{testId}`).
- `setComponentViaRest(page, id, {code, label, resultType, options?})` — `PUT sample-results` (one component of any result type; auto-borrows dictionary options for D/M/C/T).
- `setNormalCriticalRangeViaRest(page, id, {lowNormal, highNormal, lowCritical, highCritical})` — `PUT ranges`.
- `placeLegacySerumOrder(page, testOrPanelName)` — places a resultable Serum order via `/SamplePatientEntry` (the OGC-1132 workaround).
- `apiCall(page, path, method, body)` — CSRF-aware in-page fetch.

**Rule of thumb: configure state via REST, reserve UI E2E for the behavior actually under test.** Contract specs survived every build this year; UI-driven setup did not.

## 3. Configs & how to run the QA suite
- `all-tc.config.ts` — authenticated runner (`setup` + `storageState`) for `test-catalog-*` + `results-*` specs.
- `playwright.config.ts` — the `docs` project (docs-capture flows) + `setup`.
- `guards.config.ts`, `probe.config.ts` — flip-when-fixed guards / probes.
```bash
# authenticated Test-Catalog / Results suite against a build
BASE=https://testing.openelis-global.org npx playwright test --config=all-tc.config.ts
# a single spec
BASE=https://testing.openelis-global.org npx playwright test --config=all-tc.config.ts test-catalog-mgmt-deep.spec.ts
```

## 4. Spec-freshness tracker — which specs need updating
`spec-freshness.json` (source of truth) lists **every** spec with a `status` (fresh / partial / drift / unknown),
its drift causes, and notes. Regenerate the board / auto-classify from a run:
```bash
BASE=… npx playwright test --config=all-tc.config.ts --reporter=json > runlogs/last.json 2>/dev/null || true
node scripts/refresh-freshness.mjs runlogs/last.json <build-hash>   # discovers new specs, updates results, rebuilds spec-freshness.html
```
`scripts/refresh-freshness.mjs` walks the repo (so the tracker never goes stale on *coverage*), ingests
the JSON report to flip each spec's last result, and renders `spec-freshness.html` (also registered as
the Cowork artifact `openelis-playwright-freshness`). Curate `status`/`drift`/`notes` by hand; the
auto-pass only sets raw pass/fail and flips `unknown`→fresh/drift.

## 5. When a new build lands (the maintenance loop)
1. Confirm the build hash + read `configuration-properties` for flag changes.
2. Run `all-tc.config` with `--reporter=json`; feed it to `refresh-freshness.mjs`.
3. For any spec that flipped to **drift**, check `app-map.json`'s driftLedger — the fix is usually a map edit + a helper, not a per-spec rewrite.
4. Update `app-map.json` with any new route/DTO/flag/anchor you had to discover, so the next person looks it up instead of re-deriving it.

> **Shift-left note:** the cheapest durable fix is upstream — ask the app team to add stable `data-testid` to the volatile Carbon widgets (login fields, dropdowns, per-row actions). The map covers what we can't yet control.
