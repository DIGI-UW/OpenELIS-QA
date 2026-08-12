// Demo-data seed capability: inventory items + lots.
// Idempotent: skips names that already exist. Re-runnable after a reset.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-inventory.docs.spec.ts
//
// Endpoint mechanics (learned via probe, 2026-07-05):
//   Item types: REAGENT, RDT, CARTRIDGE, HIV_KIT, SYPHILIS_KIT
//   POST /rest/inventory/items with { name, itemType, units, ... } -> 201
//   POST /rest/inventory/lots with { lotNumber, currentQuantity, initialQuantity, expirationDate,
//                                    receiptDate, inventoryItem: { id } } -> 201
//   DELETE returns 405 — records are permanent.

import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

type ItemSeed = {
  name: string;
  itemType: 'REAGENT' | 'RDT' | 'CARTRIDGE' | 'HIV_KIT' | 'SYPHILIS_KIT';
  units: string;
  manufacturer?: string;
  partNumber?: string;
  quantityPerUnit?: number;
  minimumStockLevel?: number;
  expirationAlertDays?: number;
  storageRequirements?: string;
  lots: LotSeed[];
};

type LotSeed = {
  lotNumber: string;
  initialQuantity: number;
  currentQuantity: number;
  expirationDate: string;   // YYYY-MM-DD
  receiptDate: string;      // YYYY-MM-DD
};

// Today = 2026-07-05. Craft dates so the dashboard shows a mix:
// - Expired: expirationDate before today
// - Expiring soon: expirationDate within 30 days
// - Low stock: currentQuantity well under initialQuantity
// - Healthy: everything else
const TODAY = '2026-07-05';
const IN_10_DAYS = '2026-07-15';    // expiring soon
const IN_25_DAYS = '2026-07-30';    // expiring soon
const IN_6_MONTHS = '2027-01-05';
const IN_12_MONTHS = '2027-07-05';
const YESTERDAY = '2026-07-04';     // expired
const LAST_MONTH = '2026-06-05';    // expired

