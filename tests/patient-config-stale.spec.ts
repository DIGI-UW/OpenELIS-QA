/**
 * tests/patient-config-stale.spec.ts
 *
 * Patient Entry Configuration changes do not reach screens that are already open.
 * Written 2026-09-28 against testing 3.2.3.0 (release-qa-3.2.3 R97), from Casey's report:
 * "Entered order, made spelling error, went to edit patient, changed spelling of the patient
 * name, patient ID was required even though it's switched off in admin."
 *
 * Cause seen on testing: the React app reads /rest/configuration-properties once when it loads.
 * After an admin saves a setting, only the admin's own screen reloads it (GenericConfigEdit
 * calls reloadConfiguration). Every other open screen keeps the old value. CreatePatientForm
 * treats National ID as required unless the value is exactly "false", so a screen opened while
 * "National ID required" was true keeps demanding it after the admin turns it off, and Save
 * sends nothing until the page is reloaded.
 *
 * Leaves "National ID required" = false (Casey's baseline for testing). Creates one QA patient.
 */
import { test, expect, Page } from '@playwright/test';
import { createPatientViaAPI } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';
const NID_ROW = 'National ID required';

/** Set Admin > Patient Entry Configuration > "National ID required" the way the admin screen does. */
async function setNationalIdRequired(page: Page, value: 'true' | 'false') {
  const res = await page.evaluate(async ({ API, NID_ROW, value }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const menu = await (await fetch(`${API}/PatientConfigurationMenu`, { credentials: 'include' })).json();
    const row = menu.menuList.find((m: any) => m.name === NID_ROW);
    const form = await (await fetch(`${API}/PatientConfiguration?ID=${row.id}`, { credentials: 'include' })).json();
    form.value = value;
    const post = await fetch(`${API}/PatientConfiguration?ID=${row.id}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(form),
    });
    const served = await (await fetch(`${API}/configuration-properties`, { credentials: 'include' })).json();
    return { status: post.status, served: served.PATIENT_NATIONAL_ID_REQUIRED };
  }, { API, NID_ROW, value });
  expect(res.status, `save "${NID_ROW}" = ${value}`).toBe(200);
  expect(res.served, 'server reports the new value').toBe(value);
}

async function openForEdit(page: Page, id: string) {
  await page.goto(`${BASE}/PatientManagement/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lastName')).toHaveValue(/Staleconfig/, { timeout: 20_000 });
  // The toggle sits under the sticky header, so a pointer click is intercepted; click it in-page.
  await page.locator('#patient-edit-toggle').evaluate((e) => (e as HTMLElement).click());
  const save = page.getByRole('button', { name: 'Save', exact: true }).locator('visible=true').first();
  await expect(save).toBeVisible({ timeout: 10_000 });
  return save;
}

async function fixFirstName(page: Page, save: ReturnType<Page['locator']>, name: string) {
  await page.locator('input[name="firstName"]').fill(name);
  await page.locator('input[name="firstName"]').press('Tab');
  const posted = page.waitForResponse(
    (r) => r.url().includes('/rest/PatientManagement') && r.request().method() === 'POST',
    { timeout: 8_000 },
  ).catch(() => null);
  await save.click();
  const resp = await posted;
  const nidError = await page.getByText('National ID Required', { exact: true }).isVisible().catch(() => false);
  return { status: resp?.status() ?? null, nidError };
}

test.describe('R97: Patient Entry Configuration and open screens', () => {
  let ctx: any;
  let admin: Page;
  let patientId: string;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
    admin = await ctx.newPage();
    await admin.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await admin.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15_000 }).catch(() => {});
    await setNationalIdRequired(admin, 'false');
    const created = await createPatientViaAPI(admin, { nationalId: '', firstName: 'Speling', lastName: 'Staleconfig', gender: 'M', dateOfBirth: '03/03/1988' });
    expect(created.id, created.detail).toBeTruthy();
    patientId = created.id!;
  });

  test.afterAll(async () => {
    await setNationalIdRequired(admin, 'false').catch(() => {});
    await ctx?.close();
  });

  test('TC-PCFG-01: a screen opened after the setting is turned off saves a patient with no National ID', async () => {
    const page = await ctx.newPage();
    const save = await openForEdit(page, patientId);
    const r = await fixFirstName(page, save, 'Spelling');
    expect(r.nidError, 'National ID not demanded').toBe(false);
    expect(r.status, 'PatientManagement POST').toBe(200);
    await page.close();
  });

  test('TC-PCFG-02: a screen already open when the admin turns "National ID required" off stops demanding it', async () => {
    await setNationalIdRequired(admin, 'true');
    const page = await ctx.newPage();
    const save = await openForEdit(page, patientId); // loads while the setting is on
    await setNationalIdRequired(admin, 'false'); // admin turns it off; this screen is not reloaded
    const r = await fixFirstName(page, save, 'Spellingz');
    await page.close();
    // FLIP-WHEN-FIXED (R97). Observed 2026-09-28 twice by hand in two tabs and once in this spec:
    // "National ID Required" under the field, Save sends no request, while
    // /rest/configuration-properties already answers "false". A reload clears it.
    // Expected: the screen picks up the change, or the server decides.
    test.fail();
    expect(r.nidError, 'National ID not demanded after the admin turned it off').toBe(false);
    expect(r.status, 'PatientManagement POST').toBe(200);
  });
});
