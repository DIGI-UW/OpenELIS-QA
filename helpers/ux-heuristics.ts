/**
 * helpers/ux-heuristics.ts
 *
 * A heuristic pass: would a person have trouble with this page? Added 2026-09-28 at Casey's
 * request ("add the heuristic pass for all future tests"). Every check returns pass / warn / fail
 * with a one-line reason; nothing here throws, so a spec can run the pass alongside its own
 * assertions and decide separately what to enforce. Results are attached to the test and written
 * to test-results/heuristics/*.json; `npm run heuristics:report` rolls them up for review.
 *
 * The checks (ids are stable; the catalogue section is TC-HEUR):
 *   H1  After a successful Save the form clears, moves on, or turns read-only, and the lab number changes.
 *   H2  The page opens at the top (or with the first field in view), not scrolled part way down.
 *   H3  A success or error message appears inside the viewport after an action.
 *   H4  A disabled primary button (Save/Submit/Next) says why it is disabled.
 *   H5  No "Unsaved changes" badge on an untouched page, or right after a successful save.
 *   H6  Reload keeps the page usable (same route, no blank screen). Checked by afterReload().
 *   H7  Dates on one page use one format, and it is the site's format.
 *   H8  No horizontal scroll at laptop (1280) and tablet (1024 / 768) widths.
 *   H9  No raw i18n keys, enum codes or [object Object] in visible text.
 *   H10 Keyboard: the primary action is reachable with Tab and has a visible focus ring.
 *   H11 Dropdown values fit: a selected value or an option is not cut off by the control's width.
 *
 * Thresholds are deliberately conservative first cuts; Casey reviews the report and the rules get
 * tuned from that feedback (see references/ux-heuristics.md in the skill).
 */
import { Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type Verdict = 'pass' | 'warn' | 'fail';
export interface HeuristicResult {
  id: string;
  verdict: Verdict;
  detail: string;
  page: string;
  step?: string;
  screenshot?: string;
}

export const HEURISTICS: Record<string, string> = {
  H1: 'Form resets or moves on after Save',
  H2: 'Page opens at the top',
  H3: 'Feedback appears where the user is looking',
  H4: 'Disabled primary action says why',
  H5: 'No false "unsaved changes"',
  H6: 'Reload keeps the page usable',
  H7: 'One date format, the site format',
  H8: 'No horizontal scroll (laptop, tablet)',
  H9: 'No raw keys, enums or [object Object]',
  H10: 'Primary action reachable by keyboard',
  H11: 'Dropdown values are not cut off',
};

const PRIMARY = /^(save|submit|next|save & next|confirm|accept|generate|print|search)$/i;

/** Collects results for one test and writes them out once. */
export class HeuristicLog {
  readonly results: HeuristicResult[] = [];
  constructor(private info: TestInfo) {}
  add(r: HeuristicResult | HeuristicResult[]) {
    for (const x of Array.isArray(r) ? r : [r]) this.results.push(x);
  }
  worst(): Verdict {
    return this.results.some(r => r.verdict === 'fail') ? 'fail' : this.results.some(r => r.verdict === 'warn') ? 'warn' : 'pass';
  }
  async flush() {
    const body = JSON.stringify({ test: this.info.titlePath.join(' > '), file: path.basename(this.info.file), results: this.results }, null, 2);
    await this.info.attach('ux-heuristics.json', { body, contentType: 'application/json' });
    const dir = path.join(this.info.project.outputDir || 'test-results', 'heuristics');
    fs.mkdirSync(dir, { recursive: true });
    const slug = this.info.titlePath.join('-').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 120);
    fs.writeFileSync(path.join(dir, `${slug}.json`), body);
    for (const r of this.results.filter(x => x.verdict !== 'pass')) {
      this.info.annotations.push({ type: `heuristic-${r.verdict}`, description: `${r.id} ${HEURISTICS[r.id]}: ${r.detail} (${r.page})` });
    }
  }
}

const route = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).search;

async function shot(page: Page, info: TestInfo | undefined, name: string): Promise<string | undefined> {
  if (!info) return undefined;
  const p = info.outputPath(`heur-${name.replace(/[^A-Za-z0-9]+/g, '-')}.png`);
  await page.screenshot({ path: p }).catch(() => undefined);
  return p;
}

