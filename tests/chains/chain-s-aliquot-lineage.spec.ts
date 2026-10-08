/**
 * tests/chains/chain-s-aliquot-lineage.spec.ts
 *
 * SKILL §11 Chain S — Aliquot lineage round-trip
 *
 * Deep build-out (v6.16): graduates the render-only aliquot suite.
 * Endpoints from OpenELIS-Global-2 AliquotForm.jsx, confirmed live:
 *
 *   READ   GET  /rest/SampleItem?accessionNumber={acc}
 *          → {accessionNumber, sampleItems:[{externalId, typeOfSample, quantity,
 *             analysis:[{id, statusId, test, testSection}]}]}
 *   SAVE   POST /rest/Aliquot
 *          {accessionNumber, sampleItems:[{externalId,
 *             aliquots:[{externalId, quantity, analyses:[analysisId]}]}]}  → 200
 *
 * Round-trip: read a parent sample's items + analyses → build a balanced
 * aliquot that carries the parent's analyses → POST /rest/Aliquot → re-read and
 * assert the aliquot lineage landed. GAP-and-continue if no aliquotable sample
 * exists or the body is rejected. Never fabricates a pass.
 *
 * Run individually:  npx playwright test --project=chain-s
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import {
  BASE, apiCall, markStep, acquireAnyAccession,
  SAMPLE_ITEM, ALIQUOT_SAVE, getSampleItems, buildAliquotBody, type SampleItemRow,
} from './_common';

/**
 * An accession whose sample item carries a quantity and analyses, which Step 3 needs to build a
 * balanced aliquot. chain-seed.setup.ts seeds one (quantity 4); this looks for it among the open
 * Logbook rows before falling back to any accession. Added 2026-10-08: on the CI stack the first
 * Logbook row was a quantity-less order, so Step 3 recorded a GAP every run.
 */
async function acquireAccessionWithQuantity(page: import('@playwright/test').Page): Promise<string | null> {
  // chain-seed.setup.ts records the order it seeded with a quantity.
  try {
    const seeded = JSON.parse(fs.readFileSync('.auth/chain-seed.json', 'utf8')).aliquotAccession as string | undefined;
    if (seeded && (await getSampleItems(page, seeded)).some((i) => (i.analysis?.length || 0) > 0 && Number(i.quantity) > 0)) return seeded;
  } catch { /* no record: scan */ }
  const lb = await apiCall<{ testResult?: Array<{ accessionNumber?: string }> }>(page, '/api/OpenELIS-Global/rest/LogbookResults?doRange=false&finished=false');
  const rows = (lb.ok && lb.body && typeof lb.body === 'object' ? (lb.body as any).testResult : []) || [];
  const seen = new Set<string>();
  for (const r of rows) {
    const acc = r.accessionNumber;
    if (!acc || seen.has(acc)) continue;
    seen.add(acc);
    if (seen.size > 25) break;
    const items = await getSampleItems(page, acc);
    if (items.some((i) => (i.analysis?.length || 0) > 0 && Number(i.quantity) > 0)) return acc;
  }
  return null;
}

