/**
 * test-catalog-chaos-results.spec.ts
 *
 * Test Catalog chaos, part 1 of 5: what a test MEASURES and how it is NAMED.
 * Sections: Sample & Results (TC-CX-SR), Terminology (TC-CX-TM), Localization (TC-CX-LO),
 * Labels (TC-CX-LB), Accreditation (TC-CX-AC).
 *
 * Five kinds of non-happy path, as agreed with Casey on 2026-10-08:
 *   bad input through the UI and straight at the API (does the server check, or only the UI?);
 *   save faults (500, HTML, dropped connection, a login page answered with 200);
 *   concurrency (two editors on one test);
 *   permissions and session (a non-admin calling the API);
 *   lifecycle (apply something, edit it, remove it, and read it back each time).
 *
 * Catalogue: test-catalog-chaos-full.md. Data: inactive tests named "QA CX <case> <run>".
 * Tripwires use test.fail and flip when the product is fixed.
 */
import { test, expect } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts, successToasts, rangesOf } from './helpers/catalogUi';
import {
  TC, RUN, seedTest, sampleResultsOf, component, putSampleResults, makeCoded,
  errorToasts, faultOnce, FAULTS, asRole, observe,
} from './helpers/catalogChaos';

const SR = /\/rest\/test-catalog\/tests\/\d+\/sample-results$/;
const TERM = /\/rest\/test-catalog\/tests\/\d+\/terminology$/;

