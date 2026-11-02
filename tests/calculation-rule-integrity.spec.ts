/**
 * tests/calculation-rule-integrity.spec.ts
 *
 * Calculated-value rules (Admin > Calculated Value Tests, POST /rest/test-calculation) must not
 * be able to read their own output, form a loop with other active rules, or give one test two
 * active rules, and a rule must never write over a result someone entered.
 *
 * History:
 *   - 31 Oct 2026, testing (develop 615942a7): a self-referencing rule (Albumin = Albumin * 2), a
 *     two-rule loop and a second rule on Albumin all saved with 200; entering 5.5 for Albumin
 *     stored 11.0; with ten such rules left by QA runs, result entry answered 500. Filed OGC-1587.
 *   - 2 Nov 2026: #4908 (OGC-1587) refuses those rules with 400 and a message key, and keeps
 *     entered results. Deployed to testing as develop a21c3123. 01 to 04 flipped to guards;
 *     05 to 10 added for the rest of what #4908 does.
 *
 * Refusals answer 400 with { messageKey, messageArgs } (CalculatedValueRestController.refusal),
 * and the keys are calculation.error.* in en.json. The spec asserts the key, not the English text.
 *
 * Every rule a case creates is deactivated after that case (afterEach), so cases do not refuse
 * each other's rules as duplicates. Names carry a per-run suffix, because the API refuses any
 * existing name, inactive ones included (that is TC-CALCI-08). Tests are picked from those no
 * ACTIVE rule uses, so deactivated rules from earlier runs do not use up the catalog.
 * TC-CALCI-00 is the canary: if an ordinary rule cannot be saved, every refusal below is a
 * harness problem, not the product.
 *
 * Catalogue: calculation-rule-integrity.md.
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, queueContext, order, enterOn, QueueSeed, SERUM } from '../helpers/report-queue';

test.setTimeout(240_000);
const created: number[] = [];
let seed: QueueSeed;
let A: string, B: string, C: string, D: string;

const RUN = Date.now().toString(36);
const named = (name: string) => `${name} ${RUN}`;

async function rules(page: Page): Promise<any[]> {
  return (await j(page, `${API}/test-calculations`)).body as any[];
}
/** out = in <fn> num, on Serum; active unless told otherwise. */
function rule(name: string, outTest: string, inTest: string, fn = '*', num = '2', active = true) {
  return {
    id: null, name: named(name), testId: outTest, sampleId: 2, componentId: null, active, toggled: active, result: '',
    note: 'QA calculation-rule-integrity, deactivated after the case',
    operations: [
      { id: null, order: 0, type: 'TEST_RESULT', value: inTest, sampleId: 2 },
      { id: null, order: 1, type: 'MATH_FUNCTION', value: fn },
      { id: null, order: 2, type: 'INTEGER', value: num },
    ],
  };
}
/** Saves a rule; records any rule it created; returns the status and the refusal body. */
async function save(page: Page, body: unknown): Promise<{ status: number; key?: string; args?: any; id?: number }> {
  const before = new Set((await rules(page)).map((r) => r.id));
  const r = await j(page, `${API}/test-calculation`, { method: 'POST', body });
  let id: number | undefined;
  for (const x of await rules(page)) if (!before.has(x.id)) { created.push(x.id); id = x.id; }
  return { status: r.status, key: (r.body as any)?.messageKey, args: (r.body as any)?.messageArgs, id };
}
async function ruleById(page: Page, id: number) {
  return (await rules(page)).find((r: any) => r.id === id);
}
/** The stored value of test `testId` on order `labNo`. */
async function valueOf(page: Page, labNo: string, testId: string): Promise<string | undefined> {
  const lb = (await j(page, `${API}/LogbookResults?labNumber=${labNo}`)).body;
  return (lb.testResult || []).find((t: any) => String(t.testId) === testId)?.resultValue;
}
async function deactivateCreated(page: Page) {
  for (const id of created.splice(0)) await j(page, `${API}/deactivate-test-calculation/${id}`, { method: 'POST', body: {} });
}

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true })).newPage();
  seed = await queueContext(page);
  const serum = (await j(page, `${API}/sample-type-tests?sampleType=2`)).body;
  const used = new Set((await rules(page)).filter((r: any) => r.active).flatMap((r: any) => [String(r.testId), ...(r.operations || []).filter((o: any) => o.type === 'TEST_RESULT').map((o: any) => String(o.value))]));
  const free = (serum.tests || []).filter((t: any) => t.resultType === 'N' && !used.has(String(t.id)));
  expect(free.length, 'four numeric Serum tests no active rule uses').toBeGreaterThanOrEqual(4);
  [A, B, C, D] = free.slice(-4).map((t: any) => String(t.id));
  await page.close();
});

test.afterEach(async ({ page }) => {
  await page.goto('/').catch(() => undefined);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 }).catch(() => undefined);
  await deactivateCreated(page);
});

