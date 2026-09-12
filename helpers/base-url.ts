/**
 * helpers/base-url.ts — one answer to "which instance are we talking to".
 *
 * WHY THIS FILE EXISTS
 * There were two answers, and they could disagree silently.
 *
 *   Every *.config.ts resolves   process.env.BASE ?? process.env.BASE_URL ?? <default>
 *   These helper modules resolved process.env.BASE_URL ?? 'https://testing.openelis-global.org'
 *
 * So `BASE=https://localhost:10443 npx playwright test ...` pointed the BROWSER at the local
 * develop stack while every helper-issued API call — including the ones that CREATE the
 * baseline patient and its two orders — went to testing.openelis-global.org. Fixtures were
 * written to one instance and read from another, and nothing said so. The specs then failed
 * against develop for want of data that had just been created somewhere else, and those
 * failures read as product defects.
 *
 * This is not hypothetical and it is not new. The identical split was caught in
 * seed-data.setup.ts by preflight PF-2 on 2026-08-27, where the note reads: "TWO different
 * env var names and two different defaults, in a file that WRITES DATA". That file was fixed
 * by navigating relatively so the config became the single source of truth. The three helper
 * modules kept the bug, because they issue absolute-URL fetches rather than navigating.
 *
 * The rule from here: nothing in this repository reads BASE_URL directly. It reads this.
 *
 * The mismatch warning below is the part that matters most. Making the two agree is easy;
 * noticing that they did not was the hard part, and it took a whole debugging session. If
 * they are ever both set and different, that is now loud.
 */

const DEFAULT_BASE = 'https://testing.openelis-global.org';

let warned = false;

/**
 * Resolve the target instance, in the same order every *.config.ts uses.
 * BASE wins, because that is the one the configs prefer and therefore the one the
 * browser is actually pointed at.
 */
export function resolveBase(): string {
  const fromBase = process.env.BASE?.trim();
  const fromBaseUrl = process.env.BASE_URL?.trim();

  if (!warned && fromBase && fromBaseUrl && fromBase.replace(/\/$/, '') !== fromBaseUrl.replace(/\/$/, '')) {
    warned = true;
    console.log(
      '\n┌──────────────────────────────────────────────────────────────────────┐\n' +
      '│  BASE and BASE_URL DISAGREE. Using BASE, the same one the configs use.│\n' +
      '└──────────────────────────────────────────────────────────────────────┘\n' +
      `  BASE     = ${fromBase}\n` +
      `  BASE_URL = ${fromBaseUrl}\n` +
      '  Fixtures write through BASE. If you meant to target the other one, set both.\n');
  }

  return fromBase || fromBaseUrl || DEFAULT_BASE;
}

/** The resolved target. Import this instead of reading process.env. */
export const BASE = resolveBase();

/** True when neither variable was set, so we fell through to the shared testing instance. */
export function isDefaultTarget(): boolean {
  return !process.env.BASE?.trim() && !process.env.BASE_URL?.trim();
}
