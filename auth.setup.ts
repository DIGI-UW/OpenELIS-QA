/**
 * OpenELIS Global — Authentication Setup
 *
 * Follows the repo's auth.setup.ts pattern:
 * 1. Validate credentials from env vars (fallback to defaults)
 * 2. Poll backend health endpoint
 * 3. Login via API (bypasses session fixation issues)
 * 4. Save authenticated state to .auth/user.json
 *
 * Subsequent test projects load this cached session via storageState,
 * eliminating per-test login overhead.
 */

import { test as setup, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://www.jdhealthsolutions-openelis.com';
const TEST_USER = process.env.TEST_USER || 'admin';
const TEST_PASS = process.env.TEST_PASS || 'adminADMIN!';
const AUTH_FILE = '.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Step 1 — Validate credentials exist
  if (!TEST_USER || !TEST_PASS) {
    throw new Error(
      'Missing test credentials. Set TEST_USER and TEST_PASS environment variables, ' +
      'or rely on defaults (admin/adminADMIN!).'
    );
  }

  // Step 2 — Poll backend health with exponential backoff
  const healthUrl = `${BASE}/api/OpenELIS-Global/health`;
  const backoffMs = [1000, 2000, 5000, 10000];
  let healthy = false;

  for (const delay of backoffMs) {
    try {
      const response = await page.request.get(healthUrl, { timeout: delay });
      if (response.ok()) {
        healthy = true;
        break;
      }
    } catch {
      // Server not ready yet — wait and retry
      await page.waitForTimeout(delay);
    }
  }

  // Fallback: try login page directly if health endpoint doesn't exist
  if (!healthy) {
    try {
      const loginResponse = await page.request.get(`${BASE}/login`, { timeout: 15000 });
      if (loginResponse.ok()) {
        healthy = true;
      }
    } catch {
      // Fall through
    }
  }

  if (!healthy) {
    throw new Error(`Backend at ${BASE} is not healthy after ${backoffMs.length} retries.`);
  }

  // Step 3 — Login via UI (API login not available on all instances)
  await page.goto(`${BASE}/login`);

  // Wait for login form to render
  await page.waitForSelector('input[type="text"], input[name*="user"], input[name*="login"]', {
    timeout: 10000,
  });

  // Fill credentials
  const userField = page.locator('input[type="text"], input[name*="loginName"]').first();
  await userField.fill(TEST_USER);

  const passField = page.locator('input[type="password"]').first();
  await passField.fill(TEST_PASS);

  // Submit
  await page.getByRole('button', { name: /login|sign in|submit/i }).first().click();

  // Step 4 — Wait for authenticated redirect (Dashboard or Home)
  await page.waitForURL(/Dashboard|Home|SamplePatientEntry|MasterListsPage/, {
    timeout: 15000,
  });

  // Verify we're not still on the login page
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('Login')) {
    throw new Error(`Login failed: still on login page at ${currentUrl}`);
  }

  // Step 5 — Persist authenticated state
  await page.context().storageState({ path: AUTH_FILE });
});
