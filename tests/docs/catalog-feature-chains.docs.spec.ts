// Catalogue feature chains: order -> results entry -> validation, asserting the
// FEATURES rather than the plumbing.
//
// WHY THIS EXISTS
// On 2026-08-25 these five behaviours were each proven by hand in real Chrome —
// panels expanding by sample type, reflex firing, calculated values computing,
// and abnormal/critical flagging — and every one of them worked. Proven once is
// not protected: nothing in the suite would notice if any of them broke. The
// defect regressions added the same day (titer, multi-select routing, workplan)
// are all RED on purpose; this file is the GREEN counterpart and should stay
// green.
//
// It deliberately reuses ONE order for all four assertions. Each extra order is
// another trip through the wizard, which is the slowest and flakiest part of the
// run; the features under test are independent of one another, so one order is
// enough and keeps the spec cheap enough to run often.
//
// The order-form rules this relies on now live in order-helpers.ts (backlog #9)
// rather than being restated here.
//
//   BASE=https://testing.openelis-global.org npx playwright test -c chains-features.config.ts

import { test, expect, Page } from '@playwright/test';
import {
  setById,
  commitSiteAndRequester,
  generateLabNumberOnForm,
  selectSampleTypeOnOrderForm,
  openTestsAndPanels,
  tickByExactLabel,
  saveAndNextEnabled,
  clickThroughSaveAndNext,
  clickAddNew,
} from './order-helpers';

test.describe.configure({ retries: 0, mode: 'serial' });

const API = '/api/OpenELIS-Global/rest';
const SERUM = /^\s*Serum\s*$/i;

// Instance fixtures these assertions depend on. Each is checked in TC-CHAIN-0 so
// a data change fails with "the fixture is gone" rather than "the feature broke".
const PANEL_NAME = 'QA Panel Test 20260811';   // Amylase (Serum) + Actin Smooth Muscle (IHC)
const PANEL_SERUM_MEMBER = 'Amylase';
const GLUCOSE = 'Demo Glucose 250395';          // reflex parent, rule threshold > 200
const REFLEX_CHILD = 'Demo HbA1c 250395';
const CRITICAL_TEST = 'QA_AUTO_0727_14692 Critical';  // normal 5-100, critical 2/150, valid 0-300
const CALC_CHILD = /Cr[ée]atinine/i;            // Amylase x2 -> Creatinine

let labNumber = '';

/** Read the worklist for an order straight from the server, not off the screen. */
async function readResults(page: Page, lab: string): Promise<Array<Record<string, any>>> {
  const res = await page.request.get(
    `${API}/LogbookResults?labNumber=${lab}&doRange=false&finished=false`,
  );
  expect(res.status(), `LogbookResults for ${lab} should answer 200`).toBe(200);
  const body = await res.json();
  return (body.testResult ?? []) as Array<Record<string, any>>;
}

const named = (rows: Array<Record<string, any>>, re: RegExp) =>
  rows.find((r) => re.test(String(r.testName ?? '')));

/** Type a numeric result into the row whose test name matches, then save that row. */
async function enterNumeric(page: Page, testRe: RegExp, value: string): Promise<boolean> {
  return await page.evaluate((args) => {
    const rx = new RegExp(args.src, 'i');
    const row = [...document.querySelectorAll('table tbody tr')].find((r) => rx.test(r.textContent || ''));
    if (!row) return false;
    const input = row.querySelector('input[type=number]') as HTMLInputElement | null;
    if (!input) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, args.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const save = [...row.querySelectorAll('button')].find((b) => /^save$/i.test((b.textContent || '').trim()));
    if (save) { (save as HTMLElement).click(); return true; }
    return false;
  }, { src: testRe.source, value });
}