// ---------------------------------------------------------------------------------------------
// Sample & Results
// ---------------------------------------------------------------------------------------------
test.describe('Test Catalog chaos: Sample & Results (TC-CX-SR)', () => {
  (['500 JSON', 'dropped connection', 'login page with a 200'] as const).forEach((what, i) => {
    test(`TC-CX-SR-0${i + 1}: a Sample & Results save that meets ${what} says so, keeps the typing and changes nothing`, async ({ page }) => {
      test.fail(what === 'login page with a 200', 'TRIPWIRE F8: a login page answered with 200 is shown as "Sample & results saved" (status-only putToOpenElisServer)');
      const t = await seedTest(page, `SR${i + 1}`);
      const before = await sampleResultsOf(page, t.id);
      await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/sample-results`);
      const label = page.locator('#comp-label-0');
      await label.waitFor({ state: 'visible', timeout: 60_000 });
      await watchToasts(page);
      const typed = `QA CX SR${i + 1} edited ${RUN}`;
      await label.fill(typed);
      const fired = await faultOnce(page, 'PUT', SR, FAULTS[what]);
      await page.getByRole('button', { name: /^save$/i }).last().click();
      await expect.poll(fired, { message: 'the fault was injected on the save' }).toBe(true);
      await page.waitForTimeout(1500);
      expect(await successToasts(page), 'no success notification after a failed save').toHaveLength(0);
      expect((await errorToasts(page)).length, 'the user is told the save failed').toBeGreaterThan(0);
      await expect(page.locator('#comp-label-0'), 'the typing is still on screen').toHaveValue(typed);
      expect((await sampleResultsOf(page, t.id)).components[0].label, 'server unchanged').toBe(before.components[0].label);
    });
  });

  test('TC-CX-SR-04: removing the Primary component while another saved component exists saves (the next one becomes Primary)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F9: removing Primary while a second saved component exists answers 500 (uq_test_result_component_test_code: the removed row keeps PRIMARY)');
    const t = await seedTest(page, 'SR4');
    const sr = await sampleResultsOf(page, t.id);
    const p = sr.components[0];
    const two = await putSampleResults(page, t.id, [
      component({ id: p.id, label: p.label }),
      component({ code: 'QAX2', label: 'QA second', isPrimary: false, displayOrder: 2 }),
    ]);
    expect(two.status, `add a second component: ${two.text.slice(0, 160)}`).toBe(200);
    const second = (await sampleResultsOf(page, t.id)).components.find((c: any) => c.code === 'QAX2');
    // What SampleResultsSection sends when the first row is removed: the next row is promoted and renamed PRIMARY.
    const w = await putSampleResults(page, t.id, [component({ id: second.id, code: 'PRIMARY', label: 'QA second', isPrimary: true })]);
    expect(w.status, `remove Primary, promote the second: ${w.text.slice(0, 200)}`).toBe(200);
    const after = await sampleResultsOf(page, t.id);
    expect(after.components, 'one component left').toHaveLength(1);
    expect(after.components[0].isPrimary, 'and it is Primary').toBe(true);
  });

  test('TC-CX-SR-05: a free-text option typed as a number stays that number, not an unrelated dictionary entry', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F5: free-text options "1" and "2" are stored as dictionary ids 1 and 2 (INFLUENZA VIRUS A RNA DETECTED ...)');
    const t = await seedTest(page, 'SR5');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    const w = await putSampleResults(page, t.id, [component({ id: c.id, label: c.label, resultType: 'D', options: [
      { value: '1', valueName: '1', sortOrder: 1, normal: true, qualifiable: false },
      { value: '2', valueName: '2', sortOrder: 2, normal: false, qualifiable: false },
    ] })]);
    expect(w.status, w.text.slice(0, 160)).toBe(200);
    const opts = (await sampleResultsOf(page, t.id)).components[0].options;
    const shown = opts.map((o: any) => String(o.valueName ?? o.label ?? o.value));
    observe('options shown after saving "1" and "2"', w.status);
    test.info().annotations.push({ type: 'observed', description: `options read back: ${JSON.stringify(opts).slice(0, 300)}` });
    expect(shown, 'the options read back as the grades the admin typed').toEqual(['1', '2']);
  });

  test('TC-CX-SR-06: an interpretation on a new free-text option still points at that option after save', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F5: the option is stored as a dictionary id but the interpretation keeps the typed text, so it never matches');
    const t = await seedTest(page, 'SR6');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    const word = `QAReactive${RUN}`;
    const w = await putSampleResults(page, t.id, [component({ id: c.id, label: c.label, resultType: 'D',
      options: [{ value: word, valueName: word, sortOrder: 1, normal: false, qualifiable: false }],
      interpretations: [{ valueMatch: word, text: 'QA reactive: refer', severity: 'ABNORMAL', displayOrder: 1 }] })]);
    expect(w.status, w.text.slice(0, 160)).toBe(200);
    const back = (await sampleResultsOf(page, t.id)).components[0];
    const optValue = String(back.options[0].value);
    test.info().annotations.push({ type: 'observed', description: `option value ${optValue}; interpretation valueMatch ${back.interpretations?.[0]?.valueMatch}` });
    expect(String(back.interpretations[0].valueMatch), 'the interpretation matches the stored option value').toBe(optValue);
  });

  test('TC-CX-SR-07: removing a component then adding one with the same code starts clean (no old ranges come back)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F9: a removed component is revived with its old id and old ranges when the same code is added again');
    const t = await seedTest(page, 'SR7');
    const p = (await sampleResultsOf(page, t.id)).components[0];
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX7', label: 'QA second', isPrimary: false, displayOrder: 2 })])).status).toBe(200);
    const second = (await sampleResultsOf(page, t.id)).components.find((c: any) => c.code === 'QAX7');
    const r = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [
      { componentId: String(second.id), gender: '', minAge: 0, maxAge: null, lowNormal: 3, highNormal: 5, lowValid: 0, highValid: 50 }] });
    expect(r.status, `range on the second component: ${r.text.slice(0, 160)}`).toBe(200);
    // remove it
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label })])).status).toBe(200);
    const afterRemove = await rangesOf(page, t.id);
    test.info().annotations.push({ type: 'observed', description: `ranges listed after removing the component: ${afterRemove.length}` });
    // add a new component with the same code
    const re = await putSampleResults(page, t.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX7', label: 'QA brand new', isPrimary: false, displayOrder: 2 })]);
    expect(re.status, re.text.slice(0, 160)).toBe(200);
    const fresh = (await sampleResultsOf(page, t.id)).components.find((c: any) => c.code === 'QAX7');
    const ranges = (await rangesOf(page, t.id)).filter((x: any) => String(x.componentId) === String(fresh.id));
    test.info().annotations.push({ type: 'observed', description: `new component id ${fresh.id} (old ${second.id}); ranges on it ${ranges.length}` });
    expect(ranges, 'a new component starts with no reference ranges').toHaveLength(0);
  });

  test('TC-CX-SR-08: the server refuses a component with no result type or an unknown one', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19/Q: result type null and "Z" are stored (200); "NN" answers 500');
    const t = await seedTest(page, 'SR8');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    for (const rt of [null, 'Z', 'NN']) {
      const w = await putSampleResults(page, t.id, [component({ id: c.id, label: c.label, resultType: rt })]);
      expect.soft(w.status, `resultType ${JSON.stringify(rt)}: ${w.text.slice(0, 120)}`).toBe(422);
    }
    expect((await sampleResultsOf(page, t.id)).components[0].resultType, 'stored type unchanged').toBe('N');
  });

  test('TC-CX-SR-09: over-long text is refused with a 4xx, never a 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: label 256, default 81, interpretation 256, severity 21 answer 500 (no length checks)');
    const t = await seedTest(page, 'SR9');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    const cases: [string, Record<string, unknown>][] = [
      ['a 51-character label with a blank code on a new component', { extra: component({ code: '', label: 'Q'.repeat(51), isPrimary: false, displayOrder: 2 }) }],
      ['a 256-character label', { primary: { label: 'L'.repeat(256) } }],
      ['an 81-character default result', { primary: { defaultResult: 'D'.repeat(81) } }],
      ['a 256-character interpretation', { primary: { interpretations: [{ valueMatch: '>1', text: 'I'.repeat(256), severity: 'ABNORMAL', displayOrder: 1 }] } }],
      ['a 21-character severity', { primary: { interpretations: [{ valueMatch: '>1', text: 'x', severity: 'S'.repeat(21), displayOrder: 1 }] } }],
    ];
    for (const [what, v] of cases) {
      const comps: unknown[] = [component({ id: c.id, label: c.label, ...(v.primary as object ?? {}) })];
      if (v.extra) comps.push(v.extra);
      const w = await putSampleResults(page, t.id, comps);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is a validation answer, not a crash`).toBeLessThan(500);
    }
  });

  test('TC-CX-SR-10: a unit id that is not a number, or does not exist, is refused with a 4xx', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: uomId "abc" and 999999 answer 500');
    const t = await seedTest(page, 'SR10');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    for (const uomId of ['abc', '999999']) {
      const w = await putSampleResults(page, t.id, [component({ id: c.id, label: c.label, uomId })]);
      expect.soft(w.status, `uomId ${uomId}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `uomId ${uomId} is not a crash`).toBeLessThan(500);
    }
  });

  test('TC-CX-SR-11: missing lists in the body are a 400, not a 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: null components/options/interpretations answer 500 (NPE)');
    const t = await seedTest(page, 'SR11');
    const c = (await sampleResultsOf(page, t.id)).components[0];
    const bodies: [string, unknown][] = [
      ['components null', { testId: t.id, components: null }],
      ['options null', { testId: t.id, components: [component({ id: c.id, label: c.label, options: null })] }],
      ['interpretations null', { testId: t.id, components: [component({ id: c.id, label: c.label, interpretations: null })] }],
    ];
    for (const [what, body] of bodies) {
      const w = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/sample-results`, body);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeLessThan(500);
    }
  });

  test('TC-CX-SR-12: a save with no components at all is refused (a test needs something to result)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE Q: components [] is accepted (200) and leaves the test with nothing to result; Casey to rule');
    const t = await seedTest(page, 'SR12');
    const w = await putSampleResults(page, t.id, []);
    observe('PUT sample-results with components []', w);
    expect(w.status, 'refused').toBe(422);
    expect((await sampleResultsOf(page, t.id)).components.length, 'the component is still there').toBeGreaterThan(0);
  });

  test('TC-CX-SR-13: two editors: a stale save does not bring back a component the other editor removed', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: no stale check; an old copy brings back a component another editor removed');
    const t = await seedTest(page, 'SR13');
    const p = (await sampleResultsOf(page, t.id)).components[0];
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX13', label: 'QA second', isPrimary: false, displayOrder: 2 })])).status).toBe(200);
    const staleCopy = (await sampleResultsOf(page, t.id)).components; // editor A loads
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label })])).status, 'B removes the second').toBe(200);
    const a = await putSampleResults(page, t.id, staleCopy.map((c: any) => ({ ...c, label: c.code === 'PRIMARY' ? `A edit ${RUN}` : c.label })));
    observe('A saves its old copy', a);
    const after = (await sampleResultsOf(page, t.id)).components.map((c: any) => c.code);
    expect(a.status === 409 || !after.includes('QAX13'), `A was refused as stale, or B's removal stands (codes now ${after})`).toBe(true);
  });

  test('TC-CX-SR-14: the copy-from API replaces the target configuration (Casey 2026-09-23: copy replaces)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE Q: POST copy-from merges (target-only component kept); the UI no longer calls it. Retire or make it replace');
    const src = await seedTest(page, 'SR14src');
    await makeCoded(page, src.id);
    const tgt = await seedTest(page, 'SR14tgt');
    const p = (await sampleResultsOf(page, tgt.id)).components[0];
    expect((await putSampleResults(page, tgt.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX14', label: 'QA only on target', isPrimary: false, displayOrder: 2 })])).status).toBe(200);
    const w = await apiWrite(page, 'POST', `${TC}/tests/${tgt.id}/sample-results/copy-from/${src.id}`);
    expect(w.status, w.text.slice(0, 160)).toBe(200);
    const after = (await sampleResultsOf(page, tgt.id)).components;
    test.info().annotations.push({ type: 'observed', description: `target after copy: ${after.map((c: any) => `${c.code}:${c.resultType}`).join(', ')}` });
    expect(after.map((c: any) => c.code), 'the target-only component is gone').not.toContain('QAX14');
    expect(after.find((c: any) => c.isPrimary)?.resultType, "the primary now has the source's result type").toBe('D');
  });

  test('TC-CX-SR-15: lifecycle: add an option, rename its normal flag, remove it; each step reads back', async ({ page }) => {
    const t = await seedTest(page, 'SR15');
    const { pos, neg } = await makeCoded(page, t.id);
    let comp = (await sampleResultsOf(page, t.id)).components[0];
    expect(comp.options.map((o: any) => String(o.value)).sort(), 'applied').toEqual([pos, neg].sort());
    // edit: flip which option is normal
    const flipped = comp.options.map((o: any) => ({ ...o, normal: String(o.value) === pos }));
    expect((await putSampleResults(page, t.id, [{ ...comp, options: flipped }])).status).toBe(200);
    comp = (await sampleResultsOf(page, t.id)).components[0];
    expect(comp.options.find((o: any) => String(o.value) === pos)?.normal, 'edited: Positive is now normal').toBe(true);
    // remove Negative
    expect((await putSampleResults(page, t.id, [{ ...comp, options: comp.options.filter((o: any) => String(o.value) !== neg) }])).status).toBe(200);
    comp = (await sampleResultsOf(page, t.id)).components[0];
    expect(comp.options.map((o: any) => String(o.value)), 'removed').toEqual([pos]);
  });
});

