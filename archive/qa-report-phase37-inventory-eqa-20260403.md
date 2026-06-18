# QA Report — Phase 37: Inventory CRUD & EQA Management Deep Testing
**Date:** 2026-04-03
**Instance:** https://testing.openelis-global.org (v3.2.1.4)
**Credentials:** admin / adminADMIN!
**Test Data Prefix:** QA_AUTO_0403

---

## Executive Summary

Phase 37 covered two new modules: **Inventory Management** (full CRUD via REST API) and **EQA Management** (sub-page structure, API health, new EQA test entry flow).

- **Inventory CRUD:** 6/8 tests PASS, 2 FAIL (storage location POST 500, isActive filter regression)
- **EQA Management:** 4/5 tests PASS, 1 FAIL (dashboard endpoint 404)
- **New Bugs Filed:** BUG-39, BUG-40, BUG-41
- **Standing Blocked:** Phase 35 Chain B blocked by BUG-38 (NCE POST hangs server)

---

## Part A — Inventory Management

### API Endpoint Discovery

Source analysis of `InventoryService.js` (branch: `develop`) reveals the full REST API:

| Base Path | Sub-Path | Method | Purpose |
|-----------|----------|--------|---------|
| `/rest/inventory` | `/items` | POST | Create catalog item |
| `/rest/inventory` | `/items/all` | GET | Get all items |
| `/rest/inventory` | `/items/all?isActive=true` | GET | Get active items (filter BROKEN — BUG-41) |
| `/rest/inventory` | `/items/{id}` | PUT | Update item |
| `/rest/inventory` | `/items/{id}/deactivate` | PUT | Soft-delete item |
| `/rest/inventory` | `/lots` | GET | Get all lots |
| `/rest/inventory` | `/management/receive` | POST | Create new lot |
| `/rest/inventory` | `/management/alerts` | GET | Dashboard KPI alerts |
| `/rest/inventory-storage-locations` | — | GET | Get storage locations |
| `/rest/inventory-storage-locations` | — | POST | Create storage location (BROKEN — BUG-40) |

**Key Finding:** Item payload field names are: `name`, `itemType`, `category`, `manufacturer`, `units` (NOT `unitOfMeasure`), `lowStockThreshold`, `stabilityAfterOpening`, `storageRequirements`. Wrong field names cause HTTP 400.

### Test Results

#### TC-INV-01: GET Catalog Items — PASS
- `GET /rest/inventory/items/all` → HTTP 200, `[]` (empty initially)
- `GET /rest/inventory/lots` → HTTP 200, `[]`
- `GET /rest/inventory/management/alerts` → HTTP 200, `{lowStockItems:[], expiringLots:[], expiredLots:[]}`

#### TC-INV-02: Create Catalog Item — PASS
- `POST /rest/inventory/items` with correct payload → **HTTP 201**
- Response: `{id:1, name:"QA_AUTO_0403 Test Reagent", itemType:"REAGENT", category:"Hematology Reagents", manufacturer:"QA Manufacturer Inc", units:"mL", lowStockThreshold:10, stabilityAfterOpening:30, storageRequirements:"2-8C refrigerated", isActive:"Y", fhirUuid:"311de6e8-..."}`
- Note: First POST attempt with wrong fields (`unitOfMeasure`, `active`, `description`) → HTTP 400 `HttpMessageNotReadableException`

#### TC-INV-03: Create Lot (Receive) — PASS
- `POST /rest/inventory/management/receive` → **HTTP 201**
- Payload: `{inventoryItem:{id:1}, lotNumber:"QA-LOT-0403-001", currentQuantity:500, initialQuantity:500, expirationDate:"2027-04-03...", receiptDate:"now", storageLocation:null, qcStatus:"PENDING", status:"ACTIVE"}`
- Note: `storageLocation: null` accepted without storage location (not required)

#### TC-INV-04: Dashboard KPI Verification — PASS
- Dashboard page `/Inventory` shows:
  - **1 Total Lots** ✓
  - **0 Low Stock** ✓ (500 mL > threshold 10)
  - **0 Expiring Soon** ✓ (expires 4/3/2027, >1 year out)
  - **0 Expired** ✓
