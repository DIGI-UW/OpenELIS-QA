import { Page, Locator, expect } from '@playwright/test';

/**
 * Helpers for driving OpenELIS's Carbon-for-React admin *rule builders*
 * (Calculated Value Tests + Reflex Tests Management) reliably from Playwright.
 *
 * These encode findings from live QA on testing.openelis-global.org (v3.2.1.10,
 * 2026-07). The builders share a card / "Add Rule" / "View Rule" / per-card
 * "Submit" layout and a set of Carbon widgets that do NOT behave like normal
 * inputs. Read the per-function notes before changing anything.
 *
 * Field id scheme (per rule card, `<c>` = card index):
 *   Calculated Value: <c>_name, <c>_<i>_sample, <c>_<i>_testresult,
 *                     <c>_<i>_addoperation, <c>_<i>_mathfunction, <c>_<i>_integer,
 *                     <c>_sample (final), <c>_finalresult, <c>_resultdictionary
 *   Reflex:           <c>_rulename, <c>_overall,
 *                     <c>_<i>_sample (condition AND action share this id — use nth),
 *                     <c>_<i>_conditionTestId, <c>_<i>_relation, <c>_<i>_value,
 *                     <c>_<i>_reflexTestId, <c>_<i>_inote, <c>_<i>_xnote
 */

/** Sample-type ids (SAMPLE_TYPE_ACTIVE display list). */
export const SAMPLE = {
  URINES: '1',
  SERUM: '2',
  PLASMA: '3',
  WHOLE_BLOOD: '4',
} as const;

/** Reflex condition relation enum values (GET /rest/reflexrule-options). */
export const RELATION = {
  EQUALS: 'EQUALS',
  NOT_EQUALS: 'NOT_EQUALS',
  INSIDE_NORMAL_RANGE: 'INSIDE_NORMAL_RANGE',
  OUTSIDE_NORMAL_RANGE: 'OUTSIDE_NORMAL_RANGE',
  LESS_THAN_OR_EQUAL: 'LESS_THAN_OR_EQUAL',
  GREATER_THAN_OR_EQUAL: 'GREATER_THAN_OR_EQUAL',
  LESS_THAN: 'LESS_THAN',
  GREATER_THAN: 'GREATER_THAN',
  BETWEEN: 'BETWEEN',
} as const;

/** Calculated-value operation-insert types (`<c>_<i>_addoperation` select). */
export const OPERATION = {
  TEST_RESULT: 'TEST_RESULT',
  MATH_FUNCTION: 'MATH_FUNCTION',
  INTEGER: 'INTEGER',
  PATIENT_ATTRIBUTE: 'PATIENT_ATTRIBUTE',
} as const;

/** Locate an element by its exact id (ids start with a digit, so `#0_x` is invalid CSS). */
export function byId(page: Page, id: string): Locator {
  return page.locator(`[id="${id}"]`);
}

/**
 * Set a React-controlled <select> by option value.
 *
 * WHY: Carbon/React selects ignore `el.value = x`. You must invoke the prototype
 * value setter and dispatch a bubbling `change` so React's onChange runs. Verified
 * for sample, addoperation, relation, math-function and dictionary-value selects.
 */
