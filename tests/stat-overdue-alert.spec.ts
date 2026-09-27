/**
 * tests/stat-overdue-alert.spec.ts
 *
 * A STAT order received two days ago and still unresulted must show up as an Overdue STAT
 * alert. Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R58;
 * uncovered-workflows-catalogue TC-ALRT-06).
 *
 * Observed by hand: DEV...0008 (STAT, 36 h, unresulted) and DEV...0277 (STAT, received two
 * days earlier) left statOverdue at 0 for over an hour. No STAT turnaround threshold is
 * visible in configuration, so this may be a missing default rather than a broken job.
 */
import { test, expect } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { createPatientViaAPI, ensureReferringClinic } from '../helpers/data-factory';
import { orderThroughWizard } from '../helpers/order-wizard';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

test.describe('Overdue STAT alerts (R58)', () => {
  test('TC-ALRT-06: an unresulted STAT order received two days ago is counted as overdue', async ({ page }) => {
    // FLIP-WHEN-FIXED (R58). The canary part (order saved as STAT, two days old) must hold.
    test.fail();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    expect(siteId, errors.join(' | ')).toBeTruthy();
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find(s => String(s.id) === String(siteId))?.value ?? '';
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100)}`;
    const pt = await createPatientViaAPI(page, { nationalId: `QASTAT${stamp}`, subjectNumber: `95${stamp}`, firstName: 'Stat', lastName: 'Qaauto' });
    expect(pt.id, pt.detail).toBeTruthy();
    const labNo = await orderThroughWizard(page, {
      subjectNumber: `95${stamp}`, patientId: pt.id!, siteName, program: 'Routine Testing',
      sampleType: 'Serum', testName: 'Glucose', requesterLastName: 'Statreq', priority: 'STAT', receivedDaysAgo: 2,
    });
    const order = await apiGet<{ sampleOrderItems?: { priority?: string } }>(page, `/rest/SampleEdit?accessionNumber=${labNo}`);
    expect(order.json?.sampleOrderItems?.priority, `${labNo} saved as STAT`).toBe('STAT');
    // Give a scheduled job a fair chance before judging.
    await expect.poll(async () => (await apiGet<{ statOverdue?: number }>(page, '/rest/alerts/dashboard/summary')).json?.statOverdue ?? 0,
      { timeout: 120_000, intervals: [10_000], message: 'Overdue STAT Orders counts the two-day-old STAT order' }).toBeGreaterThan(0);
  });
});