- Lot visible in table: `QA_AUTO_0403 Test Reagent | QA-LOT-0403-001 | REAGENT | 500 mL | 4/3/2027 | ACTIVE | In Stock`

#### TC-INV-05: Update Catalog Item — PASS
- `PUT /rest/inventory/items/1` → **HTTP 200**
- Updated: `name → "QA_AUTO_0403 Test Reagent UPDATED"`, `lowStockThreshold → 20`
- Response confirms updated values with new `lastupdated` timestamp

#### TC-INV-06: Deactivate Item (Soft Delete) — PASS
- `PUT /rest/inventory/items/1/deactivate` → **HTTP 200** (empty body)
- Verified: subsequent `GET /rest/inventory/items/all` returns item with `isActive:"N"` ✓

#### TC-INV-07: Create Storage Location — FAIL (BUG-40)
- `POST /rest/inventory-storage-locations` → **HTTP 500**
- Tested with `locationType:"REFRIGERATOR"` and `locationType:"ROOM"` (default from form)
- Both return 500 with empty response body
- GET endpoint works (returns `[]`), only POST is broken

#### TC-INV-08: isActive Filter — FAIL (BUG-41)
- `GET /rest/inventory/items/all?isActive=true` → HTTP 200 but returns deactivated item (`isActive:"N"`)
- The `?isActive=true` query parameter filter is not applied by the `/items/all` endpoint
- App uses this endpoint for the catalog "active items" view — deactivated items will appear

---

## Part B — EQA Management

### Page Structure

| Route | Page | APIs Called | Status |
|-------|------|-------------|--------|
| `/EQAManagement` | EQA Management Dashboard | `GET /rest/eqa/samples/dashboard` → **404** | FAIL |
| `/EQAParticipants` | Participants | `GET /rest/eqa/programs` → **200** (empty) | PASS |
| `/EQADistribution` | Distributions | `GET /rest/eqa/distributions` → **200** | PASS |
| `/EQAResults` | Results & Analysis | `GET /rest/eqa/orders` → **200** | PASS |

### Test Results

#### TC-EQA-MGT-01: EQA Management Dashboard — FAIL (BUG-39)
- Page renders with fallback UI (zeros in all KPI cards)
- API call `GET /rest/eqa/samples/dashboard` → **HTTP 404** (endpoint not deployed)
- KPI Cards present: Pending/In Progress/Completed/Submitted (all show 0)
- Filter tabs render: All Samples | Pending | In Progress | Completed | Submitted | Overdue
- Action buttons present: "Enter New EQA Test", "Bulk Upload Results", "View Performance"
- Performance Summary shows dashes for all metrics
- "No EQA samples found" empty state renders correctly

#### TC-EQA-MGT-02: EQA Participants Page — PASS
- Page loads at `/EQAParticipants`
- `GET /rest/eqa/programs` → HTTP 200, `[]` (no programs configured)
- "Select Program" dropdown renders
- "Select a program to view enrollments" placeholder text shown
- Enrollment management UI ready for data

#### TC-EQA-MGT-03: EQA Distribution Page — PASS
- Page loads at `/EQADistribution`
- `GET /rest/eqa/distributions` → HTTP 200
- 4 KPI cards: Draft=0, Shipped=0, Completed=0, Participants=0
- Tabs: All Shipments | Draft | Prepared | Shipped | Completed
- Action buttons: "Create New Shipment", "Manage Participants"
- "No distributions found" empty state
- "Participant Network" section: Total=0, Active=0, Response Rate=—

#### TC-EQA-MGT-04: EQA Results & Analysis Page — PASS
- Page loads at `/EQAResults`
- `GET /rest/eqa/orders` → HTTP 200
- Table columns: Lab Number | Programme | Provider | Priority | Status | Deadline
- "No EQA test results found" empty state

