// Capture for the "verify a reflex rule before trusting it" manual page (OGC-1168, page 4), 3.2.1.11.
// Creates a realistic rule (Glucose > 200 -> add HbA1c), then DRIVES it: places an order, enters a
// boundary result, saves, and records what the system actually reports back. The whole point of the
// page is that there is no dry-run, so the evidence has to come from a real firing.
//
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/manual-reflex.docs.spec.ts
import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { go, shot, settle, saveWalkthrough } from './capture';
import {
  createTestViaRest, setComponentViaRest, setNormalCriticalRangeViaRest, activateViaRest,
  placeLegacyOrder,
} from '../../legacy-order-helper';

const OUT = 'docs-media/manual-reflex';
const F: any = { probedAt: new Date().toISOString(), steps: {} };

/** In-page fetch against any /rest path, CSRF-aware (the bare request fixture lacks the token). */
async function rest(page: any, p: string, method: 'GET' | 'POST', payload?: any) {
  return page.evaluate(async ({ p, method, payload }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const init: any = { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, credentials: 'include' };
    if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
    const r = await fetch('/api/OpenELIS-Global/rest' + p, init);
    let body: any; try { body = await r.json(); } catch { body = (await r.text().catch(() => '')).slice(0, 400); }
    return { status: r.status, body };
  }, { p, method, payload });
}

async function describe(page: any, key: string) {
  const d = await page.evaluate(() => {
    const txt = (e: Element) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      url: location.pathname + location.search,
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(txt).filter(Boolean).slice(0, 30),
      tables: [...document.querySelectorAll('table')].filter(vis).map(t => ({
        head: [...t.querySelectorAll('thead th, tr:first-child th')].map(txt).filter(Boolean),
        rows: t.querySelectorAll('tbody tr').length,
        firstRows: [...t.querySelectorAll('tbody tr')].slice(0, 4).map(r => [...r.children].map(txt)),
      })).slice(0, 8),
      notifications: [...document.querySelectorAll('.cds--inline-notification,.cds--toast-notification,[role=alert],[role=status]')]
        .filter(vis).map(txt).filter(Boolean).slice(0, 12),
      // Anything that names a reflex/calculated test having been added
      reflexWords: [...document.querySelectorAll('*')].filter(vis)
        .map(txt).filter(t => t && t.length < 160 && /reflex|calculated|added for|triggered/i.test(t)).slice(0, 15),
      buttons: [...document.querySelectorAll('button')].filter(vis).map(txt).filter(Boolean).slice(0, 40),
    };
  });
  F.steps[key] = d;
  return d;
}

