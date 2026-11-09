/**
 * tests/calculated-results-bounded.spec.ts
 *
 * Calculated-result rules run on a bounded evaluator, not JavaScript (OpenELIS-Global-2 #4852,
 * develop 6a44dda30, 6 Nov 2026). Contract taken from the diff (CalculationExpression,
 * TestCalculationServiceImpl, docs/upgrades/calculated-results.md):
 *   - operators: + - * / ( ) == != >= <= && ||, plus the normal-range operations after a test;
 *     operands: decimal constants, test results, patient age; 1 to 256 operations, depth 32;
 *   - a rule outside that set is refused on save with 400, messageKey error.invalid.calculation.logic;
 *   - a whole-number result is stored with no trailing .0 (40, not 40.0);
 *   - a non-finite result (divide by zero) is skipped and does not overwrite a stored result;
 *   - Patient Weight is gone from the editor (it was never evaluated).
 *
 * Before #4852 (testing e6053101, 6 Nov upgrade check): divide by zero stored Infinity and a
 * Math.max( rule saved. Rules created here are deactivated after each case; names carry a
 * per-run suffix because the API refuses any name already used (TC-CALCI-08).
 *
 * Catalogue: calculation-rule-integrity.md (section TC-CALCB).
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, queueContext, order, enterOn, QueueSeed, SERUM } from '../helpers/report-queue';

test.setTimeout(240_000);
const created: number[] = [];
let seed: QueueSeed;
let A: string, B: string, C: string;

const RUN = Date.now().toString(36);
const named = (name: string) => `${name} ${RUN}`;
type Op = { type: string; value: string; sampleId?: number };

async function rules(page: Page): Promise<any[]> {
  return (await j(page, `${API}/test-calculations`)).body as any[];
}
function rule(name: string, outTest: string, ops: Op[]) {
  return {
    id: null, name: named(name), testId: outTest, sampleId: 2, componentId: null, active: true, toggled: true, result: '',
    note: 'QA calculated-results-bounded, deactivated after the case',
    operations: ops.map((o, i) => ({ id: null, order: i, ...o })),
  };
}
const t = (id: string): Op => ({ type: 'TEST_RESULT', value: id, sampleId: 2 });
const f = (op: string): Op => ({ type: 'MATH_FUNCTION', value: op });
const n = (v: string): Op => ({ type: 'INTEGER', value: v });

async function save(page: Page, body: unknown): Promise<{ status: number; key?: string; id?: number }> {
  const before = new Set((await rules(page)).map((r) => r.id));
  const r = await j(page, `${API}/test-calculation`, { method: 'POST', body });
  let id: number | undefined;
  for (const x of await rules(page)) if (!before.has(x.id)) { created.push(x.id); id = x.id; }
  return { status: r.status, key: (r.body as any)?.messageKey ?? (r.body as any)?.error ?? (r.body as any)?.message, id };
}
async function valueOf(page: Page, labNo: string, testId: string): Promise<string | undefined> {
  const lb = (await j(page, `${API}/LogbookResults?labNumber=${labNo}`)).body;
  return (lb.testResult || []).find((x: any) => String(x.testId) === testId)?.resultValue;
}

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true })).newPage();
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
  const serum = (await j(page, `${API}/sample-type-tests?sampleType=2`)).body;
  const used = new Set((await rules(page)).filter((r: any) => r.active).flatMap((r: any) => [String(r.testId), ...(r.operations || []).filter((o: any) => o.type === 'TEST_RESULT').map((o: any) => String(o.value))]));
  const free = (serum.tests || []).filter((x: any) => x.resultType === 'N' && !used.has(String(x.id)));
  expect(free.length, 'three numeric Serum tests no active rule uses').toBeGreaterThanOrEqual(3);
  [A, B, C] = free.slice(-3).map((x: any) => String(x.id));
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
});
test.afterEach(async ({ page }) => {
  await page.goto('/').catch(() => undefined);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 }).catch(() => undefined);
  for (const id of created.splice(0)) await j(page, `${API}/deactivate-test-calculation/${id}`, { method: 'POST', body: {} });
});

test.describe('Calculated results run on the bounded evaluator (#4852)', () => {
  test('TC-CALCB-01 a whole-number result is stored with no trailing .0', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCB WHOLE', B, [t(C), f('*'), n('2')]))).status, 'B = C * 2').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '20' });
    await expect.poll(() => valueOf(page, o.labNo, B), { message: `B on ${o.labNo} from C = 20`, timeout: 20_000 }).toBe('40');
  });

  test('TC-CALCB-02 divide by zero stores nothing and the input still saves', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCB DIV0', B, [t(C), f('/'), n('0')]))).status, 'B = C / 0 is valid grammar').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '5' });
    await page.waitForTimeout(3_000);
    expect(Number(await valueOf(page, o.labNo, C)), 'C keeps 5').toBe(5);
    const b = await valueOf(page, o.labNo, B);
    expect(b ?? '', `B on ${o.labNo} is not Infinity or a huge number (was 9.223372036854776E16 on 3.3.0)`).not.toMatch(/Infinity|E1[0-9]/i);
    expect(b ?? '', 'B stays empty').toBe('');
  });

  test('TC-CALCB-03 a very small result is stored as a usable number', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCB SMALL', B, [t(C), f('/'), n('30000000')]))).status, 'B = C / 30000000').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '1' });
    await expect.poll(() => valueOf(page, o.labNo, B), { message: `B on ${o.labNo} from C = 1`, timeout: 20_000 }).not.toBe('');
    const b = String(await valueOf(page, o.labNo, B));
    test.info().annotations.push({ type: 'stored', description: b }); console.log('STORED small', b);
    expect(Number.isFinite(Number(b)), `B = "${b}" parses as a number`).toBe(true);
  });

  test('TC-CALCB-04 a rule with an operator outside the set is refused (Math.max)', async ({ page }) => {
    const r = await save(page, rule('QA CALCB MAX', A, [f('Math.max('), t(C), f(','), n('2'), f(')')]));
    expect(r.status, 'Math.max( C , 2 )').toBe(400);
    expect(r.key).toBe('error.invalid.calculation.logic');
    expect(r.id, 'nothing was stored').toBeUndefined();
  });

  test('TC-CALCB-05 && between numbers is refused', async ({ page }) => {
    const r = await save(page, rule('QA CALCB ANDNUM', A, [t(C), f('&&'), n('2')]));
    expect(r.status, 'C && 2').toBe(400);
    expect(r.key).toBe('error.invalid.calculation.logic');
    expect(r.id).toBeUndefined();
  });

  test('TC-CALCB-06 Patient Weight is refused as an operand', async ({ page }) => {
    const r = await save(page, rule('QA CALCB WEIGHT', A, [{ type: 'PATIENT_ATTRIBUTE', value: 'WEIGHT' }, f('*'), n('2')]));
    expect(r.status, 'WEIGHT * 2').toBe(400);
    expect(r.id).toBeUndefined();
  });

  test('TC-CALCB-07 a constant outside the bounded-decimal grammar is refused (0x10; 1e3 is allowed)', async ({ page }) => {
    const r = await save(page, rule('QA CALCB HEX', A, [t(C), f('*'), n('0x10')]));
    expect(r.status, 'C * 0x10').toBe(400);
    expect(r.key).toBe('error.invalid.calculation.logic');
    expect(r.id).toBeUndefined();
  });

  test('TC-CALCB-08 a condition rule stores true or false (record)', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCB COND', B, [t(C), f('>='), n('10')]))).status, 'B = C >= 10').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '12' });
    await expect.poll(() => valueOf(page, o.labNo, B), { message: `B on ${o.labNo} from C = 12`, timeout: 20_000 }).not.toBe('');
    const cv = String(await valueOf(page, o.labNo, B)); test.info().annotations.push({ type: 'stored', description: cv }); console.log('STORED cond', cv, o.labNo);
    expect(await valueOf(page, o.labNo, B)).toBe('true');
  });
});
