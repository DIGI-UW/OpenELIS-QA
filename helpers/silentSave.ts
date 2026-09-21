/**
 * helpers/silentSave.ts
 *
 * The silent-save contract — what a write test must prove before it may PASS.
 *
 * WHY THIS FILE EXISTS
 * On 2026-09-21 no label preset could be edited on testing 3.2.2.0. Three defects were
 * stacked (OGC-1227): the UI's PUT was rejected 400 before the controller ran, a
 * well-formed PUT 500'd on any preset that already had fields, and a PUT that omitted
 * `fields` returned 200 while silently deleting the preset's label content.
 *
 * The harness had a Label Presets suite. It did not catch any of it, because:
 *
 *   TC-LP-05  test.fixme(true, 'Carbon modal form write not reliably automatable;
 *                              product Save persists for a real user')
 *
 * Everything else in that file asserted RENDER or FUNCTION. Under the skill's rubric a
 * phase reporting only RENDER is capped at M1, and the one PERSIST case was skipped on
 * an *assumption about the product* rather than a measurement of it. That assumption is
 * what shipped the bug. A fixme whose stated reason is "it works for a real user" is not
 * a harness limitation, it is an unverified product claim — and it belongs nowhere.
 *
 * THE THREE THINGS A WRITE TEST MUST PROVE
 * A save is only "working" if all three hold. Each has its own assertion here, because
 * each failed independently in OGC-1227:
 *
 *   1. A request was actually issued.       assertWriteIssued
 *      A Save button that does nothing at all is the commonest silent failure, and it is
 *      invisible to any assertion made against the DOM.
 *
 *   2. The server accepted it.              assertWriteSucceeded
 *      Assert the HTTP status, never the absence of a visible error. OGC-1227's 400 did
 *      render a banner — inside a scrollable modal body, above the fold the user was
 *      looking at. "No red text on screen" is not evidence.
 *
 *   3. It reads back on a different surface. assertRoundTrip
 *      Re-read through the screen the user visits next, or the list endpoint, not the one
 *      the write returned. A write echoing its own request body proves nothing, and
 *      diffing only the field you changed misses collateral damage — OGC-1227 Defect 3
 *      returned the right dimensions and had quietly dropped the preset's fields array.
 *
 * And one more, because the product owner's original report was "there is no indication
 * that it worked":
 *
 *   4. The user can tell what happened.     assertUserVisibleOutcome
 *      A 2xx with no confirmation, or a non-2xx with no visible error, is a defect in its
 *      own right. Grade it as one.
 *
 * SCOPE
 * Generic — nothing here is Label-Preset specific. Adopt it in any suite with a write.
 * See label-presets.spec.ts for the worked example.
 */

import { expect, type Page, type TestInfo } from '@playwright/test';
import { startCapture, saveAsEvidence, type CaptureSession, type CapturedRequest } from './networkCapture';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** A single non-GET request observed during a write window. */
export interface WriteObservation {
  method: string;
  pathname: string;
  status: number;
  requestBody?: string;
  responseBody?: string;
}

export interface WriteWindow {
  /** Every non-GET, same-origin request seen while the action ran. */
  writes: WriteObservation[];
  /** The raw capture session, for saveAsEvidence / further inspection. */
  session: CaptureSession;
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  json: T | null;
  text: string;
}

// -----------------------------------------------------------------------------
// 1 — Capture the write window
// -----------------------------------------------------------------------------

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function toObservation(c: CapturedRequest): WriteObservation {
  return {
    method: c.method,
    pathname: c.pathname,
    status: c.status,
    requestBody: c.requestBodySample,
    responseBody: c.responseBodySample,
  };
}

/**
 * Run `action` and return every mutating request it caused.
 *
 * Wraps startCapture rather than captureAround because we want the write list, not the
 * full asset firehose, and because a save often fires its follow-up GET after the modal
 * closes — hence the longer default settle.
 */
export async function captureWrites<T>(
  page: Page,
  action: () => Promise<T>,
  options: { settleMs?: number } = {}
): Promise<WriteWindow & { result: T }> {
  const settleMs = options.settleMs ?? 1500;
  const session = startCapture(page, {
    urlFilter: (url) => !/\.(js|css|png|jpe?g|svg|woff2?|ico|map)(\?|$)/i.test(url),
  });
  let result: T;
  try {
    result = await action();
  } finally {
    await page.waitForTimeout(settleMs);
    session._stop?.();
  }
  const writes = session.captures.filter((c) => MUTATING.has(c.method)).map(toObservation);
  return { result, writes, session };
}

