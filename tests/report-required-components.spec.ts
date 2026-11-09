/**
 * tests/report-required-components.spec.ts  (TC-RPTCOMP)
 *
 * OGC-1608: the patient report must not print "In Progress" for a blank component of a released
 * test, and a component can be marked Required in the test catalog.
 *   - optional (not Required) blank: left off the report, the heading is final;
 *   - Required blank: prints In Progress and the report stays partial until it is resulted
 *     and validated;
 *   - upgrade: existing components are Required only when primary.
 *
 * History:
 *   - 4 Nov 2026, testing (develop 0dca62f6, carries #4757): QA CI MultiComp (test 442), Value 42
 *     only, validated: "Results: final report" above "Interpretation In Progress" and
 *     "Organisms In Progress". Filed OGC-1608.
 *   - 9 Nov 2026: #5001 (develop c470bd68) adds the Required flag. Written as guards on testing.
 *
 * The Required test is created once per server (name "QA RPTCOMP Req") and reused. Cases read
 * the PDF ReportPrint returns, the same request the Patient Status Report screen makes.
 * Catalogue: report-print-queue-test-cases.md (section TC-RPTCOMP).
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, queueContext, order, validateOnly, QueueSeed, SERUM } from '../helpers/report-queue';
import { fetchReport, REPORT_PRINT } from '../helpers/report-pdf';

test.setTimeout(300_000);
const MULTI = '442'; // QA CI MultiComp: Value (N, primary), Interpretation (D), Organisms (M)
const REQ_NAME = 'QA RPTCOMP Req';
let seed: QueueSeed;

type Comp = { id: string; code: string; label: string; resultType: string; isPrimary: boolean; isRequired?: boolean; options?: any[] };
async function components(page: Page, testId: string): Promise<Comp[]> {
  return (await j(page, `${API}/test-catalog/tests/${testId}/sample-results`)).body.components;
}
/** Enter values by component code; rows are told apart by testResultComponentId. */
async function enterComponents(page: Page, labNo: string, testId: string, values: Record<string, string>) {
  const byId = new Map((await components(page, testId)).map((c) => [String(c.id), c.code]));
  const form = (await j(page, `${API}/LogbookResults?labNumber=${labNo}`)).body;
  for (const it of form.testResult as any[]) {
    delete it.result;
    const v = values[byId.get(String(it.testResultComponentId)) ?? ''];
    if (String(it.testId) !== testId || v === undefined) continue;
    it.reportable = it.reportable === 'N' ? false : true;
    it.resultValue = v; it.shadowResultValue = v; it.isModified = true;
  }
  const p = await j(page, `${API}/LogbookResults`, { method: 'POST', body: form });
  expect(p.status, `results save on ${labNo}`).toBe(200);
}
async function report(page: Page, labNo: string): Promise<string> {
  const url = `${REPORT_PRINT}?report=patientCILNSP_vreduit&type=patient&accessionDirect=${labNo}&highAccessionDirect=&dateOfBirthSearchValue=&selPatient=&referringSiteId=&onlyResults=false&_onlyResults=on&dateType=RESULT_DATE&lowerDateRange=&upperDateRange=`;
  const r = await fetchReport(page, url);
  expect(r.status, `report for ${labNo}`).toBe(200);
  expect(r.pdf, 'a PDF').not.toBeNull();
  return r.pdf!.text;
}
async function requiredTest(page: Page): Promise<string> {
  const list = (await j(page, `${API}/test-catalog/tests?search=${encodeURIComponent(REQ_NAME)}`)).body;
  const rows: any[] = Array.isArray(list) ? list : list?.rows ?? list?.tests ?? [];
  const found = rows.find((t: any) => String(t.name ?? t.testName ?? '').startsWith(REQ_NAME));
  let id: string;
  if (found) {
    id = String(found.id ?? found.testId);
    if ((await components(page, id)).some((x) => x.code === 'INTERP' && x.isRequired)) return id;
  } else {
    const units = (await j(page, `${API}/test-catalog/lab-units`)).body;
    const created = await j(page, `${API}/test-catalog/tests`, { method: 'POST', body: {
      name: REQ_NAME, reportingName: REQ_NAME, code: `QARC${Date.now().toString().slice(-6)}`, labUnitId: units[0].id,
      sampleTypeIds: [SERUM], domain: 'CLINICAL', orderable: true } });
    expect([200, 201], `create ${JSON.stringify(created.body).slice(0, 200)}`).toContain(created.status);
    id = String(created.body.testId);
  }
  const put = await j(page, `${API}/test-catalog/tests/${id}/sample-results`, { method: 'PUT', body: { testId: id, components: [
    { code: 'VALUE', label: 'Value', displayOrder: 0, resultType: 'N', isPrimary: true, showOnReport: true, interpretations: [], options: [] },
    { code: 'INTERP', label: 'Interpretation', displayOrder: 1, resultType: 'D', isPrimary: false, showOnReport: true, isRequired: true, interpretations: [],
      options: ['Positive', 'Negative'].map((value, i) => ({ value, sortOrder: i + 1, normal: i === 1 })) },
    { code: 'COMMENT', label: 'Comment', displayOrder: 2, resultType: 'N', isPrimary: false, showOnReport: true, interpretations: [], options: [] },
  ] } });
  expect(put.status, 'components saved').toBe(200);
  expect((await j(page, `${API}/test-catalog/tests/${id}/activate`, { method: 'POST', body: {} })).status).toBe(200);
  return id;
}
const lineOf = (text: string, label: string) => text.split('\n').filter((l) => l.includes(label));

