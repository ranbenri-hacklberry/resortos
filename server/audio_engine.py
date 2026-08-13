"""
Zoe Audio + Vector Engine — FastAPI Service (Port 8070)
Handles:
  - Binary WebSocket audio streaming → mlx-whisper STT
  - Vector embedding generation (POST /v1/embed)
  - Semantic search via pgvector (POST /v1/search)
  - RAG prompt building with anti-hallucination gate

Whisper: Large-v3 with 60s idle eviction (Hebrew quality is priority)
Embeddings: MiniLM-L12-v2 via lazy singleton on CPU
"""
import asyncio
import json
import subprocess
import time
import os
import threading
import numpy as np
import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from embeddings import embed
from rag import build_rag_prompt

app = FastAPI(title="Zoe Neural Engine", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Supabase Config ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:54321")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU")
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# --- Whisper with Eviction Logic ---
MODEL_PATH = "mlx-community/whisper-large-v3-mlx"
WHISPER_IDLE_TIMEOUT = 60  # seconds

_whisper_model = None
_whisper_last_used = 0
_whisper_lock = threading.Lock()


def get_whisper():
    """Load whisper on demand, track last usage for eviction."""
    global _whisper_model, _whisper_last_used
    import mlx_whisper
    with _whisper_lock:
        if _whisper_model is None:
            print(f"[Zoe Whisper] Loading {MODEL_PATH}...")
            start = time.perf_counter()
            # Pre-warm by doing a tiny transcription
            _whisper_model = mlx_whisper
            elapsed = (time.perf_counter() - start) * 1000
            print(f"[Zoe Whisper] Ready in {elapsed:.0f}ms")
        _whisper_last_used = time.time()
    return _whisper_model


async def whisper_evictor():
    """Background task: evict Whisper from memory after idle timeout."""
    global _whisper_model, _whisper_last_used
    while True:
        await asyncio.sleep(15)
        if _whisper_model and (time.time() - _whisper_last_used > WHISPER_IDLE_TIMEOUT):
            with _whisper_lock:
                if _whisper_model and (time.time() - _whisper_last_used > WHISPER_IDLE_TIMEOUT):
                    _whisper_model = None
                    print("[Zoe Whisper] Evicted from memory (60s idle)")


@app.on_event("startup")
async def startup():
    asyncio.create_task(whisper_evictor())
    print("[Zoe] Neural Engine v2.0 Online — Port 8070")


# =============================
# Audio Streaming (WebSocket)
# =============================
class AudioProcessor:
    def __init__(self):
        self.ffmpeg_cmd = [
            '/opt/homebrew/bin/ffmpeg',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-loglevel', 'error',
            'pipe:1'
        ]
        self.process = None

    async def start(self):
        self.process = await asyncio.create_subprocess_exec(
            *self.ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

    async def feed(self, chunk: bytes):
        if self.process and self.process.stdin:
            self.process.stdin.write(chunk)
            await self.process.stdin.drain()

    async def get_raw_pcm(self):
        if self.process and self.process.stdout:
            data = await self.process.stdout.read(32000)
            if data:
                return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        return None

    async def stop(self):
        if self.process:
            try:
                self.process.stdin.close()
                await self.process.wait()
            except:
                pass


@app.websocket("/v1/audio/stream")
async def audio_stream(websocket: WebSocket):
    await websocket.accept()
    print("[Zoe Audio] WebSocket connected (Binary Mode)")
    
    processor = AudioProcessor()
    await processor.start()
    audio_buffer = []
    
    try:
        while True:
            data = await websocket.receive_bytes()
            await processor.feed(data)
            
            pcm = await processor.get_raw_pcm()
            if pcm is not None:
                audio_buffer.append(pcm)
                
                if len(audio_buffer) >= 3:
                    combined_pcm = np.concatenate(audio_buffer)
                    whisper = get_whisper()
                    
                    result = whisper.transcribe(
                        combined_pcm,
                        path_or_hf_repo=MODEL_PATH,
                        fp16=True,
                        language="he"
                    )
                    
                    text = result.get('text', '').strip()
                    if text:
                        await websocket.send_json({
                            "type": "transcription",
                            "text": text,
                            "is_final": False
                        })
                        
    except WebSocketDisconnect:
        print("[Zoe Audio] WebSocket disconnected")
    except Exception as e:
        print(f"[Zoe Audio] Error: {e}")
    finally:
        await processor.stop()


# =============================
# Vector Endpoints (REST)
# =============================
class EmbedRequest(BaseModel):
    text: str
    table: str = "menu_items"
    id: int

class SearchRequest(BaseModel):
    query: str
    table: str = "menu_items"
    business_id: Optional[str] = None
    threshold: float = 0.45
    limit: int = 5


@app.post("/v1/embed")
async def generate_embedding(req: EmbedRequest):
    """Ingestion: Generate and store embedding for a record."""
    start = time.perf_counter()
    vector = embed(req.text)
    embed_ms = (time.perf_counter() - start) * 1000
    
    # Update in Supabase
    url = f"{SUPABASE_URL}/rest/v1/{req.table}?id=eq.{req.id}"
    payload = {"embedding": json.dumps(vector)}
    res = requests.patch(url, headers=SB_HEADERS, json=payload)
    
    return {
        "status": "ok" if res.status_code < 300 else "error",
        "embed_ms": round(embed_ms, 1),
        "dimensions": len(vector)
    }


@app.post("/v1/search")
async def vector_search(req: SearchRequest):
    """Query: Semantic search across menu/inventory via pgvector RPC."""
    start = time.perf_counter()
    query_vector = embed(req.query)
    embed_ms = (time.perf_counter() - start) * 1000
    
    # Route to correct RPC function
    rpc_map = {
        "menu_items": "search_menu",
        "inventory_items": "search_inventory",
        "tasks": "search_tasks",
        "recurring_tasks": "search_recurring_tasks",
        "recipes": "search_recipes",
    }
    rpc_name = rpc_map.get(req.table, "search_menu")
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/{rpc_name}"
    
    rpc_payload = {
        "query_embedding": query_vector,  # Send as raw list, not string
        "match_threshold": req.threshold,
        "match_count": req.limit,
    }
    if req.business_id:
        rpc_payload["filter_business_id"] = req.business_id
    
    search_start = time.perf_counter()
    res = requests.post(rpc_url, headers=SB_HEADERS, json=rpc_payload)
    search_ms = (time.perf_counter() - search_start) * 1000
    
    print(f"[Zoe Search] RPC: {rpc_name} | Query: '{req.query}' | Status: {res.status_code}")
    if res.status_code != 200:
        print(f"[Zoe Search] ERROR: {res.text}")
        
    results = res.json() if res.status_code == 200 else []
    
    return {
        "results": results,
        "query": req.query,
        "embed_ms": round(embed_ms, 1),
        "search_ms": round(search_ms, 1),
        "total_ms": round(embed_ms + search_ms, 1)
    }


@app.post("/v1/rag")
async def rag_query(req: SearchRequest):
    """Full RAG pipeline: Search → Context → Grounded prompt for Gemma."""
    # Step 1: Vector search
    search_response = await vector_search(req)
    results = search_response["results"]
    
    # Step 2: Build RAG prompt (with anti-hallucination gate)
    rag = build_rag_prompt(req.query, results)
    
    return {
        "rag": rag,
        "search_results": results,
        "performance": {
            "embed_ms": search_response["embed_ms"],
            "search_ms": search_response["search_ms"]
        }
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Zoe Neural Engine v2.0", "port": 8070}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8070)
