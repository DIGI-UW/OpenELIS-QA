#!/usr/bin/env node
/**
 * Fails when any .ts file calls locator.isVisible({ ... }). Playwright ignores the timeout there and
 * answers at once, so the call reads as a wait and is not one (2026-11-17: 410 call sites, the
 * cause of the render-race reds in the develop-stack dark period). ESLint holds the same line for
 * spec files; this covers helpers and setup files too.
 */
import fs from 'fs';
import path from 'path';
const ROOT = process.cwd();
const SKIP = new Set(['node_modules', 'test-results', 'playwright-report', 'regression-results', 'archive', '.git', 'probes']);
const hits = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (/\.isVisible\(\s*\{/.test(line)) hits.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
  }
}
walk(ROOT);
if (hits.length) {
  console.error(`isVisible({ ... }) does not wait (its timeout is ignored). Use waitFor({ timeout }) or expect().toBeVisible():\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('no isVisible({ timeout }) calls. OK.');
