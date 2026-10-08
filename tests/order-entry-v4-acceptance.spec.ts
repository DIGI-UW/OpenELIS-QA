/**
 * tests/order-entry-v4-acceptance.spec.ts
 *
 * Acceptance for the four Clinical Order Entry v4 tickets In Review on 2026-10-08
 * (epic OGC-1266, owner Mozzy), run against local develop 76c6d625a
 * (images 2026-10-08 04:22 UTC):
 *
 *   OGC-1419  collector optional on Prepare Samples            TC-OEV4-COL-*
 *   OGC-1422  print barcode labels from Prepare Samples         TC-OEV4-LBL-*
 *   OGC-1423  Refer Out one or every tube from Prepare Samples  TC-OEV4-REF-*
 *   OGC-1424  M14 clean-up (possible matches, Handling, ...)    TC-OEV4-M14-*
 *
 * Source of truth: FRS clinical-order-entry-v4.md v0.20 and its acceptance script
 * clinical-order-entry-v4-acceptance-tests.md (M14), plus each ticket's criteria.
 * Product developers' own specs (frontend/playwright/.../ogc-1423, ogc-1424) cover the
 * happy path; these cases add the reads-back, the edges and the spec rules they skip.
 *
 * FLIP-WHEN-FIXED cases assert the spec and carry test.fail() while the product
 * differs; each names what was observed. When one goes red, delete test.fail().
 *
 * Creates QA patients ("Qaoev..." last names, "QAOEV..." national IDs) and orders.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import {
  API, ENTRY_POST, apiJson, dashboardHas, footer, letters, cap, newOrderToPrepare, openEnter, openPrepare,
  orderSearch, pdfPageCount, pickPatient, pickReferenceLab, pickSampleAndTest, pickSite, rawKeysOnScreen,
  referredOut, saveStep, savedPrepare, fillCollection, seedPatient, toContinue, currentLocale, setLocale,
} from '../helpers/order-entry-v4';

test.setTimeout(240_000);


// ---------------------------------------------------------------------------
test.describe('OGC-1419 collector optional on Prepare Samples', () => {
  test('TC-OEV4-COL-01 no collector: checklist never asks for one, Save and next saves', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await expect(page.locator('#collector-0')).toHaveValue('');
    await fillCollection(page, 0);
    const items = await toContinue(page);
    expect(items.join(' | '), 'the To continue checklist never lists a collector').not.toMatch(/collector/i);
    const r = await saveStep(page, 'next');
    expect(r.status(), 'an order with no collector saves').toBe(200);
    await expect(page, 'the order moves past Prepare Samples').not.toHaveURL(/\/collect/, { timeout: 30_000 });
    const s = (await orderSearch(page, o.lab)).samples[0];
    expect(s.collectorId ?? '', 'no collector stored').toBe('');
  });

  test('TC-OEV4-COL-02 the Collector field is not marked required', async ({ page }) => {
    await newOrderToPrepare(page);
    const field = page.locator('#collector-0');
    await expect(field).toBeVisible();
    expect(await field.getAttribute('aria-required'), 'no aria-required on Collector').not.toBe('true');
    expect(await field.evaluate((el) => (el as HTMLInputElement).required), 'no required attribute on Collector').toBe(false);
    const label = await page.locator('label[for="collector-0"]').innerText();
    expect(label, 'no asterisk on the Collector label').not.toMatch(/\*/);
  });

  test('TC-OEV4-COL-03 a collector saves, reads back, and clearing it saves blank', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    await page.locator('#collector-0').fill('Qa Collector');
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    expect((await orderSearch(page, o.lab)).samples[0].collectorId, 'the collector reads back').toBe('Qa Collector');
    await openPrepare(page, o.lab);
    await expect(page.locator('#collector-0'), 'the collector reloads on Prepare Samples').toHaveValue('Qa Collector');
    await page.locator('#collector-0').fill('');
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    expect((await orderSearch(page, o.lab)).samples[0].collectorId ?? '', 'clearing the collector stores blank, the old name does not come back').toBe('');
  });
});

