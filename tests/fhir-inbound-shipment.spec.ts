/**
 * tests/fhir-inbound-shipment.spec.ts
 *
 * Inbound shipments and referrals from another lab over FHIR (Receive Box > Import from
 * FHIR, reception, and Accept Sample). Written 2026-09-28 against testing 3.2.3.0 with a
 * simulated external lab: a plain HAPI server holding SupplyDelivery, Task, ServiceRequest,
 * Patient and Specimen resources built by scripts/fhir-sim (release-qa-3.2.3 R83 to R90;
 * uncovered-workflows-catalogue TC-SHIPF).
 *
 * Every test skips when its simulated box or order is not on the instance, so the spec is
 * safe on a server that has no remote FHIR source. Seed with scripts/fhir-sim/README.md.
 * Import from FHIR is idempotent (boxes already present are skipped), so running it is safe.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest/';

type Box = { id: number; boxId: string; state: string; inbound: boolean; actualSampleCount: number; originFacilityName: string; temperatureRequirement: string };

async function incoming(page: Page): Promise<Box[]> {
  return page.evaluate(async (u) => { const r = await fetch(u); return r.ok ? r.json() : []; }, REST + 'shipping-box/incoming');
}

async function openReceive(page: Page) {
  await page.goto(`${BASE}/SampleShipment/receive`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /import from fhir/i })).toBeVisible({ timeout: 30_000 });
}

async function scan(page: Page, boxId: string) {
  await page.locator('#boxId').fill(boxId);
  await page.getByRole('button', { name: 'Scan Box' }).click();
  await expect(page.locator('main')).toContainText(`Box ${boxId}`, { timeout: 30_000 });
  await expect(page.locator('main')).toContainText(/\d+ accepted \/ \d+ expected/, { timeout: 30_000 });
  return page.locator('main').innerText();
}

async function needBox(page: Page, boxId: string): Promise<Box> {
  const box = (await incoming(page)).find(b => b.boxId === boxId);
  test.skip(!box, `${boxId} is not on this instance (seed it with scripts/fhir-sim)`);
  return box!;
}

test.describe('Inbound shipments over FHIR', () => {
  test('TC-SHIPF-00: Import from FHIR answers and a second run imports nothing new', async ({ page }) => {
    await openReceive(page);
    const before = await incoming(page);
    test.skip(!before.some(b => b.boxId.startsWith('QA-EXT-')), 'no simulated inbound boxes on this instance');
    const res = page.waitForResponse(r => r.url().includes('import-from-fhir'), { timeout: 90_000 });
    await page.getByRole('button', { name: /import from fhir/i }).click();
    const r = await res;
    // R84: one malformed delivery on the remote server turns every import into a 500.
    expect(r.status(), 'the import call succeeds').toBe(200);
    const again = page.waitForResponse(x => x.url().includes('import-from-fhir'), { timeout: 90_000 });
    await page.getByRole('button', { name: /import from fhir/i }).click();
    expect(await (await again).json(), 'nothing is imported twice').toEqual({ imported: 0 });
  });

  test('TC-SHIPF-01: an imported box shows the sender, temperature and every expected specimen', async ({ page }) => {
    await openReceive(page);
    const box = await needBox(page, 'QA-EXT-BOX-0001');
    expect(box.inbound, 'marked inbound').toBe(true);
    await expect(page.getByRole('row').filter({ hasText: 'QA-EXT-BOX-0001' })).toContainText('QA External Reference Lab');
    const text = await scan(page, 'QA-EXT-BOX-0001');
    expect(text).toContain('2-8C');
    expect(text, 'the three specimens in the delivery are expected').toMatch(/0 accepted \/ 3 expected/);
  });

  test('TC-SHIPF-02: sender-supplied text is shown as text, not run as markup', async ({ page }) => {
    await openReceive(page);
    await needBox(page, 'QA-EXT-BOX-0013');
    const text = await scan(page, 'QA-EXT-BOX-0013');
    expect(text, 'the raw markup is displayed').toContain('<img src=x');
    expect(await page.evaluate(() => (window as unknown as { __qaxss?: number }).__qaxss), 'the onerror handler never ran').toBeUndefined();
  });

  test('TC-SHIPF-03: a box whose FHIR id is not a UUID keeps its specimen list', async ({ page }) => {
    // FLIP-WHEN-FIXED (R90). Observed 2026-09-28: "0 accepted / 0 expected" while 1 was shipped.
    await openReceive(page);
    const box = await needBox(page, 'QA-EXT-BOX-0010');
    test.skip(box.state !== 'IN_TRANSIT', 'already received');
    const text = await scan(page, 'QA-EXT-BOX-0010');
    const expected = Number((text.match(/(\d+) expected/) ?? [])[1]);
    test.fail();
    expect(expected, `${box.boxId} was shipped with ${box.actualSampleCount} specimen(s)`).toBe(box.actualSampleCount);
  });

  test('TC-SHIPF-04: a referral specimen in a box names its order and offers Accept Sample', async ({ page }) => {
    await openReceive(page);
    const box = await needBox(page, 'QA-EXT-BOX-0012');
    test.skip(box.state !== 'IN_TRANSIT', 'already received');
    const text = await scan(page, 'QA-EXT-BOX-0012');
    expect(text).toContain('QA-EXT-ORD-0001');
    expect(text).toContain('Awaiting acceptance');
    await expect(page.getByRole('button', { name: 'Accept Sample' })).toBeVisible();
  });

  test('TC-SHIPF-05: Accept Sample opens Add Order filled from the referral', async ({ page }) => {
    // FLIP-WHEN-FIXED (R87). Observed 2026-09-28: LabOrderSearchProvider 500 (NPE) and an empty form
    // when the sender's order number is not its ServiceRequest id.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const found = await page.evaluate(async () => (await (await fetch('/api/OpenELIS-Global/rest/ElectronicOrders?searchType=IDENTIFIER&useAllInfo=false&searchValue=Qaextref')).json()).eOrders ?? []);
    const eo = (found as { externalOrderId: string; status: string }[]).find(e => e.externalOrderId === 'QA-EXT-ORD-0001');
    test.skip(!eo || eo.status !== 'Entered', 'simulated referral QA-EXT-ORD-0001 not waiting on this instance');
    const lookup = page.waitForResponse(r => r.url().includes('LabOrderSearchProvider'), { timeout: 60_000 }).catch(() => null);
    await page.goto(`${BASE}/SamplePatientEntry?ID=QA-EXT-ORD-0001`, { waitUntil: 'domcontentloaded' });
    const r = await lookup;
    test.skip(!r, 'Add Order did not look the order up: "external orders" is off (R88)');
    test.fail();
    expect(r!.status(), 'the referral lookup succeeds').toBe(200);
  });

  test('TC-SHIPF-06: Incoming Orders finds a referral by the referring lab number', async ({ page }) => {
    // FLIP-WHEN-FIXED (R89). Observed 2026-09-28: found by name and national ID, not by QA-EXT-ORD-0001.
    await page.goto(`${BASE}/ElectronicOrders`, { waitUntil: 'domcontentloaded' });
    const byName = await page.evaluate(async () => (await (await fetch('/api/OpenELIS-Global/rest/ElectronicOrders?searchType=IDENTIFIER&useAllInfo=false&searchValue=Qaextref')).json()).eOrders ?? []);
    test.skip(!(byName as { externalOrderId: string }[]).some(e => e.externalOrderId === 'QA-EXT-ORD-0001'), 'simulated referral not on this instance');
    const box = page.locator('main input[type=text], main input[type=search]').first();
    await box.fill('QA-EXT-ORD-0001');
    await box.press('Enter');
    await expect(page.locator('main')).toContainText(/No Electronic Orders|Qaextref/, { timeout: 30_000 });
    test.fail();
    await expect(page.getByRole('row').filter({ hasText: 'Qaextref' })).toHaveCount(1);
  });
});
