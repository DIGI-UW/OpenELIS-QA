# Test Catalog: chaos (non-happy path)

**Spec file:** `test-catalog-chaos.spec.ts` (collected by `all-tc.config.ts`, project `test-catalog`).
**Target:** local develop, images 2026-10-01. **Written:** 2026-10-02.

What the user sees, and what the server keeps, when an editor save fails, races another editor, or carries values the server should refuse. Faults are injected with `page.route` on the one request under test, so nothing breaks for anyone else on the instance. Each case seeds its own inactive "QA Chaos" test.

Every save-fault case asks four questions: was the user told, is the typing still on screen, is the server unchanged, and does a plain retry work.

## Basic Info

| ID | Case | Expected |
| --- | --- | --- |
| CHAOS-BI-01 | Save meets a 500 with a JSON body | Error notification, no success; typing kept; Save enabled; server unchanged; retry saves |
| CHAOS-BI-02 | Save meets a 500 with an HTML error page | Same |
| CHAOS-BI-03 | Save meets a dropped connection | Same |
| CHAOS-BI-04 | Save gets a login page instead of JSON | Same |
| CHAOS-BI-05 | Two editors: B saves, then A saves an old copy | 409; the stale banner with Refresh; A's typing kept; Save disabled; B's value stands |
| CHAOS-BI-06 | Markup and an `onerror` image in the description | Stored and shown as text; the handler never runs; no image injected; no dialog |
| CHAOS-BI-07 | TRIPWIRE: description longer than 255 characters | Should be a 400; today a 500 (`test.description` is varchar 255, no length check) |
| CHAOS-BI-08 | Save without `lastupdated` | Recorded only: answers 200, so API clients that omit it skip the stale check. The UI always sends it |

## Ranges

| ID | Case | Expected |
| --- | --- | --- |
| CHAOS-RG-01 | TRIPWIRE: API, normal low above normal high | Should be a 400; today stored with a 200 |
| CHAOS-RG-02 | TRIPWIRE: API, normal range wider than the valid range | Should be a 400; today stored with a 200 |
| CHAOS-RG-03 | Add range dialog, bounds out of order | Dialog stays open with an error; nothing sent; nothing stored |
| CHAOS-RG-04 | Double-click on the section Save | Exactly one range stored |
| CHAOS-RG-05 | Ranges save meets a 500 | Error notification; the unsaved range stays listed; nothing stored; retry saves |
| CHAOS-RG-06 | Range saved with blank critical bounds | Reads back with no critical bounds and no `Infinity` in the JSON |
| CHAOS-RG-07 | API, a non-number in a bound | 400; nothing stored |

## Settled while writing (not a defect)

A blank low critical is stored as `+Infinity` in `result_limits.low_critical`, which looked like a wrong sign. It is the `ResultLimit` default meaning "unset". Every reader (`ValidationSignals`, `ResultAlertFlags`, `CriticalRangeFormat`, `PatientResultTreeService`, the critical callback check) tests `Double.isFinite` before comparing, and the REST read omits it. CHAOS-RG-06 pins the API side.
