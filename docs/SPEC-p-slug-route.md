# מפרט קצר — `/p/:slug` לטיוטות ResortOS (לאנטיגרביטי)

**תאריך:** 2026-09-11  
**רפו:** hotelos / resortos · פרודקשן: `https://dist-resortos.vercel.app`

## רקע
- 693 מתחמים עם `slug` ייחודי ב־`data/resortos-seed-weekend.json`.
- עובד היום: `https://dist-resortos.vercel.app/?preview=true&slug=bustan-guest-rooms`
- לא עובד: `https://dist-resortos.vercel.app/p/bustan-guest-rooms` → 404

## למה
תבנית WhatsApp `greetings_chloe_v1` צריכה כפתור URL דינמי ל־Meta:
`https://dist-resortos.vercel.app/p/{{slug}}` (ובהמשך `resortos.app`).

## דרישות
1. Route ציבורי `/p/:slug` (+ rewrite ב־`vercel.json` אם ה־SPA דורש).
2. אותו תוכן כמו preview: כרטיס טיוטה גם כש־`is_public=false`.
3. אין תמונות צד־ג׳ ציבוריות — placeholder עד Claim.
4. CTA «בעלי המתחם?» → מודאל OTP (WATI/SMS).
5. slug חסר → 404 ידידותי בעברית.
6. אופציונלי: redirect מ־`/?preview=true&slug=X` אל `/p/X`.

## DoD
- `GET /p/bustan-guest-rooms` → 200 + כרטיס טיוטה
- קטלוג ציבורי לא מציג `is_public=false`
