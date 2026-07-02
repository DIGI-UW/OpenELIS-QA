// Demo-data seed capability (part 3): 10 providers. Idempotent by name. Re-runnable.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-providers.docs.spec.ts
import { test } from '@playwright/test';
const P = '/api/OpenELIS-Global';

const PROVIDERS = [
  { first: 'Andini', last: 'Wijaya' }, { first: 'Budi', last: 'Santoso' }, { first: 'Citra', last: 'Halim' },
  { first: 'Dewi', last: 'Lestari' }, { first: 'Eko', last: 'Pratama' }, { first: 'Farah', last: 'Nuraini' },
  { first: 'Gita', last: 'Permata' }, { first: 'Hadi', last: 'Kusuma' }, { first: 'Indah', last: 'Sari' },
  { first: 'Joko', last: 'Anwar' },
];

test('seed providers', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/'); await page.waitForTimeout(800);

  const searchRes = await page.request.get(`${P}/rest/provider/search?pageSize=200`);
  const existing = searchRes.ok() ? ((await searchRes.json().catch(() => ({}))).providers || []) : [];
  const existingNames = new Set(existing.map((p: any) => `${(p.firstName || '').trim().toLowerCase()} ${(p.lastName || '').trim().toLowerCase()}`.trim()));
  console.log('EXISTING_PROVIDERS', existing.length);

  let created = 0, skipped = 0, failed = 0;
  for (let i = 0; i < PROVIDERS.length; i++) {
    const pr = PROVIDERS[i];
    if (existingNames.has(`${pr.first.toLowerCase()} ${pr.last.toLowerCase()}`)) { skipped++; console.log('SKIP_EXISTS', pr.first, pr.last); continue; }
    const phone = `+62-21-555-${String(1000 + i)}`;
    const res: any = await page.evaluate(async ({ P, pr, phone }: any) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const uuid = (crypto as any).randomUUID ? (crypto as any).randomUUID() : ('' + Date.now() + Math.random());
      const body = { active: true, providerType: 'physician', person: { firstName: pr.first, lastName: pr.last, primaryPhone: phone } };
      const r = await fetch(`${P}/rest/Provider/FhirUuid?fhirUuid=${uuid}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(body),
      });
      const t = await r.text().catch(() => ''); return { status: r.status, ok: r.ok, text: t.slice(0, 200) };
    }, { P, pr, phone });
    if (res.ok) { created++; console.log('CREATED_PROVIDER', pr.first, pr.last); }
    else { failed++; console.log('FAIL_PROVIDER', res.status, pr.first, pr.last, res.text); }
    await page.waitForTimeout(150);
  }
  console.log('PROVIDER_SEED_SUMMARY', JSON.stringify({ created, skipped, failed, planned: PROVIDERS.length }));
});
