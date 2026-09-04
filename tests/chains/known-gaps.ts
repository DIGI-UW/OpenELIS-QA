/**
 * tests/chains/known-gaps.ts — the declared-gap register.
 *
 * THE RULE: a step may only excuse itself if the excuse was written down in
 * advance. Fail-by-default; anything not demonstrably green is visible as
 * not-green.
 *
 * `markStep(..., 'GAP'|'BLOCKED', ...)` consults this register:
 *
 *   - key present -> the step SKIPS. Visible in the report as not-run, with the
 *     declared reason and ticket attached.
 *   - key absent   -> the step FAILS.
 *
 * Why a register rather than a runtime judgement call: the whole OGC-1192
 * failure was a step deciding, at runtime, that a 400 it did not like was a
 * "gap" and excusing itself. A gap you have to type into a file, with a reason
 * and a ticket, is one someone can review. A gap decided in a catch block is
 * one nobody ever sees.
 *
 * WHAT BELONGS HERE
 *   Only "this build genuinely does not have the feature under test" — an older
 *   instance without the environmental domain, a module not deployed on the
 *   target, a feature behind a flag that is off.
 *
 * WHAT DOES NOT
 *   A 4xx or 5xx from an endpoint that exists. A selector that stopped
 *   matching. A payload the server rejected. Data that was not seeded. Those
 *   are failures. Adding them here to get a green run is the same move as the
 *   old GAP escape hatch, one level up — and it is the move this file exists to
 *   make visible.
 *
 * EVERY ENTRY MUST BE ABLE TO DIE. Give each one a ticket or a condition that
 * would retire it, and delete it when that lands.
 */

export interface DeclaredGap {
  /** Why this build legitimately cannot run the step. */
  reason: string;
  /** Ticket tracking the underlying absence, if there is one. */
  ticket?: string;
  /** What would make this entry deletable. */
  retireWhen: string;
}

/** Keyed `"<chain>:<step>"`, e.g. `"N:2"`. */
export const DECLARED_GAPS: Record<string, DeclaredGap> = {
  // Intentionally near-empty on introduction. Populating it by guesswork would
  // reproduce the original problem — excuses written by someone who never saw
  // the step run. The nightly job runs in strict mode (see markStep), so the
  // gaps that actually fire will show up as failures in its report; declare the
  // legitimate ones from THAT evidence, with the run linked in `reason`.
  'N:2': {
    reason: 'Compliance standards are optional reference data; an instance with none configured cannot exercise the step.',
    ticket: 'OGC-1064',
    retireWhen: 'the QA instances seed at least one active compliance standard, or the step is rewritten to seed its own.',
  },
};

/** True when this step has a reviewed, written-down reason to be absent. */
export function isDeclaredGap(chain: string, step: number): DeclaredGap | undefined {
  return DECLARED_GAPS[`${chain}:${step}`];
}

/**
 * Strict mode: an undeclared GAP/BLOCKED fails instead of skipping.
 *
 * Default OFF, and deliberately so. You cannot honestly declare gaps you have
 * never observed firing, and this repo had no unattended runs until 2026-09-03,
 * so there is no evidence base yet. The nightly workflow sets GAPS_STRICT=1 —
 * it is non-blocking, so it can safely surface the true list. Once the register
 * reflects a couple of weeks of real runs, flip this default to on and make the
 * PR gate strict too.
 */
export function gapsAreStrict(): boolean {
  return process.env.GAPS_STRICT === '1';
}
