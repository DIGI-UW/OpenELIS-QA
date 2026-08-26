/**
 * Results page — regression guards for the OGC-1179 fixes, plus the two
 * multi-component deviations that are still open.
 *
 * HISTORY. This file was written on 2026-08-13 as a *flip-when-fixed* suite: every assertion
 * encoded the BROKEN behaviour so that a failure would signal the fix had landed. PR #4064
 * ("stop the unified worklist overwriting a result nobody edited") landed on 2026-08-16 and was
 * verified live on testing v3.2.1.11 (bundle index-dkNHlWyN.js). The Δ-6 / Δ-10 / Δ-11 / Δ-13
 * assertions have therefore been FLIPPED: they now assert the CORRECT behaviour and will fail if
 * it regresses. Δ-8 and Δ-9 are untouched by that PR (OGC-1130/1131 scope) and remain
 * flip-when-fixed.
 *
 *   Δ-6   critical range suppressed when unset / non-numeric        FIXED — guards the fix
 *   Δ-8   multi-component renders N rows, not one row with N fields OPEN  — flip-when-fixed
 *   Δ-9   Edit unlocks one component, not the analysis              OPEN  — flip-when-fixed
 *   Δ-10  Edit seeds from the STORED value; no phantom modification FIXED — guards the fix
 *   Δ-11  result controls carry accessible names                    FIXED — guards the fix
 *   Δ-12  Save not offered on an untouched row (root cause)         FIXED — guards the fix
 *   Δ-13  signature meaning is MODIFIED when revising               FIXED — esig-gated
 *
 * WHAT MAKES Δ-10 TESTABLE. It needs a row whose stored value is finer than its test reports to.
 * The fix now prevents creating one through the UI (entry is constrained to significantDigits),
 * so the suite SEEDS one through the API, exactly as a legacy row or an analyzer import would
 * arrive. Do not delete the seeded row's divergence by "tidying" it.
 *
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts --project=results-deep-delta
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const UNIT_MOLBIO = '136';
const MULTI_ACC_TAIL = '0107';

interface LogRow {
  analysisId: string;
  accessionNumber: string;
  resultValue: string;
  /** the value as stored, where resultValue is the value as reported (added by #4064) */
  rawResultValue?: string;
  significantDigits: number;
  resultType: string;
  criticalRange: string;
  testName: string;
}