test('Manual capture — verifying a reflex rule end to end', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'manual-reflex' });
  test.setTimeout(1_200_000);
  fs.mkdirSync(OUT, { recursive: true });

  const stamp = Date.now().toString().slice(-6);

  // ---------- A. Trigger test: a numeric Serum glucose ----------
  const trigName = `Demo Glucose ${stamp}`;
  const reflexName = `Demo HbA1c ${stamp}`;
  let trigId = '', reflexId = '';
  try {
    trigId = await createTestViaRest(page, { name: trigName, code: `DGL${stamp}` });
    await setComponentViaRest(page, trigId, { code: 'GLU', label: 'Glucose', resultType: 'N', significantDigits: 1 });
    await setNormalCriticalRangeViaRest(page, trigId, { lowNormal: 70, highNormal: 110, lowCritical: 40, highCritical: 400 });
    await activateViaRest(page, trigId);

    // ---------- B. Reflex target test ----------
    reflexId = await createTestViaRest(page, { name: reflexName, code: `DHB${stamp}` });
    await setComponentViaRest(page, reflexId, { code: 'HBA1C', label: 'HbA1c', resultType: 'N', significantDigits: 1 });
    await setNormalCriticalRangeViaRest(page, reflexId, { lowNormal: 4, highNormal: 5.6, lowCritical: 3, highCritical: 15 });
    await activateViaRest(page, reflexId);
    F.seed = { ok: true, trigId, trigName, reflexId, reflexName };
  } catch (e: any) {
    F.seed = { ok: false, error: String(e).slice(0, 500) };
  }

  // ---------- C. Create a realistic reflex rule via REST ----------
  // Glucose > 200 -> add HbA1c, with an internal note. sampleId is the SAMPLE TYPE id (2 = Serum).
  if (F.seed?.ok) {
    F.reflexOptions = await rest(page, '/reflexrule-options', 'GET');
    const rulePayload = {
      ruleName: `High glucose adds HbA1c ${stamp}`,
      overall: 'ANY',
      toggled: true,
      active: true,
      conditions: [{ sampleId: '2', testName: trigName, testId: trigId, relation: 'GREATER_THAN', value: '200', value2: '0' }],
      actions: [{ sampleId: '2', reflexTestName: reflexName, reflexTestId: reflexId,
                  internalNote: 'Added automatically because glucose exceeded 200.', externalNote: '', addNotification: 'Y' }],
    };
    F.ruleCreate = await rest(page, '/reflexrule', 'POST', rulePayload);
    F.rulesAfter = await rest(page, '/reflexrules', 'GET');
    // Trim to just our rule so the findings file stays readable
    if (Array.isArray(F.rulesAfter?.body)) {
      F.ourRule = F.rulesAfter.body.find((r: any) => String(r.ruleName || '').includes(stamp)) ?? null;
      F.rulesAfter = { status: F.rulesAfter.status, count: F.rulesAfter.body.length };
    }
  }

  // ---------- D. Capture the rule as an admin sees it ----------
  if (await go(page, '/MasterListsPage/reflex')) {
    await describe(page, 'reflexAdmin');
    await shot(page, info, 'Reflex tests management with the new rule');
    // Expand the rule body if a View Rule accordion is present
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,[role=button]')].find(e => /view rule/i.test(e.textContent || ''));
      if (b) (b as HTMLElement).click();
    });
    await settle(page, 1200);
    await describe(page, 'reflexAdminExpanded');
    await shot(page, info, 'Rule conditions and actions expanded');
  }

  // ---------- E. Place an order for the trigger test ----------
  let accession = '';
  if (F.seed?.ok) {
    try {
      accession = await placeLegacyOrder(page, trigName, 'Serum');
      F.order = { ok: true, accession };
    } catch (e: any) {
      F.order = { ok: false, error: String(e).slice(0, 500) };
    }
  }

  // ---------- F. Enter a result ABOVE the threshold and save ----------
  if (accession) {
    // Unified results route is on for this instance; try it, then fall back to legacy /result.
    for (const attempt of ['unified', 'legacy']) {
      if (attempt === 'unified') {
        await go(page, '/Results');
        await page.getByLabel(/lab unit/i).first().selectOption({ label: 'Biochemistry' }).catch(() => {});
        await page.getByPlaceholder(/search by lab number|lab number/i).first().fill(accession).catch(() => {});
        await page.getByRole('button', { name: /load results|search/i }).first().click().catch(() => {});
      } else {
        await go(page, '/result?type=order&doRange=false');
        await page.getByPlaceholder(/accession|lab number/i).first().fill(accession).catch(() => {});
        await page.getByRole('button', { name: /^Search$/ }).first().click().catch(() => {});
      }
      await settle(page, 3000);
      const d = await describe(page, `resultEntry_${attempt}`);
      if (d.tables.some((t: any) => t.rows > 0)) { F.resultEntryVia = attempt; break; }
    }
    await shot(page, info, 'Result entry — trigger test awaiting a value');

    // Fill the first editable result field with 250 (above the 200 threshold)
    const filled = await page.evaluate(() => {
      const set = (el: HTMLInputElement, v: string) => {
        const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        d?.set?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const cands = [...document.querySelectorAll('tbody input[type=text], tbody input[type=number], tbody input:not([type])')]
        .filter(e => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && !(e as HTMLInputElement).disabled; });
      if (!cands.length) return false;
      set(cands[0] as HTMLInputElement, '250');
      return true;
    });
    F.resultFilled = filled;
    await settle(page, 800);
    await shot(page, info, 'Boundary result entered — 250, above the rule threshold');

    // Save
    await page.getByRole('button', { name: /^Save$/ }).first().click().catch(() => {});
    await settle(page, 5000);
    await describe(page, 'afterResultSave');
    await shot(page, info, 'After saving — what the system reports back');
    F.afterSaveBodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200));
  }

  // ---------- G. Did the reflex actually add an analysis to the sample? ----------
  if (accession) {
    F.sampleAfter = await rest(page, `/SampleEdit?accessionNumber=${accession}`, 'GET');
    if (F.sampleAfter?.body) {
      const b = F.sampleAfter.body;
      F.sampleAfter = { status: F.sampleAfter.status, summary: JSON.stringify(b).slice(0, 1500) };
    }
    // Reload result entry so any added analysis shows
    await go(page, '/result?type=order&doRange=false');
    await page.getByPlaceholder(/accession|lab number/i).first().fill(accession).catch(() => {});
    await page.getByRole('button', { name: /^Search$/ }).first().click().catch(() => {});
    await settle(page, 3000);
    await describe(page, 'resultEntryAfterReflex');
    await shot(page, info, 'Sample after the rule fired — added test should appear');
  }

  fs.writeFileSync(path.join(OUT, '_findings.json'), JSON.stringify(F, null, 2));
  await saveWalkthrough(page, info);
});
