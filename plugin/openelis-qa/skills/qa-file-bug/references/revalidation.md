# Revalidation: confirm 2 of 3

One definition for every OpenELIS QA session. It replaces the older `openelis-bug-revalidation`
skill (fresh tab / re-login / API x3), which is folded in as methods A and C below.

## The three methods

| Method | What it is | Counts when |
|---|---|---|
| **UI** | A clickthrough a lab user could do: Claude in Chrome in a foreground tab, or a headed or recorded Playwright run. Start from a fresh tab or a fresh login, and reach the page the way a user would (menu or deep link a user would have). | The failure shows on screen with a screenshot or video |
| **Network / API** | The request behind the screen, repeated 3 times about 2 s apart, with the CSRF header. | 2 of 3 attempts show the same failure |
| **Database, server log or code** | psql read, a server log line, a thread dump, or the code at the deployed commit that produces the behaviour. | It explains the failure the other two saw |

**Rule:** a finding needs **2 of the 3, and one of them must be UI** (Casey: "it's really only an
issue if this happens in the UI"). If Casey reproduces it by hand from your written steps, that
counts as the UI method and outranks any automated repeat; record "confirmed by hand by Casey,
<date>".

Critical findings (patient safety, data loss, access) need all three.

## Shortcuts

- Static text (typos, raw i18n keys, wrong label): one UI capture plus the source string or key.
- A known bug seen in a new place: one UI capture plus the existing ticket.

## Before you trust a failure

- Was the data there? Run the Data Census; a reset instance fails everything.
- Was it the harness? Check the failure reason (JSON reporter), the locator, the fixture, and
  whether another session shared the auth file or the output folder.
- Was the network slow? Raise timeouts and rerun before counting a timeout as a product failure.
- Was the tab in the background? Background tabs throttle timers; repeat in the foreground.
- Did you drive it like a user? Programmatic shortcuts (setting React state, skipping a step)
  produce failures no user can reach.
- Did you try a second data variant? One record is not a rule.

## Decision

| UI | Second method | Decision |
|---|---|---|
| shows it | confirms | Finding: write the filing card |
| shows it | does not confirm | Flaky: note it, rerun next round |
| does not show it | confirms | Lead (API or code only): note it, not a finding |
| does not show it | does not confirm | Transient: note only |

## Code for the API repeat

```ts
const statuses: number[] = [];
for (let i = 0; i < 3; i++) {
  statuses.push(await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { 'X-CSRF-Token': localStorage.getItem('CSRF') || '' } });
    return r.status;
  }, '/api/OpenELIS-Global/rest/<endpoint>'));
  await page.waitForTimeout(2000);
}
```
