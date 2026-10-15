/**
 * tests/eqa-order-intake.spec.ts
 *
 * An EQA (proficiency testing) sample through the v4 order flow: Enter Order with the EQA box
 * (OGC-1483) and Sample Check when the panel item fails intake (OGC-1488). Both fixed by
 * OpenELIS-Global-2 #4731 (merged 15 Oct 2026). Catalogue: eqa-order-intake.md (TC-EQAOI-*).
 *
 * Casey's calls on OGC-1483 (13 Oct): the scheme list is the lab's active enrollments; the
 * enrollment id is what is stored; EQA with no scheme is refused ("Choose the EQA scheme this
 * sample belongs to."); a Cycle field lists the enrollment's open cycles and prefills the
 * deadline; no cycle warns and saves; a cycle of another scheme is refused by the server; EQA mode
 * has no patient; save toasts name the lab number. OGC-1488: PT material cannot be recollected,
 * so an EQA sample that fails intake is rejected (a rejection reason is required, a comment is
 * optional), never resampled.
 *
 * What these cases add to the developer's own specs (ogc-1483, ogc-1488 in #4731): every save is
 * read back from the database (sample_eqa, sample_human, sample_item, note), and the server's
 * own refusals are reached by changing the request the screen sends, so a check that lives only
 * in the browser does not pass.
 *
 * DATA. Each run makes a scheme "QA-EQAOI <stamp>", an active enrollment in it with one open cycle,
 * a second scheme with its own open cycle (for the wrong-scheme case), and a withdrawn
 * enrollment. A CLINICAL intake checklist item "QA-EQAOI intact <stamp>" is added for the Sample
 * Check cases (Sample Check only offers actions when the domain has a checklist) and deactivated
 * at the end. Nothing is deleted.
 *
 * Written 2026-10-15 against local develop (images 2026-10-15). DB read-back needs the local
 * stack (BASE localhost:10443); elsewhere the DB cases skip and say why.
 */
import { test, expect, type Page } from '@playwright/test';
import { api, ready, db, day, fixtures, note } from './helpers/eqa-deep';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

type Fx = {
  scheme: string; enrollmentId: string; cycleId: string; otherCycleId: string; withdrawnId: string;
  checklistItemId: string; checklistLabel: string; labNoCycle: string; labNoNoCycle: string;
};
const { F, save } = fixtures<Fx>('order-intake');
const ENTER = '/order/clinical/enter?eqa=true';
const SAVE_RE = /\/rest\/SamplePatientEntry$/;
const NEED_DB = 'database read-back needs the local stack (BASE https://localhost:10443)';
const hasDb = () => db('select 1') === '1';
const q = (s: string) => s.replace(/'/g, "''");

async function openEnter(page: Page) {
  await page.goto(ENTER, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#labNumber'), 'a lab number is issued').not.toHaveValue('', { timeout: 60_000 });
  await expect(page.locator(`#eqaProgramId option[value="${F.enrollmentId}"]`), 'the scheme list has loaded').toHaveCount(1, { timeout: 60_000 });
  return page.locator('#labNumber').inputValue();
}

/** Pick Serum and its first test, the way the developer's spec does. */
async function pickSampleAndTest(page: Page) {
  const section = page.getByTestId('order-sample-test-section');
  await section.getByLabel('Sample Type').selectOption({ label: 'Serum' });
  const first = section.locator('input[type="checkbox"][id^="test-0-"]').first();
  await expect(first).toBeAttached({ timeout: 60_000 });
  await page.locator(`label[for="${await first.getAttribute('id')}"]`).click();
}

async function saveAndExit(page: Page) {
  const resp = page.waitForResponse((r) => SAVE_RE.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 60_000 });
  await page.getByRole('button', { name: /^Save and exit$/ }).click();
  return resp;
}

/** Send the next order save with some fields of sampleOrderItems changed, as a client could. */
async function tamperNextSave(page: Page, patch: Record<string, unknown>) {
  await page.route(SAVE_RE, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    body.sampleOrderItems = { ...(body.sampleOrderItems ?? {}), ...patch };
    await route.continue({ postData: JSON.stringify(body) });
  }, { times: 1 });
}

