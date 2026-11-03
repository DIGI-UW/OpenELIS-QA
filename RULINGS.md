# Product rulings that decide QA findings

Casey's standing calls as product owner. **Read this before filing, commenting or grading.** A
finding that a ruling covers is not a bug: record it as "covered by ruling R-xx" in the session
notes and move on. When Casey makes a new call in a session, add a row here in the same QA PR
(`npm run build:plugin` copies this file into the plugin).

Rows are grouped by area. "Since" is the date of the call. If a newer design, FRS or ticket seems
to contradict a row, ask Casey which stands; do not pick one yourself.

## Never a bug

| Id | Ruling | Since |
|---|---|---|
| R-01 | App time follows the **server time zone**. Dates or times shifted by the server zone are never a bug. An admin setting for a lab time zone is designed. | 2026-11-02 |
| R-02 | Each country runs its own server, so relying on the server time zone is acceptable. | 2026-10 |
| R-03 | Duplicate-patient-ID behaviour is a **lab setting** (labs can configure OpenELIS to refuse a second patient with the same ID), not a regression. | 2026-10-02 |
| R-04 | Saved export configurations are **shared across users** by intent. Missing duplicate-name prompt, the 20-report limit and no rename are accepted gaps. | 2026-10-02, 10-22 |
| R-05 | An order with no tests may be saved on Enter Order and finished later, but must not show on Results entry. "Save and exit" with a test-less sample is by design. | 2026-11-02 |
| R-06 | Questioning an out-of-valid-range value at Save, rather than on leaving the field, is acceptable. | 2026-10-22 |
| R-07 | Testing instances are disposable. Seeding QA data there is expected; leave useful seed data in place. | 2026-09 |

## Findings go to a redesign, not a ticket

| Id | Area | Ruling | Since |
|---|---|---|---|
| R-10 | Pathology, IHC, cytology case views | Not in use. Findings go to the redesign (OGC-264), not the current release. | 2026-09-28 |
| R-11 | Label & Store, order entry (legacy), calculation/reflex rule authoring, navigation menu | Rewrites planned. Findings on these pages wait for the rewrite (the new nav is expected to fix bench roles seeing Admin). | 2026-10-02 |
| R-12 | Inventory | Being reworked (OGC-438). Note findings on the rework, do not file them. GeneXpert cartridge tracking belongs in the new module. | 2026-10-02 |
| R-13 | Generic Sample (generic order) | Shelved. No tickets. | 2026-09-28 |
| R-14 | AMR / Microbiology V2 | Settled by the v3.2 FRS (OGC-1528). V2 findings go to the v3 redesign. | 2026-11-02 |

## How the product should behave (use these as the expected result)

| Id | Area | Ruling | Since |
|---|---|---|---|
| R-20 | Result flags | Out of normal range: yellow. Out of valid range: red with a modal (should not be possible). Critical: bright orange with a pop-up the person entering the result must acknowledge. | 2026-10-02 |
| R-21 | Result precision | Flags and critical values judge the full (unrounded) value, not the rounded reported value. Supersedes the OGC-1544 rule. | 2026-10-31 |
| R-22 | Viral load | log10 on patient reports is on for VL tests seeded on install; tests a lab added itself stay off. | 2026-10-31 |
| R-23 | Patient reports | A new version to print comes only after validation; unvalidated results don't show. | 2026-10-20 |
| R-24 | Report Print Queue | Home tile counts every unprinted order (no date bound), labelled "Unprinted results". | 2026-10-22 |
| R-25 | Destructive actions | Need a confirmation. | 2026-10-26 |
| R-26 | Lists | There is always a search option rather than a manual select (UX heuristic H12). | 2026-10-19 |
| R-27 | Order entry | After the final step the order is complete and the user returns to the dashboard. Collector is not a required field. | 2026-10-02 |
| R-28 | Programs (OGC-781) | A Program picker on the main Enter Order screen (questionnaire on the same page), not a separate "Order Programs" menu. Keep shipped programs seeded; don't invent new ones. | 2026-10-02 |
| R-29 | Referral results | Some referred tests must be recordable as "not performed", and reflex tests the reference lab ran must be addable to the order. | 2026-09 |
| R-30 | Cytology | A test in the Cytology lab unit always opens a Cytology case, whether or not the Cytology program was picked. | 2026-10-02 |
| R-31 | Connectivity | Sites have very poor connectivity. Anything that needs a stable connection is a real defect (resilience is a requirement). | 2026-09 |
| R-32 | EQA | Cycle link: no hard gate; warn and offer to create a cycle inline. Deadlines may only be extended after distribution, with an audit trail. EQA samples stay in routine worklists with an EQA badge (in-house blinded ones stay hidden), storage optional, no locked "EQA/PT Sample" type, Reject rather than Resample, wizard numbers allow negatives and scientific notation. EQA samples are excluded from patient-care statistics but kept in workload counts. | 2026-10-13 |
| R-33 | Analyzers | No fuzzy matching engine (deferred to Catalyst): auto-match only on exact keys. Labs never type a sender name; the analyzer is identified from what it sends. Connecting is an IT and lab collaboration; OpenELIS does not guess the server address. Setup traffic is a setup capture, not results. | 2026-10-28 |
| R-34 | RBAC | Cancelling a test with results and cancelling one without results are two separate permissions. | 2026-10-06 |
| R-35 | Install | Install the latest release; every release ships an offline package; the online install staying on develop images is fine; recommend the latest Ubuntu LTS. | 2026-10-09 |

## Release calls

| Id | Ruling | Since |
|---|---|---|
| R-40 | OGC-1446 item 1, OGC-1238 SD-02/SD-12 and OGC-1369 do not block a release and need no release note. | 2026-11-02 |
| R-41 | FHIR becomes read-only (#4893): OK. Release and upgrade notes must say integration accounts need the new reader roles. | 2026-11-02 |
| R-42 | Attachments JPEG/PNG/PDF up to 10 MB, HTTP backup receiver removed, SVG logos no longer served, study CSVs need Reports access: all OK as they are. | 2026-11-02 |
| R-43 | The release go/no-go verdict is Casey's call. QA writes what blocks a cut and what flips it to GO. | 2026-10-15 |

## Who gets a ticket

| Area | Owner |
|---|---|
| Order entry (v4 and legacy), barcode and labels, multi-stage validation, openelis-docker installer | Mozzy |
| Analyzers, AMR / microbiology | Piotr |
| Referral, sample shipment, FHIR referral and shipment import, eOrders | Samuel Male |
| Alternate when Piotr is unavailable | Herbert |
| PNG work | set Contract = CPHL PNG |