async function logbook(page: Page, unit: string): Promise<LogRow[]> {
  return page.evaluate(async (u: string) => {
    const r = await fetch(
      `/api/OpenELIS-Global/rest/LogbookResults?testSectionId=${u}&doRange=false&finished=false`,
      { headers: { Accept: 'application/json' }, credentials: 'include' },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { testResult?: LogRow[] };
    return j.testResult ?? [];
  }, unit);
}

async function historyResultDetails(page: Page, analysisId: string): Promise<string[]> {
  return page.evaluate(async (id: string) => {
    const r = await fetch(`/api/OpenELIS-Global/rest/results-entry/analysis/${id}/history`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    const j = (await r.json()) as { events?: Array<{ type: string; detail?: string }> };
    return (j.events ?? []).filter((e) => e.type === 'RESULT').map((e) => String(e.detail ?? ''));
  }, analysisId);
}

async function openUnit(page: Page, unit: string): Promise<void> {
  await page.goto(`${BASE}/Results?testSectionId=${unit}`);
  await page.waitForTimeout(6000);
}

/**
 * Build gate. `rawResultValue` arrived with #4064; without it we are on a pre-fix build and the
 * "fixed" assertions below would fail for the wrong reason.
 */
async function requireFixedBuild(page: Page): Promise<void> {
  await page.goto(`${BASE}/Results`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  const flag = await page.evaluate(async () => {
    const r = await fetch('/api/OpenELIS-Global/rest/configuration-properties', { credentials: 'include' });
    return ((await r.json()) as Record<string, string>).RESULTS_ENTRY_UNIFIED_ROUTE;
  });
  test.skip(flag !== 'true', 'RESULTS_ENTRY_UNIFIED_ROUTE is off — unified worklist not active.');

  const rows = await logbook(page, UNIT_MOLBIO);
  test.skip(rows.length === 0, 'Molecular Biology worklist is empty.');
  test.skip(
    !Object.prototype.hasOwnProperty.call(rows[0], 'rawResultValue'),
    'Build predates PR #4064 (no rawResultValue in the DTO) — these guard the fix, so they cannot run here.',
  );
}

test.describe('unified /Results — OGC-1179 fix regression guards', () => {
  test('Δ-6: no test reports an Infinity critical range, and non-numeric types report none at all', async ({ page }) => {
    await requireFixedBuild(page);

    for (const unit of [UNIT_MOLBIO, '36', '59']) {
      const rows = await logbook(page, unit);
      if (!rows.length) continue;

      expect(
        rows.filter((r) => /infinity/i.test(String(r.criticalRange ?? ''))).length,
        `REGRESSION (unit ${unit}): a critical range is rendering as Infinity again. An unset ` +
          'lowCritical/highCritical must suppress the line — see CriticalRangeFormat.display().',
      ).toBe(0);

      expect(
        rows.filter((r) => r.resultType === 'D' && String(r.criticalRange ?? '').length > 0).length,
        `REGRESSION (unit ${unit}): a dictionary result is carrying critical-range text. A ` +
          'non-numeric result type cannot have a numeric critical bound.',
      ).toBe(0);
    }
  });

  test('Δ-10 + Δ-12: Edit seeds from the stored value, and an untouched row offers no Save', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const rows = await logbook(page, UNIT_MOLBIO);
    // The precondition: stored finer than reported. Prefer an existing divergent row.
    let target = rows.find(
      (r) =>
        r.resultType === 'N' &&
        Number(r.significantDigits) === 0 &&
        typeof r.rawResultValue === 'string' &&
        r.rawResultValue !== r.resultValue,
    );

    // None present? Seed one the way a legacy row or an analyzer import would arrive — through
    // the API, which is not subject to the UI's precision constraint.
    if (!target) {
      const candidate = rows.find((r) => r.resultType === 'N' && Number(r.significantDigits) === 0);
      test.skip(!candidate, 'No significantDigits:0 numeric component available to seed.');
      const c = candidate as LogRow;
      const seeded = `${Math.trunc(Number(c.resultValue || '20')) + 1}.45`;
      await page.evaluate(
        async ([analysisId, value]) => {
          const csrf = localStorage.getItem('CSRF') || '';
          const list = await fetch(
            '/api/OpenELIS-Global/rest/LogbookResults?testSectionId=136&doRange=false&finished=false',
            { credentials: 'include' },
          ).then((r) => r.json());
          const item = (list.testResult || []).find(
            (r: { analysisId: string }) => r.analysisId === analysisId,
          );
          if (!item) return;
          await fetch(`/api/OpenELIS-Global/rest/results-entry/analysis/${analysisId}/result`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ testResult: { ...item, resultValue: value, isModified: true } }),
          });
        },
        [c.analysisId, seeded] as const,
      );
      await openUnit(page, UNIT_MOLBIO);
      const reloaded = await logbook(page, UNIT_MOLBIO);
      target = reloaded.find((r) => r.analysisId === c.analysisId);
    }

    test.skip(!target, 'Could not obtain a row whose stored value is finer than it reports.');
    const t = target as LogRow;
    const stored = String(t.rawResultValue);

    const row = page.locator('table tbody tr').filter({ hasText: t.accessionNumber }).filter({ hasText: 'Ct' }).first();
    await row.getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(2200);

    // Δ-10 — the editor must hold what is STORED, not what is reported.
    expect(
      await row.locator('input[type=number]').first().inputValue(),
      'REGRESSION (Δ-10): Edit is seeding from the reported value again. Saving would truncate the ' +
        'stored result and book a modification against the technician. See handleEdit() — it must ' +
        'swap resultValue := rawResultValue.',
    ).toBe(stored);

    // Δ-12 root cause — nothing changed, so nothing to save.
    expect(
      await row.getByRole('button', { name: /^save$/i }).count(),
      'REGRESSION (Δ-12): Save is offered on a row opened for Edit and left untouched. With ' +
        'e-signature on this asks for a legally binding Part 11 signature for a revision the signer ' +
        'never made. See editState.ts — EDITING must not become savable until VALUE_CHANGED.',
    ).toBe(0);

    // ...and the audit trail must stay clean.
    const before = await historyResultDetails(page, t.analysisId);
    await page.reload();
    await page.waitForTimeout(5000);
    expect(
      (await historyResultDetails(page, t.analysisId)).length,
      'REGRESSION (Δ-10): a RESULT event was recorded for an edit session in which nothing changed.',
    ).toBe(before.length);
  });

  test('Δ-10b: an over-precise entry is refused rather than silently rounded', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const rows = await logbook(page, UNIT_MOLBIO);
    const t = rows.find((r) => r.resultType === 'N' && Number(r.significantDigits) === 0);
    test.skip(!t, 'No significantDigits:0 numeric component available.');
    const target = t as LogRow;

    const row = page.locator('table tbody tr').filter({ hasText: target.accessionNumber }).filter({ hasText: 'Ct' }).first();
    const edit = row.getByRole('button', { name: /^edit$/i });
    if (await edit.count()) {
      await edit.click();
      await page.waitForTimeout(2000);
    }
    const input = row.locator('input[type=number]').first();

    expect(
      await input.getAttribute('step'),
      'REGRESSION: the number input no longer constrains entry to the configured precision.',
    ).toBe('1');

    await input.fill('19.37');
    await page.waitForTimeout(1200);
    const save = row.getByRole('button', { name: /^save$/i });
    expect(
      await save.isDisabled(),
      'REGRESSION (Δ-10): a value finer than the test reports to can be saved again. It would be ' +
        'stored in full, displayed rounded, and truncated by the next edit.',
    ).toBe(true);

    await input.fill('19');
    await page.waitForTimeout(1200);
    expect(
      await save.isDisabled(),
      'A value at the configured precision must remain savable — the guard must not block ordinary work.',
    ).toBe(false);
  });

  test('Δ-11: every result control carries an accessible name', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('table tbody select, table tbody input[type=number]')].filter(
        (i) =>
          !i.getAttribute('aria-label') &&
          !i.getAttribute('aria-labelledby') &&
          !(i.id && document.querySelector(`label[for="${i.id}"]`)),
      ).length,
    );
    expect(
      unnamed,
      'REGRESSION (Δ-11): a result control lost its accessible name. A screen-reader user lands on ' +
        "an unnamed control on the page's primary input.",
    ).toBe(0);
  });

  test('Δ-13: a revision is signed as MODIFIED, not AUTHORED [esig-gated]', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const row = page
      .locator('table tbody tr')
      .filter({ has: page.getByRole('button', { name: /^edit$/i }) })
      .first();
    test.skip((await row.count()) === 0, 'No saved result available.');

    await row.getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(2000);
    const input = row.locator('input[type=number]').first();
    test.skip((await input.count()) === 0, 'Chosen row is not numeric.');
    await input.fill(String(Number((await input.inputValue()) || '20') + 1));
    await page.waitForTimeout(1000);
    await row.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(2500);

    const sig = await page.getByText(/Electronic Signature/i).count();
    test.skip(sig === 0, 'electronicSignatureEnabled is off — enable it in Site Information to run this.');

    await expect(
      page.getByText(/Signature Meaning:\s*Modified/i).first(),
      'REGRESSION (Δ-13): a revision is being signed as "Authored". The note-context chip computes ' +
        'this correctly on the same interaction — the signature must use isModifyingSavedResult().',
    ).toBeVisible();

    await page.getByRole('button', { name: /^cancel$/i }).first().click();
  });

  // ---------------------------------------------------------------------------
  // Still OPEN — OGC-1130/1131 scope, untouched by #4064. Flip-when-fixed.
  // ---------------------------------------------------------------------------

  test('Δ-8 (OPEN, OGC-1130/1131): a multi-component analysis renders as N rows', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const rows = page.locator('table tbody tr').filter({ hasText: `DEV0126000000000${MULTI_ACC_TAIL}` });
    const count = await rows.count();
    test.skip(count === 0, `Multi-component fixture …${MULTI_ACC_TAIL} not on this instance.`);

    expect(
      count,
      'Δ-8 fixed? The analysis now occupies ONE row — flip to toBe(1) and assert its panel renders ' +
        'N result fields in component display_order (FR-A′1).',
    ).toBeGreaterThan(1);
  });

  test('Δ-9 (OPEN, OGC-1130/1131): Edit unlocks one component, not the analysis', async ({ page }) => {
    await requireFixedBuild(page);
    await openUnit(page, UNIT_MOLBIO);

    const comps = page.locator('table tbody tr').filter({ hasText: `DEV0126000000000${MULTI_ACC_TAIL}` });
    const saved = comps.filter({ has: page.getByRole('button', { name: /^edit$/i }) });
    test.skip((await saved.count()) < 2, 'Need two SAVED components to test cross-component unlock.');

    await saved.nth(0).getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(2000);

    expect(
      (await saved.nth(1).locator('input, select').count()) === 0,
      'Δ-9 fixed? Edit now unlocks every component together (FR-A2 / FR-A′6) — flip to toBe(false).',
    ).toBe(true);
  });
});