export async function setReactSelect(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value',
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Set a React-controlled <select> by (case-insensitive) visible option text. */
export async function setReactSelectByText(locator: Locator, text: string): Promise<void> {
  await locator.evaluate((el, text) => {
    const sel = el as HTMLSelectElement;
    const opts = Array.from(sel.options);
    const opt =
      opts.find(o => o.textContent?.trim().toLowerCase() === text.toLowerCase()) ??
      opts.find(o => o.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
    if (!opt) throw new Error(`option not found for text "${text}"`);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value',
    )!.set!;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
}

/** Set a React-controlled text/number <input> (native setter + input/change). */
export async function setReactInput(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/**
 * Commit a test-search autocomplete ("typeahead") selection RELIABLY, returning
 * the committed display text.
 *
 * WHY THIS EXISTS — the #1 gotcha of these builders:
 *  - Every test field (operand, final result, reflex condition test, reflex
 *    action test) is a Carbon autocomplete.
 *  - Setting the input via the native setter shows the text but does NOT store
 *    the underlying test id, so the rule saves with an EMPTY testId /
 *    reflexTestId (a silent data-loss bug we hit repeatedly).
 *  - A plain option mouse-click ALSO fails: the input blurs and the list closes
 *    before the option's onClick fires.
 *  - The only reliable commit is: focus → type the prefix → wait for the
 *    suggestion list → ArrowDown → Enter.
 *
 * PRECONDITION: the row's sample-type <select> must already be set, otherwise the
 * suggestion list is empty.
 *
 * DIRTY-STATE CAVEAT: after a lot of prior programmatic mutation on the same
 * card, even this can fail to bind the id. If a later GET shows an empty id,
 * reload the page to a clean form and re-run this once (see ReflexTestPage
 * .createReflexRuleViaUI for the reload-retry pattern).
 */
export async function commitTypeahead(
  page: Page,
  input: Locator,
  query: string,
  expectContains?: string,
): Promise<string> {
  await input.click();
  await input.fill('');
  await input.pressSequentially(query, { delay: 20 });

  // Suggestions render as <li> inside .suggestions-container; the first is auto-active.
  const option = page.locator('.suggestions-container li, li.suggestion-active').first();
  await option.waitFor({ state: 'visible', timeout: 5000 });

  await input.press('ArrowDown');
  await input.press('Enter');

  const val = (await input.inputValue()).trim();
  expect(val, `typeahead "${query}" did not commit a value (empty id risk)`).not.toBe('');
  if (expectContains) {
    expect(val.toLowerCase()).toContain(expectContains.toLowerCase());
  }
  return val;
}

/**
 * Click the Submit button for a given rule card.
 *
 * WHY force: each card has its OWN submit button, and the DOM `disabled`
 * attribute can be STALE — React's props say the button is enabled while the
 * attribute lags behind, so the button LOOKS greyed-out but still posts. A
 * force click dispatches the event regardless of the stale attribute.
 */
export async function submitCard(page: Page, cardIndex: number): Promise<void> {
  const submit = page.locator('button[type="submit"]').nth(cardIndex);
  await submit.click({ force: true });
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Click "Add Rule" and return the index of the newly-added blank card.
 *
 * Always append a fresh card rather than assuming card 0 is blank — on a page
 * that already has saved rules, card 0 is an existing rule.
 */
export async function addRuleCard(page: Page, kind: 'calc' | 'reflex'): Promise<number> {
  const suffix = kind === 'reflex' ? '_rulename' : '_name';
  const sel = `[id$="${suffix}"]`;
  const before = await page.locator(sel).count();
  await page.getByRole('button', { name: /add rule/i }).click();
  await expect.poll(async () => page.locator(sel).count(), { timeout: 5000 })
    .toBeGreaterThan(before);
  return maxCardIndex(page, kind);
}

/** Highest card index currently on the page (by id prefix). */
export async function maxCardIndex(page: Page, kind: 'calc' | 'reflex'): Promise<number> {
  const suffix = kind === 'reflex' ? '_rulename' : '_name';
  return page.locator(`[id$="${suffix}"]`).evaluateAll((els, suffix) => {
    let max = -1;
    for (const el of els) {
      const m = /^(\d+)/.exec(el.id.replace(suffix, ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  }, suffix);
}

/** Find the card index whose name/rulename field currently holds `name`, or -1. */
export async function cardIndexByName(
  page: Page,
  kind: 'calc' | 'reflex',
  name: string,
): Promise<number> {
  const suffix = kind === 'reflex' ? '_rulename' : '_name';
  return page.locator(`[id$="${suffix}"]`).evaluateAll((els, { suffix, name }) => {
    for (const el of els) {
      if ((el as HTMLInputElement).value === name) {
        const m = /^(\d+)/.exec(el.id.replace(suffix, ''));
        if (m) return parseInt(m[1], 10);
      }
    }
    return -1;
  }, { suffix, name });
}

/**
 * Expand the "View Rule" accordion for a card so its builder fields render.
 * Cards render View Rule bars in card order, so the nth bar maps to the card.
 */
export async function expandCard(page: Page, cardIndex: number): Promise<void> {
  const bar = page.getByText('View Rule', { exact: false }).nth(cardIndex);
  if (await bar.isVisible().catch(() => false)) {
    await bar.click();
  }
}
