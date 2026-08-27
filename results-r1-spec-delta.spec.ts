/**
 * OGC-1020 R1 — spec-delta guards (flip-when-fixed).
 *
 * Companion to `results-unified-worklist.spec.ts`, which asserts what R1 got RIGHT.
 * This spec asserts what R1 got WRONG, as found by the 2026-08-13 spec-delta run against
 * testing.openelis-global.org v3.2.1.11 (PR #4024 + #4036 both deployed).
 *
 * EVERY assertion here encodes the CURRENT, WRONG behavior. When engineering fixes a delta the
 * assertion FAILS — and that failure IS the signal. Read the message, then flip the assertion.
 *
 *   Δ-1  worklist load failure renders a silent empty table (no error surface at all)   High
 *   Δ-3  status chip + filter counts do not refresh after an in-page save               Medium
 *   Δ-4  stale-save rejection notification carries no refresh ACTION                    Low
 *   Δ-5  test_section.domain has no administrative write path (every unit is CLINICAL)  High/backlog
 *
 * NOT guarded here (they PASS — see results-unified-worklist.spec.ts and the run report):
 *   FR-O1 per-analysis save scoping · FR-O2 server-side version check · FR-A2/A3/A5 · audit history.
 *
 * FLAG-GATED on RESULTS_ENTRY_UNIFIED_ROUTE, same as its companion — skips cleanly on a legacy build.
 *
 * SIDE EFFECTS: Δ-3 and Δ-4 enter real results on pending Hematology analyses (the instance is a
 * throwaway test server). They never delete anything. Δ-1/Δ-5 are read-only.
 *
 * Report: `qa-spec-delta-OGC-1020-R1-20260813.md`
 *
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts --project=results-r1-delta
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

/** Lab Unit ids on testing v3.2.1.11 (Step 0.6 census, 2026-08-13). */
const UNIT_HEMATOLOGY = '36';
/** The one unit whose LogbookResults fetch 500s — the Δ-1 precondition. */
const UNIT_BIOCHEMISTRY = '56';
const UNIT_MOLBIO = '136';

interface LogbookRow {
  analysisId: string;
  accessionNumber: string;
  resultValue: string;
  analysisStatusId: string;
}

