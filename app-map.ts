/**
 * Typed accessor for the Application Map (app-map.json) — the single source of truth for OpenELIS
 * routes, REST contracts, feature flags, fixtures, and volatile UI anchors. Specs and helpers import
 * from here instead of hard-coding; when the app changes, edit app-map.json (one place) and every
 * consumer updates. Read at load from the repo root (Playwright runs with cwd = repo root).
 */
import fs from 'fs';
import path from 'path';

const MAP = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'app-map.json'), 'utf8'));

export const appMap = MAP;
export const META = MAP.meta;
export const ROUTES: Record<string, any> = MAP.routes;
export const REST_BASE: string = MAP.rest.base;
export const ENDPOINTS: Record<string, any> = MAP.rest.endpoints;
export const FLAGS: Record<string, any> = MAP.flags;
export const FIXTURES: Record<string, any> = MAP.fixtures;
export const UI_ANCHORS: Record<string, any> = MAP.uiAnchors;
export const DRIFT_LEDGER: Record<string, string> = MAP.driftLedger;
