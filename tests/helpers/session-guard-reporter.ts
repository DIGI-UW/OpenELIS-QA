// Run-level session guard: keep the harness logged in, and refuse to let a lapsed session be
// read as a pile of product defects.
//
// THE PROBLEM
// -----------
// `tests/helpers/session.ts` and `tests/helpers/api-json.ts` already solve the mid-run session
// lapse — but only for callers that route through `api-json`. Measured 2026-08-24 on this repo:
//
//     159 spec files total
//       2  import tests/helpers/api-json   <- the only ones with recovery
//      23  use the raw `request` fixture
//      76  do in-page `await fetch(...)` inside page.evaluate
//
// So the guard existed with ~1% coverage. In the 2026-08-24 `all-tc` run (11.8 h, serial) the
// session lapsed repeatedly: `LoginPage` appears 180 times in the run log and 9 specs died with
// `Unexpected token '<' ... not valid JSON`. The run reported **57 passed / 91 failed** against a
// baseline of 72 passed / 2 failed hours earlier. None of those 91 were product defects. Suites
// run minutes later, after the lapse condition cleared, came back clean (tc 19 passed,
// deep 6 passed, coded-result-chain 4 passed).
//
// Rewriting 159 specs to use one helper is not the fix. A reporter is: it lives in the main
// process for the whole run, needs no spec changes, and can do both halves of the job.
//
// WHAT THIS DOES
// --------------
//  1. KEEPALIVE — pings a cheap authenticated endpoint every SESSION_KEEPALIVE_MS (default 4 min).
//     The app has a client-side inactivity timeout (the Carbon "Still There? User session is about
//     to time out." modal, pre-rendered hidden on every page), and the server session expires on
//     the same idea. A serial suite can leave the session idle for long stretches between API
//     calls; this stops it lapsing in the first place.
//  2. SELF-HEAL — if a ping comes back as the login page, it calls the SAME `reauthenticate()`
//     that api-json uses, which rewrites `.auth/user.json`. Every context created after that point
//     picks up the fresh state, so later specs recover even though they never call api-json.
//  3. VERDICT — counts failures whose error text carries the lapse signature and, if enough of
//     them are present, prints a RUN CONTAMINATED banner and writes `.session-guard/contaminated.json`.
//     That is the part that actually saves a human: the run says "re-run me", instead of handing
//     over 91 fake findings to triage.
//
// It never changes the exit code. A contaminated run is not silently turned green, and a genuinely
// failing run is not silently turned red — the banner and the marker file are the signal.
//
// Wire it up as an EXTRA reporter, keeping whatever you already had:
//     reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']]
//
// Env:
//   SESSION_KEEPALIVE_MS   ping interval; 0 disables the keepalive (default 240000)
//   SESSION_KEEPALIVE_PATH endpoint to ping (default /api/OpenELIS-Global/rest/user-sample-types)
//   SESSION_LAPSE_MIN      how many lapse-signature failures before the banner (default 3)
import type { Reporter, TestCase, TestResult, FullConfig, FullResult } from '@playwright/test/reporter';
import { request as playwrightRequest } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { AUTH_STATE_PATH, reauthenticate } from './session';

/** The shapes a lapsed session takes in a failure message. */
const LAPSE_SIGNATURE = /Unexpected token '<'|not valid JSON|SessionLapsedError|LoginPage|<!DOCTYPE/i;

const MARKER_DIR = '.session-guard';
const MARKER_FILE = path.join(MARKER_DIR, 'contaminated.json');

export default class SessionGuardReporter implements Reporter {
  private timer: NodeJS.Timeout | undefined;
  private baseURL = '';
  private everyMs = 0;
  private pingPath = '';
  private minLapses = 3;

  private pings = 0;
  private lapsesSeenOnPing = 0;
  private revives = 0;
  private reviveFailures = 0;
  private failedTests = 0;
  private lapseTaggedFailures: string[] = [];

