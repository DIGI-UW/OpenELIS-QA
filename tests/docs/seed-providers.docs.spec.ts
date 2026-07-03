// Demo-data seed capability (part 3): 10 clinical providers. Idempotent by last+first name. Re-runnable.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-providers.docs.spec.ts
//
// Grounded on OpenELIS-Global-2 source (DIGI-UW/OpenELIS-Global-2):
//   Endpoint  : POST /rest/Provider/FhirUuid?fhirUuid=            (empty fhirUuid = create; server mints a UUID)
//   Controller: ProviderRestController.insertOrUpdateProviderByFhirUuid
//   Service   : ProviderServiceImpl — on create it persists the nested Person first, then the Provider.
//               NOTE: Provider.person is a ValueHolder; the ONLY working body shape is the one the admin
//               UI posts (ProviderMenu.jsx handleAddProvider):
//                   { person: { lastName, firstName, workPhone, fax, email }, active: <bool> }
//               The earlier 500 came from sending `primaryPhone` + a stray `providerType` instead of the
//               UI shape. Do NOT send providerType. Phone must match PHONE_REGEX ^[-+()0-9a-z./ ]*$ and
//               names must pass @ValidName (plain letters/spaces are safe).
//   Readback  : GET /rest/provider/search?search=&page=1&pageSize=<n>  -> { providers:[{name:"Last, First", ...}], totalCount }
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

// Fictional-but-realistic English names. Keep ASCII to satisfy @ValidName.
const PROVIDERS = [
  { firstName: 'Adeline', lastName: 'Parker', workPhone: '+62 811 5550 101', email: 'aparker@example-clinic.id', fax: '0215550101' },
  { firstName: 'Marcus', lastName: 'Nguyen', workPhone: '+62 811 5550 102', email: 'mnguyen@example-clinic.id', fax: '0215550102' },
  { firstName: 'Priya', lastName: 'Santoso', workPhone: '+62 811 5550 103', email: 'psantoso@example-clinic.id', fax: '0215550103' },
  { firstName: 'David', lastName: 'Okafor', workPhone: '+62 811 5550 104', email: 'dokafor@example-clinic.id', fax: '0215550104' },
  { firstName: 'Elena', lastName: 'Rossi', workPhone: '+62 811 5550 105', email: 'erossi@example-clinic.id', fax: '0215550105' },
  { firstName: 'James', lastName: 'Whitfield', workPhone: '+62 811 5550 106', email: 'jwhitfield@example-clinic.id', fax: '0215550106' },
  { firstName: 'Aisha', lastName: 'Rahman', workPhone: '+62 811 5550 107', email: 'arahman@example-clinic.id', fax: '0215550107' },
  { firstName: 'Thomas', lastName: 'Andersen', workPhone: '+62 811 5550 108', email: 'tandersen@example-clinic.id', fax: '0215550108' },
  { firstName: 'Grace', lastName: 'Mbeki', workPhone: '+62 811 5550 109', email: 'gmbeki@example-clinic.id', fax: '0215550109' },
  { firstName: 'Samuel', lastName: 'Hartono', workPhone: '+62 811 5550 110', email: 'shartono@example-clinic.id', fax: '0215550110' },
];

const norm = (s: string) => String(s || '').trim().toLowerCase();
const key = (last: string, first: string) => `${norm(last)}|${norm(first)}`;

test('seed providers', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/'); await page.waitForTimeout(800);

  // Existing providers (readback endpoint returns name as "Last, First").
  const listRes: any = await page.request.get(`${P}/rest/provider/search?search=&page=1&pageSize=500`);
  const listJson: any = listRes.ok() ? await listRes.json().catch(() => ({})) : {};
  const existing: any[] = Array.isArray(listJson.providers) ? listJson.providers : [];
  const seen = new Set<string>();
  for (const p of existing) {
    const nm = String(p.name || '');
    const [last, first] = nm.includes(',') ? nm.split(',').map((x: string) => x.trim()) : [p.lastName, p.firstName];
    seen.add(key(last || '', first || ''));
  }
  console.log('EXISTING_PROVIDERS', existing.length);

  let created = 0, skipped = 0, failed = 0;
  for (const prov of PROVIDERS) {
    if (seen.has(key(prov.lastName, prov.firstName))) {
      skipped++; console.log('SKIP_EXISTS', prov.lastName, prov.firstName); continue;
    }
    const body = {
      person: {
        lastName: prov.lastName,
        firstName: prov.firstName,
        workPhone: prov.workPhone,
        fax: prov.fax,
        email: prov.email,
      },
      active: true,
    };
    const res: any = await page.evaluate(async ({ P, body }: any) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch(`${P}/rest/Provider/FhirUuid?fhirUuid=`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(body),
      });
      return { status: r.status, ok: r.ok, text: (await r.text().catch(() => '')).slice(0, 300) };
    }, { P, body });
    if (res.ok) { created++; console.log('CREATED_PROVIDER', prov.lastName, prov.firstName); }
    else { failed++; console.log('FAIL_CREATE', res.status, prov.lastName, prov.firstName, res.text.replace(/\s+/g, ' ')); }
    await page.waitForTimeout(150);
  }

  const afterRes: any = await page.request.get(`${P}/rest/provider/search?search=&page=1&pageSize=500`);
  const afterJson: any = afterRes.ok() ? await afterRes.json().catch(() => ({})) : {};
  const afterCount = Array.isArray(afterJson.providers) ? afterJson.providers.length : -1;
  console.log('PROVIDERS_AFTER', afterCount);
  console.log('PROVIDER_SEED_SUMMARY', JSON.stringify({ created, skipped, failed, planned: PROVIDERS.length }));
  expect(failed).toBe(0);
});