test('TC-CHAIN-0: the catalogue fixtures these chains depend on still exist', async ({ page }) => {
  const res = await page.request.get(`${API}/test-catalog/tests?pageSize=1000`);
  expect(res.status()).toBe(200);
  const names = ((await res.json()).rows ?? []).map((t: any) => String(t.name ?? ''));
  const present = (frag: string) => names.some((n: string) => n.includes(frag));

  for (const frag of [GLUCOSE, REFLEX_CHILD, CRITICAL_TEST, PANEL_SERUM_MEMBER]) {
    expect(present(frag), `catalogue fixture "${frag}" is missing — the chains below cannot mean anything`).toBe(true);
  }

  // Panels do NOT live under /test-catalog. The catalogue UI reads them from
  // /rest/PanelCreate, which answers { existingPanelList: [ { typeOfSampleName,
  // panels: [ { panelName, ... } ] } ] } -- grouped BY SAMPLE TYPE, with the
  // same panel repeated under every type it spans. That shape is itself the
  // premise of TC-CHAIN-1: QA Panel Test 20260811 appears under both Serum and
  // Immunohistochemistry specimen. An earlier cut of this test guessed
  // /test-catalog/panels?pageSize=200, which answers 200 with an empty body,
  // so it failed as -the panel is missing- rather than -the URL is wrong-.
  const panels = await page.request.get(`${API}/PanelCreate`);
  expect(panels.status()).toBe(200);
  const groups = ((await panels.json()).existingPanelList ?? []) as Array<any>;
  const panelNames = new Set<string>();
  for (const g of groups) for (const pn of g.panels ?? []) panelNames.add(String(pn.panelName ?? ''));
  expect([...panelNames], `panel fixture ${PANEL_NAME} is missing`).toContain(PANEL_NAME);

  // and it must still span more than one sample type, or TC-CHAIN-1 proves nothing
  const spans = groups
    .filter((g: any) => (g.panels ?? []).some((pn: any) => pn.panelName === PANEL_NAME))
    .map((g: any) => String(g.typeOfSampleName ?? ''));
  expect(spans.length, `panel ${PANEL_NAME} no longer spans multiple sample types (found: ${spans.join(', ')})`).toBeGreaterThan(1);
  expect(spans.some((n: string) => /serum/i.test(n)), `panel ${PANEL_NAME} no longer covers Serum`).toBe(true);
});

test('TC-CHAIN-1: a panel spanning sample types orders only its matching members', async ({ page }) => {
  test.setTimeout(240_000);

  // The clinical order wizard is /order/clinical/enter. /SamplePatientEntry
  // also renders a form with an id of labNumber, but there it is the PREVIOUS
  // Lab Number search box, never populated by Generate -- so pointing this
  // chain at that route failed as -no lab number was generated- rather than as
  // -wrong page-. Match coded-result-chain.docs.spec.ts, which is green.
  await page.goto('/order/clinical/enter');
  await page.waitForTimeout(3000);

  labNumber = await generateLabNumberOnForm(page);
  expect(labNumber, 'a lab number must be generated').not.toBe('');
  console.log('[chains] lab=' + labNumber);

  await clickAddNew(page, /^New Patient$/);
  await page.waitForTimeout(1500);
  await setById(page, 'nationalId', 'NID-CHAIN-' + labNumber.slice(-6));
  await setById(page, 'lastName', 'Chainfeature');
  await setById(page, 'firstName', 'Quinn');
  await page.evaluate(() => {
    const w = document.getElementById('date-picker-default-id');
    const inp = w ? w.querySelector('input') : null;
    if (inp) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(inp, '15/05/1990');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const l = document.querySelector('label[for="radio-1"]') as HTMLElement | null;
    if (l) l.click();
  });
  await page.waitForTimeout(1200);

  const committed = await commitSiteAndRequester(page);
  expect(committed.org, 'the requesting organization must be committed (Select, or Add new on first use)').not.toBeNull();

  const picked = await selectSampleTypeOnOrderForm(page, SERUM);
  expect(picked, 'Serum must be offered as a sample type').not.toBeNull();

  await openTestsAndPanels(page);
  expect(await tickByExactLabel(page, PANEL_NAME), `the panel "${PANEL_NAME}" must be tickable`).toBe(true);
  expect(await tickByExactLabel(page, GLUCOSE), `"${GLUCOSE}" must be tickable`).toBe(true);
  expect(await tickByExactLabel(page, CRITICAL_TEST), `"${CRITICAL_TEST}" must be tickable`).toBe(true);

  expect(await saveAndNextEnabled(page), 'Save & Next must be enabled once site + requester are committed').toBe(true);
  await clickThroughSaveAndNext(page);

  const rows = await readResults(page, labNumber);
  const names = rows.map((r) => String(r.testName ?? ''));
  console.log('[chains] ordered: ' + names.join(' | '));

  // The panel holds Amylase (Serum) and Actin Smooth Muscle (Immunohistochemistry
  // specimen). Ordered against a Serum sample, only the Serum member applies.
  expect(names.some((n) => n.includes(PANEL_SERUM_MEMBER)),
    'the panel should contribute its Serum member').toBe(true);
  // The other half of this behaviour -- that the panel must NOT drag its
  // Immunohistochemistry member onto a Serum sample -- is currently BROKEN, so
  // it lives in tests/panel-sample-type-leak.spec.ts with the rest of the RED
  // defect regressions. Asserting it here would make this file permanently red
  // and hide the four behaviours that do work.
});

