# OpenELIS — Edit Order & RBAC Test Cases
**Target:** https://www.jdhealthsolutions-openelis.com
**Version:** OpenELIS Global 3.2.1.3
**Prefix:** QA_AUTO_0324
**Credentials (admin):** admin / adminADMIN!

---

## Overview

These test cases cover two areas not addressed by TC-01–TC-11:

1. **Edit Order workflow** — modifying tests on a placed accession (add test, remove test, edit results)
2. **RBAC (Role-Based Access Control)** — verifying that Receptionist and Lab Technician roles can only access appropriate functions

Known gap documented in TC-EO-03: the React UI does not expose a UI path to add a new test to an existing sample after the order has been submitted.

---

## Setup: Create Test Accounts

### SETUP-01 — Create Receptionist Account

**Navigation:** Admin → User Management → Add User
**Steps:**
1. Log in as admin
2. Navigate to `Admin Management → User Management`
3. Click **Add User**
4. Fill in:
   - First Name: `QA`
   - Last Name: `Receptionist`
   - Login Name: `qa_recept`
   - Password: `QArecept1!`
   - Confirm Password: `QArecept1!`
5. Assign role: **Receptionist** (and/or Reception)
6. Do NOT assign: Lab Technician, Admin, or any result-entry role
7. Click Save
8. Verify user appears in User Management list

**Expected:** Account created, role = Receptionist only
**Cleanup:** Deactivate account after test run

---

### SETUP-02 — Create Lab Technician Account

**Navigation:** Admin → User Management → Add User
**Steps:**
1. (Still logged in as admin)
2. Click **Add User** again
3. Fill in:
   - First Name: `QA`
   - Last Name: `LabTech`
   - Login Name: `qa_labtech`
   - Password: `QAlabtech1!`
   - Confirm Password: `QAlabtech1!`
4. Assign role: **Lab Technician** (result entry only)
5. Do NOT assign: Receptionist, Admin roles
6. Click Save
7. Verify user appears in User Management list

**Expected:** Account created, role = Lab Technician only
**Cleanup:** Deactivate account after test run

---

## Receptionist Role Tests

### TC-RECEPT-01 — Receptionist Can Access Add Order

**Login:** qa_recept / QArecept1!
**Navigation:** Home → Order → Add Order (`/SamplePatientEntry`)
**Steps:**
1. Log out of admin, log in as qa_recept
2. Navigate to Add Order
3. Verify the Add Order form loads (Patient Info step)

**Expected:** PASS — Receptionist can reach Add Order
**Fail condition:** Redirect to login, 403, or blank page

---

### TC-RECEPT-02 — Receptionist Places a Biochemistry Order

**Login:** qa_recept / QArecept1!
**Navigation:** `/SamplePatientEntry`
**Steps:**
1. Search patient by ID `0123456` (Abby Sebby) or create new patient
2. Select Program: Routine Testing → Next
3. Add Sample: Select **Serum** as sample type
4. In Order Tests search, type `Glucose` and check **Glucose (Serum)**
5. Click Next → Add Order
6. Click **Generate** to get Lab Number (record it: `TC_RECEPT_ACCESSION`)
7. Fill Request Date = today, Site Name = any, Requester = any
8. Click Submit

**Expected:** PASS — Order created, "Successfully saved" shown, accession number generated
**Fail condition:** Error on submit, or form access denied

---

### TC-RECEPT-03 — Receptionist CANNOT Access Test Catalog Management

**Login:** qa_recept / QArecept1!
**Steps:**
1. While logged in as qa_recept, navigate directly to:
   - `/MasterListsPage/TestAdd`
   - `/MasterListsPage/TestModifyEntry`
2. Observe what happens

**Expected:** PASS (security) — Access denied (redirect to login or 403) OR page loads but save actions are blocked
**Fail condition (security bug):** Receptionist can fully access and modify the test catalog

---

### TC-RECEPT-04 — Receptionist CANNOT Access Result Entry

**Login:** qa_recept / QArecept1!
**Steps:**
1. While logged in as qa_recept, navigate to:
   - Results → By Order (`/AccessionResults`)
   - Enter the accession from TC-RECEPT-02
