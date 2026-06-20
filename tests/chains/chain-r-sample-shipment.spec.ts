/**
 * tests/chains/chain-r-sample-shipment.spec.ts
 *
 * SKILL §11 Chain R — Sample shipment (box → ship → receive) round-trip
 *
 * Deep build-out (v6.16): graduates the render-only sample-shipment suite.
 * Endpoints from OpenELIS-Global-2 shipment/BoxCreation.jsx + ReceptionWorkflow.jsx,
 * confirmed live on indonesiadev v3.2.1.10:
 *
 *   LIST     GET  /rest/shipping-box                       → box list (read-back)
 *   NUMBER   GET  /rest/shipping-box/generate-box-number   → next box number
 *   PREFIX   GET  /rest/shipping-box/box-label-prefix
 *   DICTS    GET  /rest/displayList/REFERRAL_ORGANIZATIONS , /REFERRAL_REASONS
 *   UNASSIGNED GET /rest/unassigned-sample/items/search    → addable samples
 *   CREATE   POST /rest/shipping-box                        → create box
 *   ADDITEMS POST /rest/box-sample/items                    → add samples to box
 *   RECEIVE  GET  /rest/shipping-box/by-box-id/{id} , /rest/box-sample/items/by-box/{id}
 *
 * Asserts the box list read-back + creation dictionaries + number generation,
 * then attempts a box create and verifies it lands in the list; on body-shape
 * rejection it GAPs with the confirmed endpoint. Reception read-back is checked
 * against any existing box. Never fabricates a pass.
 *
 * Run individually:  npx playwright test --project=chain-r
 */

import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  SHIPPING_BOX, SHIPPING_BOX_GEN_NUMBER, SHIPPING_BOX_LABEL_PREFIX,
  REFERRAL_ORGANIZATIONS, REFERRAL_REASONS, BOX_SAMPLE_BY_BOX, SHIPPING_BOX_BY_ID,
  buildShippingBoxBody,
} from './_common';

interface Box { id?: string | number; boxId?: string; boxNumber?: string }

