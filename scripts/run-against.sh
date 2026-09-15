#!/usr/bin/env bash
#
# Run a suite against a named target, re-authenticating first.
#
# Auth state (.auth/user.json) is per-origin and shared across configs. It
# points at whichever target the `setup` project last ran against, so switching
# targets without re-running setup sends every request unauthenticated to the
# new host — which reads as a broken product rather than a stale cookie. This
# script always re-runs setup, which costs a few seconds and removes the whole
# class of mistake.
#
#   ./scripts/run-against.sh develop -c all-tc.config.ts tests/aliquot.spec.ts
#   ./scripts/run-against.sh 3220    -c modules.config.ts --project=chain-a
#   ./scripts/run-against.sh testing -c all-tc.config.ts -g 'TC-ALQ'
#
set -euo pipefail

usage() {
  cat <<'EOF'
usage: run-against.sh <target> [playwright args...]

targets:
  develop   https://localhost:10443   local develop stack   (environments/README.md)
  3220      https://localhost:9443    local 3.2.2.0 stack
  testing   https://testing.openelis-global.org
  <url>     any explicit base URL

Everything after the target is passed through to `npx playwright test`.
The `setup` project is run first against the chosen target so .auth is fresh.
EOF
}

[ $# -ge 1 ] || { usage; exit 2; }
case "$1" in -h|--help) usage; exit 0;; esac

TARGET="$1"; shift
case "$TARGET" in
  develop) BASE="https://localhost:10443" ;;
  3220)    BASE="https://localhost:9443" ;;
  testing) BASE="https://testing.openelis-global.org" ;;
  https://*|http://*) BASE="$TARGET" ;;
  *) echo "unknown target: $TARGET" >&2; usage; exit 2 ;;
esac

export BASE BASE_URL="$BASE"

# Fail early and clearly rather than letting Playwright time out per test.
CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/" || echo 000)
if [ "$CODE" = "000" ]; then
  echo "error: $BASE is unreachable." >&2
  case "$TARGET" in
    develop|3220) echo "       Is the stack up? see environments/README.md" >&2 ;;
  esac
  exit 1
fi
echo "target: $BASE  (HTTP $CODE)"

# Record the digest for local stacks — `:develop` moves, so a result without
# one is not reproducible.
if [ "$TARGET" = "develop" ] && command -v docker >/dev/null 2>&1; then
  DIGEST=$(docker inspect openelisglobal-webapp-dev \
            --format '{{index .RepoDigests 0}}' 2>/dev/null || true)
  [ -n "$DIGEST" ] && echo "image:  $DIGEST"
fi

echo "--- setup (refreshing .auth for this origin) ---"
npx playwright test -c all-tc.config.ts --project=setup --reporter=line

echo "--- run ---"
exec npx playwright test "$@"
