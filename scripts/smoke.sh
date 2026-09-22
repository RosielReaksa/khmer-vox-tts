#!/usr/bin/env bash
set -u
JAR=$(mktemp)
EMAIL="lt_smoke_$(date +%s)_$$@example.com"
PASS="TestPass12345"
echo "[smoke] email=$EMAIL"
curl -s -c "$JAR" -o /dev/null 'http://178.128.103.120/signup' || true
CSRF=$(awk '/csrf-token/{print $7}' "$JAR" | tail -1)
echo "[smoke] csrf len=${#CSRF}"
SIGNUP=$(curl -s -b "$JAR" -c "$JAR" -X POST 'http://178.128.103.120/api/auth/signup' -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "[smoke] signup: $SIGNUP"
rm -f "$JAR"
