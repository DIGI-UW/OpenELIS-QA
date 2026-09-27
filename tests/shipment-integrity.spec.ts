/**
 * tests/shipment-integrity.spec.ts
 *
 * Sample Shipment integrity: can a box carry samples that belong elsewhere, and can the
 * sending lab "receive" its own outbound box? Written 2026-09-27 against testing 3.2.3.0
 * (release-qa-3.2.3 R64/R65; uncovered-workflows-catalogue TC-SHIPI-00..04).
 *
 * Read-only apart from the reconcile call the Receive page makes when a box is scanned.
 * The Create Box test never saves (it cancels).
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest/';

type Unassigned = {
  sampleItemId: string;
  accessionNumber: string;
  destinationFacilityId: string;
  referralTests: { status: string; organizationName: string }[];
};
type Box = { id: number; boxId: string; state: string; inbound: boolean; actualSampleCount: number };

async function getJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (u) => (await fetch(u)).json(), REST + path);
}

async function open(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
}

test.describe('Sample Shipment integrity', () => {
  test('TC-SHIPI-00: the Unassigned Samples tab lists referred samples with Add to Box', async ({ page }) => {
    await open(page, '/SampleShipment/unassigned');
    await expect(page.getByRole('button', { name: 'Add to Box' }).first()).toBeVisible({ timeout: 20_000 });
    const items = await getJson<Unassigned[]>(page, 'unassigned-sample/items');
    expect(items.length, 'unassigned list is not empty').toBeGreaterThan(0);
  });

  test('TC-SHIPI-01: a referral the reference lab REJECTED is not offered for shipping', async ({ page }) => {
    // FLIP-WHEN-FIXED (R64b). Observed 2026-09-27: REJECTED referrals listed with Add to Box.
    await open(page, '/SampleShipment/unassigned');
    const items = await getJson<Unassigned[]>(page, 'unassigned-sample/items');
    const rejected = items.filter(i => i.referralTests.some(t => t.status === 'REJECTED'));
    test.skip(rejected.length === 0 && items.length === 0, 'no referral data on this instance');
    test.fail();
    expect(rejected.map(r => r.accessionNumber), 'no REJECTED referral in Unassigned Samples').toEqual([]);
  });

  test('TC-SHIPI-02: Create Box refuses a sample referred to a different facility', async ({ page }) => {
    // FLIP-WHEN-FIXED (R64a). Observed 2026-09-27: added silently, saved and sent.
    await open(page, '/SampleShipment/create-box');
    const items = await getJson<Unassigned[]>(page, 'unassigned-sample/items');
    const labs = await getJson<{ id: string; value: string }[]>(page, 'displayList/REFERRAL_ORGANIZATIONS');
    const pick = items.find(i => labs.some(l => String(l.id) !== String(i.destinationFacilityId)));
    test.skip(!pick, 'needs an unassigned referral and a second reference lab');
    const otherLab = labs.find(l => String(l.id) !== String(pick!.destinationFacilityId))!;

    const dest = page.locator('.cds--dropdown__wrapper').filter({ hasText: /^Destination/ }).first();
    await expect(async () => {
      await dest.locator('button').first().click();
      await page.getByRole('option', { name: otherLab.value, exact: true }).click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.locator('main')).toContainText(otherLab.value);

    const search = page.locator('#sampleSearch');
    await search.fill(pick!.accessionNumber);
    await search.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);
    const summary = await page.locator('main').innerText();
    const added = Number((summary.match(/Samples Added:\s*(\d+)/) ?? [])[1] ?? -1);
    expect(added, 'Samples Added is shown').toBeGreaterThanOrEqual(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click().catch(() => {});

    test.fail();
    expect(added, `${pick!.accessionNumber} is referred to facility ${pick!.destinationFacilityId}, box goes to ${otherLab.value}`).toBe(0);
  });

  test('TC-SHIPI-03: Receive Box refuses an outbound box sent by this lab', async ({ page }) => {
    // FLIP-WHEN-FIXED (R65a). Observed 2026-09-27: outbound box received at origin, dashboard DELIVERED +1.
    await open(page, '/SampleShipment/receive');
    const boxes = await getJson<Box[]>(page, 'shipping-box');
    const out = boxes.find(b => b.state === 'SENT' && b.inbound === false);
    test.skip(!out, 'needs an outbound SENT box');
    const field = page.locator('#boxId');
    await field.fill(out!.boxId);
    await page.getByRole('button', { name: 'Scan Box' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toContainText(out!.boxId, { timeout: 15_000 });
    test.fail();
    await expect(page.getByRole('button', { name: 'Confirm Reception' }), 'no reception controls for an outbound box').toHaveCount(0);
  });

  test('TC-SHIPI-04: the Receive view expects exactly the samples in the box', async ({ page }) => {
    // FLIP-WHEN-FIXED (R65b). Observed 2026-09-27: "1 accepted / 2 expected" for a 1-sample box.
    await open(page, '/SampleShipment/receive');
    const boxes = await getJson<Box[]>(page, 'shipping-box');
    const box = boxes.find(b => b.state === 'SENT' && b.actualSampleCount > 0);
    test.skip(!box, 'needs a SENT box with samples');
    await page.locator('#boxId').fill(box!.boxId);
    await page.getByRole('button', { name: 'Scan Box' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main'), 'the reception header loads').toContainText(/\d+\s*expected/, { timeout: 20_000 });
    const text = await page.locator('main').innerText();
    const expected = Number((text.match(/(\d+)\s*expected/) ?? [])[1] ?? -1);
    expect(expected, 'an expected count is shown').toBeGreaterThan(0);
    test.fail();
    expect(expected, `${box!.boxId} holds ${box!.actualSampleCount}`).toBe(box!.actualSampleCount);
  });

  test('TC-SHIPI-11: the Cancel Referral dialog names the destination and the test', async ({ page }) => {
    // FLIP-WHEN-FIXED (R73). Observed 2026-09-28: "Destination:" and "Referral Test:" empty.
    // Opens the dialog and cancels it; nothing is changed.
    await open(page, '/SampleShipment/unassigned');
    const items = await getJson<(Unassigned & { referralTestsAsString?: string })[]>(page, 'unassigned-sample/items');
    const pick = items.find(i => i.referralTestsAsString);
    test.skip(!pick, 'no unassigned referral');
    const row = page.getByRole('row').filter({ hasText: pick!.accessionNumber }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Cancel Referral' }).click();
    const dialog = page.locator('.cds--modal.is-visible');
    await expect(dialog).toContainText(pick!.accessionNumber);
    const text = await dialog.innerText();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    test.fail();
    expect(text, 'dialog names the test').toContain(pick!.referralTestsAsString!);
    expect(text, 'dialog names the destination').toContain(pick!.referralTests[0].organizationName);
  });
});

