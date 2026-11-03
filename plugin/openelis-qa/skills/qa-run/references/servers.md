# QA servers (fallback list)

The live list is the project doc `claude/qa-testing-servers.md` in the "OpenELIS QA" project.
Read that first; this copy is a fallback and goes stale. All are test-data-only servers and the
credentials are the widely published defaults.

| Server | What it carries | Login | Order fixtures for dev specs |
|---|---|---|---|
| `https://testing.openelis-global.org` | develop, auto-deployed by the pipeline | admin / adminADMIN! | provider person 325, referring site 11 |
| `https://analyzers.openelis-global.org` | Piotr's deploy of the analyser stack | admin / adminADMIN! | no provider persons; referring site 3 |
| `https://amr.openelis-global.org` | 3.4.0-SNAPSHOT with AMR V2 (no v3 endpoints on 3 Nov) | admin / adminADMIN! | |
| `https://pngtest.openelis-global.org` | PNG build; may be out of date | refused admin on 3 Nov; ask Casey | Contract = CPHL PNG on PNG tickets |
| `https://demo.openelis-global.org` | public demo; password reset Mondays about 06:05 | admin / adminADMIN!, demo / demoDEMO! | |
| `https://mgtest.openelis-global.org` | Madagascar distro | | distro catalog; `madagascar-uat-test-suite.md` |
| `https://localhost:10443` (Mac) | `oedevqa`, local develop images | admin / adminADMIN! | |

## Quirks

- The testing deploy can lag develop. Compare the deployed commit with the PR's merge commit
  before calling a fix verified or missing.
- A stale JS bundle can blank the page: hard reload.
- "Still There?" idle modal: dismiss, re-authenticate, resume.
- Some sample types show French names in a few endpoints with the UI in English (lead, 2 Nov):
  pick sample types by id, not display name.
- The ChangePasswordLogin redirect: set the Formik values through the React fiber
  (`ctx.setValues({loginName, password, newPassword, confirmPassword})`, wait, `ctx.handleSubmit()`).