// ---------------------------------------------------------------------------------------------
// Terminology
// ---------------------------------------------------------------------------------------------
const termOf = async (page: any, id: string) => (await apiGet<any>(page, `${TC}/tests/${id}/terminology`)).json;
const putTerm = (page: any, id: string, mappings: unknown[]) => apiWrite<any>(page, 'PUT', `${TC}/tests/${id}/terminology`, { testId: id, mappings });

test.describe('Test Catalog chaos: Terminology (TC-CX-TM)', () => {
  (['500 JSON', 'login page with a 200'] as const).forEach((what, i) => {
    test(`TC-CX-TM-0${i + 1}: a Terminology save that meets ${what} is reported as failed and stores nothing`, async ({ page }) => {
      test.fail(what === 'login page with a 200', 'TRIPWIRE F8: a login page answered with 200 is shown as "Terminology mappings saved"');
      const t = await seedTest(page, `TM${i + 1}`);
      await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/terminology`);
      await page.locator('#terminology-code').waitFor({ state: 'visible', timeout: 60_000 });
      await page.locator('#terminology-source').selectOption('LOINC');
      await page.locator('#terminology-code').fill(`9${RUN}-${i}`);
      await watchToasts(page);
      const fired = await faultOnce(page, 'PUT', TERM, FAULTS[what]);
      await page.getByRole('button', { name: /^save$/i }).last().click();
      await expect.poll(fired).toBe(true);
      await page.waitForTimeout(1500);
      expect(await successToasts(page), 'no success notification').toHaveLength(0);
      expect((await errorToasts(page)).length, 'the user is told').toBeGreaterThan(0);
      expect((await termOf(page, t.id)).mappings, 'nothing stored').toHaveLength(0);
    });
  });

  test('TC-CX-TM-03: a LOINC code typed with stray spaces is stored trimmed, so routing and the duplicate check see it', async ({ page }) => {

    test.fail(true, 'TRIPWIRE Q: LOINC codes are stored with surrounding spaces (exact-match routing and the duplicate check miss them)');
    const t = await seedTest(page, 'TM3');
    const w = await putTerm(page, t.id, [{ source: 'LOINC', code: ' 2345-7 ', relationship: 'SAME_AS' }]);
    expect(w.status, w.text.slice(0, 160)).toBe(200);
    const m = (await termOf(page, t.id)).mappings[0];
    expect(m.code, 'stored without the spaces').toBe('2345-7');
  });

  test('TC-CX-TM-04: an over-long code or display name is a 4xx, not a 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: code 81, display name 256 and mappings null answer 500');
    const t = await seedTest(page, 'TM4');
    for (const [what, m] of [
      ['81-character code', { source: 'LOINC', code: '1'.repeat(81), relationship: 'SAME_AS' }],
      ['256-character display name', { source: 'LOINC', code: '1234-5', displayName: 'n'.repeat(256), relationship: 'SAME_AS' }],
    ] as const) {
      const w = await putTerm(page, t.id, [m]);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
    }
    const n = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/terminology`, { testId: t.id, mappings: null });
    expect.soft(n.status, `mappings null: ${n.text.slice(0, 120)}`).toBeLessThan(500);
  });

  test('TC-CX-TM-05: lifecycle: a mapping scoped to a component that is later removed does not block the next save', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F12: a mapping scoped to a removed component is still returned and makes every later save 422');
    const t = await seedTest(page, 'TM5');
    const p = (await sampleResultsOf(page, t.id)).components[0];
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX5', label: 'QA second', isPrimary: false, displayOrder: 2 })])).status).toBe(200);
    const second = (await sampleResultsOf(page, t.id)).components.find((c: any) => c.code === 'QAX5');
    expect((await putTerm(page, t.id, [{ source: 'LOINC', code: '1234-5', relationship: 'SAME_AS' },
      { source: 'LOINC', code: '5678-9', relationship: 'SAME_AS', componentId: String(second.id) }])).status, 'apply').toBe(200);
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label })])).status, 'remove the component').toBe(200);
    // The editor sends back what it loaded, plus one new row.
    const loaded = (await termOf(page, t.id)).mappings;
    test.info().annotations.push({ type: 'observed', description: `mappings listed after removing the component: ${JSON.stringify(loaded).slice(0, 300)}` });
    const w = await putTerm(page, t.id, [...loaded, { source: 'SNOMED', code: `QA${RUN}`, relationship: 'SAME_AS' }]);
    expect(w.status, `the next terminology save: ${w.text.slice(0, 160)}`).toBe(200);
  });

  test('TC-CX-TM-06: lifecycle: add, edit and remove a test-level LOINC; test.loinc follows each step', async ({ page }) => {
    const t = await seedTest(page, 'TM6');
    const loincOf = async () => (await apiGet<any>(page, `${TC}/tests/${t.id}/loinc-integrity`)).json?.loinc ?? null;
    expect((await putTerm(page, t.id, [{ source: 'LOINC', code: '1111-1', relationship: 'SAME_AS' }])).status).toBe(200);
    expect(await loincOf(), 'applied').toBe('1111-1');
    expect((await putTerm(page, t.id, [{ source: 'LOINC', code: '2222-2', relationship: 'SAME_AS' }])).status).toBe(200);
    expect(await loincOf(), 'edited').toBe('2222-2');
    expect((await putTerm(page, t.id, [])).status).toBe(200);
    expect(await loincOf(), 'removed').toBeNull();
  });

  test('TC-CX-TM-07: two editors: a stale terminology save does not drop the mapping the other editor added', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: no stale check; an old list drops the mapping another editor added');
    const t = await seedTest(page, 'TM7');
    const a = (await termOf(page, t.id)).mappings; // A loads (empty)
    expect((await putTerm(page, t.id, [{ source: 'LOINC', code: '3333-3', relationship: 'SAME_AS' }])).status, 'B adds').toBe(200);
    const w = await putTerm(page, t.id, [...a, { source: 'SNOMED', code: `QA7${RUN}`, relationship: 'SAME_AS' }]);
    observe('A saves on its old copy', w);
    const codes = (await termOf(page, t.id)).mappings.map((m: any) => m.code);
    expect(w.status === 409 || codes.includes('3333-3'), `A refused as stale, or B's mapping kept (now ${codes})`).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------------------------
async function nameLocalization(page: any, testId: string) {
  const r = await apiGet<any>(page, `${TC}/tests/${testId}/localization`);
  expect(r.status, 'localization bridge').toBe(200);
  const id = r.json.fields.find((f: any) => f.field === 'name').localizationId;
  const loc = await apiGet<any>(page, `/rest/localizations/${id}`);
  return { id: String(id), translations: loc.json.translations as Record<string, string> };
}

test.describe('Test Catalog chaos: Localization (TC-CX-LO)', () => {
  test('TC-CX-LO-01: a non-admin cannot rename a test through the translations API', async ({ page, browser }) => {
    test.fail(true, 'TRIPWIRE F4: /rest/localizations has no admin check; a receptionist renames a test (200)');
    const t = await seedTest(page, 'LO1');
    const { id, translations } = await nameLocalization(page, t.id);
    const recept = await asRole(browser, 'receptionist');
    const w = await apiWrite(recept, 'PUT', `/rest/localizations/${id}/translations`, { ...translations, en: `QA CX hijacked ${RUN}` });
    observe('receptionist PUT /rest/localizations/{id}/translations', w);
    const after = await nameLocalization(page, t.id);
    // put it back whatever happened
    if (after.translations.en !== translations.en) await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, translations);
    await recept.context().close();
    expect(after.translations.en, 'the English name is unchanged').toBe(translations.en);
    expect(w.status, 'the call is refused').toBe(403);
  });

  test('TC-CX-LO-02: a blank English name is refused, so the test never shows with no name', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F17: a blank English name is stored (200); the test then shows with no name');
    const t = await seedTest(page, 'LO2');
    const { id, translations } = await nameLocalization(page, t.id);
    const w = await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, { ...translations, en: '' });
    observe('PUT translations en=""', w);
    const after = await nameLocalization(page, t.id);
    if (!after.translations.en) await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, translations);
    expect(after.translations.en, 'the English name survives').toBe(translations.en);
    expect(w.status, 'refused').toBeGreaterThanOrEqual(400);
  });

  test('TC-CX-LO-03: a locale code that is too long, or a null value, is a 4xx not a 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: an 11-character locale, a null value and an unknown id answer 500 with the raw exception text');
    const t = await seedTest(page, 'LO3');
    const { id, translations } = await nameLocalization(page, t.id);
    const long = await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, { ...translations, abcdefghijk: 'x' });
    expect.soft(long.status, `11-character locale: ${long.text.slice(0, 120)}`).toBeLessThan(500);
    const nul = await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, { ...translations, fr: null });
    expect.soft(nul.status, `null value: ${nul.text.slice(0, 120)}`).toBeLessThan(500);
    const unknown = await apiWrite(page, 'PUT', '/rest/localizations/99999999/translations', { en: 'x' });
    expect.soft(unknown.status, `unknown localization id: ${unknown.text.slice(0, 120)}`).toBe(404);
  });

  test('TC-CX-LO-04: two editors: saving English from an old page does not revert the French another admin just saved', async ({ page }) => {

    test.fail(true, "TRIPWIRE F11: the PUT carries every locale loaded at page open, so an old page reverts another admin's French");
    const t = await seedTest(page, 'LO4');
    const { id, translations: loaded } = await nameLocalization(page, t.id); // A loads every locale
    const fr = `QA CX LO4 fr ${RUN}`;
    expect((await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, { ...loaded, fr })).status, 'B saves French').toBe(200);
    // What LocalizationSection sends: every locale it loaded, with the edited one changed.
    const w = await apiWrite(page, 'PUT', `/rest/localizations/${id}/translations`, { ...loaded, en: `QA CX LO4 en ${RUN}` });
    observe('A saves English on its old copy', w);
    const after = (await nameLocalization(page, t.id)).translations;
    expect(w.status === 409 || after.fr === fr, `A refused as stale, or B's French kept (fr now "${after.fr}")`).toBe(true);
  });

  test('TC-CX-LO-05: a Localization save answered by a login page with a 200 is not shown as saved', async ({ page }) => {
    const t = await seedTest(page, 'LO5');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/localization`);
    const input = page.locator('#localization-input-name');
    await input.waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('#localization-locale').selectOption({ index: 1 });
    await input.fill(`QA CX LO5 changed ${RUN}`);
    const fired = await faultOnce(page, 'PUT', /\/rest\/localizations\/\d+\/translations$/, FAULTS['login page with a 200']);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    await expect.poll(fired).toBe(true);
    const section = page.getByTestId('localization-section');
    await expect(section.locator('.cds--inline-notification').first(), 'a notification appears').toBeVisible();
    await expect(section.locator('.cds--inline-notification--success'), 'and it is not a success').toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------
const labelCfg = (page: any, id: string) => apiGet<any>(page, `/rest/api/tests/${id}/labelConfig`);
const putLabels = (page: any, id: string, links: unknown, allow = false) =>
  apiWrite<any>(page, 'PUT', `/rest/api/tests/${id}/labelConfig`, { allowOrderEntryOverride: allow, links });

async function aSamplePreset(page: any) {
  const r = await apiGet<any[]>(page, '/api/labelPresets?status=ACTIVE');
  const p = (r.json ?? []).find((x: any) => x.printsPerSample);
  expect(p, 'an active per-sample label preset').toBeTruthy();
  return p;
}

test.describe('Test Catalog chaos: Labels (TC-CX-LB)', () => {
  test('TC-CX-LB-01: a Labels save that fails keeps what the admin typed', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F15: a failed Labels save reloads from the server and throws away the typed maximum');
    const t = await seedTest(page, 'LB1');
    const preset = await aSamplePreset(page);
    expect((await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: 1, maxQty: 3, allowOverride: false }])).status).toBe(200);
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/labels`);
    const max = page.locator(`#max-${preset.id}`);
    await max.waitFor({ state: 'visible', timeout: 60_000 });
    await max.fill('7');
    await max.press('Tab');
    const fired = await faultOnce(page, 'PUT', /\/rest\/api\/tests\/\d+\/labelConfig$/, FAULTS['500 JSON']);
    await page.getByTestId('labels-save').click();
    await expect.poll(fired).toBe(true);
    await expect(page.getByTestId('labels-section').locator('.cds--inline-notification--error').first(), 'the failure is shown').toBeVisible();
    await expect(page.locator(`#max-${preset.id}`), 'the typed maximum is still there to retry').toHaveValue('7');
  });

  test('TC-CX-LB-02: bad label config bodies are 4xx, not 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: links null answers 500');
    const t = await seedTest(page, 'LB2');
    const preset = await aSamplePreset(page);
    const nul = await putLabels(page, t.id, null);
    expect.soft(nul.status, `links null: ${nul.text.slice(0, 120)}`).toBeLessThan(500);
    const inv = await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: 5, maxQty: 2, allowOverride: false }]);
    expect.soft(inv.status, `max below default: ${inv.text.slice(0, 120)}`).toBe(422);
    const dup = await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: 1, maxQty: 2, allowOverride: false }, { presetId: preset.id, defaultQty: 1, maxQty: 2, allowOverride: false }]);
    expect.soft(dup.status, `duplicate preset: ${dup.text.slice(0, 120)}`).toBe(422);
    const neg = await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: -1, maxQty: 2, allowOverride: false }]);
    expect.soft(neg.status, `negative default: ${neg.text.slice(0, 120)}`).toBe(422);
  });

  test('TC-CX-LB-03: lifecycle: link a preset, change its quantities, unlink it; each step reads back', async ({ page }) => {
    const t = await seedTest(page, 'LB3');
    const preset = await aSamplePreset(page);
    expect((await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: 1, maxQty: 3, allowOverride: false }])).status).toBe(200);
    expect((await labelCfg(page, t.id)).json.links.map((l: any) => [l.presetId, l.defaultQty, l.maxQty])).toEqual([[preset.id, 1, 3]]);
    expect((await putLabels(page, t.id, [{ presetId: preset.id, defaultQty: 2, maxQty: 4, allowOverride: true }])).status).toBe(200);
    const edited = (await labelCfg(page, t.id)).json.links[0];
    expect([edited.defaultQty, edited.maxQty, edited.allowOverride], 'edited').toEqual([2, 4, true]);
    expect((await putLabels(page, t.id, [])).status).toBe(200);
    expect((await labelCfg(page, t.id)).json.links, 'unlinked').toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Accreditation
