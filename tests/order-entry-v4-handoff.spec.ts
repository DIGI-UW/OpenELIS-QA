/**
 * tests/order-entry-v4-handoff.spec.ts
 *
 * The 25 Sep 2026 order entry QA handoff ("Order Entry rewrite: QA handoff",
 * order-entry-qa-handoff-for-spec.md) re-run against Clinical Order Entry v4.
 * Each case carries the handoff requirement it checks (R-NET, R-DATA, R-TIME,
 * R-FLOW, R-UX) and the original QA case (TC-NET-0n, TC-OEW-nn) it replaces, so
 * "a requirement is met when its case flips from FAIL to PASS" can be read off a run.
 * The original cases were manual / probe runs on testing 3.2.3.0 and were never
 * automated; this file is that automation for the v4 screens.
 *
 * Written 2026-10-08 against local develop 76c6d625a (images 2026-10-08 04:22 UTC).
 * FLIP-WHEN-FIXED cases assert the requirement and carry test.fail() while v4 differs.
 */
import { test, expect, Page } from '@playwright/test';
import {
  API, ENTRY_POST, ENTER, apiJson, footer, newOrderToPrepare, openEnter, openPrepare, orderSearch,
  pickPatient, pickSampleAndTest, pickSite, rawKeysOnScreen, saveStep, seedPatient, toContinue, fillCollection, currentLocale, setLocale,
} from '../helpers/order-entry-v4';

test.setTimeout(240_000);

async function readyEnter(page: Page) {
  const p = await seedPatient(page);
  const lab = await openEnter(page);
  await pickPatient(page, p);
  await pickSampleAndTest(page, 0, 'Serum');
  await pickSite(page);
  return { p, lab };
}

