# ResortOS — מסמך חיבור לאתר הציבורי (Antigravity)

מסמך לאנטיגרביטי / בונה האתרים. מקור האמת התפעולי הוא **ResortOS על ה-Mac Studio**, לא ענן נפרד. האתר לכל הצימרים והמתחמים חייב לקרוא ולכתוב לאותו יומן שהצוות רואה בלוח התפוסה.

תאריך: 20 באוגוסט 2026.  
רפו: `hotelos` (ResortOS).  
שפה באתר: עברית RTL. תאריכים תמיד `YYYY-MM-DD`. שעון: `Asia/Jerusalem`.

---

## 1. מה כבר קיים ומה האתר צריך לעשות

| מערכת | תפקיד | סטטוס |
|---|---|---|
| לוח תפוסה צוות (`:3001`) | מקור האמת לזמינות | חי |
| `hotelos_bookings` ב-Postgres מקומי | כל ההזמנות (ישיר, אתר, Airbnb/קינורוט) | חי |
| סנכרון קינורוט כל 30 דק׳ | ממלא תפוסה מ־OTA | חי |
| אתר אורח `https://resortos-db7.pages.dev` | אחרי הזמנה: מדריכים, Wi‑Fi, צ׳ק-אאוט | חי, **לא** מנוע הזמנות |
| מנוע הזמנות מיאליס (`BookingEngine`) | UI הזמנה | דמו / WhatsApp. **לא** כותב ליומן האמיתי |
| `/api/ical/:unitId.ics` | ייצוא iCal | **סטאב** (אירועי דוגמה). צריך לחבר ל־DB |

האתר הציבורי צריך:

1. להציג מתחמים ויחידות.
2. לשאול את היומן אילו תאריכים תפוסים.
3. לכבד חוקי חגים (מינימום לילות, סגור לכניסה/יציאה).
4. ליצור הזמנה באותה טבלה שהצוות רואה בזמן אמת.
5. לא לחשוף קודי כספת / שער / Wi‑Fi באתר הציבורי.

---

## 2. איך מתחברים (חשוב — אל תפתחו את ה-DB לאינטרנט)

ה-Postgres המקומי רץ עם RLS פתוח ל־`anon` **ברשת הפנימית בלבד**. אסור לשים את מפתח ה-anon בדפדפן של האתר הציבורי.

### רשת פנימית (Studio)

| שירות | כתובת |
|---|---|
| Tailscale | `100.127.14.15` (שם: `max`) |
| Postgres | `127.0.0.1:54322` user `postgres` / db `postgres` |
| PostgREST / Kong | `http://127.0.0.1:54321` |
| אפליקציית צוות | `http://100.127.14.15:3001/` |
| Tenant | `22222222-2222-2222-2222-222222222222` |

