// Demo-data seed capability (part 4): 5 environmental compliance standards. Idempotent by name. Re-runnable.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-compliance.docs.spec.ts
// Grounded on indonesiademo (3.2.1.10):
//   GET  /rest/compliance/standards          — full list
//   POST /rest/compliance/standards          — create (new records land as status DRAFT)
//   PUT  /rest/compliance/standards/{id}     — update; send full body with status ACTIVE to activate
//   GET  /rest/compliance/standards/active   — what the env order form reads
import { test } from '@playwright/test';
const P = '/api/OpenELIS-Global';

const STANDARDS = [
  {
    name: 'Permenkes No. 2/2023 - Drinking Water Quality',
    issuingBody: 'Ministry of Health, Republic of Indonesia', regulationNumber: 'Permenkes 2/2023',
    version: '2023', effectiveDate: '2023-01-06', countryRegion: 'Indonesia',
    sampleTypes: ['Drinking Water'],
    description: 'Ministerial regulation on environmental health quality standards for drinking water, including microbiological, physical, and chemical parameters.',
    regulatoryContext: 'Indonesian environmental health framework for drinking water safety',
    enforcementAuthority: 'Ministry of Health',
  },
  {
    name: 'PermenLHK No. 68/2016 - Domestic Wastewater Quality',
    issuingBody: 'Ministry of Environment and Forestry, Republic of Indonesia', regulationNumber: 'PermenLHK P.68/2016',
    version: '2016', effectiveDate: '2016-08-09', countryRegion: 'Indonesia',
    sampleTypes: ['Liquid Waste'],
    description: 'Quality standards (Baku Mutu) for domestic wastewater discharge, covering pH, BOD, COD, TSS, oil & grease, ammonia, and total coliform.',
    regulatoryContext: 'Wastewater discharge control for domestic and communal treatment systems',
    enforcementAuthority: 'Ministry of Environment and Forestry',
  },
  {
    name: 'Permenkes No. 32/2017 - Water for Hygiene & Sanitation',
    issuingBody: 'Ministry of Health, Republic of Indonesia', regulationNumber: 'Permenkes 32/2017',
    version: '2017', effectiveDate: '2017-07-31', countryRegion: 'Indonesia',
    sampleTypes: ['Sanitation Hygiene Water', 'Swimming Pool Water', 'Spa Water', 'Public Bath Water'],
    description: 'Environmental health quality standards for water used for hygiene and sanitation, swimming pools, spas (solus per aqua), and public baths.',
    regulatoryContext: 'Recreational and sanitation water safety monitoring',
    enforcementAuthority: 'Ministry of Health',
  },
  {
    name: 'SNI 7387:2009 - Heavy Metal Limits in Food',
    issuingBody: 'National Standardization Agency of Indonesia (BSN)', regulationNumber: 'SNI 7387:2009',
    version: '2009', effectiveDate: '2009-10-15', countryRegion: 'Indonesia',
    sampleTypes: ['Food', 'Vegetable', 'Fruit'],
    description: 'National standard specifying maximum limits of heavy metal contamination (Pb, Cd, Hg, As, Sn) in food products.',
    regulatoryContext: 'Food safety surveillance and market monitoring',
    enforcementAuthority: 'National Agency of Drug and Food Control (BPOM)',
  },
  {
    name: 'Permenkes No. 736/2010 - Drinking Water Quality Monitoring',
    issuingBody: 'Ministry of Health, Republic of Indonesia', regulationNumber: 'Permenkes 736/2010',
    version: '2010', effectiveDate: '2010-06-18', countryRegion: 'Indonesia',
    sampleTypes: ['Drinking Water', 'Water'],
    description: 'Procedures for supervision and monitoring of drinking water quality, defining sampling frequency, inspection points, and reporting obligations.',
    regulatoryContext: 'Operational monitoring companion to drinking water quality standards',
    enforcementAuthority: 'Ministry of Health / District Health Offices',
  },
];

test('seed compliance standards', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/'); await page.waitForTimeout(800);

  const listRes: any = await page.request.get(`${P}/rest/compliance/standards`);
  const existing: any[] = listRes.ok() ? await listRes.json().catch(() => []) : [];
  const byName = new Map(existing.map((s: any) => [String(s.name || '').trim().toLowerCase(), s]));
  console.log('EXISTING_STANDARDS', existing.length);

  let created = 0, activated = 0, skipped = 0, failed = 0;
  for (const std of STANDARDS) {
    const key = std.name.trim().toLowerCase();
    let rec: any = byName.get(key);

    if (!rec) {
      const res: any = await page.evaluate(async ({ P, std }: any) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const r = await fetch(`${P}/rest/compliance/standards`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify(std),
        });
        const t = await r.text().catch(() => '');
        return { status: r.status, ok: r.ok, json: r.ok ? JSON.parse(t) : null, text: t.slice(0, 200) };
      }, { P, std });
      if (!res.ok) { failed++; console.log('FAIL_CREATE', res.status, std.name, res.text); continue; }
      rec = res.json; created++; console.log('CREATED_STANDARD', rec.id, std.name);
    } else { skipped++; console.log('SKIP_EXISTS', rec.id, std.name); }

    if (rec && rec.status !== 'ACTIVE') {
      const act: any = await page.evaluate(async ({ P, std, rec }: any) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const r = await fetch(`${P}/rest/compliance/standards/${rec.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ ...std, id: rec.id, status: 'ACTIVE' }),
        });
        return { status: r.status, ok: r.ok };
      }, { P, std, rec });
      if (act.ok) { activated++; console.log('ACTIVATED', rec.id, std.name); }
      else { failed++; console.log('FAIL_ACTIVATE', act.status, std.name); }
    }
    await page.waitForTimeout(150);
  }

  const activeRes: any = await page.request.get(`${P}/rest/compliance/standards/active`);
  const active: any[] = activeRes.ok() ? await activeRes.json().catch(() => []) : [];
  console.log('ACTIVE_TOTAL', active.length);
  console.log('COMPLIANCE_SEED_SUMMARY', JSON.stringify({ created, activated, skipped, failed, planned: STANDARDS.length }));
});
