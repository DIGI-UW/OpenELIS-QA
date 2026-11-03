#!/usr/bin/env node
/**
 * Build (or check) the openelis-qa plugin in plugin/openelis-qa/.
 *
 * WHY THIS EXISTS
 * The QA skill used to live in three places (the installed copy, this repo's SKILL.md and a copy
 * in Casey's QA folder) and they drifted apart: the installed skill had rules the repo lacked and
 * the repo had files the installed skill lacked, and its tracker steps named tools that do not
 * exist. This folder is now the only source. The check makes drift and a broken plugin
 * impossible to merge.
 *
 * USAGE
 *   node scripts/build-plugin.mjs           # sync RULINGS.md into the plugin, validate, test hooks,
 *                                           # write dist/openelis-qa.plugin
 *   node scripts/build-plugin.mjs --check   # validate only; exit 1 on any problem (CI)
 *
 * CHECKS
 *   - skills/qa-run/references/rulings.md is byte-identical to RULINGS.md at the repo root
 *   - .claude-plugin/plugin.json parses, name is kebab-case, version is semver
 *   - every skills/<dir>/SKILL.md has frontmatter name == <dir> and a description
 *   - every agents/*.md has name, description, model and color
 *   - hooks/hooks.json parses and every script it runs exists
 *   - no em dash anywhere in the plugin or RULINGS.md (organization writing rule)
 *   - every relative `references/<file>` a SKILL.md names exists
 *   - the hook self-test passes (skipped with a warning when python3 is missing)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(REPO, 'plugin', 'openelis-qa');
const RULINGS_SRC = join(REPO, 'RULINGS.md');
const RULINGS_COPY = join(PLUGIN, 'skills', 'qa-run', 'references', 'rulings.md');
const DIST = join(REPO, 'dist');
const CHECK = process.argv.includes('--check');
const problems = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '__pycache__' || name === '.DS_Store') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      fm[key] = kv[2].replace(/^["']|["']$/g, '').trim();
    } else if (key && line.trim() && !line.startsWith('  ') && !line.startsWith('<')) {
      key = null;
    } else if (key && line.startsWith('  ')) {
      fm[key] = `${fm[key]} ${line.trim()}`.trim();
    }
  }
  return fm;
}

// 1. Rulings copy
const rulings = readFileSync(RULINGS_SRC, 'utf8');
if (!CHECK) writeFileSync(RULINGS_COPY, rulings);
if (!existsSync(RULINGS_COPY) || readFileSync(RULINGS_COPY, 'utf8') !== rulings) {
  problems.push('skills/qa-run/references/rulings.md differs from RULINGS.md (run npm run build:plugin)');
}

// 2. Manifest
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name || '')) problems.push('plugin.json: name is not kebab-case');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) problems.push('plugin.json: version is not semver');
} catch (e) {
  problems.push(`plugin.json: ${e.message}`);
}

// 3. Skills
for (const dir of readdirSync(join(PLUGIN, 'skills')).sort()) {
  const skillMd = join(PLUGIN, 'skills', dir, 'SKILL.md');
  if (!existsSync(skillMd)) { problems.push(`skills/${dir}: no SKILL.md`); continue; }
  const text = readFileSync(skillMd, 'utf8');
  const fm = frontmatter(text);
  if (!fm) { problems.push(`skills/${dir}/SKILL.md: no frontmatter`); continue; }
  if (fm.name !== dir) problems.push(`skills/${dir}/SKILL.md: name "${fm.name}" does not match the folder`);
  if (!fm.description || fm.description.length < 40) problems.push(`skills/${dir}/SKILL.md: description missing or too short`);
  for (const m of text.matchAll(/`references\/([A-Za-z0-9._-]+\.(?:md|json))`/g)) {
    // Paths into the QA repo's own references/ are named as "in the repo"; only check this skill's.
    const local = join(PLUGIN, 'skills', dir, 'references', m[1]);
    const repoRef = join(REPO, 'references', m[1]);
    if (!existsSync(local) && !existsSync(repoRef)) problems.push(`skills/${dir}/SKILL.md names references/${m[1]}, which exists neither in the skill nor in the repo`);
  }
  const words = text.split(/\s+/).length;
  if (words > 4500) problems.push(`skills/${dir}/SKILL.md: ${words} words; move detail into references/`);
}

// 4. Agents
const agentsDir = join(PLUGIN, 'agents');
if (existsSync(agentsDir)) {
  for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(agentsDir, f), 'utf8')) || {};
    for (const k of ['name', 'description', 'model', 'color']) if (!fm[k]) problems.push(`agents/${f}: frontmatter lacks ${k}`);
  }
}

// 5. Hooks
const hooksJson = join(PLUGIN, 'hooks', 'hooks.json');
if (existsSync(hooksJson)) {
  try {
    const hooks = JSON.parse(readFileSync(hooksJson, 'utf8'));
    for (const [event, groups] of Object.entries(hooks.hooks || {})) {
      for (const g of groups) for (const h of g.hooks || []) {
        for (const m of (h.command || '').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g)) {
          if (!existsSync(join(PLUGIN, m[1]))) problems.push(`hooks.json ${event}: ${m[1]} does not exist`);
        }
      }
    }
  } catch (e) {
    problems.push(`hooks.json: ${e.message}`);
  }
}

// 6. No em dashes
for (const f of [RULINGS_SRC, ...walk(PLUGIN)]) {
  if (!/\.(md|json|py|sh|txt)$/.test(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (l.includes('—')) problems.push(`${relative(REPO, f)}:${i + 1}: em dash (org rule: no em dashes)`);
  });
}

// 7. Hook self-test
const py = spawnSync('python3', ['--version']);
if (py.status === 0) {
  const t = spawnSync('python3', [join(PLUGIN, 'hooks', 'scripts', 'test_qa_hooks.py')], { encoding: 'utf8' });
  if (t.status !== 0) problems.push(`hook self-test failed:\n${t.stdout}${t.stderr}`);
} else {
  console.warn('warning: python3 not found; hook self-test skipped');
}

// 8. Evals parse
try {
  const ev = JSON.parse(readFileSync(join(REPO, 'evals', 'evals.json'), 'utf8'));
  if (!Array.isArray(ev.evals) || ev.evals.length === 0) problems.push('evals/evals.json: no evals');
} catch (e) {
  problems.push(`evals/evals.json: ${e.message}`);
}

if (problems.length) {
  console.error(`\nopenelis-qa plugin check failed:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nFix the files under plugin/openelis-qa/ (or RULINGS.md), then npm run build:plugin.\n');
  process.exit(1);
}

const files = walk(PLUGIN);
if (CHECK) {
  console.log(`openelis-qa ${manifest.version}: plugin is valid (${files.length} files, rulings in sync).`);
  process.exit(0);
}

mkdirSync(DIST, { recursive: true });
const out = join(DIST, 'openelis-qa.plugin');
rmSync(out, { force: true });
execFileSync('zip', ['-q', '-r', '-X', out, '.', '-x', '*__pycache__*', '-x', '*.DS_Store'], { cwd: PLUGIN });
console.log(`built dist/openelis-qa.plugin (${manifest.version}, ${files.length} files, ${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