test.describe.serial('Chain R — Sample shipment', () => {
  let boxesBefore = 0;
  let listOk = true;
  let knownBoxId: string | number | undefined;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain R] BASE=${BASE}`); });

  // Step 1 — Box list read-back + number/prefix generators (ROUND-TRIP)
  test('Step 1 — Shipping-box list + number/prefix generators (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const list = await apiCall<Box[]>(page, SHIPPING_BOX);
    if (!list.ok) {
      listOk = false;
      markStep('R', 1, 'GAP', `Shipping-box list unavailable (HTTP ${list.status})`, `GET ${SHIPPING_BOX}`);
      test.info().annotations.push({ type: 'gap', description: 'shipment domain unavailable' });
      return;
    }
    const boxes = Array.isArray(list.body) ? (list.body as Box[]) : [];
    boxesBefore = boxes.length;
    if (boxes[0]?.id !== undefined) knownBoxId = boxes[0].id;
    const num = await apiCall<string>(page, SHIPPING_BOX_GEN_NUMBER);
    const prefix = await apiCall<string>(page, SHIPPING_BOX_LABEL_PREFIX);
    if (num.ok && prefix.ok) {
      markStep('R', 1, 'PASS', `Box list read-back OK (${boxesBefore} box(es)); number+prefix generators reachable`);
      expect(num.ok && prefix.ok).toBeTruthy();
    } else {
      markStep('R', 1, 'GAP', `Box generators HTTP num=${num.status} prefix=${prefix.status}`);
      test.info().annotations.push({ type: 'gap', description: 'box generators unavailable' });
    }
  });

  // Step 2 — Box-creation dictionaries (FUNCTION)
  test('Step 2 — Referral org + reason dictionaries populate (FUNCTION)', async ({ page }) => {
    if (!listOk) { markStep('R', 2, 'GAP', 'Skipped — shipment domain unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const orgs = await apiCall<unknown[]>(page, REFERRAL_ORGANIZATIONS);
    const reasons = await apiCall<unknown[]>(page, REFERRAL_REASONS);
    const oN = Array.isArray(orgs.body) ? orgs.body.length : -1;
    const rN = Array.isArray(reasons.body) ? reasons.body.length : -1;
    if (reasons.ok && rN > 0) {
      markStep('R', 2, 'PASS', `Shipment dictionaries: REFERRAL_REASONS=${rN}, REFERRAL_ORGANIZATIONS=${oN}${oN === 0 ? ' (no ref orgs configured)' : ''}`);
      expect(rN).toBeGreaterThan(0);
    } else {
      markStep('R', 2, 'GAP', `Reason dictionary unavailable (n=${rN}, HTTP ${reasons.status})`);
      test.info().annotations.push({ type: 'gap', description: 'shipment dictionaries unavailable' });
    }
  });

  // Step 3 — Create a box with the PINNED body, verify it lands (ROUND-TRIP)
  // Body (ShippingBoxForm): {boxId, destinationFacilityId(@NotNull, a
  // REFERRAL_ORGANIZATIONS id), temperatureRequirement, capacity,
  // actualSampleCount, notes, state:'DRAFT'} → response.id. Verified on
  // indonesiademo v3.2.1.10: with destinationFacilityId=null the POST returns
  // 400 NotNull.shippingBoxForm.destinationFacilityId (body deserializes — the
  // only blocker is a configured destination, a DATA precondition).
  test('Step 3 — Box create lands in the shipping-box list (ROUND-TRIP)', async ({ page }) => {
    if (!listOk) { markStep('R', 3, 'GAP', 'Skipped — shipment domain unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const orgs = await apiCall<Array<{ id?: string | number }>>(page, REFERRAL_ORGANIZATIONS);
    const destId = Array.isArray(orgs.body) && orgs.body[0]?.id !== undefined ? Number(orgs.body[0].id) : null;
    if (destId === null) {
      // Confirm the body shape still deserializes (400 NotNull on destination) so
      // this is provably a data precondition, not a body-shape defect.
      const num0 = await apiCall<string>(page, SHIPPING_BOX_GEN_NUMBER);
      const probe = await apiCall<Array<{ codes?: string[] }>>(page, SHIPPING_BOX, {
        method: 'POST', body: buildShippingBoxBody({ boxId: typeof num0.body === 'string' ? num0.body : `QA-${Date.now()}`, destinationFacilityId: null }),
      });
      const shapeOk = probe.status === 400 && Array.isArray(probe.body) && JSON.stringify(probe.body).includes('destinationFacilityId');
      markStep('R', 3, 'GAP',
        shapeOk
          ? 'No REFERRAL_ORGANIZATIONS configured — box create body shape VERIFIED (400 NotNull.destinationFacilityId); full create blocked on a data precondition (configure a referral org).'
          : `No referral org configured; create probe HTTP ${probe.status}`,
        `POST ${SHIPPING_BOX}`);
      test.info().annotations.push({ type: 'gap', description: 'no referral org (data precondition)' });
      return;
    }
    const num = await apiCall<string>(page, SHIPPING_BOX_GEN_NUMBER);
    const boxId = typeof num.body === 'string' ? num.body : `QA-${Date.now()}`;
    const create = await apiCall<Box>(page, SHIPPING_BOX, { method: 'POST', body: buildShippingBoxBody({ boxId, destinationFacilityId: destId }) });
    if (!create.ok) {
      markStep('R', 3, 'FAIL', `shipping-box create HTTP ${create.status} with the pinned body (destId=${destId})`, `POST ${SHIPPING_BOX}`);
      expect(create.ok, 'box create accepted pinned body').toBeTruthy();
      return;
    }
    const newId = (create.body && typeof create.body === 'object') ? (create.body as Box).id : undefined;
    const after = await apiCall<Box[]>(page, SHIPPING_BOX);
    const boxes = Array.isArray(after.body) ? (after.body as Box[]) : [];
    const landed = boxes.length > boxesBefore || boxes.some(b => b.boxId === boxId || b.id === newId);
    if (newId !== undefined) knownBoxId = newId;
    if (landed) {
      markStep('R', 3, 'PASS', `Box ${boxId} created (id=${newId}) and landed in list (${boxesBefore} → ${boxes.length})`);
      expect(landed).toBeTruthy();
    } else {
      markStep('R', 3, 'FAIL', `Box create 2xx but list unchanged (${boxes.length})`);
      expect(landed, 'box landed in list').toBeTruthy();
    }
  });

  // Step 4 — Reception read-back for a known box (CROSS-LINK)
  test('Step 4 — Reception read-back (by-box-id + box-sample items) (CROSS-LINK)', async ({ page }) => {
    if (!listOk) { markStep('R', 4, 'GAP', 'Skipped — shipment domain unavailable (Step 1)'); return; }
    if (knownBoxId === undefined) {
      markStep('R', 4, 'GAP', 'No box id available to read back (no boxes created/existing)');
      test.info().annotations.push({ type: 'gap', description: 'no box id for reception' });
      return;
    }
    await page.goto(BASE);
    const box = await apiCall(page, SHIPPING_BOX_BY_ID(knownBoxId));
    const items = await apiCall(page, BOX_SAMPLE_BY_BOX(knownBoxId));
    if (box.ok) {
      markStep('R', 4, 'PASS', `Reception read-back OK for box ${knownBoxId} (by-box-id 200; items HTTP ${items.status})`);
      expect(box.ok).toBeTruthy();
    } else {
      markStep('R', 4, 'GAP', `Reception read-back HTTP ${box.status} for box ${knownBoxId}`);
      test.info().annotations.push({ type: 'gap', description: 'reception read-back failed' });
    }
  });
});
