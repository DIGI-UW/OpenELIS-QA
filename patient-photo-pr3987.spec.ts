/**
 * OpenELIS Global — PR #3987 REGRESSION GUARD (Patient photo half)
 * Target: any instance carrying DIGI-UW/OpenELIS-Global-2#3987 (merged 2026-08-05)
 * Authored + verified live 2026-08-06 on testing.openelis-global.org v3.2.1.11
 *
 * WHAT THIS PINS:
 *
 *   item 9  `SearchPatientForm` hands the patient object on from INSIDE the
 *           photo fetch callback. The consumer seeds its form once from that
 *           object, so before the fix the late photo assignment never landed and
 *           an existing patient's photo stayed blank on **Add Order** — while
 *           Add/Edit Patient kept working, which is why it hid so long.
 *           Regression came in with 9d211b225 (PR 3576).
 *   item 10 Both photo dialogs render through `createPortal(..., document.body)`
 *           so the patient form's `fieldset[disabled]` no longer disables their
 *           own Close/Cancel controls.
 *   item 11 Patient + photo + new identification documents commit in ONE
 *           `@Transactional` service method, so a failed photo save no longer
 *           leaves the patient created.
 *   item 14 A photo that is valid base64 but not a decodable image fails with a
 *           readable message instead of `ConstraintViolationException`.
 *
 * ORDER MATTERS: item 14/11 runs BEFORE the happy-path upload. It asserts a
 * rollback, so it is self-cleaning when the fix works — if it ever regresses,
 * the leftover row is itself the evidence and is reported, not hidden.
 *
 * DATA: patient name fields reject digits AND underscores (see
 * §PATIENT_NAME_REGEX_PROPERTY in helpers/apiShapes.ts), so the `QA_AUTO_<MMDD>`
 * prefix cannot go in a name. The run marker lives in nationalId/subjectNumber.
 * Per the LIMS rule nothing is hard-deleted; the created patient is left in
 * place and named so a human can retire it.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=pr3987.config.ts --project=pr3987-patient
 */

import { test, expect, Page } from '@playwright/test';
import {
  PHOTO_UNREADABLE_ERROR,
  UNDECODABLE_PHOTO_DATA_URI,
  PatientPhotoResponse,
} from './helpers/apiShapes';

const API = '/api/OpenELIS-Global/rest';

/**
 * A genuinely decodable 64×64 PNG (8×8 grey checkerboard), 158 bytes.
 * ImageIO.read() must succeed on this or item 14's guard would reject it and
 * the happy-path assertions would be testing the wrong branch.
 */
const VALID_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZUlEQVR42u3XoR' +
  'EAIAwEwZST/kuholTwKgaGRUew6ubrhNfh3XZfAAAAAAArwCsfTfcAAAAAADuAEgMAAADYA0oMAAAAYA8oMQ' +
  'AAAIA9oMQAAAAA9oASAwAAANgDSgwAADwDWAAU6FxWotQIRoAAAAASUVORK5CYII=';

type ApiResult<T = any> = { status: number; body: T };

async function api<T = any>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  payload?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, method, payload, API }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const init: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        credentials: 'include',
      };
      if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
      const r = await fetch(API + path, init);
      let body: any;
      try {
        body = await r.json();
      } catch {
        body = (await r.text().catch(() => '')).slice(0, 400);
      }
      return { status: r.status, body };
    },
    { path, method, payload, API },
  );
}

/** Name-regex-safe (alphabetic only); the run marker goes in nationalId. */
const runMarker = () => `qa-pr3987-${Date.now()}`;

function patientBody(marker: string, extra: Record<string, unknown> = {}) {
  return {
    patientPK: '',
    patientUpdateStatus: 'ADD',
    subjectNumber: marker,
    nationalId: marker,
    lastName: 'QaPhotoProbe',
    firstName: 'Fixture',
    gender: 'M',
    birthDateForDisplay: '01/01/1990',
    addressParts: [],
    patientContact: { person: {} },
    idDocuments: [],
    ...extra,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem('CSRF')), { timeout: 20_000 })
    .toBe(true);
});

