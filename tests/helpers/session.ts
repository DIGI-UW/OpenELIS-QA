// Shared session establishment for the Playwright harness.
//
// WHY THIS EXISTS
// ---------------
// `auth.setup.ts` logs in once, at the start of a run, and saves storage state to
// `.auth/user.json`. Every project then loads that state via `use.storageState`. That works —
// until a run is long enough for the server-side session to lapse mid-run. When that happens the
// app answers an API GET with the *login HTML page* (HTTP 200, `text/html`) instead of JSON, and
// the caller explodes with:
//
//     SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// which reads like a product bug and is not one. Observed once in the 2026-08-12 `e2e` run
// against 34.212.225.107 (30.3 min, 2 passed / 15 failed), on the
// `${TC}/tests/${id}/sample-results` read-back.
//
// So the login flow lives here, ONE implementation, used by both:
//   * `auth.setup.ts`            — the once-per-run setup project, and
//   * `reauthenticate()` below   — the mid-run recovery path used by tests/helpers/api-json.ts.
//
// There is deliberately no second login mechanism (no direct POST to a login endpoint): the
// recovery path drives the same real SPA form the setup project drives, so if the login flow
// changes there is exactly one place to fix.

import { chromium, request as playwrightRequest, expect, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'fs';

export const AUTH_STATE_PATH = '.auth/user.json';

export const OE_USER = process.env.OE_USER ?? 'admin';
export const OE_PASS = process.env.OE_PASS ?? 'adminADMIN!';

/**
 * Drive the real SPA login form on `page` and land on an authenticated surface.
 * Extracted verbatim from auth.setup.ts (2026-08-13) so the setup project and the mid-run
 * re-auth path cannot drift apart.
 */
export async function performUiLogin(page: Page, user = OE_USER, pass = OE_PASS): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  // SPA Formik login. Selectors are intentionally permissive across versions.
  const userSel = 'input[name="loginName"], #loginName, input[name="username"], input[placeholder*="ser" i], input[type="text"]:not([type="password"])';
  const passSel = 'input[name="password"], #password, input[type="password"]';
  await page.waitForSelector(userSel, { timeout: 20_000 });
  await page.fill(userSel, user);
  await page.fill(passSel, pass);
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.getByRole('button', { name: /sign in|log ?in|submit/i }).first().click().catch(() => page.keyboard.press('Enter')),
  ]);

  // Forced password change: set the four fields via Formik and resubmit, else fall back.
  if (/ChangePassword/i.test(page.url())) {
    await page.fill('input[name="newPassword"], #newPassword', pass).catch(() => {});
    await page.fill('input[name="confirmPassword"], #confirmPassword', pass).catch(() => {});
    await page.getByRole('button', { name: /submit|save|change/i }).first().click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  // Confirm we reached an authenticated surface (dashboard KPIs or sidebar).
  await expect(
    page.locator('text=/dashboard|home|orders|results/i').first()
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Save the current context's cookies/localStorage to `.auth/user.json`.
 */
export async function saveAuthState(page: Page, path = AUTH_STATE_PATH): Promise<void> {
  fs.mkdirSync('.auth', { recursive: true });
  await page.context().storageState({ path });
}

/**
 * MID-RUN RECOVERY. Launch a throwaway Chromium, log in through the same SPA form
 * `performUiLogin` drives, refresh `.auth/user.json`, and hand back a brand-new
 * APIRequestContext carrying the fresh session.
 *
 * The caller must use the RETURNED context for subsequent API calls — the request fixture that
 * lapsed keeps its stale cookies; there is no supported way to re-cookie it in place.
 *
 * Logs a single `[session-guard]` line on entry and exit so the frequency of mid-run session
 * lapses is measurable by grepping run logs.
 */
export async function reauthenticate(opts: { baseURL: string; reason: string }): Promise<APIRequestContext> {
  const started = Date.now();
  console.log(`[session-guard] re-authenticating against ${opts.baseURL} — reason: ${opts.reason}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ baseURL: opts.baseURL, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    try {
      await performUiLogin(page);
      await saveAuthState(page);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const fresh = await playwrightRequest.newContext({
    baseURL: opts.baseURL,
    storageState: AUTH_STATE_PATH,
    ignoreHTTPSErrors: true,
  });
  console.log(`[session-guard] re-authenticated in ${Date.now() - started}ms; storage state refreshed at ${AUTH_STATE_PATH}`);
  return fresh;
}
