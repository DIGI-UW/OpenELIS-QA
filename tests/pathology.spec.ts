import { test, expect, type Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';

/**
 * tests/pathology.spec.ts — Pathology / Immunohistochemistry / Cytology dashboards
 *
 * REWRITTEN 2026-09-10. The falsifiability gate reported 14 of 21 cases
 * incapable of failing; every one of those went through a guessed-URL helper
 * with a `if (!ok) return;` opt-out, and the survivors asserted things like
 * "the page contains the word Pathology", which is true of the side navigation
 * on every screen in the application.
 *
 * ROUTES FROM /rest/menu, not guessed (read 2026-09-10, local 3.2.2.0):
 *   sidenav.label.pathology   -> /PathologyDashboard
 *   sidenav.label.immunochem  -> /ImmunohistochemistryDashboard
 *   sidenav.label.cytology    -> /CytologyDashboard
 *
 * The three are deliberately symmetric, so this file is table-driven over them.
 * Each dashboard is:
 *   - stat tiles, `.cds--tile.dashboard-tile` wrapping `.tile-title` + `.tile-value`
 *   - `#search-input-21` (by lab number or family name), `#filterMyCases`, `#statusFilter`
 *   - one table: Request Date · Stage · Last Name · First Name ·
 *     Technician Assigned · Pathologist Assigned · Lab Number
 *   - endpoints: displayList/<MODULE>_STATUS, <module>/dashboard/count,
 *     <module>/dashboard?statuses=&searchTerm=
 *
 * THE INSTANCE IS EMPTY, and these cases do not pretend otherwise. Every count
 * is 0 and the dashboard returns []. So instead of asserting non-zero work
 * exists, the assertions hold the SCREEN to what the API says: the tile values
 * must equal the count endpoint's fields, and the table must match the row
 * collection. Those fail if the UI drifts from the server in either direction,
 * on an empty instance or a busy one, which is what makes them worth running.
 *
 * ONE MEASURED SUBTLETY. The status filter is NOT the display list. Pathology's
 * PATHOLOGY_STATUS serves 8 statuses; the filter offers 11 options — a
 * `placeholder`, an `All`, and 9 statuses, the extra one being `IN_PROGRESS`
 * which the list does not contain. So these cases assert CONTAINMENT (every
 * served status is offered), never equality. An equality assertion here would
 * have been wrong on every one of the three modules.
 */

type Module = {
  key: string;
  route: string;
  heading: RegExp;
  api: string;
  list: string;
  /** Tile titles this module shows, in the order the page renders them. */
  tiles: RegExp[];
  /** count-endpoint fields, paired to `tiles` by index. */
  countFields: string[];
};

const MODULES: Module[] = [
  {
    key: 'pathology',
    route: '/PathologyDashboard',
    heading: /Pathology DashBoard/i,
    api: 'pathology',
    list: 'PATHOLOGY_STATUS',
    tiles: [/Cases in Progress/i, /Awaiting Pathology Review/i, /Additional Pathology Requests/i, /Complete/i],
    countFields: ['inProgress', 'awaitingReview', 'additionalRequests', 'complete'],
  },
  {
    key: 'immunohistochemistry',
    route: '/ImmunohistochemistryDashboard',
    heading: /Immunohistochemistry DashBoard/i,
    api: 'immunohistochemistry',
    list: 'IMMUNOHISTOCHEMISTRY_STATUS',
    tiles: [/Cases in Progress/i, /Awaiting Immunohistochemistry Review/i, /Complete/i],
    countFields: ['inProgress', 'awaitingReview', 'complete'],
  },
  {
    key: 'cytology',
    route: '/CytologyDashboard',
    heading: /Cytology DashBoard/i,
    api: 'cytology',
    list: 'CYTOLOGY_STATUS',
    tiles: [/Cases in Progress/i, /Awaiting Cytopathologist Review/i, /Complete/i],
    countFields: ['inProgress', 'awaitingReview', 'complete'],
  },
];

const PATHOLOGY = MODULES[0];
const IHC = MODULES[1];
const CYTOLOGY = MODULES[2];

const TABLE_COLUMNS = [
  'Request Date', 'Stage', 'Last Name', 'First Name',
  'Technician Assigned', 'Pathologist Assigned', 'Lab Number',
];

/** Open a dashboard and prove it rendered itself, not the SPA shell. */
async function openDashboard(page: Page, m: Module): Promise<void> {
  await page.goto(`${BASE}${m.route}`);
  await expect(page.locator('#statusFilter'), `${m.route} must render its status filter`)
    .toBeAttached({ timeout: 20_000 });
  await expect(page.locator('body'), `${m.route} must show its own dashboard heading`)
    .toContainText(m.heading, { timeout: 15_000 });
}

/** The stat tiles, as title/value pairs in render order. */
async function tiles(page: Page): Promise<{ title: string; value: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.cds--tile.dashboard-tile')).map((t) => ({
      title: (t.querySelector('.tile-title') as HTMLElement | null)?.innerText.trim() ?? '',
      value: (t.querySelector('.tile-value') as HTMLElement | null)?.innerText.trim() ?? '',
    })));
}

