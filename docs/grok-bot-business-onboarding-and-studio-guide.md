# Grok Bot — מדריך קליטת עסקים, חיבור ל-Studio ועדכון תכנים ב-ResortOS

**מסמך הנחיות טכני ומבצעי לסוכנת המכירות והדאטה (Grok Bot)**  
תאריך עדכון: ספטמבר 2026 | מערכת: **ResortOS Ecosystem** (לשעבר HotelOS / CabinOS)  
יעד: קליטה ועדכון של ~600 מתחמי אירוח, צימרים, וילות ומלונות בוטיק בצפון (רמת הגולן, גליל עליון, גליל תחתון, סובב כנרת, עמק הירדן והגליל המערבי).

---

## 1. רקע ומטרת המערכת (System Overview)

מערכת **ResortOS** היא פלטפורמה היברידית ייחודית בענף האירוח היוקרתי בישראל, הבנויה משני חלקים מרכזיים החולקים מסד נתונים אחוד:
1. **זירת המרקטפלייס וההזמנות (Guest Marketplace)**:
   - קטלוג ציבורי מרהיב, מהיר ואיכותי של מתחמי אירוח מובילים בצפון.
   - סגירה ישירה מול בעלי המתחמים ב-**0% עמלת תיווך** (האורח מזמין ישירות או פונה בוואטסאפ לבעל הצימר).
