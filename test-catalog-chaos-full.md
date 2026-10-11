# Test Catalog: full chaos (non-happy path) suite

**Spec files** (repo root, collected by `all-tc.config.ts`, project `test-catalog`):

| File | Area |
| --- | --- |
| `test-catalog-chaos-results.spec.ts` | Sample & Results, Terminology, Localization, Labels, Accreditation |
| `test-catalog-chaos-rules.spec.ts` | QC Targets, Alerts, Storage, group editor |
| `test-catalog-chaos-links.spec.ts` | Methods, Reagents, Panels, Display Order, creating a test, activation |
| `test-catalog-chaos-admin.spec.ts` | Sample Types, Lab Units, Catalog CSV import, test list |
| `test-catalog-chaos-access.spec.ts` | Permissions and session expiry |

Shared drivers: `helpers/catalogChaos.ts`. **Target:** local develop, images 2026-10-08. **Written:** 2026-10-08.

This suite extends `test-catalog-chaos.md` (2026-10-02: Basic Info and Ranges, CHAOS-BI/RG) and `test-catalog-silent-actions.md`. They are not repeated here.

## The five kinds of non-happy path

Every section gets the kinds that apply to it:

1. **Bad input, through the UI and straight at the API.** The API cases ask whether the server checks, or only the UI does. Values: too long for the column, wrong type, out of range, unknown ids, null lists, duplicates, spaces and case.
2. **Save faults.** The fault is injected with `page.route` on the one request under test, so the server is never broken for anyone else. The faults are a 500 with JSON, a 500 with HTML, a dropped connection, a login page answered with 200, and a 422 with an empty body. Each asks four questions: was the user told, is the typing kept, is the server unchanged, and does a retry work?
3. **Two editors.** Editor A loads a record, B changes it, then A saves its old copy. The expectation is that A is refused as stale or B's change stands. Today only Basic Info has stale protection.
4. **Permissions and session.** A non-admin session (roles.setup.ts) calls the API, and an admin's session ends mid-edit.
5. **Apply, then edit, then remove** (Casey, 2026-10-08). Each step is read back, on a second surface where one exists (order entry, methods-for-test, the test-side panels list, the list filter).

Rulings respected (not cases): copy configuration **replaces** (2026-09-23). Clearing a terminology code and saving removes the mapping, which is **acceptable** (2026-09-24).

## Sample & Results

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-SR-01 | Save meets a 500 JSON | Error shown, no success, typing kept, server unchanged |
| TC-CX-SR-02 | Save meets a dropped connection | Same |
| TC-CX-SR-03 | Save meets a login page with 200 | Same (status-only helpers read this as success) |
| TC-CX-SR-04 | Remove Primary while a second saved component exists | 200; the second becomes Primary |
| TC-CX-SR-05 | Free-text options "1" and "2" | Read back as "1" and "2", not dictionary entries 1 and 2 |
| TC-CX-SR-06 | Interpretation on a new free-text option | Its valueMatch equals the stored option value |
| TC-CX-SR-07 | Lifecycle: remove a component with a range, re-add the same code | The new component starts with no ranges |
| TC-CX-SR-08 | API: result type null, "Z", "NN" | 422; stored type unchanged |
| TC-CX-SR-09 | API: label 51 with blank code, label 256, default 81, interpretation 256, severity 21 | 4xx, never 500 |
| TC-CX-SR-10 | API: uomId "abc" and 999999 | 4xx, never 500 |
| TC-CX-SR-11 | API: components / options / interpretations null | Under 500 |
| TC-CX-SR-12 | API: components [] | 422; the component stays |
| TC-CX-SR-13 | Two editors: B removes a component, A saves its old copy | A refused, or the component stays removed |
| TC-CX-SR-14 | API copy-from onto a configured target | Replaces (target-only component gone, primary takes the source type) |
| TC-CX-SR-15 | Lifecycle: options applied, normal flag moved, option removed | Each step reads back |

## Terminology

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-TM-01 | Save meets a 500 JSON | Error shown, no success, nothing stored |
| TC-CX-TM-02 | Save meets a login page with 200 | Same |
| TC-CX-TM-03 | LOINC " 2345-7 " | Stored trimmed |
| TC-CX-TM-04 | API: code 81, display name 256, mappings null | Under 500 |
| TC-CX-TM-05 | Lifecycle: mapping scoped to a component, then the component is removed, then the next save | 200 |
| TC-CX-TM-06 | Lifecycle: test-level LOINC added, changed, removed | test.loinc follows (loinc-integrity) |
| TC-CX-TM-07 | Two editors: B adds a mapping, A saves its old list | A refused, or B's mapping kept |

## Localization

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-LO-01 | A receptionist PUTs /rest/localizations/{id}/translations for a test name | 403; name unchanged |
| TC-CX-LO-02 | API: English name "" | Refused; name survives |
| TC-CX-LO-03 | API: 11-character locale, null value, unknown localization id | Under 500; unknown id 404 |
| TC-CX-LO-04 | Two editors: B saves French, A saves English from its old page | A refused, or B's French kept |
| TC-CX-LO-05 | Save meets a login page with 200 | Not shown as saved |

