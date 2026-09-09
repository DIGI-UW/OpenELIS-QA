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


### 12.14 — Two defect classes that `typecheck:all` had been reporting all along

Added 2026-09-06, after sweep 4.

`tsconfig.all.json` is not the blocking gate — `tsconfig.json` is, and it lists
only the files that compile clean. That ratchet is the right design, but it
made it easy to wave off `npm run typecheck:all` as "a backlog". Two of its
error codes are not style debt. They are runtime defects with a compiler
already pointing at them.

**TS2304 on a FUNCTION name is a guaranteed `ReferenceError`.** Not a missing
type import — a missing *value*. `tests/system-misc.spec.ts` and
`tests/non-conforming.spec.ts` called `navigateViaMenu`, `tryNavigateToURL`,
`selectSampleType` and `getFutureDate` without ever defining or importing them.
When `openelis-e2e.spec.ts` was split into per-module specs, every other file
got a copy-pasted local copy of these helpers; those two got the call sites
alone. Every test in them died before touching the product. That is 18
failures a sweep that were never about OpenELIS at all.

Distinguish the two cases when triaging TS2304: `Cannot find name 'Page'` is a
missing *type* import and erases at runtime, so it costs nothing but a red
compiler. `Cannot find name 'someFunction'` is a missing *value* and the test
cannot run. Fix the second class on sight.

**TS2367 (`no overlap`) is the compiler noticing a tautology.** Fifteen
instances in `gap-suites-AQ-AX.spec.ts` and fifteen more in
`tests/admin-config.spec.ts` read:

```ts
const hasInterface = await Promise.any([
  table.isVisible().catch(() => false),
  form.isVisible().catch(() => false),
  buttons.isVisible().catch(() => false)
]).then(v => v === true || v === true);   // same comparison twice
expect(hasInterface).toBeTruthy();
```

The duplicated comparison is what the compiler flagged, but it is the smaller
half of the bug. **`Promise.any` resolves on the first promise to FULFIL, and
`.catch(() => false)` makes all three of these always fulfil.** So the "at
least one of these is visible" check is really "whichever locator settles
first, report that one" — a race. A page with a visible table still fails the
assertion whenever the form's `isVisible` happens to settle first with `false`.

`Promise.any` is for genuinely-rejecting promises. Once every branch is
`.catch()`-ed into a value, the primitive you want is:

```ts
const hasInterface = await Promise.all([...]).then((results) => results.some(Boolean));
```

**The general rule:** a type error inside an assertion is never cosmetic. The
assertion is the only part of a test that does any work, and a compiler
complaining about its logic is telling you the test does not check what its
name claims. Grep the backlog for TS2367 and for TS2304 on call expressions
before reading another sweep's failures — both classes are cheaper to fix than
to triage.


### 12.15 — Duplicated test cases, and a parser bug that misdescribed them

Added 2026-09-08. **Substantially corrected the same day — the first version of
this section reported a number that was an artefact of my own tooling. The
correction is the more useful lesson, so it is kept here rather than quietly
edited away.**

The trail started at the copy-pasted `navigateViaMenu` / `tryNavigateToURL` in
12.14. The hypothesis was that the local copies had drifted on purpose, each
targeting its own screen. That is not what the code says: `order-entry` and
`results-entry` hold identical `navigateViaMenu`, `pathology` adds one
`goto(BASE)`. What the call sites showed instead is that whole TEST CASES exist
in two files — `tests/order-entry.spec.ts` and `gap-suites-AH-AP.spec.ts` carry
the same TC IDs over the same menu paths and URL lists.

#### What the first scan claimed, and why it was wrong

It reported **72 exact clones** — same ID, same title, byte-identical body. It
found them with:

```ts
let i = src.indexOf('{', m.index), depth = 0;   // WRONG
```

In `test('TC-X-01: ...', async ({ page }) => { ... })` the first `{` after the
title is the **destructuring brace of `({ page })`**, not the function body. So
brace-matching closed immediately and every "body" was really just the test
header. Both sides of every comparison truncated identically, so tests that
merely shared an ID compared as byte-identical. The gate shipped in #105 with a
baseline built from that, and the PR asserted 72 clones existed.

**The real numbers are different, and one whole category was invisible.**
Matching the PARENTHESES of the `test(...)` call instead — which captures the
arguments and the entire callback — gives:

| | first scan | correct |
|---|---|---|
| identical body (true clones) | 72 | **59** |
| same ID and title, **different body** | 0 (invisible) | **28** |
| same ID, different title | 47 | **47** |

Clones do exist — `TC-ANZ-01` really is byte-identical between
`gap-suites-AH-AP` and `tests/system-misc`. But 13 of the claimed 72 were not
clones, and the 28 **drifted** pairs were a category the broken parser could
not represent at all, because it had thrown away the bodies that distinguish
them. They are two *implementations* of one case that diverged:

```ts
// TC-VBO-01, gap-suites-AA-AD          // TC-VBO-01, tests/validation
page.click('button[aria-label*="menu" i]')   page.getByRole('button', { name: /menu/i })
navigateWithDiscovery(page, candidates)      navigateWithDiscoveryLocal(page, candidates)
```

Both run, both report under `TC-VBO-01`, and **they can disagree** — one can
pass while the other fails, and the sweep line does not say which ran. That is
worse than a clone, and it is not fixable by deleting a copy at random: someone
has to decide which implementation is correct.

#### What survives from the first version

The **double-counting is real and was measured from sweep logs, not the
parser**: in sweep 4, 34 TC IDs failed in both the `modules` and `gap-suites`
jobs. Treating 306 failures as 306 distinct findings still overcounts.

The **collisions are real**: `TC-IO-03` is "Batch Order Entry screen loads" in
two files and "Status dropdown enumerates expected order states" in a third.

#### The lesson

This is 12.13 again in a different costume. There, `if (locator)` looked like an
existence check and was not. Here, `indexOf('{')` looked like "find the test
body" and found a parameter list. In both cases the code ran, produced
confident output, and the output was about something other than the question
asked. **When a scan produces a surprisingly clean number — 72 exact clones,
zero drift — treat the cleanliness as suspicious.** Real codebases are untidy;
a suspiciously tidy measurement usually means the measurement collapsed a
distinction rather than that the distinction is absent. Print one raw sample and
read it before believing the aggregate.

