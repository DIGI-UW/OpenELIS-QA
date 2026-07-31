/**
 * tests/rbac/_rbac.ts — Role-scoped (non-admin) permission testing:
 * static role users, the role × probe expectation matrix, and classification helpers.
 *
 * WHY THIS IS DATA, NOT CODE
 * --------------------------
 * The instance currently runs the fixed legacy role set (Reception / Results /
 * Validation …). That model is moving to a role builder. When it lands, the
 * matrix below becomes per-instance data you regenerate from the configured
 * roles — the spec engine (rbac-matrix.spec.ts) should not need to change.
 *
 * THREE EXPECTATION TIERS
 * -----------------------
 *   invariant — hard security assertions. A FAIL here is a ticket candidate
 *               (after the openelis-bug-revalidation 2-of-3 gate). Example: no
 *               bench role may read /rest/UnifiedSystemUser.
 *   expected  — documented role intent (edit-order-rbac-test-cases.md). A FAIL
 *               is a real finding in EITHER direction: over-permission is a
 *               security bug; over-restriction is a lab-down incident.
 *   baseline  — gating is unowned/unknown today. First run records observed
 *               behavior to rbac-results/. Review, commit the reviewed snapshot
 *               as rbac-baseline.json, and later runs FAIL on drift.
 *
 * §6.5b NOTE: REST probe paths are limited to endpoints already live-validated
 * in tests/chains/_common.ts / helpers/apiShapes.ts. assertIdentity() probes
 * /rest/session defensively and falls back to DOM — if you see it falling back
 * every run, capture the real session endpoint (§6.5a) and pin it here.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Page, BrowserContext } from '@playwright/test';
import { apiCall } from '../chains/_common';

const API = '/api/OpenELIS-Global/rest';

// -----------------------------------------------------------------------------
// Static role users (pre-seeded is the PRIMARY path — see roles.setup.ts)
// -----------------------------------------------------------------------------

export type RoleKey = 'receptionist' | 'labtech' | 'validator';

export interface RoleUser {
  key: RoleKey;
  displayName: string;
  login: string;
  password: string;
  /**
   * Role names under the current fixed role model, tried in order when the
   * provisioning fallback creates the user. Instances differ ("Reception" vs
   * "Receptionist"). Role-builder future: regenerate per instance.
   */
  roleCandidates: string[];
  storageState: string;
}

export const ROLE_USERS: RoleUser[] = [
  {
    key: 'receptionist',
    displayName: 'Receptionist',
    login: process.env.OE_RECEPT_USER ?? 'qa_recept',
    password: process.env.OE_RECEPT_PASS ?? 'QArecept1!',
    roleCandidates: ['Reception', 'Receptionist'],
    storageState: '.auth/role-receptionist.json',
  },
  {
    key: 'labtech',
    displayName: 'Lab Technician',
    login: process.env.OE_LABTECH_USER ?? 'qa_labtech',
    password: process.env.OE_LABTECH_PASS ?? 'QAlabtech1!',
    roleCandidates: ['Results entry', 'Results', 'Lab Technician'],
    storageState: '.auth/role-labtech.json',
  },
  {
    key: 'validator',
    displayName: 'Validator / Biologist',
    login: process.env.OE_VALID_USER ?? 'qa_validator',
    password: process.env.OE_VALID_PASS ?? 'QAvalid1!',
    roleCandidates: ['Validation', 'Validator'],
    storageState: '.auth/role-validator.json',
  },
];

// -----------------------------------------------------------------------------
// Unit-scoped users — the SECOND permission axis (role × lab unit)
// -----------------------------------------------------------------------------
// A Hematology tech and a Serology tech hold the SAME role, so the role axis
// alone treats them as identical. These users carry a role granted to ONE test
// section, which is what makes section leakage testable. See unit-scope.spec.ts.
//
// Section ids/names captured from the live UnifiedSystemUser preform on testing
// v3.2.1.11 (2026-07-31); regenerate per instance — they are NOT portable.

