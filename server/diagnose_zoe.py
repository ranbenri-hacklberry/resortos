import requests
import json

def test_zoe():
    url = "http://127.0.0.1:8070/v1/search"
    payload = {
        "query": "שוקולד",
        "table": "menu_items",
        "threshold": 0.35,
        "limit": 5
    }
    try:
        print(f"Connecting to {url}...")
        res = requests.post(url, json=payload, timeout=10)
        print(f"Status: {res.status_code}")
        data = res.json()
        results = data.get("results", [])
        print(f"Found {len(results)} items:")
        for r in results:
            print(f" - {r.get('name')} | Sim: {r.get('similarity', 0):.3f}")
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    test_zoe()
