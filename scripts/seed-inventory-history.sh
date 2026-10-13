#!/bin/bash
# Re-date the usage records of the inventory history fixtures (helpers/inventory-fixtures.ts), one
# per day over the last 30 days, so the items board can project run-out dates for them.
#
# The API always stamps usage with the current time, so this needs the database. Run it after the
# fixtures exist (ci-fixtures.setup.ts, or any run of tests/inventory-board.spec.ts):
#
#   scripts/seed-inventory-history.sh                      # container openelisglobal-database-dev
#   DB_CONTAINER=other-db scripts/seed-inventory-history.sh
#
# Re-running is safe and re-anchors the 30 days on today, which keeps the expected statuses true
# on a stack that lives for weeks. It touches only items named in HISTORY in the helper.
set -euo pipefail
C="${DB_CONTAINER:-openelisglobal-database-dev}"
docker exec -i "$C" psql -U clinlims -d clinlims -v ON_ERROR_STOP=1 <<'SQL'
WITH f AS (
  SELECT id FROM clinlims.inventory_item WHERE name IN ('QA INV Steady', 'QA INV Soon', 'QA INV PastDue')
), r AS (
  SELECT u.id, row_number() OVER (PARTITION BY u.inventory_item_id ORDER BY u.id) AS rn
  FROM clinlims.inventory_usage u JOIN f ON f.id = u.inventory_item_id
)
UPDATE clinlims.inventory_usage u
   SET usage_date = date_trunc('day', now()) - ((r.rn - 1) * interval '1 day') + interval '1 hour'
  FROM r
 WHERE u.id = r.id AND r.rn <= 30;
SELECT i.name, count(u.id) AS usage_rows, min(u.usage_date)::date AS first_day, max(u.usage_date)::date AS last_day
  FROM clinlims.inventory_item i LEFT JOIN clinlims.inventory_usage u ON u.inventory_item_id = i.id
 WHERE i.name IN ('QA INV Steady', 'QA INV Soon', 'QA INV PastDue')
 GROUP BY i.name ORDER BY i.name;
SQL