// ---------------------------------------------------------------------------
test.describe('OGC-1422 labels from Prepare Samples', () => {
  async function printAndCapture(page: Page, click: () => Promise<void>) {
    const pdf = page.waitForResponse((r) => /\/api\/orders\/[^/]+\/labels\/pdf/.test(r.url()), { timeout: 60_000 });
    await click();
    const r = await pdf;
    // The page reads the PDF as a blob; Playwright then reports an empty body for it, so
    // fetch the same URL again with the page's session (printing records nothing, FR-I6).
    const again = await page.request.get(r.url());
    const body = await again.body();
    fs.writeFileSync(test.info().outputPath(`labels-${Date.now()}.pdf`), body);
    test.info().annotations.push({ type: 'pdf', description: `${r.url()} ${body.length} bytes, ${pdfPageCount(body)} pages` });
    return { url: new URL(r.url()), status: r.status(), type: r.headers()['content-type'] || '', body };
  }

  test('TC-OEV4-LBL-01 Print all labels returns one PDF holding every label the section counts', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    await expect(page.getByTestId('prepare-labels-section')).toContainText(/Total labels:\s*\d+/, { timeout: 60_000 });
    const total = Number(((await page.getByTestId('prepare-labels-section').innerText()).match(/Total labels:\s*(\d+)/) || [])[1]);
    expect(total, 'the section shows a total').toBeGreaterThan(0);
    const got = await printAndCapture(page, () => page.getByTestId('labels-print-all').click());
    expect(got.status, 'the label PDF is served').toBe(200);
    expect(got.type, 'it is a PDF').toContain('application/pdf');
    expect(got.body.subarray(0, 4).toString(), 'the body is a PDF').toBe('%PDF');
    expect(got.url.searchParams.get('scope'), `Print all asks for every label, not one scope (${got.url.search})`).toBeNull();
    expect(pdfPageCount(got.body), `the PDF holds the ${total} labels the section counts`).toBe(total);
  });

  test('TC-OEV4-LBL-02 a changed quantity is saved before printing and reads back as saved', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    const qty = page.locator('input[id^="sample-label-"]').first();
    await expect(qty).toBeVisible({ timeout: 30_000 });
    await qty.fill('3');
    await qty.press('Tab');
    const order: string[] = [];
    page.on('request', (rq) => {
      if (rq.method() === 'POST' && ENTRY_POST.test(new URL(rq.url()).pathname)) order.push('save');
      if (/\/labels\/pdf/.test(rq.url())) order.push('pdf');
    });
    const row = page.locator('button[data-testid^="sample-label-print-row-"]').first();
    const got = await printAndCapture(page, () => row.click());
    expect(order.slice(0, 2), 'printing with a pending change saves first, then prints').toEqual(['save', 'pdf']);
    expect(got.status).toBe(200);
    expect(pdfPageCount(got.body), 'the row prints the 3 labels asked for').toBe(3);
    await openPrepare(page, o.lab);
    await expect(page.locator('input[id^="sample-label-"]').first(), 'the saved quantity reloads').toHaveValue('3', { timeout: 30_000 });
  });

  test('TC-OEV4-LBL-03 a quantity above the preset maximum is never stored', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    const qty = page.locator('input[id^="sample-label-"]').first();
    await expect(qty).toBeVisible({ timeout: 30_000 });
    const max = Number((await qty.getAttribute('max')) || '0');
    expect(max, 'the stepper carries the preset maximum').toBeGreaterThan(0);
    await qty.fill(String(max + 5));
    await qty.press('Tab');
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    const shown = Number(await page.locator('input[id^="sample-label-"]').first().inputValue());
    expect(shown, `the saved quantity is within the maximum ${max}`).toBeLessThanOrEqual(max);
  });

  test('TC-OEV4-LBL-04 a failed PDF says so and Retry prints', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    await expect(page.getByTestId('labels-print-all')).toBeVisible({ timeout: 60_000 });
    await page.route(/\/labels\/pdf/, (route) => route.fulfill({ status: 500, body: '' }));
    await page.getByTestId('labels-print-all').click();
    await expect(page.getByTestId('prepare-labels-print-error'), 'a failed print is reported').toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('prepare-labels-retry')).toBeVisible();
    await page.unroute(/\/labels\/pdf/);
    const pdf = page.waitForResponse((r) => /\/labels\/pdf/.test(r.url()));
    await page.getByTestId('prepare-labels-retry').click();
    expect((await pdf).status(), 'Retry prints').toBe(200);
  });

  test('TC-OEV4-LBL-05 a blocked print window falls back to a download and says so', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null; });
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    await expect(page.getByTestId('labels-print-all')).toBeVisible({ timeout: 60_000 });
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('labels-print-all').click();
    expect((await dl).suggestedFilename(), 'the labels download as a PDF').toMatch(/labels\.pdf$/);
    await expect(page.getByText(/download/i).first(), 'a notification says the labels were downloaded').toBeVisible({ timeout: 15_000 });
  });

  test('TC-OEV4-LBL-06 no label status and no stale reprint wording on Prepare Samples (FR-I6, FR-I7)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: the sample card still says
    // "Use 'Print More Sample Labels' if you draw more than expected...", but #4590 removed
    // that control (FR-I7: one print control per row and column, no second reprint block).
    test.fail();
    await newOrderToPrepare(page);
    const text = await page.locator('main').innerText();
    expect(text, 'no printed / generated label status (FR-I6)').not.toMatch(/\b(printed|generated)\b/i);
    expect(text, 'no help text pointing to a removed reprint control (FR-I7)').not.toMatch(/Print More Sample Labels/i);
  });
});

