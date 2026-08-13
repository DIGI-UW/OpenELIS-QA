# Spec-Delta Run — testing a story against its design

> **When to use this instead of a suite run.** A suite run asks *"does the app still work?"* A
> **spec-delta run** asks *"does what shipped match what we specified?"* Trigger: a story or epic
> is deployed and you want the gap list — "test OGC-xxxx against the spec", "find deltas from the
> design", "did they build what we asked for".
>
> Output is a **Δ ledger** (numbered deviations with evidence), an **AC scorecard**, a maturity
> rating, and a flip-when-fixed spec. Not a pass count.

---

## Step A — Establish the authoritative spec BEFORE touching the app

The single most expensive mistake in a delta run is grading against superseded text. Every delta
you raise from a superseded paragraph is noise the team has to disprove.

1. **Find the spec.** Read the Jira story/epic description first — it usually names the file
   (`designs/<area>/<name>.md` in `DIGI-UW/openelis-work`). The gallery `catalog.json` also maps
   slug → `specPath`.
2. **Check for layering.** OpenELIS FRSs are frequently amended in place with
   *"supersedes X where they conflict"* headers, plus per-version blocks retained "for the detail
   that still applies". Write down the precedence order **explicitly** before you start
   (e.g. *multi-component FRS > v4 > v3*).
3. **Scope to a slice, not an epic.** Epics here decompose into PR-sized child stories
   (R1…R7, v1/v2/v3). Grade one slice. An epic-wide run mixes shipped, in-flight and blocked
   work and the report becomes unreadable.
4. **Note which requirements are explicitly out of scope** for the slice, and which are *blocked*
   on other stories. "Not built because blocked" is a different finding from "built wrong", and
   conflating them burns credibility.
5. **Extract the AC matrix**: one row per AC/FR in the slice → the acceptance criterion tier it
   should reach (RENDER < FUNCTION < PERSIST < ROUND-TRIP < CROSS-LINK < REPORTABLE).

**A spec defect is a legitimate finding.** If a requirement cannot be satisfied as written —
because the data it depends on doesn't support it — say so and route it to the PO as a spec
amendment, not a bug. (Real example: FR-C1 demanded a deterministic 1:1 LOINC match, but the
shipped profile carried four analyzer codes on one LOINC. No implementation could pass.)

## Step B — Confirm the instance actually carries the feature

Targets move, and **feature work often lives on its own branch instance** (see
`test-targets.md`). Before grading anything, prove the build under test contains the work:

- Record the **hostname, resolved IP, and version string** in the report header.
- Probe for the feature's **routes and REST endpoints**. A 404 on the new endpoint means you're
  on the wrong build — stop and switch, don't file "not implemented".
- Check the **feature flags** that gate it (`app-map.json` → `flags`, e.g.
  `RESULTS_ENTRY_UNIFIED_ROUTE`), and whether the admin toggle is on.
- Run **Step 0.6 Data Census**. A feature that needs orders/results cannot be graded above RENDER
  on an empty instance — seed first (`--project=seed-data`) or say so in the report.
- If the story names a deployment (SILNAS/Indonesia, PNG, Madagascar), confirm you're on that
  distro's catalog — the catalog changes what "matched" even means.

## Step C — Walk the flow, one spec section at a time

Drive the happy path end to end first, then the exceptions. For every screen the spec describes:

- Screenshot after each meaningful action.
- After every write, **read back through a different surface** than the one that wrote it.
- Record the AC id, the criterion tier actually evidenced, and a one-line note.

### The five rules that catch what a single pass misses

1. **Reproduce on a second data variant before calling anything systemic.** One profile, one test,
   one order is an anecdote. *(A "profile silently drops mappings" finding looked universal until
   a second profile applied cleanly — the real finding was narrower and more accurate.)*
2. **Separate "displays X" from "resolved X".** A rendered label may be a string carried in
   config, not a resolved entity. Verify against the **persisted object** and the **options
   endpoint** the picker draws from. *(A column that looked like a catalog match was echoing a
   `test_name_hint` from the profile JSON.)*
