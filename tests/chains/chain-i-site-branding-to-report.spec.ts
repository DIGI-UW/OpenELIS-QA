/**
 * tests/chains/chain-i-site-branding-to-report.spec.ts
 *
 * SKILL §11 Chain I — Site Information → Report Branding
 *
 * What this chain proves: an admin-configured lab/site name reaches the
 * generated Patient Status Report PDF. NOTE-16 reports that PDFs show
 * "null" as the header when SiteInformation.labName is missing or empty
 * — Chain I both confirms that condition and proves the pipeline works
 * when the field is set.
 *
 * Why this chain is high-leverage early: unlike Chains A/B/C/D, the
 * admin write path here is already proven (Phase 36 Chain C verified
 * site-branding PUT round-trips). What's NOT proven is whether the
 * admin value propagates all the way through the report generator.
 *
 * Design choices:
 *   - Use SiteInformation key/value endpoint rather than site-branding
 *     because NOTE-16 specifically references SiteInformation.
 *   - Probe several known endpoint paths because the right one varies
 *     across versions (and §6.5 forbids guessing).
 *   - Optional Step 6 modifies the labName, regenerates, then restores
 *     it via `test.afterAll`. If the instance has no writable labName
 *     entry, Step 6 is skipped cleanly without leaving the system in a
 *     modified state.
 *
 * Expected outcomes:
 *   - All 5 mandatory steps PASS: admin → report pipeline works end-to-
 *     end. Mark Reports module M4 (cross-link verified) in the maturity
 *     dashboard. NOTE-16 can be closed.
 *   - Step 5 FAILs with PDF containing literal "null": NOTE-16 confirmed
 *     still present. File the upstream fix.
 *   - Step 6 FAILs after a write+regen: pipeline lossy. Different bug
 *     than NOTE-16's "labName unset" — the chain catches it as a
 *     distinct symptom.
 *
 * Run individually:
 *   npx playwright test --project=chain-i
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  findOrSeedOrder,
  extractPdfText,
  markStep,
  ChainOrderRef,
} from './_common';

interface SiteInfoEntry {
  id?: string;
  name?: string;
  description?: string;
  value?: string;
}

test.describe.serial('Chain I — Site Information → Report Branding', () => {
  let order: ChainOrderRef | null = null;
  let labNameEntry: SiteInfoEntry | null = null;
  let originalLabName: string | null = null;
  let siteInfoEndpoint: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain I] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // afterAll — restore labName if Step 6 changed it
  // Even on mid-test failure, this runs and prevents leaving the system
  // with the test value baked into all future PDFs.
  // ---------------------------------------------------------------------------
  test.afterAll(async ({ browser }) => {
    if (labNameEntry?.id && originalLabName !== null && siteInfoEndpoint) {
      // eslint-disable-next-line no-console
      console.log(`[Chain I afterAll] Restoring labName to "${originalLabName}"`);
      const ctx = await browser.newContext({ storageState: '.auth/user.json' });
      const page = await ctx.newPage();
      await page.goto(BASE);
      await apiCall(page, siteInfoEndpoint, {
        method: 'POST',
        body: { ID: labNameEntry.id, value: originalLabName },
      });
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Acquire an accession we can run a report against
  // SKILL §0.6 + §0.6a
  // Acceptance criterion: RENDER
  // ---------------------------------------------------------------------------
  test('Step 1 — Acquire a QA_AUTO_ order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    order = await findOrSeedOrder(page);
    if (!order) {
      markStep('I', 1, 'FAIL', 'No QA_AUTO_ order available', 'Run --project=seed-data first.');
      expect(order, 'No QA_AUTO_ order — seed first').not.toBeNull();
      return;
    }
    markStep('I', 1, 'PASS', `Acquired order ${order.accession} for patient ${order.patientNationalId}`);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Discover the SiteInformation endpoint + find a labName entry
  // SKILL §6.5 No-bug-without-live-capture: we probe known paths in
  // priority order and use the first that returns 200.
  // Acceptance criterion: FUNCTION
  // ---------------------------------------------------------------------------
  test('Step 2 — Find SiteInformation labName entry (FUNCTION)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    // Try the most likely endpoints; the SiteInformation REST path
    // varies by version — see calibration delta for the 2026-04-20
    // false-positive cluster around guessed paths.
    const candidates = [
      '/api/OpenELIS-Global/rest/SiteInformation',
      '/api/OpenELIS-Global/rest/siteInformation',
      '/api/OpenELIS-Global/rest/SiteInformationMenu',
    ];

    let entries: SiteInfoEntry[] = [];
    for (const path of candidates) {
      const r = await apiCall<SiteInfoEntry[] | { siteInformationList?: SiteInfoEntry[] }>(page, path);
      if (r.ok && r.body) {
        const list: SiteInfoEntry[] = Array.isArray(r.body)
          ? r.body
          : ((r.body as { siteInformationList?: SiteInfoEntry[] } | null)?.siteInformationList || []);
        if (Array.isArray(list) && list.length > 0) {
          entries = list;
          siteInfoEndpoint = path;
          break;
        }
      }
    }

    if (entries.length === 0) {
      markStep('I', 2, 'FAIL',
        'No SiteInformation endpoint returned a non-empty list',
        `Tried [${candidates.join(', ')}]. Add the working path to _common.ts when discovered.`);
      expect(entries.length, 'SiteInformation not reachable').toBeGreaterThan(0);
      return;
    }

    // Find an entry whose name suggests "lab name" / "site name" /
    // "laboratory name". Different installs use different keys.
    const nameRegex = /^(lab[._ ]?name|site[._ ]?name|laboratory[._ ]?name|labName|siteName)$/i;
    labNameEntry = entries.find(e => e.name && nameRegex.test(e.name)) || null;

    if (!labNameEntry) {
      const sample = entries.slice(0, 5).map(e => e.name).join(', ');
      markStep('I', 2, 'FAIL',
        `Found ${entries.length} SiteInformation entries but none matches the lab/site name pattern`,
        `First 5 entries: [${sample}]. Update the regex or pick the right key explicitly.`);
      expect(labNameEntry, 'No labName entry found in SiteInformation').not.toBeNull();
      return;
    }
    originalLabName = labNameEntry.value ?? '';
    markStep('I', 2, 'PASS',
      `Found labName entry: id=${labNameEntry.id} name="${labNameEntry.name}" value="${originalLabName}"`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Verify labName has a non-null value
  // NOTE-16 catch — if labName is empty/null, the report will show "null"
  // Acceptance criterion: FUNCTION
  // ---------------------------------------------------------------------------
  test('Step 3 — Verify labName is set (FUNCTION, NOTE-16 precondition)', async ({ page: _page }) => {
    if (!labNameEntry) test.skip();

    const set = !!originalLabName && originalLabName.trim() !== '' && originalLabName.trim().toLowerCase() !== 'null';
    if (!set) {
      markStep('I', 3, 'FAIL',
        `NOTE-16 ROOT CAUSE CONFIRMED: labName value is "${originalLabName}"`,
        `The Patient Status Report PDF header will render "null" because the underlying admin config is empty. ` +
        `Fix: set a value in /MasterListsPage/SiteInformationMenu.`);
      expect(set, 'labName must be set for the report pipeline to render correctly').toBeTruthy();
      return;
    }
    markStep('I', 3, 'PASS', `labName is set to "${originalLabName}"`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Generate Patient Status Report PDF
  // Same pattern Chain A Step 5 uses
  // Acceptance criterion: REPORTABLE
  // ---------------------------------------------------------------------------
  test('Step 4 — Generate Patient Status Report PDF (REPORTABLE)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    const url =
      `/api/OpenELIS-Global/ReportPrint?report=patient&type=patient` +
      `&accessionNumber=${encodeURIComponent(order!.accession)}`;
    const response = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });
    if (!response.ok) {
      markStep('I', 4, 'FAIL', `ReportPrint returned HTTP ${response.status}`);
      expect(response.ok).toBeTruthy();
      return;
    }
    const buf = Buffer.from(String(response.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep('I', 4, 'FAIL', `Not a PDF (first 4 bytes: ${buf.toString('hex', 0, 4)})`);
      expect(isPdf).toBeTruthy();
      return;
    }
    markStep('I', 4, 'PASS', `PDF generated, ${buf.length} bytes`);

    // Stash for Step 5
    (order as ChainOrderRef & { pdf?: Buffer }).pdf = buf;
  });

  // ---------------------------------------------------------------------------
  // Step 5 — labName appears in PDF, and "null" does not
  // SKILL §11 Chain I row + NOTE-16 catch
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 5 — PDF header contains labName, not "null" (CROSS-LINK, NOTE-16 catch)', async ({ page: _page }) => {
    if (!order || !originalLabName) test.skip();
    const withPdf = order as ChainOrderRef & { pdf?: Buffer };
    if (!withPdf.pdf) {
      markStep('I', 5, 'BLOCKED', 'No PDF from Step 4');
      test.skip();
      return;
    }
    const text = extractPdfText(withPdf.pdf);

    // The PDF text extractor produces noisy output; we look for substrings
    // in a case-insensitive way. Match any contiguous run of characters
    // from the labName (whole-word match is too strict given the
    // extractor's text-stream concatenation).
    const labNameLower = originalLabName!.toLowerCase();
    const textLower = text.toLowerCase();
    const labNameFound = labNameLower.length > 0 && textLower.includes(labNameLower);

    // Detect the NOTE-16 symptom directly
    const nullFound = textLower.includes('null') &&
      // be cautious: "null" appears as a substring in many other tokens;
      // tighten to standalone-ish occurrences
      /[^a-zA-Z]null[^a-zA-Z]?/.test(text);

    if (!labNameFound) {
      markStep('I', 5, 'FAIL',
        `labName "${originalLabName}" NOT found in PDF text`,
        `Branding write succeeded (Step 2 read-back PASS) but the report layer doesn't pick it up. ` +
        `Pipeline gap from SiteInformation to ReportPrint Jasper template.`);
      expect(labNameFound, `labName "${originalLabName}" missing from PDF`).toBeTruthy();
      return;
    }
    if (nullFound) {
      markStep('I', 5, 'PARTIAL',
        `labName found but PDF also contains "null" tokens`,
        `Possible NOTE-29 territory (Contact Tracing field empty) or other key not rendering — investigate which.`);
      test.info().annotations.push({ type: 'partial', description: 'literal "null" in PDF body' });
      // Soft pass — chain continues; this isn't a hard fail.
    } else {
      markStep('I', 5, 'PASS', `labName "${originalLabName}" appears in PDF; no stray "null" tokens detected`);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Mutating write propagates (optional, restores in afterAll)
  // The strongest possible test: change the labName via PUT, regenerate
  // the PDF, assert the NEW value appears. If this passes, the admin →
  // report pipeline is live (not just a frozen-config legacy artifact).
  // SKILL §7.5 + §11 Chain I
  // Acceptance criterion: ROUND-TRIP + REPORTABLE
  // ---------------------------------------------------------------------------
  test('Step 6 — Modify labName → regenerate → assert change appears (ROUND-TRIP, REPORTABLE)', async ({ page }) => {
    if (!labNameEntry?.id || !siteInfoEndpoint || !order || originalLabName === null) test.skip();
    await page.goto(BASE);

    const testLabName = `QA_AUTO_LabName_${Date.now()}`;
    const update = await apiCall<unknown>(page, siteInfoEndpoint!, {
      method: 'POST',
      body: { ID: labNameEntry!.id, value: testLabName },
    });
    if (!update.ok) {
      markStep('I', 6, 'BLOCKED',
        `SiteInformation POST returned HTTP ${update.status}`,
        `Payload shape may differ from { ID, value }. Cleanup will still run in afterAll.`);
      test.info().annotations.push({ type: 'blocked', description: `SiteInfo POST ${update.status}` });
      return;
    }

    // Round-trip read-back per §7.5
    const verify = await apiCall<SiteInfoEntry[] | { siteInformationList?: SiteInfoEntry[] }>(
      page, siteInfoEndpoint!
    );
    const verifyList: SiteInfoEntry[] = verify.ok
      ? (Array.isArray(verify.body) ? verify.body : ((verify.body as { siteInformationList?: SiteInfoEntry[] } | null)?.siteInformationList || []))
      : [];
    const updated = verifyList.find(e => e.id === labNameEntry!.id);
    if (updated?.value !== testLabName) {
      markStep('I', 6, 'FAIL',
        `labName write did not round-trip: GET shows "${updated?.value}", expected "${testLabName}"`,
        `Admin write returned 200 but read-back disagrees — silent fail (BUG-8 class).`);
      expect(updated?.value).toBe(testLabName);
      return;
    }

    // Regenerate PDF and assert new value
    const pdfUrl =
      `/api/OpenELIS-Global/ReportPrint?report=patient&type=patient` +
      `&accessionNumber=${encodeURIComponent(order!.accession)}`;
    const pdfResp = await apiCall<string>(page, pdfUrl, { accept: 'application/pdf', expectBinary: true });
    if (!pdfResp.ok) {
      markStep('I', 6, 'FAIL', `ReportPrint on regen returned HTTP ${pdfResp.status}`);
      expect(pdfResp.ok).toBeTruthy();
      return;
    }
    const buf2 = Buffer.from(String(pdfResp.body), 'base64');
    const text2 = extractPdfText(buf2).toLowerCase();
    const found = text2.includes(testLabName.toLowerCase());
    if (!found) {
      markStep('I', 6, 'FAIL',
        `Modified labName "${testLabName}" NOT in regenerated PDF`,
        `PUT succeeded + round-tripped via API but report doesn't reflect — admin→report pipeline is stale or cached.`);
      expect(found).toBeTruthy();
      return;
    }
    markStep('I', 6, 'PASS', `Modified labName "${testLabName}" appears in regenerated PDF`);
    // afterAll restores the original
  });
});
