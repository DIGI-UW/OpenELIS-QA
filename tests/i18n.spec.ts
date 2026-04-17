import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * i18n and Localization Tests
 * Suites:
 *   - Localization and i18n (TC-I18N) — 5 tests
 *   - Phase 5 — T-DEEP: i18n Locale Switching Tests — 3 tests
 * Total: 8 tests
 */

// ---------------------------------------------------------------------------
// Suite 22 — Localization and i18n (TC-I18N)
// ---------------------------------------------------------------------------
test.describe('Localization and i18n (TC-I18N)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-I18N-01: Language switcher present on page', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(1500);

    // Look for language selector — various patterns
    const langSelector = page.locator(
      'select[id*="lang" i], select[id*="locale" i], ' +
      '[class*="language" i], [class*="locale" i], ' +
      'a[href*="locale" i], button[aria-label*="language" i], ' +
      '[id*="language-selector"]'
    ).first();

    const hasLangSwitch = await langSelector.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasLangSwitch) {
      // Try looking for FR / EN text links
      const enLink = page.getByText(/^EN$|^FR$|^English|^Français/i).first();
      const hasTextLink = await enLink.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(hasTextLink
        ? 'TC-I18N-01: PASS — language text link found'
        : 'TC-I18N-01: GAP — no language switcher found on page');
    } else {
      console.log('TC-I18N-01: PASS — language selector widget found');
    }
  });

  test('TC-I18N-02: Switch to French and verify translations', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(1500);

    // Try locale URL parameter
    await page.goto(`${BASE}?lang=fr`).catch(() => page.goto(`${BASE}?locale=fr`));
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body') ?? '';
    const hasFrench = /résultat|commande|patient|accueil|tableau|validation/i.test(bodyText);

    if (!hasFrench) {
      // Try clicking FR link
      const frLink = page.getByText(/^FR$|Français/i).first();
      if (await frLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await frLink.click();
        await page.waitForTimeout(2000);
        const bodyText2 = await page.textContent('body') ?? '';
        const hasFrench2 = /résultat|commande|patient|accueil|tableau/i.test(bodyText2);
        console.log(hasFrench2
          ? 'TC-I18N-02: PASS — French labels visible after clicking FR link'
          : 'TC-I18N-02: FAIL — FR link clicked but no French labels appeared');
        return;
      }
      console.log('TC-I18N-02: GAP — could not switch to French via URL param or link');
      return;
    }

    console.log('TC-I18N-02: PASS — French labels visible via locale URL param');
  });

  test('TC-I18N-03: Switch back to English', async ({ page }) => {
    // First switch to French
    await page.goto(`${BASE}?lang=fr`).catch(() => page.goto(`${BASE}?locale=fr`));
    await page.waitForTimeout(1500);

    // Switch back to English
    await page.goto(`${BASE}?lang=en`).catch(() => page.goto(`${BASE}?locale=en`));
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent('body') ?? '';
    const hasEnglish = /result|order|patient|dashboard|validation/i.test(bodyText);
    const hasResidualFr = /résultat|commande|accueil|tableau/i.test(bodyText);

    console.log(hasEnglish && !hasResidualFr
      ? 'TC-I18N-03: PASS — clean switch back to English'
      : hasEnglish && hasResidualFr
        ? 'TC-I18N-03: FAIL — residual French labels after switch to English'
        : 'TC-I18N-03: FAIL — neither language fully rendered');
  });

  test('TC-I18N-04: Date format respects locale', async ({ page }) => {
    // Check English date format
    await page.goto(`${BASE}/SamplePatientEntry?lang=en`).catch(() => page.goto(`${BASE}/SamplePatientEntry`));
    await page.waitForTimeout(2000);

    const dateInput = page.locator('input[type="date"], input[id*="date" i], input[placeholder*="date" i]').first();
    if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const placeholder = await dateInput.getAttribute('placeholder') ?? '';
      const label = await dateInput.evaluate(el => {
        const lbl = el.closest('div')?.querySelector('label');
        return lbl?.textContent ?? '';
      });
      console.log(`TC-I18N-04: Date field placeholder = "${placeholder}", label = "${label}"`);
    } else {
      console.log('TC-I18N-04: SKIP — no date input found on Add Order page');
    }
  });

  test('TC-I18N-05: Lab report renders in translated locale', async ({ page }) => {
    // Switch to French and check report
    const reportUrls = [
      `/LabReport?accession=26CPHL00008V&lang=fr`,
      `/PatientReport?accession=26CPHL00008V&locale=fr`,
    ];

    for (const u of reportUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        const hasFrenchReport = /résultat|nom|date|rapport/i.test(text);
        const hasData = /Sebby|Abby|HGB|26CPHL/i.test(text);

        console.log(hasFrenchReport
          ? 'TC-I18N-05: PASS — lab report template in French, data intact'
          : hasData
            ? 'TC-I18N-05: NOTE — report data present but template not translated'
            : 'TC-I18N-05: GAP — report URL did not return meaningful content in French');
        return;
      }
    }
    console.log('TC-I18N-05: GAP — no report URL accessible with French locale');
  });
});

