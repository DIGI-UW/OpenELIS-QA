/**
 * Build-aware skips: "this case needs commit X, and the server under test does not have it yet".
 *
 * WHY (2026-11-17). testing deploys develop with a lag (a failed checkpoint holds a deploy back), so
 * a guard written against develop can be red on testing for a day with nothing wrong: TC-1364-03
 * and 07 failed on testing 0937523e6 only because the strings they read arrived in 9723c2517
 * (#5096). A red that is really "not deployed yet" teaches people to ignore reds.
 *
 * requiresCommit(sha, why) skips the case, with the reason in the report, when the build under test
 * is known NOT to contain `sha`. When nothing can tell (no build info), the case runs: a skip must
 * be earned, not assumed. What the build is:
 *   OE_BUILD_INCLUDES_DEVELOP=1  the stack is develop HEAD (develop-stack CI): everything merged is in.
 *   DEPLOYED_SHA=<sha>           the commit the server runs (set it when you know it).
 *   otherwise, for testing.openelis-global.org, the last successful testing deploy on GitHub.
 * Whether the build contains `sha`: git merge-base in OE_REPO (a local OpenELIS-Global-2 clone),
 * else the GitHub compare API.
 */
import { test } from '@playwright/test';
import { execFileSync } from 'child_process';

const GH = 'https://api.github.com/repos/DIGI-UW/OpenELIS-Global-2';
const DEPLOY_WORKFLOW = 254155265; // "Publish images / Deploy testing"
const cache = new Map<string, boolean | null>();
let deployed: string | null | undefined;

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function deployedCommit(): Promise<string | null> {
  if (deployed !== undefined) return deployed;
  deployed = process.env.DEPLOYED_SHA || null;
  const base = process.env.BASE_URL || process.env.BASE || '';
  if (!deployed && /testing\.openelis-global\.org/.test(base || 'testing.openelis-global.org')) {
    const runs = await getJson(`${GH}/actions/workflows/${DEPLOY_WORKFLOW}/runs?status=success&per_page=1`);
    deployed = runs?.workflow_runs?.[0]?.head_sha ?? null;
  }
  return deployed ?? null;
}

/** true / false when known, null when nothing can tell. */
export async function buildIncludes(sha: string): Promise<boolean | null> {
  if (process.env.OE_BUILD_INCLUDES_DEVELOP === '1') return true;
  if (cache.has(sha)) return cache.get(sha)!;
  const head = await deployedCommit();
  let answer: boolean | null = null;
  if (head) {
    if (process.env.OE_REPO) {
      try {
        execFileSync('git', ['-C', process.env.OE_REPO, 'merge-base', '--is-ancestor', sha, head], { stdio: 'ignore' });
        answer = true;
      } catch (e: any) {
        answer = e?.status === 1 ? false : null; // 1 = not an ancestor; anything else = unknown commit
      }
    }
    if (answer === null) {
      const cmp = await getJson(`${GH}/compare/${sha}...${head}`);
      if (cmp?.status) answer = cmp.status === 'ahead' || cmp.status === 'identical';
    }
  }
  cache.set(sha, answer);
  return answer;
}

/** Skip this case, saying why, when the server's build is known not to contain `sha`. */
export async function requiresCommit(sha: string, why: string): Promise<void> {
  const has = await buildIncludes(sha);
  const head = await deployedCommit();
  test.skip(has === false, `needs ${sha.slice(0, 9)} (${why}); the server runs ${head?.slice(0, 9)}, which does not have it yet`);
  if (has === null) test.info().annotations.push({ type: 'build-unknown', description: `could not tell whether the build has ${sha.slice(0, 9)}; ran anyway` });
}
