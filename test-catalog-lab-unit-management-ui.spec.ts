/**
 * OpenELIS Global — Lab Unit Management: page-interaction pass (OGC-189, PR #4121).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `test-catalog-lab-unit-management.spec.ts` is the API-contract tier for this feature and
 * closes with an explicit gap note:
 *
 *   "UI-level behaviors claimed by the PR body but NOT exercised by this API-contract-tier
 *    spec (would need real page interaction, not just fetch/round-trip — gap-queued for a
 *    follow-up page-interaction pass): ... the Assign/Reassign dialog flows, Display Order
 *    drag/move, and the Deactivate-in-use warning."
 *
 * This is that follow-up pass. It drives the screen the way an admin does — real clicks, real
 * keystrokes, real Carbon composites — and asserts what the page actually renders. It
 * deliberately does NOT re-assert the REST contract; that is the other file's job.
 *
 * SEEDING POLICY (Casey, 2026-09-01: "make sure to seed a known good in the future")
 * ---------------------------------------------------------------------------------
 * The API-tier spec mints a per-run fixture on every execution (QAprobe######, QAdup######,
 * QAempty######, QAforce######). Thirty-three lab units on `testing` are the result, most of
 * them harness litter. This spec mints NOTHING per run. It reads the stable seeded units that
 * ship with the instance (Biochemistry, Hematology) and, where it needs a disposable unit,
 * reuses a single fixed-name fixture (`QA_AUTO_LU_FIXTURE`) that is created once and then
 * found again on every subsequent run. Run it a hundred times; the unit count does not move.
 *
 * LIVE PROBE PROVENANCE
 * ---------------------
 * Every selector and every expected string below was read off the running page on
 * 2026-09-01 against testing.openelis-global.org (v3.2.2.0) via Claude in Chrome, not
 * inferred from the source. Where a number is asserted it is asserted as a relationship
 * (counters reconcile with the row total) rather than as a hard-coded count, so ordinary
 * data growth on the instance does not turn this suite red.
 *
 * A NOTE ON ONE NON-DEFECT
 * ------------------------
 * The Reassign destination list includes INACTIVE lab units. That was raised with Casey on
 * 2026-09-01 and ruled intentional — "I'm fine with the moving to a switched off lab, maybe
 * they want to do that for some reason." LU-UI-8b therefore asserts that inactive units ARE
 * offered, so that a future change which silently starts filtering them out shows up here as
 * a deliberate product decision to re-confirm rather than as a silent regression.
 *
 * Run:
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts --project=test-catalog \
 *     test-catalog-lab-unit-management-ui.spec.ts
 */

import { test, expect, Page, Locator } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const LIST_ROUTE = '/MasterListsPage/LabUnitManagement';

/** Stable fixture name — created once, reused forever. Under the server's 20-char cap. */
const FIXTURE_NAME = 'QA_AUTO_LU_FIX';

const SEARCH = 'input[placeholder="Search lab units..."]';

/** The list table's documented column order, read off the live page 2026-09-01. */
const LIST_COLUMNS = ['Name', 'Domain', 'Status', 'Tests', 'Actions'];

type LabUnitRow = { name: string; domain: string; status: string; tests: string };

async function gotoList(page: Page): Promise<void> {
  await page.goto(`${BASE}${LIST_ROUTE}`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Lab Unit Management' })).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
}

/** Reads the rendered rows. Kept DOM-level because Carbon renders the sub-label inside the name cell. */
async function readRows(page: Page): Promise<LabUnitRow[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => (td as HTMLElement).innerText.trim());
      return {
        // the Name cell carries "Name\nDescription"; the unit's name is the first line
        name: (cells[0] || '').split('\n')[0].trim(),
        domain: (cells[1] || '').trim(),
        status: (cells[2] || '').trim(),
        tests: (cells[3] || '').trim(),
      };
    }),
  );
}

/** "1-20 of 33 items" -> 33. The paginator is the page's own claim about the filtered total. */
async function paginatorTotal(page: Page): Promise<number> {
  const text = await page.locator('.cds--pagination').first().innerText();
  const m = text.match(/of\s+(\d+)\s+items/);
  expect(m, `paginator reports an "of N items" total (saw: ${text.replace(/\n/g, ' / ')})`).toBeTruthy();
  return Number(m![1]);
}

