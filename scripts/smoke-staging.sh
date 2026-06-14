#!/usr/bin/env bash
# Staging end-to-end smoke test: CSRF -> signup -> generate -> poll job.
# Usage: BASE=http://178.128.103.120 bash smoke-staging.sh
set -u
BASE="${BASE:-http://178.128.103.120}"
JAR="$(mktemp)"
EMAIL="smoke_$(date +%s)_$RANDOM@example.com"
PASS="TestPass12345"

echo "[smoke] base=$BASE email=$EMAIL"

# 1) Hit a page to receive the csrf-token cookie set by proxy.ts
curl -s -c "$JAR" -o /dev/null "$BASE/signup" || true
CSRF="$(awk '/csrf-token/{print $7}' "$JAR" | tail -1)"
echo "[smoke] csrf len=${#CSRF}"
if [ -z "$CSRF" ]; then echo "[smoke] FAIL: no csrf token"; rm -f "$JAR"; exit 1; fi

# 2) Signup
SIGNUP="$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signup" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
echo "[smoke] signup: $SIGNUP"
echo "$SIGNUP" | grep -q '"ok":true' || { echo "[smoke] FAIL signup"; rm -f "$JAR"; exit 1; }

# 3) Generate (queued)
GEN="$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/generate" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"text":"សួស្តី នេះជាការសាកល្បង។","voice":"female","model":"voxcpm2"}')"
echo "[smoke] generate: $GEN"
JOB="$(echo "$GEN" | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p')"
if [ -z "$JOB" ]; then echo "[smoke] FAIL: no jobId"; rm -f "$JAR"; exit 1; fi
echo "[smoke] jobId=$JOB"

# 4) Poll job up to ~120s
for i in $(seq 1 60); do
  sleep 2
  ST="$(curl -s -b "$JAR" "$BASE/api/batch/jobs/$JOB")"
  STATUS="$(echo "$ST" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1)"
  echo "[smoke] poll $i: status=$STATUS"
  case "$STATUS" in
    completed|partial) echo "[smoke] SUCCESS in ~$((i*2))s"; rm -f "$JAR"; exit 0;;
    failed|needs_review) echo "[smoke] FAIL job status=$STATUS body=$ST"; rm -f "$JAR"; exit 1;;
  esac
done
echo "[smoke] TIMEOUT waiting for job"
rm -f "$JAR"; exit 1
