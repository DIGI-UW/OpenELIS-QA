// Shared, session-aware JSON read-back helper for API assertions.
//
// THE PROBLEM IT SOLVES
// ---------------------
// Specs verify a UI write by reading it back over REST with the `request` fixture. The fixture is
// authenticated from `.auth/user.json` (see e2e.config.ts / guards.config.ts), but on a long run
// the server-side session can lapse partway through. OpenELIS answers a lapsed API GET with the
// login PAGE — HTTP 200, `text/html` — so the old one-liner
//
//     const getJson = (rq, url) => rq.get(url, {headers:{Accept:'application/json'}}).then(r => r.json());
//
// blows up as:
//
//     SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// Observed once in the 2026-08-12 `e2e` run against 34.212.225.107, on
// `${TC}/tests/${id}/sample-results`. That message reads like the product returned garbage. It did
// not — the harness lost its session.
//
// WHAT THIS DOES
// --------------
//  1. Detects the lapse: 401/403, a `text/html` content-type, a body that starts with `<`, or a
//     final URL that landed on /login.
//  2. Re-authenticates through the SAME flow auth.setup.ts uses (tests/helpers/session.ts) and
//     retries the request ONCE against a fresh request context.
//  3. If it still comes back HTML, throws `SessionLapsedError` — a message that names the
//     condition, so a reader classifies it as a harness fault, not a product failure.
//  4. Never silently swallows: every detection and every re-auth prints a `[session-guard]` line,
//     so `grep '\[session-guard\]' runlog` measures how often this fires.
//
// The re-authenticated context is cached per origin for the rest of the worker, so one lapse
// costs one login rather than one login per subsequent call.

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { reauthenticate } from './session';

/** Thrown when a JSON read-back is still the login page after a re-auth + retry. */
export class SessionLapsedError extends Error {
  constructor(url: string, detail: string) {
    super(
      `HARNESS SESSION LAPSED (not a product failure): ${url} returned the login page / a non-JSON ` +
      `response even after re-authenticating and retrying once. ${detail} ` +
      `The harness could not hold an authenticated session for the length of this run; treat the ` +
      `enclosing test result as INCONCLUSIVE rather than as a product bug.`
    );
    this.name = 'SessionLapsedError';
  }
}

/** Thrown when the response is authenticated but simply is not parseable JSON. */
/**
 * The endpoint answered with a server error. Distinct from NonJsonResponseError
 * because a 5xx carrying valid JSON is the dangerous case: it parses, so without
 * this it would be returned as data (harness backlog #11).
 */
export class ServerErrorResponseError extends Error {
  constructor(url: string, status: number, head: string) {
    super(
      `Server error reading ${url}: HTTP ${status}. ` +
        `The body parsed as JSON, so without this guard it would have been returned as data. ` +
        `First 200 chars: ${head}`,
    );
    this.name = 'ServerErrorResponseError';
  }
}

export class NonJsonResponseError extends Error {
  constructor(url: string, status: number, bodyPrefix: string) {
    super(
      `Non-JSON response from ${url} (HTTP ${status}). This is NOT the login page — the endpoint ` +
      `answered with something that does not parse as JSON. First 200 chars: ${bodyPrefix}`
    );
    this.name = 'NonJsonResponseError';
  }
}

interface Verdict {
  lapsed: boolean;
  reason: string;
}

