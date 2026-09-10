import { test, expect, Page } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';

/**
 * tests/order-entry-state.spec.ts
 *
 * Order entry: state reset, lab number lifecycle, and the Requester fields.
 *
 * WHY THIS FILE EXISTS
 * Five client reports against the order entry workflow (Sep 2026) all turned
 * out to sit on behaviour no test in this repo covered. Three were confirmed,
 * and the product decisions that followed gave — for the first time — written
 * criteria a test can actually assert. This file is those criteria.
 *
 * THE INTENDED DESIGN, as stated by the product owner who designed the screen:
 *
 *  1. A lab number is consumed WHEN IT IS LOADED INTO THE FORM, not when the
 *     order is saved. Once handed to a form it is marked used and the next
 *     generated number moves on, whether or not anything is ever saved.
 *  2. Reaching the entry step for a NEW order must therefore generate and
 *     reserve a number, and bind the form to it.
 *  3. Save persists all the metadata on the screen in whatever state of
 *     completion it is in. A partially complete order is a legitimate record;
 *     with no sample or test on it, it simply cannot progress to testing.
 *  4. There is NO autosave. Saving is explicit: Save & Next, Save & Exit, or
 *     Discard.
 *  5. Nothing was intentionally dropped when the screen was rebuilt, so a
 *     Requester field that the old form rendered and the payload still carries
 *     is a field that should be on the new form.
 *
 * HOW THE FAILING CASES ARE MARKED
 * The cases below that describe (2), (4) and (5) fail today. They are marked
 * `test.fail()` so the suite is honest about that: each will turn red the day
 * the defect is fixed, which is the signal to remove the marker.
 *
 * `test.fail()` must sit INSIDE each test body. At describe scope it is a
 * SUITE modifier and marks every case in the block, canaries included,
 * whatever line it appears on. The first run of this file did exactly that:
 * all eight were marked, so the three canaries reported
 * "Expected to fail, but passed" and the tripwires looked green.
 *
 * `test.fail()` HAS A SECOND TRAP, and it bit this repo three times (harness refs
 * 12.22, 12.26, 12.30): a tripwire "passes" when the test throws for ANY
 * reason, including a locator that never matched because the harness never got
 * where it meant to go. A broken route would therefore look like a confirmed
 * defect. The guards are TC-OE-01, TC-OE-03, TC-OE-06 and TC-OE-09:
 * ordinary tests over the same paths, endpoints and controls the tripwires
 * depend on. If the navigation or the generator
 * breaks, those go red first and the tripwires below are not to be trusted
 * until they are green again. Do not delete them.
 */

const ENTRY_FIELDS = '#labNumber, #patientId, #lastName, #firstName';

/** The dashboard's own Continue action. Loads an existing order into context. */
async function continueFirstOrder(page: Page): Promise<string> {
  await page.goto(`${BASE}/order`);
  const rows = page.locator('tr').filter({ hasText: /DEV|ACC|\d{6,}/ });
  await expect(rows.first(), 'the order dashboard must list at least one order').toBeVisible({
    timeout: 20_000,
  });
  const labNo = await page.evaluate(() => {
    const tr = Array.from(document.querySelectorAll('tr')).find((t) => /[A-Z]{2,}\d{6,}/.test(t.innerText || ''));
    return tr ? (tr.innerText.match(/[A-Z]{2,}\d{6,}/) || [''])[0] : '';
  });
  const cont = page.locator('a,button').filter({ hasText: /^\s*Continue\s*$/ }).first();
  await expect(cont, 'the dashboard must offer Continue on an existing order').toBeVisible({ timeout: 15_000 });
  await cont.click();
  await page.waitForTimeout(5_000);
  return labNo;
}

/**
 * In-app navigation to the entry step.
 *
 * MUST be a click, not page.goto(). A full load rebuilds the order context and
 * clears the retained state, which hides the very defect under test — the
 * reason the client saw this and earlier probes did not.
 */
async function navToEntryInApp(page: Page): Promise<void> {
  const nav = page.locator('a,button').filter({ hasText: /^\s*Enter Order\s*$/ }).first();
  await expect(nav, 'the side navigation must offer Enter Order').toBeVisible({ timeout: 15_000 });
  await nav.click();
  await expect(page.locator('#labNumber'), 'the entry step must render').toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(3_000);
}

