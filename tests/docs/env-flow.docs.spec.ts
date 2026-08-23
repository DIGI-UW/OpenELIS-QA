// Drive a fresh ENVIRONMENTAL order through every stage using the improved env helpers; capture each.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-flow.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, selectOrAddSite, setCollectionMethod, selectComplianceStandard, completeQaChecklist, clickButton, trackWrites, assertOrderPersisted, fillRequestor, selectSampleTypeAgnostic, pickTestAgnostic, fillUnsetSelects } from './order-helpers';

test('User manual — Env order full flow', async ({ page }, info) => {
  test.setTimeout(180000);
  info.annotations.push({ type: 'capability', description: 'env-order-flow' });
  const writes = trackWrites(page);
  await go(page, '/order/environmental/enter');

  await generateLabNumber(page);
  await selectOrAddSite(page, 'QA_AUTO Env Site');
  // Collection Method is now REQUIRED on env orders (gates Save & Next).
  await setCollectionMethod(page);
  // Compliance standard (best-effort — may be optional for save).
  await selectComplianceStandard(page, /water quality|PP\s*22|PP No|groundwater|surface/i);
  // Sample Type: chosen by STRUCTURE, not by name. This spec came from indonesiademo where
  // the workable option is called "Water"; on another instance it may be named anything (or
  // in another language), so ask the instance which env sample types carry orderable tests
  // and take one of those. "Water" stays a preference hint only.
  const st = await selectSampleTypeAgnostic(page, 'environmental', { prefer: /water/i });
  expect(st, 'this instance offers no ENVIRONMENTAL sample type with orderable tests (data gap, not a wizard defect)').not.toBeNull();
  console.log('ENV_SAMPLE_TYPE=' + st!.label + ' id=' + st!.id + ' tests=' + st!.testCount + ' preferred=' + st!.viaPreference);
  // Manifest row also requires Container + Collected date/time. Container vocabulary is
  // dictionary-backed and instance-specific (indonesiademo has "1L HDPE bottle"; others may
  // have none at all), so satisfy every still-unset dropdown structurally instead.
  const filled = await fillUnsetSelects(page, /^sampleType/i);
  console.log('ENV_DROPDOWNS_SET=' + JSON.stringify(filled));
  await page.evaluate(() => {
    const dt = (document.querySelector('input[type="datetime-local"]') as HTMLInputElement) || [...document.querySelectorAll('input')].find(i => /mm\/dd\/yyyy|yyyy/i.test((i as HTMLInputElement).placeholder || '') && (i as HTMLInputElement).type !== 'search' && !/generate lab number/i.test((i as HTMLInputElement).placeholder || '')) as HTMLInputElement | undefined;
    if (dt) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(dt, '2026-06-24T09:00'); dt.dispatchEvent(new Event('input', { bubbles: true })); dt.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(600);
  // Pick a test (pH) from the Tests & Panels panel.
  const picked = await pickTestAgnostic(page, st!.id, /^p\s*H$/i);
  expect(picked, 'no API-listed test for sample type ' + st!.id + ' could be ticked').not.toBe('');
  await fillRequestor(page);   // REQUIRED: env needs a requester or SamplePatientEntry 400s
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
  console.log('ENV_WRITES=' + JSON.stringify(writes));
  assertOrderPersisted(writes, 'env');
  await saveWalkthrough(page, info);
});

import { checkByLabel } from './order-helpers';
async function checkByLabelSafe(page: any, re: RegExp) { try { await checkByLabel(page, re); } catch {} }