/**
 * Tick a Carbon checkbox and PROVE it ticked.
 *
 * Carbon draws the control with a span over the real input, so a plain click on
 * the input is intercepted — the same mechanism that made `locator.check()` time
 * out on radios and needed `checkCarbonRadio` in test-helpers (harness 12.x).
 * `click({ force: true })` gets past the interception but can land on the
 * decoration without changing state, which is worse: it looks like it worked.
 *
 * So click the LABEL, which is also the real user gesture, then assert the
 * state actually changed. Any case that goes on to judge the FILTER'S effect
 * needs that guarantee first, or a no-op click reads as "the product ignored
 * the filter".
 */
async function tickCarbonCheckbox(page: Page, id: string): Promise<void> {
  const box = page.locator(`#${id}`);
  await expect(box, `#${id} must exist`).toBeAttached({ timeout: 15_000 });
  const before = await box.isChecked();
  const label = page.locator(`label[for="${id}"]`);
  if (await label.count()) await label.click();
  else await box.click({ force: true });
  await expect(box, `clicking #${id} must actually change its state`).toBeChecked({ checked: !before, timeout: 10_000 });
}

async function getJson(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const r = await fetch(`/api/OpenELIS-Global/rest/${p}`, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, raw: text.slice(0, 200) };
  }, path);
}

/** Status ids the module's display list serves. */
async function servedStatuses(page: Page, m: Module): Promise<string[]> {
  const r = await getJson(page, `displayList/${m.list}`);
  expect(r.status, `displayList/${m.list} must answer`).toBe(200);
  return ((r.json as { id: string }[]) || []).map((x) => String(x.id));
}

