/**
 * referral-seed.setup.ts — reference-lab referral fixtures for the module sweep.
 *
 * Runs after `data.setup.ts` (it reuses that setup's baseline patient, Abby Sebby) and
 * before the specs. See `helpers/referral-seed.ts` for what it creates, by what
 * mechanism, and — importantly — which referral states are NOT reachable on a single
 * instance and why that is a finding rather than a gap in the fixture.
 *
 * THIS SETUP MUST NOT FAIL THE RUN, for exactly the reasons `data.setup.ts` spells out
 * at length: `modules.config.ts` declares it as a dependency of the module sweep and
 * Playwright SKIPS every project whose dependency failed, so a broken fixture here
 * would silently take 800-odd tests with it. Two mechanisms, because one is not enough:
 *
 *   - everything is caught and logged loudly rather than thrown; and
 *   - the work races its OWN deadline, comfortably inside the project timeout, because
 *     a Playwright TEST TIMEOUT aborts from the outside and never runs the catch. That
 *     is not hypothetical — it is what happened to data.setup.ts on 2026-09-12 and took
 *     43 spec files with it.
 *
 * The referral specs degrade honestly without it: each states its missing precondition
 * and fails with the reason, rather than passing on an empty page.
 */

import { test as setup } from '@playwright/test';
import { BASE } from './helpers/base-url';
import { runReferralSeed, formatReferralSeedSummary } from './helpers/referral-seed';

setup('seed reference-lab referral fixtures', async ({ page }) => {
  const DEADLINE_MS = Number(process.env.REFERRAL_SEED_DEADLINE_MS ?? 90_000);
  setup.setTimeout(DEADLINE_MS + 60_000);

  try {
    let timer: NodeJS.Timeout | undefined;
    try {
      const state = await Promise.race([
        runReferralSeed(page),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`referral seed exceeded its ${DEADLINE_MS}ms deadline against ${BASE}`)),
            DEADLINE_MS
          );
        }),
      ]);
      // eslint-disable-next-line no-console
      console.log('\n' + formatReferralSeedSummary(state) + '\n');
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    // eslint-disable-next-line no-console
    console.log('║  REFERRAL SEED FAILED — referral specs will report why       ║');
    // eslint-disable-next-line no-console
    console.log('╚══════════════════════════════════════════════════════════════╝');
    // eslint-disable-next-line no-console
    console.log(String(e).split('\n').slice(0, 4).join('\n'));
    // eslint-disable-next-line no-console
    console.log(`Target was ${BASE}.\n`);
  }
});
