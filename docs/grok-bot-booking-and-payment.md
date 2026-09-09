# Grok Bot — הזמנה, זמינות וקישור תשלום

מדריך לסוכן שירות לקוחות חיצוני (Grok Bot / «שירות לקוחות») שמדבר עם אורחים בוואטסאפ. רץ מחוץ ל־Studio.

Base ציבורי בלבד: `https://resortos.app`  
לא `localhost`, לא `127.0.0.1`, לא Tailscale, לא פורט 3001.

מפתח API: משתנה סביבה `GROK_BOT_API_KEY` (או `GUEST_CONTEXT_API_KEY`). לא לכתוב את המפתח בצ׳אט עם האורח.

---

## Quick start for Grok Bot

1. אורח מבקש תאריכים + יחידה. נרמל תאריכים ל־`YYYY-MM-DD` (ישראל).
2. `GET /api/availability?unit_id={unitId}&from={checkIn}&to={checkOut}` — בלי מפתח.
3. אם `available !== true` או שיש `blockedRanges` שחופפים — לא יוצרים. מציעים תאריך/יחידה אחרת.
4. מאשרים עם האורח: יחידה, כניסה, יציאה, מחיר כולל ומקדמה (20% מהסה״כ, אלא אם הצוות נתן סכום אחר).
5. `POST /api/bookings` עם השדות החובה + `total_price_agorot` ו־`deposit_agorot` (לא אפס).
6. בונים קישור שהייה: `https://resortos.app/stay/{checkout_token}` ושולחים בוואטסאפ.
7. **זה** קישור התשלום לאורח. הוא ממלא שם+מייל ועובר ל־Hyp. לא שולחים URL של `pay.hyp.co.il`.
8. אם `POST /api/bookings` חוזר `409 DATES_OVERLAP_CONFLICT` — לא מנסים שוב על אותו טווח. בודקים `GET /api/guest-by-phone`.
9. אחרי תשלום אותו קישור `/stay/tok_…` נשאר; הסטטוס הופך ל־CONFIRMED / DEPOSIT_PAID.

---

## Auth

| Endpoint | מפתח |
|---|---|
| `GET /api/guest-by-phone` | חובה: `x-api-key: $API_KEY` או `Authorization: Bearer $API_KEY` |
| `GET /api/availability` | אין |
| `GET /api/catalog` | אין |
| `POST /api/bookings` | **אין כרגע** (endpoint ציבורי של האתר) |
| `GET/POST /api/checkout/{token}` | אין — הטוקן הוא האימות |

`401 UNAUTHORIZED` ב־guest-by-phone = מפתח חסר/שגוי. לא לנסות שוב עם מפתח אחר מול האורח.

`503 API_KEY_NOT_CONFIGURED` = המפתח לא מוגדר ב־Cloudflare. לעצור ולפנות לצוות.

---

## 1) יצירת הזמנה — מה שקיים

### `POST https://resortos.app/api/bookings`

קיים. כותב ליומן (`hotelos_bookings`) דרך RPC אטומי `create_public_booking` (נעילת יחידה + בדיקת חפיפה בטרנזקציה).

**Headers**

```
Content-Type: application/json
```

מפתח API **לא** נדרש היום. אין `channel_source` בבקשה — השרת תמיד שומר `WEBSITE`.  
אין `payment_mode` בבקשה — דף האורח מניח מקדמה (`CREDIT_DEPOSIT`) אלא אם נשמר אחרת ביומן (ה־RPC לא כותב את השדה).

**Body**

| שדה | חובה | הערות |
|---|---|---|
| `unit_id` | כן | טקסט יציב, למשל `dome-blue`. לא UUID. |
| `check_in_date` | כן | `YYYY-MM-DD`. טווח חצי־פתוח: כניסה נכללת, **יום היציאה פנוי** לאורח הבא. |
| `check_out_date` | כן | חייב להיות אחרי `check_in_date`. |
| `guest_name` | כן | שם מלא. לא «הזמנה בטיפול (WhatsApp)». |
| `guest_phone` | כן | נייד ישראלי, ספרות. עדיף `05xxxxxxxx`. |
| `guest_email` | לא | אם יש — לשלוח. דף התשלום דורש מייל לחשבונית. |
| `adults_count` | לא | ברירת מחדל `2`. |
| `children_count` | לא | ברירת מחדל `0`. ילדים בלי תינוקות. |
| `babies_count` | לא | אין עמודת תינוקות ב־DB. נשמר בתוך `special_requests` כ־`pax:A+C+B`. |
| `total_price_agorot` | לא טכנית, **חובה לסוכן** | אגורות. `120000` = ₪1,200. ברירת מחדל בשרת: `0`. |
| `deposit_agorot` | לא טכנית, **חובה לסוכן** | אגורות. ברירת מחדל באפליקציה: **20%** מהסה״כ. ברירת מחדל בשרת אם לא שולחים: `0`. |
| `special_requests` | לא | השרת מוסיף תמיד תג `pax:…` בהתחלה. |
| `is_buyout` | לא | `true` רק לקניית מתחם שלם + `property_id`. |
| `property_id` | לא | נדרש רק ל־buyout. כיפת שמיים = `kipat`. |

