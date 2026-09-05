/**
 * OpenELIS Global 3.2.1.3 — Shared Test Helpers
 * Common utilities, constants, and helper functions for E2E tests
 *
 * This module extracts reusable utilities from the monolithic spec file
 * to support split feature-specific test files.
 */

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config Constants
// ---------------------------------------------------------------------------

export const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';

export const ADMIN = {
  user: 'admin',
  pass: 'adminADMIN!',
};

// ---------------------------------------------------------------------------
// Test data constants — dynamic, backed by .auth/test-data.json
// ---------------------------------------------------------------------------

/** National ID of the baseline test patient created by data.setup.ts */
export const PATIENT_ID = '0123456';
/** Display name of the baseline test patient */
export const PATIENT_NAME = 'Abby Sebby';
/** First name */
export const PATIENT_FIRST_NAME = 'Abby';
/** Last name */
export const PATIENT_LAST_NAME = 'Sebby';

/**
 * Primary test accession — reads from .auth/test-data.json when available.
 * Falls back to the jdhealthsolutions baseline value.
 */
export const ACCESSION: string = (() => {
  try {
    const p = path.join(process.cwd(), '.auth', 'test-data.json');
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (d.primaryOrder?.accession) return d.primaryOrder.accession;
    }
  } catch { /* ignore */ }
  return '26CPHL00008V';
})();

/**
 * Secondary test accession (WBC order).
 */
export const ACCESSION2: string = (() => {
  try {
    const p = path.join(process.cwd(), '.auth', 'test-data.json');
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (d.secondaryOrder?.accession) return d.secondaryOrder.accession;
    }
  } catch { /* ignore */ }
  return '26CPHL00008K';
})();

export const QA_PREFIX = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;

/**
 * QA_PREFIX, but valid as a patient National ID.
 *
 * The server validates nationalId against `(?i)^[-a-z0-9/]*$` — **underscores
 * are rejected**, with `400 {"error":"nationalId: must match ..."}`. QA_PREFIX
 * is `QA_AUTO_MMDD`, so every test that filled `#nationalId` with it was
 * failing validation before it ever reached the behaviour under test.
 *
 * Confirmed by hand on testing 2026-09-05: `QA_PAT_0905` -> 400,
 * `qa-pat-0905` -> 200 with `{"patientId":"502","status":"success"}`. Patient
 * creation is not broken; the fixture data was invalid.
 *
 * Use this for nationalId and anything else the server pattern-checks. Keep
 * QA_PREFIX for names, orgs and test-catalog entries, where underscores are
 * fine and where already-seeded QA_AUTO_ data has to stay findable.
 */
export const QA_ID_PREFIX = QA_PREFIX.toLowerCase().replace(/_/g, '-');
export const TIMEOUT = 5000;

// ---------------------------------------------------------------------------
// Dynamic test data — reads from .auth/test-data.json written by data.setup.ts
// ---------------------------------------------------------------------------

export interface TestDataState {
  patient: {
    nationalId: string;
    firstName: string;
    lastName: string;
    systemId: string | null;
    found: boolean;
  };
  primaryOrder: {
    accession: string | null;
    testName: string;
    sampleType: string;
    status: string;
  };
  secondaryOrder: {
    accession: string | null;
    testName: string;
    sampleType: string;
    status: string;
  };
  setupTimestamp: string;
  setupErrors: string[];
}

const TEST_DATA_PATH = path.join(process.cwd(), '.auth', 'test-data.json');

/**
 * Read the test data written by data.setup.ts.
 * Returns a fallback object with static constants if the file doesn't exist.
 * Tests should use this instead of hard-coded accession numbers so they work
 * across environments where the data was freshly created.
 */