test.describe('Calculated value rules cannot loop or overwrite entered results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
  });

  test('TC-CALCI-00 an ordinary rule with a fresh name saves (guard, canary)', async ({ page }) => {
    expect((await save(page, rule('QA CALCI CANARY', B, C))).status, 'B = C * 2 is a valid rule').toBe(200);
  });

  test('TC-CALCI-01 a rule that reads its own test is refused (OGC-1587)', async ({ page }) => {
    const r = await save(page, rule('QA CALCI SELF', A, A));
    expect(r.status, 'A = A * 2').toBe(400);
    expect(r.key).toBe('calculation.error.selfReference');
    expect(r.id, 'nothing was stored').toBeUndefined();
  });

  test('TC-CALCI-02 a rule that closes a loop with another active rule is refused (OGC-1587)', async ({ page }) => {
    expect((await save(page, rule('QA CALCI LOOP 1', B, C))).status, 'the first rule of the pair is fine').toBe(200);
    const r = await save(page, rule('QA CALCI LOOP 2', C, B));
    expect(r.status, 'C = B * 2 closes the loop').toBe(400);
    expect(r.key).toBe('calculation.error.cycle');
  });

  test('TC-CALCI-03 a second active rule for the same test is refused (OGC-1587)', async ({ page }) => {
    expect((await save(page, rule('QA CALCI DUP 1', A, C, '+', '0'))).status).toBe(200);
    const r = await save(page, rule('QA CALCI DUP 2', A, B, '+', '0'));
    expect(r.status, 'a second rule writing A').toBe(400);
    expect(r.key).toBe('calculation.error.duplicateDestination');
    expect(String(r.args?.other ?? ''), 'the refusal names the rule already writing A').toContain(named('QA CALCI DUP 1'));
  });

  test('TC-CALCI-04 a value entered for the rule\'s test before its input is kept (OGC-1587)', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCI KEEP', B, C))).status, 'B = C * 2').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [B]: '5.5' });
    await enterOn(page, o.labNo, { [C]: '3' });
    expect(Number(await valueOf(page, o.labNo, B)), `B on ${o.labNo} keeps the entered 5.5, not 6`).toBe(5.5);
  });

  test('TC-CALCI-05 an empty result is still calculated (guard: 04 and 06 are not vacuous)', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCI FILL', B, C))).status, 'B = C * 2').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '3' });
    await expect.poll(async () => Number(await valueOf(page, o.labNo, B)), { message: `B on ${o.labNo} is calculated from C = 3`, timeout: 20_000 }).toBe(6);
  });

  test('TC-CALCI-06 a calculated value edited by hand is not recalculated when its input changes (OGC-1587)', async ({ page }) => {
    seed = await queueContext(page);
    expect((await save(page, rule('QA CALCI HAND', B, C))).status, 'B = C * 2').toBe(200);
    const o = await order(page, seed, [{ type: SERUM, tests: [B, C] }]);
    await enterOn(page, o.labNo, { [C]: '3' });
    await expect.poll(async () => Number(await valueOf(page, o.labNo, B)), { message: 'B is first calculated as 6', timeout: 20_000 }).toBe(6);
    await enterOn(page, o.labNo, { [B]: '7' });
    await enterOn(page, o.labNo, { [C]: '4' });
    expect(Number(await valueOf(page, o.labNo, B)), `B on ${o.labNo} keeps the hand-entered 7, not 8`).toBe(7);
  });

  test('TC-CALCI-07 a rule saved switched off cannot be switched on into a conflict (OGC-1587)', async ({ page }) => {
    expect((await save(page, rule('QA CALCI ON 1', A, C, '+', '0'))).status).toBe(200);
    const off = await save(page, rule('QA CALCI ON 2', A, B, '+', '0', false));
    expect(off.status, 'a second rule for A saves when it is switched off').toBe(200);
    expect(off.id, 'and is stored').toBeDefined();
    const on = await j(page, `${API}/activate-test-calculation/${off.id}`, { method: 'POST', body: {} });
    expect(on.status, 'switching it on is refused').toBe(400);
    expect((on.body as any)?.messageKey).toBe('calculation.error.duplicateDestination');
    expect((await ruleById(page, off.id!))?.active, 'and it stays off').toBeFalsy();
  });

  test('TC-CALCI-08 a rule name already in use is refused, active or switched off, spaces ignored (OGC-1587)', async ({ page }) => {
    const first = await save(page, rule('QA CALCI NAME', A, C, '+', '0'));
    expect(first.status).toBe(200);
    const again = await save(page, { ...rule('QA CALCI NAME', D, B, '+', '0') });
    expect(again.status, 'the same name, otherwise valid').toBe(400);
    expect(again.key).toBe('calculation.error.duplicateName');
    const padded = await save(page, { ...rule('QA CALCI NAME', D, B, '+', '0'), name: `  ${named('QA CALCI NAME')}  ` });
    expect(padded.status, 'the same name with spaces around it').toBe(400);
    await j(page, `${API}/deactivate-test-calculation/${first.id}`, { method: 'POST', body: {} });
    const inactive = await save(page, { ...rule('QA CALCI NAME', D, B, '+', '0') });
    expect(inactive.status, 'the name of a switched-off rule').toBe(400);
    expect(inactive.key).toBe('calculation.error.duplicateNameInactive');
  });

  test('TC-CALCI-09 saving a rule that no longer exists answers 404, not 500, and creates nothing (OGC-1587)', async ({ page }) => {
    const r = await save(page, { ...rule('QA CALCI GONE', B, C), id: 2147480000 });
    expect(r.status).toBe(404);
    expect(r.key).toBe('calculation.error.notFound');
    expect(r.id, 'no rule was created instead').toBeUndefined();
  });

  test('TC-CALCI-10 a three-rule loop is refused and the message names the chain (OGC-1587)', async ({ page }) => {
    expect((await save(page, rule('QA CALCI L3 1', B, C))).status, 'B = C * 2').toBe(200);
    expect((await save(page, rule('QA CALCI L3 2', C, D))).status, 'C = D * 2').toBe(200);
    const r = await save(page, rule('QA CALCI L3 3', D, B));
    expect(r.status, 'D = B * 2 closes B, D, C, B').toBe(400);
    expect(r.key).toBe('calculation.error.cycle');
    for (const n of ['QA CALCI L3 1', 'QA CALCI L3 2', 'QA CALCI L3 3']) expect(String(r.args?.cycle ?? ''), `the chain names ${n}`).toContain(named(n));
  });
});