// ---------------------------------------------------------------------------
test.describe('OGC-1423 Refer Out from Prepare Samples', () => {
  async function referRow(page: Page, rowIndex = 0) {
    const section = page.locator('main').filter({ hasText: 'Refer Out / Subcontract' });
    await expect(page.getByText('Refer Out / Subcontract')).toBeVisible({ timeout: 30_000 });
    await section.getByRole('button', { name: 'Refer Out', exact: true }).nth(rowIndex).click();
    const name = await pickReferenceLab(page);
    await page.getByLabel('Reason', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save Referral' }).click();
    await expect(page.getByTestId('refer-out-pending').first(), 'the referral is staged as pending').toBeVisible({ timeout: 15_000 });
    return name;
  }

  test('TC-OEV4-REF-01 a staged referral is not stored until the step is saved, and a reload drops it', async ({ page }) => {
    const o = await savedPrepare(page);
    await referRow(page);
    expect(await referredOut(page, o.lab), 'nothing stored before the step Save').toHaveLength(0);
    await page.reload();
    await expect(page.getByTestId('sample-collection-card-0')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('refer-out-pending'), 'the unsaved referral is not shown as pending after reload').toHaveCount(0);
    expect(await referredOut(page, o.lab), 'still nothing stored').toHaveLength(0);
  });

  test('TC-OEV4-REF-02 partial referral: one of two tubes referred, the order still needs Sample check', async ({ page }) => {
    const o = await savedPrepare(page, [{ type: 'Serum' }, { type: 'Urine' }]);
    const lab = await referRow(page, 0);
    expect((await saveStep(page, 'next')).status()).toBe(200);
    await expect(page, 'a partly referred order goes on to Sample check').toHaveURL(/\/order\/clinical\/qa/, { timeout: 30_000 });
    const order = await orderSearch(page, o.lab);
    expect(order.fullyReferred, 'one in-house tube left: not fully referred').toBe(false);
    const items = await referredOut(page, o.lab);
    expect(items, 'exactly one referral stored').toHaveLength(1);
    expect(items[0].referenceLabDisplay).toBe(lab);
    expect(await dashboardHas(page, o.lab, 'has_referred'), 'listed under Has referred tests').not.toBeNull();
    expect(await dashboardHas(page, o.lab, 'referred_out'), 'not listed as Referred Out').toBeNull();
  });

  test('TC-OEV4-REF-03 every tube referred: order entry finishes at Prepare Samples and the test leaves the worklist', async ({ page }) => {
    const o = await savedPrepare(page);
    const before = await page.request.get(`${API}/rest/WorkPlanByTest?test_id=${o.testIds[0]}`);
    expect((await before.text()).includes(o.lab), 'the test is on the worklist before the referral').toBe(true);
    await referRow(page, 0);
    expect((await saveStep(page, 'next')).status()).toBe(200);
    await expect(page, 'no Sample check for a fully referred order').not.toHaveURL(/\/order\/clinical\/qa/, { timeout: 30_000 });
    const order = await orderSearch(page, o.lab);
    expect(order.fullyReferred).toBe(true);
    expect(await dashboardHas(page, o.lab, 'referred_out'), 'listed as Referred Out').not.toBeNull();
    const after = await page.request.get(`${API}/rest/WorkPlanByTest?test_id=${o.testIds[0]}`);
    expect((await after.text()).includes(o.lab), 'the referred test left the worklist').toBe(false);
  });

  test('TC-OEV4-REF-04 a referred tube cannot be referred a second time', async ({ page }) => {
    const o = await savedPrepare(page, [{ type: 'Serum' }, { type: 'Urine' }]);
    await referRow(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    await expect(page.getByText('Refer Out / Subcontract')).toBeVisible({ timeout: 30_000 });
    // Refer everything left in-house: only the second tube may be added.
    await page.getByTestId('refer-out-all').click();
    const bulk = page.getByTestId('refer-out-bulk-form');
    await pickReferenceLab(page, bulk);
    await bulk.getByRole('button', { name: 'Save Referral' }).click();
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    const items = await referredOut(page, o.lab);
    expect(items, 'one referral per tube, two tubes: two referrals').toHaveLength(2);
  });

  test('TC-OEV4-REF-05 a save that fails keeps the staged referral and stores nothing', async ({ page }) => {
    const o = await savedPrepare(page);
    await referRow(page, 0);
    await page.route(ENTRY_POST, (route) => route.abort('internetdisconnected'), { times: 1 });
    await footer(page, 'exit').click();
    await expect(page.getByText(/not saved/i).first(), 'the user is told nothing was saved').toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('refer-out-pending'), 'the referral is still staged').toHaveCount(1);
    expect(await referredOut(page, o.lab), 'nothing stored').toHaveLength(0);
  });

  test('TC-OEV4-REF-06 referral rows name the tube by lab number, not by database id', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: the Refer Out table's
    // "Sample ID" column shows the sample item's database id (e.g. 1121), which is printed
    // nowhere and cannot be matched to a tube. FR-C2 / FR-E2: samples are named by number
    // (<lab number>-1).
    test.fail();
    const o = await savedPrepare(page);
    await expect(page.getByText('Refer Out / Subcontract')).toBeVisible({ timeout: 30_000 });
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Refer Out', exact: true }) }).first();
    expect(await row.innerText(), 'the tube is named <lab number>-1').toContain(`${o.lab}-1`);
  });
});

