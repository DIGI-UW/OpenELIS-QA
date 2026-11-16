/**
 * helpers/login-form.ts
 *
 * Whether /login is showing its form, for the specs that sign in through the form themselves.
 *
 * WHY (16 Nov 2026 CI triage). Those specs asked `pass.isVisible({ timeout: 5000 })` and took
 * "not visible" to mean "already signed in". isVisible() does not wait: its timeout is ignored.
 * The login form now appears only after the app bundle loads and the page reads
 * open-configuration-properties, session and site-branding: 3.6 to 8.5 s on testing on 16 Nov.
 * Checked at once, the form was never there yet, so the spec skipped the login and ran signed
 * out: cfg (TC-CFG-01..03), lp (TC-LP-01..10, whose API reads got the legacy login page) and disc
 * went red together on the develop stack.
 *
 * Wait for whichever comes first: the password field (sign in), or a move away from /login (a
 * stored session redirected).
 */
import { Page } from '@playwright/test';

export const LOGIN_USER_FIELD = '#loginName, input[name="loginName"], input[type="text"]';

export async function loginFormShown(page: Page, timeout = 30_000): Promise<boolean> {
  const pass = page.locator('input[type="password"]').first();
  return Promise.race([
    pass.waitFor({ state: 'visible', timeout }).then(() => true),
    page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout }).then(() => false),
  ]).catch(() => false);
}
