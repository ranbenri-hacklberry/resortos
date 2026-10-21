/**
 * Word-boundary aware keyword matching for guest FAQ intents (S05, 2026-10-19).
 *
 * Plain substring regexes collided inside other words ("דלק" in "נדלקת", "יין" in "עדיין",
 * "חוף" in "דחוף", "מים" in "שמים"/"מתאימים", "eat" in "great"/"weather", ...).
 * Each keyword must start at a word boundary, optionally after common Hebrew prefixes
 * (ה/ו/ב/ל/מ/ש/כ, up to two), and must end at a word boundary unless marked as a stem with a trailing '*'.
 * Keywords are regex source (so ['׳]? etc. still work). Spaces inside a keyword match any whitespace.
 */
const LETTER = '\\p{L}\\p{N}';
export const HE_PREFIXES = 'הובלמשכ';

export interface KwOpts {
  /** Allowed Hebrew prefix letters for every Hebrew keyword in the list (default ה/ו/ב/ל/מ/ש/כ). */
  prefixes?: string;
}

function one(word: string, prefixes: string): string {
  const stem = word.endsWith('*');
  let w = stem ? word.slice(0, -1) : word;
  // keyword-level prefix override: "{הוב}מים" → only ה/ו/ב allowed before מים
  let p = prefixes;
  const m = w.match(/^\{([^}]*)\}/);
  if (m) {
    p = m[1];
    w = w.slice(m[0].length);
  }
  w = w.replace(/ /g, '\\s+');
  const isHebrew = /^[\u0590-\u05FF]/.test(w);
  const pre = isHebrew && p ? `(?:[${p}]{0,2})` : '';
  return `(?<![${LETTER}])${pre}(?:${w})${stem ? '' : `(?![${LETTER}])`}`;
}

/** Build one case-insensitive, unicode, boundary-aware regex from a keyword list. */
export function kw(words: string[], opts: KwOpts = {}): RegExp {
  const p = opts.prefixes ?? HE_PREFIXES;
  return new RegExp(words.map((w) => one(w, p)).join('|'), 'iu');
}

// ---- Intent keyword sets (shared by guestKnowledge.ts and placeMenu.ts) ----
export const WIFI_RE = kw(['wi-?fi*', 'ו?ו?יי?פי', 'וואי ?פיי?', 'אינטרנט', 'רשת', 'סיסמ*', 'вай-?фай', 'вайфай', 'пароль', 'интернет*', '(?:لل|ال|ل|بال)?واي ?فاي', '(?:لل|ال|ل|بال)?إنترنت', '(?:لل|ال|ل|بال)?انترنت', 'كلمة (?:ال)?سر', 'باسورد', '(?:ال)?شبكة']);
export const JACUZZI_RE = kw(["ג['׳]?קוזי", 'סילונים', 'גטים', "ג['׳]טים", 'זרמים', 'פקק*', 'jacuzzi', 'hot tub']);
export const GATE_RE = kw(['{הוב}שער', 'קוד שער', 'כניסה למושב', 'gate', 'ворот*', 'шлагбаум*', '(?:لل|ال|ل)?بواب(?:ة|ه)']);
export const LOCKBOX_RE = kw(['כספת', 'מפתח*', 'lockbox', 'safe', 'keys?', 'ключ*', 'сейф*', '(?:ال)?مفتاح', '(?:ال)?مفاتيح', '(?:ال)?خزنة']);
export const CHECKOUT_RE = kw(['עזיבה', "צ['׳]?ק[- ]?אאוט", 'צק אאוט', 'check-?out', 'check out', 'מתי יוצאים', 'שעת יציאה', 'מתי לפנות', 'פינוי', 'שעת פינוי', 'выезд*', 'выселени*', 'чек-?аут', 'выехать', 'освободить номер', 'تسجيل (?:ال)?خروج', '(?:ال)?مغادرة', 'نغادر', 'تشيك ?اوت', 'checkout']);
export const FOOD_RE = kw(['מסעד*', 'לאכול', 'בשר', 'בשרים', 'סטייק*', 'דג', 'דגים', 'פיצה', 'פיצות', 'פיצרי*', 'ארוחת בוקר', 'ארוחות בוקר', 'קפה', 'אוכל', 'רעבים', 'ארוחת צהריים', 'ארוחת ערב', 'ארוחות ערב', 'מושבוץ', 'מרינדו', 'restaurants?', 'food', 'eat', 'dinner', 'breakfast']);
export const FUEL_RE = kw(['דלק', 'תחנת דלק', 'מתדלק*', 'לתדלק', 'תדלוק', 'fuel', 'gas station', 'petrol']);
/** Groceries need a real shopping word (S08). */
export const GROCERY_RE = kw(['סופר', 'סופרמרקט*', 'מכולת', 'צרכני*', 'קניות', 'לקנות', 'קונים', 'מצרכים', 'supermarkets?', 'grocery', 'groceries', 'shopping']);
/** Place-menu variants (placeMenu.ts kept narrower lists than the FAQ). */
export const GROCERY_MENU_RE = GROCERY_RE;
export const COFFEE_RE = kw(['קפה', 'coffee']);
export const MEAT_MEAL_RE = kw(['מסעד*', 'לאכול', 'בשר', 'בשרים', 'סטייק*']);
export const FOOD_MENU_RE = kw(['מסעד*', 'לאכול', 'בשר', 'בשרים', 'סטייק*', 'דג', 'דגים', 'פיצה', 'פיצות', 'פיצרי*', 'ארוחת בוקר', 'ארוחות בוקר', 'ארוחת צהריים', 'ארוחת ערב', 'ארוחות ערב', 'אוכל', 'restaurants?', 'food', 'eat', 'dinner', 'breakfast']);
export const NATURE_RE = kw(['מעיין', 'מעיינות', 'מעין', 'שמורה', 'שמורת', 'טיול', 'טיולים', 'מסלול*', 'כנרת', 'חוף', 'חופים', 'חופי', "מג['׳]רסה", 'כנף', 'משושים', 'זוויתן', 'תצפית*', 'שקיעה', 'nature', 'hikes?', 'hiking', 'springs?', 'beach*']);
export const ATTRACTIONS_RE = kw(['אטרקצי*', 'קייק*', 'קיאק*', 'רפטינג', "ג['׳]יפ*", 'ספא', 'חמת גדר', 'מה לעשות', 'פעילות', 'פעילויות', 'יקב*', 'יין', 'יינות', 'attractions?', 'kayak*', 'activities']);