export interface UnitScopedUser {
  key: string;
  displayName: string;
  login: string;
  password: string;
  /** Lab-unit role name granted (must exist in the preform's labUnitRoles). */
  role: string;
  /** Role the user must NOT hold — U-03 asserts its section list is empty. */
  roleNotHeld: string;
  /** Granted section ids. */
  sectionIds: string[];
  /**
   * Granted section NAMES. Required because `session.userLabRolesMap` is keyed
   * by section name for a scoped user (vs the literal "AllLabUnits" when
   * unscoped) — captured live, not inferred.
   */
  sectionNames: string[];
  /** name -> id for sections the user must NOT see. U-05 checks each against admin. */
  outOfScopeSections: Record<string, string>;
  storageState: string;
}

export const UNIT_SCOPED_USERS: UnitScopedUser[] = [
  {
    key: 'heme',
    displayName: 'Validator, Hematology only',
    login: process.env.OE_HEME_USER ?? 'qa_heme',
    password: process.env.OE_HEME_PASS ?? 'QAheme1!',
    role: 'Validation',
    roleNotHeld: 'Results',
    sectionIds: ['36'],
    sectionNames: ['Hematology'],
    outOfScopeSections: { Biochemistry: '56', Immunology: '59', 'Molecular Biology': '136' },
    storageState: '.auth/role-heme.json',
  },
];

// -----------------------------------------------------------------------------
// Probe matrix
// -----------------------------------------------------------------------------

export type ProbeKind = 'rest' | 'jsp' | 'route' | 'menu';
export type Tier = 'invariant' | 'expected' | 'baseline';
export type Expectation = 'allow' | 'deny' | 'baseline';
export type Verdict = 'allow' | 'deny' | 'ambiguous' | 'error';

export interface Probe {
  id: string;
  kind: ProbeKind;
  /** rest/jsp/route: URL path. menu: case-insensitive regex source matched against sidebar/header nav text. */
  target: string;
  description: string;
  tier: Tier;
  /** Per-role expectation; omit a role to skip the probe for that role. */
  expect: Partial<Record<RoleKey, Expectation>>;
  notes?: string;
}

