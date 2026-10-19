import type { BookingRow } from '../integration/resortos.js';
import type { RoomEntry } from '../config.js';

export interface GuestContext {
  booking: BookingRow;
  room?: RoomEntry;
  unitId: string;
  roomName: string;
  stayUrl?: string;
  guestName?: string | null;
}

export interface WifiInfo {
  ssid: string;
  password: string;
}

/**
 * Property / Complex Wi-Fi mapping based on ResortOS catalog & guestProfileSeed.js.
 */
export const PROPERTY_WIFI: Record<string, WifiInfo> = {
  // Taj Mahal (k808..k811)
  taj: { ssid: 'LUTUS', password: '12345678' },
  // Nofim Belavan (k685, k686)
  nofim: { ssid: 'TP-LINK_FA30', password: '15107312' },
  // Mool Hanof (k680..k684)
  mool: { ssid: 'Mol_hanof', password: '12345678' },
  // Batei Nurit (k671..k679)
  nurit: { ssid: 'MIALEES RESORT', password: 'MIAL2026' },
  // Toscana (k687..k689)
  toscana: { ssid: 'Toscana', password: '12345678' },
  // Musical Courtyard (k690..k692)
  musical: { ssid: 'Music yard', password: '12345678' },
  // Maya Cabins (k693..k695)
  maya: { ssid: 'maya', password: '12345678' },
  // Mialees Resort (Givat Yoav)
  mialis: { ssid: 'CASAMIA', password: 'CASAMIA10' },
  // Casa Nova (Nov)
  'casa-nova': { ssid: 'MIALEES', password: 'AD654321' },
};

export const UNIT_TO_PROPERTY: Record<string, string> = {
  k808: 'taj', k809: 'taj', k810: 'taj', k811: 'taj',
  k685: 'nofim', k686: 'nofim',
  k680: 'mool', k681: 'mool', k682: 'mool', k683: 'mool', k684: 'mool',
  k671: 'nurit', k673: 'nurit', k674: 'nurit', k675: 'nurit', k676: 'nurit', k677: 'nurit', k678: 'nurit', k679: 'nurit',
  k687: 'toscana', k688: 'toscana', k689: 'toscana',
  k690: 'musical', k691: 'musical', k692: 'musical',
  k693: 'maya', k694: 'maya', k695: 'maya',
  'mialis-villa': 'mialis', 'suite-1': 'mialis', 'suite-2': 'mialis',
  'k826': 'casa-nova', 'k827': 'casa-nova',
};

export function getWifiForUnit(unitId: string): WifiInfo {
  const prop = UNIT_TO_PROPERTY[unitId];
  if (prop && PROPERTY_WIFI[prop]) return PROPERTY_WIFI[prop];
  return { ssid: 'Guest_WiFi', password: 'Ask_Reception' };
}

export const JACUZZI_GUIDE =
  `🛁 *הוראות הפעלת הג׳קוזי:*\n` +
  `1. *סגירת הפקק:* מניחים את פקק הגומי הדק על פתח הניקוז בקרקעית הג׳קוזי ומוודאים שהוא אטום היטב.\n` +
  `2. *מילוי מים:* פותחים מים וממלאים את הג׳קוזי עד שכל פתחי הסילונים (הג׳טים) מכוסים לחלוטין במים.\n` +
  `⚠️ *חשוב מאוד:* אין להפעיל את הג׳קוזי לפני שהמים מכסים את כל הג׳טים כדי למנוע נזק למנוע ולמשאבה!\n` +
  `3. *הפעלת המתג:* רק כשהג׳קוזי מלא ומכסה את הג׳טים, לוחצים על המתג בקיר (הנורה האדומה תידלק והג׳טים יפעלו).\n` +
  `4. *כיבוי וריקון:* בסיום השימוש מכבים את המתג בקיר, ומשחררים את פקק הגומי לריקון מלא של המים.`;

export const GATE_GUIDE =
  `🚪 *קוד השער למושב רמות:*\n` +
  `הקוד לפתיחת שער הרכב הוא: *#2464* (כולל סולמית בהתחלה).`;

export const CHECKOUT_GUIDE =
  `ℹ️ *זמני שהות וצ׳ק-אאוט:*\n` +
  `• שעת צ׳ק-אאוט רשמית: עד 11:00 בבוקר.\n` +
  `• החל מהשעה 08:00 בבוקר ניתן לבצע צ׳ק-אאוט עצמי בלחיצה אחת דרך דף האורח הדיגיטלי שלכם.\n` +
  `• שעת צ׳ק-אין: החל מ-15:00.`;

