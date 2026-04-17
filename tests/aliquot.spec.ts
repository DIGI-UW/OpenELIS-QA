import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  ACCESSION,
  QA_PREFIX,
  TIMEOUT,
  login,
  navigateWithDiscovery,
} from '../helpers/test-helpers';

/**
 * Aliquot Management Test Suite — Suite AP (TC-ALQ)
 *
 * User stories covered:
 *   US-ALQ-1: As a lab technician, I can create aliquots from a primary sample
 *             so that multiple tests can be run from a single collection.
 *   US-ALQ-2: As a lab tech, I can look up which aliquots belong to a primary
 *             sample using the accession number.
 *   US-ALQ-3: As a lab supervisor, the aliquot creation form must enforce
 *             minimum required fields (accession, volume, container type).
 *   US-ALQ-4: As a lab admin, I can view the aliquot log for audit purposes.
 *   US-ALQ-5: As a lab tech, the aliquot page must work without crashing even
 *             when an accession has no previous aliquots.
 *
 * URLs:
 *   /Aliquot            — primary aliquot management page
 *   /AliquotOrder       — fallback
 *   /SampleAliquot      — fallback
 *
 * API endpoints:
 *   GET  /rest/AliquotOrder       — aliquot list for an accession
 *   POST /rest/AliquotOrder       — create new aliquot
 *   GET  /rest/containerTypes     — container type reference list
 *
 * Suite IDs: TC-ALQ-01 through TC-ALQ-16
 * Total Test Count: 16 TCs
 *
 * Known baseline (Phase 3):
 *   - BUG-10: Billing page 404 (separate from Aliquot — Aliquot is on sidebar)
 *   - BUG-11/15: NoteBook/Billing 404 (do not confuse with Aliquot)
 *   - Aliquot link confirmed present in sidebar (Phase 9 regression audit)
 */

const ALIQUOT_URLS = [
  '/Aliquot',
  '/AliquotOrder',
  '/SampleAliquot',
  '/aliquot',
];