/** Narrow a write window to the requests whose path matches. */
export function writesMatching(writes: WriteObservation[], pathPattern: string | RegExp): WriteObservation[] {
  return writes.filter((w) =>
    typeof pathPattern === 'string' ? w.pathname.includes(pathPattern) : pathPattern.test(w.pathname)
  );
}

// -----------------------------------------------------------------------------
// 2 — The assertions
// -----------------------------------------------------------------------------

/**
 * Assert the action actually sent a mutating request matching `pathPattern`.
 *
 * Catches the dead Save button. Without this, a test that only checks "the modal closed"
 * passes against a button wired to nothing.
 */
export function assertWriteIssued(
  writes: WriteObservation[],
  pathPattern: string | RegExp,
  label: string
): WriteObservation[] {
  const hits = writesMatching(writes, pathPattern);
  if (hits.length === 0) {
    const seen = writes.length
      ? writes.map((w) => `${w.method} ${w.pathname} → ${w.status}`).join('\n    ')
      : '(no mutating requests at all)';
    throw new Error(
      `\nSILENT SAVE — no write was issued [${label}]\n` +
        `  expected a mutating request matching: ${pathPattern}\n` +
        `  mutating requests actually observed:\n    ${seen}\n\n` +
        `  The control did not talk to the server. Do not grade this PASS on the strength\n` +
        `  of the dialog closing or of no error appearing.\n`
    );
  }
  return hits;
}

/**
 * Assert every matching write returned 2xx, and surface the server's body when it did not.
 *
 * Assert the status, not the absence of a banner. OGC-1227's 400 carried a Spring
 * ProblemDetail naming HttpMessageNotReadableException — the whole diagnosis — while the
 * UI showed four words.
 */
export function assertWriteSucceeded(
  writes: WriteObservation[],
  pathPattern: string | RegExp,
  label: string
): WriteObservation[] {
  const hits = assertWriteIssued(writes, pathPattern, label);
  const bad = hits.filter((w) => w.status < 200 || w.status >= 300);
  if (bad.length > 0) {
    const detail = bad
      .map(
        (w) =>
          `    ${w.method} ${w.pathname} → ${w.status}\n` +
          `      request : ${(w.requestBody ?? '(none)').slice(0, 400)}\n` +
          `      response: ${(w.responseBody ?? '(none)').slice(0, 400)}`
      )
      .join('\n');
    throw new Error(
      `\nWRITE REJECTED BY THE SERVER [${label}]\n` +
        `  ${bad.length} of ${hits.length} matching write(s) returned a non-2xx status:\n${detail}\n`
    );
  }
  return hits;
}

/**
 * Assert the user can tell what happened.
 *
 * A save that succeeds silently and a save that fails silently are both defects. Pass the
 * write status so the direction of the check is right: after a 2xx we require a success
 * notification, after a non-2xx we require a visible error.
 *
 * Selectors cover Carbon's ToastNotification / InlineNotification and OpenELIS's own
 * AlertDialog wrapper. `kind` is read from the Carbon class, which is the only reliable
 * discriminator — the text is localised.
 */
export async function assertUserVisibleOutcome(
  page: Page,
  writeStatus: number,
  label: string,
  options: { timeoutMs?: number } = {}
): Promise<'success' | 'error'> {
  const timeout = options.timeoutMs ?? 5000;
  const success = page.locator(
    '.cds--toast-notification--success, .cds--inline-notification--success, [data-notification-kind="success"]'
  );
  const error = page.locator(
    '.cds--toast-notification--error, .cds--inline-notification--error, [data-notification-kind="error"]'
  );

  const deadline = Date.now() + timeout;
  let sawSuccess = false;
  let sawError = false;
  while (Date.now() < deadline) {
    sawSuccess = (await success.count()) > 0;
    sawError = (await error.count()) > 0;
    if (sawSuccess || sawError) break;
    await page.waitForTimeout(250);
  }

  const expected = writeStatus >= 200 && writeStatus < 300 ? 'success' : 'error';

  if (!sawSuccess && !sawError) {
    throw new Error(
      `\nSILENT SAVE — the write returned ${writeStatus} and the UI said nothing [${label}]\n` +
        `  expected a visible ${expected} notification within ${timeout}ms; found neither a\n` +
        `  success nor an error notification.\n\n` +
        `  The user cannot tell whether their change was saved. Grade this as a defect even\n` +
        `  when the write itself succeeded.\n`
    );
  }
  if (expected === 'success' && !sawSuccess) {
    throw new Error(
      `\nWRONG OUTCOME SHOWN [${label}]\n  write returned ${writeStatus} but the UI is showing an error notification.\n`
    );
  }
  if (expected === 'error' && !sawError) {
    throw new Error(
      `\nWRONG OUTCOME SHOWN [${label}]\n  write returned ${writeStatus} but the UI is showing success.\n`
    );
  }
  return sawSuccess ? 'success' : 'error';
}

