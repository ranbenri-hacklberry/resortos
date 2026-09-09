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
    title: 'ResortOS | מפסיקים לנהל את המתחם בבלאגן של וואטסאפ',
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
    heroTitle: 'מפסיקים לנהל את המתחם בבלאגן של וואטסאפ. מתחילים להרוויח שקט.',
    heroLead:
      'לוח תפוסה, ניקיון עם אימות בתמונות, גבייה בוואטסאפ ופורטל אורח — קוד לדלת לפי שעת כניסה, התאמת סליקה לבנק, ומס״ב לשכר. בלי פקיד ובלי מחברת באמצע.',
    statsKicker: 'מספרי מפתח',
    stats: [
      { value: '1.5%', title: 'עמלה', text: 'שומרים על הרווח מהזמנות ישירות, במקום לשלם 15%–20% לעמלות תיווך.' },
      { value: '10+ שעות', title: 'חיסכון שבועי', text: 'פחות כתיבת הודעות, תיאום מנקים, גביית תשלומים והסברים על איך מפעילים את הג׳קוזי.' },
      { value: 'אותו יום', title: 'התאמת בנק', text: 'היומן, Hyp והחשבון העסקי נסגרים לאותו סכום — בלי ייצוא לקובץ ובלי לחכות לרו״ח בחודש הבא.' },
      { value: '0', title: 'שיחות בלילה', text: 'שקט מוחלט: קוד לשער, סיסמת Wi‑Fi, הפעלת מכשירים וניווט — הכל פתוח לאורח בנייד שלו.' }
    ],
    problemKicker: 'המצב היום',
    problemTitle: 'המתחם עובד. הניהול מאחורי הקלעים — קורס.',
    problemLead: 'ארבעה דברים שחוזרים בכל מתחם שעדיין רץ על וואטסאפ, מחברות, וטלפון פרטי.',
    problems: [
      { title: 'לוח תפוסה עיוור', text: 'ניהול במחברות ובהודעות גורם לפספוס לילות ריקים ולכפל הזמנות.' },
      { title: 'משק בית מהזיכרון', text: 'תחלופות מתנהלות בראש. המנקים מנחשים סדרי עדיפויות, ואף אחד לא בודק את החדר לפני שהאורח הבא עומד בדלת.' },
      { title: 'מענה טלפוני 24/7', text: 'מה הווי־פיי? איך פותחים את השער? איך מפעילים את הג׳קוזי? כל שאלה בסיסית מגיעה לטלפון הפרטי שלכם.' },
      { title: 'העמלות חותכות את הרווח', text: '15%–20% הולכים לפלטפורמות, בזמן שאורחים חוזרים נסגרים בהתכתבות ידנית ומסורבלת.' }
    ],
    productKicker: 'איך המערכת עובדת',
    productTitle: 'מההזמנה הראשונה ועד 5 כוכבים בגוגל',
    productLead: 'שישה שלבים שמחליפים את הבלאגן — בלי לקפוץ בין וואטסאפ למחברת.',
    features: [
      {
        icon: 'calendar',
        title: 'לוח תפוסה גאנט',
        text: 'תצוגה של 60 יום, חלוקת תא חכמה לתחלופה באותו יום, ותמונת מצב יומית בלחיצה אחת.'
      },
      {
        icon: 'whatsapp',
        title: 'סליקה ישירה בוואטסאפ',
        text: 'שליחת לינק למקדמה או לתשלום מלא תוך שניות. החדר ננעל ל־15 דקות עד לאישור, ואז הקוד נדרך במנעול לפי שעת הצ׳ק־אין.'
      },
      {
        icon: 'ops',
        title: 'משק בית עם אימות תמונה',
        text: 'משימת תחלופה נפתחת אוטומטית בצ׳ק־אאוט. הצוות מעלה צילום אישור; דירוג ביקורת נמוך מחזיר את המשימה לטיפול.'
      },
      {
        icon: 'money',
        title: 'הצלבה ליומן, Hyp והבנק',
        text: 'הכנסה ברוטו, עמלת 1.5%, וזיכוי נטו לפי יחידה — מול הסליקה והחשבון בבנק באותו יום, לא בייצוא לרו״ח בחודש הבא.'
      },
      {
        icon: 'staff',
        title: 'צוות, שפות ומס״ב',
        text: 'גישה לכל עובד בעברית, ערבית, אנגלית או תאילנדית, נוכחות GPS, וקובץ מס״ב לשכר ולספקים עם אישור שני מנהלים לפני שליחה.'
      },
      {
        icon: 'reviews',
        title: 'מנוע ביקורות אוטומטי',
        text: 'הודעת צ׳ק־אאוט חכמה שמעבירה אורחים מרוצים ישירות לדירוג 5 כוכבים בגוגל מפות.'
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
    whyTitle: 'נבנה למתחמי אירוח ישראליים (5–50 יחידות), לא לרשתות של 400 חדרים',
    reasons: [
      {
        title: 'הכל קורה בשיחת וואטסאפ אחת',
        text: 'קישור ההזמנה, אישור הסליקה, המפתח הדיגיטלי, מדריך המתחם ובקשת הדירוג מרוכזים כולם בשרשור ההודעות המוכר של האורח. בלי מיילים שנעלמים בתיבת הספאם, בלי טפסים מסורבלים ובלי שיחות שירות מיותרות בערב.'
      },
      {
        title: 'פורטל שהייה אישי — אפס הורדות',
        text: 'האורח מקבל קישור ישיר ומאובטח שרץ מיידית בדפדפן הנייד. פתיחת שער, סיסמת ה־Wi‑Fi, הוראות הפעלה למתקנים וחנות פינוקים זמינים לו מסביב לשעון, בלי להכריח אותו להוריד אפליקציה או לייצר שם משתמש וסיסמה.'
      },
      {
        title: 'תחלופה מבוקרת ואימות בתמונות',
        text: 'משימת הניקיון נפתחת אוטומטית בצ׳ק־אאוט לפי צ׳קליסט משימות (SOP) מוגדר מראש. קוד הכניסה לאורח הבא נפתח רק לאחר שאיש הצוות ביצע את הסעיפים, צילם את החדר והבטיח שהיחידה עומדת בסטנדרט האירוח שלכם.'
      },
      {
        title: 'הכסף נסגר לבד',
        text: 'בלי מעטפות מזומן ובלי ייצוא חודשי לרו״ח. היומן, הסליקה והבנק נסגרים לאותו סכום, והשכר יוצא במס״ב אחרי שני מאשרים — לא 87 העברות ידניות בבנק.'
      }
    ],
    compareKicker: 'מחברת, יומן, או מערכת שמפעילה',
    compareTitle: 'ניהול ידני מייצר שיחות. יומן ממוחשב מייצר הקלדה. ResortOS מפעיל את המתחם.',
    compareLead:
      'בלי מערכת — וואטסאפ ומחברת. עם EzGo, אופטימה, MiniHotel או Simple Booking — אתר הזמנות ויומן, ופקיד שעדיין מסלק, מוסר מפתח ומתקשר למנקה. כאן התשלום מדליק קוד, מזגן, צ׳קליסט, מס״ב, והתאמה לבנק.',
    comparePillars: [
      { title: 'ניהול ידני', tag: 'וואטסאפ · מחברת · אקסל', text: 'מחכה שתזכור ותקליד. מייצר עוד שיחות בלילה.' },
      { title: 'יומן ואתר הזמנות', tag: 'EzGo · אופטימה · MiniHotel · Simple Booking', text: 'שומר תפוסה ומוכר מהאתר. מייצר עוד עבודה משרדית.' },
      { title: 'ResortOS', tag: 'מערכת הפעלה למתחם', text: 'מפעיל אנשים, דלתות וכסף. פחות הקלדה, אפס דליפות.', featured: true }
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
    footerNote: 'ResortOS — תפוסה, תפעול ושהייה למתחמי נופש.',
    ramotLink: 'מתחמי רמות · ניווט',
    rights: 'כל הזכויות שמורות',
    waPrefill: 'שלום, אשמח להצטרף לרשימת המתנה של ResortOS.'
  },
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    title: 'ResortOS | Stop running the property from a WhatsApp mess',
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
    heroTitle: 'Stop running the property from a WhatsApp mess. Start earning quiet.',
    heroLead:
      'Occupancy board, photo-verified housekeeping, WhatsApp collection, and a guest portal — door codes timed to check-in, card charges matched to the bank, and Masav payroll. No clerk and no notebook in the middle.',
    statsKicker: 'The numbers that matter',
    stats: [
      { value: '1.5%', title: 'Fee', text: 'Keep the margin on direct bookings, instead of paying 15–20% in OTA commissions.' },
      { value: '10+ hrs', title: 'Weekly savings', text: 'Less message-writing, cleaner coordination, collecting payments, and explaining how to start the jacuzzi.' },
      { value: 'Same day', title: 'Bank match', text: 'The diary, Hyp, and the business account close on the same total — no file export, no waiting for next month’s accountant.' },
      { value: '0', title: 'Night calls', text: 'Total quiet: gate code, Wi‑Fi password, appliance instructions, and navigation — all open to the guest on their phone.' }
    ],
    problemKicker: 'Today',
    problemTitle: 'The property works. The back-office is collapsing.',
    problemLead: 'Four things that show up in every complex still run on WhatsApp, notebooks, and a private phone.',
    problems: [
      { title: 'Blind occupancy', text: 'Notebooks and chat threads miss empty nights and create double bookings.' },
      { title: 'Housekeeping from memory', text: 'Turnovers live in someone’s head. Cleaners guess priorities, and nobody checks the room before the next guest is at the door.' },
      { title: 'On-call 24/7', text: 'What’s the Wi-Fi? How do I open the gate? How do I start the jacuzzi? Every basic question hits your private phone.' },
      { title: 'Fees cut the profit', text: '15–20% goes to booking platforms, while returning guests still close in a slow manual chat.' }
    ],
    productKicker: 'How the system works',
    productTitle: 'From the first booking to 5 stars on Google',
    productLead: 'Six steps that replace the mess — without jumping between WhatsApp and a notebook.',
    features: [
      {
        icon: 'calendar',
        title: 'Occupancy Gantt',
        text: '60 days of view, a smart half-cell for same-day turnover, and a daily snapshot in one tap.'
      },
      {
        icon: 'whatsapp',
        title: 'WhatsApp collection',
        text: 'Send a deposit or full-payment link in seconds. The room locks for 15 minutes until the charge is confirmed, then the lock code arms for check-in time.'
      },
      {
        icon: 'ops',
        title: 'Photo-verified housekeeping',
        text: 'A turnover task opens automatically at checkout. Staff upload a proof photo; a low inspection score sends the job back.'
      },
      {
        icon: 'money',
        title: 'Diary, Hyp, and bank in one match',
        text: 'Gross income, the 1.5% fee, and net credit by unit — against the acquirer and the bank account the same day, not an export to the accountant next month.'
      },
      {
        icon: 'staff',
        title: 'Staff, languages, and Masav',
        text: 'A login per employee in Hebrew, Arabic, English, or Thai, GPS attendance, and one Masav file for wages and suppliers with two-manager approval before send.'
      },
      {
        icon: 'reviews',
        title: 'Automatic review engine',
        text: 'A smart checkout message that sends happy guests straight to a 5-star Google Maps review.'
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
    whyTitle: 'Built for Israeli hospitality complexes (5–50 units), not 400-room chains',
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
        title: 'The money closes itself',
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
