/**
 * helpers/networkCapture.ts
 *
 * Phase E2 — Live Network Capture Helper
 *
 * Implements the infrastructure side of SKILL §6.5 "No bug filed
 * against a 404 without live capture." Previously this rule was
 * enforced by discipline (testers manually called
 * `read_network_requests` before filing); E2 turns it into a harness-
 * enforced contract.
 *
 * The 2026-04-20 calibration sweep closed 6 Jira tickets as false
 * positives because old QA specs probed REST endpoints the app never
 * actually calls (the OGC-535/562/563/565/566/568 cluster). This
 * module prevents that pattern from recurring: every "404 bug
 * candidate" must be backed by a live capture proving the application
 * actually called the claimed-broken path. Without that evidence,
 * `assertBugEvidence` throws — no ticket gets filed.
 *
 * Three entry points:
 *
 *   1. startCapture(page) → returns a session that accumulates
 *      requests/responses until stopped. Low-level.
 *
 *   2. captureAround(page, action) → high-level wrapper. Starts a
 *      capture, runs the action, settles for 500ms, returns the
 *      session.
 *
 *   3. saveAsEvidence(testInfo, session, label) → writes the session
 *      to .auth/captures/<label>.json AND attaches it to the Playwright
 *      test report. This becomes the evidence packet for any bug
 *      ticket filed off this run.
 *
 * Companion enforcement helper (in this same module):
 *
 *   4. assertBugEvidence(testInfo, session, claimedPath, bugLabel)
 *      throws if `claimedPath` does NOT appear in any captured request
 *      URL. Use this at the moment your test would file a bug — if
 *      assertion fails, the test errors out with a clear message
 *      explaining the §6.5 rule and pointing at the false-positive
 *      cluster precedent.
 *
 * Usage in chain specs:
 *
 *   ```ts
 *   import { captureAround, assertBugEvidence } from './networkCapture';
 *
 *   test('Step X — verify /rest/dictionary is called when DictionaryMenu loads', async ({ page }, testInfo) => {
 *     const { session } = await captureAround(page, async () => {
 *       await page.goto(`${BASE}/MasterListsPage/DictionaryMenu`);
 *       await page.waitForLoadState('networkidle');
 *     });
 *     // Before claiming "/rest/dictionary returns 404 = bug",
 *     // prove the app actually called it:
 *     assertBugEvidence(testInfo, session, '/rest/dictionary', 'BUG-51-DictionaryMenu');
 *     // ↑ this throws if the app instead calls /rest/DictionaryMenu,
 *     // saving us from filing another false-positive ticket.
 *   });
 *   ```
 */

