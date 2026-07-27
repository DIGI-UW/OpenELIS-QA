#!/usr/bin/env node
/**
 * Ingest the 2026-07-27 chain run results (run from a full clone of main via the Mac harness,
 * local node_modules symlinked; auth.setup relaxed for the demo SPAs) back into the freshness
 * manifest. Testing chains ran against testing.openelis-global.org; vector/env/compliance chains
 * against indonesiademo.
 *
 * Verdicts:
 *   fresh   — ran fully green this cycle
 *   partial — blocked at an early step by a precondition (missing QA_AUTO_ seed data — the seeder
 *             can't create patients on current testing: POST /rest/patient-management → 404; or a
 *             disabled feature/flag). GAP-by-design, not a code regression.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'spec-freshness.json');
const RUN = '2026-07-27';

const GREEN = { // fully green this cycle
  'chain-i': 'testing', 'chain-o': 'testing', 'chain-p': 'testing', 'chain-q': 'testing',
  'chain-r': 'testing', 'chain-s': 'testing', 'chain-t': 'testing', 'chain-u': 'testing',
  'chain-w': 'testing', 'chain-x': 'testing',
  'chain-m': 'indonesiademo', 'chain-n': 'indonesiademo', 'chain-ab': 'indonesiademo',
  'chain-y': 'indonesiademo', 'chain-z': 'indonesiademo',
};
const BLOCKED_DATA = ['chain-a', 'chain-b', 'chain-c', 'chain-d', 'chain-e', 'chain-j', 'chain-k', 'chain-l'];
const BLOCKED_CFG = { 'chain-f': 'eqaEnabled config off', 'chain-g': 'no Cold Storage device configured', 'chain-h': 'restricted-role user create blocked' };
const NOTE_GREEN = 'Ran GREEN this cycle (2026-07-27).';
const NOTE_DATA = 'Blocked at early step: needs QA_AUTO_ seed data; seeder cannot create patients on current testing (POST /rest/patient-management → 404). GAP-by-design, not a regression.';
const Y_NOTE = ' OGC-1059 watch (Step 4): complianceReport now returns 200 — appears FIXED (was 500). Surface for Casey to verify/close.';

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const find = (stem) => m.specs.find((s) => { const b = s.file.split('/').pop(); return b === `${stem}.spec.ts` || b.startsWith(`${stem}-`); });
let changed = 0;
for (const [stem, target] of Object.entries(GREEN)) {
  const s = find(stem); if (!s) { console.log('MISS', stem); continue; }
  s.status = 'fresh'; s.lastResult = 'pass'; s.lastRun = RUN; s.target = target;
  s.notes = (s.notes ? s.notes.split(' OGC-1059')[0] + ' — ' : '') + NOTE_GREEN + (stem === 'chain-y' ? Y_NOTE : '');
  changed++;
}
for (const stem of BLOCKED_DATA) {
  const s = find(stem); if (!s) { console.log('MISS', stem); continue; }
  s.status = 'partial'; s.lastResult = 'blocked'; s.lastRun = RUN; s.drift = ['needs-seed'];
  s.notes = (s.notes ? s.notes + ' — ' : '') + NOTE_DATA; changed++;
}
for (const [stem, why] of Object.entries(BLOCKED_CFG)) {
  const s = find(stem); if (!s) { console.log('MISS', stem); continue; }
  s.status = 'partial'; s.lastResult = 'gap'; s.lastRun = RUN; s.drift = ['feature-gated'];
  s.notes = (s.notes ? s.notes + ' — ' : '') + `Feature-gated on testing: ${why}. GAP-by-design.`; changed++;
}
fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
const c = {}; m.specs.forEach((s) => (c[s.status] = (c[s.status] || 0) + 1));
console.log(`updated ${changed} chain specs · status ${JSON.stringify(c)}`);