**שדות שהסוכן ביקש — מצב אמת**

| רצון | מצב |
|---|---|
| `status` התחלתי | תמיד `PENDING` + `payment_status: UNPAID`. אי אפשר לבחור. |
| מקור `whatsapp` / `grok-bot` | **MISSING.** ה־RPC כופה `channel_source: WEBSITE`. |
| `Idempotency-Key` | **MISSING.** אין כותרת כזו. |

**תשובת הצלחה — `201`**

```json
{
  "success": true,
  "booking": {
    "success": true,
    "id": "web_dome-blue_20260828_ab12",
    "checkout_token": "tok_<32hex>",
    "unit_id": "dome-blue",
    "check_in_date": "2026-08-28",
    "check_out_date": "2026-08-30",
    "total_price_agorot": 240000,
    "deposit_agorot": 48000,
    "booking_status": "PENDING"
  }
}
```

`id` נראה כך: `web_{unitId}_{YYYYMMDD}_{4 תווי hex אקראיים}`.  
`checkout_token` תמיד מתחיל ב־`tok_`.

**שגיאות**

| HTTP | `error` | מה לעשות |
|---|---|---|
| 400 | `MISSING_FIELDS` | חסר `unit_id` / תאריכים / שם / טלפון. |
| 400 | `INVALID_DATES` | יציאה לא אחרי כניסה. |
| 400 | `BAD_REQUEST` | JSON לא תקין. |
| 409 | `DATES_OVERLAP_CONFLICT` | היחידה תפוסה (כולל PENDING אחר). לא ליצור שוב. להציע טווח אחר או `guest-by-phone`. |
| 405 | `METHOD_NOT_ALLOWED` | רק POST. |
| 503 | `STUDIO_DB_UNAVAILABLE` | היומן לא זמין. לא להגיד «נשמר». להפנות לוואטסאפ של המתחם / לצוות. |
| 500 | `BOOKING_CREATION_FAILED` | שגיאת RPC. לא לחזור אוטומטית בלי בדיקת זמינות. |

---

## 2) קישור תשלום

**אין endpoint שמחזיר לינק Hyp מוכן ברגע היצירה.**  
אין שדה `pay_url` בתשובת `POST /api/bookings`.

מה שכן קיים:

1. **קישור האורח** (זה מה ששולחים בוואטסאפ) — סעיף 3.
2. אחרי שהאורח פותח את הקישור, ממלא שם+מייל ולוחץ תשלום, השרת קורא:
   - `POST /api/checkout/{checkout_token}`
   - body: `{ "guest_name", "guest_email", "special_requests?", "pay": true }`
   - תשובה כוללת `payment.pay_url` — URL חד־פעמי ל־`https://pay.hyp.co.il/p/?…` (חתימה משתנה).

הסוכן **לא** בונה ולא שומר את URL של Hyp. הוא פג / חד־פעמי.

**מתי הקישור תקף**

- קישור `/stay/tok_…`: עד יום אחרי `check_out_date` (ואז `410 EXPIRED`). ביטול → `404`.
- `PENDING` נועל תאריכים ביומן עד שהצוות מבטל. טיימר 15 דקות בדף הוא תצוגה בלבד — **אין** ביטול אוטומטי אחרי 15 דקות.
- אחרי תשלום מקדמה: אותו `/stay/tok_…`. סטטוס `CONFIRMED` + `DEPOSIT_PAID` / `PARTIAL`. יתרה בצ׳ק־אין.

**אם `deposit_agorot` ו־`total_price_agorot` הם 0**  
השרת לא פותח Hyp (`needsCharge` דורש סכום > ₪0.50) ומאשר בלי חיוב. לכן לסוכן אסור ליצור בלי סכומים אמיתיים.

---

## 3) קישור דף שהייה

תבנית קבועה אחרי יצירה:

