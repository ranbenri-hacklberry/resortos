/**
 * CabinOS Complete Content Seed Dataset (Real Production Data)
 * Synchronized directly with Mac Studio (rani@100.127.14.15) & multiPropertyCatalog.js
 * 
 * Includes:
 * 1. COMIC_GUIDES: 5 illustrated operational & guest experience SOPs
 * 2. SEEDED_PROPERTIES: 12 REAL luxury properties & 46 canonical units from Ran's ResortOS / CabinOS database
 * 3. B2B_SUPPLIER_DEALS: 4 vetted hospitality B2B vendor deals for cabin hosts
 */

export interface ComicGuideStep {
  stepNumber: number;
  title: string;
  instructions: string;
  proTip: string;
  illustrationPrompt: string;
}

export interface ComicGuide {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  steps: ComicGuideStep[];
}

export interface CabinUnit {
  id: string;
  propertyId: string;
  name: string;
  englishName?: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  maxOccupancy: number;
  basePrice: number;
  weekendPrice: number;
  sizeM2: number;
  description: string;
  features: string[];
  images: string[];
}

export interface CabinProperty {
  id: string;
  slug: string;
  name: string;
  hebrewName: string;
  tagline: string;
  subTitle: string;
  description: string;
  village: string;
  region: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  wazeUrl: string;
  mapsUrl: string;
  heroImage: string;
  amenities: string[];
  theme?: Record<string, string>;
  unitsCount: number;
  units: CabinUnit[];
}

export interface B2BSupplierDeal {
  id: string;
  title: string;
  category: string;
  supplierName: string;
  discountPercentage: number;
  couponCode: string;
  description: string;
  minOrderCents: number;
  validUntil: string;
  benefits: string[];
}

/* ==========================================================================
   1. COMIC_GUIDES (5 Illustrated Operational & Guest Experience SOPs)
   ========================================================================== */