The gate (`npm run check:dupe-ids`) now parses correctly and classifies into
clone / drifted / collision, because the three need different fixes. Baseline
`.dupe-ids-baseline.json`: 59 clones / 28 drifted / 47 collisions.

### 12.16 — "Are we missing checks?" is a catalogue question, not a test suite

The gap-suites (`gap-suites-AA-AX`) exist to answer whether QA coverage is
missing somewhere. They cannot: **a test that exists tells you nothing about a
test that does not.** 105 of their 107 cases duplicate an ID that a
module spec also defines, so the suites re-run covered ground and report it as
gap closure, at 18.2 minutes of wall clock per sweep.

The instrument that does answer it compares the **catalogue** against the
**code**: `npm run check:coverage-gaps` reads the case IDs declared as headings
in `master-test-cases.md` and the IDs implemented in `*.spec.ts`, and reports
both directions.

- **607 catalogued cases have no test** (SUPERSEDED — the real figure is 1210 across all seven catalogues; see 12.17) — grouped by area, this is the gap
  list (HP 22, HN 20, MGT 20, HO 14, EQA 13, …).
- **242 implemented IDs are not in the catalogue** (SUPERSEDED: 433 — see 12.17) — either the catalogue is
  stale or the ID is wrong; both break traceability from a sweep line to a case.

Report-only by default so it can run on every build; `--strict` fails when the
unimplemented count grows past `.coverage-gaps-baseline.json`.

**Retired on 2026-09-08 — see below.** The decision was deferred at first because with
28 of the pairs being drifted implementations rather than copies, deleting
either side is a judgement about which implementation is correct — 28 separate
calls, not a refactor.
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

#### Retirement (2026-09-08)

The suites are gone. Accounting for all 107 of their cases:

| | | |
|---|---|---|
| **59** | byte-identical clones | dropped; the module spec's copy stands |
| **28** | drifted — same TC ID and title, different implementation | dropped; the module implementation kept in **all 28** |
| **20** | genuinely distinct (2 unique, 18 wearing a colliding ID) | **relocated** into the spec that owns the area, renumbered where the old ID already meant another test |

On the 28 drifted pairs: scored against the module version, the gap-suite
version won **zero** times. It was consistently the older idiom — raw CSS menu
clicks over `getByRole`, and in the ones that scored "tied", `page.$(...)`
(truthy for a hidden element, and deprecated) where the module version used
`locator(...).isVisible()`. The tie was an artefact of the scoring heuristic,
not of the code; reading one pair settled it.

The 20 survivors went to `results-entry` (TC-RBP-01, TC-RBO-04),
`electronic-orders` (TC-IO-01…05 → 11…15), `results-by-range` (TC-RBR-01…05 →
11…15), `aliquot` (TC-ALQ-01…03 → 17…19), `workplan` (TC-WPP-02/03/05 →
06/07/08) and `pathology` (TC-PATH-02 → 03, TC-CYT-02 → 03). Their relocation
promptly produced eight `TS2304 Cannot find name` errors, because the helpers
they call live in `helpers/test-helpers.ts` and the destination files did not
import them — 12.14's defect class, caught by the gate this time instead of by
a sweep.

**A gate bug the cleanup exposed.** `check-dupe-ids` keyed its baseline on
`id|file,file`. `TC-ALQ-01` was a *three*-file collision; removing the
gap-suite participant left the same collision over two files, a different key,
which the gate reported as a NEW violation — i.e. the gate blocked the cleanup
it existed to encourage. It now keys on the **TC ID alone** and records the
file list for the reader only. If a gate makes the fix look like a regression,
the gate is wrong.

Backlog after: **0 clones, 0 drifted, 40 collisions** (the 40 are all
`tests/*` ↔ `tests/*`, untouched by this and still needing per-case decisions).

### 12.17 — The catalogue is plural, and the grammar for reading it is load-bearing

Added 2026-09-08, immediately after 12.16 shipped a number that was wrong.

12.16 reported "607 catalogued cases have no test". That was computed from
`master-test-cases.md` alone, with a regex that matched a subset of even that
file. Casey's correction — *we wrote test catalogs for the new features, and I'm
pretty sure we did reflexes too* — was right, and finding them changed every
figure.

#### Two independent errors, both silent

**The catalogue is not one file.** Seven files declare cases. Four are
per-feature suites written alongside the features they cover:

| catalogue | area | covered |
|---|---|---|
| `master-test-cases.md` | core suites A–JF | **24%** (383/1567) |
| `references/test-cases.md` | Test Catalog module | 42% (11/26) |
| `edit-order-rbac-test-cases.md` | Edit Order & RBAC | 21% (3/14) |
| `analyzer-guided-setup.md` | analyzer guided setup (OGC-1057) | **100%** (23/23) |
| `test-catalog-mgmt.md` | test catalog editor (OGC-949) | **100%** (8/8) |
| `test-catalog-mgmt-deep.md` | editor, deep interaction | **100%** (7/7) |
| `label-presets.md` | label presets | **100%** (5/5) |

Reading only `master` reported all four 100%-covered feature suites as
uncatalogued *and* their cases as ungapped — invisible in both directions.

**The grammar matched a subset, three times over.** Cases are declared in six ID
shapes and two layouts, and each version of the scanner saw only some:

```
TC-01                        bare
TC-HP-01                     common
TC-ADMIN-SITEINFO-TABLE-01   multi-segment   <- dropped 575 of master's 1504
TC-RPT-R01                   letter-number
CLEANUP-01                   teardown
TC-DEEP-FILTER               no number at all

### TC-HP-01 — Title                              heading form
| TC-LP-01 | List renders with the 5 presets |    TABLE form  <- every per-feature suite
```

The table form is how *all four* newer suites declare cases. A heading-only
grammar sees zero cases in them — and reports the file as "indexed but empty"
rather than as a parse failure, which is how it stayed quiet.

#### The corrected picture

**1636 catalogued · 859 implemented · 1210 with no test · 433 tests whose ID no (per-catalogue figures below are superseded by 12.18: ids shared between catalogues were mis-attributed, and 82 of the covered cases prove nothing)
catalogue declares.** The gap roughly doubled, and it is concentrated almost
entirely in `master-test-cases.md`. The features the team catalogued
deliberately are fully covered; the sprawling core catalogue is not.

The 433 uncatalogued run the other way: tests written code-first, spread across
~40 module specs (generic-sample 19, fhir-integration 18, order-creation 18),
with no case ever written down. The catalogue is not a complete inventory of
what QA covers, in either direction.

