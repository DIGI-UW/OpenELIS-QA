# Orders follow the user's lab units: test cases

**Spec:** `tests/order-entry-lab-unit-scope.spec.ts`
**Written:** 2026-10-21 against oedevqa (develop e1f2b693, images 2026-10-20), for #4757 (merged 19 Oct).

**Rule (SampleLabUnitScopeService):** a user whose lab-unit roles name sections (not AllLabUnits, not a Global Administrator, not constrained by the login lab unit) sees an order only when one of its analyses is in those sections (child sections included) or when they entered it. It scopes the orders dashboard (`/rest/order/dashboard`; `restrictRecentOrdersByTestSection=false` switches the dashboard back to the whole lab), the lookup by lab number (`/rest/order/search`, 404) and Modify Order (`/rest/SampleEdit`).

**Data:** the admin enters a Biochemistry-only order (Serum, GPT/ALAT) and a Hematology order (Whole Blood, Hematocrit). QA user `qa_oelu_heme`: Reception in Hematology only, created from the admin page the first time (test-only password; override with OELU_HEME_USER / OELU_HEME_PASS).

| ID | Case | Kind |
| --- | --- | --- |
| TC-OELU-00 | The admin sees both orders; the Hematology user sees the Hematology order (oracle guard) | Guard |
| TC-OELU-01 | The Hematology user's dashboard does not list the Biochemistry-only order | Guard |
| TC-OELU-02 | Looking the Biochemistry-only order up by lab number answers 404 for the Hematology user | Guard |
| TC-OELU-03 | Modify Order (SampleEdit) reads no order for it, and reads the Hematology order with its test | Guard |
| TC-OELU-04 | The Modify Order screen shows neither the test nor the patient of the Biochemistry-only order | Guard |
| TC-OELU-05 | The Order Dashboard screen lists the Hematology order and not the Biochemistry one | Guard |
| TC-OELU-06 | Sample management search (`/rest/sample-management/search`): 404 for the Biochemistry-only order, the Hematology order found | Guard |
| TC-OELU-07 | Aliquot lookup (`/rest/SampleItem`): no tube and no lab number for the Biochemistry-only order; the Hematology order's tubes | Guard |
| TC-OELU-08 | Aliquot save (`POST /rest/Aliquot`) on the Biochemistry-only order is refused, "Sample not found" | Guard |
| TC-OELU-09 | Patient by lab number (`/rest/patientByLabNumer`): 404 for the Biochemistry-only order, 200 for the Hematology one | Guard |
| TC-OELU-10 | Modify Order save (`POST /rest/SampleEdit`) on the Biochemistry-only order answers 404 | Guard |
| TC-OELU-11 | Generic sample order lookup: 404 for the Hematology user where the admin reads the order (skips when the admin cannot) | Guard |
| TC-OELU-12 | Order cancel reasons (`/rest/dictionary/categories/Order cancel reasons/entries`) are readable by a bench user | Guard |
| TC-OELU-13 | Pathology, IHC and cytology dashboards (every status): the Hematology user sees none of the admin's cases (oedevqa 21 Oct: admin 37, 22, 8; Hematology 0) | Guard |

Not covered: an order the restricted user entered stays visible to them (needs a test outside their unit to be orderable by them); `restrictRecentOrdersByTestSection=false`; the microbiology and vector worklists and referred-out results (no case of another unit on oedevqa to compare); pathology block and slide retirement refused outside the user's units.
