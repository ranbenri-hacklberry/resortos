# ops.resortos.app — דף כניסה (Field Ops)

**URL:** https://ops.resortos.app  
**Title:** ResortOS | Occupancy  
**מצב:** `field` (ניהול משימות שטח)  
**רכיב:** `src/components/Login.jsx` (`mode="field"`)  
**Host gate:** `ops.resortos.app` / `ops.resortos.co.il` → `isFieldOpsHost` ב־`src/lib/fieldStaff.js`

---

## תשתית (ספט׳ 2026)

- Cloudflare Worker `resortos-ops` (`ops-worker/`) על הדומיין `ops.resortos.app`
- ה-Worker מפרוקסי ל־quick tunnel (`*.trycloudflare.com`) שמגיע ל־Vite על ה-Studio ב־`127.0.0.1:3001`
- Named tunnel `resortos-ops` קיים גם כן (ingress ל־ops.resortos.app), אבל ה-Worker לא יכול לקרוא ל־`*.cfargotunnel.com` (Error 1102) — לכן בינתיים quick tunnel
- pm2 process: `resortos-quick` — אחרי restart הכתובת trycloudflare משתנה וצריך לעדכן `ops-worker/worker.js` + `wrangler deploy`

**תיקון יציב מומלץ:** CNAME של `ops` → `cd3e733e-c88d-41dd-a3f5-fbf019009ea5.cfargotunnel.com` ולהסיר את ה-Worker מהדומיין (דורש הרשאת DNS ב־Cloudflare).

---

## מבנה המסך

כרטיס כניסה ממורכז על רקע מלא (כהה / קרם בהיר).

| אזור | תוכן |
|------|------|
| אייקון | מגן (`ShieldCheck`) בסגול `#6366F1` |
| כותרת | **ניהול משימות שטח** |
| תת־כותרת | כניסה עם משתמש צוות קיים |
| שפה | עברית · English · العربية · ไทย |
| ערכת נושא | כהה 🌙 · קרם בהיר ☀️ |
| שדות | שם משתמש · סיסמה (+ הצג/הסתר) |
| CTA | **כניסה** (מושבת עד שיש ערכים) |

---

## שפות (i18n)

| קוד | תווית | כיוון |
|-----|--------|--------|
| `he` | עברית | RTL |
| `en` | English | LTR |
| `ar` | العربية | RTL |
| `th` | ไทย | LTR |

ברירת מחדל: עברית. בחירה נשמרת ב־`persistLanguage`.

---

## ערכות נושא

| מזהה | רקע מסך | רקע כרטיס |
|------|----------|-----------|
| `dark` | `#0A0A0C` | `#141416` |
| `light` | `#F6F3EC` | `#FAF8F3` |

בחירה פעילה: מסגרת `#6366F1`.

---

## התנהגות כניסה

1. `loginStaff(username, password)` מ־`src/lib/staffAuth`
2. הצלחה → `onLoggedIn` → מעבר ל־`FieldStaffView`
3. כשל → «שם משתמש או סיסמה שגויים»
4. Rate limit → «יותר מדי ניסיונות…»

---

## אחרי התחברות

מסך משימות שטח (`FieldStaffView`): רשימת משימות לפי יחידות מורשות, דיווח תקלה/מחסור, סימון ניקיון, לוג עבודה.
