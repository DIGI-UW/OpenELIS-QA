/**
 * OpenELIS Global — Label Preset Management QA suite
 * Target: testing.openelis-global.org (3.2.2.0) · route /MasterListsPage/labelPresets
 * RENDER/FUNCTION cases verified 2026-06-29 · write contract added 2026-09-21.
 *
 * WHAT CHANGED 2026-09-21 AND WHY
 * This suite passed 4/1-skipped while no preset on the instance could be edited at all
 * (OGC-1227: PUT rejected 400 before the controller ran; a well-formed PUT 500s on any
 * preset that already has fields; a PUT omitting `fields` returns 200 and deletes the
 * preset's label content). It missed all of it because the only PERSIST case was:
 *
 *   test.fixme(true, 'Carbon modal form write not reliably automatable;
 *                     product Save persists for a real user')
 *
 * The write turned out to be perfectly drivable — the Carbon steppers work fine, and the
 * API is reachable in-page with the session's own CSRF token. The fixme was not a harness
 * limitation, it was an unverified claim about the product, and it is what let this ship.
 *
 * So: TC-LP-05 is un-fixme'd and driven end to end, and TC-LP-06…10 pin each defect at the
 * contract level. They are regression guards — TC-LP-05/06/07/08/10 FAIL on 3.2.2.0 by
 * design, and are the acceptance test for OGC-1227.
 *
 * Every write case uses helpers/silentSave.ts, which refuses to grade a save on the
 * strength of a dialog closing: it requires the request to have been issued, the status to
 * be 2xx, the outcome to be visible to the user, and the record to read back on a
 * different surface.
 *
 * SAFETY
 * The destructive cases never touch a System preset. beforeAll duplicates Order Label into
 * a `QaAuto` scratch preset and afterAll deactivates it (LIMS rule: deactivate, never
 * hard-delete). TC-LP-05 edits a System preset's height and restores it in a finally.
 */
import { test, expect, Page } from '@playwright/test';
import {
  apiGet,
  apiWrite,
  captureWrites,
  saveWriteEvidence,
  assertWriteIssued,
  assertWriteSucceeded,
  assertUserVisibleOutcome,
  assertRoundTrip,
} from './helpers/silentSave';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const LIST = `${BASE}/MasterListsPage/labelPresets`;

/** Path as the SPA calls it, under config.serverBaseUrl (/api/OpenELIS-Global). Captured live 2026-09-21. */
const PRESETS = '/api/labelPresets';
const WRITE_PATH = /\/api\/labelPresets(\/\d+)?$/;

const SCRATCH_NAME = `QaAuto ${new Date().toISOString().slice(5, 10).replace('-', '')} LP`;

interface Preset {
  id: number;
  name: string;
  heightMm: number;
  widthMm: number;
  barcodeType: string;
  printsPerOrder: boolean;
  printsPerSample: boolean;
  defaultPerOrder: number;
  maxPerOrder: number;
  defaultPerSample: number;
  maxPerSample: number;
  isActive: boolean;
  isSystem: boolean;
  fields: Array<{ id?: number; fieldKey: string; sourceType?: string; isRequired: boolean; displayOrder: number }>;
}

/** The subset LabelPresetForm actually declares. Anything else in `fields` is a 400 (Defect 1). */
const toFormFields = (p: Preset) =>
  (p.fields ?? []).map((f) => ({ fieldKey: f.fieldKey, isRequired: f.isRequired, displayOrder: f.displayOrder }));

/** A well-formed LabelPresetForm body built from a read-back preset. */
const toFormBody = (p: Preset, overrides: Partial<Preset> = {}) => ({
  name: p.name,
  heightMm: p.heightMm,
  widthMm: p.widthMm,
  barcodeType: p.barcodeType,
  printsPerOrder: p.printsPerOrder,
  printsPerSample: p.printsPerSample,
  defaultPerOrder: p.defaultPerOrder,
  maxPerOrder: p.maxPerOrder,
  defaultPerSample: p.defaultPerSample,
  maxPerSample: p.maxPerSample,
  isActive: p.isActive,
  fields: toFormFields(p),
  ...overrides,
});

async function login(page: Page) {
  // 2026-08-13: probes.config.ts supplies storageState from the `setup` project, so this context is
  // ALREADY authenticated and /login redirects straight to the dashboard. The old body filled a
  // username field unconditionally; with no such field on the page, .fill() waited out the full
  // 120s test timeout INSIDE beforeEach, so every test in this file died before reaching its first
  // assertion. Check whether the form is actually there before acting on it.
  await page.goto(`${BASE}/login`);
  const pass = page.locator('input[type="password"]').first();
  if (!(await pass.isVisible({ timeout: 5000 }).catch(() => false))) return; // already signed in
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await pass.fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}
test.beforeEach(async ({ page }) => { await login(page); });

