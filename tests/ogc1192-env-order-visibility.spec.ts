/**
 * tests/ogc1192-env-order-visibility.spec.ts
 *
 * OGC-1192: where do environmental orders go once saved, and does patientless data
 * crash patient-joining screens?
 *
 * REWRITTEN 2026-09-27 for 3.2.3.0. The 3.2.2.0 version encoded the broken behaviour
 * (green while broken) and its create payload 400/500'd on the reset instance, so the
 * whole file was BLOCKED. This version follows the harness convention: assertions state
 * the CORRECT behaviour, cases that still fail are `test.fail()` FLIP-WHEN-FIXED
 * tripwires, and each has a canary over the same path.
 *
 * WHAT 3.2.3.0 DOES (measured by hand 2026-09-27, release-qa-3.2.3 R34 = OGC-1192)
 *   - An env order saves (200) but is listed on the CLINICAL dashboard, patient "---",
 *     and the Environmental dashboard shows "No orders found" (barcode search too).
 *   - SampleEdit on the patientless sample now answers 200 (fixed since 3.2.2.0).
 *   - Modify Order on the env order opens the clinical wizard with
 *     "No Patient Information Available" and the clinical program list.
 *   - The dashboard REST filter is not a reliable oracle (paging state is kept in the
 *     server session and the page's own next-page call drops workflowType), so the
 *     dashboard cases read what the pages DISPLAY.
 *
 * IDS ARE RESOLVED AT RUN TIME. The old file hard-coded sample type 51, tests 767/769 and
 * site 4, none of which exist after a reset. Seed an environmental sample type with a
 * test and one sampling site (QA_ prefix) if the resolver fails.
 *
 * Run: npx playwright test -c ogc1192.config.ts
 */
import { test, expect, Page } from '@playwright/test';
import { buildEnvOrderPayload, ddMMyyyy } from './chains/env-order-payload';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';
/** An accession known NOT to exist: the negative control. */
const ABSENT_SAMPLE = 'DEV01269999999999999';

interface ApiResult<T> { ok: boolean; status: number; body: T }

async function api<T = any>(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  return page.evaluate(async ({ path, init }) => {
    const r = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* leave as text */ }
    return { ok: r.ok, status: r.status, body };
  }, { path, init: init ?? null } as never) as Promise<ApiResult<T>>;
}

/** Find an environmental sample type that has at least one test, and an active sampling site. */
async function resolveEnvIds(page: Page) {
  const spe = await api<{ sampleTypes?: Array<{ id: string; value: string }> }>(page, `${API}/SamplePatientEntry`);
  const types = (spe.body.sampleTypes ?? []).filter(t => /water|soil|air|surface|food|environment/i.test(t.value));
  for (const t of types) {
    const tests = await api<{ tests?: Array<{ id: string }> }>(page, `${API}/sample-type-tests?sampleType=${t.id}`);
    const first = tests.body.tests?.[0];
    if (first) {
      const sites = await api<Array<{ id: number; code: string; name: string; active: boolean }>>(page, `${API}/admin/vector/sampling-sites`);
      const site = (Array.isArray(sites.body) ? sites.body : []).find(s => s.active);
      expect(site, 'an active sampling site exists (seed one with a QA- code)').toBeTruthy();
      return { sampleTypeId: String(t.id), testIds: String(first.id), site: site! };
    }
  }
  throw new Error('no environmental sample type with a test: seed one (e.g. QA_Surface Water + QA_Water pH)');
}

async function createEnvOrder(page: Page): Promise<string> {
  const ids = await resolveEnvIds(page);
  const gen = await api<{ body?: string }>(page, `${API}/SampleEntryGenerateScanProvider`);
  const labNo = gen.body?.body;
  expect(labNo, 'accession generator returned an accession').toBeTruthy();
  const post = await api(page, `${API}/SamplePatientEntry`, {
    method: 'POST',
    body: buildEnvOrderPayload({
      labNo: labNo!, date: ddMMyyyy(), sampleTypeId: ids.sampleTypeId, testIds: ids.testIds,
      samplingSiteId: String(ids.site.id), samplingSiteName: ids.site.name, samplingSiteCode: ids.site.code,
    }),
  });
  expect(post.status, `env order create for ${labNo}: ${JSON.stringify(post.body).slice(0, 200)}`).toBe(200);
  return labNo!;
}

