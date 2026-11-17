#!/usr/bin/env node
/**
 * Fails when a spec switches the UI to a non-English language without helpers/locale.ts.
 * The server session keeps the language of its last request and every spec shares one login, so a
 * language left behind makes later specs read French (2026-11-17: TC-RUN-10 broke TC-RUN-08 and 11).
 * Allowed: withLocale(page, 'fr', ...), and setting an English variant (en, en-US, en-GB, en-PG...).
 */
import fs from 'fs';
import path from 'path';
const ROOT = process.cwd();
const hits = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(spec|setup)\.ts$|\.ts$/.test(e.name) && !p.endsWith(path.join('helpers', 'locale.ts'))) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        const m = /setItem\(\s*['"]locale['"]\s*,\s*['"]([a-zA-Z_-]+)['"]/.exec(line);
        if (m && !/^en([-_][A-Za-z]+)?$/.test(m[1])) hits.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim().slice(0, 110)}`);
      });
    }
  }
}
for (const d of ['tests', 'helpers']) walk(path.join(ROOT, d));
if (hits.length) {
  console.error(`Switch languages with withLocale() from helpers/locale.ts, so the shared login goes back to English:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('every language switch goes through withLocale. OK.');
