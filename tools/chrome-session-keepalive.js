/*
 * OpenELIS session keepalive for a human Chrome tab.
 *
 * WHAT IT DOES
 *   Every 4 minutes it GETs a cheap authenticated endpoint. Any authenticated
 *   request resets the server-side inactivity clock, so the session does not
 *   lapse while you are reading, in a meeting, or watching a suite run.
 *
 * WHAT IT DOES NOT DO -- read this before trusting it
 *   There are TWO ways the session dies on this instance and only one of them
 *   is inactivity:
 *
 *     1. INACTIVITY TIMEOUT  -- this script fixes it.
 *     2. CONCURRENT-SESSION EVICTION -- it does NOT. If an automated suite logs
 *        in as the SAME user you are using in Chrome, the server can evict your
 *        browser session and no amount of pinging will save it. On 2026-08-24 a
 *        Chrome tab and a suite were both authenticated as admin, the tab was
 *        kicked to /login, and the suite logged 180 login-page answers.
 *
 *   The two mechanisms have never been isolated on this instance, so if the tab
 *   still dies WHILE A SUITE IS RUNNING, it is eviction, not inactivity, and the
 *   real fix is a separate account for the harness (OE_USER / OE_PASS are
 *   already env-overridable -- it is provisioning, not code).
 *
 * ALSO WORTH KNOWING
 *   This deliberately defeats an inactivity timeout, which is a security
 *   control. Fine on a test instance. Do not paste it into production.
 *   It stops when the tab is closed or reloaded.
 *
 * HOW TO USE
 *   Open the OpenELIS tab, F12, Console, paste, Enter. It logs each ping.
 *   Stop it early with:  stopOeKeepalive()
 */
(() => {
  const MINUTES = 4;
  const URL = '/api/OpenELIS-Global/rest/user-sample-types';

  if (window.__oeKeepalive) {
    console.log('[keepalive] already running -- stopOeKeepalive() first');
    return;
  }

  const ping = async () => {
    const at = new Date().toLocaleTimeString();
    try {
      const res = await fetch(URL, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const body = await res.text();

      // The tell-tale: an expired session answers HTTP 200 with the LOGIN PAGE.
      // Checking res.ok alone would report a healthy session forever.
      const isLoginPage =
        body.includes('loginName') || body.includes('j_username');

      if (isLoginPage) {
        console.warn(`[keepalive ${at}] SESSION LAPSED -- the ping got the login page.`);
        console.warn('[keepalive] a ping cannot recover this; log in again in the tab.');
      } else {
        console.log(`[keepalive ${at}] ok (${res.status})`);
      }
    } catch (e) {
      console.warn(`[keepalive ${at}] ping failed: ${e}`);
    }
  };

  ping();
  window.__oeKeepalive = setInterval(ping, MINUTES * 60 * 1000);
  window.stopOeKeepalive = () => {
    clearInterval(window.__oeKeepalive);
    window.__oeKeepalive = null;
    console.log('[keepalive] stopped');
  };
  console.log(`[keepalive] running every ${MINUTES} min. stopOeKeepalive() to stop.`);
})();
