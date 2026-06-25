// Docs-capture flow: Environmental order entry (3-step wizard) + results.
// Indonesia demo only (environmental routes exist there). Saves real data (allowed on demos).
//   BASE=https://indonesiademo.openelis-global.org SLOWMO=700 npx playwright test --project=docs tests/docs/environmental-order-results.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, dismissModals, scrollThrough } from './capture';
import fs from 'fs';

test.skip(!(process.env.BASE || '').includes('indonesia'), 'environmental flow lives on the Indonesia demo');
test.setTimeout(240_000);

const OUT = 'docs-media/environmental-order-results';
const log = (m: string) => console.log('[env]', m);

async function selectByName(page: any, name: string, label: string) {
  const sel = page.locator(`select[name="${name}"], select#${name}`).first();
  if (await sel.count()) { const ok = await sel.selectOption({ label }).then(() => true).catch(() => false); if (!ok) await sel.selectOption({ index: 1 }).catch(() => {}); return true; }
  return false;
}
async function fillLabel(page: any, re: RegExp, value: string) {
  const el = page.getByLabel(re).first();
  if (await el.count() && await el.isVisible().catch(() => false)) { await el.fill(value).catch(() => {}); }
}
async function combo(page: any, opener: any, typeText: string | null, optionRe: RegExp) {
  if (!(await opener.count())) return;
  await opener.click().catch(() => {});
  if (typeText) { await page.keyboard.type(typeText); await page.waitForTimeout(600); }
  const opt = page.getByRole('option', { name: optionRe }).first();
  if (await opt.count().catch(() => 0)) await opt.click().catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
}
const tickByLabel = async (page: any, re: RegExp) => {
  const lbl = page.getByText(re).first();
  if (await lbl.count()) { await lbl.click({ timeout: 5000 }).catch(() => {}); }
};

