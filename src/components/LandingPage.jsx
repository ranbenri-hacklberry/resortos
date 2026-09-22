import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Copy,
  CreditCard,
  Globe,
  KeyRound,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  Users,
  Wifi,
  Wrench,
  X
} from 'lucide-react';

const CONTACT_PHONE = '972548076123';
const LANG_KEY = 'resortos-landing-lang';
const RESORT_RATE = 0.015;
const OTA_RATE = 0.18;

const COPY = {
  he: {
    dir: 'rtl',
    htmlLang: 'he',
    title: 'ResortOS | מערכת ההפעלה של מתחם האירוח',
    nav: {
      product: 'המוצר',
      compare: 'מול יומן',
      guest: 'חוויית האורח',
      why: 'למה אנחנו',
      contact: 'רשימת המתנה'
    },
    langSwitch: 'EN',
    langAria: 'Switch to English',
    cta: 'הצטרפות לרשימת המתנה',
    ctaNav: 'רשימת המתנה',
    ctaSecondary: 'איך זה עובד',
    heroKicker: 'לבעלי מתחמי נופש, צימרים וסוויטות בוטיק',
    heroTitle: 'מערכת ההפעלה של מתחם האירוח. לא עוד מערכת שצריך לנהל.',
    heroLead:
      'ResortOS יודעת מה אמור לקרות במתחם, פועלת מול עובדים, אורחים, מכשירים ורובוטים, ומוודאת שמה שאמור לקרות באמת קרה. העובד לא צריך ללמוד מערכת חדשה — הוא מקבל את העבודה בערוץ שכבר מוכר לו.',
    statsKicker: 'מספרי מפתח',
    stats: [
      { value: '1.5%', title: 'עמלה', text: 'שומרים על הרווח מהזמנות ישירות, במקום לשלם 15%–20% לעמלות תיווך.' },
      { value: '10+ שעות', title: 'חיסכון שבועי', text: 'פחות כתיבת הודעות, תיאום מנקים, גביית תשלומים והסברים על איך מפעילים את הג׳קוזי.' },
      { value: 'אותו יום', title: 'התאמת בנק', text: 'היומן, Hyp והחשבון העסקי נסגרים לאותו סכום — בלי ייצוא לקובץ ובלי לחכות לרו״ח בחודש הבא.' },
      { value: '0', title: 'שיחות בלילה', text: 'שקט מוחלט: קוד לשער, סיסמת Wi‑Fi, הפעלת מכשירים וניווט — הכל פתוח לאורח בנייד שלו.' }
    ],
    problemKicker: 'המצב היום',
    problemTitle: 'המתחם עובד. המידע מפוזר בכל מקום.',
    problemLead: 'הבעיה היא לא שוואטסאפ קיים. הבעיה היא שהעסק כולו הופך לזיכרון בתוך קבוצות והודעות: מי ביקש מה, איזה חדר, מה פתוח, מה נסגר, ומה עדיין לא טופל.',
    problems: [
      { title: 'המידע קבור בשיחות', text: 'קבוצות, הודעות ושיחות פרטיות הופכות את מצב המתחם לחיפוש אינסופי אחורה: מי אמר מה, על איזה חדר, ומה עדיין פתוח.' },
      { title: 'העבודה נשארת בראש', text: 'מי מנקה, מה לקחת, כמה אנשים צריך ומה כבר הסתיים — עובר מפה לאוזן. אין מערכת שמנהלת את הלופ ומוודאת שהעבודה בוצעה.' },
      { title: 'הודעות במקום תפעול', text: 'וואטסאפ יודע להעביר הודעה. הוא לא יודע לנהל את המשימה, לעקוב אחרי זמן, לזהות חריגה ולוודא שהמציאות תואמת לדיווח.' },
      { title: 'אף אחד לא מחזיק את מצב העסק', text: 'גם כשכל המידע קיים איפשהו, אין שכבה אחת שיודעת מה צריך לקרות עכשיו, מה כבר קרה, ומה דורש התערבות.' }
    ],
    productKicker: 'איך מערכת הפעלה למתחם עובדת',
    productTitle: 'ResortOS לא מציגה עבודה. היא מפעילה אותה.',
    productLead: 'Observe → Understand → Decide → Act → Verify. המערכת מחזיקה את המצב התפעולי, מתקשרת עם מי שצריך, ומוודאת שהתוצאה באמת קרתה.',
    features: [
      {
        icon: 'calendar',
        title: 'לוח תפוסה גאנט',
        text: 'תצוגה של 60 יום, חלוקת תא חכמה לתחלופה באותו יום, ותמונת מצב יומית בלחיצה אחת.'
      },
      {
        icon: 'whatsapp',
        title: 'תקשורת דרך הערוץ שהצוות כבר מכיר',
        text: 'ResortOS יכולה לשלוח משימות והנחיות דרך WhatsApp, לשאול מה הסטטוס, לזהות עיכוב ולהסלים כשצריך. WhatsApp הוא הערוץ — לא מערכת התפעול.'
      },
      {
        icon: 'ops',
        title: 'תפעול עם אימות רב־מקור',
        text: 'דיווח עובד הוא אות אחד בלבד. ResortOS יכולה להצליב אותו עם פתיחת דלת, חשמל, מים, חיישנים, זמן, מצלמות או בדיקת רובוט ולזהות אנומליות לפני שהיא מסמנת משימה כהושלמה.'
      },
      {
        icon: 'money',
        title: 'מצב תפעולי חי',
        text: 'כל יחידה מחזיקה מצב חי: אורח, ניקיון, בדיקה, תחזוקה, ציוד, גישה, משימות ומוכנות. המטרה היא שהמערכת תדע מה קורה — לא שהמנהל יחפש את המידע.'
      },
      {
        icon: 'staff',
        title: 'אנשים, רובוטים ומכשירים',
        text: 'ResortOS מפעילה בני אדם, IoT ורובוטים דרך שכבת תפעול אחת. העובד לא חייב להשתמש באפליקציה; הרובוט לא חייב לדעת את העסק; ה-Core מחליט מה צריך לקרות.'
      },
      {
        icon: 'reviews',
        title: 'המערכת מנהלת, המנהל רואה חריגים',
        text: 'במקום Dashboard שדורש ניהול מתמיד, ResortOS אמורה לבצע את לופ הניהול: להקצות, לעקוב, לשאול, לאמת ולהסלים. המנהל נכנס כשנדרשת החלטה.'
      }
    ],
    guestKicker: 'חוויית האורח',
    guestTitle: 'קישור אחד. אפס הורדות של אפליקציה.',
    guestLead: 'אותו קישור נשאר עם האורח עד סוף השהייה — בלי אפליקציה שהוא לא יוריד.',
    journeyGuest: 'האורח מקבל',
    journeyOwner: 'בעל המתחם מרוויח',
    screens: {
      preKicker: 'לפני הגעה',
      hello: 'שלום אורחת דמו',
      waiting: 'מחכים לכם בבתי נורית 1',
      dates: '25/08/2026 עד 27/08/2026',
      checkin: 'צ׳ק-אין מ-15:00',
      countdown: 'נשארו יומיים עד הכניסה',
      area: 'מדריך האזור · רמות · סובב כנרת והגולן',
      waze: 'Waze',
      maps: 'Google Maps',
      call: 'התקשר',
      message: 'הודעה',
      stayKicker: 'בשהייה',
      cabin: 'בקתה בתי נורית 1',
      pinLabel: 'קוד כספת מפתח',
      pinUntil: 'בתוקף עד הצ׳ק-אאוט',
      copy: 'העתקה',
      gate: 'קוד שער',
      wifi: 'Wi‑Fi',
      jacuzzi: 'הפעלת הג׳קוזי',
      jacuzziSteps: [
        'סוגרים את הפקק או המכסה.',
        'ממלאים מים עד מעל הסילונים.',
        'מפעילים מנועים ואז סילונים.'
      ],
      thanks: 'תודה ששהיתם אצלנו',
      thanksBody: 'הצ׳ק-אאוט הושלם. נשמח למשוב קצר על השהייה.',
      rate: 'איך הייתה השהייה?',
      rateHint: 'בחרו כמה כוכבים — זה עוזר לנו מאוד'
    },
    journey: [
      {
        screen: 'pre',
        phase: 'לפני ההגעה',
        guest: 'ספירה לאחור, ניווט בוויז, ומדריך אטרקציות וחוויות בהנחת אורח בלעדית.',
        owner: 'אפס שיחות של «איך מגיעים?», ומכירה מוקדמת של פעילויות באזור.'
      },
      {
        screen: 'stay',
        phase: 'במהלך השהייה',
        guest: 'קוד דלת שנדרך לפי שעת צ׳ק־אין, פתיחת שער, סיסמת Wi‑Fi, הוראות ג׳קוזי וחנות פינוקים ליחידה.',
        owner: 'שקט מהודעות שירות, והגדלת הכנסות מתוספות ומוצרים בחדר.'
      },
      {
        screen: 'post',
        phase: 'אחרי העזיבה',
        guest: 'צ׳ק־אאוט עצמי בלחיצה, פירוט חשבון סגור, ולינק ישיר להשארת ביקורת.',
        owner: 'סנכרון מיידי לצוות הניקיון וגידול שוטף בביקורות החיוביות ברשת.'
      }
    ],
    whyKicker: 'למה ResortOS',
    whyTitle: 'נבנה כדי להפעיל מתחמי אירוח פיזיים',
    reasons: [
      {
        title: 'WhatsApp הוא ערוץ — לא מערכת',
        text: 'מתחמים כבר משתמשים ב-WhatsApp לכל דבר: קבוצות עובדים, משימות, תקלות, חדרים, תמונות ושאלות. ResortOS לא מנסה להחליף את ההרגל הזה באפליקציה חדשה — היא הופכת את הערוץ הקיים לממשק של מערכת תפעול שמאחוריו.'
      },
      {
        title: 'העובד לא צריך להיות משתמש תוכנה',
        text: 'ברק לא צריך לפתוח אפליקציה כדי לדעת מה לנקות. הוא צריך לקבל הודעה: אילו חדרים, באיזו שעה, כמה אנשים, מה לקחת ומה לעשות. ResortOS מנהלת את התקשורת והמעקב מאחורי הקלעים.'
      },
      {
        title: 'Expected State מול Observed State',
        text: 'המערכת יודעת מה אמור לקרות ומה היא באמת רואה. אין עדכון? זו אינפורמציה. יש דיווח אבל אין ראיות תואמות? זו אנומליה. המערכת ממשיכה לבדוק עד שהיחידה באמת מוכנה.'
      },
      {
        title: 'Edge מקומי. Cloud מחובר.',
        text: 'לכל מתחם יכול להיות Edge מקומי שמחזיק את המצב התפעולי וממשיך לעבוד גם כשהאינטרנט נופל. הענן מספק גיבוי, סנכרון, ניהול מרחוק ועדכונים — לא את לולאת התפעול עצמה.'
      }
    ],
    compareKicker: 'מערכת שמפעילה, לא רק מערכת שמציגה',
    compareTitle: 'וואטסאפ מעביר הודעות. Dashboard מציג מידע. ResortOS מפעילה את המתחם.',
    compareLead:
      'הבעיה אינה שחסר מידע. הבעיה היא שהמידע מפוזר בין קבוצות, הודעות, מחברות ומסכים. ResortOS מחברת את המצב הפיזי של המתחם ללולאת פעולה: Observe → Decide → Act → Verify.',
    comparePillars: [
      { title: 'ניהול ידני', tag: 'קבוצות וואטסאפ · מחברת · אקסל', text: 'המידע קיים — אבל מפוזר. צריך לזכור, לחפש, לשאול ולעדכן.' },
      { title: 'Dashboard / PMS', tag: 'יומן · הזמנות · מסכים', text: 'מרכז מידע ומציג אותו. עדיין דורש מאדם לנהל את הפעולות.' },
      { title: 'ResortOS', tag: 'מערכת הפעלה למתחם', text: 'יודעת מה אמור לקרות, פועלת מול אנשים ומכשירים, מאמתת תוצאות ומערבת מנהל רק בחריגים.', featured: true }
    ],
    compareLoop: ['האורח משלם', 'קוד נדרך במנעול', 'מזגן שעה לפני הגעה', 'צ׳קליסט למנקה', 'מס״ב באישור 4-עיניים', 'יומן, Hyp והבנק לאותו סכום'],
    compareCols: ['ResortOS', 'יומן / אתר הזמנות', 'ניהול ידני'],
    compareRows: [
      { topic: 'הכסף', us: 'היומן, Hyp והבנק נסגרים באותו יום.', ledger: 'ייצוא לקובץ. הרו״ח רואה את הבנק בחודש הבא.', manual: 'ביט, מזומן, «נבדוק בסוף החודש».' },
      { topic: 'שכר וספקים', us: 'קובץ מס״ב אחד. שני אנשים מאשרים לפני שליחה.', ledger: 'פנקס צ׳קים והקלדה ידנית של עשרות העברות.', manual: 'מזומן במעטפה, או הקלדה בבנק אחת-אחת.' },
      { topic: 'הדלת והשטח', us: 'קוד לפי שעת צ׳ק-אין. מזגן ושער מהמערכת.', ledger: 'תוסף מנעולים יקר — או בלי חיבור בכלל.', manual: 'מפתח ביד, שער בקוד שכולם זוכרים.' },
      { topic: 'הצוות', us: 'וואטסאפ דו-כיווני: משימה, תמונה, צ׳קליסט.', ledger: 'SMS «שלח ושכח» או טלפון.', manual: 'וואטסאפ אישי, שיחות, «מי ניקה את 4».' },
      { topic: 'האורח כשהרשת נופלת', us: 'פורטל שהייה: קוד, Wi-Fi, ג׳קוזי. העבודה ממשיכה גם בלי ענן.', ledger: 'לינק תשלום בדפדפן. נפילת סיב משביתה את היומן בענן.', manual: 'הטלפון הפרטי שלכם הוא המוקד.' }
    ],
    feeTitle: 'כמה תחסכו מול בוקינג',
    feeLead: 'הזינו מספר הזמנות ישירות ומחיר ממוצע לחדר. ב־ResortOS העמלה היא 1.5% — מערכת וסליקה יחד — מול 15%–20% בפלטפורמות.',
    feeBookings: 'הזמנות בחודש',
    feePrice: 'מחיר ממוצע להזמנה',
    feeDirect: 'ResortOS · 1.5%',
    feeOta: 'Booking / Airbnb · 18%',
    feeSave: 'חיסכון חודשי',
    feeYear: 'בשנה זה',
    feeNote: 'החישוב מול עמלה טיפוסית של 18% (טווח 15%–20% בבוקינג ובאיירבנב).',
    contactKicker: 'פיילוט ראשון',
    contactTitle: 'כרגע אנחנו בפיילוט הראשון',
    contactLead:
      'עובדים עם המתחם הראשון, ובקרוב נוכל להתחיל להתרחב. רוצים להצטרף כשנפתח? פנו אלינו בוואטסאפ ונכניס אתכם לרשימת המתנה.',
    contactSubmit: 'פנו אלינו בוואטסאפ',
    contactHint: '054-807-6123',
    footerNote: 'ResortOS — מערכת ההפעלה של התפעול הפיזי במתחמי אירוח.',
    ramotLink: 'מתחמי רמות · ניווט',
    rights: 'כל הזכויות שמורות',
    waPrefill: 'שלום, אשמח להצטרף לרשימת המתנה של ResortOS.'
  },
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    title: 'ResortOS | The Operating System for physical hospitality operations',
    nav: {
      product: 'Product',
      compare: 'Vs a diary',
      guest: 'Guest stay',
      why: 'Why us',
      contact: 'Waitlist'
    },
    langSwitch: 'עב',
    langAria: 'מעבר לעברית',
    cta: 'Join the waitlist',
    ctaNav: 'Waitlist',
    ctaSecondary: 'How it works',
    heroKicker: 'For holiday complexes, cabins, and boutique suites',
    heroTitle: 'The Operating System for your hospitality property. Not another system to operate.',
    heroLead:
      'ResortOS knows what should happen across the property, acts through staff, guests, devices, and robots, and verifies that reality matches the plan. Workers do not need to learn another app — they receive work through the channel they already use.',
    statsKicker: 'The numbers that matter',
    stats: [
      { value: '1.5%', title: 'Fee', text: 'Keep the margin on direct bookings, instead of paying 15–20% in OTA commissions.' },
      { value: '10+ hrs', title: 'Weekly savings', text: 'Less message-writing, cleaner coordination, collecting payments, and explaining how to start the jacuzzi.' },
      { value: 'Same day', title: 'Bank match', text: 'The diary, Hyp, and the business account close on the same total — no file export, no waiting for next month’s accountant.' },
      { value: '0', title: 'Night calls', text: 'Total quiet: gate code, Wi‑Fi password, appliance instructions, and navigation — all open to the guest on their phone.' }
    ],
    problemKicker: 'Today',
    problemTitle: 'The property works. The information is everywhere.',
    problemLead: 'The problem is not WhatsApp itself. It is that the entire operation becomes memory spread across groups and messages: who asked for what, which room, what is open, what is closed, and what is still waiting.',
    problems: [
      { title: 'Information buried in chat', text: 'Groups, messages, and private chats turn the property state into an endless search: who said what, about which room, and what is still open.' },
      { title: 'Work stays in people’s heads', text: 'Who cleans, what to take, how many people are needed, and what is already done — all passed around informally. Nothing owns the operational loop.' },
      { title: 'Messages instead of operations', text: 'WhatsApp can deliver a message. It does not own the task, track time, detect anomalies, or verify that the physical world matches the report.' },
      { title: 'Nobody owns the live state', text: 'Even when the information exists somewhere, there is no layer that knows what should happen now, what already happened, and what requires intervention.' }
    ],
    productKicker: 'How an operating system for a property works',
    productTitle: 'ResortOS does not display the work. It operates it.',
    productLead: 'Observe → Understand → Decide → Act → Verify. The system holds the operational state, communicates with whoever is needed, and verifies the outcome.',
    features: [
      {
        icon: 'calendar',
        title: 'Occupancy Gantt',
        text: '60 days of view, a smart half-cell for same-day turnover, and a daily snapshot in one tap.'
      },
      {
        icon: 'whatsapp',
        title: 'Communication through the channel staff already use',
        text: 'ResortOS can send work and instructions through WhatsApp, ask for status, detect delays, and escalate when needed. WhatsApp is the channel — not the operational system.'
      },
      {
        icon: 'ops',
        title: 'Multimodal operational verification',
        text: 'A worker report is one signal. ResortOS can correlate it with door access, electricity, water, sensors, timing, cameras, or robot inspection and detect anomalies before marking a task complete.'
      },
      {
        icon: 'money',
        title: 'Live operational state',
        text: 'Every unit has live state: guest, cleaning, inspection, maintenance, equipment, access, tasks, and readiness. The goal is for the system to know what is happening — not for the manager to search for it.'
      },
      {
        icon: 'staff',
        title: 'People, robots, and devices',
        text: 'ResortOS operates people, IoT, and robots through one operational layer. The worker does not have to use an app; the robot does not need to understand the business; the Core decides what needs to happen.'
      },
      {
        icon: 'reviews',
        title: 'The system manages; the manager sees exceptions',
        text: 'Instead of a dashboard that requires constant attention, ResortOS runs the management loop: assign, follow up, ask, verify, and escalate. The manager steps in when a decision is required.'
      }
    ],
    guestKicker: 'Guest experience',
    guestTitle: 'One link. Zero app downloads.',
    guestLead: 'The same link stays with the guest until the stay ends — no app they will not install.',
    journeyGuest: 'The guest gets',
    journeyOwner: 'The owner gains',
    screens: {
      preKicker: 'Before arrival',
      hello: 'Hi demo guest',
      waiting: 'Waiting for you at Batei Nurit 1',
      dates: '25/08/2026 to 27/08/2026',
      checkin: 'Check-in from 15:00',
      countdown: '2 days left until check-in',
      area: 'Area guide · Ramot · Sea of Galilee & Golan',
      waze: 'Waze',
      maps: 'Google Maps',
      call: 'Call',
      message: 'Message',
      stayKicker: 'In stay',
      cabin: 'Cabin Batei Nurit 1',
      pinLabel: 'Key-safe code',
      pinUntil: 'Valid until checkout',
      copy: 'Copy',
      gate: 'Gate code',
      wifi: 'Wi‑Fi',
      jacuzzi: 'Start the jacuzzi',
      jacuzziSteps: [
        'Close the plug or cover.',
        'Fill water above the jets.',
        'Start the motors, then the jets.'
      ],
      thanks: 'Thanks for staying with us',
      thanksBody: 'Checkout is done. A short review would help us a lot.',
      rate: 'How was the stay?',
      rateHint: 'Pick a star rating — it really helps'
    },
    journey: [
      {
        screen: 'pre',
        phase: 'Before arrival',
        guest: 'A countdown, Waze navigation, and an area guide with exclusive guest pricing.',
        owner: 'Zero “how do we get there?” calls, plus early sales of nearby activities.'
      },
      {
        screen: 'stay',
        phase: 'During the stay',
        guest: 'A door code armed at check-in time, gate access, Wi-Fi, jacuzzi instructions, and an in-unit treat shop.',
        owner: 'Quiet from service messages, and extra revenue from in-room add-ons.'
      },
      {
        screen: 'post',
        phase: 'After departure',
        guest: 'One-tap self check-out, a closed folio, and a direct review link.',
        owner: 'Housekeeping syncs immediately, and positive reviews grow on their own.'
      }
    ],
    whyKicker: 'Why ResortOS',
    whyTitle: 'Built to operate physical hospitality properties',
    reasons: [
      {
        title: 'Everything happens in one WhatsApp thread',
        text: 'The booking link, payment confirmation, digital key, property guide, and review request all live in the guest’s familiar message thread. No emails lost in spam, no clunky forms, and no extra service calls in the evening.'
      },
      {
        title: 'A personal stay portal — zero downloads',
        text: 'The guest gets a direct, secure link that opens instantly in the mobile browser. Gate access, Wi‑Fi password, facility instructions, and a treat shop are available around the clock — without forcing an app download or a username and password.'
      },
      {
        title: 'Controlled turnover with photo verification',
        text: 'The cleaning task opens automatically at checkout against a predefined SOP checklist. The next guest’s entry code is released only after staff complete the items, photograph the room, and confirm the unit meets your hospitality standard.'
      },
      {
        title: 'Local Edge. Cloud-connected.',
        text: 'No cash envelopes and no monthly export to the accountant. The diary, the acquirer, and the bank close on the same total, and wages go out in Masav after two approvers — not dozens of manual bank transfers.'
      }
    ],
    compareKicker: 'Notebook, diary, or a system that runs the property',
    compareTitle: 'Manual work creates calls. A computerized diary creates typing. ResortOS runs the property.',
    compareLead:
      'No system — WhatsApp and a notebook. With EzGo, Optima, MiniHotel, or Simple Booking — a booking site and a calendar, and a clerk who still charges, hands over a key, and calls the cleaner. Here payment arms a code, the A/C, a checklist, Masav, and a bank match.',
    comparePillars: [
      { title: 'Manual', tag: 'WhatsApp · notebook · Excel', text: 'Waits for you to remember and type. Creates more night calls.' },
      { title: 'Diary and booking site', tag: 'EzGo · Optima · MiniHotel · Simple Booking', text: 'Stores occupancy and sells from the site. Creates more office work.' },
      { title: 'ResortOS', tag: 'An operating system for the property', text: 'Runs people, doors, and money. Less typing, zero leaks.', featured: true }
    ],
    compareLoop: ['Guest pays', 'Lock code arms', 'A/C an hour before arrival', 'Cleaner gets a checklist', 'Masav with two approvers', 'Diary, Hyp, and bank on the same total'],
    compareCols: ['ResortOS', 'Diary / booking site', 'Manual'],
    compareRows: [
      { topic: 'Money', us: 'Diary, Hyp, and bank close the same day.', ledger: 'Export a file. The accountant sees the bank next month.', manual: 'Bit, cash, “we’ll check at month end.”' },
      { topic: 'Wages and vendors', us: 'One Masav file. Two people approve before send.', ledger: 'Cheque books and dozens of manual bank transfers.', manual: 'Cash in an envelope, or one-by-one bank typing.' },
      { topic: 'Door and grounds', us: 'A code timed to check-in. A/C and gate from the system.', ledger: 'An expensive lock add-on — or no field connection at all.', manual: 'A key in hand, a gate code everyone remembers.' },
      { topic: 'The team', us: 'Two-way WhatsApp: task, photo, checklist.', ledger: 'Fire-and-forget SMS, or a phone call.', manual: 'Personal WhatsApp, calls, “who cleaned unit 4?”' },
      { topic: 'Guest when the line drops', us: 'Stay portal: code, Wi-Fi, jacuzzi. Work continues offline.', ledger: 'A payment link in the browser. A fiber cut kills the cloud diary.', manual: 'Your private phone is the front desk.' }
    ],
    feeTitle: 'What you save vs Booking',
    feeLead: 'Enter direct bookings and an average room price. On ResortOS the fee is 1.5% — system and processing together — versus 15–20% on the platforms.',
    feeBookings: 'Bookings per month',
    feePrice: 'Average booking value',
    feeDirect: 'ResortOS · 1.5%',
    feeOta: 'Booking / Airbnb · 18%',
    feeSave: 'Monthly savings',
    feeYear: 'Per year that is',
    feeNote: 'Calculated against a typical 18% OTA fee (the usual 15–20% range on Booking and Airbnb).',
    contactKicker: 'First pilot',
    contactTitle: 'We’re in our first pilot',
    contactLead:
      'We’re working with the first property, and we’ll start expanding soon. Want in when we open? Message us on WhatsApp and we’ll add you to the waitlist.',
    contactSubmit: 'Message us on WhatsApp',
    contactHint: '054-807-6123',
    footerNote: 'ResortOS — occupancy, operations, and stay for holiday complexes.',
    ramotLink: 'Ramot complexes · navigate',
    rights: 'All rights reserved',
    waPrefill: 'Hi, I would like to join the ResortOS waitlist.'
  }
};

