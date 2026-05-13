/**
 * tests/chains/chain-i-site-branding-to-report.spec.ts
 *
 * SKILL §11 Chain I — Site Branding → Report
 *
 * v6.13 REWRITE — grounded in the 2026-05-13 A1 pilot.
 *
 * Original premise (v6.5 .. v6.12): "PDF reports show literal 'null' when
 * SiteInformation.labName is missing or empty" — Chain I attempted to find
 * the labName key in site-branding or SiteInformation, modify it, regenerate
 * the PDF, and assert the new name appears.
 *
 * What the pilot found:
 *   - `/rest/site-branding` has NO `labName` field. Fields are: `id`,
 *     `useHeaderLogoForLogin`, `headerColor`, `primaryColor`,
 *     `secondaryColor`, `colorMode`, `lastModified`, `lastModifiedBy`.
 *   - `/rest/SiteInformation` returns a Struts FORM METADATA object, not
 *     a list of key/value settings.
 *   - `/rest/properties` returns JVM-level properties but `lab.name` is
 *     not one of them.
 *
 * The "labName lives somewhere reachable via REST" premise was wrong.
 * The actual lab name on a generated PDF probably comes from a JSP-page-
 * managed setting that's only accessible through driving the admin UI.
 *
 * v6.13 rewrites Chain I to test what's actually testable today:
 *
 *   1. Read current site-branding (RENDER)
 *   2. PUT a modified primaryColor (PERSIST)
 *   3. Round-trip read confirms (ROUND-TRIP)
 *   4. PUT the original back; round-trip restore confirms (PERSIST + cleanup)
 *
 * The labName/PDF-header check is moved to a future chain that drives the
 * JSP admin form via Playwright UI — separately tracked in the workplan.
 *
 * Caught bugs:
 *   None (this chain is the methodology PASS confirmation — admin write
 *   path validated in Phase 36 Chain C, re-confirmed in 2026-05-13 pilot
 *   round-trip step).
 *
 * Expected outcome on testing v3.2.1.6 + mgdev v3.2.1.8: all 4 steps PASS.
 *
 * Run individually:
 *   npx playwright test --project=chain-i
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';
import type { SiteBrandingResponse } from '../../helpers/apiShapes';

test.describe.serial('Chain I — Site Branding → Report (v6.13 rewritten)', () => {
  let original: SiteBrandingResponse | null = null;
  const testColor = '#cc0066';

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain I] BASE=${BASE} — v6.13 rewrite, labName premise dropped`);
  });

  test.afterAll(async ({ browser }) => {
    // Restore even on mid-test failure
    if (!original) return;
    const ctx = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await apiCall(page, '/api/OpenELIS-Global/rest/site-branding', {
      method: 'PUT', body: original,
    });
    await ctx.close();
  });

  test('Step 1 — Read current site-branding (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<SiteBrandingResponse>(page, '/api/OpenELIS-Global/rest/site-branding');
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep('I', 1, 'FAIL', `site-branding HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    original = r.body as SiteBrandingResponse;
    markStep('I', 1, 'PASS', `Branding read: primary=${original.primaryColor}, header=${original.headerColor}, mode=${original.colorMode}`);
  });

  test('Step 2 — PUT modified primaryColor (PERSIST)', async ({ page }) => {
    if (!original) test.skip();
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/site-branding', {
      method: 'PUT', body: { ...original!, primaryColor: testColor },
    });
    if (!r.ok) {
      markStep('I', 2, 'FAIL', `PUT site-branding HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep('I', 2, 'PASS', `primaryColor PUT accepted with value ${testColor}`);
  });

  test('Step 3 — Round-trip confirms modified value (ROUND-TRIP)', async ({ page }) => {
    if (!original) test.skip();
    await page.goto(BASE);
    const r = await apiCall<SiteBrandingResponse>(page, '/api/OpenELIS-Global/rest/site-branding');
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep('I', 3, 'FAIL', `Read-back HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const current = (r.body as SiteBrandingResponse).primaryColor;
    if (current !== testColor) {
      markStep('I', 3, 'FAIL',
        `Read-back disagrees with write: got ${current}, expected ${testColor}`,
        `Silent fail on PUT (BUG-8 class). Admin says "saved" but the store doesn't reflect.`);
      expect(current).toBe(testColor); return;
    }
    markStep('I', 3, 'PASS', `Round-trip confirmed: stored value = ${current}`);
  });

  test('Step 4 — Restore original; round-trip confirms (PERSIST + cleanup)', async ({ page }) => {
    if (!original) test.skip();
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/site-branding', {
      method: 'PUT', body: original!,
    });
    if (!r.ok) {
      markStep('I', 4, 'FAIL', `Restore PUT HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const verify = await apiCall<SiteBrandingResponse>(page, '/api/OpenELIS-Global/rest/site-branding');
    const after = (verify.ok && typeof verify.body === 'object' && verify.body !== null)
      ? (verify.body as SiteBrandingResponse).primaryColor
      : undefined;
    if (after !== original!.primaryColor) {
      markStep('I', 4, 'FAIL',
        `Restore round-trip mismatch: ${after} != ${original!.primaryColor}`);
      expect(after).toBe(original!.primaryColor); return;
    }
    markStep('I', 4, 'PASS', `Restored to ${after}. afterAll will catch any mid-test failure.`);
  });
});
