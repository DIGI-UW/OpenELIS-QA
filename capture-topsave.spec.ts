import { test } from '@playwright/test';
import { pickCombo } from './tests/helpers/pick-combo';

// Capture the Test Catalog editor SAVE path.
//
// Why now: until 2026-08-12 the harness could not fill this form at all — pickCombo drove the
// "Sample types" filterable multiselect wrongly and left its menu open over the next field, so
// every attempt died before Save. With that fixed, `createTest` gets all the way to Save and then
// reports "the created test never became findable by name". This spec establishes WHAT the Save
// actually does on the wire, so the cause can be stated instead of guessed (skill §6.5: no bug
// filed on an inferred endpoint shape or an uncaptured request).
//
// Deliberately asserts NOTHING. It is an evidence collector.

const NAME = 'QA_AUTO_0813 TopSave';
const CODE = 'QA_AUTO_0813_TS';

test('capture editor save', async ({ page, request }) => {
  test.setTimeout(240000);

  const wire: any[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });

  page.on('request', (r) => {
    const u = r.url();
    if (!/\/rest\//.test(u)) return;
    if (r.method() === 'GET') return; // GETs are noise here
    wire.push({ phase: 'req', method: r.method(), url: u.replace(/^https?:\/\/[^/]+/, ''), body: (r.postData() || '').slice(0, 1500) });
  });

  page.on('response', async (r) => {
    const u = r.url();
    if (!/\/rest\//.test(u)) return;
    if (r.request().method() === 'GET') return;
    let body = '';
    try { body = (await r.text()).slice(0, 600); } catch { body = '<unreadable>'; }
    wire.push({ phase: 'res', status: r.status(), url: u.replace(/^https?:\/\/[^/]+/, ''), body });
  });

  await page.goto('/MasterListsPage/TestCatalogEditor/new/basic-info', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  console.log('CAP_URL', page.url());

  // --- fill Basic Info -----------------------------------------------------------------------
  const setByLabel = async (label: string, value: string) => {
    const el = page.getByLabel(label, { exact: false }).first();
    if (await el.count()) { await el.fill(value); return `${label}:ok`; }
    return `${label}:MISSING`;
  };
  console.log('CAP_FILL', JSON.stringify([
    await setByLabel('Test name', NAME),
    await setByLabel('Reporting name', NAME),
    await setByLabel('Test code', CODE),
  ]));

  let comboResult: any = {};
  try { comboResult.labUnit = await pickCombo(page, 'Lab Unit', 'Biochemistry'); }
  catch (e: any) { comboResult.labUnit = 'ERR ' + e.message.slice(0, 160); }
  try { comboResult.sampleTypes = await pickCombo(page, 'Sample types', 'Serum'); }
  catch (e: any) { comboResult.sampleTypes = 'ERR ' + e.message.slice(0, 160); }
  console.log('CAP_COMBOS', JSON.stringify(comboResult));

  // What does the form think its state is right before Save?
  const preSave = await page.evaluate(() => {
    const vals: any = {};
    document.querySelectorAll('input,textarea,select').forEach((e: any) => {
      if (e.id && e.value) vals[e.id] = String(e.value).slice(0, 60);
    });
    const invalid = [...document.querySelectorAll('[data-invalid], .cds--form-requirement')]
      .map((e: any) => (e.innerText || e.id || '').slice(0, 80)).filter(Boolean);
    return { vals, invalid };
  });
  console.log('CAP_PRESAVE_VALUES', JSON.stringify(preSave.vals));
  console.log('CAP_PRESAVE_INVALID', JSON.stringify(preSave.invalid));

  // --- what Save buttons exist? --------------------------------------------------------------
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b: any, i) => ({ i, text: (b.innerText || '').trim().slice(0, 40), disabled: b.disabled, cls: String(b.className).slice(0, 80) }))
      .filter((b) => /save|create|submit|next/i.test(b.text)));
  console.log('CAP_BUTTONS', JSON.stringify(buttons));

  const saveBtn = page.getByRole('button', { name: /^save$/i }).first();
  const exists = await saveBtn.count();
  console.log('CAP_SAVE_EXISTS', exists, exists ? await saveBtn.isDisabled() : null);

  wire.length = 0; // only care about what SAVE sends
  if (exists) {
    await saveBtn.click();
    await page.waitForTimeout(6000);
  }

  console.log('CAP_WIRE', JSON.stringify(wire, null, 1));
  console.log('CAP_CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 10)));

  // Any Carbon toast / inline notification the user would have seen?
  const notif = await page.evaluate(() =>
    [...document.querySelectorAll('.cds--toast-notification, .cds--inline-notification, [role="alert"], [role="status"]')]
      .map((e: any) => (e.innerText || '').trim().slice(0, 300)).filter(Boolean));
  console.log('CAP_NOTIFICATIONS', JSON.stringify(notif));
  console.log('CAP_URL_AFTER', page.url());

  // --- independent read-back on a DIFFERENT endpoint (§7.5) ------------------------------------
  const REST = '/api/OpenELIS-Global/rest';
  for (const path of [`${REST}/test-catalog/tests?search=${encodeURIComponent(NAME)}`, `${REST}/test-list`]) {
    const r = await request.get(path, { headers: { Accept: 'application/json' } });
    const t = await r.text();
    console.log('CAP_READBACK', path.split('?')[0], r.status(), t.includes(NAME) ? 'FOUND' : 'not-found', 'len=' + t.length);
  }
  console.log('CAP_NAME', NAME);
});
