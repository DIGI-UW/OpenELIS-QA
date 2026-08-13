// Revalidation per the bug-revalidation protocol: is "order does not appear in the results
// worklist" a real defect or harness error?
//
// Establishes ground truth first (does the order even carry a resultable analysis?), captures the
// endpoint the worklist actually calls, runs a CONTROL (does any order appear?), then Methods A and B.
//
//   BASE=... ACC=DEV01260000000000128 npx playwright test --project=docs tests/docs/revalidate.docs.spec.ts
import { test } from '@playwright/test';
import fs from 'fs';

const ACC = process.env.ACC || 'DEV01260000000000128';
const R: any = { accession: ACC, at: new Date().toISOString() };

async function restGet(page: any, p: string) {
  return page.evaluate(async (p: string) => {
    const csrf = localStorage.getItem('CSRF') || '';
    try {
      const r = await fetch('/api/OpenELIS-Global/rest' + p,
        { headers: { Accept: 'application/json', 'X-CSRF-Token': csrf }, credentials: 'include' });
      const t = await r.text();
      let b: any; try { b = JSON.parse(t); } catch { b = t.slice(0, 200); }
      return { status: r.status, body: b };
    } catch (e: any) { return { status: -1, err: String(e).slice(0, 120) }; }
  }, p);
}

test('revalidate — order visibility in the results worklist', async ({ page, browser }) => {
  test.setTimeout(900_000);
  fs.mkdirSync('docs-media/revalidate', { recursive: true });

  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 20000 }).catch(() => {});

  // ================= GROUND TRUTH: does the order carry a resultable analysis? =================
  const se = await restGet(page, `/SampleEdit?accessionNumber=${ACC}`);
  const b: any = se.body || {};
  R.groundTruth = {
    status: se.status,
    noSampleFound: b.noSampleFound,
    isEditable: b.isEditable,
    patientName: b.patientName,
    // THE key I got wrong last time
    existingTests: JSON.stringify(b.existingTests ?? null).slice(0, 1200),
    existingTestsCount: Array.isArray(b.existingTests) ? b.existingTests.length : 'not-an-array',
    sampleXMLHead: String(b.sampleXML ?? '').slice(0, 600),
  };

  // ================= Capture which endpoint the worklist actually calls =================
  const calls: any[] = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('/rest/') && !/configuration-properties|displayList|notification/.test(u)) {
      let size = 0, peek = '';
      try { const t = await res.text(); size = t.length; peek = t.slice(0, 200); } catch {}
      calls.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: res.status(), size, peek });
    }
  });

  // ================= CONTROL: does the worklist show ANY rows with no filter? =================
  await page.goto('/Results', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.getByLabel(/lab unit/i).first().selectOption({ label: 'Biochemistry' }).catch(() => {});
  await page.waitForTimeout(800);
  const loadBtn = page.getByRole('button', { name: /load results/i }).first();
  R.control = { loadButtonVisible: await loadBtn.isVisible().catch(() => false) };
  await loadBtn.click().catch(() => {});
  await page.waitForTimeout(4500);
  R.control.rowsNoFilter = await page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].length);
  R.control.bodySnippet = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, ' ').match(/All \(\d+\)|no records|No results/i)?.[0] ?? 'none');
  await page.screenshot({ path: 'docs-media/revalidate/control-biochem-no-filter.png', fullPage: false });

  R.worklistCalls = calls.slice(-12);

  // ================= Method A — fresh context, exact failing steps =================
  const ctxA = await browser.newContext({ storageState: '.auth/user.json', viewport: { width: 1440, height: 900 } });
  const pA = await ctxA.newPage();
  await pA.goto((process.env.BASE || 'https://testing.openelis-global.org') + '/Results', { waitUntil: 'domcontentloaded' });
  await pA.waitForTimeout(3500);
  await pA.getByLabel(/lab unit/i).first().selectOption({ label: 'Biochemistry' }).catch(() => {});
  await pA.getByPlaceholder(/lab number/i).first().fill(ACC).catch(() => {});
  await pA.getByRole('button', { name: /load results/i }).first().click().catch(() => {});
  await pA.waitForTimeout(4500);
  R.methodA = {
    rows: await pA.evaluate(() => [...document.querySelectorAll('table tbody tr')].length),
    snippet: await pA.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').match(/All \(\d+\)/)?.[0] ?? 'none'),
  };
  await pA.screenshot({ path: 'docs-media/revalidate/methodA-fresh-context.png', fullPage: false });
  await ctxA.close();

  // ================= Method C — API ×3 against the legacy result-by-accession path =================
  R.methodC = [];
  for (let i = 0; i < 3; i++) {
    const r = await restGet(page, `/analysis-by-accession/${ACC}`);
    R.methodC.push(r.status);
    await page.waitForTimeout(2000);
  }

  // ================= Legacy result page — does the order resolve there? =================
  await page.goto('/result?type=order&doRange=false', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const legacyBox = page.getByPlaceholder(/accession|lab number/i).first();
  R.legacy = { boxVisible: await legacyBox.isVisible().catch(() => false) };
  await legacyBox.fill(ACC).catch(() => {});
  await page.getByRole('button', { name: /^Search$/ }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  R.legacy.rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].length);
  R.legacy.snippet = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
  await page.screenshot({ path: 'docs-media/revalidate/legacy-result-page.png', fullPage: false });

  fs.writeFileSync('docs-media/revalidate/_reval.json', JSON.stringify(R, null, 1));
});
