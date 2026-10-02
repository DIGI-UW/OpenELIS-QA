// OGC-1407 regression guards: Clinical Order Entry v4 must keep ONE patient per new-patient order.
// v4 (#4490) has three steps (Enter Order, Prepare Samples, Sample check) and the footer
// Discard / Save and exit / Save and next. Each save posts /rest/SamplePatientEntry.
// Creates QA patients and orders (letters-only "Qadp..." last names, "QADP..." national IDs).
//
// TC-DUPPAT-01  New patient typed in, Save and next, then Save and exit on Prepare Samples -> one patient
// TC-DUPPAT-02  Every save after the first carries the saved patient id (not ADD with an empty id)
// TC-DUPPAT-03  Guard: existing patient chosen from the search, Save and next -> still one patient
// TC-DUPPAT-04  Server guard: the first order POST replayed with the patient id blanked -> still one patient
//
// OGC-1407 was fixed by #4488/#4490 and verified on 2026-10-02 (image 2026-10-01 17:48 UTC):
// these were tripwires in the first draft and are now plain regression guards.
import { test, expect, Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { createPatientViaAPI } from '../helpers/data-factory';

test.setTimeout(240000);
const ENTRY = /\/rest\/SamplePatientEntry$/;
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

async function patientsFor(page: Page, last: string, nid: string): Promise<string[]> {
  return page.evaluate(async ({ ln, id }) => {
    const r = await fetch(`/api/OpenELIS-Global/rest/patient-search-results?lastName=${ln}&firstName=&STNumber=&subjectNumber=&nationalID=&labNumber=&guid=&dateOfBirth=&gender=&suppressExternalSearch=true`);
    const j = await r.json().catch(() => ({}));
    return (j.patientSearchResults || []).filter((p: any) => p.nationalId === id).map((p: any) => String(p.patientID));
  }, { ln: last, id: nid });
}

type Post = { pk: string; status: string; body: string };
function watchPosts(page: Page) {
  const posts: Post[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !ENTRY.test(new URL(req.url()).pathname)) return;
    const body = req.postData() || '{}';
    try {
      const b = JSON.parse(body);
      const pp = b.patientProperties || {};
      posts.push({ pk: String(pp.patientPK || ''), status: String(pp.patientUpdateStatus || b.patientUpdateStatus || ''), body });
    } catch { posts.push({ pk: '', status: 'unparsed', body }); }
  });
  return posts;
}

async function stillThere(page: Page) {
  const m = page.locator('.cds--modal.is-visible').filter({ hasText: /Still There/i });
  if (await m.isVisible()) await m.getByRole('button').filter({ hasNotText: /log ?out/i }).last().click().catch(() => undefined);
}

async function openEnterOrder(page: Page) {
  await page.goto(`${BASE}/order/clinical/enter`);
  await page.locator('#sampleType-0').waitFor({ timeout: 60000 });
}

async function typeNewPatient(page: Page, last: string, nid: string) {
  await page.getByTestId('patient-search-section').getByRole('button', { name: /^New Patient$/ }).click();
  await page.locator('#nationalId').fill(nid);
  await page.locator('#lastName').fill(last);
  await page.locator('#firstName').fill('Newby');
  await page.locator('label[for="radio-2"]').click();
  const dob = page.locator('#date-picker-default-id');
  await dob.fill('04/05/1991');
  await dob.press('Tab');
}

async function pickSerumAndFirstTest(page: Page) {
  const types = await page.evaluate(async () => (await (await fetch('/api/OpenELIS-Global/rest/user-sample-types')).json()));
  const serum = types.find((t: any) => /^serum$/i.test(t.value)) || types[0];
  await page.locator('#sampleType-0').selectOption(String(serum.id));
  const first = page.locator('input[id^="test-0-"]').first();
  await first.waitFor({ state: 'attached', timeout: 20000 });
  await page.locator(`label[for="${await first.getAttribute('id')}"]`).click();
}

