#!/bin/sh
# Starts the dev server on an empty local database and runs the browser scenarios against it.
# First time only: npx playwright install chromium
# Usage: npm run e2e            (all scenarios)
#        npm run e2e -- game    (one scenario)
cd "$(dirname "$0")/.." || exit 1
PORT=3100
mkdir -p e2e/.out
pkill -f "next dev -p $PORT" 2>/dev/null
sleep 1
rm -rf .data
AUTH_USERS='coach@example.com:soccer,asst@example.com:assist' npx next dev -p $PORT > e2e/.out/dev.log 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/login" && break; sleep 1; done
status=0
for f in ${@:-game groups coaches scrimmage}; do
  echo "--- $f ---"
  node "e2e/$f.mjs" || status=1
done
pkill -f "next dev -p $PORT"
rm -rf .data
exit $status
