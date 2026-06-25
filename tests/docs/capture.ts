// Docs-capture helper — labeled step screenshots + per-capability video naming.
// Navigation is route-based (page.goto): the OpenELIS SPA serves every deep link (verified
// status 200), and side-nav anchors are render-hidden when the nav is collapsed, so clicking
// text labels is unreliable. We also dismiss the periodic "Still There?" session-timeout modal
// before each shot so it never overlays a screenshot.
import { Page, TestInfo, Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = 'docs-media';
const counters = new WeakMap<TestInfo, number>();

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Capability id this flow documents — read from a `capability` test annotation. */
export function capabilityId(info: TestInfo): string {
  return info.annotations.find(a => a.type === 'capability')?.description || slug(info.title);
}

function dirFor(info: TestInfo): string {
  const d = path.join(ROOT, capabilityId(info));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Dismiss the OpenELIS "Still There?" idle-timeout modal and any stray Carbon modal/toast. */
export async function dismissModals(page: Page): Promise<void> {
  for (const re of [/keep me|stay|continue|extend|i'?m here|^yes$/i, /^close$/i, /dismiss/i]) {
    const b = page.getByRole('button', { name: re }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  // Last resort: a visible Carbon modal close 'x'.
  const x = page.locator('.cds--modal.is-visible .cds--modal-close').first();
  if (await x.isVisible().catch(() => false)) await x.click({ timeout: 2000 }).catch(() => {});
}

/** Let the page settle: network idle, a short paint delay, then clear any modal. */
export async function settle(page: Page, ms = 900): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
  await dismissModals(page);
}

/** Navigate to a feature by SPA route, settle, and dismiss modals. Returns false if it errored. */
export async function go(page: Page, route: string): Promise<boolean> {
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(page);
    return true;
  } catch {
    return false;
  }
}

/** Capture a labeled step. `target` crops to one Carbon panel; `maskPii` blurs selectors.
 *  Resilient: if the target isn't present, falls back to a viewport screenshot. */
export async function shot(
  page: Page,
  info: TestInfo,
  name: string,
  opts: { target?: Locator; fullPage?: boolean; maskPii?: string[] } = {},
): Promise<string> {
  await dismissModals(page);
  const n = (counters.get(info) ?? 0) + 1;
  counters.set(info, n);
  const file = path.join(dirFor(info), `${String(n).padStart(2, '0')}-${slug(name)}.png`);
  const mask = (opts.maskPii ?? DEFAULT_PII).map(sel => page.locator(sel));
  const common = { animations: 'disabled' as const, mask, path: file };
  try {
    if (opts.target && (await opts.target.count())) await opts.target.first().screenshot(common);
    else await page.screenshot({ ...common, fullPage: opts.fullPage ?? true });
  } catch {
    await page.screenshot({ ...common, fullPage: false }).catch(() => {});
  }
  await info.attach(name, { path: file, contentType: 'image/png' }).catch(() => {});
  return file;
}

/** Pan the page top→bottom→top so the recorded video reads like a person scrolling the screen. */
export async function scrollThrough(page: Page, opts: { step?: number; pause?: number } = {}): Promise<void> {
  const step = opts.step ?? 240;
  const pause = opts.pause ?? 350;
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vp = page.viewportSize()?.height ?? 900;
  for (let y = 0; y < Math.max(0, h - vp); y += step) {
    await page.evaluate(_y => window.scrollTo({ top: _y }), y);
    await page.waitForTimeout(pause);
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  await page.waitForTimeout(450);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(300);
}

/** Sensible default PII mask for clinical screens; override per-spec when needed. */
export const DEFAULT_PII = [
  '[data-testid="patient-name"]',
  'td:has-text("0123456")',
];

/** First Carbon data table / main panel on the page — handy crop target. */
export function mainPanel(page: Page): Locator {
  return page.locator('.cds--data-table-container, main .cds--tile, main table, main').first();
}

/** Call at end of test: renames Playwright's recorded video to docs-media/<id>/walkthrough.webm. */
export async function saveWalkthrough(page: Page, info: TestInfo): Promise<string | null> {
  const vid = page.video();
  if (!vid) return null;
  await page.close(); // flush video to disk
  const src = await vid.path();
  const dest = path.join(dirFor(info), 'walkthrough.webm');
  fs.copyFileSync(src, dest);
  await info.attach('walkthrough', { path: dest, contentType: 'video/webm' }).catch(() => {});
  return dest;
}

/** @deprecated text-based sidebar clicking is unreliable (nav anchors hide when collapsed). Use go(). */
export async function sidebar(page: Page, ...labels: string[]) {
  for (const label of labels) {
    await page.getByText(new RegExp(`^${label}$`, 'i')).first().click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}
