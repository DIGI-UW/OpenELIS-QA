# Bug Triage — Jira is the source of truth

> This skill does **not** maintain an embedded "known bugs" table. Bug state changes weekly;
> an in-skill list rots into a graveyard of closed/false-positive rows. **Jira is the single
> source of truth.** Before filing anything, revalidate and check Jira.

---

## Before you file a ticket — two gates

**Gate 1 — Revalidate (don't file transients).** Run the **`openelis-bug-revalidation`** skill's
protocol: confirm the failure reproduces in **at least 2 of 3** independent methods —
(a) a fresh browser tab, (b) a full logout/re-login, (c) the API repeated 3×. A failure that
doesn't reproduce ≥2/3 is transient (network blip, data reset, React hydration race) → **do not
file**; note it as transient in the report.

**Gate 2 — Check Jira for an existing ticket.** Query the OGC project before filing so you don't
duplicate:
- Search by the failing endpoint/route, the TC id, and key error text.
- Filter to label `automated-qa` and the relevant component/module.
- If an open ticket matches → reference it, don't re-file. If a *closed* ticket matches and the
  bug is back → reopen/comment rather than filing new (note the regression).

**Human confirmation is the strongest method available.** If the product owner reproduces the
failure by hand from your written steps, that outranks any automated repeat — record it as
"confirmed by hand by \<name\>, \<date\>" and treat Gate 1 as satisfied. Always hand over exact
repro steps (URL, the row to touch, the click, what to look at) rather than only asserting it.

Only a failure that passes **both** gates becomes a new Jira Bug (Step 6 format).

## Withdraw findings loudly

A QA finding that turns out to be wrong must be **retracted in writing, with the evidence that
killed it**, and kept visible in the ledger under a *Withdrawn* heading — not quietly deleted. Two
findings were withdrawn in the 2026-08 analyzer run (one automation artefact, one over-broad
claim); recording them is what makes the surviving findings credible. Before filing, ask of each
finding: *did I drive this the way a user would, and did I test more than one data variant?*
See `spec-delta-run.md` Steps C–D.

## Filing format (Step 6)
- **Type:** Bug · **Summary:** `[QA Auto] TC-XX failed: <short description>`
- **Description:** environment + app version, TC id, exact step, expected vs actual, severity, the 2-of-3 revalidation evidence, screenshot/capture ref.
- **Labels:** `automated-qa` + suite/module tag.
- Use markdown links so they render clickable.
- If Jira is unavailable: put the formatted report under "Failures Requiring Attention" in the QA report.

## Operational hazards are NOT bug state — they live with the harness
A few defects must never be re-triggered because they hang the tab or exhaust the connection
pool. Those are **operational test-driving hazards**, documented in `playwright-harness.md` and
the Blocking-Bug Etiquette in `workflows.md` (e.g. don't `.click()` the Carbon Accept checkbox;
don't retry the NCE POST). Keep those as guardrails regardless of the bug's Jira status — but
verify current status via Step 0.5 Calibration before assuming the hazard still applies.

## "Done" ≠ shipped
A Jira ticket marked **Done** is not proof the fix is live — **this skill is the in-app proof.**
When calibrating (Step 0.5) or testing a "fixed" area, verify the behavior in the running app.
If a Done/closed bug still reproduces (passing the 2-of-3 gate), **reopen/comment with the new
evidence and note the regression** — don't file a fresh ticket, and don't trust the status field.

## Don't re-embed a status table
If you need a point-in-time snapshot for a report, generate it from a Jira query at report time
and put it in the report — not back into the skill. The skill stays evergreen.
