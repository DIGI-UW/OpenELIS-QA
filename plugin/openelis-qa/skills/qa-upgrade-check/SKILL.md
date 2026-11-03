---
name: qa-upgrade-check
description: >
  This skill should be used when Casey asks "does it upgrade cleanly?", "upgrade check",
  "test the upgrade from 3.2.x", "will the migrations run on a real site", or before a release
  when new Liquibase changesets, configuration loaders or data migrations have landed. It
  upgrades a copy of real QA data through each version and proves nothing was lost or changed
  that should not have been.
metadata:
  version: "0.1.0"
---

# Upgrade check

Runs on Casey's Mac (needs container images). Follow `qa-run` standing rules and
`qa-run/references/where-to-run.md` for the connector patterns.

## Plan

1. **Pick the path.** Oldest supported data first, each released tag in order, then the target:
   for example 3.2.2.0 data, then tag 3.2.3.0, then develop. Each phase gets its own compose
   project name, port and subnet (e.g. `oe323upg`, 11443, `172.25.1.0/24`) so it never touches
   `oedevqa`.
2. **Copy the data.** Stop the source stack, copy its database volume into a new external volume,
   and work on the copy. Take a `pg_dump` of the copy before phase 1.
3. **Worktrees.** One OpenELIS-Global-2 worktree per phase at the tag or commit, so every
   configuration loader of that version runs. Pull the matching images.
4. **Scripts in one folder** (`scratch/upg<MMDD>/` in the OpenELIS QA folder): prep, compose
   generation, phase runner, snapshot SQL, Playwright runner. Launch with `nohup` and poll.

## Measure at every phase

- **Fingerprint:** counts of patients, samples, analyses with results, users, organizations,
  tests, panels, sample types, dictionary entries. Data must be identical across phases except
  rows the new version is meant to add (name them).
- **Liquibase:** changeset count and status per phase (EXECUTED, MARK_RAN, failures). A changeset
  that should have run but is MARK_RAN needs a reason.
- **Boot:** time to healthy, and every ERROR in the webapp log (FHIR connection errors are
  expected when the FHIR container is left out; say so).
- **Loaders:** for each ticket the release touches (configuration CSVs, roles, dictionaries,
  observation types), what loaded and what was refused, from the log and the tables.
- **Behaviour changes:** any setting the upgrade forces (for example `resultsEntryUnifiedRoute`
  forced to true). These go into the release and upgrade notes; Casey OKs them.

## Then test the upgraded copy

1. Run the module suite and chains on the upgraded stack.
2. Run the same suites on an ordinary develop stack at the same commit.
3. Compare per test id (`scripts/ci-known-reds.mjs` can seed one run as known and check the
   other). Only the failures unique to the upgraded copy matter. Explain each one: thin old
   data, slow sweeps, a container left out, specs out of date, or an upgrade defect.

## Also check

- New changesets in open stacks (analyser, AMR) against each other: ids, file names and
  `base.xml` textual conflicts.
- Upgrade notes in `docs/upgrades/` exist for every behaviour a site will notice.

## Report

Path taken, fingerprints table, Liquibase counts, boot times, loader results per ticket, the
suite delta with every unique failure explained, upgrade-note gaps, and the limitation that a
small QA database is weaker evidence than a real site backup. Stop the upgrade stack afterwards,
keep the volume, and list what was left on the Mac.
