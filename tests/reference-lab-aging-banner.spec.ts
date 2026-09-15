/**
 * OGC-801 — aging banner for stuck referrals.
 *
 * WHAT THE PRODUCT DOES (read off the component, 2026-09-15, develop @ 5fe0ecb):
 *
 *   stuckThreshold = metrics.referralStuckThresholdDays ?? 7
 *   stuckCount     = referrals.filter(r => (r.daysOutstanding ?? 0) > stuckThreshold).length
 *   banner renders iff activeView === "outstanding" && stuckCount > 0
 *
 * It is a Carbon `InlineNotification kind="warning"` titled "Stuck referrals detected",
 * subtitled "{count} referral(s) have been at a reference lab for more than {threshold}
 * day(s).", beside a ghost button "Filter to stuck only" that sets the Days-outstanding
 * filter to `stuck`.
 *
 * NOTE THE STRICT `>`. A referral at exactly the threshold is NOT stuck. That is the
 * kind of boundary a test should pin, and RLR-801-04 does.
 *
 * WHAT THIS NEEDS FROM THE SEED
 * At least two referrals whose `daysOutstanding` exceeds the threshold.
 * `helpers/referral-seed.ts` creates STUCK_A and STUCK_B at 12 days for exactly this.
 * TWO, not one, on purpose: with a single stuck row "the banner counted the stuck rows"
 * and "the banner printed 1" are indistinguishable, and a component that hard-coded 1
 * would pass. The count is cross-checked against the API rather than against the
 * constant 2, so the case stays honest if the seed changes.
 *
 * WHY THERE IS NO test.fail() IN THIS FILE
 * The feature is implemented and observed working. These are permanent-truth regression
 * guards, the same posture as tests/ogc1134-test-catalog-search-debounce.spec.ts. If the
 * banner regresses these go red, which is the point.
 *
 * WHAT MAKES A CASE HERE FAIL RATHER THAN VACUOUSLY PASS
 * Every case asserts the seeded precondition FIRST and throws if it is absent. An
 * instance with no stuck referral must not quietly report "no banner, correct" — the
 * absence of a banner is the expected state there, so the case would pass without ever
 * exercising the feature. RLR-801-03 is the deliberate exception: it asserts the banner
 * is ABSENT on a view where it must never appear, and that is only meaningful because
 * RLR-801-01 has already proved it appears on the view where it must.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const ROUTE = '/SampleShipment/reference-lab-results';
const REST = '/api/OpenELIS-Global/rest';

const BANNER_TITLE = 'Stuck referrals detected';

interface Row {
  id: string;
  daysOutstanding?: number;
  requestor?: string;
  labNumber?: string;
}

async function openOutstanding(page: Page): Promise<void> {
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Reference Lab Results', level: 1 }),
    `the Reference Lab Results H1 never rendered at ${ROUTE}; the SPA catch-all serves ` +
      `200 text/html for unrouted paths, so this is a missing route or a throwing component`
  ).toBeVisible({ timeout: 20_000 });
}

async function readJson<T>(page: Page, path: string): Promise<T> {
  const res = await page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { Accept: 'application/json' } });
    return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() };
  }, path);
  expect(res.ct, `GET ${path} answered ${res.status} ${res.ct}; text/html is the SPA catch-all`).toContain(
    'application/json'
  );
  return JSON.parse(res.body) as T;
}

/**
 * The stuck set, computed the way the component computes it, from the same two API
 * reads the component makes. Throws when the instance carries no stuck referral,
 * because every case in this file would otherwise pass by having nothing to look at.
 */
async function stuckSet(page: Page): Promise<{ threshold: number; count: number; rows: Row[] }> {
  const metrics = await readJson<{ referralStuckThresholdDays: number }>(
    page,
    `${REST}/reference-lab-results/metrics`
  );
  const rows = await readJson<Row[]>(page, `${REST}/reference-lab-results/referrals?view=outstanding`);
  const threshold = metrics.referralStuckThresholdDays ?? 7;
  const stuck = rows.filter((r) => (r.daysOutstanding ?? 0) > threshold);
  expect(
    stuck.length,
    `this instance has no outstanding referral older than ${threshold} days, so the aging ` +
      `banner has no subject and nothing here would be exercised. Run the referral seed ` +
      `(helpers/referral-seed.ts / referral-seed.setup.ts), which creates STUCK_A and ` +
      `STUCK_B at 12 days. Outstanding rows seen: ${JSON.stringify(rows.map((r) => [r.labNumber, r.daysOutstanding]))}`
  ).toBeGreaterThan(0);
  return { threshold, count: stuck.length, rows: stuck };
}

