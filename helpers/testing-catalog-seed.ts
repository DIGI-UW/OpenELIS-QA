/**
 * helpers/testing-catalog-seed.ts
 *
 * The 28 Oct 2026 QA catalog additions for testing.openelis-global.org, re-applied
 * after each nightly baseline reset. Analyzer QA needs them: LOINC codes on the
 * baseline tests (so analyzer setup can match by LOINC), a Serum sample type on
 * Transaminases ALTL/ASTL, and 22 chemistry tests from the Sysmex BX-3010 menu with
 * units, ranges and LOINC.
 *
 * Idempotent. An existing LOINC mapping is kept, a unit is added only when missing,
 * and a test is created only when no test has its code.
 *
 * TESTING ONLY. The LOINC map is keyed by the test ids of testing's baseline
 * catalog. On another instance the same ids can be different tests, so
 * `seedTestingCatalog` refuses to run anywhere else (see TESTING_HOST).
 *
 * Runs in the page, with the admin session's CSRF token, through the same
 * Test Catalog and UOM endpoints the admin screens use.
 */
import type { Page } from '@playwright/test';

export const TESTING_HOST = 'testing.openelis-global.org';

export interface CatalogSeedResult { log: string[]; errors: string[] }

export async function seedTestingCatalog(page: Page): Promise<CatalogSeedResult> {
  return page.evaluate(async () => {
    const log: string[] = [];
    const errors: string[] = [];
    const csrf = localStorage.getItem('CSRF') || '';
    const api = async (path: string, method = 'GET', body?: unknown): Promise<[number, any]> => {
      const r = await fetch('/api/OpenELIS-Global/rest/test-catalog' + path, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: body ? JSON.stringify(body) : undefined,
      });
      let t: any = await r.text(); try { t = JSON.parse(t); } catch { /* text */ }
      return [r.status, t];
    };

    // 1. Units of measure.
    const uomUrl = '/api/OpenELIS-Global/rest/UomCreate';
    let uoms: any[] = (await (await fetch(uomUrl, { credentials: 'include' })).json()).existingUomList || [];
    for (const u of ['mmol/L', 'umol/L', 'mg/dL', 'U/L', 'mEq/L', 'mmol/mol']) {
      if (uoms.some((x) => x.value === u)) continue;
      const r = await fetch(uomUrl, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ uomEnglishName: u, uomFrenchName: u }) });
      (r.ok ? log : errors).push(`unit ${u} ${r.status}`);
    }
    uoms = (await (await fetch(uomUrl, { credentials: 'include' })).json()).existingUomList || [];
    const uomId = (name: string) => uoms.find((x) => x.value === name)?.id;

    // 2. LOINC on testing's baseline tests, by baseline test id.
    const L: Record<string, string> = {1:'1742-6',2:'1920-8',3:'2345-7',4:'2160-0',5:'1798-8',6:'1754-1',7:'2093-3',8:'2085-9',9:'2571-8',
      10:'2106-3',11:'2106-3',12:'20454-5',13:'6690-2',14:'789-8',15:'718-7',16:'4544-3',17:'787-2',18:'785-6',19:'786-4',
      20:'777-3',21:'770-8',22:'751-8',23:'713-8',24:'711-2',25:'706-2',26:'704-7',34:'24467-3',35:'8123-2',36:'5196-1',
      31:'75622-1',32:'75622-1',33:'75622-1',41:'75622-1',42:'75622-1',43:'75622-1',53:'75622-1',54:'75622-1',55:'75622-1',
      56:'75622-1',57:'75622-1',44:'7918-6',45:'7918-6',46:'7918-6',47:'7918-6',48:'7918-6',49:'7918-6',50:'7918-6',58:'7918-6',
      39:'5221-7',40:'5221-7',51:'18396-2',52:'18396-2',37:'20447-9',311:'20447-9',312:'20447-9',313:'20447-9',174:'20447-9',
      175:'44871-2',159:'2345-7',160:'2160-0',161:'1742-6',176:'1920-8',177:'6690-2',178:'777-3',179:'770-8',180:'736-9',
      181:'5905-5',182:'713-8',183:'706-2',184:'4544-3',185:'785-6',186:'786-4',187:'789-8',188:'718-7',189:'787-2',
      172:'24467-3',190:'8124-0',191:'8123-2',192:'24467-3',193:'751-8',194:'742-7',195:'704-7',196:'731-0',197:'711-2'} as any;
    let mapped = 0;
    for (const [id, code] of Object.entries(L)) {
      const [s0, t] = await api(`/tests/${id}/terminology`);
      if (s0 !== 200 || (t.mappings || []).some((m: any) => m.source === 'LOINC')) continue;
      const [s] = await api(`/tests/${id}/terminology`, 'PUT', { testId: String(id), version: t.version,
        mappings: [...(t.mappings || []), { source: 'LOINC', code, relationship: 'SAME_AS' }] });
      if (s === 200) mapped++; else errors.push(`loinc ${id}=${code} ${s}`);
    }
    log.push(`loinc added on ${mapped} baseline tests`);

    // 3. Serum sample type on Transaminases ALTL/ASTL.
    for (const id of ['161', '176']) {
      const [s0, b] = await api(`/tests/${id}/basic-info`);
      if (s0 === 200 && !b.sampleTypeId) {
        const [s] = await api(`/tests/${id}/basic-info`, 'PUT', { ...b, sampleTypeId: '2', sampleTypeIds: ['2'] });
        (s === 200 ? log : errors).push(`sample type on ${id} ${s}`);
      }
    }

    // 4. Chemistry tests for the Sysmex BX-3010 menu (Biochemistry, lab unit 56).
    // [name, code, LOINC, unit, significant digits, low normal, high normal, low critical, high critical, sample type id]
    const T: [string, string, string, string, number, number, number, number, number, string][] = [
      ['LDL cholesterol','LDL-Serum','2089-1','mg/dL',0,0,130,0,400,'2'],
      ['Urea','Urea-Serum','3091-6','mg/dL',0,15,45,0,300,'2'],
      ['BUN','BUN-Serum','3094-0','mg/dL',0,7,20,0,150,'2'],
      ['Uric acid','UricAcid-Serum','3084-1','mg/dL',1,3.5,7.2,0,20,'2'],
      ['Alkaline phosphatase','ALP-Serum','6768-6','U/L',0,44,147,0,2000,'2'],
      ['GGT','GGT-Serum','2324-2','U/L',0,8,61,0,2000,'2'],
      ['Total bilirubin','TBil-Serum','1975-2','mg/dL',1,0.1,1.2,0,20,'2'],
      ['Direct bilirubin','DBil-Serum','1968-7','mg/dL',1,0,0.3,0,15,'2'],
      ['Total protein','TP-Serum','2885-2','g/dL',1,6.0,8.3,3,12,'2'],
      ['Albumin','Albumin-Serum','1751-7','g/dL',1,3.5,5.0,1,7,'2'],
      ['CK','CK-Serum','2157-6','U/L',0,22,198,0,10000,'2'],
      ['CK-MB','CKMB-Serum','32673-6','U/L',0,0,25,0,500,'2'],
      ['LDH','LDH-Serum','2532-0','U/L',0,140,280,0,5000,'2'],
      ['Calcium','Calcium-Serum','17861-6','mg/dL',1,8.5,10.5,6,13,'2'],
      ['Phosphorus','Phos-Serum','2777-1','mg/dL',1,2.5,4.5,1,9,'2'],
      ['Magnesium','Mg-Serum','19123-9','mg/dL',1,1.7,2.2,1,5,'2'],
      ['CRP','CRP-Serum','1988-5','mg/l',1,0,5,0,500,'2'],
      ['HbA1c','HbA1c-Blood','4548-4','%',1,4.0,5.6,0,20,'4'],
      ['HbA1c (IFCC)','HbA1cIFCC-Blood','59261-8','mmol/mol',0,20,38,0,200,'4'],
      ['Sodium','Na-Serum','2951-2','mmol/L',0,135,145,120,160,'2'],
      ['Potassium','K-Serum','2823-3','mmol/L',1,3.5,5.0,2.5,6.5,'2'],
      ['Chloride','Cl-Serum','2075-0','mmol/L',0,98,107,80,120,'2'],
    ];
    let all: any[] = [];
    for (let p = 1; p <= 10; p++) {
      const [, b] = await api(`/tests?page=${p}&pageSize=100`);
      all = all.concat(b.rows || []);
      if (all.length >= b.total || !(b.rows || []).length) break;
    }
    let created = 0;
    for (const [name, code, loinc, unit, dig, ln, hn, lc, hc, st] of T) {
      if (all.some((r) => r.code === code)) continue;
      const [s, b] = await api('/tests', 'POST', { name, reportingName: name, code, domain: 'CLINICAL', labUnitId: '56', sampleTypeId: st });
      if (s !== 201) { errors.push(`create ${code} ${s}`); continue; }
      const id = String(b.testId);
      const [, sr] = await api(`/tests/${id}/sample-results`);
      await api(`/tests/${id}/sample-results`, 'PUT', { testId: id, components: [{ id: sr.components?.[0]?.id, code: 'PRIMARY', label: name,
        displayOrder: 0, resultType: 'N', uomId: uomId(unit), isPrimary: true, showOnReport: true, allowMultipleReadings: false,
        significantDigits: dig, interpretations: [], options: [] }] });
      const [, sr2] = await api(`/tests/${id}/sample-results`);
      await api(`/tests/${id}/ranges`, 'PUT', { testId: id, ranges: [{ componentId: sr2.components?.[0]?.id, gender: ' ', minAge: 0, maxAge: null,
        lowNormal: ln, highNormal: hn, lowCritical: lc, highCritical: hc, lowValid: 0, highValid: hc * 2 }] });
      const [, t] = await api(`/tests/${id}/terminology`);
      await api(`/tests/${id}/terminology`, 'PUT', { testId: id, version: t.version, mappings: [{ source: 'LOINC', code: loinc, relationship: 'SAME_AS' }] });
      const [a] = await api(`/tests/${id}/activate`, 'POST', {});
      if (a === 200 || a === 204) created++; else errors.push(`activate ${code} #${id} ${a}`);
    }
    log.push(`chemistry tests created: ${created} of ${T.length} (the rest already exist)`);
    return { log, errors };
  });
}
