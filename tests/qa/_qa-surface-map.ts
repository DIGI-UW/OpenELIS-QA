/**
 * tests/qa/_qa-surface-map.ts
 *
 * The /qa module as it actually ships on demo-png, captured from a live census of
 * pngdemo.openelis-global.org rather than written from the source or from memory.
 *
 * Why this file exists as data: the module is 22 routes across four lanes, and the thing
 * that breaks is rarely one screen — it is a lane losing its endpoint, or a route quietly
 * falling through to another page. A table makes that visible at a glance and keeps each
 * spec to one loop.
 *
 * `calls` is the endpoint that MUST be requested when the route loads. It is the load-bearing
 * one, not the whole list: every screen also fetches branding, locales, menu and properties,
 * and asserting those would only couple the suite to the shell.
 */

export type Lane = 'overview' | 'qc' | 'eqa' | 'qi' | 'qms';

export interface QaSurface {
  route: string;
  /** The sidebar label, so a failure names what a user would have clicked. */
  label: string;
  lane: Lane;
  /** Substring of the REST path this screen must call. */
  calls: string;
  /** A heading the page must render. `null` means it ships without one — see QA-S-HEADINGS. */
  heading: RegExp | null;
  /** Column headers the table must offer, where the screen has a table. */
  columns?: string[];
  /** Carbon tabs the screen must offer. */
  tabs?: string[];
}

