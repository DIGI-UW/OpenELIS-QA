---
name: openelis-bug-revalidation
description: >
  Multi-session bug revalidation protocol for OpenELIS Global QA. Use this skill whenever a QA test run produces a new FAIL result and you need to decide whether to file a Jira ticket. Requires confirming the failure in at least 2 of 3 independent methods: fresh browser tab, full logout/re-login, and 3× API repeat. Prevents false-positive Jira tickets from transient network errors, data resets, and React hydration races.
---

# OpenELIS Bug Revalidation Protocol

> **Version:** v1.1 (2026-05-12) — cross-linked with `openelis-test-catalog-qa` SKILL v6.2. Step 0.5 Calibration (in the catalog skill) is the upstream activity that decides which bugs need revalidation; this skill is the downstream protocol that runs on each new FAIL. The two are designed to work together — do not duplicate or fork either's rules.

Use this skill after any QA test run that produces **new FAIL results** to confirm
whether each failure is a real reproducible bug before filing a Jira ticket.

---

## Relationship to `openelis-test-catalog-qa` SKILL (v6.2 and later)

This skill sits between two activities defined in the test-catalog-qa SKILL:

| When | What you do | Which SKILL governs it |
|---|---|---|
| **Start of a test phase** | Verify the top-5 critical open bugs are still in their documented state, using the indirect evidence path for destructive bugs | test-catalog-qa SKILL §0.5 Calibration |
| **During the test phase** | If a mandated step would hang the session, mark BLOCKED, mark the parent chain/persona PARTIAL, continue | test-catalog-qa SKILL §11.5 Blocking-Bug Etiquette |
| **After a new FAIL** | Confirm reproducibility with at least 2 of 3 methods before filing Jira | **This SKILL** |

**Important boundary:** the revalidation Methods A/B/C below MUST NOT re-perform a known destructive UI action (BUG-31 Carbon Accept checkbox, BUG-38 NCE POST hang) just to confirm a hang is still present. For those bugs, use indirect evidence — DOM inspection of the relevant React component fiber, API probe via `read_network_requests`, or server-log review. See the new section "Destructive Bugs — Special Rule" below.

The 2026-05-12 calibration sweep cleared 17 Jira tickets and flagged 2 drift cases (OGC-558, OGC-559). The current open-tickets list and the priorities for the next live session are in `bug-calibration-delta-2026-05-12.md` in the OpenELIS-QA repo.

---

## When to Invoke

- A QA run marks a test case `FAIL` that was previously `PASS` or `GAP`
- You are deciding whether to create a new Jira bug ticket
- You want to confirm whether a previously filed bug is still reproducible
- A result seems inconsistent with known application behavior

---

## Why Revalidation Is Required

OpenELIS test instances experience:
- Transient network timeouts (baseline RTT ~365ms to remote host)
- Periodic data resets (NOTE-14) that invalidate fixture-dependent assertions
- React hydration races causing one-off UI failures
- Session cookie expiry that mimics auth failures

A single FAIL observation can be any of these — not a real bug. Two independent
confirmations make the case conclusive.

---

## Method A — Fresh Tab (mandatory for ALL new FAILs)

1. Open a **new browser tab** — do not reuse the existing session
2. Navigate to `BASE_URL` and confirm the dashboard loads
3. If redirected to login: enter `admin` / `adminADMIN!`, verify dashboard appears
4. Repeat the **exact failing steps** from the original FAIL, in the same order
5. Record: `REVALIDATION-A: CONFIRMED` or `REVALIDATION-A: NOT REPRODUCED`

---

## Method B — Full Logout / Re-Login (mandatory for auth-related and POST failures)

1. Navigate to `BASE_URL/logout` (or use the sidebar logout button)
2. Wait for the login page — confirm session is fully cleared
3. Log in fresh: `admin` / `adminADMIN!`
4. Navigate to the feature area via **sidebar menu** (not direct URL) to rebuild state exactly as a real user would
5. Repeat the **exact failing steps**
6. Record: `REVALIDATION-B: CONFIRMED` or `REVALIDATION-B: NOT REPRODUCED`

---

## Method C — API-Level Repeat (required when the FAIL is an HTTP status code)

For failures observed via `page.evaluate(fetch(...))`:

1. Repeat the `fetch()` call **3 times** with 2-second gaps
2. Record each status: `[attempt1, attempt2, attempt3]`
3. If **≥2** return the same failure status → `REVALIDATION-C: CONFIRMED`
4. If only 1 of 3 fails → `REVALIDATION-C: NOT REPRODUCED (transient)`

```typescript
// Paste this block after any API FAIL to run Method C
const statuses: number[] = [];
const failingEndpoint = '/api/OpenELIS-Global/rest/<your-endpoint-here>';
for (let i = 0; i < 3; i++) {
  const s = await page.evaluate(async (url: string) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
    return res.status;
  }, failingEndpoint);
  statuses.push(s);
  await page.waitForTimeout(2000);
}
const confirmed = statuses.filter(s => s >= 500 || s === 404).length >= 2;
console.log(`REVALIDATION-C: ${confirmed ? 'CONFIRMED' : 'NOT REPRODUCED'} — [${statuses.join(', ')}]`);
```

---

## Decision Matrix

| Method A | Method B / C | Decision |
|----------|--------------|----------|
| CONFIRMED | CONFIRMED | ✅ **FILE JIRA TICKET** |
| CONFIRMED | NOT REPRODUCED | ⚠️ **FLAKY** — log in report, re-test next run |
| NOT REPRODUCED | CONFIRMED | ⚠️ **FLAKY** — log in report, re-test next run |
| NOT REPRODUCED | NOT REPRODUCED | ❌ **TRANSIENT** — NOTE only, no ticket |

