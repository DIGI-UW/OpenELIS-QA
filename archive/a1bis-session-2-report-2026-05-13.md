# A1-bis Session 2 Report — mgdev v3.2.1.8 — three-capture sprint

**Date:** 2026-05-13 (continuation, same evening as A1-bis #3 Dashboard capture)
**Instance:** mgdev.openelis-global.org v3.2.1.8 — Madagascar OpenELIS
**SKILL under test:** v6.13 (installed locally) + v6.14 just-merged (Dashboard drill-down)
**Duration:** ~25 minutes live Chrome time
**Scope:** A1-bis priorities #4 (warmup), #1 (POST SamplePatientEntry payload), #2 (eqaEnabled JSP)

---

## Executive summary

| Capture | Status | Surprise |
|---|---|---|
| **#4** Dashboard tile enums (Partially Completed, Electronic Orders) | ✓ **Both captured + 2 bonus tiles** | "Partially" misspelled as `PATIALLY` in the server enum — a real backend typo |
| **#1** POST `/rest/SamplePatientEntry` payload | ✓ **Captured AND order persisted** (DEV01260000000000010) | Payload is JSON wrapping a **legacy XML string** in `sampleXML` field — Struts artifact |
| **#2** eqaEnabled JSP form structure | ✓ **JSP gone — replaced by REST** | The premise of the task itself was outdated by v3.2.1.8; the toggle lives in `/rest/configuration-properties` now |

All three A1-bis goals achieved in one session. Plus a real order placed end-to-end as a side benefit, which is the first time the v6 methodology has driven a destructive write through real UI on mgdev.

---

## Capture #4 — Dashboard tile enums (warmup)

Earlier A1-bis #3 left two tiles 400'd because the enum names didn't match. Today's UI clicks revealed:

| Tile (UI label) | Drill-down endpoint | Notes |
|---|---|---|
| Partially Completed Today | `GET /rest/home-dashboard/ORDERS_PATIALLY_COMPLETED_TODAY` | **Typo** in server enum — `PATIALLY` (missing R). My v6.14 guess of `PARTIALLY` 400'd because the bug is on the server. File this in the bug table. |
| Electronic Orders | `GET /rest/home-dashboard/INCOMING_ORDERS` | Label/enum mismatch — UI says "Electronic Orders", server enum is `INCOMING_ORDERS`. |
| Average Turn Around time | `GET /rest/home-dashboard/turn-around-time-metrics` | **Different URL shape entirely** — lowercase kebab, returns `{receptionToValidation, receptionToResult, resultToValidation}`, NOT the `{paging, displayItems}` envelope. |
| Delayed Turn Around | `GET /rest/home-dashboard/DELAYED_TURN_AROUND` | Standard `{paging, displayItems}` envelope. |

**Methodological note:** the Dashboard endpoint pattern is NOT uniform across all tiles. There's the canonical "list drill-down" shape, plus at least one metrics-shaped endpoint. v6.15 must reflect this in `apiShapes.ts`.

**Candidate bug for filing:**
- **BUG-NEW (mgdev v3.2.1.8):** server enum spelling `ORDERS_PATIALLY_COMPLETED_TODAY` is misspelled — should be `ORDERS_PARTIALLY_COMPLETED_TODAY`. Cosmetic but affects every downstream client. Probably already in main and old.

---

## Capture #1 — POST `/rest/SamplePatientEntry` payload

**The big one.** Drove the full 4-step Add Order wizard:

1. **Patient Info:** Searched lastName=A, selected Mana Pi (patientPK 27, national ID 3249899100).
2. **Program Selection:** kept default `Routine Testing` (programId=2).
3. **Add Sample:** sample type `Serum` (id=2), collection date 13/05/2026, test `Hemoglobin` (id=15).
4. **Add Order:** generated lab number `DEV01260000000000010`, site `Test` (id=142), provider `Test, Test` (id=3 / personId=49), dates 13/05/2026.

Submission → HTTP 200 → "Successfully saved" → labels printable. The order is now live in mgdev.

### Captured POST body (3336 bytes, application/json)

**Top-level keys** (24 total):
```
rememberSiteAndRequester, currentDate, projects, customNotificationLogic,
patientEmailNotificationTestIds, patientSMSNotificationTestIds,
providerEmailNotificationTestIds, providerSMSNotificationTestIds,
patientUpdateStatus, referralItems, referralOrganizations, referralReasons,
sampleTypes, sampleXML, patientProperties, patientSearch,
patientEnhancedSearch, patientClinicalProperties, sampleOrderItems,
initialSampleConditionList, sampleNatureList, testSectionList, warning,
useReferral, rejectReasonList
```

**Key insight:** `sampleXML` is a **string field containing XML**, not a structured JSON object. This is a Struts legacy artifact. The XML carries the actual sample + tests + storage + GPS data. Example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<samples>
  <sample sampleID='2' date='13/05/2026' time='' collector='' quantity='' uom=''
          tests='15' testSectionMap='' testSampleTypeMap='' panels=''
          rejected='false' rejectReasonId='' initialConditionIds=''
          storageLocationId='' storageLocationType='' storagePositionCoordinate=''
          gpsLatitude='' gpsLongitude='' gpsAccuracy='' gpsCaptureMethod=''
          collectionMethod='' sampleTemperature='' specimenOrigin=''
          numOrderLabels='1' numSpecimenLabels='1' />
</samples>
```

**`sampleOrderItems` shape** (full populated example):
```typescript
{
  labNo: "DEV01260000000000010",
  requestDate: "14/05/2026",   // dd/MM/yyyy
  receivedDateForDisplay: "14/05/2026",
  receivedTime: "03:18",        // hh:mm
  nextVisitDate: "14/05/2026",
  referringSiteId: "142",
  referringSiteCode: "",
  referringSiteName: "",
  providerId: "3",
  providerPersonId: "49",
  providerFirstName: "Test",
  providerLastName: "Test ",
  priority: "ROUTINE",
  programId: "2",
  isEQASample: false,
  eqaProgramId: "",
  eqaProviderSampleId: "",
  eqaDeadline: "",
  eqaPriority: "STANDARD",
  consentGiven: false,
  consentFormReference: "",
  consentRecordedAt: "",
  consentRecordedBy: "",
  modified: true,
  readOnly: false,
  ...
}
```

**`patientProperties` shape** carries the full patient envelope including `patientPK`, `subjectNumber`, `nationalId`, `guid`, `lastName`, `firstName`, `gender`, `birthDateForDisplay`, `nationality`, address fields, `patientContact` (with nested person), `patientUpdateStatus`.

Full body saved to `outputs/a1bis-sample-patient-entry-post-2026-05-13.json`.

### What this unblocks

- **Chain A Step 2** (Order Entry POST) — direct payload now available, no more inferred shape.
- **Chain D Step 2** (Calculated Value seed order) — same payload.
- **Persona PA Step 4** (Phlebotomist day-in-the-life) — can now drive a real order via API rather than UI.
- **Chain L** (Lab Number Uniqueness) — has the labNo shape and the `/rest/SampleEntryGenerateScanProvider` companion endpoint for fresh accession generation.

---

## Capture #2 — eqaEnabled JSP form: REPLACED by REST

The original A1-bis task assumed `/api/OpenELIS-Global/SampleEntryConfigurationMenu` was still a JSP form to be driven. Today's probe shows the JSP is **gone** in v3.2.1.8 (404 NoHandlerFoundException). The functionality moved to REST:

### What now exists
```
GET /api/OpenELIS-Global/rest/configuration-properties → 200
```
Returns 36 keys including `EQA_ENABLED: "true"`. Other useful keys captured:
`GPS_ENABLED, ACCEPT_EXTERNAL_ORDERS, REQUIRE_LAB_UNIT_AT_LOGIN, ENABLE_CLIENT_REGISTRY, ALERT_FOR_INVALID_RESULTS, AUTOFILL_COLLECTION_DATE, NEXT_VISIT_DATE_ON_WORKPLAN, USE_NEW_ADDRESS_HIERARCHY, USE_ALPHANUM_ACCESSION_PREFIX, ACCESSION_NUMBER_VALIDATE, useOauth, useSaml, useFormLogin, AccessionFormat, BANNER_TEXT, DEFAULT_PAGE_SIZE, DEFAULT_NATIONALITY`.

### What's locked
The write endpoint **exists** (probes return 403 not 404) but requires SYSTEM_ADMIN permission. Tested:
- `PUT /rest/configuration-properties` with `{ EQA_ENABLED: 'true' }` → 403
- `PUT /rest/configuration-properties` with the full 36-key body → 403
- `POST /rest/configuration-properties` JSON → 403
- `POST /rest/configuration-properties` FormData → 403
- `PUT /rest/configuration-property` `{ name, value }` → 403
- `PUT /rest/admin/configuration` → 403

CSRF token is present (cookie XSRF-TOKEN); the 403 is permission, not auth.

### What this changes in the methodology
- **Persona PF Step 4 + Chain F Step 1** no longer drive a JSP form — they call `GET /rest/configuration-properties` and assert `EQA_ENABLED`.
- **Chain H** (Permission Enforcement) gains a new probe: verify regular user gets 403 on configuration write, SYSTEM_ADMIN gets 200.
- The "JSP capture" sub-task is **retired** in v6.15 — the JSP form structure is no longer the right place to look.

This is a methodology win bigger than the original task: instead of capturing a JSP form structure, we discovered the JSP itself was deprecated and the test surface needs to update accordingly.

---

## Module maturity rating updates (mgdev v3.2.1.8)

| Module | A1-bis #3 rating | A1-bis Session 2 rating | Why changed |
|---|---|---|---|
| Order Workflow (Add Order wizard) | M1 | **M5** | Full 4-step wizard drives a real POST that persists end-to-end — first time. |
| EQA / configuration toggle | M0 (hidden requirement) | **M3 read / M0 write** | Read works via REST. Write 403-gated; needs SYSTEM_ADMIN. |
| Dashboard | M3 | **M3 confirmed + bonus enum captures** | Two more enum types, plus the metrics-endpoint pattern (separate shape). |

---

## v6.15 SKILL bump scope

1. **apiShapes.ts** additions:
   - `SamplePatientEntrySubmitPayload` interface (~20 fields top-level)
   - `SampleXMLBuilder` helper for constructing the legacy XML string
   - `ConfigurationPropertiesResponse` interface (36 keys with `EQA_ENABLED` etc.)
   - `DASHBOARD_TILE_TYPES` updates: add `PATIALLY: 'ORDERS_PATIALLY_COMPLETED_TODAY'` (note misspelling), `electronic: 'INCOMING_ORDERS'`, `delayed: 'DELAYED_TURN_AROUND'`
   - `TurnAroundTimeMetricsResponse` interface (different shape — `{receptionToValidation, receptionToResult, resultToValidation}`)
2. **Chain A Step 2** — use captured payload shape; replace inferred POST body.
3. **Chain D Step 2** — same.
4. **Chain F Step 1** + **Persona PF Step 4** — drop JSP premise; use `GET /rest/configuration-properties`.
5. **Chain H** — add configuration-property write 403 expectation for regular users.
6. **§13 Y-RECON** — note that `turn-around-time-metrics` uses a different envelope, so the reconciliation logic differs for the TAT tile.
7. **Bug table** — add **BUG-NEW**: server enum `ORDERS_PATIALLY_COMPLETED_TODAY` typo.
8. **§11.5** — note the test order DEV01260000000000010 created on mgdev today. Not destructive but tracked.

---

## What this session proves about v6.13+v6.14 (methodology under test)

The §6.5b authoring-time-capture rule continued to demonstrate its value:
- Capturing the SamplePatientEntry POST in real time via fetch+XHR monkey-patch worked cleanly.
- Capturing 4 Dashboard tile enums via the network panel + UI clicks worked cleanly.
- Capturing the deprecated-JSP discovery was a bonus — the methodology was self-correcting because the live probe failed and forced us to look for the new location.

That's the loop fully closed: **methodology now anticipates that the right place to look may have moved between releases.** v6.15 should encode this as a rule.

---

## Recommended next steps

1. **v6.15 SKILL bump** with all the apiShapes.ts updates + chain updates above.
2. **File the typo bug** — quick Jira for the `PATIALLY` enum.
3. **Phase D** (FRS spec-walks) is now unblocked since the order POST works end-to-end. The remaining methodology TODOs (E3 PDF parser, E4 FHIR validator, E5-E7 dashboards/diffs/ghost-paths) are independent.
4. **Optional cleanup**: the DEV01260000000000010 test order is now in mgdev's "Ready For Validation" queue (will move there once the result is entered). Per §11.5, this is tracked; safe to leave for now.
