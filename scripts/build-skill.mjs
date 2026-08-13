#!/usr/bin/env node
/**
 * Build (or verify) the installable `openelis-test-catalog-qa.skill` package.
 *
 * WHY THIS EXISTS
 * The `.skill` file is a build artifact committed to the repo — it is what gets
 * installed into a Claude account, and it is NOT read from source at install time.
 * Twice on 2026-08-12 a PR edited `SKILL.md` / `references/` and the packaged copy
 * silently kept the old content, so the installed skill lagged the repo. `--check`
 * makes that state impossible to merge.
 *
 * USAGE
 *   node scripts/build-skill.mjs           # rebuild the package
 *   node scripts/build-skill.mjs --check   # verify the committed package matches source; exit 1 if not
 *
 * HOW --check WORKS
 * It compares CONTENT, not bytes: sha256 of every source file vs sha256 of the
 * corresponding entry inside the committed zip. Zip byte-determinism (mtimes,
 * ordering, compression level) is deliberately not relied on — that path is
 * brittle across zip implementations and would produce false failures.
 *
 * Requires `zip` and `unzip` on PATH (present on macOS and ubuntu-latest runners).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'openelis-test-catalog-qa';
const PKG = join(REPO, `${SKILL_NAME}.skill`);

/** Files that ship inside the package, as paths relative to the repo root. */
function sourceFiles() {
  const refs = readdirSync(join(REPO, 'references'))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => `references/${f}`);
  return ['SKILL.md', 'CHANGELOG.md', ...refs];
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function build() {
  const files = sourceFiles();
  const stage = mkdtempSync(join(tmpdir(), 'skillpkg-'));
  const root = join(stage, SKILL_NAME);
  mkdirSync(join(root, 'references'), { recursive: true });

  for (const rel of files) copyFileSync(join(REPO, rel), join(root, rel));

  rmSync(PKG, { force: true });
  execFileSync('zip', ['-q', '-r', '-X', PKG, SKILL_NAME], { cwd: stage });
  rmSync(stage, { recursive: true, force: true });

  const bytes = readFileSync(PKG).length;
  console.log(`built ${SKILL_NAME}.skill — ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
  for (const f of files) console.log(`  + ${f}`);
}

function check() {
  if (!existsSync(PKG)) {
    console.error(`MISSING: ${SKILL_NAME}.skill is not committed. Run: npm run build:skill`);
    process.exit(1);
  }

  // What the committed package actually contains.
  const listing = execFileSync('unzip', ['-Z1', PKG], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith('/'));

  const packaged = new Map();
  for (const entry of listing) {
    const rel = entry.replace(new RegExp(`^${SKILL_NAME}/`), '');
    const buf = execFileSync('unzip', ['-p', PKG, entry], { maxBuffer: 64 * 1024 * 1024 });
    packaged.set(rel, sha(buf));
  }

  const files = sourceFiles();
  const problems = [];

  for (const rel of files) {
    const want = sha(readFileSync(join(REPO, rel)));
    const got = packaged.get(rel);
    if (!got) problems.push(`missing from package: ${rel}`);
    else if (got !== want) problems.push(`stale in package:    ${rel}`);
  }
  for (const rel of packaged.keys()) {
    if (!files.includes(rel)) problems.push(`orphan in package:   ${rel} (deleted from source?)`);
  }

  if (problems.length) {
    console.error(`\n${SKILL_NAME}.skill is out of date with its source:\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nFix: npm run build:skill && git add ${SKILL_NAME}.skill\n`);
    console.error('The .skill file is what actually gets installed — if it lags, the');
    console.error('installed skill silently runs the old instructions.\n');
    process.exit(1);
  }

  console.log(`${SKILL_NAME}.skill is in sync with source (${files.length} files).`);
}

process.argv.includes('--check') ? check() : build();
