/**
 * OpenELIS Global 3.2.1.3 — Shared Test Helpers
 * Common utilities, constants, and helper functions for E2E tests
 *
 * This module extracts reusable utilities from the monolithic spec file
 * to support split feature-specific test files.
 */

import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Config Constants
// ---------------------------------------------------------------------------

export const BASE = 'https://www.jdhealthsolutions-openelis.com';

export const ADMIN = {
  user: 'admin',
  pass: 'adminADMIN!',
};

// Test data constants
export const PATIENT_NAME = 'Abby Sebby';
export const PATIENT_ID = '0123456';
export const ACCESSION = '26CPHL00008T';
export const QA_PREFIX = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
export const TIMEOUT = 5000;

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
export async function navigateWithDiscovery(page: Page, candidates: string[]): Promise<boolean> {
  for (const url of candidates) {
    try {
      const response = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      if (response?.status() === 200 && !page.url().includes('Login')) {
        return true;
      }
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
export async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(`${BASE}/LoginPage`);
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
