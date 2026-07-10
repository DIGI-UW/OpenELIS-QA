// End-to-end validation of the improved harness helpers: drive a fresh vector order from
// Enter Order all the way to Complete, headless, capturing each stage.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-flow.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, selectOrAddSite, setSelectByOption, checkByLabel, completeQaChecklist, clickButton } from './order-helpers';

test('User manual — Vector order full flow (harness validation)', async ({ page }, info) => {
  test.setTimeout(150000);
  info.annotations.push({ type: 'capability', description: 'vector-order-flow' });
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
  await go(page, '/order/vector/enter');

  const lab = await generateLabNumber(page);
  await selectOrAddSite(page, 'QA_AUTO Vector Site');
  await setSelectByOption(page, /^adult mosquito$/i);
  await page.waitForTimeout(1000);
  // Quantity in Pool (number input — native setter is fine for non-checkboxes).
  await page.evaluate(() => { const q = document.querySelector('input[type="number"]') as HTMLInputElement | null; if (q) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(q, '25'); q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new Event('change', { bubbles: true })); } });
  // Select the test by clicking its label (Carbon checkbox).
  await checkByLabel(page, /identifikasi spesies nyamuk/i);
  await page.waitForTimeout(500);
  await shot(page, info, 'Enter Order — completed', { fullPage: false });

  // -> Label & Store
  await clickButton(page, /save & next|save and next/i, 2200);
  await shot(page, info, 'Label & Store', { fullPage: false });
  await clickButton(page, /print all labels|print labels/i, 1200);
  await checkByLabel(page, /skip storage|skip this step|no storage/i);
  await clickButton(page, /save & next|save and next/i, 2200);

  // -> QA Review
  await shot(page, info, 'QA Review', { fullPage: false });
  await completeQaChecklist(page);
  await shot(page, info, 'QA Review — checklist complete', { fullPage: false });
  await clickButton(page, /save & next|save and next|^submit$/i, 2500);

  // -> Complete
  await shot(page, info, 'Complete', { fullPage: false });
  await saveWalkthrough(page, info);

  console.log('VEC_SAVES=' + JSON.stringify(saves));
  // record the lab number used for reference
  await page.evaluate((l) => console.log('FLOW_LAB=' + l), lab);
});