test.describe('OGC-801 — aging banner for stuck referrals', () => {
  test('RLR-801-01: the banner appears on Outstanding when a referral is past the threshold', async ({ page }) => {
    await openOutstanding(page);
    const { threshold, count } = await stuckSet(page);

    const banner = page.locator('.reference-lab-results__aging-banner');
    await expect(
      banner,
      `${count} outstanding referral(s) exceed the ${threshold}-day threshold but no aging banner rendered`
    ).toBeVisible();
    await expect(banner.getByText(BANNER_TITLE)).toBeVisible();
  });

  test('RLR-801-02: the banner states the stuck count and the threshold it used', async ({ page }) => {
    await openOutstanding(page);
    const { threshold, count } = await stuckSet(page);

    const banner = page.locator('.reference-lab-results__aging-banner');
    await expect(banner).toBeVisible();
    const text = (await banner.innerText()).replace(/\s+/g, ' ');

    // Both numbers, and the subtitle's shape. Asserting the rendered sentence rather
    // than just "contains the digit" keeps a page that happens to show `2` somewhere
    // else from satisfying this.
    expect(
      text,
      `banner text was "${text}"; expected the count ${count} and threshold ${threshold} from the API`
    ).toMatch(new RegExp(`${count}\\s+referral\\(s\\) have been at a reference lab for more than\\s+${threshold}\\s+day`));
  });

  test('RLR-801-03: the banner is not shown on Returned or History', async ({ page }) => {
    await openOutstanding(page);
    // Precondition: it IS shown here. Without this, the two "hidden" assertions below
    // would pass on a build where the banner never renders anywhere.
    await stuckSet(page);
    const banner = page.locator('.reference-lab-results__aging-banner');
    await expect(banner).toBeVisible();

    const chips = page.getByRole('radiogroup', { name: 'Reference lab results view' });
    for (const view of ['Returned — needs action', 'History']) {
      await chips.getByRole('radio').filter({ hasText: view }).click();
      await expect(banner, `the aging banner is still rendered on the "${view}" view`).toBeHidden();
    }
    await chips.getByRole('radio').filter({ hasText: 'Outstanding' }).click();
    await expect(banner, 'the aging banner did not come back on Outstanding').toBeVisible();
  });

  test('RLR-801-04: "Filter to stuck only" narrows the table to exactly the stuck referrals', async ({ page }) => {
    await openOutstanding(page);
    const { threshold, count, rows } = await stuckSet(page);
    const allOutstanding = await readJson<Row[]>(page, `${REST}/reference-lab-results/referrals?view=outstanding`);

    // If every outstanding referral is stuck, the filter cannot be observed to narrow
    // anything and a green result would mean nothing. Say so rather than pass.
    expect(
      allOutstanding.length,
      `every outstanding referral on this instance is stuck (${count} of ${allOutstanding.length}), so ` +
        `"Filter to stuck only" cannot be observed to change the table. The seed creates a FRESH ` +
        `referral at 2 days for this; re-run it.`
    ).toBeGreaterThan(count);

    await page.getByRole('button', { name: 'Filter to stuck only' }).click();

    // The Days-outstanding select is the visible consequence of the button.
    await expect(
      page.locator('#days-bucket-filter'),
      'clicking "Filter to stuck only" did not move the Days outstanding filter to the stuck bucket'
    ).toHaveValue('stuck');

    // And the table must hold the stuck lab numbers and none of the non-stuck ones.
    // This is the assertion that would catch a filter that sets the dropdown and then
    // filters on the wrong predicate — `>=` instead of `>`, say, which at the boundary
    // is exactly the bug this story is about.
    const notStuck = allOutstanding.filter((r) => (r.daysOutstanding ?? 0) <= threshold);
    const body = page.locator('table').first();
    for (const r of rows) {
      await expect(
        body.getByText(String(r.labNumber), { exact: false }).first(),
        `stuck referral ${r.labNumber} (${r.daysOutstanding} days) is missing from the filtered table`
      ).toBeVisible();
    }
    for (const r of notStuck) {
      await expect(
        body.getByText(String(r.labNumber), { exact: false }),
        `referral ${r.labNumber} is only ${r.daysOutstanding} days old (threshold ${threshold}) ` +
          `and must not survive the stuck filter`
      ).toHaveCount(0);
    }
  });
});
