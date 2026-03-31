# TC-REFERRAL — Jira Bug Handoff

Paste the block below into Claude (web) to create this Jira ticket.

---

## Prompt to paste into Claude

> Create a Jira bug ticket with the following details:
>
> **Project:** OpenELIS Global
> **Issue Type:** Bug
> **Summary:** Carbon Select onChange throws JS error on referral test name dropdown
> **Priority:** High
> **Assignee:** Samuel Male
> **Status:** To Be Assigned
> **Labels:** react-ui, carbon-components, test-catalog, automated-qa
>
> **Description:**
>
> ### Summary
> When a user attempts to select a test name from the referral test name dropdown on the Add Order / Sample Entry page, the Carbon Design System `Select` component's `onChange` handler throws a JavaScript error. The selection fails and the referral test name field does not update.
>
> ### Environment
> - Instance: https://www.jdhealthsolutions-openelis.com
> - Version: OpenELIS Global 3.2.1.3
> - Browser: Chrome (latest)
> - UI: React frontend (SamplePatientEntry / Add Order workflow)
>
> ### Steps to Reproduce
> 1. Navigate to **Add Order** (`/SamplePatientEntry`)
> 2. Search for and select an existing patient
> 3. Advance through Program Selection and Add Sample steps
> 4. On the **Add Sample** step, check the **"Refer test to a reference lab"** checkbox
> 5. In the referral section, open the **Test Name** dropdown (Carbon `Select` component)
> 6. Select any test from the dropdown
>
> ### Expected Result
> The selected test name is accepted, the `onChange` handler fires cleanly, and the referral test name field updates to display the chosen test.
>
> ### Actual Result
> The Carbon `Select` `onChange` handler throws a JavaScript error. The dropdown selection does not persist — the field reverts or remains blank. The referral workflow cannot be completed.
>
> ### Error Detail
> JavaScript error thrown in Carbon Select `onChange` callback on the referral test name dropdown. (Exact stack trace to be captured from browser console on next reproduction.)
>
> ### Impact
> Users cannot complete referral orders through the React UI. Any test that needs to be referred to an external/reference lab is blocked at this step. Workaround: use Legacy Admin referral entry if available.
>
> ### Test Case Reference
> TC-REFERRAL (OpenELIS automated QA suite, run 2026-03-24)
> QA Report: `qa-report-20260324-0530.md`
>
> ### Suggested Fix Area
> Review the Carbon `Select` component's `onChange` prop in the referral test name field within `SamplePatientEntry`. The handler likely receives an event object where it expects a value, or vice versa — a common Carbon v10/v11 migration issue where `onChange(e)` vs `onChange(value)` signatures differ.

---

## Quick Reference Card

| Field | Value |
|-------|-------|
| Summary | Carbon Select onChange throws JS error on referral test name dropdown |
| Type | Bug |
| Priority | High |
| Assignee | Samuel Male |
| Status | To Be Assigned |
| Component | React UI — SamplePatientEntry |
| Labels | react-ui, carbon-components, test-catalog, automated-qa |
| Affects Version | 3.2.1.3 |
| Found By | Automated QA — TC-REFERRAL (2026-03-24) |
