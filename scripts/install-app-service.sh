#!/bin/bash
# Install systemd unit that runs the Nitro Node production server (not vite dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/little-caesars.service"
UNIT_DST="/etc/systemd/system/little-caesars.service"
NODE="$(command -v node)"

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "Missing $UNIT_SRC" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run as root so systemd can install the unit." >&2
  exit 1
fi
if [[ ! -x "$NODE" ]]; then
  echo "node not found on PATH" >&2
  exit 1
fi

sed "s#ExecStart=/usr/bin/env node#ExecStart=$NODE#" "$UNIT_SRC" > "$UNIT_DST"
systemctl daemon-reload
systemctl enable little-caesars.service
echo "Installed $UNIT_DST"
echo "Build then start:"
echo "  cd $ROOT && npm run build && systemctl restart little-caesars.service"
