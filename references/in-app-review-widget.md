# In-app review widget (UAT checklists shipped on the instance)

Some OpenELIS instances ship a review widget carrying the team's own UAT script — a floating
**Review n/m** pill, bottom-right. When present it is the **preferred place to record verdicts**:
the feedback lands where the people who built the feature already look, and each step comes with
the *expectation* its author had in mind, which is often more specific than the FRS.

First seen: `analyzers.openelis-global.org`, 2026-08 (analyzer guided-setup review).

## Locating it

- Script: `/__review/oe-review-widget.js`
- Host element: `document.getElementById('oe-review-host')` — content is in an **open shadow root**,
  so `document.querySelector` will not see it. Everything goes through
  `document.getElementById('oe-review-host').shadowRoot`.
- State: `localStorage`, keys `oe-review:v2:<deployment>--<STORY-ID>:<hash>:<hash>`, plus
  `…:prefs` and `…:last-identity`.
- Stories are page-scoped: a page shows the stories bound to it, and other stories are reachable
  via **"Show all N server stories"**.

## Driving it

```js
const sr = document.getElementById('oe-review-host').shadowRoot;
const clean = s => (s||'').replace(/\s+/g,' ').trim();

// open the panel
[...sr.querySelectorAll('button')].find(b => /Review \d+\/\d+/.test(b.textContent))?.click();

// switch story
[...sr.querySelectorAll('button')].find(b => /^Profile and setup/.test(clean(b.textContent)))?.click();

// note field for the ACTIVE step, then the verdict
const setV = (el,v) => { const p = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);
  el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
  el.dispatchEvent(new Event('change',{bubbles:true,composed:true})); };
setV([...sr.querySelectorAll('input')].find(i => /What happened/i.test(i.placeholder||'')), 'note text');
[...sr.querySelectorAll('button')].find(b => b.textContent.trim()==='Fail').click();
```

- Steps reveal **one at a time**; answering step N surfaces N+1. To read the whole script up front,
  select each story and collect elements whose text matches `/^[1-9][A-Z]/`.
- Verdicts are `Pass` / `Fail` / `N/A`. An answered step **can be changed** — re-select it and
  click a different verdict; the selected one carries `aria-pressed="true"` and class `on`.
- A page-level note is available via **"+ Note about this page"** → textarea → **Add note**. Use it
  for links (full report, PR) — it captures the current page path automatically.
- Other controls: `All steps` / `To do` / `Failed` filters, `Copy report`, `Download report`,
  `Reset review`.

## Identity — read this before submitting

- Signed **out**, the widget shows a free-text **"Your name (required)"** field.
- Signed **in**, identity comes from the OpenELIS session and the free-text value is overwritten —
  the panel shows *"Reviewing as \<session user\>"*. On a shared `admin` login every review files as
  that account regardless of who ran it.
- **Consequence:** you cannot attribute a signed-in submission to an individual. If attribution
  matters, have the reviewer submit under their own login, or name the reviewer in the notes.

## Submitting

- `POST /api/OpenELIS-Global/__review/<deployment>/submissions` → `201`
  `{"id":N,"reviewer":{"login":"…","name":"…"}}`; banner reads *"Review submitted as \<name\>"*.
- **Submitting is a publish action — get explicit user permission first.** Fill everything in, show
  the reviewer the drafted notes, then let them confirm or click it themselves.
- **Every submit creates a NEW record; nothing is overwritten or deduplicated.** The returned `id`
  is sequential, so `id: 5` means four submissions preceded yours.
- There is **no GET** on the submissions collection (`Cannot GET …`), and local storage keeps no
  `submittedAt` or `submissionId` — so **you cannot tell from the client whether this review was
  already submitted**. Ask the user before re-submitting; if both of you have submitted, expect
  duplicate records that only the server owner can reconcile.

## Session behavior

Answers are held locally and **survive a session timeout**: on expiry the widget shows *"Sign in to
submit this review. Your answers are saved here meanwhile."* Log back in, return to the page, and
the marks are intact — but the reviewer name resets to the session user. Note that the OpenELIS
login page itself may throw a raw `System Error: Unexpected token '<'` dialog on an expired-session
bounce; dismiss it and log in normally.
