import json
import logging
import re
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("translator-proxy")

app = FastAPI(title="Qwen Voice Translator Proxy", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

current_config = {
    "mac_studio_ip": "100.127.14.15",
    "ollama_port": 11434,
    "ollama_base_url": "http://100.127.14.15:11434",
    "default_model": "qwen3.6:latest",
    "fallback_local_url": "http://localhost:11434",
}


class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    model: Optional[str] = None
    mode: Optional[str] = None  # conversation | task_dispatch


class ConfigUpdateRequest(BaseModel):
    ollama_base_url: Optional[str] = None
    default_model: Optional[str] = None


def build_system_prompt(source_lang: str, target_lang: str, mode: Optional[str]) -> str:
    task_bias = ""
    if (mode or "").lower() in {"task_dispatch", "task", "dispatch"}:
        task_bias = (
            "\nThe speaker is in TASK DISPATCH mode. Prefer is_task=true whenever the utterance "
            "sounds like an operational instruction, even if brief.\n"
            "Identify the PROPERTY (complex) and UNIT (cabin/room) when mentioned. "
            "Known complexes: מיאליס/Mialees, צימר בגבעה/Hill, כיפת שמיים/Domes (כחול/אדום/ירוק), "
            "בתי נורית/Nurit, טאג' מאהל/Taj, מול הנוף/Mool, נופים בלבן/Nofim, טוסקנה/Toscana "
            "(פירנצה/שאטו), חצר מוסיקלית/Musical (חליל/מיתר/פעמון), מאיה/Maya, סייסטה/Siesta, "
            "קאסה נובה/Casa Nova (Aura/Bloom).\n"
            "Thai visual signs also count as unit labels: 🔵כחול, 🔴אדום, 🟢ירוק, 🩷ורודה, "
            "🪈חליל, 🎸מיתר, 🔔פעמון, 🏰שאטו, ✨Aura, 🌸Bloom.\n"
            "Always fill property_name + unit_number (or unit_label for named units like חליל).\n"
        )
    return f"""You are an instantaneous bilingual interpreter and operational field assistant between {source_lang} and {target_lang}.
{task_bias}
Analyze the spoken message and return a STRICT JSON object matching this schema:
{{
  "translation": "The direct spoken translation in {target_lang}",
  "is_task": boolean (true if the speaker gives an instruction, cleaning order, or maintenance task; false for casual conversation/greetings),
  "is_issue": boolean (true if the speaker reports a malfunction, damage, or missing item),
  "task_data": {{
    "unit_number": number or null (e.g., if mentioned "בקתה 4" or "cabin 4" -> 4),
    "property_name": "Hebrew or English complex name if mentioned, else null",
    "unit_label": "Named unit if not numeric (e.g. חליל, שאטו, Aura, כיפה כחול), else null",
    "task_he": "Concise task description in Hebrew",
    "task_translated": "Concise task description in {target_lang}",
    "category": "cleaning" | "maintenance" | "inventory" | "general",
    "priority": "normal" | "urgent"
  }} or null
}}

Return ONLY the JSON object. Do not wrap in markdown quotes if possible.
"""


def fallback_payload(raw_text: str) -> dict[str, Any]:
    text = (raw_text or "").strip()
    return {
        "translation": text,
        "translated_text": text,
        "is_task": False,
        "is_issue": False,
        "task_data": None,
    }


def extract_json_object(raw: str) -> Optional[dict[str, Any]]:
    if not raw:
        return None
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def normalize_translate_payload(parsed: Optional[dict[str, Any]], raw_assistant: str) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return fallback_payload(raw_assistant)

    translation = (
        parsed.get("translation")
        or parsed.get("translated_text")
        or parsed.get("translated")
        or ""
    )
    translation = str(translation).strip() or str(raw_assistant or "").strip()

    task_data = parsed.get("task_data")
    if task_data is not None and not isinstance(task_data, dict):
        task_data = None
    if isinstance(task_data, dict):
        unit_number = task_data.get("unit_number")
        try:
            unit_number = int(unit_number) if unit_number is not None and str(unit_number).strip() != "" else None
        except Exception:
            unit_number = None
        category = str(task_data.get("category") or "general").lower()
        if category not in {"cleaning", "maintenance", "inventory", "general"}:
            category = "general"
        priority = str(task_data.get("priority") or "normal").lower()
        if priority not in {"normal", "urgent"}:
            priority = "normal"
        task_data = {
            "unit_number": unit_number,
            "property_name": str(task_data.get("property_name") or "").strip() or None,
            "unit_label": str(task_data.get("unit_label") or "").strip() or None,
            "task_he": str(task_data.get("task_he") or translation).strip(),
            "task_translated": str(task_data.get("task_translated") or translation).strip(),
            "category": category,
            "priority": priority,
        }

    is_task = bool(parsed.get("is_task"))
    is_issue = bool(parsed.get("is_issue"))
    if (is_task or is_issue) and not task_data:
        task_data = {
            "unit_number": None,
            "task_he": translation,
            "task_translated": translation,
            "category": "maintenance" if is_issue else "general",
            "priority": "normal",
        }

    return {
        "translation": translation,
        "translated_text": translation,
        "is_task": is_task,
        "is_issue": is_issue,
        "task_data": task_data,
    }


async def ollama_chat(messages: list[dict[str, str]], model: str) -> str:
    target_url = current_config["ollama_base_url"]
    fallback_url = current_config["fallback_local_url"]
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0.1},
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        for base in (target_url, fallback_url):
            try:
                res = await client.post(f"{base}/api/chat", json=payload)
                if res.status_code != 200:
                    logger.warning("Ollama %s returned HTTP %s", base, res.status_code)
                    continue
                data = res.json()
                content = (data.get("message") or {}).get("content") or ""
                if content.strip():
                    return content
            except Exception as err:
                logger.warning("Ollama chat failed for %s: %s", base, err)
    raise HTTPException(status_code=502, detail="Ollama unreachable")