// ---- Fault reports (S05): take priority over amenity FAQs / place menus ----
export const TV_RE = kw(['טלוויזי*', 'טלויזי*', 'tv', 'שלט', 'ממיר', 'netflix']);
/** Explicit problem words: a fault on their own. */
export const FAULT_RE = kw([
  'לא נדלק*', 'לא דולק*', 'לא עובד*', 'לא מגיב*', 'לא מתחבר*', 'לא נפתח*', 'הפסיק(?:ה|ו)? לעבוד',
  'תקול*', 'תקלה', 'תקלות', 'מקולקל*', 'שבור*', 'נשבר*',
  'דולף', 'דולפת', 'דולפים', 'נזילה', 'נזילות', 'מטפטף', 'מטפטפ*', 'טפטוף', 'סתום', 'סתומה', 'סתומים', 'סתימה', 'נסתם', 'נסתמ*',
  'נשרף', 'נשרפ*', 'הצפה', 'מוצף', 'מוצפת', 'לא מחמם', 'לא מחממת', 'לא מקרר', 'לא מקררת',
  'אין מים חמים', 'אין מים', 'אין חשמל', 'אין זרם', 'נפל החשמל', 'אין אור',
  'broken', 'not working', "doesn'?t work", "won'?t turn on", 'not turning on', 'leak*', 'clogged', 'no hot water', 'no power'
]);

/** Appliance / fixture nouns (S08). */
export const APPLIANCE_RE = kw([
  'מזגן', 'מזגנים', 'מקרר', 'דוד', 'מים חמים', 'ברז', 'ברזים', 'שירותים', 'אסלה', 'סיפון', 'נורה', 'נורות', 'חשמל', 'פקק החשמל',
  "ג['׳]?קוזי", 'טלוויזי*', 'טלויזי*', 'tv', 'שלט', 'ממיר', 'תנור', 'כיריים', 'מקלחת', 'דלת', 'חלון', 'מנעול', 'כספת',
  '{הוב}מים', 'מיקרוגל', 'נספרסו', 'קומקום', 'מאוורר', 'חימום',
  'air ?con*', 'ac', 'fridge', 'heater', 'boiler', 'toilet', 'shower', 'tap', 'faucet', 'door', 'window', 'lights?',
]);