---

## Required Jira Ticket Content

```
Environment: <BASE_URL> (OpenELIS Global v3.2.1.x)
TC ID: TC-XXX
Step failed: <exact step number and action>
Expected: <what should happen>
Actual: <HTTP status / error text / screenshot reference>

Revalidation:
  Method A (fresh tab):  CONFIRMED / NOT REPRODUCED — <note>
  Method B (re-login):   CONFIRMED / NOT REPRODUCED — <note>
  Method C (API ×3):     statuses=[<s1>, <s2>, <s3>] — CONFIRMED / NOT REPRODUCED

Severity: <Critical / High / Medium / Low>
Severity justification: <why>
```

---

## Exceptions — Abbreviated Revalidation (Method A only)

- Typos / display text errors (text is static, not transient)
- Broken sidebar links (`href=""` or `href="null"`)
- Missing i18n keys (raw key rendered instead of translated string)
- Already-documented bugs (BUG-1 through current) confirmed in a new area

**Critical severity bugs** (patient safety, data loss, auth bypass) always require
all three methods regardless of the exception list above — **except** for the destructive-bug carve-out below.

---

## Destructive Bugs — Special Rule (added v1.1)

For bugs whose evidence step would itself hang the browser, exhaust the Chrome 6-connection-per-origin pool, or otherwise prevent further testing, the normal Method A/B/C revalidation must NOT be performed. Re-triggering the destructive action is itself the failure mode the bug describes; doing it twice doesn't make the case stronger, it just damages the session.

**Known destructive bugs as of v6.1:**
- **BUG-31** — Carbon Accept checkbox `.click()` on the Results page causes a ~60s renderer hang.
- **BUG-38** — `POST /rest/reportnonconformingevent` hangs indefinitely and pool-exhausts after one call.

**For these bugs, use the indirect evidence path:**

| Instead of clicking | Do this |
|---|---|
| `.click()` on the Carbon Accept checkbox | Inspect the React fiber: `document.querySelector('.bx--checkbox-label')` then walk `__reactFiber$*` to confirm the onChange handler is still present and bound to the destructive callback. Record this as `REVALIDATION-DESTRUCTIVE: CONFIRMED via DOM`. |
| Re-POST to `/rest/reportnonconformingevent` | Use `read_network_requests` to capture any in-flight POST and confirm pending status without issuing a new one. If a server log is available, check for the entry corresponding to the prior attempt. |

**Decision matrix for destructive bugs:**

- DOM/network evidence shows the destructive code path is still wired up the same way as documented → file or update Jira ticket directly. No Method A/B/C required.
- DOM/network evidence shows the code has changed (different handler, different endpoint, removed) → upgrade to a real Method A test ONLY in a fresh isolated tab, and ONLY if you can guarantee the rest of the session has been parked first.

**Why this rule exists:** Phase 35 of the test catalog history saw multiple tabs attempt the BUG-38 POST simultaneously, exhausting Chrome's connection pool and blocking all other API calls until the hanging tabs were closed. The revalidation Methods, when applied without care, can themselves cause the failure they're trying to confirm.

---

## Workflow

```
1. Run QA suite → collect FAILs
2. For each new FAIL not in the known bug list:
   a. Run Method A (fresh tab) immediately
   b. If CONFIRMED → run Method B (or C for API failures)
   c. Apply decision matrix
   d. CONFIRMED × 2 → file Jira ticket with full revalidation block
   e. FLAKY → add to report, schedule re-test next run
   f. TRANSIENT → NOTE in report, no ticket
3. Update QA report with all revalidation outcomes
```

---

## Reference

**OpenELIS QA repo:** https://github.com/DIGI-UW/OpenELIS-QA

**Linked SKILL and docs (companion to this protocol):**
- `SKILL.md` v6.2 — the main QA SKILL. Section 0.5 Calibration, Section 6.5 (no 404-bugs without live capture), Section 7.5 Round-trip Write Verification, Section 8 Known Bugs table, Section 11 Chains, Section 11.5 Blocking-Bug Etiquette, Section 12 Personas.
- `bug-calibration-delta-2026-05-12.md` — the most recent calibration sweep. Lists every bug's current state: KEEP OPEN / RESOLVED / FALSE POSITIVE / NEEDS RETEST. Always consult this before invoking revalidation on a known bug.
- `maturity-dashboard.html` — module-by-module Maturity rating (M0–M5). Use to predict which areas are likely to produce false-positive FAILs (M0/M1 modules) vs. real bugs (M2+ regressions).

**Known bugs already validated (do not re-file):** The full table is in `openelis-test-catalog-qa` SKILL.md Section 8. As of 2026-05-12 calibration: 9 marked Resolved, 6 marked False Positive (wrong endpoint pattern — see SKILL §6.5), 2 Retracted, 19 still present on testing v3.2.1.6, 8 mgtest-only, 27 stable cosmetic, 18 awaiting retest. Drift flagged on OGC-558 and OGC-559.

**v1.1 change log (2026-05-12):**
- Added "Relationship to `openelis-test-catalog-qa` SKILL" section explaining how this skill sits between Step 0.5 Calibration and §11.5 Blocking-Bug Etiquette.
- Added "Destructive Bugs — Special Rule" section. BUG-31 and BUG-38 cannot be revalidated by Methods A/B/C without damaging the session; use DOM/network indirect evidence instead.
- Updated Reference section with links to v6.2 SKILL, calibration delta, and maturity dashboard.