export const COMIC_GUIDES: ComicGuide[] = [
  {
    "id": "guide_jacuzzi_turnover",
    "slug": "hot-tub-jacuzzi-turnover-sop",
    "title": "מדריך תפעול, חיטוי ואיזון ג׳קוזי וספא בין אורחים",
    "category": "בריכות וספא",
    "summary": "פרוטוקול תפעולי מקצועי בן 4 שלבים לריקון, חיטוי כימי מהיר, מילוי מחדש וכוונון טמפרטורה מושלמת של הג׳קוזי לחוויית צ׳ק-אין ללא רבב.",
    "steps": [
      {
        "stepNumber": 1,
        "title": "ריקון, שטיפת פילטרים וחיטוי דפנות",
        "instructions": "רוקנו את מי הג׳קוזי לחלוטין באמצעות משאבת טבילה מהירה או ניקוז תחתון. שטפו את מסנן הפילטר בלחץ מים עדין ונקו את קו המים והדפנות באמצעות חומר חיטוי ייעודי שאינו מקציף.",
        "proTip": "החזיקו תמיד פילטר חלופי נקי ויבש במחסן המשק, כך שתוכלו לבצע החלפה מיידית בזמן שהפילטר שהוצא עובר השריה בחומר ניקוי.",
        "illustrationPrompt": "Flat vector comic illustration, clean lines, cozy hospitality style: A cheerful resort maintenance staff wearing neat apron cleaning a luxury outdoor wooden hot tub deck with sparkling water reflections, scenic Golan mountains in background, warm afternoon sun, high contrast, minimalist comic art, no text, no letters."
      },
      {
        "stepNumber": 2,
        "title": "מילוי מים חדשים ובדיקת מדדי pH וכלור",
        "instructions": "מלאו את הג׳קוזי במי ברז טריים עד ל-5 ס״מ מעל גובה הג׳טים העליונים. לאחר המילוי, בצעו בדיקת רצועת טסטר או מד דיגיטלי לוודא רמת pH בין 7.2 ל-7.6 וריכוז כלור/ברום מאוזן (3-5 ppm).",
        "proTip": "איזון pH נכון לפני הוספת חומר החיטוי מכפיל את יעילות החיטוי ומונע צריבות עיניים או ריח כימי חריף לאורחים.",
        "illustrationPrompt": "Flat vector comic illustration, modern vector art: Close-up of friendly hands holding a clean water testing kit with color indicators beside clear turquoise hot tub water, vibrant sunny garden ambient, modern minimal comic book aesthetic, no text."
      },
      {
        "stepNumber": 3,
        "title": "חימום מוקדם לטמפרטורת יעד 38°C וכיסוי מבודד",
        "instructions": "הפעילו את גוף החימום לטמפרטורה מדויקת של 38.0°C (או 39°C בחודשי החורף). סגרו את הכיסוי התרמי המבודד ונעלו את רצועות הביטחון למניעת אובדן חום מהיר.",
        "proTip": "הפעילו את החימום לפחות 3 שעות לפני שעת הצ׳ק-אין של האורח, כדי להבטיח שהמים יגיעו לרמת חום מושלמת ברגע פתיחת הדלת.",
        "illustrationPrompt": "Flat vector comic art: A sleek thermal cover closing smoothly over a steaming wooden jacuzzi on a private wooden deck, digital thermostat showing warm glow, serene sunset lighting over lake horizon, cute comic aesthetic, no text."
      },
      {
        "stepNumber": 4,
        "title": "העמדת ערכת ספא פרימיום, חלוקים ומגבות ענק",
        "instructions": "הניחו על המדף הסמוך שתי מגבות גוף עבות (700 גרם), שני חלוקי רחצה מכותנה סרוקה, נעלי ספא חד-פעמיות ומגש עץ עם כוסות זכוכית עמידות או פוליקרבונט איכותי.",
        "proTip": "לעולם אל תשימו כוסות זכוכית שבירות בקרבת הג׳קוזי — השתמשו בכוסות פוליקרבונט שקופות ואיכותיות שנראות יוקרתיות לחלוטין ואינן נשברות.",
        "illustrationPrompt": "Flat vector comic illustration: A beautifully staged wooden tray with fluffy rolled white towels, rolled waffle spa robes, and a bottle of Golan wine beside a pristine sparkling jacuzzi at dusk, warm ambient fairy lights, clean vector style, no text."
      }
    ]
  },
  {
    "id": "guide_self_checkin_automation",
    "slug": "seamless-smart-lock-checkin-workflow",
    "title": "מדריך צ׳ק-אין עצמאי דיגיטלי וכניסה חכמה ללא מפתח",
    "category": "טכנולוגיה ואוטומציה",
    "summary": "תהליך שלב-אחר-שלב ליצירת חוויית כניסה עצמאית אוטונומית (24/7): החל משליחת קישור אישי בוואטסאפ, דרך פתיחת שערים אוטומטית ועד תרחיש תאורה ומזגן מקדים.",
    "steps": [
      {
        "stepNumber": 1,
        "title": "הפקת קוד דלת דינמי ומותאם לטלפון האורח",
        "instructions": "הגדירו במערכת CabinOS קוד כניסה ייחודי למנעול החכם, המורכב מ-4 הספרות האחרונות של הנייד של האורח. הגדירו את תוקף הקוד החל משעה 15:00 ביום ההגעה ועד 11:00 ביום העזיבה.",
        "proTip": "שימוש ב-4 הספרות האחרונות של הטלפון מונע מהאורחים לשכוח את הקוד ומבטל כמעט לחלוטין שיחות טלפון של ״איבדתי את הקוד״.",
        "illustrationPrompt": "Flat vector comic illustration: A glowing modern keypad smart door lock on a stylish rustic wooden cabin door, warm welcoming entrance light, pine trees in background, clean outlines, colorful comic vector, no text."
      },
      {
        "stepNumber": 2,
        "title": "שליחת הודעת ברוכים הבאים בוואטסאפ עם קישורי ניווט ושער",
        "instructions": "שעתיים לפני ההגעה, שגרו הודעת WhatsApp אוטומטית הכוללת: קישור Waze מדויק לחניית הבקתה, כפתור חיוג ישיר לפתיחת השער הצהוב של המושב, וקוד הדלת האישי.",
        "proTip": "צרפו בהודעה סרטון קצר של 15 שניות המציג את שביל הגישה והחניה — זה משרה ביטחון עצום על אורחים שמגיעים בשעות החשיכה.",
        "illustrationPrompt": "Flat vector comic illustration: A sleek smartphone displaying a hospitable travel message screen with map icon, mountain backdrop, cozy cabin symbol, flat vector cartoon style, pleasant colors, no readable text."
      },
      {
        "stepNumber": 3,
        "title": "הפעלת תרחיש אווירה מקדים (Smart Climate & Lighting)",
        "instructions": "שעה לפני ההגעה, הפעילו מרחוק באמצעות בקר ה-RM4 את המזגן בבקתה (22°C בקיץ / 24°C בחורף), הדליקו תאורת אווירה חמה בכניסה ובסלון והפעילו מוזיקת רקע שקטה.",
        "proTip": "הרושם הראשוני של כניסה לבקתה קרירה וריחנית ביום קיץ לוהט ברמת הגולן מייצר באופן מוכח דירוגי 5 כוכבים מיידיים.",
        "illustrationPrompt": "Flat vector comic art: Warm interior of a luxury wooden cabin, soft glowing lamps, smart AC unit blowing gentle cool air with visible fresh breeze swirls, welcoming armchairs, modern flat vector, no text."
      },
      {
        "stepNumber": 4,
        "title": "אימות כניסה שקט בטלמטריה והודעת שהייה נעימה",
        "instructions": "עם פתיחת המנעול הראשונה, המערכת תתעד כניסה מוצלחת ביומן הפעילות. לאחר 45 דקות מהכניסה, תישלח הודעה נעימה: ״האם הכל לשביעות רצונכם והאם נדרש דבר נוסף?״.",
        "proTip": "בדיקה יזומה תוך שעה מהכניסה מאפשרת לפתור מיד אי-הבנות קטנות (כמו מיקום שלט הג׳קוזי) לפני שהן הופכות לתלונה.",
        "illustrationPrompt": "Flat vector comic style: Happy couple smiling as they step inside a boutique resort suite with their weekend bags, smart door handle clicking green, peaceful ambient, clean vector comic art, no text."
      }
    ]
  },
  {
    "id": "guide_coffee_bar_setup",
    "slug": "boutique-coffee-bar-and-welcome-amenities",
    "title": "מדריך הכנת פינת קפה וכיבוד פרימיום בבקתת יוקרה",
    "category": "קולינריה וחוויית אורח",
    "summary": "סטנדרט אירוח מלונאי מוקפד להכנת בר משקאות חמים, מכונת נספרסו מבריקה, סלסלת כיבוד מקומי ומקרר מצויד שמייצר אפקט WOW מיד עם הכניסה.",
    "steps": [
      {
        "stepNumber": 1,
        "title": "ניקוי, שטיפה ומילוי מיכל מים מסוננים במכונה",
        "instructions": "רוקנו ושטפו את מיכל הקפסולות המשומשות ומגש הטפטוף. מלאו את מיכל המים במים מסוננים טריים (מתמי 4 או בריטה) והריצו פולס שטיפה אחד של מים חמים ללא קפסולה.",
        "proTip": "שימוש במים מסוננים בלבד מונע הצטברות אבנית, משפר את קרמת האספרסו ושומר על אורך חיי המכונה לאורך שנים.",
        "illustrationPrompt": "Flat vector comic illustration: Shiny modern espresso machine with a small cup catching steaming golden espresso, crystal water dispenser nearby, sleek kitchen countertop, flat vector comic style, no text."
      },
      {
        "stepNumber": 2,
        "title": "סידור מעמד קפסולות מדורג ותיונים מובחרים",
        "instructions": "סדרו לפחות 8 קפסולות אספרסו במגוון חוזקים (כולל אופציה נטולת קפאין), לצד מעמד עץ עם מבחר תיוני צמחים איכותיים (לואיזה, נענע, קמומיל, ארל גריי) ומקלות קינמון.",
        "proTip": "סמנו באופן ברור את חוזק הקפסולות והקפידו לכלול קפסולות המתאימות לקפוצ׳ינו גדול לצד אספרסו קצר ומריר.",
        "illustrationPrompt": "Flat vector comic illustration: Elegant wooden carousel displaying colorful coffee capsules, glass jars with loose herbal tea leaves and cinnamon sticks, organized and neat, warm comic illustration, no text."
      },
      {
        "stepNumber": 3,
        "title": "מקרר מאובזר: חלב טרי, חלב צמחי ומים מינרליים קרים",
        "instructions": "ודאו שבמקרר נמצאים קרטון חלב טרי מלא, קרטון משקה שיבולת שועל/סויה סגור, בקבוק זכוכית של מים צוננים עם פלחי לימון ונענע טרייה, ושני בקבוקי סודה.",
        "proTip": "החזקת חלב שיבולת שועל באופן קבוע היא מחווה קטנה שעושה הבדל עצום עבור אורחים טבעונים או רגישים ללקטוז.",
        "illustrationPrompt": "Flat vector comic illustration: Open mini-fridge inside a stylish cabin showing fresh milk bottles, oat milk, sparkling water, and fresh mint glass pitcher on clean glass shelves, vibrant pastel vector style, no text."
      },
      {
        "stepNumber": 4,
        "title": "הנחת יין גולני, עוגיות בוטיק ומכתב אישי",
        "instructions": "הניחו על שולחן הסלון או האי במטבח בקבוק יין אדום/לבן מיקב בוטיק ברמת הגולן, צנצנת זכוכית עם עוגיות חמאה טריות ומכתב ברכה אישי מודפס עם שמות האורחים.",
        "proTip": "יין מקומי עם סיפור קצר על הכרם הסמוך מחבר את האורח לחוויה האזורית והופך את קבלת הפנים ליוקרתית ובלתי נשכחת.",
        "illustrationPrompt": "Flat vector comic art: A bottle of boutique red wine with two glasses and a glass dome containing gourmet cookies on a wooden table, handwritten welcome card standing, cozy aesthetic, clean vector, no text."
      }
    ]
  },
  {
    "id": "guide_5star_bed_making",
    "slug": "5star-luxury-bed-making-and-linen-protocol",
    "title": "מדריך מהיר להחלפת מצעים וסטיילינג מיטת קינג-סייז מלונאית",
    "category": "תפעול ומשק",
    "summary": "פרוטוקול משק מובנה ליצירת מיטת ענן מושלמת: מתיחת סדין צמוד בפינות מעטפה (Hospital Corners), סידור כריות שינה ונוי מדורג, ופריסת ראנר ושמיכת פיקה יוקרתית.",
    "steps": [
      {
        "stepNumber": 1,
        "title": "חיטוי מגן מזרן ומתיחת סדין כותנה מצרית 500 חוטים",
        "instructions": "בדקו את שלמות וניקיון מגן המזרן האטום. מתחו סדין כותנה מצרית צחור וצמוד, והדקו את הפינות במתכונת ״פינות בית חולים״ (Hospital Corners) למתיחה חלקה ללא קמטים.",
        "proTip": "השתמשו במגהץ קיטור ידני מהיר על הסדין לאחר המתיחה כדי להעלים קמטוטי כביסה ולהעניק מראה מתוח ומזמין של סוויטת יוקרה.",
        "illustrationPrompt": "Flat vector comic illustration: Housekeeper hands expertly folding crisp white luxury bedsheet corners around a plush king mattress, neat bedroom setting, morning sunlight streaming through window, clean vector style, no text."
      },
      {
        "stepNumber": 2,
        "title": "שמיכת פוך נוצות אוורור והכנסה חלקה לציפה",
        "instructions": "הכניסו את שמיכת הפוך האיכותית לציפת סאטן לבנה. נערו ואווררו היטב את השמיכה כדי ליצור נפח מלא ואחיד, וקפלו את החלק העליון של הציפה 20 ס״מ כלפי מטה.",
        "proTip": "קשרו את פינות הפוך הפנימיות ללולאות הציפה כדי למנוע מהשמיכה לגלוש או להצטבר בתחתית במהלך שנת האורחים.",
        "illustrationPrompt": "Flat vector comic art: Fluffy voluminous white duvet resting perfectly on a king bed with smooth folded top edge, elegant headboard, light airy mood, minimalist vector illustration, no text."
      },
      {
        "stepNumber": 3,
        "title": "סידור 4 כריות שינה פלומתיות + 2 כריות נוי מעוצבות",
        "instructions": "העמידו שתי כריות שינה קשיחות מאחור, שתי כריות נוצות רכות מלפנים, והשלימו בשתי כריות נוי טקסטורליות במרכז עם שקע עדין (Karate Chop) בראשן.",
        "proTip": "מגוון בין כרית קשיחה לרכה מאפשר לכל אורח לבחור את תנוחת השינה האידיאלית עבורו ומבטיח שנת לילה מושלמת.",
        "illustrationPrompt": "Flat vector comic illustration: Symmetrical arrangement of four plush white sleeping pillows and two accent decorative cushions on a luxury bed, hotel styling, modern clean vector lines, no text."
      },
      {
        "stepNumber": 4,
        "title": "פריסת ראנר דקורטיבי ושוקולד פרלין גולני",
        "instructions": "פרסו ראנר מיטה בגוון אדמה/בזלת לרוחב קצה המיטה התחתון, והניחו במרכז כל כרית ראש פרלין שוקולד בלגי איכותי או שקיק לבנדר טבעי בניחוח מרגיע.",
        "proTip": "שקיק לבנדר מקומי מרמת הגולן מעניק בידול ייחודי, ריח טבעי נפלא וחיבור לאווירה הכפרית של האזור.",
        "illustrationPrompt": "Flat vector comic style: Close-up of a stylish woven textured bed runner at the foot of the bed, with gourmet artisanal chocolate resting on a crisp white pillow, warm resort ambient, flat vector, no text."
      }
    ]
  },
  {
    "id": "guide_winter_storm_sop",
    "slug": "winter-storm-and-emergency-cabin-sop",
    "title": "נוהל היערכות ובטיחות למזג אוויר סוער ושלג בבקתות הגולן",
    "category": "בטיחות ותשתיות",
    "summary": "נוהל תפעולי מקיף להגנה על המתחם והאורחים בסערות חורף, רוחות עזות ושלג: בדיקת מערכות חימום, הגנת קווי מים מקפיאה, אספקת עצים לקמין וגיבוי חשמלי.",
    "steps": [
      {
        "stepNumber": 1,
        "title": "בדיקת קמין עצים/פלט ומילוי סל עצי אלון יבשים",
        "instructions": "נקו את מגירת האפר של הקמין, ודאו שפתח הארובה (Damper) נפתח ונסגר בצורה חלקה, והניחו ליד הקמין סל מלא בעצי אלון יבשים, חומרי הדלקה בטוחים ומצת ארוך.",
        "proTip": "השאירו הוראות הדלקה פשוטות עם תמונות בצמוד לקמין, והדגישו תמיד לסגור את דלת הזכוכית למניעת עשן בבקתה.",
        "illustrationPrompt": "Flat vector comic illustration: A modern black cast iron wood stove burning warm orange flames safely inside a luxury cabin, woven basket full of dry logs and fireplace tools beside it, snowing softly outside the window, cozy flat vector, no text."
      },
      {
        "stepNumber": 2,
        "title": "הגנת קווי מים חיצוניים ודודים מפני קפיאה",
        "instructions": "עטפו צינורות מים וברזים חשופים בשרוולי בידוד תרמיים. בלילות של טמפרטורה מתחת ל-0°C, השאירו זרם מים דקיק (טפטוף) בברזים החיצוניים כדי למנוע קפיאת מים ופיצוץ צנרת.",
        "proTip": "ודאו שמשאבות החום וגופי החימום של הג׳קוזי מכוונים לרוץ באופן רציף על מנת שמים יזרמו במערכת ללא הפסקה.",
        "illustrationPrompt": "Flat vector comic illustration: Insulated water pipes with neat foam wrapping outside a wooden cabin structure, frosty winter evening landscape, clear technical vector illustration, no text."
      },
      {
        "stepNumber": 3,
        "title": "בדיקת גיבוי חשמלי (UPS), תאורת חירום וערכת הפסקת חשמל",
        "instructions": "בדקו שטעינת תחנת הכוח הניידת / UPS של הראוטר מלאה, מקמו תאורת חירום נטענת בכל חדר, וספקו פנס ראש איכותי וסוללת גיבוי (Power Bank) טעונה במגירה הראשית.",
        "proTip": "כאשר האינטרנט והתאורה ממשיכים לעבוד בזמן סופת חורף, האורחים חווים את הפסקת החשמל כהרפתקה רומנטית ולא כמטרד.",
        "illustrationPrompt": "Flat vector comic art: A portable power station device with battery percentage display glowing on a shelf, emergency rechargeable lantern providing warm comforting light, wind blowing outside, cute comic aesthetic, no text."
      },
      {
        "stepNumber": 4,
        "title": "בדיקת ניקוז מרזבים, איטום דלתות ופיזור מלח בשבילים",
        "instructions": "פנו עלים וענפים ממרזבי הגג, ודאו שגומיות האיטום בחלונות הפנורמיים ובדלתות אוטמות היטב מפני רוחות חזקות, ופזרו מלח גבישי על שבילי הגישה והמדרגות למניעת החלקה על קרח.",
        "proTip": "הניחו שטיח גומי מחורר וסופג בכניסה לבקתה כדי שהאורחים יוכלו להסיר נעליים בוציות או מושלגות בנוחות לפני הכניסה לדק העץ.",
        "illustrationPrompt": "Flat vector comic illustration: Salt crystals scattered neatly over a private stone pathway leading to a glowing cabin entrance porch, heavy snow falling gently in pine woods, safety and warmth, flat vector art, no text."
      }
    ]
  }
];

