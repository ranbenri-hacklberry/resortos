"""
Food Cost Excel Generator v2 — Pulls live data from Supabase and builds
an interactive Excel workbook for recipe/ingredient cross-referencing.

Sheets:
  1. מנות (Menu Items) — pre-filled from DB
  2. חומרי גלם (Inventory) — pre-filled with weight_per_unit
  3. מתכונים (Recipes) — rows=ingredients, cols=dishes (transposed)
  4. פודקוסט (Food Cost) — auto-calculated from recipes

Usage: python3 generate_foodcost_excel.py [business_id]
"""

import sys
import os
import requests
import json
from datetime import datetime

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.formatting.rule import CellIsRule
except ImportError:
    print("Installing openpyxl...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl'])
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.formatting.rule import CellIsRule

# --- Config ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU")
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
OUTPUT_DIR = os.path.join(os.path.expanduser("~"), "Documents", "Max")

BUSINESS_ID = sys.argv[1] if len(sys.argv) > 1 else None

# --- Styles ---
HEADER_FILL = PatternFill(start_color="10A37F", end_color="10A37F", fill_type="solid")
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=11)
TITLE_FONT = Font(name="Arial", bold=True, size=14, color="10A37F")
DATA_FONT = Font(name="Arial", size=11)
HINT_FONT = Font(name="Arial", size=9, color="888888", italic=True)
MONEY_FORMAT = '#,##0.00 ₪'
PERCENT_FORMAT = '0.0%'
THIN_BORDER = Border(
    left=Side(style='thin', color='E0E0E0'),
    right=Side(style='thin', color='E0E0E0'),
    top=Side(style='thin', color='E0E0E0'),
    bottom=Side(style='thin', color='E0E0E0')
)
ALT_ROW = PatternFill(start_color="F5F5F5", end_color="F5F5F5", fill_type="solid")
EMPTY_COST = PatternFill(start_color="FFF3CD", end_color="FFF3CD", fill_type="solid")
UNIT_COL_FILL = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")


