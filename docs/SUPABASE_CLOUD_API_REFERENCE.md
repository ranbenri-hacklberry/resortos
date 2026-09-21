# 📡 ResortOS Cloud API & Database Access Guide (Mac Studio Reference)

מדריך רשמי ומלא להתחברות, שליפת מידע ועדכון נתונים מול **Supabase Cloud** ישירות מ-Mac Studio (ומכל מכשיר/סקריפט).

---

## 🔑 1. פרטי הזדהות וכתובות בסיס (Credentials)

| פרמטר | ערך | שימוש |
|---|---|---|
| **Project URL** | `https://dqkpqtdrqsdfvploaenc.supabase.co` | כתובת הבסיס לכל קריאות ה-REST וה-Storage |
| **Project Ref** | `dqkpqtdrqsdfvploaenc` | מזהה הפרויקט בענן |
| **Region** | `Frankfurt (eu-central-1)` | שרת אירופה מרכזית (זמני תגובה מהירים לישראל) |
| **Anon Public Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3MzgsImV4cCI6MjEwNDg3OTczOH0.pemtCUzSfTwO3dZ8UfUIZhb4AcgcBnzdrOtc9UFtxZU` | מפתח ציבורי לקריאות Frontend ודפדפן |
| **Service Role Key** (Admin) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U` | **מפתח אדמין מלא** לסקריפטים במק סטודיו (עוקף RLS, כתיבה מלאה) |
| **DB Password** | `Cloe@2026!@#` | סיסמת ה-Postgres הראשית |
| **Storage Bucket** | `resorts` | באקט תמונות, מדיה וסרטונים ציבורי |

---

## 🗄️ 2. חיבור ישיר למסד הנתונים (PostgreSQL Connection)

לשימוש מתוך הטרמינל (`psql`), תוכנות GUI (כמו **TablePlus**, **DBeaver**, **DataGrip**), או ספריות קוד (`pg`, `psycopg2`, `SQLAlchemy`).

> [!TIP]
> מומלץ תמיד להשתמש ב-**Pooler Host** (תומך IPv4 ו-IPv6 בצורה יציבה ללא תלות בספקית האינטרנט).

### מחרוזת התחברות מוכנה (Connection String):
```bash
postgresql://postgres.dqkpqtdrqsdfvploaenc:Cloe%402026%21%40%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### הגדרות התחברות ב-TablePlus / DBeaver:
* **Host:** `aws-0-eu-central-1.pooler.supabase.com`
* **Port:** `5432` (Session Mode) או `6543` (Transaction Mode)
* **User:** `postgres.dqkpqtdrqsdfvploaenc`
* **Password:** `Cloe@2026!@#`
* **Database:** `postgres`
* **SSL Mode:** `Require`

### פקודת התחברות ישירה מטרמינל ה-Mac Studio:
```bash
psql "postgresql://postgres.dqkpqtdrqsdfvploaenc:Cloe%402026%21%40%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

---

## 🌐 3. גישה דרך ה-REST API (PostgREST)

ה-REST API של Supabase מאפשר קריאה וכתיבה פשוטה באמצעות HTTP Headers סטנדרטיים.

### Headers חובה בכל בקשה:
```http
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U
Content-Type: application/json
```

---

### א. שליפת נתונים (GET)

#### 1. שליפת רשימת כל המתחמים (Properties):
```bash
curl -s "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/properties?select=id,slug,name,hebrew_name,village,whatsapp_number,crm_status" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U"
```

#### 2. סינון לפי מושב ספציפי (למשל מושב רמות) ומצב אישור ציבורי:
```bash
curl -s "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/properties?village=eq.רמות&is_public=eq.true&select=slug,hebrew_name,hero_image" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U"
```

#### 3. שליפת מתחם בודד יחד עם היחידות שלו (Nested Join):
```bash
curl -s "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/properties?slug=eq.mialees&select=*,units(*)" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U"
```

#### 4. שליפת 50 ההזמנות האחרונות (Bookings):
```bash
curl -s "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/hotelos_bookings?order=check_in_date.desc&limit=50&select=id,guest_name,guest_phone,check_in_date,check_out_date,total_price_agorot,booking_status" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3MzgsImV4cCI6MjEwNDg3OTczOH0.pemtCUzSfTwO3dZ8UfUIZhb4AcgcBnzdrOtc9UFtxZU" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3MzgsImV4cCI6MjEwNDg3OTczOH0.pemtCUzSfTwO3dZ8UfUIZhb4AcgcBnzdrOtc9UFtxZU"
```

---

### ב. עדכון נתונים (PATCH)

#### 1. עדכון סטטוס ליד ואישור מתחם לפרסום:
```bash
curl -X PATCH "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/properties?slug=eq.mialees" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "crm_status": "Verified_Subscriber",
    "is_public": true,
    "direct_booking_enabled": true
  }'
