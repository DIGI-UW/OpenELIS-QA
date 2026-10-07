// Electronic signatures, end to end (TC-ESIGW-01, 03, 04, 05a).
//
// WHY: every earlier e-signature spec ran with the site setting off, so nothing ever signed.
// Casey approved (2026-09-28) completing the signature through the harness with the suite's
// own login (ADMIN, from helpers/test-helpers: env OE_USER/OE_PASS, default admin account).
// The password is typed only into the app's own certification dialog, in a Playwright
// browser, never into anyone's own browser.
//
// SETTINGS: turns on electronicSignatureEnabled (Site Information) and resultsEntryUnifiedRoute
// (Result Configuration) for the run, and puts back whatever they were in afterAll.
//
// Seeds its own patient and order (QA- data). Serial: the cases share one order.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { seedModifiableOrder } from '../helpers/data-factory';

const REST = '/api/OpenELIS-Global/rest';
const RDT_TEST = '31'; // "HIV rapid test HIV": dictionary result, Serum; same test qc-hold-release uses
// Generic config menus (GenericConfigEdit): name -> the menu that holds it.
// REWORKED 2026-10-08: resultsEntryUnifiedRoute was retired on develop (OpenELIS-Global-2 #4528; the
// unified Results page is the only route), so it is optional: set where a build still has it (3.2.x),
// never a reason to skip. Skipping on it left the later cases running without a seeded order.
const SETTINGS: Array<{ menu: string; record: string; name: string; value: string; optional?: boolean }> = [
  { menu: 'SiteInformationMenu', record: 'SiteInformation', name: 'electronicSignatureEnabled', value: 'true' },
  { menu: 'ResultConfigurationMenu', record: 'ResultConfiguration', name: 'resultsEntryUnifiedRoute', value: 'true', optional: true },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

const state: { accession?: string; labUnit?: string; original?: Array<{ menu: string; record: string; name: string; value: string }>; logBefore?: number } = {};

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.context().request.get(`${BASE}${REST}${p}`, { headers: { Accept: 'application/json' } });
  expect(r.status(), `GET ${p}`).toBe(200);
  return r.json();
}

async function readConfig(page: Page, menu: string, name: string): Promise<{ id: string; value: string } | null> {
  const m = await getJson(page, `/${menu}`);
  const row = (m.menuList || []).find((x: any) => x.name === name);
  return row ? { id: String(row.id), value: String(row.value) } : null;
}

async function setConfig(page: Page, menu: string, record: string, name: string, value: string): Promise<void> {
  const cur = await readConfig(page, menu, name);
  expect(cur, `${menu} has "${name}"`).not.toBeNull();
  if (cur!.value === value) return;
  const body = { ...(await getJson(page, `/${record}?ID=${cur!.id}`)), value };
  const status = await page.evaluate(
    async ({ url, body }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
        body: JSON.stringify(body),
      });
      return r.status;
    },
    { url: `${REST}/${record}?ID=${cur!.id}`, body }
  );
  expect(status, `POST ${record} ${name}=${value}`).toBeLessThan(300);
  expect((await readConfig(page, menu, name))!.value, `${name} reads back`).toBe(value);
}

async function restore(browser: Browser): Promise<void> {
  if (!state.original) return;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await login(page, ADMIN.user, ADMIN.pass);
    for (const s of state.original) await setConfig(page, s.menu, s.record, s.name, s.value);
  } finally {
    await ctx.close();
  }
}

/**
 * Complete whichever signature dialog opens: the first-use Electronic Signature
 * Certification (acknowledge + password) or the per-action Sign dialog (password).
 * Returns the dialog's title so the case can say which one it met.
 */
