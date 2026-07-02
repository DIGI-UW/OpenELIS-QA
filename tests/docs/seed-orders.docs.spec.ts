// Demo-data seed capability (part 2): orders across Clinical / Env / Vector with a 30/30/30 state mix.
// Reuses the verified wizard recipes (clinical-flow / vector-flow) + order-helpers.
// Volume via env SEED_N (per domain). Small default for a validation run; bump to 20 for the full seed.
//   BASE=https://indonesiademo.openelis-global.org SEED_N=2 npx playwright test --project=docs tests/docs/seed-orders.docs.spec.ts
import { test } from '@playwright/test';
import { go } from './capture';
import { generateLabNumber, selectSite, setSelectByOption, checkByLabel, completeQaChecklist, clickButton, selectEnvSampleType, pickEnvTest, newPatient, selectComplianceStandard } from './order-helpers';

const P = '/api/OpenELIS-Global';
const N = parseInt(process.env.SEED_N || '2', 10);

const SAMPLING = ['Riverside Monitoring Station','East Bay Water Intake','Central Reservoir Site','Delta Wetland Trap Site','Harbor Outfall Monitor','Northern Canal Station','Upland Spring Source','Coastal Lagoon Trap','Industrial Zone Monitor','Municipal Well Field'];
const REFERRING = ['Riverside Community Clinic','Northgate Health Center','Harborview Clinic','Greenfield District Clinic','Lakeside Primary Care','Hillcrest Medical Center','Sunrise Health Post','Meadowbrook Clinic','Fairview Health Center','Cedar Grove Clinic'];
const FIRST = ['Peter','Mary','James','Linda','Robert','Patricia','John','Jennifer','David','Susan','Michael','Karen','Daniel','Nancy','Paul','Betty','Mark','Sandra','Steven','Donna'];
const LAST = ['Parker','Nguyen','Santoso','Wijaya','Putri','Hidayat','Kusuma','Pratama','Sari','Halim','Tanaka','Lestari','Gunawan','Suryani','Anwar','Maulana','Fitri','Rahman','Dewi','Saputra'];

// ---- result + validation helpers (adapted from OpenELIS-Global seed-tat-data.ts) ----
async function enterResults(page: any, labNo: string): Promise<boolean> {
  return await page.evaluate(async ({ P, labNo }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const g = await fetch(`${P}/rest/LogbookResults?labNumber=${labNo}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    let lb: any = null; try { lb = JSON.parse(await g.text()); } catch { return false; }
    if (!lb || !(lb.testResult || []).length) return false;
    for (const item of lb.testResult) {
      const t = (item.resultType || '').toUpperCase();
      const val = (t === 'D' || t === 'M') ? (item.defaultResultValue || (item.dictionaryResults && item.dictionaryResults[0] && item.dictionaryResults[0].id) || '1') : '5.5';
      item.reportable = item.reportable === 'N' ? false : true;
      item.resultValue = val; item.shadowResultValue = val; item.isModified = true; delete item.result;
    }
    const p = await fetch(`${P}/rest/LogbookResults`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(lb) });
    return p.ok;
  }, { P, labNo });
}
async function validateResults(page: any, labNo: string): Promise<boolean> {
  return await page.evaluate(async ({ P, labNo }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const g = await fetch(`${P}/rest/AccessionValidation?accessionNumber=${labNo}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    let v: any = null; try { v = JSON.parse(await g.text()); } catch { return false; }
    if (!v || !(v.resultList || []).length) return false;
    for (const it of v.resultList) it.isAccepted = true;
    const p = await fetch(`${P}/rest/AccessionValidation`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(v) });
    return p.ok;
  }, { P, labNo });
}

async function finishWizard(page: any) {
  await clickButton(page, /save & next|save and next/i, 3500);
  await clickButton(page, /print all labels|print labels/i, 1200).catch(() => {});
  await checkByLabel(page, /skip storage|skip this step|no storage|assign later/i).catch(() => {});
  await clickButton(page, /save & next|save and next/i, 3000);
  await completeQaChecklist(page).catch(() => {});
  await clickButton(page, /^\s*submit\s*$|save & next|save and next/i, 3000);
  await page.waitForTimeout(800);
}

