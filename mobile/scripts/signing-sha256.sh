#!/usr/bin/env bash
# Print the SHA256 of a signing certificate for Cardcom.
# Cardcom registers this fingerprint and only then builds the private AAR.
#
# Debug APK (the keystore Gradle creates on the first debug build):
#   mobile/scripts/signing-sha256.sh
# Release / upload key:
#   mobile/scripts/signing-sha256.sh path/to/release.keystore my-alias
# Play App Signing certificate: copy SHA256 from Play Console, not from this keystore.
set -euo pipefail
KEYSTORE="${1:-$HOME/.android/debug.keystore}"
ALIAS="${2:-androiddebugkey}"
STOREPASS="${3:-android}"
if [[ ! -f "$KEYSTORE" ]]; then
  echo "Keystore not found: $KEYSTORE" >&2
  echo "Build the debug APK once, or pass the release keystore path." >&2
  exit 1
fi
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$STOREPASS" \
  | awk '/SHA256:/{ print; found=1 } END{ if (!found) exit 1 }'
