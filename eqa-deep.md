# EQA, deep: test cases

**Specs:** `tests/eqa-provider-deep.spec.ts` (TC-EQAP), `tests/eqa-participant-deep.spec.ts` (TC-EQAPT), `tests/eqa-inhouse-deep.spec.ts` (TC-EQAIH). Helper: `tests/helpers/eqa-deep.ts`.
**Written:** 2026-10-12 against local develop a4200e2d (images 2026-10-12 06:09 UTC). The provider lane also passes on testing.openelis-global.org.
**Scope:** the three EQA lanes as an accredited lab and a PT provider really run them, plus the ten EQA tickets in Acceptance (OGC-1244, 1245, 1249, 1252, 1255, 1256, 1257, 1260, 1261 English only, 1265).

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while the product differs, and goes red the day it is fixed (remove the marker then). Rulings from Casey (13 Oct) are noted on the rows they settled.

Every spec is serial and makes its own data, stamped `QA-EQA-DEEP ... <stamp>`. Nothing is deleted. Cases that read or move the database (`db()`) skip when the target is not the local stack. Glucose (test 3) reports to 0 decimals, so every Glucose value is a whole number.

## Practice the cases hold the system to

| Source | What it requires |
| --- | --- |
| ISO/IEC 17043 (provider) | A scheme plan before a round; homogeneity and stability before dispatch; instructions and a deadline with the panel; participants see codes, never each other's identity; submitted data unchanged |
| ISO 13528 (statistics) | z = (x - x_pt) / sigma_pt; robust assigned value (Algorithm A) so one gross error does not move it; abs(z) <= 2 satisfactory, 2 < abs(z) < 3 questionable, abs(z) >= 3 unsatisfactory |
| CLIA 42 CFR 493.801, 493.823 | PT handled like patient samples, no referral; results not returned by the deadline score 0 and count as unsatisfactory |
| ISO 15189 7.3.7.3, SLIPTA v3 8.21, WHO LQMS ch.10 | Every unacceptable result gets a documented cause and corrective action; review every evaluation |
| GLI blinded rechecking, ISO 15189 6.2 | Blinded in-house samples look like routine work; competency is credited to the person who did the test |

## Provider lane (TC-EQAP)

