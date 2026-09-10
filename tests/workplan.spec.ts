import { test, expect, type Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { seedOrder } from '../helpers/data-factory';

/**
 * tests/workplan.spec.ts — Workplan by Test / Panel / Unit / Priority
 *
 * REWRITTEN 2026-09-10. What this replaced.
 *
 * Every case in this file went through a `goToWorkplan()` helper that tried
 * four GUESSED urls in turn and returned '' if none answered, followed by
 *
 *     if (!url) { console.log('TC-WP-0n: GAP — no workplan URL accessible'); return; }
 *
 * Fourteen of the eighteen cases were structurally incapable of failing
 * (falsifiable-gate flags: self-skip-return, no-expect). The assertions that
 * did exist were no better: TC-WP-01 closed with
 *
 *     const hasFilter = await page.locator('select, input[type="text"]').count() > 0;
 *     expect(hasFilter).toBe(true);
 *
 * which is true of the login page.
 *
 * THE ROUTES ARE NOT A GUESS. They come from `/rest/menu`, the same list the
 * application's own navigation is built from (read 2026-09-10 on the local
 * 3.2.2.0 stack):
 *
 *   banner.menu.workplan.test      -> /WorkPlanByTest?type=test
 *   banner.menu.workplan.panel     -> /WorkPlanByPanel?type=panel
 *   banner.menu.workplan.bench     -> /WorkPlanByTestSection?type=
 *   banner.menu.workplan.priority  -> /WorkPlanByPriority?type=priority
 *
 * Note there is NO bare `/WorkPlan` in the menu, though the old helper listed
 * it first and it answers 200 — the SPA serves its shell for any unmatched
 * path, so a status check on a wrong route passes while rendering nothing. That
 * is the same trap that made a missing gallery mockup look fine (harness 12.30):
 * a 200 is not evidence that a screen exists.
 *
 * Each screen is one Carbon `select#select-1` feeding one endpoint:
 *
 *   By Test      displayList/ALL_TESTS      -> WorkPlanByTest?test_id=
 *   By Panel     displayList/PANELS         -> WorkPlanByPanel?panel_id=
 *   By Priority  displayList/ORDER_PRIORITY -> WorkPlanByPriority?priority=
 *
 * TC-WP-03 and TC-WP-04 need work actually sitting in a queue, so they SEED an
 * order rather than skipping when the instance happens to be empty. That is the
 * rule the gate's failure message states: seed the precondition, don't opt out
 * on it.
 */

/** The four routes the application itself advertises, and what each drives. */
const SCREENS = [
  { key: 'test',     route: '/WorkPlanByTest?type=test',         label: /Select Test Type/i,  list: 'ALL_TESTS',      api: 'WorkPlanByTest',        param: 'test_id',  minOptions: 100 },
  { key: 'panel',    route: '/WorkPlanByPanel?type=panel',       label: /Select Panel/i,      list: 'PANELS',         api: 'WorkPlanByPanel',       param: 'panel_id', minOptions: 2 },
  { key: 'priority', route: '/WorkPlanByPriority?type=priority', label: /Select Priority/i,   list: 'ORDER_PRIORITY', api: 'WorkPlanByPriority',    param: 'priority', minOptions: 2 },
] as const;

const BENCH = { key: 'bench', route: '/WorkPlanByTestSection?type=' } as const;

/** Go to a workplan screen and prove it actually rendered, not the SPA shell. */
async function openWorkplan(page: Page, route: string, label: RegExp): Promise<void> {
  await page.goto(`${BASE}${route}`);
  const select = page.locator('#select-1');
  await expect(select, `${route} must render its selector, not the SPA shell`).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('body'), `${route} must show its own heading`).toContainText(/Workplan/i, { timeout: 15_000 });
  await expect(select, `${route}'s selector must be labelled`).toContainText(label, { timeout: 10_000 });
}

/** Options on the screen's single select, minus the "Select ..." placeholder. */
async function realOptions(page: Page): Promise<{ value: string; text: string }[]> {
  return page.locator('#select-1').evaluate((el) =>
    Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value && !/^select /i.test(o.text))
      .map((o) => ({ value: o.value, text: o.text.trim() })));
}

