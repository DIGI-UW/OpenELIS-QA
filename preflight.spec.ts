/**
 * HARNESS PREFLIGHT -- the suite testing itself.
 *
 * Every check here exists because its absence cost a real run. Nothing here
 * touches the network: it reads the repo and finishes in milliseconds. Run it
 * BEFORE a long suite, not after.
 *
 *   npx playwright test -c preflight.config.ts
 *
 * WHY EACH CHECK EXISTS
 *
 *  PF-1  A config that sets use.storageState with no setup dependency silently
 *        reuses whatever cookie is on disk, and a stale cookie answers HTTP 200
 *        with the LOGIN PAGE -- so a status assertion passes and the NEXT line
 *        fails on parsing. Cost: the 2026-08-26 chains run, and it left
 *        census.config.ts reporting 126/1 off an auth file that merely happened
 *        to be fresh.
 *
 *  PF-2  A spec whose default BASE names a DIFFERENT host than the config that
 *        runs it will drive one instance carrying another instance cookies,
 *        authenticate against nothing, and time out on every test. Cost: 20 of
 *        the 27 failures in the 2026-08-26 all-tc run. analyzer-guided-setup
 *        targets analyzers.openelis-global.org and was registered against the
 *        testing config -- twenty false failures that read as defects.
 *
 *  PF-3  A config whose testMatch matches NO file runs zero tests and exits 0:
 *        a green run that tested nothing. Cost: eqa.config.ts shipped pointing
 *        at eqaflip.spec.ts, which lived only in a folder that is not a git
 *        repo.
 *
 *  PF-4  Informational, never fails: specs no config will ever execute.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const NEWLINE = String.fromCharCode(10);

/** Deliberately partial; not graded. */
const EXEMPT_CONFIGS = new Set(['playwright.config.ts']);

const read = (f: string): string => fs.readFileSync(path.join(ROOT, f), 'utf8');

const configFiles = (): string[] =>
  fs.readdirSync(ROOT).filter((f) => f.endsWith('.config.ts') && !EXEMPT_CONFIGS.has(f));

function specFiles(dir = ROOT, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const n = entry.name;
    if (n === 'node_modules' || n.startsWith('.') || n === 'test-results') continue;
    const full = path.join(dir, n);
    if (entry.isDirectory()) specFiles(full, acc);
        // .guard.ts counts. personas-roles.config.ts legitimately matches
    // tests/rbac/role-identity.guard.ts, and omitting the extension made PF-3
    // report a dangling testMatch against a file that is right there.
    else if (n.endsWith('.spec.ts') || n.endsWith('.setup.ts') || n.endsWith('.guard.ts'))
      acc.push(path.relative(ROOT, full));
  }
  return acc;
}

/**
 * Pull the regex BODY out of each testMatch. Hand-scanned rather than
 * regex-matched: the bodies are themselves full of escapes, and a regex that
 * parses regexes is how you get a preflight that needs its own preflight.
 */
