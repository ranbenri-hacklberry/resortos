#!/bin/bash
set -euo pipefail
# launchd cannot read ~/Documents (TCC). Copy the scraper to $HOME/kinorot-sync.
SRC="${1:-/Users/rani/Documents/Max/mlx-studio-local}"
ROOT="$HOME/kinorot-sync"
DEST="$HOME/Library/LaunchAgents/il.resortos.kinorot-sync.plist"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node not found in PATH"
  exit 1
fi
mkdir -p "$ROOT/server" "$ROOT/functions/lib" "$ROOT/src/lib" "$HOME/Library/LaunchAgents"
cp "$SRC/server/syncKinorotCalendar.js" "$ROOT/server/"
cp "$SRC/server/kinorotPlaces.js" "$ROOT/server/"
cp "$SRC/server/kinorotSyncControl.js" "$ROOT/server/"
cp "$SRC/server/kinorotSyncDiff.js" "$ROOT/server/"
cp "$SRC/server/kinorotSameDaySms.js" "$ROOT/server/"
cp "$SRC/server/micropaySms.js" "$ROOT/server/"
cp "$SRC/src/lib/kinorotStayHours.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/kinorotNotePayments.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/deposit.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/micropaySms.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/sameDayKinorotSms.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/unavailableHold.js" "$ROOT/src/lib/"
cp "$SRC/src/lib/units.js" "$ROOT/src/lib/"
cp "$SRC/functions/lib/kinorotZcredit.js" "$ROOT/functions/lib/"
printf '{\n  "type": "module"\n}\n' > "$ROOT/package.json"
if [ -f "$SRC/.env" ]; then
  grep -E '^(KINOROT_|PGPASSWORD|MICROPAY_)' "$SRC/.env" > "$ROOT/.env" || true
fi
python3 - <<PY
from pathlib import Path
src = Path("$SRC/server/launchd/il.resortos.kinorot-sync.plist").read_text()
src = src.replace("/opt/homebrew/bin/node", "$NODE_BIN")
src = src.replace("/usr/local/bin/node", "$NODE_BIN")
src = src.replace("/Users/rani/kinorot-sync", "$ROOT")
src = src.replace("/Users/rani/Documents/Max/mlx-studio-local", "$ROOT")
Path("$DEST").write_text(src)
print("wrote", "$DEST")
PY
launchctl bootout "gui/$(id -u)/il.resortos.kinorot-sync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "loaded il.resortos.kinorot-sync every 15 minutes from $ROOT"
echo "KINOROT_USER / KINOROT_PASSWORD must be in $ROOT/.env"
