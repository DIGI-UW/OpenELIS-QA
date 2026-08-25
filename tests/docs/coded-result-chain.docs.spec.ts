// Coded (dictionary) result, end to end: Test Catalogue -> order -> results entry -> validation.
//
// WHY THIS EXISTS
// A test whose primary component is resultType "D" is the urine-dipstick / ordinal-ladder case
// (Negative / Trace / + / ++ / +++). Everything about it differs from a numeric test at exactly the
// points a harness tends to assume:
//   * activation returns 200 with NO range acknowledgment - dictionary tests skip the reference
//     range coverage gate that numeric tests hit with a 409;
//   * at Results Entry the control is a <select> carrying the configured ladder in sortOrder, NOT
//     the numeric <input> every other spec in this repo expects;
//   * completeness enforces NO_DICTIONARY_OPTIONS, so a "D" component with no options never
//     activates.
// All three were confirmed live on testing 3.2.2.0 (2026-08-24) before this spec was written.
//
// ORDER-FORM RULES THIS SPEC ENCODES (they are not guessable from the DOM; see HARNESS-FINDINGS):
//   * Save & Next carries cds--btn--disabled and fires NO request until the sampling site is
//     COMMITTED via its result row's Select, and at least one of Requesting Organization or
//     Requestor is committed too. There is no inline error explaining why.
//   * The commit affordance depends on whether the record already exists: first use offers
//     "+ Add new organization ...", afterwards ONLY the row's "Select" works. Handle both or the
//     spec passes once and fails on every later run.
//   * "N/M steps" is a completion counter, not a wizard position - read the button, not the text.
//
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/coded-result-chain.docs.spec.ts
import { test, expect, Page } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test.describe.configure({ retries: 0, mode: 'serial' });

const API = '/api/OpenELIS-Global/rest';
const TEST_NAME = 'QA Urine Dipstick Protein';
const TEST_CODE = 'QAUDIPP';
const URINE_PREFER = /^\s*Urines?\s*$/i;
// The instance dictionary carries this ladder; a plain "++"/"+++" set does not exist here, so the
// expected labels are read back from the catalog rather than hard-coded into the assertions.
const LADDER_PREFER = ['Negative', 'Trace'];

const txtOf = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Commit a typeahead result row: click the "Select" inside the row whose text matches. */
async function commitRow(page: Page, re: RegExp): Promise<string | null> {
  return await page.evaluate((src) => {
    const rx = new RegExp(src);
    const t = (e: Element | null) => ((e && e.textContent) || '').trim();
    const rows = [...document.querySelectorAll('tr,li,div')]
      .filter((e) => rx.test(t(e)) && /select/i.test(t(e)) && t(e).length < 220)
      .sort((a, b) => t(a).length - t(b).length);
    for (const r of rows) {
      const b = [...r.querySelectorAll('button,a,span')].find((x) => /^select$/i.test(t(x)));
      if (b) { (b as HTMLElement).click(); return t(r).slice(0, 60); }
    }
    return null;
  }, re.source);
}

/** Click an "+ Add new ..." affordance by text. Returns what it clicked, or null. */
async function clickAddNew(page: Page, re: RegExp): Promise<string | null> {
  return await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const t = (e: Element | null) => ((e && e.textContent) || '').trim();
    const el = [...document.querySelectorAll('button,a,span,div')].find((e) => rx.test(t(e)) && e.children.length <= 1);
    if (el) { (el as HTMLElement).click(); return t(el).slice(0, 44); }
    return null;
  }, re.source);
}

