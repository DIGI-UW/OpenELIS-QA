// Completes the page-4 capture: fires the reflex rule created by manual-reflex.docs.spec.ts.
// The previous attempt hand-rolled the result-entry navigation and found no rows; this uses the
// documented flag-aware helper instead.
//
//   BASE=https://testing.openelis-global.org ACC=DEV01260000000000128 \
//     npx playwright test --project=docs tests/docs/manual-reflex-fire.docs.spec.ts
import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { go, shot, settle, saveWalkthrough } from './capture';
import { openResultEntryByAccession } from '../../legacy-order-helper';

const OUT = 'docs-media/manual-reflex-fire';
const ACC = process.env.ACC || '';
const F: any = { probedAt: new Date().toISOString(), accession: ACC, steps: {} };

async function describe(page: any, key: string) {
  const d = await page.evaluate(() => {
    const txt = (e: Element) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 130);
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      url: location.pathname + location.search,
      tables: [...document.querySelectorAll('table')].filter(vis).map(t => ({
        head: [...t.querySelectorAll('thead th, tr:first-child th')].map(txt).filter(Boolean),
        rows: t.querySelectorAll('tbody tr').length,
        firstRows: [...t.querySelectorAll('tbody tr')].slice(0, 5).map(r => [...r.children].map(txt)),
      })).slice(0, 6),
      editable: [...document.querySelectorAll('tbody input,tbody select,tbody textarea')].filter(vis)
        .map(e => ({ tag: e.tagName, type: (e as HTMLInputElement).type || '', id: (e as HTMLElement).id,
                     name: (e as HTMLInputElement).name || '', disabled: (e as HTMLInputElement).disabled })).slice(0, 25),
      notifications: [...document.querySelectorAll('.cds--inline-notification,.cds--toast-notification,[role=alert],[role=status]')]
        .filter(vis).map(txt).filter(Boolean).slice(0, 12),
      reflexWords: [...document.querySelectorAll('div,span,p,td,strong,h3,h4')].filter(vis)
        .map(txt).filter(t => t && t.length < 200 && /reflex|calculated|added for|triggered/i.test(t)).slice(0, 15),
      buttons: [...document.querySelectorAll('button')].filter(vis).map(txt).filter(Boolean).slice(0, 35),
    };
  });
  F.steps[key] = d;
  return d;
}

test('Manual capture — fire the reflex rule and record what is reported', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'manual-reflex-fire' });
  test.setTimeout(900_000);
  fs.mkdirSync(OUT, { recursive: true });
  if (!ACC) throw new Error('Set ACC to the accession of an order carrying the trigger test');

  // Establish an origin first — the helper probes configuration-properties with a relative fetch,
  // which throws on about:blank.
  await page.goto('/');
  await settle(page, 1200);

  // ---------- 1. Open result entry using the documented, flag-aware helper ----------
  await openResultEntryByAccession(page, ACC, 'Biochemistry');
  await settle(page, 2500);
  const before = await describe(page, 'resultEntryLoaded');
  await shot(page, info, 'Result entry loaded for the order');
  F.rowsFound = before.tables.reduce((n: number, t: any) => n + t.rows, 0);

  // ---------- 2. Enter a value above the rule's threshold ----------
  F.filled = await page.evaluate(() => {
    const set = (el: HTMLInputElement, v: string) => {
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d?.set?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const cands = [...document.querySelectorAll('input')].filter(e => {
      const el = e as HTMLInputElement;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || el.disabled || el.readOnly) return false;
      if (['checkbox', 'radio', 'hidden', 'search', 'submit'].includes(el.type)) return false;
      // skip the lab-number search box
      return !/search|labno|accession/i.test(el.id + ' ' + el.name + ' ' + (el.placeholder || ''));
    });
    if (!cands.length) return { ok: false, reason: 'no editable input found' };
    const el = cands[0] as HTMLInputElement;
    set(el, '250');
    return { ok: true, id: el.id, name: el.name, type: el.type };
  });
  await settle(page, 1000);
  await shot(page, info, 'Result of 250 entered — above the rule threshold of 200');

  // ---------- 3. Save, and record exactly what comes back ----------
  const saveBtn = page.getByRole('button', { name: /^Save$/ }).first();
  F.saveClicked = await saveBtn.isVisible().catch(() => false);
  if (F.saveClicked) await saveBtn.click().catch(() => {});
  await settle(page, 6000);
  await describe(page, 'afterSave');
  await shot(page, info, 'Immediately after saving — the system reports what it added');
  F.afterSaveText = await page.evaluate(() => {
    // The reflex report is a toast/notification, so grab those specifically as well as the body
    const t = [...document.querySelectorAll('.cds--toast-notification,.cds--inline-notification,[role=alert],[role=status]')]
      .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { toasts: t, body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 900) };
  });

  // ---------- 4. Reload and confirm the added analysis is on the sample ----------
  await openResultEntryByAccession(page, ACC, 'Biochemistry');
  await settle(page, 3000);
  const after = await describe(page, 'reloadedAfterReflex');
  F.rowsAfter = after.tables.reduce((n: number, t: any) => n + t.rows, 0);
  await shot(page, info, 'Sample reloaded — the reflexed test appears alongside the trigger');

  fs.writeFileSync(path.join(OUT, '_findings.json'), JSON.stringify(F, null, 2));
  await saveWalkthrough(page, info);
});
