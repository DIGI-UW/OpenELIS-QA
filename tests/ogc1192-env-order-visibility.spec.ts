/**
 * tests/ogc1192-env-order-visibility.spec.ts
 *
 * OGC-1192 — flip-when-fixed regression suite.
 *   "Environmental orders are invisible to every dashboard once saved, and
 *    patientless samples crash patient-joining code (SampleEdit 500)"
 *
 * HOW TO READ THIS FILE (same convention as modify-order-field-binding.spec.ts)
 * ---------------------------------------------------------------------------
 * These assertions encode the BROKEN behaviour observed on
 * testing.openelis-global.org v3.2.2.0 on 2026-09-03. While the bug is present
 * the suite is GREEN. **A failure here is good news: it means the fix landed.**
 * When that happens, invert the assertion the failure names and move the case
 * into the permanent-truth section at the bottom.
 *
 * Every case is anchored to a measurement taken by hand first — no case here
 * asserts something that was not observed directly through the UI or a
 * controlled API comparison.
 *
 * MEASURED BASELINE (2026-09-03, v3.2.2.0)
 *   - ~12 environmental orders created in one session (DEV…655 through …676).
 *   - environmental dashboard totalCount: 0, every time.
 *   - unfiltered dashboard totalCount: 21, unchanged before and after.
 *   - SampleEdit: nonexistent accession -> 200 + noSampleFound:true
 *                 accession with a patient -> 200 + payload
 *                 accession without a patient -> 500
 *
 * Run: npx playwright test -c ogc1192.config.ts
 */

import { test, expect } from '@playwright/test';
import { buildEnvOrderPayload, ddMMyyyy } from './chains/env-order-payload';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';

/** A sample known to exist WITH a patient — the positive control. */
const PATIENT_SAMPLE = 'DEV01260000000000001';
/** An accession known NOT to exist — the negative control. */
const ABSENT_SAMPLE = 'DEV01260000000000654';

interface ApiResult<T> { ok: boolean; status: number; body: T | string | null }

async function api<T = unknown>(
  page: import('@playwright/test').Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  return page.evaluate(async ({ path, init }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrf;
    }
    const r = await fetch(path, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
    return { ok: r.ok, status: r.status, body: parsed as never };
  }, { path, init: init ?? null } as never);
}

/** Create a fresh environmental order via the verified payload. */
async function createEnvOrder(page: import('@playwright/test').Page): Promise<string> {
  const gen = await api<{ body?: string }>(page, `${API}/SampleEntryGenerateScanProvider`);
  const labNo = (gen.body as { body?: string })?.body;
  expect(gen.ok, 'accession generator reachable').toBeTruthy();
  expect(labNo, 'accession generator returned an accession').toBeTruthy();

  const post = await api(page, `${API}/SamplePatientEntry`, {
    method: 'POST',
    body: buildEnvOrderPayload({ labNo: labNo as string, date: ddMMyyyy() }),
  });
  expect(post.status, `env order create for ${labNo} (payload is verified-good; a non-200 means the create contract changed)`).toBe(200);
  return labNo as string;
}

test.describe.configure({ mode: 'serial' });