## Labels

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-LB-01 | Save meets a 500 | Error shown; typed maximum kept |
| TC-CX-LB-02 | API: links null, max below default, duplicate preset, negative default | Null under 500; the rest 422 |
| TC-CX-LB-03 | Lifecycle: link, change quantities, unlink | Each step reads back |

## Accreditation

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-AC-01 | Lifecycle: enroll, duplicate, remove, remove again | 201, 400, 204, then a clean 400 or 404 |
| TC-CX-AC-02 | API: enroll with an inactive body | 400; no enrollment |
| TC-CX-AC-03 | UI: enroll a body another tab enrolled first | 400 and the message says already accredited |

## QC Targets

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-QC-01 | Save meets a 500 | Readable error (no raw JSON), typing kept |
| TC-CX-QC-02 | Lifecycle: numeric target, then the test becomes coded, then a coded target is saved | 200 |
| TC-CX-QC-03 | UI: add a target, deactivate it before filling, Save | 200 |
| TC-CX-QC-04 | API: expected 12345678901, unknown or non-numeric dictionary answer, negative uncertainty | 4xx, never 500 |
| TC-CX-QC-05 | Lifecycle: add, edit, deactivate, reactivate | Each step reads back; /effective agrees |

## Alerts

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-AL-01 | Lifecycle: create, rename, disable, enable, delete, delete again | Each step reads back; second delete 404 |
| TC-CX-AL-02 | API: phone 21, name 101, e-mail 101, role id "abc" and 999999 | 4xx, never 500 |
| TC-CX-AL-03 | Lifecycle: rule scoped to a component, component removed, switch the rule off | 200 |
| TC-CX-AL-04 | Two editors: B switches a rule off, A renames from its old page | A refused, or the rule stays off |
| TC-CX-AL-05 | UI: rule save meets a dropped connection | Dialog stays open with an error and the typing; nothing stored |

## Storage

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-ST-01 | API: condition "BOGUS" and "frozen" | 422 |
| TC-CX-ST-02 | API: custom condition 201, unit 21, disposal 101, negative duration | 4xx, never 500 |
| TC-CX-ST-03 | Two first saves at once | Both under 500 |
| TC-CX-ST-04 | Save meets a dropped connection | Error shown, no success, typing kept |
| TC-CX-ST-05 | Save meets a login page with 200 | Same |
| TC-CX-ST-06 | Lifecycle: set, change, clear | Each step reads back; history records the changes |

## Group editor ("Edit related tests")

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-GR-01 | One test's ranges fail to load, then "Set all to these values" | Neither test loses its range |
| TC-CX-GR-02 | Two tests that differ only in their reporting range | The "ranges differ" warning shows |
| TC-CX-GR-03 | API: Serum-scoped group range on a Plasma-only test | The Plasma test gets no shared range |
| TC-CX-GR-04 | API: ranges null (group and single), a non-numeric test id last | Under 500; nothing written |
| TC-CX-GR-05 | Lifecycle: shared range set, changed, cleared on two tests | Both follow |

## Methods

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-ME-01 | API: name with 2 leading spaces and 20 characters | 4xx, never 500 |
| TC-CX-ME-02 | API: existing name with a new code | 409 that does not say "code already exists" |
| TC-CX-ME-03 | Two editors: B removes method 2, A makes it default | Method 1 stays default (methods-for-test) |
| TC-CX-ME-04 | UI: remove meets a 500 | Error shown; link still there |
| TC-CX-ME-05 | Lifecycle: link two, change default, change date, unlink, unlink again | methods-for-test follows; second unlink 204 or 404 |

## Reagents

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-RE-01 | UI: save meets a 500 | Error shown; typed quantity kept |
| TC-CX-RE-02 | API: quantity -1, quantity 10^10, unit 51 | 4xx, never 500 |
| TC-CX-RE-03 | Lifecycle: link, duplicate link, edit, unlink, unlink again | 201, 409, edit reads back, 204, 404 |
| TC-CX-RE-04 | UI: link two reagents, the second POST fails, retry | One linked after the failure; both after the retry, no error left |

## Panels

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-PN-01 | UI: "create" a panel with an existing panel's exact name | The existing panel stays active and keeps its description |
| TC-CX-PN-02 | UI: member list fails to load, add a test, Save | Existing members kept |
| TC-CX-PN-03 | API: remove the last test of an active panel | Never active with zero tests |
| TC-CX-PN-04 | API: null lists, non-numeric member id, 81-character code, 21-character name on create | Under 500; long name 422 |
| TC-CX-PN-05 | API: add an inactive test | 422 |
| TC-CX-PN-06 | API: replace the panel LOINC with an 11-character code | Refused, or the old LOINC no longer routes |
| TC-CX-PN-07 | Two editors: B adds a member, A saves its old list plus another | A refused, or B's member kept |
| TC-CX-PN-08 | Lifecycle: build, reorder, remove a member, deactivate | Order entry and the test side follow |