מפתחות: רק מ־`.env` על הסטודיו (`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). לא בגיט.

### איך האתר הציבורי צריך לגשת

שכבת שרת (Cloudflare Worker / Pages Function) עם `SUPABASE_SERVICE_ROLE_KEY` או RPC מוגבל. הדפדפן קורא רק ל־API שלכם:

```
GET  /api/catalog
GET  /api/availability?unit_id=&from=&to=
GET  /api/restrictions?property_id=
POST /api/bookings
```

Realtime לצוות כבר קיים על `hotelos_bookings`. אחרי `INSERT` הלוח מתעדכן לבד.

---

## 3. מזהים — מתחמים ויחידות

`property_id` הוא **טקסט**, לא UUID. `unit_id` הוא טקסט יציב. לא להמציא מזהים חדשים.

### מתחמים (`resort_properties.id`)

| property_id | שם | כפר | יחידות |
|---|---|---|---|
| `hill` | צימר בגבעה | גבעת יואב | `hill-1` … `hill-4` |
| `kipat` | כיפת שמיים | גבעת יואב | `dome-blue`, `dome-red`, `dome-green` |
| `mialis` | מיאליס | גבעת יואב | `mialis-villa`, `suite-1`, `suite-2` |
| `nurit` | בתי נורית | רמות | `k671`, `k673`–`k679` (אין `k672`) |
| `taj` | טאג׳ מאהל | רמות | `k808`–`k811` |
| `mool` | מול הנוף | רמות | `k680`–`k684` |
| `nofim` | נופים בלבן | רמות | `k685`, `k686` |
| `toscana` | בקתות טוסקנה | רמות | `k687`, `k688`, `k689` |
| `musical` | החצר המוסיקלית | רמות | `k690`, `k691`, `k692` |
| `maya` | בקתות מאיה | רמות | `k693`, `k694`, `k695` |
| `siesta` | סייסטה | רמות | `k618`–`k623` |
| `casa-nova` | קאסה נובה | מושב נוב | `k826`, `k827` |

קטלוג ציבורי מוכן ב-DB (בלי קודי גישה):

```sql
SELECT * FROM public.resort_public_catalog
WHERE tenant_id = '22222222-2222-2222-2222-222222222222'
  AND is_active IS DISTINCT FROM false
ORDER BY sort_order;
```

טבלאות:

- `resort_properties` — תוכן ציבורי ב־`content` JSONB. **`access` פרטי — לא לאתר.**
- `resort_units` — מלאי חי. עמודות: `id`, `name`, `unit_type`, `max_occupancy`, `base_price_agorot`, `property_id`, `content`, `access`.
- מחירים ב־**agorot** (₪1 = 100). `85000` = ₪850.

---

## 4. היומן — איך בודקים זמינות

טבלה: `public.hotelos_bookings`.

### חוק חפיפה (חובה, זהה לצוות)

שהות `[check_in, check_out)` — **יום היציאה פנוי** לאורח הבא.

שתי הזמנות חופפות אם:

```
A.check_in < B.check_out  AND  B.check_in < A.check_out
```

קוד קיים: `src/lib/bookingOverlap.js` (`staysOverlap`, `findOverlappingBooking`).

### אילו שורות חוסמות תאריך

הזמנה פעילה אם:

- `deleted_at IS NULL`
- `booking_status` לא `CANCELED` ולא `CHECKED_OUT`

סטטוסים: `PENDING` | `CONFIRMED` | `CHECKED_IN` | `CHECKED_OUT` | `CANCELED`.  
`PENDING` **כן** חוסם תאריכים (הזמנת WhatsApp בטיפול).

### שאילתת זמינות ליחידה

```sql
SELECT id, unit_id, check_in_date, check_out_date, booking_status, channel_source
FROM public.hotelos_bookings
WHERE tenant_id = '22222222-2222-2222-2222-222222222222'
  AND unit_id = $1
  AND deleted_at IS NULL
  AND booking_status NOT IN ('CANCELED', 'CHECKED_OUT')
  AND check_in_date < $wanted_out
  AND check_out_date > $wanted_in;
```

אם חזרה שורה — **תפוס**. לא להחזיר לאתר הציבורי שמות אורחים / טלפונים. רק טווחי תאריכים חסומים.

### מזהי הזמנות קיימים — לא לדרוס

| תבנית `id` | מקור | מה לעשות |
|---|---|---|
| `kin_{place}_{resid}` | סנכרון קינורוט / Airbnb | לא לעדכן ולא למחוק מהאתר |
| `b_{timestamp}` | הזמנה ידנית בצוות | לא לגעת |
| חדש מהאתר | אתם | `web_{unitId}_{yyyyMMdd}_{rand}` |

קינורוט רץ כל 30 דק׳. אם תמחקו `kin_%` הם יחזרו, ואם תכתבו על אותם תאריכים בלי בדיקת חפיפה יהיה כפל.

`channel_source` קיים: `DIRECT` | `kinorot` | `airbnb`. לאתר להשתמש ב־**`WEBSITE`**.

---

## 5. חוקי חגים / מינימום לילות

טבלה: `public.resort_booking_restrictions`.

| עמודה | משמעות |
|---|---|
| `property_id` | מתחם, או `NULL` = כל המתחמים |
| `start_date` / `end_date` | כולל שני הקצוות |
| `min_nights` | מינימום לילות (לוקחים את ה־max מכל הכללים החופפים) |
| `closed_to_arrival` | אסור check-in בתאריך בטווח |
| `closed_to_departure` | אסור check-out בתאריך בטווח |
| `price_multiplier` | מכפיל מחיר (לוקחים max) |
| `is_active` | חייב `true` |

חפיפת כלל לשהות: `start < check_out AND end >= check_in`.

קוד: `src/lib/bookingRestrictions.js` (`evaluateStayRestrictions`, `restrictionAlert`).  
מנוע מיאליס משתמש באותו לוגיקה: `src/lib/mialeesBookingRestrictions.js`.

```sql
SELECT * FROM public.resort_booking_restrictions
WHERE tenant_id = '22222222-2222-2222-2222-222222222222'
  AND is_active = true
  AND (property_id IS NULL OR property_id = $property_id);
```

---

## 6. הזמנה מקוונת — איך כותבים ליומן

אחרי בדיקת חפיפה + חוקים, `INSERT` (עדיף RPC טרנזקציוני עם `SELECT … FOR UPDATE` על אותה יחידה).

### שדות חובה

```json
{
  "id": "web_hill-1_20260828_ab12",
  "tenant_id": "22222222-2222-2222-2222-222222222222",
  "unit_id": "hill-1",
  "guest_name": "שם מלא",
  "guest_phone": "05xxxxxxxx",
  "guest_email": "optional@email",
  "check_in_date": "2026-08-28",
  "check_out_date": "2026-08-30",
  "adults_count": 2,
  "children_count": 1,
  "total_price_agorot": 170000,
  "deposit_agorot": 42500,
  "booking_status": "PENDING",
  "payment_status": "UNPAID",
  "channel_source": "WEBSITE",
  "checkout_token": "tok_<uuid>",
  "special_requests": "pax:2+1+1",
  "version": 1
}
```

### כללים

- `checkout_token` חייב להתחיל ב־`tok_` (ככה דף האורח עובד).
- תינוקות: אין עמודת `infants`. שומרים ב־`special_requests` כך: `pax:{adults}+{children}+{infants}`. אפשר להוסיף הערות אחרי `|`.
- ילדים = `children_count` בלי תינוקות.
- כסף רק ב־agorot.
- אחרי תשלום מקדמה: `payment_status = PARTIAL` או `PAID`, ו־`booking_status = CONFIRMED`.
- עד האישור הסופי: `PENDING` (הצוות רואה את זה בלוח).
- `expires_at` אופציונלי ללינק אורח.

Realtime: הטבלה ב־`supabase_realtime`. אחרי insert הצוות רואה בלי ריענון.

### מה לא לעשות

- לא לעדכן שורות `id LIKE 'kin_%'`.
- לא לשלוח `access` / קודי כספת ב־JSON לאתר.
- לא להשתמש ב־UUID ליחידות.

---

## 7. אחרי ההזמנה — אתר האורח

אתר אורח קיים: `https://resortos-db7.pages.dev`

קישור:

```
https://resortos-db7.pages.dev/?token=tok_...
```

או `/stay/tok_...`.

הטוקן פותח פרופיל יחידה דרך RPC `guest_stay_access(p_token)` — כולל Wi‑Fi ושער **רק** למי שיש הזמנה חיה. האתר השיווקי לא אמור לפתוח את זה בלי טוקן.

Mailbox צ׳ק-אאוט: Cloudflare Pages `functions/api/checkout/[[path]].js` + KV. לא חובה למנוע ההזמנות ביום הראשון.

---

## 8. iCal (OTA / Google)

נתיב קיים: `GET /api/ical/:unitId.ics`  
קובץ: `functions/api/ical/[unitId].js`

היום מחזיר אירועי דוגמה. לייצור אמיתי: אותן הזמנות פעילות מ־`hotelos_bookings`, בלי שם אורח:

```
DTSTART;VALUE=DATE:20260828
DTEND;VALUE=DATE:20260830
SUMMARY:Reserved
STATUS:CONFIRMED
TRANSP:OPAQUE
```

`DTEND` = `check_out_date` (יום היציאה, all-day).  
Cache קצר (≤ 15 דק׳) כי קינורוט מתעדכן כל חצי שעה.

ייבוא iCal מ־Airbnb **לא** מחובר; התפוסה מ־OTA מגיעה כרגע דרך קינורוט.

---

## 9. מחיר באתר

`resort_units.base_price_agorot` הוא מחיר בסיס בלבד, לא מחירון סופי.

מנוע מיאליס (דמו) מחשב ב־`calculateStayPricing` ב־`src/lib/multiPropertyCatalog.js`: אמצ״ש / סופ״ש, תוספת אורחים, extras, מקדמה ~25%.

לאתר האמיתי:

1. מחיר בסיס מהיחידה.
2. כפול `price_multiplier` מחוקי החגים.
3. לשמור את הסכום הסופי ב־`total_price_agorot`.

אל תסמכו על מחירי Unsplash/דמו ב־`PROPERTY_THEMES` כעל מחירון חי.

---

## 10. API מומלץ לאנטיגרביטי (לבנות)

Worker מול Studio Postgres. לא לחשוף PII ב־GET ציבורי.

### `GET /api/catalog`

רשימת מתחמים + יחידות מ־`resort_public_catalog`.

### `GET /api/availability?unit_id=hill-1&from=2026-08-20&to=2026-10-01`

מחזיר מערך `{ start, end }` של טווחים תפוסים בלבד.

### `GET /api/restrictions?property_id=siesta`

כללים פעילים למתחם + כללים גלובליים (`property_id` ריק).

### `POST /api/bookings`

Body כמו בסעיף 6. שרת:

1. מוודא יחידה פעילה.
2. בודק חפיפה.
3. בודק חוקי חגים.
4. `INSERT`.
5. מחזיר `{ id, checkout_token, status }`.

אופציונלי אחרי תשלום: WhatsApp ל־`0548076123` (מארח) — כמו דיספאץ׳ הצוות, לא במקום כתיבה ליומן.

---

## 11. קבצי קוד לעיון (לא להעתיק עיוור לדפדפן)

| נושא | קובץ |
|---|---|
| חפיפת תאריכים | `src/lib/bookingOverlap.js` |
| חוקי חגים | `src/lib/bookingRestrictions.js` |
| מיפוי יחידה→מתחם | `src/lib/guestProfileSeed.js` (`UNIT_PROPERTY`) |
| מלאי | `src/lib/units.js` |
| כתיבת הזמנה לצוות | `src/lib/cloudDb.js` (`pushBookingToCloud`) |
| סכמת הזמנות | `server/migration_hotelos_bookings.sql` |
| קטלוג ציבורי | `server/migration_resort_properties.sql` (view `resort_public_catalog`) |
| UI הזמנה (דמו) | `src/components/mialees/BookingEngine.jsx` |
| iCal | `functions/api/ical/[unitId].js` |

---

## 12. בדיקות קבלה

1. יחידה פנויה באתר → אותם תאריכים פנויים בלוח ב־`http://100.127.14.15:3001/`.
2. הזמנה מהאתר → מופיעה בלוח תוך שניות, מקור `WEBSITE`.
3. תאריך תפוס בקינורוט → האתר דוחה.
4. יום יציאה של אורח א׳ = יום כניסה של אורח ב׳ → מאושר.
5. כלל מינימום לילות / CTA חוסם באתר כמו בצוות.
6. דף יחידה ציבורי בלי Wi‑Fi / קוד כספת.
7. לינק `?token=tok_...` כן פותח מדריך אורח.

אם משהו מהסעיפים האלה נשבר — היומן והאתר לא מסונכרנים.
