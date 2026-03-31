# OpenELIS Global v3.2.1.3 — Suites AE–AG (Reports Module)

## Quick Start

This directory contains comprehensive QA test coverage for the OpenELIS Reports module, filling a critical gap in the existing test suite (Suites A–AD).

### Files in This Delivery

| File | Type | Size | Purpose |
|------|------|------|---------|
| **gap-suites-AE-AG.md** | Documentation | 23 KB | Manual test cases (15 TCs) — import into TestRail/Jira |
| **gap-suites-AE-AG.spec.ts** | Code | 34 KB | Playwright automated tests — run with `npx playwright test` |
| **SUITE-AE-AG-SUMMARY.txt** | Documentation | 9 KB | Quick reference: selectors, URLs, how to run |
| **DELIVERY-CHECKLIST-AE-AG.md** | Documentation | 11 KB | QA validation checklist and sign-off |
| **README-SUITES-AE-AG.md** | Documentation | This file | Index and quick start guide |

## Test Coverage

### Suite AE — Routine Reports (5 TCs)
- **TC-RPT-R01**: Patient Status Report page loads
- **TC-RPT-R02**: Generate Patient Status Report with date range
- **TC-RPT-R03**: Statistics Report page loads with date range selector
- **TC-RPT-R04**: Generate Statistics Report — verify table/data output
- **TC-RPT-R05**: Summary of All Tests report loads and generates

### Suite AF — Management Reports (5 TCs)
- **TC-RPT-M01**: Rejection Report page loads with date picker
- **TC-RPT-M02**: Generate Rejection Report — verify rejection data displayed
- **TC-RPT-M03**: Referred Out Tests Report loads and generates
- **TC-RPT-M04**: Delayed Validation report loads and generates
- **TC-RPT-M05**: Audit Trail report loads with date/user filters

### Suite AG — WHONET & Export Reports (5 TCs)
- **TC-RPT-W01**: WHONET Report page loads with organism/antibiotic selectors
- **TC-RPT-W02**: Generate WHONET Report — verify data export
- **TC-RPT-W03**: WHONET Report date range filtering works
- **TC-RPT-W04**: Report handles no-data gracefully (empty date range)
- **TC-RPT-W05**: Report download/export functionality

**Total: 15 test cases across 3 suites**

## How to Run

### Manual Testing
1. Open `gap-suites-AE-AG.md`
2. Copy test cases into your test management tool (TestRail, Jira, etc.)
3. Execute each test case in sequence
4. Record results: PASS, FAIL, SKIP, or GAP
5. Attach screenshots for any failures

**Estimated time:** 2–3 hours

### Automated Testing
```bash
# Run all tests
npx playwright test gap-suites-AE-AG.spec.ts

# Run specific suite
npx playwright test gap-suites-AE-AG.spec.ts -g "Suite AE"
npx playwright test gap-suites-AE-AG.spec.ts -g "Suite AF"
npx playwright test gap-suites-AE-AG.spec.ts -g "Suite AG"

# Run specific test
npx playwright test gap-suites-AE-AG.spec.ts -g "TC-RPT-R01"

# Generate HTML report
npx playwright test gap-suites-AE-AG.spec.ts --reporter=html
```

**Estimated time:** 15–20 minutes

## Key Features

**Manual Test Cases (gap-suites-AE-AG.md):**
- Matches master-test-cases.md format
- Clear navigation paths
- Numbered steps with preconditions
- Expected results and fail criteria
- Graceful degradation: missing data → SKIP, missing feature → GAP