2. **פורטל המארחים, מועדון הספקים ומערכת הניהול (B2B Host Portal)**:
   - מועדון הטבות ספקים (כביסה, ג'קוזי, קפה, מיזוג).
   - מדריכי חדר מאוירים (Playbook & Comic Guides) להדפסה A4 ולשידור לטלוויזיה.
   - אימות בעלות על מתחמים באמצעות OTP בוואטסאפ.

### תפקיד סוכנת המכירות (Grok Bot):
- לקלוט את כ-600 העסקים שגורדו ממקורות הרשת השונים (צימרים, וילות, ריזורטים).
- להזין אותם למסד הנתונים של ResortOS תחת סטטוס **`unclaimed_seeded`** (מתחם רשום ללא אימות), **`crm_status = 'Lead_Identified'`** ו-**`is_public = false`** (מוסתר כברירת מחדל מהמרקטפלייס הציבורי!).
- **כלל זכויות יוצרים ופרטיות מחמיר**: אין להזין תמונות מ-Weekend ב-`hero_image` (שדה זה נשאר `NULL`). קישורי תמונות נשמרים אך ורק בעמודה הפנימית `reference_image_urls` לצורכי ייחוס ואימות תפעולי של צוות המכירות, ולעולם אינם מוגשים לציבור.
- **המשמעות העסקית**: המתחם **אינו** מופיע במרקטפלייס הציבורי עד לקבלת אישור מארח! קלואי או רן פונים למארח בוואטסאפ עם קישור לתצוגה מקדימה פרטית (`?preview=true&slug=...`), מציגים לו את הכרטיס שהוכן עבורו כטיוטה יוקרתית, ומבקשים ממנו לאשר את הפרטים ולהעלות 2-3 תמונות יפות מקוריות שלו.
- לאחר אישור המארח (Stage-1 Yes) או השלמת אימות OTP, המתחם מועבר ל-**`is_public = true`** ו-**`crm_status = 'Portal_Free_Active'`**, ורק אז מתפרסם במרקטפלייס הציבורי להזמנות ישירות ב-0% עמלה.

---

## 2. מבנה האתר וארכיטקטורת הקוד (Codebase Architecture)

המערכת כתובה ב-**React + Vite + Tailwind CSS** עם מסד נתונים **PostgreSQL / Supabase**:

```
hotelos/
├── src/
│   ├── components/
│   │   ├── resortos/
│   │   │   ├── ResortOSApp.tsx          # האפליקציה המרכזית (מרקטפלייס + ספקים + מדריכים)
│   │   │   ├── ListingCardCTA.tsx       # כרטיסיית מתחם: וואטסאפ ישיר + אימות OTP
│   │   │   ├── ComicGuideRenderer.tsx   # מדריכי קומיקס A4 + שידור ל-TV
│   │   │   └── SupplierDealCard.tsx     # כרטיסיית דיל ספק B2B
│   ├── lib/
│   │   └── multiPropertyCatalog.js     # קטלוג סטטי/קאש של 12 מתחמי הדגל המובילים
│   └── main-resortos.tsx               # Entry point של אפליקציית ResortOS
├── migrations/
│   └── 001_cabinos_core.sql            # סכמת מסד הנתונים הרשמית (DDL)
├── scripts/
│   └── seed_cabinos.ts                 # סקריפט אכלוס ראשוני (Node.js/TypeScript)
├── resortos.html                       # דף הנחיתה הראשי של המרקטפלייס
└── docs/                               # תיעוד והנחיות סוכנים (Grok Bot Docs)
```

---

## 3. חיבור לסטודיו (Mac Studio & Supabase Studio Connection)

מקור האמת התפעולי של ResortOS רץ על גבי שרת **Mac Studio** פיזי ומאובטח.

### 🌐 פרטי הגישה והכתובות (Endpoints & Ports)

| שירות | כתובת מקומית | כתובת Tailscale / רשת | תפקיד |
|---|---|---|---|
| **Supabase Studio (UI)** | `http://127.0.0.1:54323` | `http://100.127.14.15:54323` | ממשק גרפי (Table Editor, SQL, Storage) |
| **PostgreSQL Database** | `127.0.0.1:54322` | `100.127.14.15:54322` | חיבור ישיר למסד הנתונים |
| **PostgREST / Kong API** | `http://127.0.0.1:54321` | `http://100.127.14.15:54321` | ממשק REST מהיר (API של Supabase) |
| **ResortOS Web App** | `http://localhost:3001` | `http://100.127.14.15:3001` | אפליקציית המרקטפלייס ולוח הבקרה |
| **דומיין ייצור (Public)** | `https://resortos.app` | - | השרת הציבורי של האורחים והעסקים |

### 🔑 פרטי התחברות למסד הנתונים המקומי (Studio):
- **Connection URI**:  
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (ב-Studio המקומי)  
  או דרך Tailscale: `postgresql://postgres:postgres@100.127.14.15:54322/postgres`
- **משתמש ברירת מחדל**: `postgres`
- **סיסמה**: `postgres`
- **מסד נתונים**: `postgres`
- **פורט**: `54322`

---

## 4. סכמת הנתונים המלאה (Database Schema)

על מנת ש-Grok Bot תוכל להזין עסקים ללא שגיאות RLS או מפתחות זרים, עליה לעדכן **שתי טבלאות ליבה**:
1. טבלת מתחמי הנופש: `properties`
2. טבלת היחידות והבקתות: `units` (חובה לפחות יחידה אחת לכל מתחם!)

---

### א. טבלת המתחמים: `properties`

| עמודה | סוג נתונים | חובה? | ברירת מחדל | תיאור והנחיות ל-Grok Bot |
|---|---|---|---|---|
| `id` | `UUID` | כן | `uuid_generate_v4()` | מזהה ייחודי של המתחם. |
| `slug` | `VARCHAR(128)` | **חובה** | - | מזהה URL ייחודי באנגלית ובאותיות קטנות (למשל `toscana-ramot`, `villa-colina-rosh-pina`). |
| `name` | `VARCHAR(255)` | **חובה** | - | שם המתחם באנגלית / תעתיק (למשל `Toscana Ramot`). |
| `hebrew_name` | `VARCHAR(255)` | **חובה** | - | שם המתחם המלא בעברית (למשל `טוסקנה ברמות`). |
| `tagline` | `TEXT` | לא | `NULL` | משפט שיווקי קצר וממכר (עד 15 מילים). |
| `description` | `TEXT` | לא | `NULL` | פסקת תיאור עשירה ומזמינה של המתחם, האווירה והנוף. |
| `region` | `VARCHAR(64)` | **חובה** | `'golan_heights'` | מזהה האזור באנגלית (ראו רשימת אזורים קנונית להלן). |
| `village` | `VARCHAR(64)` | **חובה** | - | שם היישוב בעברית (למשל: `רמות`, `חד נס`, `שאר ישוב`, `אמירים`, `ראש פינה`, `נוב`, `בוקעתא`). |
| `address` | `TEXT` | לא | `NULL` | כתובת מלאה או תיאור מיקום (למשל: `רחוב הברוש, מושב רמות`). |
| `geo_lat` | `NUMERIC(10, 7)` | מומלץ | `NULL` | קו רוחב GPS (בישראל: סביב `32.5` עד `33.3`). |
| `geo_lng` | `NUMERIC(10, 7)` | מומלץ | `NULL` | קו אורך GPS (בישראל: סביב `35.0` עד `35.9`). |
| `whatsapp_number` | `VARCHAR(32)` | **חובה** | - | מספר וואטסאפ בינלאומי נקי, ספרות בלבד (`9725XXXXXXXX`). משמש ללחיצה ישירה! |
| `phone` | `VARCHAR(32)` | מומלץ | - | מספר טלפון בפורמט מקומי קריא (`054-807-6123`). |
| `email` | `VARCHAR(255)` | לא | `NULL` | מייל ליצירת קשר עם המתחם. |
| `hero_image` | `TEXT` | **לא חובה בזריעה** | `NULL` | **זכויות יוצרים**: אין להזין תמונות מ-Weekend! נשאר `NULL` עד שהמארח מעלה תמונות בעצמו. |
| `reference_image_urls` | `TEXT[]` | לא | `ARRAY[]::TEXT[]` | קישורי תמונות פנימיים מ-Weekend לייחוס תפעולי של צוות המכירות. **לעולם אינו מוגש לציבור!** |
| `gallery_images` | `TEXT[]` | לא | `ARRAY[]::TEXT[]` | מערך קישורים לתמונות נוספות של המתחם (רק תמונות מאושרות). |
| `amenities` | `JSONB` | **חובה** | `'[]'::JSONB` | מערך מחרוזות JSON של מתקני המתחם (ראו מילון מתקנים). |
| `claimed_status` | `claim_status_enum`| **חובה** | `'unclaimed_seeded'` | **תמיד לקבוע ל-`unclaimed_seeded` עבור עסקים שגורדו!** |
| `crm_status` | `crm_status_enum`| **חובה** | `'Lead_Identified'` | סטטוס משפך המכירות: `Lead_Identified`, `Portal_Free_Active`, `Upsell_Pitch_Sent`, `Verified_Subscriber`, `Opt_Out`. |
| `is_public` | `BOOLEAN` | **חובה** | `FALSE` | **Default Hidden**: תמיד `FALSE` בזריעה! הופך ל-`TRUE` רק לאחר אישור המארח / אדמין. |
| `source` | `VARCHAR(64)` | לא | `'weekend_scrape'` | מקור הליד (`weekend_scrape`, `flagship_canonical`, `manual_lead`). |
| `source_url` | `TEXT` | לא | `NULL` | קישור למקור הגרידה המקורי ב-Weekend לצורכי אימות של קלואי. |
| `first_touch_sent_at` | `TIMESTAMPTZ` | לא | `NULL` | מועד שליחת פניית הוואטסאפ הראשונה למארח (מתעדכן אוטומטית בלחיצה באדמין). |
| `property_public_path`| `TEXT` | לא | `NULL` | נתיב ציבורי עתידי למתחם (למשל `/p/{slug}`). |
| `direct_booking_enabled` | `BOOLEAN` | **חובה** | `FALSE` | `FALSE` עבור עסקים שלא אומתו, `TRUE` רק למתחמים עם סליקה פעילה. |
| `commission_rate` | `NUMERIC(4, 2)` | **חובה** | `0.00` | עמלת תיווך (תמיד `0.00`). |

---

### ב. טבלת היחידות: `units`

כל מתחם מכיל יחידה אחת לפחות (בקתה, סוויטה או הוילה כולה):

| עמודה | סוג נתונים | חובה? | ברירת מחדל | הנחיות ל-Grok Bot |
|---|---|---|---|---|
| `id` | `VARCHAR(64)` | **חובה** | - | מזהה טקסטואלי ייחודי ליחידה (למשל `toscana-1`, `k826`, `villa-main`). |
| `property_id` | `UUID` | **חובה** | - | ה-`id` של המתחם מטבלת `properties`. |
| `name` | `VARCHAR(255)` | **חובה** | - | שם היחידה בעברית (למשל: `סוויטת פירנצה 1`, `בקתת עץ רומנטית`, `וילה מלכותית`). |
| `type` | `VARCHAR(32)` | **חובה** | `'cabin'` | סוג יחידה מתוך: `'cabin'`, `'suite'`, `'villa'`, `'dome'`, `'tent'`, `'room'`. |
| `bedrooms` | `INT` | **חובה** | `1` | מספר חדרי שינה (ברירת מחדל: 1). |
| `bathrooms` | `INT` | **חובה** | `1` | מספר חדרי רחצה (ברירת מחדל: 1). |
| `max_occupancy` | `INT` | **חובה** | `2` | קיבולת אורחים מקסימלית (זוג = 2, משפחה = 4-8). |
| `base_price_cents`| `INT` | **חובה** | - | מחיר לילה באמצ"ש **באגורות** (למשל ₪850 = `85000`). אם לא ידוע – להגדיר `80000`. |
| `weekend_price_cents`| `INT` | **חובה** | - | מחיר לילה בסופ"ש **באגורות** (למשל ₪1,100 = `110000`). אם לא ידוע – להגדיר `105000`. |
| `size_m2` | `INT` | לא | `NULL` | שטח היחידה במ"ר (אם ידוע, למשל 45). |
| `features` | `JSONB` | לא | `'[]'::JSONB` | מערך מאפיינים מיוחדים (למשל: `["ג׳קוזי מול הנוף", "מרפסת דק פרטית"]`). |
| `images` | `TEXT[]` | לא | `ARRAY[]::TEXT[]` | תמונות היחידה. |
| `is_active` | `BOOLEAN` | **חובה** | `TRUE` | האם היחידה פעילה להזמנות. |

---

## 5. תקני נרמול דאטה חובה עבור Grok Bot (Data Standards)

על מנת שהאתר יעבוד באופן חלק ללא תקלות, Grok Bot חייבת להקפיד על הכללים הבאים:

### 1. מילון אזורים קנוני (Regions)
בטבלת `properties.region` יש להזין אך ורק את המפתחות האנגליים הבאים:
* `'golan_heights'` – רמת הגולן (רמות, נאות גולן, גבעת יואב, נוב, אניעם, חד נס, אודם, מג'דל שמס, מרום גולן וכו').
* `'sea_of_galilee'` – סובב כנרת ועמק הירדן (טבריה, מגדל, גינוסר, רמות, האון, דגניה, מושבת כנרת).
* `'upper_galilee'` – גליל עליון (ראש פינה, צפת, שאר ישוב, יסוד המעלה, רמת נפתלי, כפר בלום, דפנה).
* `'western_galilee'` – גליל מערבי (אמירים, שומרה, גורן, מנות, שתולה, ראש הנקרה).
* `'lower_galilee'` – גליל תחתון (כפר תבור, שדמות דבורה, ציפורי, בית קשת).

### 2. נרמול טלפונים ומספרי וואטסאפ
* **`whatsapp_number`**: חייב להכיל אך ורק ספרות בפורמט ישראלי בינלאומי.
  - אם המספר שגורד הוא: `054-8076123` או `054 807 6123`
  - Grok Bot מנרמלת אותו ל: **`972548076123`** (החלפת ה-`05` ב-`9725`).
* **`phone`**: תצוגה מקומית עם מקף לשיחות קוליות: **`054-807-6123`**.

### 3. מילון מתקנים קנוני (Canonical Amenities)
על מנת שמנגנון הסינון במרקטפלייס יעבוד באופן אוטומטי, יש לבחור מתוך רשימת המתקנים הסטנדרטית:
```json
[
  "בריכה פרטית",
  "בריכה מחוממת ומקורה",
  "ג׳קוזי ספא ענק",
  "ג׳קוזי פרטי בחדר",
  "נוף פנורמי לכנרת",
  "נוף פתוח להרי הגולן",
  "מכונת אספרסו נספרסו",
  "מטבחון מאובזר וכלי אוכל",
  "עמדת מנגל BBQ פרטית",
  "אינטרנט Wi-Fi מהיר",
  "טלוויזיה חכמה Smart TV",
  "מתאים לדתיים / פלטה ומיחם",
  "נגישות לבעלי מוגבלויות",
  "מדשאות ירוקות ופינות ישיבה",
  "ארוחת בוקר כפרית בתיאום מראש",
  "חניה צמודה חינם"
]
```

### 4. נרמול מחירים
- המערכת שומרת מחירים ביחידות של **אגורות (Cents)**.
- אם המחיר ללילה הוא ₪850 ⬅ יש לשמור: `85000`.
- אם המחיר ללילה הוא ₪1,200 ⬅ יש לשמור: `120000`.

---

## 6. סקריפט קליטה אוטומטי ב-Python עבור Grok Bot

להלן סקריפט Python שלם ש-Grok Bot יכולה להריץ ישירות מול ה-Studio או דרך סביבת העבודה שלה:

```python
#!/usr/bin/env python3
"""
Grok Bot Bulk Importer for ResortOS
Ingests scraped Northern Israel hospitality complexes into PostgreSQL / Supabase
"""

import json
import re
import psycopg2
from psycopg2.extras import Json

# חיבור למסד הנתונים ב-Mac Studio המקומי או דרך Tailscale
DB_URI = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def normalize_whatsapp(raw_phone: str) -> str:
    """הופך מספר ישראלי לפורמט בינלאומי נקי עבור קישורי וואטסאפ"""
    if not raw_phone:
        return "972500000000"
    digits = re.sub(r'\D', '', str(raw_phone))
    if digits.startswith('05'):
        return '972' + digits[1:]
    if digits.startswith('972'):
        return digits
    return '972' + digits

def normalize_phone(raw_phone: str) -> str:
    """הופך מספר לתצוגה ישראלית קריאה 05X-XXX-XXXX"""
    digits = re.sub(r'\D', '', str(raw_phone))
    if digits.startswith('9725'):
        digits = '0' + digits[3:]
    if len(digits) == 10 and digits.startswith('05'):
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return raw_phone

def create_slug(hebrew_name: str, english_name: str, village: str) -> str:
    """מייצר Slug ייחודי באנגלית ל-URL"""
    base = english_name if english_name else hebrew_name
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', base.lower()).strip('-')
    if not slug:
        slug = f"resort-{re.sub(r'[^a-zA-Z0-9]+', '-', village.lower())}"
    return slug

def ingest_properties(json_file_path: str):
    conn = psycopg2.connect(DB_URI)
    cur = conn.cursor()
    
    with open(json_file_path, 'r', encoding='utf-8') as f:
        resorts = json.load(f)
        
    print(f"🚀 מתחיל קליטה של {len(resorts)} מתחמים ל-ResortOS...")
    
    success_count = 0
    
    for item in resorts:
        slug = item.get('slug') or create_slug(item.get('hebrew_name', ''), item.get('name', ''), item.get('village', ''))
        hebrew_name = item.get('hebrew_name') or item.get('name')
        name = item.get('name') or hebrew_name
        tagline = item.get('tagline', 'מתחם נופש ואירוח כפרי יוקרתי')
        description = item.get('description', '')
        region = item.get('region', 'golan_heights')
        village = item.get('village', 'רמת הגולן')
        address = item.get('address', f"מושב {village}")
        geo_lat = item.get('geo_lat')
        geo_lng = item.get('geo_lng')
        
        whatsapp_number = normalize_whatsapp(item.get('whatsapp_number') or item.get('phone', ''))
        phone = normalize_phone(item.get('phone') or item.get('whatsapp_number', ''))
        email = item.get('email')
        hero_image = item.get('hero_image') or "https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80"
        gallery_images = item.get('gallery_images', [])
        amenities = item.get('amenities', ["ג׳קוזי ספא", "נוף פתוח", "אינטרנט Wi-Fi"])
        
        # 1. Upsert לטבלת properties
        query_property = """
        INSERT INTO properties (
            slug, name, hebrew_name, tagline, description, region, village, address,
            geo_lat, geo_lng, whatsapp_number, phone, email, hero_image,
            gallery_images, amenities, claimed_status, direct_booking_enabled, commission_rate
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            'unclaimed_seeded', FALSE, 0.00
        )
        ON CONFLICT (slug) DO UPDATE SET
            hebrew_name = EXCLUDED.hebrew_name,
            tagline = EXCLUDED.tagline,
            description = EXCLUDED.description,
            village = EXCLUDED.village,
            whatsapp_number = EXCLUDED.whatsapp_number,
            phone = EXCLUDED.phone,
            hero_image = EXCLUDED.hero_image,
            amenities = EXCLUDED.amenities,
            updated_at = NOW()
        RETURNING id;
        """
        
        try:
            cur.execute(query_property, (
                slug, name, hebrew_name, tagline, description, region, village, address,
                geo_lat, geo_lng, whatsapp_number, phone, email, hero_image,
                gallery_images, Json(amenities)
            ))
            property_id = cur.fetchone()[0]
            
            # 2. Upsert יחידות אירוח (Units)
            units = item.get('units', [])
            if not units:
                # יחידת ברירת מחדל אם לא פורקו יחידות
                units = [{
                    "id": f"{slug}-unit-1",
                    "name": f"{hebrew_name} · סוויטת בוטיק",
                    "type": "cabin",
                    "bedrooms": 1,
                    "bathrooms": 1,
                    "max_occupancy": 4,
                    "base_price_cents": int(item.get('min_price', 850) * 100),
                    "weekend_price_cents": int(item.get('min_price', 850) * 1.3 * 100),
                    "features": ["ג׳קוזי ספא", "מרפסת פרטית"]
                }]
                
            for u in units:
                unit_id = str(u.get('id') or f"{slug}-u1")
                unit_name = u.get('name', 'סוויטת אירוח')
                unit_type = u.get('type', 'cabin')
                bedrooms = u.get('bedrooms', 1)
                bathrooms = u.get('bathrooms', 1)
                max_occ = u.get('max_occupancy', 4)
                base_cents = u.get('base_price_cents', 85000)
                weekend_cents = u.get('weekend_price_cents', 110000)
                features = u.get('features', [])
                
                query_unit = """
                INSERT INTO units (
                    id, property_id, name, type, bedrooms, bathrooms,
                    max_occupancy, base_price_cents, weekend_price_cents, features
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    base_price_cents = EXCLUDED.base_price_cents,
                    weekend_price_cents = EXCLUDED.weekend_price_cents,
                    features = EXCLUDED.features,
                    updated_at = NOW();
                """
                cur.execute(query_unit, (
                    unit_id, property_id, unit_name, unit_type, bedrooms,
                    bathrooms, max_occ, base_cents, weekend_cents, Json(features)
                ))
                
            conn.commit()
            success_count += 1
            print(f"✅ נקלט בהצלחה: {hebrew_name} ({village}) -> {slug}")
            
        except Exception as err:
            conn.rollback()
            print(f"❌ שגיאה בקליטת {hebrew_name}: {err}")
            
    cur.close()
    conn.close()
    print(f"\n🎉 הושלמה קליטת {success_count} מתחמים בהצלחה!")

if __name__ == "__main__":
    import sys
    file_path = sys.argv[1] if len(sys.argv) > 1 else "scraped_resorts.json"
    ingest_properties(file_path)
```

---

## 7. מבנה קובץ ה-JSON המצופה מ-Grok Bot (JSON Schema Template)

כאשר Grok Bot מייצאת את תוצרי ה-Scraping, עליה לספק קובץ JSON במבנה הבא:

```json
[
  {
    "slug": "toscana-ramot",
    "name": "Toscana Ramot",
    "hebrew_name": "טוסקנה ברמות",
    "tagline": "3 בקתות עץ יוקרתיות מול נוף פנורמי לכנרת",
    "description": "מתחם אירוח כפרי יוקרתי במושב רמות. בקתות פירנצה ושאטו טובלות במדשאות ירוקות עם בריכה מחוממת, ג'קוזי מול השקיעה ופרטיות מושלמת.",
    "region": "golan_heights",
    "village": "רמות",
    "address": "מושב רמות, רמת הגולן",
    "geo_lat": 32.8625,
    "geo_lng": 35.6667,
    "phone": "054-807-6123",
    "whatsapp_number": "972548076123",
    "email": "info@toscana-ramot.co.il",
    "hero_image": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
    "gallery_images": [
      "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=800&q=80"
    ],
    "amenities": [
      "בריכה מחוממת ומקורה",
      "ג׳קוזי ספא ענק",
      "נוף פנורמי לכנרת",
      "מכונת אספרסו נספרסו",
      "עמדת מנגל BBQ פרטית",
      "אינטרנט Wi-Fi מהיר"
    ],
    "units": [
      {
        "id": "toscana-firenze-1",
        "name": "טוסקנה · פירנצה 1",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "max_occupancy": 4,
        "base_price_cents": 85000,
        "weekend_price_cents": 110000,
        "features": ["ג׳קוזי מול הנוף", "מרפסת דק פרטית"]
      },
      {
        "id": "toscana-chateau",
        "name": "טוסקנה · שאטו משפחתי",
        "type": "cabin",
        "bedrooms": 2,
        "bathrooms": 1,
        "max_occupancy": 6,
        "base_price_cents": 120000,
        "weekend_price_cents": 150000,
        "features": ["בקתת עץ דו-קומתית", "ג׳קוזי ספא פרטי"]
      }
    ]
  }
]
```

---

## 8. דשבורד אדמין המרות ומעקב לידים (Admin CRM Funnel)

דשבורד האדמין מיועד לרן ולצוות המכירות לצפייה מרוכזת בכל ~600 הלידים, מעקב המרות ופניות וואטסאפ:
- **כתובת גישה**: `http://localhost:3001/resortos.html?tab=admin` (או דרך לשונית «פאנל המרות (CRM)» בראש האתר).
- **מדדי KPI מרכזיים**:
  1. **סה״כ לידים במאגר**: סך כל המתחמים שנקלטו.
  2. **זוהו במאגר (`Lead_Identified`)**: לידים בטיוטה טרם פנייה.
  3. **נשלחה פנייה (`Touched`)**: לידים שנשלחה אליהם הודעת וואטסאפ ראשונה (`first_touch_sent_at` מתועד).
  4. **אישור כרטיס חינם (`Portal_Free_Active`)**: מארחים שאישרו הופעה חינמית והעלו תמונות (`is_public = true`).
  5. **נשלח פיץ׳ ₪99 (`Upsell_Pitch_Sent`)**: מארחים פעילים שקיבלו הצעה לשדרוג למנוי Prime.
  6. **מנוי משלם (`Verified_Subscriber`)**: לקוחות משלמים ב-₪99 לחודש.
  7. **הסרה (`Opt_Out`)**: מארחים שביקשו לא לקבל פניות נוספות (מוסתרים ונחסמים לפניות).
- **פעולת וואטסאפ בלחיצה אחת (Click-to-Update)**:
  לחיצה על «שלח וואטסאפ» פותחת הודעה מנוסחת המצייתת לחוק הספאם הישראלי עם קישור לתצוגה מקדימה פרטית, ובמקביל מעדכנת אוטומטית במערכת את שדה `first_touch_sent_at` ואת יומן הפניות!

---

## 9. בדיקה ואימות לאחר קליטה (QA & Verification Checklist)

לאחר ש-Grok Bot מסיימת לקלוט מקבץ עסקים, יש לוודא:
1. **סטטוס מוסתר כברירת מחדל**: לוודא שהמתחם נוצר עם `is_public = false`, `crm_status = 'Lead_Identified'`, ו-`hero_image = NULL`.
2. **אי-הופעה במרקטפלייס האורחים**: לוודא שהעסק **אינו** מופיע בקטלוג הציבורי עד לאישור המארח.
3. **תצוגה מקדימה למארח**: כניסה לקישור `http://localhost:3001/resortos.html?preview=true&slug={slug}` — לוודא שמוצג כרטיס טיוטה יוקרתי עם תגית «תצוגה מקדימה למארח», placeholder אלגנטי עם כפתור העלאת תמונות, וכפתור אימות בעלות.
4. **דשבורד אדמין**: כניסה ל-`?tab=admin` — לוודא שהמתחם מופיע בטבלת הלידים, שניתן לסנן לפיו, ושכפתור הוואטסאפ מעדכן `first_touch_sent_at`.
5. **אישור והפיכה לציבורי**: שינוי סטטוס ל-`Portal_Free_Active` או העברת מתג `is_public` ל-`true` מציג מיד את המתחם במרקטפלייס הציבורי.

---
**סוף מסמך הנחיות קליטה ל-Grok Bot**  
לכל שאלה או הבהרה תשתיתית, לפנות לצוות הפיתוח והארכיטקטורה של ResortOS.