  onBegin(config: FullConfig): void {
    this.baseURL = process.env.BASE || (config.projects[0]?.use as any)?.baseURL || '';
    this.everyMs = Number(process.env.SESSION_KEEPALIVE_MS ?? 240000);
    this.pingPath = process.env.SESSION_KEEPALIVE_PATH || '/api/OpenELIS-Global/rest/user-sample-types';
    this.minLapses = Number(process.env.SESSION_LAPSE_MIN ?? 3);
    try { fs.rmSync(MARKER_FILE, { force: true }); } catch (e) { /* first run */ }

    if (!this.baseURL) {
      console.log('[session-guard] no baseURL resolved — keepalive disabled for this run');
      return;
    }
    if (this.everyMs <= 0) {
      console.log('[session-guard] keepalive disabled via SESSION_KEEPALIVE_MS=0');
      return;
    }
    console.log(`[session-guard] keepalive every ${Math.round(this.everyMs / 1000)}s against ${this.baseURL}${this.pingPath}`);
    this.timer = setInterval(() => { void this.ping(); }, this.everyMs);
    // Never hold the process open on the guard's account.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /** One keepalive probe. Detects the login-page answer and re-authenticates if it sees one. */
  private async ping(): Promise<void> {
    if (!fs.existsSync(AUTH_STATE_PATH)) return; // setup project has not run yet
    this.pings++;
    let lapsed = false;
    try {
      const ctx = await playwrightRequest.newContext({
        baseURL: this.baseURL,
        storageState: AUTH_STATE_PATH,
        ignoreHTTPSErrors: true,
      });
      try {
        const res = await ctx.get(this.pingPath, { headers: { Accept: 'application/json' }, timeout: 20000 });
        const ctype = (res.headers()['content-type'] || '').toLowerCase();
        const body = (await res.text().catch(() => '')).slice(0, 200).trim();
        lapsed = res.status() === 401 || res.status() === 403
          || ctype.includes('text/html')
          || body.startsWith('<')
          || /login/i.test(res.url());
      } finally {
        await ctx.dispose().catch(() => {});
      }
    } catch (e: any) {
      // A transport error is not a lapse — the instance may simply be busy. Say so and move on.
      console.log(`[session-guard] keepalive ping error (not treated as a lapse): ${String(e).slice(0, 120)}`);
      return;
    }

    if (!lapsed) return;
    this.lapsesSeenOnPing++;
    console.log('[session-guard] keepalive saw the LOGIN PAGE — session lapsed; re-authenticating');
    try {
      const ctx = await reauthenticate({ baseURL: this.baseURL, reason: 'keepalive detected a lapsed session' });
      await ctx.dispose().catch(() => {});
      this.revives++;
      console.log(`[session-guard] re-authenticated (${this.revives} so far this run); ${AUTH_STATE_PATH} refreshed`);
    } catch (e: any) {
      this.reviveFailures++;
      console.log(`[session-guard] re-authentication FAILED: ${String(e).slice(0, 200)}`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    this.failedTests++;
    const text = (result.errors || [])
      .map((e) => `${e.message || ''} ${e.value || ''}`)
      .join(' ');
    if (LAPSE_SIGNATURE.test(text)) {
      this.lapseTaggedFailures.push(test.titlePath().slice(1).join(' › ').slice(0, 120));
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    const tagged = this.lapseTaggedFailures.length;
    const contaminated = this.lapsesSeenOnPing > 0 || tagged >= this.minLapses;

    console.log(
      `[session-guard] summary: pings=${this.pings} lapses-on-ping=${this.lapsesSeenOnPing} ` +
      `re-auths=${this.revives} re-auth-failures=${this.reviveFailures} ` +
      `failed-tests=${this.failedTests} lapse-tagged-failures=${tagged}`,
    );

    if (!contaminated) return;

    const banner = [
      '',
      '='.repeat(78),
      '  RUN CONTAMINATED — the harness lost its session during this run.',
      '',
      `  ${tagged} of ${this.failedTests} failures carry the session-lapse signature`,
      `  (Unexpected token '<' / not valid JSON / LoginPage), and the keepalive saw the`,
      `  login page ${this.lapsesSeenOnPing} time(s).`,
      '',
      '  Do NOT triage these failures as product defects. Re-run the suite.',
      '  If it recurs: give the harness its own account (OE_USER / OE_PASS are already',
      '  env-overridable) so it is not competing with a human session, and/or lower',
      '  SESSION_KEEPALIVE_MS.',
      '='.repeat(78),
      '',
    ].join('\n');
    console.log(banner);

    try {
      fs.mkdirSync(MARKER_DIR, { recursive: true });
      fs.writeFileSync(MARKER_FILE, JSON.stringify({
        contaminated: true,
        status: result.status,
        baseURL: this.baseURL,
        pings: this.pings,
        lapsesSeenOnPing: this.lapsesSeenOnPing,
        reAuths: this.revives,
        reAuthFailures: this.reviveFailures,
        failedTests: this.failedTests,
        lapseTaggedFailures: this.lapseTaggedFailures.slice(0, 50),
      }, null, 2));
      console.log(`[session-guard] wrote ${MARKER_FILE} — CI can gate on this file rather than on the exit code`);
    } catch (e: any) {
      console.log(`[session-guard] could not write ${MARKER_FILE}: ${String(e).slice(0, 120)}`);
    }
  }

  printsToStdio(): boolean { return true; }
}
