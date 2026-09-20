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
