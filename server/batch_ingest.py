"""
Zoe — One-Time Batch Ingestion Script (FINAL)
Correct table names: inventory_items, recipe_ingredients
"""
import os
import json
import time
import requests
from embeddings import embed_batch

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:54321")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
)
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

TABLE_CONFIG = {
    "menu_items": {
        "text_fields": ["name", "english_name", "category", "description"],
    },
    "inventory_items": {
        "text_fields": ["name", "category", "unit"],
    },
    "tasks": {
        "text_fields": ["title", "description"],
    },
    "recurring_tasks": {
        "text_fields": ["name", "description", "category"],
    },
    "recipes": {
        "text_fields": ["title", "description"],
    },
}


def fetch_unembedded(table: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&embedding=is.null"
    res = requests.get(url, headers=HEADERS)
    if res.status_code != 200:
        print(f"  ⚠ Error fetching {table}: {res.status_code} {res.text[:100]}")
        return []
    return res.json()


def update_embedding(table: str, record_id, embedding: list) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{record_id}"
    payload = {"embedding": json.dumps(embedding)}
    res = requests.patch(url, headers=HEADERS, json=payload)
    return res.status_code < 300


def build_text(record: dict, config: dict) -> str:
    parts = []
    for field in config.get("text_fields", []):
        val = record.get(field)
        if val and isinstance(val, str):
            parts.append(val)
    return " ".join(p for p in parts if p).strip()


def ingest_table(table: str, config: dict):
    records = fetch_unembedded(table)
    if not records:
        print(f"  [{table}] ✓ All records already embedded (or table empty).")
        return 0
    
    print(f"  [{table}] Found {len(records)} records to embed.")
    texts = [build_text(r, config) for r in records]
    
    start = time.perf_counter()
    vectors = embed_batch(texts)
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  [{table}] Embedded in {elapsed:.0f}ms")
    
    success = 0
    for record, vector in zip(records, vectors):
        if update_embedding(table, record["id"], vector):
            success += 1
    
    print(f"  [{table}] Updated {success}/{len(records)} records.")
    return success


if __name__ == "__main__":
    print("=" * 55)
    print("  Zoe Batch Ingestion — Embedding All Domain Tables")
    print("=" * 55)
    
    total_start = time.perf_counter()
    total_records = 0
    
    for table, config in TABLE_CONFIG.items():
        print(f"\n📦 Processing: {table}")
        total_records += ingest_table(table, config)
    
    total = time.perf_counter() - total_start
    print(f"\n{'=' * 55}")
    print(f"  Done. {total_records} records embedded in {total:.1f}s")
    print(f"{'=' * 55}")