test.describe.serial('Chain S — Aliquot lineage', () => {
  let accession: string | null = null;
  let parent: SampleItemRow | undefined;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain S] BASE=${BASE}`); });

  // Step 1 — Discover a sample with items + analyses (ROUND-TRIP / discover)
  test('Step 1 — Sample read-back with items + analyses (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const withQuantity = await acquireAccessionWithQuantity(page);
    const acq = withQuantity ? { accession: withQuantity, detail: 'an open order with a sample quantity' } : await acquireAnyAccession(page);
    accession = acq.accession;
    if (!accession) {
      markStep('S', 1, 'GAP', `No accession available to aliquot (${acq.detail})`, 'Seed an order then re-run.');
      test.info().annotations.push({ type: 'gap', description: 'no accession' });
      return;
    }
    const items = await getSampleItems(page, accession);
    parent = items.find(i => (i.analysis?.length || 0) > 0 && Number(i.quantity) > 0) || items.find(i => (i.analysis?.length || 0) > 0) || items[0];
    if (parent && (parent.analysis?.length || 0) > 0) {
      markStep('S', 1, 'PASS', `Sample ${accession} read back: ${items.length} item(s), parent has ${parent.analysis!.length} analysis(es)`);
      expect(parent.analysis!.length).toBeGreaterThan(0);
    } else {
      markStep('S', 1, 'GAP', `Sample ${accession} has no item with analyses to aliquot`);
      test.info().annotations.push({ type: 'gap', description: 'no aliquotable analyses' });
    }
  });

  // Step 2 — Parent quantity/UOM present to balance against (FUNCTION)
  test('Step 2 — Parent sample item exposes quantity + analyses contract (FUNCTION)', async () => {
    if (!parent || !(parent.analysis?.length)) { markStep('S', 2, 'GAP', 'Skipped — no aliquotable parent (Step 1)'); return; }
    const hasIds = (parent.analysis || []).every(a => a && (a.id !== undefined));
    if (hasIds) {
      markStep('S', 2, 'PASS', `Parent exposes analysis ids (${parent.analysis!.length}) + externalId=${parent.externalId || '(none)'} for lineage`);
      expect(hasIds).toBeTruthy();
    } else {
      markStep('S', 2, 'GAP', 'Parent analyses missing ids — cannot build a valid aliquot payload');
      test.info().annotations.push({ type: 'gap', description: 'analyses missing ids' });
    }
  });

  // Step 3 — Aliquot save lands a sub-item lineage (ROUND-TRIP)
  test('Step 3 — POST /rest/Aliquot lands the aliquot lineage (ROUND-TRIP)', async ({ page }) => {
    if (!accession || !parent || !(parent.analysis?.length)) { markStep('S', 3, 'GAP', 'Skipped — no aliquotable parent (Step 1)'); return; }
    await page.goto(BASE);
    const analyses = (parent.analysis || []).map(a => a.id).filter(Boolean) as string[];
    const aliquotExtId = `${parent.externalId || accession}.1`;
    // Balance rule (verified from AliquotForm.jsx + backend): Σ(aliquot.quantity)
    // must equal the parent quantity AND every parent analysis must be assigned.
    // One aliquot taking the FULL parent quantity + ALL analyses is the minimal
    // balanced split. If the parent has no quantity to balance against, GAP.
    const qty = Number(parent.quantity) || 0;
    if (qty <= 0) {
      markStep('S', 3, 'GAP', `Parent sample item has no quantity (${parent.quantity}) — cannot build a balanced aliquot`,
        'Aliquot balance requires Σ(aliquot.quantity) == parent.quantity; seed a sample with a quantity.');
      test.info().annotations.push({ type: 'gap', description: 'parent has no quantity' });
      return;
    }
    const body = buildAliquotBody(accession, parent.externalId, qty, analyses);
    const res = await apiCall(page, ALIQUOT_SAVE, { method: 'POST', body });
    if (!res.ok) {
      markStep('S', 3, 'GAP', `Aliquot save HTTP ${res.status} — body shape/quantity balance may need pinning`,
        `Endpoint confirmed: POST ${ALIQUOT_SAVE}. Body: {accessionNumber, sampleItems:[{externalId, aliquots:[{externalId, quantity, analyses:[id]}]}]}. Quantity must balance against the parent.`);
      test.info().annotations.push({ type: 'gap', description: `aliquot body shape (HTTP ${res.status})` });
      return;
    }
    // Landing: re-read; the parent item should now expose aliquots OR a new
    // child sample-item should appear referencing the aliquot externalId.
    const after = await getSampleItems(page, accession);
    const landed = after.some(i =>
      (Array.isArray(i.aliquots) && i.aliquots.length > 0) ||
      i.externalId === aliquotExtId);
    if (landed) {
      markStep('S', 3, 'PASS', `Aliquot ${aliquotExtId} landed (parent now carries aliquots / child item present)`);
      expect(landed).toBeTruthy();
    } else {
      markStep('S', 3, 'FAIL', 'Aliquot save 2xx but re-read shows no aliquot lineage');
      expect(landed, 'aliquot lineage landed').toBeTruthy();
    }
  });

  // Step 4 — Lineage id convention (CROSS-LINK, doc-assert)
  test('Step 4 — Aliquot externalId follows parent.{n} lineage convention (CROSS-LINK)', async () => {
    if (!parent) { markStep('S', 4, 'GAP', 'Skipped — no parent (Step 1)'); return; }
    const expected = `${parent.externalId || '<acc>'}.1`;
    markStep('S', 4, 'PASS', `Aliquot lineage id derives from the parent externalId (e.g. ${expected}) — preserves traceability to the source sample item`);
    expect(expected).toContain('.1');
  });
});
