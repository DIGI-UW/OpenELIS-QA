// Demo-data seed capability (part 1): reference organizations.
// Idempotent: skips names that already exist. Re-runnable after a reset.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-orgs.docs.spec.ts
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

// Org type IDs verified on indonesiademo: 5 referring clinic, 12 sampling site, 6 referralLab
const REFERRING = ['Riverside Community Clinic','Northgate Health Center','Harborview Clinic','Greenfield District Clinic','Lakeside Primary Care','Hillcrest Medical Center','Sunrise Health Post','Meadowbrook Clinic','Fairview Health Center','Cedar Grove Clinic'];
const SAMPLING = ['Riverside Monitoring Station','East Bay Water Intake','Central Reservoir Site','Delta Wetland Trap Site','Harbor Outfall Monitor','Northern Canal Station','Upland Spring Source','Coastal Lagoon Trap','Industrial Zone Monitor','Municipal Well Field'];
const REFLABS = ['National Reference Laboratory','Regional Reference Laboratory'];

function shortCode(prefix: string, i: number) { return `${prefix}${String(i + 1).padStart(2, '0')}`.slice(0, 15); }

test('seed reference organizations', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/'); await page.waitForTimeout(800);

  // Existing active orgs (idempotency) — ACTIVE_ORG_LIST is {id,value}
  const existRes = await page.request.get(`${P}/rest/displayList/ACTIVE_ORG_LIST`);
  const existing: any[] = existRes.ok() ? await existRes.json().catch(() => []) : [];
  const existingNames = new Set(existing.map((o: any) => (o.value || '').trim().toLowerCase()));
  console.log('EXISTING_ORG_COUNT', existing.length);

  // Fresh skeleton for the POST echo fields
  const skel: any = await (await page.request.get(`${P}/rest/Organization?ID=0&startingRecNo=1`)).json();

  const plan = [
    ...REFERRING.map((n, i) => ({ name: n, type: '5', code: shortCode('RCLIN', i) })),
    ...SAMPLING.map((n, i) => ({ name: n, type: '12', code: shortCode('SAMP', i) })),
    ...REFLABS.map((n, i) => ({ name: n, type: '6', code: shortCode('REFLAB', i) })),
  ];

  let created = 0, skipped = 0, failed = 0;
  for (const o of plan) {
    if (existingNames.has(o.name.toLowerCase())) { skipped++; console.log('SKIP_EXISTS', o.name); continue; }
    const body: any = {
      id: '', organizationName: o.name, shortName: o.code, isActive: 'Y',
      selectedTypes: [o.type], internetAddress: '', streetAddress: '', city: 'Jakarta',
      cliaNum: '', organization: null,
      formName: skel.formName || 'organizationForm', formMethod: skel.formMethod || 'POST',
      cancelAction: skel.cancelAction, submitOnCancel: skel.submitOnCancel, cancelMethod: skel.cancelMethod,
      mlsSentinelLabFlag: skel.mlsSentinelLabFlag, parentOrgName: skel.parentOrgName,
      state: skel.state, commune: skel.commune, village: skel.village, department: skel.department,
      lastupdated: skel.lastupdated,
    };
    const res: any = await page.evaluate(async ({ body }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch('/api/OpenELIS-Global/rest/Organization?ID=0&startingRecNo=1', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(body),
      });
      const t = await r.text().catch(() => ''); return { status: r.status, ok: r.ok, text: t.slice(0, 200) };
    }, { body });
    if (res.ok) { created++; console.log('CREATED', o.type, o.name); }
    else { failed++; console.log('FAIL', res.status, o.name, res.text); }
    await page.waitForTimeout(150);
  }
  console.log('ORG_SEED_SUMMARY', JSON.stringify({ created, skipped, failed, planned: plan.length }));
  expect(failed, 'no org creation failures').toBe(0);
});
