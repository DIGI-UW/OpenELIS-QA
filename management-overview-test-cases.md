# Management Overview (OGC-897)

Spec: `tests/management-overview.spec.ts`. Written 26 Oct 2026 on local develop 31cc26c6; updated 31 Oct 2026 for #4838 (last N days covers N days), the features key renamed to microbiology, and the KPI strip computed in SQL (#4843, OGC-1572 closed).

### TC-MGMT-01 — Every scope answers summary and kpis 200 with the five tiles (guard)

### TC-MGMT-02 — The default scope is 30 days, an unknown scope is 400 (guard)

### TC-MGMT-03 — The subtitle count and the Total samples tile agree, and match the database (guard)

### TC-MGMT-04 — Sparklines have one point per day up to 92 days, weekly beyond (guard)

### TC-MGMT-05 — A new order received today raises Total samples for 7 days by one (guard)

### TC-MGMT-06 — Percent tiles stay within 0 to 100 and carry their thresholds (guard)

### TC-MGMT-07 — The grant is registered and given to Global Administrator and the EQA provider roles (guard)

### TC-MGMT-10 — A Reports user without the grant gets 403 on both endpoints (guard)

### TC-MGMT-11 — A Reports user without the grant does not get the page (guard)

### TC-MGMT-12 — The side nav hides Management Overview from a user without the grant (FRS OGC-897)

### TC-MGMT-20 — Reports lists Management Overview first; the page shows heading, subtitle and five tiles (guard)

### TC-MGMT-21 — The chosen scope is remembered after a reload and drives the requests (guard)

### TC-MGMT-22 — Refresh reloads the data and then waits out its cooldown (guard)

### TC-MGMT-23 — A failed KPI request shows an error, not five empty tiles (guard)

### TC-MGMT-24 — A phone-width viewport has no horizontal page scroll (guard)
