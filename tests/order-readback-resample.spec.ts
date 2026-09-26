// Order read-back panels (OGC-1268) and Resample cross-reference banners (OGC-1269).
//
// HOW TO READ A test.fail() HERE
// Each tripwire asserts the SPEC (what the product should do) and is marked
// `test.fail()` while the bug is live. When the fix lands it reports
// "Expected to fail, but passed": delete the `test.fail()` line, rename the case
// "FIXED (OGC-xxxx)", and keep the assertion. Each tripwire has a canary over the
// same path that must stay green, so a tripwire cannot pass for a harness reason.
//
// EVIDENCE (2026-09-26)
//   OGC-1268: an order created with tests='5' (Amylase) and panels='' reads back
//   with panels [Bilan Biochimique] from /rest/order/search, and QA Review's Sample
//   Summary shows "Panel Bilan Biochimique". Cause: OrderSearchRestController maps
//   each ordered test to every panel that contains it.
//   OGC-1269: after Resample + reload, the original's banner reads
//   "Replacement order: #25" and the replacement's "a resample of sample #24",
//   internal ids instead of lab numbers. Right after commit the original still
//   offers Resample until the page is reloaded.
//
// Seeds its own patient and order every time (QA- data, disposable instance).
import { test, expect, type Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { seedModifiableOrder } from '../helpers/data-factory';

const REST = '/api/OpenELIS-Global/rest';
const QA_REVIEW = '/order/clinical/qa';
const AMYLASE = '5'; // Serum (sample type 2) test that is a member of a panel on testing
const ACCESSION = /[A-Z0-9]{8,}/;

test.setTimeout(240000);

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.context().request.get(`${BASE}${REST}${p}`, { headers: { Accept: 'application/json' } });
  expect(r.status(), `GET ${p}`).toBe(200);
  return r.json();
}

/** Ids of panels offered for Serum that contain Amylase. Empty means the tripwire has no teeth here. */
async function panelsContainingAmylase(page: Page): Promise<string[]> {
  const st = await getJson(page, '/sample-type-tests?sampleType=2');
  return (st.panels || [])
    .filter((p: any) => String(p.testIds || '').split(',').map((s: string) => s.trim()).includes(AMYLASE))
    .map((p: any) => String(p.name));
}

async function openOnQaReview(page: Page, accession: string): Promise<void> {
  await page.goto(BASE + QA_REVIEW);
  const search = page.getByPlaceholder(/scan barcode or enter lab number/i).first();
  await expect(search).toBeVisible({ timeout: 30000 });
  await search.fill(accession);
  await search.press('Enter');
  await expect(page.getByText(accession).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Intake Acceptance/i).first()).toBeVisible({ timeout: 30000 });
  // QA Review paints a placeholder first ("Sample 1 / No tests selected", "No collected
  // specimens to review yet") and fills the order in afterwards. Wait for the sample row
  // and the Serum summary so nothing below reads the placeholder.
  await expect(page.getByRole('cell', { name: accession }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('main')).toContainText('Serum', { timeout: 30000 });
}

async function mainText(page: Page): Promise<string> {
  return ((await page.locator('main').textContent()) || '').replace(/\s+/g, ' ');
}

/**
 * Resample is offered only when an acceptance checklist resolves for the order's domain.
 * A freshly reset instance has none ("No acceptance checklist is configured for this
 * domain"), so seed one lab-wide item when the lab-wide list is empty. A duplicate label
 * answers 400, which is fine: it means the item is already there.
 */
