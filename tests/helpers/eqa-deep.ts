/**
 * tests/helpers/eqa-deep.ts
 *
 * Shared plumbing for the deep EQA suites (tests/eqa-provider-deep, eqa-participant-deep,
 * eqa-inhouse-deep; catalogue eqa-deep.md). Written 2026-10-12 against local develop a4200e2d.
 *
 * The suites follow what proficiency testing programmes actually do (ISO/IEC 17043 for the
 * provider, ISO 15189 7.3.7.3 for the participant, ISO 13528 for the statistics, CLIA 42 CFR 493
 * subparts H and I, WHO LQMS chapter 10), not only what the screens offer. The brief behind the
 * cases is in eqa-deep.md.
 *
 * Fixtures are QA-named ("QA-EQA-DEEP ... <stamp>") and kept in one JSON file per run so a worker
 * that Playwright restarts after a failure finds the same stamp. Nothing is deleted.
 */
import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { api as locApi, db as locDb, lists, typeId, createOrg } from './locations';

export { lists, typeId, createOrg };
export const API = '/api/OpenELIS-Global';

export type R = { status: number; json: any; text: string };

/** A JSON call from inside the page (session cookie and CSRF token of the UI). */
export async function api(page: Page, method: string, url: string, body?: unknown): Promise<R> {
  await ready(page);
  return locApi(page, method, `/rest${url}`, body) as Promise<R>;
}

/** Read-back from the database on a local stack; null elsewhere (the DB cases then skip). */
export function db(sql: string): string | null {
  return locDb(sql);
}

export async function ready(page: Page) {
  if (!page.url().startsWith('http')) await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
}

export const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Per-suite fixture file: the stamp and every id a later case needs. Keyed by the Playwright
 * runner's pid (the workers' parent), so a worker restarted after a failure reads the same file and
 * the next run starts fresh.
 */
export function fixtures<T extends Record<string, any>>(suite: string): { F: T & { S: string }; save: () => void } {
  const file = path.join(os.tmpdir(), `eqa-deep-${suite}-${process.ppid}.json`);
  let F: any = null;
  if (fs.existsSync(file)) {
    try { F = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { F = null; }
  }
  if (!F) F = { S: `${Date.now()}`.slice(-6) };
  const save = () => fs.writeFileSync(file, JSON.stringify(F, null, 1));
  save();
  return { F, save };
}

/** ISO 13528 z with the arithmetic mean and the n-1 SD, the statistic the provider codes. */
export function zScores(values: number[]): number[] {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return values.map((v) => (sd === 0 ? 0 : (v - mean) / sd));
}

/** Verdict as ISO 13528 9.4 words it: |z| <= 2 satisfactory, 2 < |z| < 3 questionable, |z| >= 3 unsatisfactory. */
export function isoVerdict(z: number): 'ACCEPTABLE' | 'QUESTIONABLE' | 'UNACCEPTABLE' {
  const a = Math.abs(z);
  return a >= 3 ? 'UNACCEPTABLE' : a > 2 ? 'QUESTIONABLE' : 'ACCEPTABLE';
}

/** Parse the provider's per-lab score CSV (test,analyte_name,result_value,target_value,z_score,performance_status,scored_on,sample_code). */
export function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

/** Text of a CSV or other text endpoint, from inside the page. */
export async function getText(page: Page, url: string): Promise<{ status: number; text: string; type: string }> {
  await ready(page);
  return page.evaluate(async ([a, u]) => {
    const r = await fetch(a + '/rest' + u, { credentials: 'include' });
    return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '' };
  }, [API, url] as const);
}

/** A PDF as latin1 text, enough to search for plain words in uncompressed or Flate-free streams. */
export async function getPdf(page: Page, url: string): Promise<{ status: number; bytes: Buffer }> {
  const r = await page.context().request.get(`${API}/rest${url}`);
  return { status: r.status(), bytes: await r.body() };
}

/**
 * Pull the readable text out of a PDF: FlateDecode streams inflated, and two-byte (Identity-H)
 * font strings mapped back to Unicode through the ToUnicode CMaps, as OpenPDF writes them.
 * Good enough to search a report for a laboratory's name; not a layout-faithful extractor.
 */
