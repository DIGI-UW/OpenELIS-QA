/**
 * helpers/order-entry-v4.ts
 *
 * Clinical Order Entry v4 (OGC-1266) driven the way reception uses it:
 * Enter Order (/order/clinical/enter) -> Prepare Samples (/order/clinical/collect)
 * -> Sample check (/order/clinical/qa). Written 2026-10-08 against local develop
 * 76c6d625a (images 2026-10-08 04:22 UTC). Locators come from that build's DOM:
 *   Enter Order: #labNumber, #order-patient-search-lastName, #order-patient-search-local_search,
 *     radios #order-patient-search-<patientPK>, #sampleType-<n>, input[id^="test-<n>-"], #siteName
 *     (results are table rows with a Select button), footer "Save and exit" / "Save and next".
 *   Prepare Samples: [data-testid=sample-collection-card-<n>], #collectionDate-<n>, #collectionTime-<n>,
 *     #collector-<n>, [data-testid=handling-*-<n>], #arrivalCondition-<n>, [data-testid=prepare-labels-section],
 *     [data-testid=labels-print-all], "Refer Out" row buttons, [data-testid=refer-out-all].
 * Every order save is POST /rest/SamplePatientEntry.
 */
import { expect, Page, Response } from '@playwright/test';
import { inflateSync } from 'zlib';
import { createPatientViaAPI } from './data-factory';

export const API = '/api/OpenELIS-Global';
export const ENTER = '/order/clinical/enter';
export const ENTRY_POST = /\/rest\/SamplePatientEntry$/;

/** Letters only: the server rejects a digit anywhere in a name (400 "invalid name format"). */
export const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface SeededPatient { id: string; firstName: string; lastName: string; nationalId: string; dob: string }

export async function seedPatient(page: Page, o: Partial<SeededPatient> = {}): Promise<SeededPatient> {
  if (!/^https?:/.test(page.url())) await page.goto('/', { waitUntil: 'domcontentloaded' });
  const p = {
    firstName: o.firstName ?? cap(`qa${letters(8)}`),
    lastName: o.lastName ?? cap(`qaoev${letters(8)}`),
    nationalId: o.nationalId ?? `QAOEV${Date.now()}${Math.floor(Math.random() * 100)}`,
    dob: o.dob ?? '14/03/1988',
  };
  const c = await createPatientViaAPI(page, { nationalId: p.nationalId, firstName: p.firstName, lastName: p.lastName, gender: 'F', dateOfBirth: p.dob });
  expect(c.id, `seed patient should be created: ${c.detail || ''}`).toBeTruthy();
  return { id: String(c.id), ...p };
}

export async function apiJson<T = any>(page: Page, path: string): Promise<T> {
  const r = await page.request.get(`${API}${path}`);
  expect(r.status(), `GET ${path}`).toBe(200);
  return (await r.json()) as T;
}

export async function orderSearch(page: Page, lab: string): Promise<any> {
  return apiJson(page, `/rest/order/search?labNumber=${encodeURIComponent(lab)}`);
}

/** Opens Enter Order and returns the lab number the page generated on load. */
export async function openEnter(page: Page): Promise<string> {
  await page.goto(ENTER, { waitUntil: 'domcontentloaded' });
  const lab = page.locator('#labNumber');
  await expect(lab, 'Enter Order generates a lab number on load').not.toHaveValue('', { timeout: 60_000 });
  return lab.inputValue();
}

/** Searches by last name and selects the patient whose PK is given. */
export async function pickPatient(page: Page, p: SeededPatient) {
  await page.locator('#order-patient-search-lastName').fill(p.lastName);
  await page.locator('#order-patient-search-local_search').click();
  const radio = page.locator(`#order-patient-search-${p.id}`);
  await expect(radio, `patient ${p.lastName} is listed`).toBeAttached({ timeout: 30_000 });
  const label = page.locator(`label[for="order-patient-search-${p.id}"]`);
  if (await label.count()) await label.first().click();
  else await radio.check({ force: true });
  await expect(page.getByRole('link', { name: 'Select or create the patient' }), 'the patient is on the order').toHaveCount(0, { timeout: 15_000 });
}