Eight QA laboratories (A to H), a regional PT scheme on Glucose and Creatinine, one round to labs A to G (H is withdrawn). Samples GLU-L1, GLU-L2 (statistical scoring) and CRE-S3 (sealed range 80 to 120).

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-EQAP-00 | Setup: eight QA labs, the scheme, its tests | Guard | |
| TC-EQAP-01 | An external scheme needs a provider; an in-house one does not | Guard | 17043 |
| TC-EQAP-02 | Roster: suspend, reinstate, withdraw for good; enrolling a lab twice is refused | Guard | 17043 |
| TC-EQAP-15 | The round wizard refuses duplicate sample codes | Guard | |
| TC-EQAP-16 | It refuses an acceptance range whose low is above its high | Guard | |
| TC-EQAP-17 | It refuses a laboratory that is not enrolled (H, withdrawn) | Guard | |
| TC-EQAP-18 | It refuses a submission deadline before the distribution date (today the API accepts it, 201; the wizard's date range picker prevents it on screen) | Tripwire | 17043 7.3.5.2 |
| TC-EQAP-19 | It refuses a panel sample for a test the scheme does not cover (today the API accepts it; the wizard's list offers only the scheme's tests) | Tripwire | 17043 7.2.1.3; seen on OGC-1251 |
| TC-EQAP-03 | The round is created with three samples and seven labs, in preparation; the scheme type cannot change once a round runs | Guard | |
| TC-EQAP-04 | Nothing ships before homogeneity QC passes and enough aliquots exist | Guard | 17043 7.3.2.3 |
| TC-EQAP-05 | Results are refused before dispatch; shipping and delivery to all seven open submissions | Guard | |
| TC-EQAP-06 | Intake: two levels of one test need the sample named; A to F report, G does not | Guard | |
| TC-EQAP-07 | Every z equals (x - mean) / SD recomputed from the intake, and the verdict follows the ISO 13528 bands (the exact 2.00 case is TC-EQAP-21) | Guard | 13528 9.4 |
| TC-EQAP-20 | Peer-scored samples (no sealed range): a lab reporting ten times the others is unacceptable (today z = 2.04, Questionable: plain mean and SD, so with fewer than 11 labs an outlier cannot reach abs(z) 3; a sealed range scores it correctly) | Tripwire | 13528 robust statistics; OGC-1478 |
| TC-EQAP-21 | abs(z) = 2.00 exactly is satisfactory (GLU-L2 puts lab F at z 2.00; today Questionable) | Tripwire | 13528 9.4; OGC-1478 (ruled 13 Oct: follow ISO) |
| TC-EQAP-08 | A sealed range is inclusive: 80 and 120 pass, 79.99 and 120.01 fail | Guard | |
| TC-EQAP-09 | A lab that never reports is scored as not submitted (today no score row and no follow-up) | Tripwire | CLIA 493.823(b); OGC-1480 |
| TC-EQAP-10 | One follow-up per lab with an unacceptable result (C and D only); Record response needs text and keeps it | Guard | OGC-1256 |
| TC-EQAP-25 | A lab's contact email is set on its organization record (Locations form) and reads back | Guard | OGC-1265 |
| TC-EQAP-11 | Notify lab uses that email and, with no mail server, says plainly nothing was emailed | Guard | OGC-1265 |
| TC-EQAP-23 | Record response on the register: a "What the laboratory said" field, Confirm disabled while empty, the text shown after a reload | Guard | OGC-1256 |
| TC-EQAP-24 | Resolve needs a written reason (today blank notes are accepted; Remove from scheme too, by code) | Tripwire | 17043; SLIPTA 8.21 |
| TC-EQAP-22 | The round cannot close with an open follow-up; it closes once both are resolved | Guard | |
| TC-EQAP-12 | A participant's report (PDF) and score CSV name only that lab | Guard | 17043 4.2.5 |
| TC-EQAP-13 | Once scored, results and scores are read-only | Guard | 493.903(a)(3) |
| TC-EQAP-14 | A Reception user cannot act as the provider (403) | Guard | |

## Participant lane (TC-EQAPT)

This laboratory enrolled in a regional scheme on Glucose that asks for a cycle-level review. Cycle 1 has two panel items (PT-A, PT-B); cycles 2 and 3 have one each (PT-C, PT-D), so each submission case starts from a cycle that is ready to submit.

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-EQAPT-00 | Setup: two regional schemes on Glucose | Guard | |
| TC-EQAPT-01 | Enrolling in a scheme fills in its tests and says it was saved | Guard | OGC-1260 |
| TC-EQAPT-13 | Picking the scheme before the test list has loaded still fills its tests (today the enrollment saves with no tests) | Tripwire | OGC-1476 |
| TC-EQAPT-02 | A cycle is opened; a damaged panel cannot be received without a note | Guard | 493.901(c)(6) |
| TC-EQAPT-03 | Two panel items are received through Add Order and linked to the cycle | Guard | 493.801(b) |
| TC-EQAPT-04 | Enter Order (v4) offers exactly this lab's active enrollments (`/rest/eqa/my-programs?active=true`) as the EQA scheme | Guard (was a tripwire; fixed 15 Oct, OGC-1483, #4731) | |
| TC-EQAPT-05 | Once both results are validated the cycle is Ready to submit within 30 seconds | Guard | OGC-1257 |
| TC-EQAPT-06 | Review & submit double-clicked sends one request, no 500, and the screen says it went | Guard | OGC-1255 |
| TC-EQAPT-14 | Two Review & submit calls at once: one 200, one 409, no 500 | Guard | OGC-1255 |
| TC-EQAPT-15 | A manual submission needs the provider's reference | Guard | |
| TC-EQAPT-16 | Submit by hand is refused while nothing on the cycle is validated (400) | Guard | |
| TC-EQAPT-07 | A submission two days after the deadline is refused or marked late (today accepted, 200) | Tripwire | CLIA 493.823(c); OGC-1479 |
| TC-EQAPT-08 | Submitting a second time is refused cleanly; a submitted result cannot go back to draft | Guard | 493.903(a)(3) |
| TC-EQAPT-09 | Score import: a Results user gets 403; two samples of one analyte need sample_code | Guard | |
| TC-EQAPT-10 | Scores land on the right sample; This Lab's Follow-Up shows each sample's own value and target | Guard | OGC-1244 |
| TC-EQAPT-11 | abs(z) under 3 is queued for a person; no NCE opens by itself | Guard | |
| TC-EQAPT-17 | Dismissing an unacceptable result without notes is refused (today it resolves with a category alone) | Tripwire | SLIPTA 8.21d-e |
| TC-EQAPT-12 | Eight EQA screens say "scheme", not "program" (English) | Guard | OGC-1261 |
| TC-EQAPT-18 | The Add scheme modal and the server's messages say "scheme" too (today "Program name is required", and the create form is labelled "Enroll in a new ... scheme") | Tripwire | OGC-1477 |

## In-house blinding (TC-EQAIH)

An in-house Glucose scheme with qa_labtech and qa_validator on its roster; three blinded samples (S01 within range, S02 outside, S03 never run), round-robin assignment.

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-EQAIH-00 | Setup: the scheme and its two-analyst roster | Guard | |
| TC-EQAIH-01 | The wizard seals and distributes three samples; the sealed screen names both analysts | Guard | OGC-1245 |
| TC-EQAIH-08 | Each blinded order uses its blind code as the lab number and carries its sealed analyst | Guard | OGC-1245 |
| TC-EQAIH-02 | Results shows a blinded sample without its sealed target or range (ruled 13 Oct: the target is blinded, not the sample, so the EQA tag is fine) | Guard | OGC-1249 |
| TC-EQAIH-03 | Results asks no one to pick an analyst for a blinded sample (ruled 13 Oct: the sealed analyst is responsible, whoever enters the result) | Guard | OGC-1245 |
| TC-EQAIH-04 | The sealed targets are hidden from the bench until unblinding; unblind is 403 for a Results user | Guard | 17043 7.2.3.5 |
| TC-EQAIH-05 | Results entered and validated; unblinding scores S01 acceptable, S02 unacceptable, S03 missed | Guard | |
| TC-EQAIH-06 | Competency credits each result to its sealed analyst, not to admin who typed it | Guard | OGC-1245; 15189 6.2 |
| TC-EQAIH-07 | After a transcription dismissal each analyst's failure count equals the rows marked Failure | Guard | OGC-1252 |

## Not covered here

- OGC-1481 (EQA samples in critical callback compliance and the callback prompt): Glucose has no critical range on the local stack; found in code.
- Submit by hand on a cycle with only part of its panel validated: the code allows it (the automatic path waits for all). Ruled 13 Oct: allowed as is.
- OGC-1261 in other languages: translations come through Transifex.
- Event score, ungraded challenges, 2 of 3 unsatisfactory events, z' and fixed-limit rules (ISO 13528 9.5, CLIA 493.931): the product has no such features yet.
