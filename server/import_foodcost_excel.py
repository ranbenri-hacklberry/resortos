"""
Food Cost Excel Importer — Reads filled Excel back into Supabase.

Updates:
  1. inventory_items.cost_per_unit (from חומרי גלם sheet)
  2. recipes table (from מתכונים cross-reference sheet)

Usage: python3 import_foodcost_excel.py <path_to_excel>
"""

import sys
import requests
import json

try:
    from openpyxl import load_workbook
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl'])
    from openpyxl import load_workbook

# --- Config ---
SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}


def update_record(table, record_id, data):
    """Update a single record in Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{record_id}"
    res = requests.patch(url, headers=HEADERS, json=data)
    return res.status_code < 300


def upsert_records(table, records):
    """Upsert multiple records in Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    res = requests.post(url, headers=h, json=records)
    return res.status_code < 300, res.text


def fetch_lookup(table, select, business_id=None):
    """Build a name→id lookup from a table."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if business_id:
        url += f"&business_id=eq.{business_id}"
    res = requests.get(url, headers=HEADERS)
    if res.status_code == 200:
        return {r['name']: r['id'] for r in res.json() if 'name' in r}
    return {}


def import_costs(wb, business_id=None):
    """Import cost_per_unit + packaging from חומרי גלם sheet."""
    ws = wb["חומרי גלם"]
    
    # Build lookup: inventory name → id
    lookup = fetch_lookup("inventory_items", "id,name", business_id)
    if not lookup:
        print("  ❌ Could not fetch inventory lookup!")
        return 0, 0
    
    updated_costs = 0
    updated_packaging = 0
    for row in range(4, ws.max_row + 1):
        name = ws.cell(row=row, column=2).value
        cost = ws.cell(row=row, column=5).value
        
        # Packaging columns (8=כמות באריזה, 9=סוג אריזה, 10=אריזות בארגז)
        pkg_qty = ws.cell(row=row, column=8).value
        pkg_type = ws.cell(row=row, column=9).value
        pkg_per_case = ws.cell(row=row, column=10).value
        
        if not name:
            continue
        
        record_id = lookup.get(name.strip())
        if not record_id:
            continue
        
        update_data = {}
        
        # Cost update
        if cost and float(cost) > 0:
            update_data["cost_per_unit"] = float(cost)
        
        # Packaging JSONB
        if pkg_qty or pkg_type or pkg_per_case:
            packaging = {}
            if pkg_qty:
                packaging["units_per_package"] = int(float(pkg_qty))
            if pkg_type:
                packaging["package_type"] = str(pkg_type).strip()
            if pkg_per_case:
                packaging["packages_per_case"] = int(float(pkg_per_case))
            if packaging:
                update_data["packaging"] = packaging
                updated_packaging += 1
        
        if update_data:
            if update_record("inventory_items", record_id, update_data):
                if "cost_per_unit" in update_data:
                    updated_costs += 1
            else:
                print(f"  ❌ Failed to update '{name}'")
    
    return updated_costs, updated_packaging


def import_recipes(wb, business_id=None):
    """Import recipes from מתכונים cross-reference sheet."""
    ws = wb["מתכונים"]
    
    # Build lookups
    menu_lookup = fetch_lookup("menu_items", "id,name", business_id)
    inv_lookup = fetch_lookup("inventory_items", "id,name", business_id)
    
    if not menu_lookup or not inv_lookup:
        print("  ❌ Could not fetch lookups!")
        return 0
    
    # Read inventory headers (row 4, columns B onwards)
    inv_names = []
    for col in range(2, ws.max_column + 1):
        val = ws.cell(row=4, column=col).value
        if val:
            inv_names.append((col, val.strip()))
        else:
            break
    
    # Read recipe data (rows 6+, column A = menu item name)
    recipes = []
    for row in range(6, ws.max_row + 1):
        menu_name = ws.cell(row=row, column=1).value
        if not menu_name:
            continue
        menu_name = menu_name.strip()
        menu_id = menu_lookup.get(menu_name)
        if not menu_id:
            continue
        
        ingredients = []
        for col, inv_name in inv_names:
            qty = ws.cell(row=row, column=col).value
            if qty and float(qty) > 0:
                inv_id = inv_lookup.get(inv_name)
                if inv_id:
                    ingredients.append({
                        "name": inv_name,
                        "inventory_item_id": inv_id,
                        "quantity": float(qty)
                    })
        
        if ingredients:
            recipes.append({
                "menu_item_id": menu_id,
                "title": menu_name,
                "ingredients": ingredients,
                "business_id": business_id
            })
    
    if not recipes:
        print("  ℹ️  No recipes found in sheet (all cells empty)")
        return 0
    
    # Upsert recipes
    ok, msg = upsert_records("recipes", recipes)
    if ok:
        return len(recipes)
    else:
        print(f"  ⚠️  Upsert issue: {msg[:200]}")
        # Fallback: insert one by one
        inserted = 0
        for r in recipes:
            url = f"{SUPABASE_URL}/rest/v1/recipes"
            res = requests.post(url, headers=HEADERS, json=r)
            if res.status_code < 300:
                inserted += 1
            else:
                print(f"  ❌ Failed: {r['title']} — {res.text[:100]}")
        return inserted


DAY_MAP_HE = {'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6}

def import_schedule(wb, business_id=None):
    """Import supplier schedule from לוח ספקים sheet."""
    ws = wb["לוח ספקים"]
    
    # Parse rows into schedule per supplier
    schedules = {}
    for row in range(4, ws.max_row + 1):
        supplier_name = str(ws.cell(row=row, column=1).value or '').strip()
        day_name = str(ws.cell(row=row, column=2).value or '').strip()
        day_num = ws.cell(row=row, column=3).value
        lead_days = ws.cell(row=row, column=4).value
        cutoff = str(ws.cell(row=row, column=5).value or '12:00').strip()
        notes = str(ws.cell(row=row, column=6).value or '').strip()

        if not supplier_name or day_name == '—':
            continue

        # Convert 1-based display → 0-based DB
        if day_num is not None and isinstance(day_num, (int, float)):
            day_db = int(day_num) - 1
        elif day_name in DAY_MAP_HE:
            day_db = DAY_MAP_HE[day_name] - 1
        else:
            print(f"  ⚠️  Skipping {supplier_name}: unknown day '{day_name}'")
            continue

        if day_db < 0 or day_db > 5:
            continue

        if supplier_name not in schedules:
            schedules[supplier_name] = []
        
        entry = {"day": day_db, "lead_days": int(lead_days or 1), "cutoff": cutoff}
        if notes and notes != 'None':
            entry["notes"] = notes
        schedules[supplier_name].append(entry)

    # Update each supplier
    updated = 0
    for name, schedule in schedules.items():
        url = f"{SUPABASE_URL}/rest/v1/suppliers?name=eq.{requests.utils.quote(name)}"
        if business_id:
            url += f"&business_id=eq.{business_id}"
        payload = {"delivery_schedule": schedule}
        r = requests.patch(url, headers=HEADERS, json=payload)
        if r.status_code < 300:
            updated += 1
        else:
            print(f"  ❌ {name}: {r.text[:100]}")

    return updated


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_foodcost_excel.py <excel_file> [business_id]")
        print("Example: python3 import_foodcost_excel.py /Users/user/Documents/Max/foodcost_22222222_20260505.xlsx 22222222-2222-2222-2222-222222222222")
        sys.exit(1)
    
    filepath = sys.argv[1]
    business_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    print("=" * 55)
    print("  📥 Food Cost Excel Importer")
    print("=" * 55)
    print(f"  File: {filepath}")
    print(f"  Business: {business_id or 'ALL'}")
    
    wb = load_workbook(filepath, data_only=True)
    sheets = wb.sheetnames
    print(f"  Sheets: {', '.join(sheets)}")
    
    # Step 1: Import costs + packaging
    if "חומרי גלם" in sheets:
        print("\n📦 Importing inventory costs + packaging...")
        costs, pkgs = import_costs(wb, business_id)
        print(f"   ✅ Updated {costs} cost values, {pkgs} packaging definitions")
    
    # Step 2: Import recipes
    if "מתכונים" in sheets:
        print("\n🍳 Importing recipes...")
        count = import_recipes(wb, business_id)
        print(f"   ✅ Imported {count} recipes")
    
    # Step 3: Import supplier schedule
    if "לוח ספקים" in sheets:
        print("\n🗓️  Importing supplier schedule...")
        count = import_schedule(wb, business_id)
        print(f"   ✅ Updated {count} suppliers")
    
    # Step 4: Re-embed (so vector search finds the updated data)
    print("\n🔄 Re-indexing for vector search...")
    try:
        res = requests.post("http://127.0.0.1:8070/v1/search", 
            json={"query": "test", "table": "inventory_items", "limit": 1}, timeout=3)
        if res.status_code == 200:
            print("   ✅ Zoe Engine is running — vectors will update on next ingest")
            print("   💡 Run: python3 batch_ingest.py  (to re-embed updated records)")
        else:
            print("   ⚠️  Zoe Engine returned error")
    except:
        print("   ⚠️  Zoe Engine not running — run batch_ingest.py after starting it")
    
    print("\n" + "=" * 55)
    print("  ✅ Import complete!")
    print("  💡 Next: python3 batch_ingest.py (re-embed for AI search)")
    print("=" * 55)


if __name__ == "__main__":
    main()