export const QA_SURFACES: QaSurface[] = [
  // ── Overview ───────────────────────────────────────────────────────────────────────
  { route: '/qa/overview', label: 'QA Overview', lane: 'overview',
    calls: 'qa/overview/summary', heading: /QA Overview/i },

  // ── Quality Control ────────────────────────────────────────────────────────────────
  { route: '/qa/qc/dashboard', label: 'QC Dashboard', lane: 'qc',
    calls: 'qc/dashboard/summary', heading: /Quality Control Dashboard/i,
    tabs: ['Instruments', 'Alerts', 'Bench QC'],
    columns: ['Instrument Name', 'Type', 'Location', 'Status', 'Analytes', 'Recent Violations'] },
  { route: '/qa/qc/alerts', label: 'QC Alerts', lane: 'qc',
    calls: 'qc/violations', heading: /Quality Control Dashboard/i,
    tabs: ['Instruments', 'Alerts', 'Bench QC'] },
  { route: '/qa/qc/control-lots', label: 'QC Lot Management', lane: 'qc',
    calls: 'qc/control-lots', heading: null,
    columns: ['Lot Number', 'Control Material', 'Manufacturer', 'Control Level', 'Status', 'Calculation Method', 'Expiration Date'] },
  { route: '/qa/qc/rule-config', label: 'Rule Configuration', lane: 'qc',
    calls: 'qc/ruleConfig/summaries', heading: null,
    columns: ['Analyzer', 'Test', 'Enabled Rules'] },
  { route: '/qa/qc/reagent-qc', label: 'Reagent QC', lane: 'qc',
    calls: '', heading: /Reagent QC/i },
  { route: '/qa/qc/manual-qc', label: 'Analyzer Manual QC', lane: 'qc',
    calls: '', heading: /Analyzer Manual QC/i },

  // ── EQA ────────────────────────────────────────────────────────────────────────────
  { route: '/qa/eqa/management', label: 'Programs', lane: 'eqa',
    calls: 'eqa/programs', heading: /Program Administration/i,
    tabs: ['EQA Programs', 'System Settings'],
    columns: ['Program Name', 'Provider', 'Scheme type', 'Enrolled Participants', 'Status'] },
  { route: '/qa/eqa/participants', label: 'Participants', lane: 'eqa',
    calls: 'eqa/programs', heading: /Participants/i },
  { route: '/qa/eqa/my-programs', label: 'My Programs', lane: 'eqa',
    calls: 'eqa/my-programs', heading: /My EQA Programs/i,
    columns: ['Program Name', 'Provider', 'Lab Unit(s)', 'Tests', 'Panels', 'Status'] },
  { route: '/qa/eqa/my-cycles', label: 'My Cycles', lane: 'eqa',
    calls: 'eqa/cycles/mine', heading: /My EQA Cycles/i,
    columns: ['Scheme', 'Type', 'Cycle', 'Status', 'Deadline', 'Progress'] },
  { route: '/qa/eqa/lab-performance/coverage', label: 'Lab Performance', lane: 'eqa',
    calls: 'eqa/lab-performance', heading: /Lab EQA Performance/i,
    tabs: ['Coverage', 'Recent Cycles'] },
  { route: '/qa/eqa/follow-up-queue', label: "This Lab's Follow-Up", lane: 'eqa',
    calls: 'eqa/followups', heading: /Follow-Up/i },
  { route: '/qa/eqa/analyst-competency', label: 'Analyst Competency', lane: 'eqa',
    calls: 'eqa/analyst-competency', heading: /Analyst Competency/i,
    columns: ['Analyst', 'PT samples (12 mo)', 'Most recent performance', 'Competency', 'History'] },
  { route: '/qa/eqa/provider/schemes', label: 'EQA Provider', lane: 'eqa',
    calls: 'eqa/provider/schemes', heading: /EQA schemes we provide/i },
  { route: '/qa/eqa/provider/follow-ups', label: 'Participant Follow-Up', lane: 'eqa',
    calls: 'eqa/provider/followups', heading: /Participant follow-up/i },
  { route: '/qa/eqa/in-house', label: 'In-House Blinding', lane: 'eqa',
    calls: 'eqa/programs', heading: /In-House Blinding/i },

  // ── Quality Indicators ─────────────────────────────────────────────────────────────
  { route: '/qa/qi/dashboard', label: 'QI Dashboard', lane: 'qi',
    calls: 'qi-config/resolve', heading: /QI Dashboard/i },
  { route: '/qa/qi/config', label: 'QI Configuration', lane: 'qi',
    calls: 'qi-config', heading: /QI Configuration/i,
    columns: ['Indicator', 'Enabled', 'Target', 'Action threshold', 'Overrides'] },

  // ── Quality Management System ──────────────────────────────────────────────────────
  { route: '/qa/qms/e-signature-log', label: 'Electronic Signature Log', lane: 'qms',
    calls: 'esig/log', heading: /Electronic Signature Log/i },
  { route: '/qa/qms/capa-register', label: 'CAPA Register', lane: 'qms',
    calls: 'nce/capa-register', heading: /CAPA Register/i },
  { route: '/qa/qms/accreditation', label: 'Accreditation', lane: 'qms',
    calls: 'accreditation/summary', heading: /Test Accreditation/i },
];

/**
 * Reagent QC and Analyzer Manual QC render a heading and nothing else — no table, no controls,
 * no REST call. That is WORK IN PROGRESS from another team, not a defect, so there is no
 * tripwire on it: a marker that fails every night while someone is mid-build is noise, and
 * noise is how a suite stops being read. Recorded here so the next person to run the census
 * does not re-file it.
 */
export const UNBUILT_ROUTES = ['/qa/qc/reagent-qc', '/qa/qc/manual-qc'];

/**
 * The two screens whose page title is not a heading element.
 *
 * Both render their title through a `page-title-breadcrumb` component: a row of
 * `<button class="page-title-breadcrumb-link">` and `<span class="page-title-breadcrumb-current">`
 * at 28px — visually the largest text on the page and unmistakably its title — with no h1..h6
 * and no role="heading". Verified in Chrome on pngdemo, 2026-09-17.
 *
 * The other twenty screens use a real heading: /qa/eqa/management, for instance, has
 * `<h2>Program Administration</h2>` with `<h4>` sections under it.
 */
export const BREADCRUMB_TITLE_ROUTES = ['/qa/qc/control-lots', '/qa/qc/rule-config'];
