/**
 * ORDER_PATH switch for the chain seeder.
 *
 * Two order-entry paths coexist on 3.2.2.0:
 *   legacy - POST /rest/SamplePatientEntry (the pre-existing findOrSeedOrder body)
 *   domain - the three-lane wizard at /order/[clinical|environmental|vector]/enter
 *
 * There is deliberately NO silent default: an unset or unknown ORDER_PATH throws. The old path is
 * being retired piece by piece, and a seeder that quietly picked one would make every chain
 * result ambiguous about which path it actually exercised.
 *
 * REUSE FIRST, then create - the same shape as the legacy findOrSeedOrder.
 *
 * STATE OF THE THREE LANES on testing.openelis-global.org v3.2.2.0, all measured live 2026-08-21:
 *
 *   CLINICAL      works end to end. /order/clinical is an Order Dashboard listing in-progress
 *                 orders with a Continue action, so reuse is reliable.
 *   ENVIRONMENTAL **CORRECTED 2026-09-05** — the environmental lane CAN now create orders.
 *                 GET /rest/environmental-sample-types returns Water plus the QA matrices, and
 *                 the OGC-1192 evidence orders (DEV…655 through DEV…677) were all created
 *                 through this lane. What remains empty is narrower: collection-methods,
 *                 env-weather and sample-containers still return [], so those columns render
 *                 with no options (filed as OGC-1192 §4). The paragraph below is the ORIGINAL
 *                 2026-08-21 measurement, kept because the vector lane may still match it —
 *                 re-measure before relying on it.
 *   VECTOR        (as measured 2026-08-21) reference data empty and unwritable:
 *                     GET /rest/environmental-sample-types            -> []
 *                     GET /rest/vector-sample-types                  -> []
 *                     GET /rest/vector/dictionary/sampling-site-types -> []
 *                     GET /rest/vector/dictionary/env-weather         -> []
 *                     GET /rest/vector/dictionary/env-collection-methods -> []
 *                     GET /rest/vector/dictionary/sample-containers   -> []
 *                 all 200-with-empty-array, and POST is 405 on every one of them. The rendered
 *                 form shows sampleType-0 / container-0 / lifecycleStage-0 / trapType-0 with zero
 *                 options. These endpoints do NOT derive from sample_type.domain, so seeding the
 *                 test catalog (tests/docs/seed-domain-catalog.docs.spec.ts) does not help - that
 *                 was verified by seeding it and re-running env-flow, which still reported
 *                 PICKED= empty and zero writes.
 *
 * Consequence worth keeping visible: retiring the legacy path would remove the only working
 * env/vector order entry on this build, because the legacy /SamplePatientEntry route sources its
 * env sample types from the form payload rather than from these empty registries.
 */
import { Page } from '@playwright/test';

export type OrderPath = 'legacy' | 'domain';
export type DomainLane = 'clinical' | 'environmental' | 'vector';

export function resolveOrderPath(): OrderPath {
  const raw = (process.env.ORDER_PATH || '').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'domain') {
    console.log('[ORDER_PATH] ' + raw.toUpperCase() + ' - order entry for this run goes through the '
      + (raw === 'domain' ? 'three-lane domain wizard' : 'legacy SamplePatientEntry form') + ' path');
    return raw;
  }
  throw new Error(
    'ORDER_PATH is not set. Both order-entry paths are live on this build and they are not '
    + 'interchangeable, so the seeder will not guess. Set ORDER_PATH=domain (the future normative '
    + 'path) or ORDER_PATH=legacy (being retired). See tests/chains/domain-seed.ts.',
  );
}

export interface DomainOrderRef {
  labNumber: string;
  domain: DomainLane;
  source: 'reused' | 'created';
  progress: string;
  path: 'domain';
}

