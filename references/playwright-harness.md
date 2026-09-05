# Playwright Harness & Carbon Component Rules

> **Where the harness lives:** **this repo — `DIGI-UW/OpenELIS-QA`.** The Playwright config
> (`playwright.config.ts`), setup (`auth.setup.ts`, `data.setup.ts`, `seed-data.setup.ts`),
> `helpers/`, `pages/`, `tests/` (chains + personas), `gap-suites-*.spec.ts`, and the legacy
> single-file `openelis-e2e.spec.ts` all live at the repo root. This skill (SKILL.md +
> references/) is the methodology layer over that harness. Canonical spec layout is **one spec
> per chain/persona** (`tests/chains/chain-a-*.spec.ts`, run via `--project=chain-a`); the
> single `openelis-e2e.spec.ts` is legacy and was quarantined to `archive/` in #94 (no config
> ran it). Module suites live in `tests/` and are swept by `modules.config.ts`.

---

## Section 6 — React/Carbon Component Workarounds

### 6.1 — Native Setter Pattern (React-controlled inputs)

When Carbon dropdowns or inputs don't respond to normal click/type interaction, use the
native setter pattern to trigger React's synthetic event system:

```javascript
// Carbon Select — trigger React onChange
const sel = document.querySelector('select[id*="TARGET" i]');
const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
setter.call(sel, sel.options[1].value);
sel.dispatchEvent(new Event('change', { bubbles: true }));

// Carbon TextInput — trigger React onInput
const input = document.querySelector('input[id*="TARGET" i]');
const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
inputSetter.call(input, 'TARGET_VALUE');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

This workaround is especially needed for the Referral external lab dropdown (BUG-2).

**IMPORTANT:** The native setter pattern sets the internal value but may NOT update the
visible character counter (e.g., "0/23" stays unchanged). If the visible UI must update,
use direct click + `computer.type()` instead.

### 6.1b — Carbon `Dropdown` type-ahead: FOCUS THE TRIGGER FIRST

A Carbon `Dropdown` renders **no text input** — it is not a `ComboBox`. Search still works, as
**type-ahead on the focused trigger**: focus the trigger button, type, the matching option
highlights, Enter selects.

```ts
const trigger = page.getByRole('combobox', { name: /shipped analyzer profile/i });
await trigger.focus();          // <-- REQUIRED
await trigger.click();
await page.keyboard.type('sys', { delay: 120 });
await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(/Sysmex/i);
```

**Why this matters:** keystrokes sent while focus is elsewhere fall through to a **global search
shortcut**, which navigates away (e.g. to `/analyzers/types?search=sys`) and abandons an
in-progress inline setup. Reported as "the picker has no search" in the 2026-08 analyzer run —
**that finding was a harness artefact and had to be withdrawn.** Absence of a text input is NOT
evidence that search is missing; drive it with focus first before making the claim.

(Confirmed not to affect real users: typing into a normal text field behaves normally, the value
survives, and stray keystrokes outside a field neither navigate nor clear the form.)

### 6.1c — Wrapped list DTOs

Not every list endpoint returns a bare array. `GET /rest/analyzer/analyzers` returns
`{ "analyzers": [...] }`; calling `.find()` on the response throws. Normalize:

```ts
const res = await api(page, '/analyzer/analyzers');
const rows = Array.isArray(res) ? res : (res.analyzers ?? res.content ?? res.items ?? []);
```
Check the shape once and record it in `app-map.json` rather than rediscovering it mid-run.

### 6.2 — Carbon Checkbox Avoidance (BUG-2 EXTENDED)

**CRITICAL:** Calling `.click()` on ANY Carbon for React checkbox causes a 60-second browser
tab hang. This affects ALL checkboxes across the React SPA, not just Referral dropdowns.

**Workarounds:**
- **Results page:** DOM workaround works — `cb.checked = true; cb.dispatchEvent(new Event('change', {bubbles:true}))` sets the DOM state and persists on Save.
- **Validation page:** DOM workaround sets `checked` but React state does NOT update — server POST omits the value. Mark checkbox interaction tests as BLOCKED.
- **General rule (SUPERSEDED BY 6.2a):** the hang is an actionability wait against a 1x1 hidden input, not a Carbon defect. Click `label.cds--checkbox-label` instead and the interaction works — see 6.2a before marking anything BLOCKED.

### 6.2a — Carbon checkbox: click the LABEL, not the input (RESOLVES 6.2)

6.2 says never `.click()` a Carbon checkbox because of a 60-second hang. That is the right
observation with the wrong conclusion, and the cause is measurable:

```js
document.querySelector('.cds--structured-list-thead input[type=checkbox]')
  .getBoundingClientRect()          // { width: 1, height: 1 }  <- position:absolute, hidden
document.querySelector('.cds--structured-list-thead label.cds--checkbox-label')
  .getBoundingClientRect()          // { width: 20, height: 20 } <- the real hit target
```

Carbon hides the real `<input>` at 1x1 px and draws the box with the `<label>`. Playwright's
`.check()` and `.click()` run an actionability wait against that 1x1 input, never satisfy it,
and block until the test timeout — the "60-second hang" and a 180s Playwright timeout are the
same phenomenon seen through different clocks.

**Click the label.** It is what a human clicks, it is trusted, and it toggles React state
immediately:

```ts
// WRONG — waits on a 1x1 hidden input until the test times out
await page.locator('.cds--structured-list-thead input[type="checkbox"]').first().check();

// RIGHT
await page.locator('.cds--structured-list-thead label.cds--checkbox-label').first().click();
```

This supersedes the "mark as BLOCKED" advice for checkbox interaction wherever a label is
rendered. Verified 2026-09-02 driving Lab Unit Management select-all over 37 rows.

### 6.2b — Assigned Tests and Display Order are StructuredLists, not `<table>`

Not every Carbon list is a table. Lab Unit Management's **Assigned Tests** and **Display
Order** screens render `cds--structured-list`, and `document.querySelector('table')` on them
returns `null`. A `table thead input[type=checkbox]` locator matches nothing and fails with a
bare "element(s) not found" that reads like a product bug.

| Container | Select-all | Rows |
| --- | --- | --- |
| `<table>` (lab unit LIST page) | `table thead input[type=checkbox]` | `table tbody tr` |
| StructuredList (Assigned Tests, Display Order) | `.cds--structured-list-thead ...` | `.cds--structured-list-tbody .cds--structured-list-row` |

Check which one you are on before writing the locator — `!!document.querySelector('table')`
answers it in one probe. Where the assertion is about a value rather than a row, prefer
`getByText(...)` so the container stops mattering at all.

### 6.2c — Danger buttons carry a hidden "danger" in their accessible name

Carbon prefixes `kind="danger"` buttons with visually-hidden text. The Reassign dialog's
commit button reads "Reassign 37 tests" on screen but its accessible name is:

```
danger Reassign 37 tests
```

So `getByRole('button', { name: /^Reassign \d+ tests?$/ })` never matches. **Do not anchor
`getByRole` name patterns with `^`** on any danger-kind button; anchor the end if you need
precision (`/Reassign \d+ tests?$/`). Confirmed on the Reassign Tests dialog 2026-09-02.

### 6.2d — Dialog selects populate after an async fetch

The Reassign dialog mounts with only its `Select destination...` placeholder and fills the lab
units in after a request returns. Reading options on the tick the modal opens gives a list of
one, which then fails an "options are offered" assertion in a way that looks like a product
defect. Poll before reading:

```ts
await expect
  .poll(async () => page.locator('select').last().locator('option').count(), { timeout: 15000 })
  .toBeGreaterThan(1);
