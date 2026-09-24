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
 * The lab number cluster (OGC-1201 findings AH, AI, AJ), the duplicate checklist (J), and
 * the patient blockers (AL, AS). AR — the sticky edit-mode flag that carried the previous
 * order's lab number and patient onto a new form — is covered in order-entry-state.spec.ts:
 * TC-OE-02 (lab number) and TC-OE-10 (patient), both passing since PR #4282 (2026-09-24).
 */
import { test, expect } from '@playwright/test';
import { setSelectByOption, checkByLabel } from './docs/order-helpers';

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
    // FIXED on develop dbb71ba6, 2026-09-14. The test.fail() marker that used to sit here
    // has been removed, and the assertion below is unchanged -- which is the whole point of
    // the flip-when-fixed pattern: the suite went RED to report good news, and the fix to a
    // red flip-when-fixed case is to delete the marker, never to weaken what it asserts.
    //
    // Evidence for the flip: CI run 34839250807 reported "Expected to fail, but passed" for
    // this case against develop dbb71ba6, while the same spec against a local develop
    // 5fe0ecb build (three days older) still failed as expected. Two builds, opposite
    // results, same assertion. From here this case guards the fix against regression.
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
    // FIXED on develop dbb71ba6, 2026-09-14. The test.fail() marker that used to sit here
    // has been removed, and the assertion below is unchanged -- which is the whole point of
    // the flip-when-fixed pattern: the suite went RED to report good news, and the fix to a
    // red flip-when-fixed case is to delete the marker, never to weaken what it asserts.
    //
    // Evidence for the flip: CI run 34839250807 reported "Expected to fail, but passed" for
    // this case against develop dbb71ba6, while the same spec against a local develop
    // 5fe0ecb build (three days older) still failed as expected. Two builds, opposite
    // results, same assertion. From here this case guards the fix against regression.
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
    // FIXED on develop dbb71ba6, 2026-09-14. The test.fail() marker that used to sit here
    // has been removed, and the assertion below is unchanged -- which is the whole point of
    // the flip-when-fixed pattern: the suite went RED to report good news, and the fix to a
    // red flip-when-fixed case is to delete the marker, never to weaken what it asserts.
    //
    // Evidence for the flip: CI run 34839250807 reported "Expected to fail, but passed" for
    // this case against develop dbb71ba6, while the same spec against a local develop
    // 5fe0ecb build (three days older) still failed as expected. Two builds, opposite
    // results, same assertion. From here this case guards the fix against regression.
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
    // FIXED on develop dbb71ba6, 2026-09-14. The test.fail() marker that used to sit here
    // has been removed, and the assertion below is unchanged -- which is the whole point of
    // the flip-when-fixed pattern: the suite went RED to report good news, and the fix to a
    // red flip-when-fixed case is to delete the marker, never to weaken what it asserts.
    //
    // Evidence for the flip: CI run 34839250807 reported "Expected to fail, but passed" for
    // this case against develop dbb71ba6, while the same spec against a local develop
    // 5fe0ecb build (three days older) still failed as expected. Two builds, opposite
    // results, same assertion. From here this case guards the fix against regression.
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

/**
 * The patient half of the blockers: AL and AS.
 *
 * These are separated from the cluster above because they are about CONFIGURATION and
 * DATA rather than about a control on a page, and because probing them corrected the
 * findings as written on OGC-1201. Both corrections are recorded on the cases themselves.
 *
 * AR, the sticky isEditMode flag, is covered in order-entry-state.spec.ts (TC-OE-02 for the
 * lab number, TC-OE-10 for the patient); fixed by PR #4282.
 */