test('items 14 + 11 — an undecodable photo fails readably AND rolls the patient back', async ({
  page,
}) => {
  const marker = runMarker();

  const res = await api(page, '/PatientManagement', 'POST', {
    ...patientBody(marker, { photo: UNDECODABLE_PHOTO_DATA_URI }),
  });

  // item 14 — the readable message, not a batch/constraint dump. The UI renders
  // this `error` value verbatim, so this string IS the on-screen assertion.
  expect(res.status).toBe(500);
  expect(String(res.body?.error ?? res.body)).toBe(PHOTO_UNREADABLE_ERROR);
  expect(String(res.body?.error ?? res.body)).not.toMatch(/ConstraintViolation|could not execute batch/i);

  // item 11 — the whole unit of work rolled back. Pre-PR `persistPatientData` was
  // itself @Transactional and committed on return, so the patient survived a
  // failure the caller was told about.
  const byName = await api<any>(page, '/patient-search-results?lastName=QaPhotoProbe');
  const survivors = (byName.body?.patientSearchResults || []).filter(
    (p: any) => p.nationalId === marker || p.subjectNumber === marker,
  );
  expect(
    survivors,
    `the failed photo save left ${survivors.length} patient row(s) behind — the ` +
      `transaction did not roll back. Retire nationalId=${marker} by hand.`,
  ).toHaveLength(0);
});

test('item 14 happy path — a decodable image still saves and round-trips', async ({ page }) => {
  // "Which uploads succeed is unchanged — only the message." Proving the guard
  // did not tighten what it accepts is as important as the error string itself.
  const marker = runMarker();
  const created = await api<any>(page, '/PatientManagement', 'POST', {
    ...patientBody(marker, { photo: VALID_PNG_DATA_URI }),
  });
  expect(created.status, `create failed: ${JSON.stringify(created.body)}`).toBe(200);
  const patientId = created.body?.patientId;
  expect(patientId, 'a successful create must return the new patientId').toBeTruthy();

  // ROUND-TRIP through a DIFFERENT surface than the write.
  const photo = await api<PatientPhotoResponse>(page, `/patient-photos/${patientId}/false`);
  expect(photo.status).toBe(200);
  expect(photo.body.data).toBe(VALID_PNG_DATA_URI);

  // A thumbnail exists ⇒ createThumbnail() succeeded, i.e. we exercised the
  // non-null branch of the item-14 guard rather than skipping past it.
  const thumb = await api<PatientPhotoResponse>(page, `/patient-photos/${patientId}/true`);
  expect(thumb.status).toBe(200);
  expect(thumb.body.data, 'a decodable image must yield a thumbnail').toBeTruthy();

  // A patient with no photo answers "" — never undefined (item 9 relies on this).
  const noPhotoProbe = await api<any>(page, '/patient-search-results?lastName=A');
  const others = (noPhotoProbe.body?.patientSearchResults || []).filter(
    (p: any) => p.patientID && String(p.patientID) !== String(patientId),
  );
  if (others.length) {
    const other = await api<PatientPhotoResponse>(
      page,
      `/patient-photos/${others[0].patientID}/false`,
    );
    expect(typeof other.body.data).toBe('string');
  }

  // Hand the id to the UI tests below.
  process.env.PR3987_PHOTO_PATIENT_ID = String(patientId);
});

/**
 * Find (or create) a patient that HAS a photo, and return its id. The UI items
 * both need a stored photo; no seeded patient on a fresh instance has one.
 */