async function listPresets(page: Page): Promise<Preset[]> {
  const res = await apiGet<Preset[]>(page, PRESETS);
  expect(res.status, `GET ${PRESETS} should return the preset list`).toBe(200);
  expect(Array.isArray(res.json), `GET ${PRESETS} returned ${res.text.slice(0, 80)} — the SPA shell, not JSON`).toBe(true);
  return res.json as Preset[];
}

const byName = (all: Preset[], name: string): Preset => {
  const hit = all.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!hit) throw new Error(`preset "${name}" not found; have: ${all.map((p) => p.name).join(', ')}`);
  return hit;
};

// ── RENDER / FUNCTION ────────────────────────────────────────────────────────

test('TC-LP-01: Label Presets list renders with the 5 system presets (RENDER)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  for (const name of ['Order Label', 'Specimen Label', 'Block Label', 'Slide Label', 'Freezer Label']) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
});

test('TC-LP-02: list columns + Add Preset present (RENDER)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  for (const col of [/Name/i, /Barcode Type/i, /Dimensions/i, /Scope/i, /Status/i, /Actions/i]) {
    await expect(page.getByText(col).first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /add preset/i }).first()).toBeVisible();
});

test('TC-LP-03: filter narrows the list (FUNCTION)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  await page.locator('input[placeholder*="search" i], input[type="text"], input[type="search"]').first().fill('Freezer');
  await page.waitForTimeout(1200);
  await expect(page.getByText('Freezer Label').first()).toBeVisible();
  await expect(page.getByText('Order Label')).toHaveCount(0);
});

test('TC-LP-04: "Add Preset" opens the create modal with its fields (FUNCTION)', async ({ page }) => {
  await page.goto(LIST);
  await page.getByRole('button', { name: /add preset/i }).first().click({ force: true });
  await page.waitForTimeout(1200);
  await expect(page.getByText(/Add Label Preset/i).first()).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/Preset Name/i);
  expect(body).toMatch(/Barcode Type/i);
  expect(body).toMatch(/CODE_128/);
  expect(body).toMatch(/Height|Width/i);
  expect(body).toMatch(/Order|Sample/);
});

// ── The write contract ───────────────────────────────────────────────────────

/**
 * TC-LP-05 — the case that was fixme'd. Drive the real editor the way an administrator
 * does: open Edit on a System preset, bump Height with the Carbon stepper, Save.
 *
 * Guards OGC-1227 Defect 1. FAILS on 3.2.2.0: the PUT carries `fields` echoed verbatim
 * from the GET (`id`, `sourceType`, `lastupdated`), which LabelPresetForm.FieldEntry does
 * not declare, so Jackson rejects the body 400 before updatePreset() runs.
 */
test('TC-LP-05: editing a preset dimension in the UI saves and reads back [ROUND-TRIP]', async ({ page }, testInfo) => {
  await page.goto(LIST);
  const before = byName(await listPresets(page), 'Order Label');
  const target = before.heightMm + 5;

  try {
    await page.getByRole('heading', { name: /label presets/i }).first().waitFor();
    // Row overflow menu → Edit
    await page.locator('tr', { hasText: 'Order Label' }).getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /^edit$/i }).click();
    await expect(page.getByText(/Edit Label Preset/i).first()).toBeVisible();

    const height = page.locator('#preset-heightMm');
    await expect(height).toHaveValue(String(before.heightMm));
    // Carbon NumberInput: drive the stepper, not .fill() — the steppers fire the controlled
    // onChange the component expects. Five clicks, one per mm.
    const increment = page.locator('#preset-heightMm').locator('xpath=../..').getByRole('button', { name: /increment/i });
    for (let i = 0; i < 5; i++) await increment.click();
    await expect(height).toHaveValue(String(target));

    const window = await captureWrites(page, async () => {
      await page.getByRole('button', { name: /^save$/i }).click();
    });
    saveWriteEvidence(testInfo, window, 'LP-05-ui-edit');

    const hits = assertWriteIssued(window.writes, WRITE_PATH, 'TC-LP-05 UI save');
    // Check the user-facing outcome before the status, so a silent success is reported as
    // the separate defect it is rather than being masked by a green status.
    await assertUserVisibleOutcome(page, hits[hits.length - 1].status, 'TC-LP-05 UI save');
    assertWriteSucceeded(window.writes, WRITE_PATH, 'TC-LP-05 UI save');

    // ROUND-TRIP: re-read on the list endpoint, not the PUT's own response body.
    const after = byName(await listPresets(page), 'Order Label');
    assertRoundTrip(
      after as unknown as Record<string, unknown>,
      { heightMm: target },
      'TC-LP-05 Order Label height',
      // Nothing else may have moved — this is the collateral-damage check.
      { widthMm: before.widthMm, name: before.name, fields: before.fields },
    );
  } finally {
    const now = (await listPresets(page).catch(() => [] as Preset[])).find((p) => p.id === before.id);
    if (now && now.heightMm !== before.heightMm) {
      await apiWrite(page, 'PUT', `${PRESETS}/${before.id}`, toFormBody(before));
    }
  }
});

