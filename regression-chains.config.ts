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
const BASE = process.env.BASE || 'https://34.212.225.107';

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
  reporter: [['list'], ['json', { outputFile: 'regression-results/chains.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    ...CHAINS.map((c) => ({
      name: `chain-${c}`,
      testDir: CHAIN_DIR,
      testMatch: new RegExp(`chain-${c}-.*\\.spec\\.ts`),
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    })),
  ],
});