async function patientWithPhoto(page: Page): Promise<string> {
  if (process.env.PR3987_PHOTO_PATIENT_ID) return process.env.PR3987_PHOTO_PATIENT_ID;

  const search = await api<any>(page, '/patient-search-results?lastName=A');
  for (const p of (search.body?.patientSearchResults || []).slice(0, 30)) {
    const photo = await api<PatientPhotoResponse>(page, `/patient-photos/${p.patientID}/false`);
    if ((photo.body?.data || '').length > 100) return String(p.patientID);
  }

  const marker = runMarker();
  const created = await api<any>(page, '/PatientManagement', 'POST', {
    ...patientBody(marker, { photo: VALID_PNG_DATA_URI }),
  });
  expect(created.status, 'could not seed a patient with a photo').toBe(200);
  const id = String(created.body.patientId);
  process.env.PR3987_PHOTO_PATIENT_ID = id;
  return id;
}

test('item 9 — Add Order loads an existing patient\'s photo on first paint', async ({ page }) => {
  const patientId = await patientWithPhoto(page);
  const stored = await api<PatientPhotoResponse>(page, `/patient-photos/${patientId}/false`);
  expect(stored.body.data.length).toBeGreaterThan(100);

  // The `?patientId=` deep link funnels through the same `fetchPatientDetails`
  // that the search-result selection uses — the exact call site the PR moved.
  await page.goto(`/SamplePatientEntry?patientId=${patientId}`, { waitUntil: 'domcontentloaded' });

  const photo = page.locator('img.patient-image');
  await expect(photo, 'Add Order must render the stored photo').toBeVisible({ timeout: 20_000 });

  const src = await photo.getAttribute('src');
  expect(src, 'the photo must be a data URI, not an empty/placeholder src').toMatch(/^data:/);
  expect(
    src,
    'the rendered photo must be byte-identical to the stored one — a truncated or ' +
      'placeholder image means the object was handed on before the fetch resolved',
  ).toBe(stored.body.data);
});

test('item 10 — photo dialogs escape the disabled fieldset and keep their controls live', async ({
  page,
}) => {
  const patientId = await patientWithPhoto(page);
  await page.goto(`/SamplePatientEntry?patientId=${patientId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.image-display')).toBeVisible({ timeout: 20_000 });

  const audit = await page.evaluate(() => {
    const inDisabledFieldset = (el: Element) => {
      let p: Element | null = el.parentElement;
      while (p && p !== document.body) {
        if (p.tagName === 'FIELDSET' && (p as HTMLFieldSetElement).disabled) return true;
        p = p.parentElement;
      }
      return false;
    };
    const isIdDocs = (el: Element) => {
      let p: Element | null = el.parentElement;
      while (p && p !== document.body) {
        if (String(p.className || '').includes('id-documents-section')) return true;
        p = p.parentElement;
      }
      return false;
    };
    // The two dialogs PatientImageSelector owns. Scope to them explicitly: the
    // id-documents section renders its OWN "Select Patient Photo" dialog which
    // this PR did NOT touch (tracked separately — see the OGC draft in the
    // 2026-08-06 run report).
    const photoDialogs = [...document.querySelectorAll('.cds--modal')]
      .filter((m) => !isIdDocs(m))
      .filter((m) => {
        const h = (m.querySelector('.cds--modal-header__heading')?.textContent || '').trim();
        return h === 'Select Patient Photo' || h === 'View Photo';
      })
      .map((m) => ({
        heading: (m.querySelector('.cds--modal-header__heading')?.textContent || '').trim(),
        directBodyChild: m.parentElement === document.body,
        insideDisabledFieldset: inDisabledFieldset(m),
        disabledButtons: m.querySelectorAll('button:disabled').length,
        totalButtons: m.querySelectorAll('button').length,
      }));
    const display = document.querySelector('.image-display');
    return {
      photoDialogs,
      viewModeFieldsetPresent: !!display && inDisabledFieldset(display),
    };
  });

  expect(
    audit.viewModeFieldsetPresent,
    'Add Order with an existing patient should render the patient panel read-only',
  ).toBe(true);
  expect(audit.photoDialogs.length, 'both photo dialogs should be in the DOM').toBe(2);

  for (const d of audit.photoDialogs) {
    // (a) PORTALED — the whole point of the fix.
    expect(d.directBodyChild, `"${d.heading}" must be portaled to document.body`).toBe(true);
    expect(d.insideDisabledFieldset, `"${d.heading}" must not sit inside a disabled fieldset`).toBe(
      false,
    );
    // (b) every control usable — a dialog you cannot close is the reported defect.
    expect(
      d.disabledButtons,
      `"${d.heading}" has ${d.disabledButtons}/${d.totalButtons} disabled controls — ` +
        `inheriting the fieldset's disabled state again`,
    ).toBe(0);
    expect(d.totalButtons).toBeGreaterThan(0);
  }

  // (c) The dialog actually opens and closes from the UI.
  await page.locator('.image-display').click();
  const open = page.locator('.cds--modal.is-visible');
  await expect(open).toBeVisible({ timeout: 10_000 });
  const closeBtn = open.locator('button', { hasText: /^Close$/ }).first();
  await expect(closeBtn, 'the open dialog must expose an enabled Close').toBeEnabled();
  await closeBtn.click();
  await expect(open).toBeHidden({ timeout: 10_000 });
});