/** The domain chips in the page header, e.g. {Clinical: 32, Environmental: 1, Vector: 0}. */
async function domainCounters(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const domain of ['Clinical', 'Environmental', 'Vector']) {
      // the chip renders as "<count> <domain>"; find the element whose text ends with the label
      const el = [...document.querySelectorAll('div,span')].find((n) => {
        const t = (n as HTMLElement).innerText?.trim() || '';
        return new RegExp(`^\\d+\\s+${domain}$`).test(t);
      });
      if (el) out[domain] = Number((el as HTMLElement).innerText.trim().split(/\s+/)[0]);
    }
    return out;
  });
}

/** The two native filter selects, identified by the options they carry rather than by index. */
async function filters(page: Page): Promise<{ domain: Locator; status: Locator }> {
  const selects = page.locator('select');
  const n = await selects.count();
  let domain: Locator | null = null;
  let status: Locator | null = null;
  for (let i = 0; i < n; i++) {
    const values = await selects.nth(i).locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value),
    );
    if (values.includes('ENVIRONMENTAL')) domain = selects.nth(i);
    if (values.includes('inactive')) status = selects.nth(i);
  }
  expect(domain, 'the domain filter select is present').toBeTruthy();
  expect(status, 'the status filter select is present').toBeTruthy();
  return { domain: domain!, status: status! };
}

/**
 * Finds the stable fixture, creating it only if this instance has never seen it.
 * Returns its id. Deliberately the ONLY write this spec performs.
 */
async function ensureFixture(page: Page): Promise<number> {
  return page.evaluate(async (name) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const base = '/api/OpenELIS-Global/rest/lab-units-management';
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    };
    const list = await (await fetch(base, { headers, credentials: 'include' })).json();
    const existing = ((list?.data as any[]) || []).find((u) => u.name === name);
    if (existing) return existing.id;
    const created = await (
      await fetch(base, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          names: { en: name, fr: name },
          domain: 'CLINICAL',
          description: 'stable QA fixture - do not delete',
          isActive: true,
        }),
      })
    ).json();
    return created?.data?.id;
  }, FIXTURE_NAME);
}

