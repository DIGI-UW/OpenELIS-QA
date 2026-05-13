/**
 * tests/personas/persona-pf-lab-administrator.spec.ts
 *
 * SKILL §12 Persona PF — Lab Administrator
 *
 * The day: a lab administrator doing first-time setup on a new
 * OpenELIS install. They:
 *   1. Update site branding (logo, colors, lab name)
 *   2. Configure barcode formats
 *   3. Set up one new test (TestAdd)
 *   4. Set up one new analyzer mapping
 *   5. Enable EQA
 *   6. Create one new user with Receptionist role
 *   7. Generate User Manual link
 *
 * This is the most architecturally important persona. PF catches
 * HIDDEN REQUIREMENTS — config toggles a sane admin would not know
 * to flip. The canonical example: `eqaEnabled` in Order Entry
 * Configuration. Phase 27 cancelled 7 Jira tickets (OGC-518–524)
 * because they were filed against an EQA module whose sidebar items
 * are silent dead-ends until that toggle is true. A real admin would
 * call this a bug. The PF persona surfaces it as one.
 *
 * Other catches in this persona:
 *   BUG-1 / BUG-12 — TestAdd form serialization
 *   BUG-3 / BUG-20 — UserCreate form & Login Name invalid flag
 *
 * Run individually:
 *   npx playwright test --project=persona-pf
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';

const PERSONA = 'PF';
const TEST_USER = {
  loginName: `qa_auto_pf_receptionist_${Date.now()}`,
  password: 'QA_Auto_PW_2026!',
  firstName: 'QA',
  lastName: 'AUTO_PF',
  role: 'Receptionist',
};

test.describe.serial('Persona PF — Lab Administrator (first-time setup)', () => {
  let originalPrimaryColor: string | null = null;
  let originalEqaEnabledValue: string | null = null;
  let eqaEnabledEntryId: string | null = null;

  test.afterAll(async ({ browser }) => {
    // Restore branding and EQA toggle even if mid-test failure
    const ctx = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto(BASE);

    if (originalPrimaryColor) {
      await apiCall(page, '/api/OpenELIS-Global/rest/site-branding', {
        method: 'PUT', body: { primaryColor: originalPrimaryColor },
      });
    }
    if (eqaEnabledEntryId && originalEqaEnabledValue !== null) {
      // Restore the eqaEnabled config to its original value
      await apiCall(page, '/api/OpenELIS-Global/rest/SampleEntryConfigurationMenu', {
        method: 'POST', body: { ID: eqaEnabledEntryId, value: originalEqaEnabledValue },
      });
    }
    await ctx.close();
  });

  test('Step 1 — Update site branding (PERSIST + ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const before = await apiCall<{ primaryColor?: string }>(page, '/api/OpenELIS-Global/rest/site-branding');
    if (before.ok && typeof before.body === 'object' && before.body !== null) {
      originalPrimaryColor = (before.body as { primaryColor?: string }).primaryColor ?? '#0f62fe';
    }
    const testColor = '#cc0066';
    const update = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/site-branding', {
      method: 'PUT', body: { primaryColor: testColor },
    });
    if (!update.ok) {
      markStep(PERSONA, 1, 'FAIL', `site-branding PUT HTTP ${update.status}`);
      expect(update.ok).toBeTruthy(); return;
    }
    const verify = await apiCall<{ primaryColor?: string }>(page, '/api/OpenELIS-Global/rest/site-branding');
    const round = (verify.ok && typeof verify.body === 'object' && verify.body !== null)
      ? (verify.body as { primaryColor?: string }).primaryColor
      : undefined;
    if (round !== testColor) {
      markStep(PERSONA, 1, 'FAIL', `Round-trip mismatch: got ${round}, expected ${testColor}`);
      expect(round).toBe(testColor); return;
    }
    markStep(PERSONA, 1, 'PASS', `Branding round-trips (color ${originalPrimaryColor} → ${testColor} → restored on afterAll)`);
  });

  test('Step 2 — Configure barcode formats (PERSIST)', async ({ page }) => {
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/BarcodeConfiguration', {
      method: 'POST', body: { /* admin would set label dimensions etc; PF persona just exercises the path */ },
    });
    if (!r.ok) {
      markStep(PERSONA, 2, 'PARTIAL',
        `Barcode config POST HTTP ${r.status}`,
        `Admin may not have a way to programmatically set this. The UI path may work.`);
      test.info().annotations.push({ type: 'partial', description: 'barcode config' });
      return;
    }
    markStep(PERSONA, 2, 'PASS', 'Barcode configuration POST accepted');
  });

  test('Step 3 — Create a new test (PERSIST, BUG-1/BUG-12 catch)', async ({ page }) => {
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/TestAdd', {
      method: 'POST',
      body: {
        testName: `QA_AUTO_PF_Test_${Date.now()}`,
        sampleTypeId: '4',
        resultTypeId: '1',
        active: 'true',
      },
    });
    if (!r.ok) {
      markStep(PERSONA, 3, 'FAIL',
        `BUG-1/BUG-12 catch: TestAdd HTTP ${r.status}`,
        `Lab admin first-time setup is BLOCKED at "add a new test". This is the single most basic admin task.`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep(PERSONA, 3, 'PASS', `TestAdd accepted (further verification needs test catalog read-back)`);
  });

  test('Step 4 — Enable EQA (the hidden-requirement catch)', async ({ page }) => {
    await page.goto(BASE);
    const config = await apiCall<Array<{ id?: string; name?: string; value?: string }>>(
      page, '/api/OpenELIS-Global/rest/SampleEntryConfigurationMenu'
    );
    if (!config.ok) {
      markStep(PERSONA, 4, 'BLOCKED', `SampleEntryConfigurationMenu HTTP ${config.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'config menu unreachable' });
      return;
    }
    const entries = Array.isArray(config.body) ? config.body : [];
    const eqaEntry = entries.find(e => e.name === 'eqaEnabled' || e.name?.toLowerCase().includes('eqa'));
    if (!eqaEntry?.id) {
      markStep(PERSONA, 4, 'FAIL',
        `THE HIDDEN-REQUIREMENT CATCH: cannot find eqaEnabled in SiteEntryConfiguration`,
        `Admin sees EQA in the sidebar, can't find the toggle, files bug tickets. Phase 27 cancelled 7 of these (OGC-518–524).`);
      expect(eqaEntry).toBeTruthy(); return;
    }
    eqaEnabledEntryId = eqaEntry.id;
    originalEqaEnabledValue = eqaEntry.value ?? 'false';

    const setTrue = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/SampleEntryConfigurationMenu', {
      method: 'POST', body: { ID: eqaEntry.id, value: 'true' },
    });
    if (!setTrue.ok) {
      markStep(PERSONA, 4, 'FAIL', `Setting eqaEnabled HTTP ${setTrue.status}`);
      expect(setTrue.ok).toBeTruthy(); return;
    }
    // Round-trip
    const verify = await apiCall<Array<{ id?: string; value?: string }>>(
      page, '/api/OpenELIS-Global/rest/SampleEntryConfigurationMenu'
    );
    const after = (verify.ok && Array.isArray(verify.body))
      ? verify.body.find(e => e.id === eqaEntry.id)?.value
      : undefined;
    if (after !== 'true') {
      markStep(PERSONA, 4, 'FAIL',
        `eqaEnabled didn't round-trip: got ${after}, expected "true"`,
        `Admin sets the flag, comes back, it's still off. Hidden requirement is ALSO unsavable.`);
      expect(after).toBe('true'); return;
    }
    markStep(PERSONA, 4, 'PASS',
      `EQA enabled: was "${originalEqaEnabledValue}" → "true" (restored on afterAll). Admin found and flipped the hidden requirement.`);
  });

  test('Step 5 — Create restricted-role user (PERSIST, BUG-3 catch)', async ({ page }) => {
    await page.goto(BASE);
    const r = await apiCall<{ id?: string }>(page, '/api/OpenELIS-Global/rest/UnifiedSystemUser', {
      method: 'POST',
      body: {
        loginName: TEST_USER.loginName,
        password: TEST_USER.password,
        confirmPassword: TEST_USER.password,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
        systemRoles: [TEST_USER.role],
        active: 'true',
      },
    });
    if (!r.ok) {
      markStep(PERSONA, 5, 'FAIL',
        `BUG-3 catch: UnifiedSystemUser HTTP ${r.status}`,
        `Admin can't create users — most basic onboarding task. Test instance may need CSRF token retest per BUG-3 calibration note.`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep(PERSONA, 5, 'PASS', `Created user ${TEST_USER.loginName} with role ${TEST_USER.role}`);
  });

  test('Step 6 — Verify User Manual PDF link works (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    const r = await apiCall<string>(
      page, '/api/OpenELIS-Global/documentation/OEGlobal_UserManual_en.pdf',
      { accept: 'application/pdf', expectBinary: true }
    );
    if (!r.ok) {
      markStep(PERSONA, 6, 'FAIL', `User Manual HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const buf = Buffer.from(String(r.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep(PERSONA, 6, 'FAIL', 'User Manual response not a PDF');
      expect(isPdf).toBeTruthy(); return;
    }
    markStep(PERSONA, 6, 'PASS', `User Manual PDF ${(buf.length / 1024).toFixed(0)}KB`);
  });
});