/** Text of a dashboard page once its table has rendered. */
async function dashboardText(page: Page, path: string): Promise<string> {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('columnheader', { name: /Lab Number/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  return page.locator('main').innerText();
}

test.describe.configure({ mode: 'serial' });

test.describe('OGC-1192: environmental order routing and patientless samples', () => {
  let accession = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    expect(page.url(), 'session is authenticated').not.toContain('/login');
    accession = await createEnvOrder(page);
    await page.close();
  });

  test('OGC1192-9: the environmental order create path works', async ({ page }) => {
    // Guardrail: without a real order every case below is meaningless.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    expect(accession).toMatch(/^[A-Z]+\d+$/);
  });

  // §1 routing ----------------------------------------------------------------
  test('OGC1192-1: the saved env order is listed on the Environmental dashboard', async ({ page }) => {
    // FLIPPED 2026-09-30 (OGC-1192; passes on local develop, webapp image 2026-09-29 14:43 UTC). Was FLIP-WHEN-FIXED (R34 = OGC-1192). Today: "No orders found".
    expect(await dashboardText(page, '/order/environmental'), `${accession} on the Environmental dashboard`).toContain(accession);
  });

  test('OGC1192-2: the saved env order is NOT listed on the Clinical dashboard', async ({ page }) => {
    // FLIPPED 2026-09-30 (OGC-1192; passes on local develop, webapp image 2026-09-29 14:43 UTC). Was FLIP-WHEN-FIXED (R34). Today it is listed there with patient "---".
    expect(await dashboardText(page, '/order/clinical'), `${accession} absent from the Clinical dashboard`).not.toContain(accession);
  });

  test('OGC1192-3: CANARY the Clinical dashboard lists the newest orders', async ({ page }) => {
    // Proves the dashboard read above works: the newest order of any kind is on page 1.
    const text = await dashboardText(page, '/order/clinical');
    expect(text, 'the clinical dashboard renders order rows').toMatch(/DEV\d{10,}/);
  });

  test('OGC1192-4: Modify Order on the env order does not open the clinical patient wizard', async ({ page }) => {
    // FLIPPED 2026-09-30 (OGC-1192; passes on local develop, webapp image 2026-09-29 14:43 UTC). Was FLIP-WHEN-FIXED. Today: "No Patient Information Available" + clinical program list.
    await page.goto(`${BASE}/ModifyOrder?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/No Patient Information Available/i), 'no clinical "no patient" banner for an env order').toHaveCount(0);
  });

  test('TC-ENVC-01: the Environmental Compliance Dashboard counts the env order', async ({ page }) => {
    // FLIPPED 2026-09-30 (OGC-1192; passes on local develop, webapp image 2026-09-29 14:43 UTC). Was FLIP-WHEN-FIXED (R34 = OGC-1192). Observed 2026-09-27: Total Orders 0 and Sites
    // Monitored 0 for the last month with env orders present.
    await page.goto(`${BASE}/EnvironmentalDashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Total Orders/i).first(), 'the compliance tiles render').toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      const el = document.getElementById('dp-start') as any;
      el?._flatpickr?.setDate(new Date(Date.now() - 7 * 86400000), true);
    });
    await page.waitForLoadState('networkidle');
    const tile = (await page.locator('main').innerText()).match(/Total Orders\s*\n?\s*(\d+)/);
    expect(Number(tile?.[1] ?? 0), 'Total Orders for the last week includes the new env order').toBeGreaterThan(0);
  });

  // §2 patientless sample -----------------------------------------------------
  test('OGC1192-5: SampleEdit serves the patientless sample', async ({ page }) => {
    // Permanent truth since 3.2.3.0 (was a 500 on 3.2.2.0).
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ noSampleFound?: boolean }>(page, `${API}/SampleEdit?accessionNumber=${accession}`);
    expect(r.status, 'SampleEdit on a patientless sample answers 200').toBe(200);
    expect(r.body.noSampleFound, 'and finds the sample').toBeFalsy();
  });

  test('OGC1192-6: CONTROL SampleEdit handles a nonexistent accession gracefully', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ noSampleFound?: boolean }>(page, `${API}/SampleEdit?accessionNumber=${ABSENT_SAMPLE}`);
    expect(r.status).toBe(200);
    expect(r.body.noSampleFound, 'absent accession reports noSampleFound').toBe(true);
  });
});
