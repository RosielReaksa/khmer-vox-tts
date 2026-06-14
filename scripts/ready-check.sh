#!/usr/bin/env bash
# Production readiness check: key public pages + end-to-end signup/signin.
set -u
BASE="https://voxtts.online"
echo "=== PUBLIC PAGES ==="
for p in / /app/signin /app/signup /api/health /pricing; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  echo "$p -> $code"
done

echo "=== END-TO-END AUTH ==="
JAR="$(mktemp)"
EMAIL="readycheck_$(date +%s)_$RANDOM@example.com"
PASS="TestPass12345"
curl -s -c "$JAR" -o /dev/null "$BASE/app/signin"
CSRF="$(awk '/csrf-token/{print $7}' "$JAR" | tail -1)"
echo -n "signup: "
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signup" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"; echo
echo -n "signin (correct): "
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signin" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"; echo
echo -n "signin (wrong, expect 401): "
curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/auth/signin" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"nope\"}"; echo
rm -f "$JAR"
