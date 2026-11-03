# Where to run

Three places can run QA work. Pick per step, not per session, and say which one produced each
result.

| Need | Cloud sandbox | Casey's Mac | Claude in Chrome |
|---|---|---|---|
| API probes against `*.openelis-global.org` | yes (default) | yes | via `javascript_tool` |
| Playwright suites against a remote server | yes, system Chrome | yes | no |
| UI clickthrough that confirms a finding | headless only | headless only | **yes** |
| Local stack from CI images, upgrade check, unmerged PR stack | no (no image registry) | **yes** | no |
| `gh` (PRs, reviews, merges, Actions artifacts) | no (GraphQL refused) | **yes** | no |
| `git clone` / `git push` | clone yes; push only if the repo is attached with push access | yes | no |
| Real analyzer (GeneXpert, ASTM, port 12000) | no | **yes** | no |

## Cloud sandbox (verified 3 Nov 2026)

- Reaches `*.openelis-global.org` (org allowlist), GitHub over git, and npm. The Playwright browser
  CDN is blocked: use the system Chrome.

  ```ts
  // local config, not committed
  use: { launchOptions: { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } }
  ```

- Clone the QA repo, `npm install`, then run suites with `BASE_URL=https://testing.openelis-global.org`.
- To run the dev team's own specs (`frontend/playwright` in OpenELIS-Global-2) against a remote
  host: symlink the QA repo's `node_modules` into `frontend/`, pass `BASE_URL` and a
  `storageState` from the QA auth setup, and set the order fixtures for that server
  (`seed-tat-data.ts` defaults to CI ids 9000002 and 9000100, which remote servers lack). Keep
  that patch local.
- No Docker Hub, GHCR, GCR or ECR: local stacks need the Mac.

## Casey's Mac (Control your Mac, osascript)

- `node` and `npx` are nvm-managed and not on the plain shell PATH. Start each command with
  `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"` (check the version with
  `ls ~/.nvm/versions/node`).
- Any call that blocks longer than about 25 seconds can hang the connector. Launch long work with
  `nohup bash script.sh > /tmp/x.log 2>&1 & echo $! > /tmp/x.pid; echo launched`, then poll with
  separate short calls (`tail -c 2000 /tmp/x.log`) about 25 seconds apart. Never put `sleep` and
  `tail` in one call. Write a `.done` sentinel at the end of the script.
- If the connector stops answering even `echo alive`, Casey needs to quit and reopen the Claude
  desktop app. Retrying the same call does not recover it.
- **Moving files to the Mac:** write them into the connected "OpenELIS QA" folder (the device
  shell mounts it under `$HOME/mnt/OpenELIS QA`; on the Mac it is `~/Documents/OpenELIS QA`), then
  use them from osascript. Keep each session's files in `scratch/<topic><MMDD>/`, not the folder
  root. Fall back to gzipped base64 in about 9,000-character chunks, checking MD5 on both sides,
  only when the folder is not connected.
- **gh:** create PRs, comment, review and merge with `gh` from a worktree, with bodies from a file
  (`--body-file`). Commit messages with `-F <file>`; AppleScript quoting breaks inline heredocs.
  Commit without `-c user.email` (Casey's global config uses the GitHub noreply address).
  Merge with `gh pr merge <n> --squash --match-head-commit <full sha>` (a short sha is refused).
  Before merging a PR that another PR is stacked on, retarget the stacked PR to `main`:
  `--delete-branch` on the base closes the stacked PR.
- Worktrees: one per session, e.g. `~/dev/OpenELIS-QA-<topic><MMDD>`, with `node_modules`
  symlinked from a worktree that has `@axe-core/playwright` and `pdfjs-dist`. Several sessions
  share the Mac; never work in another session's worktree.
- OpenELIS source for code-level causes: `~/dev/oe-develop-qa` (`git fetch origin`, then
  `git show <deployed-sha>:<path>`).
- Local stacks: `oedevqa` at `https://localhost:10443` (develop images); upgrade stacks on their
  own project name, port and subnet (e.g. `oe323upg`, 11443). Take a `pg_dump` before refreshing
  images. A webapp restart logs every user out: ask first if Casey is using it.
- Kill orphan `chrome-headless-shell` processes after killing a run.

## Claude in Chrome

- Casey's real Chrome with his sign-ins. Never type a password; ask him to log in.
- Foreground tabs only: background tabs throttle timers, so a repro there does not count.
- Do not trigger alerts or confirm dialogs; they freeze the extension.
- Sanitize what `javascript_tool` returns (it blocks results that look like cookies or query
  strings; return counts and short strings).
- Hook `fetch` to capture the server's error body behind a generic UI error.

## Simulating external systems

For FHIR referral and shipment flows, run a plain HAPI server on the docker network as the
"external lab" (`scripts/fhir-sim/`). Back up any config you change, document it, restore it.
