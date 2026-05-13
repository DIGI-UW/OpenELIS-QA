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
    // --- Step 1: Authenticate once, cache session to .auth/user.json ---
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
    },

    // --- Step 2: Create baseline test data (patient + orders) ---
    // Runs after auth so it can use the cached session.
    // Writes created accession numbers to .auth/test-data.json.
    // Every QA spec project depends on this so data is guaranteed present.
    {
      name: 'data-setup',
      testMatch: 'data.setup.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    // --- Optional bulk seed (Phase E1) — opt-in via --project=seed-data ---
    // Runs after auth, NOT a default dependency of qa-* projects.
    // Invoke when SKILL §0.6 Data Census returns zero, or to populate a
    // fresh instance with QA_AUTO_-prefixed patients and orders.
    // Reads SEED_DRY_RUN, SEED_VERIFY_ONLY, SEED_TARGET_PATIENTS,
    // SEED_TARGET_ORDERS environment variables. See SKILL §0.6a.
    {
      name: 'seed-data',
      testMatch: 'seed-data.setup.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    // --- Chain A: Order Lifecycle (Phase B1) — opt-in via --project=chain-a ---
    // Eight-step end-to-end spec per SKILL §11. Validates the full forward
    // path from Add Order through FHIR Observation. Requires QA_AUTO_ data
    // (run --project=seed-data first if instance is empty). FAIL at Step 2
    // is the canonical BUG-37 catch — expected until that bug is fixed.
    {
      name: 'chain-a',
      testMatch: 'tests/chains/chain-a-order-lifecycle.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Chain B: Rejection → NCE → Report (Phase B2) ---
    // Eight-step end-to-end spec per SKILL §11. Each of the four
    // BUG-29 symptoms (qa_event creation gap, View NCE empty,
    // Rejection Report PDF 503, Dashboard counter stuck) maps to a
    // distinct step + expect() so partial fixes surface clearly.
    // Expected to FAIL on the current testing instance — that is the
    // point. Currently chains B's failure is documented as the catch
    // for OGC-515 / BUG-29 (rejection silo).
    {
      name: 'chain-b',
      testMatch: 'tests/chains/chain-b-rejection.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Chain C: Reflex Trigger (Phase B3) ---
    // Six-step end-to-end. API-substituted per §11.5 (BUG-31). Step 5
    // is the definitive engine-fired check: does a reflex rule actually
    // produce its target test when the trigger result is entered?
    {
      name: 'chain-c',
      testMatch: 'tests/chains/chain-c-reflex-trigger.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Chain D: Calculated Value (Phase B3) ---
    // Seven-step end-to-end. Discovers an active calc rule, seeds an
    // order carrying all its operands, enters every operand via API,
    // checks the calc was produced (5), has a value (6), and the math
    // is plausible (7). Three distinct fail modes mapped to three
    // expects.
    {
      name: 'chain-d',
      testMatch: 'tests/chains/chain-d-calculated-value.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Chain I: Site Branding → Report (Phase B4) ---
    // Six steps. Verifies admin SiteInformation labName propagates all
    // the way through to the Patient Status Report PDF header.
    // NOTE-16 catch: PDFs render "null" when labName is unset. Includes
    // afterAll cleanup that restores any modified labName even on
    // mid-test failure.
    {
      name: 'chain-i',
      testMatch: 'tests/chains/chain-i-site-branding-to-report.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Core QA: all test suites using cached auth + test data ---
    {
      name: 'qa-dashboard',
      testMatch: 'dashboard.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-order-entry',
      testMatch: 'order-entry.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-edit-order',
      testMatch: 'edit-order.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-results',
      testMatch: 'results-entry.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-validation',
      testMatch: 'validation.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-admin',
      testMatch: 'admin-config.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-patient',
      testMatch: 'patient-management.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-referral',
      testMatch: 'referral-workflow.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-pathology',
      testMatch: 'pathology.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-reports',
      testMatch: 'reports.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-workplan',
      testMatch: 'workplan.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-non-conforming',
      testMatch: 'non-conforming.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-i18n',
      testMatch: 'i18n.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-accessibility',
      testMatch: 'accessibility.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'qa-performance',
      testMatch: 'performance.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Electronic Signature workflow (Site Information config + validation signing) ---
    {
      name: 'qa-electronic-signature',
      testMatch: 'electronic-signature.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- EQA workflow (Program management, Distributions, Results) ---
    {
      name: 'qa-eqa-workflow',
      testMatch: 'eqa-workflow.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },

    // --- Monolithic spec (current, for backward compat) ---
    {
      name: 'qa-full',
      testMatch: 'openelis-e2e.spec.ts',
      dependencies: ['setup', 'data-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
  ],
});