function sampleRow(labNo: string): { sampleId: string; eqa: string; human: string } {
  const sampleId = db(`select id from clinlims.sample where accession_number='${q(labNo)}'`) ?? '';
  return {
    sampleId,
    eqa: sampleId ? db(`select coalesce(eqa_enrollment_id::text,'')||'|'||coalesce(cycle_id::text,'')||'|'||coalesce(eqa_deadline::text,'') from clinlims.sample_eqa where sample_id=${sampleId}`) ?? '' : '',
    // A sample_human row may exist to carry the requester; what matters is that no patient is on it.
    human: sampleId ? db(`select count(*) from clinlims.sample_human where samp_id=${sampleId} and patient_id is not null`) ?? '' : '',
  };
}

test.describe('EQA order intake on the v4 order flow (TC-EQAOI)', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  // The checklist item added in TC-EQAOI-00 is deactivated once the suite ends.
  test.afterAll(async ({ browser }) => {
    if (!F.checklistItemId) return;
    const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await ready(page);
    await api(page, 'PUT', `/sample-acceptance-checklist/admin/items/${F.checklistItemId}`, { label: F.checklistLabel, active: false });
    await ctx.close();
  });

  test('TC-EQAOI-00 [setup]: an active enrollment with an open cycle, a second scheme with its own cycle, a withdrawn enrollment, and a CLINICAL intake checklist item', async ({ page }) => {
    const s = F.S;
    if (!F.enrollmentId) {
      F.scheme = `QA-EQAOI ${s}`;
      const other = `QA-EQAOI other ${s}`;
      for (const name of [F.scheme, other]) {
        const p = await api(page, 'POST', '/eqa/programs', { name, schemeType: 'INTERNATIONAL_PT', provider: 'QA-EQAOI' });
        expect(p.status, `scheme ${name}: ${p.text}`).toBeLessThan(300);
      }
      const a = await api(page, 'POST', '/eqa/my-programs', { programName: F.scheme, provider: 'QA-EQAOI' });
      expect(a.status, a.text).toBeLessThan(300);
      F.enrollmentId = String(a.json.id);
      const o = await api(page, 'POST', '/eqa/my-programs', { programName: other, provider: 'QA-EQAOI' });
      expect(o.status, o.text).toBeLessThan(300);
      const wd = await api(page, 'POST', '/eqa/my-programs', { programName: `QA-EQAOI withdrawn ${s}`, provider: 'QA-EQAOI' });
      expect(wd.status, wd.text).toBeLessThan(300);
      F.withdrawnId = String(wd.json.id);
      const st = await api(page, 'PUT', `/eqa/my-programs/${F.withdrawnId}/status`, { status: 'Withdrawn', reason: 'QA-EQAOI', effectiveDate: day(0) });
      expect(st.status, st.text).toBeLessThan(300);
      const c = await api(page, 'POST', '/eqa/cycles/mine', { schemeName: F.scheme, cycleName: `QA-EQAOI cycle ${s}`, distributionDate: day(0), submissionDeadline: day(30) });
      expect(c.status, c.text).toBe(201);
      F.cycleId = String(c.json.id);
      const oc = await api(page, 'POST', '/eqa/cycles/mine', { schemeName: other, cycleName: `QA-EQAOI other cycle ${s}`, distributionDate: day(0), submissionDeadline: day(30) });
      expect(oc.status, oc.text).toBe(201);
      F.otherCycleId = String(oc.json.id);
      save();
    }
    if (!F.checklistItemId) {
      F.checklistLabel = `QA-EQAOI container intact ${s}`;
      const ci = await api(page, 'POST', '/sample-acceptance-checklist/admin/items', { domain: 'CLINICAL', label: F.checklistLabel });
      expect(ci.status, ci.text).toBe(200);
      F.checklistItemId = String(ci.json.id);
      save();
    }
  });

  // ── Enter Order (OGC-1483) ────────────────────────────────────────────────

  test('TC-EQAOI-01: the EQA Scheme list is exactly the lab\'s active enrollments: a withdrawn one is not offered', async ({ page }) => {
    await openEnter(page);
    const offered = await page.locator('#eqaProgramId option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    const active = ((await api(page, 'GET', '/eqa/my-programs?active=true')).json ?? []).map((e: any) => String(e.id));
    expect(active, 'the active list leaves the withdrawn enrollment out').not.toContain(F.withdrawnId);
    expect([...offered].sort(), 'offered = active enrollments').toEqual([...active].sort());
    expect(offered).not.toContain(F.withdrawnId);
  });

  test('TC-EQAOI-02: in EQA mode the order has no patient: "No patient" is ticked and locked and the patient search is not shown', async ({ page }) => {
    await openEnter(page);
    await expect(page.locator('#noPatientOverride')).toBeChecked();
    await expect(page.locator('#noPatientOverride')).toBeDisabled();
    await expect(page.locator('#order-patient-search-lastName'), 'no patient search').toHaveCount(0);
  });

  test('TC-EQAOI-03: with EQA ticked and no scheme the order cannot be saved: both Save buttons are disabled and the to-do list says "Choose the EQA scheme"', async ({ page }) => {
    await openEnter(page);
    await pickSampleAndTest(page);
    await expect(page.getByRole('button', { name: /^Save and exit$/ }), 'Save and exit is off').toBeDisabled();
    await expect(page.getByRole('button', { name: /^Save and next$/ }), 'Save and next is off').toBeDisabled();
    await expect(page.getByText(/Choose the EQA scheme/).first(), 'the screen says what is missing').toBeVisible();
    await page.locator('#eqaProgramId').selectOption(F.enrollmentId);
    await expect(page.getByRole('button', { name: /^Save and exit$/ }), 'on once a scheme is chosen').toBeEnabled({ timeout: 15_000 });
  });

  test('TC-EQAOI-04: the server refuses an EQA order with no scheme, and one naming a withdrawn enrollment (the screen cannot send either)', async ({ page }) => {
    for (const [what, patch] of [['no scheme', { eqaProgramId: '' }], ['a withdrawn enrollment', { eqaProgramId: F.withdrawnId }]] as const) {
      const labNo = await openEnter(page);
      await page.locator('#eqaProgramId').selectOption(F.enrollmentId);
      await pickSampleAndTest(page);
      await tamperNextSave(page, patch);
      const resp = await saveAndExit(page);
      const text = (await resp.text()).slice(0, 400);
      note('EQAOI-04', { what, status: resp.status(), text });
      expect(resp.status(), `${what}: refused, not saved and not a 500 (${text})`).toBeGreaterThanOrEqual(400);
      expect(resp.status(), text).toBeLessThan(500);
      if (hasDb()) expect(sampleRow(labNo).sampleId, `${what}: no order stored`).toBe('');
    }
  });

  test('TC-EQAOI-05: choosing a cycle prefills its deadline; the saved order stores the enrollment id, the cycle and the deadline, no patient link, and the toast names the lab number', async ({ page }) => {
    const labNo = await openEnter(page);
    await page.locator('#eqaProgramId').selectOption(F.enrollmentId);
    await expect(page.locator(`#eqaCycleId option[value="${F.cycleId}"]`), 'the open cycle is offered').toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(`#eqaCycleId option[value="${F.otherCycleId}"]`), 'not another scheme\'s cycle').toHaveCount(0);
    await page.locator('#eqaCycleId').selectOption(F.cycleId);
    await expect(page.locator('#eqaDeadline'), 'the deadline is the cycle\'s').toHaveValue(new RegExp(day(30).slice(0, 4)));
    await pickSampleAndTest(page);
    const resp = await saveAndExit(page);
    expect(resp.status(), (await resp.text()).slice(0, 300)).toBe(200);
    await expect(page.getByText(new RegExp(`Order ${labNo} has been saved`)).first(), 'the toast names the order').toBeVisible({ timeout: 30_000 });
    F.labNoCycle = labNo; save();
    test.skip(!hasDb(), NEED_DB);
    const row = sampleRow(labNo);
    const [enrollment, cycle, deadline] = row.eqa.split('|');
    expect(enrollment, 'the enrollment id, not the scheme id').toBe(F.enrollmentId);
    expect(db(`select count(*) from clinlims.eqa_lab_program_enrollment where id=${enrollment}`), 'it points at an enrollment').toBe('1');
    expect(cycle, 'linked to the chosen cycle').toBe(F.cycleId);
    expect(deadline, 'the cycle\'s deadline').toContain(day(30));
    expect(row.human, 'no patient linked').toBe('0');
  });

  test('TC-EQAOI-06: with no cycle chosen the screen warns, offers New cycle, and still saves; the order is stored with no cycle', async ({ page }) => {
    const labNo = await openEnter(page);
    await page.locator('#eqaProgramId').selectOption(F.enrollmentId);
    await expect(page.getByText(/not linked to a cycle, so it will not be submitted/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^New cycle$/ })).toBeVisible();
    await pickSampleAndTest(page);
    const resp = await saveAndExit(page);
    expect(resp.status(), (await resp.text()).slice(0, 300)).toBe(200);
    F.labNoNoCycle = labNo; save();
    test.skip(!hasDb(), NEED_DB);
    const [enrollment, cycle] = sampleRow(labNo).eqa.split('|');
    expect(enrollment).toBe(F.enrollmentId);
    expect(cycle, 'no cycle').toBe('');
  });

  test('TC-EQAOI-07: the server refuses a cycle that belongs to another scheme', async ({ page }) => {
    const labNo = await openEnter(page);
    await page.locator('#eqaProgramId').selectOption(F.enrollmentId);
    await pickSampleAndTest(page);
    await tamperNextSave(page, { eqaCycleId: F.otherCycleId });
    const resp = await saveAndExit(page);
    const text = (await resp.text()).slice(0, 400);
    note('EQAOI-07', { status: resp.status(), text });
    expect(resp.status(), `refused (${text})`).toBeGreaterThanOrEqual(400);
    expect(resp.status(), text).toBeLessThan(500);
    if (hasDb()) expect(sampleRow(labNo).sampleId, 'no order stored').toBe('');
  });

  // ── Sample Check (OGC-1488) ───────────────────────────────────────────────

  async function toSampleCheck(page: Page, labNo: string) {
    await page.goto(`/order/clinical/collect?order=${encodeURIComponent(labNo)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(`${labNo}-1`).first(), 'the specimen is on Collect').toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^Save and exit$/ }).click();
    await expect(page).toHaveURL(/highlight=/, { timeout: 60_000 });
    await page.goto(`/order/clinical/qa?order=${encodeURIComponent(labNo)}`, { waitUntil: 'domcontentloaded' });
  }

  test('TC-EQAOI-10: Sample Check offers Reject, not Resample, for an EQA sample, and shows no Patient block', async ({ page }) => {
    test.skip(!F.labNoCycle, 'needs the order from TC-EQAOI-05');
    await toSampleCheck(page, F.labNoCycle);
    await expect(page.getByRole('button', { name: /Reject$/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Resample$/ }), 'no resample for PT material').toHaveCount(0);
    await expect(page.getByText('Patient Information'), 'no patient block').toHaveCount(0);
  });

  test('TC-EQAOI-11: the server refuses an EQA reject with no reason, and with an unknown reason; the specimen stays unrejected', async ({ page }) => {
    test.skip(!F.labNoCycle, 'needs the order from TC-EQAOI-05');
    test.skip(!hasDb(), NEED_DB);
    const sampleId = sampleRow(F.labNoCycle).sampleId;
    const itemId = db(`select id from clinlims.sample_item where samp_id=${sampleId} order by sort_order limit 1`);
    expect(itemId, 'the specimen').toMatch(/^\d+$/);
    for (const [what, body] of [['no reason', { reason: 'QA no reason' }], ['an unknown reason', { reason: 'QA', rejectReasonId: '999999999' }]] as const) {
      const r = await api(page, 'POST', `/sample-acceptance-checklist/sample-item/${itemId}/reject`, body);
      note('EQAOI-11', { what, status: r.status, text: r.text.slice(0, 200) });
      expect(r.status, `${what}: ${r.text.slice(0, 200)}`).toBe(400);
    }
    expect(db(`select coalesce(rejected::text,'f') from clinlims.sample_item where id=${itemId}`), 'not rejected').not.toMatch(/^t/);
  });

  test('TC-EQAOI-12: Reject needs a chosen reason ("Choose a rejection reason."); with one, the specimen is rejected and keeps the reason and the comment', async ({ page }) => {
    test.skip(!F.labNoCycle, 'needs the order from TC-EQAOI-05');
    await toSampleCheck(page, F.labNoCycle);
    await page.getByRole('button', { name: /Reject$/ }).click();
    const commit = page.getByRole('button', { name: /Commit reject$/ });
    await commit.click();
    await expect(page.getByText('Choose a rejection reason.').first()).toBeVisible();
    const reason = page.locator('#reject-reason-code');
    // The reasons load when the dialog opens (GET /rest/displayList/REJECTION_REASONS).
    await expect.poll(() => reason.locator('option:not([value=""])').count(), { timeout: 30_000, message: 'the lab\'s rejection reasons load' }).toBeGreaterThan(0);
    const opts = await reason.locator('option').evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent?.trim() ?? '' })).filter((o) => o.v));
    expect(opts.length, 'the lab\'s rejection reasons are offered').toBeGreaterThan(0);
    await reason.selectOption(opts[0].v);
    await page.locator('#reject-reason').fill('QA-EQAOI tube cracked');
    const posted = page.waitForResponse((r) => /\/sample-item\/\d+\/reject$/.test(r.url()) && r.request().method() === 'POST');
    await commit.click();
    expect((await posted).status()).toBe(200);
    await expect(page.getByText('This sample was rejected').first()).toBeVisible({ timeout: 60_000 });
    test.skip(!hasDb(), NEED_DB);
    const sampleId = sampleRow(F.labNoCycle).sampleId;
    const item = db(`select id||'|'||coalesce(reject_reason_id::text,'') from clinlims.sample_item where samp_id=${sampleId} order by sort_order limit 1`) ?? '';
    const [itemId, reasonId] = item.split('|');
    expect(reasonId, 'the chosen reason is on the specimen').toBe(opts[0].v);
    const notes = db(`select string_agg(text, ' ;; ') from clinlims.note where reference_id=${itemId} and note_type='R'`) ?? '';
    note('EQAOI-12', { item, notes });
    expect(notes, 'the rejection note is "reason | comment"').toContain(`${opts[0].t} | QA-EQAOI tube cracked`);
  });

  test('TC-EQAOI-13: a resample of an EQA specimen stays an EQA order: the replacement carries the enrollment and the no-patient decision (OGC-1488)', async ({ page }) => {
    test.skip(!F.labNoNoCycle, 'needs the order from TC-EQAOI-06');
    test.skip(!hasDb(), NEED_DB);
    await toSampleCheck(page, F.labNoNoCycle); // the specimen row is written when Collect is saved
    const orig = sampleRow(F.labNoNoCycle);
    const itemId = db(`select id from clinlims.sample_item where samp_id=${orig.sampleId} order by sort_order limit 1`);
    expect(itemId, 'the specimen').toMatch(/^\d+$/);
    // Sample Check no longer offers Resample for EQA (TC-EQAOI-10); the endpoint is still there.
    const r = await api(page, 'POST', `/sample-acceptance-checklist/sample-item/${itemId}/resample`, { reason: 'QA-EQAOI resample' });
    note('EQAOI-13', { status: r.status, text: r.text.slice(0, 300) });
    expect(r.status, r.text.slice(0, 300)).toBe(200);
    const newId = String(r.json?.newSampleId ?? '');
    expect(newId, 'a replacement order').toMatch(/^\d+$/);
    const eqa = db(`select coalesce(eqa_enrollment_id::text,'')||'|'||coalesce(is_eqa_sample::text,'') from clinlims.sample_eqa where sample_id=${newId}`) ?? '';
    expect(eqa.split('|')[0], 'the replacement keeps the enrollment').toBe(F.enrollmentId);
    expect(db(`select count(*) from clinlims.sample_order_override where sample_id=${newId} and override_type='NO_PATIENT'`), 'and the no-patient decision').toBe('1');
    expect(db(`select count(*) from clinlims.sample_human where samp_id=${newId} and patient_id is not null`), 'no patient on it').toBe('0');
  });

});
