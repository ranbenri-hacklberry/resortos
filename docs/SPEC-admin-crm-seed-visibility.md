# מפרט טכני — ResortOS: זריעת ~600 + נראות + אדמין המרות
**עבור:** Antigravity / פיתוח  
**תאריך:** 2026-09-11  
**רפו:** `https://github.com/ranbenri-hacklberry/resortos.git` (גם `hotelos` remote)  
**קונטקסט:** אתר חי `https://dist-resortos.vercel.app` · DB לפי `migrations/001_cabinos_core.sql` · מדריך קיים `docs/grok-bot-business-onboarding-and-studio-guide.md` **דורש עדכון** (סותר החלטות מוצר חדשות)

---

## 0. החלטת מוצר (חובה ליישם בקוד, לא רק בתיעוד)

| נושא | החלטה |
|---|---|
| זריעת ~600 | כן, ל-DB כ־`unclaimed_seeded` |
| תמונות ציבוריות לפני Claim | **לא** — אין `hero_image` / gallery חיים מ־Weekend (זכויות יוצרים) |
| תמונות ברקע | מותר לשמור URL ייחוס בשדה פנימי בלבד (לא מוגש למרקטפלייס) |
| הופעה במרקטפלייס הציבורי לפני אישור מארח | **לא כעמוד מלא**. או (א) מוסתר לגמרי מהקטלוג הציבורי, או (ב) כרטיס רך עם תווית «ממתין לאישור המארח» בלי וואטסאפ אורחים פעיל / בלי גלריה — **ברירת מחדל מומלצת: מוסתר מהקטלוג הציבורי, נראה רק באדמין** |
| אחרי Stage-1 Yes (אישור מארח) | `is_public = true` + בקשת תמונות מהמארח + קישור עמוד אמיתי |
| First Touch / Chloe | חייב להיות כנה: «טיוטה/בהמתנה» — לא «כבר העלינו אתכם» אם אין פרסום מלא |

המדריך הנוכחי (§1) אומר שהמתחם «מופיע מיד באתר» — **לבטל/לתקן** בהתאם להחלטה למעלה.

---

## 1. שינויי סכמה (PostgreSQL / Supabase)

### 1.1 הרחבת `claim_status_enum` או שדה CRM נפרד
קיים היום:
```text
unclaimed_seeded | claim_pending | claimed_verified
```

נדרש יישור לפאנל המכירות של קלואי. **מומלץ:** עמודה חדשה `crm_status` (לא לשבור enum קיים):

```sql
CREATE TYPE crm_status_enum AS ENUM (
  'Lead_Identified',      -- במאגר, טרם פנייה
  'Portal_Free_Active',   -- אישר הופעה חינמית
  'Upsell_Pitch_Sent',    -- נשלח פיץ' 99₪
  'Verified_Subscriber',  -- מנוי 99₪
  'Opt_Out'               -- ביקש הסרה — לא לפנות שוב
);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS crm_status crm_status_enum NOT NULL DEFAULT 'Lead_Identified',
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reference_image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],  -- פנימי בלבד
  ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'weekend_scrape',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS property_public_path TEXT;  -- למשל /p/{slug} אחרי פרסום
```

### 1.2 מדיניות תמונות בזריעה
- `hero_image`: **לא חובה בזריעה**. לשנות סכמה/אפליקציה כך ש־NULL מותר ל־`unclaimed_seeded` / `is_public=false`.
- אם ה-UI דורש מחרוזת: להשתמש ב־placeholder פנימי קבוע של המערכת (asset של ResortOS, לא תמונת מתחם), **רק באדמין** — לא לציבור.
- `reference_image_urls`: לשמור קישורי Weekend לייחוס תפעולי; **לעולם לא** להגיש ל־API ציבורי / CDN אורחים.

