/**
 * tests/calculation-rule-integrity.spec.ts
 *
 * Calculated-value rules (Admin > Calculated Value Tests, POST /rest/test-calculation) must not
 * be able to read their own output, form a cycle with another rule, or give one test two
 * active rules, because result entry then overwrites what the technician typed or fails.
 * Found 31 Oct 2026 on testing.openelis-global.org (develop 615942a7):
 *   - a self-referencing rule (Albumin = Albumin * 2), a two-rule cycle (ALP = BUN * 2,
 *     BUN = ALP * 2) and a second rule on Albumin all saved with 200;
 *   - entering 5.5 for Albumin then stored 11.0: the rule overwrote the entered result;
 *   - with ten such rules left by earlier QA runs, entering GPT/ALAT and GOT/ASAT answered
 *     500 (StaleStateException) and saved nothing.
 * CalculatedValueRestController.saveReflexRule validates only the destination component.
 * Catalogue: calculation-rule-integrity.md.
 *
 * Kind: Tripwire, each carries test.fail() until the API refuses the rule. Every rule this
 * spec creates is deactivated in afterAll, so a run leaves no active rule behind.
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, queueContext, order, enterOn, QueueSeed, SERUM } from '../helpers/report-queue';

test.setTimeout(240_000);
const created: number[] = [];
let seed: QueueSeed;
let A: string, B: string, C: string;

async function rules(page: Page): Promise<any[]> {
  return (await j(page, `${API}/test-calculations`)).body as any[];
}
function rule(name: string, outTest: string, inTest: string, fn: string, num: string) {
  return {
    id: null, name, testId: outTest, sampleId: 2, componentId: null, active: true, toggled: true, result: '',
    note: 'QA calculation-rule-integrity, deactivated after the run',
    operations: [
      { id: null, order: 0, type: 'TEST_RESULT', value: inTest, sampleId: 2 },
      { id: null, order: 1, type: 'MATH_FUNCTION', value: fn },
      { id: null, order: 2, type: 'INTEGER', value: num },
    ],
  };
}
async function save(page: Page, body: unknown): Promise<number> {
  const before = new Set((await rules(page)).map((r) => r.id));
  const r = await j(page, `${API}/test-calculation`, { method: 'POST', body });
  for (const x of await rules(page)) if (!before.has(x.id)) created.push(x.id);
  return r.status;
}

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true })).newPage();
  seed = await queueContext(page);
  const serum = (await j(page, `${API}/sample-type-tests?sampleType=2`)).body;
  const used = new Set((await rules(page)).flatMap((r: any) => [String(r.testId), ...(r.operations || []).filter((o: any) => o.type === 'TEST_RESULT').map((o: any) => String(o.value))]));
  const free = (serum.tests || []).filter((t: any) => t.resultType === 'N' && !used.has(String(t.id)));
  expect(free.length, 'three numeric Serum tests no rule uses').toBeGreaterThanOrEqual(3);
  [A, B, C] = free.slice(-3).map((t: any) => String(t.id));
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true })).newPage();
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
  for (const id of created) await j(page, `${API}/deactivate-test-calculation/${id}`, { method: 'POST', body: {} });
  await page.close();
});

test.describe('Calculated value rules cannot loop or overwrite entered results', () => {
  test.beforeEach(async ({ page }) => { seed = await queueContext(page); });

  test('TC-CALCI-01 a rule that reads its own test is refused', async ({ page }) => {
    test.fail(true, 'saves with 200 on develop 615942a7 (31 Oct)');
    expect(await save(page, rule('QA CALCI SELF', A, A, '*', '2'))).toBeGreaterThanOrEqual(400);
  });

  test('TC-CALCI-02 a rule that closes a cycle with another active rule is refused', async ({ page }) => {
    test.fail(true, 'saves with 200 on develop 615942a7 (31 Oct)');
    expect(await save(page, rule('QA CALCI CYCLE 1', B, C, '*', '2')), 'the first rule of the pair is fine').toBe(200);
    expect(await save(page, rule('QA CALCI CYCLE 2', C, B, '*', '2')), 'the second closes the cycle').toBeGreaterThanOrEqual(400);
  });

  test('TC-CALCI-03 a second active rule for the same test is refused', async ({ page }) => {
    test.fail(true, 'saves with 200 on develop 615942a7 (31 Oct)');
    expect(await save(page, rule('QA CALCI DUP 1', A, C, '+', '0'))).toBe(200);
    expect(await save(page, rule('QA CALCI DUP 2', A, B, '+', '0')), 'second rule writing the same test').toBeGreaterThanOrEqual(400);
  });

  test('TC-CALCI-04 an entered result is not overwritten by a rule that reads it', async ({ page }) => {
    test.fail(true, 'Albumin 5.5 stored as 11.0 on testing 615942a7 (31 Oct)');
    await save(page, rule('QA CALCI SELF 4', A, A, '*', '2'));
    const o = await order(page, seed, [{ type: SERUM, tests: [A] }]);
    await enterOn(page, o.labNo, { [A]: '5.5' });
    const lb = (await j(page, `${API}/LogbookResults?labNumber=${o.labNo}`)).body;
    const v = (lb.testResult || []).find((t: any) => String(t.testId) === A)?.resultValue;
    expect(Number(v), `stored result for test ${A}`).toBe(5.5);
  });
});
