# Madagascar e-SIL UAT Test Suite
## OpenELIS Global — mgtest.openelis-global.org

**Version:** 2.0 (all steps populated from raw_Testing Details CSV)  
**Target:** https://mgtest.openelis-global.org  
**Credentials:** admin / adminADMIN!  
**Jira project:** OGC  
**Source:** https://docs.getgrist.com/4is3GML763Nd/e-SIL-UAT/p/6

---

## How to Use This Suite

Run this alongside the standard `openelis-test-catalog-qa` skill. Walk **every step exactly as written** — do not paraphrase or infer. Record PASS / FAIL / PARTIAL / BLOCKED per step and per requirement. Screenshot on every FAIL.

Before running, confirm:
1. mgtest instance is on the expected version (check Admin → Application Properties)
2. A patient with a known National ID exists (or create one: use `QA_MDG_<MMDD>` as National ID prefix)
3. An order with results has been previously validated (needed for LO-05 suites)

---

## Requirement Status Overview

Requirements sourced from the e-SIL UAT Details table. Round 2 (2nd Validation) statuses shown.

| ReqID | Title | Round 1 | Round 2 | Still Open? |
|-------|-------|---------|---------|-------------|
| **LO-01 — Patient Management** | | | | |
| LO-01-01 | Patient identification | FAIL | PASS | Phone format note |
| LO-01-03 | Checking duplicates by unique identifier | FAIL | PASS | White screen on save |
| LO-01-04 | Merging duplicate patient data for history | PARTIAL | FAIL | Merge not working |
| LO-01-05 | Updating Patient Information | PARTIAL | PASS | ✓ |
| **LO-02 — Request / Order Management** | | | | |
| LO-02-01 | Request Creation | PARTIAL | PARTIAL | Label print error |
| LO-02-02 | Request details | FAIL | — | DIGI clarification issued |
| LO-02-03 | Request a change | PARTIAL | PARTIAL | Username not in audit trail |
| LO-02-04 | Request a search | FAIL | — | DIGI clarification issued |
| LO-02-05 | Request an activity log | PARTIAL | PASS | ✓ |
| LO-02-06 | Generate a pro-forma invoice | FAIL | PASS | ✓ |
| LO-02-07 | Scan the invoice | BLOCKED | PASS | Part of Odoo |
| **LO-03 — Specimen / Sample Management** | | | | |
| LO-03-01 | Specimen details | FAIL | PASS | ✓ |
| LO-03-02 | Sample collection | FAIL | PASS | ✓ |
| LO-03-04 | Sample rejection | FAIL | PASS | ✓ |
| LO-03-05 | Sample chain of custody and disposal | FAIL | — | No Round 2 result yet |
| LO-03-06 | Sample tracking | FAIL | — | No Round 2 result yet |
| LO-03-08 | Sample storage and aliquoting | FAIL | FAIL | Still failing — retest |
| **LO-04 — Instrument / Analyzer Integration** | | | | |
| LO-04-01 | Instrument Details | FAIL | PASS | ✓ |
| LO-04-02 | Instrument Interface - Results Output | FAIL | PASS | Needs site verification |
| LO-04-03 | Instrument interfacing - Test ordering | FAIL | — | No Round 2 result yet |
| LO-04-04 | Instrument Interface - Error Capture | BLOCKED | — | No Round 2 result yet |
| LO-04-05 | Connected diagnostic instruments | PARTIAL | — | Videos in progress |
| LO-04-06 | Instrument maintenance | FAIL | PARTIAL | Multi-module issue |
| **LO-05 — Results** | | | | |
| LO-05-01 | Unconnected diagnostics | FAIL | PASS | ✓ |
| LO-05-02 | Review and approval | FAIL | PARTIAL | Terminology + context fields |
| LO-05-03 | Sending results | FAIL | PASS | ✓ |
| LO-05-04 | Result report | FAIL | PASS | ✓ |
| LO-05-05 | Amendments to results | FAIL | — | Scribe walkthrough provided |
| LO-05-06 | General results | PARTIAL | — | No Round 2 result yet |
| LO-05-08 | Logic of results | BLOCKED | — | No Round 2 result yet |
| LO-05-09 | Positive tests | PARTIAL | — | No Round 2 result yet |
| **LO-06 — Test Management** | | | | |
| LO-06-02 | Test management | PARTIAL | PASS | ✓ |
| **LO-07 — Quality Control / EQA** | | | | |
| LO-07-01 | External Control (CE) | FAIL | — | No Round 2 result yet |
| LO-07-02 | Internal Control (IC) | BLOCKED | — | No Round 2 result yet |
| LO-07-03 | Calibration samples | FAIL | — | No Round 2 result yet |
| LO-07-04 | Invalid quality indicators | BLOCKED | — | No Round 2 result yet |
| LO-07-05 | Test errors | BLOCKED | — | No Round 2 result yet |
| **LO-08 — Inventory / Stock** | | | | |
| LO-08-01 | Stock data | PARTIAL | — | 2 items pending dev |
| LO-08-02 | Purchase order transaction | FAIL | — | RFQ/Purchase flow issue |
| LO-08-03 | Inventory management | BLOCKED | — | Steps not detailed enough |
| LO-08-04 | Compliance of inputs upon receipt | FAIL | — | Steps not clear |
| **LO-09 — Workplan / Task Management** | | | | |
| LO-09-02 | Task management and assignment | PARTIAL | — | No assign-to-user feature |
| **DU-10 — Dashboard** | | | | |
| DU-10-01 | Content Views | PARTIAL | PASS | ✓ |
| DU-10-02 | Filtration | PARTIAL | PASS | ✓ |
| DU-10-03 | Usage rate | BLOCKED | PASS | ✓ |
| DU-10-04 | Enter/Delete Reagent Level | FAIL | PASS | ✓ |
| **DU-11 — Reports** | | | | |
| DU-11-02 | Sample and test results reports | FAIL | — | No Round 2 result yet |
| DU-11-03 | Audit trails and compliance reports | FAIL | — | No Round 2 result yet |
| DU-11-04 | Instrument and Calibration Reports | BLOCKED | PASS | ✓ |
| DU-11-05 | Data integrity and security reporting | FAIL | — | No Round 2 result yet |
| DU-11-06 | Quality control and assurance reports | FAIL | — | No Round 2 result yet |
| DU-11-07 | Performance and productivity reports | PARTIAL | — | Date range issues |
| DU-11-10 | Additional report on inventory management | BLOCKED | — | Not ready |
| DU-11-11 | Long-term data storage and archiving | PARTIAL | — | Facility filter broken |
| **DU-12 — Data Export / Interoperability** | | | | |
| DU-12-01 | Time-based schedules | FAIL | — | Superset setup needed |
| DU-12-03 | Reliability of data transmission | FAIL | — | No Round 2 result yet |
| DU-12-04 | Manual data export | PARTIAL | — | Cross-panel contamination |

---

## Detailed Test Steps

Steps below are **exactly as written** in the e-SIL UAT Grist document, Round 2.  
Steps marked `[STEPS PENDING]` will be filled in once the raw_Testing Details CSV is available.

---

### LO-01-01 — Patient Identification
**Category:** Patient Management  
**Round 2 status:** PASS (phone number format still needs addressing)  
**Server:** https://mgtest.openelis-global.org/

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in to OpenELIS at https://mgtest.openelis-global.org/ as Lab Technician or Admin. Navigate to Patient → Add/Edit Patient → New Patient tab. | Login succeeds. Add Or Modify Patient page loads. Three collapsible sections present: Patient Information (open), Emergency Contact Info, Additional Information, Identification Documents. |
| 2 | Inspect the visible top-section fields. | Confirmed present: Add Photo, Unique Health ID number, National ID, Last Name, First Name, Alias, Primary phone, Email, Gender (Male/Female), Date of Birth*, Age/Years/Months/Days. |
| 3 | Expand the Emergency Contact Info section. | Section reveals: Contact last name, Contact first name, Contact Email, Contact Phone. |
| 4 | Expand the Additional Information section. | Section reveals: Quick Address Search, Fokotany, Hamlet/Lot, Province, Health Region, Health District, GPS Lat/Longitude, Education, Marital Status, Nationality, Other Nationality, Occupation, Target Disease Program, Custom Notes. |
| 5 | Expand the Identification Documents section. Click Add Document and upload a sample file. Choose category National ID. | Upload succeeds. Document listed with chosen category. |

**DIGI notes:** Phone number format updated in deployment as of 7 May 2026.

---

### LO-01-03 — Checking Duplicates by Unique Identifier
**Category:** Patient Management  
**Round 2 status:** PASS (white screen after save noted)  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition / Note. Confirm Admin → General Configuration → Patient entry configuration: Allow duplicate national ID = False AND Allow duplicate Subject Number = False. Identify one existing patient ("Patient A") with a known National ID (NAT-A) and Subject Number (SUB-A); record full name and DOB. | Both "Allow duplicate" settings = False. Patient A is retrievable via Patient search by NAT-A and by SUB-A. Reference values are captured for use in Steps 2, 5, 6. |
| 1 | Log in to OpenELIS Global at https://lis.oz-esil-uat.mekomsolutions.net/ with a user account that has patient-registration permission (e.g., Lab Technician or Admin). | Login succeeds. Home page dashboard is displayed; side navigation is accessible via the hamburger icon (top-left). |
| 2 | Navigate to Patient → Add/Edit Patient → New Patient tab. Enter a Name and DOB that differ from Patient A. In National ID, enter NAT-A (exact match to Patient A). Click Save. | System detects the duplicate before the save commits. A warning is displayed identifying Patient A by name, DOB, and National ID. No "patient creation successful" confirmation is shown, and no new patient record is committed. |
| 3 | Inspect the duplicate warning from Step 2. | The warning contains Patient A's full name, date of birth, and the matched identifier — sufficient context for the operator to make an informed decision. |
| 4 | From the duplicate warning, click Cancel (or "Edit existing patient" / equivalent — do not proceed to save). Then return to Patient search and query NAT-A. | The new-patient form closes without saving. Patient search by NAT-A returns exactly one record — Patient A. |
| 5 | Repeat Step 2, but this time leave National ID unique (or blank if permitted) and enter SUB-A in the Subject Number field. Click Save. | System detects the duplicate Subject Number before save and displays a warning identifying Patient A. Save is blocked. No new record is committed. |
| 6 | After Steps 2 and 5, search Patient by NAT-A, then by SUB-A. | Each search returns exactly one record — Patient A. There is no second record with a different name attached to either identifier. |
| 7 | Negative case — allowed duplicate. In New Patient, enter the same Name and DOB as Patient A but a unique National ID and unique Subject Number. Click Save. | Save succeeds. A new patient record is created. Searching by the new identifier returns only the new patient. |

**Known issue:** After pressing Save on a new patient, a blank white screen is presented until page is refreshed.

---