3. **Check whether the capability already exists elsewhere in the same module.** If it does, the
   finding sharpens from "build this" to "reuse the one you have" — far more actionable.
   *(The Control Lot form already had the full-catalog searchable picker the mapping screen
   lacked.)*
4. **Capture the server's response body whenever the UI shows a generic error.** Hook `fetch`,
   re-trigger, read the 4xx/5xx payload. *(A bare "Failed to save" was really
   "requires both mean and standard deviation" — a field-validation defect, not a broken save.)*
5. **Count what persisted vs what was offered.** Where a screen renders N rows from config, check
   how many the entity actually stored. Silent partial application is invisible from the UI alone.

## Step D — Walk the findings with the product owner before filing

The cheapest quality gate available. Present each Δ with its evidence and let the PO rule
**bug / spec change / harness artefact / deferred**. In a real run this reclassified two findings
that would otherwise have been filed as defects — one was an automation artefact, one was a
mis-scoped claim.

Where a live instance ships an **in-app review widget**, record the verdicts there as you go —
see `in-app-review-widget.md`.

**Withdraw loudly.** If a finding turns out to be wrong, keep it in the ledger under a
**Withdrawn** heading with the evidence that killed it. A ledger that only ever grows looks like
advocacy; one that visibly self-corrects is trusted.

**Defer honestly.** If a finding can't be separated from a missing prerequisite (no simulator, no
seeded data, a disconnected harness), mark it **deferred, not judged** and state what would settle
it. Note separately any part of it that *is* harness-independent — e.g. "the button issues no
request at all" is a client-side fact regardless of whether the far end is reachable.

## Step E — Write it up

- **Δ ledger** — numbered, each with: what the spec says, what the build does, the evidence
  (endpoint + values, screenshot), reproduction steps, and severity.
- **AC scorecard** — PASS / PARTIAL / FAIL per AC, with the delta ids.
- **Maturity** per `SKILL.md` §5.5 — the module rates at its **lowest** sub-feature.
- **What works and should be preserved.** A report that is only defects gets read as hostile and
  invites the team to defend rather than fix.
- **Rank by what unblocks the most.** Lead with the finding whose repair frees the others.

Save the report to the QA repo, and — when the design lives there — also to
`openelis-work/designs/<area>/` next to the FRS, so the delta sits beside the spec it grades.
That repo is PR-based: branch, commit, push, open a PR (`gh pr create`).

## Step F — Encode the deltas as flip-when-fixed tests

Write the Playwright spec so **every Δ asserts the current, wrong behavior**, tagged with its Δ id
and a message naming what to change when it fails:

```ts
expect(dropped.length, 'Δ-F fixed? flip to expect(dropped).toHaveLength(0)').toBeGreaterThan(0);
```

When the fix lands the assertion fails, and the failure *is* the signal — no separate tracking
needed. Deferred findings get `test.skip` with a comment saying what must be true to re-enable.
Register the spec as a project in `all-tc.config.ts`, add it to the `tsconfig.json` typecheck
ratchet, and confirm `npx tsc --noEmit -p tsconfig.json` is clean before handing it over.

---

## Run checklist

- [ ] Authoritative spec identified; supersession order written down
- [ ] Scoped to one slice; blocked/out-of-scope requirements listed separately
- [ ] AC matrix extracted with target criterion tiers
- [ ] Instance verified: host, IP, version, routes, flags, census (seed if needed)
- [ ] Happy path walked; writes read back through a second surface
- [ ] Second data variant tried before any systemic claim
- [ ] Persisted-vs-offered counted; server error bodies captured
- [ ] Findings walked with the PO; verdicts recorded (in-app widget if present)
- [ ] Withdrawn and deferred sections written honestly
- [ ] Report saved to both repos; PR opened where the design lives
- [ ] Flip-when-fixed spec added, registered, typecheck clean
- [ ] `validation-history.md` appended
