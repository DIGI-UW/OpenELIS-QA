/**
 * chain-seed.setup.ts — the fixtures the regression chains actually name.
 *
 * WHY THIS EXISTS
 * `regression-chains.config.ts` depended on `setup` (auth) and nothing else. On the
 * shared testing instance that was survivable, because somebody else's data happened to
 * be lying around. On the develop-stack nightly it is not: every shard boots its OWN
 * ephemeral stack, and the config that runs the bulk seed (`regression-seed.config.ts`)
 * lives in a different shard, against a different stack. So the chains ran against an
 * empty instance every single night, and reported it honestly:
 *
 *   [Chain L · Step 1 · FAIL]  No QA_AUTO_ patient — run --project=seed-data first
 *   [Chain P · Step 1 · GAP ]  Need 2 patients to preview a merge, found 0
 *   [Chain S · Step 1 · GAP ]  No accession available to aliquot (No orders exist …)
 *   [Chain U · Step 1 · GAP ]  No accession to print labels for (No orders exist …)
 *
 * Those are not product findings. They are the declared-gap machinery working exactly as
 * designed and telling us the instance was bare.
 *
 * WHY NOT JUST DEPEND ON seed-data.setup.ts
 * Because it targets 50 patients and 100 orders with a 30-minute timeout, and on a fresh
 * ephemeral stack it would create all of them before a single chain ran. The chains do
 * not need a populated lab; they need "at least two patients and at least one order".
 * This seeds that floor and stops. `seed-data` stays what it is: the tool for filling an
 * instance you intend to explore by hand.
 *
 * WHAT IT GUARANTEES, and nothing more:
 *   - at least 2 patients whose last name starts with QA-AUTO
 *   - at least 1 order, on one of them, with an accession the chains can discover
 *
 * ONE MISMATCH WORTH KNOWING ABOUT. Chain L searches `lastName=QA_AUTO`, with an
 * UNDERSCORE, while every seeder writes `QA-AUTO-…` with a hyphen — `helpers/seed-config.ts`
 * says why: name validation rejects `_`. The search survives today only because the
 * backend's LIKE treats `_` as a single-character wildcard, so `QA_AUTO` happens to match
 * `QA-AUTO`. That is luck, not design. If Chain L ever starts failing to find a patient
 * this seeder demonstrably created, that accident is the first place to look.
 *
 * NON-FATAL, same contract as `data.setup.ts`: Playwright SKIPS every project whose
 * dependency failed, so a throw here would take all 26 chains with it and call it green.
 * Everything is caught and logged; the chains then degrade honestly through their own
 * declared-gap register, which is the behaviour this file exists to make unnecessary.
 */
import { test as setup } from '@playwright/test';
import { BASE } from './helpers/base-url';
import { createPatientViaAPI, findPatientIdsByLastName, seedOrder } from './helpers/data-factory';

/** Hyphenated, because patient name validation rejects underscores. */
const CHAIN_PATIENT_LAST = 'QA-AUTO-Chain';
const WANT_PATIENTS = 2;

