// Drive a fresh CLINICAL order through the wizard using the harness helpers; capture each stage.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/clinical-flow.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, newPatient, setSelectByOption, checkByLabel, completeQaChecklist, clickButton } from './order-helpers';

test('User manual — Clinical order full flow', async ({ page }, info) => {
  test.setTimeout(180000);
  info.annotations.push({ type: 'capability', description: 'clinical-order-flow' });
  await go(page, '/order/clinical/enter');

  await generateLabNumber(page);
  // Patient: create a New Patient (Marvel demo).
  await newPatient(page, { last: 'Parker', first: 'Peter', dob: '15/05/1990', gender: /^male$/i });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot(page, info, 'Patient section debug', { fullPage: true });
  const patientDiag = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({ ph: (i as HTMLInputElement).placeholder || '', type: (i as HTMLInputElement).type, val: (i as HTMLInputElement).value, checked: (i as HTMLInputElement).checked })).filter(x => x.ph || x.type === 'radio');
    const tabs = [...document.querySelectorAll('[role="tab"], button')].map(b => (b.textContent || '').trim()).filter(t => /patient|search|new/i.test(t)).slice(0, 6);
    return { inputs: inputs.slice(0, 20), tabs };
  });
  console.log('PATIENT_DIAG=' + JSON.stringify(patientDiag));
  // Requester: site + provider (Marvel).
  try { const s = page.getByPlaceholder(/site name/i).first(); if (await s.isVisible({ timeout: 1500 })) await s.fill('Stark Tower Clinic'); } catch {}
  try { const p = page.getByPlaceholder(/provider name/i).first(); if (await p.isVisible({ timeout: 1500 })) await p.fill('Tony Stark'); } catch {}
  // Sample type — Serum (clinical), then pick the first available test by label.
  await setSelectByOption(page, /^\s*Serum\s*$/i);
  await page.waitForTimeout(1000);
  await clickButton(page, /tests\s*&\s*panels|choose available/i, 800).catch(() => {});
  const testLabel: string = await page.evaluate(() => {
    const cbs = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    for (const cb of cbs) { const id = cb.id; const lbl = (id && document.querySelector(`label[for="${id}"]`)) || cb.closest('label'); const t = (lbl?.textContent || '').trim(); if (t && !/lab performed sampling|skip|refer/i.test(t)) return t; }
    return '';
  });
  if (testLabel) { const esc = testLabel.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); await checkByLabel(page, new RegExp(esc, 'i')); }
  await page.waitForTimeout(600);
  // Close the open "Choose Available Test" dropdown so it can't intercept the Save & Next click.
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { const h = [...document.querySelectorAll('h2,h3')].find(e => /^Sample$/i.test((e.textContent || '').trim())); (h as HTMLElement)?.click(); window.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  await shot(page, info, 'Enter Order — completed', { fullPage: false });
  console.log('CLIN_TEST=' + testLabel);

  // Clinical wizard = Enter Order -> Collect -> Label & Store -> QA Review (4 steps).
  // Drive each stage EXPLICITLY (a generic per-stage action loop corrupts Collect state).

  // --- Enter Order -> Collect ---
  await page.keyboard.press('Escape').catch(() => {});
  await clickButton(page, /save & next|save and next/i, 3000);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await shot(page, info, 'Collect', { fullPage: false });

  // --- Collect: fill collector, quantity, unit, consent, then advance ---
  try { const c = page.getByPlaceholder(/COL-0000/i).first(); if (await c.isVisible({ timeout: 1500 })) await c.fill('COL-0001'); } catch {}
  // Quantity + Unit may gate the Collect save.
  await page.evaluate(() => {
    const q = [...document.querySelectorAll('input')].find(i => /quantity|amount/i.test((i.previousElementSibling?.textContent || '') + (i.closest('div')?.textContent || ''))) as HTMLInputElement | undefined;
    if (q && !q.value) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; setter.call(q, '1'); q.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await setSelectByOption(page, /^\s*mL\s*$/i).catch(() => {});
  await checkByLabel(page, /patient has provided signed consent/i).catch(() => {});
  await page.waitForTimeout(400);
  await clickButton(page, /save & next|save and next/i, 3500);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await shot(page, info, 'Label & Store', { fullPage: false });

  // --- Label & Store: print labels, skip storage, then advance ---
  await clickButton(page, /print all labels|print labels/i, 900).catch(() => {});
  await checkByLabel(page, /skip storage|skip this step|no storage|assign later/i).catch(() => {});
  await page.waitForTimeout(400);
  await clickButton(page, /save & next|save and next/i, 3000);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await shot(page, info, 'QA Review', { fullPage: false });

  // --- QA Review: tick the checklist, then submit/complete ---
  await completeQaChecklist(page).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, info, 'QA Review — checklist complete', { fullPage: false });
  await clickButton(page, /save & next|save and next|^submit$|complete/i, 3200);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
  await shot(page, info, 'Complete', { fullPage: false });

  await saveWalkthrough(page, info);
});
