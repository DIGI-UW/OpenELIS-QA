# QA Report Template — OpenELIS Test Catalog

Use this template exactly when generating the final report. Replace all `{{placeholders}}`.

---

# OpenELIS Test Catalog QA Report

**Environment:** {{BASE_URL}}
**Run Date:** {{YYYY-MM-DD HH:MM}} UTC
**Run By:** Claude (automated via openelis-test-catalog-qa skill)
**OpenELIS Version:** {{version if visible in UI, otherwise "Unknown"}}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 13 (11 cases + 3 result sub-tests in TC-11) |
| Passed | {{N}} |
| Failed | {{N}} |
| Skipped | {{N}} |
| Pass Rate | {{N%}} |

**Overall Result:** {{PASS / FAIL / PARTIAL}}

> PASS = all 11 test cases (including TC-11 sub-tests) passed
> PARTIAL = some passed, some failed
> FAIL = majority of test cases failed or a critical blocker was hit

---

## Test Results

| TC # | Scenario | Result | Notes |
|------|----------|--------|-------|
| TC-01 | Create a new test | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-02 | Search / filter tests | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-03 | Edit an existing test | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-04 | Deactivate a test | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-05 | Add a test panel | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-06 | Configure result type / normal ranges | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-07 | Add / verify sample type | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-08 | Reactivate test (order prerequisite) | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-09 | Add sample, select tests, place order | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-10 | Order appears in worklist / sample queue | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-11A | Enter normal result (42) — no flag | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-11B | Enter high result (120) — H flag | {{PASS/FAIL/SKIP}} | {{brief note}} |
| TC-11C | Enter low result (2) — L/Critical flag | {{PASS/FAIL/SKIP}} | {{brief note}} |

---

## Failures Requiring Attention

{{If no failures, write: "No failures — all test cases passed."}}

{{For each failure, add a section like this:}}

### TC-XX — {{Scenario Name}} — FAILED

**Step that failed:** Step {{N}} — {{description of step}}
**Expected:** {{what should have happened}}
**Actual:** {{what actually happened}}
**Severity:** {{High / Medium / Low}}
**Screenshot:** {{description of screenshot taken}}
**Jira Ticket:** {{ticket URL or "Not created — Jira unavailable"}}

---

## Cleanup

| Item | Status |
|------|--------|
| QA order (TC-09) cancelled/voided | {{Yes / No / N/A}} |
| QA_AUTO_Create Test deactivated | {{Yes / No / N/A}} |
| QA_AUTO_Panel removed | {{Yes / No / N/A}} |

---

## Appendix — Full Step Log

```
{{Paste the full chronological log here, in the format:
[HH:MM:SS] ACTION: <what you did>
[HH:MM:SS] RESULT: PASS/FAIL — <what you observed>
[HH:MM:SS] SCREENSHOT: <description>
}}
```

---

## Appendix — Environment Details

- **Browser:** Chrome (via Claude in Chrome)
- **Test Data Prefix:** QA_AUTO_
- **Credentials Used:** admin / adminADMIN!
- **Skill Version:** openelis-test-catalog-qa v1.0