### LO-01-04 — Merging Duplicate Patient Data for History
**Category:** Patient Management  
**Round 2 status:** FAIL  
**Server:** https://mgtest.openelis-global.org/  
**Step-by-step guide:** https://drive.google.com/file/d/1xK-Eo2Tu0OAqBae_FxsDKCXkLVhxHa-c/view?usp=drive_link


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Two confirmed-duplicate patient records exist. Two users available: Global Admin + Lab Technician, to see the permissions outside of admin, use a user with the lab role of any for all lab units and you can also make the metge. | Test data ready. Both user accounts known. |
| 1 | Log in as Lab Technician. Navigate to Patient → Merge Patient. | Page loads with Merge disabled/hidden or authorization message. Record which roles see Merge today. |
| 2 | Log in as Global Admin. Navigate to Patient → Merge Patient. Complete the merge. | Merge succeeds; one canonical record remains; history from both source records is preserved. |
| 3 | Open Patient History for the canonical record. | History shows entries from both pre-merge records. |
| 4 | Open Patient → Add/Edit Patient. Search and load an existing patient. | Record loads. Verify whether New Patient tab is visible while viewing existing record. |
| 5 | If New Patient tab visible, click it WITHOUT clicking Clear first. Edit a field. Click Save. | Form creates a NEW patient (PASS) OR silently updates the loaded patient (FAIL). Record observed behavior with screenshot. |
| 6 | Search by the original patient's UHID. Verify whether their data was modified. | If modified, confirms bug. If not, mode is fixed. |

**Known failure:** 2nd patient record after merge still available. No updates seen in master patient record.

---

### LO-01-05 — Updating Patient Information
**Category:** Patient Management  
**Round 2 status:** PASS  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Known patient with editable field. User has Patient edit permission. | Test data ready. |
| 1 | Log in. Open Patient → Add/Edit Patient. Search and load existing patient. | Record loads. Verify whether explicit Edit toggle / Edit button is present. |
| 2 | Click Edit, change patient details, click save | Patient details Changed. |

---

### LO-02-01 — Request Creation
**Category:** Request / Order Management  
**Round 2 status:** PARTIAL (creation passes; specimen label print error remains)  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Known patient. Test type configured. Server timezone set to Indian/Antananarivo (UTC+3). | Data + config ready. |
| 1 | Log in. Order → Add Order. Search for Patient and select test patient. | Patient loads in Order wizard. |
| 2 | Advance to Add Sample. Verify Reception time matches local Madagascar time. | Reception time matches within ~1 minute. |
| 3 | In Add Sample, increase Label Quantities to 3 or 5. | Form updates without crashing — no white screen. |
| 4 | Decrease Label Quantities to 1; try other combinations. | No crash; form remains usable. |
| 5 | Print specimen labels. | Label print succeeds without error. |
| 6 | Advance to Add Order. Fill all mandatory fields. Click Submit. | Submit button is active and commits the order. |
| 7 | Order → Edit Order. Search by new accession number. | New request loads with correct reception time and all entered values. |

**DIGI notes (30 April):** Fixed issues from Round 1 (label quantity crash, reception time offset).  
**Remaining:** Error when printing specimen labels — check LabelMakerServlet.

---

### LO-02-02 — Request Details
**Category:** Request / Order Management  
**Round 2 status:** No 2nd result yet  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. ≥1 order with patient + 2 tests + applicant info. | Test data ready. |
| 1 | Order → Edit Order. Open by accession. | Detail screen loads. |
| 2 | Inspect: Patient identification. | Present — PASS. |
| 3 | Inspect: Exam(s) requested. | Present — PASS. |
| 4 | Inspect: Applicant Name + ID + DOB + contact details (phone/email/address). | If contact details visible PASS; if only Name/ID/DOB, BLOCKED. |
| 5 | Inspect: Date and time of Request. | If visible PASS; if absent BLOCKED. |
| 6 | Inspect: Clinical information. | If visible PASS; otherwise BLOCKED. |
| 7 | Inspect: Sample ID + nature. | If visible PASS; otherwise BLOCKED. |
| 8 | If View/Print Request Form button exists, generate. | Output contains all above. If absent or incomplete, BLOCKED. |

**DIGI clarification (3 May):** Patient ID/name/DOB fields are intentionally non-editable from Edit Order — they belong to the patient record. Two workflows: (1) wrong patient → cancel + re-enter; (2) update demographics → go to Patient → Add/Edit Patient.

---

### LO-02-03 — Request a Change
**Category:** Request / Order Management  
**Round 2 status:** PARTIAL (username not recorded in audit trail; step 4 unclear)


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Audit logging enabled. Patient + 3-test panel ready. | Config + data ready. |
| 1 | Log in. Order → Add Order. Create multi-test order (3 tests). Save. Note the lab number, you will need this in the next step | Order created with accession; 3 tests visible. |
| 2 | Order → Edit Order. Cancel one test from the order. Add a different test to the order. | Cancellation succeeds, adding the test succeeds, status visible. |
| 3 | Reports → Audit Trail → Order Events. Search for the lab number. | Cancellation event present with timestamp, user, test name. |
| 4 | Return to order detail. Look for an inline audit summary on the order screen. | If inline audit exists, confirm cancellation visible. If absent, record PARTIAL. |

---

### LO-02-04 — Request a Search
**Category:** Request / Order Management  
**Round 2 status:** No 2nd result yet


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition: at least one open order with a known accession number, a known patient, and a printed barcode label exists. | Test data set ready. |
| 1 | Log in. Navigate to Order → Edit Order. | Modify Order page loads with two search panels: Search By Accession Number, Search By Patient. |
| 2 | In Search By Accession Number, type a known Lab No and click Submit. | The order is opened and its detail screen is displayed. |
| 3 | Return to Modify Order. Scan a printed barcode label into the Accession Number field. | The barcode value populates the field; submit opens the order. |
| 4 | In Search By Patient, enter the patient's Last Name. Click Search. | Results table shows columns Last Name, First Name, Gender, DOB, Unique Health ID, National ID, Data Source Name. |
| 5 | In Search By Patient, enter only Date of Birth and click Search. | Patients with that DOB returned. |
| 6 | Inspect the page and Order menu for a date-range filter on REQUESTS (not patient DOB). | If present, exercise it. If absent, record PARTIAL with a note for Mekom asking whether request-date filter is in scope. |
| 7 | Click External Search. | External-system lookup runs (if configured); record observed behavior. |

**DIGI clarification (3 May):**  
- Barcode search: type/paste accession number into request search bar (no physical scanner needed)  
- DOB search: use patient search → DOB, then view requests from patient record  
- External search icon: intentionally inactive (no client registry in Madagascar deployment)

---

### LO-02-05 — Request an Activity Log
**Category:** Request / Order Management  
**Round 2 status:** PASS  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Audit logging enabled. Order with 3 tests ready. | Test data ready. |
| 1 | Log in. Reports → Audit Trail → Order Events. Baseline snapshot for order. | Baseline captured. |
| 2 | Order → Edit Order. Cancel one test. | Cancellation succeeds. |
| 3 | Order → Edit Order. Modify a different field (clinical note or priority). Save. | Modification succeeds. |
| 4 | Order → Edit Order. Add a new test. Save. | New test added. |
| 5 | Reports → Audit Trail → Order Events. Verify all 3 changes captured with user, timestamp, description. | All 3 events present with details. |
| 6 | Reports → Audit Trail → System Events for today. | Same 3 events appear with cross-references to accession. |

**DIGI notes (30 April):** All 6 steps retested against mgtest — everything passes with expected results.

---

### LO-02-06 — Generate a Pro-Forma Invoice
**Category:** Request / Order Management  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | - Log in to Odoo with a valid user account (eg, jdoe) | - Login succeds |
| 2 | - Navigate to Sales module (top left square icon) - click on a Sale Order that has an amount (do not select an empty Sale Order) - Click on Confirm button (at the top) - Click on Create invoice - Click on Create Draft Invoice - Click on Preview | - Pro-forma invoice generated |
| 3 | - Click on Download - Use OS or browser-specific tools to print the downloaded document | - Invoice printed (or printable) |

---

