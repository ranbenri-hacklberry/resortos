#!/usr/bin/env bash
# Cardcom Tap finalization. Required for every APK that contains the real AAR.
# Steps match Cardcom's Tap on Phone guide:
#   1. finalizer -i APK -f release.fin -o <dir>
#   2. zipalign -p -v 4 <unaligned> <aligned>
#   3. apksigner sign --ks keystore.jks ...
set -euo pipefail

APK=""
FIN=""
FINALIZER="finalizer"
KEYSTORE=""
KS_PASS="${CARDCOM_KEYSTORE_PASSWORD:-}"
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk) APK="$2"; shift 2 ;;
    --fin) FIN="$2"; shift 2 ;;
    --finalizer) FINALIZER="$2"; shift 2 ;;
    --keystore) KEYSTORE="$2"; shift 2 ;;
    --ks-pass) KS_PASS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$APK" || -z "$FIN" || -z "$KEYSTORE" || -z "$KS_PASS" ]]; then
  echo "Usage: finalize-apk.sh --apk app.apk --fin release.fin --keystore keystore.jks --ks-pass '***' [--finalizer ./finalizer] [--out dir]" >&2
  exit 1
fi

if [[ ! -f "$APK" || ! -f "$FIN" || ! -f "$KEYSTORE" ]]; then
  echo "APK, release.fin, and keystore must all exist. Cardcom supplies release.fin and finalizer." >&2
  exit 1
fi

command -v "$FINALIZER" >/dev/null || { echo "finalizer not found: $FINALIZER" >&2; exit 1; }
command -v zipalign >/dev/null || { echo "zipalign not found. Install Android build-tools." >&2; exit 1; }
command -v apksigner >/dev/null || { echo "apksigner not found. Install Android build-tools." >&2; exit 1; }

BASE="$(basename "$APK" .apk)"
OUT="${OUT:-$(dirname "$APK")/finalized}"
mkdir -p "$OUT"

echo "1/3 finalizer"
"$FINALIZER" -i "$APK" -f "$FIN" -o "$OUT"

UNALIGNED="$OUT/${BASE}-unaligned-unsigned-protected.apk"
if [[ ! -f "$UNALIGNED" ]]; then
  UNALIGNED="$(find "$OUT" -name '*unaligned*unsigned*.apk' -print -quit)"
fi
if [[ -z "$UNALIGNED" || ! -f "$UNALIGNED" ]]; then
  echo "Finalizer did not write an unaligned APK in $OUT" >&2
  exit 1
fi

ALIGNED="$OUT/${BASE}_aligned_unsigned.apk"
SIGNED="$OUT/${BASE}_aligned_signed.apk"

echo "2/3 zipalign"
zipalign -p -v 4 "$UNALIGNED" "$ALIGNED"

echo "3/3 apksigner"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --out "$SIGNED" "$ALIGNED"
apksigner verify "$SIGNED"
echo "Distribute only: $SIGNED"