/**
 * Diff a read-back against what was written, per skill §7.5.
 *
 * Every key in `expected` must match, arrays and nested objects included — a rule written
 * with three conditions that reads back with two is a FAIL, not a rounding error. Keys
 * absent from `expected` are not checked, so a caller can assert a subset deliberately;
 * pass `alsoRequireUnchanged` for the fields that must NOT have moved (the collateral
 * damage check that would have caught OGC-1227 Defect 3).
 */
export function assertRoundTrip(
  actual: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
  label: string,
  alsoRequireUnchanged: Record<string, unknown> = {}
): void {
  if (actual == null) {
    throw new Error(`\nROUND-TRIP FAILED [${label}]\n  read-back returned null/undefined — the record could not be re-read.\n`);
  }
  const mismatches: string[] = [];
  const check = (source: Record<string, unknown>, kind: string): void => {
    for (const [key, want] of Object.entries(source)) {
      const got = (actual as Record<string, unknown>)[key];
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        mismatches.push(`    ${kind} ${key}: wrote ${JSON.stringify(want)}, read back ${JSON.stringify(got)}`);
      }
    }
  };
  check(expected, 'changed  ');
  check(alsoRequireUnchanged, 'unchanged');

  if (mismatches.length > 0) {
    throw new Error(
      `\nROUND-TRIP FAILED [${label}]\n` +
        `  the write reported success but the record did not come back as written:\n` +
        `${mismatches.join('\n')}\n\n` +
        `  Read back on a DIFFERENT surface than the write response, and diff every field —\n` +
        `  a field that quietly reverted or emptied is the failure mode this catches.\n`
    );
  }
}

// -----------------------------------------------------------------------------
// 3 — In-page API access (same session, same CSRF token as the UI)
// -----------------------------------------------------------------------------

const API = '/api/OpenELIS-Global';

/** GET JSON through the browser's own session. */
export async function apiGet<T = unknown>(page: Page, path: string): Promise<ApiResult<T>> {
  return page.evaluate(async ([base, p]) => {
    const r = await fetch(`${base}${p}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    const text = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* non-JSON — often the SPA shell */ }
    return { status: r.status, ok: r.ok, json, text: text.slice(0, 2000) };
  }, [API, path] as const) as Promise<ApiResult<T>>;
}

/**
 * Write through the browser's own session, with the CSRF token the SPA uses.
 *
 * Returns the status and body rather than throwing, so a spec can assert on a *specific*
 * failure (the whole point of the OGC-1227 contract cases below).
 */
export async function apiWrite<T = unknown>(
  page: Page,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ([base, m, p, payload]) => {
      const r = await fetch(`${base}${p}`, {
        method: m as string,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': localStorage.getItem('CSRF') ?? '',
          Accept: 'application/json',
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const text = await r.text();
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { /* empty or non-JSON body */ }
      return { status: r.status, ok: r.ok, json, text: text.slice(0, 2000) };
    },
    [API, method, path, body] as const
  ) as Promise<ApiResult<T>>;
}

// -----------------------------------------------------------------------------
// 4 — Evidence
// -----------------------------------------------------------------------------

/**
 * Attach a write window to the Playwright report. Call it on every write case, pass or
 * fail: a passing run's capture is what the next author reads instead of re-inferring the
 * payload shape (§6.5b).
 */
export function saveWriteEvidence(testInfo: TestInfo, window: WriteWindow, label: string): void {
  saveAsEvidence(testInfo, window.session, `write-${label}`);
}

/**
 * Convenience for the common shape: drive the UI, then prove all four properties.
 *
 * Returns the matching writes so the caller can go on to assert the round-trip with the
 * ids the server handed back.
 */
export async function expectSaveToWork(
  page: Page,
  testInfo: TestInfo,
  opts: {
    label: string;
    pathPattern: string | RegExp;
    action: () => Promise<void>;
    /** Set false for screens that genuinely have no notification surface. */
    requireVisibleOutcome?: boolean;
  }
): Promise<WriteObservation[]> {
  const window = await captureWrites(page, opts.action);
  saveWriteEvidence(testInfo, window, opts.label);
  const hits = assertWriteIssued(window.writes, opts.pathPattern, opts.label);
  if (opts.requireVisibleOutcome !== false) {
    await assertUserVisibleOutcome(page, hits[hits.length - 1].status, opts.label);
  }
  return assertWriteSucceeded(window.writes, opts.pathPattern, opts.label);
}

/** Re-export so a spec needs one import. */
export { expect };