export const PROBES: Probe[] = [
  // ——————————————————————— Tier 1: security invariants ———————————————————————
  {
    id: 'INV-01', kind: 'rest', tier: 'invariant',
    target: `${API}/UnifiedSystemUser`,
    description: 'User-management API denied to all bench roles (Chain H Step 3, generalized)',
    expect: { receptionist: 'deny', labtech: 'deny', validator: 'deny' },
  },
  {
    id: 'INV-02', kind: 'route', tier: 'invariant',
    target: '/MasterListsPage',
    description: 'Admin master-lists SPA route denied (direct URL nav valid for /MasterListsPage per §6.3)',
    expect: { receptionist: 'deny', labtech: 'deny', validator: 'deny' },
  },
  {
    id: 'INV-03', kind: 'jsp', tier: 'invariant',
    target: '/api/OpenELIS-Global/TestAdd',
    description: 'Legacy JSP admin surface (TestAdd) denied — separate auth system (§6.4); gating may differ from SPA',
    expect: { receptionist: 'deny', labtech: 'deny', validator: 'deny' },
    notes: 'The SPA menu hiding proves nothing about this surface. This probe is the point of the JSP kind.',
  },
  {
    id: 'INV-04', kind: 'menu', tier: 'invariant',
    target: 'admin',
    description: 'Admin menu entry not visible to bench roles (UI gating — cosmetic layer, still worth pinning)',
    expect: { receptionist: 'deny', labtech: 'deny', validator: 'deny' },
  },

  // ————————————— Tier 2: expected role behavior (edit-order-rbac-test-cases.md) —————————————
  {
    id: 'EXP-01', kind: 'rest', tier: 'expected',
    target: `${API}/patient-search-results?lastName=A`,
    description: 'Patient search open to all bench roles — over-restriction here is a lab-down incident',
    expect: { receptionist: 'allow', labtech: 'allow', validator: 'allow' },
  },
  {
    id: 'EXP-02', kind: 'rest', tier: 'expected',
    target: `${API}/SamplePatientEntry`,
    description: 'Add Order preform — receptionist core function (TC-RECEPT-01/02)',
    expect: { receptionist: 'allow', labtech: 'baseline', validator: 'baseline' },
    notes: 'TC-LABTECH-05 expects lab tech denied, but the doc itself notes some installs allow all roles to order → baseline for non-receptionist until the instance answer is pinned.',
  },
  {
    id: 'EXP-03', kind: 'menu', tier: 'expected',
    target: 'order',
    description: 'Order menu visible to receptionist',
    expect: { receptionist: 'allow', labtech: 'baseline', validator: 'baseline' },
  },
  {
    id: 'EXP-04', kind: 'rest', tier: 'expected',
    target: `${API}/LogbookResults`,
    description: 'Results logbook — lab tech core surface (TC-LABTECH-01/06). Observed live 2026-07-30: Validation role is DENIED (401) — validators use AccessionValidation, not the result-entry queue → baseline, product question. TC-RECEPT-04 expects receptionist denied or read-only → baseline until pinned.',
    expect: { labtech: 'allow', validator: 'baseline', receptionist: 'baseline' },
  },
  {
    id: 'EXP-05', kind: 'menu', tier: 'expected',
    target: 'results',
    description: 'Results menu visible to lab tech and validator',
    expect: { labtech: 'allow', validator: 'allow', receptionist: 'baseline' },
  },
  {
    id: 'EXP-06', kind: 'menu', tier: 'expected',
    target: 'validation',
    description: 'Validation menu visible to validator',
    expect: { validator: 'allow', labtech: 'baseline', receptionist: 'baseline' },
  },

  // ——————————————————— Tier 3: baseline (record, then drift-check) ———————————————————
  {
    id: 'BASE-01', kind: 'rest', tier: 'baseline',
    target: `${API}/home-dashboard/metrics`,
    description: 'Dashboard KPI metrics — gating unowned; pin whatever the instance does today',
    expect: { receptionist: 'baseline', labtech: 'baseline', validator: 'baseline' },
  },
  {
    id: 'BASE-02', kind: 'rest', tier: 'baseline',
    target: `${API}/test-list`,
    description:
      'Test list (referral/aliquot filter source). CAVEAT: this endpoint is ROLE-SCOPED and ' +
      'returns HTTP 200 with an EMPTY array for Reception (admin/Results see 187 tests, ' +
      'Reception sees 0 — measured 2026-07-31). classifyRest grades any 2xx as `allow`, so ' +
      'this row records "allow" for a caller who can read nothing useful. Accurate about ' +
      'access, misleading about usefulness — see apiShapes §TEST_LIST_IS_ROLE_SCOPED. If you ' +
      'need to assert usefulness, add a content-aware probe rather than trusting this verdict.',
    expect: { receptionist: 'baseline', labtech: 'baseline', validator: 'baseline' },
  },
  {
    id: 'BASE-03', kind: 'rest', tier: 'baseline',
    target: `${API}/ReferredOutTests`,
    description: 'Referred-out tests surface (Chain O read endpoint)',
    expect: { receptionist: 'baseline', labtech: 'baseline', validator: 'baseline' },
  },
  {
    id: 'BASE-04', kind: 'jsp', tier: 'baseline',
    target: '/api/OpenELIS-Global/ReportPrint',
    description: 'Legacy report surface — pins whether bench roles can reach report generation',
    expect: { receptionist: 'baseline', labtech: 'baseline', validator: 'baseline' },
  },
];

// -----------------------------------------------------------------------------
// Identity guard — MANDATORY before any probe is graded
// -----------------------------------------------------------------------------
// The storage-state model's failure mode is silent: a stale .auth file means a
// "scoped" run probes with the WRONG session (often admin) and every deny-test
// false-PASSes. Never grade probes for a role whose identity guard failed.

export interface Identity {
  ok: boolean;
  method: string;
  detail: string;
}

