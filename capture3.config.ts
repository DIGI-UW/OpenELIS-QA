import { defineConfig, devices } from '@playwright/test';
// One-off diagnostic config for capture-topsave.spec.ts. Same auth pattern as guards.config.ts:
// a `setup` project logs in once and saves storageState, which the probe project then loads.
const BASE = process.env.BASE ?? 'https://34.212.225.107';

export default defineConfig({
  testDir: '.',
  timeout: 150000,
  expect: { timeout: 15000 },
  reporter: [['line']],
  workers: 1,
  retries: 0,
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'probe',
      testMatch: /capture-topsave\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