/** Call a workplan endpoint directly and report what came back. */
async function queryWorkplan(page: Page, api: string, param: string, value: string) {
  return page.evaluate(
    async ([a, p, v]) => {
      const r = await fetch(`/api/OpenELIS-Global/rest/${a}?${p}=${encodeURIComponent(v)}`, {
        headers: { Accept: 'application/json' },
      });
      const text = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { /* not json */ }
      const b = body as { workplanTests?: unknown[]; testResult?: unknown[] } | null;
      const rows = b?.workplanTests ?? b?.testResult ?? null;
      return { status: r.status, rows: Array.isArray(rows) ? rows.length : null, keys: b ? Object.keys(b).slice(0, 8) : null, raw: text.slice(0, 160) };
    },
    [api, param, value] as const,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Workplan and Sample Tracking (TC-WP)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // CANARY. If the app moves or renames these routes, this fails first and the
  // rest of the file's failures are explained rather than mysterious.
  test('TC-WP-01: the application advertises the four workplan routes, and each renders', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const advertised = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/menu', { headers: { Accept: 'application/json' } });
      const j = await r.json().catch(() => null);
      const urls: string[] = [];
      const walk = (n: unknown[]) => {
        for (const it of (n || []) as Record<string, unknown>[]) {
          const m = (it.menu ?? it) as Record<string, unknown>;
          if (typeof m.actionURL === 'string' && /WorkPlan/i.test(m.actionURL)) urls.push(m.actionURL);
          walk((it.childMenus ?? m.childMenus ?? []) as unknown[]);
        }
      };
      walk(j as unknown[]);
      return urls;
    });
    console.log(`TC-WP-01: menu advertises ${JSON.stringify(advertised)}`);

    for (const s of [...SCREENS, BENCH]) {
      const bare = s.route.split('?')[0];
      expect(advertised.some((u) => u.startsWith(bare)),
        `the menu must still advertise ${bare}; it offered ${advertised.join(', ')}`).toBe(true);
    }
    for (const s of SCREENS) await openWorkplan(page, s.route, s.label);
  });

  test('TC-WP-02: each workplan selector is populated from its own display list', async ({ page }) => {
    for (const s of SCREENS) {
      await openWorkplan(page, s.route, s.label);
      const opts = await realOptions(page);
      console.log(`TC-WP-02: ${s.key} -> ${opts.length} options (min ${s.minOptions}), first "${opts[0]?.text}"`);
      expect(opts.length, `${s.route} selector must offer at least ${s.minOptions} real options`)
        .toBeGreaterThanOrEqual(s.minOptions);
      // and the list must come from the server, not be hardcoded in the bundle
      const list = await page.evaluate(async (name) => {
        const r = await fetch(`/api/OpenELIS-Global/rest/displayList/${name}`, { headers: { Accept: 'application/json' } });
        return { status: r.status, n: ((await r.json().catch(() => [])) as unknown[]).length };
      }, s.list);
      expect(list.status, `displayList/${s.list} must answer`).toBe(200);
      expect(list.n, `displayList/${s.list} must be non-empty`).toBeGreaterThan(0);
    }
  });

  test('TC-WP-03: a seeded order appears in the workplan for the test it ordered', async ({ page }) => {
    // Seeded, not skipped. The old case opened with
    //   if (!url) { console.log('GAP'); return; }
    // and asserted nothing about queue contents at all.
    const seeded = await seedOrder(page, 'WP03');
    console.log(`TC-WP-03: seeded ${seeded.accession}`);

    await openWorkplan(page, SCREENS[0].route, SCREENS[0].label);
    const opts = await realOptions(page);
    // QA_TEST_ID defaults to 3 (Glucose) — the test the fixture orders.
    const testId = process.env.QA_TEST_ID || '3';
    const match = opts.find((o) => o.value === testId);
    expect(match, `test id ${testId} must be selectable in the By Test workplan`).toBeTruthy();

    const res = await queryWorkplan(page, SCREENS[0].api, SCREENS[0].param, testId);
    console.log(`TC-WP-03: WorkPlanByTest?test_id=${testId} -> ${res.status}, rows=${res.rows}, keys=${JSON.stringify(res.keys)}`);
    expect(res.status, 'the workplan endpoint must answer').toBe(200);
    expect(res.rows, `the workplan for test ${testId} must list the work just seeded, not an empty queue`)
      .not.toBeNull();
    expect(res.rows as number, `expected at least one pending item for test ${testId}`).toBeGreaterThan(0);
  });

  test('TC-WP-04: the workplan queue is scoped to the selection, not the whole lab', async ({ page }) => {
    // The old TC-WP-04 claimed to prove "completed tests leave the pending
    // queue" and asserted nothing. Proving a departure needs a validated result
    // and a second observation, which belongs with results/validation. What IS
    // checkable here, and what the screen exists to do, is that the queue
    // answers per selection rather than returning one global list.
    await seedOrder(page, 'WP04');
    await openWorkplan(page, SCREENS[0].route, SCREENS[0].label);
    const opts = await realOptions(page);
    const a = process.env.QA_TEST_ID || '3';
    const b = opts.find((o) => o.value !== a)?.value;
    expect(b, 'the By Test workplan needs at least two selectable tests to compare').toBeTruthy();

    const ra = await queryWorkplan(page, SCREENS[0].api, SCREENS[0].param, a);
    const rb = await queryWorkplan(page, SCREENS[0].api, SCREENS[0].param, b as string);
    console.log(`TC-WP-04: test ${a} -> ${ra.rows} rows; test ${b} -> ${rb.rows} rows`);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect(ra.rows as number, `test ${a} must have pending work after seeding`).toBeGreaterThan(0);
    expect(ra.rows === rb.rows && (ra.rows as number) > 0 ? 'identical' : 'scoped',
      `both selections returned ${ra.rows} rows — the queue looks unscoped`).toBe('scoped');
  });

  test('TC-WP-05: sample reception is reachable and offers a receive action', async ({ page }) => {
    // Reception is not a workplan screen; it lives on the Generic Sample order
    // page, verified 2026-09-10. Asserted on the affordance rather than a
    // guessed /SampleReceive route.
    await page.goto(`${BASE}/GenericSample/Order`);
    await expect(page.locator('body'), 'the Generic Sample order screen must offer sample reception')
      .toContainText(/Receive Sample/i, { timeout: 20_000 });
    await expect(page.locator('#labNo'), 'reception must offer a lab number field').toBeAttached({ timeout: 15_000 });
    console.log('TC-WP-05: reception affordance present on /GenericSample/Order');
  });

  test('TC-WP-06: the bench (by unit) workplan renders and scopes by lab unit', async ({ page }) => {
    // Replaces a case that compared a workplan count to a dashboard KPI without
    // asserting either. The bench screen takes its units from the user's own
    // assignments, so it is checked against the same endpoint the app uses.
    await page.goto(`${BASE}${BENCH.route}`);
    await expect(page.locator('body'), 'the by-unit workplan must render').toContainText(/Workplan/i, { timeout: 20_000 });
    const units = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/user-test-sections/Results', { headers: { Accept: 'application/json' } });
      return { status: r.status, n: ((await r.json().catch(() => [])) as unknown[]).length };
    });
    console.log(`TC-WP-06: user test sections -> ${units.status}, ${units.n} units`);
    expect(units.status, 'the lab-unit list must answer').toBe(200);
    expect(units.n, 'an admin must have at least one assigned lab unit for the bench workplan to scope by')
      .toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite AI — Workplan By Panel & By Priority', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-WPP-01: By Panel renders its own screen', async ({ page }) => {
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
  });

  test('TC-WPP-02: the panel selector offers real panels from PANELS', async ({ page }) => {
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
    const opts = await realOptions(page);
    console.log(`TC-WPP-02: ${opts.length} panels, e.g. ${opts.slice(0, 3).map((o) => o.text).join(' / ')}`);
    expect(opts.length, 'at least two panels must be selectable').toBeGreaterThanOrEqual(2);
    expect(opts.every((o) => /^\d+$/.test(o.value)),
      `every panel option must carry a numeric id; got ${JSON.stringify(opts.slice(0, 3))}`).toBe(true);
  });

  test('TC-WPP-03: selecting a panel queries that panel', async ({ page }) => {
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
    const opts = await realOptions(page);
    const res = await queryWorkplan(page, SCREENS[1].api, SCREENS[1].param, opts[0].value);
    console.log(`TC-WPP-03: panel ${opts[0].text} (${opts[0].value}) -> ${res.status}, rows=${res.rows}`);
    expect(res.status, `WorkPlanByPanel must answer for panel ${opts[0].value}`).toBe(200);
    expect(res.rows, 'the response must carry a row collection, empty or not').not.toBeNull();
  });

  test('TC-WPP-04: By Priority renders its own screen', async ({ page }) => {
    await openWorkplan(page, SCREENS[2].route, SCREENS[2].label);
  });

  test('TC-WPP-05: every priority level can be queried', async ({ page }) => {
    await openWorkplan(page, SCREENS[2].route, SCREENS[2].label);
    const opts = await realOptions(page);
    expect(opts.length, 'priority must offer more than one level').toBeGreaterThanOrEqual(2);
    for (const o of opts) {
      const res = await queryWorkplan(page, SCREENS[2].api, SCREENS[2].param, o.value);
      console.log(`TC-WPP-05: priority ${o.text} -> ${res.status}, rows=${res.rows}`);
      expect(res.status, `priority "${o.text}" must not error`).toBe(200);
      expect(res.rows, `priority "${o.text}" must return a row collection`).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 4 — J-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-J-DEEP-01: By Test — the selection drives the query parameter', async ({ page }) => {
    // The point is that the screen sends the id the user chose. A screen that
    // renders a populated dropdown but queries a fixed id looks correct and is
    // not, and nothing in the old file would have noticed.
    await openWorkplan(page, SCREENS[0].route, SCREENS[0].label);
    const opts = await realOptions(page);
    const target = opts[Math.min(5, opts.length - 1)];

    const sent: string[] = [];
    page.on('request', (r) => {
      const m = r.url().match(/WorkPlanByTest\?test_id=([^&]*)/);
      if (m) sent.push(m[1]);
    });
    await page.selectOption('#select-1', target.value);
    await page.waitForTimeout(4_000);
    console.log(`TC-J-DEEP-01: chose ${target.text} (${target.value}); requests carried ${JSON.stringify(sent)}`);
    expect(sent.length, `selecting a test must issue a WorkPlanByTest request; none was sent`).toBeGreaterThan(0);
    expect(sent, `the request must carry the chosen id ${target.value}`).toContain(target.value);
  });

  test('TC-J-DEEP-02: By Panel — the selection drives the query parameter', async ({ page }) => {
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
    const opts = await realOptions(page);
    const target = opts[opts.length - 1];

    const sent: string[] = [];
    page.on('request', (r) => {
      const m = r.url().match(/WorkPlanByPanel\?panel_id=([^&]*)/);
      if (m) sent.push(m[1]);
    });
    await page.selectOption('#select-1', target.value);
    await page.waitForTimeout(4_000);
    console.log(`TC-J-DEEP-02: chose ${target.text} (${target.value}); requests carried ${JSON.stringify(sent)}`);
    expect(sent.length, 'selecting a panel must issue a WorkPlanByPanel request').toBeGreaterThan(0);
    expect(sent, `the request must carry the chosen id ${target.value}`).toContain(target.value);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 5 — N-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-N-DEEP-01: By Test offers the full catalogue, not a truncated list', async ({ page }) => {
    // 202 options on the local 3.2.2.0 stack. The threshold is 100 rather than
    // an exact count so a catalogue edit does not fail the suite, but a
    // silently truncated or paginated list still does.
    await openWorkplan(page, SCREENS[0].route, SCREENS[0].label);
    const opts = await realOptions(page);
    const catalogue = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/displayList/ALL_TESTS', { headers: { Accept: 'application/json' } });
      return ((await r.json().catch(() => [])) as unknown[]).length;
    });
    console.log(`TC-N-DEEP-01: selector ${opts.length} options, ALL_TESTS ${catalogue}`);
    expect(opts.length, 'the By Test selector must offer 100+ tests').toBeGreaterThanOrEqual(100);
    expect(opts.length, `the selector (${opts.length}) must not silently drop tests the catalogue serves (${catalogue})`)
      .toBeGreaterThanOrEqual(catalogue - 1);
  });

  test('TC-N-DEEP-02: By Panel renders what the endpoint actually returned', async ({ page }) => {
    // NOT "rows or an empty state, either is fine" — that was the first draft of
    // this case and the falsifiability gate flagged it as either-or-pass, which
    // it was: any screen showing anything satisfies it. Ask the endpoint what is
    // true FIRST, then hold the screen to it. That turns a tautology into a real
    // UI-versus-API consistency check: a screen that renders an empty state over
    // 29 rows, or a row count over nothing, now fails.
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
    const opts = await realOptions(page);
    const panel = opts[0];

    const api = await queryWorkplan(page, SCREENS[1].api, SCREENS[1].param, panel.value);
    expect(api.status, `WorkPlanByPanel must answer for panel ${panel.value}`).toBe(200);
    expect(api.rows, 'the endpoint must return a row collection').not.toBeNull();
    const expected = api.rows as number;

    await page.selectOption('#select-1', panel.value);
    await page.waitForTimeout(5_000);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const counted = body.match(/\b\d+\s*-\s*\d+\s+of\s+(\d+)\s+items\b/i);
    const hasEmpty = /no records to display|no data|nothing to show/i.test(body);
    console.log(`TC-N-DEEP-02: panel ${panel.text} -> api ${expected} rows; screen count ${counted?.[1] ?? 'none'}, empty=${hasEmpty}`);

    if (expected > 0) {
      expect(counted,
        `the endpoint returned ${expected} rows for "${panel.text}", so the screen must show a row count`).not.toBeNull();
      expect(Number(counted![1]),
        `the screen's total must match the ${expected} rows the endpoint returned`).toBe(expected);
    } else {
      expect(hasEmpty,
        `the endpoint returned no rows for "${panel.text}", so the screen must say so explicitly`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Relocated from gap-suites', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-WPP-06: the panel selector matches the PANELS display list exactly', async ({ page }) => {
    await openWorkplan(page, SCREENS[1].route, SCREENS[1].label);
    const opts = await realOptions(page);
    const served = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/displayList/PANELS', { headers: { Accept: 'application/json' } });
      return ((await r.json().catch(() => [])) as { id: string; value: string }[]).map((x) => String(x.id));
    });
    console.log(`TC-WPP-06: selector ${opts.length}, PANELS ${served.length}`);
    expect(opts.map((o) => o.value).sort(),
      'the selector must offer exactly the panels the server serves').toEqual(served.sort());
  });

  test('TC-WPP-07: a seeded order reaches a panel or test queue', async ({ page }) => {
    const seeded = await seedOrder(page, 'WP07');
    const testId = process.env.QA_TEST_ID || '3';
    await page.goto(`${BASE}${SCREENS[0].route}`);
    const res = await queryWorkplan(page, SCREENS[0].api, SCREENS[0].param, testId);
    console.log(`TC-WPP-07: ${seeded.accession} seeded; test ${testId} queue = ${res.rows} rows`);
    expect(res.status).toBe(200);
    expect(res.rows as number, `the order just seeded must be countable in the test ${testId} queue`).toBeGreaterThan(0);
  });

  test('TC-WPP-08: priority levels are distinct values, not one repeated label', async ({ page }) => {
    await openWorkplan(page, SCREENS[2].route, SCREENS[2].label);
    const opts = await realOptions(page);
    const values = opts.map((o) => o.value);
    const labels = opts.map((o) => o.text);
    console.log(`TC-WPP-08: ${JSON.stringify(labels)}`);
    expect(new Set(values).size, `priority values must be distinct; got ${JSON.stringify(values)}`).toBe(values.length);
    expect(labels.some((l) => /routine/i.test(l)), `expected a Routine priority; got ${JSON.stringify(labels)}`).toBe(true);
    expect(labels.some((l) => /stat|urgent|asap/i.test(l)),
      `expected an urgent priority; got ${JSON.stringify(labels)}`).toBe(true);
  });
});