/**
 * Consumer-side follow-up, NOT part of PR #3987.
 *
 * On Add Order the patient panel is rendered read-only via `fieldset[disabled]`,
 * but `PatientImageSelector` is passed `disabled={false}`. Before #3987 that
 * mismatch was harmless: the dialog opened but the fieldset disabled its
 * controls, so nothing could be changed. Now that the dialog is portaled OUT of
 * the fieldset, its controls are live — so the photo is editable on a panel
 * where every other field is locked.
 *
 * Asserted as the CURRENT behaviour so the suite documents it and fails loudly
 * whichever way it is resolved (caller passes `disabled`, or the product decides
 * photo editing here is intended).
 */
test('follow-up — Add Order photo remains editable on a read-only patient panel', async ({
  page,
}) => {
  const patientId = await patientWithPhoto(page);
  await page.goto(`/SamplePatientEntry?patientId=${patientId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.image-display')).toBeVisible({ timeout: 20_000 });

  const state = await page.evaluate(() => {
    const display = document.querySelector('.image-display')!;
    let p: Element | null = display.parentElement;
    let fieldsetDisabled = false;
    while (p && p !== document.body) {
      if (p.tagName === 'FIELDSET' && (p as HTMLFieldSetElement).disabled) fieldsetDisabled = true;
      p = p.parentElement;
    }
    // Read the component's own `disabled` prop off the React fiber.
    const key = Object.keys(display).find((k) => k.startsWith('__reactFiber$'));
    let fiber: any = key ? (display as any)[key] : null;
    let selectorDisabledProp: boolean | null = null;
    for (let i = 0; fiber && i < 12; i++, fiber = fiber.return) {
      if (typeof fiber.type === 'function' && fiber.type.name === 'PatientImageSelector') {
        selectorDisabledProp = fiber.memoizedProps?.disabled ?? null;
        break;
      }
    }
    return { fieldsetDisabled, selectorDisabledProp };
  });

  expect(state.fieldsetDisabled).toBe(true);
  expect(
    state.selectorDisabledProp,
    'if this is now true, the caller was fixed to pass `disabled` in sync with the ' +
      'fieldset — clicking should open the read-only viewer and this test should be ' +
      'inverted to assert that instead',
  ).toBe(false);

  await page.locator('.image-display').click();
  const open = page.locator('.cds--modal.is-visible');
  await expect(open).toBeVisible({ timeout: 10_000 });

  const heading = (await open.locator('.cds--modal-header__heading').textContent())?.trim();
  expect(
    heading,
    'documents current behaviour: the EDITABLE picker opens on a read-only panel',
  ).toBe('Select Patient Photo');

  // The edit affordances are genuinely reachable — evidence without performing a write.
  for (const label of ['Import', 'Take Photo', 'Change Image', 'Confirm']) {
    const btn = open.locator('button', { hasText: new RegExp(`^${label}$`) }).first();
    if (await btn.count()) await expect(btn, `${label} is live`).toBeEnabled();
  }

  await open.locator('button', { hasText: /^Close$/ }).first().click();
});
