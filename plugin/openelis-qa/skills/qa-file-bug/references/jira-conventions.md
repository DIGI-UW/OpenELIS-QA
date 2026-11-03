# Jira conventions for QA tickets

- **Site:** `uwdigi.atlassian.net`, cloudId `57b4e32d-23d4-4a71-8985-82ac0274d145`, project **OGC**.
- **Type:** Bug. **Status:** Backlog (new bugs start there).
- **Labels:** `automated-qa`, `qa-found`, plus the module (`order-entry`, `test-catalog`,
  `analyzer-integration`, `i18n`, `security`, ...).
- **Contract:** the single-select Contract field (SILNAS Indonesia, CPHL PNG, DIGI-UW / I-TECH,
  Madagascar e-SIL, Haiti) when the work is for a deployment; PNG work is CPHL PNG. Look up the
  field id with `getJiraIssueTypeMetaWithFields` for OGC Bug if you don't have it.
- **Assignee:** per the owner table in `RULINGS.md` (Mozzy `5cda85983e6fd40fe82c7ea3`).
- **Links:** Relates to the parent epic or story, and to any related bug found in the search.
- **Workflow:** Backlog, Ready, In Progress, In Review, Acceptance, Done. Acceptance means
  "deployed to testing, product owner tests it as a user". QA closes verified bugs, Acceptance
  included, with an evidence comment first.

## Description layout (match recent tickets, e.g. OGC-1598)

```markdown
**Where:** ...
**What happens:** ...
**Steps:**
1. ...
**Expected:** ...
**Seen on:**
* <server>, <commit>, <date> (orders or records used)
**Evidence:** <Drive links to screenshots and video>
**Acceptance:** OpenELIS-QA `<spec file>` <TC id> carries `test.fail()`; it goes red when this is
fixed, then the `test.fail()` comes out.

**QA checks**
- Confirmed: ...
- Searched: ...
- Rulings: ...
- Spec: ...
- Build: ...
- Not checked: ...
```

Use markdown links so they render. One finding per ticket unless Casey asks for one ticket per
area; then list items as numbered sub-findings, each with its own steps and tripwire.

## Comments

Comments need no approval, but a comment that says "fixed", "regressed" or "not reproduced"
carries the same evidence: server, commit, date, what was run, and the result. Correct a wrong
comment with a new comment that says what was wrong.
