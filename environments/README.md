# Target environments

Which instance a run points at is not a detail — it decides what the result
means. This directory exists because that was learned the hard way.

## The problem this solves

Until 2026-09-10 every run of this suite targeted one of two things:

* `https://testing.openelis-global.org` (the nightly default), or
* a local stack pinned to release tag **3.2.2.0**, images built 2026-08-18.

Neither is `develop`. So when clients reported bugs on the develop branch, the
suite was **structurally incapable of seeing them** — it had never once run
against that code. Worse, it produced confident false negatives: the ward
field (`referringSiteDepartment`) reads as missing on 3.2.2.0 and is present on
develop, so a 3.2.2.0-only run reports a fixed defect as live.

Running both is what makes a failure attributable:

| develop | 3.2.2.0 | Reading |
| --- | --- | --- |
| red | green | a new regression on develop |
| red | red | an older bug the suite had not covered |
| green | red | fixed on develop; stop re-reporting it |

## Standing up the develop stack

```
cd environments/develop-local
docker compose -p oedevqa -f docker-compose.develop.yml pull
docker compose -p oedevqa -f docker-compose.develop.yml up -d
```

Reach it at **https://localhost:10443** (the nginx proxy). *Not* 19443, which
is Tomcat direct and serves the legacy JSP app rather than the React front end.

A cold first boot reseeds the whole config catalog — measured at roughly 14
minutes on an M-series Mac — which is why the webapp healthcheck carries a 900s
`start_period`. `docker compose ... ps` shows `health: starting` until it is
done; the suite will fail to authenticate before then.

The compose file mounts `./volume/...` paths from an OpenELIS-Global-2 checkout
at the same commit. Clone one next to it:

```
git clone --depth 1 --branch develop \
  https://github.com/DIGI-UW/OpenELIS-Global-2.git oe-develop-qa
mkdir -p oe-develop-qa/volume/plugins oe-develop-qa/volume/lucene
```

Those two directories are not in the repo and the compose file will fail
without them.

### Running alongside other stacks

Every port, container name, network subnet and volume is moved so this runs
beside an existing 3.2.2.0 or demo stack without touching either. The named
volumes are project-scoped, which is what keeps another stack's database
intact — so **always pass `-p oedevqa`**.

| Stack | proxy | webapp | fhir | db | subnet |
| --- | --- | --- | --- | --- | --- |
| distro / demo | 80, 443 | 8080, 8443 | 8081, 8444 | 15432 | 172.20.1.0/24 |
| 3.2.2.0 | 9080, 9443 | 18080, 18443 | 18081, 18444 | 15433 | 172.21.1.0/24 |
| **develop** | **10080, 10443** | 19080, 19443 | 19081, 19444 | 15434 | 172.22.1.0/24 |

## Pointing the suite at a target

Both `BASE` and `BASE_URL` must be set; different configs read different ones.

```
BASE=https://localhost:10443 BASE_URL=https://localhost:10443 \
  npx playwright test -c all-tc.config.ts --project=setup
```

`scripts/run-against.sh` wraps this — see `--help`.

**Auth state is per-origin and shared.** `.auth/user.json` is written by the
`setup` project and points at whichever target it last ran against. Switching
targets means re-running `setup` first, or every request lands unauthenticated
against the new host. The runner script does this for you.

## `:develop` is a moving tag

It is rebuilt continuously, so a result is only reproducible if the digest is
recorded with it. Capture it alongside any finding:

```
docker inspect openelisglobal-webapp-dev \
  --format '{{index .RepoDigests 0}}'
```

## How develop gets tested in CI

`.github/workflows/develop-stack.yml` brings the stack up **inside a
GitHub-hosted runner**, runs the suite against it, and throws it away with the
job.

The obvious alternative — a self-hosted runner on a machine that already has
the stack — was rejected on purpose. This repository is **public**, and on a
public repo a self-hosted runner lets fork pull requests execute code on that
machine; runners are not ephemeral by default, so one bad job can leave things
behind for the next. Requiring approval for outside collaborators reduces that
but does not remove it, because approval is one human click.

Building the stack in the job avoids the question entirely, and it fits:

| | needs | runner has |
| --- | --- | --- |
| images (5) | ~4.5 GB | 14 GB disk |
| running stack | ~3.4 GB RAM | 16 GB |
| cold boot + suite | ~30–45 min | 6 h job limit |

Standard runners are free for public repositories, so the cost is zero.

### When it runs

It polls every three hours and **skips immediately unless develop's HEAD has
moved** — the last-tested SHA is kept in the Actions cache, so a run only
happens when there is actually new code. That approximates "on every merge to
develop" without needing a cross-repo token in the application repo.

To change the cadence, change the cron. For "roughly every tenth merge",
widen it (`0 6 * * *` is daily); the skip logic does the rest.

Run it by hand from the Actions tab — `force: true` re-runs even when develop
has not moved, and `suite` selects core, chains, or both.

### Running the same thing locally

`scripts/run-against.sh` points any config at any target and re-authenticates
first, which is the step people forget:

```
./scripts/run-against.sh develop -c modules.config.ts tests/aliquot.spec.ts
./scripts/run-against.sh 3220    -c modules.config.ts tests/aliquot.spec.ts
```

Auth state (`.auth/user.json`) is per-origin and shared across configs, so
switching targets without re-running `setup` sends every request
unauthenticated to the new host — which reads as a broken product rather than
a stale cookie. The script always re-runs setup.

### Configs do not all collect the same files

`all-tc.config.ts` uses `testDir: '.'` with per-project `testMatch` regexes, so
passing it a spec path only runs that file **if the path also matches a
project**. `tests/aliquot.spec.ts` matches nothing there and is silently
collected as zero tests — no error, just a smaller run than you asked for.
`modules.config.ts` collects `tests/*.spec.ts`; `all-tc.config.ts` collects the
`test-catalog-*` and `results-*` families. Check with `--list` before trusting
a targeted run.

Note also that `testing.openelis-global.org` is not develop either: it reports
version 3.2.2.0 while serving a newer bundle than a released 3.2.2.0. **Version
strings are not a reliable way to tell these builds apart** — compare bundles
or digests.
