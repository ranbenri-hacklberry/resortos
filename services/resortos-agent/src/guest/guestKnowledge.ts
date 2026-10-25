import type { BookingRow } from '../integration/resortos.js';
import type { RoomEntry } from '../config.js';
import { readFileSync } from 'node:fs';
import {
  ATTRACTIONS_RE, CHECKOUT_RE, FOOD_RE, FUEL_RE, GATE_RE, GROCERY_RE, JACUZZI_RE, LOCKBOX_RE, NATURE_RE, TV_RE, WIFI_RE,
  kw, isFaultReport, isCheckinQuestion, isComplaint, isThanksOnly, isVagueProblem,
  PARKING_RE, PET_RE, CLEANING_RE, EXTENSION_RE, PAYMENT_INTL_RE,
} from './keywords.js';
import { T, detectGuestLang, guestLink, type GuestLang } from './i18n.js';
import { RACK_RATES } from '../pricing/priceList.js';

/** Per-unit TV steps generated from lib/guestProfileSeed.js (same steps the stay page shows). */
let ROOM_CONFIGURATIONS: Record<string, any> = {};
try {
  ROOM_CONFIGURATIONS = JSON.parse(readFileSync(new URL('../../data/room_configurations.json', import.meta.url), 'utf8'));
} catch {
  ROOM_CONFIGURATIONS = {};
}

let TV_GUIDES: Record<string, string[]> = {};
try {
  TV_GUIDES = JSON.parse(readFileSync(new URL('../../data/tvGuides.json', import.meta.url), 'utf8')).units || {};
} catch {
  TV_GUIDES = {};
}

export function tvStepsForUnit(unitId?: string): string[] | null {
  const steps = unitId ? TV_GUIDES[unitId] : undefined;
  return Array.isArray(steps) && steps.length ? steps : null;
}

export const CALL_OFFER = `תרצו שנתקשר אליכם? (השיבו *כן* ונחזור אליכם בהקדם 📞)`;

/** Fault report reply (S05). Never invents instructions: TV steps only from tvGuides.json. */
export function faultReply(question: string, ctx: { unitId?: string; roomName?: string }): string {
  const lang = detectGuestLang(question);
  if (lang !== 'he') return ctx.unitId ? T.fault(lang) : T.faultNeedBooking(lang);
  if (!ctx.unitId) {
    return `מצטערים על התקלה 🙏 כדי שנוכל לעזור, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה.`;
  }
  const steps = TV_RE.test(question) ? tvStepsForUnit(ctx.unitId) : null;
  if (steps) {
    return `מצטערים על התקלה 🙏 כמה דברים שכדאי לבדוק בטלוויזיה ב${ctx.roomName || 'יחידה'}:\n` +
      steps.map((step, i) => `${i + 1}. ${step}`).join('\n') +
      `\n\nאם זה עדיין לא עובד — ${CALL_OFFER}`;
  }
  return `מצטערים על התקלה ותודה שעדכנתם 🙏\n${CALL_OFFER}`;
}

export interface GuestContext {
  booking: BookingRow;
  room?: RoomEntry;
  unitId: string;
  roomName: string;
  stayUrl?: string;
  guestName?: string | null;
  /** Bookings the agent already read (read-only), used for late-checkout availability. */
  bookings?: BookingRow[];
  /** Israel date YYYY-MM-DD (injectable for tests). */
  today?: string;
  /** Staff place questions reuse this FAQ; staff keep the gate code without a booking. */
  isStaff?: boolean;
}

/** Ran 2026-10-19: dogs allowed in all complexes, +100 ₪ per dog per night. */
export const DOG_FEE_PER_NIGHT = 100;
/** Gate code value (unchanged); only identified guests get it (Ran 2026-10-19 12:47). */
export const GATE_CODE = '#2464';

/** S15: the unit's nightly rate for a given night, from the printed price list (src/pricing/priceList.ts RACK_RATES). */
export function extensionNightPrice(unitId: string, night: string): { ils: number; weekend: boolean } | null {
  const rate = RACK_RATES.find((r) => r.unitIds.includes(unitId));
  if (!rate) return null;
  // Price list: weekend = Thursday and Friday nights.
  const dow = new Date(`${night}T12:00:00Z`).getUTCDay();
  const weekend = dow === 4 || dow === 5;
  return { ils: weekend ? rate.weekend : rate.weekday, weekend };
}

export function isExtensionQuestion(text?: string | null): boolean {
  return EXTENSION_RE.test(String(text || ''));
}

/** Intents that must win over the area place menu (S07/S09/S10/S13/S15/S18/S20/S02). */
export function isPriorityGuestIntent(text?: string | null): boolean {
  const t = String(text || '');
  return isVagueProblem(t) || isComplaint(t) || isThanksOnly(t) || isExtensionQuestion(t) || PET_RE.test(t) ||
    PARKING_RE.test(t) || CLEANING_RE.test(t) || isCheckinQuestion(t);
}

function stayNights(b?: BookingRow): number {
  if (!b?.check_in_date || !b?.check_out_date) return 0;
  const n = Math.round((Date.parse(`${b.check_out_date}T12:00:00Z`) - Date.parse(`${b.check_in_date}T12:00:00Z`)) / 86400000);
  return n > 0 ? n : 0;
}

export function answerExtension(question: string, ctx: GuestContext, lang: GuestLang = detectGuestLang(question)): string {
  const booking = ctx.booking as BookingRow | undefined;
  const night = booking?.check_out_date || '';
  if (!ctx.unitId || !booking?.id || !night) return T.extensionNeedBooking(lang);
  if (unitTakenOnDate(ctx.bookings, ctx.unitId, night, booking.id)) return T.extensionTaken(lang, ctx.roomName, night);
  return T.extensionFree(lang, ctx.roomName, night, extensionNightPrice(ctx.unitId, night));
}

/**
 * Units that are OFFICE in the registry but behave as full guest rooms in the guest flow
 * (Ran 2026-10-19 12:03: "המשרד יכול להתנהג כחדר לכל דבר וענין"). Agent-only override;
 * rooms.json / units.js / booking_enabled are unchanged.
 */
export const GUEST_UNIT_OVERRIDES = new Set<string>(['pilot-office']);

/** Late check-out policy (Ran 2026-10-19 12:02). */
export const LATE_CHECKOUT_FEE_PER_HOUR = 125;