setup('seed the floor the regression chains need', async ({ page }) => {
  setup.setTimeout(Number(process.env.PW_SETUP_TIMEOUT ?? 180_000));
  const log: string[] = [];

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // ---- patients ----------------------------------------------------------
    let existing = await findPatientIdsByLastName(page, CHAIN_PATIENT_LAST);
    log.push(`patients matching ${CHAIN_PATIENT_LAST}: ${existing.length}`);

    for (let i = existing.length; i < WANT_PATIENTS; i++) {
      const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      // nationalId is validated server-side against ^[-a-z0-9/]*$ — lowercase, hyphen,
      // slash; no underscore and no capitals. seed-config.ts learned this the hard way.
      const made = await createPatientViaAPI(page, {
        nationalId: `qa-auto-chain-${stamp}`,
        firstName: i === 0 ? 'Alpha' : 'Beta',
        lastName: CHAIN_PATIENT_LAST,
        gender: i === 0 ? 'F' : 'M',
        dateOfBirth: '01/01/1990',
      });
      log.push(made.id ? `created patient ${made.id}` : `patient create FAILED: ${made.detail}`);
    }

    existing = await findPatientIdsByLastName(page, CHAIN_PATIENT_LAST);
    if (existing.length < WANT_PATIENTS) {
      log.push(
        `WARNING: only ${existing.length}/${WANT_PATIENTS} chain patients exist. Chain P ` +
          `(merge preview) needs two and will record a GAP.`
      );
    }

    // ---- one order ---------------------------------------------------------
    // `acquireAnyAccession` in tests/chains/_common.ts will find ANY order, so one is
    // enough for Chains S and U. seedOrder makes its own patient, which also tops up the
    // count Chain P reads.
    try {
      const order = await seedOrder(page, 'CHAIN');
      log.push(`seeded order ${order.accession}`);
    } catch (e) {
      log.push(`order seed FAILED: ${(e as Error).message}`);
    }
    // ---- one calculation rule ----------------------------------------------
    // Chain D reads /rest/test-calculations and fails outright when the list is
    // empty. On 2026-09-19 it found rule id=1; on 2026-09-20 the same read
    // returned []. The controller does no filtering (getAll(), no role or unit
    // scope), so an empty list means the table really was empty — the chain was
    // depending on rules somebody else happened to leave behind.
    //
    // The recipe below is the one from tests/docs/seed-calc.docs.spec.ts, which
    // is live-proven, not inferred. Its two hard-won constraints:
    //   * a test may hold only ONE role across the whole calc+reflex system, and
    //     a DEACTIVATED rule still occupies it (there is no API delete), so every
    //     test already named by a calc or reflex rule is tainted and unusable;
    //   * operand and target must be numeric (resultType "N") and must belong to
    //     the calc's own sample type — test-display-beans leaks tests orderable on
    //     other types, and the parenthetical in the name is what disambiguates.
    // Because base-dataset linkages are invisible over REST, no candidate can be
    // known-good in advance: the server is the oracle, and a failed create rolls
    // back whole (the save is @Transactional), so trying combinations is safe.
    try {
      log.push(...(await seedChainCalcRule(page)));
    } catch (e) {
      log.push(`calc rule seed FAILED: ${(e as Error).message}`);
    }
    // ---- one reflex rule ----------------------------------------------------
    // Chain C Step 2 fails outright when /rest/reflexrules is empty. A fresh or
    // reset instance ships none (2026-09-26 reset: []). Seeded after the calc rule
    // because both draw on the same pool of untainted numeric tests.
    try {
      log.push(...(await seedChainReflexRule(page)));
    } catch (e) {
      log.push(`reflex rule seed FAILED: ${(e as Error).message}`);
    }
    // ---- one active compliance standard -------------------------------------
    // Chains AB (Step 1) and Y (Step 2) read /rest/compliance/standards/active and
    // record a GAP when it is empty, which it is on every reset instance.
    try {
      log.push(...(await seedComplianceStandard(page)));
    } catch (e) {
      log.push(`compliance standard seed FAILED: ${(e as Error).message}`);
    }
  } catch (e) {
    log.push(`chain seed aborted: ${(e as Error).message}`);
  }

  console.log(['CHAIN FIXTURE SEED', `  target ${BASE}`, ...log.map((l) => `  ${l}`)].join('\n'));
});

/**
 * Guarantee at least one ACTIVE calculation rule with a TEST_RESULT operand, which
 * is precisely what Chain D Step 1 looks for. Returns log lines; never throws.
 */