### 1.3 מיפוי סטטוסים
| אירוע | `claimed_status` | `crm_status` | `is_public` |
|---|---|---|---|
| זריעה ראשונית | `unclaimed_seeded` | `Lead_Identified` | `false` |
| נשלח First Touch | ללא שינוי | `Lead_Identified` (+ `first_touch_sent_at`) | `false` |
| מארח אישר («כן») | `claim_pending` או להישאר seeded עד OTP | `Portal_Free_Active` | `true` (אחרי יצירת כרטיס) |
| Claim/OTP הושלם | `claimed_verified` | `Portal_Free_Active` | `true` |
| פיץ' 99₪ נשלח | — | `Upsell_Pitch_Sent` | — |
| שילם Verified | — | `Verified_Subscriber` | — |
| Opt-out | — | `Opt_Out` | `false` + חסימת פנייה |

---

## 2. API / שכבת נתונים

### 2.1 קטלוג ציבורי
`GET` למרקטפלייס חייב לסנן:
```sql
WHERE is_public = TRUE
  AND crm_status <> 'Opt_Out'
  AND claimed_status <> ... -- לפי הצורך
```
לא להחזיר `reference_image_urls`, מספרי טלפון פנימיים מעבר ל־whatsapp המאושר לציבור, או הערות CRM.

### 2.2 אדמין (מוגן)
נתיבים מוצעים (שמות לדוגמה — להתאים לנתוב הקיים):
- `GET /api/admin/properties` — רשימה + פילטרים
- `GET /api/admin/funnel` — אגרגציות המרה
- `PATCH /api/admin/properties/:id` — עדכון `crm_status`, `is_public`, הערות
- Auth: רק `super_admin` (או סיסמת סטודיו / session קיימת של Mac Studio). **לא** לחשוף בלי auth ב־Vercel production.

### 2.3 Payload אדמין לשורה
```json
{
  "id": "uuid",
  "hebrew_name": "צימר בגבעה",
  "village": "גבעת יואב",
  "region": "golan_heights",
  "whatsapp_number": "972548317887",
  "units_count": 4,
  "claimed_status": "unclaimed_seeded",
  "crm_status": "Lead_Identified",
  "is_public": false,
  "has_reference_images": true,
  "first_touch_sent_at": null,
  "last_inbound_at": null,
  "property_public_path": null,
  "source": "weekend_scrape",
  "source_url": "https://..."
}
```

---

## 3. ממשק אדמין — Funnel / Conversion (MVP)

### 3.1 מטרה
רן רואה את כל ~600, ומבין **קצב המרה** לפי שלבי CRM — בלי להיכנס ל-SQL.

### 3.2 מסכים

**A. Dashboard (ראש עמוד)**  
כרטיסי KPI:
- סה״כ במאגר
- `Lead_Identified`
- נשלח First Touch (יש `first_touch_sent_at`)
- `Portal_Free_Active`
- `Upsell_Pitch_Sent`
- `Verified_Subscriber`
- `Opt_Out`
- שיעורי המרה:
  - Touched → Free Active
  - Free Active → Upsell Sent
  - Upsell → Verified
- פעילות 7/30 יום: first touches שנשלחו, אישורים, opt-outs

**B. טבלת מתחמים (עיקר)**  
עמודות: שם עברי | ישוב | אזור | יחידות | WhatsApp | crm_status | claimed_status | is_public | First Touch | Last inbound | לינק ציבורי  
פילטרים: סטטוס CRM, אזור, is_public, יש/אין וואטסאפ, נשלח/לא נשלח First Touch, חיפוש טקסט  
מיון: תאריך עדכון, שם, אזור  
פעולות שורה: העתקת וואטסאפ, סימון Opt_Out, סימון Portal_Free_Active, פתיחה ב-Studio/DB, העתקת `property_public_path` אם קיים

**C. (אופציונלי ב-MVP+)** תצוגת מתחם בודד: היסטוריית הודעות / הערות (אפשר טבלת `property_events` בהמשך)

### 3.3 UX
- עברית RTL
- טעינה מהירה ל־600+ שורות (pagination או virtual scroll)
- ייצוא CSV (נחמד ב-MVP)