const ITEMS: ItemSeed[] = [
  {
    name: 'HIV Viral Load Extraction Kit', itemType: 'REAGENT', units: 'tests', manufacturer: 'Roche',
    partNumber: 'HIV-VL-EXT-96', quantityPerUnit: 96, minimumStockLevel: 20, expirationAlertDays: 60,
    storageRequirements: 'Store at 2-8°C',
    lots: [
      { lotNumber: 'HVL-EXT-001', initialQuantity: 96, currentQuantity: 84, expirationDate: IN_6_MONTHS, receiptDate: '2026-05-01' },
      { lotNumber: 'HVL-EXT-002', initialQuantity: 96, currentQuantity: 62, expirationDate: IN_25_DAYS, receiptDate: '2026-04-15' },
    ],
  },
  {
    name: 'Sysmex CELLPACK DCL Diluent', itemType: 'REAGENT', units: 'mL', manufacturer: 'Sysmex',
    partNumber: 'CELLPACK-24L', quantityPerUnit: 24000, minimumStockLevel: 12000, expirationAlertDays: 45,
    storageRequirements: 'Store at room temperature',
    lots: [
      { lotNumber: 'CELLPACK-A24', initialQuantity: 24000, currentQuantity: 8500, expirationDate: IN_12_MONTHS, receiptDate: '2026-03-10' },
    ],
  },
  {
    name: 'Multiskan Wash Buffer 20X', itemType: 'REAGENT', units: 'mL', manufacturer: 'Thermo Fisher',
    partNumber: 'WB20X-500', quantityPerUnit: 500, minimumStockLevel: 200, expirationAlertDays: 30,
    storageRequirements: 'Store at 2-8°C',
    lots: [
      { lotNumber: 'WB-EX-004', initialQuantity: 500, currentQuantity: 320, expirationDate: LAST_MONTH, receiptDate: '2025-11-20' },
      { lotNumber: 'WB-005',   initialQuantity: 500, currentQuantity: 480, expirationDate: IN_6_MONTHS, receiptDate: '2026-06-10' },
    ],
  },
  {
    name: 'Ziehl-Neelsen Stain Set', itemType: 'REAGENT', units: 'kit', manufacturer: 'Sigma-Aldrich',
    partNumber: 'ZN-SET-1', quantityPerUnit: 1, minimumStockLevel: 3, expirationAlertDays: 90,
    storageRequirements: 'Store in dark, room temperature',
    lots: [
      { lotNumber: 'ZN-B42', initialQuantity: 5, currentQuantity: 5, expirationDate: IN_12_MONTHS, receiptDate: '2026-06-15' },
    ],
  },
  {
    name: 'Turbidol PT Reagent', itemType: 'REAGENT', units: 'mL', manufacturer: 'Stago',
    partNumber: 'PT-5ML', quantityPerUnit: 5, minimumStockLevel: 15, expirationAlertDays: 30,
    storageRequirements: 'Store at 2-8°C',
    lots: [
      { lotNumber: 'PT-88291', initialQuantity: 50, currentQuantity: 12, expirationDate: IN_10_DAYS, receiptDate: '2026-06-02' },
    ],
  },
  {
    name: 'Xpert MTB/RIF Ultra Cartridge', itemType: 'CARTRIDGE', units: 'cartridge', manufacturer: 'Cepheid',
    partNumber: 'GXMTB/RIF-ULTRA-10', quantityPerUnit: 10, minimumStockLevel: 20, expirationAlertDays: 60,
    storageRequirements: 'Store at 2-28°C',
    lots: [
      { lotNumber: 'MTB-U-2607A', initialQuantity: 100, currentQuantity: 78, expirationDate: IN_6_MONTHS, receiptDate: '2026-05-20' },
      { lotNumber: 'MTB-U-2607B', initialQuantity: 100, currentQuantity: 95, expirationDate: IN_25_DAYS, receiptDate: '2026-04-05' },
    ],
  },
  {
    name: 'Xpert HIV-1 Viral Load Cartridge', itemType: 'CARTRIDGE', units: 'cartridge', manufacturer: 'Cepheid',
    partNumber: 'GXHIV-VL-10', quantityPerUnit: 10, minimumStockLevel: 15, expirationAlertDays: 60,
    storageRequirements: 'Store at 2-28°C',
    lots: [
      { lotNumber: 'HIV-VL-2606A', initialQuantity: 100, currentQuantity: 68, expirationDate: IN_12_MONTHS, receiptDate: '2026-06-01' },
      { lotNumber: 'HIV-VL-2607', initialQuantity: 100, currentQuantity: 100, expirationDate: IN_12_MONTHS, receiptDate: '2026-07-01' },
    ],
  },
  {
    name: 'HIV Determine 1/2 Rapid Test', itemType: 'RDT', units: 'tests', manufacturer: 'Abbott',
    partNumber: 'DTMN-HIV-100', quantityPerUnit: 100, minimumStockLevel: 200, expirationAlertDays: 45,
    storageRequirements: 'Store at 2-30°C',
    lots: [
      { lotNumber: 'DTMN-2606', initialQuantity: 100, currentQuantity: 55, expirationDate: IN_12_MONTHS, receiptDate: '2026-06-08' },
      { lotNumber: 'DTMN-2604', initialQuantity: 100, currentQuantity: 20, expirationDate: IN_10_DAYS, receiptDate: '2026-04-12' },
    ],
  },
  {
    name: 'Malaria RDT (P. falciparum)', itemType: 'RDT', units: 'tests', manufacturer: 'SD Biosensor',
    partNumber: 'MAL-PF-25', quantityPerUnit: 25, minimumStockLevel: 100, expirationAlertDays: 30,
    storageRequirements: 'Store at 4-30°C',
    lots: [
      { lotNumber: 'MAL-PF-A', initialQuantity: 100, currentQuantity: 78, expirationDate: IN_12_MONTHS, receiptDate: '2026-06-20' },
      { lotNumber: 'MAL-PF-B', initialQuantity: 100, currentQuantity: 45, expirationDate: YESTERDAY, receiptDate: '2026-01-15' },
    ],
  },
  {
    name: 'SARS-CoV-2 Antigen RDT', itemType: 'RDT', units: 'tests', manufacturer: 'SD Biosensor',
    partNumber: 'COVID-AG-20', quantityPerUnit: 20, minimumStockLevel: 100, expirationAlertDays: 30,
    storageRequirements: 'Store at 2-30°C',
    lots: [
      { lotNumber: 'COV-AG-Q3', initialQuantity: 200, currentQuantity: 34, expirationDate: IN_6_MONTHS, receiptDate: '2026-05-01' },
    ],
  },
  {
    name: 'Wantai HIV Ab/Ag Combo ELISA', itemType: 'HIV_KIT', units: 'tests', manufacturer: 'Beijing Wantai',
    partNumber: 'HIV-COMBO-96', quantityPerUnit: 96, minimumStockLevel: 3, expirationAlertDays: 60,
    storageRequirements: 'Store at 2-8°C',
    lots: [
      { lotNumber: 'WT-HIV-B4', initialQuantity: 5, currentQuantity: 4, expirationDate: IN_6_MONTHS, receiptDate: '2026-06-10' },
      { lotNumber: 'WT-HIV-B5', initialQuantity: 5, currentQuantity: 5, expirationDate: IN_25_DAYS, receiptDate: '2026-04-01' },
    ],
  },
  {
    name: 'Wondfo Syphilis Ab Rapid Test', itemType: 'SYPHILIS_KIT', units: 'tests', manufacturer: 'Wondfo Biotech',
    partNumber: 'SYPH-40', quantityPerUnit: 40, minimumStockLevel: 5, expirationAlertDays: 60,
    storageRequirements: 'Store at 4-30°C',
    lots: [
      { lotNumber: 'WSY-A11', initialQuantity: 10, currentQuantity: 9, expirationDate: IN_12_MONTHS, receiptDate: '2026-06-25' },
    ],
  },
];

