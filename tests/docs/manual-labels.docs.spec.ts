// Capture for the label/print manual pages (OGC-1168), on 3.2.1.11.
// Creates its own known-good Serum numeric test so the run is self-sufficient, finds the CLINICAL
// Add Order route from the nav (the /order/* path is Add GENERIC Order), drives it looking for the
// per-preset label-quantity table, then places a real order and captures both reprint surfaces.
//
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/manual-labels.docs.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { go, shot, settle, saveWalkthrough } from './capture';
import {
  createTestViaRest, setComponentViaRest, setNormalCriticalRangeViaRest, activateViaRest,
  placeLegacyOrder,
} from '../../legacy-order-helper';

const OUT = 'docs-media/manual-labels';
const F: any = { probedAt: new Date().toISOString(), steps: {} };

async function describe(page: any, key: string) {
  const d = await page.evaluate(() => {
    const txt = (e: Element) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      url: location.pathname + location.search,
      headings: [...document.querySelectorAll('h1,h2,h3,h4,h5')].filter(vis).map(txt).filter(Boolean).slice(0, 40),
      // Any table, with its header row AND first data row — so we can tell a label table from a test table
      tables: [...document.querySelectorAll('table')].filter(vis).map(t => ({
        head: [...t.querySelectorAll('thead th, tr:first-child th')].map(txt).filter(Boolean),
        firstRow: [...(t.querySelector('tbody tr')?.children ?? [])].map(txt),
        rows: t.querySelectorAll('tbody tr').length,
      })).slice(0, 14),
      numberInputs: [...document.querySelectorAll('input[type=number]')].filter(vis).map(e => {
        const el = e as HTMLInputElement;
        const lab = document.querySelector(`label[for="${el.id}"]`);
        return { id: el.id, label: lab ? txt(lab) : (el.getAttribute('aria-label') || ''), value: el.value, min: el.min, max: el.max };
      }).slice(0, 40),
      buttons: [...document.querySelectorAll('button,a[role=button]')].filter(vis).map(txt).filter(Boolean).slice(0, 70),
      labelWords: [...document.querySelectorAll('h1,h2,h3,h4,label,th,td,button,legend,p,span')].filter(vis)
        .map(txt).filter(t => t && /label|quantit|print|preset|running total|locked/i.test(t)).slice(0, 40),
      notifications: [...document.querySelectorAll('.cds--inline-notification,.cds--toast-notification,[role=alert]')]
        .filter(vis).map(txt).filter(Boolean).slice(0, 10),
    };
  });
  F.steps[key] = d;
  return d;
}

test('Manual capture — label quantities, printing, reprint', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'manual-labels' });
  test.setTimeout(900_000);
  fs.mkdirSync(OUT, { recursive: true });

  // ---------- A. Seed a known-good Serum numeric test (defaults: labUnit 56 Biochemistry, sampleType 2 Serum) ----------
  const stamp = Date.now().toString().slice(-6);
  const testName = `Manual Demo Glucose ${stamp}`;
  let testId = '';
  try {
    testId = await createTestViaRest(page, { name: testName, code: `MDG${stamp}` });
    await setComponentViaRest(page, testId, { code: 'GLU', label: 'Glucose', resultType: 'N', significantDigits: 1 });
    await setNormalCriticalRangeViaRest(page, testId, { lowNormal: 70, highNormal: 110, lowCritical: 40, highCritical: 400 });
    await activateViaRest(page, testId);
    F.seed = { ok: true, testId, testName };
  } catch (e: any) {
    F.seed = { ok: false, error: String(e).slice(0, 400) };
  }

  // ---------- B. Find the CLINICAL Add Order route from the nav ----------
  await page.goto('/');
  await settle(page);
  F.navRoutes = await page.evaluate(() => {
    const out: any[] = [];
    for (const a of [...document.querySelectorAll('a[href]')]) {
      const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const h = (a as HTMLAnchorElement).getAttribute('href') || '';
      if (/^(add order|order|add generic order|barcode|print)/i.test(t)) out.push({ text: t.slice(0, 40), href: h });
    }
    return out.slice(0, 30);
  });

  // Candidate clinical order routes, most likely first.
  const candidates = ['/SamplePatientEntry', '/order/add', '/AddOrder', '/order/clinical', '/order/enter'];
  for (const r of candidates) {
    if (await go(page, r)) {
      const d = await describe(page, `clinicalCandidate${r.replace(/\W+/g, '_')}`);
      // Only screenshot the ones that actually look like an order form
      if (d.headings.some((h: string) => /order|patient|sample/i.test(h))) {
        await shot(page, info, `Candidate ${r}`);
      }
    }
  }

  // ---------- C. Place a real order with the seeded test, via the known-good legacy wizard ----------
  let accession = '';
  if (F.seed?.ok) {
    try {
      accession = await placeLegacyOrder(page, testName, 'Serum');
      F.order = { ok: true, accession };
    } catch (e: any) {
      F.order = { ok: false, error: String(e).slice(0, 500) };
    }
  }
  await settle(page, 2000);
  await describe(page, 'afterSubmit');
  await shot(page, info, 'After order submit');

  // Does a post-save print dialog / label section appear anywhere now?
  F.postSaveText = await page.evaluate(() => {
    const b = document.body.innerText;
    return {
      hasLabelQuantities: /label quantit/i.test(b),
      hasRunningTotal: /running total/i.test(b),
      hasPrintLater: /print later|skip.*print/i.test(b),
      hasPrintLabels: /print labels?/i.test(b),
      snippet: b.replace(/\s+/g, ' ').slice(0, 700),
    };
  });

  // ---------- D. Reprint surface 1 — Pre-Print Barcodes (page 2, part 1) ----------
  if (await go(page, '/PrintBarcode')) {
    await describe(page, 'printBarcode');
    await shot(page, info, 'Print bar code labels — full page');
    // Crop the Pre-Print panel
    const pre = page.locator('section,div').filter({ hasText: /Pre-Print Barcodes/ }).first();
    await shot(page, info, 'Pre-print barcodes panel', { target: pre });

    // ---------- E. Reprint surface 2 — Existing Orders, with the real accession ----------
    if (accession) {
      const box = page.locator('input[type=text], input:not([type]):not([type=number])').last();
      await box.fill(accession).catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      await settle(page, 3000);
      await describe(page, 'existingOrder');
      await shot(page, info, 'Reprint — existing order loaded');
      const panel = page.locator('section,div').filter({ hasText: /Print Barcodes for Existing Orders/ }).first();
      await shot(page, info, 'Existing orders panel', { target: panel });
    }
  }

  // ---------- F. Label Presets admin (context for both pages) ----------
  if (await go(page, '/MasterListsPage/labelPresets')) {
    await describe(page, 'labelPresets');
    await shot(page, info, 'Label presets list');
  }

  fs.writeFileSync(path.join(OUT, '_findings.json'), JSON.stringify(F, null, 2));
  await saveWalkthrough(page, info);
});
