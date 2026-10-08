# Clinical Order Entry v4: acceptance and handoff test cases

**Specs:** `tests/order-entry-v4-acceptance.spec.ts`, `tests/order-entry-v4-handoff.spec.ts` (helper `helpers/order-entry-v4.ts`)
**Written:** 2026-10-08 against local develop 76c6d625a (images 2026-10-08 04:22 UTC), on Casey's ask to test the new order entry page.
**Scope:** the four v4 tickets In Review (OGC-1419, OGC-1422, OGC-1423, OGC-1424, epic OGC-1266), then the 25 Sep order entry QA handoff (`order-entry-qa-handoff-for-spec.md`: R-NET, R-DATA, R-TIME, R-FLOW, R-UX) and the regression gate (G1 to G11) of `clinical-order-entry-v4-acceptance-tests.md`, re-run on the v4 screens.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the spec, carries `test.fail()` while v4 differs, and goes red the day it is fixed (delete the marker then). Cases create QA patients (`Qaoev...`, national IDs `QAOEV...`) and orders.

## Tickets In Review

| ID | Case | Kind | Ticket / spec |
| --- | --- | --- | --- |
| TC-OEV4-COL-01 | No collector: the To continue checklist never asks for one and Save and next saves | Guard | OGC-1419 AC 1, 2, 6 |
| TC-OEV4-COL-02 | Collector has no asterisk, no required, no aria-required | Guard | OGC-1419 AC 3 |
| TC-OEV4-COL-03 | A collector saves and reads back; clearing it stores blank | Guard | OGC-1419 AC 4 |
| TC-OEV4-LBL-01 | Print all labels returns one PDF with as many pages as the section's total | Guard | OGC-1422, FR-I2, FR-I6 |
| TC-OEV4-LBL-02 | A changed quantity is saved before printing; the row prints that many; it reloads as saved | Guard | OGC-1422, FR-I5, FR-I6 |
| TC-OEV4-LBL-03 | A quantity above the preset maximum is never stored | Guard | FR-I5 |
| TC-OEV4-LBL-04 | A failed PDF shows an error with Retry, and Retry prints | Guard | FR-I6 |
| TC-OEV4-LBL-05 | A blocked print window falls back to a download with a notification | Guard | FR-I6 |
| TC-OEV4-LBL-06 | No label status and no help text naming the removed "Print More Sample Labels" control | Tripwire | FR-I6, FR-I7 |
| TC-OEV4-REF-01 | A staged referral is stored only with the step Save; a reload drops it | Guard | OGC-1423 AC 2 |
| TC-OEV4-REF-02 | One of two tubes referred: not fully referred, goes on to Sample check, Has referred tests only | Guard | OGC-1423 AC 4, 5 |
| TC-OEV4-REF-03 | Every tube referred: no Sample check, Referred Out on the dashboard, test leaves the worklist | Guard | OGC-1423 AC 3, 4 |
| TC-OEV4-REF-04 | Refer out all after one tube was referred adds only the other tube | Guard | OGC-1423 AC 1, FR-E3a |
| TC-OEV4-REF-05 | A failed save keeps the staged referral and stores nothing | Guard | FR-A5 |
| TC-OEV4-REF-06 | The referral table names the tube by lab number, not database id | Tripwire | FR-C2, FR-E2 |
| TC-OEV4-M14-01 | No print shortcut in the Order section | Guard | M14 step 1 |
| TC-OEV4-M14-02 | Swapped names: the existing patient is a possible match; Use this one selects it | Guard | M14 step 2, FR-B6a |
| TC-OEV4-M14-03 | National ID one character off is a possible match | Guard | FR-B6a |
| TC-OEV4-M14-04 | Create new anyway is confirmed (names the count) and recorded (201) | Guard | M14 step 3 |
| TC-OEV4-M14-05 | "<facility> Health Centre" lists the facility as a possible match | Guard | M14 step 4 |
| TC-OEV4-M14-06 | Patient search stays exact and prefix; never fuzzy | Tripwire | FR-B6a, D-216 |
| TC-OEV4-M14-07 | No fax fields while showFaxFields is off | Guard | M14 step 5 |
| TC-OEV4-M14-08 | Received by reads "(you)" with Change, which opens a user search | Guard | M14 step 8, FR-B23 |
| TC-OEV4-M14-09 | Mark tested elsewhere: purple Tag, value stored, Not tested elsewhere undoes it | Guard | M14 step 7, FR-B20 |
| TC-OEV4-M14-10 | Tested elsewhere opens a performing laboratory field | Guard | FR-B20 |
| TC-OEV4-M14-11 | One order-level Payment status, no paid marker per test | Guard | M14 step 9, FR-B28 |
| TC-OEV4-M14-12 | Retired fields gone from the clinical row; Handling group with the five Arrived as conditions | Guard | M14 step 10, FR-C9 |
| TC-OEV4-M14-13 | Arrived as below the requirement: one Handling mismatch Tag, NCE link, save not blocked | Guard | M14 step 11, FR-C9a |
| TC-OEV4-M14-14 | Same for all samples copies Arrived as and the temperature to every sample | Guard | M14 step 12 |
| TC-OEV4-M14-15 | In French, Prepare Samples shows no raw keys and the Handling group is translated | Tripwire | OGC-1424 i18n criterion |

