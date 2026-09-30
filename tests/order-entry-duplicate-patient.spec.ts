// OGC-1407: Enter Order v4 creates a new patient record on every save of an order for a NEW patient.
// Creates QA patients and orders (letters-only "Qadp..." last names, "QADP..." national IDs).
//
// TC-DUPPAT-01  New patient typed in, Save, Save, Save & Next  -> exactly one patient for that national ID
// TC-DUPPAT-02  New patient typed in, Save & Next, Save on Collect -> exactly one patient
// TC-DUPPAT-03  Guard: existing patient chosen from the search, Save & Next -> still one patient
// TC-DUPPAT-04  Every save after the first carries the saved patientPK (not ADD with an empty PK)
//
// FLIP-WHEN-FIXED: 01, 02 and 04 are test.fail() tripwires asserting the spec. When OGC-1407 is fixed,
// Playwright reports "Expected to fail, but passed": remove test.fail() and keep the assertions.
import { test, expect, Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { createPatientViaAPI } from '../helpers/data-factory';

test.setTimeout(240000);
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

async function patientsFor(page: Page, last: string, nid: string): Promise<string[]> {
  return page.evaluate(async ({ ln, id }) => {
    const r = await fetch(`/api/OpenELIS-Global/rest/patient-search-results?lastName=${ln}&firstName=&STNumber=&subjectNumber=&nationalID=&labNumber=&guid=&dateOfBirth=&gender=&suppressExternalSearch=true`);
    const j = await r.json().catch(() => ({}));
    return (j.patientSearchResults || []).filter((p: any) => p.nationalId === id).map((p: any) => String(p.patientID));
  }, { ln: last, id: nid });
}

function watchPosts(page: Page) {
  const posts: { pk: string; status: string }[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !/\/rest\/SamplePatientEntry$/.test(new URL(req.url()).pathname)) return;
    try {
      const b = JSON.parse(req.postData() || '{}');
      const pp = b.patientProperties || {};
      posts.push({ pk: String(pp.patientPK || ''), status: String(pp.patientUpdateStatus || b.patientUpdateStatus || '') });
    } catch { posts.push({ pk: '', status: 'unparsed' }); }
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

async function save(page: Page, next = false) {
  const b = next ? page.getByRole('button', { name: /Save (&|and) Next/i }).first() : page.getByRole('button', { name: /^Save$/ }).last();
  await expect(b, `${next ? 'Save & Next' : 'Save'} should be enabled`).toBeEnabled({ timeout: 15000 });
  const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname), { timeout: 60000 });
  await b.click();
  expect((await resp).status(), 'order save should succeed').toBeLessThan(400);
  await page.waitForTimeout(1500);
  await stillThere(page);
}

test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

test('TC-DUPPAT-01 new patient, Save, Save, Save & Next gives one patient (OGC-1407)', async ({ page }) => {
  test.fail(true, 'OGC-1407: each save posts ADD with an empty patientPK and creates another patient');
  const last = `Qadpa${letters(6)}`, nid = `QADPA${Date.now()}`;
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page);
  await save(page);
  await save(page, true);
  const ids = await patientsFor(page, last, nid);
  expect(ids.length, `one order saved three times must leave ONE patient for ${nid}, found ${ids.join(', ')}`).toBe(1);
});

test('TC-DUPPAT-02 new patient, Save & Next, Save on Collect gives one patient (OGC-1407)', async ({ page }) => {
  test.fail(true, 'OGC-1407: the Collect save re-sends ADD and creates a second patient');
  const last = `Qadpb${letters(6)}`, nid = `QADPB${Date.now()}`;
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page, true);
  await save(page);
  const ids = await patientsFor(page, last, nid);
  expect(ids.length, `Enter then Collect must leave ONE patient for ${nid}, found ${ids.join(', ')}`).toBe(1);
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
  await save(page, true);
  expect(posts[0]?.pk, 'the order POST should carry the selected patient PK').toBe(String(c.id));
  expect(await patientsFor(page, last, nid), 'ordering for an existing patient must not add a patient').toEqual([String(c.id)]);
});

test('TC-DUPPAT-04 saves after the first carry the saved patientPK (OGC-1407)', async ({ page }) => {
  test.fail(true, 'OGC-1407: patientPK is not propagated after the first save');
  const last = `Qadpd${letters(6)}`, nid = `QADPD${Date.now()}`;
  const posts = watchPosts(page);
  await openEnterOrder(page);
  await typeNewPatient(page, last, nid);
  await pickSerumAndFirstTest(page);
  await save(page);
  await save(page);
  expect(posts.length, 'two saves should send two POSTs').toBe(2);
  expect(posts[0].status, 'the first save creates the patient').toBe('ADD');
  expect(posts[1].pk, `the second save must reference the patient created by the first, got ${JSON.stringify(posts[1])}`).not.toBe('');
  expect(posts[1].status, 'the second save must not ADD again').not.toBe('ADD');
});
