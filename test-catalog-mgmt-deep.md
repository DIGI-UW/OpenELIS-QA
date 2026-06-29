# Test Catalog Management — DEEP QA suite + findings

**Spec:** `test-catalog-requirements-v2.5.md` / OGC-949 · **Target:** testing.openelis-global.org (3.2.1.10) · **Verified:** 2026-06-26.
**File:** `test-catalog-mgmt-deep.spec.ts` · last run **2 passed, 3 skipped (fixme)**.

DEEP = write in the UI → read back on a **different surface (the editor REST endpoint)** → assert, per the
QA authoring standard. Read-back uses the editor's own data endpoints (fast + genuinely cross-surface):
`GET /api/OpenELIS-Global/rest/test-catalog/tests/<id>/basic-info` and `…/tests/<id>`.

## Cases
| ID | Surface | Criterion | Result |
|---|---|---|---|
| TC-DEEP-FILTER | List Domain filter narrows rows | FUNCTION | **PASS** |
| TC-DEEP-DUP | "Save as new test…" opens a Duplicate modal | FUNCTION | **expected-fail** (test.fail) — Δ-DUP, see below |
| TC-DEEP-DOMAIN | Change Domain → REST read-back | ROUND-TRIP | **fixme** — product OK (manually confirmed); Carbon-control automation follow-up |
| TC-DEEP-TERMINOLOGY | Add LOINC mapping → REST read-back | ROUND-TRIP | **fixme** — same Carbon-write automation follow-up |
| TC-DEEP-STORAGE | Set storage condition → REST read-back | ROUND-TRIP | **fixme** — same Carbon-write automation follow-up |

## Findings

### F-1 — RESOLVED: Save persists (product OK); automating the write is a harness limitation
Initial deep runs showed Domain/Terminology/Storage edits not reading back after Save. **Casey confirmed
manually** that the product works: Albumin → Domain = Environmental → bottom **Save** → reload → the test
lists as Environmental. So **Save persists correctly** — *not* a bug.

The automation failure is a **Carbon RadioButtonGroup driving problem**: `.click({force})`, the native-setter
(`checked` + dispatched click/change), and a `label[for]` click all fail to drive the group's `onChange`, so
Save submits the unchanged value (no success toast). The three write round-trips are therefore `test.fixme()`
(not failing) with this note. **No Jira bug** — the feature works for users. Follow-up: a component-level test
or capturing the real onChange handler path to drive the control faithfully.

### F-2 — "Save as new test…" opens no Duplicate modal (Δ-DUP)
Clicking the editor-header **Save as new test…** opens no modal/dialog (probed via DOM + force-click).
Encoded as `test.fail()` so the suite stays green while the defect exists and flips red once Duplicate is wired.

### F-3 — Name / Code / Description are read-only (Δ-2, confirmed)
`#basic-info-name/code/description` report `readOnly: true` — matches the "later milestone" note; the manual's
note is correct.

### F-4 — "Slowness" was a test artifact, not the instance (corrected)
The editor renders fast (list ~90ms, Basic Info ~80ms, Ranges ~125ms to heading). Earlier apparent hangs were
Playwright `.click()` waiting on actionability while an **invisible Carbon modal-shell overlays the page**.
Workaround: `.click({ force: true })` (drives React + skips the overlay wait). A plain DOM `.click()` is fast
but does NOT drive Carbon's controlled state. **Operational note for `playwright-harness.md`.**

## Maturity
With viewing verified (RENDER, the smoke suite / PR companion) but writes not yet confirmed to persist, the
unified editor is rated **M1** on testing 3.2.1.10. Promote to M2+ once F-1 is resolved and the three
ROUND-TRIP cases are un-fixme'd and pass.

## Run
```bash
BASE=https://testing.openelis-global.org npx playwright test test-catalog-mgmt-deep.spec.ts
```