async function configProp(page: Page, key: string): Promise<string | undefined> {
  return page.evaluate(async (k: string) => {
    const r = await fetch('/api/OpenELIS-Global/rest/configuration-properties', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    const j = (await r.json()) as Record<string, string>;
    return j[k];
  }, key);
}

async function requireUnifiedRoute(page: Page): Promise<void> {
  await page.goto(`${BASE}/Results`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  const flag = await configProp(page, 'RESULTS_ENTRY_UNIFIED_ROUTE');
  test.skip(
    flag !== 'true',
    'RESULTS_ENTRY_UNIFIED_ROUTE is off — the unified worklist is not active on this build.',
  );
}

/** The Lab Unit control is a native <select>; React needs the native value setter. */
async function loadLabUnit(page: Page, testSectionId: string): Promise<void> {
  await page.goto(`${BASE}/Results?testSectionId=${testSectionId}`);
  await page.waitForTimeout(3000);
  const rows = await page.locator('table tbody tr').count();
  if (rows === 0) {
    // deep-link did not auto-load — drive the control by hand
    await page.evaluate((id: string) => {
      const el = document.getElementById('unifiedResultsLabUnit') as HTMLSelectElement | null;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(el, id);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, testSectionId);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /load results/i }).click();
    await page.waitForTimeout(3000);
  }
}

async function logbook(page: Page, testSectionId: string): Promise<LogbookRow[]> {
  return page.evaluate(async (id: string) => {
    const r = await fetch(
      `/api/OpenELIS-Global/rest/LogbookResults?testSectionId=${id}&doRange=false&finished=false`,
      { headers: { Accept: 'application/json' }, credentials: 'include' },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { testResult?: LogbookRow[] };
    return j.testResult ?? [];
  }, testSectionId);
}

/** Row locator for an accession, by its trailing digits (accessions are long and noisy). */
function rowForAccession(page: Page, accession: string) {
  return page.locator('table tbody tr').filter({ hasText: accession });
}

/**
 * Enter a result on `accession` and save it.
 *
 * Returns the value written, or NULL when the row cannot be resulted through the UI. Null is not a
 * failure: on this build a numeric field is READ-ONLY until Edit is clicked, some rows offer no
 * Edit at all, and dictionary rows are editable straight away. Callers pick a row by trying it.
 */
async function typeResultAndSave(page: Page, accession: string, value: string): Promise<string | null> {
  const row = rowForAccession(page, accession).first();
  if ((await row.count()) === 0) return null;
  await row.scrollIntoViewIfNeeded();

  // Rows are COLLAPSED: a closed row exposes only the "▶" toggle, and the entry controls live in
  // the expandable panel that renders as the next <tr> (ExpandedPanel.tsx).
  const expander = row
    .locator('button[aria-label*="xpand" i]')
    .or(row.getByRole('button', { name: '▶' }))
    .first();
  if (await expander.count()) {
    await expander.click();
    await page.waitForTimeout(900);
  }

  const panel = row.locator('xpath=following-sibling::tr[1]');
  const area = row.or(panel);

  // Edit-gated since the OGC-1179 fix (editState.ts).
  const edit = area.getByRole('button', { name: /^edit$/i });
  if (await edit.count()) {
    await edit.first().click();
    await page.waitForTimeout(700);
  }

  const numeric = area.locator('input[type=number]:not([readonly])').first();
  const select = area.locator('select').first();
  const text = area.locator('input:not([type=checkbox]):not([type=radio]):not([readonly])').first();

  let written = '';
  if ((await numeric.count()) > 0) {
    // The fix added a precision guard (Δ-10b): a value finer than the test reports to is refused
    // and Save never appears. Coerce to the field's own step.
    const step = (await numeric.getAttribute('step')) ?? '';
    const decimals = step.includes('.') ? (step.split('.')[1] ?? '').length : 0;
    written = Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : value;
    await numeric.fill(written);
    await numeric.press('Tab');
  } else if ((await select.count()) > 0) {
    for (const option of await select.locator('option').all()) {
      const v = await option.getAttribute('value');
      if (v && v !== '0') { written = v; break; }
    }
    if (!written) return null;
    await select.selectOption(written);
  } else if ((await text.count()) > 0) {
    written = value;
    await text.fill(written);
    await text.press('Tab');
  } else {
    return null; // no editable control on this row
  }

  await page.waitForTimeout(1200);

  const save = area.getByRole('button', { name: /^save$/i }).first();
  if ((await save.count()) === 0) return null;

  await save.click();
  await page.waitForTimeout(2000);
  return written;
}

test.describe('OGC-1020 R1 — spec deltas [flip-when-fixed]', () => {
  test('Δ-1: a failed worklist load surfaces an error, not a silent empty table', async ({ page }) => {
    await requireUnifiedRoute(page);

    // Rewritten 2026-08-18. The original guard required a NATURALLY failing unit (Biochemistry's
    // 500, Δ-2). That is fixed, so the guard skipped on every run and read as coverage it was not
    // providing. The client behaviour under a failed fetch is the thing under test and does not
    // need a broken server to exercise — so force the failure at the route layer.
    await page.route('**/rest/LogbookResults**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, error: 'Internal Server Error' }),
      }),
    );

    try {
      await loadLabUnit(page, UNIT_HEMATOLOGY);
      await page.waitForTimeout(2500);

      const rowCount = await page.locator('table tbody tr').count();
      expect(rowCount, 'the forced failure renders no rows').toBe(0);

      const alerts = await page.locator('[role=alert]').count();
      const notifications = await page
        .locator('.cds--inline-notification, .cds--toast-notification, .cds--actionable-notification')
        .count();

      expect(
        alerts + notifications,
        'Δ-1 REGRESSION: a failed worklist load renders no error surface at all — visually identical to ' +
          '"no pending work". An error surface was confirmed present on 2026-08-17: a Carbon ' +
          'actionable-notification reading "The results worklist could not be loaded / This is not an ' +
          'empty worklist" with a working "Try again" action.',
      ).toBeGreaterThan(0);

      const bodyText = (await page.locator('body').innerText()).toLowerCase();
      expect(
        /\b(error|failed|unable|could not|not an empty worklist|something went wrong)\b/.test(bodyText),
        'Δ-1 REGRESSION: no error copy appears anywhere on a failed worklist load.',
      ).toBe(true);
    } finally {
      await page.unroute('**/rest/LogbookResults**');
    }
  });

  test('Δ-3: status chip and filter counts refresh after an in-page save', async ({ page }) => {
    await requireUnifiedRoute(page);
    await loadLabUnit(page, UNIT_MOLBIO);

    const before = await logbook(page, UNIT_MOLBIO);
    const candidates = before.filter((r) => !r.resultValue && r.analysisStatusId === '4');
    test.skip(
      candidates.length === 0,
      `No un-resulted analysis left in Molecular Biology (unit ${UNIT_MOLBIO}) — seed one, or point at another unit.`,
    );

    const chipsBefore = await page.getByText(/^Not started \(\d+\)$/).first().innerText();

    // Pick by VERIFIED INTERACTABILITY, not by the logbook's status flags. A row can report
    // "Not started" with no result and still expose no editable control — numeric fields are
    // read-only until Edit is clicked, and some rows offer no Edit at all. Trusting the flags is
    // what made this guard burn a 180s timeout on every run before 2026-08-18.
    let target: LogbookRow | null = null;
    let written: string | null = null;
    const tried: string[] = [];
    for (const candidate of candidates.slice(0, 6)) {
      written = await typeResultAndSave(page, candidate.accessionNumber, '5.05');
      if (written !== null) {
        target = candidate;
        break;
      }
      tried.push(candidate.accessionNumber);
    }
    test.skip(
      target === null,
      `No un-resulted Molecular Biology row exposed an editable control and a Save. Tried: ${tried.join(', ')}.`,
    );
    const t = target as LogbookRow;

    // The write itself must have landed — if this fails the problem is FR-O1/PERSIST, not Δ-3.
    const after = await logbook(page, UNIT_MOLBIO);
    const saved = after.find((r) => r.analysisId === t.analysisId);
    expect(saved?.resultValue, 'the save persisted').toBeTruthy();
    expect(saved?.analysisStatusId, 'the analysis advanced to Ready-For-Validation').toBe('15');

    // FIXED 2026-08-17 (OGC-1179 item 4): chip + counts now update with NO reload.
    const rowText = await rowForAccession(page, t.accessionNumber).first().innerText();
    expect(
      /accepted by technician/i.test(rowText),
      'Δ-3 REGRESSION: the row Status chip no longer updates after an in-page save — it still reads ' +
        '"Not started". Confirmed working 2026-08-17 (Not started 16→15, Accepted by technician 4→5).',
    ).toBe(true);

    const chipsAfter = await page.getByText(/^Not started \(\d+\)$/).first().innerText();
    expect(
      chipsAfter,
      'Δ-3 REGRESSION: the "Not started" filter count no longer decrements on save. Confirmed working 2026-08-17.',
    ).not.toBe(chipsBefore);
  });

  test('Δ-4: the stale-save rejection offers no refresh action', async ({ page, browser }) => {
    await requireUnifiedRoute(page);
    await loadLabUnit(page, UNIT_HEMATOLOGY);

    const rows = await logbook(page, UNIT_HEMATOLOGY);
    const saved = rows.find((r) => !!r.resultValue);
    test.skip(!saved, 'No already-saved analysis in Hematology to contend over.');
    const target = saved as LogbookRow;

    // Session A: open the row in Edit, capturing its (soon to be stale) version token.
    const rowA = rowForAccession(page, target.accessionNumber).first();
    await rowA.getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(1200);

    // Session B: a genuinely independent context saves the same analysis first.
    let ctxB: BrowserContext | undefined;
    try {
      ctxB = await browser.newContext({ storageState: '.auth/user.json', baseURL: BASE });
      const pageB = await ctxB.newPage();
      await loadLabUnit(pageB, UNIT_HEMATOLOGY);
      const rowB = rowForAccession(pageB, target.accessionNumber).first();
      await rowB.getByRole('button', { name: /^edit$/i }).click();
      await pageB.waitForTimeout(1000);
      const bumped = (parseFloat(target.resultValue) + 0.01).toFixed(2);
      await rowB.locator('input').first().fill(bumped);
      await pageB.waitForTimeout(400);
      await rowB.getByRole('button', { name: /^save$/i }).click();
      await pageB.waitForTimeout(1800);
    } finally {
      await ctxB?.close();
    }

    // Session A saves over it — the stale editor must lose (FR-O2, which PASSES).
    await rowA.locator('input').first().fill('9.99');
    await page.waitForTimeout(400);
    await rowA.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(2000);

    const notice = page
      .locator('.cds--inline-notification, .cds--actionable-notification')
      .filter({ hasText: /updated by .* at .*refresh/i })
      .first();
    await expect(notice, 'FR-O2 still rejects the stale save with a who/when message').toBeVisible({
      timeout: 10000,
    });

    const actionable = await notice.locator('button, a').count();
    expect(
      actionable,
      'Δ-4 REGRESSION: the stale-save notice has lost its actionable control. FR-O2 requires a refresh action; ' +
        'it was confirmed present on 2026-08-18 (2 controls: Refresh, close notification).',
    ).toBeGreaterThan(0);
  });

  test('Δ-5: no Lab Unit can be anything but CLINICAL — the domain has no admin write path', async ({ page }) => {
    await requireUnifiedRoute(page);

    const units = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/results-entry/lab-units', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      return (await r.json()) as Array<{ id: string; value: string; domain: string }>;
    });

    expect(units.length, 'the lab-units endpoint answers (FR-M1 wiring is correct)').toBeGreaterThan(0);

    const domains = [...new Set(units.map((u) => u.domain))];
    expect(
      domains,
      'Δ-5 fixed (or the DB was seeded by hand)? A non-CLINICAL Lab Unit now exists, so FR-M2 / FR-M3 / FR-M4 ' +
        'became gradeable — remove this guard and write the real cross-domain assertions (Site context + ' +
        'regulatory limit for ENVIRONMENTAL; Trap context + abnormal-only review for VECTOR; .env/.vector i18n).',
    ).toEqual(['CLINICAL']);
  });
});
