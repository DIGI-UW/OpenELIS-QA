/**
 * Running part of a test in another UI language without leaking it.
 *
 * WHY (2026-11-17). The app sends Accept-Language from localStorage "locale", and the server keeps
 * the session's language from the requests it gets. The stored login (.auth/user.json) is shared
 * by every spec in a run, so a test that switched to French and only reset localStorage left the
 * SERVER session in French: TC-RUN-10 made the API answers of TC-RUN-08 and TC-RUN-11 French on
 * testing ("Créatinine"), and they failed for a reason that had nothing to do with them.
 *
 * withLocale sets the language, runs the body, and always restores English in the browser AND on
 * the server (a page load in English, so the app's own requests carry en). scripts/
 * check-locale-restore.mjs fails any spec that sets a non-English locale another way.
 */
import { Page } from '@playwright/test';

export async function withLocale<T>(page: Page, locale: string, body: () => Promise<T>): Promise<T> {
  if (page.url() === 'about:blank') await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
  try {
    return await body();
  } finally {
    await restoreEnglish(page);
  }
}

/** Puts the browser and the server session back in English. */
export async function restoreEnglish(page: Page): Promise<void> {
  try {
    await page.evaluate(() => localStorage.setItem('locale', 'en'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // The app's own language switch tells the server through /Home?lang= (App.jsx
    // changeLanguageBackend); do the same, so the session's stored language is English too.
    await page.request.get('/api/OpenELIS-Global/Home?lang=en', { headers: { 'Accept-Language': 'en-US' } }).catch(() => {});
  } catch {
    // the page may be closed; the next test's own load sets its language
  }
}