async function setById(page: Page, id: string, value: string): Promise<boolean> {
  return await page.evaluate((args) => {
    const el = document.getElementById(args.id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, args.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { id, value });
}

let testId = '';
let ladder: string[] = [];
let labNumber = '';

test('TC-CODED-1 — a dictionary-result test exists, is activated, and is orderable', async ({ page }) => {
  test.setTimeout(180000);
  await go(page, '/');

  const out: any = await page.evaluate(async (args: { api: string; name: string; code: string }) => {
    const { api, name, code } = args;
    const log: string[] = [];
    const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' };
    const g = async (u: string) => { const r = await fetch(api + u, { headers: { Accept: 'application/json' } }); return r.ok ? await r.json().catch(() => null) : null; };
    // The list projection decorates names with the sample type - strip a trailing parenthetical.
    const bare = (n: any) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const find = async () => {
      const l: any = await g('/test-catalog/tests?domain=CLINICAL&search=' + encodeURIComponent(name) + '&page=1&pageSize=50');
      const rows: any[] = (l && (l.rows || l.content)) || [];
      const m = rows.find((t: any) => bare(t.name) === name || String(t.code || '').toUpperCase() === code);
      return m ? String(m.testId || m.id) : '';
    };
    let id = await find();
    let created = false;
    if (!id) {
      // Build the ladder from whatever ordinal dictionary entries this instance actually has.
      const pick = async (q: string) => ((await g('/test-catalog/dictionary?search=' + encodeURIComponent(q))) || []) as any[];
      const wanted: any[] = [];
      for (const q of ['Negative', 'Trace', 'Positif (+)', 'Positif (++)', 'Positif (+++)']) {
        const hit = (await pick(q)).find((d: any) => String(d.name).trim() === q);
        if (hit) wanted.push(hit);
      }
      if (wanted.length < 3) { log.push('not enough ordinal dictionary entries on this instance: ' + wanted.length); return { log, testId: '', ladder: [] }; }
      const sts: any[] = (await g('/test-catalog/sample-types')) || [];
      const urine = sts.find((s: any) => /^\s*Urines?\s*$/i.test(String(s.name || '')));
      const units: any[] = (await g('/test-catalog/lab-units')) || [];
      if (!urine || !units.length) { log.push('missing urine sample type or lab unit'); return { log, testId: '', ladder: [] }; }
      const r = await fetch(api + '/test-catalog/tests', {
        method: 'POST', headers: H,
        body: JSON.stringify({ name, reportingName: name, code, domain: 'CLINICAL', sampleTypeIds: [String(urine.id)], labUnitId: String(units[0].id), orderable: true }),
      });
      const body = await r.text();
      log.push('create -> ' + r.status);
      try { id = String(JSON.parse(body).testId || ''); } catch (e) { /* logged */ }
      if (!id) id = await find();
      if (!id) { log.push('no testId'); return { log, testId: '', ladder: [] }; }
      created = true;
      const sr: any = await g('/test-catalog/tests/' + id + '/sample-results');
      const c = ((sr && sr.components) || [])[0];
      const put = await fetch(api + '/test-catalog/tests/' + id + '/sample-results', {
        method: 'PUT', headers: H,
        body: JSON.stringify({ testId: id, components: [{
          id: c ? c.id : undefined, code: 'PROT', label: 'Protein (dipstick)', displayOrder: 0,
          isPrimary: true, showOnReport: true, resultType: 'D',
          options: wanted.map((d: any, i: number) => ({ value: String(d.id), valueName: d.name, resultType: 'D', sortOrder: i + 1, normal: i === 0 })),
        }] }),
      });
      log.push('sample-results (D + ' + wanted.length + ' options) -> ' + put.status);
    } else log.push('reusing test ' + id);

    // Completeness must pass on the DICTIONARY rule, then activation must NOT need a range ack.
    const comp: any = await g('/test-catalog/tests/' + id + '/completeness');
    log.push('completeness complete=' + (comp && comp.complete) + ' missing=' + JSON.stringify((comp && comp.missing) || []));
    const act = await fetch(api + '/test-catalog/tests/' + id + '/activate', { method: 'POST', headers: H });
    log.push('activate -> ' + act.status + (created ? ' (first activation)' : ' (already active)'));

    const back: any = await g('/test-catalog/tests/' + id + '/sample-results');
    const bc = ((back && back.components) || [])[0];
    const sts2: any[] = (await g('/test-catalog/sample-types')) || [];
    const urine2 = sts2.find((s: any) => /^\s*Urines?\s*$/i.test(String(s.name || '')));
    const sttR = await fetch(api + '/sample-type-tests?sampleType=' + (urine2 ? urine2.id : 0), { headers: { Accept: 'application/json' } });
    const stt: any = await sttR.json().catch(() => null);
    return {
      log, testId: id,
      resultType: bc && bc.resultType,
      ladder: ((bc && bc.options) || []).map((o: any) => String(o.valueName || o.value)),
      activateStatus: act.status,
      sttStatus: sttR.status,
      orderable: (((stt && stt.tests) || []) as any[]).some((t: any) => String(t.name) === name),
    };
  }, { api: API, name: TEST_NAME, code: TEST_CODE });

  for (const l of out.log) console.log('[coded] ' + l);
  expect(out.testId, 'a dictionary-result test must exist').not.toBe('');
  expect(out.resultType, 'the primary component must be a dictionary result type').toBe('D');
  expect(out.ladder.length, 'the ladder must have at least three ordinal options').toBeGreaterThanOrEqual(3);
  // The point of the whole spec: dictionary tests do not hit the reference-range coverage gate.
  expect([200, 409]).toContain(out.activateStatus);
  expect(out.activateStatus, 'a dictionary test activates without a range acknowledgment (409 = it hit the coverage gate)').toBe(200);
  expect(out.sttStatus, 'the order-entry catalogue endpoint must not error for the urine sample type').toBe(200);
  expect(out.orderable, 'the activated dictionary test must be orderable for its sample type').toBe(true);

  testId = out.testId;
  ladder = out.ladder;
  console.log('[coded] ladder=' + JSON.stringify(ladder));
});

test('TC-CODED-2 — order it through the clinical wizard', async ({ page }, info) => {
  test.setTimeout(240000);
  test.skip(!testId, 'catalog step did not complete');
  await go(page, '/order/clinical/enter');

  // Lab number
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a,button,span,div')].find((e) => /^generate lab number$/i.test(((e.textContent) || '').trim()));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(1200);
    labNumber = await page.evaluate(() => (document.getElementById('labNumber') as HTMLInputElement | null)?.value || '');
    if (labNumber) break;
  }
  expect(labNumber, 'a lab number must be generated').not.toBe('');
  console.log('[coded] lab=' + labNumber);

  // Patient — New Patient tab. Filling the SEARCH fields creates nothing.
  await clickAddNew(page, /^New Patient$/);
  await page.waitForTimeout(1500);
  await setById(page, 'nationalId', 'NID-CODED-' + labNumber.slice(-6));
  await setById(page, 'lastName', 'Parker');
  await setById(page, 'firstName', 'Peter');
  // The DOB id is on a WRAPPING DIV; setting .value on it throws Illegal invocation.
  await page.evaluate(() => {
    const w = document.getElementById('date-picker-default-id');
    const inp = w ? w.querySelector('input') : null;
    if (inp) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(inp, '15/05/1990');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const l = document.querySelector('label[for="radio-1"]') as HTMLElement | null;
    if (l) l.click();
  });
  await page.waitForTimeout(1200);

  // Requester + organization — commit, do not merely type.
  await setById(page, 'siteName', 'QA_AUTO Requesting Org');
  await setById(page, 'providerName', 'Stark');
  await page.waitForTimeout(2200);
  const org = (await commitRow(page, /QA_AUTO Requesting Org/)) || (await clickAddNew(page, /^\+?\s*Add new organization/));
  await page.waitForTimeout(1600);
  const prov = (await commitRow(page, /Stark/)) || (await clickAddNew(page, /^\+?\s*Add new provider/));
  await page.waitForTimeout(1600);
  console.log('[coded] org=' + org + ' prov=' + prov);
  expect(org, 'the requesting organization must be committed (Select, or Add new on first use)').not.toBeNull();

  // Sample type + the coded test
  const picked = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const sel = document.getElementById('sampleType-0') as HTMLSelectElement | null;
    if (!sel) return null;
    const o = [...sel.options].find((x) => rx.test((x.textContent || '').trim()));
    if (!o) return null;
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(sel, o.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return (o.textContent || '').trim();
  }, URINE_PREFER.source);
  expect(picked, 'the urine sample type must be offered').not.toBeNull();
  await page.waitForTimeout(2200);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /tests\s*&\s*panels|choose available/i.test(((x.textContent) || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(1800);
  const ticked = await page.evaluate((name) => {
    const l = [...document.querySelectorAll('label')].find((x) => ((x.textContent) || '').trim() === name);
    if (l) { (l as HTMLElement).click(); return true; }
    return false;
  }, TEST_NAME);
  expect(ticked, 'the coded test must be tickable on the order form').toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, info, 'Coded test ordered', { fullPage: false });

  // The button, not the step counter, is the gate.
  const enabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /save\s*&\s*next/i.test(((x.textContent) || '').trim()));
    return b ? !(b as HTMLButtonElement).disabled : false;
  });
  expect(enabled, 'Save & Next must be enabled once site + requester are committed').toBe(true);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const t = (e: Element) => ((e.textContent) || '').trim();
      const b = [...document.querySelectorAll('button')].find((x) => /save\s*&\s*next|save and next|^submit$/i.test(t(x)) && !(x as HTMLButtonElement).disabled);
      if (b) (b as HTMLElement).click();
    });
    await page.waitForTimeout(4200);
    await page.evaluate(() => {
      const t = (e: Element) => ((e.textContent) || '').trim();
      const p = [...document.querySelectorAll('button')].find((x) => /print all labels|print labels/i.test(t(x)));
      if (p) (p as HTMLElement).click();
      for (const re of [/skip storage|skip this step|no storage/i, /sampling site information is correct/i, /sample types and tests are correct/i, /labels have been printed/i, /storage locations have been assigned/i, /patient has provided signed consent/i]) {
        const l = [...document.querySelectorAll('label')].find((x) => re.test(t(x)));
        if (l) (l as HTMLElement).click();
      }
    });
    await page.waitForTimeout(1200);
  }
  await shot(page, info, 'Coded order submitted', { fullPage: false });

  // Server-side read-back. A client-side write log is NOT evidence: the SPA restores window.fetch.
  const persisted = await page.evaluate(async (args: { api: string; lab: string; name: string }) => {
    const r = await fetch(args.api + '/order/search?labNumber=' + args.lab, { headers: { Accept: 'application/json' } });
    const b = await r.text();
    return { status: r.status, hasTest: b.indexOf(args.name) >= 0 };
  }, { api: API, lab: labNumber, name: TEST_NAME });
  console.log('[coded] persisted=' + JSON.stringify(persisted));
  expect(persisted.status, 'the order must be readable back').toBe(200);
  expect(persisted.hasTest, 'the persisted order must carry the coded test').toBe(true);
  await saveWalkthrough(page, info);
});

