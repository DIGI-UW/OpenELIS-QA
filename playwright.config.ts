/**
 * OpenELIS Global QA — Playwright Configuration
 *
 * Follows the repo's playwright.config.ts pattern:
 * - Allowlist-based project organization with explicit testMatch
 * - Authentication setup project as dependency
 * - Cached session via storageState
 * - Configurable via environment variables
 *
 * Run: npx playwright test --config=playwright.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://testing.openelis-global.org';

export default defineConfig({
  // Test directory
  testDir: './tests',

  // Execution
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,

  // Timeouts
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  // Reporting
  reporter: process.env.CI ? 'blob' : 'html',

  // Shared settings
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: process.env.PLAYWRIGHT_VIDEO === 'on' ? 'on' : 'off',
  },

  // -------------------------------------------------------------------------
  // Projects — allowlist-based with explicit testMatch
  // -------------------------------------------------------------------------
  projects: [
    // --- Setup: authenticate once, cache to .auth/user.json ---
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
    },

    // --- Core QA: all test suites using cached auth ---
    {
      name: 'qa-dashboard',
      testMatch: 'dashboard.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-order-entry',
      testMatch: 'order-entry.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-edit-order',
      testMatch: 'edit-order.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-results',
      testMatch: 'results-entry.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-validation',
      testMatch: 'validation.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-admin',
      testMatch: 'admin-config.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-patient',
      testMatch: 'patient-management.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-referral',
      testMatch: 'referral-workflow.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-pathology',
      testMatch: 'pathology.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-reports',
      testMatch: 'reports.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-workplan',
      testMatch: 'workplan.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-non-conforming',
      testMatch: 'non-conforming.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-i18n',
      testMatch: 'i18n.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-accessibility',
      testMatch: 'accessibility.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-performance',
      testMatch: 'performance.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Electronic Signature workflow (Site Information config + validation signing) ---
    {
      name: 'qa-electronic-signature',
      testMatch: 'electronic-signature.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- EQA workflow (Program management, Distributions, Results) ---
    {
      name: 'qa-eqa-workflow',
      testMatch: 'eqa-workflow.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Monolithic spec (current, for backward compat) ---
    {
      name: 'qa-full',
      testMatch: 'openelis-e2e.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
  ],
});