2. Observe: can the receptionist see or edit the Result field?

**Expected:** PASS (security) — Either access is denied, or the result field is read-only / not visible
**Fail condition (security bug):** Receptionist can enter or modify test results

---

### TC-RECEPT-05 — Receptionist Can Search Existing Order

**Login:** qa_recept / QArecept1!
**Navigation:** Order → (search/modify order path if available)
**Steps:**
1. Navigate to any order search path accessible to Receptionist
2. Search for the accession from TC-RECEPT-02
3. Verify the order details are visible (patient, test, date)

**Expected:** PASS — Receptionist can view order status
**Fail condition:** Receptionist cannot look up their own submitted orders

---

## Edit Order Tests (Admin or Receptionist)

### TC-EO-01 — Modify Order: Remove a Test from a Placed Order

**Login:** admin (or qa_recept if the UI is accessible)
**Navigation:** Order → Modify/Edit Order, or search accession in Results → By Order
**Steps:**
1. Log in as admin
2. Navigate to the order from TC-RECEPT-02 (accession `TC_RECEPT_ACCESSION`)
3. Attempt to **remove** the Glucose test from the order (look for edit/modify order option)
4. Check if a "Modify Order" or "Edit Order" button exists on the order detail view
5. If found: remove the test, save, confirm the test is removed
6. If not found: document as a gap

**Expected:** PASS — Test can be removed from order before result entry
**Fail / Gap condition:** No UI path to remove a test from a placed order

---

### TC-EO-02 — Modify Order: Add a Test to a Placed Order (Existing Sample)

**Login:** admin
**Navigation:** Order detail / Modify Order
**Steps:**
1. Navigate to the order from TC-RECEPT-02
2. Attempt to **add** a new test (e.g., Creatinine) to the existing order/sample
3. Look for:
   - An "Add Test" button on the order detail
   - An "Edit Order" path that returns to the sample/test selection step
   - Any modify-order API endpoint
4. If found: add Creatinine, save, verify it appears in result entry
5. If not found: document as a gap with screenshot

**Expected (known gap):** FAIL / NOT IMPLEMENTED — The React workflow does not currently expose a UI to add a new test to an existing placed order. Document this as a feature gap with exact navigation point where the option is missing.
**Note:** This is the known gap identified by the test author. Document the exact screen and what button/action is absent.

---

### TC-EO-03 — Modify Order: Change Patient on a Placed Order

**Login:** admin
**Steps:**
1. Navigate to the order from TC-RECEPT-02
2. Attempt to change the patient (e.g., re-assign the accession to a different patient)
3. Check if a "Change Patient" or "Edit Patient" option exists on the order

**Expected:** Ideally blocked (accession should be locked to patient after creation) or only accessible to admin
**Document:** What options are and are not available on the order detail page

---

## Lab Technician Role Tests

### TC-LABTECH-01 — Lab Technician Can Access Result Entry

**Login:** qa_labtech / QAlabtech1!
**Navigation:** Results → By Order (`/AccessionResults`)
**Steps:**
1. Log out, log in as qa_labtech
2. Navigate to Results → By Order
3. Search for accession from TC-RECEPT-02
4. Verify the order appears with HGB/Glucose test and an editable Result field

**Expected:** PASS — Lab tech can see and access result entry for the order
**Fail condition:** Access denied, or order not visible

---

### TC-LABTECH-02 — Lab Technician Enters a Result

**Login:** qa_labtech / QAlabtech1!
**Steps:**
1. On the order from TC-RECEPT-02, find the Glucose test row
2. Enter result: `5.2`
3. Click Save
4. Verify Current Result column updates to `5.2`

**Expected:** PASS — Result saved successfully
**Fail condition:** Error on save, or result does not persist

---

### TC-LABTECH-03 — Lab Technician Can Edit a Saved Result

**Login:** qa_labtech / QAlabtech1!
**Steps:**
1. After TC-LABTECH-02, with result `5.2` saved:
2. Click back into the result field for Glucose
3. Clear the value and enter `5.8`
4. Click Save
5. Verify Current Result updates to `5.8`