/** Read the lab numbers the Order Dashboard is actually showing for this lane. */
async function listDashboardOrders(page: Page, domain: DomainLane): Promise<Array<{ labNumber: string; progress: string }>> {
  await page.goto('/order/' + domain, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForTimeout(4500);
  if (page.url().includes('/login')) return [];
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const out: Array<{ labNumber: string; progress: string }> = [];
    for (const r of rows) {
      const cells = Array.from(r.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
      const lab = cells.find((c) => /^[A-Z]{2,4}[0-9]{10,}/.test(c));
      if (!lab) continue;
      const prog = cells.find((c) => /^[0-9]+\/[0-9]+/.test(c)) || '';
      out.push({ labNumber: lab, progress: prog });
    }
    return out;
  });
}

/**
 * Get a domain-lane order for a chain to work on: reuse one from the Order Dashboard if the lane
 * already has any, otherwise attempt creation through the enter form.
 * Returns null (never throws) so a chain can mark the step and continue per section 11.5.
 */
export async function seedDomainOrder(page: Page, domain: DomainLane = 'clinical'): Promise<DomainOrderRef | null> {
  const log = (m: string) => console.log('[seedDomainOrder:' + domain + '] ' + m);

  const existing = await listDashboardOrders(page, domain);
  if (existing.length) {
    // Prefer the furthest-along order: a chain that needs results wants one past intake.
    const score = (p: string) => {
      const m = /^([0-9]+)\/([0-9]+)/.exec(p);
      return m ? Number(m[1]) / Number(m[2]) : 0;
    };
    const best = existing.slice().sort((a, b) => score(b.progress) - score(a.progress))[0];
    log('reusing ' + best.labNumber + ' (progress ' + (best.progress || 'unknown') + ') from '
      + existing.length + ' order(s) on the ' + domain + ' dashboard');
    return { labNumber: best.labNumber, domain, source: 'reused', progress: best.progress, path: 'domain' };
  }

  log('no existing orders on the ' + domain + ' dashboard - attempting creation through the enter form');
  const created = await createDomainOrder(page, domain);
  if (!created) {
    log('creation did not produce a persisted order; see finding 2 in the header of this file');
    return null;
  }
  return created;
}

async function createDomainOrder(page: Page, domain: DomainLane): Promise<DomainOrderRef | null> {
  const log = (m: string) => console.log('[createDomainOrder:' + domain + '] ' + m);

  await page.goto('/order/' + domain + '/enter', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForTimeout(5500);
  if (page.url().includes('/login')) { log('session lapsed'); return null; }
  if (!(await page.locator('#labNumber').count())) { log('enter form did not render'); return null; }

  let labNumber = await page.inputValue('#labNumber').catch(() => '');
  if (!labNumber) {
    labNumber = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', { headers: { Accept: 'application/json' } });
      const j: any = r.ok ? await r.json().catch(() => null) : null;
      return (j && j.body) || '';
    });
    if (!labNumber) { log('accession generator returned nothing'); return null; }
    log('lane did not auto-fill the required Lab Number; supplying ' + labNumber);
    await page.fill('#labNumber', labNumber).catch(() => undefined);
    await page.waitForTimeout(1500);
  }

  await page.selectOption('#sampleType-0', { index: 1 }).catch(() => undefined);
  await page.waitForTimeout(3000);

  const save = page.getByRole('button', { name: 'Save & Next', exact: true });
  const enabled = (await save.count()) ? await save.first().isEnabled().catch(() => false) : false;
  if (!enabled) { log('Save & Next stayed disabled with no validation message shown'); return null; }

  await save.first().click().catch(() => undefined);
  await page.waitForTimeout(3500);

  const after = await listDashboardOrders(page, domain);
  const found = after.some((o) => o.labNumber === labNumber);
  log('read-back on the ' + domain + ' dashboard: ' + (found ? 'FOUND' : 'NOT FOUND'));
  if (!found) return null;
  return { labNumber, domain, source: 'created', progress: '', path: 'domain' };
}
