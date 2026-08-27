/**
 * PULLED INTO THE REPO 2026-08-26. eqa.config.ts already referenced this file
 * by name, so the repo shipped a config pointing at a spec that was not there.
 * It lived only in ~/Documents/OpenELIS QA, which is not a git repo.
 *
 * This is a SETTER, not a guard: it flips the eqaEnabled site property through
 * the real admin path. Run it when you need EQA on or off, not as a regression.
 */
import { test, expect } from '@playwright/test';

// Set eqaEnabled through the real admin path on 3.2.2.0. Captured live, not guessed:
//   GET  /rest/SampleEntryConfigurationMenu -> 404  (stale name in the skill docs + Persona PF)
//   GET  /rest/SampleEntryConfigMenu        -> 200  (menuList; eqaEnabled is id 138)
//   POST /rest/SampleEntryConfigMenu        -> 405
//   POST /rest/SampleEntryConfig?ID=138     -> 200  <- the actual save, body = sampleEntryConfigForm
// The UI is two-stage: select the row radio, click Modify, then the value is a RADIO PAIR
// (radio-1 = true, radio-2 = false) - not a select or a checkbox.
test.describe.configure({ retries: 0 });
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';
const WANT = (process.env.EQA_WANT || 'true').toLowerCase();

test('set eqaEnabled to ' + (process.env.EQA_WANT || 'true'), async ({ page }) => {
  await page.goto(BASE + '/MasterListsPage/SampleEntryConfigurationMenu', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  expect(page.url()).not.toContain('/login');

  const before = await page.evaluate(async (api: string) => {
    const r = await fetch(api + '/SampleEntryConfigMenu', { headers: { Accept: 'application/json' } });
    const j: any = await r.json().catch(() => null);
    const e = (j && j.menuList || []).find((x: any) => x.name === 'eqaEnabled');
    return e ? e.value : 'unknown';
  }, API);
  console.log('[eqa] before = ' + before);

  if (String(before) === WANT) {
    console.log('[eqa] already ' + WANT + ' - no write');
    return;
  }

  const row = page.locator('tr').filter({ hasText: 'eqaEnabled' }).first();
  await row.locator('input[type=radio]').first().check({ force: true }).catch(() => undefined);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Modify/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);

  // The value radios render as radio-1 (true) / radio-2 (false). Pick by their value attribute
  // rather than by index, so a reordering cannot silently invert this.
  const picked = await page.evaluate((want: string) => {
    const rs = Array.from(document.querySelectorAll('input[type=radio]')) as any[];
    const target = rs.find((r) => String(r.value).trim().toLowerCase() === want);
    if (!target) return 'no radio with value ' + want;
    target.click();
    return 'clicked radio id=' + target.id + ' value=' + target.value;
  }, WANT);
  console.log('[eqa] ' + picked);
  await page.waitForTimeout(1200);

  const resp = await Promise.all([
    page.waitForResponse((r) => r.url().includes('SampleEntryConfig') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: /^Save$/i }).first().click().catch(() => undefined),
  ]);
  const rr: any = resp[0];
  if (rr) console.log('[eqa] save -> ' + rr.status() + ' ' + rr.url().split('/rest/')[1] + ' sent value=' + (JSON.parse(rr.request().postData() || '{}').value));
  else console.log('[eqa] no SampleEntryConfig POST observed');
  await page.waitForTimeout(3000);

  const after = await page.evaluate(async (api: string) => {
    const r = await fetch(api + '/SampleEntryConfigMenu', { headers: { Accept: 'application/json' } });
    const j: any = await r.json().catch(() => null);
    const e = (j && j.menuList || []).find((x: any) => x.name === 'eqaEnabled');
    return e ? e.value : 'unknown';
  }, API);
  console.log('[eqa] read-back = ' + after);
  const props = await page.evaluate(async (api: string) => {
    const r = await fetch(api + '/configuration-properties', { headers: { Accept: 'application/json' } });
    const j: any = await r.json().catch(() => null);
    return j ? j.EQA_ENABLED : 'unknown';
  }, API);
  console.log('[eqa] cross-surface configuration-properties EQA_ENABLED = ' + props);
  expect(String(after)).toBe(WANT);
});