const LATE_CHECKOUT_RE =
  /late\s*check[- ]?out|check[- ]?out\s*(?:later|late)|leave\s*later|stay\s*(?:longer|later)|(?:צ['׳"]?ק|צק)[- ]?אאוט\s*(?:\S+\s*)?(?:מאוחר|מאוחרת|יותר מאוחר)|(?:לעזוב|לצאת|לפנות|לעשות\s*צ['׳]?ק[- ]?אאוט)\s*(?:\S+\s*)?(?:מאוחר|יותר מאוחר|מאוחר יותר)|להישאר\s*(?:עוד|יותר|קצת|עד)|להשאר\s*(?:עוד|יותר|קצת|עד)/i;

/** Manager-SMS trigger: HE/EN/RU/AR late check-out phrasing (RU/AR approved by Ran 2026-10-19 13:31). */
export function isLateCheckoutSmsTrigger(text?: string | null): boolean {
  const t = String(text || '');
  return isLateCheckoutQuestion(t);
}

/** RU/AR late check-out phrasing. */
const LATE_CHECKOUT_INTL_RE = kw([
  'поздн\\S* выезд*', 'поздн\\S* чек-?аут', 'выехать позже', 'выехать попозже', 'выселиться позже', 'остаться подольше',
  '(?:ال)?خروج (?:ال)?متأخر', 'تسجيل (?:ال)?خروج (?:ال)?متأخر', 'نطلع متأخر', 'نطلع متاخر', 'نغادر متأخر*', 'نغادر متاخر*', 'نتأخر بالخروج',
]);

/** Bug 3 (Ran 2026-10-20): more EN/RU/AR/HE phrasings, incl. "leave at 1pm" / "выехать в 13:00" / "نطلع الساعة 1". */
const LATE_CHECKOUT_MORE_RE = kw([
  'поздно выехать', 'поздно выезжать', 'выехать поздно', 'выехать попозже', 'поздн\\S* выселени*', 'продлить выезд', 'задержаться',
  'later check-?out', 'check out later', 'checkout later', 'extend (?:the |our )?check-?out', 'late departure', 'leave late',
  '(?:ال)?خروج متأخر', '(?:ال)?خروج متاخر', 'نطلع (?:بعدين|متأخر|متاخر)', 'تأخير (?:ال)?خروج', 'نتأخر',
  'צ[\'׳]?ק[- ]?אאוט מאוחר', 'יציאה מאוחרת', 'לצאת יותר מאוחר', 'לעזוב יותר מאוחר',
]);
const CHECKOUT_VERB_RE = kw([
  'check-?out', 'check out', 'leave', 'depart', 'vacate',
  'выехать', 'выезд*', 'выселиться', 'освободить',
  'نطلع', 'نغادر', 'نخرج', '(?:ال)?خروج', 'نسلم (?:ال)?مفتاح',
  'לצאת', 'לעזוב', 'לפנות', "צ['׳]?ק[- ]?אאוט", 'יציאה',
]);
/** Latest hour mentioned (24h), e.g. "13:00", "1pm", "ב-12", "в 13", "الساعة 1" (1–6 without am/pm → afternoon). */
function mentionedHour(t: string): number | null {
  // A time needs context: "at/until/в/до/ב-/עד/בשעה/الساعة" before it, or ":mm" / am-pm after it ("2 adults" is not a time).
  const m = t.match(/(?:(?:\bat|\buntil|\btill|\bby|\bв|\bдо|ב-?|עד|בשעה|الساعة|ساعة)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?)|(?:(\d{1,2})(?::(\d{2})\s*(am|pm)?|\s*(am|pm|a\.m\.|p\.m\.)))/i);
  if (!m) return null;
  if (!m[1]) { m[1] = m[4]; m[3] = m[6] || m[7]; }
  let h = parseInt(m[1], 10);
  if (Number.isNaN(h) || h > 23) return null;
  const ap = (m[3] || '').toLowerCase();
  if (ap.startsWith('p') && h < 12) h += 12;
  else if (!ap && h >= 1 && h <= 6) h += 12;
  return h;
}

export function isLateCheckoutQuestion(text?: string | null): boolean {
  const t = String(text || '');
  if (EXTENSION_RE.test(t)) return false;
  if (LATE_CHECKOUT_RE.test(t) || LATE_CHECKOUT_INTL_RE.test(t) || LATE_CHECKOUT_MORE_RE.test(t)) return true;
  // "can we check out at 2pm / выехать в 13:00 / نطلع الساعة 1" → after the regular 11:00 check-out.
  if (CHECKOUT_VERB_RE.test(t) && !/\d{1,2}[./]\d{1,2}/.test(t)) {
    const h = mentionedHour(t);
    if (h !== null && h >= 12 && h <= 20) return true;
  }
  return false;
}

