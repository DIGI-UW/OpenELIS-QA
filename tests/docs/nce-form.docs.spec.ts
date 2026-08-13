// Capture the real Report Non-Conforming Event form; try to select a "reject" option. BASE=testing
import { test } from '@playwright/test';
import { go, shot, settle } from './capture';
import fs from 'fs';

test('Report Non-Conforming Event form (+ reject)', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'nce-form' });
  test.setTimeout(150000);
  await go(page, '/ReportNonConformingEvent');
  await settle(page, 1200);
  await shot(page, info, 'Report NCE form — initial');

  const struct: any = await page.evaluate(() => ({
    title: (document.querySelector('h1,h2,h3')?.textContent||'').trim(),
    labels: [...document.querySelectorAll('label,.cds--label,legend')].map(l=>(l.textContent||'').trim()).filter(Boolean).slice(0,60),
    selects: [...document.querySelectorAll('select')].map(s=>({name:(s as HTMLSelectElement).name||(s.getAttribute('aria-label')||''), opts:[...(s as HTMLSelectElement).options].map(o=>(o.textContent||'').trim()).slice(0,15)})).slice(0,20),
    radios: [...document.querySelectorAll('input[type=radio]')].map(r=>({name:(r as HTMLInputElement).name, val:(r as HTMLInputElement).value, label:(r.closest('label')?.textContent||'').trim()})).slice(0,30),
    buttons: [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(t=>t&&t.length<40).slice(0,25),
    textSample: ((document.querySelector('main')||document.body) as HTMLElement).innerText.slice(0,1800),
  })).catch(e=>({error:String(e)}));
  fs.mkdirSync('docs-media/_explore', { recursive: true });
  fs.writeFileSync('docs-media/_explore/nce-form.json', JSON.stringify(struct, null, 2));

  // Try to pick a "reject" option in any select whose options include it
  try {
    const sels = await page.$$('select');
    for (const s of sels) {
      const opts = await s.$$eval('option', os => os.map(o=>o.textContent||''));
      const idx = opts.findIndex(o=>/reject/i.test(o));
      if (idx >= 0) {
        await s.selectOption({ index: idx });
        await page.waitForTimeout(1200);
        await settle(page, 600);
        await shot(page, info, 'Report NCE form — Reject selected');
        break;
      }
    }
  } catch(e) { /* resilient */ }
});
