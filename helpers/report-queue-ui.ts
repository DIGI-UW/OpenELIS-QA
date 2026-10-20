/**
 * helpers/report-queue-ui.ts
 *
 * Screen drivers for the screen-driven Report Print Queue cases (TC-RPQ-40 on):
 * result entry on /Results, release on /validation, and Reports users for the
 * role and lab-unit checks. Written 2026-10-20 against testing (3.3.0-SNAPSHOT
 * with #4771). Tests 7, 8, 9 (cholesterol, HDL, triglycerides) are used because
 * testing's QA_AUTO calculation rules recompute GPT/ALAT, GOT/ASAT, Creatinine and
 * Amylase on any change.
 */
import { Browser, Page, expect } from '@playwright/test';
import { API, j } from './report-queue';

/** Type a value into a test's result box on /Results?accessionNumber= and press that row's Save (acknowledging a critical value). */
export async function enterOnScreen(page: Page, labNo: string, testName: string, value: string, opts: { edit?: boolean } = {}): Promise<void> {
  await page.goto(`/Results?accessionNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
  const box = page.getByRole('textbox', { name: `Result for ${testName}(Serum)` });
  const row = page.locator('tr').filter({ has: page.getByText(`${testName}(Serum)`, { exact: true }) }).first();
  if (opts.edit) {
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
  }
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.fill(value);
  await box.press('Tab');
  const saved = page.waitForResponse((r) => /\/rest\/results-entry\/analysis\/\d+\/result/.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 });
  await row.getByRole('button', { name: 'Save' }).click();
  // A critical value asks for acknowledgement before it saves.
  const ack = page.getByRole('button', { name: 'Acknowledge and save' });
  await Promise.race([saved.catch(() => null), ack.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null)]);
  if (await ack.isVisible().catch(() => false)) await ack.click();
  expect((await saved).status(), `result save on ${labNo} ${testName}`).toBe(200);
}

/** Open /validation for one lab number and load its results. */
async function openValidation(page: Page, labNo: string): Promise<void> {
  await page.goto(`/validation?labNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('Lab number')).toHaveValue(labNo, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Load results' }).click();
  await expect(page.getByText(labNo).first()).toBeVisible({ timeout: 30_000 });
}

/** Release every result in the Clear lane through "Release all clear" and its confirmation. */
export async function releaseClearOnScreen(page: Page, labNo: string): Promise<void> {
  await openValidation(page, labNo);
  await page.getByRole('button', { name: /^Release all clear \(\d+\)$/ }).first().click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Release all clear results' });
  await dialog.getByRole('button', { name: /^Release all clear \(\d+\)$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** Review the one result that needs review (modified or critical) and Validate & release it. */
export async function reviewAndReleaseOnScreen(page: Page, labNo: string, ackComment?: string): Promise<void> {
  await openValidation(page, labNo);
  await page.getByRole('button', { name: 'Review →' }).first().click();
  if (ackComment) {
    await page.getByLabel('Acknowledgment comment').fill(ackComment);
    await page.getByRole('button', { name: 'I Acknowledge' }).click();
  }
  await page.getByRole('button', { name: 'Validate & release' }).click();
  await expect(page.getByRole('button', { name: 'Validate & release' })).toBeHidden({ timeout: 20_000 });
}

/** Click the row's Print button on the queue page (lookup by lab number) and wait for the print answer. */
export async function printOnScreen(page: Page, labNo: string): Promise<{ status: number; version: string | undefined }> {
  await page.goto(`/ReportPrintQueue?labNo=${labNo}`, { waitUntil: 'domcontentloaded' });
  const tr = page.locator('table tbody tr', { hasText: labNo });
  await expect(tr).toBeVisible({ timeout: 30_000 });
  const resp = page.waitForResponse((r) => /\/rest\/reportQueue\/print/.test(r.url()) && r.request().method() === 'POST');
  await tr.getByRole('button', { name: 'Print', exact: true }).click();
  const r = await resp;
  return { status: r.status(), version: r.headers()['x-report-version'] };
}

/** A numeric serum test with a critical range (normal 70 to 110, critical below 40 or above 400), created and activated through /rest/test-catalog. */
export async function criticalTest(page: Page): Promise<{ id: string; name: string }> {
  const tc = async (path: string, method: string, body?: unknown) => j(page, `${API}/test-catalog${path}`, { method, body });
  const stamp = String(Date.now()).slice(-5);
  const name = `QA RPQ Critical ${stamp}`;
  const c = await tc('/tests', 'POST', { name, reportingName: name, code: `QRC${stamp}`, domain: 'CLINICAL', labUnitId: '56', sampleTypeId: '2' });
  expect(c.status, 'critical test created').toBe(201);
  const id = String(c.body?.testId ?? c.body?.id);
  const sr0 = await tc(`/tests/${id}/sample-results`, 'GET');
  const put = await tc(`/tests/${id}/sample-results`, 'PUT', { testId: id, components: [{ id: sr0.body?.components?.[0]?.id, code: 'QRC', label: name, displayOrder: 0, resultType: 'N', isPrimary: true, showOnReport: true, allowMultipleReadings: false, significantDigits: 1, interpretations: [], options: [] }] });
  expect(put.status, 'component set').toBe(200);
  const comp = (await tc(`/tests/${id}/sample-results`, 'GET')).body?.components?.[0]?.id;
  const rg = await tc(`/tests/${id}/ranges`, 'PUT', { testId: id, ranges: [{ componentId: comp, gender: ' ', minAge: 0, maxAge: null, lowNormal: 70, highNormal: 110, lowCritical: 40, highCritical: 400, lowValid: 0, highValid: 800 }] });
  expect(rg.status, 'ranges set').toBe(200);
  await tc(`/tests/${id}/activate`, 'POST', {});
  expect((await tc(`/tests/${id}/basic-info`, 'GET')).body?.active, 'critical test active').toBeTruthy();
  return { id, name };
}

export interface QueueUser { login: string; password: string; role: string; section: string }
/** QA users for the role and scope cases; created by the admin page when they cannot log in yet. Test-only passwords. */
export const QUEUE_USERS: Record<'heme' | 'bio' | 'reception', QueueUser> = {
  heme: { login: process.env.RPQ_HEME_USER ?? 'qa_rpq_heme', password: process.env.RPQ_HEME_PASS ?? 'QArpqHeme1!', role: 'Reports', section: '36' },
  bio: { login: process.env.RPQ_BIO_USER ?? 'qa_rpq_bio', password: process.env.RPQ_BIO_PASS ?? 'QArpqBio1!', role: 'Reports', section: '56' },
  reception: { login: process.env.RPQ_RECEPT_USER ?? 'qa_rpq_recept', password: process.env.RPQ_RECEPT_PASS ?? 'QArpqRecept1!', role: 'Reception', section: 'AllLabUnits' },
};

async function loginAs(page: Page, u: QueueUser): Promise<boolean> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const name = page.locator('input[name="loginName"], #loginName, input[placeholder*="ser" i]').first();
  await name.waitFor({ state: 'visible', timeout: 30_000 });
  await name.fill(u.login);
  await page.locator('input[type="password"]').first().fill(u.password);
  await page.getByRole('button', { name: /^login$/i }).first().click();
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20_000 }).catch(() => {});
  const s = await j(page, '/api/OpenELIS-Global/session');
  return !!s.body?.authenticated && s.body?.loginName === u.login;
}

/** A page logged in as the user, creating the user from the admin page first if needed. */
export async function pageAs(browser: Browser, admin: Page, u: QueueUser): Promise<Page> {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: process.env.BASE ?? 'https://testing.openelis-global.org', storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  if (await loginAs(page, u)) return page;
  const pre = (await j(admin, `${API}/UnifiedSystemUser`)).body;
  const role = [...(pre?.labUnitRoles ?? [])].find((r: any) => String(r.roleName).trim() === u.role);
  expect(role, `lab-unit role ${u.role} exists`).toBeTruthy();
  const exp = new Date(); exp.setFullYear(exp.getFullYear() + 5);
  const dd = String(exp.getDate()).padStart(2, '0'); const mm = String(exp.getMonth() + 1).padStart(2, '0');
  const r = await j(admin, `${API}/UnifiedSystemUser`, { method: 'POST', body: {
    loginUserId: '', systemUserId: '', userLoginName: u.login, userPassword: u.password, confirmPassword: u.password,
    userFirstName: 'QA', userLastName: `Rpq ${u.role}`, expirationDate: `${dd}/${mm}/${exp.getFullYear()}`,
    accountLocked: 'N', accountDisabled: 'N', accountActive: 'Y', timeout: '480', selectedRoles: [], testSectionId: '',
    selectedLabUnitRoles: [], selectedTestSectionLabUnits: { [u.section]: [String(role.roleId)] }, systemUserIdToCopy: '', allowCopyUserRoles: 'N',
  } });
  expect(r.status, `user ${u.login} created`).toBe(200);
  expect(await loginAs(page, u), `${u.login} logs in`).toBe(true);
  return page;
}