const FEATURE_ICONS = {
  calendar: CalendarDays,
  whatsapp: MessageCircle,
  ops: Wrench,
  money: CreditCard,
  staff: Users,
  reviews: Star
};

function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rosMark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="#12141C" />
      <rect x="1" y="1" width="46" height="46" rx="13" fill="none" stroke="url(#rosMark)" strokeWidth="1.5" />
      <path d="M10 28 L24 14 L38 28" fill="none" stroke="url(#rosMark)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M15 27.5 V34.5 H33 V27.5" fill="none" stroke="#E7E2D4" strokeWidth="2" />
      <rect x="21.2" y="29.2" width="5.6" height="5.3" rx="0.8" fill="#FBBF24" />
    </svg>
  );
}

function HeroScene({ t }) {
  return (
    <div className="hero-scene">
      <img
        className="hero-photo"
        src="/hero-resort.jpg"
        alt={t.dir === 'rtl' ? 'מתחם צימרים בוטיק מול הכנרת בשעת בין־ערביים' : 'Boutique cabins overlooking the Sea of Galilee at dusk'}
      />
    </div>
  );
}

function formatMoney(amount, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0
  }).format(Math.round(amount));
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function FeeCalculator({ t, locale }) {
  const [bookings, setBookings] = useState(40);
  const [price, setPrice] = useState(1800);
  const volume = bookings * price;
  const resortFee = volume * RESORT_RATE;
  const otaFee = volume * OTA_RATE;
  const saved = Math.max(0, otaFee - resortFee);
  const resortWidth = `${Math.max(7, (RESORT_RATE / OTA_RATE) * 100)}%`;

  return (
    <div className="fee-card">
      <div>
        <ClipboardCheck size={22} />
        <h3>{t.feeTitle}</h3>
        <p>{t.feeLead}</p>
        <div className="fee-fields">
          <label>
            {t.feeBookings}
            <input
              type="range"
              min="0"
              max="200"
              value={Math.min(200, bookings)}
              onChange={(e) => setBookings(Number(e.target.value))}
            />
            <input
              type="number"
              min="1"
              max="500"
              inputMode="numeric"
              dir="ltr"
              value={bookings}
              onChange={(e) => setBookings(clampNumber(e.target.value, 0, 500))}
            />
          </label>
          <label>
            {t.feePrice}
            <input
              type="range"
              min="400"
              max="8000"
              step="50"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
            <input
              type="number"
              min="0"
              max="50000"
              step="50"
              inputMode="numeric"
              dir="ltr"
              value={price}
              onChange={(e) => setPrice(clampNumber(e.target.value, 0, 50000))}
            />
          </label>
        </div>
      </div>
      <div className="fee-result">
        <div className="fee-save">
          <span>{t.feeSave}</span>
          <b>{formatMoney(saved, locale)}</b>
          <small>{t.feeYear} {formatMoney(saved * 12, locale)}</small>
        </div>
        <div className="fee-bars">
          <div className="fee-row">
            <span>{t.feeDirect}</span>
            <strong>{formatMoney(resortFee, locale)}</strong>
            <i style={{ width: resortWidth }} />
          </div>
          <div className="fee-row ota">
            <span>{t.feeOta}</span>
            <strong>{formatMoney(otaFee, locale)}</strong>
            <i />
          </div>
          <p className="fee-note">{t.feeNote}</p>
        </div>
      </div>
    </div>
  );
}

