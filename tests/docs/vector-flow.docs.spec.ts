// End-to-end validation of the improved harness helpers: drive a fresh vector order from
// Enter Order all the way to Complete, headless, capturing each stage.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-flow.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, selectOrAddSite, checkByLabel, completeQaChecklist, clickButton, trackWrites, assertOrderPersisted, fillRequestor, selectSampleTypeAgnostic, pickTestAgnostic, fillUnsetSelects } from './order-helpers';

test('User manual — Vector order full flow (harness validation)', async ({ page }, info) => {
  test.setTimeout(150000);
  info.annotations.push({ type: 'capability', description: 'vector-order-flow' });
  const writes = trackWrites(page);
  await go(page, '/order/vector/enter');

  const lab = await generateLabNumber(page);
  await selectOrAddSite(page, 'QA_AUTO Vector Site');
  // Sample Type by STRUCTURE. Lifted from indonesiademo, where the option is "Adult Mosquito";
  // elsewhere it may be named differently or localised, so ask the instance which VECTOR sample
  // types carry orderable tests and drive to one of those, with the old text as a hint only.
  const st = await selectSampleTypeAgnostic(page, 'vector', { prefer: /adult\s*mosquito/i });
  expect(st, 'this instance offers no VECTOR sample type with orderable tests (data gap, not a wizard defect)').not.toBeNull();
  console.log('VEC_SAMPLE_TYPE=' + st!.label + ' id=' + st!.id + ' tests=' + st!.testCount + ' preferred=' + st!.viaPreference);
  const filled = await fillUnsetSelects(page, /^sampleType/i);
  console.log('VEC_DROPDOWNS_SET=' + JSON.stringify(filled));
  // Quantity in Pool (number input — native setter is fine for non-checkboxes).
  await page.evaluate(() => { const q = document.querySelector('input[type="number"]') as HTMLInputElement | null; if (q) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(q, '25'); q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new Event('change', { bubbles: true })); } });
  // Select the test by its real name on THIS instance. The old literal
  // (/identifikasi spesies nyamuk/i) is Indonesian and matches nothing elsewhere — it becomes a
  // preference hint over the API-reported test list for the chosen sample type.
  const picked = await pickTestAgnostic(page, st!.id, /nyamuk|mosquito|species/i);
  expect(picked, 'no API-listed test for sample type ' + st!.id + ' could be ticked').not.toBe('');
  console.log('VEC_PICKED=' + picked);
  await page.waitForTimeout(500);
  await fillRequestor(page);   // REQUIRED: vector needs a requester or SamplePatientEntry 400s
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

  console.log('VEC_WRITES=' + JSON.stringify(writes));
  assertOrderPersisted(writes, 'vector');
  // record the lab number used for reference
  await page.evaluate((l) => console.log('FLOW_LAB=' + l), lab).catch(() => {});
});
