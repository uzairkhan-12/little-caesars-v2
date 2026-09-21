#!/bin/bash
# Daily 6:00 AM Asia/Riyadh energy snapshot. Runs even if the dashboard is stopped.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
MARKER="scripts/energy-snapshot.mjs"
JOB="0 6 * * * cd \"$ROOT\" && \"$NODE\" \"$ROOT/scripts/energy-snapshot.mjs\" >> \"$ROOT/data/energy-snapshot.log\" 2>&1"

mkdir -p "$ROOT/data"
if [ ! -f "$ROOT/data/energy-reports.json" ]; then
  printf '{ "rows": [] }\n' > "$ROOT/data/energy-reports.json"
fi
touch "$ROOT/data/energy-snapshot.log"

EXISTING="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$EXISTING" | grep -v "$MARKER" | grep -v '^CRON_TZ=Asia/Riyadh$' || true)"
printf '%s\n' "CRON_TZ=Asia/Riyadh" "$CLEANED" "$JOB" | grep -v '^$' | crontab -

echo "Installed daily cron (6:00 AM Asia/Riyadh):"
echo "$JOB"
echo
crontab -l