def fetch_table(table, select="*"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&order=name"
    if BUSINESS_ID:
        url += f"&business_id=eq.{BUSINESS_ID}"
    res = requests.get(url, headers=HEADERS)
    return res.json() if res.status_code == 200 else []


def style_header(ws, row, max_col):
    for col in range(1, max_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = THIN_BORDER


def auto_width(ws, min_w=10, max_w=30):
    for col in ws.columns:
        letter = get_column_letter(col[0].column)
        max_len = min_w
        for cell in col:
            if cell.value:
                max_len = max(max_len, min(len(str(cell.value)) + 3, max_w))
        ws.column_dimensions[letter].width = max_len


# =====================================================
# Sheet 1: מנות
# =====================================================
def build_menu_sheet(wb, items):
    ws = wb.active
    ws.title = "מנות"
    ws.sheet_view.rightToLeft = True

    ws.merge_cells('A1:E1')
    ws['A1'] = f"תפריט — {len(items)} מנות"
    ws['A1'].font = TITLE_FONT

    headers = ['#', 'שם מנה', 'שם באנגלית', 'קטגוריה', 'מחיר מכירה']
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    for i, item in enumerate(items, 1):
        r = i + 3
        ws.cell(r, 1, i).font = DATA_FONT
        ws.cell(r, 2, item.get('name', '')).font = DATA_FONT
        ws.cell(r, 3, item.get('english_name', '')).font = DATA_FONT
        ws.cell(r, 4, item.get('category', '')).font = DATA_FONT
        pc = ws.cell(r, 5, item.get('price', 0))
        pc.font = DATA_FONT
        pc.number_format = MONEY_FORMAT
        for c in range(1, 6):
            ws.cell(r, c).border = THIN_BORDER
            if i % 2 == 0:
                ws.cell(r, c).fill = ALT_ROW

    auto_width(ws)


# =====================================================
# Sheet 2: חומרי גלם (with weight_per_unit)
# =====================================================
def build_inventory_sheet(wb, items):
    ws = wb.create_sheet("חומרי גלם")
    ws.sheet_view.rightToLeft = True

    ws.merge_cells('A1:K1')
    ws['A1'] = f"חומרי גלם — {len(items)} פריטים"
    ws['A1'].font = TITLE_FONT

    headers = ['#', 'שם חומר', 'קטגוריה', 'יחידה', 'עלות ליחידה', 'משקל ליח׳ (גרם)',
               'מלאי נוכחי', 'כמות באריזה', 'סוג אריזה', 'אריזות בארגז', 'הערה']
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    PACK_FILL = PatternFill(start_color="E3F2FD", end_color="E3F2FD", fill_type="solid")

    for i, item in enumerate(items, 1):
        r = i + 3
        ws.cell(r, 1, i).font = DATA_FONT
        ws.cell(r, 2, item.get('name', '')).font = DATA_FONT
        ws.cell(r, 3, item.get('category', '')).font = DATA_FONT
        ws.cell(r, 4, item.get('unit', '')).font = DATA_FONT

        # Cost — highlight yellow if 0
        cost = float(item.get('cost_per_unit', 0) or 0)
        cc = ws.cell(r, 5, cost if cost > 0 else None)
        cc.font = DATA_FONT
        cc.number_format = MONEY_FORMAT
        if cost == 0:
            cc.fill = EMPTY_COST

        # Weight per unit
        wpu = float(item.get('weight_per_unit', 0) or 0)
        wc = ws.cell(r, 6, wpu if wpu > 0 else None)
        wc.font = DATA_FONT
        if wpu > 0:
            wc.fill = UNIT_COL_FILL

        # Stock
        stock = float(item.get('current_stock', 0) or 0)
        ws.cell(r, 7, stock).font = DATA_FONT

        # Packaging columns (pre-fill from existing packaging JSONB)
        packaging = item.get('packaging') or {}
        pkg_qty = packaging.get('units_per_package', '')
        pkg_type = packaging.get('package_type', '')  # שרוול / קרטון / חבילה
        pkg_per_case = packaging.get('packages_per_case', '')

        pc1 = ws.cell(r, 8, pkg_qty if pkg_qty else None)
        pc1.font = DATA_FONT
        pc1.fill = PACK_FILL
        pc2 = ws.cell(r, 9, pkg_type if pkg_type else None)
        pc2.font = DATA_FONT
        pc2.fill = PACK_FILL
        pc3 = ws.cell(r, 10, pkg_per_case if pkg_per_case else None)
        pc3.font = DATA_FONT
        pc3.fill = PACK_FILL

        # Note
        note = item.get('measurement_note', '') or ''
        unit = item.get('unit', '')
        if wpu > 0 and unit == 'יח׳':
            note = f"1 יח׳ = {int(wpu)} גרם" + (f" | {note}" if note else "")
        ws.cell(r, 11, note).font = HINT_FONT

        for c in range(1, 12):
            ws.cell(r, c).border = THIN_BORDER
            fill = ws.cell(r, c).fill.start_color.rgb if ws.cell(r, c).fill.start_color else ''
            if i % 2 == 0 and fill not in ('FFF3CD', 'E8F5E9', 'E3F2FD'):
                ws.cell(r, c).fill = ALT_ROW

    auto_width(ws)


# =====================================================
# Sheet 3: מתכונים (TRANSPOSED: rows=ingredients, cols=dishes)
# =====================================================
def build_recipe_sheet(wb, menu_items, inv_items):
    ws = wb.create_sheet("מתכונים")
    ws.sheet_view.rightToLeft = True

    ws.merge_cells('A1:D1')
    ws['A1'] = "טבלת מתכונים — שורות: חומרי גלם | עמודות: מנות"
    ws['A1'].font = TITLE_FONT

    ws['A2'] = "💡 הזן כמות ביחידה של חומר הגלם (ראה עמודת 'יחידה')"
    ws['A2'].font = HINT_FONT

    # Row 4: headers — cols A,B = ingredient info, then one col per dish
    ws.cell(4, 1, "חומר גלם").font = HEADER_FONT
    ws.cell(4, 1).fill = HEADER_FILL
    ws.cell(4, 1).border = THIN_BORDER
    ws.cell(4, 2, "יחידה").font = HEADER_FONT
    ws.cell(4, 2).fill = HEADER_FILL
    ws.cell(4, 2).border = THIN_BORDER

    # Dish names as column headers (cols C onwards)
    for j, menu in enumerate(menu_items):
        col = j + 3
        cell = ws.cell(4, col, menu.get('name', ''))
        cell.font = Font(name="Arial", bold=True, color="FFFFFF", size=9)
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal='center', text_rotation=90, wrap_text=True)
        cell.border = THIN_BORDER

    # Row 5: dish prices (for reference)
    ws.cell(5, 1, "מחיר מכירה").font = HINT_FONT
    ws.cell(5, 2, "").font = HINT_FONT
    for j, menu in enumerate(menu_items):
        col = j + 3
        pc = ws.cell(5, col, menu.get('price', 0))
        pc.font = Font(name="Arial", size=8, color="10A37F", bold=True)
        pc.number_format = '0 ₪'
        pc.alignment = Alignment(horizontal='center')

    # Rows 6+: one row per ingredient
    for i, inv in enumerate(inv_items):
        row = i + 6
        name_cell = ws.cell(row, 1, inv.get('name', ''))
        name_cell.font = Font(name="Arial", bold=True, size=10)
        name_cell.border = THIN_BORDER

        unit_cell = ws.cell(row, 2, inv.get('unit', ''))
        unit_cell.font = Font(name="Arial", size=9, color="666666")
        unit_cell.fill = UNIT_COL_FILL
        unit_cell.alignment = Alignment(horizontal='center')
        unit_cell.border = THIN_BORDER

        if i % 2 == 0:
            name_cell.fill = ALT_ROW

        # Empty cells for recipe quantities
        for j in range(len(menu_items)):
            col = j + 3
            cell = ws.cell(row, col)
            cell.border = THIN_BORDER
            cell.number_format = '0.000'
            if i % 2 == 0:
                cell.fill = ALT_ROW

    # Freeze: fix ingredient names (cols A,B) and dish headers (row 5)
    ws.freeze_panes = 'C6'

    # Column widths
    ws.row_dimensions[4].height = 130
    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 8
    for j in range(len(menu_items)):
        ws.column_dimensions[get_column_letter(j + 3)].width = 5


# =====================================================
# Sheet 4: פודקוסט (auto-calculated)
# =====================================================
def build_foodcost_sheet(wb, menu_items, inv_items):
    ws = wb.create_sheet("פודקוסט")
    ws.sheet_view.rightToLeft = True

    ws.merge_cells('A1:G1')
    ws['A1'] = "ניתוח פודקוסט — מחושב אוטומטית מגיליון המתכונים"
    ws['A1'].font = TITLE_FONT

    headers = ['#', 'שם מנה', 'מחיר מכירה', 'עלות חומרים', 'רווח גולמי', '% פודקוסט', 'סטטוס']
    for c, h in enumerate(headers, 1):
        ws.cell(3, c, h)
    style_header(ws, 3, len(headers))

    inv_count = len(inv_items)

    # Conditional formatting colors
    RED_FILL = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    RED_FONT = Font(name="Arial", bold=True, size=11, color="DC2626")
    ORANGE_FILL = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    ORANGE_FONT = Font(name="Arial", bold=True, size=11, color="D97706")
    GREEN_FILL = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    GREEN_FONT = Font(name="Arial", bold=True, size=11, color="059669")

    for i, menu in enumerate(menu_items):
        r = i + 4
        recipe_col = get_column_letter(i + 3)  # column in recipe sheet for this dish

        ws.cell(r, 1, i + 1).font = DATA_FONT
        ws.cell(r, 2, menu.get('name', '')).font = DATA_FONT

        # Price from menu sheet
        ws.cell(r, 3).value = f"='מנות'!E{i + 4}"
        ws.cell(r, 3).number_format = MONEY_FORMAT
        ws.cell(r, 3).font = DATA_FONT

        # Food cost = SUM of (recipe_qty × ingredient_cost)
        parts = []
        for k in range(inv_count):
            recipe_ref = f"'מתכונים'!{recipe_col}{k + 6}"
            cost_ref = f"'חומרי גלם'!E{k + 4}"
            parts.append(f"{recipe_ref}*{cost_ref}")

        # Build formula in chunks to avoid Excel limits
        if inv_count <= 50:
            formula = f"={'+'.join(parts)}"
        else:
            chunks = [parts[k:k + 40] for k in range(0, len(parts), 40)]
            formula = "=" + "+".join([f"({'+'.join(ch)})" for ch in chunks])

        ws.cell(r, 4).value = formula
        ws.cell(r, 4).number_format = MONEY_FORMAT
        ws.cell(r, 4).font = DATA_FONT

        # Gross profit
        ws.cell(r, 5).value = f"=C{r}-D{r}"
        ws.cell(r, 5).number_format = MONEY_FORMAT
        ws.cell(r, 5).font = DATA_FONT

        # Food cost %
        ws.cell(r, 6).value = f"=IF(C{r}>0,D{r}/C{r},0)"
        ws.cell(r, 6).number_format = PERCENT_FORMAT
        ws.cell(r, 6).font = Font(name="Arial", bold=True, size=11)

        # Status
        ws.cell(r, 7).value = f'=IF(D{r}=0,"⏳ ממתין",IF(F{r}<=0.3,"✅ מצוין",IF(F{r}<=0.35,"👍 טוב",IF(F{r}<=0.4,"⚠️ גבולי","🔴 בעייתי"))))'
        ws.cell(r, 7).font = DATA_FONT

        for c in range(1, 8):
            ws.cell(r, c).border = THIN_BORDER
            if i % 2 == 0:
                ws.cell(r, c).fill = ALT_ROW

    # Summary
    sr = len(menu_items) + 5
    ws.cell(sr, 2, 'סה"כ ממוצע').font = Font(name="Arial", bold=True, size=12)
    ws.cell(sr, 3).value = f"=AVERAGE(C4:C{sr - 2})"
    ws.cell(sr, 3).number_format = MONEY_FORMAT
    ws.cell(sr, 3).font = Font(name="Arial", bold=True, size=12)
    ws.cell(sr, 4).value = f"=AVERAGE(D4:D{sr - 2})"
    ws.cell(sr, 4).number_format = MONEY_FORMAT
    ws.cell(sr, 6).value = f"=AVERAGE(F4:F{sr - 2})"
    ws.cell(sr, 6).number_format = PERCENT_FORMAT
    ws.cell(sr, 6).font = Font(name="Arial", bold=True, size=14, color="10A37F")

    # Conditional formatting on % column (F)
    last_data_row = len(menu_items) + 3
    pct_range = f"F4:F{last_data_row}"
    
    # 🔴 > 40% — problematic
    ws.conditional_formatting.add(pct_range, CellIsRule(
        operator='greaterThan', formula=['0.4'],
        fill=RED_FILL, font=RED_FONT
    ))
    # ⚠️ 35%-40% — borderline
    ws.conditional_formatting.add(pct_range, CellIsRule(
        operator='between', formula=['0.35', '0.4'],
        fill=ORANGE_FILL, font=ORANGE_FONT
    ))
    # ✅ ≤ 30% — excellent
    ws.conditional_formatting.add(pct_range, CellIsRule(
        operator='between', formula=['0.001', '0.3'],
        fill=GREEN_FILL, font=GREEN_FONT
    ))

    auto_width(ws)


# =====================================================
# Main
# =====================================================
def main():
    print("=" * 55)
    print("  🍽️  Food Cost Excel Generator v2")
    print("=" * 55)
    print(f"  Business: {BUSINESS_ID or 'ALL'}")

    print("\n📦 Fetching menu items...")
    menu_items = fetch_table("menu_items", "id,name,english_name,category,price")
    print(f"   Found {len(menu_items)} items")

    print("📦 Fetching inventory...")
    inv_items = fetch_table("inventory_items",
        "id,name,category,unit,cost_per_unit,current_stock,weight_per_unit,measurement_note")
    print(f"   Found {len(inv_items)} items")

    if not menu_items and not inv_items:
        print("\n❌ No data found!")
        return

    print("\n📊 Building Excel...")
    wb = Workbook()

    build_menu_sheet(wb, menu_items)
    print("   ✅ גיליון 1: מנות")

    build_inventory_sheet(wb, inv_items)
    print("   ✅ גיליון 2: חומרי גלם (+ משקל ליחידה)")

    build_recipe_sheet(wb, menu_items, inv_items)
    print("   ✅ גיליון 3: מתכונים (שורות=חומרים, עמודות=מנות)")

    build_foodcost_sheet(wb, menu_items, inv_items)
    print("   ✅ גיליון 4: פודקוסט (אוטומטי)")

    # Sheet 5: Supplier Schedule
    print("📦 Fetching suppliers...")
    suppliers = fetch_table("suppliers", "id,name,delivery_schedule")
    build_supplier_schedule_sheet(wb, suppliers)
    print(f"   ✅ גיליון 5: לוח ספקים ({len(suppliers)} ספקים)")

    bid = f"_{BUSINESS_ID[:8]}" if BUSINESS_ID else "_all"
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, f"foodcost{bid}_{ts}.xlsx")
    wb.save(path)

    print(f"\n✅ Saved: {path}")
    print(f"   📋 {len(inv_items)} חומרים × {len(menu_items)} מנות × {len(suppliers)} ספקים")
    print("\n💡 הוראות:")
    print("   1. גיליון 'חומרי גלם' → מלא עלות ליחידה (צהוב) + אריזות (כחול)")
    print("   2. גיליון 'מתכונים' → מלא כמות חומר לכל מנה")
    print("   3. גיליון 'פודקוסט' → מחושב אוטומטית! 🎉")
    print("   4. גיליון 'לוח ספקים' → ערוך ימי אספקה והזמנה")
    print("=" * 55)


