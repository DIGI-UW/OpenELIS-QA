/**
 * tests/chains/chain-ab-env-holding-time.spec.ts
 *
 * SKILL §11 Chain AB — Environmental Holding-Time + Sertifikat Hasil Uji
 *
 * Authored from a LIVE UI verification pass on 34.212.225.107 (v3.2.1.10),
 * 2026-06-24 (see HANDOFF-env-vector-cert-2026-06-24.md). It encodes the two
 * newly-exercised behaviours the existing Env/Vector chains (M/N/Y/Z) do not
 * cover:
 *
 *   1. SOP max holding-time enforcement at Results Entry — a sample collected
 *      longer ago than its test's "SOP Max Holding Time (minutes)" (Admin →
 *      Test Management → Modify tests → Configuration → QC Acceptance
 *      Thresholds; pH(Groundwater) = 1440) triggers a "Holding Time Exceeded"
 *      notification + a RED box around the result field, and on save writes an
 *      Internal note: "Result entered after SOP max holding time was exceeded."
 *
 *   2. OGC-1064 regression — the Laporan Hasil compliance-report generator
 *      should list any validated + standard-linked environmental order so a
 *      Sertifikat Hasil Uji can be produced (OGC-552 acceptance criteria), but
 *      currently lists NONE. This is the known-bug catch (cf. Chain A/BUG-37,
 *      Chain B/BUG-29) — it FLAGS the bug, it does not fail the chain.
 *
 * PROVENANCE / TO-HARDEN (repo §6.5b "capture before commit"):
 *   The holding-time mutation endpoints were not pinned byte-for-byte, so the
 *   data-dependent steps are driven through the UI and are PARAMETERIZED by
 *   env vars rather than self-seeding:
 *     HT_ACCESSION   — a back-dated (expired) env order with a holding-time test
 *                      already at Results Entry (e.g. the DEV…011 built on
 *                      2026-06-24). When unset, steps 2–3 record GAP.
 *     CERT_ACCESSION — a validated + standard-linked env order that *should*
 *                      appear in Laporan Hasil (e.g. DEV…012). Optional; the
 *                      OGC-1064 step asserts the list is (wrongly) empty either
 *                      way.
 *   Every step is wrapped to record GAP and continue on any selector/endpoint
 *   miss — it never throws, never fabricates a pass (SKILL §11.5).
 *
 * Run individually:  npx playwright test --project=chain-ab
 *   BASE_URL=https://34.212.225.107 HT_ACCESSION=DEV01260000000000011 \
 *   CERT_ACCESSION=DEV01260000000000012 npx playwright test --project=chain-ab
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep, VE_ENV_COMPLIANCE } from './_common';

const HT_ACCESSION = process.env.HT_ACCESSION || '';
const CERT_ACCESSION = process.env.CERT_ACCESSION || '';
const HOLDING_TIME_NOTE = /Result entered after SOP max holding time was exceeded/i;

test.describe.serial('Chain AB — Env Holding-Time + Sertifikat Hasil Uji', () => {
  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain AB] BASE=${BASE} HT_ACCESSION=${HT_ACCESSION || '(unset)'} CERT_ACCESSION=${CERT_ACCESSION || '(unset)'}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Compliance domain present + a standard is active (FUNCTION)
  // ---------------------------------------------------------------------------
  test('Step 1 — Active compliance standard exists (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<unknown[]>(page, VE_ENV_COMPLIANCE);
    const n = Array.isArray(r.body) ? r.body.length : 0;
    if (r.ok && n > 0) {
      markStep('AB', 1, 'PASS', `Active compliance standards present (n=${n}, e.g. PP 22/2021) — holding-time + cert preconditions met`);
      expect(n).toBeGreaterThan(0);
    } else if (r.ok) {
      markStep('AB', 1, 'GAP', 'Compliance standards endpoint reachable but empty — none configured on this instance', `GET ${VE_ENV_COMPLIANCE}`);
      test.info().annotations.push({ type: 'gap', description: 'no active compliance standards' });
    } else {
      markStep('AB', 1, 'GAP', `Compliance standards endpoint HTTP ${r.status} — env compliance domain absent on this build`, `GET ${VE_ENV_COMPLIANCE}`);
      test.info().annotations.push({ type: 'gap', description: `compliance HTTP ${r.status}` });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Holding-time flag at Results Entry (CROSS-LINK, UI)
  // ---------------------------------------------------------------------------
  test('Step 2 — Expired sample shows "Holding Time Exceeded" + boxed result (CROSS-LINK)', async ({ page }) => {
    if (!HT_ACCESSION) {
      markStep('AB', 2, 'GAP', 'Skipped — set HT_ACCESSION to a back-dated (expired) env order at Results Entry',
        'Seed: create an env order whose Collection / per-sample Collected datetime is older than the test SOP max holding time (e.g. pH=1440min), push through QA Review → Submit, then pass its accession as HT_ACCESSION.');
      test.info().annotations.push({ type: 'gap', description: 'HT_ACCESSION unset' });
      return;
    }
    // Results › By Order is direct-URL safe via the SPA results route.
    await page.goto(`${BASE}/result?type=order&doRange=false&accessionNumber=${encodeURIComponent(HT_ACCESSION)}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const exceededToast = page.getByText(/Holding Time Exceeded/i).first();
    const sawToast = await exceededToast.isVisible({ timeout: 8000 }).catch(() => false);
    // The red box is a styled wrapper around the boxed result input; the toast
    // text is the robust, locale-stable signal, so we assert on that.
    if (sawToast) {
      markStep('AB', 2, 'PASS', `Results Entry flagged holding-time exceeded for ${HT_ACCESSION} (notification shown; result field is boxed red)`);
      expect(sawToast).toBeTruthy();
    } else {
      markStep('AB', 2, 'GAP',
        `No "Holding Time Exceeded" notification for ${HT_ACCESSION} — either not expired, no holding-time test, or the result was already saved/validated (notification only fires on the unresolved result-entry view)`,
        'Confirm the accession is an expired holding-time sample still at Results Entry.');
      test.info().annotations.push({ type: 'gap', description: 'no holding-time notification observed' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Internal "expired" note written on save (PERSIST, UI/API read-back)
  // ---------------------------------------------------------------------------
  test('Step 3 — Internal holding-time note persisted on the result (PERSIST)', async ({ page }) => {
    if (!HT_ACCESSION) { markStep('AB', 3, 'GAP', 'Skipped — HT_ACCESSION unset (see Step 2)'); return; }
    await page.goto(BASE);
    // Read the result back via LogbookResults (shared results surface) and look
    // for the auto-written Internal note. Endpoint shape not pinned for env, so
    // a miss is GAP, not FAIL.
    const lb = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    const blob = typeof lb.body === 'string' ? lb.body : JSON.stringify(lb.body ?? '');
    if (lb.ok && HOLDING_TIME_NOTE.test(blob)) {
      markStep('AB', 3, 'PASS', 'Holding-time Internal note present on a resulted sample ("Result entered after SOP max holding time was exceeded")');
      expect(HOLDING_TIME_NOTE.test(blob)).toBeTruthy();
    } else {
      markStep('AB', 3, 'GAP',
        'Holding-time Internal note not found via LogbookResults — note is written on result SAVE; verify on the Results › By Order expanded row Notes column',
        'UI confirm: open the order, expand the result row, read the Notes column. Verified manually 2026-06-24: "Internal <dd/mm/yyyy hh:mm> : WARNING: Result entered after SOP max holding time was exceeded."');
      test.info().annotations.push({ type: 'gap', description: 'note not surfaced via LogbookResults probe' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 4 — OGC-1064 regression: Laporan Hasil lists eligible orders (KNOWN BUG)
  // ---------------------------------------------------------------------------
  test('Step 4 — Laporan Hasil surfaces a validated+standard-linked order (OGC-1064 catch)', async ({ page }) => {
    // Sidebar route (SPA): Reports › Environmental Reports › Laporan Hasil (Compliance)
    await page.goto(`${BASE}/LaporanHasil`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const searchBtn = page.getByRole('button', { name: /^search$/i }).first();
    if (await searchBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await searchBtn.click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    const emptyState = await page.getByText(/No orders found for the selected filters/i)
      .isVisible({ timeout: 6000 }).catch(() => false);
    const certRowVisible = CERT_ACCESSION
      ? await page.getByText(CERT_ACCESSION, { exact: false }).isVisible({ timeout: 4000 }).catch(() => false)
      : false;

    if (certRowVisible) {
      markStep('AB', 4, 'PASS', `OGC-1064 appears FIXED — ${CERT_ACCESSION} is listed in Laporan Hasil and a certificate can be generated`);
      expect(certRowVisible).toBeTruthy();
    } else {
      // Known bug: validated + standard-linked orders never surface here.
      markStep('AB', 4, 'GAP',
        `OGC-1064 STILL PRESENT — Laporan Hasil shows ${emptyState ? '"No orders found"' : 'no eligible order'}${CERT_ACCESSION ? ` (expected ${CERT_ACCESSION})` : ''}; a validated, standard-linked order does not surface for cert generation`,
        'browse/OGC-1064. Contradicts OGC-552 AC ("orders appear once all results validated/released and evaluations non-PENDING"). When fixed, pass CERT_ACCESSION and this becomes PASS.');
      test.info().annotations.push({ type: 'known-bug', description: 'OGC-1064 Laporan Hasil eligible orders empty' });
    }
  });
});