@app.get("/api/config")
async def get_config():
    return current_config


@app.post("/api/config")
async def update_config(req: ConfigUpdateRequest):
    if req.ollama_base_url:
        current_config["ollama_base_url"] = req.ollama_base_url.rstrip("/")
    if req.default_model:
        current_config["default_model"] = req.default_model
    return {"status": "ok", "config": current_config}


@app.get("/api/status")
async def check_status():
    target_url = current_config["ollama_base_url"]
    fallback_url = current_config["fallback_local_url"]

    studio_connected = False
    studio_models = []
    studio_error = None

    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            res = await client.get(f"{target_url}/api/tags")
            if res.status_code == 200:
                data = res.json()
                studio_models = [m["name"] for m in data.get("models", [])]
                studio_connected = True
            else:
                studio_error = f"HTTP {res.status_code}"
    except Exception as e:
        studio_error = str(e)

    if studio_connected:
        return {
            "status": "connected",
            "active_host": "studio",
            "target": target_url,
            "models": studio_models,
            "error": None,
        }

    local_connected = False
    local_models = []
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            res = await client.get(f"{fallback_url}/api/tags")
            if res.status_code == 200:
                data = res.json()
                local_models = [m["name"] for m in data.get("models", [])]
                local_connected = True
    except Exception:
        pass

    return {
        "status": "disconnected",
        "active_host": "none",
        "target": target_url,
        "error": studio_error or "Cannot connect to Ollama on Mac Studio",
        "studio_connected": False,
        "local_available": local_connected,
        "local_models": local_models,
        "models": local_models if local_connected else [],
    }


@app.post("/api/translate")
async def translate(req: TranslateRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    selected_model = req.model or current_config["default_model"]
    system_prompt = build_system_prompt(req.source_lang, req.target_lang, req.mode)
    raw_assistant = ""
    try:
        raw_assistant = await ollama_chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.text.strip()},
            ],
            selected_model,
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("translate failed: %s", err)
        return fallback_payload(req.text.strip())

    parsed = extract_json_object(raw_assistant)
    payload = normalize_translate_payload(parsed, raw_assistant)

    # Task-dispatch bias if model forgot the flag
    if (req.mode or "").lower() in {"task_dispatch", "task", "dispatch"} and not payload["is_task"] and not payload["is_issue"]:
        payload["is_task"] = True
        if not payload["task_data"]:
            payload["task_data"] = {
                "unit_number": None,
                "task_he": payload["translation"],
                "task_translated": payload["translation"],
                "category": "general",
                "priority": "normal",
            }

    return payload


@app.post("/api/translate/stream")
async def translate_stream(req: TranslateRequest):
    """Legacy NDJSON stream for the Translator static UI."""
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    target_url = current_config["ollama_base_url"]
    selected_model = req.model or current_config["default_model"]
    system_prompt = (
        f"You are a professional, instantaneous two-way voice interpreter between {req.source_lang} and {req.target_lang}.\n"
        f"Translate the user input accurately, fluently, and conversationally into {req.target_lang}.\n"
        "Rules:\n"
        "1. Output ONLY the direct translated sentence in the target language with appropriate punctuation.\n"
        "2. Do NOT add any introductory text, polite prefixes, notes, explanations, or quotes.\n"
        "3. Preserve proper nouns, numbers, and technical terms appropriately."
    )
    payload = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.text.strip()},
        ],
        "stream": True,
        "think": False,
        "options": {"temperature": 0.1},
    }

    async def generate_chunks():
        client = httpx.AsyncClient(timeout=60.0)
        try:
            async with client.stream("POST", f"{target_url}/api/chat", json=payload) as response:
                if response.status_code == 200:
                    async for chunk in response.aiter_text():
                        yield chunk
                    return
                err_msg = json.dumps({"error": f"Mac Studio Ollama returned HTTP {response.status_code}"})
                yield f"{err_msg}\n"
                return
        except Exception as e:
            logger.warning("stream primary failed: %s", e)
            try:
                fallback_url = current_config["fallback_local_url"]
                async with client.stream("POST", f"{fallback_url}/api/chat", json=payload) as fb_response:
                    if fb_response.status_code == 200:
                        async for chunk in fb_response.aiter_text():
                            yield chunk
                        return
            except Exception as fb_err:
                logger.error("stream fallback failed: %s", fb_err)
            yield f"{json.dumps({'error': str(e)})}\n"
        finally:
            await client.aclose()

    return StreamingResponse(generate_chunks(), media_type="application/x-ndjson")


# Serve frontend static assets last so /api/* stays available
app.mount("/", StaticFiles(directory="static", html=True), name="static")