/**
 * Session endpoint — PINNED via live capture on testing v3.2.1.11 (2026-07-30).
 * NOTE: it is `/api/OpenELIS-Global/session`, NOT under `/rest` (the frontend
 * fetches `config.serverBaseUrl + "/session"`; `/rest/session` 404s).
 * Shape: { authenticated, loginMethod, sessionId, userId, loginName,
 *          firstName, lastName, roles: string[],
 *          userLabRolesMap: { [labUnit|'AllLabUnits']: string[] }, csrf }
 */
const SESSION_ENDPOINT = '/api/OpenELIS-Global/session';

export interface SessionPayload {
  authenticated?: boolean;
  loginName?: string;
  userId?: string;
  roles?: string[];
  userLabRolesMap?: Record<string, string[]>;
}

export async function assertIdentity(page: Page, expectedLogin: string): Promise<Identity> {
  const r = await apiCall<SessionPayload>(page, SESSION_ENDPOINT);
  if (r.ok && r.body && typeof r.body === 'object') {
    const s = r.body as SessionPayload;
    if (s.authenticated && s.loginName === expectedLogin) {
      return {
        ok: true, method: 'GET /session',
        detail: `loginName="${s.loginName}", roles=[${(s.roles ?? []).join(', ')}], labRoles=${JSON.stringify(s.userLabRolesMap ?? {})}`,
      };
    }
    return {
      ok: false, method: 'GET /session',
      detail: `SESSION IDENTITY MISMATCH — expected "${expectedLogin}", got authenticated=${s.authenticated}, loginName="${s.loginName}"`,
    };
  }
  // Fallback: login name rendered in the app shell header (weak — header shows
  // display name on some versions; only useful when /session itself is absent).
  try {
    const text = await page.locator('header, .cds--header').first().innerText({ timeout: 5_000 });
    if (text.toLowerCase().includes(expectedLogin.toLowerCase())) {
      return { ok: true, method: 'dom header (fallback)', detail: 'login name visible in header' };
    }
    return { ok: false, method: 'dom header', detail: `expected "${expectedLogin}" in header, saw: ${text.slice(0, 200)}` };
  } catch {
    return { ok: false, method: 'none', detail: `no identity signal — /session HTTP ${r.status}, header unreadable` };
  }
}

// -----------------------------------------------------------------------------
// Classification
// -----------------------------------------------------------------------------

export interface Classification {
  verdict: Verdict;
  detail: string;
}

/**
 * REST probe classification. Key subtleties:
 *  - 401 is AMBIGUOUS (session vs authz — Chain H precedent), never a deny-PASS.
 *  - 200 + login-page HTML is a deny: the SPA/proxy sometimes serves the login
 *    shell with a 200 instead of a 4xx.
 *  - 404 is AMBIGUOUS per §6.5: absent endpoint ≠ permission verdict.
 */
export function classifyRest(status: number, body: unknown): Classification {
  if (status === 403) return { verdict: 'deny', detail: 'HTTP 403' };
  if (status === 401) return { verdict: 'ambiguous', detail: 'HTTP 401 — session vs authz ambiguity; re-check identity guard before grading' };
  if (status === 404) return { verdict: 'ambiguous', detail: 'HTTP 404 — endpoint absent on this instance/version; NOT a permission verdict (§6.5)' };
  if (status === 302) return { verdict: 'deny', detail: 'HTTP 302 redirect (login bounce)' };
  if (status >= 200 && status < 300) {
    const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    if (/<html/i.test(text) && /loginName|j_username|<form[^>]*login/i.test(text)) {
      return { verdict: 'deny', detail: `HTTP ${status} + login page HTML (soft deny)` };
    }
    return { verdict: 'allow', detail: `HTTP ${status}` };
  }
  if (status >= 500) return { verdict: 'error', detail: `HTTP ${status} — server error, not a gating verdict` };
  return { verdict: 'error', detail: `HTTP ${status}` };
}

/**
 * Route/JSP probe: visit in a FRESH page of the role's context (so the main
 * probe page stays parked on BASE for same-origin REST calls), classify by
 * where we landed and what rendered.
 */
