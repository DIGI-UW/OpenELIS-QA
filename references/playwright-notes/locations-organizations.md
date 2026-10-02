# Playwright notes: Admin > Locations & Organizations (OGC-1363)

Written 2026-10-02 against local develop (oedevqa, images 2026-10-01 17:48 UTC, OpenELIS-Global-2 #4500, squash 313490d).
Specs: `tests/locations-organizations.spec.ts` (TC-LORG-xx) with `tests/helpers/locations.ts`. The PR's own spec is
`frontend/playwright/tests/foundational/core/ogc-1363-locations.spec.ts` in OpenELIS-Global-2; read it for the dev's
selectors. This page replaced Organization Management, so `tests/org-admin.spec.ts` (TC-ORGW, `#org-name`) no longer
applies and was retired with this change.

## 1. Routes and redirects

| What | Route | Root test id |
|---|---|---|
| Organizations (landing) | `/MasterListsPage/locations` | `locations-organizations` |
| Sampling Sites | `/MasterListsPage/locations/sites` | `locations-sites` |
| Geographic Areas | `/MasterListsPage/locations/areas` | `locations-areas` |
| Import / Export | `/MasterListsPage/locations/import` | `locations-import` |

Redirects (client side, React Router):

- `/MasterListsPage/organizationManagement` -> `/MasterListsPage/locations`
- `/MasterListsPage/vectorSurveillanceSetup/sampling-sites` -> `/MasterListsPage/locations/sites`
- `/MasterListsPage/organizationEdit?ID=0` -> `/MasterListsPage/locations?add=1` (Add form open)
- `/MasterListsPage/organizationEdit?ID=<id>` -> `/MasterListsPage/locations?id=<id>`

**Trap:** `?id=<id>` only expands the record if its row is on the page the list loads (page 1 of the default list).
For anything else the list shows and nothing opens (TC-LORG-01b, tripwire). Do not use `?id=` to open a record in a
spec; search for its code and press its Edit button.

Filters live in the query string: `q`, `type` (comma list of type ids), `location`, `category`, `ownership`, `status`
(`active` default, `inactive`, `all`), `overdue=1`, `sort` (`name` default, `location`), `page`, `pageSize`, `id`, `add=1`.
A pasted URL restores them (TC-LORG-01, TC-LORG-07b).

## 2. The record model in one paragraph

Every row is an `organization`. Its kind (`facility`, `ward`, `site`, `area`) is derived from its types: `dept` is a
ward, `sampling site` is a site, a type with a hierarchy level is an area, anything else is a facility. Type ids on
local develop: `referring clinic` 5, `referralLab` 6, `sampling site` 12 (read them from `GET /rest/locations/lists`,
never hard-code). Wards are never top-level rows; they live in their parent's expanded row. Area levels on local
develop come from the Indonesia startup files (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa).

## 3. Opening a record

- The only way in is the row's Edit button: `getByTestId('locations-edit-<id>')`. Clicking the row does nothing (AC25).
- When a row is open its button reads **Close** and the same test id **collapses** it. After Add, the new record is
  already open. `openEdit()` in the helper checks `locations-form-<id>` first and only clicks when it is closed.
- The form is `getByTestId('locations-form-<id>')` (`locations-form-new` for Add). It sits under its table row; with
  the default 1280 x 720 viewport it is usually below the fold, which matters for anything about what the user sees.
- The form fetches its detail after it mounts. Wait for `#name-<id>` to have a value before typing, or the loaded
  detail overwrites what you typed.
- Only one row is open at a time.

## 4. Selectors that work

Field ids are `<field>-<id>` (`<field>-new` on Add):

| Section | ids |
|---|---|
| Identity | `name`, `shortName`, `types` (FilterableMultiSelect; the input is `types-<id>-input`), `category`, `ownership` (native selects), `description` |
| Identifiers | `identifier-label-<id>-<n>` (ComboBox, allowCustomValue: `fill()` then Tab), `identifier-value-<id>-<n>`, `identifier-reporting-<id>-<n>` (radio); button "Add identifier"; the value input's accessible name is "<label> Value" (the PR spec uses `getByLabel('Code Value')`) |
| Location | `location` (ComboBox; typeahead needs 2 characters and has a 300 ms debounce; wait for the option), `street`, `city`, `state`, `zip`, `lat`, `lng` |
| Contact | `contact`, `phone`, `email`, `web` |
| Referral laboratory | `ref-status` (native select, required), `ref-body`, `ref-number`, `ref-expiry`, `ref-last`, `ref-next` (type=date: `fill('YYYY-MM-DD')`), `ref-notes` |
| Site details (sites) | `site-type`, `site-subtype`, `site-zone` |

Buttons and test ids:

- Form Save: `form.getByTestId('locations-save')`. Cancel: `form.getByRole('button', { name: 'Cancel' })`.
  History: `form.getByRole('button', { name: /^History/ })`, panel `locations-history` (wait for "Loading" to go).
- Wards: `locations-wards` (table), `locations-add-ward`, `locations-ward-draft` (each draft row; name by placeholder
  "Ward / dept name", service type is the row's `select`), `locations-save-wards` ("Save N wards", disabled until every
  draft has a name and a service type), saved rows `locations-ward-<id>`, toggles `#ward-active-<id>`, edit inputs
  `#ward-name-<id>`, `#ward-lat-<id>`, `#ward-lng-<id>`, Move ComboBox `#ward-move-<id>`.
- List: rows `[data-testid^="locations-row-"]`, search placeholder "Search by name, code or any identifier", Add
  `locations-add`, filter tags `locations-filter-tags`, empty state `locations-empty`. Type filter: placeholder "All
  types"; Location filter: placeholder "Any area"; Status is a native `select` (options Active, Inactive, All).
- Active toggle: `#active-<id>` is the hidden checkbox; click its label (`#active-<id>_label`, or
  `locator('#active-<id>').locator('xpath=..')`). The guard is `getByRole('dialog')` with "... only" and
  "... and its N wards / depts" buttons. Undo: `getByRole('button', { name: 'Undo' })`.
- The page's one notification: `.locationsToast` (helper `notice()`).
- Areas: rows `locations-area-<id>` (`tabIndex=0`, `aria-level`, `aria-expanded` when it has children), table
  `role="treegrid"`, top add `locations-area-add-top` ("Add <level 1 name>"), child add `locations-area-add-<id>`
  (named for the level below), add-row inputs `#locations-new-area-name` / `#locations-new-area-code`, save
  `locations-area-save`, edit inputs `#area-name-<id>`.
- Import: `input[type="file"]` (`setInputFiles` with a buffer), file name `locations-import-file`, mode RadioTiles:
  click `label[for="import-mode-replace"]` (the input is covered by its label), `locations-import-preview`, count tiles
  `locations-import-count-<new|updated|unchanged|reactivated|deactivated|decision|rejected>`, `locations-import-apply`,
  confirm `getByRole('dialog').getByRole('button', { name: 'Apply' })`, Replace acknowledgement
  `label[for="import-acknowledge"]`, done `locations-import-done`. Decision radios by text: "Use this record: <name>",
  "Create new", "Skip row", checkbox "Remember this name"; rename radios "Same place, renamed" / "Different places".

Selectors that do **not** work or mislead:

- `getByRole('button', { name: /^Save$/ }).first()`: there are several Save buttons (form, ward edit, area row). In
  ward edit mode the ward's Save is in the wards table, not in `locations-ward-<id>`.
- `#org-name`, `#org-prefix`, `#is-active`, `/rest/Organization`: the old screen. Gone.
- `getByRole('textbox', { name: 'Name *' })` works, but a referral lab or sampling site appends " · From registry" to
  labels on registry records; ids are stable, labels are not.
- `pressSequentially` / `keyboard.type` into the area add row: only the first character lands (TC-LORG-14t). Use
  `fill()` there until it is fixed.

## 5. How Save works, and why "Save sent nothing" (the 2 Oct probe)

`save()` in RecordForm validates on the client first and sends nothing when any of these fail: name empty, no type
(facility), GPS outside -90..90 / -180..180 or not a number, and **a referral lab without an Approval status**. The
message sits under the failing field only: no notification, no scroll, focus stays on Save (TC-LORG-06c, tripwire).
Alpha, Beta and Gamma are referral labs with no approval status, so pressing Save on them sends nothing. That was the
probe. Pick an approval status (the probe should not save Alpha; it can still route-intercept the PUT).

The server then validates again (422 with `fieldErrors`): duplicate identifier value per label and kind, a label used
twice, an identifier with an empty value (this is why the Add form's pre-filled blank "Code" row blocks a code-less
save: TC-LORG-06d), malformed email, a sampling site without a code, bad dates.

Requests: create `POST /rest/locations/organizations` (201, `{detail, warnings}`), edit
`PUT /rest/locations/organizations/<id>` (200; send `lastupdated` from the detail or you get no conflict check; a stale
one answers 409 with `current`). Success shows "<name> added." / "<name> saved." and collapses the row.

## 6. REST endpoints (base `/api/OpenELIS-Global`)

| Method | Path | Notes |
|---|---|---|
| GET | `/rest/locations/lists` | facilityTypes, categories, ownerships, serviceTypes (`OUTPATIENT` etc.), siteTypes, environmentalZones, referralStatuses, identifierLabels, areaLevels |
| GET | `/rest/locations/organizations?view=organizations\|sites&q&type&location&category&ownership&status&reviewOverdue&sort&page&pageSize` | `{items: Row[], total, page, pageSize}`; Row has `matchNote` ("formerly:<name>", "ward:<name>") |
| GET/POST/PUT | `/rest/locations/organizations[/<id>]` | Detail: row, parentId, address, gps, contact, identifiers, wards, referral, site, lastupdated, historyCount |
| GET | `/rest/locations/organizations/<id>/usage` | inUse {open,total}, activeChildren |
| POST | `/rest/locations/organizations/active` | `{ids, active, includeChildren}` -> `{changed, names}`; 409 "Reactivate <parent> first." |
| GET/POST/PUT | `/rest/locations/organizations/<id>/wards[/<wardId>]` | WardRequest: name, code, serviceType, contactName, phone, email, gpsLatitude, gpsLongitude; `?includeInactive=true` |
| POST | `/rest/locations/wards/<wardId>/move` | `{parentId}` |
| GET | `/rest/locations/organizations/<id>/history` | `[{id, when, user, action, changes:[{field, oldValue, newValue}]}]`; user is the display name ("ELIS,Open" for admin) or "Import run #<uuid>" |
| GET/POST/PUT | `/rest/locations/areas` | `?parentId` children, `?q` search; AreaRequest {name, code, parentId, lastupdated}; `/areas/levels`; `/areas/<id>/active` |
| POST | `/rest/locations/import/preview`, `/import/apply` | multipart: `files` (repeat), `areas` (one per file: organizations, levels, values), `mode` (merge, replace), `decisions` JSON `{line: {choice: "use:<id>"\|"new"\|"skip", remember}}`, `renames` JSON `{line: "same"\|"different"}` |
| GET | `/rest/locations/import/recent`, `/import/runs/<id>/report`, `/import/template?area=` | |
| GET | `/rest/locations/export?view&q&type&location&status&ids` | CSV in the import format, plus one `identifier:<label>` column per label in use |
| Legacy | `/rest/admin/vector/sampling-sites[...]` (GET, POST, PUT, `/active`, `/search?search=`), `/rest/OrganizationMenu`, `/rest/displayList/REFERRAL_ORGANIZATIONS`, `/rest/departments-for-site?refferingSiteId=`, `/rest/SamplePatientEntry` (referringSiteList), `/rest/shipping-box/site-organization-uuid`, `/fhir/Organization/<uuid>` | downstream readers |

Writes need the CSRF header: run them inside the page (`helpers/locations.ts` `api()`, `importCall()`), not through
`page.request`. Roles: Receptionist, Lab Tech and Validator get 403 on every write and the page does not render.

## 7. Data the spec creates and how it finds it again

- Every name carries the run stamp `S` (6 digits, `LOC_STAMP` or the clock). Names start "QA Loc", "QA_ZZ Loc" (sorts
  last) or "QA <word>"; codes are `Q??<S>`.
- `beforeAll` creates an area tree (QA Loc Prov / Kab / Kec), two facilities, a referral lab and a low-sorting record,
  and writes their ids to `${OUT}/loc-fixtures-<S>.json`. Playwright restarts the worker after a failed test and re-runs
  `beforeAll`; the file makes the restarted worker reuse the same records instead of minting a second set.
- Every id created is appended to `${OUT}/loc-created-<S>.txt`. TC-LORG-99 (last) deactivates them all and the areas.
  Nothing is deleted. Set `LOC_KEEP=1` to leave them active for a follow-up `--grep` run (`LOC_STAMP=<S>` to reuse).
- Read-only fixtures used: QA_AUTO Reference Lab Alpha (29, Shipment Settings site organization), QA Auto Clinic 45
  (339 open orders, guard count; Cancel only), QA_AUTO Vector Site (preview only). Never save, rename or deactivate them.
- **Replace mode is applied only to ward-scoped files** (dept rows under a QA parent). A Replace file with facility or
  site rows deactivates every other record of those types on the instance; those cases are preview only.

## 8. Timing and waits

- Scope list assertions to the run stamp (`q=<S>`, `pageSize=100`): every run leaves inactive "QA Loc" records, and
  the broken default sort (TC-LORG-07g) moves records between pages.

- The list has **no stale-response guard**: every filter change fires a request and whichever answer lands last wins.
  Waiting for `networkidle` is not enough. Wait for the response carrying your parameters, then for a row you expect
  (`search()` waits for the answer to its own `q`; TC-LORG-07b/07c show the pattern for type, status and location).
- Search is debounced 300 ms and resets to page 1; it also collapses an open row.
- The single notification auto-dismisses after 6 s (10 s when it carries Undo). Read it right after the action.
- A new record's notification can be replaced by the next one: a duplicate-name warning is overwritten by
  "<name> added." (TC-LORG-06b).
- The 5,000-row import preview answers in about 9 s locally.
- History opens with "Loading..."; wait for it to go.

## 9. Known traps and open findings (tripwires in the spec)

| Case | Trap |
|---|---|
| TC-LORG-01b, 07g | `?id=` opens only records on the first page; the default Name sort returns two sorted runs back to back, so "page 1" is not the first 25 names |
| TC-LORG-04m, 04p, 04-low, 04-ok | Non-JSON or missing error bodies show parser or browser text; notifications vanish after 6 s and sit at the top of the page, off screen when editing a record further down |
| TC-LORG-05, 05b, 05d | Contact name and Description have no maxLength (cut at 100 silently); over-long REST values are cut (street 30, website 40, code 20) or answer 500 (name, identifier value) |
| TC-LORG-06b, 06c, 06d | Duplicate warning lost; referral approval block is silent; blank Code row blocks a code-less save |
| TC-LORG-07w | A ward search does not open its organization |
| TC-LORG-08c, 08d | Draft wards dropped by the form Save; a partial ward save duplicates on retry |
| TC-LORG-14t, 14e | Area add row loses focus per keystroke; parent row does not show its new child |
| TC-LORG-15t, 15b, 16 | Type picker shows a count; Close does not ask about unsaved edits; a 409 replaces what the user typed |
| TC-LORG-18f | FHIR Organization lacks the labelled identifiers |
| TC-LORG-24t, 28t | Replace preview shows 0 open orders for an in-use site; exporting referral labs and replacing deactivates 36 referring clinics |
| TC-LORG-29b, 29e, 29d, 29w | Rename check flags names that share common words (name fixtures so they share no words with other records in the same place); BOM and Windows-1252 files fail; a repeated identifier inside one file is not rejected; unknown columns are not reported |
| TC-LORG-30t, 40t | Recent imports lacks file names and the preview marker; Import / Export overflows at 1280 px |

## 10. Database checks (local stacks only)

`db()` runs `docker exec -i <container> psql -U clinlims -d clinlims -At -F '|' -c <sql>`. The container is `LOC_DB`
or, when `BASE` is localhost:10443, `openelisglobal-database-dev`; on any other host DB checks are skipped. Tables:
`clinlims.organization` (new columns gps_latitude, gps_longitude, contact_name, description, category_id,
ownership_id, service_type, source LOCAL/IMPORT/REGISTRY, approval_status, accreditation_*, *_review_*),
`organization_identifier` (organization_id, label, value, is_reporting), `organization_change` (organization_id,
changed_at, actor, action, changes text), `organization_organization_type`, `vector_sampling_site.organization_id`.
Column limits that matter: name 200, short_name 15, street_address 30, city 30, state 2, zip_code 10, phone 20,
internet_address 40, code 20, contact_name 100, email 255, identifier value 100. Liquibase file
`3.5.x.x/112-locations-organizations.xml` (9 changesets on develop, 2026-10-01 23:09 UTC).

A generic install with no geographic levels (testing.openelis-global.org on 2 Oct) refuses areas with "No geographic levels
are configured; load the levels file first". The spec then creates its facilities without a location and skips the
area-dependent cases (`test.skip(!F.prov, ...)`); do not load a levels file on a shared server to make them run.

TC-LORG-17 marks a QA record `source='REGISTRY'` in the DB to stand in for the facility registry sync and puts it back
to `LOCAL` in `finally`.

## 11. Running

```bash
# local develop, browser in UTC, fresh admin login (setup project), role logins (setup-roles)
BASE=https://localhost:10443 npx playwright test -c modules-utc.config.ts --project=modules tests/locations-organizations.spec.ts
# one area, keeping the records for a second look
LOC_KEEP=1 LOC_STAMP=123456 npx playwright test ... --grep "TC-LORG-2"
```

The modules sweep picks the file up on its own (`modules.config.ts` matches every top-level `tests/*.spec.ts`).
TC-LORG-19 needs `.auth/role-*.json` from `roles.setup.ts` and skips without them.