async function createClinical(page: any, i: number): Promise<string> {
  await go(page, '/order/clinical/enter');
  const lab = await generateLabNumber(page);
  await newPatient(page, { last: LAST[i % LAST.length], first: FIRST[i % FIRST.length], dob: '15/05/1990', gender: i % 2 ? /^female$/i : /^male$/i });
  try { const s = page.getByPlaceholder(/site name/i).first(); if (await s.isVisible({ timeout: 1200 })) await s.fill(REFERRING[i % REFERRING.length]); } catch {}
  await setSelectByOption(page, /^\s*Whole Blood\s*$/i);
  await page.waitForTimeout(800);
  await clickButton(page, /tests\s*&\s*panels|choose available/i, 700).catch(() => {});
  let picked = await checkByLabel(page, /^\s*NFS\s*$/i).catch(() => false);
  if (!picked) { const lbl = await page.evaluate(() => { const cbs = [...document.querySelectorAll('input[type=checkbox]')] as any[]; for (const cb of cbs) { const l = (cb.id && document.querySelector(`label[for="${cb.id}"]`)) || cb.closest('label'); const t = (l && l.textContent || '').trim(); if (t && !/lab performed sampling|skip|refer/i.test(t)) return t; } return ''; }); if (lbl) await checkByLabel(page, new RegExp(lbl.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).catch(() => {}); }
  await page.keyboard.press('Escape').catch(() => {});
  await clickButton(page, /save & next|save and next/i, 3500);
  try { await page.locator('select:has(option:text-is("mL"))').first().selectOption({ label: 'mL' }, { timeout: 4000 }); } catch {}
  await checkByLabel(page, /patient has provided signed consent/i).catch(() => {});
  await finishWizard(page);
  return lab;
}
async function createVector(page: any, i: number): Promise<string> {
  await go(page, '/order/vector/enter');
  const lab = await generateLabNumber(page);
  await selectSite(page, SAMPLING[i % SAMPLING.length].split(' ')[0]);
  await setSelectByOption(page, /^adult mosquito$/i);
  await page.waitForTimeout(900);
  await page.evaluate(() => { const q = document.querySelector('input[type=number]') as any; if (q) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(q, '25'); q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new Event('change', { bubbles: true })); } });
  await checkByLabel(page, /identifikasi spesies nyamuk/i).catch(() => {});
  await finishWizard(page);
  return lab;
}
async function createEnv(page: any, i: number): Promise<string> {
  await go(page, '/order/environmental/enter');
  const lab = await generateLabNumber(page);
  await selectSite(page, SAMPLING[i % SAMPLING.length].split(' ')[0]);
  await selectEnvSampleType(page, /Groundwater/i).catch(() => {});
  await pickEnvTest(page, /^pH$/).catch(() => {});
  await selectComplianceStandard(page, /./).catch(() => {});
  await finishWizard(page);
  return lab;
}

async function seedDomain(page: any, name: string, mk: (p: any, i: number) => Promise<string>, out: any[], canResult: boolean) {
  for (let i = 0; i < N; i++) {
    try {
      const lab = await mk(page, i);
      const state = i % 3; // 0 registered, 1 results, 2 results+validate
      let applied = 'registered';
      if (canResult && lab && state >= 1) { const r = await enterResults(page, lab); applied = r ? 'results' : 'results-FAILED'; }
      if (canResult && lab && state === 2 && applied === 'results') { const v = await validateResults(page, lab); applied = v ? 'validated' : 'validate-FAILED'; }
      out.push({ domain: name, lab, state: applied });
      console.log(`SEED ${name} #${i + 1} lab=${lab} state=${applied}`);
    } catch (e: any) { out.push({ domain: name, lab: '', state: 'CREATE-ERROR' }); console.log(`SEED ${name} #${i + 1} ERROR ${String(e).slice(0, 120)}`); }
  }
}

test('seed orders across domains', async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  await page.goto('/'); await page.waitForTimeout(800);
  const out: any[] = [];
  await seedDomain(page, 'CLINICAL', createClinical, out, true);
  await seedDomain(page, 'VECTOR', createVector, out, false);
  await seedDomain(page, 'ENVIRONMENTAL', createEnv, out, false);
  console.log('ORDER_SEED_SUMMARY', JSON.stringify({ total: out.length, byState: out.reduce((a, o) => { a[o.state] = (a[o.state] || 0) + 1; return a; }, {} as any) }));
  console.log('ORDER_SEED_ROWS', JSON.stringify(out));
});
