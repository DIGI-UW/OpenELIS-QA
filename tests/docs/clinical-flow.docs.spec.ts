// Drive a fresh CLINICAL order through the 4-step wizard and capture each stage for the manual.
// Verified recipe (order DEV…058, 25 Jun 2026):
//   Enter Order: lab no + New Patient (National ID) + Sample Type + Tests
//   Collect:     SET THE UNIT (Quantity auto-defaults to 1; with no Unit the save errors — G8)
//   Label&Store: Print All Labels + Skip Storage are BOTH currently required to advance (G10)
//   QA Review:   tick all 4 checklist items, then Submit (G11)
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/clinical-flow.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, newPatient, setSelectByOption, checkByLabel, completeQaChecklist, clickButton, trackWrites, assertOrderPersisted } from './order-helpers';

test('User manual — Clinical order full flow', async ({ page }, info) => {
  test.setTimeout(180000);
  info.annotations.push({ type: 'capability', description: 'clinical-order-flow' });
  const writes = trackWrites(page);
  await go(page, '/order/clinical/enter');

  // --- Enter Order ---
  await generateLabNumber(page);
  await newPatient(page, { last: 'Parker', first: 'Peter', dob: '15/05/1990', gender: /^male$/i });
  await page.waitForTimeout(500);
  // Requester: site + provider (best-effort text entry).
  try { const s = page.getByPlaceholder(/site name/i).first(); if (await s.isVisible({ timeout: 1500 })) await s.fill('Stark Tower Clinic'); } catch {}
  try { const p = page.getByPlaceholder(/provider name/i).first(); if (await p.isVisible({ timeout: 1500 })) await p.fill('Tony Stark'); } catch {}
  // Sample type = Whole Blood, then add the NFS panel (falls back to first available test).
  await setSelectByOption(page, /^\s*Whole Blood\s*$/i);
  await page.waitForTimeout(900);
  await clickButton(page, /tests\s*&\s*panels|choose available/i, 700).catch(() => {});
  let picked = await checkByLabel(page, /^\s*NFS\s*$/i).catch(() => false);
  if (!picked) {
    const testLabel: string = await page.evaluate(() => {
      const cbs = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
      for (const cb of cbs) { const id = cb.id; const lbl = (id && document.querySelector(`label[for="${id}"]`)) || cb.closest('label'); const t = (lbl?.textContent || '').trim(); if (t && !/lab performed sampling|skip|refer/i.test(t)) return t; }
      return '';
    });
    if (testLabel) { const esc = testLabel.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); await checkByLabel(page, new RegExp(esc, 'i')); }
  }
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, info, 'Enter Order — completed', { fullPage: false });

  // --- Enter Order -> Collect ---
  await clickButton(page, /save & next|save and next/i, 3500);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(700);
  await shot(page, info, 'Collect', { fullPage: false });

  // --- Collect: set the sample Unit via a REAL selectOption (a JS native-setter doesn't update
  // Carbon/React state, leaving Quantity=1 with no Unit -> save fails, G8). Don't touch Quantity.
  try {
    const unitSel = page.locator('select:has(option:text-is("mL"))').first();
    await unitSel.selectOption({ label: 'mL' }, { timeout: 4000 });
  } catch (e) { console.log('CLIN_UNIT_ERR=' + e); }
  await page.waitForTimeout(400);
  const unitVal = await page.evaluate(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^mL$/.test(o.textContent || ''))); return s ? s.value : 'no-unit-select'; });
  console.log('CLIN_UNIT=' + unitVal);
  await checkByLabel(page, /patient has provided signed consent/i).catch(() => {});
  await page.waitForTimeout(500);
  const beforeCollect = writes.length;
  await clickButton(page, /save & next|save and next/i, 4000);
  await page.waitForTimeout(1200);
  console.log('COLLECT_WRITES=' + JSON.stringify(writes.slice(beforeCollect)));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(700);
  await shot(page, info, 'Label & Store', { fullPage: false });

  // --- Label & Store: Print All Labels + Skip Storage are both required to advance.
  await clickButton(page, /print all labels/i, 1000).catch(() => {});
  await checkByLabel(page, /skip storage|skip this step|no storage|assign later/i).catch(() => {});
  await page.waitForTimeout(400);
  await clickButton(page, /save & next|save and next/i, 3500);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(700);
  await shot(page, info, 'QA Review', { fullPage: false });

  // --- QA Review: tick all 4 checklist items, then Submit.
  await completeQaChecklist(page).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, info, 'QA Review — checklist complete', { fullPage: false });
  await clickButton(page, /^\s*submit\s*$|save & next|save and next/i, 3500);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(900);
  await shot(page, info, 'Complete', { fullPage: false });

  await saveWalkthrough(page, info);
  console.log('CLIN_WRITES=' + JSON.stringify(writes));
  assertOrderPersisted(writes, 'clinical');
});
