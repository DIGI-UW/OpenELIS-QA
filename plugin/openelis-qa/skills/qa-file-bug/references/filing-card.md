# The filing card

One card per finding. Casey reads the card, not your reasoning, so it must stand alone.

```markdown
### <Short title a developer would search for>

**Where:** <module, screen, step>
**What happens:** <one or two sentences, observed behaviour only>
**Expected:** <what should happen, and where that comes from>
**Steps:**
1. ...
**Severity:** <Critical | High | Medium | Low>: <why, in terms of patient safety, data, workflow>
**Owner:** <from the rulings owner table>
**Recommendation:** <file new | comment on OGC-x | merge into finding Y | downgrade | withdraw>

**QA checks**
- Confirmed: <which 2 or 3 methods, with dates; how the UI was driven; evidence links>
- Searched: <terms or JQL; related or duplicate keys, or "none found in open and Done">
- Rulings: <"none apply", or R-xx considered and why it does not cover this>
- Spec: <document and version, and the line or acceptance criterion this breaks>
- Build: <server, deployed commit, date>
- Not checked: <what this finding does not cover, data variants not tried, other roles or locales>
```

## Rules for the claim

- Write what was observed, not what must be true everywhere. "On the 2 orders tried" beats
  "always".
- Severity follows impact. Patient safety, wrong results or data loss: High or Critical. A
  missing message: Low. If you are unsure, say so and give both.
- "Impossible", "never", "every": only with evidence for every case. These words caused the
  1 Nov correction comments.
- Name related findings by their ticket key, not a session-local number (R-numbers collide
  between sessions).
- No patient names or IDs from real sites. QA seed data is fine.
- Security findings: the card stays in the conversation; the detail goes only into the
  restricted ticket.

## The hook

The plugin refuses `createJiraIssue` when the description lacks a **QA checks** section with all
six lines (Confirmed, Searched, Rulings, Spec, Build, Not checked) filled in. When the section is
complete it asks Casey to approve the create. If Casey says "file it" for a finding whose card
you have not written, write the card first.