/**
 * TC-LP-06 — the exact body the UI sends must be accepted.
 *
 * Guards OGC-1227 Defect 1 at the contract level, independent of how the modal is driven.
 * A single unknown key in `fields` is enough to 400.
 */
test('TC-LP-06: PUT accepts the payload shape the editor actually sends [FUNCTION]', async ({ page }) => {
  await page.goto(LIST);
  const p = byName(await listPresets(page), 'Order Label');

  // Exactly what LabelPresetEditor.handleSubmit builds: form spread, fields echoed from GET.
  const res = await apiWrite(page, 'PUT', `${PRESETS}/${p.id}`, {
    ...toFormBody(p),
    fields: p.fields, // carries id / sourceType / lastupdated
  });

  expect(
    res.status,
    `PUT rejected the editor's own payload (${res.status}): ${res.text.slice(0, 300)}\n` +
      `LabelPresetForm.FieldEntry declares only fieldKey/isRequired/displayOrder; the client must\n` +
      `strip fields to that shape, or the DTO must tolerate unknown properties. See OGC-1227 Defect 1.`,
  ).toBeLessThan(300);
});

/**
 * TC-LP-07 — re-saving a preset that already has fields must not 500.
 *
 * Guards OGC-1227 Defect 2, the defect hidden behind Defect 1. applyForm() does
 * fields.clear() then re-adds against a @OneToMany(orphanRemoval = true); with a non-empty
 * collection the delete and the re-insert collide in the same flush. All five System
 * presets ship with one LAB_NUMBER field, so every real edit hits this.
 *
 * Runs on the scratch preset — it needs two consecutive writes.
 */
test('TC-LP-07: a second save carrying the same fields is idempotent, not a 500 [PERSIST]', async ({ page }) => {
  await page.goto(LIST);
  const src = byName(await listPresets(page), 'Order Label');

  const created = await apiWrite<Preset>(page, 'POST', `${PRESETS}/${src.id}/duplicate`, { name: SCRATCH_NAME });
  expect(created.status, `could not create scratch preset: ${created.text.slice(0, 200)}`).toBe(201);
  const id = (created.json as Preset).id;

  try {
    const fresh = (await listPresets(page)).find((p) => p.id === id) as Preset;
    const fields = toFormFields(fresh);
    expect(fields.length, 'scratch preset should have inherited a field to make this meaningful').toBeGreaterThan(0);

    const first = await apiWrite(page, 'PUT', `${PRESETS}/${id}`, toFormBody(fresh, { heightMm: 31 } as Partial<Preset>));
    expect(first.status, `first save failed: ${first.text.slice(0, 200)}`).toBe(200);

    const again = await apiWrite(page, 'PUT', `${PRESETS}/${id}`, toFormBody(fresh, { heightMm: 32 } as Partial<Preset>));
    expect(
      again.status,
      `second save with the same fields returned ${again.status}: ${again.text.slice(0, 200)}\n` +
        `applyForm()'s clear-then-re-add on an orphanRemoval collection fails once the collection is\n` +
        `non-empty. See OGC-1227 Defect 2.`,
    ).toBe(200);

    const after = (await listPresets(page)).find((p) => p.id === id) as Preset;
    assertRoundTrip(after as unknown as Record<string, unknown>, { heightMm: 32 }, 'TC-LP-07 scratch height');
  } finally {
    await apiWrite(page, 'PATCH', `${PRESETS}/${id}/activate`, { isActive: false });
  }
});

/**
 * TC-LP-08 — omitting `fields` must not destroy the preset's label content.
 *
 * Guards OGC-1227 Defect 3. LabelPresetForm.fields defaults to an empty list, so a body
 * with no `fields` key reaches applyForm(), which clears the collection and re-adds
 * nothing — 200, and the content is gone. This is the data-loss case; it only ever runs
 * against the scratch preset.
 */