test.describe('Lab Unit Management — page interaction (OGC-189, PR #4121)', () => {
  test('LU-UI-1: the list renders the documented columns and the domain counters reconcile with the total', async ({ page }) => {
    await gotoList(page);

    const headers = await page
      .locator('table thead th')
      .evaluateAll((ths) => ths.map((th) => (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    expect(headers, 'list column order matches the shipped contract').toEqual(LIST_COLUMNS);

    const total = await paginatorTotal(page);
    const counters = await domainCounters(page);
    expect(Object.keys(counters).sort(), 'all three domain chips render').toEqual([
      'Clinical',
      'Environmental',
      'Vector',
    ]);

    const summed = counters.Clinical + counters.Environmental + counters.Vector;
    expect(
      summed,
      `domain chips (${JSON.stringify(counters)}) must account for every one of the ${total} lab units — ` +
        `a mismatch means a unit carries a domain the header does not know about`,
    ).toBe(total);
  });

  test('LU-UI-2: typing in the search box narrows the list to matching names', async ({ page }) => {
    await gotoList(page);
    const before = await paginatorTotal(page);

    await page.locator(SEARCH).fill('hema');
    await expect
      .poll(async () => (await readRows(page)).length, {
        message: 'the row count settles after the search debounce',
        timeout: 10000,
      })
      .toBeLessThan(before);

    const rows = await readRows(page);
    expect(rows.length, 'the seeded Hematology units match "hema"').toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.name.toLowerCase(), `every returned row matches the search term (got "${r.name}")`).toContain('hema');
    }
  });

  test('LU-UI-3: the domain filter returns only units of the selected domain, and its count matches the header chip', async ({ page }) => {
    await gotoList(page);
    const counters = await domainCounters(page);
    const { domain } = await filters(page);

    for (const [label, value] of [
      ['Clinical', 'CLINICAL'],
      ['Environmental', 'ENVIRONMENTAL'],
    ] as const) {
      await domain.selectOption(value);
      await expect
        .poll(async () => paginatorTotal(page), {
          message: `the ${label} filter total settles`,
          timeout: 10000,
        })
        .toBe(counters[label]);

      for (const r of await readRows(page)) {
        expect(r.domain, `every row under the ${label} filter is ${label}`).toBe(label);
      }
    }
  });

  test('LU-UI-4: the status filter returns only units of the selected status', async ({ page }) => {
    await gotoList(page);
    const all = await paginatorTotal(page);
    const { status } = await filters(page);

    await status.selectOption('inactive');
    await expect
      .poll(async () => paginatorTotal(page), { timeout: 10000 })
      .toBeLessThanOrEqual(all);
    const inactiveTotal = await paginatorTotal(page);
    for (const r of await readRows(page)) {
      expect(r.status, 'every row under the Inactive filter is Inactive').toBe('Inactive');
    }

    await status.selectOption('active');
    await expect.poll(async () => paginatorTotal(page), { timeout: 10000 }).toBe(all - inactiveTotal);
    for (const r of await readRows(page)) {
      expect(r.status, 'every row under the Active filter is Active').toBe('Active');
    }
  });

  test('LU-UI-5: Edit opens the unit editor with that unit loaded and its three sub-sections available', async ({ page }) => {
    await gotoList(page);
    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);

    const row = page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first();
    await row.getByRole('button', { name: 'Edit' }).click();

    await expect(page, 'Edit routes to the per-unit Basic Info section').toHaveURL(
      new RegExp(`${LIST_ROUTE}/\\d+/basic-info$`),
    );
    await expect(page.getByText(/^Editing:\s*Hematology/)).toBeVisible();

    // Basic Info must arrive populated — an editor that opens blank is the Modify Order
    // failure mode (see modify-order-field-binding.spec.ts) and must not appear here.
    const nameInput = page.locator('input').first();
    await expect(nameInput, 'the unit name is loaded into the editable field, not just the heading').toHaveValue(
      'Hematology',
    );

    for (const section of ['Basic Info', 'Assigned Tests', 'Display Order']) {
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
    }
  });

  test('LU-UI-6: Assigned Tests — select-all drives the Reassign counter, and Reassign is disabled at zero selected', async ({ page }) => {
    await gotoList(page);
    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first()
      .getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Assigned Tests', { exact: true }).first().click();

    const reassign = page.getByRole('button', { name: /^Reassign selected/ });
    await expect(reassign, 'with nothing selected the reassign action is unavailable').toBeDisabled();
    await expect(reassign).toHaveText(/\(0\)/);

    const assignedText = await page.getByText(/\d+ tests assigned/).first().innerText();
    const assignedCount = Number(assignedText.match(/(\d+)/)![1]);
    expect(assignedCount, 'Hematology has assigned tests to work with').toBeGreaterThan(0);

    await page.locator('table thead input[type="checkbox"]').first().check();
    await expect(
      reassign,
      'select-all selects every assigned test, and the counter says so',
    ).toHaveText(new RegExp(`\\(${assignedCount}\\)`));
    await expect(reassign, 'with a selection the reassign action becomes available').toBeEnabled();
  });

  test('LU-UI-7: the Reassign dialog requires a destination before it will commit', async ({ page }) => {
    await gotoList(page);
    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first()
      .getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Assigned Tests', { exact: true }).first().click();

    await page.locator('table thead input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Reassign selected/ }).click();

    await expect(page.getByText('Reassign Tests')).toBeVisible();
    const commit = page.getByRole('button', { name: /^Reassign \d+ tests?$/ });
    await expect(
      commit,
      'the commit button stays disabled until a destination is chosen — a bulk move must not be one stray click away',
    ).toBeDisabled();

    // Leave without moving anything: this spec never mutates real assignments.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Reassign Tests')).toBeHidden();
  });

  test('LU-UI-8: the Reassign destination list excludes the unit being edited', async ({ page }) => {
    await gotoList(page);
    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first()
      .getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Assigned Tests', { exact: true }).first().click();
    await page.locator('table thead input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Reassign selected/ }).click();

    const options = await page
      .locator('select')
      .last()
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).text.trim()));

    expect(options[0], 'the dialog opens on an unset placeholder, not a pre-selected destination').toMatch(
      /Select destination/i,
    );
    expect(
      options,
      'a unit cannot be reassigned to itself — Hematology must not appear in its own destination list',
    ).not.toContain('Hematology');
    expect(options.length, 'the other lab units are offered as destinations').toBeGreaterThan(1);

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('LU-UI-8b: inactive lab units ARE offered as reassignment destinations (CONTRACT FACT — product-confirmed, not a defect)', async ({ page }) => {
    // Raised with Casey 2026-09-01 as a possible defect ("you can move tests into a switched-off
    // unit"); ruled intentional — "I'm fine with the moving to a switched off lab, maybe they want
    // to do that for some reason." Asserted here so that if a future change starts filtering
    // inactive units out, this test fails and the decision gets re-confirmed on purpose rather
    // than changing quietly.
    await gotoList(page);
    const { status } = await filters(page);
    await status.selectOption('inactive');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    const inactiveNames = (await readRows(page)).map((r) => r.name);

    await gotoList(page);
    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first()
      .getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Assigned Tests', { exact: true }).first().click();
    await page.locator('table thead input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Reassign selected/ }).click();

    const options = await page
      .locator('select')
      .last()
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).text.trim()));

    const offeredInactive = inactiveNames.filter((n) => options.includes(n));
    expect(
      offeredInactive.length,
      `inactive units remain valid destinations by product decision (none of ${inactiveNames.length} inactive ` +
        `units were offered — if this is now deliberate, update this test and tell Casey)`,
    ).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('LU-UI-9: Display Order bounds the position input to the real unit count and clamps an over-range entry', async ({ page }) => {
    await gotoList(page);
    const total = await paginatorTotal(page);

    await page.locator(SEARCH).fill('Hematology');
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBeGreaterThan(0);
    await page.locator('table tbody tr').filter({ hasText: 'Hematology' }).first()
      .getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Display Order', { exact: true }).first().click();

    const position = page.locator('#lu-display-order-position');
    await expect(position).toBeVisible();
    await expect(position, 'positions are 1-based, not 0-based').toHaveAttribute('min', '1');
    await expect(
      position,
      'the upper bound tracks the real number of lab units rather than a hard-coded ceiling',
    ).toHaveAttribute('max', String(total));

    const original = await position.inputValue();

    // Over-range input must be clamped as it is typed, not accepted and rejected on save.
    await position.fill(String(total + 500));
    await expect(
      position,
      'an out-of-range position is clamped to the last slot instead of being accepted',
    ).toHaveValue(String(total));

    // The ordering table marks which row is the unit being edited.
    await expect(page.locator('table tbody tr').filter({ hasText: 'Current' }).first()).toBeVisible();

    // Restore the field and leave without saving — this spec does not reorder the live menus.
    await position.fill(original);
  });

  test('LU-UI-10: the stable QA fixture is reachable through the UI and reports zero assigned tests', async ({ page }) => {
    // The only write in this file, and it is idempotent: created on the first ever run against
    // an instance, found by name on every run after that.
    await gotoList(page);
    const id = await ensureFixture(page);
    expect(id, 'the stable fixture exists (found or created once)').toBeTruthy();

    await gotoList(page);
    await page.locator(SEARCH).fill(FIXTURE_NAME);
    await expect.poll(async () => (await readRows(page)).length, { timeout: 10000 }).toBe(1);

    const [row] = await readRows(page);
    expect(row.name, 'the fixture is found by its stable name, not a per-run one').toBe(FIXTURE_NAME);
    expect(row.tests, 'the fixture carries no assigned tests, so it is safe to reassign into').toBe('0');

    await page.goto(`${BASE}${LIST_ROUTE}/${id}/assigned-tests`);
    await expect(page.getByText(/0 tests assigned/)).toBeVisible();
  });
});