function GuestAppScreen({ screen, t }) {
  const s = t.screens;
  let body = null;

  if (screen === 'pre') {
    body = (
      <>
        <div className="ga-kicker">{s.preKicker}</div>
        <div className="ga-hello">{s.hello}</div>
        <h4>{s.waiting}</h4>
        <div className="ga-card">
          <div className="ga-line"><CalendarDays size={14} /> {s.dates}</div>
          <div className="ga-line muted"><Clock size={14} /> {s.checkin}</div>
          <div className="ga-count">{s.countdown}</div>
          <div className="ga-line muted"><MapPin size={14} /> {s.area}</div>
          <div className="ga-actions">
            <span className="ga-btn maps"><Map size={13} /> {s.maps}</span>
            <span className="ga-btn waze"><Navigation size={13} /> {s.waze}</span>
            <span className="ga-btn msg"><MessageCircle size={13} /> {s.message}</span>
            <span className="ga-btn call"><Phone size={13} /> {s.call}</span>
          </div>
        </div>
      </>
    );
  } else if (screen === 'stay') {
    body = (
      <>
        <div className="ga-kicker gold">{s.stayKicker}</div>
        <h4>{s.hello}</h4>
        <div className="ga-hello">{s.cabin}</div>
        <div className="ga-pin">
          <span>{s.pinLabel}</span>
          <b>2 3 1 0</b>
          <div className="ga-pin-row">
            <small>{s.pinUntil}</small>
            <em><Copy size={11} /> {s.copy}</em>
          </div>
        </div>
        <div className="ga-split">
          <div className="ga-card">
            <div className="ga-line muted"><Wifi size={13} /> {s.wifi}</div>
            <strong>MIALEES RESORT</strong>
            <code>MIAL2026</code>
          </div>
          <div className="ga-card">
            <div className="ga-line muted"><KeyRound size={13} /> {s.gate}</div>
            <strong dir="ltr">#2464</strong>
          </div>
        </div>
        <div className="ga-card">
          <div className="ga-line"><Bath size={13} /> {s.jacuzzi}</div>
          <ol>
            {s.jacuzziSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
      </>
    );
  } else {
    body = (
      <div className="ga-thanks">
        <h4>{s.thanks}</h4>
        <p>{s.thanksBody}</p>
        <strong>{s.rate}</strong>
        <small>{s.rateHint}</small>
        <div className="ga-stars">
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={22} color="#F59E0B" />)}
        </div>
      </div>
    );
  }

  return (
    <figure className="phone-shot">
      <div className="phone-shot-bar" aria-hidden="true">
        <span>9:41</span>
        <i />
        <span>LTE</span>
      </div>
      <div className={`guest-app guest-app-${screen}`}>{body}</div>
    </figure>
  );
}

