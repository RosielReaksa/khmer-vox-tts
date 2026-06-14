#!/usr/bin/env bash
# Verify signup + signin still work on staging (functional check before load test).
set -u
BASE="${BASE:-http://178.128.103.120}"
JAR="$(mktemp)"
EMAIL="verify_$(date +%s)_$RANDOM@example.com"
PASS="TestPass12345"

curl -s -c "$JAR" -o /dev/null "$BASE/app/signin"
CSRF="$(awk '/csrf-token/{print $7}' "$JAR" | tail -1)"
echo "csrf_len=${#CSRF}"

echo -n "signup: "
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signup" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
echo

echo -n "signin (correct pw): "
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/signin" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
echo

echo -n "signin (wrong pw, expect 401): "
curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/auth/signin" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"WrongPass999\"}"
echo
rm -f "$JAR"