export function pdfText(bytes: Buffer): string {
  const src = bytes.toString('latin1');
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const raw = Buffer.from(m[1], 'latin1');
    let body = raw.toString('latin1');
    try { body = zlib.inflateSync(raw).toString('latin1'); } catch { /* not compressed */ }
    streams.push(body);
  }
  // ToUnicode maps (all fonts merged; enough for searching).
  const cmap = new Map<number, string>();
  const hexStr = (h: string) => {
    let out = '';
    for (let i = 0; i + 4 <= h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return out;
  };
  for (const st of streams) {
    if (!/begincmap/.test(st)) continue;
    for (const blk of st.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
      for (const [, a, b] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) cmap.set(parseInt(a, 16), hexStr(b));
    }
    for (const blk of st.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
      for (const [, a, z, b] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(a, 16); const hi = parseInt(z, 16); const base = parseInt(b, 16);
        for (let c = lo; c <= hi && c - lo < 5000; c++) cmap.set(c, String.fromCharCode(base + (c - lo)));
      }
    }
  }
  const decode2 = (bin: string) => {
    if (!cmap.size || bin.length % 2) return bin;
    let out = ''; let hits = 0;
    for (let i = 0; i < bin.length; i += 2) {
      const code = (bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1);
      const u = cmap.get(code);
      if (u !== undefined) { out += u; hits++; } else out += '?';
    }
    return hits * 2 >= bin.length / 2 ? out : bin;
  };
  const unescape = (lit: string) => lit.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => {
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as any)[e] ?? e;
  });
  const out: string[] = [];
  for (const st of streams) {
    if (/begincmap/.test(st)) continue;
    const parts: string[] = [];
    for (const t of st.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) ?? []) {
      if (t.startsWith('(')) {
        const bin = unescape(t.slice(1, -1));
        parts.push(/[\x00-\x08]/.test(bin) ? decode2(bin) : bin);
      } else {
        const h = t.slice(1, -1).replace(/\s+/g, '');
        let bin = '';
        for (let i = 0; i + 2 <= h.length; i += 2) bin += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
        parts.push(decode2(bin));
      }
    }
    out.push(parts.join(''));
  }
  return out.join('\n');
}

/** Poll a JSON GET until the predicate holds. */
export async function until<T>(page: Page, url: string, pred: (j: any) => T | undefined | false, timeoutMs = 60_000, every = 2000): Promise<T> {
  const t0 = Date.now();
  let last: any;
  while (Date.now() - t0 < timeoutMs) {
    const r = await api(page, 'GET', url);
    last = r.json;
    const v = pred(r.json);
    if (v) return v as T;
    await page.waitForTimeout(every);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting on ${url}; last ${JSON.stringify(last)?.slice(0, 400)}`);
}

/** The cycle row from GET /rest/eqa/cycles/mine. */
export async function myCycle(page: Page, cycleId: string | number): Promise<any> {
  const r = await api(page, 'GET', '/eqa/cycles/mine');
  expect(r.status, 'GET /rest/eqa/cycles/mine').toBe(200);
  return (r.json ?? []).find((c: any) => String(c.id) === String(cycleId));
}

/** Lines of evidence a case wants Casey to see in the run output. */
export function note(tag: string, data: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[EQA-DEEP] ${tag} ${JSON.stringify(data)}`);
}

/**
 * An EQA order the way a participating lab places one: My Cycles > Receive panel opens legacy
 * Add Order (/SamplePatientEntry?isEQA=true&cycleId=) with the enrollment and cycle pre-selected.
 * Same steps as tests/eqa-participant-happy-path.spec.ts TC-EQAHP-02. Returns the lab number.
 */
