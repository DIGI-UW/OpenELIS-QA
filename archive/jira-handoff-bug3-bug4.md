# OpenELIS QA — Jira Ticket Handoff (BUG-3 & BUG-4)

Paste the prompt below into web Claude. It will create both tickets in one go.

---

## Prompt to paste into web Claude

Please create two Jira bug tickets with the following details. Create them one after the other and return the ticket links when done.

---

### TICKET 1 — BUG-3

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** `POST /rest/UnifiedSystemUser` returns HTTP 500 — user account creation blocked
**Priority:** High
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** user-management, rbac, backend, automated-qa

**Description:**

#### Summary
Attempting to create a new user account via Admin Management → User Management → Add User results in `POST /api/OpenELIS-Global/rest/UnifiedSystemUser` returning HTTP 500 with body `"Check server logs"`. No account is created. The entire user management create-account workflow is blocked.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Browser: Chrome (latest)
- Navigation: Admin Management → User Management → Add User

#### Steps to Reproduce
1. Log in as admin
2. Navigate to **Admin Management → User Management**
3. Click **Add User**
4. Fill in all required fields:
   - First Name: `QA`
   - Last Name: `Receptionist`
   - Login Name: `qa_recept`
   - Password: `QArecept1!`
   - Confirm Password: `QArecept1!`
   - Role: Receptionist
5. Click **Save**

#### Expected Result
User account created and visible in the User Management list with the assigned role.

#### Actual Result
`POST /api/OpenELIS-Global/rest/UnifiedSystemUser` returns **HTTP 500** with body `"Check server logs"`. No user account is created.

#### Impact
**High** — All RBAC role-isolation testing is blocked. No Receptionist or Lab Technician test accounts can be created, preventing verification that role boundaries (e.g., Receptionist blocked from Test Catalog, Lab Tech blocked from order placement) are properly enforced. This is a security-relevant gap: if roles are misconfigured, users with lower privileges may access functions they should not have.

#### Test Case Reference
TC-RBAC-ROLE-03 (OpenELIS automated QA suite, run 2026-03-24)
QA Report: `qa-report-rbac-editorder-20260324.md`

#### Suggested Investigation
1. Check server logs for the exact exception thrown by `UnifiedSystemUser` service on POST
2. Verify the user management database tables and constraints
3. Check whether the endpoint has a required field that the UI is not sending

---

### TICKET 2 — BUG-4

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** ModifyOrder generates a new accession number on every save — labs cannot reuse existing labels
**Priority:** Medium
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** modify-order, accession, label-printing, clinical-workflow, automated-qa

**Description:**

#### Summary
Every submission of the Edit Order (ModifyOrder) workflow generates a new accession number, even when no new physical sample is collected. The original accession is preserved in an audit trail but the active accession changes on each save, forcing labs to reprint barcode labels for the same physical sample tube.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Navigation: Order → Edit Order → `/SampleEdit?type=readwrite` → search → `/ModifyOrder?accessionNumber=XXXX`

#### Steps to Reproduce
1. Log in as admin
2. Navigate to **Order → Edit Order** (`/SampleEdit?type=readwrite`)
3. Search for an existing accession (e.g., `26CPHL00008P`)
4. On the ModifyOrder page, make any change (add a test, remove a test, etc.)
5. Click **Submit**

#### Expected Result
The accession number remains unchanged. A new accession should only be generated when a new physical sample is being registered.

#### Actual Result
A new accession number is generated on every submit:
- Original: `26CPHL00008P`
- After adding WBC: `26CPHL00008R`
- After cancelling WBC: `26CPHL00008T`

The old accession moves to audit trail. The physical sample tube still has the original barcode label (`26CPHL00008P`), but the system now expects the new accession number.

#### Clinical Impact (raised during QA testing)
Labs operating with limited budgets cannot reprint labels every time a test is modified. The physical sample tube already has the original barcode. After a ModifyOrder save, the tube's barcode no longer matches the active accession number in the system. This creates:
- Potential for scanning errors (scanning original barcode retrieves outdated record)
- Cost burden from mandatory label reprints
- Increased labelling mistakes (two labels on one tube)

#### Suggested Fix
Add a configuration option in ModifyOrder: **"Reuse existing accession number"** (on by default for test add/remove operations). A new accession should only be generated when the user explicitly opts in (e.g., a new physical sample collection) or when lab policy requires it.

Alternatively: generate a sub-revision suffix (e.g., `26CPHL00008P-v2`) that preserves the root accession for scanning purposes.

#### Test Case Reference
TC-EO-03 (OpenELIS automated QA suite, run 2026-03-24)
QA Report: `qa-report-rbac-editorder-20260324.md`
