# Module system with no module installed (OGC-1577, #4954)

Spec: `tests/ogc-1577-modules.spec.ts`, config `ogc1200.config.ts`. Written 5 Nov 2026 against testing.openelis-global.org (develop f7eb2d47, deployed about 15:15 UTC). Testing has no module in its modules directory, so these cases cover what every site without modules sees.

| TC | What | Ticket | Tier | Status |
|---|---|---|---|---|
| TC-MOD-01 | /rest/module-registry answers 200 with OpenELIS, module API, SPI and frontend contract versions, an empty module list and the report extension point | OGC-1579 | FUNCTION | Guard (5 Nov, testing f7eb2d47, 2 of 2) |
| TC-MOD-02 | Admin > Modules (side nav) shows the description, the versions line read from the registry and "No modules are installed.", with no console errors | OGC-1580 | ROUND-TRIP | Guard (5 Nov, 2 of 2) |
| TC-MOD-03 | /m/<id> for a module that is not installed shows "Module unavailable" and names the module | OGC-1580 | RENDER | Guard (5 Nov, 2 of 2) |
| TC-MOD-04 | /modules/<unknown>/remoteEntry.js answers 404, not 500 | OGC-1579 | FUNCTION | Guard (5 Nov, 2 of 2) |
| TC-MOD-05 | After login the shell loads home, the menu and the Results worklist with no module or federation console errors | OGC-1580 | RENDER | Guard (5 Nov, 2 of 2) |
| TC-MOD-06 | In French the Modules page shows no raw modules.* keys | OGC-1580 | RENDER | Guard (5 Nov, 2 of 2) |

## Not covered

- A module installed: its pages under /m/<id>, menu entries, extension slots, permission rows (mod.*), its Liquibase changelog, refusals (bad manifest, digest mismatch, requires range, downgrade). Needs the server's modules directory or `scripts/dev-stack up --module` with DIGI-UW/openelis-module-specimen-followup on Casey's Mac.
- The module test kit (OGC-1581) and the ArchUnit baseline (OGC-1578): build-time, covered by the dev team's CI.