export async function placeEqaOrder(page: Page, o: { cycleId: string; enrollmentId: string; providerSampleId: string; testName: string; sampleTypeId: string }): Promise<string> {
  await page.goto(`/SamplePatientEntry?isEQA=true&cycleId=${o.cycleId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eqa-sample-checkbox'), 'the EQA box is ticked').toBeChecked({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await expect(page.locator('#eqa-cycle'), 'the cycle is pre-selected').toHaveValue(o.cycleId, { timeout: 15_000 });
  await expect(page.locator('#eqa-program'), 'the enrollment is pre-selected').toHaveValue(o.enrollmentId);
  await page.locator('#eqa-provider-sample-id').fill(o.providerSampleId);
  // The panel's receipt is recorded once per cycle: the second item of a panel shows it as on file.
  if (await page.locator('#eqa-received-temp').isVisible()) await page.locator('#eqa-received-temp').fill('4');
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.locator('#sampleId_0').selectOption(o.sampleTypeId);
  await page.locator('main label').filter({ hasText: new RegExp(`^${o.testName.replace(/[()]/g, '\\$&')}`, 'i') }).first().click();
  await page.evaluate(() => {
    const el = document.getElementById('collectionDate_0') as any;
    el?._flatpickr?.set('maxDate', null);
    el?._flatpickr?.setDate(new Date(), true);
  });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForLoadState('networkidle');
  await page.locator('main').getByText(/^Generate$/).click();
  await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 10_000 });
  const labNo = await page.locator('#labNo').inputValue();
  const { ensureReferringClinic } = await import('../../helpers/data-factory');
  const siteId = await ensureReferringClinic(page, []);
  const sites = await api(page, 'GET', '/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
  const siteName = (sites.json ?? []).find((x: any) => String(x.id) === String(siteId))?.value ?? '';
  if (await page.locator('#siteName').isVisible()) {
    await expect(async () => {
      await page.locator('#siteName').fill('');
      await page.locator('#siteName').fill(siteName.split(' ')[0]);
      await expect(page.getByText(siteName, { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await page.getByText(siteName, { exact: true }).locator('visible=true').first().click();
  }
  if (await page.locator('#requesterLastName').isVisible()) {
    await page.locator('#requesterFirstName').fill('Qadoc');
    await page.locator('#requesterLastName').fill('Eqadeep');
  }
  const post = page.waitForResponse((r) => /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Submit$/ }).click();
  const res = await post;
  expect(res.status(), `EQA order save: ${(await res.text()).slice(0, 300)}`).toBe(200);
  await expect(page.getByText(/Successfully saved/i)).toBeVisible({ timeout: 15_000 });
  return labNo;
}

/** Enter a numeric result on the unified Results page for a lab number; returns the save status. */
export async function enterResult(page: Page, labNo: string, value: string): Promise<number> {
  await page.goto('/Results', { waitUntil: 'domcontentloaded' });
  const search = page.locator('main').getByRole('searchbox', { name: /lab number/i });
  await search.fill(labNo);
  await search.press('Enter');
  const row = page.locator('tr').filter({ hasText: labNo }).first();
  await expect(row, `${labNo} is on the results worklist`).toBeVisible({ timeout: 60_000 });
  const input = row.locator('input[id^="unifiedResultValue-"], select[id^="unifiedResultValue-"]').first();
  if ((await input.evaluate((e) => e.tagName)) === 'SELECT') {
    await input.selectOption({ index: 1 });
  } else {
    await input.fill(value);
    await input.press('Tab');
  }
  const save = page.waitForResponse((r) => /results-entry\/analysis\/\d+\/result$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await row.getByRole('button', { name: /^Save$/ }).click();
  return (await save).status();
}

/** Validate and release one lab number on the one-page Validation screen; returns the release status. */
export async function validate(page: Page, labNo: string): Promise<number> {
  await page.goto('/validation', { waitUntil: 'domcontentloaded' });
  await page.locator('main').getByRole('searchbox', { name: 'Lab number' }).fill(labNo);
  await page.locator('main').getByRole('button', { name: 'Load results' }).click();
  const vrow = page.getByRole('row').filter({ hasText: labNo }).first();
  await expect(vrow, `${labNo} is in the validation queue`).toBeVisible({ timeout: 60_000 });
  await vrow.getByRole('button', { name: /expand/i }).first().click();
  const release = page.waitForResponse((r) => /release/i.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', { timeout: 60_000 });
  await page.getByRole('button', { name: /Validate & release/i }).first().click();
  return (await release).status();
}

/** Log in as another user in a context of its own (never touches the shared admin session). */
export async function asUser<T>(browser: import('@playwright/test').Browser, user: string, pass: string, fn: (p: Page) => Promise<T>): Promise<T> {
  const { BASE } = await import('../../helpers/test-helpers');
  const { performUiLogin } = await import('./session');
  const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  try {
    await performUiLogin(p, user, pass);
    return await fn(p);
  } finally {
    await ctx.close();
  }
}
