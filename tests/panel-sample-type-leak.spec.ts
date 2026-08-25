// RED regression: a panel that spans sample types drags ALL of its members onto
// whichever sample type it is ordered under.
//
// EVIDENCE (2026-08-25, testing.openelis-global.org 3.2.2.0)
//   Panel  QA Panel Test 20260811  (id 17) is offered under BOTH Serum and
//   Immunohistochemistry specimen -- /rest/PanelCreate returns it in both
//   groups. Its members are:
//       Amylase                -- sample types: [Serum]
//       Actin Smooth Muscle    -- sample types: [Immunohistochemistry specimen]
//
//   Ordering the panel against a SERUM sample (order DEV01260000000000575)
//   produced, straight from /rest/LogbookResults:
//       Amylase(Serum)
//       Actin Smooth Muscle(Serum)     <-- should not exist
//
//   Actin Smooth Muscle has no Serum configuration at all, yet an analysis for
//   it now sits on a serum tube. It will appear on worklists, be resultable and
//   be validatable against a specimen it cannot be run on.
//
// NOT AN ARTEFACT OF THE HARNESS
//   The tick goes through the VISIBLE label in the Serum section (see the note
//   on tickByExactLabel in tests/docs/order-helpers.ts) -- the same element a
//   human clicks -- and the assertion reads the server, not the screen.
//
// HONEST CAVEAT
//   An earlier hand-driven order, DEV01260000000000564, came back as Amylase +
//   Creatinine with no Actin Smooth Muscle. That is consistent with Amylase
//   having been ticked directly rather than through the panel, so it is NOT
//   evidence that this behaviour is a recent regression. Treat 564 as
//   inconclusive, not as a passing baseline.
//
// This test is expected to FAIL until the ordering path filters panel members
// by the sample type being ordered. It flips green when that is fixed.
//
//   npx playwright test -c chains-features.config.ts --project=chains //     tests/panel-sample-type-leak.spec.ts

import { test, expect } from '@playwright/test';

const API = '/api/OpenELIS-Global/rest';
const PANEL_NAME = 'QA Panel Test 20260811';
const SERUM_MEMBER = 'Amylase';
const FOREIGN_MEMBER = /Actin Smooth Muscle/i;

// Orders produced by catalog-feature-chains.docs.spec.ts. Override to re-check a
// different one:  PANEL_LEAK_LAB=DEV0126... npx playwright test ...
const LAB = process.env.PANEL_LEAK_LAB ?? '';

test('TC-PANEL-LEAK-0: the panel really does span two sample types', async ({ page }) => {
  const res = await page.request.get(`${API}/PanelCreate`);
  expect(res.status()).toBe(200);
  const groups = ((await res.json()).existingPanelList ?? []) as Array<any>;
  const spans = groups
    .filter((g: any) => (g.panels ?? []).some((p: any) => p.panelName === PANEL_NAME))
    .map((g: any) => String(g.typeOfSampleName ?? ''));
  expect(spans.length, `fixture panel ${PANEL_NAME} no longer spans multiple sample types`).toBeGreaterThan(1);
});

test('TC-PANEL-LEAK-1: the foreign member is genuinely foreign', async ({ page }) => {
  const res = await page.request.get(`${API}/test-catalog/tests?pageSize=1000`);
  expect(res.status()).toBe(200);
  const rows = ((await res.json()).rows ?? []) as Array<any>;
  const foreign = rows.find((t: any) => FOREIGN_MEMBER.test(String(t.name ?? '')));
  expect(foreign, 'fixture test Actin Smooth Muscle is gone').toBeTruthy();
  const types = (foreign.sampleTypes ?? []).map((x: any) => String(x));
  expect(types.some((t: string) => /serum/i.test(t)),
    'Actin Smooth Muscle now lists Serum as a sample type -- the premise of this defect no longer holds').toBe(false);
});

test('TC-PANEL-LEAK-2: ordering the panel on Serum must not create the IHC analysis', async ({ page }) => {
  test.skip(!LAB, 'set PANEL_LEAK_LAB to a lab number ordered with this panel against Serum');
  const res = await page.request.get(`${API}/LogbookResults?labNumber=${LAB}&doRange=false&finished=false`);
  expect(res.status()).toBe(200);
  const names = (((await res.json()).testResult ?? []) as Array<any>).map((r) => String(r.testName ?? ''));
  expect(names.some((n) => n.includes(SERUM_MEMBER)), 'the Serum member should be present').toBe(true);
  expect(names.some((n) => FOREIGN_MEMBER.test(n)),
    `order ${LAB} carries an Immunohistochemistry-only test on a Serum sample: ${names.join(' | ')}`).toBe(false);
});
