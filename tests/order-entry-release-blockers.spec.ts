/**
 * OpenELIS Global — the order-entry findings that are holding the release.
 *
 * WHY THIS FILE EXISTS
 * The release call on `develop` is HOLD, and the reasons are recorded on OGC-1201 as
 * source-level findings: someone read the code and described what it does. Nothing in the
 * suite asserted any of them. A full green run on develop therefore said nothing about the
 * very things blocking the release, which made "the suite is green" and "we can ship" two
 * unrelated statements. This file is the bridge: every case here fails today, for a stated
 * reason, and turns GREEN only when the blocker is actually fixed.
 *
 * HOW TO READ A test.fail() HERE
 * Each case asserts the SPEC — what the product should do — and is marked `test.fail()`
 * while the product does something else. Playwright reports an expected failure as a pass,
 * so the suite stays green while the blocker is open and goes RED the moment it is fixed.
 * When that happens the fix is to delete the `test.fail()` line and keep the assertion.
 * Never relax the assertion to match the code; that converts a blocker into a spec.
 *
 * ROUTES, verified live on develop 5fe0ecb, 2026-09-12
 *   /order/clinical/enter   Enter Order, the first step. `/AddOrder` is NOT this page:
 *                           it resolves to a 308-byte legacy shell with no form at all.
 *   /order/clinical/qa      QA Review.
 *
 * SCOPE
 * The lab number cluster (OGC-1201 findings AH, AI, AJ) and the duplicate checklist
 * (finding J). The remaining blockers — AL patient-optional ordering and reference-range
 * evaluation, AS the fabricated EQA patient, AR the sticky edit-mode flag — need a saved
 * order and are driven from tests/docs/order-helpers.ts; they are not in this file yet.
 * Their absence is a coverage gap, not a judgement that they are fixed.
 */
import { test, expect } from '@playwright/test';

const ENTER = '/order/clinical/enter';
const QA = '/order/clinical/qa';

/** The page hydrates slowly; every case gives it the same generous settle. */
async function open(page: any, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
}