#### What stops it recurring

Three things, in the order they fail:

1. **One grammar, in one file.** `scripts/catalogue-ids.mjs` is the only
   definition of "a case ID" and "a declaration". Every script imports it.
2. **`npm run catalogue:selftest`** asserts all six shapes and both layouts, plus
   negatives (prose, suite headings and plain tables must NOT count). Blocking.
   This is what a regex change has to get past now.
3. **`npm run check:catalogue-index`** walks every tracked `.md` and fails when
   one declares cases but appears in neither `catalogues.json` nor its
   `notCatalogues` list — the latter requiring a written reason. Adding a
   per-feature suite is one line; deciding a file is not a catalogue is one line
   and a sentence. Blocking. It also fails on an indexed file that declares
   *zero* cases, which is what catches a grammar that has stopped matching.

**The pattern across 12.13, 12.15 and this one is now unmistakable.** Three
times a scanner ran cleanly, produced a confident number, and answered a
narrower question than the one asked: `if (locator)` that was never false,
`indexOf('{')` that found a parameter list, and a case-ID regex that matched a
third of the catalogue. None of them errored. The defence is not more care while
writing the regex — it is a self-test that names the shapes, and a gate that
fails when a file the tool should see produces nothing.

### 12.18 — What "covered" means, and whose case an id refers to

Added 2026-09-08, sharpening 12.17 rather than correcting it. 12.17's headline
(1210 gaps across seven catalogues) survives; two things underneath it did not.

#### First, the good news: the gap number is sound