```
https://resortos.app/stay/{checkout_token}
```

דוגמה:

```
https://resortos.app/stay/tok_a1b2c3d4e5f64789a0b1c2d3e4f50617
```

אין query `?token=` (וואטסאפ בעברית חותך אותו). רק הנתיב `/stay/tok_…`.

### MISSING — תיבת דואר האורח

דף `/stay/…` קורא `GET /api/checkout/{token}` מ־KV/D1, **לא** ישירות מ־Postgres.

`POST /api/bookings` כותב ליומן ומחזיר טוקן, **אבל לא מפרסם** את ההזמנה לתיבת האורח (`persistGuestRow`).  
במצב הזה `GET /api/checkout/{token}` יכול להחזיר `404 NOT_FOUND` והאורח רואה קישור מת.

פרסום קיים רק מיומן הצוות (`PUT /api/checkout/publish`, דורש admin) או מדיספאץ׳ וואטסאפ ב־Studio.

**חוזה מינימלי שצריך לבנות** (עדיין לא קיים):

```
POST /api/agent/bookings
Headers:
  Content-Type: application/json
  x-api-key: $API_KEY
Body: כמו POST /api/bookings
      + client_request_id? (ייחודי לשיחה)
      + channel_source: "GROK_BOT"
Side effects:
  1. create_public_booking (או RPC מקביל עם channel_source)
  2. persistGuestRow — כדי ש־GET /api/checkout/{token} יעבוד מיד
Response 201:
  { id, checkout_token, stay_url, booking_status, payment_status }
```

`stay_url` = `https://resortos.app/stay/{checkout_token}`.

עד שזה קיים: אחרי `POST /api/bookings` הסוכן יכול לבדוק:

```
GET https://resortos.app/api/checkout/{checkout_token}
```

- `200` — לשלוח את הקישור.
- `404` — **לא להגיד לאורח שהקישור מוכן.** להודיע לצוות לפרסם את התיבה, או לחכות ל־endpoint למעלה.

---

## 4) unitId ↔ עברית

מקור: `functions/lib/unitNames.js` / `src/lib/units.js`. לא להמציא מזהים.

### כיפת שמיים (`property_id`: `kipat`)

| unitId | שם |
|---|---|
| `dome-blue` | כיפת שמיים כחול |
| `dome-red` | כיפת שמיים אדום |
| `dome-green` | כיפת שמיים ירוק |

מחיר בסיס בקוד: ₪1,200 / לילה (`120000` אגורות). זה בסיס, לא מחירון סופי לחגים.

### עוד יחידות נפוצות

| unitId | שם | property_id |
|---|---|---|
| `hill-1` … `hill-4` | צימר בגבעה 1–4 | `hill` |
| `mialis-villa` | וילה מיאליס ריזורט | `mialis` |
| `suite-1` | סוויטה 1 (הירוקה) | `mialis` |
| `suite-2` | סוויטה 2 (הורודה) | `mialis` |
| `k671`, `k673`–`k679` | בתי נורית 1–8 (אין `k672`) | `nurit` |
| `k808`–`k811` | טאג׳ מאהל · בקתה 1–4 | `taj` |
| `k680`–`k684` | מול הנוף · בקתה 1–5 | `mool` |
| `k685`, `k686` | נופים בלבן · בקתה 1–2 | `nofim` |
| `k687`, `k688`, `k689` | טוסקנה · פירנצה 1 / 2 / שאטו | `toscana` |
| `k690`–`k692` | חצר מוסיקלית · חליל / מיתר / פעמון | `musical` |
| `k693`–`k695` | בקתות מאיה · בקתה 1–3 | `maya` |
| `k618`–`k623` | סייסטה · משפחתית / רומנטית / בת הים | `siesta` |
| `k826`, `k827` | קאסה נובה · Aura / Bloom | `casa-nova` |

רשימה חיה: `GET https://resortos.app/api/catalog`.

---

## זמינות (תזכורת)

```
GET https://resortos.app/api/availability?unit_id=dome-blue&from=2026-08-28&to=2026-08-30
GET https://resortos.app/api/availability?date=2026-08-28
```

`date` לבד = חלון של אותו יום עד היום שלמחרת.

חופף אם: `A.checkIn < B.checkOut && B.checkIn < A.checkOut`.  
יום היציאה של אורח א׳ פנוי לאורח ב׳.

`blockedRanges`: `{ unitId, checkIn, checkOut, status }`.  
שורות שחוסמות: כל סטטוס חוץ מ־`CANCELED` / `CHECKED_OUT`.

