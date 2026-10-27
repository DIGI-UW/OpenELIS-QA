#!/usr/bin/env node
// Known reds: make a develop-stack verdict mean "something NEW broke".
//
// WHY THIS EXISTS (2026-10-15, Casey: "schedule the full run once a week")
// develop-stack ran every suite on every develop change and was red on every run, because
// the verdict failed on ANY failure and about 200 of ~2,000 tests fail for reasons already
// known and ticketed. A check that is always red carries no more signal than one that is
// always green: nobody could tell a regression from the standing list. This script splits
// each run's failures into KNOWN (listed in ci-known-reds.json, each with a ticket or a
// reason) and NEW. Verdict fails on NEW only. A known red that passes is reported as FIXED,
// so the list shrinks instead of hiding fixes.
//
// Same idea as .assert-baseline.json and .falsifiable-baseline.json: a ratchet, not a mute.
//
// Modes
//   check  --out out [--baseline ci-known-reds.json]
//          Reads out/<suite>.json (Playwright JSON reporter, one per config) and writes
//          out/reds.json. Prints one line per suite. Always exits 0: Verdict decides.
//   report --shards <dir> --out <dir> --run-url <url> --sha <sha> --subject <text>
//          Merges every shard's reds.json (and its summary counts) into latest.json and
//          latest.md for the ci-reports branch. Exits 0 with no output when no shard ran
//          (develop had not moved). A run whose shards reported but ran no suite (the
//          stack never came up) is reported as NO RESULTS, never as "no new failures".
//   seed   --from <dir-with-reds.json-files> [--baseline ci-known-reds.json] [--note <text>]
//          Adds every NEW red found under <dir> to the baseline as ticket "untriaged".
//          For bootstrapping and for accepting a triaged batch; never run by CI.
//
// Test identity: "<config>|<project>|<file>|<describe > ... > title>". Line numbers are
// left out on purpose, so editing a spec above a test does not turn a known red into a
// new one.

import fs from 'node:fs';
import path from 'node:path';

const [mode, ...rest] = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = rest.indexOf(name);
  return i >= 0 && i + 1 < rest.length ? rest[i + 1] : dflt;
};

function loadBaseline(p) {
  if (!fs.existsSync(p)) return { bootstrap: true, reds: {} };
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { bootstrap: !!b.bootstrap, reds: b.reds || {}, raw: b };
}

// Walk a Playwright JSON report and yield { id, status } per test (per project).
function* testsOf(report, config) {
  function* walk(suite, titles, file) {
    const f = suite.file || file;
    // The top-level suite per file has title == file path; describe blocks add titles.
    const here = suite.title && suite.title !== f && suite.title !== path.basename(f || '')
      ? [...titles, suite.title]
      : titles;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const id = [config, t.projectName || '', spec.file || f || '', [...here, spec.title].join(' > ')].join('|');
        yield { id, status: t.status };
      }
    }
    for (const s of suite.suites || []) yield* walk(s, here, f);
  }
  for (const s of report.suites || []) yield* walk(s, [], s.file);
}

function check() {
  const out = arg('--out', 'out');
  const base = loadBaseline(arg('--baseline', 'ci-known-reds.json'));
  const suites = {};
  const files = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.json') && f !== 'reds.json') : [];
  for (const f of files) {
    const config = f.replace(/\.json$/, '');
    let report;
    try {
      report = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
    } catch (e) {
      suites[config] = { error: `unreadable JSON report: ${e.message}` };
      continue;
    }
    const s = { failing: [], newReds: [], known: [], fixed: [], counts: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 } };
    for (const { id, status } of testsOf(report, config)) {
      s.counts[status] = (s.counts[status] || 0) + 1;
      const isKnown = Object.prototype.hasOwnProperty.call(base.reds, id);
      if (status === 'unexpected') {
        s.failing.push(id);
        (isKnown ? s.known : s.newReds).push(id);
      } else if (status === 'expected' && isKnown) {
        s.fixed.push(id);
      }
    }
    suites[config] = s;
    console.log(`${config}: ${s.counts.unexpected} failing = ${s.known.length} known + ${s.newReds.length} NEW; ${s.fixed.length} known reds now pass`);
  }
  fs.writeFileSync(path.join(out, 'reds.json'), JSON.stringify({ bootstrap: base.bootstrap, suites }, null, 1));
}

function findReds(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'reds.json') found.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
}

