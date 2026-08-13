"""Seed menu items for business 22222222"""
import requests, json

SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}
BID = "22222222-2222-2222-2222-222222222222"

# 1. Delete all old menu items for this business
delete_url = f"{SUPABASE_URL}/rest/v1/menu_items?business_id=eq.{BID}"
del_res = requests.delete(delete_url, headers=HEADERS)
print(f"🗑️ Delete response: {del_res.status_code}")

# 2. Prepare new items
new_items = [
    # שתיה חמה
    {"name": "אספרסו", "category": "שתיה חמה", "price": 10},
    {"name": "קפה שחור", "category": "שתיה חמה", "price": 10},
    {"name": "נס קפה של בית", "category": "שתיה חמה", "price": 10},
    {"name": "נס על חלב", "category": "שתיה חמה", "price": 14},
    {"name": "קפה הפוך", "category": "שתיה חמה", "price": 14},
    {"name": "אמריקנו חם", "category": "שתיה חמה", "price": 14},
    {"name": "צ׳אי חם", "category": "שתיה חמה", "price": 14},
    
    # שתיה קרה
    {"name": "אמריקנו קר", "category": "שתיה קרה", "price": 19},
    {"name": "קפה קר", "category": "שתיה קרה", "price": 19},
    {"name": "צ׳אי קר", "category": "שתיה קרה", "price": 19},
    {"name": "אייס קפה", "category": "שתיה קרה", "price": 19},
    
    # ברדים
    {"name": "ברד תות", "category": "שתיה קרה", "price": 15},
    {"name": "ברד פסיפלורה", "category": "שתיה קרה", "price": 15},
    {"name": "ברד ענבים", "category": "שתיה קרה", "price": 15},
    {"name": "ברד מנגו", "category": "שתיה קרה", "price": 15},
    {"name": "ברד משמש", "category": "שתיה קרה", "price": 15},
    
    # שייקים
    {"name": "שייק תות", "category": "שייקים", "price": 38},
    {"name": "שייק בננה", "category": "שייקים", "price": 38},
    {"name": "שייק מלון", "category": "שייקים", "price": 38},
    {"name": "שייק תמר", "category": "שייקים", "price": 38},
    {"name": "שייק אננס", "category": "שייקים", "price": 38},
    
    # אוכל
    {"name": "טוסט בהרכבה", "category": "אוכל", "price": 45},
    {"name": "פיצה בהרכבה", "category": "אוכל", "price": 60},
    {"name": "כריך", "category": "אוכל", "price": 35},
    {"name": "סלט בהרכבה", "category": "אוכל", "price": 55},
    {"name": "פופקורן", "category": "אוכל", "price": 10},
    
    # קינוחים
    {"name": "כדורי שוקולד (2 יחידות)", "category": "קינוחים", "price": 15},
    {"name": "כדורי תמרים (2 יחידות)", "category": "קינוחים", "price": 15},
    {"name": "בראוניז", "category": "קינוחים", "price": 15},
    {"name": "מאפינס", "category": "קינוחים", "price": 15},
    {"name": "עוגת ביסקוויטים בגביע (150 סמ\"ק)", "category": "קינוחים", "price": 15},
    {"name": "עוגיות (3 יחידות)", "category": "קינוחים", "price": 15}
]

# Set defaults
for item in new_items:
    item["business_id"] = BID
    item["english_name"] = item["name"]

# 3. Insert items
insert_url = f"{SUPABASE_URL}/rest/v1/menu_items"
ins_res = requests.post(insert_url, headers=HEADERS, json=new_items)
if ins_res.status_code < 300:
    print(f"✅ Successfully inserted {len(new_items)} clean menu items!")
else:
    print(f"❌ Insertion failed: {ins_res.status_code} — {ins_res.text}")
