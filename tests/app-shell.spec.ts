/**
 * tests/app-shell.spec.ts
 *
 * The app shell after OGC-1448 (OpenELIS-Global-2 #4681): Logout behind a proxy, sortable column
 * descriptions, and one h1 per screen. Catalogue: app-shell.md (TC-SHELL-*).
 *
 * Written 2026-10-12 against local develop a4200e2d (images 2026-10-12 06:09 UTC). The local
 * stack's proxy (itechuw/openelis-global-2-proxy) forwards `Host $host`, so the server's redirects
 * lose the :10443 port: the same state as any site whose nginx.conf predates #4681's installer
 * template change. That is what TC-SHELL-02 needs; on a proxy that keeps the port it passes.
 *
 * Logout runs in its own browser context (helpers/isolated-session.ts): nothing logs out the
 * shared session (check:no-shared-logout).
 */
import { test, expect, type Page } from '@playwright/test';
import { withIsolatedSession } from '../helpers/isolated-session';

test.setTimeout(120_000);

const SORT_DESCRIPTION = '.cds--table-sort__description';

async function signOut(page: Page): Promise<{ outageNotice: Promise<boolean> }> {
  await page.goto('/Dashboard', { waitUntil: 'domcontentloaded' });
  const user = page.getByRole('banner').getByRole('button', { name: 'User', exact: true });
  await expect(user, 'signed in: the header offers the User panel').toBeVisible({ timeout: 30_000 });
  await user.click();
  // The login page shows this notice while it believes the server is down.
  const outageNotice = page.getByTestId('server-reconnect').waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false);
  await page.getByRole('banner').getByText('Logout', { exact: true }).click();
  return { outageNotice };
}

test.describe('Logout (OGC-1448)', () => {
  test('TC-SHELL-01: Logout ends the session and opens this origin\'s login page (the port is kept)', async ({ browser, baseURL }) => {
    await withIsolatedSession(browser, async (page) => {
      await signOut(page);
      const origin = new URL(baseURL ?? page.url()).origin;
      await expect(page, 'the login page on this origin').toHaveURL(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/login$`), { timeout: 30_000 });
      await expect(page.locator('#loginName')).toBeVisible({ timeout: 30_000 });
      const session = await (await page.request.get('/api/OpenELIS-Global/session')).json();
      expect(session.authenticated, 'the server session is over').toBe(false);
    });
  });

  test('TC-SHELL-02: after Logout the login page does not report the server as unreachable [FLIP-WHEN-FIXED]', async ({ browser }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, on OGC-1448 comment 38090). After Logout the login page
    // checks the session with the ended cookie; the server redirects that check to its login page
    // with a URL built from Host, which behind a proxy forwarding `Host $host` has no port. The
    // fetch follows it, the connection is refused, and "Can't reach the server / Trying again in
    // 1 s" shows. #4681 fixed the Logout POST (redirect: manual) and retries a session check that
    // lands on the login page, but a redirect that cannot be followed still reads as an outage.
    test.fail();
    await withIsolatedSession(browser, async (page) => {
      const { outageNotice } = await signOut(page);
      await expect(page.locator('#loginName')).toBeVisible({ timeout: 30_000 });
      expect(await outageNotice, '"Can\'t reach the server" after a normal Logout').toBe(false);
    });
  });
});

test.describe('Page titles (OGC-1448)', () => {
  const SCREENS: Array<[string, string]> = [
    ['/Dashboard', 'Dashboard'],
    ['/MasterListsPage/locations', 'Organizations'],
    ['/PathologyDashboard', 'Pathology'],
    ['/ImmunohistochemistryDashboard', 'Immunohistochemistry'],
    ['/CytologyDashboard', 'Cytology'],
    ['/NoteBookDashboard', 'Notebook'],
    ['/inventory', 'Inventory Items'],
    ['/Storage', 'Storage Management'],
    ['/qa/qms/audit-trail?type=system', 'System Audit Trail'],
    ['/SamplePatientEntry', 'Test Request'],
    ['/order/clinical/enter', 'Enter Order'],
  ];
  test('TC-SHELL-10: each screen #4681 walked has exactly one h1, its title', async ({ page }) => {
    for (const [path, title] of SCREENS) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 }), `${path}: one h1, "${title}"`).toHaveText([title], { timeout: 30_000 });
    }
  });

  test('TC-SHELL-11: the home Dashboard keeps one h1 with a tile opened (tile values are not headings)', async ({ page }) => {
    await page.goto('/Dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Dashboard'], { timeout: 30_000 });
    await expect(page.locator('main .dashboard-tile__value').first(), 'tiles show their counts').toBeVisible({ timeout: 30_000 });
    await page.locator('.dashboard-tile').first().click();
    await expect(page.locator('.dashboard-tile__value-view')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Dashboard']);
  });

  test('TC-SHELL-12: Modify Order has an h1 title [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, on OGC-1448 comment 38090). #4681 lists Test Request
    // "(Add and Modify Order)", but /SampleEdit still titles the page with an h3.
    test.fail();
    await page.goto('/SampleEdit', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Modify Order').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Modify Order'], { timeout: 10_000 });
  });
});

test.describe('Sortable columns (OGC-1448)', () => {
  for (const [id, screen, path] of [
    ['TC-SHELL-20', 'Organizations', '/MasterListsPage/locations'],
    ['TC-SHELL-21', 'Pathology', '/PathologyDashboard'],
    ['TC-SHELL-22', 'Immunohistochemistry', '/ImmunohistochemistryDashboard'],
    ['TC-SHELL-23', 'Inventory', '/inventory'],
    // The audit trails list nothing until searched, so no sortable header is drawn on load; racks always has rows.
    ['TC-SHELL-24', 'Storage racks', '/Storage/racks'],
  ] as const) {
    test(`${id}: ${screen} names every sortable column`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(SORT_DESCRIPTION).first(), `${screen} has sortable columns`).toBeAttached({ timeout: 30_000 });
      const texts = await page.locator(SORT_DESCRIPTION).allTextContents();
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        expect(t, 'a column described as an object').not.toContain('[object Object]');
        expect(t, 'a column with no name').not.toMatch(/sort rows by\s+header/i);
      }
    });
  }
});
