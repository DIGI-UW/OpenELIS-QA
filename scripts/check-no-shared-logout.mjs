#!/usr/bin/env node
/**
 * check-no-shared-logout: fails if any spec logs out outside withIsolatedSession().
 *
 * A logout on the shared storageState ends that session for every later test in the run (see
 * helpers/isolated-session.ts). This scans spec files for logout actions and requires that each
 * one sits inside a test whose body calls withIsolatedSession(). Heuristic by design: it looks
 * back from the logout to the nearest `test(` and checks that span.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', 'archive', '.git', 'test-results', 'playwright-report']);
const LOGOUT = /(goto|fetch)\([^)\n]*logout|['"`]text=Logout['"`]|has-text\(\\?["']Logout|name:\s*\/[^/\n]*log\s?out|a\[href\*=["']?logout/i;

function* specs(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('test-results')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* specs(p);
    else if (/\.(spec|setup)\.ts$/.test(e.name)) yield p;
  }
}

const bad = [];
for (const file of specs(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\/\//.test(line) && LOGOUT.test(line)) {
      const before = text.slice(0, offset);
      const start = Math.max(before.lastIndexOf('test('), before.lastIndexOf('test.only('));
      const span = start >= 0 ? before.slice(start) : before;
      if (!/withIsolatedSession\(/.test(span)) bad.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
    offset += line.length + 1;
  }
}

if (bad.length) {
  console.error('✗ Logout on the shared session (wrap the test in withIsolatedSession, helpers/isolated-session.ts):');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log('✓ No spec logs out of the shared session.');
