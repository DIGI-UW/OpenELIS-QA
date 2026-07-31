import { defineConfig, devices } from '@playwright/test';

/**
 * personas-roles.config.ts — run the day-in-the-life personas under the ROLE
 * they describe, instead of as admin.
 *
 * SKILL §12 says "a persona PASSes only if the persona completes every step
 * using documented UI paths, with no workarounds." Running them as admin
 * silently violates the premise: admin can reach everything, so the persona
 * can never discover that the role it is impersonating is missing a surface it
 * needs (over-restriction — a lab-down incident) or has one it shouldn't
 * (over-permission). This config fixes that without touching the persona specs:
 * the only change is which session they carry.
 *
 * Mapping (persona → seeded role user):
 *   PA Receptionist          → qa_recept    (Reception)
 *   PB Bench Tech            → qa_labtech   (Results)
 *   PC Validating Biologist  → qa_validator (Validation)
 *
 * PD (Lab Manager), PE (QA Officer) and PF (Lab Administrator) are intentionally
 * absent: PD/PE need Reports-class access and PF is by definition an
 * administrator, so they need their own seeded users before they mean anything
 * scoped. Add them to ROLE_USERS + this config together.
 *
 *   npx playwright test -c personas-roles.config.ts                        # all three
 *   npx playwright test -c personas-roles.config.ts --project=persona-pb-role
 *
 * Each persona project depends on a per-role identity guard, so a stale
 * .auth/role-*.json aborts that persona instead of quietly running it as
 * whoever the storage state actually belongs to.
 */
const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';

/** One (guard, persona) pair per role. */
const ROLE_PERSONAS = [
  { role: 'receptionist', persona: 'pa', state: '.auth/role-receptionist.json' },
  { role: 'labtech', persona: 'pb', state: '.auth/role-labtech.json' },
  { role: 'validator', persona: 'pc', state: '.auth/role-validator.json' },
] as const;

export default defineConfig({
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,                    // §10.9 — keep the 6-connection-per-origin pool calm
  retries: 1,                    // absorb load-flake; genuine role gaps fail every attempt
  reporter: [['list'], ['json', { outputFile: 'rbac-results/personas-roles-last-run.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    // Admin state — needed by roles.setup.ts's provisioning fallback only.
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    { name: 'setup-roles', testDir: '.', testMatch: /roles\.setup\.ts/, dependencies: ['setup'] },

    ...ROLE_PERSONAS.flatMap(({ role, persona, state }) => [
      {
        name: `guard-${role}`,
        testDir: './tests/rbac',
        testMatch: /role-identity\.guard\.ts/,
        grep: new RegExp(`identity guard — ${role}\\b`),
        dependencies: ['setup-roles'],
        use: { storageState: state },
      },
      {
        name: `persona-${persona}-role`,
        testDir: './tests/personas',
        testMatch: new RegExp(`persona-${persona}-.*\\.spec\\.ts`),
        dependencies: [`guard-${role}`],
        use: { storageState: state },
      },
    ]),
  ],
});
