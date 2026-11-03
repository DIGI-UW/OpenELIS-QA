---
name: qa-evidence
description: >
  This skill should be used to capture screenshots or video of a live OpenELIS instance: bug
  evidence for a finding or Jira ticket ("record the repro", "screenshot the bug", "attach
  evidence", "video of the bug"), and media for the user manual, website, release notes or
  design reviews ("take screenshots", "grab a screen", "record a walkthrough", "refresh the docs
  media"). Bug evidence is uploaded to Google Drive and linked from the ticket.
metadata:
  version: "0.1.0"
---

# Evidence and screenshots

Two modes, one harness (the QA repo: `tests/docs/capture.ts` with `go()`, `shot()`,
`saveWalkthrough()`, `dismissModals()`).

Always: navigate by route, dismiss "Still There?", mask PII (patient names and IDs; the harness
`DEFAULT_PII` plus per-spec `pii`), `animations: 'disabled'`, and screenshots a person will see at
`deviceScaleFactor: 2`.

## Mode 1: bug evidence

For each finding, capture:

1. **Marked screenshots** of the failure: outline the offending element (`data-heur` style), add
   a caption band saying what to look at, and the expected-versus-seen in one line.
2. **A short video** of the repro, 10 to 60 seconds: a small Playwright spec or probe with
   `video: 'on'` (or `recordVideo` on the context), the exact steps from the filing card, slowed
   with `slowMo: 250` so a person can follow. Add `trace: 'on'` when a developer will want the
   network detail.
3. Optional: the server's error body (hooked `fetch`) as a text file.

**Upload to Google Drive** into the "OpenELIS QA Evidence" folder
(folder id `1Xdl3VzEtueoUSgW8l8Mf3qW0evhKDLub`,
https://drive.google.com/drive/folders/1Xdl3VzEtueoUSgW8l8Mf3qW0evhKDLub), one subfolder per
ticket (`OGC-1234`) or, before a ticket exists, per finding (`YYYY-MM-DD-<short-name>`):

- **Preferred (any size):** if Google Drive for desktop is installed on Casey's Mac
  (`ls -d ~/Library/CloudStorage/GoogleDrive-*`), copy the files into
  `My Drive/OpenELIS QA Evidence/<subfolder>/` there, wait for sync, then find each file's id
  with the Drive connector (`search_files` by title and parent) and link
  `https://drive.google.com/file/d/<id>/view`.
- **Connector upload (small files only):** `create_file` with `base64Content`,
  `contentMimeType`, `disableConversionToGoogleType: true` and `parentId`. The content passes
  through the conversation, so keep each file under about 150 KB: JPEG screenshots at 1280 px
  wide, quality 70. Videos are too large for this path.
- **Video without the desktop app:** keep it in the run folder, say where it is in the session
  doc, and tell Casey once that installing Google Drive for desktop on the Mac lets videos be
  linked. Don't paste a video through the connector.

Link the files in the ticket under **Evidence:** and in the filing card's Confirmed line. The
folder must be shared with the dev team for links to open (Casey's setting); if an assignee
can't open a link, tell Casey rather than changing sharing yourself.

Never upload anything that shows a real site's patient data, credentials or tokens.

## Mode 2: manual, website and release media

- Specs: `tests/docs/<capability-id>.docs.spec.ts`, generated from the `SPECS` table in
  `scripts/author-doc-specs.mjs` (capability id, name, `steps: [{ route, label }]`, optional
  `pii`). Edit the table, then `node scripts/author-doc-specs.mjs`.
- Run: `BASE=https://testing.openelis-global.org npx playwright test --project=docs` (all) or one
  spec file. Authenticate first with the setup project. Output: `docs-media/<id>/NN-<label>.png`
  plus `walkthrough.webm`.
- The `docs` project renders at 1440x900, `deviceScaleFactor: 2`, video on. For website shots use
  full-page captures or crop to a panel (`shot(page, info, 'Label', { target: mainPanel(page) })`).
- Routes: `references/routes.md` (a nav dump; re-dump from `/rest/menu` if it looks stale).
- Media is not committed (`docs-media/` is gitignored). Deliver it where Casey asks (the manual
  project, the site repo, Confluence).

## Where to run it

- **Cloud sandbox:** works against `*.openelis-global.org` with the system Chrome
  (`executablePath: '/usr/bin/google-chrome'`); move results to the Mac through the connected
  "OpenELIS QA" folder when they need to go into Drive.
- **Casey's Mac:** `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"`, run from a QA
  worktree with `nohup` and a `.done` sentinel, poll for it.

Done well: every finding has a marked screenshot and, for flows, a video a developer can follow
without reading the ticket twice; every manual capability has labeled PNGs that show the real
screen with no idle modal and PII masked.