## Display Order

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-DO-01 | API: items null; unknown sample type | Under 500; 404 |
| TC-CX-DO-02 | UI: a move meets a 500 | Error shown; list back to the stored order |

## Creating a test

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-CR-01 | API: unknown or non-numeric sample type, unknown lab unit, non-numeric copy source | 4xx and no test created |
| TC-CX-CR-02 | API: existing code with spaces, or in lower case | 409 |
| TC-CX-CR-03 | API: existing name in upper case, or with a leading space | 409 |
| TC-CX-CR-04 | API: Basic Info gives B the code of A | 409 |
| TC-CX-CR-05 | API: two creates with one code at the same moment | One 201 |

## Activation

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-AV-01 | API: remove every sample type while inactive, then activate | Never active with no sample type |
| TC-CX-AV-02 | API: gapsAcknowledged "yes" | Under 500 |
| TC-CX-AV-03 | Lifecycle: activate, deactivate, reactivate | Order entry (/rest/sample-type-tests) follows |
| TC-CX-AV-04 | UI: double-click the acknowledgement | At most one activation after the acknowledgement |

## Sample Types

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-STY-01 | API: name 49 and description 41 on create; description 41 on update | Under 500; update 400 without the DB message |
| TC-CX-STY-02 | Lifecycle: Display Order move, then Basic Info save from the loaded page | The move is kept |
| TC-CX-STY-03 | API: link a VECTOR test (seeded) to a CLINICAL type; domain "XYZ" | 422; unknown domain refused |
| TC-CX-STY-04 | API: unlink the only sample type of an active test | Refused |
| TC-CX-STY-05 | Two editors: B deactivates, A saves its old copy | A refused, or it stays inactive |
| TC-CX-STY-06 | Lifecycle: create, rename, deactivate, reactivate | Order entry's sample type list follows |

## Lab Units

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-LU-01 | Basic Info save on a test whose unit was deactivated | The unit stays inactive |
| TC-CX-LU-02 | Two editors: B deactivates (guarded), A saves its old copy | A refused, or it stays inactive |
| TC-CX-LU-03 | API: rename B to A's name | 4xx |
| TC-CX-LU-04 | API: deactivate with "move tests to" an inactive unit | 422; the destination stays inactive |
| TC-CX-LU-05 | UI: the server refuses a deactivation | The refusal is shown |
| TC-CX-LU-06 | Lifecycle: create, rename, assign a test, deactivate | List filter and editor picker follow |

## Catalog CSV import

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-IM-01 | tests.csv with a UTF-8 byte-order mark (Excel "CSV UTF-8") | Read; one create |
| TC-CX-IM-02 | Latin-1 tests.csv with "é" | The accent survives |
| TC-CX-IM-03 | Preview twice with an unknown lab unit | The unresolved count does not grow |
| TC-CX-IM-04 | One file lists the same test twice | Preview and apply counts agree |
| TC-CX-IM-05 | Two files with the same name in one batch | Flagged |
| TC-CX-IM-06 | Empty file, .txt, semicolon-separated | Under 500, with a reason |
| TC-CX-IM-07 | UI: change a file's type after preview | Apply turns off |

## Test list

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-LS-01 | Overflowing and negative paging, wildcard and 5000-character search, non-numeric filters | Under 500 |
| TC-CX-LS-02 | Non-numeric ids on catalog admin paths | 400 or 404 |

## Permissions and session

| ID | Case | Expected |
| --- | --- | --- |
| TC-CX-PS-01 | Receptionist and lab tech call 19 catalog writes | 401 or 403 on every one; nothing changes |
| TC-CX-PS-02 | Receptionist opens the test editor by URL | No editor form |
| TC-CX-PS-03 | Session ends while editing Basic Info, then Save | No success, nothing written, typing not thrown away |
| TC-CX-PS-04 | Same on Sample & Results | Same |
| TC-CX-PS-05 | Same on Storage | Same |
| TC-CX-PS-06 | Deep links to records that do not exist (test, panel, sample type, lab unit) | A message, no spinner after 8 s |

## Not encoded (and why)

- **Alert "Specific value" on coded results never fires** (code reading: `TestAlertEvaluationServiceImpl` compares the typed text with the stored dictionary id). This needs an order and a result. To be added to a chain spec.
- **Reflex & Calc "Feeds into" lists calculations whose integer constant equals the test id.** Needs a calculated value to be seeded. Read-only section.
- **Analyzers section lists inactive analyzers.** Needs an analyzer mapping on the instance.
- **Inert options offered as live:** the COMPLIANCE_BREACH trigger, physician and facility recipients, most storage fields, and QC targets with no reader. These are product questions for Casey, not defects.
- **Method effective date never filters.** Product question.
- **The legacy Test Activation screen bypasses the completeness gate.** The legacy screens are scheduled for retirement (10 Sep).