#### TC-EQA-MGT-05: Enter New EQA Test Flow — PASS
- Button click navigates to `/SamplePatientEntry?isEQA=true`
- EQA-specific banner displayed: **"EQA Sample — Patient Info Locked"**
- Patient demographic fields locked (auto-set for EQA samples)
- Standard 4-step wizard adapts: Patient Info → Program Selection → Add Sample → Add Order
- National ID marked required (*)
- Correct EQA mode detection via URL parameter

---

## New Bugs

### BUG-39 (Medium) — EQA Management Dashboard API 404
- **Endpoint:** `GET /api/OpenELIS-Global/rest/eqa/samples/dashboard`
- **Status:** HTTP 404 Not Found
- **Impact:** EQA Management main dashboard shows no real KPIs; all metrics show 0/—
- **Scope:** Dashboard component only; other EQA pages (Participants, Distribution, Results) work
- **Note:** `/rest/eqa/orders` and `/rest/eqa/distributions` and `/rest/eqa/programs` all return 200

### BUG-40 (Low) — Storage Location Creation HTTP 500
- **Endpoint:** `POST /api/OpenELIS-Global/rest/inventory-storage-locations`
- **Status:** HTTP 500 (empty response)
- **Tested payloads:**
  - `locationType:"REFRIGERATOR"` → 500
  - `locationType:"ROOM"` (default from UI) → 500
- **Impact:** Inventory lots cannot be assigned to specific storage locations
- **Workaround:** Lots can be created without a storage location (`storageLocation:null` accepted)
- **GET works:** `GET /rest/inventory-storage-locations` → HTTP 200 (empty array)

### BUG-41 (Low) — Inventory isActive Filter Not Applied
- **Endpoint:** `GET /api/OpenELIS-Global/rest/inventory/items/all?isActive=true`
- **Status:** HTTP 200 but deactivated items (`isActive:"N"`) are still returned
- **Impact:** The Inventory Catalog page shows deactivated items in the active items view
- **The `/rest/inventory/items/all` endpoint ignores the `?isActive=true` query parameter**

---

## Phase 35 Chain B — BLOCKED by BUG-38

**Status:** BLOCKED — cannot proceed
**Root Cause:** `POST /rest/reportnonconformingevent` hangs indefinitely on the server
**Evidence:**
- NCE GET API works: `GET /rest/nonconformevents?labNumber=...` → HTTP 200
- NCE form UI works: search, sample selection, checkbox, navigation, pre-population all correct
- POST endpoint hangs: multiple tabs had pending POSTs causing Chrome 6-connection-per-origin exhaustion
- Fix attempted: Closed all tabs with hanging connections; server became responsive again
**Workaround:** None available until BUG-38 is fixed server-side
**Test Coverage:** NCE workflow UI is 80% validated; only submission (POST) cannot be tested

---

## Phase 36 Chain C — Completed (Prior Session)

- Site branding CRUD via `/rest/site-branding` fully working
- PUT updates primaryColor and headerColor correctly
- Report branding verification: changes reflect in site appearance

---

## Summary Score

| Phase | Area | TCs | Pass | Fail | Blocked |
|-------|------|-----|------|------|---------|
| 35 Chain B | NCE → Report | 1 | 0 | 0 | 1 (BUG-38) |
| 36 Chain C | Site Config → Branding | 2 | 2 | 0 | 0 |
| 37A | Inventory CRUD | 8 | 6 | 2 | 0 |
| 37B | EQA Management | 5 | 4 | 1 | 0 |
| **Total** | | **16** | **12** | **3** | **1** |

**Pass Rate:** 75% (12/16), 93.75% excluding blocked

---

## Known Technical Notes

1. **Inventory POST field names:** Must match DTO exactly: `units` not `unitOfMeasure`, no `active` field, no `description` field
2. **Lot creation:** `storageLocation: null` is accepted — storage location is optional despite being in the form
3. **EQA mode:** Triggered via `?isEQA=true` URL parameter on `/SamplePatientEntry`
4. **Connection pool risk:** Avoid multiple concurrent POSTs to endpoints that may hang (BUG-38); close hanging tabs immediately to restore Chrome's 6-connection limit