/**
 * Select a referring site the way the UI actually requires: type a fragment,
 * press the Requester block's own Search, then press Select on the result row.
 *
 * WHY NOT clickFormSearch. That helper looks for a Search button sharing a
 * container with a field, and on this form it finds none — the first run logged
 * "NO Search button shares a container with #siteName (3 candidates)" and fell
 * back to last(), which is the Provider block's Search. Three Search buttons
 * live on this screen (site, provider, and the Carbon header's), and the site
 * one is not related to #siteName in any way that heuristic can see.
 *
 * So target it positionally, which is what a person does visually: the first
 * Search button FOLLOWING #siteName in document order. Tagged with a data
 * attribute so the click cannot drift to another candidate.
 */
async function selectFirstSite(page: Page): Promise<boolean> {
  const site = page.locator('#siteName');
  if (!(await site.count())) return false;
  await site.fill('QA');

  const tagged = await page.evaluate(() => {
    const field = document.getElementById('siteName');
    if (!field) return false;
    const buttons = Array.from(document.querySelectorAll('button')).filter(
      (b) =>
        /^\s*Search\s*$/.test(b.innerText || '') &&
        !b.closest('header') &&
        !b.classList.contains('cds--header__action'),
    );
    const after = buttons.find((b) => field.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!after) return false;
    after.setAttribute('data-qa-site-search', '1');
    return true;
  });
  if (!tagged) return false;

  await page.locator('[data-qa-site-search="1"]').click();
  await page.waitForTimeout(2_500);

  const sel = page.getByRole('button', { name: /^\s*Select\s*$/ }).first();
  if (!(await sel.isVisible({ timeout: 8_000 }).catch(() => false))) return false;
  await sel.click();
  await page.waitForTimeout(3_000);
  return true;
}