async function signDialog(page: Page): Promise<string> {
  const titles: string[] = [];
  // First use shows the Certification dialog; the per-action Sign dialog may follow it. Handle up to two.
  for (let round = 0; round < 2; round++) {
    const dialog = page.locator('.cds--modal.is-visible, [role="dialog"]:visible').filter({ hasText: /signature|certif|sign/i }).first();
    const pw = page.locator('input[type="password"]').locator('visible=true').first();
    if (round === 0) await expect(dialog, 'a signature dialog opens').toBeVisible({ timeout: 20000 });
    // A second dialog counts only if a new password box actually appears (a closing modal
    // can still match the dialog selector for a moment).
    else if (await page.waitForTimeout(2500).then(() => false) || !(await pw.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) break;
    test.info().annotations.push({ type: 'sign-round', description: String(round) });
    titles.push(((await dialog.locator('h2, h3, .cds--modal-header__heading').first().textContent().catch(() => '')) || '').trim());
    // The dialog body renders after its title: wait for the password box before deciding
    // whether this is the first-use certification (with an acknowledgement) or a plain Sign.
    await page.locator('input[type="password"]').locator('visible=true').first().waitFor({ timeout: 15000 });
    // Acknowledgement (first use). Try the accessible checkbox, then its label; record what the
    // DOM holds if neither ticks it, so a failure here says why.
    const ackBox = page.getByRole('checkbox', { name: /I have read/i }).first();
    const hasAck = await page.getByText(/I have read and understand/i).first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
    if (hasAck) {
      if (!(await ackBox.isChecked().catch(() => false))) await ackBox.check({ force: true }).catch(() => undefined);
      if (!(await ackBox.isChecked().catch(() => false))) await page.locator('label:has-text("I have read")').last().click({ force: true }).catch(() => undefined);
      if (!(await ackBox.isChecked().catch(() => false))) {
        const dom = await page.evaluate(() => Array.from(document.querySelectorAll('input[type=checkbox]')).map(i => `${i.id}|${(i as HTMLInputElement).checked}|${(i as HTMLElement).offsetParent !== null}|${i.closest('label, div')?.textContent?.trim().slice(0, 40)}`));
        test.info().annotations.push({ type: 'ack-dom', description: dom.join(' ; ') });
      }
      await expect(ackBox, 'acknowledgement ticked').toBeChecked();
    }
    // The per-action Sign dialog asks for the username too on the first signature of a session.
    const user = page.getByPlaceholder(/username/i).locator('visible=true').first();
    if (await user.isVisible().catch(() => false)) await user.fill(ADMIN.user);
    await page.locator('input[type="password"]').locator('visible=true').first().fill(ADMIN.pass);
    const confirm = page.getByRole('button', { name: /^(certify|sign|confirm|continue|submit)/i }).locator('visible=true').last();
    await expect(confirm).toBeEnabled({ timeout: 10000 });
    const label = ((await confirm.textContent()) || '').trim();
    await confirm.click();
    // This dialog is done when its own button is gone (the next dialog, if any, has a different one).
    await expect(page.getByRole('button', { name: label, exact: true }).locator('visible=true'), `"${label}" dialog closes`).toHaveCount(0, { timeout: 20000 });
  }
  return titles.join(' then ');
}

async function signatureLogCount(page: Page): Promise<number> {
  await page.goto(`${BASE}/qa/qms/e-signature-log`);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  const text = await page.locator('main').innerText().catch(() => '');
  const m = text.match(/(\d+)\s*(?:entries|records|signatures|items)/i) || text.match(/of\s+(\d+)\s+items/i);
  if (m) return Number(m[1]);
  return await page.locator('main tbody tr').count();
}

function resultsRow(page: Page) {
  return page.locator('tr').filter({ hasText: state.accession! }).first();
}

test.describe('Electronic signatures end to end (TC-ESIGW)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test.afterAll(async ({ browser }) => {
    await restore(browser);
  });

  test('TC-ESIGW-00 [setup]: signatures on, order seeded', async ({ page }) => {
    state.original = [];
    const present: typeof SETTINGS = [];
    for (const s of SETTINGS) {
      const cur = await readConfig(page, s.menu, s.name);
      if (!cur && s.optional) continue;
      test.skip(!cur, `this build has no "${s.name}" setting`);
      state.original.push({ ...s, value: cur!.value });
      present.push(s);
    }
    for (const s of present) await setConfig(page, s.menu, s.record, s.name, s.value);
    const info = await getJson(page, `/test-catalog/tests/${RDT_TEST}/basic-info`);
    state.labUnit = String(info.labUnitId);
    const { accession } = await seedModifiableOrder(page, { testIds: [RDT_TEST] });
    state.accession = accession;
    expect(state.accession, 'order seeded').toMatch(/\S+/);
    state.logBefore = await signatureLogCount(page);
  });

  test('TC-ESIGW-03: with signatures on, Results Save asks for a signature; Cancel saves nothing, signing saves', async ({ page }) => {
    await page.goto(`${BASE}/Results?testSectionId=${state.labUnit}`);
    const row = resultsRow(page);
    await expect(row).toBeVisible({ timeout: 45000 });
    const select = row.locator('select[id^="unifiedResultValue-"]').first();
    const value = await select.evaluate((s: HTMLSelectElement) => Array.from(s.options).map((o) => o.value).find((v) => v && v !== '0') || '');
    expect(value, 'the dictionary result has an option').not.toBe('');

    // Cancel first: nothing may be saved.
    await select.selectOption(value);
    await row.getByRole('button', { name: /^Save$/ }).click();
    const dialog = page.locator('.cds--modal.is-visible, [role="dialog"]:visible').filter({ hasText: /signature|certif|sign/i }).first();
    await expect(dialog, 'Save opens a signature dialog').toBeVisible({ timeout: 20000 });
    await dialog.getByRole('button', { name: /cancel/i }).first().click();
    await page.reload();
    await expect(resultsRow(page)).toBeVisible({ timeout: 45000 });
    await expect(resultsRow(page), 'Cancel did not save the result').not.toContainText(/Accepted by technician/i);

    // Now sign.
    const row2 = resultsRow(page);
    await row2.locator('select[id^="unifiedResultValue-"]').first().selectOption(value);
    await row2.getByRole('button', { name: /^Save$/ }).click();
    const title = await signDialog(page);
    test.info().annotations.push({ type: 'dialog', description: title });
    await expect(resultsRow(page), 'signed save is accepted').toContainText(/Accepted by technician/i, { timeout: 30000 });
  });

  test('TC-ESIGW-04: Validate & release asks for a signature and releases once signed', async ({ page }) => {
    await page.goto(`${BASE}/validation?type=routine&testSectionId=${state.labUnit}`);
    const row = page.getByRole('row').filter({ hasText: state.accession! }).first();
    await expect(row).toBeVisible({ timeout: 45000 });
    // The expand chevron ("Expand Row" or "Expand current row" depending on the Carbon version).
    await row.getByRole('button', { name: /expand/i }).first().click();
    const release = page.getByRole('button', { name: /Validate & release/i }).first();
    await expect(release).toBeVisible({ timeout: 15000 });
    const posts: string[] = [];
    page.on('response', async (r) => {
      if (r.request().method() !== 'GET' && /AccessionValidation|validation|signature|esign/i.test(r.url())) {
        posts.push(`${r.request().method()} ${r.url().replace(BASE, '')} -> ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
      }
    });
    await release.click();
    const title = await signDialog(page);
    await page.waitForTimeout(5000);
    test.info().annotations.push({ type: 'dialogs', description: title }, { type: 'posts', description: posts.join(' || ') || 'none' });
    // The success toast is gone within a few seconds, so the proof is the release call's answer and the queue.
    const released = posts.some((p) => /\/release -> 200 .*"outcome":"released"/.test(p));
    const seen = posts.length ? posts.join(' ; ') : 'none';
    expect(released, `release after signing; requests: ${seen}`).toBe(true);
    await page.reload();
    await page.waitForTimeout(3000);
    await expect(page.getByRole('row').filter({ hasText: state.accession! }), 'released row leaves the queue').toHaveCount(0);
  });

  test('TC-ESIGW-01: each signature writes an entry to the Electronic Signature Log', async ({ page }) => {
    const after = await signatureLogCount(page);
    expect(after, `E-Signature Log entries (before ${state.logBefore})`).toBeGreaterThanOrEqual((state.logBefore ?? 0) + 2);
  });
});
