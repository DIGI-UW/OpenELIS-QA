# Test Catalog Management — DEEP QA suite + findings

**Spec:** `test-catalog-requirements-v2.5.md` / OGC-949 · **Target:** testing.openelis-global.org (3.2.1.10) · **Verified:** 2026-06-29.
**File:** `test-catalog-mgmt-deep.spec.ts` · last run **7 passed** (6 ROUND-TRIP/FUNCTION + 1 expected-fail; 0 skipped) — all write concepts now persist + read back via REST.

DEEP = write in the UI → read back on a **different surface (the editor REST endpoint)** → assert, per the
QA authoring standard. Read-back uses the editor's own data endpoints (fast + genuinely cross-surface).

**Read-back endpoints (verified live 2026-06-29 via network capture).** Section data lives in *sub-resources*,
NOT in the bare `…/tests/<id>` (which carries only top-level fields — this is why earlier `fullText(/tests/<id>)`
read-backs failed). The verified surfaces:

| Section | Read-back endpoint | Shape |
|---|---|---|
| Basic Info | `…/test-catalog/tests/<id>/basic-info` | `{domain, antimicrobialResistance, active, orderable, …}` |
| Methods | `…/rest/test/<id>/methods` *(note: `/test/` namespace)* | `[{methodId, methodName, isDefault, effectiveDate}]` |
| Panels | `…/test-catalog/tests/<id>/panels` | `{memberships:[{panelId, panelName, position}]}` |
| Terminology | `…/test-catalog/tests/<id>/terminology` | `{mappings:[{source, code}]}` |
| Storage | `…/test-catalog/tests/<id>/storage` | `{storageCondition, protectFromLight, doNotFreeze, …}` |

Available-options lists for the pickers: methods `…/rest/displayList/METHODS`, panels `…/rest/test-catalog/panels`.

## Cases — all write concepts now automated + passing (run 2026-06-29, `deep.config.ts`)
| ID | Surface | Criterion | Result |
|---|---|---|---|
| TC-DEEP-FILTER | List Domain filter narrows rows | FUNCTION | **PASS** |
| TC-DEEP-DUP | "Save as new test…" opens a Duplicate modal | FUNCTION | **expected-fail** (test.fail) — Δ-DUP, see below |
| TC-DEEP-DOMAIN | Change Domain (confirm dialog) → REST read-back | ROUND-TRIP | **PASS** — fixed via the Change-test-domain confirm step |
| TC-DEEP-METHOD-LINK | Link a method (modal + required Effective Date) → REST read-back | ROUND-TRIP | **PASS** — combobox + date recipe; reads back at `/rest/test/<id>/methods`; idempotent (unlinks on teardown) |
| TC-DEEP-PANEL-ASSIGN | Assign to a panel (`#panels-add` combobox) → REST read-back | ROUND-TRIP | **PASS** — type-to-filter open + positional row-trash cleanup |
| TC-DEEP-TERMINOLOGY | Add LOINC mapping (native selects) → REST read-back | ROUND-TRIP | **PASS** — reads back at `…/tests/<id>/terminology` |
| TC-DEEP-STORAGE | Set storage condition (native select) → REST read-back | ROUND-TRIP | **PASS** — reads back `storageCondition` at `…/tests/<id>/storage` |

### F-6 — RESOLVED: Method link automated (the Effective Date is required — the real gotcha)
Linking a method: open **+ Link Method** → pick a method in the ComboBox (type to filter, click the option)
→ **fill the required Effective Date + press Enter** (commits the Carbon date field) → confirm **+ Link
Method** → Save. Omitting the Effective Date silently no-ops the confirm (the modal just stays open). The
write reads back at **`GET /rest/test/<id>/methods`** (note the `/test/` namespace). Automated + passing; the
test links an unlinked method, asserts the round-trip, then unlinks it on teardown so it stays idempotent.
The earlier "blocked headless" note was two harness bugs, now fixed: (1) the read-back was hitting the wrong
endpoint (`/tests/<id>` carries no section data), and (2) overlapping background runs polluted the log.

### F-5 — RESOLVED: the Carbon ComboBox / native-select writes all drive to persistence
All four new write concepts now persist + read back in automation:
- **Link Method** and **Add to panel** are filterable **Carbon ComboBoxes** — open by a trusted click +
  typing the value to filter, then a trusted click on the option (the `mclick` center-click that also fixed
  the domain radio). Panel/​method membership rows are removed for cleanup via the **positional** row trash
  button (its accessible name is empty — "Remove from panel" is only a tooltip — so target it by position).
- **Terminology** (source/relationship) and **Sample Storage** (condition) are **native `<select>`s** —
  Playwright `selectOption` drives React's onChange directly; no ComboBox trickery needed.

This closes the "ComboBox option-select" gap noted earlier. Product works for real users; the remaining work
was purely harness engineering (correct read-back endpoints + reliable headless ComboBox open + safe cleanup).

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
Viewing verified (RENDER, the smoke suite / PR companion) **and** every write concept now confirmed to
persist + read back via REST (Domain, Method link, Panel assignment, Terminology mapping, Sample Storage).
The unified editor is rated **M2+** on testing 3.2.1.10. The one open product defect is Δ-DUP ("Save as new
test…" opens no Duplicate modal), held as an expected-fail so the suite stays green and flips red when wired.

## Run
```bash
BASE=https://testing.openelis-global.org npx playwright test test-catalog-mgmt-deep.spec.ts
```