test.describe('Order entry — state reset and lab number lifecycle (TC-OE)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // ── CANARY. Not a defect check. Guards every tripwire below. ─────────────
  test('TC-OE-01: the dashboard loads an existing order into the entry flow', async ({ page }) => {
    const labNo = await continueFirstOrder(page);
    expect(labNo, 'a lab number must be readable from the dashboard row').toMatch(/[A-Z]{2,}\d{6,}/);
    await navToEntryInApp(page);
    await expect(page.locator(ENTRY_FIELDS).first(), 'the entry form must be on screen').toBeVisible({
      timeout: 15_000,
    });
    console.log(`TC-OE-01: dashboard -> Continue(${labNo}) -> in-app Enter Order reached`);
  });

  // ── THE CORE DEFECT ──────────────────────────────────────────────────────
  test('TC-OE-02: the entry step must bind the form to a freshly reserved lab number', async ({ page }) => {
    // Expected to fail until the defect is fixed. When this turns RED,
    // the behaviour was corrected: delete this line.
    test.fail();
    // Design rule 2. Reaching the entry step for a new order generates and
    // reserves a number. Today the form inherits the number of the order that
    // was open a moment ago — one already consumed by a saved record — so a
    // save lands on that existing order instead of a new one.
    const previous = await continueFirstOrder(page);
    await navToEntryInApp(page);
    const shown = await page.locator('#labNumber').inputValue();
    console.log(`TC-OE-02: previous=${previous} shown=${shown}`);
    expect(
      shown,
      `the entry form must not still be bound to ${previous}; a new order needs its own reserved number`,
    ).not.toBe(previous);
  });

  // ── CANARY for the generator. Passes today; keep it that way. ────────────
  test('TC-OE-03: generating a lab number reserves it, saving nothing', async ({ page }) => {
    // Design rule 1, and the half that already works. Five requests, nothing
    // saved in between, must yield five different numbers. If this ever
    // returns a repeat, two orders can be created on one number and TC-OE-02
    // is no longer the only lab-number problem.
    await page.goto(`${BASE}/order`);
    const issued = await page.evaluate(async () => {
      const got: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', {
          headers: { Accept: 'application/json' },
        });
        const j = await r.json().catch(() => null);
        got.push(String((j && (j.body ?? j.labNo)) ?? ''));
      }
      return got;
    });
    console.log(`TC-OE-03: issued ${issued.join(', ')}`);
    expect(issued.filter(Boolean), 'the generator must answer all five times').toHaveLength(5);
    expect(new Set(issued).size, `a number was issued twice: ${issued.join(', ')}`).toBe(5);
  });

  // ── PATIENT IDENTITY CARRY-OVER ──────────────────────────────────────────
  test('TC-OE-04: New Patient must not arrive holding the previous patient', async ({ page }) => {
    // Expected to fail until the defect is fixed. When this turns RED,
    // the behaviour was corrected: delete this line.
    test.fail();
    // The client's report, and the data-integrity half of it. With the previous
    // patient's key retained and patientUpdateStatus left at NO_ACTION rather
    // than ADD, anything typed here edits that patient instead of creating one.
    await continueFirstOrder(page);
    await navToEntryInApp(page);
    const np = page.locator('button').filter({ hasText: /^\s*New Patient\s*$/ }).first();
    await expect(np, 'the entry form must offer New Patient').toBeVisible({ timeout: 15_000 });
    await np.click();
    await page.waitForTimeout(4_000);

    const identity = {
      lastName: await page.locator('#lastName').inputValue().catch(() => ''),
      firstName: await page.locator('#firstName').inputValue().catch(() => ''),
      nationalId: await page.locator('#nationalId').inputValue().catch(() => ''),
    };
    console.log(`TC-OE-04: after New Patient -> ${JSON.stringify(identity)}`);
    expect(
      `${identity.lastName}${identity.firstName}${identity.nationalId}`,
      `New Patient must start empty; it held ${JSON.stringify(identity)}`,
    ).toBe('');
  });

  // ── AUTOSAVE ─────────────────────────────────────────────────────────────
  test('TC-OE-05: nothing must be posted while the form sits untouched', async ({ page }) => {
    // Expected to fail until the defect is fixed. When this turns RED,
    // the behaviour was corrected: delete this line.
    test.fail();
    // Design rule 4: there is no autosave; saving is explicit. Today an
    // unprompted POST to SamplePatientEntry fires roughly 28s after the form
    // goes dirty, carrying the PREVIOUS order's labNo and patient key.
    //
    // 90s, against the repo's 30s policy, and deliberately. That policy says a
    // check taking longer than 30s is itself a finding — here the ~28s timer IS
    // the finding, so the budget has to clear it. This is the one case in this
    // file allowed past 30s.
    test.setTimeout(90_000);

    const posts: Array<{ labNo: string | null; patientPK: string | null }> = [];
    page.on('request', (r) => {
      if (r.method() !== 'POST' || !/SamplePatientEntry/.test(r.url())) return;
      const d = String(r.postData() ?? '');
      posts.push({
        labNo: (d.match(/"labNo":"([^"]*)"/) || [])[1] ?? null,
        patientPK: (d.match(/"patientPK":"([^"]*)"/) || [])[1] ?? null,
      });
    });

    await continueFirstOrder(page);
    await navToEntryInApp(page);
    const np = page.locator('button').filter({ hasText: /^\s*New Patient\s*$/ }).first();
    if (await np.isVisible({ timeout: 8_000 }).catch(() => false)) await np.click();

    // Touch nothing else. Any POST from here is the application's own doing.
    await page.waitForTimeout(45_000);

    console.log(`TC-OE-05: unprompted POSTs while idle: ${JSON.stringify(posts)}`);
    expect(posts, `the app saved without being asked: ${JSON.stringify(posts)}`).toHaveLength(0);
  });

  // ── REQUESTER FIELDS THAT DID NOT SURVIVE THE REBUILD ────────────────────
  test('TC-OE-06: the department endpoint serves wards for a referring site', async ({ page }) => {
    // CANARY for TC-OE-07. If the service stops answering, TC-OE-07 would fail
    // for a completely different reason than the missing control.
    await page.goto(`${BASE}/order/enter`);
    const res = await page.evaluate(async () => {
      const j = async (p: string) => {
        const r = await fetch(p, { headers: { Accept: 'application/json' } });
        return { status: r.status, body: await r.json().catch(() => null) };
      };
      const sites = await j('/api/OpenELIS-Global/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
      const list = (sites.body as Array<{ id: string }>) || [];
      if (!list.length) return { sites, depts: null, siteId: null };
      const siteId = String(list[0].id);
      return { sites, siteId, depts: await j(`/api/OpenELIS-Global/rest/departments-for-site?refferingSiteId=${siteId}`) };
    });
    console.log(`TC-OE-06: site=${res.siteId} depts=${JSON.stringify(res.depts?.body)}`);
    expect(res.sites.status, 'the referring-clinic list must answer').toBe(200);
    expect(res.siteId, 'at least one referring clinic (org type 5) must be configured').toBeTruthy();
    expect(res.depts?.status, 'departments-for-site must answer for that site').toBe(200);
    expect(
      Array.isArray(res.depts?.body) && (res.depts!.body as unknown[]).length > 0,
      'the seeded site must have at least one department; see harness 12.27 for seeding',
    ).toBe(true);
  });

  // ── CANARY for TC-OE-07's precondition. ─────────────────────────────────
  test('TC-OE-09: a referring site can be selected on the entry form', async ({ page }) => {
    // TC-OE-07 asserts a control is ABSENT once a site is chosen. An absence
    // means nothing unless the choosing worked, and the first pass at this
    // finding was wrong for exactly that reason (harness ref 12.30). The
    // precondition cannot live inside TC-OE-07: a tripwire counts ANY throw as
    // its expected failure, so a broken site search would read as a confirmed
    // defect. It has to be an ordinary test, and it has to stay green.
    await page.goto(`${BASE}/order/enter`);
    await expect(page.locator('#siteName'), 'the Requester block must render').toBeAttached({ timeout: 20_000 });
    const picked = await selectFirstSite(page);
    expect(picked, 'a referring site must be selectable: type, Search, Select').toBe(true);
    await expect(page.locator('body'), 'the chosen site must read back as selected').toContainText(/Selected/i, {
      timeout: 10_000,
    });
    console.log('TC-OE-09: referring site selected via type -> Search -> Select');
  });

  test('TC-OE-07: selecting a site must offer its Ward / Department / Unit', async ({ page }) => {
    // Expected to fail until the defect is fixed. When this turns RED,
    // the behaviour was corrected: delete this line.
    test.fail();
    // Design rule 5. The control, its list handling, its label key
    // (order.department.label) and the departments-for-site call all still
    // exist in the shipped bundle, and referringSiteDepartmentId still travels
    // in the payload — it is simply not rendered on the new entry form, and the
    // screen never asks the server for the list.
    await page.goto(`${BASE}/order/enter`);
    await expect(page.locator('#siteName'), 'the Requester block must render').toBeAttached({ timeout: 20_000 });

    const picked = await selectFirstSite(page);
    // Precondition, asserted BEFORE the tripwire's own claim: without a
    // selected site the absence of a department control proves nothing. This
    // is the mistake that cost the first pass at this finding.
    expect(picked, 'a referring site must be selectable before judging the department field').toBe(true);
    await expect(page.locator('body'), 'the site must read as selected').toContainText(/Selected/i, {
      timeout: 10_000,
    });

    const dept = page.locator(
      'select[id*="epartment"], select[id*="ward"], [id*="referringSiteDepartment"], select[id*="dept"]',
    );
    const wordPresent = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      const i = t.search(/Requester/i);
      return i < 0 ? false : /\b(ward|department|unit)\b/i.test(t.slice(i, i + 700));
    });
    console.log(`TC-OE-07: dept controls=${await dept.count()} wordInRequester=${wordPresent}`);
    expect(
      (await dept.count()) > 0 || wordPresent,
      'the Requester block must offer a Ward / Department / Unit control once a site is selected',
    ).toBe(true);
  });

  test('TC-OE-08: the entry form must offer an order date defaulting to today', async ({ page }) => {
    // Expected to fail until the defect is fixed. When this turns RED,
    // the behaviour was corrected: delete this line.
    test.fail();
    // Design decision (Sep 2026): clinical orders need their own order date,
    // defaulting to entry time and overwritable. The date half already exists
    // as order_requestDate with autofillDate set and a mount effect seeding it
    // from currentDateAsText — it is just not rendered here. (The TIME half is
    // genuinely new work and is NOT asserted by this case.)
    await page.goto(`${BASE}/order/enter`);
    await expect(page.locator('#labNumber'), 'the entry form must render').toBeAttached({ timeout: 20_000 });

    const found = await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('#order_requestDate, [id*="requestDate"], [id*="orderDate"]');
      return el ? { id: el.id, value: el.value } : null;
    });
    console.log(`TC-OE-08: order date control = ${JSON.stringify(found)}`);
    expect(found, 'an order date control (order_requestDate) must be on the entry form').not.toBeNull();

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    expect(found!.value, 'the order date must default to the date the order is entered').toContain(
      `${dd}/${mm}/${today.getFullYear()}`,
    );
  });
});