test('User manual — Environmental order entry & results walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'environmental-order-results' });

  // ---------- Step 1: Enter Order ----------
  await go(page, '/order/environmental/enter');
  await shot(page, info, 'Step 1 — Enter Order (overview)');

  const gen = page.getByText(/Generate Lab Number/i).first();
  if (await gen.count()) { await gen.click().catch(() => {}); await page.waitForTimeout(600); }

  await selectByName(page, 'collectionMethod', 'Grab Sample');
  await selectByName(page, 'weather', 'Clear / Sunny');
  await fillLabel(page, /Water Temp/i, '24');
  await fillLabel(page, /Ambient Temp/i, '30');
  await fillLabel(page, /Field Notes/i, 'Routine drinking-water surveillance sample (demo).');

  await combo(page, page.getByText(/Select standards/i).first(), null, /Water Quality/i);
  await page.waitForTimeout(400);

  const siteTypeahead = page.getByPlaceholder(/site name or code/i).first();
  if (await siteTypeahead.count()) {
    await siteTypeahead.click().catch(() => {}); await siteTypeahead.fill('MUL').catch(() => {}); await page.waitForTimeout(900);
    const selBtn = page.getByRole('button', { name: /^Select$/ }).first();
    if (await selBtn.count()) await selBtn.click().catch(() => {});
  }

  await selectByName(page, 'sampleType-0', 'Drinking Water');
  await selectByName(page, 'container-0', '1L HDPE bottle');
  await page.waitForTimeout(500);

  // Verify: did the compliance standard auto-add tests? Log the manifest tests cell BEFORE manual pick.
  const tpRequiredBefore = await page.getByText(/Tests\s*&\s*Panels\s*—\s*required/i).count().catch(() => 0);
  log('tests-required-before-manual-pick=' + tpRequiredBefore + ' (if >0, standard did NOT auto-add tests)');

  // Tests & Panels — open inline selector and tick tests by name.
  const tpLink = page.getByText(/Tests\s*&\s*Panels/i).last();
  if (await tpLink.count()) {
    await tpLink.click().catch(() => {}); await page.waitForTimeout(1000);
    let picked = 0;
    for (const t of [/^pH$/i, /Total Dissolved Solids/i, /^Lead$/i]) {
      const cb = page.getByRole('checkbox', { name: t }).first();
      if (await cb.count()) { if (await cb.check({ force: true }).then(() => true).catch(() => false)) picked++; }
    }
    log('tests picked ' + picked);
    await page.waitForTimeout(600);
  }

  // Pan the filled Step 1 for the video, then full-page capture + section offsets for cropping.
  await dismissModals(page);
  await scrollThrough(page);
  await page.screenshot({ path: `${OUT}/_step1-full.png`, fullPage: true, animations: 'disabled' }).catch(() => {});
  const offsets = await page.evaluate(() => {
    const names = ['Lab Number', 'Collection Date', 'Sampling Site', 'Default Collection Conditions', 'Program', 'Requester', 'Applicable Compliance Standards', 'Per-Sample Manifest'];
    const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,legend,label,div,span')) as HTMLElement[];
    const out: any = { _dpr: window.devicePixelRatio, _docHeight: document.documentElement.scrollHeight, _docWidth: document.documentElement.scrollWidth };
    for (const n of names) {
      const el = heads.find(h => (h.textContent || '').trim() === n && h.getBoundingClientRect().height < 60);
      if (el) out[n] = Math.round(el.getBoundingClientRect().top + window.scrollY);
    }
    return out;
  });
  fs.writeFileSync(`${OUT}/_step1-offsets.json`, JSON.stringify(offsets, null, 2));
  log('offsets ' + JSON.stringify(offsets));

  // Save & Next
  const saveNext = page.getByRole('button', { name: /Save & Next/i }).first();
  if (await saveNext.count()) { await saveNext.click().catch(() => {}); await page.waitForTimeout(3000); await dismissModals(page); log('after Save&Next url=' + page.url()); }

  // ---------- Step 2: Label & Store ----------
  if (/\/label/.test(page.url())) {
    await scrollThrough(page);
    const sn = page.getByRole('button', { name: /Save & Next/i }).first();
    // Print the labels (headless print is a no-op; this satisfies the "labels printed" gate).
    const printAll = page.getByRole('button', { name: /Print All Labels/i }).first();
    if (await printAll.count()) { await printAll.click().catch(() => {}); await page.waitForTimeout(1500); await dismissModals(page); log('printed all labels; saveNext disabled=' + await sn.isDisabled().catch(() => '?')); }
    // Tick "Skip storage for unassigned samples".
    await tickByLabel(page, /Skip storage for unassigned samples/i);
    await page.waitForTimeout(800);
    log('after skip; saveNext disabled=' + await sn.isDisabled().catch(() => '?'));
    // Commit if there is a separate Save.
    const saveBtn = page.getByRole('button', { name: /^Save$/ }).first();
    if (await saveBtn.isVisible().catch(() => false) && !(await saveBtn.isDisabled().catch(() => false))) {
      await saveBtn.click().catch(() => {}); await page.waitForTimeout(2000); await dismissModals(page);
      log('after Save; saveNext disabled=' + await sn.isDisabled().catch(() => '?'));
    }
    await shot(page, info, 'Step 2 — Label & Store (print labels & storage)', { fullPage: true });
    if (await sn.count() && !(await sn.isDisabled().catch(() => true))) { await sn.click().catch(() => {}); await page.waitForTimeout(3000); await dismissModals(page); log('after Save&Next url=' + page.url()); }
    else log('Save & Next still disabled — not advancing');
  }

  // ---------- Step 3: QA Review ----------
  if (/\/qa/.test(page.url())) {
    await scrollThrough(page);
    await shot(page, info, 'Step 3 — QA Review (checklist)', { fullPage: true });
    for (const re of [/Sampling site information is correct/i, /Sample types and tests are correct/i, /Labels have been printed/i, /Storage locations have been assigned/i]) {
      await tickByLabel(page, re);
    }
    await page.waitForTimeout(700);
    await shot(page, info, 'Step 3 — QA checklist complete', { fullPage: true });
    const submit = page.getByRole('button', { name: /^submit$/i }).first();
    if (await submit.isVisible().catch(() => false) && !(await submit.isDisabled().catch(() => false))) {
      await submit.click().catch(() => {});
      await page.waitForTimeout(1200);
      // Confirm any "are you sure?" dialog (do NOT dismiss it — click its primary action).
      const confirm = page.locator('[role="dialog"], .cds--modal.is-visible').getByRole('button', { name: /submit|confirm|^yes$|ok|proceed/i }).first();
      if (await confirm.isVisible().catch(() => false)) { await confirm.click().catch(() => {}); }
      await page.waitForTimeout(3500);
      log('after submit url=' + page.url());
      await shot(page, info, 'Order submitted — confirmation', { fullPage: true });
    } else log('submit not enabled/visible');
  }

  // ---------- Results ----------
  if (await go(page, '/GenericSample/Results')) await shot(page, info, 'Enter results — search by accession');
  if (await go(page, '/EnvironmentalDashboard')) await shot(page, info, 'Environmental Compliance Dashboard', { fullPage: true });
  if (await go(page, '/LaporanHasil')) await shot(page, info, 'Laporan Hasil (compliance report)', { fullPage: true });

  await saveWalkthrough(page, info);
});