async function seedChainCalcRule(page: import('@playwright/test').Page): Promise<string[]> {
  const out: string[] = [];
  const P = '/api/OpenELIS-Global';
  const getJson = async <T>(path: string): Promise<T | null> => {
    const r = await page.request.get(`${P}${path}`);
    return r.ok() ? ((await r.json().catch(() => null)) as T) : null;
  };

  interface Calc { id?: number; name?: string; active?: boolean; testId?: number;
    operations?: Array<{ type?: string; value?: string }>; }
  const calcs = (await getJson<Calc[]>('/rest/test-calculations')) || [];
  const usable = calcs.find(c => c.active !== false
    && (c.operations || []).some(o => o.type === 'TEST_RESULT' && o.value));
  if (usable) {
    out.push(`calc rules: ${calcs.length}, at least one usable (id=${usable.id} "${usable.name}") — not seeding`);
    return out;
  }

  // Taint: every test already named by a calc or a reflex rule is spoken for.
  interface Reflex { conditions?: Array<{ testId?: number }>; actions?: Array<{ reflexTestId?: number }>; }
  const reflexes = (await getJson<Reflex[]>('/rest/reflexrules')) || [];
  const taint = new Set<string>();
  for (const c of calcs) {
    if (c.testId != null) taint.add(String(c.testId));
    for (const o of c.operations || []) if (o.type === 'TEST_RESULT' && o.value != null) taint.add(String(o.value));
  }
  for (const r of reflexes) {
    for (const c of r.conditions || []) if (c.testId != null) taint.add(String(c.testId));
    for (const a of r.actions || []) if (a.reflexTestId != null) taint.add(String(a.reflexTestId));
  }

  interface IdValue { id?: string; value?: string }
  interface Bean { id?: string; value?: string; resultType?: string }
  const sampleTypes = (await getJson<IdValue[]>('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const pools: Array<{ st: IdValue; tests: Bean[] }> = [];
  for (const st of sampleTypes) {
    const beans = (await getJson<Bean[]>(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const fit = beans.filter(b => String(b.resultType) === 'N'
      && !taint.has(String(b.id))
      && String(b.value || '').includes(`(${st.value})`));
    if (fit.length >= 2) pools.push({ st, tests: fit });
  }
  if (!pools.length) {
    out.push('calc rule seed: no sample type has two untainted numeric tests — Chain D will report the gap');
    return out;
  }

  const post = async (calc: unknown) => page.evaluate(async ({ base, body }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch(`${base}/rest/test-calculation`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
  }, { base: P, body: calc });

  // The server is the oracle: try combinations until one is accepted.
  let attempts = 0;
  for (const pool of pools) {
    for (let t = 0; t < pool.tests.length && attempts < 12; t++) {
      for (let o = 0; o < pool.tests.length && attempts < 12; o++) {
        if (t === o) continue;
        attempts++;
        const target = pool.tests[t];
        const operand = pool.tests[o];
        const res = await post({
          name: `QA-AUTO Chain D Calc ${Date.now() % 100000}`,
          sampleId: Number(pool.st.id), testId: Number(target.id),
          result: '', note: 'Seeded by chain-seed.setup.ts so Chain D always has a rule.',
          toggled: true, active: true,
          operations: [
            { id: null, order: 0, type: 'TEST_RESULT', value: String(operand.id), sampleId: Number(pool.st.id) },
            { id: null, order: 1, type: 'MATH_FUNCTION', value: '*' },
            { id: null, order: 2, type: 'INTEGER', value: '2' },
          ],
        });
        if (res.ok) {
          // Read back on the list the chain itself reads, not on the POST's status.
          const after = (await getJson<Calc[]>('/rest/test-calculations')) || [];
          const ok = after.some(c => c.active !== false
            && (c.operations || []).some(x => x.type === 'TEST_RESULT' && x.value));
          out.push(ok
            ? `seeded calc rule: ${operand.value} * 2 -> ${target.value} on ${pool.st.value} (${after.length} rule(s) now)`
            : `calc rule POST accepted but the list still has no usable rule (${after.length} row(s))`);
          return out;
        }
      }
    }
  }
  out.push(`calc rule seed: ${attempts} combination(s) all refused — every candidate is spoken for by a base linkage`);
  return out;
}

/** CSRF-aware JSON POST from the page context. Never throws. */
async function postJson(page: import('@playwright/test').Page, path: string, body: unknown) {
  return page.evaluate(async ({ url, payload }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    try {
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      return { ok: r.ok, status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, text: String(e) };
    }
  }, { url: `/api/OpenELIS-Global${path}`, payload: body });
}

/**
 * Guarantee at least one ACTIVE reflex rule (Chain C Step 2). The payload is the one the
 * admin Reflex Tests Management screen posts (captured 2026-09-27 on testing, 3.2.3.0):
 * one numeric condition (component id from test-display-beans) and one "add test"
 * action on the same sample type. Same taint rule as the calc seed: a test may hold one
 * role across calc + reflex, so only untainted numeric tests are candidates, and the
 * server is the oracle for which pair it accepts. Returns log lines; never throws.
 */
async function seedChainReflexRule(page: import('@playwright/test').Page): Promise<string[]> {
  const out: string[] = [];
  const P = '/api/OpenELIS-Global';
  const getJson = async <T>(path: string): Promise<T | null> => {
    const r = await page.request.get(`${P}${path}`);
    return r.ok() ? ((await r.json().catch(() => null)) as T) : null;
  };
  interface Reflex { active?: boolean; conditions?: Array<{ testId?: string | number }>;
    actions?: Array<{ reflexTestId?: string | number }>; }
  const reflexes = (await getJson<Reflex[]>('/rest/reflexrules')) || [];
  if (reflexes.some(r => r.active !== false)) {
    out.push(`reflex rules: ${reflexes.length}, at least one active — not seeding`);
    return out;
  }
  interface Calc { testId?: number; operations?: Array<{ type?: string; value?: string }> }
  const calcs = (await getJson<Calc[]>('/rest/test-calculations')) || [];
  const taint = new Set<string>();
  for (const c of calcs) {
    if (c.testId != null) taint.add(String(c.testId));
    for (const o of c.operations || []) if (o.type === 'TEST_RESULT' && o.value != null) taint.add(String(o.value));
  }
  for (const r of reflexes) {
    for (const c of r.conditions || []) if (c.testId != null) taint.add(String(c.testId));
    for (const a of r.actions || []) if (a.reflexTestId != null) taint.add(String(a.reflexTestId));
  }
  interface IdValue { id?: string; value?: string }
  interface Bean { id?: string; value?: string; resultType?: string; components?: Array<{ id?: string }> }
  // Serum/Plasma first: on 2026-09-27 every Whole Blood pair was refused with HTTP 500,
  // while a Serum pair (Amylase -> Glucose) was accepted from the admin screen.
  const allTypes = (await getJson<IdValue[]>('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const rank = (v?: string) => (/serum|plasma/i.test(String(v)) ? 0 : /urine|fluid/i.test(String(v)) ? 1 : 2);
  const sampleTypes = [...allTypes].sort((a, b) => rank(a.value) - rank(b.value));
  let tried = 0;
  for (const st of sampleTypes) {
    const beans = (await getJson<Bean[]>(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const fit = beans.filter(b => String(b.resultType) === 'N' && !taint.has(String(b.id))
      && String(b.value || '').includes(`(${st.value})`) && b.components?.[0]?.id);
    // At most two pairs per sample type, sixteen in all, so one tainted type cannot use
    // up the whole budget.
    for (let i = 0, perType = 0; i + 1 < fit.length && perType < 2 && tried < 16; i += 2, perType++) {
      const cond = fit[i];
      const act = fit[i + 1];
      tried++;
      const rule = {
        id: null, ruleName: `QA_AUTO reflex ${cond.value} -> ${act.value}`, overall: 'ANY',
        toggled: true, active: true, analyteId: null,
        conditions: [{ id: null, sampleId: String(st.id), testName: '', testId: String(cond.id),
          relation: 'GREATER_THAN', value: '1000000', value2: '0', testAnalyteId: null,
          componentId: cond.components?.[0]?.id ?? null }],
        actions: [{ id: null, sampleId: String(st.id), reflexTestName: '', reflexTestId: String(act.id),
          internalNote: '', externalNote: '', addNotification: 'N', testReflexId: null }],
      };
      const r = await postJson(page, '/rest/reflexrule', rule);
      const after = (await getJson<Reflex[]>('/rest/reflexrules')) || [];
      if (r.ok && after.length > reflexes.length) {
        out.push(`seeded reflex rule: ${cond.value} > 1000000 adds ${act.value} (${after.length} rule(s) now)`);
        return out;
      }
      out.push(`reflex rule candidate ${cond.value} -> ${act.value} refused: HTTP ${r.status} ${r.text}`);
    }
  }
  out.push('reflex rule seed: no candidate pair accepted — Chain C will report the gap');
  return out;
}

/**
 * Guarantee at least one ACTIVE compliance standard (Chains AB Step 1, Y Step 2). Payload
 * mirrors what Admin > Test Management > Compliance Standards Administration saves.
 * The effective date is sent as an ISO date, not a Date, so the UTC+N off-by-one the
 * UI has (it saved 2026-01-01 as 2025-12-31 from UTC+10) cannot bite here.
 */
async function seedComplianceStandard(page: import('@playwright/test').Page): Promise<string[]> {
  const out: string[] = [];
  const P = '/api/OpenELIS-Global';
  const getJson = async <T>(path: string): Promise<T | null> => {
    const r = await page.request.get(`${P}${path}`);
    return r.ok() ? ((await r.json().catch(() => null)) as T) : null;
  };
  const active = (await getJson<unknown[]>('/rest/compliance/standards/active')) || [];
  if (Array.isArray(active) && active.length) {
    out.push(`compliance standards: ${active.length} active — not seeding`);
    return out;
  }
  interface IdValue { id?: string; value?: string }
  const sampleTypes = (await getJson<IdValue[]>('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const st = sampleTypes.find(s => /water|fluid/i.test(String(s.value))) || sampleTypes[0];
  const body = {
    name: 'QA_AUTO Compliance Standard', issuingBody: 'QA_AUTO Ministry', regulationNumber: 'QA-AUTO-1',
    version: '2026', effectiveDate: '2026-01-01', expiryDate: null, countryRegion: 'QA_AUTO Region',
    description: 'Seeded by chain-seed.setup.ts for Chains AB and Y.',
    sampleTypes: st?.value ? [st.value] : [], status: 'ACTIVE',
  };
  const r = await postJson(page, '/rest/compliance/standards', body);
  const after = (await getJson<unknown[]>('/rest/compliance/standards/active')) || [];
  out.push(r.ok && after.length
    ? `seeded compliance standard (${after.length} active now)`
    : `compliance standard seed refused: HTTP ${r.status} ${r.text}`);
  return out;
}