/** H2, H4, H5, H7, H8, H9 on a page that has just loaded and has not been touched. */
export async function landing(page: Page, opts: { info?: TestInfo; siteDateFormat?: 'dd/MM/yyyy' | 'MM/dd/yyyy'; widths?: number[] } = {}): Promise<HeuristicResult[]> {
  const out: HeuristicResult[] = [];
  const pg = route(page);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);

  // H2: scroll position at load, and whether the page's first heading or field is in view.
  const scroll = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const first = main.querySelector('h1, h2, h3, input:not([type=hidden]), select, textarea');
    const r = first?.getBoundingClientRect();
    const scrollers = [document.scrollingElement, ...Array.from(document.querySelectorAll('main, main *'))]
      .filter((e): e is Element => !!e && (e as HTMLElement).scrollTop > 40)
      .map(e => ({ tag: (e as HTMLElement).tagName, top: Math.round((e as HTMLElement).scrollTop) }));
    const active = document.activeElement as HTMLElement | null;
    const ar = active && active !== document.body ? active.getBoundingClientRect() : null;
    return {
      y: Math.round(window.scrollY), innerH: window.innerHeight,
      firstTop: r ? Math.round(r.top) : null, scrollers: scrollers.slice(0, 3),
      activeLabel: active && active !== document.body ? (active.id || active.tagName) : '', activeTop: ar ? Math.round(ar.top) : null,
    };
  });
  const scrolled = scroll.y > 40 || scroll.scrollers.length > 0;
  const firstHidden = scroll.firstTop !== null && (scroll.firstTop < 0 || scroll.firstTop > scroll.innerH);
  out.push({
    id: 'H2', page: pg,
    verdict: scrolled || firstHidden ? 'fail' : 'pass',
    detail: scrolled || firstHidden
      ? `opens scrolled (window ${scroll.y}px${scroll.scrollers.length ? `, ${scroll.scrollers.map(s => `${s.tag} ${s.top}px`).join(', ')}` : ''}; first heading/field at ${scroll.firstTop}px; focus ${scroll.activeLabel || 'none'} at ${scroll.activeTop}px)`
      : 'opens at the top',
    screenshot: scrolled || firstHidden ? await shot(page, opts.info, `H2-${pg}`) : undefined,
  });

  // H5: "Unsaved changes" on an untouched page.
  const unsaved = await page.getByText(/unsaved changes/i).locator('visible=true').count();
  out.push({ id: 'H5', page: pg, verdict: unsaved ? 'fail' : 'pass', detail: unsaved ? 'shows "Unsaved changes" before anything was typed' : 'no unsaved badge' });

  // H4: disabled primary buttons with no stated reason.
  const disabled = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return Array.from(document.querySelectorAll('main button[disabled], main button[aria-disabled=true]'))
      .filter(b => re.test((b.textContent || '').trim()) && (b as HTMLElement).offsetParent !== null)
      .map(b => {
        const why = b.getAttribute('title') || b.getAttribute('aria-describedby') || '';
        const near = (b.closest('form, section, [class*=footer], [class*=actions]') || b.parentElement)?.textContent || '';
        return { label: (b.textContent || '').trim(), explained: !!why || /required|complete|select .* first|to enable|missing/i.test(near) };
      });
  }, PRIMARY.source);
  const silent = disabled.filter(d => !d.explained);
  out.push({ id: 'H4', page: pg, verdict: silent.length ? 'warn' : 'pass', detail: silent.length ? `disabled with no reason shown: ${silent.map(d => d.label).join(', ')}` : disabled.length ? 'disabled buttons explain themselves' : 'no disabled primary button' });

  // H7: date formats visible on the page.
  const dates = await page.evaluate(() => {
    const found = new Set<string>();
    const classify = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'yyyy-MM-dd';
      if (/^(dd|mm)\/(dd|mm)\/yyyy/i.test(s)) return s.slice(0, 10).toLowerCase() === 'mm/dd/yyyy' ? 'MM/dd/yyyy' : 'dd/MM/yyyy';
      const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}/.exec(s);
      if (m) return +m[1] > 12 ? 'dd/MM/yyyy' : +m[2] > 12 ? 'MM/dd/yyyy' : 'ambiguous d/m';
      return '';
    };
    for (const el of Array.from(document.querySelectorAll('main input'))) {
      const i = el as HTMLInputElement;
      if (i.offsetParent === null) continue;
      if (i.type === 'date' || i.type === 'datetime-local') { found.add('browser-native (locale of the browser)'); continue; }
      for (const v of [i.placeholder, i.value]) { const c = classify((v || '').trim()); if (c) found.add(c); }
    }
    return [...found];
  });
  const fmts = dates.filter(d => d !== 'ambiguous d/m');
  const wrong = opts.siteDateFormat ? fmts.filter(f => f !== opts.siteDateFormat) : [];
  out.push({
    id: 'H7', page: pg,
    verdict: fmts.length > 1 ? 'fail' : wrong.length ? 'warn' : 'pass',
    detail: fmts.length > 1 ? `${fmts.length} date formats on one page: ${fmts.join(', ')}` : wrong.length ? `uses ${wrong.join(', ')}, site is ${opts.siteDateFormat}` : fmts.length ? `one format (${fmts[0]})` : 'no date fields',
  });

  // H9: raw keys, enum codes, [object Object].
  const raw = await page.evaluate(() => {
    const t = (document.querySelector('main') as HTMLElement | null)?.innerText || '';
    const hits = new Set<string>();
    // Seed data (QA_ / QA- names) and version strings (v2.1.0) are not defects.
    for (const m of t.matchAll(/\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+){2,}\b/g)) if (!/\.(com|org|net|pdf|png|jpg|csv|json|html)\b|^v?\d/.test(m[0]) && !/@/.test(m[0])) hits.add(m[0]);
    for (const m of t.matchAll(/\b[A-Z]{2,}(?:_[A-Z0-9]{2,})+\b/g)) if (!/^QA_/.test(m[0])) hits.add(m[0]);
    for (const m of t.matchAll(/\[object Object\]|\bundefined\b|\bNaN\b/g)) hits.add(m[0]);
    return [...hits].slice(0, 8);
  });
  out.push({ id: 'H9', page: pg, verdict: raw.length ? 'warn' : 'pass', detail: raw.length ? `raw text: ${raw.join(', ')}` : 'clean' });

  // H11: dropdown values cut off. Native <select>: measure each option's text against the
  // control's inner width (a selected long option renders clipped). Carbon dropdown/combobox:
  // the rendered label/input overflows its box.
  const clipped: string[] = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')!;
    const hits: string[] = [];
    for (const el of Array.from(document.querySelectorAll('main select'))) {
      const sel = el as HTMLSelectElement;
      if (sel.offsetParent === null) continue;
      const st = getComputedStyle(sel);
      c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      const inner = sel.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      const long = Array.from(sel.options).map(o => ({ t: o.text.trim(), w: c.measureText(o.text.trim()).width })).filter(o => o.t && o.w > inner + 2);
      if (long.length) {
        const label = (sel.id && document.querySelector(`label[for="${sel.id}"]`)?.textContent?.trim()) || sel.getAttribute('aria-label') || sel.id || 'select';
        hits.push(`${label}: ${long.length}/${sel.options.length} options wider than the box (e.g. "${long[0].t.slice(0, 50)}")`);
      }
    }
    for (const el of Array.from(document.querySelectorAll('main .cds--list-box__label, main .cds--list-box input.cds--text-input, main .cds--dropdown__wrapper button span'))) {
      const e = el as HTMLElement;
      if (e.offsetParent === null) continue;
      const v = (e as HTMLInputElement).value ?? e.textContent ?? '';
      if (v.trim() && e.scrollWidth > e.clientWidth + 2) hits.push(`dropdown value cut off: "${v.trim().slice(0, 50)}"`);
    }
    return hits.slice(0, 8);
  });
  // Open each Carbon dropdown / combobox in main (max 12) and measure its menu items, then close it.
  const triggers = page.locator('main button.cds--list-box__field, main [role=combobox].cds--list-box__field, main .cds--combo-box input[role=combobox]');
  const n = Math.min(await triggers.count(), 12);
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible().catch(() => false)) || !(await t.isEnabled().catch(() => false))) continue;
    await t.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const cut = await page.evaluate(() => Array.from(document.querySelectorAll('.cds--list-box__menu-item__option, .cds--list-box__menu-item'))
      .map(e => e as HTMLElement).filter(e => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 2)
      .map(e => (e.textContent || '').trim()).slice(0, 3));
    const label = await t.evaluate(e => (e.getAttribute('aria-label') || e.closest('.cds--list-box__wrapper, .cds--dropdown__wrapper, .cds--combo-box')?.querySelector('label')?.textContent || e.id || 'dropdown').trim()).catch(() => 'dropdown');
    if (cut.length) clipped.push(`${label}: menu items cut off (e.g. "${cut[0].slice(0, 50)}")`);
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  out.push({ id: 'H11', page: pg, verdict: clipped.length ? 'warn' : 'pass', detail: clipped.length ? clipped.join('; ') : 'dropdown values fit',
    screenshot: clipped.length ? await shot(page, opts.info, `H11-${pg}`) : undefined });

  // H8: horizontal overflow at each width, then restore.
  const vp = page.viewportSize();
  const overflow: string[] = [];
  for (const w of opts.widths ?? [1280, 1024]) {
    await page.setViewportSize({ width: w, height: vp?.height ?? 800 });
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => {
      const d = document.documentElement;
      const main = document.querySelector('main') as HTMLElement | null;
      return Math.max(d.scrollWidth - d.clientWidth, main ? main.scrollWidth - main.clientWidth : 0);
    });
    if (over > 24) overflow.push(`${w}px (+${over}px)`); // <=24px is a scrollbar gutter, not content
  }
  if (vp) await page.setViewportSize(vp);
  out.push({ id: 'H8', page: pg, verdict: overflow.length ? 'warn' : 'pass', detail: overflow.length ? `scrolls sideways at ${overflow.join(', ')}` : 'fits' });
  return out;
}