export function getTestData(): TestDataState {
  try {
    if (fs.existsSync(TEST_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf8')) as TestDataState;
    }
  } catch {
    // File missing or corrupt — return safe fallback
  }
  // Fallback: use static constants so old tests still compile
  return {
    patient: {
      nationalId: '0123456',
      firstName: 'Abby',
      lastName: 'Sebby',
      systemId: null,
      found: false,
    },
    primaryOrder: {
      accession: '26CPHL00008V',
      testName: 'HGB',
      sampleType: 'Whole Blood',
      status: 'fallback',
    },
    secondaryOrder: {
      accession: '26CPHL00008K',
      testName: 'WBC',
      sampleType: 'Whole Blood',
      status: 'fallback',
    },
    setupTimestamp: new Date().toISOString(),
    setupErrors: ['test-data.json not found — using static fallback accessions'],
  };
}

/**
 * Get the primary test accession number.
 * Uses the dynamically-created one from data.setup.ts when available,
 * falls back to the static constant.
 */
export function getPrimaryAccession(): string {
  return getTestData().primaryOrder.accession ?? ACCESSION;
}

/**
 * Get the secondary test accession number.
 */
export function getSecondaryAccession(): string {
  return getTestData().secondaryOrder.accession ?? '26CPHL00008K';
}

/**
 * Returns true if the data setup ran successfully and data is available.
 * Tests can use this to skip data-dependent assertions gracefully.
 */
export function isDataSetupComplete(): boolean {
  const data = getTestData();
  return data.patient.found && data.primaryOrder.accession !== null;
}

// ---------------------------------------------------------------------------
// Confirmed Admin URLs (Round 4 validation, 2026-03-24) — all 28 PASS
// ---------------------------------------------------------------------------

export const CONFIRMED_ADMIN_URLS: Record<string, string> = {
  'Reflex Tests Management': '/MasterListsPage/reflex',
  'Analyzer Test Name': '/MasterListsPage/AnalyzerTestName',
  'Lab Number Management': '/MasterListsPage/labNumber',
  'Program Entry': '/MasterListsPage/program',
  'EQA Program Management': '/MasterListsPage/eqaProgram',
  'Provider Management': '/MasterListsPage/providerMenu',
  'Barcode Configuration': '/MasterListsPage/barcodeConfiguration',
  'List Plugins': '/MasterListsPage/PluginFile',
  'Organization Management': '/MasterListsPage/organizationManagement',
  'Result Reporting Configuration': '/MasterListsPage/resultReportingConfiguration',
  'User Management': '/MasterListsPage/userManagement',
  'Batch test reassignment': '/MasterListsPage/batchTestReassignment',
  'Test Management': '/MasterListsPage/testManagement',
  'Application Properties': '/MasterListsPage/commonproperties',
  'Test Notification Configuration': '/MasterListsPage/testNotificationConfigMenu',
  'Dictionary Menu': '/MasterListsPage/DictionaryMenu',
  'Notify User': '/MasterListsPage/NotifyUser',
  'Search Index Management': '/MasterListsPage/SearchIndexManagement',
  'Logging Configuration': '/MasterListsPage/loggingManagement',
  'Global Menu Configuration': '/MasterListsPage/globalMenuManagement',
  'Billing Menu Configuration': '/MasterListsPage/billingMenuManagement',
  'NonConformity Configuration': '/MasterListsPage/NonConformityConfigurationMenu',
  'WorkPlan Configuration': '/MasterListsPage/WorkPlanConfigurationMenu',
  'Site Information': '/MasterListsPage/SiteInformationMenu',
  'Site Branding': '/MasterListsPage/SiteBrandingMenu',
  'Language Management': '/MasterListsPage/languageManagement',
  'Translation Management': '/MasterListsPage/translationManagement',
  'Legacy Admin': '/api/OpenELIS-Global/MasterListsPage',
};

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface DateRange {
  from: string;
  to: string;
}

export interface LoginCredentials {
  user: string;
  pass: string;
}

// ---------------------------------------------------------------------------
// Date Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get a date range for report testing (last 30 days)
 * @returns Object with 'from' and 'to' dates in YYYY-MM-DD format
 */
export async function getDateRange(): Promise<DateRange> {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 30); // 30 days ago

  return {
    from: fromDate.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  };
}

/**
 * Get a future date range (next year + 30 days) for no-data tests
 * @returns Object with 'from' and 'to' dates in YYYY-MM-DD format
 */
export async function getFutureDateRange(): Promise<DateRange> {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setFullYear(fromDate.getFullYear() + 1);
  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + 30);

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
  };
}

/**
 * Get today's date in YYYY-MM-DD format
 * @returns Today's date string
 */
