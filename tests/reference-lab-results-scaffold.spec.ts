/**
 * OGC-798 — Reference Lab Results: page scaffold.
 *
 * WHAT THIS COVERS
 * The route, the four metric tiles, the three views, and the filter set. It is the
 * cheapest and most foundational of the 18 Reference Lab Results stories: every other
 * story in the epic renders inside this shell, so a break here makes all of them
 * untestable and none of them would say why.
 *
 * WHY IT DID NOT EXIST BEFORE
 * Not because the page is new — it has been In Review since 2026-07-06 — but because
 * every tile read 0 and every view was empty on any instance anyone had. A scaffold
 * test against an empty page can assert the chrome but cannot tell "the tile rendered
 * the number the API returned" from "the tile rendered its hard-coded initial state",
 * which on this page is literally `{outstanding: 0, returned: 0, reconciledToday: 0,
 * rejectedThisWeek: 0, referralStuckThresholdDays: 7}` (ReferenceLabResults.jsx:107).
 * `helpers/referral-seed.ts` is what changed that; read its header for how referral
 * fixtures are created and which states are reachable.
 *
 * THE GUARD, AND WHY EVERY CASE OPENS WITH IT
 * `/SampleShipment/reference-lab-results` is served by a React SPA whose catch-all
 * answers **HTTP 200 with text/html for any path it does not route**. A 404, a renamed
 * route and a crashed component all look like a 200 to `page.goto`, and every
 * "is the text there" assertion then fails for a reason that has nothing to do with the
 * thing under test. So each case first asserts the page's own H1 is on screen.
 * `mustBeOnPage` throws; it does not skip. A skip here would mean the whole file passes
 * on a build where the route is gone, which is the single most important thing it is
 * supposed to catch.
 *
 * TILE NUMBERS ARE CROSS-CHECKED AGAINST THE API, NOT AGAINST CONSTANTS.
 * Hard-coding "outstanding = 2" would break every time the seed or the instance moved,
 * and would be asserting the fixture rather than the product. Each tile is compared to
 * the live `GET /rest/reference-lab-results/metrics` response, so the case is a real
 * oracle on the page's rendering while staying true on any seeded instance. The API
 * read is itself content-type-checked for the same catch-all reason.
 *
 * NOTE THE REST BASE. It is `/api/OpenELIS-Global/rest/...`, NOT `/rest/...`.
 * `/rest/reference-lab-results/metrics` at the page origin returns the SPA shell with
 * HTTP 200 and `text/html`; only the `/api/OpenELIS-Global` prefix reaches Spring. A
 * probe that checks `res.ok()` and not the content type will report this page's
 * endpoints as working when it has never spoken to the backend at all.
 *
 * Measured 2026-09-15 against itechuw/openelis-global-2:develop at https://localhost:10443.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const ROUTE = '/SampleShipment/reference-lab-results';
const REST = '/api/OpenELIS-Global/rest';

/** The four tile labels, en.json `referral.metric.*`, verbatim including the em dash. */
const TILES = ['Outstanding', 'Returned — needs action', 'Reconciled today', 'Rejected this week'] as const;

/** The three views, en.json `referral.chip.*`. The chips carry a live count in parentheses. */
const VIEWS = ['Outstanding', 'Returned — needs action', 'History'] as const;

interface Metrics {
  outstanding: number;
  returned: number;
  reconciledToday: number;
  rejectedThisWeek: number;
  referralStuckThresholdDays: number;
}

/**
 * Open the page and prove it actually rendered. Throws on failure — see the header.
 */