/** H1, H3, H5 after a Save. Call with the field values read before the click. */
export async function afterSave(
  page: Page,
  before: { url: string; values: Record<string, string>; labNumber?: string },
  read: () => Promise<{ values: Record<string, string>; labNumber?: string }>,
  opts: { info?: TestInfo; step?: string } = {}
): Promise<HeuristicResult[]> {
  const out: HeuristicResult[] = [];
  const pg = route(page);
  const toast = page.locator('.cds--toast-notification, .cds--inline-notification, [role=alert], [role=status]').filter({ hasText: /\S/ });
  await toast.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  const inView = await toast.first().evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }).catch(() => false);
  const toastText = ((await toast.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 120);
  out.push({ id: 'H3', page: pg, step: opts.step, verdict: inView ? 'pass' : 'fail', detail: inView ? `feedback in view: "${toastText}"` : toastText ? `feedback shown out of view: "${toastText}"` : 'no feedback after Save' });

  await page.waitForTimeout(2500);
  const now = await read();
  const moved = page.url() !== before.url;
  const keys = Object.keys(before.values).filter(k => before.values[k]);
  const kept = keys.filter(k => now.values[k] === before.values[k]);
  const readOnly = await page.locator('main input:not([type=hidden]):not([readonly]):not([disabled])').count() === 0;
  const sameLab = !!before.labNumber && now.labNumber === before.labNumber;
  const reset = moved || readOnly || (kept.length === 0 && !sameLab);
  out.push({
    id: 'H1', page: pg, step: opts.step,
    verdict: reset ? 'pass' : 'fail',
    detail: reset ? (moved ? `moved to ${route(page)}` : readOnly ? 'form turned read-only' : 'form cleared')
      : `form still holds ${kept.length}/${keys.length} values${sameLab ? ` and the same lab number ${before.labNumber}` : ''}, so a second Save reuses this order`,
    screenshot: reset ? undefined : await shot(page, opts.info, `H1-${pg}`),
  });

  const unsaved = await page.getByText(/unsaved changes/i).locator('visible=true').count();
  out.push({ id: 'H5', page: pg, step: opts.step, verdict: unsaved && !moved ? 'fail' : 'pass', detail: unsaved && !moved ? 'still shows "Unsaved changes" after a successful save' : 'no unsaved badge after save' });
  return out;
}