export async function sampleTypeId(page: Page, name: string): Promise<string> {
  const types = await apiJson<{ id: string; value: string }[]>(page, '/rest/user-sample-types');
  const t = types.find((x) => x.value.toLowerCase() === name.toLowerCase());
  expect(t, `sample type ${name} exists`).toBeTruthy();
  return String(t!.id);
}

/** Chooses the sample type on sample card n and ticks the test whose label starts with testName (or the first test). */
export async function pickSampleAndTest(page: Page, n: number, sampleType: string, testName?: string): Promise<string> {
  if (n > 0 && !(await page.locator(`#sampleType-${n}`).count())) {
    await page.getByRole('button', { name: /^Add Sample$/ }).click();
  }
  await page.locator(`#sampleType-${n}`).selectOption(await sampleTypeId(page, sampleType));
  const boxes = page.locator(`input[id^="test-${n}-"]`);
  await expect(boxes.first(), `tests load for ${sampleType}`).toBeAttached({ timeout: 30_000 });
  let id = await boxes.first().getAttribute('id');
  if (testName) {
    const label = page.locator(`label[for^="test-${n}-"]`).filter({ hasText: new RegExp(`^\\s*${testName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`) }).first();
    id = await label.getAttribute('for');
  }
  await page.locator(`label[for="${id}"]`).click();
  await expect(page.locator(`#${id}`)).toBeChecked();
  return String(id).replace(`test-${n}-`, '');
}

/** Chooses the first referring clinic from the site search. */
export async function pickSite(page: Page): Promise<string> {
  const sites = await apiJson<{ id: string; value: string }[]>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
  expect(sites.length, 'a referring clinic is configured').toBeGreaterThan(0);
  const name = String(sites[0].value);
  await page.locator('#siteName').fill(name.slice(0, Math.min(4, name.length)));
  const row = page.getByRole('row').filter({ hasText: name }).first();
  await expect(row, 'the site search lists the clinic').toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /^Select$/ }).click();
  return name;
}

export const footer = (page: Page, which: 'next' | 'exit') =>
  page.locator('main').getByRole('button', { name: which === 'next' ? 'Save and next' : 'Save and exit', exact: true }).last();

/** Presses Save and next / Save and exit and returns the order POST it sent. */
export async function saveStep(page: Page, which: 'next' | 'exit'): Promise<Response> {
  const b = footer(page, which);
  await expect(b, `Save and ${which} is enabled`).toBeEnabled({ timeout: 20_000 });
  const resp = page.waitForResponse((r) => r.request().method() === 'POST' && ENTRY_POST.test(new URL(r.url()).pathname), { timeout: 60_000 });
  await b.click();
  return resp;
}

export interface NewOrder { lab: string; patient: SeededPatient; testIds: string[] }

/**
 * A new order through Enter Order for a seeded patient: one sample per entry in
 * `samples`, Save and next, and lands on Prepare Samples.
 */
export async function newOrderToPrepare(page: Page, samples: { type: string; test?: string }[] = [{ type: 'Serum' }], patient?: SeededPatient): Promise<NewOrder> {
  const p = patient ?? (await seedPatient(page));
  const lab = await openEnter(page);
  await pickPatient(page, p);
  const testIds: string[] = [];
  for (let i = 0; i < samples.length; i++) testIds.push(await pickSampleAndTest(page, i, samples[i].type, samples[i].test));
  await pickSite(page);
  const r = await saveStep(page, 'next');
  expect(r.status(), 'Enter Order saves').toBe(200);
  await expect(page, 'Save and next opens Prepare Samples').toHaveURL(/\/order\/clinical\/collect/, { timeout: 30_000 });
  await expect(page.getByTestId('sample-collection-card-0')).toBeVisible({ timeout: 60_000 });
  return { lab, patient: p, testIds };
}

/** A new order whose samples are saved on Prepare Samples (Save and exit), reopened there. */
export async function savedPrepare(page: Page, samples: { type: string; test?: string }[] = [{ type: 'Serum' }]): Promise<NewOrder> {
  const o = await newOrderToPrepare(page, samples);
  for (let i = 0; i < samples.length; i++) await fillCollection(page, i);
  const r = await saveStep(page, 'exit');
  expect(r.status(), 'Prepare Samples saves').toBe(200);
  await openPrepare(page, o.lab);
  return o;
}