### 3.4 מיקום בקוד
בתוך `src/components/resortos/` — למשל `AdminFunnelDashboard.tsx` + route מוגן  
או נתיב נפרד `/admin/funnel` שלא מקושר מהמרקטפלייס הציבורי.

---

## 4. שינויי UI מרקטפלייס

1. כרטיסיות ציבוריות: רק `is_public=true`.
2. אם בוחרים מצב «כרטיס רך בהמתנה» (אופציה B): תווית «ממתין לאישור המארח», **בלי** כפתור וואטסאפ לאורח, **בלי** גלריה; כפתור Claim למארח בלבד.  
   **ברירת מחדל למפרט זה: אופציה A — מוסתר לגמרי.**
3. אחרי פרסום: גלריה רק מתמונות מאושרות/שהועלו ע״י מארח — לא מ־`reference_image_urls`.

---

## 5. זרימת זריעה (Seed)

מקור: CSV/JSON מ־Weekend (~693 / ~600 עם טלפון) — אצל קלואי: `/workspace/cabinos/weekend-leads/leads.csv` (או העתק לרפו).

לכל שורה:
1. יצירת `properties` + לפחות `units` אחת (אם מספר יחידות ידוע — N יחידות או יחידה אחת עם `max_occupancy` לפי הצורך; **מינימום יחידה אחת** לפי המדריך).
2. `claimed_status = unclaimed_seeded`
3. `crm_status = Lead_Identified`
4. `is_public = false`
5. `hero_image = NULL` (או לא לשלוח)
6. `reference_image_urls = [...]` אם יש URL ייחוס
7. נרמול `whatsapp_number` → `9725…`
8. `slug` ייחודי באנגלית
9. דדופ לפי `slug` / `whatsapp_number`+`hebrew_name`

עדכון סקריפט: `scripts/seed_cabinos.ts` ו/או הסקריפט ב־`docs/grok-bot-business-onboarding-and-studio-guide.md` — להתאים לשדות החדשים ולמדיניות תמונות.

---

## 6. תיעוד לעדכון

לעדכן ב־`docs/grok-bot-business-onboarding-and-studio-guide.md`:
- §1: לא «מופיע מיד באתר» → «נזרע פנימית; ציבורי רק אחרי אישור מארח / is_public»
- §properties: `hero_image` לא חובה בזריעה; הוספת השדות החדשים
- להוסיף סעיף קצר על אדמין Funnel

---

## 7. מחוץ לסקופ (לא לבקש מאנטיגרביטי בסיבוב הזה)

- שליחת SMS/WATI בפועל (קלואי)
- חיבור Cabin OS TV
- סליקה / מנוי 99₪ end-to-end
- דומיין `resortos.app`
- יצירת כרטיס ידני ל־«צימר בגבעה» כ־hotfix (אפשר אחרי שהאדמין/סכמה מוכנים)

---

## 8. קריטריוני קבלה (Definition of Done)

1. מיגרציה רצה נקי על Studio מקומי (ואם רלוונטי — production).
2. אפשר לזרוע ≥1 ו־batch של עשרות רשומות עם `is_public=false`, בלי תמונות ציבוריות.
3. המרקטפלייס הציבורי **לא** מציג רשומות seeded פרטיות.
4. `/admin/funnel` (או המקביל) מציג KPI + טבלת כל המתחמים עם פילטר לפי `crm_status`.
5. שינוי `crm_status` / `is_public` מהאדמין נשמר ב-DB ומשתקף מיד בסינון הציבורי.
6. המדריך `grok-bot-business-onboarding-and-studio-guide.md` מעודכן ולא סותר.
7. אין דליפת `reference_image_urls` ל־API ציבורי.

---

## 9. הערות לביצוע

- מותג: **ResortOS** = פורטל + ניהול תפעול; **Cabin OS** = אפליקציות טלוויזיה בחדר בלבד.
- Verified 99₪ כולל Cabin OS בסיס (ערוצים, סרטונים ללא זכויות, נטפליקס/ספוטיפיי של האורח) — לא חלק מ-MVP האדמין, רק לשמירת עקביות בטקסטים.