/** H6: reload keeps the route and renders content. */
export async function afterReload(page: Page): Promise<HeuristicResult> {
  const before = route(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const text = ((await page.locator('main').innerText().catch(() => '')) || '').trim();
  const ok = route(page) === before && text.length > 40;
  return { id: 'H6', page: before, verdict: ok ? 'pass' : 'fail', detail: ok ? 'reload keeps the page' : `after reload: ${route(page)}, ${text.length} chars of content` };
}

/** H10: Tab through the page and see whether the first primary action gets focus with a visible ring. */
export async function keyboardReach(page: Page, maxTabs = 60): Promise<HeuristicResult> {
  const pg = route(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => undefined);
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((src) => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || !new RegExp(src, 'i').test((a.textContent || '').trim())) return null;
      const s = getComputedStyle(a);
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || /inset|0px 0px 0px [1-9]/.test(s.boxShadow);
      return { label: (a.textContent || '').trim(), ring };
    }, PRIMARY.source);
    if (hit) return { id: 'H10', page: pg, verdict: hit.ring ? 'pass' : 'warn', detail: hit.ring ? `"${hit.label}" reached in ${i + 1} Tab presses` : `"${hit.label}" reached but no visible focus ring` };
  }
  return { id: 'H10', page: pg, verdict: 'warn', detail: `no primary action reached in ${maxTabs} Tab presses` };
}