/* ==========================================================================
   2. SEEDED_PROPERTIES (12 Real Production Properties & 46 Canonical Units)
   Source: Mac Studio multiPropertyCatalog.js (Ran & ResortOS)
   ========================================================================== */

export const SEEDED_PROPERTIES: CabinProperty[] = [
  {
    "id": "mialees",
    "slug": "mialees",
    "name": "MIALEES RESORT",
    "hebrewName": "מיאליס ריזורט",
    "tagline": "חוויית אירוח יוקרתית מול נוף הכנרת",
    "subTitle": "וילת יוקרה וסוויטות בוטיק פרטיות במושב נאות גולן",
    "description": "וילת יוקרה וסוויטות בוטיק פרטיות במושב נאות גולן",
    "village": "מושב נאות גולן",
    "region": "דרום רמת הגולן והכנרת",
    "phone": "054-807-6123",
    "whatsappNumber": "972548076123",
    "email": "info@mialees.co.il",
    "wazeUrl": "https://waze.com/ul?q=Mialees+Resort&navigate=yes",
    "mapsUrl": "https://maps.google.com/?q=Neot+Golan",
    "heroImage": "/resorts/mialees.jpg",
    "amenities": [
      "בריכה פרטית לכל יחידה",
      "ג׳קוזי ספא חיצוני",
      "מכונת אספרסו נספרסו",
      "מיקרוגל ומקרר",
      "מטבחון מאובזר וכלי אוכל",
      "מנגל פרטי בחצר",
      "טלוויזיה עם יס (yes)",
      "אינטרנט Wi-Fi מהיר (CASAMIA)"
    ],
    "theme": {
      "primary": "#26130F",
      "secondary": "#736055",
      "accent": "#59454A",
      "background": "#FDFBF7",
      "bgSoft": "#F2E4E9",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F8F3F0",
      "border": "#BFB3A8",
      "borderLight": "#E8DED8",
      "brandPink": "#F2D5DD",
      "dark": "#26130F",
      "darkSoft": "#3F2C29",
      "gold": "#C5A880",
      "badgeBg": "#59454A",
      "badgeText": "#FFFFFF"
    },
    "unitsCount": 4,
    "units": [
      {
        "id": "mialis-villa",
        "propertyId": "mialees",
        "name": "וילה מיאליס ריזורט",
        "englishName": "Villa Mialees Resort",
        "type": "villa",
        "bedrooms": 4,
        "bathrooms": 3,
        "maxOccupancy": 12,
        "basePrice": 2500,
        "weekendPrice": 3200,
        "sizeM2": 220,
        "description": "וילת יוקרה רחבת ידיים בת 4 חדרי שינה, מטבח שף מאובזר, סלון ענק, חצר מטופחת עם פינות ישיבה ומנגל מקצועי, ומרפסת פנורמית מול נוף הכנרת.",
        "features": [
          "4 חדרי שינה מרווחים עם מיטות קינג סייז",
          "מרפסת נוף פנורמית לכנרת",
          "סלון יוקרתי ומערכת שמע",
          "מטבח שף מאובזר קומפלט + פינת אוכל ל-12 סועדים",
          "מכונת נספרסו, מקרר ומיקרוגל",
          "חצר ענקית עם עמדת גריל גז",
          "טלוויזיות עם יס בכל החדרים",
          "Wi-Fi מהיר ומוצרי טיפוח ממותגים MIALEES"
        ],
        "images": [
          "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80"
        ]
      },
      {
        "id": "suite-1",
        "propertyId": "mialees",
        "name": "סוויטה 1 (הירוקה)",
        "englishName": "Suite 1 (Green)",
        "type": "suite",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 1300,
        "weekendPrice": 1650,
        "sizeM2": 55,
        "description": "סוויטת בוטיק פרטית ואינטימית עם בריכה פרטית מחוממת וג׳קוזי ספא חיצוני ענק, מטבחון מאובזר ופרטיות מוחלטת.",
        "features": [
          "בריכה פרטית מחוממת ואינטימית",
          "ג׳קוזי ספא זרמים מפנק בחצר",
          "מיטת קינג סייז מצעי פרימיום",
          "מטבחון מאובזר, מכונת נספרסו, מיקרו ומקרר",
          "מנגל בחצר הפרטית",
          "טלוויזיה עם יס ו-Wi-Fi מהיר",
          "חלוקי רחצה ומוצרי אמבט ממותגים"
        ],
        "images": [
          "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80"
        ]
      },
      {
        "id": "suite-2",
        "propertyId": "mialees",
        "name": "סוויטה 2 (הורודה)",
        "englishName": "Suite 2 (Pink)",
        "type": "suite",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 1300,
        "weekendPrice": 1650,
        "sizeM2": 55,
        "description": "סוויטת בוטיק מעוצבת בגווני מוקה וחום יין, עם בריכה פרטית וג׳קוזי ספא מול שקיעות הזהב הקסומות של הכנרת.",
        "features": [
          "בריכה פרטית מרעננת מול נוף השקיעה",
          "ג׳קוזי ספא חיצוני מפואר",
          "מטבחון מאובזר, נספרסו, מיקרוגל ומקרר",
          "מנגל בחצר הפרטית",
          "טלוויזיה עם יס ו-Wi-Fi מהיר",
          "מוצרי טיפוח ממותגי יוקרה MIALEES"
        ],
        "images": [
          "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80"
        ]
      },
      {
        "id": "mialees-buyout",
        "propertyId": "mialees",
        "name": "המתחם כולו בבלעדיות (Full Buyout)",
        "englishName": "Full Resort Buyout",
        "type": "buyout",
        "bedrooms": 6,
        "bathrooms": 5,
        "maxOccupancy": 20,
        "basePrice": 4900,
        "weekendPrice": 6200,
        "sizeM2": 330,
        "description": "סגירה בלעדית של כל ריזורט מיאליס: וילת הנוף + 2 סוויטות הבוטיק. 2 בריכות פרטיות, 2 מתחמי ג׳קוזי ספא ופרטיות אבסולוטית.",
        "features": [
          "נעילה בלעדית של וילת הנוף ו-2 סוויטות הבוטיק",
          "2 בריכות שחייה פרטיות",
          "2 מתחמי ג׳קוזי ספא נפרדים",
          "עד 20 אורחים בפרטיות מושלמת"
        ],
        "images": [
          "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80"
        ]
      }
    ]
  },
  {
    "id": "toscana",
    "slug": "toscana",
    "name": "בקתות טוסקנה",
    "hebrewName": "בקתות טוסקנה",
    "tagline": "אווירה טוסקנית קסומה בלב רמות",
    "subTitle": "בקתות עץ איטלקיות מרווחות, בריכת שחייה, ג׳קוזי ספא וסאונה בשאטו",
    "description": "בקתות עץ איטלקיות מרווחות, בריכת שחייה, ג׳קוזי ספא וסאונה בשאטו",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Toscana+Cabins+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/toscana.jpg",
    "amenities": [
      "מטבח מרכזי משותף מאובזר",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי פנימי בכל בקתה + ג׳קוזי חיצוני במתחם",
      "סאונה יבשה (בשאטו)",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי",
      "טלוויזיה עם יס ו-Wi-Fi חופשי"
    ],
    "theme": {
      "primary": "#1E3A2F",
      "secondary": "#4D6A5A",
      "accent": "#8C6239",
      "background": "#FAF8F5",
      "bgSoft": "#EDE6DD",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F2ECE4",
      "border": "#D9CFC4",
      "borderLight": "#E8E1D7",
      "dark": "#1E3A2F",
      "darkSoft": "#2D4A3E",
      "gold": "#C5A880"
    },
    "unitsCount": 3,
    "units": [
      {
        "id": "k687",
        "propertyId": "toscana",
        "name": "טוסקנה · פירנצה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ איטלקית כפרית ורחבת ידיים עם ג׳קוזי ספא פנימי, מרפסת דק מעץ ומטבחון מאובזר.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא פנימי",
          "מטבחון, נספרסו, מיקרוגל, מקרר ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/toscana.jpg"
        ]
      },
      {
        "id": "k688",
        "propertyId": "toscana",
        "name": "טוסקנה · פירנצה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית חמימה מול מדשאות ירוקות ובריכת השחייה של המתחם.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא מפנק",
          "מטבחון מאובזר, נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/toscana.jpg"
        ]
      },
      {
        "id": "k689",
        "propertyId": "toscana",
        "name": "טוסקנה · שאטו (עם סאונה)",
        "englishName": "",
        "type": "villa",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 10,
        "basePrice": 1200,
        "weekendPrice": 1600,
        "sizeM2": 55,
        "description": "בקתת שאטו ענקית ומפוארת למשפחות וקבוצות, כוללת סאונה יבשה פרטית, ג׳קוזי ספא ומטבח רחב.",
        "features": [
          "עד 10 אורחים (זוג+8)",
          "סאונה יבשה פרטית",
          "ג׳קוזי ספא",
          "מטבחון מאובזר, נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/toscana.jpg"
        ]
      }
    ]
  },
  {
    "id": "nurit",
    "slug": "nurit",
    "name": "בתי נורית",
    "hebrewName": "בתי נורית",
    "tagline": "8 בקתות עץ כפריות במושב רמות",
    "subTitle": "מתחם נופש פסטורלי עם בריכת שחייה, סאונה יבשה, מטבח מרכזי וג׳קוזי",
    "description": "מתחם נופש פסטורלי עם בריכת שחייה, סאונה יבשה, מטבח מרכזי וג׳קוזי",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Batey+Nurit+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/nurit.jpg",
    "amenities": [
      "מטבח מרכזי משותף ענק",
      "סאונה יבשה במתחם",
      "בריכת שחייה משותפת",
      "ג׳קוזי ספא בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי לכל בקתה",
      "טלוויזיה עם יס ו-Wi-Fi"
    ],
    "theme": {
      "primary": "#3B2F2F",
      "secondary": "#6E5D53",
      "accent": "#B8860B",
      "background": "#FDFCF7",
      "bgSoft": "#F4EFE6",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F7F3EB",
      "border": "#DFD7CA",
      "borderLight": "#EBE5DA",
      "dark": "#3B2F2F",
      "darkSoft": "#4A3D3D",
      "gold": "#C5A880"
    },
    "unitsCount": 8,
    "units": [
      {
        "id": "k671",
        "propertyId": "nurit",
        "name": "בתי נורית 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ומטופחת עם ג׳קוזי פנימי ומטבחון.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k673",
        "propertyId": "nurit",
        "name": "בתי נורית 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית מרווחת מול המדשאות.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k674",
        "propertyId": "nurit",
        "name": "בתי נורית 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית מרווחת.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k675",
        "propertyId": "nurit",
        "name": "בתי נורית 4",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ושקטה.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k676",
        "propertyId": "nurit",
        "name": "בתי נורית 5",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית גדולה.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k677",
        "propertyId": "nurit",
        "name": "בתי נורית 6",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית גדולה.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k678",
        "propertyId": "nurit",
        "name": "בתי נורית 7",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ נעימה ורגועה.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      },
      {
        "id": "k679",
        "propertyId": "nurit",
        "name": "בתי נורית 8",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ושלווה.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/nurit.jpg"
        ]
      }
    ]
  },
  {
    "id": "taj",
    "slug": "taj",
    "name": "טאג׳ מאהל",
    "hebrewName": "טאג׳ מאהל",
    "tagline": "4 בקתות עץ יוקרתיות סביב בריכה במושב רמות",
    "subTitle": "אירוח זוגי ומשפחתי מול אווירה שלווה ונוף גלילי",
    "description": "אירוח זוגי ומשפחתי מול אווירה שלווה ונוף גלילי",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Taj+Mahal+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/taj.jpg",
    "amenities": [
      "מטבח מרכזי משותף",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי ספא בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי",
      "טלוויזיה עם יס ו-Wi-Fi"
    ],
    "theme": {
      "primary": "#2B261F",
      "secondary": "#5C5449",
      "accent": "#9E723D",
      "background": "#FCFBF7",
      "bgSoft": "#F2EDE4",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F5F1E8",
      "border": "#DDD6C9",
      "borderLight": "#EBE5DA",
      "dark": "#2B261F",
      "darkSoft": "#3D362C",
      "gold": "#C5A880"
    },
    "unitsCount": 4,
    "units": [
      {
        "id": "k808",
        "propertyId": "taj",
        "name": "טאג׳ מאהל · בקתה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 2,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ רומנטית לזוגות עם ג׳קוזי ספא ומרפסת דק.",
        "features": [
          "זוג (2 אורחים)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרו, מקרר, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/taj.jpg"
        ]
      },
      {
        "id": "k809",
        "propertyId": "taj",
        "name": "טאג׳ מאהל · בקתה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ מרווחת עם ספה נפתחת לילדים וג׳קוזי ספא.",
        "features": [
          "עד 4 אורחים (זוג+2)",
          "ספה נפתחת",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/taj.jpg"
        ]
      },
      {
        "id": "k810",
        "propertyId": "taj",
        "name": "טאג׳ מאהל · בקתה 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 2,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ רומנטית ואינטימית לזוגות.",
        "features": [
          "זוג (2 אורחים)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרו, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/taj.jpg"
        ]
      },
      {
        "id": "k811",
        "propertyId": "taj",
        "name": "טאג׳ מאהל · בקתה 4",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 2,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ שלווה צמודה לבריכה.",
        "features": [
          "זוג (2 אורחים)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרו, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/taj.jpg"
        ]
      }
    ]
  },
  {
    "id": "mool",
    "slug": "mool",
    "name": "מול הנוף",
    "hebrewName": "מול הנוף",
    "tagline": "5 בקתות עץ מול נוף פנורמי לכנרת",
    "subTitle": "מרפסות שקיעה פתוחות, בריכת שחייה וג׳קוזי מול נוף המים",
    "description": "מרפסות שקיעה פתוחות, בריכת שחייה וג׳קוזי מול נוף המים",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Mool+Hanof+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/mool.jpg",
    "amenities": [
      "מטבח מרכזי משותף",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי ספא / אמבט זרמים",
      "נוף פנורמי פתוח לכנרת",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי",
      "טלוויזיה עם יס ו-Wi-Fi"
    ],
    "theme": {
      "primary": "#1A3344",
      "secondary": "#436174",
      "accent": "#2A7B9B",
      "background": "#F8FBFC",
      "bgSoft": "#E6EFF4",
      "surface": "#FFFFFF",
      "surfaceSoft": "#EDF5F8",
      "border": "#C8D9E3",
      "borderLight": "#DCE7EE",
      "dark": "#1A3344",
      "darkSoft": "#28465C",
      "gold": "#C5A880"
    },
    "unitsCount": 5,
    "units": [
      {
        "id": "k680",
        "propertyId": "mool",
        "name": "מול הנוף · בקתה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ עם מרפסת נוף פתוחה וישירה לכנרת.",
        "features": [
          "עד 5 אורחים",
          "נוף פנורמי לכנרת",
          "ג׳קוזי",
          "נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/mool.jpg"
        ]
      },
      {
        "id": "k681",
        "propertyId": "mool",
        "name": "מול הנוף · בקתה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית מרווחת מול השקיעות.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא מול הנוף",
          "נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/mool.jpg"
        ]
      },
      {
        "id": "k682",
        "propertyId": "mool",
        "name": "מול הנוף · בקתה 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית מרווחת מול הנוף.",
        "features": [
          "עד 7 אורחים (זוג+4)",
          "ג׳קוזי ספא מול הנוף",
          "נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/mool.jpg"
        ]
      },
      {
        "id": "k683",
        "propertyId": "mool",
        "name": "מול הנוף · בקתה 4",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ נעימה ושקטה מול הכנרת.",
        "features": [
          "עד 5 אורחים",
          "מרפסת נוף",
          "ג׳קוזי",
          "נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/mool.jpg"
        ]
      },
      {
        "id": "k684",
        "propertyId": "mool",
        "name": "מול הנוף · בקתה 5",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ פסטורלית עם נוף מרהיב.",
        "features": [
          "עד 5 אורחים",
          "מרפסת נוף",
          "ג׳קוזי",
          "נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/mool.jpg"
        ]
      }
    ]
  },
  {
    "id": "nofim",
    "slug": "nofim",
    "name": "נופים בלבן",
    "hebrewName": "נופים בלבן",
    "tagline": "2 בקתות עץ רומנטיות עם בריכה פרטית לכל בקתה",
    "subTitle": "בריכה פרטית, ג׳קוזי ספא ונוף פתוח לכנרת במושב רמות",
    "description": "בריכה פרטית, ג׳קוזי ספא ונוף פתוח לכנרת במושב רמות",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Nofim+Belavan+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/nofim.jpg",
    "amenities": [
      "בריכה פרטית לכל בקתה",
      "מטבח מרכזי משותף",
      "ג׳קוזי ספא מפנק",
      "נוף פתוח לכנרת",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון",
      "מנגל פרטי",
      "טלוויזיה עם יס"
    ],
    "theme": {
      "primary": "#2E353B",
      "secondary": "#5A6570",
      "accent": "#6B8E9E",
      "background": "#F9FAFC",
      "bgSoft": "#E9EEF2",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F0F4F7",
      "border": "#D1DCE3",
      "borderLight": "#E2EAF0",
      "dark": "#2E353B",
      "darkSoft": "#3C454D",
      "gold": "#C5A880"
    },
    "unitsCount": 2,
    "units": [
      {
        "id": "k685",
        "propertyId": "nofim",
        "name": "נופים בלבן · בקתה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ רומנטית ומרווחת עם בריכה פרטית וג׳קוזי מול הכנרת.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "בריכה פרטית לכל בקתה",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/nofim.jpg"
        ]
      },
      {
        "id": "k686",
        "propertyId": "nofim",
        "name": "נופים בלבן · בקתה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ יוקרתית עם בריכה פרטית ונוף פנורמי.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "בריכה פרטית לכל בקתה",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/nofim.jpg"
        ]
      }
    ]
  },
  {
    "id": "musical",
    "slug": "musical",
    "name": "החצר המוסיקלית",
    "hebrewName": "החצר המוסיקלית",
    "tagline": "3 בקתות עץ פסטורליות באווירה שלווה",
    "subTitle": "חליל, מיתר ופעמון במושב רמות – בריכת שחייה, ג׳קוזי ומדשאות",
    "description": "חליל, מיתר ופעמון במושב רמות – בריכת שחייה, ג׳קוזי ומדשאות",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Musical+Yard+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/musical.jpg",
    "amenities": [
      "מטבח מרכזי משותף",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי פנימי בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי לכל בקתה",
      "טלוויזיה עם יס ו-Wi-Fi"
    ],
    "theme": {
      "primary": "#332724",
      "secondary": "#66524C",
      "accent": "#A06E58",
      "background": "#FCFBF8",
      "bgSoft": "#F4ECE7",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F6EFEB",
      "border": "#DFD2CA",
      "borderLight": "#ECE2DB",
      "dark": "#332724",
      "darkSoft": "#453531",
      "gold": "#C5A880"
    },
    "unitsCount": 3,
    "units": [
      {
        "id": "k690",
        "propertyId": "musical",
        "name": "חצר מוסיקלית · חליל",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ונעימה עם ג׳קוזי זוגי.",
        "features": [
          "עד 4 אורחים (זוג+2)",
          "ג׳קוזי זוגי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/musical.jpg"
        ]
      },
      {
        "id": "k691",
        "propertyId": "musical",
        "name": "חצר מוסיקלית · מיתר",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ פסטורלית ושקטה.",
        "features": [
          "עד 4 אורחים (זוג+2)",
          "ג׳קוזי זוגי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/musical.jpg"
        ]
      },
      {
        "id": "k692",
        "propertyId": "musical",
        "name": "חצר מוסיקלית · פעמון",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ שלווה מול המדשאות.",
        "features": [
          "עד 4 אורחים (זוג+2)",
          "ג׳קוזי זוגי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/musical.jpg"
        ]
      }
    ]
  },
  {
    "id": "maya",
    "slug": "maya",
    "name": "בקתות מאיה",
    "hebrewName": "בקתות מאיה",
    "tagline": "3 בקתות עץ עם 2 בריכות שחייה במתחם",
    "subTitle": "חצר ירוקה מטופחת, ג׳קוזי פנימי ובריכות שחייה במושב רמות",
    "description": "חצר ירוקה מטופחת, ג׳קוזי פנימי ובריכות שחייה במושב רמות",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Maya+Cabins+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/maya.jpg",
    "amenities": [
      "מטבח מרכזי משותף",
      "שתי בריכות שחייה במתחם (ליד בקתה 1 וליד בקתה 3)",
      "ג׳קוזי פנימי בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי לכל בקתה",
      "טלוויזיה עם יס ו-Wi-Fi"
    ],
    "theme": {
      "primary": "#2C3527",
      "secondary": "#53624D",
      "accent": "#7A8F70",
      "background": "#F9FAF7",
      "bgSoft": "#EAEFE7",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F1F5EE",
      "border": "#D2DDCF",
      "borderLight": "#E3EAE0",
      "dark": "#2C3527",
      "darkSoft": "#3A4634",
      "gold": "#C5A880"
    },
    "unitsCount": 3,
    "units": [
      {
        "id": "k693",
        "propertyId": "maya",
        "name": "בקתות מאיה · בקתה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ מפנקת צמודה לבריכת השחייה הראשונה עם ג׳קוזי פנימי.",
        "features": [
          "עד 5 אורחים",
          "בריכת שחייה צמודה",
          "ג׳קוזי פנימי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/maya.jpg"
        ]
      },
      {
        "id": "k694",
        "propertyId": "maya",
        "name": "בקתות מאיה · בקתה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ושקטה עם ג׳קוזי פנימי.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי פנימי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/maya.jpg"
        ]
      },
      {
        "id": "k695",
        "propertyId": "maya",
        "name": "בקתות מאיה · בקתה 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ מפנקת צמודה לבריכת השחייה השנייה עם ג׳קוזי פנימי.",
        "features": [
          "עד 5 אורחים",
          "בריכת שחייה צמודה",
          "ג׳קוזי פנימי",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/maya.jpg"
        ]
      }
    ]
  },
  {
    "id": "siesta",
    "slug": "siesta",
    "name": "סייסטה",
    "hebrewName": "סייסטה",
    "tagline": "6 בקתות עץ משפחתיות ורומנטיות במושב רמות",
    "subTitle": "בריכת שחייה משותפת, מטבח מרכזי וג׳קוזי ספא",
    "description": "בריכת שחייה משותפת, מטבח מרכזי וג׳קוזי ספא",
    "village": "מושב רמות",
    "region": "רמת הגולן והכנרת",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Siesta+Ramot&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/siesta.jpg",
    "amenities": [
      "מטבח מרכזי משותף",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי ספא בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי לכל בקתה",
      "טלוויזיה עם יס"
    ],
    "theme": {
      "primary": "#302621",
      "secondary": "#605149",
      "accent": "#8C6C58",
      "background": "#FAF8F5",
      "bgSoft": "#EDE6DF",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F4ECE4",
      "border": "#D8CBC0",
      "borderLight": "#E7DDD4",
      "dark": "#302621",
      "darkSoft": "#423630",
      "gold": "#C5A880"
    },
    "unitsCount": 6,
    "units": [
      {
        "id": "k618",
        "propertyId": "siesta",
        "name": "סייסטה · משפחתית 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית מרווחת עם ג׳קוזי ומטבחון.",
        "features": [
          "עד 7 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      },
      {
        "id": "k619",
        "propertyId": "siesta",
        "name": "סייסטה · משפחתית 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ משפחתית גדולה.",
        "features": [
          "עד 7 אורחים",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      },
      {
        "id": "k620",
        "propertyId": "siesta",
        "name": "סייסטה · רומנטית 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ רומנטית לזוגות.",
        "features": [
          "לזוגות (עד 4 אורחים)",
          "ג׳קוזי ספא",
          "נספרסו ומנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      },
      {
        "id": "k621",
        "propertyId": "siesta",
        "name": "סייסטה · רומנטית 4",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 4,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ רומנטית לזוגות.",
        "features": [
          "לזוגות (עד 4 אורחים)",
          "ג׳קוזי ספא",
          "נספרסו ומנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      },
      {
        "id": "k622",
        "propertyId": "siesta",
        "name": "סייסטה · בת הים 5",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ בת הים המפנקת.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו ומנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      },
      {
        "id": "k623",
        "propertyId": "siesta",
        "name": "סייסטה · בת הים 6",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ בת הים המפנקת.",
        "features": [
          "עד 5 אורחים",
          "ג׳קוזי ספא",
          "נספרסו ומנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/siesta.jpg"
        ]
      }
    ]
  },
  {
    "id": "hill",
    "slug": "hill",
    "name": "צימר בגבעה",
    "hebrewName": "צימר בגבעה",
    "tagline": "4 בקתות עץ כפריות במושב גבעת יואב",
    "subTitle": "בריכת שחייה משותפת, מטבח מרכזי, ג׳קוזי ושקט גולני",
    "description": "בריכת שחייה משותפת, מטבח מרכזי, ג׳קוזי ושקט גולני",
    "village": "מושב גבעת יואב",
    "region": "דרום רמת הגולן",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Zimmer+Bagiva+Givat+Yoav&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/hill.jpg",
    "amenities": [
      "מטבח מרכזי משותף מאובזר",
      "בריכת שחייה משותפת במתחם",
      "ג׳קוזי ספא בכל בקתה",
      "מכונת נספרסו ומיקרוגל",
      "מקרר ומטבחון בכל יחידה",
      "מנגל פרטי לכל בקתה",
      "טלוויזיה עם יס"
    ],
    "theme": {
      "primary": "#2F382B",
      "secondary": "#5E6B56",
      "accent": "#839678",
      "background": "#FAFBF8",
      "bgSoft": "#EDF1E8",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F2F6ED",
      "border": "#D5DFCE",
      "borderLight": "#E4ECE0",
      "dark": "#2F382B",
      "darkSoft": "#3E4939",
      "gold": "#C5A880"
    },
    "unitsCount": 4,
    "units": [
      {
        "id": "hill-1",
        "propertyId": "hill",
        "name": "צימר בגבעה 1",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית ושלווה עם ג׳קוזי ספא ומטבחון.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/hill.jpg"
        ]
      },
      {
        "id": "hill-2",
        "propertyId": "hill",
        "name": "צימר בגבעה 2",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית מרווחת מול החצר.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/hill.jpg"
        ]
      },
      {
        "id": "hill-3",
        "propertyId": "hill",
        "name": "צימר בגבעה 3",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית שקטה ופסטורלית.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/hill.jpg"
        ]
      },
      {
        "id": "hill-4",
        "propertyId": "hill",
        "name": "צימר בגבעה 4",
        "englishName": "",
        "type": "cabin",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 7,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "בקתת עץ כפרית מרווחת.",
        "features": [
          "עד 7 אורחים (זוג+5)",
          "ג׳קוזי ספא",
          "נספרסו, מיקרוגל, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/hill.jpg"
        ]
      }
    ]
  },
  {
    "id": "kipat",
    "slug": "kipat",
    "name": "כיפת השמיים",
    "hebrewName": "כיפת השמיים",
    "tagline": "גלמפינג כיפות יוקרתיות עם תצפית כוכבים בגבעת יואב",
    "subTitle": "חוויית גלמפינג ייחודית ממוזגת עם ג׳קוזי ספא ושמיים זרועי כוכבים",
    "description": "חוויית גלמפינג ייחודית ממוזגת עם ג׳קוזי ספא ושמיים זרועי כוכבים",
    "village": "מושב גבעת יואב",
    "region": "דרום רמת הגולן",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=Kipat+Hashamayim+Givat+Yoav&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/kipat.jpg",
    "amenities": [
      "כיפות גלמפינג יוקרתיות ממוזגות",
      "ג׳קוזי ספא מפנק",
      "תצפית כוכבים פנורמית",
      "מטבחון מאובזר וכלי אוכל",
      "מכונת קפה / קומקום",
      "מקרר",
      "מנגל פרטי בחצר",
      "טלוויזיה עם יס"
    ],
    "theme": {
      "primary": "#1B263B",
      "secondary": "#415A77",
      "accent": "#778DA9",
      "background": "#FAFBFD",
      "bgSoft": "#E8EDF5",
      "surface": "#FFFFFF",
      "surfaceSoft": "#EFF3F9",
      "border": "#CBD6E2",
      "borderLight": "#DDE5EF",
      "dark": "#1B263B",
      "darkSoft": "#293852",
      "gold": "#C5A880"
    },
    "unitsCount": 3,
    "units": [
      {
        "id": "dome-blue",
        "propertyId": "kipat",
        "name": "כיפת שמיים כחול",
        "englishName": "",
        "type": "dome",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 3,
        "basePrice": 1200,
        "weekendPrice": 1500,
        "sizeM2": 55,
        "description": "כיפת גלמפינג יוקרתית ממוזגת בגווני כחול עמוק עם ג׳קוזי ספא ותצפית כוכבים.",
        "features": [
          "עד 3 אורחים (מתאים לזוגות)",
          "תקרת כוכבים פנורמית",
          "ג׳קוזי ספא",
          "מטבחון, מקרר, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/kipat.jpg"
        ]
      },
      {
        "id": "dome-red",
        "propertyId": "kipat",
        "name": "כיפת שמיים אדום",
        "englishName": "",
        "type": "dome",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 3,
        "basePrice": 1200,
        "weekendPrice": 1500,
        "sizeM2": 55,
        "description": "כיפת גלמפינג רומנטית ממוזגת בגווני ארגמן חמימים.",
        "features": [
          "עד 3 אורחים (מתאים לזוגות)",
          "תקרת כוכבים פנורמית",
          "ג׳קוזי ספא",
          "מטבחון, מקרר, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/kipat.jpg"
        ]
      },
      {
        "id": "dome-green",
        "propertyId": "kipat",
        "name": "כיפת שמיים ירוק",
        "englishName": "",
        "type": "dome",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 3,
        "basePrice": 1200,
        "weekendPrice": 1500,
        "sizeM2": 55,
        "description": "כיפת גלמפינג פסטורלית ממוזגת באווירה טבעית ושלווה.",
        "features": [
          "עד 3 אורחים (מתאים לזוגות)",
          "תקרת כוכבים פנורמית",
          "ג׳קוזי ספא",
          "מטבחון, מקרר, מנגל",
          "טלוויזיה עם יס"
        ],
        "images": [
          "/resorts/kipat.jpg"
        ]
      }
    ]
  },
  {
    "id": "casa-nova",
    "slug": "casa-nova",
    "name": "קאסה נובה",
    "hebrewName": "קאסה נובה (CasaNov)",
    "tagline": "סוויטות בוטיק יוקרתיות עם בריכה פרטית במושב נוב",
    "subTitle": "סוויטות Aura ו-Bloom ברמת הגולן (יישוב שומר שבת)",
    "description": "סוויטות Aura ו-Bloom ברמת הגולן (יישוב שומר שבת)",
    "village": "מושב נוב",
    "region": "דרום רמת הגולן",
    "phone": "050-759-7944",
    "whatsappNumber": "972507597944",
    "email": "info@resortos.co.il",
    "wazeUrl": "https://waze.com/ul?q=CasaNov+Nov&navigate=yes",
    "mapsUrl": "",
    "heroImage": "/resorts/casa-nova.jpg",
    "amenities": [
      "בריכה פרטית לכל סוויטה",
      "מטבחון פרטי מאובזר לכל יחידה",
      "ג׳קוזי ספא מפנק",
      "מכונת נספרסו ומיקרוגל",
      "מקרר וכלי אוכל",
      "מנגל פרטי (למעט שבת)",
      "טלוויזיה עם יס ו-Wi-Fi",
      "מתאים לשומרי שבת ומסורת"
    ],
    "theme": {
      "primary": "#242B28",
      "secondary": "#4E5A54",
      "accent": "#6E857B",
      "background": "#F9FAF9",
      "bgSoft": "#EBF0ED",
      "surface": "#FFFFFF",
      "surfaceSoft": "#F0F4F2",
      "border": "#CFD9D4",
      "borderLight": "#DFE7E3",
      "dark": "#242B28",
      "darkSoft": "#353F3B",
      "gold": "#C5A880"
    },
    "unitsCount": 2,
    "units": [
      {
        "id": "k826",
        "propertyId": "casa-nova",
        "name": "קאסה נובה · Aura",
        "englishName": "",
        "type": "suite",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "סוויטת בוטיק יוקרתית עם בריכה פרטית רחבה, ג׳קוזי ומטבחון מאובזר בפרטיות מלאה.",
        "features": [
          "עד 5 אורחים",
          "בריכה פרטית רחבה",
          "ג׳קוזי ספא",
          "מטבחון, נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/casa-nova.jpg"
        ]
      },
      {
        "id": "k827",
        "propertyId": "casa-nova",
        "name": "קאסה נובה · Bloom",
        "englishName": "",
        "type": "suite",
        "bedrooms": 1,
        "bathrooms": 1,
        "maxOccupancy": 5,
        "basePrice": 850,
        "weekendPrice": 1100,
        "sizeM2": 55,
        "description": "סוויטת בוטיק רומנטית ומעוצבת עם בריכה פרטית וג׳קוזי.",
        "features": [
          "עד 5 אורחים",
          "בריכה פרטית",
          "ג׳קוזי ספא",
          "מטבחון, נספרסו ומנגל",
          "טלוויזיה עם יס ו-Wi-Fi"
        ],
        "images": [
          "/resorts/casa-nova.jpg"
        ]
      }
    ]
  }
];

/* ==========================================================================
   3. B2B_SUPPLIER_DEALS (4 Operational Hospitality Vendor Deals)
   ========================================================================== */

export const B2B_SUPPLIER_DEALS: B2BSupplierDeal[] = [
  {
    "id": "deal_hotel_linen_cotton",
    "title": "מארזי מצעי יוקרה כותנה מצרית 500 חוטים ומגבות פרימיום",
    "category": "טקסטיל ומשק",
    "supplierName": "כותנה ופשתן — פתרונות טקסטיל למלונאות",
    "discountPercentage": 18,
    "couponCode": "CABINOS-LINEN-18",
    "description": "אספקה מרוכזת של מצעי כותנה מצרית צפופה 500 חוטים בגימור סאטן לבן צחור, בעלי עמידות מוכחת למאות כביסות תעשייתיות ללא פגיעה במרקם הרך. כולל סדינים בגדלים קינג/סופר-קינג, ציפות מעטפה, ומגבות גוף ענקיות בצפיפות 700 גרם למ״ר.",
    "minOrderCents": 150000,
    "validUntil": "2026-12-31",
    "benefits": [
      "18% הנחה סיטונאית ישירה מחיר מחירון מוסדי",
      "משלוח מבוטח חינם ישירות לדלת המתחם ברמת הגולן והגליל",
      "אפשרות לרקמת לוגו המתחם על חלוקי הרחצה בהזמנת 10+ יחידות",
      "אחריות החלפה מלאה על פגמי ייצור למשך 12 חודשים"
    ]
  },
  {
    "id": "deal_spa_chemicals_amenities",
    "title": "ערכות תחזוקת ג׳קוזי, כימיקלים ומוצרי טואלטיקה אקולוגיים",
    "category": "בריכות, ספא וטואלטיקה",
    "supplierName": "ספא גולן פתרונות מים ואירוח",
    "discountPercentage": 22,
    "couponCode": "CABINOS-SPA-22",
    "description": "חבילת חיטוי ותחזוקת ספא שנתית המותאמת במיוחד לתחלופת אורחים מהירה בצימרים: טבליות ברום שאינן מקציפות, חומרי מניעת אבנית ושמני גוף, מנקי קו מים ירוקים, וגלונים חסכוניים של שמפו, מרכך וסבון גוף אורגניים מועשרים בשמן זית גולני עם מתקני דיספנסר מעוצבים.",
    "minOrderCents": 80000,
    "validUntil": "2026-12-31",
    "benefits": [
      "22% הנחה על כלל מוצרי הכימיה והדיספנסרים למתחם",
      "ערכת בדיקת מים דיגיטלית מתנה בכל הזמנה מעל ₪1,200",
      "שירות ייעוץ כימי טלפוני 6 ימים בשבוע לפתרון בעיות עכירות מים",
      "תווי תקן בטיחות ואקולוגיה מחמירים המאושרים ע״י משרד הבריאות"
    ]
  },
  {
    "id": "deal_golan_coffee_wine",
    "title": "קפסולות אספרסו בקלייה טרייה ומארזי יין בוטיק גולני",
    "category": "מזון, משקאות ואירוח",
    "supplierName": "יקבי ומבשלות הצפון B2B",
    "discountPercentage": 15,
    "couponCode": "CABINOS-WINE-15",
    "description": "הסכם אספקה בלעדי למארחי CabinOS: קפסולות אספרסו פרימיום מאלומיניום תואמות Nespresso בקלייה מקומית טרייה עם פרופילי טעם עשירים, לצד מארזי בקבוקי יין אדום, לבן ורוזה מיקבי הבוטיק המובילים ברמת הגולן במחירי סיטונאות ללא פערי תיווך.",
    "minOrderCents": 100000,
    "validUntil": "2026-12-31",
    "benefits": [
      "15% הנחה קבועה על כל מגוון הקפסולות, פולי הקפה ומארזי היין",
      "חלוקה שבועית קבועה בימי שלישי ישירות למושבי הגולן",
      "הנחה נוספת של 5% בהזמנה חודשית אוטומטית קבועה (Standing Order)",
      "מעמדי קפסולות עץ ממותגים במתנה בהזמנת 200+ קפסולות"
    ]
  },
  {
    "id": "deal_smart_iot_locks",
    "title": "מנעולים חכמים, בקרי מזגן RM4 ועמדות טעינה לרכב חשמלי",
    "category": "טכנולוגיה וחשמל חכם",
    "supplierName": "סמארט-ריזורט מערכות שליטה ואוטומציה",
    "discountPercentage": 20,
    "couponCode": "CABINOS-IOT-20",
    "description": "חבילת אוטומציה מקיפה לחסכון באנרגיה ולניהול צ׳ק-אין עצמאי: מנעולי דלת חכמים עמידים למזג אוויר קיצוני עם תמיכה בקודים דינמיים מבוססי טלפון, בקרי אינפרא-אדום BroadLink RM4 לשליטה מרחוק על מזגנים, עמדות טעינה מהירות Type 2 לרכבים חשמליים ומגענים חכמים ללוחות חשמל.",
    "minOrderCents": 120000,
    "validUntil": "2026-12-31",
    "benefits": [
      "20% הנחה על כל רכיבי ה-IoT, המנעולים החכמים ועמדות הטעינה",
      "אינטגרציה וסנכרון מלא עם מערכת הניהול של CabinOS ו-ResortOS",
      "אחריות חומרה מורחבת ל-24 חודשים כולל שירות החלפות מהיר",
      "הדרכת התקנה וקונפיגורציה טלפונית / זום מלאה לצוות האחזקה"
    ]
  }
];

export default {
  COMIC_GUIDES,
  SEEDED_PROPERTIES,
  B2B_SUPPLIER_DEALS
};