אם יש `unit_id`: התשובה כוללת `available: true|false` ו־`unitName`.

`503 CALENDAR_SYNC_TEMPORARY_UNAVAILABLE` — לא לנחש זמינות.

---

## Lookup אורח

```
GET https://resortos.app/api/guest-by-phone?phone=0548076123
```

Headers: `x-api-key: $API_KEY`.

אליאסים לטלפון: `sender`, `wa`, `wa_id` (למשל `972548076123@c.us`).

`found: true` = שהייה פעילה או הקרובה.  
שים לב: `PENDING` ביומן ממופה ב־lookup ל־`confirmed` (אין ערך `pending` בסכמה הזו).

---

## 5) כללי בטיחות

- לא ליצור אם `available !== true` או שיש חפיפה ב־`blockedRanges`.
- לא לשנות מחיר / הנחה בלי אישור צוות מפורש. **אין דגל הנחה ב־API** (MISSING). בלי אישור: מחיר בסיס × לילות, מקדמה 20%. לא לשלוח `0`.
- כפילות: אין `Idempotency-Key`. אחרי הצלחה — לשמור `checkout_token` בשיחה ולא לקרוא `POST` שוב. ניסיון שני על אותה יחידה+תאריכים → `409` (ה־PENDING הראשון חוסם). אם ה־POST הצליח והתשובה אבדה: `GET /api/guest-by-phone` ואז אותו `/stay/tok_…` אם יש טוקן, או בדיקת צוות.
- לא לבטל/לשנות הזמנות קינורוט (`id` שמתחיל ב־`kin_`).
- לא לשלוח קודי כספת / Wi‑Fi / שער. הם נפתחים בדף האורח רק אחרי תשלום + צ׳ק־אין.
- לא לחשוף את `$API_KEY` לאורח.
- לא לפתוח Hyp בשם האורח אלא אם יש מייל אמיתי והתיבה כבר `200`.

---

## 6) curl

בדיקת זמינות (בלי מפתח):

```bash
curl -sS "https://resortos.app/api/availability?unit_id=dome-blue&from=2026-08-28&to=2026-08-30"
```

יצירת הזמנה + בניית קישור שהייה:

```bash
curl -sS -X POST "https://resortos.app/api/bookings" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_id": "dome-blue",
    "check_in_date": "2026-08-28",
    "check_out_date": "2026-08-30",
    "guest_name": "ישראל ישראלי",
    "guest_phone": "0540000000",
    "guest_email": "guest@example.com",
    "adults_count": 2,
    "children_count": 0,
    "total_price_agorot": 240000,
    "deposit_agorot": 48000,
    "special_requests": "Grok Bot / WhatsApp"
  }'
```

מהתשובה:

```
STAY_URL="https://resortos.app/stay/${checkout_token}"
```

בדיקה שהדף באמת חי (לפני שליחה לאורח):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://resortos.app/api/checkout/${checkout_token}"
```

`200` = אפשר לשלוח. `404` = התיבה לא פורסמה (MISSING, סעיף 3).

Lookup אורח (עם מפתח):

```bash
curl -sS "https://resortos.app/api/guest-by-phone?phone=0540000000" \
  -H "x-api-key: $API_KEY"
```

**אין** curl שמחזיר `pay_url` של Hyp בלי POST ל־`/api/checkout/{token}` אחרי שהתיבה קיימת ואחרי שם+מייל.

---

## Do not

- לא ליצור הזמנה לפני `available: true` ואישור האורח.
- לא לשלוח `pay.hyp.co.il` — רק `https://resortos.app/stay/tok_…`.
- לא ליצור עם מחיר `0` או בלי מקדמה.
- לא להמציא `unit_id`.
- לא לחזור על `POST /api/bookings` אחרי `201` או אחרי `409` על אותו טווח.
- לא להגיד שהקישור עובד אם `GET /api/checkout/{token}` הוא `404`.
- לא לכתוב מפתחות, לא Studio, לא localhost.

---

## קבצי קוד (לצוות, לא לסוכן)

| נושא | קובץ |
|---|---|
| יצירת הזמנה | `functions/api/bookings.js` |
| RPC | `server/migration_public_booking_rpc.sql` |
| זמינות | `functions/api/availability.js` |
| Lookup | `functions/api/guest-by-phone.js` |
| דף אורח / Hyp | `functions/api/checkout/[[path]].js` |
| מקדמה 20% | `src/lib/deposit.js` |
| שמות יחידות | `functions/lib/unitNames.js` |
