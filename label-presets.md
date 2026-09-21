# Label Preset Management — QA suite

**Target:** testing.openelis-global.org (3.2.2.0) · route `/MasterListsPage/labelPresets` · write contract verified 2026-09-21.
**File:** `label-presets.spec.ts` · helper: `helpers/silentSave.ts`.

Configurable **Label Preset Management** is BUILT (supersedes the old "4 fixed presets" note). Real admin
list (Name / Barcode Type / Dimensions / Scope / Status / Actions) + search + **Add Preset**; 5 System
presets ship (Order, Specimen, Block, Slide, Freezer — CODE_128, 25×76 mm).

**Editing is currently broken end to end — see [OGC-1227](https://uwdigi.atlassian.net/browse/OGC-1227).**
TC-LP-05/06/07/08/10 fail on 3.2.2.0 by design; they are that ticket's acceptance test.

| ID | Case | Criterion | Result on 3.2.2.0 |
|---|---|---|---|
| TC-LP-01 | List renders with the 5 system presets | RENDER | PASS |
| TC-LP-02 | Columns + Add Preset present | RENDER | PASS |
| TC-LP-03 | Search filter narrows the list | FUNCTION | PASS |
| TC-LP-04 | "Add Preset" opens the create modal with its fields | FUNCTION | PASS |
| TC-LP-05 | Editing a dimension in the UI saves and reads back | ROUND-TRIP | **FAIL** — PUT 400 (Defect 1) |
| TC-LP-06 | PUT accepts the payload shape the editor sends | FUNCTION | **FAIL** — Defect 1 |
| TC-LP-07 | A second save carrying the same fields is idempotent | PERSIST | **FAIL** — 500 (Defect 2) |
| TC-LP-08 | A partial update omitting `fields` does not delete them | PERSIST | **FAIL** — data loss (Defect 3) |
| TC-LP-09 | A successful save shows a confirmation | FUNCTION | **FAIL** — no success notification (Defect 4) |
| TC-LP-10 | Saving does not rename the preset | ROUND-TRIP | **FAIL** — name lower-cased (Defect 5) |

Module maturity: **M1**. Every write is blocked, so nothing above RENDER/FUNCTION is reachable until
OGC-1227 lands. (Before 2026-09-21 this suite reported 4 passed / 1 skipped and the module read as
healthy — see the note below.)

## Why TC-LP-05 is no longer fixme'd

It used to read:

```
test.fixme(true, 'Carbon modal form write not reliably automatable; product Save persists for a real user')
```

Both halves were wrong. The Carbon `NumberInput` steppers drive the controlled input perfectly well,
and product Save did not persist for a real user — it had never worked. A `test.fixme` on a write case
may cite a **harness** limitation; it may not cite a product claim, because the product claim is the
thing under test. Any fixme in this repo whose stated reason is product behaviour should be read as
uncovered, not as covered-elsewhere.

## The write contract

Every write case here goes through `helpers/silentSave.ts`, which will not grade a save on the
strength of a dialog closing. Four properties, each of which failed independently in OGC-1227:

1. `assertWriteIssued` — a mutating request was actually sent.
2. `assertWriteSucceeded` — its status is 2xx; the server's body is quoted on failure. Assert the
   status, never the absence of a red banner.
3. `assertUserVisibleOutcome` — a 2xx shows a confirmation, a non-2xx shows an error.
4. `assertRoundTrip` — the record re-reads correctly on a **different** surface, diffing every field
   plus an `alsoRequireUnchanged` set for collateral damage.

Adopt it in any suite with a write; nothing in it is Label-Preset specific.

## Endpoints (live-captured 2026-09-21)

The SPA's `config.serverBaseUrl` is `/api/OpenELIS-Global`, so the browser calls:

```
GET    /api/OpenELIS-Global/api/labelPresets
PUT    /api/OpenELIS-Global/api/labelPresets/{id}
POST   /api/OpenELIS-Global/api/labelPresets
POST   /api/OpenELIS-Global/api/labelPresets/{id}/duplicate
PATCH  /api/OpenELIS-Global/api/labelPresets/{id}/activate
```

Note the doubled `api` — the controller is mapped `@RequestMapping("/api/labelPresets")` under a
context already reached via `/api/`. `/rest/labelPresets` and `/api/labelPresets` at the host root
both return the SPA shell with **200**, so a naive "did it 200?" probe passes against HTML (§11.3).

`LabelPresetForm.FieldEntry` declares exactly `fieldKey`, `isRequired`, `displayOrder`. Any other key
in a `fields[]` entry is a 400.

Add/Edit modal fields: Preset Name (disabled for System presets), Active; Dimensions (Height/Width mm);
Barcode Type (CODE_128/QR/DATAMATRIX); Print Scope (Order/Sample) + Default/Max per scope.

## Safety

Destructive cases never touch a System preset — they duplicate Order Label into a `QaAuto …` scratch
preset and deactivate it in a `finally` (LIMS rule: deactivate, never hard-delete). TC-LP-05 and
TC-LP-10 edit a System preset and restore it in a `finally`.

## Run
```bash
BASE=https://testing.openelis-global.org npx playwright test --config=lp.config.ts
```