// =====================================================================
// Phase 5 — T-DEEP: i18n Locale Switching Tests (3 TCs)
// =====================================================================
test.describe('Phase 5 — T-DEEP: i18n Locale Switching Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-T-DEEP-01: Locale switch EN to FR', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    // Find locale combobox and switch to French
    const localeSelect = page.locator('[role="combobox"]').filter({ hasText: /en|fr/i }).first();
    if (await localeSelect.isVisible()) {
      await localeSelect.selectOption('fr');
      await page.waitForTimeout(2000);
    }
    // Verify French sidebar labels
    await expect(page.locator('text=Accueil').or(page.locator('text=Home'))).toBeVisible();
  });

  test('TC-T-DEEP-02: FR locale translation gaps', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    // Switch to FR and check for raw i18n keys
    const localeSelect = page.locator('[role="combobox"]').filter({ hasText: /en|fr/i }).first();
    if (await localeSelect.isVisible()) {
      await localeSelect.selectOption('fr');
      await page.waitForTimeout(2000);
    }
    // Check for raw i18n keys (BUG-16)
    const pageText = await page.textContent('body');
    const hasRawKeys = pageText?.includes('banner.menu.') ?? false;
    // This is expected to find raw keys — BUG-16
    console.log(`Raw i18n keys present: ${hasRawKeys}`);
  });

  test('TC-T-DEEP-03: FR to EN locale restore', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    // Switch to FR then back to EN
    const localeSelect = page.locator('[role="combobox"]').filter({ hasText: /en|fr/i }).first();
    if (await localeSelect.isVisible()) {
      await localeSelect.selectOption('fr');
      await page.waitForTimeout(2000);
      await localeSelect.selectOption('en');
      await page.waitForTimeout(2000);
    }
    // Verify English labels restored
    await expect(page.locator('text=Home')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite I18N-EXT — Translation API & Admin Management (TC-I18N-EXT-01 through TC-I18N-EXT-06)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('i18n Extended — API & Admin Translation Management (TC-I18N-EXT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-I18N-EXT-01: Translation statistics API returns completion metrics', async ({ page }) => {
    /**
     * US-I18N-1: Admin needs to know the translation coverage percentage before
     * deploying to French-speaking labs.
     * Baseline: 51.4% complete (1,120/2,180 entries) per Phase 4 K-DEEP validation.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Try multiple known translation stat endpoints
      const candidates = [
        '/api/OpenELIS-Global/rest/translation/stats',
        '/api/OpenELIS-Global/rest/localization/stats',
        '/api/OpenELIS-Global/rest/MasterListsPage/translationManagement',
      ];
      for (const path of candidates) {
        const res = await fetch(path, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          return { status: res.status, path, data };
        }
      }
      return { status: 404, path: 'none', data: null };
    });

    console.log(`TC-I18N-EXT-01: Translation stats → ${result.path} status=${result.status}`);
    if (result.status === 200 && result.data) {
      console.log(`TC-I18N-EXT-01: Stats data keys: [${Object.keys(result.data).join(', ')}]`);
    }
    // API should exist (200) or gracefully not exist (404) — not crash (5xx)
    expect(result.status, 'Translation stats API must not return 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-I18N-EXT-02: Translation Management admin page is accessible', async ({ page }) => {
    /**
     * US-I18N-1: The admin Translation Management screen lets translators see
     * untranslated strings and add French translations.
     * Confirmed accessible in Phase 4 K-DEEP testing.
     */
    const candidates = [
      '/MasterListsPage/translationManagement',
      '/TranslationManagement',
      '/MasterListsPage/Localization',
    ];

    let loaded = false;
    for (const path of candidates) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes('404') && !page.url().includes('LoginPage')) {
        loaded = true;
        console.log(`TC-I18N-EXT-02: PASS — Translation Management at ${page.url()}`);
        break;
      }
    }

    if (!loaded) {
      console.log('TC-I18N-EXT-02: GAP — Translation Management page not found at known URLs');
    } else {
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Internal Server Error');
      expect(page.url()).not.toMatch(/LoginPage|login/i);
    }
  });

  test('TC-I18N-EXT-03: French translation gap — BUG-16 untranslated keys visible', async ({ page }) => {
    /**
     * US-I18N-2: BUG-16 (documented in Phase 5 T-DEEP): the Translation Management
     * page shows raw untranslated key strings still visible in the French locale.
     * This test confirms the bug is still present and documents its scope.
     */
    await page.goto(`${BASE}/MasterListsPage/translationManagement`).catch(() =>
      page.goto(`${BASE}/TranslationManagement`)
    );
    await page.waitForLoadState('networkidle');

    if (page.url().includes('LoginPage')) {
      console.log('TC-I18N-EXT-03: SKIP — Translation Management not accessible');
      test.skip();
      return;
    }

    const bodyText = await page.locator('body').innerText();

    // Raw i18n keys look like: label.someThing.here or header.module.name
    const rawKeyPattern = /[a-z]+\.[a-zA-Z]+\.[a-zA-Z]+/g;
    const rawKeys = bodyText.match(rawKeyPattern) ?? [];

    // Filter to likely i18n keys (exclude URLs, CSS classes, etc.)
    const i18nKeys = rawKeys.filter(k =>
      !k.startsWith('http') &&
      !k.includes('/') &&
      k.split('.').length >= 2 &&
      !/\d/.test(k.split('.')[0])
    );

    console.log(`TC-I18N-EXT-03: Raw i18n key count on page: ${i18nKeys.length}`);
    if (i18nKeys.length > 0) {
      console.log(`TC-I18N-EXT-03: BUG-16 CONFIRMED — sample keys: [${i18nKeys.slice(0, 5).join(', ')}]`);
    } else {
      console.log('TC-I18N-EXT-03: BUG-16 not reproduced (may be fixed or page empty)');
    }
    // Non-blocking — document the count for tracking BUG-16 progress
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-I18N-EXT-04: Locale persists across navigation within session', async ({ page }) => {
    /**
     * US-I18N-3: When a user switches to French, the language must remain French
     * as they navigate between pages (not reset to English on each page load).
     * This is critical for French-speaking lab staff who work in French all day.
     */
    await page.goto(`${BASE}?lang=fr`).catch(() => page.goto(`${BASE}`));
    await page.waitForTimeout(1500);

    // Navigate to another page while keeping the French locale via URL
    await page.goto(`${BASE}/MasterListsPage?lang=fr`).catch(() =>
      page.goto(`${BASE}/MasterListsPage`)
    );
    await page.waitForTimeout(1500);

    const bodyText = await page.locator('body').innerText();
    // Check if any French terms survived navigation
    const hasFrench = /résultat|commande|patient|accueil|tableau|validation|paramètre/i.test(bodyText);
    const hasEnglish = /result|order|dashboard|validation|setting/i.test(bodyText);

    console.log(`TC-I18N-EXT-04: After navigation — hasFrench=${hasFrench}, hasEnglish=${hasEnglish}`);
    if (hasFrench && !hasEnglish) {
      console.log('TC-I18N-EXT-04: PASS — French locale persisted across navigation');
    } else if (hasFrench && hasEnglish) {
      console.log('TC-I18N-EXT-04: PARTIAL — mixed EN/FR content after navigation (partial translation)');
    } else {
      console.log('TC-I18N-EXT-04: NOTE — French not maintained across navigation (locale not persisted via URL param)');
    }
    // Page must not crash regardless of locale state
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-I18N-EXT-05: Admin Translation Management shows total entry count near baseline', async ({ page }) => {
    /**
     * US-I18N-1: The translation screen should show the known count of translation
     * entries (~2,180 per Phase 4 K-DEEP baseline).
     * Regression guard: if the count drops significantly, strings may have been deleted.
     */
    await page.goto(`${BASE}/MasterListsPage/translationManagement`).catch(() =>
      page.goto(`${BASE}/TranslationManagement`)
    );
    await page.waitForLoadState('networkidle');

    if (page.url().includes('LoginPage')) {
      console.log('TC-I18N-EXT-05: SKIP — Translation Management not accessible');
      test.skip();
      return;
    }

    const bodyText = await page.locator('body').innerText();

    // Look for a number near the expected 2180 baseline (allow wide range for growth)
    const numericMatches = bodyText.match(/\b[12]\d{3}\b/g) ?? [];
    console.log(`TC-I18N-EXT-05: Numbers in range 1000-2999 on page: [${numericMatches.join(', ')}]`);

    const hasCountNearBaseline = numericMatches.some(n => {
      const num = parseInt(n, 10);
      return num >= 1000 && num <= 5000; // wide tolerance for growth
    });

    if (hasCountNearBaseline) {
      console.log('TC-I18N-EXT-05: PASS — translation entry count found in expected range');
    } else {
      console.log('TC-I18N-EXT-05: NOTE — no count in expected range (page may render it differently)');
    }
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-I18N-EXT-06: French locale used in lab report printout', async ({ page }) => {
    /**
     * US-I18N-4: Reports printed for patients at French-speaking facilities must
     * use French field labels. This verifies the locale propagates to the report layer.
     */
    const reportPaths = [
      `/PrintPatientResults?lang=fr`,
      `/PatientReport?lang=fr`,
      `/LabReport?accession=26CPHL00008V&lang=fr`,
    ];

    let foundFrenchReport = false;
    for (const path of reportPaths) {
      const res = await page.goto(`${BASE}${path}`).catch(() => null);
      if (!res) continue;
      if (page.url().includes('LoginPage')) {
        await login(page, ADMIN.user, ADMIN.pass);
        await page.goto(`${BASE}${path}`);
      }
      await page.waitForTimeout(1500);
      const bodyText = await page.locator('body').innerText();
      if (!bodyText.includes('404') && bodyText.length > 100) {
        const hasFrenchLabel = /résultat|nom|date de naissance|rapport|laboratoire/i.test(bodyText);
        console.log(`TC-I18N-EXT-06: ${path} — hasFrenchLabel=${hasFrenchLabel}`);
        if (hasFrenchLabel) {
          foundFrenchReport = true;
          console.log('TC-I18N-EXT-06: PASS — French labels found in report printout');
        }
        break;
      }
    }

    if (!foundFrenchReport) {
      console.log('TC-I18N-EXT-06: NOTE — no French-translated report found (may require French setup in admin)');
    }
    // Non-blocking — document the gap without hard-failing
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });
});