export const FOOD_GUIDE =
  `🍽️ *מסעדות ואוכל מומלץ באזור:*\n\n` +
  `🥩 *בשרים:*\n` +
  `• *מושבוץ* (בתוך מושב רמות): מסעדת בשרים וקצביה מקומית מעולה, חוויה קולינרית כפרית (מומלץ מאוד להזמין מקום מראש! 04-673-2070).\n` +
  `• *מרינדו* (עין גב, כ-10 דק' נסיעה): מסעדת בשרים ידועה, מעדנייה וקצביה איכותית.\n\n` +
  `🐟 *דגים:*\n` +
  `• *מסעדת דגים עין גב* (נמל עין גב, כ-12 דק'): דגי כנרת טריים על קו המים מול השקיעה.\n\n` +
  `🍕 *קליל, פיצה ובירה:*\n` +
  `• *מוייזה* (בתוך מושב רמות): פיצות מעולות, פסטות, בירה מקומית ואווירה כיפית.\n` +
  `• *בקתה* (בתוך מושב רמות): מסעדה מקומית חמימה.\n` +
  `• *מבשלת בירה בצל בזלת* (קצרין, כ-25 דק'): בירות בוטיק מקומיות ואוכל טוב.\n\n` +
  `🍳 *ארוחות בוקר וקפה:*\n` +
  `• *המטבח ברמות* או *מועדון ארוחות בוקר* (בתוך המושב).`;

export const SHOPS_GUIDE =
  `🛒 *סופרמרקטים וקניות באזור:*\n` +
  `• *צרכניית מושב רמות:* בתוך המושב, מצרכים בסיסיים, חלב, לחם טרי, ירקות ופירות ושתייה קלה.\n` +
  `• *מרכז מסחרי בני יהודה* (כ-15 דק' נסיעה): סופרמרקט גדול ומרווח, בית מרקחת וכספומט.\n` +
  `• *תחנת דלק רמות:* בכניסה למושב, כולל חנות נוחות.\n` +
  `• *סופר אלונית האון* (כ-15 דק').`;

export const NATURE_GUIDE =
  `🌿 *טבע, מעיינות ומסלולי טיול סביב רמות והכנרת:*\n\n` +
  `💧 *מעיינות ומים:*\n` +
  `• *שמורת מג׳רסה (הבטיחה, כ-10 דק'):* מסלול הליכה מוצל בתוך המים בנחל דליות (מושלם לזוגות ולמשפחות).\n` +
  `• *עין כנף* (כ-10 דק'): 3 בריכות מעיין צלולות עם תצפית מהממת לכנרת ולגולן (ללא תשלום).\n` +
  `• *בריכת המשושים ונחל זוויתן* (כ-25 דק'): בריכות בזלת טבעיות מרהיבות.\n\n` +
  `🌅 *תצפיות ושקיעות:*\n` +
  `• *מצפה אופיר ושביל הבונקרים* (כ-10 דק'): תצפית פנורמית מדהימה על כל הכנרת. יפהפייה במיוחד בשעת השקיעה!\n` +
  `• *הר סוסיתא (היפוס, כ-12 דק'):* עתיקות עיר רומית המשקיפה אל הכנרת.\n\n` +
  `🏖️ *חופי כנרת קרובים:*\n` +
  `• חוף כינר (כ-10 דק'), חוף גופרה (כ-12 דק'), חוף דוגית / לבנון.`;

const CABIN_INSIDE: Record<string, string> = {
  taj: 'ג׳קוזי ספא, פינת קפה ותה, מיקרוגל, מקרר, מנגל, טלוויזיה עם יס ו-Wi-Fi.',
  nofim: 'בריכה פרטית מחוממת, ג׳קוזי ספא, פינת קפה ותה, מיקרוגל, מנגל, טלוויזיה עם יס.',
  mool: 'ג׳קוזי, מרפסת נוף, פינת קפה ותה, מנגל, טלוויזיה עם יס ו-Wi-Fi.',
  nurit: 'ג׳קוזי ספא, פינת קפה ותה, מיקרוגל, מנגל, טלוויזיה עם יס ו-Wi-Fi. במתחם יש בריכה וסאונה.',
  toscana: 'ג׳קוזי, מטבחון, פינת קפה ותה, מיקרוגל, מקרר, מנגל, טלוויזיה עם יס ו-Wi-Fi. במתחם יש בריכה מחוממת.',
  musical: 'ג׳קוזי פנימי, פינת קפה ותה, מיקרוגל, מקרר, מנגל, טלוויזיה עם יס ו-Wi-Fi. במתחם יש בריכה מחוממת.',
  maya: 'ג׳קוזי פנימי, פינת קפה ותה, מיקרוגל, מקרר, מנגל, טלוויזיה עם יס ו-Wi-Fi.',
  mialis: 'בריכה פרטית, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מנגל, טלוויזיה עם יס.',
  'casa-nova': 'בריכה פרטית, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מיקרוגל, מקרר, מנגל, טלוויזיה עם יס ו-Wi-Fi.',
};