# =====================================================
# Sheet 5: לוח ספקים (Supplier Schedule)
# =====================================================
DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']

def build_supplier_schedule_sheet(wb, suppliers):
    ws = wb.create_sheet("לוח ספקים")
    ws.sheet_view.rightToLeft = True

    ws.merge_cells('A1:F1')
    ws['A1'] = f"לוח ספקים — {len(suppliers)} ספקים"
    ws['A1'].font = TITLE_FONT

    # Instructions row
    ws.merge_cells('A2:F2')
    ws['A2'] = "ימים: 1=ראשון, 2=שני, 3=שלישי, 4=רביעי, 5=חמישי, 6=שישי (ללא שבת)"
    ws['A2'].font = Font(name='Arial', size=9, color='888888', italic=True)

    headers = ['ספק', 'יום אספקה', 'יום (1-6)', 'ימי הזמנה מראש', 'שעת סגירת הזמנה', 'הערות']
    for c, h in enumerate(headers, 1):
        ws.cell(row=3, column=c, value=h)
    style_header(ws, 3, len(headers))

    SCHED_FILL = PatternFill(start_color="FFF3E0", end_color="FFF3E0", fill_type="solid")
    row = 4

    for supplier in suppliers:
        schedule = supplier.get('delivery_schedule') or []
        if not schedule:
            # Empty row for suppliers without schedule
            ws.cell(row=row, column=1, value=supplier['name']).font = Font(name='Arial', bold=True)
            ws.cell(row=row, column=2, value='—')
            ws.cell(row=row, column=3, value='')
            ws.cell(row=row, column=4, value=1)
            ws.cell(row=row, column=5, value='12:00')
            ws.cell(row=row, column=6, value='לא מוגדר')
            for col in range(1, 7):
                ws.cell(row=row, column=col).border = THIN_BORDER
                ws.cell(row=row, column=col).fill = SCHED_FILL
            row += 1
            continue

        for entry in sorted(schedule, key=lambda x: x.get('day', 0)):
            day_db = entry.get('day', 0)  # 0-based from DB
            day_display = day_db + 1  # 1-based for display
            day_name = DAY_NAMES_HE[day_db] if 0 <= day_db <= 5 else '?'

            ws.cell(row=row, column=1, value=supplier['name']).font = Font(name='Arial', bold=True)
            ws.cell(row=row, column=2, value=day_name)
            ws.cell(row=row, column=3, value=day_display)
            ws.cell(row=row, column=4, value=entry.get('lead_days', 1))
            ws.cell(row=row, column=5, value=entry.get('cutoff', '12:00'))
            ws.cell(row=row, column=6, value=entry.get('notes', ''))

            for col in range(1, 7):
                ws.cell(row=row, column=col).border = THIN_BORDER
                ws.cell(row=row, column=col).alignment = Alignment(horizontal='center')
            ws.cell(row=row, column=1).alignment = Alignment(horizontal='right')

            row += 1

    # Column widths
    ws.column_dimensions['A'].width = 18
    ws.column_dimensions['B'].width = 14
    ws.column_dimensions['C'].width = 12
    ws.column_dimensions['D'].width = 20
    ws.column_dimensions['E'].width = 20
    ws.column_dimensions['F'].width = 22


if __name__ == "__main__":
    main()

