// Harness preflight. No network, no browser, no auth: it reads the repo and
// grades the harness against mistakes that have actually cost runs.
//
// Deliberately has NO storageState and NO setup project, so it still runs in a
// checkout where authentication is exactly what is broken.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /preflight[.]spec[.]ts/,
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [['line']],
});