/** Symptoms that indicate a fault only together with an appliance/fixture noun. */
export const SYMPTOM_RE = kw([
  'נוזל', 'נוזלת', 'נוזלים', 'קפץ', 'קפצה', 'נתקע', 'נתקעה', 'תקוע', 'תקועה', 'מרעיש', 'מרעישה', 'רעש', 'מריח', 'מריחה', 'ריח',
  'קר', 'קרה', 'קרים', 'קרות', 'פושר*', 'חלש', 'חלשה', 'נשרף', 'כבה', 'כבתה', 'מהבהב*',
  'cold', 'noisy', 'smells?', 'stuck', 'dripping',
]);

/** Real shopping intent (S08): "מים"/"חלב" alone is not shopping. */
export const SHOPPING_RE = kw(['סופר', 'סופרמרקט*', 'מכולת', 'צרכני*', 'קניות', 'לקנות', 'קונים', 'מצרכים', 'supermarkets?', 'grocery', 'groceries', 'shopping', 'to buy']);

/** RU/AR explicit problem words. Only used when the message has no Hebrew (mixed Hebrew+Arabic is staff talk). */
export const FAULT_INTL_RE = kw(['не работает', 'не работают', 'не включается', 'не греет', 'сломал*', 'сломан*', 'протека*', 'течёт', 'течет', 'нет горячей воды', 'нет света', 'нет электричества', 'засор*', 'لا يعمل', 'ما يشتغل', 'ما بيشتغل', 'مش شغال*', 'خربان*', 'خربت', 'معطل*', 'عطل', 'تسريب', 'يسرب', 'ما في (?:مي|ماء) (?:سخنة|ساخنة|سخن|ساخن)', 'ما في كهرباء', 'مسدود*']);

export function isFaultReport(text?: string | null): boolean {
  const t = String(text || '');
  const explicit = FAULT_RE.test(t) || (!/[\u0590-\u05FF]/.test(t) && FAULT_INTL_RE.test(t));
  const combo = APPLIANCE_RE.test(t) && SYMPTOM_RE.test(t);
  if (!explicit && !combo) return false;
  // "אפשר לקנות מים קרים?" is shopping, not a fault.
  if (!explicit && SHOPPING_RE.test(t)) return false;
  // Wi-Fi trouble keeps the Wi-Fi branch (credentials are the most useful first answer);
  // a lockbox that won't open keeps the code + opening instructions.
  if (WIFI_RE.test(t) && !TV_RE.test(t) && !APPLIANCE_RE.test(t.replace(WIFI_RE, ''))) return false;
  if (LOCKBOX_RE.test(t) && !TV_RE.test(t) && !/מטפטפ|מטפטף|דולף|נשרף|נשרפ|הצפה/.test(t)) return false;
  return true;
}

// ---- Batch S02/S07/S09–S11/S13/S15/S17/S18/S20 (2026-10-19) ----

/** S17: a message is English when it has Latin letters and no Hebrew letters. */
export function isEnglishText(text?: string | null): boolean {
  const t = String(text || '');
  if (/[\u0590-\u05FF]/.test(t)) return false;
  return (t.match(/[A-Za-z]/g) || []).length >= 2;
}

/** S02: check-in time. Explicit check-in words, or an "enter / get in" verb together with a time word. */
export const CHECKIN_EXPLICIT_RE = kw(["צ['׳]?ק[- ]?אין", 'צק אין', 'check-?in', 'check in', 'early check-?in', 'שעת כניסה', 'שעת הכניסה', 'שעות כניסה', 'заезд*', 'заселени*', 'заселиться', 'заехать', 'чек-?ин', 'تسجيل (?:ال)?دخول', 'تشيك ?ان']);
export const ENTRY_VERB_RE = kw(['להיכנס', 'להכנס', 'נכנסים', 'ניכנס', 'נוכל להיכנס', 'אפשר להיכנס', 'נכנס', 'נכנסת', 'להגיע לחדר', 'להגיע לבקתה', 'להגיע לצימר', 'arrive', 'arrival', 'get in', 'enter', 'move in', 'войти', 'зайти', 'ندخل', '(?:ال)?دخول']);
export const TIME_WORD_RE = kw(['באיזו שעה', 'באיזה שעה', 'מאיזו שעה', 'מאיזה שעה', 'מתי', 'משעה', 'שעה', 'what time', 'when', 'how early', 'from what time', 'во сколько', 'со скольки', 'когда', 'متى', 'أي ساعة', 'اي ساعة', 'الساعة كم', 'ساعة']);
export function isCheckinQuestion(text?: string | null): boolean {
  const t = String(text || '');
  if (CHECKIN_EXPLICIT_RE.test(t)) return true;
  if (!(ENTRY_VERB_RE.test(t) && TIME_WORD_RE.test(t))) return false;
  // "מתי נכנסים למעיין / לג'קוזי / למסעדה" is not a check-in question.
  return !(FOOD_RE.test(t) || NATURE_RE.test(t) || ATTRACTIONS_RE.test(t) || GROCERY_RE.test(t) || JACUZZI_RE.test(t) || GATE_RE.test(t));
}