## Handoff re-run (R-items) and regression gate

| ID | Case | Kind | Requirement (was) |
| --- | --- | --- | --- |
| TC-OEV4-NET-01 | A 5 s session outage during load recovers unnoticed | Guard | R-NET-1, G11 (TC-NET-01) |
| TC-OEV4-NET-02 | A 60 s outage shows Reconnecting, no dead-end modal, and recovers | Tripwire | R-NET-1, M12 (TC-NET-02) |
| TC-OEV4-NET-03 | One failed test-list load says so and offers Retry | Tripwire | R-NET-2, M12 (TC-NET-03) |
| TC-OEV4-NET-04 | A save that never reaches the server keeps the form and says not saved | Guard | R-NET-7, G8 (TC-NET-04) |
| TC-OEV4-NET-05 | A save whose response is lost can be retried: 200, no "in use" | Guard | R-NET-4 (TC-NET-05) |
| TC-OEV4-NET-06 | A slow save disables the button; a double click sends one request | Guard | R-NET-6, G9 (TC-NET-06) |
| TC-OEV4-NET-07 | An offline patient search says it failed | Tripwire | R-NET-2, M8 (TC-NET-07) |
| TC-OEV4-NET-08 | No New Patient before a successful search | Tripwire | R-NET-3, M8 step 1 |
| TC-OEV4-DATA-01 | One collected sample: one card, one label row, one stored sample | Guard | R-DATA-1 (TC-OEW-05) |
| TC-OEV4-DATA-02 | A panel member ticked alone saves no panel | Guard | R-DATA-2 (TC-OEW-03) |
| TC-OEV4-DATA-03 | Compatible sample types come from the catalog | Guard | R-DATA-3 (TC-OEW-04) |
| TC-OEV4-DATA-04 | A test-less sample cannot leave Prepare Samples, with a translated message | Tripwire | R-DATA-4 (TC-OEW-14) |
| TC-OEV4-DATA-05 | Back to Enter Order and forward keeps patient, test, collection date and time | Guard | R-DATA-5, G3 (TC-OEW-06, TC-OEW-12) |
| TC-OEV4-TIME-01 | Collection and received defaults come from one clock (browser in Port Moresby) | Guard | R-TIME-1 (TC-OEW-08) |
| TC-OEV4-TIME-02 | Today saves from a browser 10 h ahead of the server | Guard | R-TIME-2 (TC-OEW-07) |
| TC-OEV4-TIME-03 | Collection after receipt is flagged | Tripwire | R-TIME-3, M2 step 4 |
| TC-OEV4-TIME-04 | Order entry and its dashboard use one date format | Tripwire | R-TIME-4 |
| TC-OEV4-FLOW-01 | Arriving on Prepare Samples shows no "Unsaved changes" before any edit | Tripwire | R-FLOW-3 (TC-OWF-02) |
| TC-OEV4-FLOW-02 | Counter reads 1/3 and Enter Order shows done after its save | Guard | R-FLOW-2 (TC-ODB-02) |
| TC-OEV4-FLOW-03 | Pass, Accept sample, Release for testing: complete, Ready for testing, step done | Guard | R-FLOW-1, M6, G5 (TC-OEW-11) |
| TC-OEV4-FLOW-04 | Optional checklist: Release with items unanswered asks for a reason | Guard | M6 step 4 |
| TC-OEV4-FLOW-05 | Items answered Pass but not accepted are not called "unanswered" | Tripwire | R-UX-1, M6 |
| TC-OEV4-UX-01 | No raw i18n keys on Enter Order or Prepare Samples (English) | Guard | R-UX-1 |
| TC-OEV4-UX-02 | A disabled Save and next counts and lists what is missing; nothing is sent | Guard | R-UX-2, G1 (TC-OEW-01) |
| TC-OEV4-UX-03 | A duplicate lab number is refused in plain language; the other order is untouched | Guard | R-UX-1, G4 (TC-OEW-13) |
| TC-OEV4-GATE-02 | Saved requests match what was selected, per sample | Guard | G2 (TC-OEW-02) |
| TC-OEV4-GATE-06 | Dashboard Continue resumes at Prepare Samples | Guard | G6 (TC-OEW-16) |
| TC-OEV4-GATE-07 | Edit Order reads back sample, facility and received date | Guard | G7 (TC-EO-05) |

Not covered here: G10 (environmental end to end; see `ogc1192-env-order-visibility.spec.ts`), M2 clock-skew notice, M3 lab number audit, M5/M7/M13 layout items (preview), M9 configuration toggles, M10 label presets per test, P-phase slices, and the FRS pre-v4 read-only values ("Recorded before this version", M14 step 13: needs an order saved before v4 with specimen origin set).