async function ensureAcceptanceChecklist(page: Page): Promise<void> {
  const view = await getJson(page, '/sample-acceptance-checklist/admin?domain=ALL');
  if ((view.ownItems || []).some((i: any) => i.active)) return;
  const status = await page.evaluate(async (rest) => {
    const r = await fetch(`${rest}/sample-acceptance-checklist/admin/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: JSON.stringify({ domain: 'ALL', label: 'QA-1269 Container intact' }),
    });
    return r.status;
  }, REST);
  expect([200, 400], 'seeding a lab-wide acceptance checklist item').toContain(status);
}

/** Seed an Amylase order, open it on QA Review, Edit, Resample and commit. Returns both lab numbers. */
async function seedAndResample(page: Page): Promise<{ original: string; replacement: string }> {
  await ensureAcceptanceChecklist(page);
  const { accession } = await seedModifiableOrder(page, { testIds: [AMYLASE] });
  await openOnQaReview(page, accession);
  await page.getByRole('button', { name: /^Edit/ }).first().click();
  await page.getByRole('button', { name: /^Resample/ }).first().click();
  const dialog = page.getByRole('dialog').filter({ hasText: /Resample/ });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await dialog.locator('textarea').first().fill('QA-1269 harness resample: hemolyzed');
  await dialog.getByRole('button', { name: /Commit resample/i }).click();
  const banner = page.getByText(/rejected and resampled\. Replacement order:/i).first();
  await expect(banner).toBeVisible({ timeout: 30000 });
  const m = ((await banner.textContent()) || '').match(/Replacement order:\s*([A-Z0-9]{8,})/i);
  expect(m, 'the banner shown right after commit names the replacement by lab number').not.toBeNull();
  return { original: accession, replacement: m![1] };
}

test.describe('Order read-back: panels (OGC-1268)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('ORB-00 [canary]: a single-test order reads back with that test', async ({ page }) => {
    const { accession } = await seedModifiableOrder(page, { testIds: [AMYLASE] });
    const order = await getJson(page, `/order/search?labNumber=${encodeURIComponent(accession)}`);
    const tests = (order.samples || []).flatMap((s: any) => s.tests || []);
    expect(tests.map((t: any) => String(t.id ?? t.testId))).toContain(AMYLASE);
    await openOnQaReview(page, accession);
    expect(await mainText(page)).toMatch(/Serum/);
  });

  test('ORB-01: an order with no panel shows no panel (Amylase alone is not "Bilan Biochimique")', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-1268)
    test.fail();
    const containing = await panelsContainingAmylase(page);
    test.skip(containing.length === 0, 'Amylase is in no Serum panel on this instance, so there is nothing to invent');
    const { accession } = await seedModifiableOrder(page, { testIds: [AMYLASE] });
    const order = await getJson(page, `/order/search?labNumber=${encodeURIComponent(accession)}`);
    const panels = (order.samples || []).flatMap((s: any) => s.panels || []).map((p: any) => p.name);
    await openOnQaReview(page, accession);
    await expect(page.getByRole('button', { name: /Sample Summary/ })).toBeVisible({ timeout: 30000 });
    // The summary list renders after the order loads; give it up to 10 s to show a panel
    // before concluding it shows none (a fixed build simply waits out the loop).
    let shown: string[] = [];
    for (let i = 0; i < 10 && shown.length === 0; i++) {
      const text = await mainText(page);
      shown = containing.filter((name) => text.includes(name));
      if (shown.length === 0) await page.waitForTimeout(1000);
    }
    expect({ apiPanels: panels, panelsShownOnQaReview: shown }).toEqual({ apiPanels: [], panelsShownOnQaReview: [] });
  });
});

test.describe('Resample cross-reference banners (OGC-1269)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('RSB-00 [canary]: Commit resample shows the replacement lab number straight away', async ({ page }) => {
    const { original, replacement } = await seedAndResample(page);
    expect(replacement).toMatch(ACCESSION);
    expect(replacement).not.toBe(original);
  });

  test('RSB-01: after a reload both banners name the other sample by lab number, never by #id', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-1269)
    test.fail();
    const { original, replacement } = await seedAndResample(page);
    await openOnQaReview(page, original);
    const originalText = await mainText(page);
    await openOnQaReview(page, replacement);
    const replacementText = await mainText(page);
    expect({
      originalNamesReplacement: originalText.includes(`Replacement order: ${replacement}`),
      replacementNamesOriginal: new RegExp(`resample of[^.]*${original}`).test(replacementText),
      anyHashId: /(sample\s*)?#\d+/.test(originalText + ' ' + replacementText),
    }).toEqual({ originalNamesReplacement: true, replacementNamesOriginal: true, anyHashId: false });
  });

  test('RSB-02: right after commit the rejected original is read-only (no Resample offered)', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-1269)
    test.fail();
    await seedAndResample(page);
    await expect(page.getByText(/rejected and resampled.*read-only/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /^Resample/ })).toHaveCount(0);
  });
});
