/**
 * helpers/isolated-session.ts
 *
 * WHY THIS EXISTS (2026-09-24)
 * Every config loads ONE shared storageState (.auth/user.json), and `login()` takes a fast path
 * whenever that session cookie is present. A test that clicks Logout on that shared session ends
 * it on the server, and every later test in the run reuses a dead cookie without logging in:
 * the SPA shell renders, its API calls come back as the login HTML, and the page shows
 * "System Error: Unexpected token '<'". In system-misc that turned most of the Phase 4-7 cases red
 * after TC-SESS-02 ran.
 *
 * Rule (Casey, 2026-09-24): nothing logs out of the shared session. A test that must exercise
 * logout does it here, in its own browser context with its own fresh login, so the logout ends
 * only that private session. Role changes use their own role storage states and never log out.
 * `npm run check:no-shared-logout` enforces this.
 */
import { expect, type Browser, type Page } from '@playwright/test';
import { BASE } from './test-helpers';
import { performUiLogin } from '../tests/helpers/session';

/** Run `fn` in a fresh context that logged in by itself; the context is closed afterwards. */
export async function withIsolatedSession<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await performUiLogin(page);
    return await fn(page);
  } finally {
    await context.close();
  }
}

/** Log in again inside an isolated session (e.g. after its logout). Never touches the shared state. */
export async function reloginIsolated(page: Page): Promise<void> {
  await performUiLogin(page);
}

/**
 * Log out the way a user does: the header's User panel, then Logout. Only for a page from
 * withIsolatedSession. Added 2026-10-08: /logout is not a page the SPA serves (going there leaves
 * the session alive), so cases that "logged out" by URL never did.
 */
export async function logoutViaUi(page: Page): Promise<void> {
  const userBtn = page.getByRole('banner').getByRole('button', { name: 'User', exact: true });
  await expect(userBtn).toBeVisible({ timeout: 15_000 });
  await userBtn.click();
  const logout = page.getByRole('banner').getByText('Logout', { exact: true });
  await expect(logout, 'the User panel offers Logout').toBeVisible({ timeout: 10_000 });
  await logout.click();
  await page.waitForURL(/LoginPage|login/i, { timeout: 15_000 }).catch(() => {});
}