test.describe('Order entry — release blockers', () => {

  test('BLK-LAB-1 — the lab number is generated when the form loads', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1201 finding AH. Decision D-057 says generate on mount.
    //
    // Generation itself is not broken: GET /rest/SampleEntryGenerateScanProvider returns a
    // number, and clicking the affordance fills the field (observed: DEV01260000000000006).
    // Nothing calls it on mount, so the one field the form marks required is empty and stays
    // empty. Checked at 9s, well past hydration.
    test.fail();
    await open(page, ENTER);
    const value = await page.locator('#labNumber').inputValue();
    console.log(`BLK-LAB-1 labNumber after load = ${JSON.stringify(value)}`);
    expect(value,
      'the lab number field is empty on load; the form opens with its only required field unfilled')
      .not.toBe('');
  });

  test('BLK-LAB-2 — the Generate Lab Number control can be reached by keyboard', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1201 finding AI. WCAG 2.1.1 Level A.
    //
    // The affordance is <a class="cds--link generate-link">Generate Lab Number</a> — no href,
    // no tabindex, no role. An anchor without an href is not in the tab order, so a
    // keyboard-only user cannot reach the only control that fills the required field.
    //
    // This case walks the REAL tab order rather than reading attributes, because attributes
    // are the explanation and traversal is the evidence. Observed on develop 5fe0ecb: focus
    // leaves #labNumber and lands on "Print Labels", skipping the control entirely.
    test.fail();
    await open(page, ENTER);

    const control = page.getByText(/generate lab number/i).first();
    await expect(control, 'the Generate Lab Number control is not on the page at all').toBeVisible();

    await page.locator('#labNumber').focus();
    const reached: string[] = [];
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      await page.keyboard.press('Tab');
      const here = await page.evaluate(() => {
        const a = document.activeElement as any;
        if (!a) return { label: 'none', isGenerate: false };
        const label = `${a.tagName}#${a.id || ''}:${(a.innerText || a.value || '').toString().trim().slice(0, 24)}`;
        return { label, isGenerate: /generate lab number/i.test(a.innerText || '') };
      });
      reached.push(here.label);
      found = here.isGenerate;
    }
    console.log(`BLK-LAB-2 tab order from #labNumber: ${JSON.stringify(reached)}`);
    expect(found,
      `tabbing from the lab number field never reaches "Generate Lab Number"; focus went ${JSON.stringify(reached)}. ` +
      'A keyboard-only user cannot fill the one field this form requires (WCAG 2.1.1 Level A).')
      .toBe(true);
  });

  test('BLK-LAB-3 — a disabled Generate control says so, in the DOM', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1201 finding AJ.
    //
    // The component takes a `disabled` prop, but a Carbon <Link> renders neither the
    // `disabled` attribute nor `aria-disabled`. So during the in-flight request the control
    // looks and behaves enabled: every repeat click consumes another lab number, and a
    // screen reader is told nothing.
    //
    // The spec asserted here is the weaker, sufficient one: whatever element this is, it
    // must be capable of expressing a disabled state. A <button> satisfies it; an <a> with
    // an aria-disabled binding satisfies it; the current bare <a> does not.
    test.fail();
    await open(page, ENTER);

    const shape = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a,button')]
        .find(x => /generate lab number/i.test((x as HTMLElement).innerText || '')) as any;
      if (!a) return null;
      return {
        tag: a.tagName,
        outer: a.outerHTML.slice(0, 200),
        canExpressDisabled: a.tagName === 'BUTTON' || a.hasAttribute('aria-disabled'),
      };
    });
    console.log('BLK-LAB-3 ' + JSON.stringify(shape));
    expect(shape, 'no Generate Lab Number control found').not.toBeNull();
    expect(shape!.canExpressDisabled,
      `the control is a bare <${shape!.tag}> that can express neither "disabled" nor "aria-disabled", ` +
      'so its in-flight state is invisible to both the browser and assistive technology')
      .toBe(true);
  });

  test('BLK-LAB-4 — a field marked required to sighted users is marked required in the DOM', async ({ page }) => {
    // [FLIP-WHEN-FIXED] Found 2026-09-12 while confirming AH/AI/AJ; filed with that cluster.
    //
    // The visible label reads "Lab Number *". The asterisk is the only carrier of that fact:
    // the input has required=false and no aria-required. A screen reader user is not told
    // the field is mandatory, and nothing stops submission reaching the server to find out.
    //
    // Small next to the keyboard trap above, but it is the same control and the same fix
    // pass, so it belongs in the same ticket rather than a separate one.
    test.fail();
    await open(page, ENTER);

    const state = await page.evaluate(() => {
      const el = document.querySelector('#labNumber') as HTMLInputElement | null;
      if (!el) return null;
      const label = [...document.querySelectorAll('label')]
        .find(l => /lab number/i.test((l as HTMLElement).innerText || ''));
      return {
        labelText: (label as HTMLElement | undefined)?.innerText.trim() || '',
        required: el.required,
        ariaRequired: el.getAttribute('aria-required'),
      };
    });
    console.log('BLK-LAB-4 ' + JSON.stringify(state));
    expect(state, '#labNumber is not on the page').not.toBeNull();

    // Guard the oracle: this case only means something if the label really does claim required.
    expect(state!.labelText,
      'the label no longer marks this field required, so this case is testing nothing')
      .toMatch(/\*/);

    const exposed = state!.required || state!.ariaRequired === 'true';
    expect(exposed,
      `the label says "${state!.labelText}" but the input carries required=${state!.required} ` +
      `and aria-required=${state!.ariaRequired}; the requirement is visual only`)
      .toBe(true);
  });

  test('BLK-QA-1 — QA Review shows one acceptance checklist, not two', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1201 finding J. The fix is a delete: OrderQA.jsx renders a
    // second "QA Checklist" tile with NO guard at all, its own state, its own config load
    // and its own POST, alongside the real intake acceptance checklist.
    //
    // Observed on develop 5fe0ecb: headings are ["QA Review", "Intake Acceptance",
    // "QA Checklist"], and the string "QA Checklist" appears twice in the page text.
    //
    // Counting headings rather than raw text, so that renaming the tile cannot make this
    // pass while the duplicate is still rendered.
    test.fail();
    await open(page, QA);

    const seen = await page.evaluate(() => {
      const main = (document.querySelector('main') || document.body) as HTMLElement;
      const headings = [...main.querySelectorAll('h1,h2,h3,h4')]
        .map(e => (e as HTMLElement).innerText.trim()).filter(Boolean);
      return {
        headings,
        checklistHeadings: headings.filter(h => /checklist|acceptance/i.test(h)),
      };
    });
    console.log('BLK-QA-1 headings=' + JSON.stringify(seen.headings));

    // Guard the oracle: on a page that rendered nothing, zero checklists would "pass".
    expect(seen.headings.length,
      'QA Review rendered no headings at all; this case cannot count anything')
      .toBeGreaterThan(0);

    expect(seen.checklistHeadings,
      `QA Review renders ${seen.checklistHeadings.length} acceptance checklists: ` +
      `${JSON.stringify(seen.checklistHeadings)}. Two checklists means two states, two config ` +
      'loads and two POSTs for one decision, and the user cannot tell which one counts.')
      .toHaveLength(1);
  });
});