test('TC-CODED-3 — results entry offers the ladder as a SELECT, and the value validates', async ({ page }, info) => {
  test.setTimeout(240000);
  test.skip(!labNumber, 'order step did not complete');

  // /Results has ONE search box that fires on Enter. There is no Search button.
  await go(page, '/Results');
  const search = async (lab: string) => {
    await page.evaluate((l) => {
      const el = document.getElementById('unifiedResultsSearch') as HTMLInputElement;
      const set = (v: string) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(''); set(l);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 } as any));
    }, lab);
    await page.waitForTimeout(4000);
  };
  await search(labNumber);

  const control = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => /^unifiedResultValue-.*-primary$/.test(s.id || ''));
    const inp = [...document.querySelectorAll('input')].find((i) => /^unifiedResultValue-.*-primary$/.test(i.id || ''));
    return {
      kind: sel ? 'select' : (inp ? 'input' : 'none'),
      id: sel ? sel.id : (inp ? inp.id : ''),
      options: sel ? [...sel.options].map((o) => (o.textContent || '').trim()).filter(Boolean) : [],
    };
  });
  console.log('[coded] results control=' + JSON.stringify(control));
  // THE assertion this spec exists for.
  expect(control.kind, 'a dictionary result must render as a <select>, not a numeric input').toBe('select');
  for (const want of LADDER_PREFER) {
    if (ladder.includes(want)) expect(control.options, 'the ladder must be offered at results entry').toContain(want);
  }
  await shot(page, info, 'Coded result — ladder offered', { fullPage: false });

  // Pick the LAST option so the stored value is unambiguous, then save.
  const chosen = await page.evaluate((id) => {
    const sel = document.getElementById(id) as HTMLSelectElement;
    const opts = [...sel.options].filter((o) => o.value && (o.textContent || '').trim());
    const o = opts[opts.length - 1];
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(sel, o.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return (o.textContent || '').trim();
  }, control.id);
  console.log('[coded] chose ' + chosen);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^save$/i.test(((x.textContent) || '').trim()) && !(x as HTMLButtonElement).disabled);
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(5000);

  await search(labNumber);
  const afterSave = await page.evaluate((lab) => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const i = t.indexOf(lab);
    return i >= 0 ? t.slice(i, i + 260) : 'NOT FOUND';
  }, labNumber);
  console.log('[coded] afterSave=' + txtOf(afterSave));
  expect(afterSave, 'the saved coded value must be shown on the row').toContain(chosen);

  // Validation. NOTE: Validate performs a FULL page navigation, so nothing injected survives it.
  await go(page, '/AccessionValidation');
  await setById(page, 'accessionNumber', labNumber);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^search$/i.test(((x.textContent) || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(4200);
  const queued = await page.evaluate((n) => document.body.innerText.indexOf(n) >= 0, TEST_NAME);
  expect(queued, 'the saved result must appear in the validation queue').toBe(true);
  await page.evaluate(() => {
    const cb = document.getElementById('resultList0.isAccepted');
    if (cb) {
      const l = (document.querySelector('label[for="resultList0.isAccepted"]') as HTMLElement | null) || (cb.closest('label') as HTMLElement | null);
      (l || (cb as HTMLElement)).click();
    }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^validate$/i.test(((x.textContent) || '').trim()) && !(x as HTMLButtonElement).disabled);
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(6000);
  await shot(page, info, 'Coded result — after validation', { fullPage: false });

  await go(page, '/Results');
  await search(labNumber);
  const finalRow = await page.evaluate((lab) => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const i = t.indexOf(lab);
    return i >= 0 ? t.slice(i, i + 260) : 'NOT FOUND';
  }, labNumber);
  console.log('[coded] final=' + txtOf(finalRow));
  expect(finalRow, 'the coded result must reach a final state after validation').toMatch(/Results final|Finalized/i);
  expect(finalRow, 'the coded value must survive validation').toContain(chosen);
  await saveWalkthrough(page, info);
});