```

`selectOption()` auto-waits for the option and does not need this; only direct reads of the
option list do.

### 6.2e — DatePicker duplicates its id onto the wrapper `<div>`

Carbon's DatePicker puts the SAME id on the wrapper and the field:

```
DIV.cds--form-item          id=order_receivedDate
INPUT.cds--date-picker__input  id=order_receivedDate
```

`locator('#order_receivedDate')` is therefore a strict-mode violation ("resolved to 2
elements"), and `.first()` picks the DIV — `inputValue()` then fails with "Node is not an
`<input>`". Scope the selector to the element type: `locator('input#order_receivedDate')`.
Note `document.querySelector('#id')` returns the DIV too, so a value read by hand in the
console can disagree with what the page shows unless you scope it the same way.

### 6.3 — React SPA Routing (Sidebar Navigation)

**CRITICAL:** Direct URL navigation for non-admin React pages may hit Spring Boot 404 because
the React SPA router hasn't initialized. Always navigate via the sidebar menu:

```
// WRONG — may get 404 or blank page
await navigate('https://example.com/PatientManagement');

// RIGHT — use sidebar navigation
await page.click('text=Patient');
await page.click('text=Add/Edit Patient');
```

Admin pages at `/MasterListsPage/*` routes generally work with direct URL navigation.

### 6.6 — Navigate before any helper reads `localStorage`

Helpers that read the CSRF token (`page.evaluate(() => localStorage.getItem('CSRF'))`) throw
if the page has never navigated:

```
SecurityError: Failed to read the 'localStorage' property from 'Window':
Access is denied for this document.
```

A `baseURL` in the config does NOT navigate anything — the page starts on `about:blank`, which
has no accessible storage and no origin for a relative `fetch()`. A spec whose first statement
calls an API helper fails before it touches the product, and the failure text names the
assertion rather than the cause: an entire suite reporting `Received: null` from a fixture
lookup is this, not missing data.

Every spec that uses an API helper needs a `beforeEach` that lands on a real origin first:

```ts
test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}${SOME_ROUTE}`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});
```

This accounted for 15 of the 20 failures on the first run of the 2026-09-02 suites.

### 6.4 — Dual Authentication Systems

The React SPA at `/login` and legacy JSP admin at `/OpenELIS-Global/LoginPage` maintain
separate sessions. Features behind legacy JSP auth (TestAdd, TestModifyEntry, FHIR) may
require a separate authentication flow. Cookie/session sharing between the two is unreliable.

### 6.5 — No bug filed against a 404 without live capture (MANDATORY)

OpenELIS Global uses a hybrid architecture:

- **Legacy JSP/Struts pages** at `/api/OpenELIS-Global/<PageName>`
- **React SPA REST calls** at `/rest/<endpoint>` — where the endpoint name often does NOT match the page name

Examples from the 2026-04-20 false-positive cluster (6 Jira tickets closed):
- Dictionary page → `/rest/DictionaryMenu` (not `/rest/dictionary`)
- Patient search → `/rest/patient-search-results` (not `/rest/patient`)
- Provider → JSP `/api/OpenELIS-Global/ProviderMenu` (no `/rest/provider`)
- LogbookResults filter → `?testSectionId=N` (not `?labUnit=N`)
- Reports → JSP `/api/OpenELIS-Global/ReportPrint` (not `/rest/report/*`)
- Organization → JSP `/api/OpenELIS-Global/Organization` (no `/rest/organizationSearch`)

**Rule.** Before filing a bug against a 404 on a REST endpoint, use `read_network_requests` to capture what the browser actually calls when a real user performs the action. If the captured path returns 200 but your guessed path returns 404, the bug is a false positive — file no ticket.

**Apply this rule to:** every BUG-* candidate whose only evidence is `GET /rest/X → 404`. The verification step is non-optional.

### 6.5a — Harness-enforced capture (Phase E2)

The §6.5 rule above was previously enforced by **discipline**. As of Phase E2 the harness enforces it. Use `helpers/networkCapture.ts`:

```typescript
import { captureAround, assertBugEvidence, assert404Observed } from '../../helpers/networkCapture';

test('Step X — verify Dictionary endpoint is reached', async ({ page }, testInfo) => {
  const { session } = await captureAround(page, async () => {
    await page.goto(`${BASE}/MasterListsPage/DictionaryMenu`);
    await page.waitForLoadState('networkidle');
  });

  // BEFORE filing a 404 bug against /rest/dictionary, prove the app
  // actually called that path. If it doesn't (likely — see the
  // 2026-04-20 cluster), this throws with a descriptive error and
  // saves the capture as evidence in .auth/captures/.
  assertBugEvidence(testInfo, session, '/rest/dictionary', 'BUG-51-candidate');

  // Then prove the call returned 404 (not 200/500/etc.)
  assert404Observed(session, '/rest/dictionary', 'BUG-51-candidate');
});
```

**What the helper does:**

- `startCapture(page)` and `captureAround(page, action)` attach Playwright `request`/`response` listeners, buffer the traffic, and return a `CaptureSession` with `.captures`, `.failed`, `.notFound` slices.
- `saveAsEvidence(testInfo, session, label)` writes the session to `.auth/captures/<label>-<timestamp>.json` AND attaches it to the Playwright test report. Auth/cookie headers are redacted automatically so the evidence file is safe to commit or paste into a Jira ticket.
- `assertBugEvidence(testInfo, session, claimedPath, bugLabel)` throws with a descriptive error if the app never called `claimedPath` during the capture window. The error message references the OGC-535/562/563/565/566/568 cluster precedent and points at the actual paths the app did call — so the next test iteration probes the right endpoint.

**Discipline → enforcement.** A test that tries to file a bug against `/rest/dictionary` without `assertBugEvidence` should be considered incomplete. CI should flag specs that mark a 404 as FAIL without first calling either `assertBugEvidence` or `assert404Observed`.

### 6.5b — Use captureAround when authoring NEW spec steps (v6.12)

The 2026-05-13 A1 pilot found 10 spec bugs in the chains and personas — every one of them was the spec author (me) inferring an endpoint shape from documents rather than from live capture. `patient-search-results` returns `{patientSearchResults}` not `{patientList}`. Patient ID is `patientID` not `patientPK`. LogbookResults filter is `?testUnitId=N` not `?testSectionId=N`. None of these would have shipped if the helper had been used at *authoring* time, not just at *bug-filing* time.

**Rule (v6.12):** before adding a new step to any chain or persona that calls a non-trivial endpoint, the author MUST first capture the equivalent action via the live UI (or via direct probe) and validate the response shape. Patterns:

```typescript
// Authoring pattern — probe before committing the spec
const { session } = await captureAround(page, async () => {
  await page.goto(`${BASE}/some-page`);
  await page.waitForLoadState('networkidle');
});
console.log(summarize(session));
// Inspect session.captures to find the actual endpoint + payload shape
// Update helpers/apiShapes.ts with the discovered keys
// Then write the spec step against the real shape
```

**Source of truth:** `helpers/apiShapes.ts` (added in v6.12) holds the live-validated response types and key constants. Every chain/persona spec that reads a REST response should import from there rather than typing keys inline. When a new endpoint is introduced or a shape changes, update `apiShapes.ts` in the same commit.

**Practical effect:** the next round of chain/persona corrections (post-pilot) and any future chain/persona additions should not re-inference any shape that isn't already validated in `apiShapes.ts`. If you find yourself typing a field name from memory, stop and run `captureAround` first.

---

## Section 7 — Error Handling

---

## Section 10 — Playwright Rules

When generating or updating Playwright test specs, follow these rules. (This line used to name
`openelis-e2e.spec.ts` as the place specs go; that file was quarantined to `archive/` in #94
because no config ran it. New module suites go in `tests/`, where `modules.config.ts` picks them
up automatically — see 12.9. **Read Section 12 before writing a spec.**)

### 10.1 — Navigation
- Use sidebar menu clicks for React SPA pages, NOT direct `page.goto()` URLs
- Admin `/MasterListsPage/*` routes are safe for direct navigation
- Always `await page.waitForSelector()` after navigation to confirm page loaded

### 10.2 — Carbon Component Interaction
- Carbon checkboxes: click `label.cds--checkbox-label`, never the 1x1 hidden input (the "60s hang" is an actionability wait — see 6.2a)
- Check whether a list is a `<table>` or a `cds--structured-list` before writing row locators (6.2b)
- Never anchor a `getByRole` name with `^` on a danger button — the accessible name starts with a hidden "danger" (6.2c)
- Scope duplicated ids to the element type: `input#order_receivedDate` (6.2e)
- Navigate before any helper reads `localStorage` (6.6)
- Use native setter pattern for React-controlled inputs (see Section 6.1)
- For visible UI updates (e.g., char counters), prefer `computer.type()` over native setter
- Use `page.evaluate()` for DOM manipulation when Playwright actions don't trigger React

### 10.3 — Performance Testing
```typescript
// Collect performance metrics via Performance API
const metrics = await page.evaluate(() => {
  const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  return {
    ttfb: Math.round(perf.responseStart - perf.requestStart),
    domNodes: document.getElementsByTagName('*').length,
    resources: performance.getEntriesByType('resource').length,
    jsHeapMB: Math.round((performance as any).memory?.usedJSHeapSize / 1024 / 1024),
  };
});
```

### 10.4 — Error Handling Tests
```typescript
// Native setter for React inputs (used in error handling tests)
await page.evaluate(() => {
  const input = document.querySelector('input[placeholder="Enter Patient Id"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, '9999999');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
```

### 10.5 — Test Data
- Use existing data (patient Abby Sebby ID 0123456, accession 26CPHL00008, Test Analyzer Alpha)
- Avoid creating new tests (BUG-1) or clicking Carbon checkboxes (BUG-2 EXT)
- User creation is NOT blocked: "BUG-3 UserCreate 500" was a client payload defect, corrected
  2026-07-30. Use `buildUserCreateBody()` / `userCreateSucceeded()` from `helpers/apiShapes.ts`
  (§v6.22). Blank `loginUserId`/`systemUserId` mean "new" — sending `'0'` is what produced the 500 —
  and both success and validation-failure return HTTP 200, so discriminate on the `forward` body.
- Use `QA_AUTO_` prefix for any data you must create

### 10.6 — Async Results in javascript_tool
When `await` is not supported in Claude in Chrome's `javascript_tool`, use the
`window.__variable` pattern for async results:
```javascript
(async () => {
  const response = await fetch('/api/endpoint');
  window.__result = await response.json();
})();
// Then read window.__result in a subsequent call
```

### 10.7 — Cookie/Query String Blocking
Claude in Chrome may block `fetch()` results that contain session cookies in the response.
If fetch results are blocked, use DOM inspection (`document.querySelector`) or
`page.evaluate()` as alternatives to read page data.

### 10.8 — Inventory API Payload Field Names (Critical)
The `/rest/inventory/items` POST/PUT endpoint requires **exact** field names from `InventoryItemForm.jsx sanitizedData`:
- `name` (string, required)
- `itemType` (string: "REAGENT"|"CARTRIDGE"|"RDT", required)
- `category` (string)
- `manufacturer` (string)
- `units` (string — NOT `unitOfMeasure`)
- `lowStockThreshold` (number)
- `stabilityAfterOpening` (number, REAGENT only)
- `storageRequirements` (string, REAGENT only)
- `compatibleAnalyzers` (string, CARTRIDGE only)
- `testsPerKit` (number, RDT only)

Wrong field names → HTTP 400 `HttpMessageNotReadableException`. Do NOT include `active`, `description`, or any other fields.

**Lot creation** uses `POST /rest/inventory/management/receive` with:
`{inventoryItem:{id}, lotNumber, currentQuantity, initialQuantity, expirationDate(ISO), receiptDate(ISO), storageLocation(null OK), qcStatus:"PENDING", status:"ACTIVE"}`

**Storage location creation** (`POST /rest/inventory-storage-locations`) → HTTP 500 (BUG-40). Use null for storageLocation when creating lots.

### 10.9 — Connection Pool Exhaustion Prevention (Critical)
Chrome allows max 6 simultaneous connections per origin. When testing endpoints that may hang:
1. **Never** open more than 3 tabs to the same origin simultaneously
2. **Monitor** `/read_network_requests` for pending status
3. **Close hanging tabs immediately** if a POST stays "pending" beyond 30s — use `tabs_close_mcp`
4. **Test from the app page**, not API-direct tabs, for POST requests (app page has session context)
5. **BUG-38 endpoint** (`/rest/reportnonconformingevent`) must NOT be tested — it hangs permanently

If all API calls from all tabs start hanging, connection pool is exhausted:
- Close ALL tabs with pending requests
- Wait 5s for connections to reset
- Reopen needed tabs fresh

---

## Step 4 — Cleanup


---

## Section 9 — Interactive runs (Claude in Chrome)

### 9.1 — Evidence screenshots when the control and its button are far apart
A disabled Save at the bottom of a 44-row table proves nothing without the selection at the top in
the same frame. Zoom the page out, position both, capture, then restore:

```js
document.documentElement.style.zoom = '0.38';   // fit ~1600px of page into the viewport
// scroll so both the edited row and the button are on screen, screenshot, then:
document.documentElement.style.zoom = '';
```
Follow the wide shot with `computer.zoom` crops of each region so the detail is legible. Pair it
with **written repro steps** so the user can confirm by hand — an automated click is weaker
evidence than the user reproducing it themselves, and their confirmation is the strongest
revalidation available.

### 9.2 — Sanitize values returned from `javascript_tool`
Returning raw page state can trip the client's data guard and you lose the whole result
(`[BLOCKED: Cookie/query string data]`). Strip long hex strings and URLs before returning, and
return summaries rather than dumps:

```js
const clean = s => (s||'').replace(/\s+/g,' ').replace(/[0-9a-f]{8,}/gi,'#').replace(/https?:\/\/\S+/g,'#');
```
Also avoid `return` at the top level (REPL semantics — the last expression is the value), and don't
`await` long sleeps across a navigation: the target detaches and the call errors.

### 9.3 — Capture the server's reason behind a generic UI error
When the banner says only "Failed to save", hook `fetch`, re-trigger, and read the body:

```js
const cap=[]; const of=window.fetch;
window.fetch=async function(...a){ const init=a[1]||{}; const m=init.method||'GET';
  const r=await of.apply(this,a);
  if(m!=='GET') cap.push({m, url:(typeof a[0]==='string'?a[0]:a[0].url), status:r.status,
                          resp:(await r.clone().text()).slice(0,400)});
  return r; };
```
Restore `window.fetch` afterwards. The same hook proves a **negative**: if a "Test connection"
button issues no request at all, that is a client-side fact independent of whether the far end is
reachable — though see `spec-delta-run.md` Step D on deferring when the far end is unverified.

### 9.4 — Session timeout mid-run
Long interactive runs will hit the session timeout. Symptoms: a bounce to `/login`, sometimes with a
raw `System Error: Unexpected token '<', "<!DOCTYPE "… is not valid JSON` dialog. Dismiss it, log in
via `loginName`/`password` with the native-setter pattern, navigate back, and re-verify state before
continuing — in-page widget state may survive but any React form state will not.
---

## Section 12 — Oracle design: what makes a test able to fail (OGC-1192 post-mortem)

Added 2026-09-03 after OGC-1192 — "environmental orders are invisible to every dashboard once
saved" — reached production despite the repo carrying a dedicated environmental chain. The bug
was not missed for lack of coverage. It was missed because the coverage **could not fail**.
Read this section before writing any new chain step.

### 12.1 — `markStep` is no longer a logger (BEHAVIOUR CHANGE)

Until 2026-09-03 the entire body of `markStep()` was a `console.log`. `FAIL`, `GAP` and
`BLOCKED` were decorative. That meant this extremely common shape was a **green test**:

```ts
if (!post.ok) {
  markStep('N', 4, 'GAP', `create returned HTTP ${post.status}`);
  return;                       // <- test ends here, reported as PASSED
}
```

Chain N Step 4 sat in exactly that shape for months. Its create POST returned 400 on every
run because the hand-written payload omitted the requester, so the chain's only write path
never executed once — and the chain reported healthy the whole time.

`markStep` now has consequences:

| status | effect |
| --- | --- |
| `FAIL` | fails the test immediately, description becomes the assertion message |
| `GAP` / `BLOCKED` | **declared** in `known-gaps.ts` -> skips, with reason + ticket attached. **Undeclared** -> skips today, and FAILS under `GAPS_STRICT=1` (set by the nightly job). See 12.6. |
| `PASS` / `PARTIAL` | logged only, as before |

Callers no longer need a follow-up `expect()` after `markStep(..., 'FAIL', ...)`, and any
`return` after a GAP/BLOCKED is now unreachable (harmless — leave or delete).

FAIL always fails. GAP/BLOCKED routing is governed by the declared-gap register — see 12.6.

**The rule this encodes:** `GAP` means *this build genuinely does not have the feature under
test*. It does not mean *the call failed and I would rather not deal with it*. A 4xx from an
endpoint that exists is a FAIL. If you find yourself reaching for GAP to get past a failing
assertion, you are writing the next OGC-1192.

### 12.2 — "The page rendered" is not an oracle

`app-route-census` visits `/order/environmental` and asserts: didn't bounce to login, painted
some chrome, no error-text markers, no uncaught page errors, no 5xx. An environmental
dashboard reading **"No orders found — 0–0 of 0 items"** passes all five, because it paints a
heading and a table.

Route censuses are cheap smoke tests and worth keeping, but they answer *did this route
render*, never *did it render the right thing*. Do not count a census as coverage of a
screen's data. Before OGC-1192, `grep -rn "order/dashboard"` returned **zero** hits across the
whole repo — no test in any domain had ever asserted what a dashboard contains.

### 12.3 — Every write path needs a round-trip, and the round-trip needs a landing check

A create that is never read back is not tested. Chain N now: generates an accession →
POSTs the verified payload → reads the sample back → asserts it appears on the dashboard
(Step 6). Three separate failure surfaces, each with its own message.

When writing a create step, ask what would happen if the POST silently did nothing. If the
answer is "the test still passes", the step is decorative.

### 12.4 — Capture payloads, do not compose them

Chain N's old payload carried its own confession: *"the full payload wasn't captured
byte-for-byte (output filter), so a body-shape rejection is recorded as GAP."* A guessed
payload plus a self-excusing error branch is indistinguishable from no test at all.

The working method (see the header of `tests/chains/env-order-payload.ts`):

1. Drive the real UI to a successful save with `window.fetch` patched to record the outgoing
   request body verbatim.
2. Replay the captured body with a fresh identifier. If it does not 200, it was tied to
   one-shot form state — fix that before proceeding.
3. Bisect: delete key groups, re-post each variant, and record what the server actually
   requires. This both shrinks the fixture and documents the contract.

For the environmental order this took 6574 bytes down to 3177 and surfaced two facts no amount
of reading the frontend would have given: `rememberSiteAndRequester` is **required** (omitting
that one boolean yields a 500, not a 400), and the ~45 empty-string/empty-array keys in
`sampleOrderItems` are load-bearing for the binder.

### 12.5 — Controls are what make a bug assertion mean anything

`SampleEdit` returning 500 for a patientless sample only means something next to the two
controls: a nonexistent accession returns `200 + noSampleFound: true`, and a sample with a
patient returns `200 + payload`. Those controls are permanent truths in the OGC-1192 suite,
not flip-when-fixed cases — and the suite says so, because if a control breaks, the bug
assertion beside it proves nothing.

Pair every "this is broken" assertion with the measurement that isolates the variable.

---

### 12.6 — Declared gaps: fail-by-default with an auditable escape

`tests/chains/known-gaps.ts` is the register. A step may only excuse itself if
the excuse was written down in advance, with a reason, a ticket where one
exists, and a `retireWhen` condition saying what would let the entry be deleted.

```
markStep(chain, n, 'GAP', …)
        |
        |-- key "<chain>:<n>" in DECLARED_GAPS  -> skip, reason + ticket shown
        `-- not declared                        -> FAIL (under GAPS_STRICT=1)
```

**Why a register and not a runtime decision.** The whole OGC-1192 failure was a
step deciding, inside a catch block, that a 400 it did not like was a "gap". A
gap you have to type into a file is one a reviewer can argue with. A gap decided
at runtime is one nobody ever sees.

**What belongs in it:** this build genuinely lacks the feature — an older
instance without the environmental domain, a module not deployed, a feature
behind an off flag.

**What does not:** a 4xx or 5xx from an endpoint that exists; a selector that
stopped matching; a payload the server rejected; data that was not seeded. Those
are failures. Declaring them to get a green run is the old escape hatch wearing
a new hat.

**Why strict mode is opt-in for now.** You cannot honestly declare gaps you have
never watched fire, and this repo had no unattended runs at all before
2026-09-03 — so there is no evidence base to populate the register from. The
nightly job sets `GAPS_STRICT=1` and is non-blocking, which makes it the safe
place to learn the true list. Read a couple of weeks of its "Undeclared gap"
failures, declare the legitimate ones, then flip the default on and make the PR
gate strict too. Populating the register by guesswork first would recreate the
original problem: excuses written by someone who never saw the step run.

### 12.10 — `describe.serial` turns one FAIL into a silent chain amputation

Found 2026-09-05 while fixing the very steps added to catch OGC-1192.

Every chain is a `test.describe.serial`. In serial mode a failing test causes Playwright to
**skip every later test in the group**. That is usually what you want — step 4 is meaningless if
step 2 never seeded anything. It is a trap when an early step asserts something that later steps
do not actually depend on.

Chain N had exactly that. Step 1 required four populated environmental dictionaries and failed
otherwise. On `testing` v3.2.2.0, `sampling-sites` and `sample-types` are populated but
`collection-methods`, `env-weather` and `sample-containers` are empty (OGC-1192 §4) — so Step 1
failed, and Steps 4 and 6, *the regression watches written for OGC-1192*, never ran once. The
chain reported a legitimate finding and amputated its own reason for existing. Step 3 had the
same shape: its GAP branch becomes a FAIL under `GAPS_STRICT=1`, with the same effect.

**The rule:** in a serial chain, an early step may only FAIL on a precondition later steps
genuinely need. Anything else is recorded and asserted at the END of the chain.

Chain N now does this:

- Step 1 fails only if `sampling-sites` **or** `sample-types` is empty — order entry is then
  impossible and nothing downstream can run.
- Step 3 fails only if there are no sample types at all.
- Both record their shortfall in module state and report `PARTIAL`.
- **Step 7**, last, asserts full dictionary and manifest population. The finding still fails the
  chain; it just no longer takes Steps 4-6 with it.

When you add a step to a serial chain, ask: *if this fails, which later steps become
meaningless?* If the answer is "none", it belongs at the end.

#### The 2026-09-05 audit across all 26 chains

Measured from nightly run `33901256497` (GAPS_STRICT=1, ORDER_PATH set): **21 chains failed and
65 later steps never ran.** Per-chain, steps lost to an early failure:

| Lost | Chains |
|---|---|
| 6 | A, N |
| 5 | B, D, F |
| 4 | C, E, G, J, M |
| 3 | L, S, Z |
| 2 | AB, K, O, T, U |
| 0 | H, I, P, Q, R, W, X, Y |

**Amputation is not always wrong.** Three distinct cases came out of the audit, and only the
first is a defect:

1. **The early step is a leaf finding — nothing downstream reads it.**

   **Chain A**: fixed by dropping `.serial`. Step 2's BUG-37 linkage check was taking Steps 3-8
   — the whole result → validate → report → FHIR spine — with it, and nothing downstream reads
   anything Step 2 sets. Every step from 2 on already guards its own precondition
   (`if (!order) test.skip()`, plus Step 6 on `order.pdf` and Step 8 on `order.fhir`), and the
   config runs `workers: 1` / `fullyParallel: false`, so declaration order is still execution
   order. The only change is that one failing step no longer cancels the rest.

   **Dropping `.serial` is the preferred fix when every later step guards itself.** The first
   attempt here split Step 2 into a measurement step plus a verdict step at the end — and the
   assertion gate caught it, correctly: the measurement step no longer asserted anything, which
   is precisely the shape `lint:assert` exists to reject. Splitting is the fallback for when a
   step's finding really must be asserted after later work has run (**Chain N** Step 7, above);
   reach for de-serialising first.

2. **The chain is genuinely linear.** **Chain C** needs `rule` and `triggerValue` from Step 2 for
   everything after it; **Chain D** is linear on `testAccession` from Step 2. Nothing to reorder —
   a Step 2 failure legitimately ends both. Left alone deliberately.

3. **Step 1 is a real hard precondition that the whole chain rests on.** **F** (`eqaEnabled` is
   false), **G** (Cold Storage endpoint 404), **J** (`AuditTrail` 404), **L** (empty test
   catalog), **M** (worklist contract changed). These chains are correctly reporting that their
   subject is unavailable. Left alone.

**Chain Z** was a fourth, smaller case: Step 5 (sub-resource wiring) is independent of the
destructive create/update/archive and carries its own `createdId ?? seedId ?? 1` fallback, but sat
last and was lost every time the create failed. Its `test()` declaration now runs after Step 1
while keeping its step *number*, so report keys stay stable.

**One latent defect fell out of the audit.** Chain C Step 4 guarded `if (!order)` but compared
against `triggerValue`, which Step 2 sets. A null `triggerValue` reached the comparison and
reported *"Entered result not found in read-back"* — blaming the write instead of the missing
rule. Now guarded on both.

**Guard style is inconsistent and worth a follow-up.** Chains A-E use `if (!order) test.skip()`,
which protects against null state but produces a silent skip. Chain Z uses
`markStep(..., 'GAP', 'Skipped — …'); return;`, which keeps the step visible in the report with
its reason. Z's pattern is the better one; adopting it chain-wide would make "did not run"
legible instead of absent.

### 12.11 — Read the failure *causes* before triaging a first sweep

The first module sweep (2026-09-05, 6 shards, `PW_RETRIES=0`) came back **493 passed,
364 failed, 14 skipped** across 866 tests — a 42% failure rate. Longest shard 69 min against
a 300-min cap, so 6 shards is the right count.

But 42% badly overstates the product signal, and the shape of the failures says so:

| Error | Count |
|---|---|
| `locator.click: Test timeout` | 42 |
| **`Login failed: still on login page`** | **38** |
| `page.fill: Test timeout` | 36 |
| `expect(received).toBe(expected)` | 33 |
| `expect(locator).toBeVisible() failed` | 18 |

Roughly **140 of the 364 were self-inflicted**. All 46 adopted suites call `login()` themselves
— `tests/system-misc.spec.ts` alone has 18 `beforeEach` login blocks — even though
`modules.config.ts` already hands every test an authenticated `storageState`. Six parallel
shards doing several hundred redundant full UI logins against one instance trips over itself,
and the timeouts cascade from there.

Fixed by giving `login()` a cookie-only fast path (`hasSession()` in
`helpers/test-helpers.ts`, mirrored in the four `gap-suites-*` files, which each define their
own local `login`). It deliberately does not navigate — a navigation per test is most of the
cost being removed — and a stale cookie passing the check is fine, because the mid-run re-auth
guard in `tests/helpers/api-json.ts` is what handles a session lapsing partway through.

**The lesson generalises.** Before triaging a first run of anything, group the failures by cause
and ask which are the harness failing rather than the product. A count of red tests is not a
count of bugs. Here the single most common "failure" was the suite logging in too often.

**And a second one, found the same way.** All four `gap-suites-*` files hardcoded
`const BASE = 'https://www.jdhealthsolutions-openelis.com'` — a different instance from the one
every config and the nightly target use, not overridable by env. 131 tests had been pointed at
the wrong server. Nothing surfaced it because those files were unreachable by any config until
#96; being orphaned hid a second defect underneath the first. They now read `BASE`/`BASE_URL`
with the same default as the rest of the repo.

#### The fix regressed, and the second run caught it

Worth reading as a worked example of measuring instead of assuming.

The first version of the fast path returned immediately when a session cookie was present — no
navigation. The next sweep traded the login failures for a different error, one-for-one:

| | run 1 | run 2 |
|---|---|---|
| `Login failed: still on login page` | **76** | **0** |
| `SecurityError: Failed to read the 'localStorage' property` | **0** | **61** |

The login noise really was gone. But the unconditional `page.goto()` that the old `login()` did
was *also* the thing getting the page off `about:blank`, and every helper that reads the CSRF
token out of `localStorage` depends on that — **§6.6, in this same document**. Skipping the form
is the win; skipping the navigation is a regression, and net failures went UP.

The fast path now still navigates (to `BASE`, only when the page is not already on it) and only
the credential submission is skipped. The general point: when you remove a step, ask what else
that step was incidentally providing. A `goto` in a login helper is doing two jobs.

**Artifacts:** the same run produced >520 MB, because `test-results/` carries Playwright traces.
That also made `gh run download` slow enough to time out repeatedly. The modules job now uploads
`nightly-out/` only; re-run a single spec locally when you need a trace.

### 12.12 — Sweep tuning, and two fixture bugs the third sweep exposed

Third module sweep (2026-09-05, 6 shards, retries 0, login fast path fixed):
**544 passed / 308 failed / 19 skipped**, against run 1's 493 / 364 / 14 — and
**zero** of both harness error classes (`Login failed` 76 -> 0,
`SecurityError` 61 -> 0).

**Per-test timeout is 30 seconds, and that is a policy.** Casey's rule: *if it
takes longer than 30 seconds, it is a defect anyway.* A click that has not
landed in 30s is a finding; waiting another minute to confirm it buys nothing
and costs the whole run. Shard 6 alone had ~50 click timeouts at the old 90s
default — roughly 75 minutes of pure waiting, which was most of its 91-minute
wall clock. Override with `PW_TIMEOUT` only to investigate a specific slow
path, never in CI.

**gap-suites have their own config and job.** Playwright shards by FILE, so the
four `gap-suites-*` files (131 tests) always landed in one shard and made it
the long pole — 91 minutes against 14-49 for the others. No shard count fixes
that; four files cannot spread across more than four shards. They now run from
`gap-suites.config.ts` in a separate nightly job.

Their own history is worth keeping straight: unreachable by any config until
#96, pointed at `jdhealthsolutions-openelis.com` until #101. Repointed at the
real target they went from ~all failing to **70 of 131 passing**. The 61 that
still fail are dominated by click timeouts — selector drift against a
deployment they were never written for. A cleanup backlog, not a bug list.

#### National IDs cannot contain underscores

The server validates `nationalId` against `(?i)^[-a-z0-9/]*$`. `QA_PREFIX` is
`QA_AUTO_MMDD`, so **every test that filled `#nationalId` with it was failing
validation before reaching the behaviour under test** — 11 fills in
`order-creation-e2e` alone, plus TC-PAT-05's hardcoded `QA_PAT_0324`.

Verified by hand on testing 2026-09-05: `QA_PAT_0905` -> `400 {"error":
"nationalId: must match ..."}`; `qa-pat-0905` -> `200 {"patientId":"502",
"status":"success"}`. **Patient creation is not broken.** Use `QA_ID_PREFIX`
(hyphenated, lowercased) for nationalId and anything else the server
pattern-checks; keep `QA_PREFIX` for names, orgs and catalog entries, where
underscores are fine and already-seeded `QA_AUTO_` data must stay findable.

#### An SPA returns 200 for every path, so "did it load" is not a check

TC-PAT-05 tried `/AddPatient`, `/PatientEdit` and `/SamplePatientEntry`, taking
the first that returned 200. All three return 200 — OpenELIS serves the SPA
shell for any path — so the test proceeded on a page that rendered nothing.
The real screen is `/PatientManagement` (Add Or Modify Patient) with a **New
Patient** tab routing to `/PatientManagement/new`, and `#nationalId` exists
only there. That single wrong assumption also produced the run's 10
`Element not found: #nationalId` failures.

**Assert on a rendered element, never on a status code, when the target is an
SPA.** The corrected test waits for `#nationalId` to be visible and skips with
a named reason if it is not.
### 12.13 — `page.locator()` is never falsy, and that cost 42 timeouts a run

The single largest error class in every module sweep was
`locator.click: Test timeout exceeded` — 42 in run 1, 34 in shard 6 alone. One
bug in a shared helper produced most of them:

```ts
const adminItem = await page.locator('a, button, span')
  .filter({ hasText: itemName }).first();

if (adminItem) {                 // <- ALWAYS true
  await adminItem.click();       // <- waits the full timeout, then throws
} else {
  throw new Error(`Admin item "${itemName}" not found in sidebar`);   // dead code
}
```

**`page.locator()` returns a Locator object whether or not anything matches.**
It is a query, not a result — it is never falsy. So the guard always passed,
the `else` was unreachable, and a missing sidebar item spent the entire timeout
inside `.click()` before failing with a message that named the timeout instead
of the missing item. The helpful error the helper was written to throw had
never once been printed.

At the old 90s timeout each of these cost a minute and a half of run time for
no information. That is why the timeout policy (12.12) and this fix belong
together: one makes the failures cheap, the other makes them legible.

**The fix, and the pattern to use:**

```ts
const adminItem = page.locator(...).first();      // no await — it is a query
const present = await adminItem.isVisible({ timeout: 5_000 }).catch(() => false);
if (!present) throw new Error(`... not found ...`);
await adminItem.click();
```

Nine more instances of the same shape were found and fixed in
`tests/admin-config.spec.ts` and `gap-suites-AQ-AX.spec.ts` (`if (chevron)`,
`if (batchItem)`, `if (adminItem)`).

**Grep for it before trusting any suite:** `const X = await page.locator(...)`
followed by `if (X)`. The `await` is the tell — awaiting a locator gives you the
locator, not a match. Anything that reads like an existence check on a raw
locator is not one.

### 12.9 — A spec no config runs is not coverage

Added 2026-09-04, after the audit that followed OGC-1192.

Quarantining `openelis-e2e.spec.ts` in #94 was the right call for the wrong
reason: it was treated as one dead file. It was not. Asking Playwright itself
which files each config resolves — `playwright test --config X --list`, not
static parsing, because several configs build `testMatch` dynamically — showed
**46 spec files, 866 tests, unreachable by any config**. That was the bulk of
the module coverage: order-entry, validation, patient-management, reports,
workplan, dashboard, pathology, inventory, referral-workflow, reflex-testing,
session-security, storage, non-conforming, fhir-integration, i18n,
accessibility, performance, eqa, plus the four root `gap-suites-*` files.

They looked like coverage in a directory listing and executed never.

Two changes:

- **`modules.config.ts`** adopts them. It sweeps `tests/*.spec.ts` by
  EXCLUSION — everything except the files another config owns — so a newly
  added module suite is picked up with no edit. An include list would rot into
  the same bug.
- **`scripts/check-orphans.mjs`** is the gate, blocking on PR. It also reports
  files reachable from more than one config; that is not an error (deliberate
  tiering, e.g. `guards` and `all-tc` sharing a spec) but it is worth seeing.

The sweep runs weekly rather than nightly (866 tests), as a **shard matrix** —
parallel jobs, each `workers=1`. Sharding only shortens wall-clock when the
shards are separate jobs; N `--shard` invocations in a loop inside one job do
the same total work in the same time. That mistake was made and corrected in
#96 before merge; if you touch the workflow, keep the matrix.

**Sizing it (measured 2026-09-04).** These suites are UI-driven and full of
fixed `waitForTimeout` sleeps, so they are far slower per test than the chains
(131 tests in 8.7 min). The first sweep — 4 shards, `retries: 1` — had not
finished a single shard after 65 minutes and was killed by the 120-minute cap.
Two levers, in order of effect:

1. **Retries.** The nightly now sets `PW_RETRIES=0`. Retries absorb flake; in a
   suite that has never run, the failures are not flake, they are the point —
   and retrying each one doubles its cost for no information. Raise it again
   once the sweep has a stable baseline.
2. **Shard count**, raised 4 → 6. Six parallel runners at `workers: 1` sits **at**
   the 6-connection limit in §10.9, not over it. Do not raise it further without
   re-reading that section and watching the instance for strain.

Job timeout is 300 minutes. A long weekly job is acceptable; a job killed
before it reports is not.

**Cautionary note for whoever reads the first module-sweep results.** These
suites have not run in a long time and were never gated, so expect a large
fraction to fail on first contact. That is information, not a regression. Also
note that seven of them had 35 self-reported verdicts converted into real
assertions in #94 — that work was done while the files were still unreachable,
so its first real execution is also its first verification.

### 12.7 — The gates, and what each one is for

Added with the OGC-1192 remediation. Fail-by-default: anything not demonstrably
green should be visible as not-green.

| Gate | Command | Blocking? | Catches |
|---|---|---|---|
| orphan gate | `npm run check:orphans` | **yes**, on PR | a spec file no config can run |
| assertion gate | `npm run lint:assert` | **yes**, on PR | a new test that asserts nothing; any focused test |
| nightly run | `.github/workflows/nightly.yml` | no (reported) | the suites actually breaking against a live instance |
| `markStep` semantics | built in (12.1) | **yes**, at runtime | a step self-excusing past a failure |
| declared gaps | `GAPS_STRICT=1` (12.6) | nightly only, for now | an *undeclared* gap — an excuse nobody reviewed |

**The assertion gate is a baseline, not a switch.** The 2026-09-03 scan found
**296** pre-existing assertion-free tests across 111 files. Quarantining the
legacy `openelis-e2e.spec.ts` (93 of them — and no config ran it) plus
converting 35 self-reported verdicts into real assertions brought that to
**188 across 109 files**. Turning the rule on hard even so would make `main`
unmergeable, and a gate people route around is worth less than no gate. So
`.assert-baseline.json` records the backlog per file, and CI fails only when a
file's count goes **up** or a new file appears. Fix a file, run
`npm run lint:baseline`, commit the smaller number.

Do not raise the baseline to make a build pass. That is the same move as
reaching for GAP, one level up.

**Why the nightly run is non-blocking.** It runs against a shared instance whose
data and uptime we do not control, so a red run is a signal to read rather than
a build to break. The risk is that a permanently-red non-blocking job becomes
wallpaper — so promote a suite to blocking once it has been stable for a couple
of weeks, and treat a climbing **skipped** count as a failure signal in its own
right. Skipped is not passed; a step that skipped did not run.

### 12.8 — Shapes that pass while proving nothing (the 2026-09-03 census)

Search for these before trusting any suite. Counts are from the scan that
followed OGC-1192.

| Shape | Count | Why it passes |
|---|---|---|
| test block with zero `expect()` | 296 -> **188** | nothing can fail |
| `console.log(ok ? 'TC-X: PASS' : 'TC-X: FAIL')` | 36 -> **1** | a self-reported verdict is not an assertion — and it prints "FAIL" while the runner says green |
| `console.log('SKIP: …'); return;` | 57 | early return with no skip marker; shows as a pass, not even amber |
| `.catch(() => false)` | 1119 | turns "this errored" into "this is absent", which then feeds a conditional that quietly does nothing |

The first is gated and shrinking. The second is effectively gone — the single
survivor is a seed script, not a test. The last two are open work: when you
touch a file containing either, fix what you touch.

**On the 1119 catch-swallowers**: not all are wrong. `.catch(() => false)` on a
visibility probe is idiomatic. It is wrong when the thing swallowed IS the thing
under test — an API call whose status is the assertion, a navigation whose
success is the claim. Judge them one at a time; a blanket rewrite would break
the legitimate majority.

## Section 11 — PR #3987 findings (live-validated 2026-08-06, testing v3.2.1.11)

Authored while regression-testing DIGI-UW/OpenELIS-Global-2#3987. Everything here
was confirmed by live capture per §6.5b — the shapes live in `helpers/apiShapes.ts`
under the `PR #3987` banner; this section records the *operational* traps.

### 11.1 — Order seeding: the upstream helper's defaults 500 off dev

`frontend/playwright/helpers/seed-tat-data.ts` (`createSampleOrder`) defaults
`providerPersonId: "9000002"`, `referringSiteId: "9000100"` and `programId: "2"`.
Those are **dev.docker-compose fixture ids**. On testing.openelis-global.org they
don't exist and `POST /rest/SamplePatientEntry` answers a bare

```
500 {"timestamp":…,"status":500,"error":"Internal Server Error"}
```

with **no field diagnostic** — easy to misread as "order entry is broken". Sending
**empty strings** for all three succeeds (200 + generated accession). Any spec that
seeds an order off dev must clear them; consider fixing the helper upstream.

### 11.2 — Multi-specimen orders (the fixture items 4/6/12 need)

Put **one `<sample sampleID='..' tests='..'/>` element per specimen** inside
`<samples>` in `sampleXML`. That yields one analysis per specimen on the SAME
accession. Without it you cannot tell item 4 fixed from broken — a single-specimen
order reads `Name(Specimen)` either way.

Accession generation first: `GET /rest/SampleEntryGenerateScanProvider` → the labNo
is in `JSON.parse(body).body`.

### 11.3 — FHIR base path is resolved

`/api/OpenELIS-Global/fhir` answers `application/fhir+json` and accepts that Accept
header. Bare `/fhir`, `/fhir/R4` and `/fhir/metadata` all return the SPA HTML shell
with **status 200** — so a naive "did it 200?" probe passes against HTML. Check the
content-type, and prefer `FHIR_BASE` from `apiShapes.ts` over re-probing.

**The transform runs at PERSIST.** Terminology configured *after* an order was
placed never appears on that order's resources. Always: configure → then order.

### 11.4 — Range coverage: three assertion traps

1. `AgeInterval.toAge` for an open tail is the JSON **string** `"Infinity"`.
   `expect(toAge).toBe(Infinity)` fails. Use `toAgeAsNumber()`.
2. An open-ended range is expressed by **omitting `maxAge`** (send `null`), and it
   is absent from the read-back DTO. `maxAge: 999` is a finite bound that
   legitimately leaves a `[999, Infinity)` tail gap — this fabricates a "coverage
   bug" in your own fixture.
3. `statusFor()` reports **`GAP` when gaps exist even if overlaps also exist**. To
   assert `OVERLAP`, the widest range must be open-ended.

Also: `componentId` / `sampleTypeId` are **omitted** when null — assert
`toBeUndefined()`, not `toBeNull()`.

### 11.5 — The two gates on `POST …/activate` fire in a fixed order

*Completeness* (hard, `422` + `{complete,missing,messages}`) is evaluated **before**
*coverage* (soft, `409` + coverage report). A test with no primary result component
answers `422 NO_PRIMARY_RESULT_TYPE` and you can never reach the coverage 409 on it.
A coverage-gate fixture must therefore be an otherwise-COMPLETE test.

### 11.6 — Patient name/nationalId regexes (correction)

The §PATIENT_NAME_REGEX_PROPERTY note says names allow "No uppercase". On testing
v3.2.1.11 **uppercase is accepted** (`lastName: "QaAuto"` → 200). What is confirmed
rejected in name fields is **digits and underscores**:

```
"QaAuto"      -> 200
"QaAuto0806"  -> 400 invalid name format, possibly illegal character
"QA_AUTO_0806"-> 400
```

So the skill's `QA_AUTO_<MMDD>` prefix still cannot go in a patient name — use an
alphabetic marker and carry the run id in `nationalId`/`subjectNumber`. Read
`LAST_NAME_REGEX` per instance; deployments localise it.

### 11.7 — `fetch()` result blocking in `javascript_tool` (recurrence of §10.7)

Returning response **bodies** from a multi-URL probe loop tripped
`[BLOCKED: Cookie/query string data]` and lost the whole call's output. Returning
only **statuses and content-type booleans** worked. When probing several endpoints
at once, project the response down to primitives inside the page and assemble the
narrative outside.

### 11.8 — Which dialog is which (item 10 scope trap)

`div.id-documents-section` renders its own modals, **including one also headed
"Select Patient Photo"**. The PR only portaled `PatientImageSelector`'s two dialogs
(`Select Patient Photo`, `View Photo`). Filter out the `id-documents-section`
subtree by ancestor, not by heading text, or the assertion grades the wrong dialogs
and reports a false FAIL.

Reading a component's own `disabled` prop (as distinct from an ancestor
`fieldset[disabled]`) is worth doing before grading any view-mode behaviour — walk
`__reactFiber$` up to the named component and read `memoizedProps.disabled`. On Add
Order the fieldset is disabled while the selector's prop is `false`, and those two
facts grade differently.