// ---------------------------------------------------------------------------------------------
async function qaBody(page: any, label: string, active = true) {
  const r = await apiWrite<any>(page, 'POST', '/rest/accreditation/bodies', {
    code: `QA${label}${RUN}`.slice(0, 16), name: `QA CX body ${label} ${RUN}`, expiresOn: '2030-12-31', active,
  });
  expect(r.status, `create body: ${r.text.slice(0, 160)}`).toBe(201);
  return r.json;
}
const enrollmentsOf = async (page: any, testId: string) => (await apiGet<any[]>(page, `/rest/accreditation/enrollments?testId=${testId}`)).json ?? [];

test.describe('Test Catalog chaos: Accreditation (TC-CX-AC)', () => {
  test('TC-CX-AC-01: lifecycle: enroll, refuse a duplicate, remove, and a second remove is a clean refusal', async ({ page }) => {
    const t = await seedTest(page, 'AC1');
    const body = await qaBody(page, 'A1');
    const e1 = await apiWrite(page, 'POST', '/rest/accreditation/enrollments', { testId: t.id, accreditingBodyId: body.id });
    expect(e1.status, e1.text.slice(0, 160)).toBe(201);
    const dup = await apiWrite(page, 'POST', '/rest/accreditation/enrollments', { testId: t.id, accreditingBodyId: body.id });
    expect(dup.status, 'a duplicate enrollment is refused').toBe(400);
    const list = await enrollmentsOf(page, t.id);
    expect(list, 'one enrollment').toHaveLength(1);
    const id = list[0].id;
    expect((await apiWrite(page, 'DELETE', `/rest/accreditation/enrollments/${id}`)).status).toBe(204);
    expect(await enrollmentsOf(page, t.id), 'removed').toHaveLength(0);
    const again = await apiWrite(page, 'DELETE', `/rest/accreditation/enrollments/${id}`);
    expect([400, 404], `second remove of the same enrollment is a clean refusal: ${again.status} ${again.text.slice(0, 120)}`).toContain(again.status);
    await apiWrite(page, 'DELETE', `/rest/accreditation/bodies/${body.id}`);
  });

  test('TC-CX-AC-02: an inactive accrediting body cannot be used to enroll a test through the API', async ({ page }) => {

    test.fail(true, 'TRIPWIRE Q: an inactive accrediting body can be used through the API (201)');
    const t = await seedTest(page, 'AC2');
    const body = await qaBody(page, 'A2', false);
    const e = await apiWrite(page, 'POST', '/rest/accreditation/enrollments', { testId: t.id, accreditingBodyId: body.id });
    observe('enroll with an inactive body', e);
    const n = (await enrollmentsOf(page, t.id)).length;
    for (const x of await enrollmentsOf(page, t.id)) await apiWrite(page, 'DELETE', `/rest/accreditation/enrollments/${x.id}`);
    await apiWrite(page, 'DELETE', `/rest/accreditation/bodies/${body.id}`);
    expect(n, 'no enrollment was made').toBe(0);
    expect(e.status, 'refused').toBe(400);
  });

  test('TC-CX-AC-03: the editor shows why an enrollment failed (a duplicate made in another tab)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F15: the duplicate reason is dropped; the editor says only "The accreditation could not be added."');
    const t = await seedTest(page, 'AC3');
    const body = await qaBody(page, 'A3');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/accreditation`);
    await page.getByTestId('add-accreditation-button').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('add-accreditation-button').click();
    const dlg = page.getByRole('dialog').last();
    await dlg.locator('#accreditation-body-select').click();
    await page.getByRole('option', { name: new RegExp(`QA CX body A3 ${RUN}`) }).click();
    // another tab enrolls the same body first
    expect((await apiWrite(page, 'POST', '/rest/accreditation/enrollments', { testId: t.id, accreditingBodyId: body.id })).status).toBe(201);
    const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/rest\/accreditation\/enrollments$/.test(new URL(r.url()).pathname));
    await dlg.getByRole('button', { name: /^save$/i }).click();
    expect((await resp).status(), 'the server refuses the duplicate').toBe(400);
    const msg = page.getByTestId('accreditation-section').locator('.cds--inline-notification--error, .cds--toast-notification--error').first();
    await expect(msg, 'an error is shown').toBeVisible();
    test.info().annotations.push({ type: 'observed', description: `error text: ${(await msg.innerText()).replace(/\s+/g, ' ')}` });
    await expect(msg, 'and it says the test is already accredited by that body').toContainText(/already|duplicate/i);
    for (const x of await enrollmentsOf(page, t.id)) await apiWrite(page, 'DELETE', `/rest/accreditation/enrollments/${x.id}`);
    await apiWrite(page, 'DELETE', `/rest/accreditation/bodies/${body.id}`);
  });
});
