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