/** Classify a response: is this the "session lapsed" signature? */
function classify(res: APIResponse, body: string): Verdict {
  const status = res.status();
  if (status === 401 || status === 403) return { lapsed: true, reason: `HTTP ${status}` };

  const ctype = (res.headers()['content-type'] || '').toLowerCase();
  if (ctype.includes('text/html')) return { lapsed: true, reason: `content-type ${ctype}` };

  if (/\/login(\?|#|$)/i.test(res.url())) return { lapsed: true, reason: `redirected to ${res.url()}` };

  const head = body.trimStart().slice(0, 200);
  if (head.startsWith('<')) return { lapsed: true, reason: `body starts with HTML: ${head.slice(0, 60)}` };

  return { lapsed: false, reason: '' };
}

/** Cache of re-authenticated contexts, keyed by origin, so one lapse costs one login. */
const refreshed = new Map<string, APIRequestContext>();

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * GET `url` and parse JSON, surviving a mid-run session lapse.
 *
 * Drop-in replacement for the per-spec `getJson` one-liners it replaces: same
 * `(requestContext, url)` signature, same "resolves to the parsed body" contract.
 *
 * Set `OE_NO_REAUTH=1` to disable the recovery path (detection and the clear error remain).
 */
export async function getJson<T = any>(rq: APIRequestContext, url: string): Promise<T> {
  const origin = originOf(url);
  const ctx = (origin && refreshed.get(origin)) || rq;

  const first = await ctx.get(url, { headers: { Accept: 'application/json' } });
  const firstBody = await first.text();
  const verdict = classify(first, firstBody);

  if (!verdict.lapsed) return parseOrThrow(url, first.status(), firstBody);

  console.log(`[session-guard] session lapse detected on GET ${url} — ${verdict.reason}`);

  if (process.env.OE_NO_REAUTH === '1') {
    throw new SessionLapsedError(url, `Detected: ${verdict.reason}. Re-auth disabled via OE_NO_REAUTH=1.`);
  }
  if (!origin) {
    throw new SessionLapsedError(url, `Detected: ${verdict.reason}. Cannot re-authenticate: "${url}" is not an absolute URL.`);
  }

  const fresh = await reauthenticate({ baseURL: origin, reason: `${verdict.reason} on GET ${url}` });
  refreshed.set(origin, fresh);

  const second = await fresh.get(url, { headers: { Accept: 'application/json' } });
  const secondBody = await second.text();
  const again = classify(second, secondBody);
  if (again.lapsed) {
    throw new SessionLapsedError(url, `Detected: ${verdict.reason}; after re-auth + retry: ${again.reason}.`);
  }

  console.log(`[session-guard] retry after re-auth succeeded: GET ${url} → HTTP ${second.status()}`);
  return parseOrThrow(url, second.status(), secondBody);
}

function parseOrThrow<T>(url: string, status: number, body: string): T {
  // Harness backlog #11: a 5xx that happens to carry a JSON body used to parse
  // cleanly and be handed back as data. That is exactly how OGC-1120 hid: a 500
  // from /sample-type-tests became a plausible "0 tests" and read as a data gap
  // rather than a server error. A 5xx is never a legitimate result set, so it
  // throws here instead of being returned.
  //
  // 4xx is deliberately NOT thrown: probing for a 404 is a legitimate pattern in
  // several specs (does this record exist yet?). Callers who need to police 4xx
  // should use getJsonWithStatus() and assert for themselves.
  if (status >= 500) {
    throw new ServerErrorResponseError(url, status, body.slice(0, 200));
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new NonJsonResponseError(url, status, body.slice(0, 200));
  }
}

/**
 * Read a JSON endpoint and keep the HTTP status (harness backlog #11).
 *
 * Use this wherever "no rows" and "the call failed" would look the same to the
 * caller — a census, a completeness check, anything that reports a count. The
 * session-lapse recovery is identical to getJson(); only the return shape and the
 * 5xx handling differ, since here the caller is asking to see the status.
 */
export async function getJsonWithStatus<T = any>(
  rq: APIRequestContext,
  url: string,
): Promise<{ status: number; ok: boolean; body: T | null; raw: string }> {
  const origin = originOf(url);
  const ctx = (origin && refreshed.get(origin)) || rq;

  let res = await ctx.get(url, { headers: { Accept: 'application/json' } });
  let raw = await res.text();
  const verdict = classify(res, raw);

  if (verdict.lapsed && process.env.OE_NO_REAUTH !== '1' && origin) {
    console.log(`[session-guard] session lapse detected on GET ${url} — ${verdict.reason}`);
    const fresh = await reauthenticate({ baseURL: origin, reason: `${verdict.reason} on GET ${url}` });
    refreshed.set(origin, fresh);
    res = await fresh.get(url, { headers: { Accept: 'application/json' } });
    raw = await res.text();
  }

  const status = res.status();
  let body: T | null = null;
  try {
    body = JSON.parse(raw) as T;
  } catch {
    body = null;
  }
  return { status, ok: status >= 200 && status < 300, body, raw };
}

/**
 * Assert an endpoint answered 200 and hand back the parsed body.
 *
 * The one-liner most read-backs actually want: it makes the status part of the
 * assertion rather than something the caller has to remember to check.
 */
export async function getJsonOk<T = any>(rq: APIRequestContext, url: string, label?: string): Promise<T> {
  const { status, ok, body, raw } = await getJsonWithStatus<T>(rq, url);
  if (!ok) {
    throw new ServerErrorResponseError(label ? `${label} (${url})` : url, status, raw.slice(0, 200));
  }
  if (body === null) {
    throw new NonJsonResponseError(url, status, raw.slice(0, 200));
  }
  return body;
}