```

#### 2. עדכון תמונת Hero וגלריה:
```bash
curl -X PATCH "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/properties?slug=eq.mialees" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Content-Type: application/json" \
  -d '{
    "hero_image": "https://dqkpqtdrqsdfvploaenc.supabase.co/storage/v1/object/public/resorts/resorts/mialees.jpg",
    "gallery_images": [
      "https://dqkpqtdrqsdfvploaenc.supabase.co/storage/v1/object/public/resorts/resorts/mialees.jpg"
    ]
  }'
```

---

### ג. הוספת רשומה או Upsert (POST)

#### 1. יצירת הזמנה חדשה (Booking):
```bash
curl -X POST "https://dqkpqtdrqsdfvploaenc.supabase.co/rest/v1/hotelos_bookings" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "id": "bkg_manual_101",
    "tenant_id": "22222222-2222-2222-2222-222222222222",
    "unit_id": "u-mialees-1",
    "guest_name": "ישראל ישראלי",
    "guest_phone": "0541234567",
    "guest_email": "israel@example.com",
    "check_in_date": "2026-10-01",
    "check_out_date": "2026-10-03",
    "adults_count": 2,
    "children_count": 1,
    "total_price_agorot": 220000,
    "deposit_agorot": 50000,
    "booking_status": "CONFIRMED",
    "payment_status": "DEPOSIT_PAID",
    "channel_source": "DIRECT"
  }'
```

---

## 💻 4. דוגמאות קוד מלאות לשימוש במק סטודיו

### אפשרות 1: סקריפט Node.js / TypeScript (מומלץ)

```javascript
// test_cloud_api.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dqkpqtdrqsdfvploaenc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // 1. קריאת רשימת מתחמים
  const { data: properties, error: propErr } = await supabase
    .from('properties')
    .select('id, name, hebrew_name, village, crm_status')
    .limit(5);

  console.log('Top 5 Properties:', properties);

  // 2. עדכון מתחם
  const { data: updated, error: updateErr } = await supabase
    .from('properties')
    .update({ admin_notes: 'עודכן מהמק סטודיו בתאריך ' + new Date().toLocaleDateString() })
    .eq('slug', 'mialees')
    .select();

  console.log('Updated:', updated);
}

main();
```

---

### אפשרות 2: סקריפט Python (`requests` או `supabase`)

```python
# test_cloud_api.py
import requests

SUPABASE_URL = "https://dqkpqtdrqsdfvploaenc.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U"

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# 1. שליפת מתחמים
res = requests.get(f"{SUPABASE_URL}/rest/v1/properties?limit=3", headers=headers)
print("Properties:", res.json())

# 2. עדכון
res = requests.patch(
    f"{SUPABASE_URL}/rest/v1/properties?slug=eq.mialees",
    headers=headers,
    json={"direct_booking_enabled": True}
)
print("Update Status:", res.status_code)
```

---

## 🖼️ 5. העלאת מדיה ישירות ל-Supabase Storage

כתובת הבאקט: `resorts`

### העלאת קובץ בודד ב-Node.js:
```javascript
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dqkpqtdrqsdfvploaenc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTMwMzczOCwiZXhwIjoyMTA0ODc5NzM4fQ.qaE72YJsLpahpQStRLW2uYMhpfgvZXQA55pAyNgBH7U'
);