export async function getToday(): Promise<string> {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get a future date by number of days
 * @param days Number of days in the future
 * @returns Future date string in YYYY-MM-DD format
 */
export async function getFutureDate(days: number): Promise<string> {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Navigation Helper Functions
// ---------------------------------------------------------------------------

/**
 * Navigate to an admin item by name or direct URL
 * Uses confirmed URLs (Round 4 validated) when available, otherwise clicks sidebar
 * @param page Playwright Page object
 * @param itemName Name of the admin item to navigate to
 * @throws Error if admin item not found
 */
export async function navigateToAdminItem(page: Page, itemName: string): Promise<void> {
  // Use confirmed URL if available (Round 4 validated), otherwise click sidebar
  const confirmedSlug = CONFIRMED_ADMIN_URLS[itemName];
  if (confirmedSlug) {
    await page.goto(`${BASE}${confirmedSlug}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    return;
  }

  // Fallback: click the admin item in the left sidebar
  const adminItem = await page
    .locator('a, button, span')
    .filter({ hasText: itemName })
    .first();

  if (adminItem) {
    await adminItem.click();
  } else {
    throw new Error(`Admin item "${itemName}" not found in sidebar`);
  }

  // Wait for page to load
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
}

/**
 * Attempt to navigate to multiple candidate URLs until one succeeds
 * Useful for discovering working endpoints when exact URLs are unknown
 * @param page Playwright Page object
 * @param candidates Array of URL paths to try
 * @returns true if successfully navigated to a valid candidate, false otherwise
 */
/**
 * Try each candidate path and report whether one of them ACTUALLY rendered.
 *
 * The status check alone is not enough. On 2026-08-26 this returned true for
 * /ResultsByRange, a path that has never existed in this codebase: the response
 * carried HTTP 200 while the BODY was a Spring problem detail with an embedded
 * 404. The caller then failed one assertion later on -body must not contain
 * 404-, which reads as a broken screen rather than as a route that was never
 * there. So sniff the body as well as the status.
 */
export async function navigateWithDiscovery(page: Page, candidates: string[]): Promise<boolean> {
  for (const url of candidates) {
    try {
      const response = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      if (response?.status() !== 200) continue;
      if (page.url().includes('Login')) continue;

      const body = await page.locator('body').innerText().catch(() => '');
      const isErrorDocument =
        body.includes('NoHandlerFoundException') ||
        body.includes('problemDetail');
      if (isErrorDocument) continue;

      return true;
    } catch (e) {
      // Try next candidate
    }
  }
  return false;
}

/**
 * Login to the application
 * @param page Playwright Page object
 * @param user Username
 * @param pass Password
 */
/**
 * Log in, UNLESS the context is already authenticated.
 *
 * Why the guard exists. Several suites were written before the configs supplied
 * use.storageState, so they call this from beforeEach. On an already
 * authenticated context /LoginPage does NOT render a form -- it redirects to
 * /api/OpenELIS-Global/Home, verified 2026-08-26 -- so the old unconditional
 * page.fill on the loginName input waited for an element that never appears and
 * burned the whole test timeout inside the hook.
 *
 * The damage was not one test. In the all-tc run of 2026-08-25 it took out every
 * test in four describe blocks -- results-entry, results-by-unit,
 * results-by-status and results-by-range, 60 failures -- and each reported as
 * -Test timeout of 180000ms exceeded while running beforeEach hook-, which reads
 * like four broken product areas rather than one broken helper.
 *
 * So: probe for the form first. If it is not there we are already in, and the
 * correct behaviour is to do nothing.
 */
/**
 * Is this context already carrying an authenticated session?
 *
 * WHY (2026-09-05): the first module sweep produced 364 failures, and the single
 * most common error was `Login failed: still on login page` (38), followed by
 * ~100 click/fill timeouts. Cause: all 46 module suites call login() themselves —
 * tests/system-misc.spec.ts alone has 18 `beforeEach` login blocks — even though
 * modules.config.ts already hands every test an authenticated `storageState`.
 * Across six parallel shards that is several hundred redundant full UI logins
 * against one instance, and it trips over itself. Roughly 140 of those 364
 * failures were this, not product defects.
 *
 * The check is cookie-only and deliberately does NOT navigate: a navigation per
 * test is most of the cost we are trying to remove. A stale cookie passes this
 * check, which is fine — the mid-run re-auth guard in tests/helpers/api-json.ts
 * is what handles a session lapsing partway through a run.
 */
export async function hasSession(page: Page): Promise<boolean> {
  try {
    const cookies = await page.context().cookies();
    return cookies.some(c => /^(JSESSIONID|SESSION|session)$/i.test(c.name) && !!c.value);
  } catch {
    return false;
  }
}

export async function login(page: Page, user: string, pass: string): Promise<void> {
  // Fast path — see hasSession(). Skips the credential submission when the
  // config already supplied an authenticated storageState, which is every suite
  // run through modules.config.ts, all-tc.config.ts and friends.
  //
  // It still NAVIGATES. The first version of this returned immediately, and the
  // next sweep traded 76 `Login failed: still on login page` for 61
  // `SecurityError: Failed to read the 'localStorage' property` — reference
  // §6.6. The old unconditional `goto` was incidentally the thing getting the
  // page off about:blank, and every helper that reads the CSRF token out of
  // localStorage depends on it. Skipping the form is the win; skipping the
  // navigation is a regression.
  if (await hasSession(page)) {
    if (!page.url().startsWith(BASE)) {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    }
    return;
  }

  await page.goto(`${BASE}/LoginPage`);

  const formIsThere = await page
    .locator('input[name="loginName"]')
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!formIsThere) {
    // Already authenticated. Confirm it rather than assume, so a genuinely
    // broken login page still fails loudly instead of silently passing.
    if (/Home|Dashboard|SamplePatientEntry/i.test(page.url())) return;
    throw new Error(
      `login: no login form and no authenticated landing page -- landed on ${page.url()}`,
    );
  }

  await page.fill('input[name="loginName"]', user);
  await page.fill('input[name="userPass"]', pass);
  await page.getByRole('button', { name: /submit|login|save|next|accept/i }).click();
  await page.waitForURL(/Dashboard|Home|SamplePatientEntry/);
}

// ---------------------------------------------------------------------------
// Form Interaction Helper Functions
// ---------------------------------------------------------------------------

/**
 * Fill a search/input field by trying multiple selectors
 * Tries each selector until one is found and visible
 * @param page Playwright Page object
 * @param value Value to fill into the field
 * @param selectors Array of CSS selectors to try
 * @returns true if field was filled successfully, false otherwise
 */
export async function fillSearchField(
  page: Page,
  value: string,
  selectors: string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible({ timeout: 1000 }).catch(() => false)) {
      await field.click();
      await field.fill(value);
      return true;
    }
  }
  return false;
}

/**
 * Fill a date field by trying multiple selectors
 * @param page Playwright Page object
 * @param date Date value to fill (YYYY-MM-DD format)
 * @param selectors Array of CSS selectors to try
 * @returns true if field was filled successfully, false otherwise
 */
export async function fillDateField(
  page: Page,
  date: string,
  selectors: string[]
): Promise<boolean> {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.isVisible({ timeout: 1000 }).catch(() => false)) {
      await field.click();
      await field.fill(date);
      return true;
    }
  }
  return false;
}

/**
 * Click a button by trying multiple label variations
 * Uses case-insensitive regex matching for flexibility
 * @param page Playwright Page object
 * @param labels Array of button label texts or patterns to try
 * @returns true if button was clicked successfully, false otherwise
 */
export async function clickButton(page: Page, labels: string[]): Promise<boolean> {
  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click();
      return true;
    }
  }
  return false;
}

/**
 * Find a lab number on THIS instance that actually has result rows.
 *
 * Several suites hard-coded 26CPHL00008V as a baseline order. On 2026-08-26
 * that accession returns HTTP 200 with zero rows -- the data is gone. A test
 * built on it fails as -cross-module lookup returned nothing-, which reads as a
 * broken API when the API is fine and the fixture simply no longer exists.
 *
 * Discovering one at runtime removes the fixture dependency entirely. Returns
 * null when the instance genuinely has no resulted work, so callers can skip
 * with an honest reason instead of asserting against an empty lab.
 */
export async function discoverAccessionWithResults(page: Page): Promise<string | null> {
  const sections = await page
    .request.get(`${BASE}/api/OpenELIS-Global/rest/user-test-sections/RESULTS`)
    .then((r) => (r.status() === 200 ? r.json() : []))
    .catch(() => []);

  for (const section of (Array.isArray(sections) ? sections : []).slice(0, 12)) {
    const id = String((section as any).id ?? (section as any).value ?? '');
    if (!id) continue;
    const res = await page
      .request.get(
        `${BASE}/api/OpenELIS-Global/rest/LogbookResults?testSectionId=${id}&doRange=false&finished=false`,
      )
      .catch(() => null);
    if (!res || res.status() !== 200) continue;
    const body: any = await res.json().catch(() => ({}));
    const rows = (body.testResult ?? []) as Array<any>;
    const hit = rows.find((r) => r.accessionNumber || r.labNo || r.labNumber);
    if (hit) return String(hit.accessionNumber ?? hit.labNo ?? hit.labNumber);
  }
  return null;
}

/**
 * Map a section name a spec WANTS onto what this instance actually calls it.
 *
 * The suites were written against sections named Chemistry and Bacteriology.
 * This instance offers Biochemistry and Bacteria. Asserting the spec-side name
 * fails as -section returned no tests-, when the section is simply named
 * something else. Returns null if nothing matches, so the caller can skip.
 */
export async function resolveSectionName(page: Page, want: RegExp): Promise<string | null> {
  const sections = await page
    .request.get(`${BASE}/api/OpenELIS-Global/rest/user-test-sections/RESULTS`)
    .then((r) => (r.status() === 200 ? r.json() : []))
    .catch(() => []);
  const names = (Array.isArray(sections) ? sections : []).map((x: any) => String(x.value ?? x.name ?? ''));
  return names.find((n) => want.test(n)) ?? null;
}