test.describe('Patient report and Required result components (OGC-1608)', () => {
  test.beforeEach(async ({ page }) => { seed = await queueContext(page); });

  test('TC-RPTCOMP-00 upgrade: on an existing test only the primary component is Required', async ({ page }) => {
    const c = await components(page, MULTI);
    expect(c.map((x) => [x.label, x.isPrimary, x.isRequired])).toEqual([['Value', true, true], ['Interpretation', false, false], ['Organisms', false, false]]);
  });

  test('TC-RPTCOMP-01 optional blank components leave the report and the heading is final', async ({ page }) => {
    const o = await order(page, seed, [{ type: SERUM, tests: [MULTI] }]);
    await enterComponents(page, o.labNo, MULTI, { PRIMARY: '42' });
    expect(await validateOnly(page, o.labNo), 'one part to accept').toBeGreaterThan(0);
    const text = await report(page, o.labNo);
    console.log(`RPTCOMP-01 ${o.labNo}\n${text.split('\n').filter((l) => /report|Value|Interpretation|Organisms|Progress|MultiComp/i.test(l)).join('\n')}`);
    expect(text, 'no In Progress line').not.toMatch(/In Progress/i);
    expect(lineOf(text, 'Value').join(' '), 'the Value line').toMatch(/42/);
    expect(lineOf(text, 'Interpretation'), 'no Interpretation line').toEqual([]);
    expect(lineOf(text, 'Organisms'), 'no Organisms line').toEqual([]);
    expect(text, 'final heading').toMatch(/final report/i);
  });

  test('TC-RPTCOMP-02 a Required blank prints In Progress and keeps the report partial until it is resulted and validated', async ({ page }) => {
    const id = await requiredTest(page);
    const c = await components(page, id);
    expect(c.find((x) => x.code === 'INTERP')?.isRequired, 'Interpretation is Required').toBe(true);
    // A dictionary result is posted as the dictionary id (option.value), as the Results screen does;
    // option.id is the catalog row and must not be posted (it lands as a stray result, 9 Nov, 260000JH).
    const neg = String(c.find((x) => x.code === 'INTERP')!.options!.find((o: any) => /Negative/i.test(o.valueName ?? ''))!.value);
    const o = await order(page, seed, [{ type: SERUM, tests: [id] }]);
    await enterComponents(page, o.labNo, id, { VALUE: '7' });
    await validateOnly(page, o.labNo);
    const before = await report(page, o.labNo);
    console.log(`RPTCOMP-02a ${o.labNo}\n${before.split('\n').filter((l) => /report|Value|Interpretation|Comment|Progress/i.test(l)).join('\n')}`);
    expect(lineOf(before, 'Interpretation').join(' '), 'Interpretation In Progress').toMatch(/In Progress/i);
    expect(before, 'not final').not.toMatch(/final report/i);
    expect(lineOf(before, 'Comment'), 'the optional blank Comment is left off').toEqual([]);

    await enterComponents(page, o.labNo, id, { INTERP: neg });
    const mid = await report(page, o.labNo);
    expect(mid, 'resulted but not validated: still not final').not.toMatch(/final report/i);
    await validateOnly(page, o.labNo);
    const after = await report(page, o.labNo);
    console.log(`RPTCOMP-02b ${o.labNo}\n${after.split('\n').filter((l) => /report|Value|Interpretation|Comment|Progress/i.test(l)).join('\n')}`);
    expect(after, 'no In Progress once validated').not.toMatch(/In Progress/i);
    expect(lineOf(after, 'Interpretation').join(' ')).toMatch(/Negative/i);
    expect(after, 'final heading').toMatch(/final report/i);
  });
});