function cabinInsideLine(unitId: string): string | null {
  if (unitId === 'k693' || unitId === 'k695') return 'בריכה פרטית מחוממת, ג׳קוזי פנימי, פינת קפה ותה, מיקרוגל, מנגל, טלוויזיה עם יס ו-Wi-Fi.';
  if (unitId === 'k694') return 'ג׳קוזי פנימי, בלי בריכה פרטית, פינת קפה ותה, מיקרוגל, מנגל, טלוויזיה עם יס ו-Wi-Fi.';
  if (unitId === 'k689') return 'סאונה יבשה, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מנגל, טלוויזיה עם יס ו-Wi-Fi.';
  const prop = UNIT_TO_PROPERTY[unitId];
  return (prop && CABIN_INSIDE[prop]) || null;
}

export const ATTRACTIONS_GUIDE =
  `🛶 *אטרקציות וחוויות באזור:*\n` +
  `• *אבוקיאק* (פארק הירדן): שייט קייקים, רפטינג ואבובים בירדן.\n` +
  `• *טיולי ג׳יפים וסוסים:* תיאום טיולי שטח ברמות והגולן עם איסוף מהבקתה.\n` +
  `• *חמת גדר* (כ-45 דק'): מרחצאות מים תרמו-מינרליים, ספא ובריכות.\n` +
  `• *יקב רמת הגולן ויקבי בוטיק:* סיורי יין וטעימות בקצרין וברמת הגולן.`;

/**
 * Intelligent deterministic matching for fast responses,
 * with context attachment and stay URL link.
 */
