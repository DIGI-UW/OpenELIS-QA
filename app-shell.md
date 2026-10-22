# App shell (OGC-1448): test cases

**Spec:** `tests/app-shell.spec.ts`
**Written:** 2026-10-12 against local develop a4200e2d (images 2026-10-12 06:09 UTC), after OpenELIS-Global-2 #4681.
**Scope:** the three app-shell defects in OGC-1448: Logout behind a proxy on a non-default port, sortable column descriptions, and one h1 per screen.

Kind: **Guard** passes today and protects it. **Tripwire** asserts the intended behaviour, carries `test.fail()` while the product differs, and goes red the day it is fixed (remove the marker then).

The local stack's proxy forwards `Host $host`, so the server's redirects lose the :10443 port, like any site whose nginx.conf predates #4681's installer template change. Logout runs in its own browser context, never on the shared session.

| ID | Case | Kind | Source |
| --- | --- | --- | --- |
| TC-SHELL-01 | Logout ends the session (`/session` says not authenticated) and opens this origin's `/login`, the port kept | Guard | #4681 |
| TC-SHELL-02 | After Logout the login page does not show "Can't reach the server" | Guard | OGC-1448 (fixed; guard since 21 Oct 2026) |
| TC-SHELL-10 | Dashboard, Organizations, Pathology, Immunohistochemistry, Cytology, Notebook, Inventory Items (title "Items" since #4368), Storage Management, System Audit Trail, Test Request and Enter Order each have exactly one h1, the page title | Guard | #4681 |
| TC-SHELL-11 | The home Dashboard keeps one h1 with a tile opened; tile values are paragraphs, not headings | Guard | #4681 |
| TC-SHELL-12 | Modify Order (`/SampleEdit`) has an h1 title (today an h3) | Tripwire | OGC-1448 comment 38090 |
| TC-SHELL-20 | Organizations names every sortable column (no "[object Object]", no empty name) | Guard | #4681 |
| TC-SHELL-21 | Pathology names every sortable column | Guard | #4681 |
| TC-SHELL-22 | Immunohistochemistry names every sortable column | Guard | #4681 |
| TC-SHELL-23 | Inventory names every sortable column | Guard | #4681 |
| TC-SHELL-24 | Storage racks names every sortable column | Guard | #4681 |