/** Collection date today (UTC, the test server's zone) at 06:00 on sample card n. */
export async function fillCollection(page: Page, n: number, time = '06:00') {
  const d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  await page.locator(`#collectionDate-${n}`).fill(`${dd}/${mm}/${d.getUTCFullYear()}`);
  await page.keyboard.press('Escape');
  await page.locator(`#collectionTime-${n}`).fill(time);
  await page.keyboard.press('Tab');
}

export async function openPrepare(page: Page, lab: string) {
  await page.goto(`/order/clinical/collect?labNumber=${encodeURIComponent(lab)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('sample-collection-card-0')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#collectionDate-0')).toBeVisible();
}

/** The "To continue to ..." checklist items, as text. */
export async function toContinue(page: Page): Promise<string[]> {
  const region = page.getByRole('region', { name: /^To continue to/ });
  if (!(await region.count())) return [];
  return region.getByRole('listitem').allInnerTexts();
}

export async function referredOut(page: Page, lab: string): Promise<any[]> {
  const j = await apiJson(page, `/rest/ReferredOutTests?searchType=LAB_NUMBER&labNumber=${encodeURIComponent(lab)}`);
  return j.referralDisplayItems || [];
}

export async function dashboardHas(page: Page, lab: string, status: string): Promise<any | null> {
  const j = await apiJson(page, `/rest/order/dashboard?search=${encodeURIComponent(lab)}&status=${status}`);
  return (j.orders || []).find((o: any) => o.labNumber === lab) || null;
}

/**
 * Counts pages in a PDF body: "/Type /Page" objects (not "/Pages"), including those
 * inside compressed object streams, which PDFBox writes for PDF 1.5+.
 */
export function pdfPageCount(buf: Buffer): number {
  const raw = buf.toString('latin1');
  let text = raw;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try { text += inflateSync(buf.subarray(start, end)).toString('latin1'); } catch { /* not a Flate stream */ }
    re.lastIndex = end;
  }
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

/** Picks the first option in the Refer Out "Referring Lab" combobox inside scope; returns its name. */
export async function pickReferenceLab(page: Page, scope = page.locator('main')): Promise<string> {
  const lab = scope.getByRole('combobox', { name: 'Referring Lab' });
  await lab.click();
  const opt = page.getByRole('listbox').getByRole('option').first();
  await expect(opt, 'reference laboratories are offered').toBeVisible({ timeout: 15_000 });
  const name = (await opt.innerText()).trim();
  await opt.click();
  await expect(lab).toHaveValue(name);
  return name;
}

/** Raw i18n keys or field paths visible in main (R-UX-1): dotted lowercase identifiers like "order.continue.item.x". */
export async function rawKeysOnScreen(page: Page): Promise<string[]> {
  const text = await page.locator('main').innerText();
  return Array.from(new Set(text.match(/\b[a-z][a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+){2,}\b/g) || [])).filter((k) => !/^\d|www\.|\.(org|com|pdf)$/.test(k));
}

/**
 * The header's locale picker (User panel, "Select Locale"). Found by its English option, not by its
 * label, so it works whatever language the page is in. The choice is kept by the server for the
 * session, so a case that changes it must put the previous value back (see TC-OEV4-M14-15).
 */
async function localeSelect(page: Page) {
  const select = page.getByRole('banner').getByRole('combobox').filter({ has: page.locator('option', { hasText: /^English$/ }) }).first();
  if (!(await select.isVisible().catch(() => false))) await page.locator('#user-Icon').click();
  await expect(select, 'the locale picker is in the User panel').toBeVisible({ timeout: 10_000 });
  return select;
}
export async function currentLocale(page: Page): Promise<string> {
  return (await localeSelect(page)).inputValue();
}
/** Selects the locale whose option text matches `label` (or whose value equals it); returns the value chosen. */
export async function setLocale(page: Page, label: RegExp | string): Promise<string> {
  const select = await localeSelect(page);
  const value = typeof label === 'string' ? label : await select.locator('option').evaluateAll(
    (opts, src) => { const re = new RegExp(src, 'i'); const o = (opts as HTMLOptionElement[]).find((x) => re.test(x.textContent?.trim() ?? '')); return o?.value ?? ''; },
    label.source,
  );
  expect(value, `the locale picker offers ${label}`).not.toBe('');
  await select.selectOption(value);
  await page.waitForTimeout(1500);
  return value;
}
