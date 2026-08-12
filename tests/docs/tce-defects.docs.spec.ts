// Regression check of the four Test Catalog Editor defects on OGC-1153. Read-only.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs \
//     tests/docs/tce-defects.docs.spec.ts --retries=0
import { test } from '@playwright/test';
import { go, shot } from './capture';

const IDS = [5, 383];
// The SPA is served at the domain root; the REST API lives behind /api/OpenELIS-Global.
// A bare /rest/... path returns 200 + index.html (the SPA fallback), NOT the API.
const API = '/api/OpenELIS-Global/rest';

test('D1 - Localization: Save control + locale selector + write verb probe', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'tce-defect-localization' });

  for (const id of IDS) {
    await go(page, `/MasterListsPage/TestCatalogEditor/${id}/localization`);
    await page.waitForTimeout(2500);
    await shot(page, info, `Localization tab test ${id}`);

    const d = await page.evaluate(() => {
      const txt = (e: any) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const main = document.querySelector('main') || document.body;
      return {
        htmlLang: document.documentElement.lang,
        allButtons: Array.prototype.slice.call(document.querySelectorAll('button')).map(txt).filter(Boolean),
        saveLike: Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a')).map(txt)
          .filter((t: string) => /save|submit|update|apply|enregistrer/i.test(t)),
        selects: Array.prototype.slice.call(document.querySelectorAll('select')).map((s: any) => ({
          id: s.id, value: s.value,
          options: Array.prototype.slice.call(s.options).map((o: any) => o.value + '|' + txt(o)),
        })),
        comboboxes: Array.prototype.slice.call(document.querySelectorAll('.cds--dropdown, .cds--list-box, [role="combobox"]')).map((c: any) => ({
          cls: c.className, text: txt(c), aria: c.getAttribute('aria-label'),
        })),
        inputs: Array.prototype.slice.call(document.querySelectorAll('main input, main textarea')).map((i: any) => ({
          id: i.id, type: i.type, value: i.value, readOnly: i.readOnly, disabled: i.disabled, label: i.getAttribute('aria-label'),
        })),
        mainText: txt(main).slice(0, 1200),
        csrf: (() => { try { return !!localStorage.getItem('CSRF'); } catch (e) { return false; } })(),
      };
    });
    console.log(`D1_DOM_${id}=` + JSON.stringify(d));

    // What does the session think the locale is?
    for (const p of [`${API}/session`, `${API}/user-session`, `${API}/supportedlocales/active`, `${API}/configuration-properties`]) {
      const r = await page.request.get(p).catch(() => null as any);
      if (r) console.log(`D1_SESSION_${id} ${p} -> ${r.status()} :: ` + (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500));
    }

    // GET then probe write verbs on the localization endpoint
    const ep = `${API}/test-catalog/tests/${id}/localization`;
    const csrf = await page.evaluate(() => { try { return localStorage.getItem('CSRF'); } catch (e) { return null; } });
    const g = await page.request.get(ep).catch(() => null as any);
    if (g) console.log(`D1_GET_${id} ${ep} -> ${g.status()} :: ` + (await g.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800));

    const hdrs: any = { 'Content-Type': 'application/json' };
    if (csrf) hdrs['X-CSRF-Token'] = csrf;
    // Empty-ish payloads: a 405/404 tells us the verb doesn't exist; 400/415 tells us it does.
    const put = await page.request.fetch(ep, { method: 'PUT', headers: hdrs, data: {} }).catch((e) => null as any);
    if (put) console.log(`D1_PUT_${id} -> ${put.status()} allow=${put.headers()['allow'] || ''} :: ` + (await put.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
    const post = await page.request.fetch(ep, { method: 'POST', headers: hdrs, data: {} }).catch((e) => null as any);
    if (post) console.log(`D1_POST_${id} -> ${post.status()} allow=${post.headers()['allow'] || ''} :: ` + (await post.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
    const opt = await page.request.fetch(ep, { method: 'OPTIONS', headers: hdrs }).catch(() => null as any);
    if (opt) console.log(`D1_OPTIONS_${id} -> ${opt.status()} allow=${opt.headers()['allow'] || ''}`);
  }
});

test('D2 - Sample & Results: duplicated Interpretations empty state', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'tce-defect-sample-results' });
  for (const id of IDS) {
    await go(page, `/MasterListsPage/TestCatalogEditor/${id}/sample-results`);
    await page.waitForTimeout(2500);
    await shot(page, info, `Sample and Results tab test ${id}`);
    const d = await page.evaluate(() => {
      const txt = (e: any) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const notifs = Array.prototype.slice.call(document.querySelectorAll('.cds--inline-notification, .cds--actionable-notification, .cds--toast-notification'))
        .map((n: any) => ({ cls: n.className, text: txt(n) }));
      const tables = Array.prototype.slice.call(document.querySelectorAll('table')).map((t: any) => ({
        cls: t.className,
        headers: Array.prototype.slice.call(t.querySelectorAll('thead th')).map(txt),
        tbodyRows: t.querySelectorAll('tbody tr').length,
        tbodyText: txt(t.querySelector('tbody') || t).slice(0, 200),
        // nearest preceding heading, to attribute the table to a section
        section: (() => {
          let p: any = t;
          while (p) {
            const h = p.previousElementSibling;
            if (h && /H[1-6]|SPAN|DIV/.test(h.tagName) && txt(h) && txt(h).length < 80) return txt(h);
            p = p.parentElement;
          }
          return null;
        })(),
      }));
      const headings = Array.prototype.slice.call(document.querySelectorAll('main h1,main h2,main h3,main h4,main h5')).map(txt);
      return { notifs, tables, headings };
    });
    console.log(`D2_DOM_${id}=` + JSON.stringify(d));
  }
});

