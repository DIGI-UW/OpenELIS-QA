import { defineConfig, devices } from '@playwright/test';
// Full regression: all 12 chains, each as its own project so a hang in one doesn't mask the rest.
// Auth is a dependency (not a stale saved state) — see the 2026-08-05 stale-auth finding.
const BASE = process.env.BASE || 'https://34.212.225.107';
const CHAINS = ['a','b','c','d','e','f','g','h','i','j','k','l'];
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
    ...CHAINS.map(c => ({
      name: `chain-${c}`,
      testDir: './tests/chains',
      testMatch: new RegExp(`chain-${c}-.*\\.spec\\.ts`),
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    })),
  ],
});
