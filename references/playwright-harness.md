# Playwright Harness & Carbon Component Rules

> **Where the harness lives:** **this repo — `DIGI-UW/OpenELIS-QA`.** The Playwright config
> (`playwright.config.ts`), setup (`auth.setup.ts`, `data.setup.ts`, `seed-data.setup.ts`),
> `helpers/`, `pages/`, `tests/` (chains + personas), `gap-suites-*.spec.ts`, and the legacy
> single-file `openelis-e2e.spec.ts` all live at the repo root. This skill (SKILL.md +
> references/) is the methodology layer over that harness. Canonical spec layout is **one spec
> per chain/persona** (`tests/chains/chain-a-*.spec.ts`, run via `--project=chain-a`); the
> single `openelis-e2e.spec.ts` is legacy.

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

When generating or updating Playwright test specs (`openelis-e2e.spec.ts`), follow these rules:

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

### 12.7 — The three gates, and what each one is for

Added with the OGC-1192 remediation. Fail-by-default: anything not demonstrably
green should be visible as not-green.

| Gate | Command | Blocking? | Catches |
|---|---|---|---|
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
