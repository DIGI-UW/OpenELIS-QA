# UX heuristic pass

Casey (2026-09-28): "Let's add the heuristic pass for all future tests." Every QA run, and every
new spec that drives a page or a form, also asks: **would a person have trouble here?** The
checks live in `helpers/ux-heuristics.ts`; this file is the rulebook and the place to record
Casey's feedback on the calls.

## The heuristics

| Id | Question | How it is judged (first cut) | Verdict |
|---|---|---|---|
| H1 | After a successful Save, does the form clear, move on, or turn read-only? | Same URL, every value still in place and the same lab number = the next Save reuses this order | fail |
| H2 | Does the page open at the top? | window or any scroll container inside `main` scrolled >40px, or the first heading/field outside the viewport, after load | fail |
| H3 | Does feedback appear where the user is looking? | toast / inline notification / role=alert visible in the viewport within 8 s of the action; none at all is also a fail | fail |
| H4 | Does a disabled Save/Submit/Next say why? | disabled primary button with no title/aria-describedby and no "required / complete / select first" text around it | warn |
| H5 | Is "Unsaved changes" true? | badge visible on an untouched page, or right after a successful save | fail |
| H6 | Does reload keep the page usable? | same route and >40 chars of content after reload | fail |
| H7 | One date format, the site's? | distinct formats among visible date inputs (placeholder/value); browser-native date inputs count as their own format | >1 format fail, not the site format warn |
| H8 | No sideways scrolling at laptop/tablet? | document or `main` scrollWidth exceeds clientWidth at 1280 and 1024 (add 768 for tablet runs) | warn |
| H9 | No raw keys, enums, [object Object]? | dotted lower-case keys, UPPER_SNAKE codes, undefined/NaN in `main` text | warn |
| H10 | Can the primary action be reached by keyboard? | Tab (max 60) reaches a Save/Submit/Next with a visible focus ring | warn |
| H11 | Are dropdown values cut off? | a native select option whose text is wider than the box (measured with the control's font), or a Carbon dropdown/combobox value whose scrollWidth exceeds its box. Open menus are not measured yet | warn |

## How to use it in a spec

```ts
import { HeuristicLog, landing, afterSave, afterReload, keyboardReach } from '../helpers/ux-heuristics';
const log = new HeuristicLog(test.info());
log.add(await landing(page, { info: test.info(), siteDateFormat: 'dd/MM/yyyy' }));   // on arrival, before typing
const before = { url: page.url(), values: await readForm(), labNumber: await readLab() };
await save.click();
log.add(await afterSave(page, before, async () => ({ values: await readForm(), labNumber: await readLab() }), { info: test.info(), step: 'Save' }));
await log.flush();
```

- Run `landing()` on every page a spec opens, before typing.
- Run `afterSave()` after every Save / Submit a spec performs.
- The pass reports; it does not fail the spec. Enforce a heuristic in a spec only after Casey has
  confirmed its calls on the review report, and then as a FLIP-WHEN-FIXED tripwire.
- `tests/ux-heuristics-sweep.spec.ts` (TC-HEUR-00) runs the page-level checks over every menu page;
  `tests/ux-heuristics-forms.spec.ts` (TC-HEUR-01..) runs H1/H3/H5 on the order entry forms.
- `npm run heuristics:report` writes `heuristics-report.md`: every warn/fail with page and reason,
  plus a blank "Verdict ok?" column for Casey.

## Reporting

A heuristic fail is a usability finding, not a bug by itself. It enters release-qa like any other
finding only when it shows in the UI and is confirmed by 2 of 3 methods (screenshot + DOM value or
network). Put the heuristic id in the finding ("H1").

## Feedback log (tune the rules here)

| Date | Heuristic | Page | Casey's call | Rule change |
|---|---|---|---|---|
| 2026-09-28 | H1 | Add Environmental Order > Enter Order | Reported: the form does not clear after Save | rule written from this report |
| 2026-09-28 | H2 | Label & Store | Reported: opens part way down the form | rule written from this report |
| 2026-09-28 | H11 | Add Order > Program; Statistics Report year | Reported: dropdown values cut off | rule written from this report |
| 2026-09-28 | H11 | same two pages | Casey: "why did my verified examples not make it?" The first rule only measured sideways text overflow; both menus are clipped vertically by their section (2 of 18 and 4 of 36 options visible) | Added the clipped-menu check (menu rect intersected with every overflow-hidden/auto/scroll/clip ancestor), opened each trigger near the top of the viewport, broadened triggers to combobox inputs, raised the sideways threshold to +8px on option elements only. Both examples now flagged |
| 2026-09-28 | all | all | Casey asked for screenshots and one-click votes | Every non-pass result now takes a screenshot with the offending element outlined (data-heur), PII masked and the idle modal dismissed; findings go to the Heuristic Review page (votes in its db) |
| 2026-09-28 | review | 68 findings | Heuristic Review votes: 44 real (NCE Reporting Unit corrected from false alarm to real, no fix needed), 15 real but deferred (order workflow redesign), 9 false alarms | Deferred findings recorded in references/heuristics-decisions.json and reported in their own section |
| 2026-09-28 | H4 | /Storage Save, /SampleManagement Search | False alarm | Skip Search/Find/Filter/Apply. The /Storage Save is a one-off ruling in heuristics-decisions.json (falseAlarm): a general "pristine form" rule was tried and also hid the Save & Next and Batch Entry Next findings voted real |
| 2026-09-28 | H8 | /Dashboard, /order/clinical at 1024px | False alarm | Only check 1280px by default |
| 2026-09-28 | H11 | Shipment facility filter, Reference Lab Results, audit trail, e-signature log, activity report test list | False alarm | Ignore QA_AUTO fixture names, seeded users and ENUM values (not every QA_ name: "QA_Surface Water" in a narrow box was voted real); "Days outstanding" on Reference Lab Results is a one-off falseAlarm ruling; ignore under 5% of a 50+ option list; a clipped menu counts only below 85% visible. The NCE Reporting Unit / Search By finding was first voted false; Casey then ruled it real but not needing a fix, so it stays flagged and is listed as deferred |
| 2026-09-28 | all | all | Casey: screenshots showed the page, not the behavior | Every shot carries a caption band naming what to look at; H11 shots are taken with the menu open and the cut options outlined; H8 shots scroll to the right edge; H1 shot says how many values survived Save |