test('TC-CHAIN-2: a reflex rule adds its child test when the threshold is crossed', async ({ page }) => {
  test.skip(!labNumber, 'the order step did not complete');
  test.setTimeout(180_000);

  await page.goto(`/Results?type=order&accessionNumber=${labNumber}`);
  await page.waitForTimeout(3000);

  const before = await readResults(page, labNumber);
  expect(named(before, new RegExp(REFLEX_CHILD)), 'the reflex child must not be present before the trigger').toBeUndefined();

  // Rule "High glucose adds HbA1c 250395": Demo Glucose 250395(Serum) > 200.
  expect(await enterNumeric(page, new RegExp(GLUCOSE), '250'), 'the glucose row must accept a value and save').toBe(true);
  await page.waitForTimeout(4000);

  const after = await readResults(page, labNumber);
  expect(named(after, new RegExp(REFLEX_CHILD)),
    `entering ${GLUCOSE} = 250 (rule threshold 200) should have added "${REFLEX_CHILD}"`).toBeTruthy();
});

test('TC-CHAIN-3: a calculated-value rule computes its child from the parent result', async ({ page }) => {
  test.skip(!labNumber, 'the order step did not complete');
  test.setTimeout(180_000);

  await page.goto(`/Results?type=order&accessionNumber=${labNumber}`);
  await page.waitForTimeout(3000);

  // Rule QA_AUTO_0820_CALC_UI_NUM: Serum/Amylase Multiplied By 2 -> Serum/Creatinine.
  expect(await enterNumeric(page, /Amylase/i, '999'), 'the amylase row must accept a value and save').toBe(true);
  await page.waitForTimeout(4500);

  const rows = await readResults(page, labNumber);
  const calc = named(rows, CALC_CHILD);
  expect(calc, 'the calculated child analysis should have been created').toBeTruthy();
  expect(String(calc!.resultValue ?? ''),
    'the calculated value should be twice the parent (999 x 2)').toMatch(/^1998(\.0+)?$/);
});

test('TC-CHAIN-4: an out-of-range value is flagged, and the flag survives validation', async ({ page }) => {
  test.skip(!labNumber, 'the order step did not complete');
  test.setTimeout(240_000);

  await page.goto(`/Results?type=order&accessionNumber=${labNumber}`);
  await page.waitForTimeout(3000);

  // Normal 5-100, critical high 150, valid to 300. 200 is above critical.
  expect(await enterNumeric(page, new RegExp(CRITICAL_TEST), '200'), 'the critical-test row must accept a value and save').toBe(true);
  await page.waitForTimeout(4000);

  // Validate the order. The Flag column stays EMPTY at "Accepted by technician"
  // and only populates once the result reaches "Results final" — asserting before
  // validation reads as a missing flag when it is merely not computed yet.
  await page.goto('/AccessionValidation');
  await page.waitForTimeout(2500);
  await setById(page, 'accessionNumber', labNumber);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^search$/i.test((x.textContent || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(3500);

  const accepted = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('input[type=checkbox]')].filter((c) => /isAccepted/.test((c as HTMLInputElement).id));
    boxes.forEach((c) => (c as HTMLElement).click());
    return boxes.length;
  });
  expect(accepted, 'the validation screen should list the saved results').toBeGreaterThan(0);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^validate$/i.test((x.textContent || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(5000);

  await page.goto(`/Results?type=order&accessionNumber=${labNumber}`);
  await page.waitForTimeout(3500);

  const flagged = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const row = [...document.querySelectorAll('table tbody tr')].find((r) => rx.test(r.textContent || ''));
    if (!row) return null;
    const cells = [...row.querySelectorAll('td')].map((c) => (c.textContent || '').trim());
    return { cells, text: (row.textContent || '').trim() };
  }, CRITICAL_TEST);

  expect(flagged, 'the critical test row must still be on the worklist').not.toBeNull();
  expect(flagged!.cells.join(' | '), 'a value above the critical high should be flagged Critical once final')
    .toMatch(/Critical/);
  expect(flagged!.cells.join(' | '), 'and the analysis should have reached Results final')
    .toMatch(/Results final/);
});