test.describe('Order entry — the patient blockers', () => {

  const CONFIG = '/api/OpenELIS-Global/rest/configuration-properties';

  /** Read the properties the BACKEND chooses to serve the frontend. */
  async function configProps(page: any): Promise<Record<string, string>> {
    return page.evaluate(async (url: string) => {
      const r = await fetch(url, { credentials: 'include' });
      return r.ok ? r.json() : {};
    }, CONFIG);
  }

  test('BLK-AL-1 — the frontend is told whether a patient is required', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1201 finding AL, and a CORRECTION to how it is written there.
    //
    // The ticket says ClinicalOrderEnter.jsx "never reads ConfigurationContext", so the
    // existing FormFields.Field.PatientRequired setting is never consulted. True, but it
    // understates the problem and points the fix at the wrong layer: the setting is not in
    // the payload the frontend receives AT ALL. Reading ConfigurationContext harder would
    // not help.
    //
    // Verified on develop 5fe0ecb, 2026-09-12: GET /rest/configuration-properties returns 47
    // keys and not one of them is a patient-required flag. /rest/properties and
    // /rest/open-configuration-properties do not carry it either, and /rest/form-fields and
    // /rest/FormFields are both 404.
    //
    // So the fix needs a BACKEND change to expose the setting, before any frontend change
    // can honour it. That also makes it the prerequisite for the agreed design: a "No
    // patient" override "gated by PatientRequired" cannot be gated by a value the browser
    // is never sent.
    // FIXED on develop dbb71ba6, 2026-09-14. The test.fail() marker that used to sit here
    // has been removed, and the assertion below is unchanged -- which is the whole point of
    // the flip-when-fixed pattern: the suite went RED to report good news, and the fix to a
    // red flip-when-fixed case is to delete the marker, never to weaken what it asserts.
    //
    // Evidence for the flip: CI run 34839250807 reported "Expected to fail, but passed" for
    // this case against develop dbb71ba6, while the same spec against a local develop
    // 5fe0ecb build (three days older) still failed as expected. Two builds, opposite
    // results, same assertion. From here this case guards the fix against regression.
    await open(page, ENTER);

    const props = await configProps(page);
    const keys = Object.keys(props);
    console.log(`BLK-AL-1 configuration-properties has ${keys.length} keys`);

    // Guard the oracle: an empty or failed response would make the search below pass
    // vacuously by finding nothing to object to.
    expect(keys.length,
      'configuration-properties returned nothing, so this case cannot tell a missing key from a missing response')
      .toBeGreaterThan(10);

    // NOTE THE EXCLUSION, because the first version of this case did not have it and
    // reported a false pass. PATIENT_NATIONAL_ID_REQUIRED contains both "PATIENT" and
    // "REQUIRED" and matches any naive pattern, but it is a different setting entirely: it
    // governs whether a national ID is mandatory ON A PATIENT RECORD, not whether an ORDER
    // needs a patient at all. Matching it here would report the setting as present and
    // served while the thing the order form needs to gate on is still missing.
    //
    // That near-miss is why the assertion names what it is looking for rather than pattern
    // matching loosely: it is the difference between "a key mentioning patients and
    // requirements exists" and "the frontend can tell whether this order needs a patient".
    const patientRequired = keys.filter(k =>
      /patient/i.test(k) && /requir/i.test(k) && !/national|alias|gps/i.test(k));
    console.log(`BLK-AL-1 patient-required keys = ${JSON.stringify(patientRequired)} ` +
      `(national-id flag, which is a DIFFERENT setting, = ${JSON.stringify(props['PATIENT_NATIONAL_ID_REQUIRED'])})`);
    expect(patientRequired,
      'the backend serves the frontend no "is a patient required for this order" setting, so the ' +
      'order form cannot gate on one however it is written, and the agreed "No patient" override ' +
      'cannot be gated by PatientRequired as designed. Keys served: ' + JSON.stringify(keys))
      .not.toEqual([]);
  });

  test('BLK-AL-2 — National ID, when the config requires it, is marked required in the DOM', async ({ page }) => {
    // [FLIP-WHEN-FIXED] Required fields are marked for sighted users only.
    //
    // CORRECTED 2026-09-24. The first version of this case checked `#patientId`. On develop
    // that control is the patient SEARCH box ("Enter subject number, national ID, or ST
    // number"), which should never be required, so the case was failing against the wrong
    // oracle. The field the configuration governs is National ID on the New Patient form
    // (`#nationalId`, CreatePatientForm.tsx), which renders a "*" when
    // PATIENT_NATIONAL_ID_REQUIRED is not "false" and sets neither `required` nor
    // `aria-required`. Same defect as BLK-LAB-4, on a second control. On develop there are
    // 74 visual-only required markers in 30 files and no `aria-required` anywhere.
    test.fail();
    await open(page, ENTER);

    const props = await configProps(page);
    const flag = String(props['PATIENT_NATIONAL_ID_REQUIRED'] ?? '').toLowerCase();
    console.log(`BLK-AL-2 PATIENT_NATIONAL_ID_REQUIRED = ${JSON.stringify(flag)}`);

    // Not a defect if the instance does not ask for it. Skip rather than pass.
    test.skip(flag === 'false',
      'PATIENT_NATIONAL_ID_REQUIRED is "false" on this instance, so National ID is optional');

    const np = page.locator('button').filter({ hasText: /^\s*New Patient\s*$/ }).first();
    await expect(np, 'the entry form must offer New Patient').toBeVisible({ timeout: 15_000 });
    await np.click();
    await expect(page.locator('#nationalId'), 'New Patient must render a National ID field').toBeAttached({ timeout: 15_000 });

    const field = await page.evaluate(() => {
      const el = document.querySelector('#nationalId') as HTMLInputElement | null;
      if (!el) return null;
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) as HTMLElement | null : null;
      return {
        labelText: (label?.innerText || '').trim(),
        required: el.required,
        ariaRequired: el.getAttribute('aria-required'),
      };
    });
    console.log('BLK-AL-2 #nationalId ' + JSON.stringify(field));
    expect(field, 'no #nationalId control').not.toBeNull();

    // Guard the oracle: the case only means something if the label really claims required.
    expect(field!.labelText,
      'the National ID label no longer shows "*", so this case is testing nothing')
      .toMatch(/\*/);

    const exposed = field!.required || field!.ariaRequired === 'true';
    expect(exposed,
      `the label says "${field!.labelText}" but #nationalId carries required=${field!.required} ` +
      `and aria-required=${field!.ariaRequired}; the requirement is visual only`)
      .toBe(true);
  });

  test('BLK-AL-3 — a missing required National ID is named to the user, before or after save', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1240 part 2, written 2026-09-24.
    //
    // New Patient with names, birth date and sex but no National ID, while
    // PATIENT_NATIONAL_ID_REQUIRED is true. Today the form's save gate accepts
    // `lastName || nationalId`, the POST answers 400 "patientProperties.nationalId: Cannot be blank",
    // and NOTHING is shown: no notification, no inline error, the page does not move. Measured
    // twice on testing 3.2.2.0. The fix may name it before the POST (a save requirement) or after it
    // (surfacing the field error); either satisfies this case, because the spec is "the user is told".
    //
    // Canaries over the same path: BLK-AL-2 (New Patient renders #nationalId) and TC-OE-04 in
    // order-entry-state.spec.ts (New Patient opens empty). Read this case's recorded failure from
    // the JSON report before trusting its expected failure.
    test.fail();
    test.setTimeout(120_000);
    await open(page, ENTER);
    const props = await configProps(page);
    test.skip(String(props['PATIENT_NATIONAL_ID_REQUIRED'] ?? '').toLowerCase() === 'false',
      'PATIENT_NATIONAL_ID_REQUIRED is "false" on this instance, so National ID is optional');

    const posts: Array<{ status: number; body: string }> = [];
    page.on('response', async (r) => {
      if (r.request().method() === 'POST' && /SamplePatientEntry/.test(r.url())) {
        let body = ''; try { body = (await r.text()).slice(0, 200); } catch { body = ''; }
        posts.push({ status: r.status(), body });
      }
    });

    await page.locator('button').filter({ hasText: /^\s*New Patient\s*$/ }).first().click();
    await expect(page.locator('#nationalId'), 'New Patient must render a National ID field').toBeAttached({ timeout: 15_000 });
    await page.getByPlaceholder(/last name/i).first().fill('Probeson');
    await page.getByPlaceholder(/first name/i).first().fill('Nina');
    await page.getByPlaceholder(/dd\/mm\/yyyy/i).first().fill('15/05/1990');
    await checkByLabel(page, /^female$/i);
    await setSelectByOption(page, /^\s*Whole Blood\s*$/i);
    await page.waitForTimeout(1_000);
    await page.getByRole('button', { name: /save & next|save and next/i }).first().click();
    await page.waitForTimeout(6_000);

    const seen = await page.evaluate(() => {
      const nid = document.querySelector('#nationalId') as HTMLInputElement | null;
      const notes = [...document.querySelectorAll('.cds--inline-notification, .cds--toast-notification, .cds--actionable-notification, .cds--form-requirement')]
        .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
      return { notes, nidInvalid: nid?.getAttribute('aria-invalid') ?? null, nidValue: nid?.value ?? null };
    });
    console.log('BLK-AL-3 ' + JSON.stringify({ seen, posts }));
    const told = seen.nidInvalid === 'true' || seen.notes.some((t) => /national/i.test(t));
    expect(told,
      'a new patient without the required National ID must be named to the user; instead: ' +
      `notes=${JSON.stringify(seen.notes)} aria-invalid=${seen.nidInvalid} posts=${JSON.stringify(posts)}`)
      .toBe(true);
  });

  test('BLK-AS-1 — no order is attached to a fabricated placeholder patient', async ({ page }) => {
    // [CANARY] OGC-1201 finding AS. Read the note below before treating a pass as good news.
    //
    // EQASampleEntry.jsx satisfies the same save gate as AL by FABRICATING a patient rather
    // than allowing none: on tick it looks for a sentinel record and creates it if absent,
    // with lastName, firstName and nationalId all set to the literal string "NULL",
    // gender "M" and birthDate 01/01/1900. Because birth date and gender are both present,
    // ResultLimitServiceImpl takes the age- and sex-scoped branch, so every EQA result is
    // evaluated against a male aged 126 and flagged normal or abnormal on that basis. Not a
    // blank -- a confident, plausible-looking wrong answer.
    //
    // THIS CASE IS NOT MARKED test.fail(), and that is deliberate.
    //
    // The sentinel is created lazily, by the first EQA order on an instance. A fresh develop
    // stack has never placed one, so the record genuinely does not exist yet and the correct
    // result today is a PASS. Marking it test.fail() would make a clean instance report a
    // failure, which is worse than useless.
    //
    // So it is a canary, not a flip-when-fixed: it passes on an instance that has not been
    // contaminated and goes RED the first time anything fabricates the sentinel. On an
    // instance with real EQA history it should fail immediately, and that failure is the
    // reproduction. A pass here means "not yet", never "fixed".
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const found = await page.evaluate(async () => {
      const base = '/api/OpenELIS-Global/rest';
      const hits: any[] = [];
      let probed = 0;
      for (const q of ['lastName=NULL', 'nationalId=NULL', 'firstName=NULL']) {
        const r = await fetch(`${base}/patient-search-results?${q}`, { credentials: 'include' });
        if (!r.ok) continue;
        probed++;
        const j = await r.json().catch(() => null);
        for (const row of (j?.patientSearchResults || [])) {
          const name = `${row.lastName ?? ''} ${row.firstName ?? ''}`.trim();
          if (/^NULL/i.test(row.lastName || '') || /^NULL$/i.test(row.nationalId || '')) {
            hits.push({ q, name, nationalId: row.nationalId, dob: row.birthDate ?? row.dob, gender: row.gender });
          }
        }
      }
      return { probed, hits };
    });
    console.log(`BLK-AS-1 searches=${found.probed} sentinelMatches=${found.hits.length} ${JSON.stringify(found.hits.slice(0, 3))}`);

    // Guard the oracle: if none of the searches answered, "no hits" means nothing.
    expect(found.probed,
      'no patient search endpoint answered, so finding no sentinel proves nothing')
      .toBeGreaterThan(0);

    expect(found.hits,
      'a placeholder patient record exists. Every EQA sample on this instance is aggregated ' +
      'under one fake person and its results are evaluated against that person\'s age and sex.')
      .toEqual([]);
  });
});