test('seed inventory items + lots', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Existing items — idempotency check by name
  const rawItems = await (await page.request.get(P + '/rest/inventory/items/all')).text();
  const existingItems: any[] = (() => { try { return JSON.parse(rawItems); } catch { return []; } })() || [];
  const byName = new Map<string, any>();
  for (const it of existingItems) byName.set(String(it.name || '').toLowerCase(), it);
  console.log('EXISTING_ITEM_COUNT', existingItems.length);

  // Existing lots — skip by lotNumber
  const rawLots = await (await page.request.get(P + '/rest/inventory/lots')).text();
  const existingLots: any[] = (() => { try { return JSON.parse(rawLots); } catch { return []; } })() || [];
  const lotSet = new Set<string>(existingLots.map(l => String(l.lotNumber || '').toLowerCase()));
  console.log('EXISTING_LOT_COUNT', existingLots.length);

  let itemsCreated = 0, itemsSkipped = 0, lotsCreated = 0, lotsSkipped = 0, failed = 0;

  for (const seed of ITEMS) {
    const key = seed.name.toLowerCase();
    let itemId: number | null = null;
    if (byName.has(key)) {
      itemId = byName.get(key).id;
      itemsSkipped++;
      console.log('ITEM_SKIP_EXISTS', seed.name, 'id=' + itemId);
    } else {
      const body = { name: seed.name, itemType: seed.itemType, units: seed.units, manufacturer: seed.manufacturer, quantityPerUnit: seed.quantityPerUnit, expirationAlertDays: seed.expirationAlertDays, storageRequirements: seed.storageRequirements, isActive: 'Y' };
      const r = await page.evaluate(async (b) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const r = await fetch('/api/OpenELIS-Global/rest/inventory/items', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(b) });
        return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 600) };
      }, body);
      if (r.status >= 200 && r.status < 300) {
        try { itemId = JSON.parse(r.text).id; } catch {}
        itemsCreated++;
        console.log('ITEM_CREATED', seed.name, 'id=' + itemId);
      } else {
        failed++;
        console.log('ITEM_FAIL', seed.name, r.status, r.text.replace(/\s+/g, ' '));
        continue;
      }
    }

    for (const lot of seed.lots) {
      if (lotSet.has(lot.lotNumber.toLowerCase())) { lotsSkipped++; console.log('  LOT_SKIP', lot.lotNumber); continue; }
      const body = { lotNumber: lot.lotNumber, initialQuantity: lot.initialQuantity, currentQuantity: lot.currentQuantity, expirationDate: lot.expirationDate, receiptDate: lot.receiptDate, inventoryItem: { id: itemId } };
      const r = await page.evaluate(async (b) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const r = await fetch('/api/OpenELIS-Global/rest/inventory/lots', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(b) });
        return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 500) };
      }, body);
      if (r.status >= 200 && r.status < 300) { lotsCreated++; console.log('  LOT_CREATED', lot.lotNumber, 'qty=' + lot.currentQuantity + '/' + lot.initialQuantity, 'exp=' + lot.expirationDate); }
      else { failed++; console.log('  LOT_FAIL', lot.lotNumber, r.status, r.text.replace(/\s+/g, ' ')); }
    }
    await page.waitForTimeout(100);
  }

  console.log('INVENTORY_SEED_SUMMARY', JSON.stringify({ itemsCreated, itemsSkipped, lotsCreated, lotsSkipped, failed, plannedItems: ITEMS.length }));
  expect(failed, 'no seed failures').toBe(0);
});
