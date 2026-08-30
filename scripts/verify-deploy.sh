#!/usr/bin/env bash
#
# Verify that the live production site is the current origin/main commit.
#
#   scripts/verify-deploy.sh                  # SHA + status + reachability
#   scripts/verify-deploy.sh "some literal"   # also grep the live JS bundle
#
# The literal argument is how you prove the deploy carries *your* change: pass a
# string this commit introduced (a new UI label, a new constant). A green SHA
# check alone can still serve a stale bundle from Vercel's build cache.
#
# Exit 0 = production matches origin/main.

set -euo pipefail

REPO="mshmwr/sentence-builder"
PROD_URL="https://sentence-builder-steel.vercel.app"
literal="${1:-}"
fail=0

note() { printf '%-20s %s\n' "$1" "$2"; }
bad()  { printf '%-20s %s  <-- FAIL\n' "$1" "$2"; fail=1; }

git fetch origin --quiet
expected="$(git rev-parse origin/main)"
note "origin/main" "${expected:0:7}"

# Git-integration deploys register a GitHub deployment; CLI deploys do not.
read -r dep_sha dep_id <<<"$(gh api "repos/$REPO/deployments?environment=Production&per_page=1" \
  --jq '.[0] | "\(.sha) \(.id)"')"
if [ "$dep_sha" = "$expected" ]; then
  note "vercel deployment" "${dep_sha:0:7}"
else
  bad "vercel deployment" "${dep_sha:0:7} (expected ${expected:0:7}; still building, or last deploy was a manual CLI push)"
fi

state="$(gh api "repos/$REPO/deployments/$dep_id/statuses?per_page=1" --jq '.[0].state')"
if [ "$state" = "success" ]; then
  note "deployment state" "$state"
else
  bad "deployment state" "$state"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' -L "$PROD_URL")"
if [ "$code" = "200" ]; then
  note "$PROD_URL" "HTTP $code"
else
  bad "$PROD_URL" "HTTP $code"
fi

bundle="$(curl -sL "$PROD_URL" | grep -o '/assets/[^"]*\.js' | head -1)"
if [ -n "$bundle" ]; then
  note "live bundle" "$bundle"
else
  bad "live bundle" "no /assets/*.js found in the HTML"
fi

if [ -n "$literal" ] && [ -n "$bundle" ]; then
  if curl -sL "$PROD_URL$bundle" | grep -qF -- "$literal"; then
    note "bundle literal" "found: $literal"
  else
    bad "bundle literal" "missing: $literal (stale build cache? retry with: vercel --prod --force)"
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "PASS — production serves origin/main."
else
  echo "FAIL — see the lines above before claiming the deploy is done."
fi
exit "$fail"
