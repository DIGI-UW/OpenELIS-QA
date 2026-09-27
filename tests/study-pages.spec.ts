/**
 * tests/study-pages.spec.ts
 *
 * Study (legacy JSP) pages: do they render, in the user's language, without raw keys?
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R53h;
 * uncovered-workflows-catalogue TC-STDY-00/01/05).
 *
 * Coverage before this file: none (workflow-coverage rated Study management "none").
 * These pages are served by the legacy UI under /api/OpenELIS-Global/...
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const PAGES = [
  '/StudyElectronicOrders',
  '/ResultValidationRetroC?type=Biochemistry&test=',
  '/ResultValidationRetroC?type=Immunology&test=',
  '/ResultValidationRetroC?type=serology',
];
/** A dotted lower-case message key such as sidenav.label.environmental.compliance. */
const RAW_KEY = /\b[a-z]+(\.[a-zA-Z_]+){2,}\b/g;

async function textOf(page: import('@playwright/test').Page, path: string): Promise<string> {
  const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  expect(resp?.status() ?? 0, `${path} answers`).toBeLessThan(400);
  await page.waitForLoadState('networkidle');
  return page.locator('body').innerText();
}

test.describe('Study legacy pages', () => {
  test('TC-STDY-00: every Study page renders its content', async ({ page }) => {
    for (const p of PAGES) {
      const t = await textOf(page, p);
      expect(t.length, `${p} renders content`).toBeGreaterThan(200);
      expect(t, `${p} is not a login or error page`).not.toMatch(/HTTP Status 5\d\d|Whitelabel Error|Sign in to your account/i);
    }
  });

  test('TC-STDY-01: no raw message keys on Study pages', async ({ page }) => {
    // FLIP-WHEN-FIXED (R53h). Observed 2026-09-27: "sidenav.label.environmental.compliance"
    // in the legacy menu of every page.
    test.fail();
    const found: string[] = [];
    for (const p of PAGES) {
      const keys = ((await textOf(page, p)).match(RAW_KEY) ?? []).filter(k => !/^(www|http)/.test(k));
      found.push(...keys.map(k => `${p}: ${k}`));
    }
    expect(found, 'raw keys').toEqual([]);
  });

  test('TC-STDY-05: View study electronic orders is in English for an English user', async ({ page }) => {
    // FLIP-WHEN-FIXED (R53h). Observed 2026-09-27: French search prompt
    // "Rechercher par code Patient ou par Site de prise en charge" in the English locale.
    test.fail();
    const t = await textOf(page, '/StudyElectronicOrders');
    expect(t, 'English page').toMatch(/View study electronic orders/i);
    expect(t, 'no French prompt').not.toMatch(/Rechercher par/);
  });
});
