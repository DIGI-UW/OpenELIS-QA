import { test, expect } from '@playwright/test';
import { setComponentViaRest, activateViaRest } from '../legacy-order-helper';

// PUT /test-catalog/tests/[id]/basic-info returned 400 for a pure rename (not the 500 of
// OGC-1180 - a different, validation-shaped refusal). Rather than fight it, create the
// deployment-named tests through the create path that is already proven to work (201), give each
// a primary result component, and activate. env-flow matches an anchored pH, so the bare names
// are what it needs.
test.describe.configure({ retries: 0, mode: 'serial' });
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';

const WANT = [
  { name: 'pH', code: 'PH', type: 'N', digits: 2 },
  { name: 'Turbidity', code: 'TURB', type: 'N', digits: 2 },
  { name: 'Lead', code: 'PB', type: 'N', digits: 3 },
];

test('create deployment-named env tests on sample type 51', async ({ page }) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  expect(page.url()).not.toContain('/login');

  const made = await page.evaluate(async (args: any) => {
    const api = args.api;
    const csrf = localStorage.getItem('CSRF') || '';
    const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf };
    const res: any[] = [];

    const existing = await fetch(api + '/test-catalog/tests?domain=ENVIRONMENTAL&page=0&size=100', { headers: { Accept: 'application/json' } });
    const ej: any = existing.ok ? await existing.json().catch(() => null) : null;
    const have = new Map<string, string>();
    for (const r of (ej && ej.rows) || []) have.set(String(r.name), String(r.testId || r.id));

    for (const w of args.want) {
      if (have.has(w.name)) { res.push({ name: w.name, id: have.get(w.name), status: 'exists' }); continue; }
      const r = await fetch(api + '/test-catalog/tests', {
        method: 'POST', headers: H,
        body: JSON.stringify({ name: w.name, reportingName: w.name, code: 'ENV' + w.code, domain: 'ENVIRONMENTAL', labUnitId: '56', sampleTypeId: '51' }),
      });
      const t = await r.text();
      let id = '';
      try { id = JSON.parse(t).testId; } catch (e) { id = ''; }
      res.push({ name: w.name, id: id, status: r.status, body: t.slice(0, 80) });
    }
    return res;
  }, { api: API, want: WANT });

  for (const m of made) console.log('[mk] ' + JSON.stringify(m));

  for (const m of made as any[]) {
    if (!m.id) continue;
    const w = WANT.find((x) => x.name === m.name);
    if (!w) continue;
    try {
      await setComponentViaRest(page, m.id, { code: w.code, label: w.name, resultType: w.type, significantDigits: w.digits });
      await activateViaRest(page, m.id);
      console.log('[mk] ' + m.id + ' (' + m.name + ') component + ACTIVATED');
    } catch (e: any) {
      console.log('[mk] ' + m.id + ' (' + m.name + ') failed: ' + String(e).slice(0, 180));
    }
  }

  const rb = await page.evaluate(async (api: string) => {
    const r = await fetch(api + '/sample-type-tests?sampleType=51', { headers: { Accept: 'application/json' } });
    return (await r.text()).slice(0, 500);
  }, API);
  console.log('[mk] READBACK sample-type-tests 51 :: ' + rb);
});
