import { test, expect, Page, Route } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { seedModifiableOrder } from '../helpers/data-factory';

/**
 * tests/order-entry-off-happy-path.spec.ts
 *
 * Order entry off the happy path: combinations of actions a real user makes that
 * are not "fill it in correctly and press Save". Tick then untick, change the
 * sample type after picking tests, go Next then Back, add then remove samples,
 * and a request that fails while the screen is waiting for it.
 *
 * WHY THIS FILE EXISTS
 * Casey reported from the JD training server (3.2.2.0), 2026-09-29, that test
 * search in Add Order "sometimes works, sometimes doesn't" and that the screen
 * "whited out" with no data loading. Every happy-path order test in this repo was
 * green at the time. A probe of these combinations found the causes, filed as:
 *
 *   OGC-1387  legacy test search keeps the previous sample type's results
 *   OGC-1388  an unticked test, or a test from a replaced sample type, is still
 *             ordered, and comes back after Back (Add Order and Modify Order)
 *   OGC-1389  one failed request on the sample step replaces the screen with an
 *             error page (Add Order) or a blank page (Modify Order)
 *   OGC-1406  Modify Order drops every added sample unless Sample 1 has tests
 *   OGC-1266  (comment 2026-09-29) v4 Enter Order: a late tests response for
 *             the previous sample type overwrites the list; a failed request
 *             leaves "Loading" forever
 *
 * SCREENS
 *   Legacy Add Order   /SamplePatientEntry   (the 3.2.x sites' Add Order; SampleType.jsx)
 *   Enter Order (v4)   /order/clinical/enter (SampleTestSection.jsx)
 *   Modify Order       /ModifyOrder          (EditSample.jsx, reuses SampleType.jsx)
 *
 * NOTHING IS SAVED BY THE ADD ORDER AND ENTER ORDER CASES. Their order writes
 * are intercepted and aborted; the "what will be ordered" oracle is the legacy
 * Add Order step's Result Reporting list. The Modify Order cases seed their own
 * QA order (seedModifiableOrder) and capture, then abort, the /rest/SampleEdit
 * POST, so the seeded order is never changed.
 *
 * HOW THE FAILING CASES ARE MARKED (same convention as order-entry-state.spec.ts)
 * Tripwires describe the expected behaviour and fail today, so each carries
 * `test.fail()` INSIDE its body. When one reports "Expected to fail, but passed",
 * the defect is fixed: remove the marker and close the ticket.
 *
 * A tripwire also "passes" when it throws for the wrong reason (a route that
 * never loaded, a locator that never matched). The guards (TC-OEX-00, -10, -20)
 * drive the same screens, controls and oracles on the happy path. If a guard is
 * red, do not trust the tripwires in its group until it is green again.
 */

type SampleType = { id: string; name: string; tests: Array<{ id: string; name: string }> };
let TYPES: SampleType[] | null = null;