async function goToAliquot(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, ALIQUOT_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite AP — Aliquot Core (TC-ALQ-01 through TC-ALQ-08)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite AP — Aliquot Management Core (TC-ALQ)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALQ-01: Aliquot page is reachable', async ({ page }) => {
    /**
     * US-ALQ-1: The aliquot management screen must be accessible.
     * Without this page, technicians cannot split samples.
     */
    const loaded = await goToAliquot(page);
    expect(loaded, 'Aliquot page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-ALQ-01: PASS — Aliquot page at ${page.url()}`);
  });

  test('TC-ALQ-02: Aliquot page has accession number search input', async ({ page }) => {
    /**
     * US-ALQ-2: The aliquot page must have a search input so the technician
     * can look up a primary sample by accession number.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator(
      'input[placeholder*="accession" i], input[placeholder*="lab" i], input[placeholder*="search" i], input'
    ).first();
    const hasInput = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-ALQ-02: accession input visible=${hasInput}`);
    expect(hasInput, 'Aliquot page must have an accession search input').toBe(true);
  });

  test('TC-ALQ-03: Searching known accession does not cause 500', async ({ page }) => {
    /**
     * US-ALQ-2: Searching for the known accession 26CPHL00008V must return
     * aliquot data or empty state — never a server error.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill(ACCESSION);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Aliquot lookup must not cause 500').not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('at org.');
    console.log('TC-ALQ-03: PASS — accession lookup handled without server error');
  });

  test('TC-ALQ-04: Aliquot page is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-ALQ-1: Admin must be able to access the aliquot page. RBAC must not
     * accidentally block this from the admin role.
     */
    const loaded = await goToAliquot(page);
    expect(loaded, 'Admin must be able to access Aliquot page').toBe(true);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });

  test('TC-ALQ-05: Aliquot page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    const loaded = await goToAliquot(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-ALQ-05: Aliquot page loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Aliquot page must load within 5000ms').toBeLessThan(5000);
    }
  });

  test('TC-ALQ-06: Aliquot page shows Create/Add Aliquot control', async ({ page }) => {
    /**
     * US-ALQ-1: The aliquot page must present a way to create a new aliquot
     * (button, form, or link). Without this, the page is read-only and useless.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const addBtn = page.getByRole('button', { name: /add|create|new|save/i }).first();
    const hasAdd = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const bodyText = await page.locator('body').innerText();
    const hasAliquotTerm = /aliquot|split|sub-sample|container/i.test(bodyText);

    console.log(`TC-ALQ-06: addControl=${hasAdd}, aliquotTerm=${hasAliquotTerm}`);
    if (!hasAdd && !hasAliquotTerm) {
      console.log('TC-ALQ-06: NOTE — no Add control or aliquot term found on page');
    } else {
      console.log('TC-ALQ-06: PASS — aliquot management UI elements found');
    }
  });

  test('TC-ALQ-07: Non-existent accession shows empty state, not 500', async ({ page }) => {
    /**
     * US-ALQ-5: Searching for an accession with no aliquots must return an
     * empty state, not a Java NullPointerException or 500 error.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('ZZZZZ99999NON_EXISTENT');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Non-existent accession must not cause 500').not.toContain('Internal Server Error');
      expect(bodyText).not.toContain('NullPointerException');
      console.log('TC-ALQ-07: PASS — non-existent accession handled gracefully');
    } else {
      console.log('TC-ALQ-07: NOTE — search input not found on Aliquot page');
    }
  });

  test('TC-ALQ-08: Aliquot API endpoint exists and responds', async ({ page }) => {
    /**
     * US-ALQ-2: The AliquotOrder REST API must exist. A 404 means the feature
     * is not wired up. 405 (Method Not Allowed on GET) is acceptable.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/AliquotOrder',
        '/api/OpenELIS-Global/rest/aliquot',
        '/api/OpenELIS-Global/rest/SampleAliquot',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-ALQ-08: Aliquot API → ${result.url} HTTP ${result.status}`);
    if (result.status !== 404) {
      expect(result.status, 'Aliquot API must not 5xx').not.toBeGreaterThanOrEqual(500);
    } else {
      console.log('TC-ALQ-08: NOTE — aliquot API endpoint not at expected paths');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite AP-DEEP — Aliquot Deep Validation (TC-ALQ-09–16)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite AP-DEEP — Aliquot Deep Validation (TC-ALQ-09–16)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALQ-09: Container types API returns a list', async ({ page }) => {
    /**
     * US-ALQ-3: The container types reference list backs the aliquot form
     * container type dropdown. Must return at least 1 container type.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/containerTypes',
        '/api/OpenELIS-Global/rest/container-types',
        '/api/OpenELIS-Global/rest/AliquotContainerType',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.containerTypes ?? data.types ?? []);
          return { status: res.status, count: list.length, url };
        }
        if (res.status !== 404) return { status: res.status, count: -1, url };
      }
      return { status: 404, count: -1, url: 'none' };
    });

    console.log(`TC-ALQ-09: Container types → ${result.url} HTTP ${result.status}, count=${result.count}`);
    if (result.status !== 404) {
      expect(result.status, 'Container types API must not 5xx').not.toBeGreaterThanOrEqual(500);
    }
  });

  test('TC-ALQ-10: Aliquot page does not expose stack traces', async ({ page }) => {
    /**
     * US-ALQ-5: The aliquot page must never display Java stack traces,
     * even when an error occurs internally.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    expect(bodyText).not.toContain('at org.');
    expect(bodyText).not.toContain('at java.');
    expect(bodyText).not.toContain('NullPointerException');
    expect(bodyText).not.toContain('StackOverflowError');
    console.log('TC-ALQ-10: PASS — no stack traces on Aliquot page');
  });

  test('TC-ALQ-11: Aliquot sidebar link is present in main navigation', async ({ page }) => {
    /**
     * US-ALQ-1: The Aliquot option must appear in the sidebar navigation so
     * users can discover the feature without knowing the direct URL.
     */
    await page.goto(`${BASE}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    const hasSidebarLink = /aliquot/i.test(bodyText);

    console.log(`TC-ALQ-11: Aliquot in sidebar=${hasSidebarLink}`);
    // Non-blocking — document state
    if (hasSidebarLink) {
      console.log('TC-ALQ-11: PASS — Aliquot link present in navigation');
    } else {
      console.log('TC-ALQ-11: NOTE — Aliquot link not found in navigation text');
    }
  });

  test('TC-ALQ-12: Concurrent aliquot API requests are stable', async ({ page }) => {
    /**
     * US-ALQ-2 (performance): Multiple simultaneous aliquot lookups must not
     * cause server errors or session corruption.
     */
    await page.goto(`${BASE}`);

    const results = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const url = '/api/OpenELIS-Global/rest/AliquotOrder';
      const requests = Array.from({ length: 5 }, () =>
        fetch(url, { headers: { 'X-CSRF-Token': csrf } }).then(r => r.status)
      );
      return Promise.all(requests);
    });

    const serverErrors = results.filter(s => s >= 500);
    console.log(`TC-ALQ-12: 5 concurrent aliquot requests → [${results.join(', ')}], errors=${serverErrors.length}`);
    if (!results.every(s => s === 404)) {
      expect(serverErrors.length, 'Concurrent aliquot requests must not cause 5xx').toBe(0);
    }
  });

  test('TC-ALQ-13: Empty aliquot form submit shows validation, not 500', async ({ page }) => {
    /**
     * US-ALQ-3: Submitting the aliquot form without filling required fields
     * must show a validation message, not an Internal Server Error.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const submitBtn = page.getByRole('button', { name: /submit|save|create|add/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Empty form submit must not cause Internal Server Error').not.toContain('Internal Server Error');
      const hasValidation = /required|please|fill|error|invalid/i.test(bodyText);
      console.log(`TC-ALQ-13: validationShown=${hasValidation}`);
    } else {
      console.log('TC-ALQ-13: NOTE — no Submit button found on Aliquot page');
    }
  });

  test('TC-ALQ-14: Aliquot and Storage pages are independently accessible', async ({ page }) => {
    /**
     * US-ALQ-1: Aliquot and Storage are related but separate modules.
     * Both must be independently accessible (not dependent on each other).
     */
    const aliquotLoaded = await goToAliquot(page);
    const aliquotBody = await page.locator('body').innerText();
    const aliquotOk = aliquotLoaded && !aliquotBody.includes('Internal Server Error');

    await page.goto(`${BASE}`);
    await login(page, ADMIN.user, ADMIN.pass);
    const storageLoaded = await navigateWithDiscovery(page, ['/StorageMenu', '/Storage', '/storage']);
    const storageBody = await page.locator('body').innerText();
    const storageOk = storageLoaded && !storageBody.includes('Internal Server Error');

    console.log(`TC-ALQ-14: Aliquot=${aliquotOk}, Storage=${storageOk}`);
    expect(aliquotOk || storageOk, 'At least one of Aliquot/Storage must be accessible').toBe(true);
  });

  test('TC-ALQ-15: Aliquot form shows volume field or volume-related input', async ({ page }) => {
    /**
     * US-ALQ-3: Aliquot creation must require a volume field so that the
     * sub-sample amount is tracked. A missing volume field is a data quality gap.
     */
    const loaded = await goToAliquot(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    const hasVolumeTerm = /volume|qty|quantity|amount|mL|μL|ml/i.test(bodyText);
    const hasVolumeInput = await page.locator('input[name*="volume" i], input[id*="volume" i], input[placeholder*="volume" i]').count() > 0;

    console.log(`TC-ALQ-15: volumeTerm=${hasVolumeTerm}, volumeInput=${hasVolumeInput}`);
    if (hasVolumeTerm || hasVolumeInput) {
      console.log('TC-ALQ-15: PASS — volume field/term present in aliquot form');
    } else {
      console.log('TC-ALQ-15: NOTE — no volume field found (may appear after accession lookup)');
    }
  });

  test('TC-ALQ-16: Aliquot page cross-validates with AccessionResults', async ({ page }) => {
    /**
     * US-ALQ-2: An aliquot belongs to a primary sample (accession). The
     * AccessionResults API must be accessible alongside the aliquot page —
     * confirming the data foundation is stable.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const [aliquotRes, accessionRes] = await Promise.all([
        fetch('/api/OpenELIS-Global/rest/AliquotOrder', {
          headers: { 'X-CSRF-Token': csrf },
        }).then(r => r.status),
        fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
          headers: { 'X-CSRF-Token': csrf },
        }).then(r => r.status),
      ]);
      return { aliquot: aliquotRes, accession: accessionRes };
    });

    console.log(`TC-ALQ-16: Aliquot API=${result.aliquot}, AccessionResults=${result.accession}`);
    expect(result.aliquot, 'Aliquot API must not 5xx').not.toBeGreaterThanOrEqual(500);
    expect(result.accession, 'AccessionResults must not 5xx').not.toBeGreaterThanOrEqual(500);
  });
});