export async function classifyRoute(ctx: BrowserContext, base: string, target: string): Promise<Classification> {
  const p = await ctx.newPage();
  try {
    const resp = await p.goto(`${base}${target}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await p.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const url = p.url();
    const status = resp?.status() ?? 0;
    if (/\/login/i.test(url)) return { verdict: 'deny', detail: `redirected to login (${url})` };
    // Legacy JSP gating redirects to Home?access=denied (observed live on
    // testing v3.2.1.11, 2026-07-30) — a denial even though the landing page
    // renders fine with HTTP 200.
    if (/access[=_-]denied/i.test(url)) return { verdict: 'deny', detail: `redirected with access=denied (${url})` };
    if (status === 403) return { verdict: 'deny', detail: 'HTTP 403' };
    if (status === 401) return { verdict: 'ambiguous', detail: 'HTTP 401 — session vs authz' };
    if (status === 404) return { verdict: 'ambiguous', detail: 'HTTP 404 — may be SPA-routing 404 (§6.3), not gating' };
    const text = (await p.locator('body').innerText({ timeout: 5_000 }).catch(() => '')).slice(0, 4_000);
    if (/not authorized|access denied|forbidden|insufficient/i.test(text)) {
      return { verdict: 'deny', detail: `denial message rendered: "${text.match(/not authorized|access denied|forbidden|insufficient/i)?.[0]}"` };
    }
    if (/loginName|sign in/i.test(text) && /password/i.test(text)) {
      return { verdict: 'deny', detail: 'login form rendered in place of page' };
    }
    if (text.trim().length < 40) {
      return { verdict: 'ambiguous', detail: `page rendered nearly empty (${text.trim().length} chars) — blank-page SPA hazard (§6.3), not gradeable` };
    }
    return { verdict: 'allow', detail: `HTTP ${status}, content rendered at ${url}` };
  } catch (err) {
    return { verdict: 'error', detail: `navigation failed: ${String(err).slice(0, 200)}` };
  } finally {
    await p.close();
  }
}

/** Menu-visibility probe: is a top-level nav entry matching the regex present for this role? */
export async function classifyMenu(page: Page, base: string, regexSource: string): Promise<Classification> {
  if (!page.url().startsWith(base)) {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('nav, [role="navigation"], .cds--side-nav, header', { timeout: 15_000 }).catch(() => {});
  const text = await page
    .locator('nav, [role="navigation"], .cds--side-nav, header')
    .allInnerTexts()
    .then(a => a.join('\n'))
    .catch(() => '');
  if (!text.trim()) return { verdict: 'ambiguous', detail: 'no nav text found — shell may not have rendered' };
  const re = new RegExp(regexSource, 'i');
  return re.test(text)
    ? { verdict: 'allow', detail: `nav entry /${regexSource}/i visible` }
    : { verdict: 'deny', detail: `nav entry /${regexSource}/i not present` };
}

// -----------------------------------------------------------------------------
// Results + baseline
// -----------------------------------------------------------------------------

export interface ProbeResult {
  role: RoleKey;
  probeId: string;
  kind: ProbeKind;
  target: string;
  tier: Tier;
  expected: Expectation;
  verdict: Verdict;
  detail: string;
  at: string;
}

export function writeResults(results: ProbeResult[], role: RoleKey): string {
  fs.mkdirSync('rbac-results', { recursive: true });
  const file = path.join('rbac-results', `rbac-${role}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  return file;
}

/**
 * Committed, human-reviewed snapshot mapping "<role>:<probeId>" → "allow"|"deny".
 * Build it from a reviewed rbac-results run:
 *   jq 'map({(.role + ":" + .probeId): .verdict}) | add' rbac-results/rbac-<role>-<ts>.json
 * Review before committing — the baseline asserts "this is CORRECT", not "this happened once".
 */
export function loadBaseline(): Record<string, string> | null {
  if (!fs.existsSync('rbac-baseline.json')) return null;
  return JSON.parse(fs.readFileSync('rbac-baseline.json', 'utf8')) as Record<string, string>;
}