// ---------------------------------------------------------------- network
test.describe('R-NET network resilience', () => {
  test('TC-OEV4-NET-01 a 5 s session outage during load recovers unnoticed (R-NET-1, was TC-NET-01, gate G11)', async ({ page }) => {
    let first = 0;
    await page.route(/\/api\/OpenELIS-Global\/session(\?|$)/, (route) => {
      first ||= Date.now();
      return Date.now() - first < 5_000 ? route.abort('internetdisconnected') : route.continue();
    });
    await page.goto(ENTER, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#labNumber'), 'Enter Order renders').toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/System Error|Failed to fetch/i)).toHaveCount(0);
  });

  test('TC-OEV4-NET-02 a 60 s outage shows Reconnecting and recovers, with no dead-end modal (R-NET-1, M12, was TC-NET-02)', async ({ page }) => {
    // FLIP-WHEN-FIXED (R-NET-1, M12). Observed 2026-10-08 on 76c6d625a: the
    // "System Error / Failed to fetch" modal is on screen 20 s into a 60 s session outage,
    // as on 25 Sep (TC-NET-02). M12 (app shell reconnect) is not built yet.
    test.fail();
    test.setTimeout(300_000);
    let first = 0;
    await page.route(/\/api\/OpenELIS-Global\/session(\?|$)/, (route) => {
      first ||= Date.now();
      return Date.now() - first < 60_000 ? route.abort('internetdisconnected') : route.continue();
    });
    await page.goto(ENTER, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(20_000);
    await expect(page.getByText(/System Error|Failed to fetch/i), 'no dead-end "System Error" modal while the server is away').toHaveCount(0);
    await expect(page.locator('#labNumber'), 'the page recovers on its own once the server is back').toBeVisible({ timeout: 90_000 });
  });

  test('TC-OEV4-NET-03 one failed test-list load says so and offers Retry (R-NET-2, M12 step 2, was TC-NET-03)', async ({ page }) => {
    // FLIP-WHEN-FIXED (R-NET-2). Observed 2026-10-08 on 76c6d625a: after one failed
    // /rest/sample-type-tests the sample shows "Loading panels..." and "Loading tests..."
    // with no error and no Retry, as on 25 Sep (TC-NET-03).
    test.fail();
    const p = await seedPatient(page);
    await openEnter(page);
    await pickPatient(page, p);
    await page.route(/\/rest\/sample-type-tests/, (route) => route.abort('internetdisconnected'), { times: 1 });
    await page.locator('#sampleType-0').selectOption({ label: 'Serum' });
    await expect(page.locator('main').getByText(/fail|could not|couldn.t|try again/i).first(), 'the failed load is reported').toBeVisible({ timeout: 20_000 });
    const retry = page.locator('main').getByRole('button', { name: /retry|try again/i }).first();
    await expect(retry, 'a Retry is offered').toBeVisible();
    await retry.click();
    await expect(page.locator('input[id^="test-0-"]').first(), 'Retry loads the tests').toBeAttached({ timeout: 20_000 });
  });

  test('TC-OEV4-NET-04 a save that never reaches the server keeps the form and says not saved (R-NET-7, was TC-NET-04, gate G8)', async ({ page }) => {
    const { p } = await readyEnter(page);
    await page.route(ENTRY_POST, (route) => route.abort('internetdisconnected'), { times: 1 });
    await footer(page, 'next').click();
    await expect(page.getByText(/not saved/i).first(), 'the user is told it was not saved').toBeVisible({ timeout: 30_000 });
    await expect(page, 'still on Enter Order').toHaveURL(/\/order\/clinical\/enter/);
    await expect(page.getByTestId('patient-search-section'), 'the patient is still on the form').toContainText(p.lastName);
    await expect(page.locator('input[id^="test-0-"]:checked'), 'the test is still ticked').toHaveCount(1);
  });

  test('TC-OEV4-NET-05 a save whose response is lost can be retried without an "in use" dead end or a second order (R-NET-4, was TC-NET-05)', async ({ page }) => {
    const { lab } = await readyEnter(page);
    let dropped = false;
    await page.route(ENTRY_POST, async (route) => {
      if (dropped) return route.continue();
      dropped = true;
      await route.fetch(); // reaches the server and is saved
      return route.abort('connectionreset'); // the response never arrives
    });
    await footer(page, 'next').click();
    await page.waitForTimeout(5_000);
    const second = page.waitForResponse((r) => r.request().method() === 'POST' && ENTRY_POST.test(new URL(r.url()).pathname), { timeout: 60_000 });
    await footer(page, 'next').click();
    const r = await second;
    const text = await r.text();
    expect(text, 'the retry is not refused as a duplicate lab number').not.toMatch(/already.*in use|in use/i);
    expect(r.status(), 'the retry succeeds').toBe(200);
    const order = await orderSearch(page, lab);
    expect(order.labNumber, 'one order under the lab number').toBe(lab);
  });

  test('TC-OEV4-NET-06 a slow save disables the button and a double click sends one request (R-NET-6, R-NET-7, was TC-NET-06, gate G9)', async ({ page }) => {
    await readyEnter(page);
    let posts = 0;
    await page.route(ENTRY_POST, async (route) => { posts++; await new Promise((res) => setTimeout(res, 6_000)); return route.continue(); });
    const b = footer(page, 'next');
    await b.dblclick();
    await expect(b, 'disabled while saving').toBeDisabled({ timeout: 3_000 });
    await expect(page, 'the save completes').toHaveURL(/\/order\/clinical\/collect/, { timeout: 60_000 });
    expect(posts, 'one click, one write').toBe(1);
  });

  test('TC-OEV4-NET-07 an offline patient search says it failed, not "no patients" (R-NET-2, M8 step 2, was TC-NET-07)', async ({ page, context }) => {
    // FLIP-WHEN-FIXED (R-NET-2). Re-run 2026-10-08 on 76c6d625a; see the session doc for
    // what v4 shows. Spec: "Search failed. Check the connection and try again." with Retry.
    test.fail();
    await openEnter(page);
    await page.locator('#order-patient-search-lastName').fill('Nobodyhere');
    await context.setOffline(true);
    try {
      await page.locator('#order-patient-search-local_search').click();
      await expect(page.getByTestId('patient-search-section').getByText(/search failed|could not|couldn.t|connection/i).first(), 'a failed search is reported').toBeVisible({ timeout: 20_000 });
    } finally {
      await context.setOffline(false);
    }
  });

  test('TC-OEV4-NET-08 New Patient is not offered before a patient search has succeeded (R-NET-3, M8 step 1)', async ({ page }) => {
    // FLIP-WHEN-FIXED (R-NET-3, FR-B6a). Observed 2026-10-08 on 76c6d625a: the New Patient
    // button is on Enter Order as soon as it opens, before any search.
    test.fail();
    await openEnter(page);
    await expect(page.getByRole('button', { name: 'New Patient' }), 'no New Patient before a successful search').toHaveCount(0);
  });
});

// ---------------------------------------------------------------- data integrity
test.describe('R-DATA data integrity', () => {
  test('TC-OEV4-DATA-01 one collected sample shows once, one label row, request marked collected (R-DATA-1, was TC-OEW-05)', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await page.locator('#collectionTime-0').fill('06:00');
    await page.keyboard.press('Tab');
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await openPrepare(page, o.lab);
    await expect(page.locator('[data-testid^="sample-collection-card-"]'), 'one sample card').toHaveCount(1);
    await expect(page.locator('button[data-testid^="sample-label-print-row-"]'), 'one sample label row').toHaveCount(1);
    const order = await orderSearch(page, o.lab);
    expect(order.samples, 'one stored sample').toHaveLength(1);
  });

  test('TC-OEV4-DATA-02 a member test alone saves no panel (R-DATA-2, was TC-OEW-03)', async ({ page }) => {
    const panels = await (async () => { await page.goto('/', { waitUntil: 'domcontentloaded' }); return apiJson(page, `/rest/sample-type-tests?sampleType=2`); })();
    const panel = (panels.panels || []).find((x: any) => String(x.testIds || '').split(',').length > 1);
    expect(panel, 'Serum has a panel with several tests').toBeTruthy();
    const memberId = String(panel.testIds).split(',')[0];
    const member = (panels.tests || []).find((t: any) => String(t.id) === memberId);
    const o = await newOrderToPrepare(page, [{ type: 'Serum', test: member.name }]);
    const order = await orderSearch(page, o.lab);
    const saved = (order.samples || []).flatMap((s: any) => s.panels || []);
    expect(saved, `ticking ${member.name} alone saves no ${panel.name} panel`).toEqual([]);
  });

  test('TC-OEV4-DATA-03 compatible sample types come from the test catalog (R-DATA-3, was TC-OEW-04)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const j = await apiJson(page, '/rest/test-sample-types?testIds=1&panelIds=');
    const types = (j.tests?.[0]?.compatibleSampleTypes || []).map((t: any) => t.name);
    expect(types.length, 'the API names the real sample types').toBeGreaterThan(0);
    expect(types, 'never the arbitrary fallback list').not.toContain('Histopathology specimen');
  });

  test('TC-OEV4-DATA-04 a sample with no test cannot leave Prepare Samples, and the message is translated (R-DATA-4, FR-D7, was TC-OEW-14)', async ({ page }) => {
    // v4 lets Enter Order save a sample type with no test ("Sample and test selection is
    // optional at this step"); R-DATA-4 then applies on Prepare Samples, where tests are
    // also chosen. FR-D7 save level: every sample carries at least one test.
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: Save and next on Prepare Samples
    // with a test-less sample shows the raw key "errors.samples.with.no.tests", as on
    // 25 Sep (TC-OEW-14), and the To continue checklist does not list the sample.
    test.fail();
    const p = await seedPatient(page);
    await openEnter(page);
    await pickPatient(page, p);
    await page.locator('#sampleType-0').selectOption({ label: 'Serum' });
    await expect(page.locator('input[id^="test-0-"]').first()).toBeAttached({ timeout: 30_000 });
    await pickSite(page);
    expect((await saveStep(page, 'next')).status()).toBe(200);
    await expect(page).toHaveURL(/\/order\/clinical\/collect/, { timeout: 30_000 });
    await expect(page.getByTestId('sample-collection-card-0')).toBeVisible({ timeout: 60_000 });
    await fillCollection(page, 0);
    const next = footer(page, 'next');
    const items = (await toContinue(page)).join(' | ');
    let moved = false;
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForTimeout(6_000);
      moved = !/\/collect/.test(page.url());
    }
    expect(await rawKeysOnScreen(page), 'no raw i18n key shown').toEqual([]);
    expect(moved, `a sample with no test must not leave Prepare Samples (checklist: ${items || 'empty'})`).toBe(false);
  });

  test('TC-OEV4-DATA-05 Back to Enter Order and forward keeps the collection date and time (R-DATA-5, was TC-OEW-06, gate G3)', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await page.locator('#collectionTime-0').fill('05:15');
    await page.keyboard.press('Tab');
    const date = await page.locator('#collectionDate-0').inputValue();
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await page.goto(`/order/clinical/enter?labNumber=${encodeURIComponent(o.lab)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('patient-search-section'), 'Enter Order keeps the patient').toContainText(o.patient.lastName, { timeout: 60_000 });
    await expect(page.locator('input[id^="test-0-"]:checked'), 'Enter Order keeps the test').toHaveCount(1);
    await page.getByTestId('order-step-prepare').click();
    await expect(page.locator('#collectionDate-0')).toHaveValue(date, { timeout: 60_000 });
    await expect(page.locator('#collectionTime-0')).toHaveValue('05:15');
  });
});

// ---------------------------------------------------------------- time
test.describe('R-TIME one clock', () => {
  test.use({ timezoneId: 'Pacific/Port_Moresby' });

  test('TC-OEV4-TIME-01 collection and received defaults come from one clock (R-TIME-1, was TC-OEW-08)', async ({ page }) => {
    await newOrderToPrepare(page);
    const server = await apiJson(page, '/rest/server-time');
    const collected = await page.locator('#collectionTime-0').inputValue();
    const received = await page.locator('#receivedTime-0').inputValue();
    const minutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
    expect(Math.abs(minutes(collected) - minutes(received)), `collection ${collected} and received ${received} default from the same clock (server ${server.time} ${server.timezone})`).toBeLessThanOrEqual(5);
  });

  test('TC-OEV4-TIME-02 today in the lab saves from a browser 10 h ahead of the server (R-TIME-2, was TC-OEW-07)', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    expect((await saveStep(page, 'exit')).status(), 'Prepare Samples saves with the default (today) collection date').toBe(200);
    const s = (await orderSearch(page, o.lab)).samples[0];
    expect(s.collectionDate || s.collectionDateForDisplay || '', 'a collection date is stored').not.toBe('');
  });

  test('TC-OEV4-TIME-03 collection after receipt is flagged before the step completes (R-TIME-3, M2 step 4)', async ({ page }) => {
    // FLIP-WHEN-FIXED (R-TIME-3). Observed 2026-10-08 on 76c6d625a: received 10:00 and
    // collected 11:00 on the same day raise no warning and no checklist item.
    test.fail();
    await newOrderToPrepare(page);
    const rd = await page.locator('#receivedDate-0').inputValue();
    await page.locator('#receivedTime-0').fill('10:00');
    await page.keyboard.press('Tab');
    await page.locator('#collectionDate-0').fill(rd);
    await page.keyboard.press('Escape');
    await page.locator('#collectionTime-0').fill('11:00');
    await page.keyboard.press('Tab');
    const flagged = (await toContinue(page)).join(' | ') + ' ' + (await page.getByTestId('sample-collection-card-0').innerText());
    expect(flagged, 'collection 11:00 after receipt 10:00 is flagged').toMatch(/after (receipt|received)|before (it was )?collected|collect(ion|ed).*(after|later)/i);
  });

  test('TC-OEV4-TIME-04 order entry and its dashboard use one date format (R-TIME-4)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a with the locale "English": Enter Order
    // and Prepare Samples use dd/mm/yyyy; the Order Dashboard From / To filters use mm/dd/yyyy.
    // With "English (US)" both read mm/dd/yyyy, so the dashboard ignores the locale. The case
    // pins "English" (the shipped default) and puts the session's locale back afterwards.
    test.fail();
    await openEnter(page);
    const before = await currentLocale(page);
    await setLocale(page, /^English$/);
    try {
      await openEnter(page);
      const enterFmt = await page.getByRole('textbox', { name: 'Date of Birth' }).getAttribute('placeholder');
      await page.goto('/order/clinical', { waitUntil: 'domcontentloaded' });
      const dashFmt = await page.getByRole('textbox', { name: 'From' }).getAttribute('placeholder', { timeout: 60_000 });
      expect(dashFmt, `dashboard ${dashFmt} vs Enter Order ${enterFmt}`).toBe(enterFmt);
    } finally {
      await setLocale(page, before);
    }
  });
});

// ---------------------------------------------------------------- flow and UX
test.describe('R-FLOW and R-UX', () => {
  test('TC-OEV4-FLOW-01 arriving on Prepare Samples shows no "Unsaved changes" before any edit (R-FLOW-3, was TC-OWF-02)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: Save and next from Enter Order
    // lands on Prepare Samples with "Unsaved changes" already shown (the defaulted
    // collection date and time mark the step dirty). TC-OWF-02 passed on 2026-09-29 when
    // the order was opened by lab number; this is the Save and next path.
    test.fail();
    await newOrderToPrepare(page);
    await page.waitForTimeout(3_000);
    await expect(page.getByText(/Unsaved changes/i), 'no unsaved-changes banner before any edit').toHaveCount(0);
  });

  test('TC-OEV4-FLOW-02 the counter and the steps agree after Enter Order is saved (R-FLOW-2, was TC-ODB-02)', async ({ page }) => {
    await newOrderToPrepare(page);
    await expect(page.locator('main').getByText(/^1\/3 steps$/), 'one of three steps done').toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('order-step-enter')).toContainText(/Done|Complete/);
  });

  async function toSampleCheck(page: Page) {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'next')).status()).toBe(200);
    await expect(page).toHaveURL(/\/order\/clinical\/qa/, { timeout: 30_000 });
    const release = page.locator('main').getByRole('button', { name: /Release for testing/i }).last();
    await expect(release).toBeVisible({ timeout: 30_000 });
    return { o, release };
  }
  async function dashRow(page: Page, lab: string) {
    const j = await apiJson(page, `/rest/order/dashboard?search=${encodeURIComponent(lab)}`);
    return (j.orders || []).find((x: any) => x.labNumber === lab);
  }

  test('TC-OEV4-FLOW-03 Sample check: every item passed, Release for testing completes the order (R-FLOW-1, M6 step 6, was TC-OEW-11, gate G5)', async ({ page }) => {
    // The local stack runs the clinical checklist as OPTIONAL (GET sample-acceptance-checklist/enforcement).
    const { o, release } = await toSampleCheck(page);
    const passes = page.locator('label[for^="sac-"][for$="-pass"]');
    await expect(passes.first()).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < (await passes.count()); i++) await passes.nth(i).click();
    const accepted = page.waitForResponse((r) => /sample-acceptance-checklist\/sample-item\//.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Accept sample' }).first().click();
    expect((await accepted).status(), 'the acceptance is recorded').toBe(200);
    await expect(release).toBeEnabled({ timeout: 15_000 });
    await release.click();
    await expect.poll(async () => (await dashRow(page, o.lab))?.complete, { timeout: 30_000, message: 'the order is complete' }).toBe(true);
    const row = await dashRow(page, o.lab);
    expect(row.progressStatus, 'Ready for testing').toMatch(/READY/);
    expect(row.status, 'no longer waiting for Sample check').not.toBe('pending_qa');
    expect(row.stepProgress?.qa, 'the Sample check step is recorded done').toBe(true);
  });

  test('TC-OEV4-FLOW-04 Optional checklist: releasing with items unanswered asks for a reason (M6 step 4)', async ({ page }) => {
    const { o, release } = await toSampleCheck(page);
    const r = page.waitForResponse((x) => /\/rest\/qa-checklist$/.test(new URL(x.url()).pathname) && x.request().method() === 'POST');
    await release.click();
    expect(await (await r).text(), 'the server refuses the release without a reason').toContain('reasonRequired');
    await expect(page.locator('label[for="release-note"]'), 'a reason field appears').toHaveText(/Reason for releasing with unanswered items/, { timeout: 15_000 });
    expect((await dashRow(page, o.lab)).complete, 'not released without the reason').toBe(false);
  });

  test('TC-OEV4-FLOW-05 answers chosen but not yet accepted are not called "unanswered" (R-UX-1, M6)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-08 on 76c6d625a: every checklist item set to Pass,
    // then Release for testing: the server answers order.release.reasonRequired and the page
    // asks for a "Reason for releasing with unanswered items". The answers are only stored by
    // the separate "Accept sample" button, which nothing points to. Spec: Release either
    // records the answers shown, or says plainly to accept the sample first.
    test.fail();
    const { release } = await toSampleCheck(page);
    const passes = page.locator('label[for^="sac-"][for$="-pass"]');
    await expect(passes.first()).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < (await passes.count()); i++) await passes.nth(i).click();
    await release.click();
    await page.waitForTimeout(4_000);
    await expect(page.getByText(/unanswered/i), 'answered items are not called unanswered').toHaveCount(0);
  });

  test('TC-OEV4-UX-01 Enter Order and Prepare Samples show no raw i18n keys (R-UX-1)', async ({ page }) => {
    await openEnter(page);
    expect(await rawKeysOnScreen(page), 'Enter Order').toEqual([]);
    await newOrderToPrepare(page);
    expect(await rawKeysOnScreen(page), 'Prepare Samples').toEqual([]);
  });

  test('TC-OEV4-UX-02 a disabled Save and next says what is missing (R-UX-2, gate G1)', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && ENTRY_POST.test(new URL(r.url()).pathname)) posts++; });
    await openEnter(page);
    await expect(footer(page, 'next')).toBeDisabled();
    await expect(footer(page, 'exit'), 'an empty form cannot be saved either').toBeDisabled();
    await expect(page.getByText(/\d+ items? needed to continue/), 'the footer counts what is missing').toBeVisible();
    expect((await toContinue(page)).length, 'the checklist names each item').toBeGreaterThan(0);
    expect(posts, 'nothing was sent').toBe(0);
  });

  test('TC-OEV4-UX-03 a duplicate lab number is refused in plain language and the other order is untouched (R-UX-1, was TC-OEW-13, gate G4)', async ({ page }) => {
    const first = await newOrderToPrepare(page);
    const before = await orderSearch(page, first.lab);
    const p = await seedPatient(page);
    await openEnter(page);
    await page.locator('#labNumber').fill(first.lab);
    await page.locator('#labNumber').press('Tab');
    await pickPatient(page, p);
    await pickSampleAndTest(page, 0, 'Serum');
    await pickSite(page);
    const next = footer(page, 'next');
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForTimeout(5_000);
    }
    const text = await page.locator('main').innerText();
    expect(text, 'the lab number is refused').toMatch(/in use|already|duplicate|exists/i);
    expect(text, 'no raw field path').not.toMatch(/sampleOrderItems\.|labNo:/);
    const after = await orderSearch(page, first.lab);
    expect(after.sampleOrderItems?.referringSiteName, 'the existing order is untouched').toBe(before.sampleOrderItems?.referringSiteName);
    expect(JSON.stringify(after.samples?.map((s: any) => s.sampleTypeId)), 'its samples are untouched').toBe(JSON.stringify(before.samples?.map((s: any) => s.sampleTypeId)));
    expect(String(after.patientId ?? after.patientPK ?? ''), 'its patient is untouched').toBe(String(before.patientId ?? before.patientPK ?? ''));
  });
});

// ---------------------------------------------------------------- regression gate
test.describe('Regression gate (acceptance script G1 to G11)', () => {
  test('TC-OEV4-GATE-02 what is saved matches what was selected, per sample (G2, was TC-OEW-02)', async ({ page }) => {
    const o = await newOrderToPrepare(page, [{ type: 'Serum' }, { type: 'Urine' }]);
    const dash = await apiJson(page, `/rest/order/dashboard?search=${encodeURIComponent(o.lab)}`);
    const id = (dash.orders || []).find((x: any) => x.labNumber === o.lab)?.id;
    expect(id, 'the order has an id').toBeTruthy();
    const requests = await apiJson<any[]>(page, `/rest/sample-type-requests/sample/${id}`);
    const got = requests.map((r: any) => `${r.typeOfSampleName}:${r.requestedTests}`).sort();
    const want = [`Serum:${o.testIds[0]}`, `Urine:${o.testIds[1]}`].sort();
    expect(got, 'one request per sample, each with exactly the test ticked for it').toEqual(want);
  });

  test('TC-OEV4-GATE-06 the dashboard Continue resumes an order at the step it stopped (G6, was TC-OEW-16)', async ({ page }) => {
    const p = await seedPatient(page);
    const lab = await openEnter(page);
    await pickPatient(page, p);
    await pickSampleAndTest(page, 0, 'Serum');
    await pickSite(page);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    await page.goto('/order/clinical', { waitUntil: 'domcontentloaded' });
    await page.getByRole('searchbox', { name: 'Filter table' }).fill(lab);
    const row = page.getByRole('row').filter({ hasText: lab }).first();
    await expect(row, 'the saved order is listed').toBeVisible({ timeout: 60_000 });
    await row.getByRole('button').filter({ hasText: /continue|open|resume/i }).first().click();
    await expect(page, 'Continue opens Prepare Samples, the next step').toHaveURL(/\/order\/clinical\/collect/, { timeout: 30_000 });
    await expect(page.locator('main').getByText(lab).first()).toBeVisible({ timeout: 30_000 });
  });

  test('TC-OEV4-GATE-07 a saved order reads back with its sample, test, facility and received date (G7, was TC-EO-05)', async ({ page }) => {
    const o = await newOrderToPrepare(page);
    await fillCollection(page, 0);
    expect((await saveStep(page, 'exit')).status()).toBe(200);
    const edit = await apiJson(page, `/rest/SampleEdit?accessionNumber=${encodeURIComponent(o.lab)}`);
    const flat = JSON.stringify(edit);
    expect(flat, 'Edit Order has the sample type').toContain('Serum');
    expect(edit.sampleOrderItems?.referringSiteName || '', 'Edit Order has the facility').not.toBe('');
    expect(edit.sampleOrderItems?.receivedDateForDisplay || '', 'Edit Order has the received date').not.toBe('');
  });
});