test.describe('OGC-1192 — environmental order visibility + patientless crash', () => {
  let accession: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(page.url(), 'session is authenticated (an expired session answers 200 with the login page)').not.toContain('/login');
    accession = await createEnvOrder(page);
    await page.close();
  });

  // -------------------------------------------------------------------------
  // §1 — dashboard invisibility
  // -------------------------------------------------------------------------

  test('OGC1192-1 — saved env order is ABSENT from the environmental dashboard (BROKEN)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ orders?: Array<{ labNumber?: string }>; totalCount?: number }>(
      page, `${API}/order/dashboard?page=1&pageSize=100&workflowType=environmental`);
    const body = r.body as { orders?: Array<{ labNumber?: string }>; totalCount?: number };
    const present = (body.orders ?? []).some(o => o.labNumber === accession);

    expect(
      present,
      `FLIP ME: ${accession} now appears on the environmental dashboard (totalCount=${body.totalCount}). ` +
      'OGC-1192 §1 is FIXED — invert this to expect(present).toBeTruthy() and move it below.',
    ).toBeFalsy();
  });

  test('OGC1192-2 — saved env order is ABSENT from the unfiltered dashboard too (BROKEN)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ orders?: Array<{ labNumber?: string }>; totalCount?: number }>(
      page, `${API}/order/dashboard?page=1&pageSize=100`);
    const body = r.body as { orders?: Array<{ labNumber?: string }>; totalCount?: number };
    const present = (body.orders ?? []).some(o => o.labNumber === accession);

    expect(
      present,
      `FLIP ME: ${accession} now appears on the unfiltered dashboard (totalCount=${body.totalCount}). ` +
      'This proves it was never a workflowType filter problem. OGC-1192 §1 is FIXED.',
    ).toBeFalsy();
  });

  test('OGC1192-3 — environmental dashboard reports zero despite orders existing (BROKEN)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ totalCount?: number }>(page, `${API}/order/dashboard?page=1&pageSize=100&workflowType=environmental`);
    const total = (r.body as { totalCount?: number }).totalCount ?? -1;

    expect(
      total,
      `FLIP ME: environmental dashboard now reports ${total} orders. At least ${accession} exists, so a non-zero ` +
      'count means OGC-1192 §1 is FIXED — assert it contains the created accession instead.',
    ).toBe(0);
  });

  test('OGC1192-4 — the dashboard UI shows the empty state (BROKEN)', async ({ page }) => {
    // The UI half of §1. app-route-census passes this page because it paints a
    // heading and a table; this case looks at what the table actually says.
    await page.goto(`${BASE}/order/environmental`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const text = (await page.locator('body').innerText()).toLowerCase();
    const empty = text.includes('no orders found') || /0[–-]0 of 0/.test(text);

    expect(
      empty,
      'FLIP ME: the environmental dashboard no longer shows its empty state — it is rendering orders. ' +
      'OGC-1192 §1 is FIXED in the UI; assert the created accession is listed instead.',
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // §2 — patientless sample crashes SampleEdit
  // -------------------------------------------------------------------------

  test('OGC1192-5 — SampleEdit 500s on the patientless sample (BROKEN)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api(page, `${API}/SampleEdit?accessionNumber=${accession}`);

    expect(
      r.status,
      `FLIP ME: SampleEdit now returns ${r.status} for patientless sample ${accession} instead of 500. ` +
      'OGC-1192 §2 is FIXED — invert to expect a 200 carrying the sample.',
    ).toBe(500);
  });

  test('OGC1192-6 — CONTROL: SampleEdit handles a nonexistent accession gracefully', async ({ page }) => {
    // Permanent truth, not a bug encoding. This is what makes case 5 meaningful:
    // the 500 is specific to "exists but patientless", not to error handling
    // generally. If THIS case fails, case 5 proves nothing — fix this first.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ noSampleFound?: boolean }>(page, `${API}/SampleEdit?accessionNumber=${ABSENT_SAMPLE}`);

    expect(r.status, `control: absent accession ${ABSENT_SAMPLE} should answer 200, not crash`).toBe(200);
    expect((r.body as { noSampleFound?: boolean }).noSampleFound,
      'control: absent accession should report noSampleFound').toBe(true);
  });

  test('OGC1192-7 — CONTROL: SampleEdit serves a sample that has a patient', async ({ page }) => {
    // The other half of the control pair. Together 6 and 7 establish that the
    // only variable in case 5 is the absence of a patient.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const r = await api<{ noSampleFound?: boolean }>(page, `${API}/SampleEdit?accessionNumber=${PATIENT_SAMPLE}`);

    expect(r.status, `control: ${PATIENT_SAMPLE} has a patient and should serve normally`).toBe(200);
    expect((r.body as { noSampleFound?: boolean }).noSampleFound,
      'control: a real sample should not report noSampleFound').toBeFalsy();
  });

  test('OGC1192-8 — Modify Order UI renders no patient info for the env order (BROKEN)', async ({ page }) => {
    await page.goto(`${BASE}/ModifyOrder?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    const noPatient = /No Patient Information Available/i.test(text);

    expect(
      noPatient,
      'FLIP ME: Modify Order no longer shows "No Patient Information Available" for a patientless env order. ' +
      'Either OGC-1192 §2 is fixed or the screen now handles environmental samples deliberately — check which, ' +
      'then assert the order\'s own fields are rendered.',
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // §3 — permanent truths (NOT bug encodings; these should always hold)
  // -------------------------------------------------------------------------

  test('OGC1192-9 — the environmental order create path works', async ({ page }) => {
    // Guardrail. If the create itself breaks, every case above becomes
    // meaningless — they would all "pass" against an order that never existed.
    // beforeAll already asserts the 200; this states the dependency out loud so
    // a reader knows the suite is not self-excusing when creates fail.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    expect(accession, 'an environmental order was created for this run').toBeTruthy();
    expect(accession).toMatch(/^DEV\d+$/);
  });
});