/** Two clinical sample types whose test lists differ, largest first. */
async function sampleTypes(page: Page): Promise<SampleType[]> {
  if (TYPES) return TYPES;
  const found: SampleType[] = await page.evaluate(async () => {
    const out: any[] = [];
    const types = await (await fetch('/api/OpenELIS-Global/rest/user-sample-types')).json();
    for (const t of (types || []).slice(0, 25)) {
      const r = await fetch(`/api/OpenELIS-Global/rest/sample-type-tests?sampleType=${t.id}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.tests?.length) out.push({ id: String(t.id), name: t.value, tests: j.tests.map((x: any) => ({ id: String(x.id), name: x.name })) });
    }
    return out;
  });
  found.sort((a, b) => b.tests.length - a.tests.length);
  const a = found[0];
  const b = found.find((t) => t !== a && t.tests.some((x) => !a.tests.some((y) => y.id === x.id)));
  expect(a && b, 'the instance needs two sample types with different tests').toBeTruthy();
  TYPES = [a, b!];
  return TYPES;
}

/** A test that type `a` offers and type `b` does not. */
function onlyIn(a: SampleType, b: SampleType) {
  const t = a.tests.find((x) => x.name && !b.tests.some((y) => y.name === x.name));
  expect(t, `${a.name} needs a test that ${b.name} does not offer`).toBeTruthy();
  return t!;
}

async function reactSet(page: Page, sel: string, val: string) {
  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    if (!el) throw new Error(`missing ${sel}`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel, val });
}

/** Abort every order write so a case can press Next/Submit without saving anything. */
async function blockOrderWrites(page: Page) {
  await page.route('**/rest/SamplePatientEntry*', (r: Route) => (r.request().method() === 'POST' ? r.abort() : r.fallback()));
}

// ── Legacy Add Order ──────────────────────────────────────────────────────────

async function legacySampleStep(page: Page) {
  await blockOrderWrites(page);
  await page.goto(`${BASE}/SamplePatientEntry`);
  const np = page.getByRole('button', { name: /^New Patient$/ }).first();
  await np.waitFor({ state: 'visible', timeout: 60_000 });
  await np.click();
  await page.locator('#nationalId').waitFor({ timeout: 15_000 });
  await reactSet(page, '#nationalId', `QA-OEX-${Date.now().toString(36)}`);
  await reactSet(page, '#lastName', 'QaOffPath');
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Next")');
  await expect(page.locator('#sampleId_0'), 'the Add Sample step must render').toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('#sampleId_0') as HTMLSelectElement)?.options.length > 1, null, { timeout: 30_000 });
}

async function legacyPick(page: Page, typeId: string) {
  await page.locator('#sampleId_0').selectOption(typeId);
  await page.waitForTimeout(1800);
}

async function legacyTick(page: Page, testId: string, on: boolean) {
  const id = `test_0_${testId}`;
  await expect(page.locator(`[id="${id}"]`), `checkbox ${id} must exist`).toBeAttached({ timeout: 15_000 });
  if ((await page.locator(`[id="${id}"]`).isChecked()) !== on) await page.locator(`label[for="${id}"]`).click();
  if (on) await expect(page.locator(`[id="${id}"]`)).toBeChecked();
  else await expect(page.locator(`[id="${id}"]`)).not.toBeChecked();
}

/** The Add Order step's Result Reporting list: every sample and test the order will carry. */
async function legacyResultReporting(page: Page): Promise<string> {
  await page.locator('button.forwardButton:has-text("Next")').click();
  const heading = page.getByRole('heading', { name: /result reporting/i });
  await expect(heading, 'the Add Order step must show Result Reporting').toBeVisible({ timeout: 20_000 });
  return heading.locator('xpath=..').innerText();
}

// ── Enter Order (v4) ─────────────────────────────────────────────────────────

async function v4Enter(page: Page) {
  await page.route('**/api/OpenELIS-Global/**', (r: Route) => (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.fallback() : r.abort()));
  await page.goto(`${BASE}/order/clinical/enter`);
  await expect(page.locator('#sampleType-0'), 'Enter Order must show a sample type picker').toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => (document.querySelector('#sampleType-0') as HTMLSelectElement)?.options.length > 1, null, { timeout: 30_000 });
}

const v4Listed = (page: Page) =>
  page.locator('input[id^="test-0-"]').evaluateAll((els) => els.map((e) => e.id.replace('test-0-', '')));

// ── Modify Order ─────────────────────────────────────────────────────────────

/** Opens Modify Order for a fresh QA order at the Add Sample step; returns the captured Submit bodies. */
async function modifySampleStep(page: Page) {
  const posts: string[] = [];
  const { accession } = await seedModifiableOrder(page, { testIds: ['31'] });
  await page.route('**/rest/SampleEdit*', async (r: Route) => {
    if (r.request().method() === 'POST') { posts.push(r.request().postData() || ''); await r.abort(); } else await r.fallback();
  });
  await page.goto(`${BASE}/ModifyOrder?accessionNumber=${encodeURIComponent(accession)}`);
  await page.locator('button:has-text("Next")').last().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Next")').last().click();
  await expect(page.locator('.orderLegendBody button:has-text("Add Sample")'), 'Modify Order must reach its Add Sample step').toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#sampleId_0'), 'Modify Order shows an empty Sample 1').toBeVisible();
  await page.waitForFunction(() => (document.querySelector('#sampleId_0') as HTMLSelectElement)?.options.length > 1, null, { timeout: 30_000 });
  return posts;
}

async function modifyTick(page: Page, i: number, testId: string, on: boolean) {
  const id = `test_${i}_${testId}`;
  await expect(page.locator(`[id="${id}"]`), `checkbox ${id} must exist`).toBeAttached({ timeout: 15_000 });
  if ((await page.locator(`[id="${id}"]`).isChecked()) !== on) await page.locator(`label[for="${id}"]`).click();
  if (on) await expect(page.locator(`[id="${id}"]`)).toBeChecked();
  else await expect(page.locator(`[id="${id}"]`)).not.toBeChecked();
}

/** Goes to the last step, presses Submit, returns the new-sample part of the captured payload. */
async function modifySubmit(page: Page, posts: string[]): Promise<string> {
  for (let k = 0; k < 3; k++) {
    const next = page.locator('button:has-text("Next")').last();
    if (!(await next.isVisible())) break;
    await next.click();
    await page.waitForTimeout(1200);
  }
  const submit = page.getByRole('button', { name: /^Submit$/ }).last();
  await expect(submit, 'Modify Order must offer Submit').toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect.poll(() => posts.length, { message: 'Submit must post /rest/SampleEdit', timeout: 10_000 }).toBeGreaterThan(0);
  return String(JSON.parse(posts[posts.length - 1]).sampleXML || '');
}

test.describe('Order entry off the happy path', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // ── Legacy Add Order ───────────────────────────────────────────────────────

  test('TC-OEX-00: [guard] legacy Add Order: a ticked test reaches Result Reporting', async ({ page }) => {
    const [A] = await sampleTypes(page);
    await legacySampleStep(page);
    await legacyPick(page, A.id);
    await legacyTick(page, A.tests[0].id, true);
    expect(await legacyResultReporting(page)).toContain(A.tests[0].name);
  });

  test('TC-OEX-01: legacy Add Order: an unticked test is not ordered (OGC-1388) [FIXED OGC-1388]', async ({ page }) => {
    // FIXED OGC-1388, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A] = await sampleTypes(page);
    await legacySampleStep(page);
    await legacyPick(page, A.id);
    await legacyTick(page, A.tests[0].id, true);
    await legacyTick(page, A.tests[0].id, false);
    expect(await legacyResultReporting(page), 'Result Reporting must not list the unticked test').not.toContain(A.tests[0].name);
  });

  test('TC-OEX-02: legacy Add Order: Next then Back keeps an unticked test unticked (OGC-1388) [FIXED OGC-1388]', async ({ page }) => {
    // FIXED OGC-1388, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A] = await sampleTypes(page);
    await legacySampleStep(page);
    await legacyPick(page, A.id);
    await legacyTick(page, A.tests[0].id, true);
    await legacyTick(page, A.tests[0].id, false);
    await legacyResultReporting(page);
    await page.click('button:has-text("Back")');
    await expect(page.locator(`[id="test_0_${A.tests[0].id}"]`)).toBeAttached({ timeout: 15_000 });
    await expect(page.locator(`[id="test_0_${A.tests[0].id}"]`), 'Back must not tick the test again').not.toBeChecked();
  });

  test('TC-OEX-03: legacy Add Order: changing the sample type drops the old test from the order (OGC-1388) [FIXED OGC-1388]', async ({ page }) => {
    // FIXED OGC-1388, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A, B] = await sampleTypes(page);
    const t = onlyIn(A, B);
    await legacySampleStep(page);
    await legacyPick(page, A.id);
    await legacyTick(page, t.id, true);
    await legacyPick(page, B.id);
    expect(await legacyResultReporting(page), `${t.name} must not be ordered on ${B.name}`).not.toContain(t.name);
  });

  test('TC-OEX-04: legacy Add Order: test search follows a sample type change (OGC-1387) [FIXED OGC-1387]', async ({ page }) => {
    // FIXED OGC-1387, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A, B] = await sampleTypes(page);
    const t = onlyIn(A, B);
    await legacySampleStep(page);
    await legacyPick(page, A.id);
    await page.locator('#tests_search_0').pressSequentially(t.name.slice(0, 3), { delay: 80 });
    await expect(page.locator('.searchTestsList li').filter({ hasText: t.name }).first(), `${A.name} search offers ${t.name}`).toBeVisible();
    await legacyPick(page, B.id);
    await expect(page.locator('.searchTestsList li').filter({ hasText: t.name }), `${B.name} must not offer ${t.name}`).toHaveCount(0);
  });

  test('TC-OEX-05: legacy Add Order: a failed tests request keeps the order screen (OGC-1389)', async ({ page }) => {
    test.fail();
    const [A] = await sampleTypes(page);
    await legacySampleStep(page);
    await page.route('**/rest/sample-type-tests*', (r: Route) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.locator('#sampleId_0').selectOption(A.id);
    await page.waitForTimeout(3000);
    await expect(page.getByText(/could not be loaded/i), 'no error page').toHaveCount(0);
    await expect(page.locator('#sampleId_0'), 'the sample step stays on screen').toBeVisible();
  });

  // ── Enter Order (v4) ───────────────────────────────────────────────────────

  test('TC-OEX-10: [guard] Enter Order lists the chosen sample type\'s tests', async ({ page }) => {
    const [A] = await sampleTypes(page);
    await v4Enter(page);
    await page.locator('#sampleType-0').selectOption(A.id);
    await expect.poll(async () => (await v4Listed(page)).length, { timeout: 15_000 }).toBe(A.tests.length);
  });

  test('TC-OEX-11: Enter Order: a late response for the previous sample type does not replace the list (OGC-1266)', async ({ page }) => {
    test.fail();
    const [A, B] = await sampleTypes(page);
    await v4Enter(page);
    await page.route(`**/rest/sample-type-tests?sampleType=${A.id}`, async (r: Route) => {
      await new Promise((res) => setTimeout(res, 4000));
      await r.fallback();
    });
    await page.locator('#sampleType-0').selectOption(A.id);
    await page.waitForTimeout(300);
    await page.locator('#sampleType-0').selectOption(B.id);
    await page.waitForTimeout(6500);
    const listed = await v4Listed(page);
    expect(listed.sort(), `${B.name} is selected, so its tests must be listed`).toEqual(B.tests.map((t) => t.id).sort());
  });

  test('TC-OEX-12: Enter Order: a failed tests request does not leave "Loading" forever (OGC-1266)', async ({ page }) => {
    test.fail();
    const [A] = await sampleTypes(page);
    await v4Enter(page);
    await page.route('**/rest/sample-type-tests*', (r: Route) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.locator('#sampleType-0').selectOption(A.id);
    await expect(page.getByText(/^Loading/i), 'the loading state must end').toHaveCount(0, { timeout: 10_000 });
  });

  // ── Modify Order ───────────────────────────────────────────────────────────

  test('TC-OEX-20: [guard] Modify Order: a test on Sample 1 is submitted', async ({ page }) => {
    const [A] = await sampleTypes(page);
    const posts = await modifySampleStep(page);
    await page.locator('#sampleId_0').selectOption(A.id);
    await page.waitForTimeout(1800);
    await modifyTick(page, 0, A.tests[0].id, true);
    expect(await modifySubmit(page, posts)).toMatch(new RegExp(`tests='${A.tests[0].id}'`));
  });

  test('TC-OEX-21: Modify Order: a sample added with Add Sample is submitted when Sample 1 is empty (OGC-1406) [FIXED OGC-1406]', async ({ page }) => {
    // FIXED OGC-1406, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A] = await sampleTypes(page);
    const posts = await modifySampleStep(page);
    await page.locator('.orderLegendBody button:has-text("Add Sample")').click();
    await expect(page.locator('#sampleId_1')).toBeVisible({ timeout: 15_000 });
    await page.locator('#sampleId_1').selectOption(A.id);
    await page.waitForTimeout(1800);
    await modifyTick(page, 1, A.tests[0].id, true);
    expect(await modifySubmit(page, posts), 'the added sample must be in the payload').toMatch(new RegExp(`tests='${A.tests[0].id}'`));
  });

  test('TC-OEX-22: Modify Order: an unticked test is not submitted (OGC-1388)', async ({ page }) => {
    test.fail();
    const [A] = await sampleTypes(page);
    const posts = await modifySampleStep(page);
    await page.locator('#sampleId_0').selectOption(A.id);
    await page.waitForTimeout(1800);
    await modifyTick(page, 0, A.tests[0].id, true);
    await modifyTick(page, 0, A.tests[0].id, false);
    expect(await modifySubmit(page, posts), 'no new-sample test after the untick').not.toMatch(new RegExp(`tests='${A.tests[0].id}'`));
  });

  test('TC-OEX-23: Modify Order: a failed tests request does not blank the screen (OGC-1389) [FIXED OGC-1389]', async ({ page }) => {
    // FIXED OGC-1389, flipped 2026-10-08 (passes on local develop 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED.
    const [A] = await sampleTypes(page);
    await modifySampleStep(page);
    await page.route('**/rest/sample-type-tests*', (r: Route) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.locator('#sampleId_0').selectOption(A.id);
    await page.waitForTimeout(3000);
    await expect(page.locator('#sampleId_0'), 'Modify Order stays on screen').toBeVisible();
  });
});