export default function LandingPage() {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'he';
    } catch {
      return 'he';
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const t = COPY[lang];
  const isRTL = t.dir === 'rtl';
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.documentElement.dir = t.dir;
    document.title = t.title;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang, t.dir, t.htmlLang, t.title]);

  const waHref = useMemo(
    () => `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(t.waPrefill)}`,
    [t]
  );

  const toggleLang = () => setLang((prev) => (prev === 'he' ? 'en' : 'he'));

  const go = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="lp" dir={t.dir}>
      <div className="lp-glow" />
      <header className="lp-nav">
        <a className="lp-brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Logo />
          <span>ResortOS</span>
        </a>
        <nav className={`lp-links ${menuOpen ? 'open' : ''}`}>
          <button type="button" onClick={() => go('product')}>{t.nav.product}</button>
          <button type="button" onClick={() => go('compare')}>{t.nav.compare}</button>
          <button type="button" onClick={() => go('guest')}>{t.nav.guest}</button>
          <button type="button" onClick={() => go('why')}>{t.nav.why}</button>
          <button type="button" onClick={() => go('contact')}>{t.nav.contact}</button>
        </nav>
        <div className="lp-nav-actions">
          <button type="button" className="lang-btn" onClick={toggleLang} aria-label={t.langAria}>
            <Globe size={15} />
            {t.langSwitch}
          </button>
          <a className="btn btn-primary nav-cta" href={waHref} target="_blank" rel="noopener noreferrer">
            {t.ctaNav}
          </a>
          <button type="button" className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="kicker">{t.heroKicker}</p>
            <h1>{t.heroTitle}</h1>
            <p className="lead">{t.heroLead}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={waHref} target="_blank" rel="noopener noreferrer">
                {t.cta} <Arrow size={16} />
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => go('product')}>
                {t.ctaSecondary}
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <HeroScene t={t} />
          </div>
        </section>

        <p className="stats-kicker">{t.statsKicker}</p>
        <section className="stats">
          {t.stats.map((stat) => (
            <div key={stat.title}>
              <b>{stat.value}</b>
              <strong>{stat.title}</strong>
              <span>{stat.text}</span>
            </div>
          ))}
        </section>

        <section className="band band-pain">
          <div className="band-inner">
            <p className="kicker">{t.problemKicker}</p>
            <h2>{t.problemTitle}</h2>
            <p className="lead">{t.problemLead}</p>
            <ol className="pain-list">
              {t.problems.map((item, index) => (
                <li key={item.title}>
                  <span className="pain-num">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band band-compare" id="compare">
          <div className="band-inner">
            <p className="kicker">{t.compareKicker}</p>
            <h2>{t.compareTitle}</h2>
            <p className="lead">{t.compareLead}</p>
            <div className="compare-pillars">
              {t.comparePillars.map((pillar) => (
                <article key={pillar.title} className={pillar.featured ? 'featured' : undefined}>
                  <h3>{pillar.title}</h3>
                  <span>{pillar.tag}</span>
                  <p>{pillar.text}</p>
                </article>
              ))}
            </div>
            <ol className="compare-loop">
              {t.compareLoop.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th />
                    {t.compareCols.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.compareRows.map((row) => (
                    <tr key={row.topic}>
                      <th scope="row">{row.topic}</th>
                      <td>{row.us}</td>
                      <td>{row.ledger}</td>
                      <td>{row.manual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="band band-flow" id="product">
          <div className="band-inner">
            <p className="kicker">{t.productKicker}</p>
            <h2>{t.productTitle}</h2>
            <p className="lead">{t.productLead}</p>
            <div className="flow-grid">
              {t.features.map((feature, index) => {
                const Icon = FEATURE_ICONS[feature.icon];
                return (
                  <article key={feature.title}>
                    <div className="flow-head">
                      <div className="icon-wrap"><Icon size={18} /></div>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="guest" id="guest">
          <div className="guest-copy">
            <p className="kicker">{t.guestKicker}</p>
            <h2>{t.guestTitle}</h2>
            <p className="lead">{t.guestLead}</p>
          </div>
          <div className="guest-stages">
            {t.journey.map((step, index) => (
              <article className={`guest-stage${index % 2 ? ' flip' : ''}`} key={step.screen}>
                <div className="guest-stage-copy">
                  <span className="guest-stage-num">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{step.phase}</h3>
                  <p>
                    <b>{t.journeyGuest}</b>
                    {step.guest}
                  </p>
                  <p>
                    <b>{t.journeyOwner}</b>
                    {step.owner}
                  </p>
                </div>
                <GuestAppScreen screen={step.screen} t={t} />
              </article>
            ))}
          </div>
        </section>

        <section className="why" id="why">
          <p className="kicker">{t.whyKicker}</p>
          <h2>{t.whyTitle}</h2>
          <div className="why-grid">
            {t.reasons.map((reason) => (
              <article key={reason.title}>
                <h3>{reason.title}</h3>
                <p>{reason.text}</p>
              </article>
            ))}
          </div>
          <FeeCalculator t={t} locale={lang === 'en' ? 'en-IL' : 'he-IL'} />
        </section>

        <section className="contact" id="contact">
          <div>
            <p className="kicker">{t.contactKicker}</p>
            <h2>{t.contactTitle}</h2>
            <p className="lead">{t.contactLead}</p>
          </div>
          <div className="contact-card">
            <a className="btn btn-primary" href={waHref} target="_blank" rel="noopener noreferrer">
              {t.contactSubmit} <Arrow size={16} />
            </a>
            <p className="form-hint" dir="ltr">{t.contactHint}</p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-brand">
          <Logo size={28} />
          <span>ResortOS</span>
        </div>
        <p>{t.footerNote}</p>
        <p><a href="/ramot">{t.ramotLink}</a></p>
        <small>© {new Date().getFullYear()} ResortOS. {t.rights}.</small>
      </footer>
    </div>
  );
}