test('D3 - Reflex & Calc: classless <p> for calculated-by None', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'tce-defect-reflex-calc' });
  for (const id of IDS) {
    await go(page, `/MasterListsPage/TestCatalogEditor/${id}/reflex-calc`);
    await page.waitForTimeout(2500);
    await shot(page, info, `Reflex and Calc tab test ${id}`);
    const d = await page.evaluate(() => {
      const txt = (e: any) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const main = document.querySelector('main') || document.body;
      const blocks = Array.prototype.slice.call(main.querySelectorAll('p, .cds--inline-notification, .cds--data-table-container, table, h3, h4')).map((e: any) => ({
        tag: e.tagName, cls: e.className || '(none)', text: txt(e).slice(0, 160),
      }));
      const hits = Array.prototype.slice.call(main.querySelectorAll('*')).filter((e: any) =>
        /calculated by/i.test(e.textContent || '') && e.children.length === 0).map((e: any) => ({
          tag: e.tagName, cls: e.className || '(none)', text: txt(e), parentTag: e.parentElement && e.parentElement.tagName, parentCls: (e.parentElement && e.parentElement.className) || '(none)',
        }));
      return { blocks, calculatedByNodes: hits, mainText: txt(main).slice(0, 1000) };
    });
    console.log(`D3_DOM_${id}=` + JSON.stringify(d));
  }
});

test('D4 - API: non-numeric id returns 500', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'tce-defect-api-500' });
  await go(page, '/MasterListsPage/TestCatalogEditor/5/basic-info');
  await page.waitForTimeout(1500);
  const paths = [
    `${API}/test-catalog/tests/notanumber/basic-info`,
    `${API}/test-catalog/tests/999999/basic-info`,
    `${API}/test-catalog/tests/5/basic-info`,
    `${API}/test-catalog/tests/notanumber/sample-results`,
    `${API}/test-catalog/tests/abc/localization`,
    `${API}/test-catalog/tests/-1/basic-info`,
    // the un-prefixed path OGC-1153 quotes — proves what it actually resolves to
    '/rest/test-catalog/tests/notanumber/basic-info',
  ];
  for (const p of paths) {
    for (let i = 1; i <= 3; i++) {
      const r = await page.request.get(p).catch(() => null as any);
      const body = r ? (await r.text().catch(() => '')) : '';
      console.log(`D4 try${i} GET ${p} -> ${r ? r.status() : 'THREW'} :: ` + body.replace(/\s+/g, ' ').slice(0, 260));
    }
  }
});