/** Options the status filter offers, minus the placeholder and All. */
async function filterStatuses(page: Page): Promise<string[]> {
  return page.locator('#statusFilter').evaluate((el) =>
    Array.from((el as HTMLSelectElement).options)
      .map((o) => o.value)
      .filter((v) => v && v !== 'placeholder' && v !== 'All'));
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite AK — Pathology / IHC / Cytology', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // CANARY for the whole file: the routes are the app's, and each renders.
  test('TC-PATH-01: the application advertises all three dashboards, and each renders its own', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const advertised = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/menu', { headers: { Accept: 'application/json' } });
      const j = await r.json().catch(() => null);
      const urls: string[] = [];
      const walk = (n: unknown[]) => {
        for (const it of (n || []) as Record<string, unknown>[]) {
          const m = (it.menu ?? it) as Record<string, unknown>;
          if (typeof m.actionURL === 'string') urls.push(m.actionURL);
          walk((it.childMenus ?? m.childMenus ?? []) as unknown[]);
        }
      };
      walk(j as unknown[]);
      return urls;
    });
    for (const m of MODULES) {
      expect(advertised, `the menu must still advertise ${m.route}`).toContain(m.route);
    }
    // Each heading must be distinct — three screens, not one rendered thrice.
    for (const m of MODULES) await openDashboard(page, m);
    console.log('TC-PATH-01: all three dashboards advertised and rendered');
  });

  test('TC-PATH-02: pathology stat tiles carry the numbers the count endpoint returned', async ({ page }) => {
    // The old case asserted the page "has stat cards and search" by counting
    // elements. This holds the tiles to the server's own figures, so a tile
    // wired to the wrong field — or left hardcoded at 0 — fails.
    await openDashboard(page, PATHOLOGY);
    const count = await getJson(page, `${PATHOLOGY.api}/dashboard/count`);
    expect(count.status, 'the pathology count endpoint must answer').toBe(200);
    const c = count.json as Record<string, number>;
    const shown = await tiles(page);
    console.log(`TC-PATH-02: count=${JSON.stringify(c)} tiles=${JSON.stringify(shown)}`);

    expect(shown.length, `pathology must render ${PATHOLOGY.tiles.length} stat tiles`).toBe(PATHOLOGY.tiles.length);
    PATHOLOGY.tiles.forEach((titleRe, i) => {
      expect(shown[i].title, `tile ${i} title`).toMatch(titleRe);
      const field = PATHOLOGY.countFields[i];
      expect(c, `the count endpoint must carry "${field}"`).toHaveProperty(field);
      expect(shown[i].value, `tile "${shown[i].title}" must show ${field}=${c[field]}`).toBe(String(c[field]));
    });
  });

  test('TC-IHC-01: the immunohistochemistry dashboard renders its own screen', async ({ page }) => {
    await openDashboard(page, IHC);
    const shown = await tiles(page);
    expect(shown.length, 'IHC must render its three stat tiles').toBe(IHC.tiles.length);
    IHC.tiles.forEach((re, i) => expect(shown[i].title, `IHC tile ${i}`).toMatch(re));
  });

  test('TC-IHC-02: the IHC status filter offers every status the server serves', async ({ page }) => {
    await openDashboard(page, IHC);
    const served = await servedStatuses(page, IHC);
    const offered = await filterStatuses(page);
    console.log(`TC-IHC-02: served=${JSON.stringify(served)} offered=${JSON.stringify(offered)}`);
    expect(served.length, `${IHC.list} must be non-empty`).toBeGreaterThan(0);
    // Containment, not equality: the filter adds IN_PROGRESS on top of the list.
    for (const s of served) {
      expect(offered, `the filter must offer served status "${s}"`).toContain(s);
    }
    await expect(page.locator('#search-input-21'), 'IHC must offer case search').toBeAttached();
    await expect(page.locator('#filterMyCases'), 'IHC must offer a my-cases filter').toBeAttached();
  });

  test('TC-CYT-01: the cytology dashboard renders its own screen', async ({ page }) => {
    await openDashboard(page, CYTOLOGY);
    const shown = await tiles(page);
    expect(shown.length, 'cytology must render its three stat tiles').toBe(CYTOLOGY.tiles.length);
    CYTOLOGY.tiles.forEach((re, i) => expect(shown[i].title, `cytology tile ${i}`).toMatch(re));
  });

  test('TC-CYT-02: cytology offers its own workflow stages, not another module\'s', async ({ page }) => {
    await openDashboard(page, CYTOLOGY);
    const served = await servedStatuses(page, CYTOLOGY);
    console.log(`TC-CYT-02: ${JSON.stringify(served)}`);
    // Cytology's stages are distinct from pathology's grossing/cutting chain.
    // A copy-paste of the pathology list into cytology would pass a
    // "the list is non-empty" check and fail this one.
    for (const stage of ['PREPARING_SLIDES', 'SCREENING', 'READY_FOR_CYTOPATHOLOGIST']) {
      expect(served, `cytology must serve its own stage "${stage}"`).toContain(stage);
    }
    expect(served, 'cytology must NOT serve pathology\'s grossing stage').not.toContain('GROSSING');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 4 — O-DEEP: Pathology Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-O-DEEP-01: pathology has four tiles and a populated status filter', async ({ page }) => {
    await openDashboard(page, PATHOLOGY);
    const shown = await tiles(page);
    const offered = await filterStatuses(page);
    const served = await servedStatuses(page, PATHOLOGY);
    console.log(`TC-O-DEEP-01: ${shown.length} tiles, ${offered.length} filter statuses, ${served.length} served`);
    expect(shown.length, 'pathology shows four tiles — it has an Additional Requests tile the other two lack')
      .toBe(4);
    for (const s of served) expect(offered, `filter must offer "${s}"`).toContain(s);
    expect(offered, 'the pathology filter must offer the grossing stage').toContain('GROSSING');
  });

  test('TC-O-DEEP-02: choosing a status sends that status to the dashboard endpoint', async ({ page }) => {
    // The old case checked that a select's displayed value changed after
    // selectOption — i.e. that the browser works. What matters is whether the
    // choice reaches the server.
    await openDashboard(page, PATHOLOGY);
    const sent: string[] = [];
    page.on('request', (r) => {
      const m = r.url().match(/pathology\/dashboard\?statuses=([^&]*)/);
      if (m) sent.push(decodeURIComponent(m[1]));
    });
    await page.selectOption('#statusFilter', 'STAINING');
    await page.waitForTimeout(4_000);
    console.log(`TC-O-DEEP-02: requests carried ${JSON.stringify(sent)}`);
    expect(sent.length, 'choosing a status must query the dashboard').toBeGreaterThan(0);
    expect(sent.some((s) => s.includes('STAINING')),
      `the request must carry STAINING; it carried ${JSON.stringify(sent)}`).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 7 — BI-DEEP: Pathology Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BI-DEEP-01: the pathology case table has the columns a pathologist works from', async ({ page }) => {
    await openDashboard(page, PATHOLOGY);
    const headers = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table th')).map((t) => (t as HTMLElement).innerText.trim()).filter(Boolean));
    console.log(`TC-BI-DEEP-01: ${JSON.stringify(headers)}`);
    for (const col of TABLE_COLUMNS) {
      expect(headers, `the case table must have a "${col}" column`).toContain(col);
    }
  });

  test('TC-BI-DEEP-02: the table body agrees with the dashboard endpoint', async ({ page }) => {
    // API first, then hold the screen to it — the pattern that replaced an
    // either-or-pass in workplan.spec.ts. Correct on an empty instance and on a
    // busy one, which a "has a table" check is not.
    await openDashboard(page, PATHOLOGY);
    const res = await getJson(page, `${PATHOLOGY.api}/dashboard?statuses=&searchTerm=`);
    expect(res.status, 'the dashboard endpoint must answer').toBe(200);
    const rows = Array.isArray(res.json) ? (res.json as unknown[]).length : null;
    expect(rows, 'the dashboard must return a row collection').not.toBeNull();

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const counted = body.match(/\b\d+\s*-\s*\d+\s+of\s+(\d+)\s+items\b/i);
    console.log(`TC-BI-DEEP-02: api ${rows} rows; screen total ${counted?.[1] ?? 'none'}`);

    // MEASURED 2026-09-10: on an empty instance this table shows "0-0 of 0
    // items" and does NOT print "no records to display". My first draft
    // branched on rows > 0 and demanded the empty-state text below that, which
    // failed against the real screen. The paging total is authoritative in both
    // cases, so compare it directly and drop the branch — one assertion that
    // holds on an empty instance and a busy one.
    expect(counted, 'the case table must always show a paging total, even at zero').not.toBeNull();
    expect(Number(counted![1]), `the shown total must match the ${rows} cases the endpoint returned`).toBe(rows);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 7 — BJ-DEEP: Immunohistochemistry', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BJ-DEEP-01: IHC tiles carry the numbers its count endpoint returned', async ({ page }) => {
    await openDashboard(page, IHC);
    const count = await getJson(page, `${IHC.api}/dashboard/count`);
    expect(count.status).toBe(200);
    const c = count.json as Record<string, number>;
    const shown = await tiles(page);
    console.log(`TC-BJ-DEEP-01: count=${JSON.stringify(c)} tiles=${JSON.stringify(shown.map((t) => t.value))}`);
    IHC.tiles.forEach((_re, i) => {
      const field = IHC.countFields[i];
      expect(c, `count must carry "${field}"`).toHaveProperty(field);
      expect(shown[i].value, `tile "${shown[i].title}" must show ${field}=${c[field]}`).toBe(String(c[field]));
    });
    // IHC has no Additional Requests concept; a fourth tile would mean the
    // pathology dashboard was copied wholesale.
    expect(c, 'IHC must NOT report additionalRequests').not.toHaveProperty('additionalRequests');
  });

  test('TC-BJ-DEEP-02: IHC case search sends the term to the server', async ({ page }) => {
    await openDashboard(page, IHC);
    const sent: string[] = [];
    page.on('request', (r) => {
      const m = r.url().match(/immunohistochemistry\/dashboard\?[^"]*searchTerm=([^&]*)/);
      if (m) sent.push(decodeURIComponent(m[1]));
    });
    await page.locator('#search-input-21').fill('DEV0126');
    await page.locator('#search-input-21').press('Enter');
    await page.waitForTimeout(4_500);
    console.log(`TC-BJ-DEEP-02: searchTerm values sent = ${JSON.stringify(sent)}`);
    expect(sent.some((s) => s.includes('DEV0126')),
      `searching must send the term; requests carried ${JSON.stringify(sent)}`).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Phase 7 — BK-DEEP: Cytology', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BK-DEEP-01: cytology tiles carry the numbers its count endpoint returned', async ({ page }) => {
    await openDashboard(page, CYTOLOGY);
    const count = await getJson(page, `${CYTOLOGY.api}/dashboard/count`);
    expect(count.status).toBe(200);
    const c = count.json as Record<string, number>;
    const shown = await tiles(page);
    console.log(`TC-BK-DEEP-01: count=${JSON.stringify(c)} tiles=${JSON.stringify(shown.map((t) => t.value))}`);
    CYTOLOGY.tiles.forEach((_re, i) => {
      const field = CYTOLOGY.countFields[i];
      expect(c, `count must carry "${field}"`).toHaveProperty(field);
      expect(shown[i].value, `tile "${shown[i].title}" must show ${field}=${c[field]}`).toBe(String(c[field]));
    });
  });

  test('TC-BK-DEEP-02: the cytology filter offers every stage the server serves', async ({ page }) => {
    await openDashboard(page, CYTOLOGY);
    const served = await servedStatuses(page, CYTOLOGY);
    const offered = await filterStatuses(page);
    console.log(`TC-BK-DEEP-02: served=${JSON.stringify(served)} offered=${JSON.stringify(offered)}`);
    for (const s of served) expect(offered, `filter must offer "${s}"`).toContain(s);
    await expect(page.locator('#search-input-21'), 'cytology must offer case search').toBeAttached();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Suite PATH-EXT — Pathology Module Extended', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-PATH-EXT-01: all three dashboards and all three count endpoints answer cleanly', async ({ page }) => {
    await page.goto(`${BASE}${PATHOLOGY.route}`);
    for (const m of MODULES) {
      const count = await getJson(page, `${m.api}/dashboard/count`);
      const dash = await getJson(page, `${m.api}/dashboard?statuses=&searchTerm=`);
      console.log(`TC-PATH-EXT-01: ${m.key} count=${count.status} dashboard=${dash.status}`);
      expect(count.status, `${m.api}/dashboard/count must not error`).toBe(200);
      expect(dash.status, `${m.api}/dashboard must not error`).toBe(200);
      expect(Array.isArray(dash.json), `${m.api}/dashboard must return an array; got ${dash.raw}`).toBe(true);
    }
  });

  test('TC-PATH-EXT-02: each module serves its own distinct status vocabulary', async ({ page }) => {
    await page.goto(`${BASE}${PATHOLOGY.route}`);
    const byModule: Record<string, string[]> = {};
    for (const m of MODULES) byModule[m.key] = await servedStatuses(page, m);
    console.log(`TC-PATH-EXT-02: ${JSON.stringify(byModule)}`);
    for (const m of MODULES) {
      expect(byModule[m.key].length, `${m.list} must be non-empty`).toBeGreaterThan(0);
      expect(byModule[m.key], `${m.list} must include a terminal COMPLETED state`).toContain('COMPLETED');
    }
    // Three modules, three vocabularies. If two came back identical, one of the
    // display lists is wired to the wrong category.
    const signatures = MODULES.map((m) => byModule[m.key].slice().sort().join(','));
    expect(new Set(signatures).size,
      `the three status lists must differ; got ${JSON.stringify(signatures)}`).toBe(MODULES.length);
  });

  test('TC-PATH-EXT-03: searching by lab number reaches the server on every module', async ({ page }) => {
    for (const m of MODULES) {
      await openDashboard(page, m);
      const sent: string[] = [];
      const handler = (r: { url(): string }) => {
        const hit = r.url().match(new RegExp(`${m.api}/dashboard\\?[^"]*searchTerm=([^&]*)`));
        if (hit) sent.push(decodeURIComponent(hit[1]));
      };
      page.on('request', handler);
      await page.locator('#search-input-21').fill('DEV01260000000000001');
      await page.locator('#search-input-21').press('Enter');
      await page.waitForTimeout(4_000);
      page.off('request', handler);
      console.log(`TC-PATH-EXT-03: ${m.key} sent ${JSON.stringify(sent)}`);
      expect(sent.some((s) => s.includes('DEV01260000000000001')),
        `${m.key} search must send the lab number; sent ${JSON.stringify(sent)}`).toBe(true);
    }
  });

  test('TC-PATH-EXT-04: every module\'s tiles agree with its own count endpoint', async ({ page }) => {
    for (const m of MODULES) {
      await openDashboard(page, m);
      const count = await getJson(page, `${m.api}/dashboard/count`);
      const c = count.json as Record<string, number>;
      const shown = await tiles(page);
      console.log(`TC-PATH-EXT-04: ${m.key} tiles=${JSON.stringify(shown.map((t) => `${t.title}=${t.value}`))}`);
      expect(shown.length, `${m.key} must render ${m.tiles.length} tiles`).toBe(m.tiles.length);
      m.countFields.forEach((field, i) => {
        expect(shown[i].value, `${m.key} tile "${shown[i].title}" must show ${field}=${c[field]}`)
          .toBe(String(c[field]));
      });
    }
  });

  test('TC-PATH-EXT-05: each dashboard renders its content within the time budget', async ({ page }) => {
    // The old case timed a navigation and logged the number without asserting.
    // The budget is the repo's own 30s policy; what makes this falsifiable is
    // waiting for the dashboard's OWN content, not for the shell.
    for (const m of MODULES) {
      const t0 = Date.now();
      await page.goto(`${BASE}${m.route}`);
      await expect(page.locator('#statusFilter')).toBeAttached({ timeout: 30_000 });
      await expect(page.locator('body')).toContainText(m.heading, { timeout: 30_000 });
      const elapsed = Date.now() - t0;
      console.log(`TC-PATH-EXT-05: ${m.key} rendered in ${elapsed}ms`);
      expect(elapsed, `${m.key} must render inside the 30s policy budget`).toBeLessThan(30_000);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Relocated from gap-suites', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-PATH-03: the my-cases filter narrows the query rather than the page', async ({ page }) => {
    // "Case list or entry form visible" was the old assertion. This checks the
    // filter is server-side: a checkbox that only hides rows client-side would
    // look identical on screen and be wrong for a paged list.
    await openDashboard(page, PATHOLOGY);
    const urls: string[] = [];
    page.on('request', (r) => {
      if (/pathology\/dashboard\?/.test(r.url())) urls.push(r.url().split('?')[1] ?? '');
    });
    // The toggle must be PROVEN to have landed before its effect is judged.
    // A Carbon checkbox click that hits the decoration instead of the control
    // changes nothing, and this case would then report "the product ignored the
    // filter" when the harness simply missed. Same failure mode as the header
    // Search button (harness 12.30), so it gets the same treatment.
    await tickCarbonCheckbox(page, 'filterMyCases');
    await page.waitForTimeout(4_000);
    console.log(`TC-PATH-03: queries after toggling my-cases = ${JSON.stringify(urls)}`);
    expect(urls.length, 'toggling the my-cases filter must re-query the server').toBeGreaterThan(0);
  });

  test('TC-CYT-03: cytology tiles and table agree with the server on an empty instance', async ({ page }) => {
    await openDashboard(page, CYTOLOGY);
    const dash = await getJson(page, `${CYTOLOGY.api}/dashboard?statuses=&searchTerm=`);
    expect(dash.status).toBe(200);
    const rows = Array.isArray(dash.json) ? (dash.json as unknown[]).length : null;
    expect(rows, 'the cytology dashboard must return a row collection').not.toBeNull();

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const counted = body.match(/\b\d+\s*-\s*\d+\s+of\s+(\d+)\s+items\b/i);
    console.log(`TC-CYT-03: api ${rows} rows; screen ${counted?.[1] ?? 'none'}`);
    expect(counted, 'the cytology table must always show a paging total, even at zero').not.toBeNull();
    expect(Number(counted![1]), `the shown total must match the ${rows} cases returned`).toBe(rows);
  });
});