function report() {
  const shards = findReds(arg('--shards', 'shards'));
  if (!shards.length) {
    console.log('no shard produced reds.json (develop had not moved); nothing to report');
    return;
  }
  const out = arg('--out', 'report');
  fs.mkdirSync(out, { recursive: true });
  const base = loadBaseline(arg('--baseline', 'ci-known-reds.json'));
  const merged = {};
  let bootstrap = false;
  for (const p of shards) {
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    bootstrap = bootstrap || r.bootstrap;
    Object.assign(merged, r.suites);
  }
  // NO RESULTS (2026-10-26). Runs 207 to 214 (25 to 26 Oct) had a shard reds.json with no
  // suite in it, because the stack never came up, and this report called each of them
  // "NO NEW FAILURES". Zero suites is the absence of a verdict, not a green one.
  const noResults = Object.keys(merged).length === 0;
  const all = (k) => Object.values(merged).flatMap((s) => s[k] || []);
  const byTicket = {};
  for (const id of all('known')) {
    const t = base.reds[id]?.ticket || 'untriaged';
    byTicket[t] = (byTicket[t] || 0) + 1;
  }
  const doc = {
    when: new Date().toISOString(),
    sha: arg('--sha', ''),
    subject: arg('--subject', ''),
    runUrl: arg('--run-url', ''),
    tz: process.env.TZ || 'UTC',
    bootstrap,
    noResults,
    totals: {
      failing: all('failing').length,
      known: all('known').length,
      new: all('newReds').length,
      fixed: all('fixed').length,
    },
    knownByTicket: byTicket,
    suites: Object.fromEntries(Object.entries(merged).map(([k, s]) => [k, s.error ? { error: s.error } : { counts: s.counts, new: s.newReds, fixed: s.fixed, known: s.known.length }])),
  };
  fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(doc, null, 1));

  const L = [];
  L.push(`# develop-stack: develop \`${doc.sha.slice(0, 8)}\``);
  L.push('');
  L.push(`${doc.subject}`);
  L.push('');
  L.push(`Run: ${doc.runUrl} · TZ ${doc.tz} · ${doc.when}`);
  L.push('');
  if (noResults) {
    L.push('**NO RESULTS**: no suite ran, so nothing passed or failed. The stack most likely did not come up; read the "Wait for the stack to be healthy" step of the run above. This is not a green run.');
    L.push('');
  }
  const verdict = noResults ? 'NO RESULTS' : doc.totals.new === 0 ? 'NO NEW FAILURES' : `${doc.totals.new} NEW FAILURE(S)`;
  if (!noResults) L.push(`**${verdict}**: ${doc.totals.failing} failing = ${doc.totals.known} known + ${doc.totals.new} new; ${doc.totals.fixed} known reds now pass.${bootstrap ? ' (Baseline is in bootstrap mode: new failures are reported, not gated.)' : ''}`);
  L.push('');
  L.push('| suite | passed | failing | new | known reds now passing |');
  L.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [k, s] of Object.entries(doc.suites).sort()) {
    if (s.error) { L.push(`| ${k} | ? | ? | ? | ${s.error} |`); continue; }
    L.push(`| ${k} | ${s.counts.expected || 0} | ${s.counts.unexpected || 0} | ${s.new.length} | ${s.fixed.length} |`);
  }
  const list = (title, ids) => {
    if (!ids.length) return;
    L.push('', `## ${title} (${ids.length})`, '');
    for (const id of ids.slice(0, 200)) L.push(`- \`${id}\``);
    if (ids.length > 200) L.push(`- ... and ${ids.length - 200} more in latest.json`);
  };
  list('New failures', all('newReds'));
  list('Known reds now passing (remove from ci-known-reds.json, check the ticket)', all('fixed'));
  L.push('', '## Known reds by ticket', '');
  for (const [t, n] of Object.entries(byTicket).sort((a, b) => b[1] - a[1])) L.push(`- ${t}: ${n}`);
  fs.writeFileSync(path.join(out, 'latest.md'), L.join('\n') + '\n');
  console.log(L.slice(0, 8).join('\n'));
}

function seed() {
  const bpath = arg('--baseline', 'ci-known-reds.json');
  const b = fs.existsSync(bpath) ? JSON.parse(fs.readFileSync(bpath, 'utf8')) : { bootstrap: true, reds: {} };
  b.reds = b.reds || {};
  const note = arg('--note', 'seeded from a develop-stack run; not yet triaged');
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const p of findReds(arg('--from', 'shards'))) {
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const s of Object.values(r.suites || {})) {
      for (const id of s.newReds || []) {
        if (!b.reds[id]) { b.reds[id] = { ticket: 'untriaged', note, since: today }; added++; }
      }
    }
  }
  b.reds = Object.fromEntries(Object.entries(b.reds).sort(([a], [c]) => a.localeCompare(c)));
  fs.writeFileSync(bpath, JSON.stringify(b, null, 1) + '\n');
  console.log(`added ${added}; baseline now holds ${Object.keys(b.reds).length}`);
}

({ check, report, seed }[mode] || (() => {
  console.error('usage: ci-known-reds.mjs check|report|seed ...');
  process.exit(2);
}))();
