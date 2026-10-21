# Order entry off the happy path: test cases

**Spec:** `tests/order-entry-off-happy-path.spec.ts`
**Written:** 2026-09-29, after Casey's report from the JD training server (3.2.2.0) that Add Order test search "sometimes works, sometimes doesn't" and the screen "whited out".

These cases combine actions a user really makes (tick then untick, change the sample type after picking tests, Next then Back, add then remove samples, a request that fails while the screen waits) and check that what is on screen matches what the order will carry. Add Order and Enter Order cases save nothing (writes are aborted); Modify Order cases seed their own QA order and abort the Submit.

Guards run the same screens on the happy path. When a guard is red, the tripwires in its group are not trustworthy. Tripwires carry `test.fail()` until the ticket is fixed.

| ID | Case | Screen | Kind | Ticket |
| --- | --- | --- | --- | --- |
| TC-OEX-00 | A ticked test reaches Result Reporting | Legacy Add Order | Guard | |
| TC-OEX-01 | An unticked test is not ordered | Legacy Add Order | Guard (fixed 8 Oct) | OGC-1388 |
| TC-OEX-02 | Next then Back keeps an unticked test unticked | Legacy Add Order | Guard (fixed 8 Oct; red since the 13 Oct Transifex round labels Back "Analyser Types", unfiled) | OGC-1388 |
| TC-OEX-03 | Changing the sample type drops the old test from the order | Legacy Add Order | Guard (fixed 8 Oct) | OGC-1388 |
| TC-OEX-04 | Test search follows a sample type change | Legacy Add Order | Guard (fixed) | OGC-1387 |
| TC-OEX-05 | A failed tests request keeps the order screen | Legacy Add Order | Tripwire | OGC-1389 |
| TC-OEX-10 | The chosen sample type's tests are listed | Enter Order (v4) | Guard | |
| TC-OEX-11 | A late response for the previous sample type does not replace the list | Enter Order (v4) | Guard (passing 21 Oct) | OGC-1266 |
| TC-OEX-12 | A failed tests request does not leave "Loading" forever | Enter Order (v4) | Guard (passing 21 Oct) | OGC-1266, OGC-1443 |
| TC-OEX-20 | A test on Sample 1 is submitted | Modify Order | Guard | |
| TC-OEX-21 | A sample added with Add Sample is submitted when Sample 1 is empty | Modify Order | Guard (fixed) | OGC-1406 |
| TC-OEX-22 | An unticked test is not submitted | Modify Order | Tripwire | OGC-1388 |
| TC-OEX-23 | A failed tests request does not blank the screen | Modify Order | Guard (fixed) | OGC-1389 |
| TC-OEX-30 | The missing-test warning names the sample and its type ("Sample 2: <type> has no test") | Legacy Add Order | Guard (added 21 Oct) | #4757 |
| TC-OEX-31 | The labels table names each sample "Sample N: <type>", as Result Reporting does | Legacy Add Order | Guard (added 21 Oct) | #4757 |