**Expected:** PASS — Lab tech can correct a previously entered result before validation
**Fail condition:** Field is locked after first save, or edit is not persisted

---

### TC-LABTECH-04 — Lab Technician CANNOT Access Test Catalog Management

**Login:** qa_labtech / QAlabtech1!
**Steps:**
1. While logged in as qa_labtech, navigate directly to:
   - `/MasterListsPage/TestAdd`
   - `/MasterListsPage/TestModifyEntry`
   - Admin menu items (if visible in nav)
2. Observe: access denied or full access?

**Expected:** PASS (security) — Lab tech cannot access test catalog admin pages
**Fail condition (security bug):** Lab tech can modify the test catalog

---

### TC-LABTECH-05 — Lab Technician CANNOT Place a New Order

**Login:** qa_labtech / QAlabtech1!
**Steps:**
1. While logged in as qa_labtech, navigate to:
   - Order → Add Order (`/SamplePatientEntry`)
2. Observe: is the Add Order form accessible?

**Expected:** PASS (security) — Lab tech cannot place orders (that is the Receptionist role)
**Note:** Some implementations allow all roles to place orders — document the actual behavior either way

---

### TC-LABTECH-06 — Lab Technician Can Access Results → By Unit (Worklist)

**Login:** qa_labtech / QAlabtech1!
**Navigation:** Results → By Unit
**Steps:**
1. Navigate to Results → By Unit
2. Verify the worklist loads and shows pending results

**Expected:** PASS — Lab tech can see their section's worklist
**Fail condition:** Worklist is empty or access is denied

---

## Known Gap Documentation

### GAP-01 — Add New Test to Existing Sample (Missing Feature)

**Description:**
The current OpenELIS React UI Add Order workflow (`/SamplePatientEntry`) is a one-way wizard: once an order is submitted, there is no UI path to return to the "Add Sample" or "Order Tests" step to add additional tests to the same accession.

**Where the gap exists:**
- After order submission, the confirmation screen shows Print and Done — no "Edit Order" button
- Results → By Order shows the order in read-only format with only a Result entry field — no "Add Test" button
- No "Modify Order" navigation item exists in the Order menu

**Clinical impact:**
In a real lab, it's common for a clinician to add a reflex test after initial results, or for the lab to add a stat test to an existing sample without re-registering the patient. Without this feature, users must either:
(a) Create a new order/accession for the same patient for the additional test, or
(b) Use the Legacy Admin if it supports order modification

**Recommended feature:** An "Add Test to Order" button on the order detail / result entry view, accessible to Lab Technicians and Receptionists, that opens the test picker for the existing sample and adds the selected test to the accession without re-entering patient or sample data.

---

## Cleanup Steps

After all tests:
1. Log back in as admin
2. Deactivate `qa_recept` account (User Management → find user → set Inactive)
3. Deactivate `qa_labtech` account
4. The orders placed during testing can remain (no cleanup needed for orders)

---

## Pass/Fail Summary Template

| TC | Scenario | Result | Notes |
|----|----------|--------|-------|
| SETUP-01 | Create Receptionist account | — | |
| SETUP-02 | Create Lab Technician account | — | |
| TC-RECEPT-01 | Receptionist accesses Add Order | — | |
| TC-RECEPT-02 | Receptionist places Biochemistry order | — | |
| TC-RECEPT-03 | Receptionist blocked from Test Catalog | — | |
| TC-RECEPT-04 | Receptionist blocked from Result Entry | — | |
| TC-RECEPT-05 | Receptionist can search own order | — | |
| TC-EO-01 | Remove test from placed order | — | |
| TC-EO-02 | Add test to placed order (known gap) | — | |
| TC-EO-03 | Change patient on placed order | — | |
| TC-LABTECH-01 | Lab tech accesses result entry | — | |
| TC-LABTECH-02 | Lab tech enters result | — | |
| TC-LABTECH-03 | Lab tech edits saved result | — | |
| TC-LABTECH-04 | Lab tech blocked from Test Catalog | — | |
| TC-LABTECH-05 | Lab tech cannot place orders | — | |
| TC-LABTECH-06 | Lab tech sees worklist | — | |