export function answerGuestQuestion(question: string, ctx: GuestContext): string | null {
  const q = question.toLowerCase().trim();

  // 1. Wi-Fi
  if (/wifi|wi-fi|וויפי|אינטרנט|וייפי|רשת|סיסמא|סיסמה/i.test(q)) {
    const wifi = getWifiForUnit(ctx.unitId);
    let reply = `📶 *פרטי ה-WiFi עבור ${ctx.roomName}:*\n` +
      `• *שם רשת (SSID):* ${wifi.ssid}\n` +
      `• *סיסמה:* ${wifi.password}\n\n` +
      `גלישה נעימה!`;
    if (ctx.stayUrl) reply += `\n\n📱 כל המידע זמין גם בדף האורח שלכם:\n${ctx.stayUrl}`;
    return reply;
  }

  // 2. Jacuzzi / Hot tub
  if (/ג['׳]?קוזי|סילונים|גטים|ג['׳]טים|זרמים|הפקק|פקק|jacuzzi|hot tub/i.test(q)) {
    let reply = JACUZZI_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 לצפייה במדריך המאויר בדף האורח:\n${ctx.stayUrl}`;
    return reply;
  }

  // 3. Gate
  if (/שער|לפתוח את השער|קוד שער|כניסה למושב|gate/i.test(q)) {
    let reply = GATE_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
    return reply;
  }

  // Staff accommodation & retired units inquiries
  if (/נורית\s*[78]|נופש\s*[78]|k678|k679/i.test(q) || (/בקתה\s*[78]\b/i.test(q) && /נורית|נופש/i.test(q))) {
    return `יחידות 7 ו-8 במתחם בתי נורית משמשות למגורי צוות ועובדים ואינן זמינות להזמנה. בקתות האירוח לאורחים במתחם הן בקתות 1 עד 6. נשמח לעזור בבדיקת זמינותן! 🌿`;
  }
  if (/סייסטה|k618|k619|k620|k621|k622|k623/i.test(q)) {
    return `מתחם סייסטה אינו מנוהל עוד במערכת. נשמח להציע לכם מגוון בקתות וסוויטות יוקרתיות במתחמים הפעילים שלנו במושב רמות וסביב הכנרת! 🌿`;
  }

  // 4. Lockbox / Keys
  if (/כספת|מפתח|קוד מפתח|קוד כספת|לפתוח תכספת|לפתוח את הכספת|lockbox|safe|key/i.test(q)) {
    if (ctx.room?.usage === 'STAFF_ACCOMMODATION' || ctx.unitId === 'k678' || ctx.unitId === 'k679' || ctx.unitId === 'pilot-office') {
      return `מרחב זה (${ctx.roomName}) הינו אזור תפעולי ואינו יחידת אירוח אורחים. לקבלת פרטי הכניסה לבקתת האירוח שלכם, אנא כתבו לנו את שם המזמין המלא.`;
    }
    const lockbox = ctx.room?.lockbox || 'לא מוגדר';
    let reply = `🔑 *קוד כספת המפתח של ${ctx.roomName}:* *${lockbox}*\n\n` +
      `*הוראות פתיחה:*\n` +
      `1. הזינו את הקוד: *${lockbox}* בגלגלות.\n` +
      `2. לחצו על מתג הפתיחה ומשכו את מכסה הכספת כלפי מטה.\n` +
      `3. הוציאו את המפתח.\n` +
      `4. ערבלו את הגלגלות וסגרו את המכסה.`;
    if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
    return reply;
  }

  // 5. Checkout / Checkin hours
  if (/עזיבה|צ['׳]?ק[- ]?אאוט|צק אאוט|checkout|check-out|check out|מתי יוצאים|שעת יציאה|מתי לפנות|פינוי|שעת פינוי/i.test(q)) {
    let reply = CHECKOUT_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 לצ׳ק-אאוט עצמי בדף האורח:\n${ctx.stayUrl}`;
    return reply;
  }

  // 6. Food / Restaurants
  if (/מסעד|לאכול|בשר|סטייק|דג|דגים|פיצה|ארוחת בוקר|קפה|אוכל|רעבים|צהריים|ערב|מושבוץ|מרינדו|restaurant|food|eat|dinner|breakfast/i.test(q)) {
    let reply = FOOD_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 פרטי מסעדות וניווט Waze זמינים בדף האורח שלכם:\n${ctx.stayUrl}`;
    return reply;
  }

  // 7. Supermarket / Grocery / Gas
  if (/סופר|מכולת|צרכני|קניות|דלק|פירות|חלב|מים|ביצים|supermarket|grocery/i.test(q)) {
    let reply = SHOPS_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 מיקומים וניווט Waze בדף האורח שלכם:\n${ctx.stayUrl}`;
    return reply;
  }

  // 8. Nature / Springs / Trails / Beaches
  if (/מעיין|מעין|שמורה|טיול|מסלול|כנרת|חוף|חופים|מג['׳]רסה|כנף|משושים|זוויתן|תצפית|שקיעה|nature|hike|spring|beach/i.test(q)) {
    let reply = NATURE_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 פרטי הגעה וניווט Waze לכל האתרים בדף האורח:\n${ctx.stayUrl}`;
    return reply;
  }

  // 9. Attractions / Activities
  if (/אטרקצי|קייק|קיאק|רפטינג|ג['׳]יפ|ספא|חמת גדר|מה לעשות|פעילות|יקב|יין|attraction|kayak|activities/i.test(q)) {
    let reply = ATTRACTIONS_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 לכל האטרקציות וחוויות האזור בדף האורח:\n${ctx.stayUrl}`;
    return reply;
  }

  if (/בתוך ה?צימר|בתוך ה?בקתה|בתוך החדר|מה יש ב|מה בבקתה|מה בצימר|מה יש כאן|מה יש בחדר/i.test(q)) {
    const line = cabinInsideLine(ctx.unitId);
    if (line) {
      let reply = `בתוך *${ctx.roomName}*:\n${line}`;
      if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
      return reply;
    }
  }

  // Shabbat items (hotplate, water urn)
  if (/פלטת שבת|פלטה|מיחם|מים חמים לשבת/i.test(q)) {
    return '🕯️ *פלטת שבת ומיחם:*\nפלטת שבת ומיחם מים חמים ניתנים לאספקה בתיאום מראש בלבד, ואינם מותקנים באופן קבוע בבקתה. נשמח לתאם זאת עבורכם!';
  }

  // Clothes hangers
  if (/קולב|קולבים|מתלה בגדים/i.test(q)) {
    return 'קולבים אינם חלק מהציוד התקני בבקתות כרגע.';
  }

  // Espresso machine & capsules inquiry
  if (/אספרסו|נספרסו|קפסול/i.test(q)) {
    return 'בעמדת הקפה בבקתה ממתינים לכם שקיקי נס קפה אישיים, קפה שחור, תה רגיל ומסאלה, וסוכרים. לגבי מכונת אספרסו וקפסולות נשמח לבדוק את התאמת הבקתה עבורכם מול צוות השירות.';
  }

  // Towels standard inquiry
  if (/^(?:כמה מגבות|מה תקן המגבות|תקן מגבות)/i.test(q)) {
    let reply = '🛁 *מגבות בבקתה:*\nהתקן בבקתה כולל 2 מגבות גוף/בריכה ומגבת פנים לכל אורח בהזמנה.';
    if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
    return reply;
  }


  // 10. Payment & Invoice inquiries (Restricted strictly to the guest's own booking)
  if (/(?:^|[^\u0590-\u05FF])(?:האם\s+שולם|שולם|שולמה|שולמו|תשלום|תשלומים|לשלם|שילמתי|שילמו|שילם|מחיר|כמה עולה|כמה לשלם|עלות|סכום|יתרה|חוב|חשבונית|קבלה|payment|price|money|cost|balance|fee)(?:[^\u0590-\u05FF]|$)/i.test(q)) {
    // Check if inquiring about another room / complex / general hotel finances
    const matchOwnRoom = Boolean((ctx.roomName && q.includes(ctx.roomName.toLowerCase())) ||
      (ctx.room?.name && q.includes(ctx.room.name.toLowerCase())));
    const mentionsOtherRoom = /בקתה\s*\d+|חדר\s*\d+|סוויטה\s*\d+|נורית|טאג|מול הנוף|טוסקנה|מוסיקלית|סייסטה/i.test(q) && !matchOwnRoom;

    if (mentionsOtherRoom) {
      return '🔒 פרטי הזמנות, תשלומים ומחירים של אורחים אחרים הינם חסויים לחלוטין ואינם ניתנים לשיתוף.';
    }

    if (ctx.booking && ctx.booking.id) {
      const isPaid = ctx.booking.payment_status === 'PAID';
      const statusText = isPaid ? 'ההזמנה שלכם שולמה במלואו ✅' : 'קיימת יתרה לתשלום עבור שהותכם ⏳';
      let reply = `💳 *פרטי תשלום עבור הזמנתכם (${ctx.roomName}):*\n` +
        `• סטטוס תשלום: *${statusText}*`;

      if (ctx.booking.total_price_agorot) {
        const total = Math.round(ctx.booking.total_price_agorot / 100);
        reply += `\n• סה״כ להזמנה: *₪${total.toLocaleString('he-IL')}*`;
        if (ctx.booking.deposit_agorot !== undefined && ctx.booking.deposit_agorot !== null) {
          const deposit = Math.round(ctx.booking.deposit_agorot / 100);
          const balance = Math.max(0, total - deposit);
          reply += `\n• שולם / מקדמה: *₪${deposit.toLocaleString('he-IL')}*`;
          if (!isPaid && balance > 0) {
            reply += `\n• יתרה לתשלום: *₪${balance.toLocaleString('he-IL')}*`;
          }
        }
      }

      if (ctx.stayUrl) {
        reply += `\n\n📱 לצפייה בחשבונית, קבלה או ביצוע תשלום מאובטח בדף האורח האישי שלכם:\n${ctx.stayUrl}`;
      }
      return reply;
    }

    return 'לבירור פרטי תשלום, עלויות או קבלות, אנא פנו למנהל המתחם או בדקו בקישור שנשלח אליכם בהודעת אישור ההזמנה.';
  }

  return null;
}

const ROOM_SPECIFIC_PLACE = /wifi|wi-fi|וויפי|וייפי|אינטרנט|סיסמ|כספת|מפתח|lockbox|safe|\bkey\b|בתוך ה?צימר|בתוך ה?בקתה|בתוך החדר|מה יש ב|מה בבקתה|מה בצימר|מה יש כאן|מה יש בחדר/i;

export function staffPlaceNeedsRoom(question: string): boolean {
  return ROOM_SPECIFIC_PLACE.test(String(question || ''));
}

/** Same cabin and area answers the guest gets, without the guest stay page or payment. */
export function answerStaffPlaceQuestion(question: string, ctx: { unitId?: string; roomName?: string; room?: RoomEntry | null }): string | null {
  if (/תקלה|לא עובד|לא מחמם|שבור|דולף|נתקע/.test(String(question || ''))) return null;
  if (staffPlaceNeedsRoom(question) && !ctx.unitId) return null;
  const reply = answerGuestQuestion(question, {
    booking: { id: '', unit_id: ctx.unitId || '' } as BookingRow,
    room: ctx.room || undefined,
    unitId: ctx.unitId || '',
    roomName: ctx.roomName || 'הבקתה',
  });
  if (!reply || /^(?:💳|🔒|לבירור פרטי תשלום)/.test(reply)) return null;
  return reply;
}