// ---------------------------------------------------------------------------
test.describe('OGC-1424 M14 order entry clean-up', () => {
  test('TC-OEV4-M14-01 the Order section has no print shortcut', async ({ page }) => {
    await openEnter(page);
    await expect(page.locator('main').getByRole('button', { name: /print (order )?labels/i }), 'labels print from the Labels section only').toHaveCount(0);
  });

  test('TC-OEV4-M14-02 Create patient with swapped names lists the existing patient; Use this one selects it', async ({ page }) => {
    const p = await seedPatient(page);
    await openEnter(page);
    await page.getByRole('button', { name: 'New Patient' }).click();
    const form = page.getByTestId('patient-search-section');
    await form.locator('#lastName').fill(p.firstName);
    await form.locator('#firstName').fill(p.lastName);
    const check = page.waitForResponse((r) => r.url().includes('/rest/possible-matches/patient'));
    await page.getByTestId('order-create-patient').click();
    expect((await check).status()).toBe(200);
    const row = page.getByTestId(`possible-match-${p.id}`);
    await expect(row, 'the existing patient is a possible match').toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Matched on: name');
    await page.getByTestId(`possible-match-use-${p.id}`).click();
    await expect(form, 'the existing patient is put on the order').toContainText(p.lastName, { timeout: 15_000 });
  });

  test('TC-OEV4-M14-03 the check also matches an identifier one character off', async ({ page }) => {
    const p = await seedPatient(page);
    await openEnter(page);
    await page.getByRole('button', { name: 'New Patient' }).click();
    const form = page.getByTestId('patient-search-section');
    await form.locator('#lastName').fill(cap(`zz${letters(8)}`));
    await form.locator('#firstName').fill(cap(`yy${letters(6)}`));
    const offByOne = p.nationalId.slice(0, -1) + (p.nationalId.endsWith('7') ? '8' : '7');
    await form.locator('#nationalId').fill(offByOne);
    await page.getByTestId('order-create-patient').click();
    const row = page.getByTestId(`possible-match-${p.id}`);
    await expect(row, `national ID ${offByOne} vs ${p.nationalId} is a possible match`).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/identifier/i);
  });

  test('TC-OEV4-M14-04 Create new anyway is confirmed, recorded, and saves one new patient', async ({ page }) => {
    const p = await seedPatient(page);
    await openEnter(page);
    await page.getByRole('button', { name: 'New Patient' }).click();
    const form = page.getByTestId('patient-search-section');
    await form.locator('#lastName').fill(p.lastName);
    await form.locator('#firstName').fill(p.firstName);
    const nid = `QAOEVN${Date.now()}`;
    await form.locator('#nationalId').fill(nid);
    await page.locator('label[for="radio-2"]').click().catch(() => undefined);
    await page.getByTestId('order-create-patient').click();
    await expect(page.getByTestId(`possible-match-${p.id}`)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Create new anyway' }).click();
    await expect(page.getByText(/Create a new record even though \d+ similar/), 'the confirmation names how many similar records').toBeVisible();
    const recorded = page.waitForResponse((r) => r.url().includes('/rest/possible-matches/patient/override'));
    await page.getByRole('button', { name: 'Create new record' }).click();
    expect((await recorded).status(), 'the override is recorded').toBe(201);
    await expect(page.getByTestId('order-new-patient-confirmed')).toBeVisible({ timeout: 15_000 });
  });

  test('TC-OEV4-M14-05 Add new organization lists the facility named the same apart from common words', async ({ page }) => {
    const sites = await (async () => { await page.goto('/', { waitUntil: 'domcontentloaded' }); return apiJson<{ id: string; value: string }[]>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC'); })();
    const plain = sites.find((s) => /^[A-Za-z][A-Za-z ]{3,40}$/.test(s.value));
    expect(plain, 'a facility with a plain name exists').toBeTruthy();
    await openEnter(page);
    const typed = `${plain!.value} Health Centre`;
    await page.locator('#siteName').fill(typed);
    // The button reads "organisation" in the English (US) bundle on 76c6d625a; either spelling passes.
    const addNew = page.getByRole('button', { name: new RegExp(`^\\+ Add new organi[sz]ation "${typed}"$`) });
    await expect(addNew, 'Add new appears after a search with no match').toBeVisible({ timeout: 20_000 });
    const check = page.waitForResponse((r) => r.url().includes('/rest/possible-matches/facility'));
    await addNew.click();
    expect((await check).status()).toBe(200);
    await expect(page.getByTestId('possible-matches-dialog').getByText(plain!.value).first(), `${plain!.value} is a possible match`).toBeVisible({ timeout: 15_000 });
  });

  test('TC-OEV4-M14-06 patient search stays exact and prefix; it never returns a fuzzy match (FR-B6a)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: GET patient-search-results with
    // lastName "<seed last name with its last letter changed>" returns the seeded patient.
    // FR-B6a / D-216: "Search itself never uses fuzzy matching: it stays exact and prefix";
    // fuzzy matching runs only at Create (possible matches).
    test.fail();
    const p = await seedPatient(page);
    const typo = p.lastName.slice(0, -1) + (p.lastName.endsWith('x') ? 'y' : 'x');
    const j = await apiJson(page, `/rest/patient-search-results?lastName=${typo}&firstName=&STNumber=&subjectNumber=&nationalID=&labNumber=&guid=&dateOfBirth=&gender=&suppressExternalSearch=true`);
    const names = (j.patientSearchResults || []).map((x: any) => String(x.lastName));
    expect(names.filter((n: string) => !n.toLowerCase().startsWith(typo.toLowerCase())), `search "${typo}" returns only names starting with it`).toEqual([]);
  });

  test('TC-OEV4-M14-07 fax fields are hidden while showFaxFields is off (default)', async ({ page }) => {
    await openEnter(page);
    await expect(page.locator('#providerFax')).toHaveCount(0);
    await expect(page.locator('#siteContactFax')).toHaveCount(0);
    await expect(page.locator('main').getByText(/\bfax\b/i)).toHaveCount(0);
  });

  test('TC-OEV4-M14-08 Received by reads "(you)" with Change, and Change opens a user search', async ({ page }) => {
    await newOrderToPrepare(page);
    await expect(page.getByTestId('received-by-text')).toContainText('(you)');
    await page.getByTestId('received-by-change').click();
    await expect(page.getByTestId('received-by-line').locator('input').first(), 'Change opens a user search').toBeVisible({ timeout: 10_000 });
  });

  test('TC-OEV4-M14-09 Mark tested elsewhere from the row menu: Tag, value saved, and Not tested elsewhere undoes it', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    const t = o.testIds[0];
    const menu = page.getByTestId(`test-row-actions-${t}`);
    await menu.click();
    const marked = page.waitForResponse((r) => r.url().includes('/rest/order-tests/tested-elsewhere') && r.request().method() === 'PUT');
    await page.getByRole('menuitem', { name: 'Mark tested elsewhere' }).click();
    expect((await marked).status()).toBe(200);
    await expect(page.getByTestId(`tested-elsewhere-tag-${t}`), 'the row shows the Tested elsewhere Tag').toBeVisible();
    const value = page.locator(`#tested-elsewhere-value-${t}`);
    await value.fill('Positive');
    const saved = page.waitForResponse((r) => r.url().includes('/rest/order-tests/tested-elsewhere') && r.request().method() === 'PUT');
    await value.blur();
    expect((await saved).status()).toBe(200);
    const marks = await apiJson<any[]>(page, `/rest/order-tests/tested-elsewhere?labNumber=${encodeURIComponent(o.lab)}`);
    expect(marks.find((m) => String(m.testId) === t)?.reportedValue, 'the reported value is stored').toBe('Positive');
    await menu.click();
    await page.getByRole('menuitem', { name: 'Not tested elsewhere' }).click();
    await expect(page.getByTestId(`tested-elsewhere-tag-${t}`)).toHaveCount(0, { timeout: 15_000 });
  });

  test('TC-OEV4-M14-10 Tested elsewhere records the performing laboratory (FR-B20)', async ({ page }) => {
    // Guard. FR-B20 and the M14 script step 7: "The reported value and performing laboratory
    // fields open". Present on 76c6d625a (written as a tripwire, passed on first run 2026-10-08).
    const o = await newOrderToPrepare(page);
    await page.getByTestId(`test-row-actions-${o.testIds[0]}`).click();
    await page.getByRole('menuitem', { name: 'Mark tested elsewhere' }).click();
    await expect(page.getByTestId(`tested-elsewhere-tag-${o.testIds[0]}`)).toBeVisible();
    await expect(page.locator('main').getByLabel(/perform(ing|ed)? (lab|laboratory)/i).first(), 'a performing laboratory field').toBeVisible({ timeout: 5_000 });
  });

  test('TC-OEV4-M14-11 one order-level Payment status and no paid marker per test', async ({ page }) => {
    const p = await seedPatient(page);
    await openEnter(page);
    await pickPatient(page, p);
    await pickSampleAndTest(page, 0, 'Serum');
    await expect(page.getByRole('combobox', { name: 'Payment Status' }), 'order-level Payment status').toHaveCount(1);
    await expect(page.locator('main').getByRole('checkbox', { name: /paid/i }), 'no paid toggle on a test').toHaveCount(0);
    await expect(page.locator('main').getByRole('columnheader', { name: /^paid$/i })).toHaveCount(0);
  });

  test('TC-OEV4-M14-12 the clinical sample row has no retired fields; it has the Handling group', async ({ page }) => {
    await newOrderToPrepare(page);
    const card = page.getByTestId('sample-collection-card-0');
    for (const label of ['Specimen Origin', 'Collection Conditions', 'Sample Temperature', 'Lab performed sampling']) {
      await expect(card.getByLabel(label, { exact: true }), `${label} is retired from the clinical row`).toHaveCount(0);
    }
    await expect(page.getByTestId('handling-group-0')).toBeVisible();
    await expect(page.getByTestId('handling-required-0')).toContainText(/Required/);
    const options = await page.locator('#arrivalCondition-0 option').allInnerTexts();
    for (const o of ['Room temperature', 'Refrigerated 2 to 8 °C', 'Frozen', 'On ice', 'Dry ice']) expect(options, `Arrived as offers ${o}`).toContain(o);
  });

  test('TC-OEV4-M14-13 a handling mismatch shows one Tag, offers a non-conformity, and never blocks the save', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const seed = await seedPatient(page);
    const lab = await openEnter(page);
    await pickPatient(page, seed);
    const testId = await pickSampleAndTest(page, 0, 'Serum');
    const url = `${API}/rest/test-catalog/tests/${testId}/storage`;
    const before = await (await page.request.get(url)).json();
    const csrf = await page.evaluate(() => localStorage.getItem('CSRF') || '');
    const put = (data: any) => page.request.put(url, { headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, data });
    expect((await put({ ...before, storageCondition: 'REFRIGERATED' })).status(), 'test storage set to refrigerated').toBeLessThan(300);
    try {
      await pickSite(page);
      expect((await saveStep(page, 'next')).status()).toBe(200);
      await expect(page.getByTestId('handling-required-0')).toContainText('Refrigerated', { timeout: 30_000 });
      await page.locator('#arrivalCondition-0').selectOption('ROOM_TEMPERATURE');
      await expect(page.getByTestId('handling-mismatch-0'), 'one Handling mismatch Tag').toHaveCount(1);
      await expect(page.getByTestId('handling-mismatch-0')).toContainText('Handling mismatch');
      await expect(page.getByTestId('handling-report-nce-0'), 'Report non-conformity is offered, prefilled').toHaveAttribute('href', new RegExp(`labNumber=${lab}`));
      await fillCollection(page, 0);
      const r = await saveStep(page, 'exit');
      expect(r.status(), 'the mismatch never blocks the save').toBe(200);
      expect((await orderSearch(page, lab)).samples[0].arrivalCondition).toBe('ROOM_TEMPERATURE');
    } finally {
      await put(before);
    }
  });

  test('TC-OEV4-M14-14 Same for all samples copies Arrived as to every primary sample', async ({ page }) => {
    // FR-C9a and the M14 script step 12.
    const o = await newOrderToPrepare(page, [{ type: 'Serum' }, { type: 'Urine' }]);
    await page.locator('#arrivalCondition-0').selectOption('ON_ICE');
    await page.locator('#arrivalTemperature-0').fill('3');
    await page.getByTestId('handling-same-for-all-0').click();
    await expect(page.locator('#arrivalCondition-1'), 'the second sample gets On ice').toHaveValue('ON_ICE');
    await expect(page.locator('#arrivalTemperature-1'), 'and the measured temperature').toHaveValue('3');
    await fillCollection(page, 0);
    await fillCollection(page, 1);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    const stored = (await orderSearch(page, o.lab)).samples.map((x: any) => x.arrivalCondition);
    expect(stored, 'both samples store On ice').toEqual(['ON_ICE', 'ON_ICE']);
  });

  test('TC-OEV4-M14-15 French: Prepare Samples shows no raw keys and translates the new Handling labels', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a with the UI in French: the Handling
    // group reads "Required: No requirement", "Arrived as", "Room temperature",
    // "Refrigerated 2 to 8 °C", "Frozen", "On ice", "Dry ice", "Measured temperature (°C)",
    // "Stored at: Not stored yet" in English; only "Non enregistré" is French. OGC-1424:
    // "i18n: new keys listed in the FRS Localization section; run once in French."
    test.fail();
    await newOrderToPrepare(page);
    const url = page.url();
    const before = await currentLocale(page);
    await setLocale(page, /^Fran[cç]ais$/);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('sample-collection-card-0')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(3000);
      expect(await rawKeysOnScreen(page), 'no raw i18n keys in French').toEqual([]);
      const handling = await page.getByTestId('handling-group-0').innerText();
      expect(handling, 'the Handling group is translated').not.toMatch(/Arrived as|Stored at|No requirement|Measured temperature/);
    } finally {
      await setLocale(page, before); // the server keeps the choice; never leave the session in French
    }
  });
});