/** S20: thanks / compliments (small talk). */
export const THANKS_WORD_RE = kw(['תודה*', 'תודות', 'תנקס', 'תנקיו', 'thanks', 'thank you', 'thank u', 'thx', 'ty', 'cheers', 'спасибо', 'благодар*', 'شكرا*', 'شكرًا', 'مشكور*', 'يعطيك العافية']);
export const PRAISE_RE = kw(['מעולה', 'מושלם', 'מושלמת', 'אחלה', 'מדהים', 'מדהימה', 'נהדר', 'נהדרת', 'כיף', 'נפלא', 'נפלאה', 'יופי', 'סבבה', 'great', 'perfect', 'awesome', 'amazing', 'wonderful', 'lovely', 'excellent', 'отлично', 'супер', 'прекрасно', 'замечательно', 'ممتاز*', 'رائع*', 'حلو', 'تمام']);
/** Words that turn a thank-you into a real request/question. */
const ASK_WORD_RE = kw(['איך', 'מתי', 'איפה', 'היכן', 'מה', 'למה', 'כמה', 'האם', 'אפשר', 'אפשרי', 'יש', 'צריך', 'צריכה', 'צריכים', 'רוצה', 'רוצים', 'אבל', 'רק', 'עוד שאלה', 'שאלה', 'how', 'what', 'when', 'where', 'why', 'can', 'could', 'is there', 'do you', 'need', 'want', 'but', 'question', 'как', 'когда', 'где', 'что', 'почему', 'сколько', 'можно', 'есть', 'ли', 'нужно', 'хочу', 'но', 'вопрос', 'كيف', 'متى', 'وين', 'أين', 'اين', 'شو', 'ماذا', 'لماذا', 'ليش', 'كم', 'هل', 'ممكن', 'بدي', 'بدنا', 'أريد', 'اريد', 'لكن', 'سؤال']);

/** S09: complaints / negative sentiment. */
export const COMPLAINT_RE = kw([
  'מאוכזב*', 'אכזבה', 'לא נקי*', 'לא היה נקי*', 'מלוכלך', 'מלוכלכת', 'מלוכלכים', 'לכלוך', 'מסריח*', 'סרחון', 'מגעיל*', 'גועל',
  'לא מרוצה', 'לא מרוצים', 'לא מרוצות', 'תלונה', 'תלונות', 'להתלונן', 'מתלונן*', 'זוועה', 'חרפה', 'בושה', 'לא מקובל',
  'disappointed', 'disappointing', 'dirty', 'filthy', 'unhappy', 'not happy', 'complain*', 'terrible', 'awful', 'unacceptable', 'грязн*', 'разочарован*', 'недоволен', 'недовольн*', 'жалоб*', 'ужасн*', 'воняет', 'отвратительн*', 'وسخ*', 'متسخ*', 'قذر*', 'خيبة', 'مستاء*', 'زعلان*', 'شكوى', 'سيء', 'سيئة', 'مش نظيف*', 'غير نظيف*'
]);
export function isComplaint(text?: string | null): boolean {
  return COMPLAINT_RE.test(String(text || ''));
}

export function isThanksOnly(text?: string | null): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 140) return false;
  if (!(THANKS_WORD_RE.test(t) || PRAISE_RE.test(t))) return false;
  if (/\?/.test(t) || ASK_WORD_RE.test(t)) return false;
  if (isFaultReport(t) || isComplaint(t) || isVagueProblem(t)) return false;
  if (WIFI_RE.test(t) || GATE_RE.test(t) || LOCKBOX_RE.test(t) || CHECKOUT_RE.test(t) || isCheckinQuestion(t) || FOOD_RE.test(t) ||
    GROCERY_RE.test(t) || FUEL_RE.test(t) || NATURE_RE.test(t) || ATTRACTIONS_RE.test(t) || JACUZZI_RE.test(t) || PARKING_RE.test(t) ||
    PET_RE.test(t) || CLEANING_RE.test(t) || EXTENSION_RE.test(t)) return false;
  return true;
}

