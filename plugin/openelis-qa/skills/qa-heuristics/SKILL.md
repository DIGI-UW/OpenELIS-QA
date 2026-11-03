---
name: qa-heuristics
description: >
  This skill should be used on every OpenELIS QA run and every new spec that drives a page or
  form, and when Casey asks "would a person have trouble with this page?", "run the heuristic
  pass", "UX check", "check for cut-off dropdowns", or wants to review and vote on heuristic
  findings. It runs checks H1 to H12, marks every non-pass with a screenshot, and publishes a
  one-click review page for Casey's votes.
metadata:
  version: "0.1.0"
---

# UX heuristic pass

Casey's rule: judge whether a real person will have trouble with the page, not only whether it
works. It has caught bugs the functional suites missed (a form that never resets after Save,
Label & Store opening 1387 px down, clipped Program and Statistics-year menus).

The checks are in the QA repo: `helpers/ux-heuristics.ts`, `tests/ux-heuristics-sweep.spec.ts`
(every menu route, TC-HEUR-00) and `tests/ux-heuristics-forms.spec.ts` (the flows). The rulebook
and the feedback log of every rule change are in the repo at `references/ux-heuristics.md`;
one-off rulings are in `references/heuristics-decisions.json`.

## The checks

| Id | Check | Fails when |
|---|---|---|
| H1 | Form resets or moves on after Save | Success shown but every field and the lab number are still filled, or a second Save reuses the record |
| H2 | Page opens at the top | Scrolled on arrival. Test in-app navigation **from the bottom of the previous page**, not only fresh loads |
| H3 | Feedback appears in view | Toast or error outside the viewport, or no feedback after an action |
| H4 | Disabled primary action says why | Save/Submit disabled with no visible reason (skip Search, Find, Filter, Apply) |
| H5 | No false "unsaved changes" | Banner or prompt on a page nobody typed into |
| H6 | Reload keeps the page usable | Reload loses the needed context or blanks the page |
| H7 | One date format | Any date not in the site format (`DEFAULT_DATE_LOCALE`; testing is fr-FR dd/MM/yyyy); native date inputs count as their own format |
| H8 | No sideways page scroll | Wider than the viewport by more than 24 px at 1280 px |
| H9 | No raw keys or enums | `sidenav.label.*`-style keys, SHOUTING_ENUMS, `[object Object]` (exclude QA seed names and version strings) |
| H10 | Keyboard reach | Primary action not reachable by Tab |
| H11 | Dropdown values readable | Option text cut off sideways, or the open menu clipped by an overflow ancestor (counts below 85% visible; report "n of m options shown") |
| H12 | Search, not manual select | A long list (10+ options, paged checkbox table, unfiltered dropdown) with no search or filter (ruling R-26). The guard for Modify Order is TC-H12-01 in Casey's QA folder, not yet in the repo |

## How to run each check

- Open dropdowns for real: scroll the trigger near the top (`scrollIntoView({block:'start'})`,
  then `scrollBy(0,-120)`), click, measure, close. Triggers: `button.cds--list-box__field`,
  `[role=combobox]`, `.cds--combo-box input`.
- Every non-pass gets a **marked screenshot**: tag the element `data-heur="<id>"`, outline it,
  scroll it to centre, add a caption band naming what to look at, screenshot, remove the style.
  H11 shots are taken with the menu open; H8 shots scroll to the right edge. Follow `qa-evidence`
  (dismiss "Still There?", mask PII, `animations: 'disabled'`).
- Results go to `test-results/heuristics/*.json`; `npm run heuristics:report` writes the summary.
- **Calibrate against Casey's known examples first.** If a problem he reported is not flagged,
  the rule is wrong: fix the rule before trusting the pass count.
- A heuristic fail is a candidate. It becomes a finding only after the 2 of 3 confirmation.

## Casey's review page

Casey tunes the rules by voting. Give him screenshots and one-click votes, never a long list.

1. Collect every non-pass with its screenshot; dedupe on (id, page, detail); convert PNGs to
   JPEG (max 1600 px wide, quality about 72). From the Mac, tar the folder and move one archive.
2. Write `items.json` (`key, id, verdict, page, step, detail, test, img`) and publish a review page
   (load the `artifact-capabilities` skill first) with screenshots as supporting files
   (`shots/<key>.jpg`) and `capabilities: {db: {}}`. One card per finding: screenshot (click to
   enlarge), heuristic chip, route, reason, **Real problem** / **False alarm** buttons, optional
   note. Keys G = real, B = false alarm, J/K next/previous. Filters by heuristic and vote.
3. Votes live in db collection `votes`, doc id = item key, `{vote:'good'|'bad'|null, note, at}`.
   Check the db with a write, read and delete before handing over the link.
4. Republish the same page for the next run so the URL stays stable. The page from 28 Sep:
   https://claude.ai/artifact/J6J2udtR3wcSxoBV5Xe72b.
5. After Casey votes, read `votes` with ArtifactData. Every false alarm is a rule to tighten;
   every real problem is a candidate finding. Log each rule change with the vote that caused it
   in the repo's `references/ux-heuristics.md` feedback log, in the same QA PR as the rule change.
