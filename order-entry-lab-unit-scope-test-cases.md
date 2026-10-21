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

Not covered: an order the restricted user entered stays visible to them (needs a test outside their unit to be orderable by them); a refused Modify Order save (404); `restrictRecentOrdersByTestSection=false`; the other screens #4757 scopes (sample management, aliquot, generic sample, pathology, IHC, cytology, microbiology, vector, referrals).
