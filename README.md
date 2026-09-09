# ResortOS — מערכת ניהול תפוסה, תפעול ושהייה למתחמי נופש

![ResortOS Platform](https://img.shields.io/badge/Status-Production-brightgreen)
![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)
![Vite 6](https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite)
![IndexedDB](https://img.shields.io/badge/Dexie.js-IndexedDB%200ms-blue)
![Cloudflare Pages](https://img.shields.io/badge/Deployment-Cloudflare%20Pages-F38020?logo=cloudflare)

**ResortOS** היא מערכת ניהול (PMS & Operations) למתחמי אירוח, צימרים וסוויטות. היא מכסה לוח תפוסה גאנט, תפעול ואחזקה בזמן אמת, פורטל אורחים לאורך כל השהייה, וקישורי תשלום בוואטסאפ.

דף נחיתה לבעלי מתחמים (עברית + אנגלית): `landing.html`

---

## תכונות מרכזיות

### לוח תפוסה גאנט
- תצוגת 60 יום נגללת
- חצי־תא לכניסה וליציאה באותו יום
- סיכום יומי: תפוסה, הכנסה, כניסות ויציאות

### תפעול, משק בית ואחזקה
- תפקידים: משק בית, אחזקה, חצרנות, מנהל
- קריאות עם תמונות
- ניקיון תחלופה אוטומטי ביציאה
- בקרת איכות מנהל — ציון נמוך פותח את המשימה מחדש

### פורטל אורחים
- לפני הגעה: מדריך אזור, כרטיסים, ניווט
- במהלך השהייה: קוד דלת, שער, Wi‑Fi, חנות בקתה, לייט צ׳ק־אאוט
- אחרי השהייה: צ׳ק־אאוט עצמי וביקורת בגוגל

### פיננסים ווואטסאפ
- לינק תשלום מאובטח עם נעילת חדר ל־15 דקות
- מקדמה / תשלום מלא / מזומן בהגעה
- עמלה 1.5% על הזמנה ישירה, פירוט נטו חודשי

### צוות ושפות
- משתמש נפרד לכל עובד, נוכחות GPS
- עברית, אנגלית, ערבית, תאילנדית + תרגום חי לתוכן חופשי

---

## הרצה מקומית

```bash
git clone https://github.com/ranbenri-hacklberry/hotelos.git
cd resortos
npm install
npm run dev
```

- מערכת צוות: `http://localhost:3001`
- דף נחיתה: `http://localhost:3001/landing.html`

---

## פריסה

דף הבית הציבורי (`https://resortos.app`) הוא דף הנחיתה. `/stay/…` ו־`/demo` נשארים דף האורח.

```bash
npm run deploy:guest
```

בפיתוח מקומי: `http://localhost:3001/landing.html`

## סליקת Hyp (פרודקשן)

אורחים משלמים בדף המאובטח של Hyp (`pay.hyp.co.il`). הסודות נשארים בשרת בלבד — Cloudflare Pages secrets על הפרויקט `resortos`.

| תפקיד | מסוף | שימוש |
|---|---|---|
| A יתרות | `4502210929` | תשלום מלא / יתרה בצ׳ק־אין |
| B מקדמות | `4502315932` | מקדמה באישור ההזמנה |

משתנים (בלי ערכים אמיתיים בגיט): `HYP_A_KEY`, `HYP_A_PASSP`, `HYP_B_KEY`, `HYP_B_PASSP`.  
הצלחה נקבעת לפי `CCode=0` אחרי VERIFY, לא לפי HTTP 200.

בדיקות בלי חיוב חי: `npm run test:hyp`

---

## רישיון
כל הזכויות שמורות © ResortOS 2026.
