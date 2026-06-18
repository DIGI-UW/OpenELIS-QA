# Test Targets & Known Instances

> What you're testing varies — capture it explicitly at Step 0. The **target identity** drives
> which suites apply, what "expected" means, and the report header. Don't assume "the app."

## Target taxonomy — identify which one this run is
| Target type | What it is | Implications for testing |
|---|---|---|
| **Main global release** | A tagged OpenELIS Global release (the upstream product) | Baseline behavior; the Default test catalog; all standard suites apply. Compare against the release notes. |
| **Project distro** | A deployment-specific build (e.g. Madagascar e-SIL, PNG/CPHL) with its own catalog, branding, config, and sometimes extra features | Expect a **custom test catalog** (LOINC↔test mapping differs — see analyzer profile-reuse), deployment-only suites (e.g. Madagascar `madagascar-uat-test-suite.md` LO-xx/DU-xx), and disabled/enabled features (e.g. `eqaEnabled`). Some standard suites may N/A. |
| **Branch / PR build** | A feature branch or PR under review, often a throwaway instance | Targeted regression on the changed area + a smoke pass; behavior may be mid-change. Tie findings to the PR, not a release. |
| **Rapid version** | A fast-cadence build (rapid release track) | Higher churn — routes/behaviors move between builds. **Re-verify routes (Step 0.5 calibration) and don't trust last run's findings**; version drift is expected. |

**Capture at Step 0 (record in the report header):**
1. **Target type** (from the table above) + **project/deployment** name if a distro.
2. **App version / build** — from the UI footer or `/actuator/info` if exposed; note the rapid-track build id if applicable.
3. **Catalog** — Default global TC vs a custom/distro TC (affects analyzer LOINC matching and which result options exist).
4. **Feature flags that gate suites** (e.g. `eqaEnabled`, study forms) — check before declaring a feature "missing."

If the target is a distro/branch you don't have suites for, that's an **UNCOVERED** finding (see `test-case-authoring.md`) — flag the distro-specific surface and ask Casey what the intended workflow is rather than guessing.

---

## Known instances (examples — verify per run; creds are intentionally public)
> Credentials below are deliberately public and widely shared (Casey's standing note) — fine to use/keep.

| Instance | Use | Notes |
|---|---|---|
| `https://testing.openelis-global.org` | Canonical QA / live-crawl instance | Chrome has creds saved → auto-logs in. |
| `https://demo.openelis-global.org` | Public demo | Creds `admin/adminADMIN!`, `demo/demoDEMO!`, **backup `casey/caseyCASEY!`**. A scheduled task resets the demo password **Mondays ~6:05am**; if `admin` login is in a weird state, use the `casey` backup. |
| `https://mgtest.openelis-global.org` | Madagascar (mgtest) distro | "Madagascar OpenELIS" branding; distro catalog + e-SIL UAT applies. |

## Operational quirks (instance-level, evergreen-ish — verify if they bite)
- **Stale JS bundle blanks the page** → hard reload to recover.
- **No `/logout` route** → use the profile-menu Logout.
- **Save success is often signal-less in the UI** → confirm via the **200 POST** (e.g. `rest/UnifiedSystemUser`) and a round-trip read-back (Section 7.5), not a banner.
- **ChangePasswordLogin redirect** (the demo reset, or any forced change) → use the Formik-context workaround in SKILL.md Step 2; fall back to the original or the `casey` backup account.
- React refs go stale quickly — re-query the DOM rather than holding references.

## Maintenance
Instances and quirks drift — re-verify each run; this is a starting roster, not a guarantee.
Instance-specific *data* (patient/accession fixtures) is NOT recorded here — discover it live
via Step 0.6 Data Census.
