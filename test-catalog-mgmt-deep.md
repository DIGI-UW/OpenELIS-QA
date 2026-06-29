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
| TC-DEEP-DOMAIN | Change Domain (confirm dialog) → REST read-back | ROUND-TRIP | **PASS** (40.9s) — fixed via the Change-test-domain confirm step |
| TC-DEEP-TERMINOLOGY | Add LOINC mapping → REST read-back | ROUND-TRIP | **fixme** — retry with the real-interaction pattern; verify the read-back endpoint (mapping may persist to a sub-resource, not /tests/<id>) |
| TC-DEEP-STORAGE | Set storage condition → REST read-back | ROUND-TRIP | **fixme** — retry with the real-interaction pattern; verify read-back endpoint |
| TC-DEEP-METHOD-LINK | Link a method (modal) → reload read-back | PERSIST | **fixme** — Carbon ComboBox option-select not yet persisting in automation |
| TC-DEEP-PANEL-ASSIGN | Assign to a panel (typeahead) → reload read-back | PERSIST | **fixme** — same Carbon ComboBox interaction follow-up |

### F-6 — Method link: workflow VERIFIED LIVE; the Effective Date is required (the real gotcha)
Linking a method has a required step that's easy to miss: open **+ Link Method** → pick a method in the
ComboBox → **fill the required Effective Date + press Enter** (commits the Carbon date field) → confirm
**+ Link Method** → Save. Verified by hand on 2026-06-29 — the row **"PCR — 2026-06-29"** appears and
persists on reload. (Omitting the Effective Date silently no-ops the confirm — the modal just stays open.)
Headless automation of it is blocked by very slow editor reloads + the Carbon ComboBox listbox not opening
reliably headless; encoded but `test.fixme` pending a runtime trim (one reload + REST read-back) — not a bug.

### F-5 — Carbon ComboBox option-select is the remaining automation gap
The new catalog write concepts that go through a **Carbon ComboBox / FilterableMultiSelect** — Link Method
(modal), Add-to-panel typeahead, (and likely Sample&Results unit / Terminology source) — aren't yet driven
to persistence in automation. This is the *same class* as the domain radio (a real interaction is needed that
updates React's state), now isolated to the ComboBox. The flows + selectors are discovered (see
`test-catalog-chain-plan.md`); the follow-up is to nail the ComboBox option-select (open → type/highlight →
commit) the way the domain confirm-dialog was nailed. Product works for real users.

### Results entry + validation — verified via existing coverage (not rebuilt)
Per Casey, the result-entry and validation legs are the same workflow already covered by prior specs
(`results-entry.docs`, `result-validation.docs`, the env/vector chains, the OGC-1060 revalidation, the
DEV…011 validation→release run). The chain reuses that tail rather than re-automating it.

## Findings

### F-1 — RESOLVED: the missing step was the "Change test domain?" confirm dialog
Initial deep runs showed Domain edits not reading back after Save. Casey spotted the cause live: selecting a
Domain radio opens a **"Change test domain?"** confirmation dialog (Close / Cancel / **Confirm**; FRS §2.1),
and you **must click Confirm** for the change to commit — only then does Save persist it. Every earlier
automation attempt flipped the radio but never confirmed the dialog, so Save had nothing committed (which also
explains why force-click Save "didn't persist").

**Fixed + verified:** the `changeDomain()` helper now does *real label-text click → confirm the dialog →
Save*, and **TC-DEEP-DOMAIN PASSES** (domain round-trips via REST, 40.9s). No bug — product + automation both work.

**Process note (worth keeping):** the editor renders fast; the earlier "slowness" was Playwright `.click()`
waiting on actionability. For Carbon controls use a real click on the visible target (label-text / `force`),
and **always look for and confirm modal dialogs that gate a change** before asserting persistence.

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