/** S10: a problem with no detail ("יש בעיה"). */
export function isVagueProblem(text?: string | null): boolean {
  const t = String(text || '').trim().replace(/[!?.,…🙁😞☹️]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:(?:היי|שלום|הי)\s+)?(?:יש\s+(?:לי\s+|לנו\s+|פה\s+|כאן\s+)?|קרתה\s+|יש לנו\s+)?(?:בעיה|בעייה|תקלה|משהו לא בסדר|משהו לא תקין)(?:\s+(?:קטנה|בחדר|בבקתה|בצימר|פה|כאן))?$/u.test(t) ||
    /^(?:у\s+(?:нас|меня)\s+)?(?:есть\s+)?проблема$/iu.test(t) ||
    /^(?:(?:في|عندي|عنا|عندنا)\s+)?مشكل(?:ة|ه)$/u.test(t) ||
    /^(?:(?:hi|hello)\s+)?(?:there'?s\s+|there is\s+|we have\s+|i have\s+)?(?:a\s+)?(?:problem|issue|something wrong)(?:\s+(?:here|in the room))?$/i.test(t);
}

/** S13 parking, S18 pets, S07 mid-stay cleaning, S15 extension. */
export const PARKING_RE = kw(['חני*', 'חנייה', 'חונים', 'להחנות', 'מחנים', 'parking', 'park', 'парковк*', 'припарковат*', 'стоянк*', '(?:ال)?موقف', '(?:ال)?مواقف', '(?:ال)?باركينغ', '(?:ال)?باركنج', 'نصف (?:ال)?سيار*', 'أركن*', 'اركن*', 'نركن*']);
export const PET_RE = kw(['כלב', 'כלבה', 'כלבים', 'כלבלב*', 'חתול', 'חתולה', 'חתולים', 'חיית מחמד', 'חיות מחמד', 'בעלי חיים', 'בעל חיים', 'dogs?', 'puppy', 'pets?', 'cats?', 'собак*', 'пёс', 'пес', 'щен*', 'животн*', 'кошк*', 'кот', '(?:ال)?كلب', '(?:ال)?كلاب', 'كلبي', 'كلبنا', '(?:ال)?حيوان*', '(?:ال)?قطة']);
export const CLEANING_RE = kw([
  'ניקיון', 'נקיון', 'לנקות', 'שינקו', 'ינקו', 'ניקוי', 'החלפת מצעים', 'להחליף מצעים', 'החלפת מגבות', 'להחליף מגבות',
  'housekeeping', 'cleaning', 'clean the room', 'clean our room', 'change the sheets', 'fresh towels', 'уборк*', 'убрать', 'убраться', 'смен\\S* бель*', 'поменять бель*', '(?:ال)?تنظيف', 'تنظفوا', 'ينظف*', 'تغيير (?:ال)?شراشف', 'تغيير (?:ال)?مناشف'
]);
export const EXTENSION_RE = kw([
  'להאריך', 'הארכה', 'הארכת', 'נאריך', 'עוד לילה', 'לילה נוסף', 'לילה אחד נוסף', 'עוד לילות', 'לילות נוספים', 'יום נוסף',
  'extend', 'extension', 'another night', 'extra night', 'one more night', 'additional night', 'продлить', 'продлени*', 'ещё (?:одну )?ночь', 'еще (?:одну )?ночь', 'дополнительн\\S* ноч*', '(?:ال)?تمديد', 'نمدد', 'تمدد', 'ليلة (?:إضافية|اضافية|أخرى|اخرى)', 'كمان ليلة'
]);

/** Payment questions in RU/AR/EN (Hebrew keeps the original list in guestKnowledge.ts). */
export const PAYMENT_INTL_RE = kw(['payment', 'pay', 'paid', 'price', 'cost', 'balance', 'fee', 'invoice', 'receipt', 'how much',
  'оплат*', 'оплач*', 'заплатить', 'доплат*', 'остаток', 'сколько платить', 'долг', 'счёт', 'счет',
  '(?:ال)?دفع', 'ندفع', '(?:ال)?مبلغ', '(?:ال)?متبقي', '(?:ال)?حساب', '(?:ال)?فاتورة', 'كم علي', 'كم باقي']);
