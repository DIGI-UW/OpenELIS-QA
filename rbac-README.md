# Role-Scoped Permission Runs (RBAC matrix)

Everything in the harness authenticates once as admin (`auth.setup.ts` → `.auth/user.json`)
and every project reuses that state. This module adds the missing lane: runs under
**scoped, non-admin sessions**, with both allow- and deny-assertions.

## Quick start

```bash
# Full run against testing (default BASE)
npx playwright test -c rbac.config.ts

# Just re-provision / re-auth the role users
npx playwright test -c rbac.config.ts --project=setup-roles

# Matrix only (role states already fresh)
npx playwright test -c rbac.config.ts --project=rbac-matrix
```

## Files

| File | Purpose |
|---|---|
| `rbac.config.ts` | Project chain: `setup` (admin) → `setup-roles` → `rbac-matrix` |
| `roles.setup.ts` | Verifies/provisions the static role users, handles the forced-password-change trap, runs the identity guard, saves `.auth/role-*.json` |
| `tests/rbac/_rbac.ts` | **The data.** Role users, the role × probe matrix, classification helpers |
| `tests/rbac/rbac-matrix.spec.ts` | The engine. One describe per role, one test per probe |

## Role users (pre-seeded static — the primary path)

| Role | Login | Env overrides |
|---|---|---|
| Receptionist | `qa_recept` | `OE_RECEPT_USER` / `OE_RECEPT_PASS` |
| Lab Technician | `qa_labtech` | `OE_LABTECH_USER` / `OE_LABTECH_PASS` |
| Validator/Biologist | `qa_validator` | `OE_VALID_USER` / `OE_VALID_PASS` |

Seed them once per instance (User Management UI). `roles.setup.ts` attempts one API
create as a fallback, but that path is BUG-3/BUG-20 dependent — permission coverage
must never be hostage to the UserCreate bug.

## Design decisions (read before extending)

**Identity guard is non-negotiable.** The storage-state model's failure mode is
silent: a stale `.auth/role-*.json` runs "scoped" probes on admin cookies and every
deny-test false-PASSes. Both `roles.setup.ts` (at save time) and the spec (at run
time) assert the session belongs to the expected login. If the guard fails, probes
SKIP — they are never graded.

**Three expectation tiers.**
- `invariant` — hard security assertions (bench roles denied user-management API,
  admin routes, legacy JSP admin). FAIL = ticket candidate after the
  `openelis-bug-revalidation` 2-of-3 gate.
- `expected` — documented role intent from `edit-order-rbac-test-cases.md`. FAIL is
  a real finding in either direction: over-permission is a security bug,
  over-restriction is a lab-down incident.
- `baseline` — gating that is unowned today. First run records observed behavior to
  `rbac-results/`; review it, commit the snapshot as `rbac-baseline.json`
  (`{"<role>:<probeId>": "allow"|"deny"}`), and subsequent runs fail on drift.

**Why baseline-then-assert, not guess.** The role model is moving from the fixed
legacy set to a role builder. Guessed expectations would all churn at that point.
Invariants survive the transition; everything else is per-instance data you
regenerate — the spec engine doesn't change.

**Both enforcement surfaces.** Menu hiding is RENDER-tier cosmetics; the REST layer
is the security boundary; and per §6.4 the legacy JSP pages run a *separate* auth
system whose gating can differ from the SPA. The matrix therefore has four probe
kinds: `rest`, `route`, `jsp`, `menu`. Never report a `menu` PASS as enforcement
evidence.

**Ambiguity is never graded.** 401 (session vs authz), 404 (absent endpoint ≠
permission verdict, §6.5), and blank SPA pages (§6.3) are recorded as `ambiguous`
with soft assertions and annotations — resolve via live capture (§6.5a) before
grading, exactly like the 404 bug-filing rule.

## Follow-ups (deliberately out of scope for v1)

1. **Role-scoped personas** — run PA/PB/PC under `.auth/role-*.json` instead of
   admin. The persona definitions already describe role work; running them as admin
   masks both over-restriction and menu-gating bugs. Mechanically: a config variant
   of the persona projects with the role storage state + the identity guard.
2. **Lab-unit scoping axis** — role × test section (a Hematology-only tech must not
   see Serology worklists). Needs unit-scoped seed users; second matrix dimension.
3. **Audit attribution** — actions performed under a role session appear in the
   Audit Trail under that login (cheap CROSS-LINK assertion; also double-checks the
   identity guard).
4. **Freshness board lane** — `rbac-results/last-run.json` (Playwright JSON
   reporter) + per-role matrix files in `rbac-results/` are the feed; the board
   needs a role dimension so "fresh" stops meaning "admin lane fresh".
5. **Pin `/rest/session`** — the identity guard probes it defensively and falls
   back to DOM. If the fallback fires every run, live-capture the real session
   endpoint and pin it in `_rbac.ts` (§6.5b).