// v4 footer: "Save and next" moves to the next step, "Save and exit" returns to the order list.
async function save(page: Page, which: 'next' | 'exit') {
  const b = page.getByRole('button', { name: which === 'next' ? /^Save and next$/i : /^Save and exit$/i }).last();
  await expect(b, `Save and ${which} should be enabled`).toBeEnabled({ timeout: 15000 });
  const resp = page.waitForResponse((r) => r.request().method() === 'POST' && ENTRY.test(new URL(r.url()).pathname), { timeout: 60000 });
  await b.click();
  expect((await resp).status(), 'order save should succeed').toBeLessThan(400);
  await page.waitForTimeout(1500);
  await stillThere(page);
}

test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

test('TC-DUPPAT-01 new patient, Save and next, Save and exit gives one patient (OGC-1407)', async ({ page }) => {
  const last = `Qadpa${letters(6)}`, nid = `QADPA${Date.now()}`;
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page, 'next');
  await expect(page, 'Save and next should move to Prepare Samples').toHaveURL(/\/order\/clinical\/collect/, { timeout: 20000 });
  await save(page, 'exit');
  const ids = await patientsFor(page, last, nid);
  expect(ids.length, `one order saved twice must leave ONE patient for ${nid}, found ${ids.join(', ')}`).toBe(1);
});

test('TC-DUPPAT-02 saves after the first carry the saved patient id (OGC-1407)', async ({ page }) => {
  const last = `Qadpb${letters(6)}`, nid = `QADPB${Date.now()}`;
  const posts = watchPosts(page);
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page, 'next');
  await save(page, 'exit');
  expect(posts.length, 'two saves should send two POSTs').toBe(2);
  expect(posts[0].status, 'the first save creates the patient').toBe('ADD');
  const ids = await patientsFor(page, last, nid);
  expect(posts[1].pk, `the second save must reference the patient created by the first, got ${posts[1].pk}/${posts[1].status}`).toBe(ids[0]);
  expect(posts[1].status, 'the second save must not ADD again').not.toBe('ADD');
});

test('TC-DUPPAT-03 existing patient chosen from the search stays one patient (guard)', async ({ page }) => {
  const last = `Qadpc${letters(6)}`, nid = `QADPC${Date.now()}`;
  const c = await createPatientViaAPI(page, { nationalId: nid, firstName: 'Existy', lastName: last, gender: 'F', dateOfBirth: '01/01/1990' });
  expect(c.id, `seed patient should be created: ${c.detail || ''}`).toBeTruthy();
  const posts = watchPosts(page);
  await openEnterOrder(page);
  const sec = page.getByTestId('patient-search-section');
  await sec.getByPlaceholder(/Last Name/i).first().pressSequentially(last, { delay: 30 });
  await sec.getByRole('button', { name: /^Search$/ }).first().click();
  const row = sec.getByRole('row').filter({ hasText: new RegExp(last, 'i') }).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  const radio = row.locator('input[type="radio"]');
  if ((await radio.count()) && !(await radio.isChecked())) await row.locator('label').first().click();
  await expect(radio, 'the searched patient should be selected').toBeChecked({ timeout: 10000 });
  await pickSerumAndFirstTest(page);
  await save(page, 'next');
  expect(posts[0]?.pk, 'the order POST should carry the selected patient PK').toBe(String(c.id));
  expect(await patientsFor(page, last, nid), 'ordering for an existing patient must not add a patient').toEqual([String(c.id)]);
});

test('TC-DUPPAT-04 replayed add-without-id does not create a second patient (server guard, OGC-1407)', async ({ page }) => {
  const last = `Qadpd${letters(6)}`, nid = `QADPD${Date.now()}`;
  const posts = watchPosts(page);
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page, 'next');
  expect(await patientsFor(page, last, nid), 'the first save creates one patient').toHaveLength(1);
  const b = JSON.parse(posts[0].body);
  b.patientProperties = { ...(b.patientProperties || {}), patientPK: '', patientUpdateStatus: 'ADD' };
  const status = await page.evaluate(async (body) => {
    const r = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' }, body });
    return r.status;
  }, JSON.stringify(b));
  const ids = await patientsFor(page, last, nid);
  expect(ids.length, `a replayed ADD for the same national ID must not add a patient (replay answered ${status}), found ${ids.join(', ')}`).toBe(1);
});