async function uploadImage(localPath, remotePath) {
  const fileBuffer = fs.readFileSync(localPath);
  const { data, error } = await supabase.storage
    .from('resorts')
    .upload(remotePath, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error('Upload failed:', error);
    return;
  }

  const { data: publicUrl } = supabase.storage
    .from('resorts')
    .getPublicUrl(remotePath);

  console.log('Public URL:', publicUrl.publicUrl);
}

uploadImage('./my_photo.jpg', 'resorts/my_photo.jpg');
```

---

## 🗃️ 6. מיפוי טבלאות עיקריות במסד הנתונים

1. **`public.properties`** (705 שורות):
   * `id` (UUID), `slug` (text unique), `name`, `hebrew_name`, `village`, `region`, `address`, `whatsapp_number`, `phone`, `email`
   * `hero_image`, `gallery_images` (text[]), `amenities` (jsonb)
   * `claimed_status` (`unclaimed_seeded` / `claim_pending` / `claimed_verified`)
   * `crm_status` (`Lead_Identified` / `Portal_Free_Active` / `Upsell_Pitch_Sent` / `Verified_Subscriber`)
   * `is_public` (boolean), `direct_booking_enabled` (boolean), `hero_video_url`

2. **`public.units`** (705 שורות):
   * `id`, `property_id` (FK to properties.id), `name`, `type`, `bedrooms`, `bathrooms`, `max_occupancy`
   * `base_price_cents`, `weekend_price_cents`, `size_m2`, `features` (jsonb), `is_active`

3. **`public.hotelos_bookings`** (902 שורות):
   * `id`, `tenant_id`, `unit_id`, `guest_name`, `guest_email`, `guest_phone`
   * `check_in_date`, `check_out_date`, `adults_count`, `children_count`
   * `total_price_agorot`, `deposit_agorot`, `booking_status`, `payment_status`
   * `checkout_token`, `channel_source`, `special_requests`

4. **`public.suppliers`** (4 שורות):
   * ספקי כביסה, ג'קוזי, מיזוג וקפה בגולן ובגליל.

5. **`public.b2b_deals`** (4 שורות):
   * עסקאות רכש וקופוני הנחה בלעדיים למארחי ResortOS.

6. **`public.articles_and_guides`** (2 שורות):
   * מדריכים מאוירים לאורחים (ג'קוזי ומכונת נספרסו).

7. **`public.public_properties`** (View ציבורי):
   * חושף רק מתחמים מאושרים ופעילים (`is_public = true` או `claimed_verified`).

---

## 🚀 7. סנכרון שרת הגשר המקומי (Local Bridge ב-Mac Studio)

הקובץ `.env` במק סטודיו מעודכן וכבר מחובר ל-Supabase Cloud:
```env
SUPABASE_URL=https://dqkpqtdrqsdfvploaenc.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3MzgsImV4cCI6MjEwNDg3OTczOH0.pemtCUzSfTwO3dZ8UfUIZhb4AcgcBnzdrOtc9UFtxZU
VITE_SUPABASE_URL=https://dqkpqtdrqsdfvploaenc.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxa3BxdGRycXNkZnZwbG9hZW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3MzgsImV4cCI6MjEwNDg3OTczOH0.pemtCUzSfTwO3dZ8UfUIZhb4AcgcBnzdrOtc9UFtxZU
```

כל סקריפט סנכרון שתריץ במק סטודיו:
* `npm run sync:banks` – סנכרון בנקים
* `npm run sync:hyp` – סנכרון מסופי אשראי
* `npm run sync:kinorot` – סנכרון לוחות כינורות
* `node server/index.js` – שרת הגשר המקומי
**ימשוך ויעדכן אוטומטית ישירות מול הענן!**
