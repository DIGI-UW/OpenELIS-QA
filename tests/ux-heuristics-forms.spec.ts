/**
 * tests/ux-heuristics-forms.spec.ts
 *
 * The form-level heuristic pass (helpers/ux-heuristics.ts H1 H3 H5, plus landing checks) on the
 * order entry forms. Written 2026-09-28 at Casey's request; catalogue TC-HEUR. Creates one
 * environmental order per run (QA_ requestor), on QA_Surface Water / QA_Water pH.
 */
import { test, expect, Page } from '@playwright/test';
import { HeuristicLog, landing, afterSave } from '../helpers/ux-heuristics';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const IDS = ['requestorFirstName', 'requestorLastName', 'fieldNotes', 'sampleType-0'];

const read = (page: Page) => page.evaluate((ids) => ({
  values: Object.fromEntries(ids.map(id => [id, (document.getElementById(id) as HTMLInputElement | null)?.value ?? ''])),
  labNumber: (document.getElementById('labNumber') as HTMLInputElement | null)?.value ?? '',
}), IDS);

test('TC-HEUR-01: Add Environmental Order resets for the next order after Save', async ({ page }) => {
  // FLIP-WHEN-FIXED (R98, H1). Observed 2026-09-28: after "Order ... saved" every value and the lab
  // number stay on screen; the requestor name no longer accepts typing.
  test.setTimeout(600_000);
  const log = new HeuristicLog(test.info());
  await page.goto(`${BASE}/order/environmental/enter`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await expect(page.locator('#labNumber')).not.toHaveValue('', { timeout: 60_000 });
  log.add(await landing(page, { info: test.info(), siteDateFormat: 'dd/MM/yyyy' }));

  const types = await page.locator('#sampleType-0 option').allInnerTexts();
  test.skip(!types.includes('QA_Surface Water'), 'environmental seed (QA_Surface Water) not on this instance');
  await page.locator('#vec-site-search').fill('QA-VS');
  await page.getByRole('button', { name: 'Select', exact: true }).first().click({ timeout: 30_000 });
  await page.locator('#sampleType-0').selectOption({ label: 'QA_Surface Water' });
  await page.getByRole('button', { name: /Tests & Panels/ }).first().click();
  await page.locator('main label').filter({ hasText: 'QA_Water pH' }).last().click();
  await page.locator('#requestorFirstName').fill('Qaheur');
  await page.locator('#requestorLastName').fill('Resetcheck');
  await page.locator('#fieldNotes').fill('QA heuristic H1 check');

  const before = { url: page.url(), ...(await read(page)) };
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/saved/i).first(), 'the save succeeds').toBeVisible({ timeout: 60_000 });
  const res = await afterSave(page, before, () => read(page), { info: test.info(), step: 'Save' });
  log.add(res);
  await log.flush();

  test.fail();
  expect(res.find(r => r.id === 'H1')?.verdict, 'the form is ready for the next order').toBe('pass');
});

for (const domain of ['environmental', 'clinical', 'vector'] as const) {
  test(`TC-HEUR-03 (${domain}): Label & Store opens at the top when reached from the bottom of Enter Order`, async ({ page }) => {
    // Casey 2026-09-28: Label & Store opens part way down the form. A fresh load opens at the top
    // (TC-HEUR-00), so the case is in-app navigation: the user scrolls to the bottom of Enter Order
    // to press Save & Next, and the next step keeps that scroll position.
    // FLIP-WHEN-FIXED (R100). Observed 2026-09-28: all three domains open Label & Store at 1387px.
    test.setTimeout(600_000);
    const log = new HeuristicLog(test.info());
    await page.goto(`${BASE}/order/${domain}/enter`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await expect(page.locator('main')).toContainText('Enter Order', { timeout: 60_000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const nav = page.locator('nav, aside, .cds--side-nav').getByRole('link', { name: 'Label & Store' });
    const link = nav.filter({ has: page.locator(`[href*="/order/${domain}/label"]`) }).or(page.locator(`a[href$="/order/${domain}/label"]`)).first();
    test.skip(!(await link.count()), 'no Label & Store link in the side nav');
    await link.click();
    await page.waitForURL(new RegExp(`/order/${domain}/label`), { timeout: 60_000 });
    const res = await landing(page, { info: test.info(), siteDateFormat: 'dd/MM/yyyy', widths: [1280] });
    log.add(res.map(r => ({ ...r, step: 'after in-app navigation from the bottom of Enter Order' })));
    await log.flush();
    test.fail();
    expect(res.find(r => r.id === 'H2')?.verdict, 'Label & Store opens at the top').toBe('pass');
  });
}

test('TC-HEUR-06: moving between pages from the side nav starts each page at the top', async ({ page }) => {
  // Is R100 app-wide? Scroll to the bottom of a long page, open another page from the side nav.
  test.setTimeout(600_000);
  const log = new HeuristicLog(test.info());
  const pairs: Array<[string, RegExp]> = [['/SampleShipment/reference-lab-results', /^Dashboard$/], ['/MasterListsPage', /^Home$/]];
  const seen: string[] = [];
  for (const [from, to] of pairs) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1500);
    const h = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return window.scrollY; });
    if (h < 200) continue;
    const link = page.locator('nav, aside, .cds--side-nav').getByRole('link', { name: to }).first();
    if (!(await link.count())) continue;
    await link.click();
    await page.waitForTimeout(3000);
    const res = await landing(page, { info: test.info(), widths: [1280] });
    log.add(res.filter(r => r.id === 'H2').map(r => ({ ...r, step: `side nav from the bottom of ${from}` })));
    seen.push(`${from} -> ${route(page)}: ${res.find(r => r.id === 'H2')?.detail}`);
  }
  await log.flush();
  test.skip(seen.length === 0, 'no long page to scroll on this instance');
  console.log(seen.join('\n'));
  expect(log.results.filter(r => r.verdict === 'fail').map(r => r.page), 'pages that open scrolled after side-nav navigation').toEqual([]);
});

const route = (page: Page) => new URL(page.url()).pathname;