import type { Page, Request, Response, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CapturedRequest {
  url: string;
  pathname: string;        // path-only (no protocol/host/query); the bit useful for §6.5 matching
  method: string;
  status: number;
  durationMs: number;
  fromCache: boolean;
  resourceType: string;
  requestHeaders: Record<string, string>;
  requestBodySample?: string;   // first 1KB of request body if available
  responseHeaders: Record<string, string>;
  responseBodySample?: string;  // first 1KB of response body if available
  startedAtMs: number;     // monotonic
  finishedAtMs: number;    // monotonic
  startedAt: string;       // ISO
  finishedAt: string;      // ISO
}

export interface CaptureSession {
  captures: CapturedRequest[];
  /** All captures with status >= 400 */
  failed: CapturedRequest[];
  /** Subset of `failed` with status === 404 (the §6.5 territory) */
  notFound: CapturedRequest[];
  /** Time range covered by the capture, for the saved evidence file */
  windowStartedAt: string;
  windowFinishedAt: string;
  /** Internal stop function — called by captureAround */
  _stop?: () => void;
}

// -----------------------------------------------------------------------------
// Capture session
// -----------------------------------------------------------------------------

/**
 * Begin capturing network activity on `page`. Returns a session
 * object that updates in place as requests complete. Call the
 * returned `_stop()` to detach listeners; otherwise they remain
 * attached until the page closes.
 *
 * Filter requests with the optional `urlFilter` — useful for high-
 * traffic pages where you only care about same-origin REST/JSP calls
 * and want to skip CSS/fonts/CDN noise.
 */
export function startCapture(
  page: Page,
  options: {
    urlFilter?: (url: string) => boolean;
    captureBodies?: boolean;  // default true; set false to skip body capture for very large responses
  } = {}
): CaptureSession {
  const session: CaptureSession = {
    captures: [],
    failed: [],
    notFound: [],
    windowStartedAt: new Date().toISOString(),
    windowFinishedAt: '',
  };
  const requestStartTimes = new Map<string, number>();
  const captureBodies = options.captureBodies !== false;

  const onRequest = (request: Request): void => {
    requestStartTimes.set(request.url(), Date.now());
  };

  const onResponse = async (response: Response): Promise<void> => {
    const request = response.request();
    const url = request.url();

    if (options.urlFilter && !options.urlFilter(url)) return;

    const startedAtMs = requestStartTimes.get(url) ?? Date.now();
    const finishedAtMs = Date.now();
    let pathname = url;
    try { pathname = new URL(url).pathname; } catch { /* relative URL */ }

    const requestHeaders = request.headers();
    const responseHeaders = response.headers();

    let requestBodySample: string | undefined;
    if (captureBodies) {
      try {
        const postData = request.postData();
        if (postData) requestBodySample = postData.slice(0, 1024);
      } catch { /* request body not available */ }
    }

    let responseBodySample: string | undefined;
    if (captureBodies) {
      try {
        const body = await response.text();
        responseBodySample = body.slice(0, 1024);
      } catch { /* response body not available — common for redirects */ }
    }

    const entry: CapturedRequest = {
      url,
      pathname,
      method: request.method(),
      status: response.status(),
      durationMs: finishedAtMs - startedAtMs,
      fromCache: response.fromServiceWorker(),
      resourceType: request.resourceType(),
      requestHeaders: stripCookies(requestHeaders),
      requestBodySample,
      responseHeaders: stripCookies(responseHeaders),
      responseBodySample,
      startedAtMs,
      finishedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
    };

    session.captures.push(entry);
    if (entry.status >= 400) session.failed.push(entry);
    if (entry.status === 404) session.notFound.push(entry);
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  session._stop = (): void => {
    page.off('request', onRequest);
    page.off('response', onResponse);
    session.windowFinishedAt = new Date().toISOString();
  };

  return session;
}

/**
 * Run `action` while capturing network traffic on `page`. Settles
 * for `settleMs` (default 500) after the action to catch async
 * follow-ups (typical SPA hydration latency).
 *
 * Returns both the action's result and the capture session, so you
 * can keep using the action's return value while inspecting captures.
 */
export async function captureAround<T>(
  page: Page,
  action: () => Promise<T>,
  options: {
    settleMs?: number;
    urlFilter?: (url: string) => boolean;
    captureBodies?: boolean;
  } = {}
): Promise<{ result: T; session: CaptureSession }> {
  const settleMs = options.settleMs ?? 500;
  const session = startCapture(page, { urlFilter: options.urlFilter, captureBodies: options.captureBodies });
  let result: T;
  try {
    result = await action();
  } finally {
    await page.waitForTimeout(settleMs);
    session._stop?.();
  }
  return { result, session };
}

// -----------------------------------------------------------------------------
// Evidence persistence
// -----------------------------------------------------------------------------

/**
 * Write `session` to `.auth/captures/<label>.json` and attach the
 * file to the Playwright test report. The label should be unique per
 * call within a test — use the bug candidate name when filing a bug,
 * or the step name otherwise.
 */
export function saveAsEvidence(
  testInfo: TestInfo,
  session: CaptureSession,
  label: string
): { absPath: string; attachmentName: string } {
  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const dir = path.join(process.cwd(), '.auth', 'captures');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const absPath = path.join(dir, `${safeLabel}-${Date.now()}.json`);

  const summary = {
    label,
    test: testInfo.titlePath.join(' › '),
    windowStartedAt: session.windowStartedAt,
    windowFinishedAt: session.windowFinishedAt,
    counts: {
      total: session.captures.length,
      failed: session.failed.length,
      notFound: session.notFound.length,
    },
    captures: session.captures,
  };
  fs.writeFileSync(absPath, JSON.stringify(summary, null, 2));

  const attachmentName = `network-capture-${safeLabel}.json`;
  testInfo.attachments.push({
    name: attachmentName,
    contentType: 'application/json',
    path: absPath,
  });

  return { absPath, attachmentName };
}

// -----------------------------------------------------------------------------
// §6.5 enforcement
// -----------------------------------------------------------------------------

/**
 * Assert that the application actually called `claimedPath` during
 * the capture window. Use this RIGHT BEFORE filing a 404-based bug.
 *
 * Throws with a descriptive error referencing SKILL §6.5 and the
 * 2026-04-20 false-positive cluster if no capture matches.
 *
 * Side effect: saves the session as evidence regardless of outcome,
 * so a passing assertion still leaves a complete audit trail.
 *
 * Matching is substring-based on `pathname` — that handles both
 * absolute (`https://host/api/...`) and relative (`/api/...`) URLs
 * consistently.
 */
export function assertBugEvidence(
  testInfo: TestInfo,
  session: CaptureSession,
  claimedPath: string,
  bugLabel: string
): void {
  // Save evidence regardless of outcome — passing assertions still
  // leave an audit trail
  saveAsEvidence(testInfo, session, `bug-evidence-${bugLabel}`);

  const hits = session.captures.filter(c => c.pathname.includes(claimedPath));
  if (hits.length === 0) {
    const sampleUrls = session.captures.slice(0, 8).map(c => `${c.method} ${c.pathname} (${c.status})`).join('\n  ');
    throw new Error(
      `\n` +
      `BUG-CANDIDATE REJECTED per SKILL §6.5\n` +
      `─────────────────────────────────────\n` +
      `Bug label: ${bugLabel}\n` +
      `Claimed broken path: ${claimedPath}\n` +
      `Live capture window: ${session.windowStartedAt} → ${session.windowFinishedAt}\n` +
      `\n` +
      `The application did NOT call "${claimedPath}" during this action.\n` +
      `Filing a 404 bug against this path would be a false positive — exactly\n` +
      `the pattern that produced the 2026-04-20 cluster (OGC-535, OGC-562,\n` +
      `OGC-563, OGC-565, OGC-566, OGC-568, all closed as false positives\n` +
      `because the SKILL probed paths the app never actually uses).\n` +
      `\n` +
      `What the app actually called during this window (first 8):\n` +
      `  ${sampleUrls || '(no captures)'}\n` +
      `\n` +
      `Action: find the right endpoint by inspecting the saved evidence at\n` +
      `.auth/captures/bug-evidence-${bugLabel.replace(/[^a-zA-Z0-9_.-]+/g, '_')}-*.json,\n` +
      `then re-run the bug check against the actual path.\n`
    );
  }
}

/**
 * Lighter-weight inverse: assert that the capture window contains
 * AT LEAST ONE 404 response. Useful for tests that probe whether a
 * specific endpoint is genuinely missing — without this guard a
 * passing 200 would silently mask the test's intent.
 *
 * Pairs well with assertBugEvidence: first prove the app calls the
 * path, then prove that call returned 404.
 */
export function assert404Observed(
  session: CaptureSession,
  claimedPath: string,
  bugLabel: string
): CapturedRequest {
  const hits = session.notFound.filter(c => c.pathname.includes(claimedPath));
  if (hits.length === 0) {
    throw new Error(
      `BUG-CANDIDATE REJECTED per SKILL §6.5: claim "${bugLabel}" expects ` +
      `404 at "${claimedPath}" but no 404 was observed during the capture window. ` +
      `Found ${session.captures.filter(c => c.pathname.includes(claimedPath)).length} ` +
      `total responses for this path with statuses: ` +
      `[${session.captures.filter(c => c.pathname.includes(claimedPath)).map(c => c.status).join(',')}]`
    );
  }
  return hits[0];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Remove cookie headers from captured headers — they leak session
 * tokens that have no place in evidence files committed to a repo
 * or attached to a public PR comment.
 */
function stripCookies(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'cookie' || k.toLowerCase() === 'set-cookie' || k.toLowerCase().includes('authorization')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Generate a short, human-readable summary of a capture session.
 * Useful for the `markStep` PARTIAL/BLOCKED logging in chain specs.
 */
export function summarize(session: CaptureSession): string {
  const total = session.captures.length;
  const failed = session.failed.length;
  const notFound = session.notFound.length;
  const sample = session.captures.slice(0, 5).map(c => `${c.status} ${c.pathname}`).join(', ');
  return `${total} captures, ${failed} failed, ${notFound} 404s. Sample: [${sample}]`;
}
