// Drive a fresh ENVIRONMENTAL order through every stage using the improved env helpers; capture each.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-flow.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, selectSite, selectEnvSampleType, pickEnvTest, selectComplianceStandard, completeQaChecklist, clickButton } from './order-helpers';

test('User manual — Env order full flow', async ({ page }, info) => {
  test.setTimeout(180000);
  info.annotations.push({ type: 'capability', description: 'env-order-flow' });
  const saves: any[] = [];
  page.on('response', async (r) => {
    const m = r.request().method();
    if (m !== 'GET' && /SamplePatientEntry/.test(r.url())) {
      let b = ''; try { b = (await r.text()).slice(0, 300); } catch {}
      const rq = r.request().postData() || '';
      const dm = rq.match(/<sample [^>]*\bdate='([^']*)'/); const qm = rq.match(/quantity='([^']*)'/);
      saves.push({ status: r.status(), sampleDate: dm ? dm[1] : '?', quantity: qm ? qm[1] : '?', err: /sampleXML/.test(b) ? b.slice(0, 150) : '' });
    }
  });
  await go(page, '/order/environmental/enter');

  await generateLabNumber(page);
  await selectSite(page, 'MUL');
  // Compliance standard (best-effort — may be optional for save).
  await selectComplianceStandard(page, /water quality|PP\s*22|PP No|groundwater|surface/i);
  // Sample Type = Groundwater (carries English tests; avoids the no-test "Drinking Water" dup).
  await selectEnvSampleType(page, /^\s*Groundwater\s*$/i);
  await page.waitForTimeout(1000);
  // Manifest row also requires Container + Collected date/time.
  await page.evaluate(() => {
    const cont = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /HDPE bottle|glass bottle|jerry can|filter membrane/i.test(o.textContent || '')));
    if (cont) { const o = [...cont.options].find(o => /1L HDPE bottle/i.test(o.textContent || '')) || cont.options[1]; const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!; s.call(cont, o.value); cont.dispatchEvent(new Event('change', { bubbles: true })); }
    const dt = (document.querySelector('input[type="datetime-local"]') as HTMLInputElement) || [...document.querySelectorAll('input')].find(i => /mm\/dd\/yyyy|yyyy/i.test((i as HTMLInputElement).placeholder || '') && (i as HTMLInputElement).type !== 'search' && !/generate lab number/i.test((i as HTMLInputElement).placeholder || '')) as HTMLInputElement | undefined;
    if (dt) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(dt, '2026-06-24T09:00'); dt.dispatchEvent(new Event('input', { bubbles: true })); dt.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(600);
  // Pick a test (pH) from the Tests & Panels panel.
  const picked = await pickEnvTest(page, /^pH$/);
  await page.waitForTimeout(600);
  await shot(page, info, 'Enter Order — completed', { fullPage: false });
  // Diagnostic: record the step counter.
  const steps = await page.evaluate(() => (document.body.innerText.match(/\d\/\d steps/) || ['?'])[0]);
  console.log('ENV_STEPS=' + steps + ' PICKED=' + picked);

  // -> next stage
  await clickButton(page, /save & next|save and next/i, 2300);
  await shot(page, info, 'Stage 2', { fullPage: false });
  await clickButton(page, /print all labels|print labels/i, 1200);
  await checkByLabelSafe(page, /skip storage|skip this step|no storage/i);
  await clickButton(page, /save & next|save and next/i, 2300);
  await shot(page, info, 'QA Review', { fullPage: false });
  await completeQaChecklist(page);
  await shot(page, info, 'QA Review — checklist complete', { fullPage: false });
  // Env wizard ends at QA Review: Submit releases the order (no separate Complete step).
  await clickButton(page, /submit/i, 3000);
  await shot(page, info, 'After Submit', { fullPage: false });
  console.log('ENV_SAVES=' + JSON.stringify(saves));
  await saveWalkthrough(page, info);
});

import { checkByLabel } from './order-helpers';
async function checkByLabelSafe(page: any, re: RegExp) { try { await checkByLabel(page, re); } catch {} }
