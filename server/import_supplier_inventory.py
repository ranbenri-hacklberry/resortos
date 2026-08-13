"""
Supplier Inventory Importer v2 — Deduplication + Alternative Suppliers

Rules:
  - One row per unique item name
  - First supplier encountered = primary (stored in 'supplier')
  - Additional suppliers stored in 'alternative_suppliers' text[]
  - Primary supplier NEVER appears in alternative_suppliers (Anti-Redundancy)
  - Empty categories get assigned based on supplier context
  - "חדפ" / "חד פעמי-" unified to "חד פעמי"

Usage: python3 import_supplier_inventory.py <business_id>
"""

import sys
import os
import re
import requests
from docx import Document
from collections import OrderedDict

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

SUPPLIER_DIR = os.path.join(os.path.expanduser("~"), "Documents", "Max", "supplier_data")
BUSINESS_ID = sys.argv[1] if len(sys.argv) > 1 else None

# --- Category normalization ---
CATEGORY_NORMALIZE = {
    'חדפ': 'חד פעמי',
    'חד פעמי-': 'חד פעמי',
    'ירקות לא בקירור': 'ירקות',
    'ירקות קירור': 'ירקות',
    'מיצים גדולים \n(לשייקים)': 'מיצים',
    'מיצים גדולים': 'מיצים',
}

# Fallback categories by supplier (for items with no category in the docx)
SUPPLIER_DEFAULT_CATEGORY = {
    'דאדא': 'קפה ואספקה',
    'פיצה מרקט': 'מרכיבי פיצה',
}

# --- Unit overrides for specific items ---
UNIT_OVERRIDES = {
    'מלח אישי': 'יח׳',
    '"לובקה" – עדשי שוקולד חלב': 'ק"ג',
    'לובקה': 'ק"ג',
    'אגוז מוסקט': 'גרם',
    'פלפל שחור': 'גרם',
    'אורגנו': 'גרם',
    'קוקוס': 'גרם',
    'סלמון מעושן': 'גרם',
    'שוקולית': 'גרם',
    'אגוזי מלך טחונים': 'גרם',
    'ערמונים': 'גרם',
    'גבנצ': 'גרם',
    'רוטב עגבניות': 'גרם',
    'רוטב פסטו': 'גרם',
    'ממרח שוקולד לבן': 'גרם',
    'ממרח קקאו ולוז': 'גרם',
    'ג\'עלה': 'גרם',
    'גבינת שמנת': 'גרם',
    'אבקת אייס קפה': 'גרם',
    'אבקת סוכר': 'ק"ג',
}


def extract_supplier(filename):
    base = os.path.splitext(filename)[0]
    base = re.sub(r'טבלת (מלאי|ספירת מלאי)\s*', '', base)
    base = re.sub(r'-?\s*מעודכן.*$', '', base)
    return base.strip(' -')


def guess_unit(item_name, category):
    # Check overrides first
    if item_name in UNIT_OVERRIDES:
        return UNIT_OVERRIDES[item_name]

    units_map = {
        'חלב': 'ליטר', 'פרה': 'ליטר', 'סויה': 'ליטר', 'שיבולת': 'ליטר',
        'מים': 'יח׳', 'סודה': 'יח׳', 'קולה': 'יח׳', 'בירה': 'יח׳',
        'שוופס': 'יח׳', 'ספרינג': 'יח׳',
        'ביצים': 'יח׳', 'גלידת': 'יח׳',
        'כוס': 'יח׳', 'כוסות': 'יח׳', 'מכסה': 'יח׳',
        'שקיות': 'יח׳', 'ערכות': 'יח׳', 'מגשי': 'יח׳', 'כפפות': 'יח׳',
        'גליל': 'יח׳', 'נייר': 'יח׳', 'סבון': 'יח׳', 'מפיות': 'יח׳',
        'קשים': 'יח׳', 'מגבונים': 'יח׳',
        'קפה': 'ק"ג', 'סוכר': 'ק"ג', 'מלח': 'ק"ג', 'פסטה': 'ק"ג',
        'שמן': 'ליטר', 'תרכיז': 'ליטר',
        'לחם': 'יח׳', 'טוסט': 'יח׳', 'בצק': 'יח׳',
    }

    for key, unit in units_map.items():
        if key in item_name:
            return unit

    cat = (category or '').lower()
    if 'ירק' in cat:
        return 'ק"ג'
    if 'גבינ' in cat:
        return 'יח׳'
    if 'פירות קפוא' in cat:
        return 'ק"ג'
    if 'מאפ' in cat or 'קינוח' in cat or 'לחמ' in cat:
        return 'יח׳'
    if 'מיצ' in cat:
        return 'ליטר'
    if 'חד' in cat:
        return 'יח׳'
    if 'שתי' in cat or 'אלכוהול' in cat:
        return 'יח׳'

    return 'יח׳'


def normalize_category(cat, supplier):
    """Normalize category name, assign defaults for empty."""
    if not cat or cat.strip() == '':
        return SUPPLIER_DEFAULT_CATEGORY.get(supplier, 'כללי')
    cat = cat.strip()
    return CATEGORY_NORMALIZE.get(cat, cat)


