# 🏨 HotelOS - מערכת ניהול תפוסה, תפעול ותשלומים לצימרים ומתחמי אירוח

![HotelOS Platform](https://img.shields.io/badge/Status-Production-brightgreen)
![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react)
![Vite 6](https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite)
![IndexedDB](https://img.shields.io/badge/Dexie.js-IndexedDB%200ms-blue)
![Cloudflare Pages](https://img.shields.io/badge/Deployment-Cloudflare%20Pages-F38020?logo=cloudflare)

**HotelOS** היא מערכת ניהול מתקדמת וחדשנית (PMS & Operations System) המיועדת למתחמי אירוח, צימרים וסוויטות יוקרה. המערכת מספקת מענה מלא החל מלוח תפוסה גאנט אינטראקטיבי, דרך ניהול משימות תפעול ואחזקה בזמן אמת, ועד למעקב פיננסי ושליחת קישורי תשלום מהירים ב-WhatsApp.

---

## ✨ תכונות מרכזיות (Key Features)

### 📅 1. לוח תפוסה גאנט דינמי (Occupancy Gantt Board)
- **תצוגת 60 ימים נגללת**: סריקה וגרירה חלקה ב-60 ימים קדימה.
- **דיוק תאריכים מוחלט (Half-Cell Turnaround)**:
  - **צ׳ק-אין (Check-In)**: ההזמנה מתחילה בדיוק בחצי השמאלי של משבצת הגעת האורח.
  - **צ׳ק-אאוט (Check-Out)**: ההזמנה מסתיימת בחצי הימני של משבצת יום היציאה.
  - חלוקה חלקת של 50%-50% בעת תחלופת אורחים באותו היום.
- **סיכום יומיומי בלחיצה**: בלחיצה על כותרת התאריך נפתח חלון סיכום נתונים יומיומי (תפוסה באחוזים, הכנסה משוערת, כניסות ויציאות).

---

### 🧹 2. ניהול תפעול, משק בית ואחזקה (Operations & Maintenance)
- **סינון לפי תפקידים**: היררכיה מלאה עבור משק בית 🧹, אחזקה 🔧, חצרנות 🌱 ומנהלים 👑.
- **פתיחת קריאות חדשות בזמן אמת**:
  - צילום תמונות ישירות ממצלמת הנייד/העלאת קבצי מדיה.
  - הפרדת תמונות מוחלטת לכל קריאה למניעת זליגת מדיה.
- **בקרת איכות מנהל (Quality Inspection)**: מנגנון משוב ודירוג איכות ביצוע מנהל (זמן ביצוע, מקצועיות, רמת ניקיון).

---

### 🌐 3. תרגום דינמי בלייב ב-4 שפות (Live Multi-Language Engine)
- **תמיכה מלאה ב-4 שפות**: 🇮🇱 עברית, 🇺🇸 אנגלית, 🇸🇦 ערבית, 🇹🇭 תאילנדית.
- **תרגום תוכן דינמי (Dynamic Text Translation)**: תיאורי קריאות ושמות סוויטות שהוקלדו חופשית מתורגמים אוטומטית בלייב לשפה שנבחרה.
- **זיכרון מטמון (0ms Cache)**: תרגומים נשמרים בזיכרון המקומי לטעינה מיידית ללא השהיה.

---

### 💳 4. פיננסים, עמלות וזיכויים (Financials & Payouts)
- **סיכום הכנסות מבוקר**: הצגת הכנסה ברוטו, עמלות מערכת וסליקה מופחתות (1.5%), וזיכוי נטו לבעל הצימר.
- **פירוט עסקאות חודשי**: טבלה מפורטת ומבוקרת של כל ההזמנות הסגורות.

---

### 📲 5. שליחת לינק תשלום מהיר ב-WhatsApp (5-Second Dispatch)
- הפקת קישור מאובטח (PayLink) עם נעילת חדר זמנית ל-15 דקות ושליחה ישירה ל-WhatsApp של האורח.

---

## 🛠️ טכנולוגיות וארכיטקטורה (Tech Stack)

| רכיב | טכנולוגיה |
| :--- | :--- |
| **Front-End Framework** | React 19 + Vite 6 |
| **Database (Local 0ms)** | Dexie.js (IndexedDB wrapper with live reactive hooks) |
| **Cloud Realtime Sync** | REST API & Realtime Webhooks |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Internationalization** | i18next + react-i18next + MyMemory Translation Engine |
| **Deployment** | Cloudflare Pages (Wrangler CLI) |

---

## 🚀 הוראות הרצה מקומית (Getting Started)

### דרישות מוקדמות:
- Node.js גרסה 18 ומעלה
- npm גרסה 9 ומעלה

### 1. שיבוט המאגר (Clone Repository)
```bash
git clone https://github.com/ranbenri-hacklberry/hotelos.git
cd hotelos
```

### 2. התקנת תלויות (Install Dependencies)
```bash
npm install
```

### 3. הרצת השרת המקומי (Run Dev Server)
```bash
npm run dev
```
פתח את הדפדפן בכתובת: `http://localhost:3001`

---

## 📦 פריסה לייצור (Deployment to Production)

לבנייה ופריסה ישירה ל-Cloudflare Pages:
```bash
npm run build
npx wrangler pages deploy dist --project-name=hotelos --branch=main
```

---

## 📄 רישיון (License)
כל הזכויות שמורות © HotelOS System 2026.
