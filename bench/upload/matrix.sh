#!/usr/bin/env bash
# Interleaved so time-of-day drift hits each concurrency equally.
export TEST_LOGIN_KEY="$(grep '^TEST_LOGIN_KEY=' $(git rev-parse --show-toplevel)/.env | cut -d= -f2-)"
cd "$(dirname "$0")"
for round in 1 2; do
  for c in 4 8 12 16; do
    echo "=== c=$c round=$round $(date -u +%T)"
    node upload.mjs $c 10 "c${c}-r${round}"
    sleep 5
  done
done
echo "=== matrix done $(date -u +%T)"
