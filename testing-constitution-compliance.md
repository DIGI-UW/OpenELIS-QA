# OpenELIS QA Spec — Testing Constitution Compliance Report

**Date:** 2026-03-27
**Spec File:** `openelis-e2e.spec.ts` (8073 lines, 87 describe blocks, 310 test cases)
**Analyzed Against:** OpenELIS-Global-2 repo testing constitution (`.specify/guides/`)

---

## Compliance Summary

| Area | Status | Priority |
|------|--------|----------|
| Test-user-visible behavior | PASS | — |
| No backend API calls in UI tests | PASS | — |
| Auto-retrying assertions | PARTIAL | Medium |
| Role-based selectors | FAIL | High |
| Auth setup pattern | FAIL | High |
| Page Object Model | FAIL | High |
| File-per-feature structure | FAIL | Medium |
| Allowlist registration in config | FAIL | Medium |
| No `waitForTimeout()` | PARTIAL | Low |
| Test isolation | PARTIAL | Medium |
| Naming conventions | PARTIAL | Low |
| Carbon-specific selector patterns | FAIL | High |

---

## Detailed Findings

### 1. Selector Strategy (HIGH PRIORITY)

**Constitution mandates** (from `playwright-best-practices.md`):
1. Role + Name: `getByRole('button', { name: 'Submit' })`
2. Label: `getByLabel('Username')`
3. Test ID: `locator('[data-testid="menu-button"]')`
4. Text: `getByText('Dashboard')`
5. CSS Class: `locator('.cds--side-nav')` (structural only)

**Our spec uses:** Primarily CSS selectors and `text=` matchers:
- `page.locator('text=Enter Collection Date')` → should be `page.getByText('Enter Collection Date')`
- `page.click('button:has-text("Search")')` → should be `page.getByRole('button', { name: 'Search' })`
- `page.locator('select').filter(...)` → should use `getByRole('combobox')` or `getByLabel()`
- `page.locator('input[type="text"]')` → should use `getByRole('textbox')` or `getByLabel('...')`

**Remediation:** Global refactor of ~300 locator patterns to use role-based selectors. Can be done incrementally per test.describe block.

### 2. Authentication Pattern (HIGH PRIORITY)

**Constitution mandates:** Cached auth via `auth.setup.ts` → `.auth/user.json`, loaded by dependent projects automatically.

**Our spec uses:** Inline `login()` function called per-test or per-describe.

**Remediation:**
- Create `auth.setup.ts` following the repo pattern
- Use `storageState` in test config to auto-inject session
- Remove all inline `login()` calls from tests

### 3. Page Object Model (HIGH PRIORITY)

**Constitution mandates:** Encapsulate page interactions in reusable classes exposing user-facing actions.

**Our spec uses:** Inline selectors and direct page interactions throughout.

**Remediation:** Create page objects for major screens:
- `DashboardPage.ts` — KPI card interactions
- `OrderEntryPage.ts` — Add Order wizard steps
- `ResultsPage.ts` — Results by unit/order/patient
- `ValidationPage.ts` — Result validation
- `AdminPage.ts` — Admin sidebar navigation
- `ReferralPage.ts` — Referred out tests
- `PathologyPage.ts` — Pathology dashboard, IHC, Cytology
- `PatientPage.ts` — Patient search, history, merge

### 4. File-per-Feature Structure (MEDIUM PRIORITY)

**Constitution mandates:** Separate spec files per feature area, registered in `testMatch` allowlist.

**Our spec:** Single 8073-line monolithic file.

**Remediation:** Split into ~15 spec files:
- `dashboard.spec.ts`
- `order-entry.spec.ts`
- `edit-order.spec.ts`
- `results-entry.spec.ts`
- `validation.spec.ts`
- `admin-config.spec.ts`
- `patient-management.spec.ts`
- `referral-workflow.spec.ts`
- `pathology.spec.ts`
- `reports.spec.ts`
- `workplan.spec.ts`
- `non-conforming.spec.ts`
- `i18n.spec.ts`
- `accessibility.spec.ts`
- `performance.spec.ts`

### 5. Auto-Retrying Assertions (MEDIUM PRIORITY)

**Constitution mandates:** Use Playwright's auto-retrying `expect(locator)` patterns. Never use `waitForTimeout()`.

**Our spec:** Mostly compliant with `expect(locator).toBeVisible()` but has some patterns like:
- `await page.waitForURL(...)` — acceptable for navigation
- Some manual `waitForSelector` calls — should use `expect().toBeVisible()`
- A few arbitrary timeout values — should use assertion defaults

### 6. Carbon Component Patterns (HIGH PRIORITY)

**Constitution provides specific patterns for Carbon components:**

**ComboBox:**
```typescript
page.getByRole('combobox', { name: 'Test Name' })
```

**DataTable:**
```typescript
page.getByRole('table')
page.getByRole('row').nth(n)
```

**Our spec:** Uses generic CSS selectors for Carbon components instead of role-based access.

### 7. Test Isolation (MEDIUM PRIORITY)

**Constitution mandates:** Tests must be independently runnable with no execution order dependency.

**Our spec:** Many tests share accession numbers and patient data. Tests in later phases assume earlier tests created specific data.

**Remediation:** Each test should either use fixture data or create its own test data via API setup.

### 8. Test Naming (LOW PRIORITY)

**Constitution mandates:** Descriptive names that explain user behavior being tested.

**Our spec:** Uses `TC-XX-DEEP-01: Page structure` — functional but could be more behavioral like `'should display pathology dashboard with case listing and status filters'`.

---

## Refactoring Roadmap

### Phase A — Quick Wins (no test logic changes)
1. Replace `text=` selectors with `getByText()` across all tests
2. Replace `button:has-text()` with `getByRole('button', { name: })`
3. Replace `input[type="text"]` with `getByRole('textbox')` or `getByLabel()`
4. Add `// @ts-nocheck` or fix remaining 19 TypeScript strict errors

### Phase B — Auth & Config
1. Create `auth.setup.ts` with cached session
2. Create `playwright.config.ts` with project definitions and testMatch allowlists
3. Remove inline `login()` calls

### Phase C — File Splitting & POM
1. Create page object classes for major screens
2. Split monolithic spec into feature-specific files
3. Register new files in config allowlist

### Phase D — Test Enhancement
1. Improve test names to be behavior-focused
2. Add fixture-based test data setup
3. Ensure full test isolation

---

## What We're Already Doing Right

- Testing user-visible behavior (not implementation details)
- No backend API mocking in E2E tests
- Using `expect(locator).toBeVisible()` auto-retrying assertions (mostly)
- Comprehensive coverage of all major application areas
- Proper bug documentation with Jira cross-references
- Phase-based incremental test development
- Known-bug annotations on expected failures