function testMatches(src: string): string[] {
  const KEY = 'testMatch:';
  const out: string[] = [];
  let i = src.indexOf(KEY);
  while (i !== -1) {
    let j = i + KEY.length;
    while (j < src.length && /[ `tnr]/.test(src[j])) j++;
    if (src[j] === '/') {
      j++;
      let body = '';
      let escaped = false;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (escaped) { body += ch; escaped = false; continue; }
        if (ch === String.fromCharCode(92)) { body += ch; escaped = true; continue; }
        if (ch === '/') break;
        body += ch;
      }
      if (body) out.push(body);
    }
    i = src.indexOf(KEY, j);
  }
  return out;
}

/**
 * The host a file will ACTUALLY drive: the first http host on a non-comment
 * line that also assigns BASE or baseURL.
 *
 * Scanning the whole file was wrong. qc-dashboard.spec.ts documents its capture
 * instance (pngdemo) in its header comment while driving whatever baseURL the
 * config supplies, so a naive first-host-in-file scan reported four QC suites as
 * cross-instance when they are fine. Comments are documentation, not behaviour.
 */
function hostOf(src: string): string {
  for (const raw of normalise(src).split(NEWLINE)) {
    if (!raw.includes('://')) continue;
    if (!raw.includes('BASE') && !raw.includes('baseURL')) continue;
    const at = raw.indexOf('://');
    let host = '';
    for (let k = at + 3; k < raw.length; k++) {
      const ch = raw[k];
      if (ch === '/' || ch === String.fromCharCode(34) || ch === String.fromCharCode(39)
          || ch === String.fromCharCode(96) || ch === ' ') break;
      host += ch;
    }
    if (host) return host;
  }
  return '';
}

const compile = (body: string): RegExp | null => {
  try { return new RegExp(body); } catch { return null; }
};

/**
 * Strip comments, then flatten BOTH ways this repo escapes a dot inside a
 * testMatch regex -- [.] and backslash-dot. Both spellings are in the tree, and
 * a detector that knows only one reports every correct config as broken: the
 * first cut of PF-1 accused 17 configs, every one of them fine.
 *
 * The comment strip matters too. preflight.config.ts says NO storageState in
 * prose, and a bare includes() counted that as an offence.
 */
function normalise(src: string): string {
  const noComments = src
    .split(NEWLINE)
    .map((line) => {
      const t = line.trimStart();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : line;
    })
    .join(NEWLINE);
  return noComments
    .split('[.]').join('.')
    .split(String.fromCharCode(92) + '.').join('.');
}

test('PF-1: every config that sets storageState also depends on a setup project', () => {
  const offenders: string[] = [];
  for (const cfg of configFiles()) {
    const flat = normalise(read(cfg));
    if (!flat.includes('storageState:')) continue;
    const declaresSetup = flat.includes('.setup.ts');
    const dependsOnSetup = flat.includes('dependencies') && flat.includes('setup');
    if (!declaresSetup || !dependsOnSetup) {
      const why = !declaresSetup ? 'declares no setup project' : 'nothing depends on the setup project';
      offenders.push(cfg + ' sets storageState but ' + why);
    }
  }
  expect(
    offenders,
    'a stale cookie answers HTTP 200 with the login page; these configs cannot tell:' + NEWLINE + offenders.join(NEWLINE),
  ).toEqual([]);
});

test('PF-2: no config runs a spec whose default BASE is a different host', () => {
  const specs = specFiles();
  const mismatches = new Set<string>();

  for (const cfg of configFiles()) {
    const src = read(cfg);
    const cfgHost = hostOf(src);
    if (!cfgHost) continue;
    for (const body of testMatches(src)) {
      const re = compile(body);
      if (!re) continue;
      for (const spec of specs.filter((s) => re.test(s))) {
        const specHost = hostOf(read(spec));
        if (specHost && specHost !== cfgHost) {
          mismatches.add(cfg + ' (' + cfgHost + ') runs ' + spec + ' (defaults to ' + specHost + ')');
        }
      }
    }
  }

  const list = [...mismatches];
  expect(
    list,
    'a spec driven against one host with another host cookies never authenticates:' + NEWLINE + list.join(NEWLINE),
  ).toEqual([]);
});

test('PF-3: every testMatch resolves to at least one file on disk', () => {
  const specs = specFiles();
  const dangling: string[] = [];

  for (const cfg of configFiles()) {
    for (const body of testMatches(read(cfg))) {
      const re = compile(body);
      if (!re) { dangling.push(cfg + ' :: not a valid regex: ' + body); continue; }
      if (!specs.some((s) => re.test(s))) dangling.push(cfg + ' :: matches no file: ' + body);
    }
  }

  expect(
    dangling,
    'a config matching nothing runs zero tests and exits 0 -- a green run that tested nothing:' + NEWLINE + dangling.join(NEWLINE),
  ).toEqual([]);
});

test('PF-4: report specs no config will ever run', () => {
  const specs = specFiles().filter((s) => s.endsWith('.spec.ts'));
  const covered = new Set<string>();

  for (const cfg of configFiles()) {
    for (const body of testMatches(read(cfg))) {
      const re = compile(body);
      if (!re) continue;
      specs.filter((s) => re.test(s)).forEach((s) => covered.add(s));
    }
  }

  const orphans = specs.filter((s) => !covered.has(s));
  // INFORMATIONAL ONLY. Many specs are run ad hoc by path, and failing the
  // preflight over them would only train people to ignore it.
  console.log('PF-4: ' + orphans.length + ' of ' + specs.length + ' specs are matched by no config');
  orphans.slice(0, 40).forEach((o) => console.log('  orphan: ' + o));
  expect(specs.length, 'the tree must contain specs at all').toBeGreaterThan(0);
});
