#!/usr/bin/env bash
# Print the SHA256 Cardcom needs before they build the Tap AAR.
# Default target is the Android debug keystore, after a debug build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE="${1:-}"
ALIAS="${2:-androiddebugkey}"
STOREPASS="${3:-android}"

if [[ -z "$KEYSTORE" ]]; then
  if [[ -f "$ROOT/android/app/debug.keystore" ]]; then
    KEYSTORE="$ROOT/android/app/debug.keystore"
  elif [[ -f "$HOME/.android/debug.keystore" ]]; then
    KEYSTORE="$HOME/.android/debug.keystore"
  else
    echo "No debug keystore yet. Build the debug APK once, or pass a keystore path." >&2
    exit 1
  fi
fi

echo "Keystore: $KEYSTORE"
echo "Alias:    $ALIAS"
keytool -list -v -alias "$ALIAS" -keystore "$KEYSTORE" -storepass "$STOREPASS" \
  | sed -n 's/^[[:space:]]*SHA256: //p'
echo "Send Cardcom the SHA256 line above."