**Playwright Specs (gap-suites-AE-AG.spec.ts):**
- URL discovery pattern (3–8 candidate URLs per report)
- Graceful fallback on 404 (logs GAP, doesn't hard-fail)
- Date range utilities (past 30 days for real data, future year for empty state)
- Carbon for React selectors (input[type="date"], select, button)
- Download listener for file export testing
- Proper error handling and logging

## Test Data Requirements

**Required:**
- At least one patient with completed test results
- At least one active, orderable test

**Optional** (tests will SKIP if missing):
- Rejection records (for TC-RPT-M02)
- Referred tests (for TC-RPT-M03)
- Delayed validations (for TC-RPT-M04)
- Microbiology/antibiotic tests (for TC-RPT-W01–W05)

## Success Criteria

- **12+ tests PASS** (out of 15) — primary metric
- **≤2 tests FAIL** (critical bugs only) — escalate to development
- **Any # SKIP acceptable** (with documented reason)
- **Any # GAP acceptable** (feature not in scope)
- **0 tests cause application crash** — critical requirement

## Technical Specifications

| Property | Value |
|----------|-------|
| Target URL | https://www.jdhealthsolutions-openelis.com |
| OpenELIS Version | 3.2.1.3 |
| UI Framework | Carbon for React (v3.x) |
| Admin Credentials | admin / adminADMIN! |
| Browsers | Chrome, Firefox, WebKit (Playwright) |
| Test Prefix | TC-RPT-* (Reports) |

## URL Discovery Candidates

Each test attempts multiple candidate URLs before marking as GAP:

| Report | URLs Tried |
|--------|-----------|
| Patient Status | /PatientStatusReport, /Report/PatientStatus, /reports/patient-status |
| Statistics | /StatisticsReport, /Report/Statistics, /reports/statistics |
| Summary | /SummaryReport, /Report/SummaryOfTests, /reports/all-tests |
| Rejection | /RejectionReport, /Report/Rejection, /reports/rejections |
| Referred Out | /ReferredOutReport, /Report/ReferredOut, /reports/referrals |
| Delayed Validation | /DelayedValidationReport, /Report/DelayedValidation, /reports/delays |
| Audit Trail | /AuditTrailReport, /Report/AuditTrail, /reports/audit |
| WHONET | /WHONETReport, /Report/WHONET, /reports/whonet |

## Integration with Existing Suites

- **Suites A–AD**: Existing baseline (168 TCs)
- **Suites AE–AG**: Reports module (15 TCs) ← NEW
- **Total**: 33 suites, 183 TCs

No overlap. All tests isolated to Reports menu.

## Graceful Degradation

Tests handle missing features and data gracefully:

| Scenario | Outcome | Action |
|----------|---------|--------|
| Report URL not found | Mark **GAP** | Log missing feature, don't fail test |
| Test data missing | Mark **SKIP** | Document reason, continue |
| Empty date range | Show message | Verify graceful handling, not crash |
| Report crash | Mark **FAIL** | Escalate to development with logs |
| Export unavailable | Attempt download listener | Gracefully handle if not available |

## Execution Checklist

- [ ] OpenELIS 3.2.1.3 running and accessible
- [ ] Admin login (admin/adminADMIN!) functional
- [ ] At least one patient with test results exists
- [ ] At least one active test configured
- [ ] Reports menu visible in hamburger menu
- [ ] Playwright v1.40+ installed (for automated tests)
- [ ] Node.js v16+ installed (for Playwright)
- [ ] Test management tool ready (for manual tests)
- [ ] 30+ minute window available (manual testing)
- [ ] Stable internet connection to live system

## Documentation References

| Document | Purpose |
|----------|---------|
| gap-suites-AE-AG.md | Primary manual test cases — all steps and expectations |
| gap-suites-AE-AG.spec.ts | Playwright specs — run automated tests |
| SUITE-AE-AG-SUMMARY.txt | Technical reference — selectors, URLs, how to run |
| DELIVERY-CHECKLIST-AE-AG.md | QA validation — sign-off and quality gates |
| master-test-cases.md | Existing suites A–AD baseline |
| gap-suites-AA-AD.md | Previous gap suites (clinical workflow) |
| openelis-e2e.spec.ts | Main Playwright suite |

## Known Limitations

- WHONET report optional for non-microbiology labs
- Some reports require specific test data (gracefully skipped if missing)
- Report URLs discovered via multiple candidates (graceful fallback)
- Carbon DatePicker uses standard HTML input[type="date"] selectors
- PDF export validated by file download, not content inspection
- Empty state validation checks for message OR graceful handling
- No role-based testing (all tests use admin account)
- No concurrent execution required
- Tests isolated to Reports menu (no cleanup impact)

## Support & Escalation

| Scenario | Action |
|----------|--------|
| Manual test FAIL | Attach screenshot, escalate to development |
| Automated test FAIL | Check browser console logs (saved in Playwright HTML report) |
| URL not found (GAP) | Document missing feature, skip related tests |
| Missing test data (SKIP) | Document reason, test other scenarios |
| Report crash | High priority bug — escalate immediately with logs |

## Next Steps

1. **Review** this delivery with stakeholders
2. **Import** manual test cases into TestRail/Jira
3. **Execute** manual tests (assign QA team, 2–3 hour window)
4. **Run** automated tests in CI/CD (15–20 minutes)
5. **Document** results and escalate any FAIL items
6. **Archive** results for audit trail

---

**Delivery Date:** March 24, 2026  
**Status:** COMPLETE  
**Ready for:** Immediate deployment and execution