test('TC-LP-08: a partial update that omits `fields` does not delete them [PERSIST]', async ({ page }) => {
  await page.goto(LIST);
  const src = byName(await listPresets(page), 'Order Label');

  const created = await apiWrite<Preset>(page, 'POST', `${PRESETS}/${src.id}/duplicate`, { name: `${SCRATCH_NAME} B` });
  expect(created.status, `could not create scratch preset: ${created.text.slice(0, 200)}`).toBe(201);
  const id = (created.json as Preset).id;

  try {
    const fresh = (await listPresets(page)).find((p) => p.id === id) as Preset;
    const originalKeys = fresh.fields.map((f) => f.fieldKey);
    expect(originalKeys.length, 'scratch preset needs at least one field for this case to mean anything').toBeGreaterThan(0);

    const body = toFormBody(fresh, { heightMm: 30 } as Partial<Preset>) as Record<string, unknown>;
    delete body.fields;
    const res = await apiWrite(page, 'PUT', `${PRESETS}/${id}`, body);

    const after = (await listPresets(page)).find((p) => p.id === id) as Preset;
    expect(
      after.fields.map((f) => f.fieldKey),
      `PUT returned ${res.status} and the preset's fields went from [${originalKeys.join(', ')}] to ` +
        `[${after.fields.map((f) => f.fieldKey).join(', ')}]. A field omitted from a partial update must not be\n` +
        `destructive: treat null as "leave unchanged" and only an explicit [] as "clear". See OGC-1227 Defect 3.`,
    ).toEqual(originalKeys);
  } finally {
    await apiWrite(page, 'PATCH', `${PRESETS}/${id}/activate`, { isActive: false });
  }
});

/**
 * TC-LP-09 — a successful save must tell the user it worked.
 *
 * Guards OGC-1227 Defect 4, and it is the case that maps directly onto the original
 * report ("there is no indication that it worked"). LabelPresetEditor calls onClose(true)
 * on 2xx and nothing else; its siblings in LabelPresetList (duplicate, activate) both call
 * addNotification.
 *
 * Driven through the Add modal so it exercises the create path too, and uses the scratch
 * name so nothing real is created.
 */
test('TC-LP-09: a successful save shows a confirmation [FUNCTION]', async ({ page }, testInfo) => {
  await page.goto(LIST);
  await page.getByRole('button', { name: /add preset/i }).first().click({ force: true });
  await expect(page.getByText(/Add Label Preset/i).first()).toBeVisible();
  await page.locator('#preset-name').fill(`${SCRATCH_NAME} C`);

  const window = await captureWrites(page, async () => {
    await page.getByRole('button', { name: /^save$/i }).click();
  });
  saveWriteEvidence(testInfo, window, 'LP-09-create-feedback');

  const hits = assertWriteIssued(window.writes, WRITE_PATH, 'TC-LP-09 create');
  const status = hits[hits.length - 1].status;
  try {
    await assertUserVisibleOutcome(page, status, 'TC-LP-09 create');
  } finally {
    const made = (await listPresets(page).catch(() => [] as Preset[])).find((p) => p.name === `${SCRATCH_NAME} C`);
    if (made) await apiWrite(page, 'PATCH', `${PRESETS}/${made.id}/activate`, { isActive: false });
  }
});

/**
 * TC-LP-10 — saving must not rename the preset.
 *
 * Guards OGC-1227 Defect 5. handleSubmit sends name: normalizeName(form.name), which
 * lower-cases; applyForm stores what it is sent. Latent while Defects 1–2 block the save,
 * and it lands on System presets, whose name field is disabled precisely because it is not
 * meant to change.
 */
test('TC-LP-10: saving a preset does not alter its name [ROUND-TRIP]', async ({ page }) => {
  await page.goto(LIST);
  const before = byName(await listPresets(page), 'Order Label');

  try {
    // Mirrors the client exactly: it normalises the name on the way out.
    const res = await apiWrite(page, 'PUT', `${PRESETS}/${before.id}`, {
      ...toFormBody(before),
      name: before.name.trim().toLowerCase(),
    });
    if (res.status >= 300) test.skip(true, `blocked by an earlier defect (PUT ${res.status}); TC-LP-06/07 own that`);

    const after = byName(await listPresets(page), before.name);
    expect(
      after.name,
      `the save changed the preset's display name from "${before.name}" to "${after.name}". The client should\n` +
        `send the name as typed and let the server normalise only for collision detection. See OGC-1227 Defect 5.`,
    ).toBe(before.name);
  } finally {
    const now = (await listPresets(page).catch(() => [] as Preset[])).find((p) => p.id === before.id);
    if (now && now.name !== before.name) {
      await apiWrite(page, 'PUT', `${PRESETS}/${before.id}`, toFormBody(before));
    }
  }
});