function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ddmm(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

/** The day the guest mentioned, if any (today / tomorrow / dd/mm). */
function mentionedDate(q: string, today: string): string | null {
  if (/מחרתיים/.test(q)) return addDays(today, 2);
  if (/מחר|tomorrow/i.test(q)) return addDays(today, 1);
  if (/היום|today/i.test(q)) return today;
  const m = q.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (m) {
    const year = today.slice(0, 4);
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Read-only: is another live booking on the same unit occupying the guest's checkout date? */
export function unitTakenOnDate(bookings: BookingRow[] | undefined, unitId: string, date: string, ownId?: string): boolean {
  return (bookings || []).some((b) =>
    b.unit_id === unitId &&
    b.id !== ownId &&
    !(b as any).deleted_at &&
    b.booking_status !== 'CANCELED' &&
    Boolean(b.check_in_date) &&
    (b.check_in_date as string) <= date &&
    (b.check_out_date || b.check_in_date || '') > date
  ) || (bookings || []).some((b) =>
    b.unit_id === unitId && b.id !== ownId && !(b as any).deleted_at && b.booking_status !== 'CANCELED' && b.check_in_date === date
  );
}

/** 'free' only when a booking is matched and no other live booking occupies the checkout date. */
export function lateCheckoutStatus(ctx: GuestContext): 'free' | 'taken' | 'unknown' {
  const booking = ctx.booking as BookingRow | undefined;
  const checkout = booking?.check_out_date || '';
  if (!ctx.unitId || !booking?.id || !checkout) return 'unknown';
  return unitTakenOnDate(ctx.bookings, ctx.unitId, checkout, booking.id) ? 'taken' : 'free';
}

/** Short Hebrew SMS for the manager. No codes, no phone numbers. */
export function lateCheckoutManagerSms(question: string, ctx: GuestContext): string {
  const booking = ctx.booking as BookingRow;
  const checkout = booking.check_out_date || '';
  const asked = mentionedDate(question, ctx.today || israelToday());
  return `בקשת צ׳ק-אאוט מאוחר: ${booking.guest_name || 'אורח/ת'} · ${ctx.roomName} · צ׳ק-אאוט ${ddmm(checkout)}` +
    (asked && asked !== checkout ? ` (ביקש/ה ל־${ddmm(asked)})` : '') +
    ` · החדר פנוי בתאריך הזה. ממתין לאישורך (גם לשעה הראשונה ללא חיוב; מהשעה השנייה 125 ₪ לשעה).`;
}

export function answerLateCheckout(question: string, ctx: GuestContext): string {
  const lang = detectGuestLang(question);
  const policy = T.lateCheckoutPolicy(lang, LATE_CHECKOUT_FEE_PER_HOUR);
  const booking = ctx.booking as BookingRow | undefined;
  const checkout = booking?.check_out_date || '';
  if (!ctx.unitId || !booking?.id || !checkout) return T.lateCheckoutNeedBooking(lang, policy);
  const today = ctx.today || israelToday();
  const asked = mentionedDate(question, today);
  const dateNote = asked && asked !== checkout ? T.lateCheckoutDateNote(lang, checkout, asked) : '';
  const url = ctx.stayUrl ? `\n\n📱 ${ctx.stayUrl}` : '';
  if (unitTakenOnDate(ctx.bookings, ctx.unitId, checkout, booking.id)) {
    return dateNote + T.lateCheckoutTaken(lang, ctx.roomName, checkout) + url;
  }
  return dateNote + T.lateCheckoutFree(lang, policy) + url;
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
  taj: { ssid: 'lotus', password: '12345678' },
  // Nofim Belavan (k685, k686)
  nofim: { ssid: 'TP-Link_FA30_5G', password: '15107312' },
  // Mool Hanof (k680..k684)
  mool: { ssid: 'Mol_hanof', password: '12345678' },
  // Batei Nurit (k671..k679)
  nurit: { ssid: 'MIALEES RESORT', password: 'Mial2026' },
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
  // Main office / demo room (pilot-office). Confirmed by Ran 2026-10-19; matches guestProfileSeed.js UNIT_OVERRIDES.
  office: { ssid: 'ResortOS_5G', password: '0506102416' },
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
  'hill-1': 'hill', 'hill-2': 'hill', 'hill-3': 'hill', 'hill-4': 'hill',
  'dome-blue': 'kipat', 'dome-green': 'kipat', 'dome-red': 'kipat',
  'pilot-office': 'office',
};

/** Returns null when the unit has no known Wi-Fi. Never invent placeholder credentials. */
export function getWifiForUnit(unitId: string): WifiInfo | null {
  const prop = UNIT_TO_PROPERTY[unitId];
  if (prop && PROPERTY_WIFI[prop]) return PROPERTY_WIFI[prop];
  return null;
}

export const WIFI_NEED_BOOKING_REPLY =
  `📶 אשמח לשלוח לכם את פרטי ה-WiFi של היחידה שלכם!\n` +
  `כדי שאוכל לאתר את ההזמנה, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה 🙏`;

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
  `ℹ️ *צ׳ק-אאוט:*\n` +
  `• שעת צ׳ק-אאוט רשמית: עד 11:00 בבוקר.\n` +
  `• החל מהשעה 08:00 בבוקר ניתן לבצע צ׳ק-אאוט עצמי בלחיצה אחת דרך דף האורח הדיגיטלי שלכם.`;

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
  taj: 'ג׳קוזי ספא, פינת קפה ותה, מנגל ו-Wi-Fi.',
  nofim: 'בריכה פרטית מחוממת, ג׳קוזי ספא, פינת קפה ותה, מנגל.',
  mool: 'ג׳קוזי, מרפסת נוף, פינת קפה ותה, מנגל ו-Wi-Fi.',
  nurit: 'ג׳קוזי ספא, פינת קפה ותה, מנגל ו-Wi-Fi. במתחם יש בריכה וסאונה.',
  toscana: 'ג׳קוזי, מטבחון, פינת קפה ותה, מנגל ו-Wi-Fi. במתחם יש בריכה מחוממת.',
  musical: 'ג׳קוזי פנימי, פינת קפה ותה, מנגל ו-Wi-Fi. במתחם יש בריכה מחוממת.',
  maya: 'ג׳קוזי פנימי, פינת קפה ותה, מנגל ו-Wi-Fi.',
  mialis: 'בריכה פרטית, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מנגל.',
  'casa-nova': 'בריכה פרטית, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מנגל ו-Wi-Fi.',
};

function cabinInsideLine(unitId: string): string | null {
  if (unitId === 'k693' || unitId === 'k695') return 'בריכה פרטית מחוממת, ג׳קוזי פנימי, פינת קפה ותה, מנגל ו-Wi-Fi.';
  if (unitId === 'k694') return 'ג׳קוזי פנימי, בלי בריכה פרטית, פינת קפה ותה, מנגל ו-Wi-Fi.';
  if (unitId === 'k689') return 'סאונה יבשה, ג׳קוזי ספא, מטבחון, פינת קפה ותה, מנגל ו-Wi-Fi.';
  const prop = UNIT_TO_PROPERTY[unitId];
  return (prop && CABIN_INSIDE[prop]) || null;
}

export const ATTRACTIONS_GUIDE =
  `🛶 *אטרקציות וחוויות באזור:*\n` +
  `• *אבוקיאק* (פארק הירדן): שייט קייקים, רפטינג ואבובים בירדן.\n` +
  `• *טיולי ג׳יפים וסוסים:* תיאום טיולי שטח ברמות והגולן עם איסוף מהבקתה.\n` +
  `• *חמת גדר* (כ-45 דק'): מרחצאות מים תרמו-מינרליים, ספא ובריכות.\n` +
  `• *יקב רמת הגולן ויקבי בוטיק:* סיורי יין וטעימות בקצרין וברמת הגולן.`;


function formatBedsAnswer(cfg: any, lang: GuestLang): string {
  const total = cfg.total_beds;
  const d = cfg.double_beds || 0;
  const s = cfg.single_beds || 0;
  const sf = cfg.double_sofa_beds || 0;

  if (lang === 'he') {
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} מיטה זוגית`);
    if (s > 0) parts.push(`${s} מיטות יחיד`);
    if (sf > 0) parts.push(`${sf} ספה נפתחת זוגית`);
    return `בבקתה יש ${total} ${total === 1 ? 'מיטה' : 'מיטות'}: ${parts.join(', ')}.`;
  }
  if (lang === 'en') {
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} double bed${d > 1 ? 's' : ''}`);
    if (s > 0) parts.push(`${s} single bed${s > 1 ? 's' : ''}`);
    if (sf > 0) parts.push(`${sf} double sofa bed${sf > 1 ? 's' : ''}`);
    return `The cabin has ${total} bed${total > 1 ? 's' : ''}: ${parts.join(', ')}.`;
  }
  if (lang === 'ar') {
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} سرير مزدوج`);
    if (s > 0) parts.push(`${s} أسرة مفردة`);
    if (sf > 0) parts.push(`${sf} سرير أريكة مزدوج`);
    return `يوجد في الكوخ ${total} أسرة: ${parts.join(', ')}.`;
  }
  if (lang === 'th') {
    const parts: string[] = [];
    if (d > 0) parts.push(`เตียงคู่ ${d} เตียง`);
    if (s > 0) parts.push(`เตียงเดี่ยว ${s} เตียง`);
    if (sf > 0) parts.push(`โซฟาเบดคู่ ${sf} เตียง`);
    return `ในห้องพักมีเตียงทั้งหมด ${total} เตียง: ${parts.join(', ')}`;
  }
  return `בבקתה יש ${total} מיטות.`;
}

function formatCapacityAnswer(cfg: any, lang: GuestLang): string {
  const cap = cfg.sleeping_places;
  if (lang === 'he') return `בבקתה יש מקומות לינה עבור ${cap} אנשים.`;
  if (lang === 'en') return `The cabin can sleep up to ${cap} people.`;
  if (lang === 'ar') return `الكوخ يتسع لنوم ${cap} أشخاص.`;
  if (lang === 'th') return `ห้องพักนี้สามารถรองรับการนอนได้ ${cap} คน`;
  return `בבקתה יש מקומות לינה עבור ${cap} אנשים.`;
}

function formatAcTvYesAnswer(cfg: any, lang: GuestLang): string {
  const ac = cfg.ac_count;
  const tv = cfg.tv_count;
  if (lang === 'he') return `בבקתה יש ${ac} מזגנים ו-${tv} טלוויזיות עם ממיר YES לכל טלוויזיה.`;
  if (lang === 'en') return `The cabin has ${ac} air conditioning units and ${tv} TV${tv > 1 ? 's' : ''} with YES satellite service.`;
  if (lang === 'ar') return `يوجد في الكوخ ${ac} مكيفات و ${tv} تلفاز مع جهاز استقبال YES.`;
  if (lang === 'th') return `ในห้องพักมีแอร์ ${ac} เครื่อง และทีวี ${tv} เครื่อง พร้อมบริการสัญญาณ YES`;
  return `בבקתה יש ${ac} מזגנים ו-${tv} טלוויזיות.`;
}

function formatSofaAnswer(cfg: any, lang: GuestLang): string {
  const hasSofa = (cfg.double_sofa_beds || 0) > 0;
  if (hasSofa) {
    if (lang === 'he') return 'כן, יש בבקתה ספה נפתחת זוגית.';
    if (lang === 'en') return 'Yes, there is a double sofa bed in the cabin.';
    if (lang === 'ar') return 'نعم، يوجد في الكوخ سرير أريكة مزدوج قابل للفتح.';
    if (lang === 'th') return 'ใช่ครับ มีโซฟาเบดคู่ในห้องพัก';
    return 'כן, יש בבקתה ספה נפתחת זוגית.';
  } else {
    if (lang === 'he') return 'לא, אין בבקתה ספה נפתחת.';
    if (lang === 'en') return 'No, there is no sofa bed in the cabin.';
    if (lang === 'ar') return 'لا، لا يوجد سرير أريكة في الكوخ.';
    if (lang === 'th') return 'ไม่มีโซฟาเบดในห้องพักครับ';
    return 'לא, אין בבקתה ספה נפתחת.';
  }
}

function formatSaunaAnswer(cfg: any, lang: GuestLang): string {
  const hasSauna = cfg.private_sauna === true || cfg.private_sauna === 'true';
  const noSauna = cfg.private_sauna === false || cfg.private_sauna === 'false';
  if (hasSauna) {
    if (lang === 'he') return 'כן, יש סאונה יבשה פרטית בבקתה.';
    if (lang === 'en') return 'Yes, there is a private sauna in the cabin.';
    if (lang === 'ar') return 'نعم، توجد ساونا خاصة في الكوخ.';
    if (lang === 'th') return 'ใช่ครับ มีห้องซาวน่าส่วนตัวในห้องพัก';
    return 'כן, יש סאונה יבשה פרטית בבקתה.';
  } else if (noSauna) {
    if (lang === 'he') return 'לא, אין סאונה פרטית בבקתה זו.';
    if (lang === 'en') return 'No, there is no private sauna in this cabin.';
    if (lang === 'ar') return 'لا، لا توجد ساونا خاصة في هذا الكوخ.';
    if (lang === 'th') return 'ไม่มีห้องซาวน่าส่วนตัวในห้องพักนี้ครับ';
    return 'לא, אין סאונה פרטית בבקתה זו.';
  } else {
    if (lang === 'he') return 'סאונה פרטית אינה מאומתת בבקתה זו כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
    if (lang === 'en') return 'A private sauna is not currently confirmed for this cabin. We will check with the team to confirm.';
    if (lang === 'ar') return 'الساونا الخاصة غير مؤكدة حالياً في هذا الكوخ. يمكننا أن نتأكد من ذلك مع الفريق.';
    if (lang === 'th') return 'ห้องซาวน่าส่วนตัวยังไม่ได้รับการยืนยันสำหรับห้องพักนี้ ทางเรายินดีช่วยตรวจสอบกับทีมงานเพื่อยืนยันให้ครับ';
    return 'סאונה פרטית אינה מאומתת בבקתה זו כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
  }
}

function formatOutdoorJacuzziAnswer(cfg: any, lang: GuestLang): string {
  const hasOutdoor = cfg.complex_outdoor_jacuzzi === true || cfg.complex_outdoor_jacuzzi === 'true';
  const noOutdoor = cfg.complex_outdoor_jacuzzi === false || cfg.complex_outdoor_jacuzzi === 'false';
  if (hasOutdoor) {
    if (lang === 'he') return 'כן, במתחם יש ג׳קוזי חיצוני.';
    if (lang === 'en') return 'Yes, there is an outdoor jacuzzi in the complex.';
    if (lang === 'ar') return 'نعم، يوجد جاكوزي خارجي في المجمع.';
    if (lang === 'th') return 'ใช่ครับ มีอ่างจากุซซี่กลางแจ้งในบริเวณที่พัก';
    return 'כן, במתחם יש ג׳קוזי חיצוני.';
  } else if (noOutdoor) {
    if (lang === 'he') return 'לא, אין ג׳קוזי חיצוני במתחם זה.';
    if (lang === 'en') return 'No, there is no outdoor jacuzzi in this complex.';
    if (lang === 'ar') return 'لا، لا يوجد جاكوزي خارجي في هذا المجمع.';
    if (lang === 'th') return 'ไม่มีอ่างจากุซซี่กลางแจ้งในบริเวณที่พักนี้ครับ';
    return 'לא, אין ג׳קוזי חיצוני במתחם זה.';
  } else {
    if (lang === 'he') return 'מידע על ג׳קוזי חיצוני במתחם אינו מאומת כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
    if (lang === 'en') return 'Information about an outdoor jacuzzi is not currently confirmed. We will check with the team to confirm.';
    if (lang === 'ar') return 'معلومات الجاكوزي الخارجي غير مؤكدة حالياً. سنقوم بالتحقق مع الفريق للتأكد.';
    if (lang === 'th') return 'ข้อมูลเกี่ยวกับอ่างจากุซซี่กลางแจ้งยังไม่ได้รับการยืนยัน ทางเรายินดีช่วยตรวจสอบกับทีมงานเพื่อยืนยันให้ครับ';
    return 'מידע על ג׳קוזי חיצוני במתחם אינו מאומת כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
  }
}

function formatIndoorJacuzziAnswer(cfg: any, lang: GuestLang): string {
  const hasIndoor = cfg.indoor_jacuzzi === true || cfg.indoor_jacuzzi === 'true';
  const noIndoor = cfg.indoor_jacuzzi === false || cfg.indoor_jacuzzi === 'false';
  if (hasIndoor) {
    if (lang === 'he') return 'כן, יש ג׳קוזי פנימי בבקתה.';
    if (lang === 'en') return 'Yes, there is an indoor jacuzzi in the cabin.';
    if (lang === 'ar') return 'نعم، يوجد جاكوزي داخلي في الكوخ.';
    if (lang === 'th') return 'ใช่ครับ มีอ่างจากุซซี่ในห้องพัก';
    return 'כן, יש ג׳קוזי פנימי בבקתה.';
  } else if (noIndoor) {
    if (lang === 'he') return 'לא, אין ג׳קוזי פנימי בבקתה זו.';
    if (lang === 'en') return 'No, there is no indoor jacuzzi in this cabin.';
    if (lang === 'ar') return 'لا، لا يوجد جاكوزي داخلي في هذا الكوخ.';
    if (lang === 'th') return 'ไม่มีอ่างจากุซซี่ในห้องพักนี้ครับ';
    return 'לא, אין ג׳קוזי פנימי בבקתה זו.';
  } else {
    if (lang === 'he') return 'מידע על ג׳קוזי פנימי אינו מאומת כרגע בבקתה זו. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
    if (lang === 'en') return 'Information about an indoor jacuzzi is not currently confirmed for this cabin. We will check with the team to confirm.';
    if (lang === 'ar') return 'معلومات الجاكوزي الداخلي غير مؤكدة حالياً في هذا الكوخ. سنقوم بالتحقق مع الفريق للتأكد.';
    if (lang === 'th') return 'ข้อมูลเกี่ยวกับอ่างจากุซซี่ในห้องพักยังไม่ได้รับการยืนยัน ทางเรายินดีช่วยตรวจสอบกับทีมงานเพื่อยืนยันให้ครับ';
    return 'מידע על ג׳קוזי פנימי אינו מאומת כרגע בבקתה זו. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
  }
}

function formatUnknownAnswer(lang: GuestLang): string {
  if (lang === 'he') return 'פריט זה אינו מאומת בבקתה כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
  if (lang === 'en') return 'This item is not currently confirmed in the cabin. We will check with the team to confirm.';
  if (lang === 'ar') return 'هذا العنصر غير مؤكد حالياً في الكوخ. يمكننا أن نتأكد من ذلك مع الفريق.';
  if (lang === 'th') return 'รายการนี้ยังไม่ได้รับการยืนยันในห้องพักในขณะนี้ ทางเรายินดีช่วยตรวจสอบกับทีมงานเพื่อยืนยันให้อีกครั้งครับ';
  return 'פריט זה אינו מאומת בבקתה כרגע. נשמח לבדוק ולוודא זאת עבורכם מול הצוות.';
}

function formatUnknownConfig(lang: GuestLang): string {
  if (lang === 'he') return 'פרטי תצורת המיטות והציוד עבור חדר זה אינם מאומתים במערכת כרגע. נשמח לבדוק ולוודא זאת מול צוות השירות.';
  if (lang === 'en') return 'Room configuration details for this cabin are not currently confirmed in the system. We will gladly check with our team to confirm.';
  if (lang === 'ar') return 'تفاصيل تجهيزات الغرفة غير مؤكدة حالياً في النظام. سنكون سعداء بالتحقق من الفريق للتأكد.';
  if (lang === 'th') return 'รายละเอียดห้องพักยังไม่ได้รับการยืนยันในระบบ ทางเรายินดีช่วยตรวจสอบกับทีมงานเพื่อยืนยันให้อีกครั้งครับ';
  return 'פרטי תצורת המיטות והציוד עבור חדר זה אינם מאומתים במערכת כרגע.';
}

export type InfoKind =
  | 'beds'
  | 'capacity'
  | 'ac_tv'
  | 'sofa'
  | 'sauna'
  | 'outdoor_jacuzzi'
  | 'indoor_jacuzzi'
  | 'unknown_amenity'
  | 'checkin'
  | 'checkout'
  | 'wifi'
  | 'lockbox'
  | 'gate'
  | 'jacuzzi'
  | 'parking'
  | 'pets'
  | 'cleaning';

/** Order used when one message asks several things. Cleaning (ends with a call-back offer) goes last. */
const INFO_ORDER: InfoKind[] = [
  'beds',
  'capacity',
  'ac_tv',
  'sofa',
  'sauna',
  'outdoor_jacuzzi',
  'indoor_jacuzzi',
  'unknown_amenity',
  'checkin',
  'checkout',
  'wifi',
  'lockbox',
  'gate',
  'jacuzzi',
  'parking',
  'pets',
  'cleaning',
];

export function infoKinds(question: string): InfoKind[] {
  const q = String(question || '').toLowerCase().trim();

  const isUnknown = /מייבש שיער|עריסה|מיטת תינוק|מגהץ|פלטת שבת|פלטה של שבת|מיחם|מכונת אספרסו|אספרסו|קפסול|מכונת כביסה|מדיח|hairdryer|hair dryer|baby crib|crib|iron|espresso|washing machine|dishwasher|مكواة|غسالة|جلاية|ไดร์เป่าผม/i.test(q);
  const isSofa = /ספה נפתחת|ספה|סלון נפתח|sofa bed|couch|pull-out|كنبة سرير|سرير أريكة|โซฟาเบด/i.test(q);
  const hasBedCountOrType = /כמה מיטות|איזה מיטות|איזה סוג|how many beds|type of bed|كم سرير|ما نوعها|เตียงกี่เตียง|แบบไหน/i.test(q);
  const hitBeds = hasBedCountOrType || (!isSofa && /(?:כמה|איזה|אילו|פירוט|מספר)\s+(?:ה?מיטות|ה?מיטה)|(?:ה?מיטות|ה?מיטה)\s+(?:שיש|בחדר|בבקתה|ביחידה)|how many beds|beds?\s+count/i.test(q));
  const hitCap = /כמה.*ישנים|כמה.*לישון|אנשים.*ישנ|אנשים.*לישון|תפוסה|מקומות שינה|how many.*sleep|can sleep|people.*sleep|we are \d+ people|كم شخص.*النوم|كم شخص.*ينام|يتسع|นอนได้กี่คน|พักได้กี่คน/i.test(q);
  const hitAcTv = /מזגן|מזגנים|טלוויז|טלוויזיות|air condition|tvs?|\byes\b|ממיר|مكيف|تلفاز|แอร์|ทีวี/i.test(q);
  const hitSauna = /סאונה|sauna|ساونا|ซาวน่า/i.test(q);
  const hitSofa = isSofa && (!hasBedCountOrType || /is there a sofa|האם יש ספה|יש ספה/i.test(q));

  const isOutdoorJacuzzi =
    /(?:outdoor|outside|in the complex|of the complex|complex).*(?:jacuzzi|hot tub)|(?:jacuzzi|hot tub).*(?:outdoor|outside|in the complex|of the complex|complex)|ג['׳]?קוזי.*(?:בחוץ|חיצוני|במתחם|של המתחם)|(?:בחוץ|חיצוני|במתחם|של המתחם).*ג['׳]?קוזי|جاكوزي.*(?:خارجي|في المجمع)|(?:خارجي|في المجمع).*جاكوزي|อ่างจากุซซี่.*กลางแจ้ง|กลางแจ้ง.*อ่างจากุซซี่/i.test(q);

  const isIndoorJacuzzi =
    !isOutdoorJacuzzi &&
    (/(?:indoor|inside|in the room|in our room|in the cabin|in our cabin|in room|in cabin).*(?:jacuzzi|hot tub)|(?:jacuzzi|hot tub).*(?:indoor|inside|in the room|in our room|in the cabin|in our cabin|in room|in cabin)|ג['׳]?קוזי.*(?:בחדר|בבקתה|פנימי)|(?:בחדר|בבקתה|פנימי).*ג['׳]?קוזי|جاكوزي.*(?:في الغرفة|في الكوخ|داخلي)|(?:في الغرفة|في الكوخ|داخلي).*جاكوزي|อ่างจากุซซี่.*(?:ในห้อง|ในห้องพัก)|(?:ในห้อง|ในห้องพัก).*อ่างจากุซซี่/i.test(q)
     || /^(?:is there a|do you have a|does it have a|does our (?:cabin|room) have a)\s+(?:jacuzzi|hot tub)\??$/i.test(q)
     || /^(?:האם יש|יש)\s+ג['׳]?קוזי\??$/i.test(q)
     || /^(?:هل يوجد|يوجد)\s+جاكوزي\??$/i.test(q)
     || /^มีอ่างจากุซซี่ไหม\??$/i.test(q));

  const isJacuzziGuide = !isOutdoorJacuzzi && !isIndoorJacuzzi && JACUZZI_RE.test(q);

  const hit: Record<InfoKind, boolean> = {
    beds: hitBeds,
    capacity: hitCap,
    ac_tv: hitAcTv,
    sofa: hitSofa,
    sauna: hitSauna,
    outdoor_jacuzzi: isOutdoorJacuzzi,
    indoor_jacuzzi: isIndoorJacuzzi,
    unknown_amenity: isUnknown,
    checkin: isCheckinQuestion(question),
    checkout: CHECKOUT_RE.test(q),
    wifi: WIFI_RE.test(q),
    lockbox: LOCKBOX_RE.test(q) || /תכספת/.test(q),
    gate: GATE_RE.test(q),
    jacuzzi: isJacuzziGuide,
    parking: PARKING_RE.test(q),
    pets: PET_RE.test(q),
    cleaning: CLEANING_RE.test(q),
  };
  return INFO_ORDER.filter((k) => hit[k]);
}

/** One informational answer. Adds the guest-page link only when ctx.stayUrl is set. */
function answerInfoKind(kind: InfoKind, q: string, question: string, ctx: GuestContext, lang: GuestLang, matched: boolean): string | null {
  switch (kind) {
    case 'beds': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatBedsAnswer(cfg, lang);
    }
    case 'capacity': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatCapacityAnswer(cfg, lang);
    }
    case 'ac_tv': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatAcTvYesAnswer(cfg, lang);
    }
    case 'sofa': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatSofaAnswer(cfg, lang);
    }
    case 'sauna': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatSaunaAnswer(cfg, lang);
    }
    case 'outdoor_jacuzzi': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatOutdoorJacuzziAnswer(cfg, lang);
    }
    case 'indoor_jacuzzi': {
      const cfg = ROOM_CONFIGURATIONS[ctx.unitId];
      if (!cfg) return formatUnknownConfig(lang);
      return formatIndoorJacuzziAnswer(cfg, lang);
    }
    case 'unknown_amenity': {
      return formatUnknownAnswer(lang);
    }
    case 'wifi': {
      // No booking matched: ask for the booking phone. Matched but unit has no known Wi-Fi: null → existing fallback.
      if (!ctx.unitId) return lang === 'he' ? WIFI_NEED_BOOKING_REPLY : T.wifiNeedBooking(lang);
      const prop = UNIT_TO_PROPERTY[ctx.unitId];
      if (prop === 'hill' || prop === 'kipat') {
        if (lang !== 'he') return 'Currently there is no Wi-Fi / internet connection at this complex.';
        return `📶 במתחם ${ctx.roomName} (גבעת יואב) אין חיבור לאינטרנט / Wi-Fi כרגע.`;
      }
      const wifi = getWifiForUnit(ctx.unitId);
      if (!wifi) return null;
      if (lang !== 'he') return T.wifi(lang, ctx.roomName, wifi.ssid, wifi.password, ctx.stayUrl);
      let reply = `📶 *פרטי ה-WiFi עבור ${ctx.roomName}:*\n` +
        `• *שם רשת (SSID):* ${wifi.ssid}\n` +
        `• *סיסמה:* ${wifi.password}\n\n` +
        `גלישה נעימה!`;
      if (ctx.stayUrl) reply += `\n\n📱 כל המידע זמין גם בדף האורח שלכם:\n${ctx.stayUrl}`;
      return reply;
    }
    case 'jacuzzi': {
      let reply = JACUZZI_GUIDE;
      if (ctx.stayUrl) reply += `\n\n📱 לצפייה במדריך המאויר בדף האורח:\n${ctx.stayUrl}`;
      return reply;
    }
    case 'gate': {
      // Ran 2026-10-19 12:47: the gate code goes only to an identified guest (sender matched to a booking).
      if (!matched && !ctx.isStaff) return T.gateNeedBooking(lang);
      if (lang !== 'he') return T.gate(lang, GATE_CODE, ctx.stayUrl);
      let reply = GATE_GUIDE;
      if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
      return reply;
    }
    case 'lockbox': {
      const isGuestOverride = GUEST_UNIT_OVERRIDES.has(ctx.unitId) && matched;
      if (!isGuestOverride && (ctx.room?.usage === 'STAFF_ACCOMMODATION' || ctx.room?.usage === 'OFFICE' || ctx.unitId === 'k678' || ctx.unitId === 'k679' || ctx.unitId === 'pilot-office')) {
        if (lang !== 'he') return T.lockboxOperational(lang, ctx.roomName, matched);
        if (matched) {
          return `מרחב זה (${ctx.roomName}) הינו אזור תפעולי ואינו יחידת אירוח אורחים. כדי שנסדר לכם את פרטי הכניסה, כתבו כאן "תתקשרו אליי" ונחזור אליכם בהקדם 📞`;
        }
        return `מרחב זה (${ctx.roomName}) הינו אזור תפעולי ואינו יחידת אירוח אורחים. לקבלת פרטי הכניסה לבקתת האירוח שלכם, אנא כתבו לנו את שם המזמין המלא.`;
      }
      const lockbox = ctx.room?.lockbox || 'לא מוגדר';
      if (lang !== 'he') return T.lockbox(lang, ctx.roomName, ctx.room?.lockbox || '—', ctx.stayUrl);
      let reply = `🔑 *קוד כספת המפתח של ${ctx.roomName}:* *${lockbox}*\n\n` +
        `*הוראות פתיחה:*\n` +
        `1. הזינו את הקוד: *${lockbox}* בגלגלות.\n` +
        `2. לחצו על מתג הפתיחה ומשכו את מכסה הכספת כלפי מטה.\n` +
        `3. הוציאו את המפתח.\n` +
        `4. ערבלו את הגלגלות וסגרו את המכסה.`;
      if (ctx.stayUrl) reply += `\n\n📱 ${ctx.stayUrl}`;
      return reply;
    }
    case 'checkin': {
      // S02. Upcoming stay → time + arrival date + "we'll send entry details". Ongoing stay → just the time.
      const b = ctx.booking as BookingRow | undefined;
      const today = ctx.today || israelToday();
      const upcoming = Boolean(b?.check_in_date && b.check_in_date >= today);
      const ongoing = Boolean(b?.check_in_date && b.check_in_date < today && (b.check_out_date || '') >= today);
      return T.checkin(lang, upcoming ? b!.check_in_date! : undefined, ctx.stayUrl, ongoing);
    }
    case 'checkout': {
      // Check-out answers never mention check-in (Ran 2026-10-19).
      if (lang !== 'he') return T.checkout(lang, ctx.stayUrl);
      let reply = CHECKOUT_GUIDE;
      if (ctx.stayUrl) reply += `\n\n📱 לצ׳ק-אאוט עצמי בדף האורח:\n${ctx.stayUrl}`;
      return reply;
    }
    // S13 parking (Ran: every complex has parking adjacent to the complex)
    case 'parking': return T.parking(lang, ctx.stayUrl);
    // S18 dogs (Ran: allowed everywhere, +100 ₪ per dog per night)
    case 'pets': return T.pets(lang, DOG_FEE_PER_NIGHT, matched ? stayNights(ctx.booking as BookingRow) : 0);
    // S07 mid-stay cleaning (Ran: free for every stay). No staff dispatch; the call-back offer arranges the time.
    case 'cleaning': return matched ? T.cleaning(lang) : null;
  }
  return null;
}

/**
 * Intelligent deterministic matching for fast responses,
 * with context attachment and stay URL link.
 */
export function answerGuestQuestion(question: string, ctx: GuestContext): string | null {
  const q = question.toLowerCase().trim();

  // 0. Late check-out (before the generic checkout FAQ). Never confirms; manager approval required.
  if (isLateCheckoutQuestion(question)) {
    return answerLateCheckout(question, ctx);
  }

  const lang = detectGuestLang(question);
  const matched = Boolean((ctx.booking as BookingRow | undefined)?.id);

  // 0a. Extension (S15): availability for the night after the booking + price-list rate. Never changes the booking.
  if (isExtensionQuestion(question)) {
    return answerExtension(question, ctx, lang);
  }

  // 0b. Vague problem (S10) → ask what happened; complaint (S09) → empathy + manager call-back offer.
  if (isVagueProblem(question)) return matched ? T.vagueProblem(lang, ctx.guestName) : null;
  if (isComplaint(question)) return matched ? T.complaint(lang, ctx.guestName) : null;

  // 0c. Fault reports take priority over amenity FAQs (S05).
  if (isFaultReport(question)) {
    return faultReply(question, ctx);
  }

  // 0d. Thanks / compliments (S20): short warm reply, no call-back offer. Only for identified guests.
  if (isThanksOnly(question)) return matched ? T.thanks(lang, ctx.guestName) : null;

  // Staff accommodation & retired units inquiries
  if (/נורית\s*[78]|נופש\s*[78]|k678|k679/i.test(q) || (/בקתה\s*[78]\b/i.test(q) && /נורית|נופש/i.test(q))) {
    return `יחידות 7 ו-8 במתחם בתי נורית משמשות למגורי צוות ועובדים ואינן זמינות להזמנה. בקתות האירוח לאורחים במתחם הן בקתות 1 עד 6. נשמח לעזור בבדיקת זמינותן! 🌿`;
  }
  if (/סייסטה|k618|k619|k620|k621|k622|k623/i.test(q)) {
    return `מתחם סייסטה אינו מנוהל עוד במערכת. נשמח להציע לכם מגוון בקתות וסוויטות יוקרתיות במתחמים הפעילים שלנו במושב רמות וסביב הכנרת! 🌿`;
  }

  // 1–5d. Informational intents. One intent → its own answer (unchanged). Two or more → one combined reply,
  // in a fixed order, with a single guest-page link at the end (Ran QA 13:26). Gate code still identified-only.
  const kinds = infoKinds(question);
  if (kinds.length === 1) return answerInfoKind(kinds[0], q, question, ctx, lang, matched);
  if (kinds.length > 1) {
    const noLink: GuestContext = { ...ctx, stayUrl: undefined };
    const parts = kinds
      .map((k) => answerInfoKind(k, q, question, noLink, lang, matched))
      .filter((x): x is string => Boolean(x));
    if (parts.length) {
      return parts.join('\n\n') + guestLink(ctx.stayUrl, lang);
    }
    return null;
  }

  // 6. Food / Restaurants
  if (FOOD_RE.test(q)) {
    let reply = FOOD_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 פרטי מסעדות וניווט Waze זמינים בדף האורח שלכם:\n${ctx.stayUrl}`;
    return reply;
  }

  // 7. Supermarket / Grocery / Gas
  if (GROCERY_RE.test(q) || FUEL_RE.test(q)) {
    let reply = SHOPS_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 מיקומים וניווט Waze בדף האורח שלכם:\n${ctx.stayUrl}`;
    return reply;
  }

  // 8. Nature / Springs / Trails / Beaches
  if (NATURE_RE.test(q)) {
    let reply = NATURE_GUIDE;
    if (ctx.stayUrl) reply += `\n\n📱 פרטי הגעה וניווט Waze לכל האתרים בדף האורח:\n${ctx.stayUrl}`;
    return reply;
  }

  // 9. Attractions / Activities
  if (ATTRACTIONS_RE.test(q)) {
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

  // 10. Payment & Invoice inquiries (Restricted strictly to the guest's own booking)
  if (/(?<![\p{L}])(?:האם\s+שולם|שולם|שולמה|שולמו|תשלום|תשלומים|לשלם|שילמתי|שילמו|שילם|מחיר|כמה עולה|כמה לשלם|עלות|סכום|יתרה|חוב|חשבונית|קבלה|payment|price|money|cost|balance|fee)(?![\p{L}])/iu.test(q) ||
    (lang !== 'he' && PAYMENT_INTL_RE.test(q))) {
    // Check if inquiring about another room / complex / general hotel finances
    const matchOwnRoom = Boolean((ctx.roomName && q.includes(ctx.roomName.toLowerCase())) ||
      (ctx.room?.name && q.includes(ctx.room.name.toLowerCase())));
    const mentionsOtherRoom = /בקתה\s*\d+|חדר\s*\d+|סוויטה\s*\d+|נורית|טאג|מול הנוף|טוסקנה|מוסיקלית|סייסטה/i.test(q) && !matchOwnRoom;

    if (mentionsOtherRoom) {
      if (lang !== 'he') return T.paymentOtherGuest(lang);
      return '🔒 פרטי הזמנות, תשלומים ומחירים של אורחים אחרים הינם חסויים לחלוטין ואינם ניתנים לשיתוף.';
    }

    if (ctx.booking && ctx.booking.id) {
      const isPaid = ctx.booking.payment_status === 'PAID';
      if (lang !== 'he') {
        const total = ctx.booking.total_price_agorot ? Math.round(ctx.booking.total_price_agorot / 100) : undefined;
        const deposit = total && ctx.booking.deposit_agorot != null ? Math.round(ctx.booking.deposit_agorot / 100) : undefined;
        return T.payment(lang, { room: ctx.roomName, paid: isPaid, totalIls: total, depositIls: deposit, balanceIls: total && deposit !== undefined ? Math.max(0, total - deposit) : undefined, url: ctx.stayUrl });
      }
      const statusText = isPaid ? 'ההזמנה שלכם שולמה במלואה ✅' : 'קיימת יתרה לתשלום עבור שהותכם ⏳';
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

    if (lang !== 'he') return T.paymentNoBooking(lang);
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
  if (/תקלה|לא עובד|לא מחמם|שבור|דולף|נתקע/.test(String(question || '')) || isFaultReport(question) || /ما بيشتغل|لا يعمل|مش شغال|تسريب|عطل/.test(String(question || ''))) return null;
  // Guest-only intents (booking-bound) never answer staff.
  if (isExtensionQuestion(question) || CLEANING_RE.test(question) || isComplaint(question) || isVagueProblem(question) || isThanksOnly(question)) return null;
  if (staffPlaceNeedsRoom(question) && !ctx.unitId) return null;
  const reply = answerGuestQuestion(question, {
    booking: { id: '', unit_id: ctx.unitId || '' } as BookingRow,
    room: ctx.room || undefined,
    unitId: ctx.unitId || '',
    roomName: ctx.roomName || 'הבקתה',
    isStaff: true,
  });
  if (!reply || /^(?:💳|🔒|לבירור פרטי תשלום)/.test(reply)) return null;
  return reply;
}
