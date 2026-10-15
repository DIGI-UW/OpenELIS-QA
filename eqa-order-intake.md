# EQA order intake on the v4 order flow (OGC-1483, OGC-1488): test cases

**Spec:** `tests/eqa-order-intake.spec.ts` (helper `tests/helpers/eqa-deep.ts`)
**Written:** 2026-10-15 against local develop (backend image 2026-10-15 13:33 UTC, develop 7472c304).
**Scope:** OpenELIS-Global-2 #4731 (merged 15 Oct 2026, Mozzy): the v4 Enter Order EQA box (OGC-1483) and Sample Check for an EQA sample that fails intake (OGC-1488). The rules are Casey's calls of 13 Oct, recorded on OGC-1483.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while the product differs.

## Data

Each run makes the scheme `QA-EQAOI <stamp>` with an active enrollment and one open cycle, a second scheme `QA-EQAOI other <stamp>` with its own open cycle, and a withdrawn enrollment. A CLINICAL intake checklist item `QA-EQAOI container intact <stamp>` is added (Sample Check offers its actions only when the domain has a checklist) and deactivated at the end. Every save is read back from the database: `sample_eqa`, `sample_human`, `sample_item`, `note` (local stack only; elsewhere those checks skip and say why).

The server's own refusals are reached by changing the order save the screen sends (`page.route`), so a check that lives only in the browser cannot make them pass.

## Enter Order (OGC-1483)

| ID | Case | Kind |
| --- | --- | --- |
| TC-EQAOI-00 | Setup: schemes, enrollments, cycles, checklist item | Setup |
| TC-EQAOI-01 | The EQA Scheme list is exactly `GET /rest/eqa/my-programs?active=true`; a withdrawn enrollment is not offered | Guard |
| TC-EQAOI-02 | In EQA mode "No patient" is ticked and locked and the patient search is not shown | Guard |
| TC-EQAOI-03 | With EQA ticked and no scheme, Save and exit and Save and next are disabled and the to-do list says "Choose the EQA scheme"; choosing one enables Save | Guard |
| TC-EQAOI-04 | The server refuses an order with no scheme and one naming a withdrawn enrollment (4xx, not a 500); nothing is stored | Guard |
| TC-EQAOI-05 | Choosing a cycle offers only that scheme's cycles and prefills the deadline; the saved order stores the enrollment id (a row of `eqa_lab_program_enrollment`), the cycle and the deadline, links no patient, and the toast names the lab number | Guard |
| TC-EQAOI-06 | With no cycle chosen the screen warns and offers New cycle, and the order still saves, with no cycle | Guard |
| TC-EQAOI-07 | The server refuses a cycle that belongs to another scheme; nothing is stored | Guard |

## Sample Check (OGC-1488)

| ID | Case | Kind |
| --- | --- | --- |
| TC-EQAOI-10 | Sample Check offers Reject, not Resample, for an EQA sample, and shows no Patient block | Guard |
| TC-EQAOI-11 | The server refuses an EQA reject with no reason and with an unknown reason (400); the specimen stays unrejected | Guard |
| TC-EQAOI-12 | Reject without a reason says "Choose a rejection reason."; with one the specimen is rejected, `sample_item.reject_reason_id` holds it, and the rejection note reads "reason \| comment" | Guard |

## Not covered here

- A lab with no active enrollment sees a note linking to My EQA Schemes instead of the list (needs an instance with no enrollments).
- Provider sample id suggestions from the cycle's panel codes (the cycles made here have none).
- The consent gate on Collect skipping EQA orders (needs CONSENT_REQUIRED_FOR_COLLECTION on).
- Legacy Add Order: Reject ticked with no reason refused; a resample of an EQA sample copying its EQA record.

Related: TC-EQAPT-04 in `eqa-deep.md` (the scheme list on the participant lane), a guard since 15 Oct.
