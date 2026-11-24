#!/usr/bin/env bash
set -eu
unset PUBLIC_SITE_ROOT
export PYTHONDONTWRITEBYTECODE=1
run() {
  echo "+ $*"
  "$@" || { echo "Failed: $*. Correct the source identified above and rerun scripts/qa-local.sh." >&2; exit 1; }
}
run node scripts/build-mascot-page.js --check
run node scripts/build-nav.js --check
run node scripts/test-public-user-voice-check.js
run node scripts/check-public-pages.js
run node scripts/check-fakesite.js
run node scripts/check-anti-slop.js
run node scripts/check-field-books.js
run node scripts/check-products.js
run node scripts/check-product-library.js
run node scripts/check-demand-radar.js
run node scripts/test-demand-radar-check.js
run node scripts/test-mention-batch.js
run python3 scripts/test_daily_demand_radar.py
run node scripts/check-brand-plans.js
run node scripts/check-outreach-pages.js
run node scripts/check-outreach-users.js
run node scripts/check-email-templates.js
run node scripts/check-newsletter.js
run node scripts/test-hub-navigation.js
run node scripts/test-user-voice-render.js
run node scripts/test-customer-analytics-render.js
run python3 scripts/test-customer-analytics.py
run node scripts/check-mascot-page.js
run node scripts/test-mascot-loading.js
run scripts/build-public.sh "$1"
export PUBLIC_SITE_ROOT="$1"
run python3 scripts/test-customer-analytics.py
run node scripts/check-public-user-voice.js
run node scripts/check-demand-radar.js
run node scripts/check-mascot-page.js
run node scripts/check-public-pages.js
run node scripts/check-outreach-pages.js
run node scripts/check-outreach-users.js
run node scripts/check-fakesite.js
run node scripts/check-anti-slop.js
run node scripts/check-field-books.js
run node scripts/check-products.js
run node scripts/check-product-library.js