def parse_all_suppliers():
    """Parse all docx files → deduplicated item list with alternative suppliers."""
    raw_items = []

    for filename in sorted(os.listdir(SUPPLIER_DIR)):
        if not filename.endswith('.docx'):
            continue
        if 'ספירת מלאי' in filename:
            continue

        supplier = extract_supplier(filename)
        if not supplier:
            continue

        filepath = os.path.join(SUPPLIER_DIR, filename)
        doc = Document(filepath)
        current_category = ''

        for table in doc.tables:
            for row_idx, row in enumerate(table.rows):
                cells = [cell.text.strip() for cell in row.cells]

                if row_idx == 0 and len(cells) > 0 and cells[0] == 'קבוצה':
                    continue

                if len(cells) >= 2:
                    cat, item = cells[0], cells[1]
                else:
                    continue

                if cat:
                    current_category = cat
                if not item:
                    continue

                norm_cat = normalize_category(current_category, supplier)
                unit = guess_unit(item, norm_cat)

                raw_items.append({
                    'name': item,
                    'category': norm_cat,
                    'supplier': supplier,
                    'unit': unit,
                })

        count = sum(1 for i in raw_items if i['supplier'] == supplier)
        print(f"  📄 {supplier}: {count} פריטים")

    # --- Deduplication: merge by name ---
    merged = OrderedDict()
    for item in raw_items:
        name = item['name']
        if name not in merged:
            merged[name] = {
                'name': name,
                'category': item['category'],
                'supplier': item['supplier'],  # primary
                'alternative_suppliers': [],
                'unit': item['unit'],
                'current_stock': 0,
                'cost_per_unit': 0,
            }
        else:
            # Same item, different supplier → add as alternative
            existing = merged[name]
            alt_supplier = item['supplier']
            # Anti-Redundancy: never add primary to alternatives
            if alt_supplier != existing['supplier'] and alt_supplier not in existing['alternative_suppliers']:
                existing['alternative_suppliers'].append(alt_supplier)

    return list(merged.values())


def delete_existing(business_id):
    url = f"{SUPABASE_URL}/rest/v1/inventory_items?business_id=eq.{business_id}"
    res = requests.delete(url, headers=HEADERS)
    return res.status_code < 300


def insert_items(items, business_id):
    records = []
    for item in items:
        records.append({
            'name': item['name'],
            'category': item['category'],
            'supplier': item['supplier'],
            'alternative_suppliers': item['alternative_suppliers'],
            'unit': item['unit'],
            'current_stock': 0,
            'cost_per_unit': 0,
            'business_id': business_id,
        })

    url = f"{SUPABASE_URL}/rest/v1/inventory_items"
    h = {**HEADERS, "Prefer": "return=representation"}

    inserted = 0
    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        res = requests.post(url, headers=h, json=batch)
        if res.status_code < 300:
            inserted += len(batch)
        else:
            print(f"  ⚠️  Batch error: {res.text[:200]}")
            for r in batch:
                res2 = requests.post(url, headers={**HEADERS, "Prefer": "return=minimal"}, json=r)
                if res2.status_code < 300:
                    inserted += 1
                else:
                    print(f"     ❌ {r['name']}: {res2.text[:100]}")

    return inserted


def main():
    if not BUSINESS_ID:
        print("Usage: python3 import_supplier_inventory.py <business_id>")
        print("Example: python3 import_supplier_inventory.py 11111111-1111-1111-1111-111111111111")
        sys.exit(1)

    print("=" * 60)
    print("  📦 Supplier Inventory Importer v2 (Dedup + Alt Suppliers)")
    print("=" * 60)
    print(f"  Business: {BUSINESS_ID}")
    print(f"  Source:   {SUPPLIER_DIR}")

    # Step 1: Parse & Deduplicate
    print("\n📄 Parsing supplier files...")
    items = parse_all_suppliers()

    suppliers = set(i['supplier'] for i in items)
    dupes = [i for i in items if len(i['alternative_suppliers']) > 0]

    print(f"\n📊 Results:")
    print(f"   Unique items:  {len(items)}")
    print(f"   Suppliers:     {len(suppliers)}")
    print(f"   Multi-source:  {len(dupes)} items with alternative suppliers")

    if dupes:
        print(f"\n🔄 Items with multiple suppliers:")
        for d in dupes:
            print(f"   {d['name']:<25} primary: {d['supplier']:<15} alt: {', '.join(d['alternative_suppliers'])}")

    # Summary by category
    print(f"\n📦 By category:")
    cats = {}
    for item in items:
        cats.setdefault(item['category'], []).append(item['name'])
    for cat in sorted(cats.keys()):
        print(f"   {cat}: {len(cats[cat])} items")

    # Confirm
    print(f"\n⚠️  This will DELETE all existing inventory for business {BUSINESS_ID[:8]}...")
    confirm = input("   Continue? (y/N): ").strip().lower()
    if confirm != 'y':
        print("   Cancelled.")
        return

    # Step 2: Delete
    print("\n🗑️  Deleting existing inventory...")
    if delete_existing(BUSINESS_ID):
        print("   ✅ Deleted")
    else:
        print("   ⚠️  Delete may have failed, continuing anyway...")

    # Step 3: Insert
    print("\n📥 Inserting new inventory...")
    count = insert_items(items, BUSINESS_ID)
    print(f"   ✅ Inserted {count}/{len(items)} items")

    # Step 4: Reminder
    print("\n🔄 Next steps:")
    print("   1. python3 batch_ingest.py  (re-embed for AI search)")
    print("   2. python3 generate_foodcost_excel.py " + BUSINESS_ID)

    print("\n" + "=" * 60)
    print("  ✅ Import complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
