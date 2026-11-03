---
name: qa-pr-stack
description: >
  This skill should be used when Casey asks QA to look at a stack of open PRs before they merge:
  "review the analyser stack", "were the review comments addressed?", "test Piotr's hardening
  PRs", "can I re-approve?", "build the stack locally", or when a feature branch has no
  deployment. It checks review items against the new heads, builds the stack from CI images,
  tests it, and sets out the product calls the stack needs.
metadata:
  version: "0.1.0"
---

# PR-stack review

## 1. Map the stack

- List the PRs in stack order (base first), each head commit, whether it is behind develop, its
  checks, and its approvals. **Flag approvals given on an older head** (count commits since).
- For a rebased stack, `git range-diff <old-tested-head>...<new-head>` shows whether commits are
  patch-identical; list only the new or changed commits.

## 2. Earlier review items

Table: PR, review item, status at the new head (Addressed, Addressed differently, Not addressed,
Not checked), evidence (file and function, commit). Read the code, not the reply.

## 3. Behaviour changes a site will notice

Table: PR, what changes, who notices, needs Casey's call (yes/no). Typical: permissions a role
loses, formats refused, endpoints removed, limits added. Ask before testing anything whose
intent is unclear; record his calls in `RULINGS.md`.

## 4. Build and test

- Build on the Mac from the PR's CI e2e images (name the Actions run id), on a fresh database:
  load `e2e-foundational-data.sql`, clear saved configuration checksums so the shipped catalog
  loads.
- Run the dev team's specs for the touched areas, the QA suites for those areas, and a core
  smoke (order, result, validation, release, patient report PDF; the main screens with no page
  errors and no 5xx).
- For permission changes, test each new role with and without the grant, including `_include`
  and `_revinclude` style edges.
- Say plainly which PRs in the stack were not built or exercised.

## 5. Report

Status table, behaviour-change table with Casey's calls, results table, findings not filed (with
severity), what was not exercised, and data left on the stack. Post review comments or approvals
only when Casey says so; approvals go through `gh` on his Mac after checking the heads did not
move (`--match-head-commit` with the full SHA).
