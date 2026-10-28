#!/usr/bin/env python3
"""
Persistent mlx-whisper worker. JSON-lines RPC over stdin/stdout.

Request : {"id": "...", "path": "/abs/file.wav", "language_hint": "th"|"ar"|"he"|null}
Response: {"id": "...", "text": "...", "language": "th", "duration_ms": 312}
          {"id": "...", "error": "..."}
On boot prints {"ready": true} after warming the model.

One-shot CLI:  python transcriber.py --file x.wav [--language th]
"""
import argparse
import json
import sys
import os
import re
import time

USE_VOCAB = os.environ.get("STT_HE_VOCAB", "1") != "0"  # set STT_HE_VOCAB=0 to roll back

ALLOWED = {"th", "ar", "he"}

# Hebrew vocabulary hint (Whisper initial_prompt) - Mialis unit names and codes.
# Used only for Hebrew so it cannot bias Thai/Arabic detection. No access codes here.
HE_PROMPT = (
    "מיאליס, וילה מיאליס, סוויטה ורודה, סוויטה ירוקה, קאסה נובה, אורה, בלום, "
    "צימר בגבעה, כיפת שמים, כחול, אדום, ירוק, גבעת יואב, רמות, מול הנוף, "
    "נופים בלבן, טוסקנה, החצר המוסיקלית, טאג׳ מאהל, מאיה, בתי נורית. "
    "A1 A2 A3 B1 B2 C1 C2 C3 C4 D1 D2 D3. סוויטה ירוקה A3, אורה B1."
)

# Post-correction for frequent mishearings (applied to Hebrew output only).
HE_FIXES = [
    ("עברודה", "ורודה"), ("עירוקה", "ירוקה"),
    ("קסנובה", "קאסה נובה"), ("קסה נובה", "קאסה נובה"), ("קאזה נובה", "קאסה נובה"),
    ("צימר בגיבה", "צימר בגבעה"), ("צימר בגבע ", "צימר בגבעה "),
    ("כיפת שמיים", "כיפת שמים"), ("מיאלים", "מיאליס"), ("מיאלס", "מיאליס"),
]


HE_REGEX_FIXES = [
    # E3 -> A3 only in suite context (E3 is a valid Taj Mahal room code elsewhere).
    (re.compile(r"((?:סוויטה|ירוקה)[ ,]*)E3\b"), r"\1A3"),
    (re.compile(r"קאסה נובה האורה"), "קאסה נובה אורה"),
    (re.compile(r"האורה(\s*)B1\b"), r"אורה\1B1"),
    (re.compile(r"והכחול זה"), "הכחול זה"),
    (re.compile(r"(?<![ט\u0590-\u05FF])(ו?)(?:וסקנה|תוסקנה)"), r"\1טוסקנה"),
    # "30,41" -> "3041": Whisper inserts a thousands comma; never merges "C1, C2" or longer runs.
    (re.compile(r"(?<![\d,])(\d{2}),(\d{2})(?![\d,])"), r"\1\2"),
]


def fix_he(text: str) -> str:
    for a, b in HE_FIXES:
        text = text.replace(a, b)
    for rx, b in HE_REGEX_FIXES:
        text = rx.sub(b, text)
    return text


def load(model: str):
    import mlx_whisper  # noqa: WPS433 (lazy: heavy import)
    from mlx_whisper.transcribe import ModelHolder
    import mlx.core as mx

    ModelHolder.get_model(model, mx.float16)  # load weights once, keep resident
    return mlx_whisper


def transcribe(mw, model: str, path: str, hint=None) -> dict:
    t0 = time.perf_counter()
    kw = dict(path_or_hf_repo=model, fp16=True, condition_on_previous_text=False,
              temperature=0.0, verbose=None)
    # Auto-detect first. Whisper may guess a language outside our set (e.g. ur/fa for Arabic,
    # yi for Hebrew), so if that happens re-run with the hint or the closest supported language.
    res = mw.transcribe(path, **kw)
    lang = res.get("language", "")
    if lang not in ALLOWED:
        fallback = hint if hint in ALLOWED else {"fa": "ar", "ur": "ar", "yi": "he"}.get(lang, "th")
        res = mw.transcribe(path, language=fallback, **kw)
        lang = fallback
    text = res.get("text", "").strip()
    if lang == "he" and USE_VOCAB:
        # Second pass with the vocabulary hint (language fixed, so detection is unaffected).
        res = mw.transcribe(path, language="he", initial_prompt=HE_PROMPT, **kw)
        text = fix_he(res.get("text", "").strip())
    return {
        "text": text,
        "language": lang,
        "duration_ms": int((time.perf_counter() - t0) * 1000),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="mlx-community/whisper-large-v3-turbo")
    ap.add_argument("--file")
    ap.add_argument("--language")
    args = ap.parse_args()

    mw = load(args.model)

    if args.file:
        print(json.dumps(transcribe(mw, args.model, args.file, args.language), ensure_ascii=False))
        return 0

    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            out = transcribe(mw, args.model, req["path"], req.get("language_hint"))
            out["id"] = rid
        except Exception as e:  # noqa: BLE001
            out = {"id": rid, "error": str(e)}
        print(json.dumps(out, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
