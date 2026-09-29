#!/bin/bash
# Daily Asia/Riyadh energy snapshots. Runs even if the dashboard is stopped.
# 6:00 AM closes the energy day. 12:00 AM closes the calendar day. Every hour records that hour.
# AC room temperature, target, and meter are sampled every 15 minutes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
MARKER="scripts/energy-snapshot.mjs"
MARKER_AC="scripts/ac-quarter-snapshot.mjs"
JOB_6AM="0 6 * * * cd \"$ROOT\" && \"$NODE\" \"$ROOT/scripts/energy-snapshot.mjs\" >> \"$ROOT/data/energy-snapshot.log\" 2>&1"
JOB_MIDNIGHT="0 0 * * * cd \"$ROOT\" && \"$NODE\" \"$ROOT/scripts/energy-snapshot.mjs\" midnight >> \"$ROOT/data/energy-snapshot.log\" 2>&1"
JOB_HOURLY="0 * * * * cd \"$ROOT\" && \"$NODE\" \"$ROOT/scripts/energy-snapshot.mjs\" hourly >> \"$ROOT/data/energy-snapshot.log\" 2>&1"
JOB_AC="*/15 * * * * cd \"$ROOT\" && \"$NODE\" \"$ROOT/scripts/ac-quarter-snapshot.mjs\" >> \"$ROOT/data/energy-snapshot.log\" 2>&1"

mkdir -p "$ROOT/data"
touch "$ROOT/data/energy-snapshot.log"

EXISTING="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$EXISTING" | grep -v "$MARKER" | grep -v "$MARKER_AC" | grep -v '^CRON_TZ=Asia/Riyadh$' || true)"
printf '%s\n' "CRON_TZ=Asia/Riyadh" "$CLEANED" "$JOB_AC" "$JOB_HOURLY" "$JOB_MIDNIGHT" "$JOB_6AM" | grep -v '^$' | crontab -

echo "Installed energy cron (Asia/Riyadh):"
echo "$JOB_AC"
echo "$JOB_HOURLY"
echo "$JOB_MIDNIGHT"
echo "$JOB_6AM"
echo
crontab -l
