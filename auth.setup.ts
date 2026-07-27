// Logs into the target OpenELIS instance once and saves storage state to .auth/user.json.
// Credentials default to the published demo admin; override with OE_USER / OE_PASS env vars.
// Handles the periodic ChangePasswordLogin redirect (per the openelis-test-catalog-qa skill).
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';

const AUTH = '.auth/user.json';
const USER = process.env.OE_USER ?? 'admin';
const PASS = process.env.OE_PASS ?? 'adminADMIN!';

setup('authenticate', async ({ page }) => {
  fs.mkdirSync('.auth', { recursive: true });

  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  // SPA Formik login. Selectors are intentionally permissive across versions.
  const userSel = 'input[name="loginName"], #loginName, input[name="username"], input[placeholder*="ser" i], input[type="text"]:not([type="password"])';
  const passSel = 'input[name="password"], #password, input[type="password"]';
  await page.waitForSelector(userSel, { timeout: 20_000 });
  await page.fill(userSel, USER);
  await page.fill(passSel, PASS);
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.getByRole('button', { name: /sign in|log ?in|submit/i }).first().click().catch(() => page.keyboard.press('Enter')),
  ]);

  // Forced password change: set the four fields via Formik and resubmit, else fall back.
  if (/ChangePassword/i.test(page.url())) {
    await page.fill('input[name="newPassword"], #newPassword', PASS).catch(() => {});
    await page.fill('input[name="confirmPassword"], #confirmPassword', PASS).catch(() => {});
    await page.getByRole('button', { name: /submit|save|change/i }).first().click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  // Confirm we reached an authenticated surface (dashboard KPIs or sidebar).
  await expect(
    page.locator('text=/dashboard|home|orders|results/i').first()
  ).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: AUTH });
});