The obvious worry about exact-ID matching is that a test covering a catalogued
case under a *different* id reads as a gap, and 433 uncatalogued tests were
sitting next to 1210 unimplemented cases. Cross-referencing the two piles by
normalised title found **18 matches** — they are genuinely disjoint. The
catalogue's own internal duplication is likewise small once the heuristic's
false positives are discounted (a dozen suites each declare a case titled "Page
structure", for twelve *different* pages). The gap is real.

#### Identity: a case is (catalogue, id), not id

Fourteen ids are declared in two catalogues — the bare `TC-NN` forms shared by
`master-test-cases.md` and `references/test-cases.md`, plus three shared with
the edit-order suite. Keying one map by id collapsed them, so a test for
master's `TC-01` credited the unrelated `TC-01` in `references/test-cases.md`:

| catalogue | reported | actual |
|---|---|---|
| `references/test-cases.md` | 42% (11/26) | **0%** — every "covered" case was a borrowed credit |
| `edit-order-rbac-test-cases.md` | 21% (3/14) | **0%** — same |

Such ids are now reported as **ambiguous** and counted as neither covered nor
gap, because a test naming one cannot be attributed and guessing is what caused
the error. `check-catalogue-index` grandfathers the existing 14 and fails on any
new one; the fix is to give those cases prefixed ids.

#### Substance: a test that cannot fail is not coverage

"Covered" meant "some test declares this id". But an assertion-free test cannot
fail and an always-skipped test never runs, so a case whose *every* test is one
of those is reported as covered while proving nothing. There are **82**:

```
  real coverage      341   a test that asserts and can run
  hollow coverage     82   a test exists but asserts nothing, or always skips
  no test at all    1199
  ambiguous id        14
```

**Real coverage is 21%, not the 26% the id-only count reports.** The correction
also lands on suites I had reported as fully covered: analyzer guided setup is
96% (one always-skipped case) and test-catalog-mgmt-deep is 71% —
`TC-DEEP-TERMINOLOGY` and `TC-DEEP-STORAGE` assert nothing. Test catalog
management and label presets really are 100%.

This is 12.8's census applied to the coverage number instead of to the suite: a
test shaped like coverage is not coverage. The two gates now agree —
`lint:assert` stops new assertion-free tests being written, and
`check:coverage-gaps` stops the existing ones being counted as coverage.

#### The habit worth keeping

Every correction in 12.13 through 12.18 came from asking one question of a
number I had just produced: *what would make this number wrong, and can I check
it cheaply?* Cross-referencing the two gap piles took twenty lines and confirmed
the headline. Grouping coverage by catalogue instead of globally took about the
same and demolished two of the per-catalogue figures. Neither needed a rerun of
the suite. **Print one raw sample, then check the aggregate against a second
method, before reporting it.**

### 12.19 — The baseline patient never existed, and three layers hid it

Added 2026-09-08, from pulling on "is `Anga, Dr` still seeded?".

`helpers/test-helpers.ts` exports `PATIENT_NAME = 'Abby Sebby'` and
`PATIENT_ID = '0123456'`, described as *"the baseline test patient created by
data.setup.ts"*. **Seventeen module specs import them. The patient does not
exist, and as far as this audit can tell never has.**

A live probe on v3.2.2.0: `patient-search-results?searchValue=0123456` →
`patientSearchResults: []`. Same for `lastName=Sebby`. Zero.

Three independent failures had to line up, and each one hid the next:

**1. No config ran the setup.** `data.setup.ts` exists precisely to create this
patient and two orders. Every other setup has a home — `auth.setup.ts` in ~25
configs, `roles.setup.ts` in two, `analyzer-auth.setup.ts` in the analyzer
configs, `seed-data.setup.ts` in `regression-seed` — and `data.setup.ts` had
none. `check:orphans`, the gate built in #96 for exactly this class of bug, only
audited `*.spec.ts`, so a setup nothing ran was outside its remit. It now audits
both, and the reachable side of its scan had to be widened to match, or the two
halves disagree and the gate reports files it just fixed.

**2. The finder could never find anyone.** `findPatientByNationalId` tried three
endpoints:

```
/rest/patient?nationalId=        404 NoHandlerFoundException
/rest/PatientSearch?nationalId=  404
/rest/patient/search?nationalId= 404
```

All three 404 on this build. Every candidate failed `res.ok`, the loop fell
through, and the function returned `null` unconditionally — so the setup
concluded "patient not found" every run, regardless of reality. The endpoint the
app itself uses is `patient-search-results`.

**3. Creation reported success from "the page did not crash".**

```ts
// Verify success (no error message, page didn't crash)
const bodyText = await page.locator('body').innerText();
if (bodyText.includes('Internal Server Error')) return false;
state.patient.found = true;   // <- the only other outcome
return true;
```

That is not a check that a patient was created; it is a check that the browser
did not render one particular string. So the log said
`[data-setup] Patient created successfully` on every run while creating nothing.

#### What this cost

Every patient-dependent failure in the module sweep looked like a product
defect. `TC-PAT-02: Search by national ID returns Abby Sebby` fails because
Abby Sebby is not there — nothing to do with patient search. Any triage of the
sweep that treated those as findings was investigating the wrong system.

#### Fixed

- `data.setup.ts` is now a dependency of the module sweep, with its own 120s
  budget (a fixture is not a check, so the 30s test policy does not apply to it)
  and `retries: 0`.
- The finder uses `patient-search-results`.
- Creation requires a **read-back** and now reports honestly:
  *"save produced no error, but nationalId=0123456 does not read back — the
  patient was NOT created."*
- Order creation tries the **API before the UI**. The UI path burns the entire
  budget on one `locator.click`, which meant the API fallback was never reached
  and the setup died on timeout. Both paths currently fail; the setup now says
  so in 14 seconds instead of 4 minutes.
- `check:orphans` covers `*.setup.ts`.

Whether the UI cannot create a patient because of a product defect or a stale
selector needs a clickthrough before it becomes a ticket. **ANSWERED the same
day — see the resolution below: the UI works, the fixture had five defects.** What is settled is
that the fixture no longer claims a success it cannot demonstrate.

#### The rule

**A fixture that reports success it has not verified is worse than a fixture
that fails.** A failing fixture gets fixed; a lying one sends every dependent
failure to the wrong investigation, for months. Fixtures need round-trips for
the same reason tests do (12.3) — and a fixture that is a dependency of a large
project must also be unable to take that project down with it, which is why this
one is non-fatal and fast rather than thorough and blocking.

#### Resolved (same day): the UI was never the problem

Casey's read — *"I'm sure we can create a patient through the UI"* — was right.
A live drive of the form creates a patient in about eight seconds:

```
POST /rest/PatientManagement -> 200 {"status":"success","patientId":"503"}
```

The fixture had **five** separate defects between it and that request. Each one
alone was enough to stop the patient being created, and none of them said so.

**1. The Save selector matched the wrong button.**

```ts
getByRole('button', { name: /save|submit|add|create/i }).first()
```

The form carries exactly two buttons matching that alternation —
**"Additional Information"** and **"Save"** — because `/add/i` matches
"ADDitional". "Additional Information" is first in the DOM, so `.first()` took
it, the click expanded an accordion, and Save was never pressed. Anchoring to
`/^Save$/` fixed it. *A loose alternation over button labels will eventually
match a button you did not mean, and `.first()` hides which one it hit.*

**2. Gender was queried as a `<select>`.** It is a radio pair
(`input[name="gender"]`, `#radio-1` / `#radio-2`). Zero matches.

**3. Date of birth was queried as `input[name*="dob"]` / `[placeholder*="date"]`.**
It is a Carbon picker, `#date-picker-default-id`, placeholder `dd/mm/yyyy` —
containing neither "dob" nor "date". Zero matches. (Save turns out not to
require it, but the selector was still dead.)

**4. It filled the search screen, not the create screen.** The fixture loaded
`/PatientManagement` and clicked "New Patient", then looked for fields. But
`/PatientManagement` is the SEARCH screen and has its OWN lastName / firstName /
nationalId inputs (7 visible inputs, against 12 on `/PatientManagement/new`), so
when the click had not landed the selectors matched the search form and typed
the patient's details into it.

Defects 2, 3 and 4 shared one shape: every fill was wrapped in
`if (await field.isVisible()) { ... }` **with no else**, so a selector matching
nothing was indistinguishable from a field that had been filled.

**5. The finder queried parameters that do not search.** `patient-search-results`
answers 200 for every parameter shape, but only one of them looks anything up.
With three patients named Abby Sebby present:

| query | result |
|---|---|
| `?lastName=Sebby&firstName=Abby` | **3 results** |
| `?searchValue=0123456` | `[]` |
| `?nationalId=0123456` | `[]` |
| `?searchValue=Sebby` | `[]` |
| `?patientId=504` | `[]` |

**A 200 with an empty list is indistinguishable from "no such patient".** This
is what made the read-back oracle added earlier the same day report the patient
missing while it sat in the database — the original false positive traded for a
false negative. The nationalId still narrows the results; it just cannot be the
query.

#### Two findings that came out of it

**Search by national ID appears genuinely broken.** *(RETRACTED — see 12.20: the parameter is nationalID, and neither UI case actually searched.)* `?nationalId=` returns empty
for a national ID that demonstrably exists, and two independent UI cases —
`TC-PAT-02` and `TC-H-DEEP-01`, both "search by national ID finds the known
patient" — fail on it in separate runs. That is API repetition plus two UI
paths agreeing. It was NOT a defect; 12.20 has the correction.

**Three duplicate Abby Sebbys (503, 504, 505)** now exist, created while the
finder was blind. The fixture is idempotent again and settles on 503, but any
case asserting a unique search result will see three rows.

`tests/patient-management.spec.ts` after the fix: **10 passed, 7 failed,
1 skipped** of 18 — and the remaining failures are about the product or about
stale expectations, not about a patient that isn't there.

### 12.20 — `.first()` on a loose name is the defect of the day, three times over

Added 2026-09-08. Casey asked whether the UI could really create a patient, and
following that question to the end turned up the same mistake in three
unrelated places — and produced a defect claim I had to retract.

#### The retraction first

I told Casey that **search by national ID looked like a real product defect**:
`?nationalId=0123456` returned nothing for an ID that three patients carried,
and two independently-written cases (`TC-PAT-02`, `TC-H-DEEP-01`) failed on it
across separate runs. API repetition plus two UI paths agreeing felt conclusive.

It was wrong on both halves.

**The parameter is `nationalID`** — capital I, capital D — captured from the
request the search screen sends for itself:

```
GET /rest/patient-search-results?lastName=Sebby&firstName=Abby&STNumber=
    &subjectNumber=&nationalID=&labNumber=&guid=&dateOfBirth=&gender=
    &suppressExternalSearch=true
```

| query | results |
|---|---|
| `?nationalID=0123456` | **5** |
| `?nationalId=0123456` | **0** |

And **the two UI cases never searched at all** — see below. So neither leg of
the evidence stood. The revalidation protocol's Method A is what caught it:
running it properly, rather than treating "two tests agree" as confirmation,
flipped the verdict. *Two tests failing the same way is not two pieces of
evidence when both fail for the same test-side reason.*

#### The shape, three times

**Save on the patient form.** `/save|submit|add|create/i` + `.first()` →
matched **"Additional Information"**, because `/add/i` matches "ADDitional".
Clicked an accordion; Save never pressed.

**Search on the patient screen.** `/search/i` + `.first()` → matched the Carbon
header's `cds--header__action` search icon, which is rendered before page
content and belongs to no form. Captured live: candidate 0 was the header
action, candidate 1 was `cds--btn--tertiary` inside the form holding
`#lastName`, and only the second issued a request. The first fired **nothing** —
no request of any kind — so the case then asserted against a page that had never
searched, and reported the absence as a product failure.

**My own probe.** I filtered captured requests with `/patient-search/i` and saw
an empty list, and briefly read that as "the app sends no request". It was my
filter. Capturing everything is what exposed the real parameter list.

#### What replaced it

`clickFormSearch(page, fieldSelector)` in `helpers/test-helpers.ts` picks the
`/^Search$/` button that shares an ancestor with the field just filled, and
**warns loudly** when it has to fall back — a silent fallback is how the
original bug survived. `TC-PAT-03` and `TC-H-DEEP-01` use it; both now pass.

Two more things this settled:

- **The form does not submit on Enter.** `TC-PAT-02` and `TC-PAT-03` both
  pressed Enter. No request fires. Anything that "searches" by pressing Enter on
  these screens has never searched.
- **The patient search screen has no national-ID input.** Its fields are
  `patientId`, `labNumber`, `lastName`, `firstName`, a date picker and gender
  radios; the only "National ID" on the page is a results-table column header
  (`cds--table-header-label`). The server supports the query, the screen does not
  expose it. That is a product question — national ID is a primary patient
  identifier in this domain — not a test failure, and it is in
  `open-questions.md` rather than a ticket.

`tests/patient-management.spec.ts`: **13 passed, 4 failed, 1 skipped** of 18,
from 10/7/1 before this pass.

#### The rule

**Anchor the name, and never `.first()` a name that could match twice.** When a
screen genuinely has two controls of the same name, pick by relationship — the
one inside the form you filled — not by document order. And when a locator that
"can't fail" produces no effect, check what it actually resolved to before
concluding the application is broken: on all three occasions here, the button
was found, visible, enabled, clicked without error, and wrong.

#### "Search for Patient" has no selected state at all (verified 2026-09-08)

Casey flagged that the patient-search mode must be selected first and that the
control is *not visually distinctive*. Measuring it is worse than that phrasing
suggests — there is **no state signal of any kind**:

```
before click: { cls: "cds--btn cds--btn--primary", aria-pressed: null,
                aria-selected: null, aria-current: null }
after  click: { cls: "cds--btn cds--btn--primary", aria-pressed: null,
                aria-selected: null }
```

The class string is byte-identical before and after, and none of the three
state attributes is set. Consequences, in order of who they hurt:

- **A user cannot tell which mode is active** — the only "primary" styling on
  the row is permanent, not selection feedback.
- **A screen reader is told nothing.** A control that changes mode without
  `aria-pressed` (or a tab with `aria-selected`) fails WCAG 2.1 §4.1.2
  *Name, Role, Value*. This is a real accessibility defect, not a nicety.
- **A test cannot assert selection either.** `clickFormSearch` can only verify
  the mode *behaviourally* — click it, then check that the form's Search
  produced a request. That is why the helper clicks it unconditionally rather
  than checking first: there is nothing to check.

**Order is safe**, which was the risk worth measuring: clicking the mode button
*after* the fields are filled does not clear them. Verified end-to-end —
`#lastName` still held "Sebby" after the mode click, the helper returned true,
and the search returned 3 rows with the real request. So `fill → clickFormSearch`
is the correct sequence and needs no reordering.

### 12.21 — Two fixes, and why order creation is a separate job

Added 2026-09-08.

**TC-PAT-05 now passes.** Its failure was reported as
`keyboard.press: Target page, context or browser has been closed`, which named
the last line to run rather than the one that broke. The case filled gender and
the date picker with `.catch(() => {})` on each, so a selector matching nothing
was indistinguishable from a field being filled; by the time it reached
`keyboard.press('Escape')` — a line that only existed to dismiss the picker
overlay — the test had already exhausted its budget and Playwright had torn the
page down. Rewritten on the sequence the data factory now uses: gender by label,
`#date-picker-default-id`, an ANCHORED `/^Save$/`, wait for
`/PatientManagement/<id>`, then confirm by read-back through
`patient-search-results?nationalID=`. Verified live: 3 passed.

**The patient results table never settles, and that is what blocks order
creation.** Driving `/SamplePatientEntry` — search for the patient, then select
the row — fails at the row's radio with:

```
locator.click: Timeout exceeded
  - waiting for element to be visible, enabled and stable
```

`isVisible()` passes; **stable** never does. The likely cause is visible in the
network capture: each search fires one `GET /rest/patient-photos/<id>/true` per
result row, and with three patients named Abby Sebby present those three
responses land at different moments and re-render the table each time. Playwright
waits for the element to stop moving; it does not.

Two consequences worth separating:

- **For the harness:** an order test cannot simply click the row. It has to wait
  for the photo requests to settle first (or click through the row's label), and
  the whole wizard — search, select, Next Step, choose tests, save — took **3.2
  minutes** to reach step 2 in a probe with the timeout raised. That does not fit
  the 30-second policy, so order-creating tests need either a documented
  exemption like `data.setup`'s, or a faster path (the API, once a payload has
  been CAPTURED rather than hand-composed — `createOrderViaAPI` currently
  composes one by hand, which 12.4 says not to do).
- **For the product:** a results table that re-renders once per row photo is
  also a table that visibly jumps for a user, and it gets worse with more rows.
  Worth a look, though it is a design observation rather than a defect claim.

Order creation is therefore left broken deliberately rather than half-fixed. It
is a multi-step wizard, its first step exceeds the test budget, and the fixture's
API fallback needs a captured payload — three separate pieces of work, none of
which should be rushed at the end of a long session.

### 12.22 Patient history and patient merge: four hollow cases, and two traps I walked into

**2026-09-08.** `patient-management.spec.ts` went from 15/3 to **18/18**, and
the interesting part is that not one of the six cases fixed here was blocked by
a product defect. Every one of them was a test that could not see the screen it
claimed to test.

**TC-PAT-04 was never on the history screen.** It searched with
`getByRole('textbox', { name: /id|patient|national/i }).first()` — the loose
regex plus `.first()` trap for the fourth time in this file — and there is no
national-ID input on any patient search screen, so it typed a national ID into
whichever textbox came first. Then it pressed Enter (no submit), clicked
`getByText(/Sebby/i).first()` on the table that re-renders per row (12.21), and
asserted only `/Abby|Sebby/i`, which the still-visible *search* screen satisfies.
The history half of the case was a `console.log`.

**The four TC-MP merge cases were written against a UI that does not exist.**
All of them looked for `input[placeholder*="patient"]`, `[role="option"]` and an
autocomplete dropdown. The real screen is a three-step wizard with two full
search panels. Every assertion in all four was `.catch(() => console.log(...))`,
so the suite reported four green merge cases while never selecting a patient.

**And that mattered more than a false green.** Had those locators ever matched,
TC-MP-04 would have clicked `/Merge|Submit|Confirm/i` and merged two real
patient records on the shared instance. It was a destructive test; only a broken
locator kept it from doing damage. Worth generalising: *a hollow test is not
merely uninformative — a hollow test whose real actions are destructive is a
loaded gun with the safety taped down.* TC-MP-04 now walks to the confirmation
gate and cancels, and says in a comment why it stops.

#### What the screens actually offer

| Screen | Hook | Behaviour |
|---|---|---|
| `/PatientHistory` results | `tr[data-cy="patient-result-row-<patientId>"]` | **Checking the row radio IS the navigation** — no submit button; it goes to `/PatientResults/<patientId>` |
| `/PatientMerge` panels | `#patient1-*`, `#patient2-*` | one Search per panel, each enabled only once its own panel has input |
| `/PatientMerge` results | `input#patient<N>-select-<patientId>` | radio per candidate |
| `/PatientMerge` step 2 | `#patient-1`, `#patient-2` | warns "marked as merged and inactive", asks which record is primary, Next Step disabled until one is chosen |

Note `/PatientHistory` has **no** "Search for Patient" mode control, while
`/PatientManagement` does. The same-looking panel is not the same panel.

#### Trap 1: Carbon radios cannot be `.check()`ed

Carbon draws a radio as a real `<input type="radio">` plus a `<label>`
containing a `<span class="cds--radio-button__appearance">`. The input is
visible and enabled, but the span sits on top of it, so both `.check()` and
`.click()` retry until the test times out with:

```
<span class="cds--radio-button__appearance"> from <label for="503"> subtree intercepts pointer events
```

**A 30-second timeout on a radio in this app always means this.** New helper
`checkCarbonRadio(page, inputLocator)` clicks the bound label, which is also
the correct user gesture. Use it everywhere; the gender radios and the search
radios are the same shape.

#### Trap 2: there is a THIRD button named "Search"

My first merge fix used `getByRole('button', { name: /^Search$/ }).nth(panel - 1)`,
reasoning that there is one Search per panel in panel order. There are three:
the Carbon header's search action has the accessible name "Search" too, and it
renders before page content. So `nth(0)` clicked the header icon and both panels
came back empty.

This is the *same* trap `clickFormSearch` was written to close in 12.20, and I
walked straight back into it one section later. The lesson is not "remember the
header button" — it is that **any name-based button lookup on this app must be
scoped to the field it belongs to**, and `clickFormSearch(page, fieldSelector)`
is that scoping. Reach for the helper, not for `nth()`.

#### One more retracted measurement

TC-PAT-03's empty-state probe used `/no.*(found|result|patient)/i` and reported
"message present" on a screen that has no empty-state message. `.*` spans any
amount of intervening text, so it matched unrelated copy. Anchored to an actual
empty-state shape, it correctly reports the gap: **zero results are communicated
only by the pager reading "0-0 of 0 items"**. That is a sixth finding for the
patient-search UX work item.

Also fixed: TC-PAT-04's identity assertion first failed because it read
`body.innerText()` immediately after `waitForURL`. The URL changes before the
patient header renders, so it captured the SideNav and nothing else. Use
`expect(locator).toContainText(...)`, which retries; a one-shot `innerText()`
snapshot is a race dressed up as an assertion.

### 12.23 The merge case now really merges, and seeds its own victim

**2026-09-08, after Casey's ruling:** *"destructive tests are fine, this will only
be run against a testing instance."* So TC-MP-04 executes the merge. The
interesting problem was never permission — it was **repeatability**.

The merge cases used to lean on the five duplicate "Abby Sebby" records that
happen to exist on `testing`. A merge case that actually merges *consumes* them.
After one or two runs there would be nothing left to merge, and the case would
start failing for a reason that has nothing to do with the product: it would have
destroyed its own precondition. Generalising: **a destructive test must create
what it destroys.** TC-MP-04 seeds a fresh duplicate pair, merges that, and the
merge is the pair's cleanup.

#### Both payloads, captured (12.4)

Patient creation — off the wire from the Add Patient form:

```
POST /api/OpenELIS-Global/rest/PatientManagement
Content-Type: application/json   Accept-Language: en   X-CSRF-Token: <localStorage['CSRF']>
{"patientUpdateStatus":"ADD","nationalId":…,"lastName":…,"firstName":…,
 "gender":"F","birthDateForDisplay":"01/01/1990", …all-empty rest…}
-> 200 {"patientId":"515","status":"success"}
```

The captured request also carried a stray `"date-picker-default-id"` key next to
`birthDateForDisplay` — the form's own field id leaking into its payload. Omitting
it is verified good (200, patient created), so `createPatientViaAPI` omits it.
Two POSTs seed a duplicate pair in about a second, which is what makes per-test
seeding affordable inside the 30-second policy.

Merge execution:

```
POST /api/OpenELIS-Global/rest/patient/merge/execute
{"patient1Id":"514","patient2Id":"515","primaryPatientId":"514","reason":"…","confirmed":true}
```

After it succeeds the app navigates to `/PatientManagement/<primaryId>`.

#### What the merge wizard gates, and how it is id'd

| Step | Hooks | Gate |
|---|---|---|
| 1 Select Patients | `#patient<N>-lastName`, `input#patient<N>-select-<patientId>` | Next Step disabled until two distinct records; panel 2 excludes panel 1's pick |
| 2 Select Primary | `#patient-1`, `#patient-2` | Next Step disabled until a primary is chosen; warns "marked as merged and inactive" |
| 3 Confirm Merge | `#mergeReason`, `label[for="confirmMerge"]`, `button.cds--btn--danger` | **two independent gates** — a reason AND the acknowledgement; states "cannot be undone" |

This is a well-built destructive flow, which is worth saying out loud given the
state of the tests that were pointed at it. TC-MP-04 asserts all three gates,
including that a reason *alone* does not unlock the danger button.

#### Duplicate id on the create form

`/PatientManagement/new` renders **two** elements with `id="date-picker-default-id"`
— a `div.cds--form-item` wrapper and the input inside it. `document.querySelector`
returns the div, so a naive value-setter throws. Use `input#date-picker-default-id`
(the factory's existing `.last()` works for the same reason). Duplicate ids are an
HTML validity error and a screen-reader hazard; noted for the product, not claimed
as a defect here. The same screen also renders **two** buttons named `Save`, only
one visible — another reason never to use `.first()` on a name (12.22).

#### The last-name search is FUZZY — never assert an exact result set from it

Found while reading TC-MP-04's own log output. A query for `lastName=QA AUTO Smith`
returns **every** `qa-auto-*` record on the instance: `QA-AUTO Chain`,
`qa-auto-probe`, `QaautoSmith`, `QA-AUTO-Davis`… The endpoint normalises case and
punctuation and matches loosely, so it is not prefix matching and not exact
matching.

This bit immediately. TC-MP-02 first asserted that the merge search returned
**exactly** its seeded pair. It passed — because it runs before the other two
merge cases seed theirs. On the *second* run it would have found the first run's
leftovers and failed, and the failure would have looked like a product
regression. A test that passes only on a clean instance is a test that will lie
to you later. The assertion is now a subset check per seeded id.

It is soundex-like, not merely case-insensitive. Two consecutive attempts at a
"unique" seeded last name both failed:

1. `QAAutoMRG1788898067465248` → **400** `{"error":"lastName: invalid name format,
   possibly illegal character"}`. Names reject digits.
2. Transliterating the stamp into letters (`QAAutoMRGBHIIJ…`) made the name unique
   but not unique *to the search*. Every `QAAuto…` name matched every other one,
   so each run's panel search returned all previous runs' seeds, the pair got
   pushed onto page 2 of the results, and its radio was never rendered. That is
   what a 30-second `waiting for #patient1-select-530` timeout meant — not a
   Carbon interception (12.22), not a slow server, just a result set the pair had
   fallen out of.

**How a destructive test identifies its own records here.** The merge panel's
"Patient Id" field does not search the internal patient id — it matches the
**subject number (Unique Health ID) by substring**. Verified: searching `530`
returned patient 439, whose subject number merely *contains* `530`. So the seeder
sets a fresh long digit subject number (`99<timestamp>`) on both records, and the
panels search on that. It returned exactly the seeded pair and nothing else, and
it is immune to both soundex and accumulation. The last name is now a constant,
used for display only.

General rule: **identify seeded records by a field that is matched exactly (or by
a long unique substring), never by name.** Names on this app are for driving the
UI.

#### Finding: the primary-selection step labels both candidates identically

Step 2 labels each candidate with its **subject number** when it has one, and
falls back to the internal patient id when it does not — so the same screen reads
`Patient 1: 514 - Alpha QAMergeProbe` for a record with no subject number and
`Patient 1: 991788898821595883 - Alpha QaautoMRG` for one with.

The consequence lands exactly where it hurts: a duplicate pair usually *shares*
its identifier — that is generally why someone is merging it — so step 2 shows
both candidates prefixed with the **same** string. On a real pair the only thing
distinguishing "Patient 1" from "Patient 2" is the given name, on the screen where
the user decides which record survives and which is marked inactive. Worth raising
with the merge UX; it is what forced this case to assert on
`Patient 1: <subjectNumber> - Alpha` rather than on an id.

(Step 2 also shows a useful per-candidate summary — Active Orders / Total Results
/ Samples, and an Identifiers block — so the data needed to choose is there. It is
the label that does not distinguish.)

#### Observation from the merge, NOT a defect claim

After a successful merge of 515 into 514, on the same endpoint:

- `?nationalID=<shared id>` returns **`[514]`** — correctly consolidated.
- `?lastName=<shared name>` returns **`[514, 515]`** — the merged-away record is
  still there.

Stable across three consecutive repeats, on a pair with no other similar records
present — which matters, because the fuzzy matching above means a longer result
list proves nothing on its own. If 515 is "merged and inactive", a user searching
by name can still find and select it, which defeats the merge.

Revalidation status: **two of three gates cleared.** 3× API on a clean pair, and
reproduced on a different pair in each of two consecutive full runs, every one of
which uses a fresh browser context — that is the fresh-tab gate. What is still
owed is a genuine **re-login**: the suite authenticates from saved storage state,
so no run so far has actually re-authenticated. Until that third gate is cleared
this stays an observation, because 12.14's lesson stands — I have called a search
parameter a defect before and been wrong twice over. TC-MP-04 asserts the
national-ID outcome and *logs* the last-name result with an `OBSERVATION` marker,
naming only its own pair's record rather than quoting the raw list. Promote it to
an assertion once the re-login gate is cleared.

#### Repeatability, demonstrated rather than asserted

The seeding design exists to make a destructive case re-runnable, so it was worth
proving rather than reasoning about. Two consecutive full runs of the file:

```
pass 1   TC-MP-04: merged 558 into 557; nationalID search -> [557]     18 passed (1.3m)
pass 2   TC-MP-04: merged 565 into 564; nationalID search -> [564]     18 passed (1.3m)
```

Different pair each pass, merge executed each pass, no state carried between them.
A destructive test that has only ever been run once is not a verified test.

#### Still open: order creation in the fixture

Both runs logged `[data-setup] primaryOrder API creation failed`. That is the
known 12.21 item, not a regression from this work: `createOrderViaAPI` composes
its payload by hand, which 12.4 says not to do. The capture technique used above
for `PatientManagement` and `patient/merge/execute` is exactly what that needs —
drive the order wizard once in the browser with a request interceptor installed
and keep what it actually sends. That remains its own piece of work.

### 12.24 A merge is enforced for editing, advisory for search and order entry

**2026-09-08.** Casey, on the 12.23 observation: *"for some reason, we don't remove
the duplicated patient, which seems wrong, it should at least be a filter."* He is
right, and chasing it into the UI turned a search-filter annoyance into a patient-safety
finding.

**All three revalidation gates cleared** (12.23 owed the third): 3× API repeat, a
fresh browser context in each of two consecutive full runs, and a genuine logout
plus re-login. So the behaviour below is measured, not assumed.

**Then the disposition changed, and it is worth recording why.** Casey, 2026-09-09:
*"A newer version will have a filter. Keep this one as is."* — and on what that
filter does: *"which will show the merged patients."* So the filter is an **opt-in
control that reveals** merged records, and hidden becomes the default. This is
therefore **not a defect against v3.2.2.0** — it is current expected behaviour,
with the change already coming. Nothing here is to be filed or chased.

Note the direction, because it decides what the tests assert. The filter is not a
"hide merged" switch bolted onto today's behaviour; today's behaviour becomes the
*non-default* state reached by turning the filter on. So the new version needs
**two** cases:

| Filter | Expected | Status |
|---|---|---|
| OFF (default) | merged records absent from results | TC-MP-05, written, `test.fail()`-marked |
| ON | merged records present **and still badged `Merged`** | TC-MP-08 — **not written yet** |

TC-MP-08 is deliberately not written. There is no control to drive, so every
locator in it would be invented rather than verified — which is exactly how the
four hollow TC-MP cases this file just replaced came to exist (12.22). Write it
against the real control on the day it exists, not before.

That does not make the work wasted; it changes what the work is *for*. A finding
that is already scheduled to be fixed is exactly the finding worth encoding as a
test, because the test becomes the thing that tells you the fix arrived and that it
covered what you thought it covered. The alternative — noting it in prose and
moving on — means noticing months later, by hand, if at all.

#### What a merge actually does, feature by feature

Seeded pair 566 (primary) / 567 (merged away), merged via
`POST /rest/patient/merge/execute` →
`{"success":true,"mergeAuditId":"6","primaryPatientId":"566","mergedPatientId":"567","mergeDurationMs":156}`.

| Surface | Behaviour after merge | Verdict |
|---|---|---|
| `?nationalID=` search | returns `[566]` only | **enforced** |
| `?lastName=` search | returns `[566, 567]` | **advisory** |
| Result row for 567 | badged `Merged` in the leading column | marked, not hidden |
| Opening 567 | banner: "This patient record was merged / Active records are kept on Patient `<nationalId>`" | good |
| Editing 567 | no Edit and no Save control rendered | **enforced** |
| `/SamplePatientEntry` search | offers 567, radio **enabled** | **advisory** |
| Selecting 567 for an order | banner shows, **Patient Info marks Complete, wizard advances to Program Selection** | **not guarded** |

So the merge is real where the record is written to, and advisory everywhere the
record is *chosen*. That inversion is the problem: the guard is on the door nobody
walks through.

**Why the order-entry half is worth separating.** A filter on the name search is a
usability fix — the user sees a row they should not have to reason about. Order
entry accepting a merged patient is different in kind: it will build a requisition
against a record the lab has already declared dead and consolidated elsewhere, so a
sample and eventually a result end up attached to it. The banner is present and
says the right thing, but a banner is not a control; nothing blocks Next.

The planned filter is described as covering search results. Whether it also guards
the order-entry wizard is **unconfirmed**, which is precisely why TC-MP-06 exists
separately from TC-MP-05.

Worth being precise about what is *not* broken, so a fix does not regress it: the
identifier search filters correctly, the record is badged in results, the banner
names where the active records went, and editing is locked. The gap is the name
search and the order-entry guard.

#### Tracked as two `test.fail()` tripwires

TC-MP-05 (name search) and TC-MP-06 (order entry) assert the behaviour the newer
version is expected to bring, and carry `test.fail(true, '<why>')`. They pass on
v3.2.2.0 and turn **red the moment the filter lands** — the signal to delete the
marker and let the assertion stand as ordinary coverage. The change then arrives
with a test already waiting for it.

**They are kept as two cases on purpose.** A filter on search results and a guard
on a write workflow are different changes, and the planned work is described as the
former. If the new version turns TC-MP-05 red and leaves TC-MP-06 green, that is a
useful answer rather than a loose end: the result list got cleaner and order entry
can still build a requisition against a merged record. Folding them into one case
would have thrown that distinction away.

Generalising, because this keeps coming up: **a known-and-scheduled behaviour change
is the best possible candidate for `test.fail()`.** Not a complaint, not a ticket —
a tripwire that converts itself into coverage on the day the change ships.

Both are deliberately **minimal** — seed and merge through the API, then one
assertion. Under `test.fail()` *any* failure counts as the expected one, so a case
that also did elaborate setup could "pass" by being broken. That is the hollow-test
trap (12.22) wearing a different hat, and it is the rule for every `test.fail()`
case in this repo: **one assertion, API setup, nothing else.**

Setup for these uses `seedMergedPair` → `mergePatientsViaAPI`, not the wizard.
Driving the merge UI to reach a merged state would put the wizard's own defects
inside another case's precondition.

#### `toHaveCount(0)` after an async action is vacuously true

The first TC-MP-06 was one line after the search:

```ts
await expect(mergedRow).toHaveCount(0, { timeout: 15_000 });
```

The run reported **"Expected to fail, but passed"** — and not because order entry
filters merged records. `expect()` polls until the assertion PASSES, and
`toHaveCount(0)` is satisfied the instant it is first evaluated, before the search
has rendered anything. The 15-second timeout never came into play. **Any
"must not exist" assertion placed straight after an async action is always
vacuously true**, and it will keep being true when the thing it forbids is right
there on screen a second later.

The fix is to wait for evidence that the action completed, then assert the absence:

```ts
await expect(page.locator(`[data-cy="patient-result-row-${primaryId}"]`)).toBeAttached({ timeout: 15_000 });
await expect(page.locator(`[data-cy="patient-result-row-${mergedId}"]`)).toHaveCount(0);
```

That guard sits inside a `test.fail()` case, where a failure would read as the
expected one — so **TC-MP-07 asserts the same precondition unmarked**. If
order-entry patient search ever breaks outright, TC-MP-07 goes red and says the
marked case can no longer be trusted. Pair every `test.fail()` case with an
unmarked canary for its preconditions.

Note also what caught this: the marker itself. A plain green test asserting
`toHaveCount(0)` would have sailed through and been counted as coverage forever.
`test.fail()` inverts the reporting, so a vacuous assertion becomes a loud
"Expected to fail, but passed" instead of a silent pass.
