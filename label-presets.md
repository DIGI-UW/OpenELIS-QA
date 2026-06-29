# Label Preset Management — QA suite

**Target:** testing.openelis-global.org (3.2.1.10) · route `/MasterListsPage/labelPresets` · verified 2026-06-29.
**File:** `label-presets.spec.ts` · last run **4 passed, 1 skipped**.

Configurable **Label Preset Management** is BUILT (supersedes the old "4 fixed presets" note). Real admin
list (Name / Barcode Type / Dimensions / Scope / Status / Actions) + search + **Add Preset**; 5 System
presets ship (Order, Specimen, Block, Slide, Freezer — CODE_128, 25×76 mm).

| ID | Case | Criterion | Result |
|---|---|---|---|
| TC-LP-01 | List renders with the 5 system presets | RENDER | PASS |
| TC-LP-02 | Columns + Add Preset present | RENDER | PASS |
| TC-LP-03 | Search filter narrows the list | FUNCTION | PASS |
| TC-LP-04 | "Add Preset" opens the create modal with its fields | FUNCTION | PASS |
| TC-LP-05 | Create a preset persists | PERSIST | **fixme** — same Carbon modal write limitation as the Test Catalog editor (product Save works for a real user) |

Add/Edit modal fields: Preset Name, Active; Dimensions (Height/Width mm); Barcode Type (CODE_128/QR/DATAMATRIX);
Print Scope (Order/Sample) + Default/Max per Sample.

## Run
```bash
BASE=https://testing.openelis-global.org npx playwright test label-presets.spec.ts
```
