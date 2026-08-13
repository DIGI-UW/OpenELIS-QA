// Storage location-search investigation — reproduce the "results render but aren't clickable" regression.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/storage-investigation.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, settle, saveWalkthrough, dismissModals } from './capture';
import fs from 'fs';

test('storage location search — reproduce regression', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'handoff-storage-before' });
  test.setTimeout(180000);

  await go(page, '/Storage/sample-items');
  await shot(page, info, 'Sample items — storage landing');

  // Dump the page structure so we know exactly what controls exist (search box, buttons, table).
  const struct: any = await page.evaluate(() => {
    const t = document.querySelector('main')?.innerText || document.body.innerText;
    return {
      url: location.pathname,
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map(h => (h.textContent||'').trim()).filter(Boolean).slice(0,20),
      inputs: [...document.querySelectorAll('input,textarea')].map(i => ({ type:(i as HTMLInputElement).type, ph:(i as HTMLInputElement).placeholder||'', aria:i.getAttribute('aria-label')||'' })).slice(0,25),
      buttons: [...document.querySelectorAll('button,a[role="button"]')].map(b => (b.textContent||'').trim()).filter(x=>x&&x.length<40).slice(0,40),
      hasTable: !!document.querySelector('table'),
      textSample: t.slice(0,600),
    };
  }).catch(e => ({ error: String(e) }));
  fs.mkdirSync('docs-media/_explore', { recursive: true });
  fs.writeFileSync('docs-media/_explore/storage-sample-items.json', JSON.stringify(struct, null, 2));

  // Try to reach the location search. It may be a search box on the page, or behind an
  // "Assign location" / "Add" / "Move" action on a sample row. Try both, resiliently.
  try {
    // (a) direct search box
    let search = page.getByRole('searchbox')
      .or(page.getByPlaceholder(/search|location|freezer|room|shelf/i))
      .or(page.getByRole('combobox'))
      .first();

    if (!(await search.isVisible().catch(() => false))) {
      // (b) open it via an action button
      const opener = page.getByRole('button', { name: /assign|location|move|add|store/i }).first();
      if (await opener.isVisible().catch(() => false)) {
        await opener.click({ timeout: 3000 }).catch(() => {});
        await settle(page, 800);
        await shot(page, info, 'Opened location assign/search');
        search = page.getByRole('searchbox')
          .or(page.getByPlaceholder(/search|location|freezer|room|shelf/i))
          .or(page.getByRole('combobox')).first();
      }
    }

    if (await search.isVisible().catch(() => false)) {
      await search.click().catch(() => {});
      await search.fill('a').catch(() => {});
      await page.waitForTimeout(1500);
      await dismissModals(page);
      await shot(page, info, 'Location search — results shown');

      // Enumerate the results and test clickability.
      const clickTest: any = await page.evaluate(() => {
        const sel = '[role="option"], .cds--list-box__menu-item, .cds--combo-box li, ul[role="listbox"] li, table tbody tr';
        const nodes = [...document.querySelectorAll(sel)].filter(n => (n.textContent||'').trim());
        const first = nodes[0] as HTMLElement | undefined;
        const cs = first ? getComputedStyle(first) : null;
        return {
          resultCount: nodes.length,
          firstText: first ? (first.textContent||'').trim().slice(0,80) : null,
          firstPointerEvents: cs?.pointerEvents ?? null,
          firstTabIndex: first?.getAttribute('tabindex') ?? null,
          firstRole: first?.getAttribute('role') ?? null,
          firstAriaDisabled: first?.getAttribute('aria-disabled') ?? null,
          hasOnClickListenerHint: first ? first.outerHTML.slice(0,200) : null,
        };
      }).catch(e => ({ error: String(e) }));
      fs.writeFileSync('docs-media/_explore/storage-clicktest.json', JSON.stringify(clickTest, null, 2));

      // Attempt an actual click and see whether selection state changes.
      const result = page.locator('[role="option"], .cds--list-box__menu-item, ul[role="listbox"] li, table tbody tr').filter({ hasText: /.+/ }).first();
      const before = await page.evaluate(() => (document.activeElement?.tagName||'') + '|' + (document.querySelector('input')?.getAttribute('value')||''));
      if (await result.isVisible().catch(() => false)) {
        await result.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const after = await page.evaluate(() => (document.activeElement?.tagName||'') + '|' + (document.querySelector('input')?.getAttribute('value')||''));
        fs.appendFileSync('docs-media/_explore/storage-clicktest.json', `\n// before=${before}\n// after=${after}\n`);
        await shot(page, info, 'After clicking a result (regression check)');
      }
    } else {
      await shot(page, info, 'No location search control reachable');
    }
  } catch (e) {
    fs.writeFileSync('docs-media/_explore/storage-error.txt', String(e));
    await shot(page, info, 'Storage interaction errored');
  }

  await saveWalkthrough(page, info);
});
