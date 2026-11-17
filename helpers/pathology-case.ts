/**
 * helpers/pathology-case.ts
 *
 * The pathology / IHC case view controls the case-workflow specs share. Added 2026-10-08 when the
 * pathology case view was redesigned into a staged workflow: an accordion of numbered sections
 * (li#pathology-section-<key>) that unlock as the stage reaches them, a Carbon dropdown for the
 * stage, and "Save draft" in place of the old Save. The IHC case view still has the older form, so
 * every helper also handles that.
 */
import { expect, type Page } from '@playwright/test';

/**
 * Set / read the case stage. REWORKED 2026-10-08: the pathology case view was redesigned into a
 * staged workflow, and its stage picker (#status) is now a Carbon dropdown (a div with options
 * labelled "Grossing", "Ready for Pathologist", ...) instead of a <select> with enum values. The
 * IHC case view may still use a <select>; both are handled.
 */
export const STAGE_LABEL: Record<string, string> = {
  ACCESSIONED: 'Accessioned', GROSSING: 'Grossing', STAINING: 'Staining', READY_PATHOLOGIST: 'Ready for Pathologist',
  UNDER_REVIEW: 'Under Pathologist Review', COMPLETED: 'Completed',
};
const STAGE_ORDER = ['ACCESSIONED', 'GROSSING', 'DECALCIFICATION', 'PROCESSING', 'EMBEDDING', 'MICROTOMY', 'STAINING', 'COVERSLIPPING', 'READY_PATHOLOGIST', 'UNDER_REVIEW', 'COMPLETED'];

/**
 * REWORKED 2026-11-17 for #4969 (OGC-264, 10 Nov): the pathology case view no longer has a stage
 * picker. It shows the stage as text (#caseStage) and moves the case one stage on (a primary named
 * for the next stage) or back (#returnStage); from Ready for Pathologist on, only the pathologist's
 * own actions move it. So on that view this advances the case through its move endpoint
 * (POST /rest/pathology/caseView/{id}/advance with the stage it is at) until it reaches `value` or
 * cannot go further, meeting each bench stage's condition on the way (a description and a cassette
 * at Grossing, every cassette embedded, a slide cut and its label checked), then reloads the page. A target past Ready for Pathologist stops there: the
 * sections that unlock "from Ready for Pathologist on" are open by then. The IHC case view still
 * has the #status picker, which is set as before.
 */