async function openReferenceLabResults(page: Page): Promise<void> {
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  const title = page.getByRole('heading', { name: 'Reference Lab Results', level: 1 });
  await expect(
    title,
    `the Reference Lab Results H1 never rendered at ${ROUTE}. The SPA catch-all returns ` +
      `200 text/html for unrouted paths, so a green goto here proves nothing; this is the ` +
      `route being gone, renamed, or the component throwing.`
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Read the metrics the page itself reads. Content-type checked: the SPA answers 200
 * text/html for anything it does not route, so a status check alone cannot tell an API
 * response from an HTML page.
 */
async function readMetrics(page: Page): Promise<Metrics> {
  const res = await page.evaluate(async (rest) => {
    const r = await fetch(`${rest}/reference-lab-results/metrics`, { headers: { Accept: 'application/json' } });
    return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() };
  }, REST);
  expect(
    res.ct,
    `GET ${REST}/reference-lab-results/metrics answered ${res.status} ${res.ct}. ` +
      `text/html means the SPA catch-all served it and the endpoint is not there.`
  ).toContain('application/json');
  return JSON.parse(res.body) as Metrics;
}

test.describe('OGC-798 — Reference Lab Results scaffold', () => {
  test('RLR-798-01: the route renders the Reference Lab Results page under Sample Shipment', async ({ page }) => {
    await openReferenceLabResults(page);
    // The breadcrumb is what proves this is the Sample Shipment module's page and not
    // some other screen that happens to carry the same heading.
    await expect(page.getByText('Sample Shipment').first()).toBeVisible();
    expect(page.url()).toContain(ROUTE);
  });

  test('RLR-798-02: all four metric tiles render, each showing the count the API returned', async ({ page }) => {
    await openReferenceLabResults(page);
    const metrics = await readMetrics(page);

    const expected: Record<string, number> = {
      Outstanding: metrics.outstanding,
      'Returned — needs action': metrics.returned,
      'Reconciled today': metrics.reconciledToday,
      'Rejected this week': metrics.rejectedThisWeek,
    };

    for (const label of TILES) {
      // MetricTile is a <button> containing a count div and a label div. Scoping to the
      // button and reading its text keeps the assertion on ONE tile: a bare
      // getByText(String(count)) would match any number anywhere on the page, which on a
      // page of counts is close to guaranteed.
      const tile = page.locator('button.reference-lab-results__metric').filter({ hasText: label });
      await expect(tile, `metric tile "${label}" is missing`).toHaveCount(1);
      const shown = (await tile.locator('.reference-lab-results__metric-count').innerText()).trim();
      expect(
        Number(shown),
        `tile "${label}" shows ${shown}; GET /reference-lab-results/metrics says ${expected[label]}`
      ).toBe(expected[label]);
    }
  });

  test('RLR-798-03: the three views are present and switching one makes it the selected view', async ({ page }) => {
    await openReferenceLabResults(page);

    const group = page.getByRole('radiogroup', { name: 'Reference lab results view' });
    await expect(group, 'the Outstanding / Returned / History chip group is missing').toBeVisible();

    for (const name of VIEWS) {
      await expect(
        group.getByRole('radio').filter({ hasText: name }),
        `view chip "${name}" is missing`
      ).toHaveCount(1);
    }

    // Selection has to MOVE, not merely exist. Assert the before and after state of the
    // same two chips, so a page that hard-codes one chip as checked cannot pass.
    const outstanding = group.getByRole('radio').filter({ hasText: 'Outstanding' });
    const history = group.getByRole('radio').filter({ hasText: 'History' });
    await expect(outstanding).toHaveAttribute('aria-checked', 'true');
    await history.click();
    await expect(history).toHaveAttribute('aria-checked', 'true');
    await expect(outstanding).toHaveAttribute('aria-checked', 'false');
  });

  test('RLR-798-04: the filter set is Reference Lab, Date range, Priority, Days outstanding', async ({ page }) => {
    await openReferenceLabResults(page);

    await expect(page.locator('#ref-lab-filter'), 'Reference Lab filter missing').toBeVisible();
    await expect(page.locator('#date-from'), 'Date range "from" input missing').toBeVisible();
    await expect(page.locator('#date-to'), 'Date range "to" input missing').toBeVisible();
    await expect(page.locator('#priority-filter'), 'Priority filter missing').toBeVisible();

    // Days outstanding is rendered ONLY on the Outstanding view (the component guards it
    // with `activeView === "outstanding"`), which is the default. Asserting it here and
    // asserting its disappearance on History is what makes this a real check of the
    // conditional rather than of the element's existence.
    const days = page.locator('#days-bucket-filter');
    await expect(days, 'Days outstanding filter missing on the Outstanding view').toBeVisible();

    const options = await days.locator('option').allInnerTexts();
    for (const bucket of ['0-7', '7-30', '>30']) {
      expect(options, `Days outstanding is missing the "${bucket}" bucket`).toContain(bucket);
    }
    expect(
      options.some((o) => /^Stuck \(> \d+ days\)$/.test(o.trim())),
      `Days outstanding is missing the "Stuck (> N days)" bucket; options were ${JSON.stringify(options)}`
    ).toBe(true);

    await page
      .getByRole('radiogroup', { name: 'Reference lab results view' })
      .getByRole('radio')
      .filter({ hasText: 'History' })
      .click();
    await expect(
      days,
      'Days outstanding is still rendered on the History view; it is an Outstanding-only filter'
    ).toBeHidden();
  });
});
