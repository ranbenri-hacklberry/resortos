#!/usr/bin/env bash
# Cardcom requires every APK that talks to the real Tap SDK to be finalized,
# then zip-aligned, then signed. The debug APK with the mock module does not
# need this. Run it on the release APK after the AAR is in android/app/libs.
#
# Cardcom ships AppFinalizationFolder.zip containing `finalizer` and `release.fin`.
# Unzip it, put this script's inputs next to those files (or pass the paths).
#
#   mobile/scripts/finalize-apk.sh app-release.apk /path/to/release.fin /path/to/keystore.jks
# The keystore password is read from CARDCOM_KEYSTORE_PASSWORD, not from argv.
set -euo pipefail
APK="${1:?apk path}"
FIN="${2:?release.fin path}"
KEYSTORE="${3:?keystore path}"
: "${CARDCOM_KEYSTORE_PASSWORD:?set CARDCOM_KEYSTORE_PASSWORD}"

OUT="${4:-finalizedApkFolder}"
mkdir -p "$OUT"
BASE="$(basename "$APK" .apk)"

if ! command -v finalizer >/dev/null 2>&1; then
  echo "finalizer is not on PATH. Unzip the AppFinalizationFolder Cardcom sent and run this from that directory, or add it to PATH." >&2
  exit 1
fi

finalizer -i "$APK" -f "$FIN" -o "$OUT"
UNALIGNED="$OUT/${BASE}-unaligned-unsigned-protected.apk"
ALIGNED="$OUT/${BASE}_aligned_unsigned.apk"
SIGNED="$OUT/${BASE}_aligned_signed.apk"
zipalign -p -v 4 "$UNALIGNED" "$ALIGNED"
apksigner sign --ks "$KEYSTORE" --ks-pass "env:CARDCOM_KEYSTORE_PASSWORD" --out "$SIGNED" "$ALIGNED"
echo "Distribute only: $SIGNED"
