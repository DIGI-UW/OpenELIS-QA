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
  } catch (e) {
    log.push(`chain seed aborted: ${(e as Error).message}`);
  }

  console.log(['CHAIN FIXTURE SEED', `  target ${BASE}`, ...log.map((l) => `  ${l}`)].join('\n'));
});
