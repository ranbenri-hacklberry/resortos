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
import time

ALLOWED = {"th", "ar", "he"}


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
    return {
        "text": res.get("text", "").strip(),
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
