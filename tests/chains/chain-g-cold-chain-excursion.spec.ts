/**
 * tests/chains/chain-g-cold-chain-excursion.spec.ts
 *
 * SKILL §11 Chain G — Cold-Chain Excursion
 *
 * What this chain proves: a freezer / refrigerator out-of-range
 * reading triggers the full regulatory loop — alert fired, corrective
 * action linkable, audit log entry produced.
 *
 * Hard prerequisite: at least one Cold Storage device must be
 * configured. On most installs (mgtest v3.2.1.5) the device list is
 * empty and the chain BAILs in Step 1.
 *
 * Hard limitation: this chain cannot ACTUALLY simulate a real
 * Modbus/BACnet temperature reading without hardware in the loop. It
 * uses an API-direct path to insert a synthetic excursion event, which
 * tests the downstream loop but not the sensor integration. The sensor
 * integration is a separate manual-test scope (workplan E6).
 *
 * Run individually:
 *   npx playwright test --project=chain-g
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';

interface ColdStorageDevice { id?: string; name?: string; type?: string; }
interface CorrectiveAction { id?: string; deviceId?: string; description?: string; }

test.describe.serial('Chain G — Cold-Chain Excursion', () => {
  let device: ColdStorageDevice | null = null;
  let excursionId: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain G] BASE=${BASE}`);
  });

  test('Step 1 — Cold Storage device exists (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<ColdStorageDevice[] | { devices?: ColdStorageDevice[] }>(
      page, '/api/OpenELIS-Global/rest/cold-storage/devices'
    );
    if (!r.ok) {
      markStep('G', 1, 'FAIL',
        `Cold Storage devices endpoint HTTP ${r.status}`,
        `Either the endpoint is at a different path or Cold Storage Monitoring is not deployed.`);
      expect(r.ok).toBeTruthy(); return;
    }
    const list = Array.isArray(r.body) ? r.body : ((r.body as { devices?: ColdStorageDevice[] } | null)?.devices || []);
    if (list.length === 0) {
      markStep('G', 1, 'FAIL',
        'No Cold Storage devices configured',
        `Configure at least one device via Cold Storage Monitoring → Settings → Device Management. ` +
        `Chain G is BLOCKED until a device exists.`);
      expect(list.length).toBeGreaterThan(0); return;
    }
    device = list[0];
    markStep('G', 1, 'PASS', `Using device id=${device.id} "${device.name}" type=${device.type}`);
  });

  test('Step 2 — Insert synthetic excursion event (PERSIST, hardware-substitute)', async ({ page }) => {
    if (!device?.id) test.skip();
    await page.goto(BASE);
    const r = await apiCall<{ id?: string }>(
      page, '/api/OpenELIS-Global/rest/cold-storage/events', {
        method: 'POST',
        body: {
          deviceId: device!.id,
          eventType: 'EXCURSION',
          severity: 'CRITICAL',
          temperature: 25.0,
          threshold: 8.0,
          recordedAt: new Date().toISOString(),
          source: 'QA_AUTO_chain-g',
        },
      });
    if (!r.ok) {
      markStep('G', 2, 'BLOCKED',
        `Excursion insert HTTP ${r.status}`,
        `Without an event-write API, this chain can only test the read side. The hardware-driven path is out of scope.`);
      test.info().annotations.push({ type: 'blocked', description: 'no excursion write API' });
      return;
    }
    excursionId = (typeof r.body === 'object' && r.body !== null) ? (r.body as { id?: string }).id ?? null : null;
    markStep('G', 2, 'PASS', `Excursion event id=${excursionId}`);
  });

  test('Step 3 — Alert fires for the excursion (CROSS-LINK)', async ({ page }) => {
    if (!device?.id) test.skip();
    await page.goto(BASE);
    await page.waitForTimeout(2000); // alert engine may be async
    const r = await apiCall<{ alerts?: Array<{ deviceId?: string; severity?: string; source?: string }> }>(
      page, '/api/OpenELIS-Global/rest/cold-storage/alerts'
    );
    if (!r.ok) { markStep('G', 3, 'FAIL', `Alerts HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return; }
    const alerts = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { alerts?: Array<{ deviceId?: string }> }).alerts || [])
      : [];
    const found = alerts.find(a => a.deviceId === device!.id);
    if (!found) {
      markStep('G', 3, 'FAIL',
        `Excursion logged (Step 2) but no alert for device ${device!.id}`,
        `Alert engine did not respond to the excursion. CAP/CLIA compliance gap.`);
      expect(found).toBeTruthy(); return;
    }
    markStep('G', 3, 'PASS', `Alert exists for device ${device!.id}`);
  });

  test('Step 4 — Add corrective action linked to excursion (PERSIST, CROSS-LINK)', async ({ page }) => {
    if (!device?.id || !excursionId) test.skip();
    await page.goto(BASE);
    const r = await apiCall<CorrectiveAction>(
      page, '/api/OpenELIS-Global/rest/cold-storage/corrective-actions', {
        method: 'POST',
        body: {
          deviceId: device!.id,
          excursionId,
          description: 'QA_AUTO_chain-g: synthetic excursion - moved samples to backup freezer',
          actionTakenBy: 'admin',
          actionTakenAt: new Date().toISOString(),
        },
      });
    if (!r.ok) {
      markStep('G', 4, 'FAIL', `Corrective action create HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep('G', 4, 'PASS', `Corrective action created and linked to excursion ${excursionId}`);
  });

  test('Step 5 — Audit log records the corrective action (REPORTABLE)', async ({ page }) => {
    if (!device?.id) test.skip();
    await page.goto(BASE);
    const today = new Date().toISOString().slice(0, 10);
    const r = await apiCall<{ entries?: Array<{ description?: string }> }>(
      page, `/api/OpenELIS-Global/rest/cold-storage/audit?date=${today}`
    );
    if (!r.ok) {
      markStep('G', 5, 'FAIL',
        `Cold Storage audit endpoint HTTP ${r.status}`,
        `Audit trail is regulatory-required (CAP/CLIA). Missing endpoint = no compliance evidence.`);
      expect(r.ok).toBeTruthy(); return;
    }
    const entries = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { entries?: Array<{ description?: string }> }).entries || [])
      : [];
    const found = entries.find(e => e.description?.includes('QA_AUTO_chain-g'));
    if (!found) {
      markStep('G', 5, 'FAIL',
        `Corrective action logged (Step 4) but no audit entry for QA_AUTO_chain-g today`,
        `The compliance loop is broken — action taken but not preserved for auditor.`);
      expect(found).toBeTruthy(); return;
    }
    markStep('G', 5, 'PASS', `Audit trail contains our corrective action`);
  });
});