export async function setStage(page: Page, value: string): Promise<void> {
  const status = page.locator('#status');
  if (await status.count()) {
    if ((await status.evaluate((e) => e.tagName)) === 'SELECT') { await status.selectOption(value); return; }
    await status.click();
    await status.getByRole('option', { name: STAGE_LABEL[value] ?? value, exact: true }).click();
    return;
  }
  const id = page.url().match(/PathologyCaseView\/(\d+)/)?.[1];
  expect(id, 'setStage needs a pathology case view URL').toBeTruthy();
  const reached = await page.evaluate(async ({ id, target, order }) => {
    const B = '/api/OpenELIS-Global/rest/pathology';
    const H = { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' };
    type Row = { id?: number; active?: boolean; cassetteState?: string; barcode?: string; blockId?: number; labelVerifiedAt?: unknown };
    type Case = { status?: string; nextStage?: string | null; blocks?: Row[]; slides?: Row[]; decalcificationRequired?: boolean };
    const read = async () => (await (await fetch(`${B}/caseView/${id}`, { credentials: 'include' })).json()) as Case;
    const post = async (url: string, body: unknown) => {
      const r = await fetch(url, { method: 'POST', credentials: 'include', headers: H, body: JSON.stringify(body) });
      return r.ok ? '' : `${url.replace(B, '')} answered ${r.status}: ${(await r.text()).slice(0, 160)}`;
    };
    // The case save takes the whole form, as the page sends it; lists left out are not optional.
    const form = (c: Case, extra: object) => ({ techniques: [], requests: [], resolvedRequests: [], deletedRequests: [],
      conclusions: [], reports: [], immunoHistoChemistryTestIds: [], referToImmunoHistoChemistry: false, release: false,
      decalcificationRequired: c.decalcificationRequired ?? false, status: c.status, blocks: c.blocks ?? [], slides: c.slides ?? [], ...extra });
    const live = (rows?: Row[]) => (rows ?? []).filter((r) => r.active !== false);
    let c = await read();
    for (let i = 0; i < 14; i++) {
      if (!c.status || c.status === target || !c.nextStage) break;
      if (order.indexOf(c.status) >= order.indexOf(target)) break;
      // Each bench stage's own condition (#4969): a description and a cassette at Grossing, every
      // cassette embedded at Embedding, a slide cut and its label checked at Microtomy.
      let err = '';
      if (c.status === 'GROSSING' && !live(c.blocks).length) {
        err = await post(`${B}/caseView/${id}`, form(c, { grossExam: 'QA_AUTO gross description', blocks: [...(c.blocks ?? []), { blockNumber: (c.blocks ?? []).length + 1 }] }));
      }
      if (c.status === 'EMBEDDING') for (const b of live(c.blocks).filter((b) => b.cassetteState !== 'BLOCK')) err ||= await post(`${B}/block/${b.id}/embed`, {});
      if (c.status === 'MICROTOMY') {
        if (!live(c.slides).length) err = await post(`${B}/caseView/${id}`, form(c, { slides: [...(c.slides ?? []), { slideNumber: 1, blockId: live(c.blocks)[0]?.id }] }));
        const cc = await read();
        for (const sl of live(cc.slides).filter((x) => x.blockId && !x.labelVerifiedAt)) {
          const bl = (cc.blocks ?? []).find((b) => b.id === sl.blockId);
          err ||= await post(`${B}/slide/${sl.id}/verify-label`, { block: bl?.barcode, slide: sl.barcode });
        }
      }
      if (err) return `${c.status} (${err})`;
      const moved = await post(`${B}/caseView/${id}/advance`, { from: c.status });
      if (moved) return `${c.status} (${moved})`;
      c = await read();
    }
    return c.status ?? '';
  }, { id: id as string, target: value, order: STAGE_ORDER });
  const want = Math.min(STAGE_ORDER.indexOf(value), STAGE_ORDER.indexOf('READY_PATHOLOGIST'));
  expect(STAGE_ORDER.indexOf(reached.split(' ')[0]), `the case moved on to ${STAGE_ORDER[want]} (it is at ${reached})`).toBeGreaterThanOrEqual(want);
  await page.reload();
  await expect(page.locator('#caseStage')).toBeVisible({ timeout: 30_000 });
}
export async function expectStage(page: Page, value: string, message = 'the stage'): Promise<void> {
  const status = page.locator('#status');
  if (!(await status.count())) { await expect(page.locator('#caseStage'), message).toContainText(STAGE_LABEL[value] ?? value); return; }
  if ((await status.evaluate((e) => e.tagName)) === 'SELECT') await expect(status, message).toHaveValue(value);
  else await expect(status, message).toContainText(STAGE_LABEL[value] ?? value);
}

/** The stage label currently shown, for any form of the control. */
export async function readStage(page: Page): Promise<string> {
  const status = page.locator('#status');
  if (!(await status.count())) return ((await page.locator('#caseStage').innerText()) || '').replace(/^\s*Status\s*/i, '').split('\n')[0].trim();
  if ((await status.evaluate((e) => e.tagName)) === 'SELECT') {
    return status.evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
  }
  return ((await status.innerText()) || '').split('\n')[0].trim();
}

/**
 * Open one section of the redesigned pathology case view (li#pathology-section-<key>: grossing,
 * microtomy, staining, review, findings, reports, ...). Sections start collapsed and unlock as the
 * stage reaches them. A no-op on the IHC case view, which has no sections.
 */
export async function openSection(page: Page, key: string): Promise<void> {
  const section = page.locator(`#pathology-section-${key}`);
  if (!(await section.count())) return;
  const head = section.getByRole('button').first();
  await expect(head, `the ${key} section is available`).toBeEnabled({ timeout: 15_000 });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
}

/** Press the case-level save ("Save draft" on the redesigned view, the last "Save" on the old one). */
export async function pressCaseSave(page: Page): Promise<void> {
  const draft = page.getByRole('button', { name: 'Save draft', exact: true });
  if (await draft.count()) await draft.click();
  else await page.getByRole('button', { name: /^Save$/ }).last().click();
}
