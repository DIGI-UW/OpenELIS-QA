# CPHL PNG field report (8 Nov 2026): test cases

**Spec:** `tests/cphl-field-report.spec.ts` (config `cphl.config.ts`)
**Written:** 2026-11-10 against testing.openelis-global.org (develop c470bd68, 3.4.0-SNAPSHOT, site date format fr-FR), from the CPHL PNG field report Karen forwarded on 8 Nov (JDHS Production). The findings were reproduced on testing on 9 Nov and filed on Casey's calls. Two runs, 16 of 16 as expected. 10 Nov on cb17cfcb: OGC-1613 and OGC-1614 fixed; their tripwires are guards, TC-CPHL-32 and 50 added.

**Scope:** the filed findings only: environmental compliance eligibility and grading, removing a test from an environmental order, the Results entry Method list, and date filters. Micro items from the report go to the v3 redesign (R-14) and are not here.

Kind: **Guard** passes today and protects the path. **Tripwire** asserts the intended behaviour, carries `test.fail()` while develop differs, and goes red ("Expected to fail, but passed") the day it is fixed; then delete the marker. Each tripwire has a guard over the same path.

Data: the spec seeds, once per server, two environmental tests on Surface Water ("QA CPHL FreeCl Range" with a RANGE threshold of 0.2 to 5 mg/L, and "QA CPHL FreeCl MinMax" with MINIMUM 0.2 and MAXIMUM 5 mg/L) and the standard "QA CPHL Water Standard". Every case creates its own orders; results go in through LogbookResults and are validated with `validateOnly`.

## Compliance Report eligibility (OGC-1620)

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-01 | A fully resulted, validated order is listed, graded Compliant, offered Generate PDF on the screen, and exportPdf returns a PDF | Guard | OGC-552 |
| TC-CPHL-02 | An order with one saved but unvalidated result and one test with no result is not eligible, and exportPdf does not return a certificate | Tripwire | OGC-1620 |

## Compliance grading (OGC-1615)

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-10 | RANGE 0.2 to 5: 6.0 is Non-compliant and 3.0 is Compliant | Guard | OGC-547 |
| TC-CPHL-11 | RANGE 0.2 to 5: 0.1, below the minimum, is Non-compliant (today Borderline) | Tripwire | OGC-1615 |
| TC-CPHL-12 | MINIMUM 0.2 plus MAXIMUM 5 on one test: 7.0 is Non-compliant (today Compliant; only the first threshold is read) | Tripwire | OGC-1615 |
| TC-CPHL-13 | MINIMUM 0.2 plus MAXIMUM 5 on one test: 0.05 is Non-compliant (the first threshold is read) | Guard | OGC-1615 |

## Removing a test from an environmental order (OGC-1613)

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-20 | Environmental dashboard, Continue, Enter Order, Tests & Panels: unticking a test with no result saves (200) | Guard | OGC-1613 |
| TC-CPHL-21 | The same path with a resulted test: the first save answers 400 and "Remove a test that has results" asks for a reason (no raw "cancelReason" shown); with "Duplicate order" the resend saves and the test leaves Results entry while the other stays | Guard (was a tripwire; fixed by #5006, 10 Nov) | OGC-1613 |

## Results entry Method list (OGC-1614)

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-30 | Creatinine on Results entry: the expanded row has a Method list with at least one method | Guard | OGC-1614 |
| TC-CPHL-31 | The Method list settles on Creatinine's linked active methods, A to Z (polled: the row first shows the full list) | Guard (was a tripwire; fixed by #5007, 10 Nov) | OGC-1614 |
| TC-CPHL-32 | A test with no linked method: `methods-for-test` offers every active method, A to Z, and no default | Guard | OGC-1614 |

## Site Information: a translated setting saves (OGC-1609)

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-50 | bannerHeading: Modify, change English, Save: 200, "Configuration Updated Successfully", the header shows it after a reload and the stored value matches; the banner is put back afterwards | Guard (fixed by #5003, 10 Nov) | OGC-1609 |

## Date filters follow the site date format (OGC-1616)

The expected placeholder comes from `DEFAULT_DATE_LOCALE`: mm/dd/yyyy for en-US, dd/mm/yyyy otherwise. The tripwires skip on an en-US site, where they cannot tell the two apart.

| ID | Case | Kind | Ticket |
| --- | --- | --- | --- |
| TC-CPHL-40 | Validation From date shows the site format | Guard | OGC-1616 |
| TC-CPHL-41 | Sample Shipment date filter shows the site format (today mm/dd/yyyy) | Tripwire | OGC-1616 |
| TC-CPHL-42 | Shipment Report date filter shows the site format (today mm/dd/yyyy) | Tripwire | OGC-1616 |
| TC-CPHL-43 | Reference Lab Results date filter shows the site format (today mm/dd/yyyy) | Tripwire | OGC-1616 |
| TC-CPHL-44 | Compliance Report date filter shows the site format (today yyyy-mm-dd) | Tripwire | OGC-1616 |

## Not covered

- OGC-1617 and OGC-1619 are stories; their cases come when they are built.
- The certificate letterhead and label text (comment on OGC-552), the manifest Sample Type clipping (OGC-527) and the unsorted Sample Type list (OGC-1266) are comments on open tickets, not covered here.
- With e-signatures off on testing, no order counts as released, so Reissue and the archive path are not exercised (noted on OGC-1620).
