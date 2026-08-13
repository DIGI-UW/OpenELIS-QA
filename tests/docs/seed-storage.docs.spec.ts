// Demo-data seed capability: storage rooms + devices (freezers, refrigerators).
// Idempotent: skips names that already exist. Re-runnable after a reset.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-storage.docs.spec.ts
//
// Endpoint mechanics (learned via probe, 2026-07-05):
//   POST /rest/storage/rooms   with { name, code, active }
//   POST /rest/storage/devices with { name, code, type, parentRoomId, active }
//   type enum: 'freezer' | 'refrigerator' (others exist; verified two here)
//   409 with { error: 'Device name must be unique within the room' } for duplicates.

import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

type RoomSeed = { name: string; code: string };
type DeviceSeed = { name: string; code: string; type: 'freezer' | 'refrigerator'; parentRoomName: string };

const ROOMS: RoomSeed[] = [
  { name: 'Hema Lab', code: 'HEM' },              // already exists
  { name: 'Molecular Lab', code: 'MOL' },          // created in earlier probe
  { name: 'Serology Lab', code: 'SER' },           // created in earlier probe
  { name: 'Sample Reception', code: 'RCV' },
  { name: 'Cold Chain Room', code: 'COLD' },
];

const DEVICES: DeviceSeed[] = [
  // Hema Lab
  { name: 'Freezer 2', code: 'F2', type: 'freezer', parentRoomName: 'Hema Lab' },
  { name: 'Reagent Refrigerator A', code: 'REF-A', type: 'refrigerator', parentRoomName: 'Hema Lab' },
  // Molecular Lab
  { name: 'Ultra-Low Freezer -80', code: 'ULF-01', type: 'freezer', parentRoomName: 'Molecular Lab' },
  { name: 'Sample Freezer -20', code: 'SF-01', type: 'freezer', parentRoomName: 'Molecular Lab' },
  { name: 'Working Refrigerator', code: 'REF-M1', type: 'refrigerator', parentRoomName: 'Molecular Lab' },
  // Serology Lab
  { name: 'ELISA Kit Refrigerator', code: 'REF-S1', type: 'refrigerator', parentRoomName: 'Serology Lab' },
  { name: 'Serum Storage Freezer', code: 'SSF-01', type: 'freezer', parentRoomName: 'Serology Lab' },
  // Cold Chain Room
  { name: 'Vaccine Refrigerator', code: 'VAC-1', type: 'refrigerator', parentRoomName: 'Cold Chain Room' },
  { name: 'Vaccine Backup Refrigerator', code: 'VAC-2', type: 'refrigerator', parentRoomName: 'Cold Chain Room' },
];

test('seed storage rooms + devices', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Existing rooms
  const rawRooms = await (await page.request.get(P + '/rest/storage/rooms')).text();
  const existingRooms: any[] = (() => { try { return JSON.parse(rawRooms); } catch { return []; } })();
  const roomByName = new Map<string, any>();
  for (const r of existingRooms) roomByName.set(String(r.name || '').toLowerCase(), r);
  console.log('EXISTING_ROOM_COUNT', existingRooms.length);

  let roomsCreated = 0, roomsSkipped = 0, devicesCreated = 0, devicesSkipped = 0, failed = 0;

  // Rooms
  for (const seed of ROOMS) {
    const key = seed.name.toLowerCase();
    if (roomByName.has(key)) { roomsSkipped++; console.log('ROOM_SKIP', seed.name); continue; }
    const r = await page.evaluate(async (b) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch('/api/OpenELIS-Global/rest/storage/rooms', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(b) });
      return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 400) };
    }, { ...seed, active: true });
    if (r.status >= 200 && r.status < 300) {
      try { const room = JSON.parse(r.text); roomByName.set(seed.name.toLowerCase(), room); roomsCreated++; console.log('ROOM_CREATED', seed.name, 'id=' + room.id); }
      catch { failed++; console.log('ROOM_PARSE_FAIL', seed.name); }
    } else { failed++; console.log('ROOM_FAIL', seed.name, r.status, r.text.replace(/\s+/g, ' ')); }
  }

  // Devices
  const rawDevices = await (await page.request.get(P + '/rest/storage/devices')).text();
  const existingDevices: any[] = (() => { try { return JSON.parse(rawDevices); } catch { return []; } })();
  const devKey = (name: string, roomId: number | string) => `${roomId}:${name.toLowerCase()}`;
  const devSet = new Set<string>(existingDevices.map(d => devKey(d.name, d.parentRoomId)));

  for (const seed of DEVICES) {
    const room = roomByName.get(seed.parentRoomName.toLowerCase());
    if (!room) { failed++; console.log('NO_ROOM_FOR', seed.name, seed.parentRoomName); continue; }
    if (devSet.has(devKey(seed.name, room.id))) { devicesSkipped++; console.log('DEV_SKIP', seed.name); continue; }
    const body = { name: seed.name, code: seed.code, type: seed.type, parentRoomId: room.id, active: true };
    const r = await page.evaluate(async (b) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch('/api/OpenELIS-Global/rest/storage/devices', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(b) });
      return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 400) };
    }, body);
    if (r.status >= 200 && r.status < 300) { devicesCreated++; console.log('DEV_CREATED', seed.name, 'in', seed.parentRoomName); }
    else if (r.status === 409) { devicesSkipped++; console.log('DEV_SKIP_409', seed.name); }
    else { failed++; console.log('DEV_FAIL', seed.name, r.status, r.text.replace(/\s+/g, ' ')); }
  }

  console.log('STORAGE_SEED_SUMMARY', JSON.stringify({ roomsCreated, roomsSkipped, devicesCreated, devicesSkipped, failed, plannedRooms: ROOMS.length, plannedDevices: DEVICES.length }));
  expect(failed).toBe(0);
});
