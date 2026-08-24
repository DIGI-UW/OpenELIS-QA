// Regression guard for the locale-agnostic domain pickers.
//
// The whole point of selectSampleTypeAgnostic/pickTestAgnostic is that a `prefer` hint DEGRADES
// to "any workable option" instead of to nothing. That degrade path is what the old
// name-pinned helpers lacked, and its absence is what made an indonesiademo-only label read as a
// product defect on every other instance. So drive both pickers with a hint that CANNOT match
// anything and assert they still land on something orderable.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/agnostic-picker-guard.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go } from './capture';
import { selectSampleTypeAgnostic, pickTestAgnostic, domainSampleTypes, testCountForSampleType } from './order-helpers';

const NONSENSE = /zzz-no-such-sample-type-on-any-instance/i;

for (const domain of ['environmental', 'vector'] as const) {
  test(`agnostic pickers degrade past an unmatched prefer hint (${domain})`, async ({ page }) => {
    test.setTimeout(120000);
    await go(page, `/order/${domain}/enter`);

    // Structural precondition: this instance must offer at least one workable type, else the
    // assertion below would be testing the data gap rather than the degrade path.
    const offered = await domainSampleTypes(page, domain);
    const counts = await Promise.all(offered.map((s) => testCountForSampleType(page, s.id)));
    const workable = offered.filter((_, i) => counts[i] > 0);
    console.log(`[guard] ${domain} offered=${offered.length} workable=${workable.length}`);
    test.skip(!workable.length, `${domain}: no sample type with orderable tests on this instance`);

    const picked = await selectSampleTypeAgnostic(page, domain, { prefer: NONSENSE });
    expect(picked, 'an unmatched prefer hint must still yield a workable sample type').not.toBeNull();
    expect(picked!.viaPreference, 'a nonsense hint must not report as preferred').toBe(false);
    expect(picked!.testCount, 'the chosen sample type must carry orderable tests').toBeGreaterThan(0);
    console.log(`[guard] ${domain} degraded to ${picked!.label} (${picked!.id}) tests=${picked!.testCount}`);

    // Same for the test picker: names come from the API, so a nonsense hint only reorders.
    const test1 = await pickTestAgnostic(page, picked!.id, NONSENSE);
    expect(test1, 'an unmatched prefer hint must still tick an API-listed test').not.toBe('');
    console.log(`[guard] ${domain} ticked ${test1}`);
  });
}
