/**
 * helpers/site-date.ts
 *
 * Dates typed into screens that follow the site's date format (DEFAULT_DATE_LOCALE): dd/mm/yyyy
 * on most sites, mm/dd/yyyy on en-US. Since 10 Nov 2026 (OGC-608) the EQA cycle screens are among
 * them. API bodies keep ISO dates.
 */
import { Page } from '@playwright/test';

let usFormat: boolean | undefined;

export async function siteDate(page: Page, daysFromToday: number): Promise<string> {
  if (usFormat === undefined) {
    const cfg = await page.evaluate(async () => (await fetch('/api/OpenELIS-Global/rest/configuration-properties')).json().catch(() => ({})));
    usFormat = /^en[-_]US$/i.test(String(cfg?.DEFAULT_DATE_LOCALE ?? 'en-US'));
  }
  const d = new Date(Date.now() + daysFromToday * 86_400_000);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return usFormat ? `${mm}/${dd}/${d.getFullYear()}` : `${dd}/${mm}/${d.getFullYear()}`;
}
