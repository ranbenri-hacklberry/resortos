#!/bin/bash
# Install a pf anchor that keeps local Supabase (54321/54322) off the public internet.
# Usage on the Studio: sudo bash server/lock-supabase-lan.sh
set -euo pipefail
ANCHOR_SRC="$(cd "$(dirname "$0")" && pwd)/pf.anchors.hotelos"
ANCHOR_DST=/etc/pf.anchors/hotelos
PF_CONF=/etc/pf.conf
MARKER='anchor "hotelos"'

cp "$ANCHOR_SRC" "$ANCHOR_DST"
chmod 644 "$ANCHOR_DST"

if ! grep -q "$MARKER" "$PF_CONF"; then
  if ! grep -q 'load anchor "com.apple"' "$PF_CONF"; then
    echo "Unexpected $PF_CONF — aborting so macOS pf is not overwritten." >&2
    exit 1
  fi
  cp "$PF_CONF" "$PF_CONF.hotelos.bak"
  printf '\n# HotelOS: local Supabase only on LAN + Tailscale\n%s\nload anchor "hotelos" from "%s"\n' "$MARKER" "$ANCHOR_DST" >> "$PF_CONF"
fi

pfctl -a hotelos -f "$ANCHOR_DST"
pfctl -f "$PF_CONF"
pfctl -e 2>/dev/null || true
echo "hotelos pf anchor loaded (ports 54321-54322: loopback/LAN/Tailscale only)"
