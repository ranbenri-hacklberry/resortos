#!/bin/sh
# Local-only forward from the Studio to the office ESP. Nothing listens on the LAN.
KEY="${ROUTER_SSH_KEY:-$HOME/.ssh/resortos_router}"
HOST="${ROUTER_HOST:-100.122.76.95}"
exec ssh -N \
  -i "$KEY" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=accept-new \
  -L "127.0.0.1:${ESP_TUNNEL_PORT:-8085}:192.168.8.185:80" \
  "root@${HOST}"
