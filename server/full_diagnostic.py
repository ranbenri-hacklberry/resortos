"""
Full Pipeline Diagnostic — Tests every link in the chain
"""
import requests, json, sys

SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
ZOE_URL = "http://127.0.0.1:8070"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

print("=" * 55)
print("  FULL PIPELINE DIAGNOSTIC")
print("=" * 55)

# --- Test 1: Supabase REST API ---
print("\n🔍 Test 1: Supabase REST API...")
try:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/menu_items?select=name,price&name=ilike.*שוקולד*&limit=3", headers=HEADERS, timeout=5)
    items = r.json()
    print(f"   ✅ Status {r.status_code} — Found {len(items)} items")
    for i in items:
        print(f"      - {i['name']} ({i['price']}₪)")
except Exception as e:
    print(f"   ❌ FAILED: {e}")

# --- Test 2: Supabase RPC (search_menu) ---
print("\n🔍 Test 2: RPC search_menu (requires embedding)...")
try:
    # First, get a real embedding from the Zoe Engine
    embed_ok = False
    try:
        er = requests.post(f"{ZOE_URL}/v1/embed", json={"text": "שוקולד"}, timeout=15)
        if er.status_code == 200:
            vec = er.json().get("embedding", [])
            embed_ok = True
            print(f"   ✅ Got embedding from Zoe ({len(vec)} dims)")
        else:
            print(f"   ⚠️  Zoe embed returned {er.status_code}")
    except Exception as e:
        print(f"   ⚠️  Zoe Engine not reachable for embedding: {e}")
    
    if embed_ok:
        rpc_payload = {"query_embedding": vec, "match_threshold": 0.1, "match_count": 5}
        rr = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/search_menu", headers=HEADERS, json=rpc_payload, timeout=5)
        if rr.status_code == 200:
            results = rr.json()
            print(f"   ✅ RPC returned {len(results)} results!")
            for r in results:
                print(f"      - {r['name']} (sim: {r.get('similarity', 0):.3f})")
        else:
            print(f"   ❌ RPC FAILED: {rr.status_code} {rr.text[:200]}")
    else:
        # Try with a dummy embedding just to test the RPC itself
        dummy = [0.0] * 384
        rpc_payload = {"query_embedding": dummy, "match_threshold": 0.01, "match_count": 3}
        rr = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/search_menu", headers=HEADERS, json=rpc_payload, timeout=5)
        print(f"   {'✅' if rr.status_code == 200 else '❌'} RPC status: {rr.status_code} (dummy vector)")
        if rr.status_code != 200:
            print(f"   ERROR: {rr.text[:300]}")
except Exception as e:
    print(f"   ❌ FAILED: {e}")

# --- Test 3: Zoe Engine /v1/search ---
print("\n🔍 Test 3: Zoe Engine /v1/search...")
try:
    sr = requests.post(f"{ZOE_URL}/v1/search", json={"query": "שוקולד", "table": "menu_items", "threshold": 0.1, "limit": 5}, timeout=20)
    if sr.status_code == 200:
        data = sr.json()
        results = data.get("results", [])
        print(f"   ✅ Found {len(results)} items! (embed: {data.get('embed_ms',0):.0f}ms, search: {data.get('search_ms',0):.0f}ms)")
        for r in results:
            print(f"      - {r['name']} (sim: {r.get('similarity', 0):.3f})")
    else:
        print(f"   ❌ Status {sr.status_code}: {sr.text[:200]}")
except Exception as e:
    print(f"   ❌ Zoe Engine DOWN: {e}")

# --- Test 4: Ollama ---
print("\n🔍 Test 4: Ollama LLM...")
try:
    olr = requests.post("http://127.0.0.1:11434/api/generate", json={"model": "gemma4:e2b", "prompt": "Say OK", "stream": False}, timeout=30)
    if olr.status_code == 200:
        resp = olr.json().get("response", "")[:100]
        print(f"   ✅ Ollama responded: '{resp}'")
    else:
        print(f"   ❌ Status {olr.status_code}")
except Exception as e:
    print(f"   ❌ Ollama DOWN: {e}")

print("\n" + "=" * 55)
print("  DIAGNOSTIC COMPLETE")
print("=" * 55)
