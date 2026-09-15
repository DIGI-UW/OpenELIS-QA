import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Full regression: every chain spec gets its own project so a hang in one does not mask the rest.
// Auth is a dependency (not a stale saved state) — see the 2026-08-05 stale-auth finding.
//
// 2026-08-14: CHAINS used to be a hardcoded ['a'..'l']. There are 26 chain specs on disk
// (a, ab, b..u, w..z). Chains m..z and ab therefore belonged to NO project: Playwright still
// loaded them and reported them as "did not run" — that is how 33 tests vanished from the
// 2026-08-14 run with no error. Same silent-partial-run shape as probes.config.ts matching six
// specs when only two were committed. Derive the list from disk so a new chain spec cannot be
// added and then quietly ignored.
//
// Resolve the chain dir relative to THIS FILE, not process.cwd(): Playwright may load the config
// from a different working directory, and a cwd-relative readdirSync silently yields zero specs,
// which would reintroduce exactly the bug this change removes.
// Default target. Was 'https://34.212.225.107' — a stale IP instance — until
// 2026-09-05: the nightly always sets BASE, so the wrong default only ever bit
// someone running this locally, silently against another server. Every other
// config in the repo defaults to testing.
const BASE = process.env.BASE || process.env.BASE_URL || 'https://testing.openelis-global.org';

const CHAIN_DIR = path.resolve(__dirname, 'tests/chains');
const CHAINS = Array.from(
  new Set(
    fs
      .readdirSync(CHAIN_DIR)
      .map((f) => /^chain-([a-z]+)-.*\.spec\.ts$/.exec(f))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => m[1]),
  ),
).sort();

if (!CHAINS.length) throw new Error(`regression-chains.config.ts: no chain specs found in ${CHAIN_DIR}`);
// eslint-disable-next-line no-console
console.log(`[regression-chains] ${CHAINS.length} chains: ${CHAINS.join(', ')}`);

export default defineConfig({
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,              // §10.9 keep the 6-connection pool calm
  retries: 1,
  reporter: [['list'], ['json', { outputFile: 'regression-results/chains.json' }], ['./tests/helpers/session-guard-reporter.ts']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    // FIXTURES. Until 2026-09-15 this config depended on `setup` and nothing else, and on
    // the develop-stack nightly that meant the chains ran against a BARE instance every
    // night: each shard boots its own ephemeral stack, and the config that seeds
    // (`regression-seed.config.ts`) lives in a different shard against a different stack.
    // Ten-odd chains dutifully recorded "no orders exist", "found 0 patients", "no
    // REFERRAL_ORGANIZATIONS" — all true, none of them product findings.
    //
    // Three setups, cheapest first, each non-fatal by its own contract:
    //   data          the baseline patient (Abby Sebby) and two orders
    //   chain-fixtures  >= 2 QA-AUTO patients and >= 1 order, the floor Chains L/P/S/U name
    //   referral-data  three reference labs and five referrals, for Chains O and R
    {
      name: 'data',
      testDir: '.',
      testMatch: /(^|\/)data\.setup\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 120_000),
      retries: 0,
    },
    {
      name: 'chain-fixtures',
      testDir: '.',
      testMatch: /(^|\/)chain-seed\.setup\.ts$/,
      dependencies: ['setup', 'data'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 180_000),
      retries: 0,
    },
    {
      name: 'referral-data',
      testDir: '.',
      testMatch: /(^|\/)referral-seed\.setup\.ts$/,
      dependencies: ['setup', 'data'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 150_000),
      retries: 0,
    },
    ...CHAINS.map((c) => ({
      name: `chain-${c}`,
      testDir: CHAIN_DIR,
      testMatch: new RegExp(`chain-${c}-.*\\.spec\\.ts`),
      dependencies: ['setup', 'data', 'chain-fixtures', 'referral-data'],
      use: { storageState: '.auth/user.json' },
    })),
  ],
});