### LO-02-07 — Scan the Invoice
**Category:** Request / Order Management  
**Round 2 status:** PASS  
**Note:** This is part of Odoo, not OpenELIS directly.


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | - Log in Odoo |  |
| 0 | - Note that the requirement is quite vague and does not describe the actual business case. In Odoo, uploading any file is possible on any type of object (sales orders, purchase orders, invoices, customers. |  |
| 2 | - Access the Sales app - Click on Orders -> Customers - Select a customer - Locate the paper clip icon bottom right of the screen. | - Confirm that any document can be attached to the customer |

---

### LO-03-01 — Specimen Details
**Category:** Specimen / Sample Management  
**Round 2 status:** PASS  
**DIGI notes (3 May):** Origin of specimen is part of Step 1. Collection Method & Sample Temperature fields added.


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. mgtest server timezone set to Indian/Antananarivo (UTC+3) | Config + data ready. |
| 1 | Order → Add Order (URL /SamplePatientEntry). Search and select test patient. Advance to Add Sample step. | Add Sample step renders. |
| 2 | Inspect Collection Date and Collection Time at first display. | Both auto-populated with current MG date/time within ~1 minute |
| 3 | Inspect Received Date field. | Pre-populated with server time. |
| 4 | Override Collection Date to 24h in the past + change Collection Time. Save the order. | Override accepted; saved sample shows the entered time, not server-now. |
| 5 | Order → Edit Order. Search by the new accession. | Persisted Collection Date/Time match what was saved in Step 4. |

---

### LO-03-02 — Sample Collection
**Category:** Specimen / Sample Management  
**Round 2 status:** PASS  
**DIGI notes (30 April):** Informed Consent Field added.  
**Server:** https://mgtest.openelis-global.org/

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | **Precondition.** ≥1 patient + test type ready. User has order-entry permission. | Data + user ready. |
| 1 | Order → Add Order (URL `/SamplePatientEntry`). Walk Patient Info → Program Selection → Add Sample. On the Add Sample step, fill: Sample type, Quantity, Sample Unit Of Measure, Collection Date, Collection Time (hh:mm), Collector. If multiple samples are needed, use **Add Sample +** to add additional sample rows. | All required Add Sample fields present and editable. Identity of collector + date/time of collection captured per sample. |
| 2 | Advance to Add Order (the final wizard step). Fill mandatory fields. Locate the order-level checkbox **'Patient has provided signed consent'** near the bottom of the form. | 'Patient has provided signed consent' checkbox is present and clickable at the order level. |
| 3 | Tick 'Patient has provided signed consent'. Submit the order. | Order saves. Consent flag persisted at the order level. Per Madagascar deploy decision (2026-04-26): order-level consent applies to all samples attached to the order — no separate per-sample consent control needed. |
| 4 | Order → Edit Order. Search by the new accession number. | Persisted: collector identity, collection date/time per sample, order-level consent flag = TRUE. |
| 5 | Order → Edit Order. Open a different order where 'Patient has provided signed consent' was NOT ticked. | Order-level consent flag = FALSE preserved. Workflow allows orders without consent (e.g. emergency) but the flag accurately records what happened. |
| 6 | Reports → Audit Trail (Order or System). Filter to the new accession from Step 3. | Sample-collection events captured with collector identity + timestamp. Consent state visible in the order audit trail. |

---

### LO-03-04 — Sample Rejection
**Category:** Specimen / Sample Management  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. NCE categories + types configured. Patient + referred test ready. 3 accessions staged: in-progress, referred, validated. | Test data ready. |
| 1 | Log in. Non-Conform menu. | NCE list/dashboard loads. |
| 2 | Open in-progress accession. Initiate NCE: category, type, immediate_action, severity, description, attachment. Submit. | NCE created; attachment uploaded; status updated. |
| 3 | Open referred accession. Initiate rejection. | Rejection workflow available for referred samples; NCE created. |
| 4 | Open validated accession. Attempt post-validation rejection. | Allows with warning OR blocks with clear message. Record behavior. |
| 5 | NCE list filtered by today. | 2-3 NCEs appear with title, severity, category/type, status. |
| 6 | Open one NCE. Verify NCE History panel. | History shows creation + state changes + attachments + assignments. |
| 7 | Reassign NCE to a different user. Save. | Reassignment succeeds; visible in History. |
| 8 | Reports → Non-Conformity Reports → By Date / By Unit and Reason. | Reports include new NCEs; counts match. |

---

### LO-03-05 — Sample Chain of Custody and Disposal
**Category:** Specimen / Sample Management  
**Round 2 status:** No Round 2 result yet


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0.1 | Storage hierarchy setup. Admin → Storage. Verify 6-card landing. | Landing deployed; counts visible. |
| 0.2 | Create a Room. /Storage/rooms → Add +. Name + Code. Save. | Room appears in table. |
| 0.3 | Create a Device inside the Room. /Storage/devices → Add +. | Device appears under Room. |
| 0.4 | Create a Shelf inside the Device. /Storage/shelves → Add +. | Shelf appears under Device. |
| 0.5 | Create a Rack inside the Shelf. /Storage/racks → Add +. | Rack appears under Shelf. |
| 0.6 | Create a Box inside the Rack with row × col dimensions. /Storage/boxes → Add +. | Box appears with cells. |
| 0.7 | Create a sample (Order → Add Order = /SamplePatientEntry). Assign sample to a Box position. Configure disposal lifetime. | Sample with storage_location_id set. |
| 1 | Open sample detail. | Detail loads with storage location field showing Box→Rack→Shelf→Device→Room path. |
| 2 | Change storage location post-creation. Save. | If editable + saved, PASS. If read-only, BLOCKED. |
| 3 | Reports → sample/storage report. | Storage location visible OR BLOCKED. |
| 4 | Inspect chain-of-custody log on sample. | Log present and complete OR BLOCKED. |
| 5 | Set disposal date to past / wait for threshold. | Discard alert raised OR BLOCKED. |
| 6 | Mark sample disposed. | Disposal recorded with user + timestamp; status + log update. |

**Known issue (Round 1):** Storage location can only be changed during test request creation. Should be changeable at any point before test is performed. Storage location not visible in report even after change.

---

### LO-03-06 — Sample Tracking
**Category:** Specimen / Sample Management  
**Round 2 status:** No Round 2 result yet


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Two labs (A, B) configured with users. ≥1 sample at Lab A. | Multi-lab setup ready. |
| 1 | Log in as Lab A. Refer sample to Lab B. Save. | Referral saved; status = Referred. |
| 2 | On Lab A screen, verify referral status visible after save. | Status visible OR BLOCKED. |
| 3 | Log in as Lab B. Verify referred sample in incoming queue. | Sample visible at Lab B. |
| 4 | Lab B records a result. Save. | Result saved; status updates at Lab A. |
| 5 | As Lab A, verify result on original order. | Result attached with Lab B provenance. |
| 6 | Reports → sample tracking / audit. | End-to-end referral auditable. |

**Known issue (Round 1):** Requires different user accounts at different labs to fully test referral workflow. Once saved, referral status not visible.

---

### LO-03-08 — Sample Storage and Aliquoting
**Category:** Specimen / Sample Management  
**Round 2 status:** FAIL (menu option not seen)  
**Server:** https://mgtest.openelis-global.org/  
**Video:** https://drive.google.com/file/d/1VIqqRd-oA8Hw9qEXHbqucb32heGCy20r/view?usp=drive_link


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as `admin`. Side-nav → Generic Sample → Sample Management (/SampleManagement). | Sample Management page renders with breadcrumb Home / Generic Sample / Sample Management and a Search Sample input. |
| 2 | Type the accession in Search Sample. Press Enter or click Search. | Results table appears (one row per sample item). Parent rows uncoloured. |
| 3 | Tick the checkbox on the parent sample-item row (single selection). | Create Aliquot and "Add Tests" action buttons enable. |
| 4 | Click Create Aliquot. | Modal opens. Header subtitle shows the parent's external ID. Quantity-to-Transfer, Number of Aliquots (stepper, 1–100), Notes fields visible. |
| 5 | Enter Quantity to Transfer = 4 (mL). Set Number of Aliquots = 2. | Live preview shows "Quantity per Aliquot = 2.000". No validation error. |
| 6 | Click Create Aliquot in the modal footer. | Modal closes. Toast: "Created 2 aliquots: <parent>.1, <parent>.2". Atomic batch — no partial state on failure. |
| 7 | Re-search the same accession. | Table shows 3 rows: parent (remaining quantity reduced by 4) + 2 aliquot rows. Aliquot rows highlighted with blue left-border + pale blue background; "Aliquot of <parent>" hierarchy badge visible. |
| 8 | Click Select All Aliquots quick-select (or tick both aliquot checkboxes manually). | Both aliquot rows selected. Add Tests enables; Create Aliquot disables (multi-select). |
| 9 | Click Add Tests. In the modal, pick one test compatible with Serum. Submit. | Toast shows per-row breakdown: "<aliquot1>: 1 added; <aliquot2>: 1 added". |
| 0 | Precondition: a user with Sample Management permission (admin works). Create ≥1 sample with Volume set (e.g. 10 mL) and ≥2 tests via Order → Add Order (/SamplePatientEntry); note the accession (DEV01260000000000XXX). | Test data + user ready. |
| 10 | Tick aliquot 1's checkbox alone → Create Aliquot → Quantity = 1, Number of Aliquots = 2 → submit. | Recursive aliquoting works. Re-search shows 5 rows: parent + aliquot 1 + aliquot 2 + aliquot 1.1 + aliquot 1.2. |
| 11 | Open parent sample (Sample Edit / Modify Order for the accession). | Parent record shows linked aliquots with their external IDs, timestamps, and creator user. |
| 12 | Open one aliquot's detail. | Detail view shows parent link (clickable), creation timestamp, creator (admin), and status. Aliquot's quantity matches what was transferred. |

**Priority:** HIGH — still failing in Round 2. DIGI claims aliquot is functional. Retest required.

---

### LO-04-01 — Instrument Details
**Category:** Instrument / Analyzer Integration  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | - Log in to Odoo with a user account that has `Maintenance / Equipment Manager` role in Keycloak (or use `jdoe`) | - Login succeed |
| 2 | Navigate to Maintenance ->  Equipment->  new - Instrument manufacturer - Instrument model - Instrument type (Dropdown list) - Instrument installation date - Location of instrument installation – broken down into: state/province or region/district/city/health facility/site/room where more than one instrument is located in a facility - “Name” of the instrument - Instrument serial number - Serial number of modules if applicable - Module status  - Calibration status - Warranty status - Service Status - Instrument software version - Instrument hardware versions | You can fill all the fields |

---

### LO-04-02 — Instrument Interface – Results Output
**Category:** Instrument / Analyzer Integration  
**Round 2 status:** PASS (needs verification at site)  
**Videos:** https://drive.google.com/drive/folders/1soz0p3FVmDHemHDUf824FNHIWwT246IG?usp=drive_link


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Infrastructure precondition. Analyzer server reachable. Test user provisioned. ≥1 FILE-type analyzer profile configured. | Conditions met. |
| 1 | Log in to analyzer server with test user. | Login succeeds. (Round 1 failure mode test.) If fails, BLOCKED. |
| 2 | OpenELIS Admin → Analyzers. Verify FILE analyzer profile. | Profile listed; enabled status shows. |
| 3 | Trigger analyzer to output a result file. | File appears via configured transport. |
| 4 | Results → Routine. Filter to accession. Verify analyzer metadata. | Result present; analyzer name + run timestamp propagated. |
| 5 | Inspect FHIR export of result if available. | Observation includes device reference to analyzer. |
| 6 | If bridge sync configured, cancel/modify order. Verify reverse notification. | Reverse sync triggers per profile. |

**Protocol coverage:** Flatfile (QuantStudio 7), ASTM (GeneXpert), HL7 (Mindray mock).

---

### LO-04-03 — Instrument Interfacing – Test Ordering
**Category:** Instrument / Analyzer Integration  
**Round 2 status:** No Round 2 result yet


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in to OpenELIS Global with a valid user account (e.g. Lab Technician or Admin role as appropriate). Navigate to the Home page. | Login succeeds. Home page dashboard is displayed with the main navigation menu accessible via the hamburger icon (top left). |
| 2 | Set up a new Analyzer configuration in the Analyzer Dashboard | Analyzer created of proper type (HL7 or ASTM) and with a selected profile that matches the specific machine. |
| 3 | Modify test mappings to match Analyzer expectations |  |
| 4 | Create an Order and select an analyzer to send the Order to. |  |

**Known issue (Round 1):** Error when creating new type; CRUD system needed.

---

### LO-04-06 — Instrument Maintenance
**Category:** Instrument / Analyzer Integration  
**Round 2 status:** PARTIAL


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in to Odoo with a valid user account | You are logged |
| 2 | - You have to create "instrument" first. These are the steps: Click the module Maintenance → click Equipment → click to 'New' → fill the field and enter Equipment Name & Category → click to the 'icon Save' in the top | A new instrument (equipment) is successfully created and saved in the Maintenance module with the specified name and category, and it appears in the equipment list. |
| 3 | - For calibration, click to 'Maintenance' → select 'Maintenance Requests' → click to 'New' → Select 'Equipment' → fill the field 'request'→  Set Maintenance Type : Corrective/ Preventive → click to the 'icon Save' in the top | A maintenance request for calibration is successfully created, linked to the selected equipment, with the specified request details and maintenance type, and it is saved and visible in the Maintenance Requests list. |

**Known issue:** System does not support instruments with multiple modules (e.g. GeneXpert).

---

### LO-05-01 — Unconnected Diagnostics (Manual Result Entry)
**Category:** Results  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. (a) User account with Admin permissions for Test Management → Manage Methods (steps 1-9). (b) Same or separate user with Result-entry permission for /LogbookResults (steps 10-19). (c) An order with at least one manual-entry test (not routed to a connected analyzer) ready in Hematology. | Data + user(s) ready. |
| 1 | Navigate to https://mgtest.openelis-global.org and log in. | Login succeeds. Home dashboard renders. |
| 2 | Open side navigation menu (hamburger top-left). | Side nav drawer opens. |
| 3 | Click "Admin". | Admin landing page loads with category tiles. |
| 4 | Click "Test Management". | Test Management section expands / renders. |
| 5 | Select "Manage Methods". | Manage Methods page loads with existing methods listed. |
| 6 | Click "Add New Method". | Add Method form opens with English + French name fields. |
| 7 | Enter "Method Casey" in the English field and "Le Method Casey" in the French field. | Both fields populated; no validation errors. |
| 8 | Click "Save". | Confirmation prompt appears asking to confirm the new method. |
| 9 | Click "Accept". | Method "Method Casey" saved and appears in the methods list. |
| 10 | Open side navigation. Expand Results. | Results submenu shows: By Unit, By Patient, By Order, By Range of Order Numbers, By Test Date. |
| 11 | Click "Side navigation" / Results. | Results menu expanded. |
| 12 | Click "By Unit". | Results > By Unit page renders with Select Test Unit dropdown. |
| 13 | Select the "Hematology" option from the Select Test Unit dropdown. | Dropdown shows Hematology selected. |
| 14 | Click Search. | Pending Hematology test rows render (Sample Info / Test Date / Analyzer / Test Name / Normal Range / Accept / Result / Current Result / Notes). |
| 15 | Click the chevron on a manual-entry test row to expand sample details. Inspect the Methods dropdown. | Row expands to reveal Methods dropdown, Storage location, Refer-test-to-reference-lab, and  Add attachments + Test Performed date/time. Confirm "Method Casey" appears in the Methods dropdown — proves the newly-created method is selectable. |
| 16 | On the same expanded row, click the "Upload file" button (located between the Methods dropdown and the Refer test to a reference lab checkbox). Select a small image file from disk (e.g. a PNG screenshot or PDF). Confirm upload. | Carbon file uploader opens (accepts JPEG/PNG/PDF, single file). Selected file uploads. The Upload file button is wired to a hidden file input and the file is staged for save with the result. (End-to-end persistence — file is retrievable after saving and re-opening — should be verified explicitly during this run.) |
| 17 | On the same expanded row, locate the Test Performed date/time field. Verify it defaults to today + server-current time. Then change it to a date/time 24 hours in the past. | Field is visible, populated with today + now (server time) on first render, and editable. Past date/time accepted, no future-date error. |
| 18 | Select "Method Casey" from the Methods dropdown. Enter a numeric result (e.g. 14.5 for Hemoglobin). Add a note in the Notes column. Click Save. | Saved Successfully banner. Current Result column updates with 14.5. The Method "Method Casey", attachment, modified Test Performed date/time, and the note all persist. |
| 19 | Re-search the same accession on Results > By Unit. Expand the row again. Then go to Validation → By Order, find the saved result. | Re-opened row shows the same method, attachment (with download link), edited Test Performed date/time, and note. Validator UI on Validation → By Order shows the same metadata. Audit trail records the user-edited Test Performed date/time as the entered value (not the server default). FHIR Observation export uses the user-entered value as effectiveDateTime. |

---

### LO-05-02 — Review and Approval (Validation)
**Category:** Results  
**Round 2 status:** PARTIAL


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. ≥1 result awaiting validation. | Test data ready. |
| 1 | Log in as validator. Validation → Routine. | Page loads with result(s) awaiting validation. |
| 2 | Verify action button label. | Button labeled "Validate" not "Save". (Currently FAIL on deploy.) |
| 3 | Inspect validation screen for full patient/sample/test/result context. | All elements visible. (Currently FAIL on deploy.) |
| 4 | Validate one result. | Validation event commits; status → Validated; history records user + timestamp. |
| 5 | Validation audit/history. | Event present with full attribution. |
| 6 | Reports → Patient Status Report. | Validated result on patient's report. |

**Outstanding issues (MedX Round 2):**  
- Use "Validate" not "Save" on validation screen  
- Patient age and sex should be visible during validation  
- Result report should include analyzer serial number  
- Report should auto-capture "Test done by" and "Validated by" with signature

**DIGI response (30 April):** Minimum spec requirements are met. Additional fields raised were not part of original specification — submit as new requests.

---

### LO-05-03 — Sending Results
**Category:** Results  
**Round 2 status:** PASS  
**Validation video:** https://drive.google.com/file/d/1PP8hwDA4HgY6T9wZnk3o6jag0qnoNRyQ/view?usp=drive_link


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 9 | Set the default notification trigger — select when results are sent (e.g., upon validation, upon result entry) | The selected trigger is applied as the system default for all orders that have a notification address on file |
| 0 | Add SMTP/SMS Configurations  Go to Admin > External Connections Click Create nee Connection  For SMTP Configuration , Enter Name of Connection , Select SMTP_SERVER for Connection Type Select BASIC for Authenrication Type Set the SMTP server address as the URI Enter user Name as your email addres Enter SMTP token as password.  Save   For SMS  Configuration, we support Twilio SMS GateWay Enter Name of Conection Select BMP_SMS server for Connection Type Select BASIC for Authentication Type Leave the URI blank , it auto generated Set Your Twilio Account SID as User Name Set  Your Twilio Auth Token as  Password save    Make sure your Provider and Patients are created with a Phone Number or Email Addres | The main application side navigation menu opens |
| 1 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 2 | Click Admin | The Admin navigation menu expands |
| 3 | Click System Configuration (or Notifications / Results Reporting, depending on version) | The system configuration page loads displaying global settings |
| 4 | Locate the Patient Notification or Results Notification section | The notification settings panel is displayed, with toggles or fields for SMS and email |
| 5 | Toggle Enable Email Notifications to on | The email notification option is activated; email configuration fields become visible |
| 6 | Confirm or enter the default sender email address | The sender address field displays the address configured at the server level; edit if a lab-specific override is required |
| 7 | Toggle Enable SMS Notifications to on | The SMS notification option is activated; SMS configuration fields become visible |
| 8 | Confirm or enter the default SMS sender / shortcode | The sender field displays the number or shortcode configured at the server level |
| 10 | Click Save | The notification settings are saved; a success confirmation is displayed; the defaults will now apply to all new orders where a patient email or phone number is provided |
| 11 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 12 | Click Orders | The Orders submenu expands |
| 13 | Click Add Order | The new order entry wizard opens on the patient information step |
| 14 | Enter or search for the patient record | The patient's details are loaded into the order form |
| 15 | Click Next to advance to the requester / contact information step | The contact details section of the order form is displayed |
| 16 | Locate the Patient Email field and click it | The cursor focuses in the patient email address field |
| 17 | Type the patient's email address | The email address is entered (e.g., patient@example.com) |
| 18 | Locate the Patient Phone / SMS field and click it | The cursor focuses in the phone number field |
| 19 | Type the patient's mobile phone number | The phone number is entered in the expected format for the configured SMS provider |
| 20 | Locate the Send Results toggle or checkbox for Email and enable it | The email notification is activated for this order; results will be emailed to the address entered when the trigger condition is met (e.g., upon validation) |
| 21 | Locate the Send Results toggle or checkbox for SMS and enable it | The SMS notification is activated for this order; a results summary will be sent to the phone number entered upon the configured trigger |
| 22 | Complete the remaining order fields (sample type, tests, accession number) and click Submit | The order is created with notification preferences saved; the order record shows email and/or SMS delivery configured |
| 23 | Enter and validate results for the order following the standard results entry workflow | Results are entered and signed |
| 24 | Complete the validation step for the order | Upon validation (or whichever trigger was configured in Admin), the system dispatches the result notification |
| 25 | Check the patient's email inbox for the results notification | An email is received from the configured sender address containing the patient's results |
| 26 | Check the patient's mobile phone for the SMS notification | An SMS is received from the configured sender number containing the results summary |
| 27 | Negative test: Create an order with no email or phone number entered and validate results | No notification is sent; no delivery error is shown; the order completes normally without notification |
| 28 | Negative test: Create an order with a notification address entered but the Admin default notification toggle disabled | No notification is sent; the per-order address is saved but delivery does not occur, confirming that the Admin-level toggle gates all notifications globally |

---

### LO-05-04 — Result Report
**Category:** Results  
**Round 2 status:** PASS (verified with accession DEV01260000000000021, Patient ID 7897)


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition: at least 3 patients with completed lab orders; a known accession-number range; known patient ID for at least one. | Test data ready. |
| 1 | Log in. Navigate to Reports → Routine → Patient Status Report. | Patient Status Report page loads with three modes: Report By Patient, Report By Lab Number, Report By Site. |
| 2 | Expand Report By Patient. Enter a known Patient ID. Click Generate Printable Version. | Report renders. Verify Date of Birth appears alongside age; all completed test results listed. |
| 3 | Expand Report By Lab Number. Enter a known accession-number range. Click Generate Printable Version. | Range report renders with one section per accession; each includes DOB and the test results. |
| 4 | Expand Report By Site. Select a known site and date range. Click Generate Printable Version. | Site report renders; DOB present; orders for that site in the date range included. |
| 5 | Optional cross-check: open Reports → Routine → Aggregate Reports → Statistics Report. | Aggregate report runs without error. |

---

### LO-05-05 — Amendments to Results
**Category:** Results  
**Round 2 status:** No clear Round 2 result  
**Scribe walkthrough:** https://scribehow.com/viewer/How_to_Process_and_Validate_Hematology_Lab_Results_in_OpenELIS__-8UhOTR7SDWube5KTscHCg


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. (a) User account with Result-entry + Validate permissions on OE. (b) An order with at least one Hematology test in the awaiting-validation state on /AccessionValidation, OR a freshly entered+saved result you can validate. NO Keycloak admin access needed — amendments happen entirely inside OE. Reference walkthrough (Scribe): https://scribehow.com/viewer/How_to_Process_and_Validate_Hematology_Lab_Results_in_OpenELIS__-8UhOTR7SDWube5KTscHCg | User + data ready. Login form reachable at https://mgtest.openelis-global.org/login. |
| 1 | Navigate to https://mgtest.openelis-global.org/login. | OpenELIS login form renders. |
| 2 | Enter credentials and click Login. | Home dashboard loads with In Progress / Ready For Validation tiles. |
| 3 | Sidebar → Validation → Routine. | Routine validation page (/RoutineValidation) loads with a "Select Test Unit" dropdown. |
| 4 | Select "Hematology" from the Select Test Unit dropdown. | Pending-validation Hematology test rows render with columns: Sample Info / Test Name / Normal Range / Result / Save (checkbox) / Retest / Notes / Past Notes. |
| 5 | Click the expand chevron / icon on a test row to view test records. | Row expands to show full test detail. |
| 6 | Click the Notes field for the test result. Type a note (e.g. "First-pass validation note from technician"). | Notes field is focused and accepts text. Note appears in the field as you type. |
| 7 | Select the Save checkbox on the row. Click the bottom "Save" button. | Save action submits. Banner / confirmation appears. Result transitions to validated state. Note is persisted and appears in Past Notes on next refresh. |
| 8 | Sidebar → Results → By Order. | Results By Order page (/AccessionResults) loads with an Accession Number search field. |
| 9 | Paste the same accession number into the search field and press Enter. | Result rows for the accession render — including the previously-validated test now showing the saved Result value. |
| 10 | In the Result field for the previously-validated test, type "15" (or any new corrected value that differs from the validated value). | Result field accepts the new value. Existing Current Result column still shows the old validated value until save. |
| 11 | Click "Save". | Saved Successfully banner. Amended value persists; Current Result updates. Result is now back in awaiting-validation state. |
| 12 | Refresh the results list (re-search or page refresh) to confirm the updated value. | Re-fetched row shows the amended Result value (e.g. 15) in the saved column. |
| 13 | Sidebar → Validation → By Order. | Validation By Order page (/AccessionValidation) loads with an Accession Number search field. |
| 14 | Search for the accession number used above. | Validation rows render — the amended test is back in awaiting-validation state with the new value visible. |
| 15 | In the Notes column for the amended test row, enter a note explaining the change (e.g. "Recalculated after instrument recalibration — corrected from 25 to 15"). | Notes field accepts the reason-for-change text. |
| 16 | Select the Save checkbox on the row and click "Save". | Save submits successfully. Reason note persists; result transitions to validated (amended) state. |
| 17 | Refresh the validation list to confirm the change was applied. | Refreshed page no longer lists the amended test as awaiting validation (it has been re-validated). Past Notes on the row should display the reason for change. |
| 18 | Sidebar → Reports → Routine → Patient Status Report. | Patient Status Report selector renders with sub-options. |
| 19 | Click "Report By Lab Number". | Report By Lab Number form renders with From / To accession-range fields. |
| 20 | Paste the accession number into the From field (and into To if needed). | Form populated with the accession. |
| 21 | Click "Generate Printable Version". | Patient Status Report renders / downloads. Verify: (a) the AMENDED value is shown (not the original), (b) the value is clearly indicated as amended, (c) the REASON FOR CHANGE entered in step 15 appears on the report alongside the value. |

**DIGI clarification (3 May):**  
- Login is via standard OpenELIS login at mgtest.openelis-global.org/login — NOT Keycloak admin  
- Amendment reason entered on Validation → By Order screen as a Note  
- Revised Patient Status Report includes the amended value and reason

---

### LO-06-02 — Test Management
**Category:** Test Management  
**Round 2 status:** PASS  
**Validation video:** https://drive.google.com/file/d/1zZ__pLuXamjrG2NUMTLledNhSOV1u-8R/view?usp=drive_link


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition. Admin user with test-management permissions. Existing Test catalog has ≥3 active test types. | User + data ready. |
| 1 | Admin → Test Management (URL /MasterListsPage/TestManagement or via side nav). Page loads. | List of test types renders with Active/Inactive status visible. |
| 2 | Pick an active test type. Open Edit. Modify a non-key field (display name, ordering name, units). Save. | Modify succeeds; persisted change visible in the test list. |
| 3 | On the same test, set Active = false (Disable). Save. | Test disabled; status changes to Inactive in the list. |
| 4 | Reload Order → Add Order → Add Sample → Order Panels search. Try to add the disabled test to a new order. | Test no longer appears in the available-test search OR appears with disabled badge. ✅ |
| 5 | Re-enable the test (Active = true). Save. | Test active again; reappears in the order-add search. |
| 6 | Verify temporary-disable workflow: optionally schedule a future disable date, OR confirm that Active toggle is the only mechanism. Record observed behavior. | Either explicit scheduled-disable feature OR Active toggle is the only mechanism — both acceptable per the min req. |

---

### LO-07-01 — External Control (EQA)
**Category:** Quality Control / EQA  
**Round 2 status:** No Round 2 result yet


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition: User is logged in with appropriate access |  |
| 1 | Click the OpenELIS home/application icon | The OpenELIS application loads and the home dashboard is displayed |
| 2 | Click Admin | The Admin navigation menu expands |
| 3 | Click EQA Program Management | The EQA Program Management page loads, showing any existing programs in a list |
| 4 | Click Add Program | The Add Program form opens with empty fields for program name, category, frequency, and description |
| 5 | Click the Program Name field | The cursor is focused in the Program Name text field |
| 6 | Type My Program then press Tab | "My Program" is entered in the Program Name field; focus advances to the next field |
| 7 | Click the Category dropdown | The category dropdown opens displaying available options |
| 8 | Select Hematology | "Hematology" is selected as the program category |
| 9 | Select Monthly | "Monthly" is selected as the program frequency |
| 10 | Click the Description field | The cursor focuses in the Description field |
| 11 | Click the Description field again | Focus is confirmed in the Description field |
| 12 | Click the Description field again | The field is ready for text input |
| 13 | Type Test | "Test" is entered as the program description |
| 14 | Click Add Program | The program "My Program" is saved; a success confirmation is displayed and the new program appears in the EQA Program list |
| 15 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 16 | Click Orders | The Orders submenu expands |
| 17 | Click Enter New EQA Test | The EQA test order entry wizard opens on Step 1 |
| 18 | Click Next | The wizard advances to the site and program selection step |
| 19 | Select the ASDS option | ASDS is selected as the submitting site |
| 20 | Select the My Program option | "My Program" is selected as the EQA program for this order |
| 21 | Click the Provider Sample ID field | The cursor focuses in the Provider Sample ID field |
| 22 | Type 123456 Tab 75521 | Provider Sample ID "123456" and National ID "75521" are entered in their respective fields |
| 23 | Click the dd/mm/yyyy date field | The date picker calendar opens |
| 24 | Click 17 | The 17th is selected as the collection date; the date field is populated |
| 25 | Click Next | The wizard advances to the sample type and test selection step |
| 26 | Select Whole Blood | "Whole Blood" is selected as the specimen sample type |
| 27 | Click NFS | The NFS (CBC / Numération Formule Sanguine) panel is selected as the test to be run |
| 28 | Click Next | The wizard advances to the order generation step |
| 29 | Click Generate | A lab accession number is generated and displayed for the new EQA order |
| 30 | Click the Search Site Name field | The cursor focuses in the Site Name search field |
| 31 | Type EQA Sample then press Tab | "EQA Sample" is entered as the site name; focus advances to the next field |
| 32 | Click the Requester's First Name field | The cursor focuses in the requester first name field |
| 33 | Type backspace then Doc Tab Tab EQA Tab EQA Tab | Requester fields are populated: First Name = "Doc", Last Name = "EQA", and additional requester fields filled |
| 34 | Click on the order form area (department/unit field) | Focus moves to the order form body |
| 35 | Type backspace then HO then Enter | Department/unit "HO" (Hospital) is entered; the form field is committed |
| 36 | Click Submit | The EQA order is submitted; a confirmation screen displays the generated accession number |
| 37 | Click Print | The print dialog opens for printing the specimen label or order requisition form |
| 38 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 39 | Click Orders | The Orders submenu expands |
| 40 | Click Side navigation (expand) | The side navigation sub-items expand to show order search options |
| 41 | Click By Order | The "Enter Results by Order" search page loads with an accession number entry field |
| 42 | Click the Enter Accession Number field | The cursor focuses in the accession number input field |
| 43 | Press Cmd+V (paste) | The previously copied accession number is pasted into the field |
| 44 | Click Search | The system locates the EQA order; the NFS result entry form loads with empty result fields for all analytes |
| 45 | Click the first numeric result field | The cursor focuses in the first result entry field (e.g., WBC) |
| 46 | Enter values for all NFS analytes using Tab to advance between fields: 55, 15, 5, 5, 70, 33, 45, 555, 75, 1533, 1, 522, 41, 5, 5, 6524, 5, 95 | All 18 NFS result fields are populated with the entered values; each field accepts the value and Tab advances focus to the next analyte |
| 47 | Click Save | The entered results are saved against the accession number; a success confirmation is displayed |
| 48 | Click Sign | The results are electronically signed by the current logged-in user; signature and timestamp are recorded |
| 49 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 50 | Click Validation | The Validation submenu expands |
| 51 | Click Routine | The Routine Validation page loads displaying results awaiting validation |
| 52 | Select Hematology | The result list filters to show only Hematology section results pending validation |
| 53 | Click Save All Results | All displayed Hematology results are staged for validation; a confirmation or summary is shown |
| 54 | Click the checkbox or select control for the EQA result | The EQA result record is selected/checked for validation |
| 55 | Click Save | The selection is saved; a password/authentication prompt appears to confirm the validation action |
| 56 | Click the Password field | The cursor focuses in the password input field |
| 57 | Click the confirm/submit button | The password is submitted; the validation is authenticated and the result status changes to Validated |
| 58 | Click EQA Tests | The EQA Tests section opens in the navigation |
| 59 | Click Orders | The EQA Orders list page loads showing submitted EQA orders |
| 60 | Click on the EQA orders page content area | The page content is active; the list of EQA test orders is visible |
| 61 | Click on the EQA orders page content area again | The EQA order list remains displayed; the previously created order (My Program / ASDS) is visible in the list |
| 62 | Click on the EQA orders page content area again | The EQA order record for the submitted test is accessible and shows the current status |
| 63 | Click the action button (e.g., view/expand for the EQA order) | The selected EQA order opens, showing order details, specimen information, and result summary |
| 64 | Click Alerts | The Alerts section opens; any notifications or flags associated with the EQA program or results are displayed |

**Known issue (Round 1):** Fail at step 20.

---

### LO-07-03 — Calibration Samples
**Category:** Quality Control / EQA  
**Round 2 status:** No Round 2 result yet


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition: User is logged in with Admin level permissions. | Can access OpenELIS |
| 1 | In the side navigation, click Admin. | The Admin menu item is highlighted and the Admin management panel becomes accessible in the side navigation. |
| 0 | Scribe Screenshots: https://scribehow.com/viewer/LO-07-03__UZERdT2nRx6cTbdOLpLa4A |  |
| 2 | To open the side navigation, click the hamburger/menu icon in the top-left corner. | The full side navigation expands |
| 3 | In the Admin section of the navigation, click General Configurations. | The General Configurations submenu expands |
| 4 | Under General Configurations, click Order Entry Configuration. | The Order Entry Configuration page loads under the breadcrumb Home / Admin Management / Sample Entry Configuration Menu /. A Modify button is visible, and a table lists configuration parameters including Name, Description, and Value columns. Parameters such as auto-fill collection date/time, billingRefNumber, eqaEnabled, external orders, and Program are visible. |
| 5 | To select the eqaEnabled parameter, in the configuration table, click the radio button in the Select column next to the eqaEnabled row. | The eqaEnabled row is selected (radio button filled). The description reads that if true, the EQA checkbox appears on Order Entry allowing a sample to be marked as an EQA sample. The current value shows false. |
| 6 | Click the Modify button at the top of the Order Entry Configuration page. | The Edit Record form opens for the eqaEnabled parameter, showing: Name = eqaEnabled, Description = instructions.order.entry.eqa.enabled, and Value as a radio button toggle between True and False. Save and Exit buttons are visible. |
| 7 | On the Edit Record form, click the True radio button for the Value field. | The True option is selected (radio button filled). The False option is deselected. |
| 8 | Click the Save button on the Edit Record form. | The Edit Record form is saved with Value set to True. The page remains on the Edit Record view, confirming the new value. No error messages are displayed. |
| 9 | Click the EQA Program Management icon in the Admin side menu. | The Program Administration page loads at breadcrumb Home / EQA Program Management /. The page displays counts for Active Programs (0), Enrolled Participants (0), and Total Participants (0). The EQA Programs tab is active and shows "No EQA programs found." An Add Program button is visible. |
| 10 | In the side navigation, expand Order and click Add Order. | The My EQA Programs page loads showing "New EQA Program Enrollment" form with fields for Program Name, Provider, Description, Lab Units, Tests, Panels, and Status (Active toggle). A table below shows columns for Program Name, Provider, Lab Unit(s), Tests, Status, and Actions. |
| 11 | On the Test Request page, check the EQA Sample checkbox. | The EQA Sample checkbox is checked. The Patient section displays a notification: "EQA Sample — Patient Info Locked — Patient demographic fields are automatically set for EQA samples and cannot be edited." Patient information fields (Unique Health ID number, National ID, Last Name, First Name) all display NULL and are locked for editing. |
| 12 | Click the Program Select step in the workflow indicator. | The Program Select step becomes active. The EQA Sample Information form is displayed with fields for Provider (dropdown), Programme (dropdown), Provider Sample ID, Participant ID, Result Deadline (dd/mm/yyyy), and EQA Priority (defaulting to Standard). Back and Next buttons are visible. |
| 13 | Click the Provider dropdown and select a provider. | The Provider dropdown opens showing available provider options. After selection, the chosen provider name is displayed in the field. |
| 14 | Click the Provider Sample ID field and type a sample ID value. | The Provider Sample ID field accepts text input. The typed value is displayed in the field. |
| 15 | To select a Result Deadline date, Click the Result Deadline date field (dd/mm/yyyy) and select a date using the calendar picker. | The calendar datepicker opens. After selecting a date, the Result Deadline field is populated in dd/mm/yyyy format. |
| 16 | Click the Programme dropdown and select a programme. | The Programme dropdown opens showing available options. After selection, the chosen programme is displayed in the field. |
| 17 | Click the Participant ID field and type a participant ID value. | The Participant ID field accepts text input. The typed value is displayed in the field. |
| 18 | Click the EQA Priority dropdown (currently showing Standard) and select a priority level. | The EQA Priority dropdown opens with available options. The selected priority is displayed in the field. |
| 19 | Click the home/logo icon in the top navigation bar. | The application navigates to the Home dashboard displaying summary statistics: Orders Entered By Users Today, Orders Rejected By Lab Today, UnPrinted Results Today, Electronic Orders, Average Turn Around time Reception to Validation, and Delayed Turn Around More Than 96 hours — all showing 0. |
| 20 | In the side navigation, click Admin, then click Test Management. | The Test Management page loads in the Admin panel, displaying a list of management options including: Rename existing method names, View Test Catalog, Manage Methods, Add new tests, Modify tests, Activate/Deactivate tests, Enable/disable test orderability, and Manage Test Units. |
| 21 | Click Add new tests (described as: Use to add new tests to the system. Modification of existing tests should be done through the other test management links). | The Add new tests page loads at breadcrumb Home / Admin Management / Test Management / Add new tests /. The form displays a Show Guide toggle (Off), a Test Section dropdown, a Test Name field (English and French), and a Reporting Test Name field (English and French) with a Copy from Test Name button. Next and Cancel buttons are visible. |
| 22 | Click the Test Section dropdown and select Immunology. | Immunology is selected and displayed in the Test Section field. |
| 23 | Click the Test Name — English text field. | The English Test Name field is focused and ready for input. |
| 24 | Type "Internal Control Example this will not appear in the patient report" in the English Test Name field. | The text "Internal Control Example this will not appear in the patient report" is entered in the English Test Name field. A validation message "French test name is required" appears under the French field, indicating that field is also required. |
| 25 | Click the Reporting Test Name — English field. The text from the English Test Name field is auto-populated (using Copy from Test Name or by clicking the field). | The Reporting Test Name — English field is populated with "Internal Control Example this will not appear in the patient report." |
| 26 | Click on the English Test Name text to select it, then press Cmd + C to copy. | The text "Internal Control Example this will not appear in the patient report" is copied to the clipboard. |
| 27 | Click the Test Name — French text field. | The French Test Name field is focused. A "French test name is required" validation indicator is visible. |
| 28 | Press Cmd + V to paste the copied text into the French Test Name field. | The text "Internal Control Example this will not appear in the patient report" is pasted into the French Test Name field. The French test name validation error clears. |
| 29 | Click the Reporting Test Name — French text field. | The Reporting Test Name — French field is focused and ready for input. |
| 30 | Select the text in the Reporting Test Name — English field and press Cmd + C. | The text is copied to the clipboard. |
| 31 | Press Cmd + V to paste into the Reporting Test Name — French field. | The French Reporting Test Name field is populated with "Internal Control Example this will not appear in the patient report." All four name fields are now populated. |
| 32 | Click Next to advance to the next step | The form advances to the next step, showing Panel (Select Panel) and Unit of measure (Select Unit of Measurement) fields, with Next and Back buttons. |
| 33 | Click Next again to advance past Panel/Unit step | The form advances to the result type configuration page showing fields for: Result type (dropdown), LOINC, Antimicrobial Resistance checkbox, Is Active checkbox (checked), Orderable checkbox (checked), Notify Patient Of Results checkbox, and In Lab Only checkbox. |
| 34 | Click the Result type dropdown and select Free text. | Free text is selected and displayed in the Result type field. |
| 35 | Click the In Lab Only checkbox. | The In Lab Only checkbox is checked, indicating this test result will only be visible internally and not published to the patient report. |
| 36 | Click Next to advance to sample type step | The form advances to the sample type configuration step, showing a Sample Type multi-select field and a Test display order field. Next and Back buttons are visible. |
| 37 | Click the Sample Type dropdown and select Whole Blood. | Whole Blood is selected and displayed as a tag in the Sample Type field (shown as "Whole Blood ×"). |
| 38 | Click Next to Advance to final review step | The form advances to the final review/confirmation step showing a list of all existing tests in the system, including the newly created "Internal Control Example this will not appear in the patient report" entry at the bottom of the list. Next and Back buttons are visible. |
| 39 | Click Accept to accept the new test. | The full test summary is displayed showing: Result type: Free text, Antimicrobial Resistance: N, Is Active: Y, Orderable: Y, Notify Patient Of Results: N, In Lab Only: Y, along with a list of all tests in the system. The new test "Internal Control Example this will not appear in the patient report" is visible in the list. Reference value and Default result fields are shown as empty. Accept and Back buttons are visible. |
| 40 | Click the reset/new button to start a new test entry. | The Add new tests form resets. Test Section shows "Select Test Section." All name fields are cleared. |
| 41 | Click the side navigation toggle icon to open side navigation | The full navigation menu expands with all sections visible. |
| 42 | In the side navigation, expand Order and click Add Order. | The Order menu expands showing Add Order, Add Order, Study, Edit Order, Incoming Orders, Batch Order Entry, and Barcode. The Add new tests form remains in the background but the navigation focus shifts. |
| 43 | Click on the Patient section of the Test Request page. | The Test Request page opens at the Patient Info step. The EQA Sample checkbox is unchecked. The Patient section shows Search for Patient and New Patient buttons, with fields for Patient Id, Previous Lab Number, Last Name, First Name, Date of Birth (dd/mm/yyyy), and Gender (Male/Female). A Patient Results section is visible below. |
| 44 | Click the New Patient button. | The Patient Information form expands |
| 45 | Click the Unique Health ID number field. | The Unique Health ID number field is focused and ready for input. |
| 46 | Enter patient details via Tab navigation (e.g. Type "132456", press Tab, type "123456", press Tab, type "test", press Tab, type "Casey".) | The fields are populated (e.g. The fields are populated as follows: Unique Health ID number = 132456, National ID = 123456, Last Name = test, First Name = Casey. Focus advances through fields with each Tab press.) |
| 47 | Click the Male radio button in the Gender field. | Radio button selected |
| 48 | Click the Date of Birth field (dd/mm/yyyy) and select birthdate:  In the calendar, click on the year to navigate to 2001, naviate to month 4 (April), then double-click to confirm, then click day 12. | The calendar navigates to April 2001. After clicking 12, the Date of Birth field is populated with 12/04/2001. The Age/Years field auto-calculates to approximately 25, Months 0, Days 3. |
| 50 | Click Next to submit the patient information. | The workflow advances to the Program Select step. The patient summary shows: Unique Health ID 132456, National ID 123456, Last Name test, First Name Casey, Gender Male, Date of Birth 12/04/2001, Age 25. The program dropdown shows Routine Testing. |
| 51 | Click Next on the Program Select step. | The Add Sample step becomes active. Sample 1 is displayed with the sample type dropdown pre-selected or ready for selection. Fields for Quantity, Sample Unit of Measure, Collection Date, Collection Time, and Collector are visible. |
| 52 | Click the sample type dropdown for Sample 1 and select Whole Blood. | Whole Blood is selected and shown in the sample type dropdown for Sample 1. |
| 53 | In the test selection list, check the checkbox next to Internal Control Example this will not appear in the patient report. | The checkbox next to "Internal Control Example this will not appear in the patient report" is checked. The test is added to the order for Sample 1. |
| 54 | Check the checkbox next to HIV Rapid Test in the test selection list. | The HIV Rapid Test checkbox is checked. Both HIV Rapid Test and Internal Control Example are now selected for Sample 1. |
| 55 | Click Next to proceed to the Add Order step. | The Add Order step becomes active, showing the ORDER section with: Lab Number field, Priority (ROUTINE), Request Date (auto-filled to today), Received Date (auto-filled), Reception Time (auto-filled), and other order fields. The RESULT REPORTING section at the bottom shows Sample 1 with both tests listed — HIV Rapid Test and Internal Control Example — each with Email and SMS notification checkboxes for Patient and Requester. |
| 56 | Click Generate next to the Lab Number field. | A lab number is auto-generated and displayed in the Lab Number field (e.g., DEV01260000000000001). The field is populated and the number is available for copying. |
| 57 | Click the Search Site Name field and type "Hospital", then press Tab four times, type "Doc", press Tab, type "Doc", press Tab. | The Site Name field is populated with "Hospital." Tab keypresses advance focus through subsequent fields (ward/dept/unit, Search Requester, etc.). Requester's First Name and Last Name are filled with "Doc." |
| 58 | Click Submit. | The order is submitted successfully. A success screen appears showing a green checkmark, "Successfully saved," and a print labels section displaying the generated lab number (e.g., DEV01260000000000001) with order (Qty: 1) and specimen (Qty: 1) Print buttons, and a Done button. A notification message "Sample Order Entry has been saved successfully" appears in the top-right corner. |
| 59 | To copy the lab number, Double-click the lab number on the success screen, then press Cmd + C to copy it. | The lab number (e.g., DEV01260000000000001) is selected and copied to the clipboard. |
| 60 | Click the home/logo button in the top-left navigation bar. | The application returns to the Home dashboard. The success screen is dismissed. |
| 61 | To open the side navigation, Click the side navigation toggle. | The full navigation menu expands. |
| 62 | In the side navigation, expand Results and click By Order. | The Results page loads at breadcrumb Home /. The page shows a Search section with an Enter Accession Number field and Search button. The results table shows "There are no records to display." Items per page is set to 100. |
| 63 | To paste the lab number and search, Click the Enter Accession Number field, press Cmd + V to paste the lab number, then press Enter. | The accession number (e.g., DEV01260000000000001) is pasted into the field. After pressing Enter, the results table loads showing 2 rows for the order: one for HIV Rapid Test (Serum) with Normal Range "Négatif" and a Result dropdown, and one for Internal Control Example this will not appear in the patient report (Whole Blood) with a free text Result field. Both rows show the sample info (patient name test, Casey, DOB 12/04/2001) and Test Date 15/04/2026. |
| 64 | In the result row for HIV Rapid Test, click the Result dropdown and select Negative. | "Negative" is selected and displayed in the Result field for the HIV Rapid Test row. |
| 65 | Click the free text Result field for the Internal Control Example row. | The free text Result field for the Internal Control row is focused and ready for input. |
| 66 | To add the internal control result, Type "Control line was good" in the Internal Control result field. | The text "Control line was good" is entered in the Result field for the Internal Control Example row. |
| 67 | Click the Save button at the bottom of the results table. | Both result rows show their Save checkboxes checked. The results are saved. The HIV Rapid Test shows Result = Negative (Save checked). The Internal Control shows Result = "Control line was good" (Save checked). |
| 68 | To open side navigation, Click the side navigation toggle. | The full navigation menu expands. |
| 69 | n the side navigation, expand Validation and click Routine. | The Validation page loads with a Search section showing a Select Test Unit dropdown. The results table shows "There are no records to display." |
| 70 | To search using the dropdown, Click the Select Test Unit dropdown and leave it, then click the Search button. | The search executes. The results table remains showing "There are no records to display" (no pending validations for the selected unit). |
| 71 | In the side navigation under Validation, click By Order. | The Validation page loads with a Search section showing an Enter Accession Number field (labeled "Enter Lab No") and a Search button. The results table shows "There are no records to display." |
| 72 | Click the Enter Accession Number field, press Cmd + V to paste the lab number, then press Enter. | The accession number is pasted. After pressing Enter, the validation table loads showing 2 rows: HIV Rapid Test (Serum) with Result = Negative, and Internal Control Example this will not appear in the patient report (Whole Blood) with Result = Control line was good. Columns include Sample Info, Test Name, Normal Range, Result, Save, Retest, Notes, and Past Notes. Options for Save All Normal, Save All Results, and Retest All Tests are visible at the top. |
| 73 | Click the Save checkbox in the HIV Rapid Test row. | The Save checkbox for the HIV Rapid Test row is checked (filled). |
| 74 | Click the Save checkbox in the Internal Control Example row. | The Save checkbox for the Internal Control row is checked (filled). Both rows now have Save checked. |
| 75 | Click the Save button at the bottom of the validation table. | The validation is saved. The page refreshes showing a notification "No Results found validated" and the table returns to "There are no records to display," indicating the results have moved out of the pending validation queue. |
| 76 | Click the home/logo button. | The application navigates to or refreshes the current page context. |
| 77 | Click the side navigation toggle. | The full navigation menu expands. |
| 78 | In the side navigation, expand Reports and click Routine. | The Reports submenu expands under Routine, showing: Patient Status Report, Aggregate Reports, Management Reports, and Routine CSV Report. |
| 79 | Click Patient Status Report under Reports > Routine. | The Patient Status Report page loads at breadcrumb Home /, showing three report generation sections: "Generate All Reports for a Client" (Report By Patient), "Generate a report or range of reports by Order Number / Lab Number" (Report By Lab Number), and "Generate Reports By Site" (Report By Site). A Generate Printable Version button is visible at the bottom. |
| 80 | Click Report By Lab Number. | The Report By Lab Number section expands, showing a From field and a To field with the instruction: "Scan or Enter Manually. For a single report, leave the box at the right empty." |
| 81 | Click the From field. | The From field is focused and ready for input. |
| 82 | Press Cmd + V to paste the lab number into the From field. | The lab number (e.g., DEV01260000000000001) is pasted into the From field. The To field remains empty, indicating a single report request. |
| 83 | Click the Generate Printable Version button. | The Patient Status Report is generated for the specified lab number. The report opens in a printable format. The HIV Rapid Test result (Negative) appears in the report. The Internal Control Example test result does NOT appear in the patient report, confirming the In Lab Only configuration set in TC-35 is functioning correctly. |

**Known issue (Round 1):** Programme provider dropdown fails to show previously created EQA programme.

---

### DU-10-01 — Content Views (Dashboard)
**Category:** Dashboard  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | **Note in response to the comments following first round** > The intent of the requirement was that dashboards are present in 1 place. User should not have to go to 3 different systems to create or view different charts.   There are many types of dashboard across an application as wide as eSIL (lab, stock, sales, security...): - Operational dashboards - Statistical dashboards - Indicators  - Security audits ...  Having only 1 place for all dashboards is in fact not practical for users in real life. For example, a data scientist would rather manipulate a more complicated interface with advanced charting ability. A lab technician simply needs to see the queued orders A pharmacist needs to see stock levels, right next to his usual day to day screens, not having to go to a central dashboard place.  For this reason, we describe all possible options for dashboards. If anything, Superset can also be seen as the central place for dashboarding since it has all the data. There are also possibilities to bring SS charts directly embedded into the apps.  Finally, mind that from the perspective of the tester, an integrated solution such as eSIL may seem heavy to navigate, but for the end users, they will likely be exposed to only 1 particular app, perfectly designed for their particular business area. |  |

---

### DU-10-02 — Filtration (Dashboard)
**Category:** Dashboard  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | **Note in response to the comments following first round** >Similar to DU-10-01 - user should not have to go to 3 systems to view and manage content.   Refer to updated answer on DU-10-01 |  |

---

### DU-10-04 — Enter/Delete Reagent Level
**Category:** Dashboard  
**Round 2 status:** PASS


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click the menu 'Inventory' → Operations → Receipts → New → Add Product (Reagent) → fill "receive from" → fill 'operation type' → add a line of product → click the icon 'save' → Validate | - The reagent is successfully recorded in the inventory upon receipt - Stock quantity is automatically updated - The reagent becomes available for future use in laboratory operations - Full traceability is ensured (lot + expiration + origin) |
| 0 | Log in to Odoo with a valid user account | Loogin succed |
| 2 | Click the menu 'Inventory' → Operations → Internal Transfers → New → Add Product (Reagent) → fill "contact" → fill 'source location' → fill 'destination location' → add a line of product → click the icon 'save' → Validate | - The selected reagent quantity is successfully deducted from stock - The movement is recorded in inventory history (stock moves) - The reagent is no longer available in the source location - Stock levels are updated in real time across the system |

---

### DU-11-01 — Standardized and Customizable Reports
**Category:** Reports  
**Round 2 status:** PASS  
**Servers:** OpenELIS: https://mgtest.openelis-global.org/ | Superset: https://analytics.oz-esil-uat.mekomsolutions.net/

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Access Superset. Navigate to the Charts page. | Confirm that many types of charts can be created against various datasets — demonstrating highly customizable reporting. |
| 2 | In Superset, find the Stock Levels chart. Click the three-dot menu (top right of chart). Select Download. | Confirm reports can be exported in CSV, Excel, JSON, or image format. |
| 3 | Access OpenELIS, log in as a user with reporting access (e.g. admin). In the left-hand menu, expand the Reporting section. | Confirm the following are available: **Routine:** Patient Status Report. **Aggregate Reports:** Statistics Report, Summary of All Tests, HIV Test Summary. **Management Reports:** Routine CSV Report. **Study — Patient Status:** ARV (Versions 1/2 Initial & Follow-up), EID (Versions 1/2), VL (Version Nationale), Indicator (Section Performance, Delayed Validation, Non-Conformity Reports). **Non-Conformity Reports:** By Date, By Unit and Reason, By Labno, Notification, Follow-up Required. **Export By Date:** General, Viral Load Data Export. **Audit Trail:** System Events, Order Events. **WHONET Report.** |

---

### DU-11-02 — Sample and Test Results Reports
**Category:** Reports  
**Round 2 status:** No Round 2 result yet  
**Server:** https://mgtest.openelis-global.org/  
**Scribe:** https://scribehow.com/viewer/DU-11-02__J9lG6gihSeyIVQDo7z8I2Q


*Steps from Round 2 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Precondition: User is logged in with permissions to access Validation and Reports. A known accession number (e.g., DEV01260000000000004) exists in the system with results entered. An order has been entered and results added but has NOT been validated.  To do this: go to order, add order, fill out all details for the order and save it, when you get to the barcode label, copy the lab number, you will need this for the next steps, then go to results - by order, enter in the lab number, enter a result. Save. Keep the same lab number, you are now ready for the validatoin step. |  |

**Precondition:** An order must be entered with results added, but NOT yet validated.

---

### DU-11-03 — Audit Trails and Compliance Reports
**Category:** Reports  
**Round 2 status:** No Round 2 result yet  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | - Log in to OpenELIS Global with a valid user account - In the main side menu, follow the navigation: Reports ->  Audit Trail -> System Events | You will be redirected to the System Audit Trail Dashboard. |
| 2 | - Apply filter(s) and then hit the "Search" button | Fetches and renders any matching data |
| 3 | - If you want to export the data, hit "Export CSV" or "Export PDF" | Triggers download of the generated reported |
| 4 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 5 | Click Admin | The Admin navigation menu expands showing available admin options |
| 6 | Click on the Admin page content area | The Admin landing page loads displaying the full list of administrative configuration options |
| 7 | Click Site Information | The Site Information configuration page loads, displaying the current site name, logo, and lab details |
| 8 | Click on the site information field or logo area | The relevant field or section is focused, ready for editing |
| 9 | Click Modify | The Site Information form becomes editable; fields are unlocked for input |
| 10 | Click on the field to be updated (e.g., site name, lab director, or logo) | The selected field is active and accepts new input |
| 11 | Click Save | The updated site information is saved; a success confirmation message is displayed and the page reflects the new values |
| 12 | Click the hamburger / navigation icon | The main application side navigation menu opens |
| 13 | Click Side navigation (expand) | The side navigation sub-items expand |
| 14 | Click Routine | The Routine Validation page loads showing results pending validation |
| 15 | Select the Biochemistry option | Biochemistry is selected as a section to be included for electronic signature validation |
| 16 | Select the Hematology option | Hematology is also selected; both sections are now marked for electronic signature validation |
| 17 | Click the electronic signature enable toggle or checkbox | The electronic signature option is activated for the selected sections |
| 18 | Click Save | The electronic signature section settings are saved; a success confirmation is displayed |
| 19 | Click on the electronic signature certification notice | A certification statement modal or panel appears, informing the user that their electronic signature will serve as a legally binding equivalent to their handwritten signature |
| 20 | Click "I have read and understand the above statement" | The acknowledgment checkbox is checked, confirming the user has read the certification terms; the Password field and Certify & Continue button become active |
| 21 | Click the Password field | The cursor focuses in the password input field |
| 22 | Click Certify & Continue | The password is submitted and the certification is validated; the user's electronic signature is registered in the system as compliant |
| 23 | Click Sign | The electronic signature is applied to the selected results; the signed status is confirmed and recorded with a timestamp and the authenticated user's credentials |
| - Log in to OpenELIS Global with a valid user account
- In the main side menu, follow the navigation: Reports ->  Audit Trail -> System Events | You will be redirected to the System Audit Trail Dashboard. |  |

---

### DU-11-06 — Quality Control and Assurance Reports
**Category:** Reports  
**Round 2 status:** No Round 2 result yet  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in to OpenELIS Global with a valid user   account (e.g. Lab Technician or Admin role as appropriate). Navigate to the   Home page. | Login succeeds. Home page dashboard is   displayed with the main navigation menu accessible via the hamburger icon   (top left). |
| 2 | In the navigation menu (on the left), select Non-Conform | Screen will show the "Non-Conformity" form |
| 3 | Fill out the form with the relevant data points | All fields filled. |
| 4 | Attach the sample using the lab number (Optional) | Sample is attached |
| 5 | Save the form | Success message is returned |
| 6 | In the navigation menu (on the left), select Non-Conform-> All NCEs to   review them | All created NCEs should show up |
| 1 | Once a test Order has been created/collected sample, Go to the dashbard   and open pending tests widget to open the lab test | opens the test to enter results |
| 2 | Expand the given test | Screen shows the Report NCE button |
| 3 | Clicking the Report NCE button reveals similar form as above | Inline Report NCE form is opened |
| 4 | Fill out the form with the   relevant data points | All fields filled. |
| Log in to OpenELIS Global with a valid user
  account (e.g. Lab Technician or Admin role as appropriate). Navigate to the
  Home page. | Login succeeds. Home page dashboard is   displayed with the main navigation menu accessible via the hamburger icon   (top left). |  |
| Once a test Order has been created/collected sample, Go to the dashbard
  and open pending tests widget to open the lab test | opens the test to enter results |  |

---

### DU-11-07 — Performance and Productivity Reports
**Category:** Reports  
**Round 2 status:** No Round 2 result yet  
**Server:** https://mgtest.openelis-global.org/


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | Preconditions: You are logged in to OpenELIS with a lab manager or reporting role, At least 3 completed orders exist with all TAT milestones populated: order created, specimen collected, received, testing started, result entered, and result validated. Orders should span different dates, The holiday calendar is configured for the current year (Admin → Calendar) |  |
| 3 | Click Turn Around Time Report | The Turn Around Time Report page loads |
| 2 | Click Reports | The Reports submenu expands |
| 1 | Click the hamburger / navigation icon | The main side navigation menu opens |
| 4 | Verify the page heading is displayed | The heading "Turn Around Time Report" is visible at the top of the page |
| 5 | Verify the section/segment filter dropdown is visible | A dropdown to filter by lab section (e.g., Hematology, Biochemistry) is present in its default state |
| 6 | Verify the Generate Report button is visible and enabled | The Generate Report button is displayed and clickable; no report data is shown yet |
| 7 | Click Generate Report | The report runs; a result count (e.g., "Total Results: 3") appears within the page. If no orders fall within the default date range, "No results found" is displayed instead |
| 8 | Verify the Summary tab is visible | A Summary tab is displayed at the top of the report results area |
| 9 | Verify the Detail tab is visible | A Detail tab is displayed alongside the Summary tab |
| 10 | Verify the Trends tab is visible | A Trends tab is displayed; all three tabs — Summary, Detail, and Trends — are present |
| 11 | Verify the filter summary area beneath the filter controls shows the active measurement interval | The label "Receipt to Validation" is displayed as a badge or tag, confirming the report is measuring TAT from specimen receipt to result validation |
| 12 | While on the Summary tab, verify summary statistics are shown | Aggregate statistics are displayed (e.g., average TAT, min/max TAT, total result count) along with a histogram or breakdown of TAT ranges |
| 13 | Click the Detail tab | The Detail tab becomes active and highlighted |
| 14 | Verify the Detail tab is now selected | The Detail tab appears highlighted or underlined as the active tab |
| 15 | Verify the detail list is displayed | A list or table of individual results is shown, with a row per order and columns for each TAT milestone (order created, collected, received, testing started, result entered, validated) and a calculated total TAT duration |
| 16 | Click a column header in the Detail list to sort | The list re-sorts by that column in ascending order; clicking the same header again sorts in descending order |
| 17 | If the list contains more rows than fit on one page, verify pagination controls are present | Next/previous page controls or a page size selector are visible at the bottom of the list |
| 18 | Click the Trends tab | The Trends tab becomes active |
| 19 | Verify the Trends view loads | A time series chart or graph is displayed showing TAT values over time |
| 20 | Verify the interval selector is visible | A dropdown or toggle to change the time aggregation (e.g., Daily, Weekly, Monthly) is displayed above or alongside the chart |
| 21 | Change the interval selector to a different aggregation (e.g., switch from Daily to Weekly) | The chart updates to reflect the newly selected aggregation interval |
| 22 | Click the overflow / options menu (three-dot icon) on the report page | A dropdown menu opens showing available actions |
| 23 | Verify a CSV export option is listed in the menu | An option to export or download the report as CSV is displayed |
| 24 | Click the CSV export option | A CSV file is downloaded to your computer |
| 25 | Open the downloaded CSV file | The file contains rows for each result in the report, with columns for accession number, priority, each TAT milestone timestamp, and the calculated TAT duration |
| 26 | Negative test: Return to the TAT Report page and adjust the date range filter to a period during which no orders were completed, then click Generate Report | The report displays "No results found"; no statistics, chart, or list rows are shown; no error message appears |
| 27 | Negative test: Reset the date range to its default and change the section filter to a lab section that has no completed orders, then click Generate Report | The report displays "No results found" for that section; the filter badge updates to reflect the selected section |
| 28 | Negative test: Reset all filters and click Generate Report; verify the previously validated orders appear in the Detail tab with all 6 milestone timestamps populated and a non-zero total TAT duration | All expected orders are listed in the Detail view with complete milestone data; no milestone column is blank; the total TAT duration is a positive value for each row |
| Click the hamburger / navigation icon | The main side navigation menu opens |  |

**Known issues (Round 1):** Last 7 days / Last 30 days date ranges don't work; TAT segment has no dropdown; no interval section on Trend view.

---

### DU-12-03 — Reliability of Data Transmission (FHIR)
**Category:** Data Export / Interoperability  
**Round 2 status:** PASS (per DIGI validation video)  
**Instructions:** https://scribehow.com/viewer/Configuring_FHIR_Application_Properties_in_OpenELIS__2uWo86hCQXWxHinu8h2g1A  
**Video:** https://drive.google.com/file/d/1k2EKZ8qcm9wJ4-cXkuHloRS850CmdITU/view?usp=drive_link


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 0 | OpenELIS Global continuously sends lab data (orders, results, patients) to configured external FHIR servers using the FHIR R4 standard. When a transmission fails — due to network interruption, server unavailability, or timeout — the system does not discard the data. Instead, it: Persists the unsent FHIR resource as a pending task in the local database. Continues operating normally so lab staff are unaffected. Runs a background scheduled job that periodically checks for pending or failed FHIR tasks and automatically re-attempts transmission. Retries until the remote server is reachable and acknowledges receipt. Marks the task as complete once the server confirms successful delivery. No manual intervention is required from lab staff. The retry loop runs silently in the background and is resilient to extended outages. |  |
| 0 | Prerequisites |  |
| 0 | OpenELIS Global is installed and running. |  |
| 0 | At least one FHIR subscriber endpoint is configured under Admin → External Connections → FHIR Subscribers. |  |
| 0 | You have access to the OpenELIS server logs (typically at /var/lib/OpenELIS-Global/logs/). |  |
| 1 | Step 1 — Simulate a connectivity failure |  |
| 2 | Change the configured FHIR subscriber URL to an unreachable address (e.g., add a typo to the hostname, or point it to a server that is offline). |  |
| 3 | Admin → External Connections → FHIR Subscribers → Edit → update the URL → Save. |  |
| 4 | Complete and validate a test result, or Save a new order. | OpenELIS will attempt to send the resulting FHIR resource to the (now unreachable) endpoint. |
| 6 | Check the server log for an entry indicating the transmission failed and was queued for retry: |  |
| 7 | grep -i "fhir" /var/lib/OpenELIS-Global/logs/openelis.log \| grep -i "retry\\|fail\\|queue" | You should see log lines such as: WARN  FhirApiWorkFlowServiceImpl - FHIR task failed, will retry: [task id] |
| 8 | Restore the correct FHIR subscriber URL (undo the change from Step 1). |  |
| 8 | Admin → External Connections → FHIR Subscribers → Edit → restore the correct URL → Save. |  |
| 9 | Observe automatic retry: Wait for the next scheduled retry cycle (typically within 1–5 minutes). Check the log again:  grep -i "fhir" /var/lib/OpenELIS-Global/logs/openelis.log \| grep -i "success\\|sent\\|complete" | You should see a log entry confirming the previously queued task was retried and delivered successfully: INFO  FhirApiWorkFlowServiceImpl - FHIR task completed successfully: [task id] |

---

### DU-12-04 — Manual Data Export
**Category:** Data Export / Interoperability  
**Round 2 status:** No Round 2 result yet  
**Validation video:** https://drive.google.com/file/d/1tNPAEkY2WJo0dnlwUBV9J_DDlIHYHVRg/view?usp=drive_link


*Steps from Round 1 testing data.*

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | - Log in to OpenELIS Global with a valid user account (e.g. Lab Technician or Admin role as appropriate). Navigate to the Home page. - In the main side menu, follow the navigation: Reports -> Routine -> Routine CSV Report. - On the page that opens up, configure the export parameters which are the "start date" and the "end date", also select the unit typ from the dropdown - Click the  "Generate Printable version" button | printable version of the csv formatted report |
| 2 | - You want to retrieve patient data in FHIR JSON format so you can integrate with other healthcare systems.  - You want to export patient data in FHIR XML format so you can process data using XML-based tools.  - You want to export lab results via FHIR Observation resources so you can share results with external systems.  - You want to verify FHIR endpoints respond with proper authentication so you can ensure secure data access.  - Create GET request to https://testing.openelis-global.org/api/OpenELIS-Global/fhir/Patient  - Go to Authorization tab, select "Basic Auth", set Username: admin, Password: adminADMIN!  - In Headers tab, set Accept: application/fhir+json, then send request and verify 200 OK with valid FHIR Bundle JSON  - Change Accept header to application/fhir+xml, send request and verify same data returns in valid XML format | Both JSON and XML formats return valid FHIR patient data with successful Basic Auth authentication. |

**Known issue (Round 1):** CSV export for Hematology includes chemistry assay data (Albumin, ALT, etc.) — should only include Hematology assays.

---

## Running the Suite

### Priority Order
Run requirements in this order (highest-impact first):

1. **LO-03-08** — Aliquoting (FAIL in Round 2 — highest priority retest)
2. **LO-01-04** — Patient Merge (FAIL in Round 2)
3. **LO-04-06** — Instrument Maintenance (PARTIAL — multi-module gap)
4. **LO-05-02** — Review & Approval (PARTIAL — UI/terminology issues)
5. **LO-02-01** — Request Creation (PARTIAL — label print error)
6. All `[No Round 2 result yet]` requirements (LO-03-05, LO-03-06, LO-04-03, LO-05-05, LO-05-06, LO-07-01–07-04, DU-11-02, DU-11-03, DU-11-07, DU-12-04)

### Reporting Format
For each requirement, record:
```
ReqID: LO-XX-XX
Step: N
Status: PASS / FAIL / PARTIAL / BLOCKED / GAP
Notes: [exact failure description]
Screenshot: [filename]
```

### Known Bugs to Watch For
- `/rest/notification/pnconfig` → 404 on every page load (background error, low priority)
- White screen after patient Save → refresh and verify data saved correctly
- Specimen label print error via LabelMakerServlet → note HTTP status

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-11 | v1.0 created — requirements from e-SIL UAT Details CSV; LO-01-01 and DU-11-01 steps populated; all others marked pending raw_Testing Details CSV |
| 2026-05-11 | v1.1 — LO-03-02 steps populated from raw_2 CSV export (Round 2, 7 steps) |
| 2026-05-11 | v2.0 — all [STEPS PENDING] sections populated from raw_Testing Details CSV (Round 2 preferred, Round 1 fallback) |
