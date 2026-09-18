#!/usr/bin/env bash
set -euo pipefail

RATE="${1:?Usage: scripts/run-k6-stage.sh <events-per-second>}"
case "$RATE" in 100|250|500|750|1000|1250) ;; *) echo "Rate must be 100, 250, 500, 750, 1000, or 1250" >&2; exit 2 ;; esac

: "${K6_API_KEY:?K6_API_KEY must be set}"
: "${MONGODB_URI:?MONGODB_URI must be set}"
: "${KAFKA_TOPIC:?KAFKA_TOPIC must be set}"

mkdir -p load-test-results
STAMP="$(date +%Y%m%d-%H%M%S)"
PREFIX="load-test-results/${RATE}eps-${STAMP}"

node src/scripts/load-test-telemetry.js "${PREFIX}-telemetry.json" 60 &
TELEMETRY_PID=$!
trap 'kill "$TELEMETRY_PID" 2>/dev/null || true' EXIT

K6_RATE="$RATE" K6_SUMMARY_FILE="${PREFIX}-k6.json" \
  k6 run load-tests/k6/events.js
wait "$TELEMETRY_PID"
trap - EXIT
node src/scripts/generate-performance-report.js "$RATE" "${PREFIX}-k6.json" "${PREFIX}-telemetry.json" "${PREFIX}-report.json"
echo "Stage report: ${PREFIX}-report.json"
