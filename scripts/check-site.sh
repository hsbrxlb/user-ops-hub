#!/usr/bin/env bash
# Independent checks run in parallel; every check still runs. Logs are shown only for failures.
set -eu
unset PUBLIC_SITE_ROOT
export PYTHONDONTWRITEBYTECODE=1
logs=$(mktemp -d "${TMPDIR:-/tmp}/hub-site.XXXXXXXX")
trap 'rm -rf "$logs"' EXIT
n=0
pids=()
launch() {
  n=$((n + 1))
  local id=$n
  echo "+ $*" >"$logs/$id.cmd"
  (
    start=$(date +%s)
    if "$@" >"$logs/$id.log" 2>&1; then echo 0 >"$logs/$id.rc"; else echo 1 >"$logs/$id.rc"; fi
    echo "$(( $(date +%s) - start ))s" >"$logs/$id.time"
  ) &
  pids+=($!)
}
report() {
  local failed=0 f id
  for f in "$logs"/*.rc; do
    id=$(basename "$f" .rc)
    cat "$logs/$id.cmd"
    [[ -n ${HUB_QA_TIMING:-} ]] && echo "  took $(cat "$logs/$id.time")"
    if [[ $(cat "$f") != 0 ]]; then
      failed=1
      cat "$logs/$id.log"
      echo "Failed: $(sed 's/^+ //' "$logs/$id.cmd"). Correct the source identified above and rerun scripts/qa-local.sh." >&2
    fi
  done
  return $failed
}
# Phase 1: source-tree checks, in parallel with building the public site.
launch node scripts/build-mascot-page.js --check
launch node scripts/build-nav.js --check
launch node scripts/test-public-user-voice-check.js
launch node scripts/check-public-pages.js
launch node scripts/check-fakesite.js
launch node scripts/check-anti-slop.js
launch node scripts/check-field-books.js
launch node scripts/check-products.js
launch node scripts/check-product-library.js
launch node scripts/check-demand-radar.js
launch node scripts/test-demand-radar-check.js
launch node scripts/test-mention-batch.js
launch python3 scripts/test_daily_demand_radar.py
launch node scripts/check-brand-plans.js
launch node scripts/check-outreach-pages.js
launch node scripts/check-outreach-users.js
launch node scripts/check-email-templates.js
launch node scripts/check-newsletter.js
launch node scripts/test-hub-navigation.js
launch node scripts/test-user-voice-render.js
launch node scripts/test-customer-analytics-render.js
launch python3 scripts/test-customer-analytics.py
launch node scripts/check-mascot-page.js
launch node scripts/test-mascot-loading.js
if ! scripts/build-public.sh "$1" >"$logs/build.log" 2>&1; then
  cat "$logs/build.log"
  echo "Failed: scripts/build-public.sh \"$1\"." >&2
  wait
  exit 1
fi
echo "+ scripts/build-public.sh $1"
# Phase 2: checks against the built site, all in parallel.
export PUBLIC_SITE_ROOT="$1"
launch python3 scripts/test-customer-analytics.py
launch node scripts/check-public-user-voice.js
launch node scripts/check-demand-radar.js
launch node scripts/check-mascot-page.js
launch node scripts/check-public-pages.js
launch node scripts/check-outreach-pages.js
launch node scripts/check-outreach-users.js
launch node scripts/check-fakesite.js
launch node scripts/check-anti-slop.js
launch node scripts/check-field-books.js
launch node scripts/check-products.js
launch node scripts/check-product-library.js
wait
report
