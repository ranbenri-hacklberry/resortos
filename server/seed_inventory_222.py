"""Seed inventory for business 22222222"""
import requests, json

SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}
BID = "22222222-2222-2222-2222-222222222222"

items = [
    # יבשים
    {"name": "חומוס", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "קינואה לבנה", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "קוואקר שלם", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "קמח לבן", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "סוכר לבן", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "סוכר חום", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מלח גס", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מלח דק", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חומץ טבעי", "category": "יבשים", "unit": 'מ"ל', "base_unit": 'מ"ל', "display_unit": 'מ"ל', "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "שום גבישי טחון", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "רוטב סויה", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "גאלון"},
    {"name": "רוטב צ׳ילי מתוק", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "גאלון"},
    {"name": "אטריות שעועית", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "חבילות"},
    {"name": "רסק עגבניות", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קרטון"},
    {"name": "קורנפלור", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "סירופ למלבי", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "קפה שחור", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "אגוזי מלך", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "קשיו", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "שקדים", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "בונדוק", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "שמן קנולה", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קרטון, לא סויה!"},
    {"name": "חמוציות ללא סוכר", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "פודינג אוסם", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "ביסקוויטים גטניו", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קרטון, לא אוסם!"},
    {"name": "ממרח תמרים", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קרטון"},
    {"name": "קקאו", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "קרם קוקוס", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קרטון ליטר, לא פחיות"},
    {"name": "פטריות שיטאקי מיובשות", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "חבילות"},
    {"name": "אורז", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "שקים"},
    {"name": "קוקוס קלוי", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "חלב שיבולת שועל", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חלב סויה", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חלב שקדים", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    # מוצרי חלב
    {"name": "חמאה", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 200},
    {"name": "יוגורט", "category": "מוצרי חלב", "unit": 'מ"ל', "base_unit": 'מ"ל', "display_unit": 'מ"ל', "inventory_count_step": 500, "weight_per_unit": 3000, "measurement_note": "3 ליטר"},
    {"name": "שמנת חמוצה", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חלב רגיל", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "פטינה יוונית", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "גבינה צהובה מגוררת", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "גבינה צהובה פרוסה", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "גבינה צהובה בבלוק", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "גבינת שמנת טבעית", "category": "מוצרי חלב", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    # ירקות
    {"name": "גזר", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "כרוב לבן", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "כרוב אדום", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "קישוא", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מלפפון", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חציל", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "שרי", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חסה", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "רוקט", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "שקית"},
    {"name": "פטרוזיליה", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "שקית"},
    {"name": "תפוח אדמה", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "עגבניות", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "בטטות", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "פלפל אדום", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "פלפל צהוב", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "בצל סגול", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "בצל לבן", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "פטריות", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "צנוניות", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "שום קלוף", "category": "ירקות", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "תפוחי עץ פינק ליידי", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "בננות", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "אבטיח", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מלון", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "ענבים", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "אפרסק", "category": "ירקות", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    # חד פעמי
    {"name": "נייר ידיים גליל גדול", "category": "חד פעמי", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "כפפות חד פעמיות S", "category": "חד פעמי", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קופסה"},
    {"name": "כפפות חד פעמיות M", "category": "חד פעמי", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קופסה"},
    {"name": "כפפות חד פעמיות L", "category": "חד פעמי", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "measurement_note": "קופסה"},
    # שימורים A10 (2-3 קג)
    {"name": "תירס שימורים A10", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 2500, "measurement_note": "A10 ~2.5 קג"},
    {"name": "פטריות שימורים A10", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 2500, "measurement_note": "A10 ~2.5 קג"},
    {"name": "רסק עגבניות A10", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 2500, "measurement_note": "A10 ~2.5 קג"},
    {"name": "רוטב פיצה A10", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 2500, "measurement_note": "A10 ~2.5 קג"},
    {"name": "עגבניות מרוסקות A10", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 2500, "measurement_note": "A10 ~2.5 קג"},
    # שימורים גדולים (9 קג)
    {"name": "מלפפונים בחומץ 9 קג", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 9000},
    {"name": "פלפל שיפקה 9 קג", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 9000},
    {"name": "זיתים מגולענים 9 קג", "category": "שימורים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 9000},
    # יבשים נוספים
    {"name": "טונה בשקית", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 1000},
    {"name": "פתיתי סויה", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 1000, "weight_per_unit": 1000, "measurement_note": "שק ~50 קג"},
    {"name": "רצועות סויה", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 1000, "weight_per_unit": 1000, "measurement_note": "שק"},
    {"name": "אורז תאילנדי", "category": "יבשים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 500, "weight_per_unit": 5000, "measurement_note": "שקית 5 קג"},
    {"name": "סוכר 1 קג", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 1000},
    {"name": "סוכר דמררה", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1, "weight_per_unit": 1000},
    {"name": "מלח הימלאיה", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "חומץ בלסמי", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מיץ לימון משומר", "category": "יבשים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    # ממרחים / דלי
    {"name": "מיונז דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "טחינה דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "עמבה דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "ממרח שוקולד דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "ממרח שוקולד פרווה דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "ריבה דלי", "category": "ממרחים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    # תבלינים (בקילו)
    {"name": "כמון", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "פפריקה מתוקה", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "פפריקה חריפה", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "קנמון", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "קארי", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "כורכום", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "בהרט", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "תבלין שווארמה", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "ראס אל חנות", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "פלפל שחור גרוס", "category": "תבלינים", "unit": "גרם", "base_unit": "גרם", "display_unit": "גרם", "inventory_count_step": 250, "weight_per_unit": 1000},
    {"name": "תמצית וניל", "category": "תבלינים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
    {"name": "מי ורדים", "category": "תבלינים", "unit": "יח׳", "base_unit": "יח׳", "display_unit": "יח׳", "inventory_count_step": 1},
]

# Add defaults
for item in items:
    item["business_id"] = BID
    item["current_stock"] = 0
    item.setdefault("weight_per_unit", 0)
    item.setdefault("measurement_note", "")

# Insert
url = f"{SUPABASE_URL}/rest/v1/inventory_items"
r = requests.post(url, headers=HEADERS, json=items)
if r.status_code < 300:
    print(f"✅ Inserted {len(items)} items for business 222...")
else:
    print(f"❌ Error: {r.status_code} — {r.text[:300]}")
    # Try one by one
    ok = 0
    for item in items:
        r2 = requests.post(url, headers=HEADERS, json=item)
        if r2.status_code < 300:
            ok += 1
        else:
            print(f"  ❌ {item['name']}: {r2.text[:100]}")
    print(f"  Inserted {ok}/{len(items)} individually")

print(f"\n📊 Now generate Excel:")
print(f"  python3 generate_foodcost_excel.py 22222222-2222-2222-2222-222222222222")
