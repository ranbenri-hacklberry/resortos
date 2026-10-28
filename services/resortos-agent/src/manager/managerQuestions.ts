import { stayUrlOf } from './guestLink.js';
import { COMPLEXES, type ComplexDefinition } from './managerFuzzyMatcher.js';
import { readFileSync } from 'node:fs';
import type { RoomEntry } from '../config.js';
import type { BookingRow, UnitRow } from '../integration/resortos.js';
import { getWifiForUnit } from '../guest/guestKnowledge.js';

let ROOM_CONFIGURATIONS: Record<string, any> = {};
try {
  ROOM_CONFIGURATIONS = JSON.parse(readFileSync(new URL('../../data/room_configurations.json', import.meta.url), 'utf8'));
} catch {
  ROOM_CONFIGURATIONS = {};
}

export interface RoomOccupancyInfo {
  inBooking?: BookingRow;
  outBooking?: BookingRow;
  stayingBooking?: BookingRow;
  activeBooking?: BookingRow;
  statusSummary: string;
}

export function getRoomOccupancy(roomId: string, bookings: BookingRow[], today: string): RoomOccupancyInfo {
  const roomBookings = bookings.filter(
    (b) => b.unit_id === roomId && !b.deleted_at && b.booking_status !== 'CANCELED'
  );

  const inBooking = roomBookings.find((b) => b.check_in_date === today);
  const outBooking = roomBookings.find((b) => b.check_out_date === today && b.id !== inBooking?.id);
  const stayingBooking = roomBookings.find(
    (b) => today > (b.check_in_date || '') && today < (b.check_out_date || '')
  );

  let statusSummary = 'פנוי ⚪';
  if (inBooking && outBooking) {
    statusSummary = `תחלופה היום (יוצא: ${outBooking.guest_name || 'ללא שם'}, נכנס: ${inBooking.guest_name || 'ללא שם'})`;
  } else if (inBooking) {
    statusSummary = `כניסה היום (${inBooking.guest_name || 'ללא שם'})`;
  } else if (stayingBooking) {
    statusSummary = `שוהה כעת (${stayingBooking.guest_name || 'ללא שם'})`;
  } else if (outBooking) {
    statusSummary = `יציאה היום (${outBooking.guest_name || 'ללא שם'})`;
  }

  const activeBooking = inBooking || stayingBooking || outBooking;

  return {
    inBooking,
    outBooking,
    stayingBooking,
    activeBooking,
    statusSummary,
  };
}

export function getCleaningStatusLabel(status?: string | null, customReason?: string | null): string {
  if (status === 'READY') {
    if (customReason === 'ממתין לביקורת מנהל' || customReason?.includes('ביקורת') || customReason?.includes('בדיקה')) {
      return 'ממתין לביקורת מנהל 🔍';
    }
    return 'מוכן לאורח 🟢';
  }
  if (status === 'IN_PROGRESS') return 'בנקיון 🟡';
  if (status === 'DIRTY') return 'ממתין לניקיון 🔴';
  if (status === 'MAINTENANCE_ALERT') return 'תקלת תחזוקה ⚠️';
  return 'לא ידוע ⚪';
}

/** Bug B (Ran 2026-10-20): one short status for a unit-list line, e.g. "בשהייה". Empty when unknown. */
export function unitShortStatus(unit: UnitRow | undefined, occupancy: RoomOccupancyInfo): string {
  if (occupancy.outBooking) return occupancy.inBooking ? 'צ׳ק אאוט + צ׳ק אין היום' : 'צ׳ק אאוט היום';
  if (occupancy.stayingBooking) return 'בשהייה';
  const cleaning = getCleaningStatusLabel(unit?.operational_status, unit?.custom_reason);
  const clean = cleaning.startsWith('לא ידוע') ? '' : cleaning;
  if (occupancy.inBooking) return clean ? `צ׳ק אין היום · ${clean}` : 'צ׳ק אין היום';
  return clean;
}

/** Ran 2026-10-22: vacant-room status from the real ResortOS operational_status values. */
export function roomStatusLabel(unit: UnitRow | undefined): string {
  const st = unit?.operational_status;
  const reason = unit?.custom_reason || '';
  if (st === 'OUT_OF_ORDER' || st === 'CLOSED' || st === 'UNAVAILABLE' || st === 'BLOCKED') return 'לא זמין ⛔';
  if (st === 'MAINTENANCE_ALERT') return 'תקלה ⚠️';
  if (st === 'GARDENING') return 'עבודת גינון 🌿';
  if (st === 'IN_PROGRESS') return `בנקיון 🟡${unit?.assigned_staff ? ` | ${unit.assigned_staff}` : ''}`;
  if (st === 'NEEDS_COMPLETIONS' || (st === 'READY' && /ביקורת|בדיקה/.test(reason))) return 'ממתין לבדיקה 🔍';
  if (st === 'READY') return 'מוכן לאורח 🟢';
  if (st === 'DIRTY') return 'ממתין לניקיון 🔴';
  return st ? `${st} ❔` : 'לא ידוע ❔';
}

function guestLabel(booking?: BookingRow): string {
  return booking?.guest_name || 'ללא שם';
}

/**
 * Room card after a scan or a room question.
 * A vacant room shows the cleaning mark (ready, dirty, inspection).
 * A guest in the room replaces that mark: checkout and check-in for today only.
 */
export function formatManagerInitialCard(
  roomLabel: string,
  lockbox: string,
  unit: UnitRow | undefined,
  occupancy: RoomOccupancyInfo,
  room?: RoomEntry
): string {
  let card = `📋 *${roomLabel}*\n`;


  if (room?.usage === 'STAFF_ACCOMMODATION' || room?.id === 'k678' || room?.id === 'k679') {
    card += `🏷️ ייעוד: *מגורי עובדים (סגור לאורחים)*\n`;
  } else if (room?.usage === 'OFFICE' || room?.id === 'pilot-office') {
    card += `🏷️ ייעוד: *משרד ראשי*\n`;
  }
  card += `🔑 קוד כספת: *${lockbox}*\n`;

  // Ran 2026-10-22: one "סטטוס:" line. Precedence: occupied → unavailable / fault → cleaning flow. Unknown → raw value.
  const staffOcc = (unit as any)?.staff_occupancy;
  const occupiedBooking = occupancy.stayingBooking
    || (staffOcc === 'OCCUPIED' ? (occupancy.inBooking || occupancy.outBooking) : undefined)
    || (occupancy.outBooking && staffOcc !== 'VACANT' ? occupancy.outBooking : undefined);
  const occupied = staffOcc === 'OCCUPIED' || Boolean(occupancy.stayingBooking) || Boolean(occupancy.outBooking && staffOcc !== 'VACANT');
  const status = occupied
    ? `🏠 מאוכלס${occupiedBooking ? ` (${guestLabel(occupiedBooking)})` : ''}`
    : roomStatusLabel(unit);
  card += `סטטוס: ${status}\n`;

  if (occupancy.outBooking) {
    card += `🟠 צ׳ק אאוט היום (${guestLabel(occupancy.outBooking)})\n`;
  } else if (occupied) {
    card += `אין יציאה היום\n`;
  }
  if (occupancy.inBooking && occupiedBooking !== occupancy.inBooking) {
    card += `🟢 צ׳ק אין היום (${guestLabel(occupancy.inBooking)})`;
  } else if (occupied && !occupancy.inBooking) {
    card += 'אין כניסה היום';
  }
  card = card.replace(/\n$/, '');
  if (unit?.operational_status === 'READY' && (unit?.custom_reason === 'ממתין לביקורת מנהל' || unit?.custom_reason?.includes('ביקורת'))) {
    card += `\n\n💡 _לאישור החדר לאחר בדיקה, השב: *מוכן*_`;
  }
  return card;
}

function formatPayment(b: BookingRow): string {
  if (b.payment_status === 'PAID') return 'שולם במלואו ✅';
  if (b.payment_status === 'PENDING') return 'ממתין לתשלום ⏳';
  if (b.payment_status) return b.payment_status;
  return 'לא שולם ⚠️';
}

function formatPax(b: BookingRow): string {
  const adults = b.adults_count ?? 2;
  const children = b.children_count ? `, ${b.children_count} ילדים` : '';
  return `${adults} מבוגרים${children}`;
}

function formatBookingDetails(b: BookingRow, headerTitle: string, roomLabel: string): string {
  const pax = formatPax(b);
  const payment = formatPayment(b);
  const stayUrl = stayUrlOf(b);

  return `👥 *${headerTitle} (${roomLabel}):*\n` +
    `• *שם אורח:* ${b.guest_name || 'ללא שם'}\n` +
    `• *טלפון:* ${b.guest_phone || 'ללא טלפון'}\n` +
    `• *תאריכים:* ${b.check_in_date || ''} ⬅️ ${b.check_out_date || ''}\n` +
    `• *הרכב:* ${pax}\n` +
    `• *תשלום:* ${payment}` +
    (stayUrl ? `\n• *דף אורח:* ${stayUrl}` : '');
}

function shortDate(iso?: string | null): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}/${Number(match[2])}` : '';
}

function nightCount(b: BookingRow): string {
  const start = String(b.check_in_date || '').slice(0, 10);
  const end = String(b.check_out_date || '').slice(0, 10);
  if (!start || !end) return '';
  const nights = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(nights) || nights <= 0) return '';
  return nights === 1 ? 'לילה' : `${nights} לילות`;
}

function phoneOf(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return 'אין טלפון';
  if (digits.startsWith('972') && digits.length >= 11) return `0${digits.slice(3)}`;
  return digits;
}

function shekels(agorot: number): string {
  const amount = Math.round(agorot) / 100;
  return `₪${amount.toLocaleString('he-IL', { maximumFractionDigits: amount % 1 ? 2 : 0 })}`;
}

function paidAgorot(b: BookingRow): number {
  const rows = Array.isArray(b.clearing_payments) ? b.clearing_payments as Array<{ amount_agorot?: number }> : [];
  const clearing = rows.reduce((sum, row) => sum + (Number(row?.amount_agorot) || 0), 0);
  if (b.payment_status === 'PAID') return Math.max(Number(b.total_price_agorot) || 0, clearing);
  return clearing;
}

function moneyLine(b: BookingRow): string {
  const notes = String(b.special_requests || '');
  const channel = String(b.channel_source || '').toLowerCase();
  const email = String(b.guest_email || '');
  const total = Number(b.total_price_agorot) || 0;
  if (b.payment_mode === 'VOUCHER' || /\|pay:voucher\b/.test(notes)) return 'שובר';
  if (
    channel.includes('booking')
    || /\|pay:booking\b/.test(notes)
    || /@guest\.booking\.com\b/i.test(email)
  ) {
    return total ? `בוקינג · ${shekels(total)} · לא נגבה אצלנו` : 'בוקינג · לא נגבה אצלנו';
  }
  const paid = paidAgorot(b);
  if (!total && !paid) return 'אין סכום רשום';
  const due = Math.max(0, total - paid);
  if (due > 0) return `${shekels(total)} · שולם ${shekels(paid)} · יתרה ${shekels(due)}`;
  return `${shekels(total || paid)} · שולם`;
}

function guestNote(b: BookingRow): string {
  return String(b.special_requests || '')
    .replace(/kinorot:\d+/g, '')
    .replace(/\|pax:\d+\+\d+\+\d+/g, '')
    .replace(/\|pay:[a-z_]+/gi, '')
    .replace(/\|(?:in|out):[^|]*/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function guestBlock(b: BookingRow, phase: string): string {
  const stay = [shortDate(b.check_in_date), shortDate(b.check_out_date)].filter(Boolean).join(' → ');
  const stayLine = [stay, nightCount(b), formatPax(b)].filter(Boolean).join(' · ');
  const note = guestNote(b);
  return [
    `*${phase}*`,
    `• ${b.guest_name || 'ללא שם'}`,
    `• ${phoneOf(b.guest_phone)}`,
    stayLine ? `• ${stayLine}` : '',
    `• ${moneyLine(b)}`,
    note ? `• ${note}` : '',
  ].filter(Boolean).join('\n');
}

/** What a manager gets after a room card when they ask for the customer. */
export function formatGuestDetails(roomLabel: string, occupancy: RoomOccupancyInfo): string {
  const blocks: string[] = [];
  const seen = new Set<string>();
  const add = (b: BookingRow | null | undefined, phase: string) => {
    if (!b || seen.has(b.id)) return;
    seen.add(b.id);
    blocks.push(guestBlock(b, phase));
  };
  add(occupancy.outBooking, 'יוצא היום');
  add(occupancy.inBooking, 'נכנס היום');
  add(occupancy.stayingBooking, 'בשהייה');
  if (!blocks.length) return `אין לקוח רשום על *${roomLabel}* להיום.`;
  return `👤 *פרטי לקוח · ${roomLabel}*\n\n${blocks.join('\n\n')}`;
}

function asksForGuestDetails(question: string): boolean {
  return /פרטי\s*(?:ה)?(?:לקוח|אורח)|מי\s*(?:ה)?לקוח|שם\s*(?:ה)?לקוח|טלפון\s*(?:של\s*)?(?:ה)?(?:לקוח|אורח)|(?:^|\s)לקוח(?:\s|$)|מי בחדר|מי האורח|איזה אורח|מי שוהה|מי נמצא/i.test(question);
}

/**
 * Answers questions asked by a manager in the context of a room.
 */
export function answerManagerRoomQuestion(
  question: string,
  roomLabel: string,
  lockbox: string,
  unit: UnitRow | undefined,
  occupancy: RoomOccupancyInfo,
  room?: RoomEntry
): string | null {
  const q = question.toLowerCase().trim();

  // 0. Usage / Classification inquiry (only when explicitly asking about classification, not bare "משרד")
  if (/ייעוד|סוג חדר|מגורי עובדים|(?:מה|איזה)\s+.*(?:עובדים|צוות|משרד)/i.test(q) && !/^(?:ה)?משרד(?:\s+ראשי)?$/i.test(q)) {
    if (room?.usage === 'STAFF_ACCOMMODATION' || room?.id === 'k678' || room?.id === 'k679') {
      return `🏠 חדר *${roomLabel}* מוגדר כ*מגורי עובדים* וסגור להזמנות אורחים. נגיש מלא למנהל, לתחזוקה, לבקרת אקלים ולניקיון.`;
    }
    if (room?.usage === 'OFFICE' || room?.id === 'pilot-office') {
      return `🏢 מרחב *${roomLabel}* מוגדר כ*משרד ראשי* ומיועד לתפעול, בקרה וציוד.`;
    }
    return `🏡 חדר *${roomLabel}* מוגדר כ*יחידת אירוח אורחים* פעילה.`;
  }

  // 1. Who is checking in today?
  if (/מי נכנס|כניס|מי מגיע|מי בא|צ['׳]?ק[- ]?אין להיום|הגעה/i.test(q) && !/יצא|עוזב|פינוי|צ['׳]?ק[- ]?אאוט/i.test(q)) {
    if (occupancy.inBooking) {
      return formatBookingDetails(occupancy.inBooking, 'פרטי כניסה היום', roomLabel);
    }
    return `אין כניסה מתוכננת להיום בחדר *${roomLabel}*.`;
  }

  // 2. Who is checking out today?
  if (/מי יצא|מי עוזב|מי עזב|יציא|עזיב|פינוי|צ['׳]?ק[- ]?אאוט/i.test(q)) {
    if (occupancy.outBooking) {
      return formatBookingDetails(occupancy.outBooking, 'פרטי יציאה היום', roomLabel);
    }
    return `אין עזיבה מתוכננת להיום מחדר *${roomLabel}*.`;
  }

  // 3. Customer file for the room already on screen.
  if (asksForGuestDetails(q)) {
    return formatGuestDetails(roomLabel, occupancy);
  }

  // 4. Payment status & financial details (Manager only)
  if (/(?:^|[^\u0590-\u05FF])(?:האם\s+שולם|שולם|שולמה|שולמו|תשלום|תשלומים|לשלם|שילמתי|שילמו|שילם|מחיר|כמה עולה|כמה לשלם|עלות|סכום|יתרה|חוב|חשבונית|קבלה|payment|price|money|cost|balance|fee)(?:[^\u0590-\u05FF]|$)/i.test(q)) {
    const b = occupancy.activeBooking;
    if (b) {
      let breakdown = `💳 *סטטוס תשלום ומידע פיננסי עבור חדר ${roomLabel}:*\n` +
        `• אורח: *${b.guest_name || 'ללא שם'}*\n` +
        `• מצב: *${formatPayment(b)}*`;
      if (b.total_price_agorot) {
        const total = Math.round(b.total_price_agorot / 100);
        breakdown += `\n• סה״כ הזמנה: *₪${total.toLocaleString('he-IL')}*`;
        if (b.deposit_agorot !== undefined && b.deposit_agorot !== null) {
          const deposit = Math.round(b.deposit_agorot / 100);
          const balance = Math.max(0, total - deposit);
          breakdown += `\n• שולם / מקדמה: *₪${deposit.toLocaleString('he-IL')}*`;
          if (b.payment_status !== 'PAID' && balance > 0) {
            breakdown += `\n• יתרה לתשלום: *₪${balance.toLocaleString('he-IL')}*`;
          }
        }
      }
      return breakdown;
    }
    return `אין הזמנה פעילה עבור חדר *${roomLabel}*.`;
  }

  // 5. Pax / Guest composition
  if (/כמה אנשים|כמה אורחים|הרכב|ילדים|מבוגרים/i.test(q)) {
    const b = occupancy.activeBooking;
    if (b) {
      return `👨‍👩‍👧 *הרכב אורחים בחדר ${roomLabel}:*\n` +
        `• אורח: *${b.guest_name || 'ללא שם'}*\n` +
        `• הרכב: *${formatPax(b)}*`;
    }
    return `אין אורח רשום להיום בחדר *${roomLabel}*.`;
  }

  // 6. Arrival hour / Checkin time
  if (/שעת הגעה|מתי מגיע|מתי נכנס|שעת כניסה/i.test(q)) {
    let reply = `🕒 *שעת צ'ק-אין רשמית היא החל מ-15:00.*`;
    if (occupancy.inBooking) {
      reply += `\n• אורח נכנס: *${occupancy.inBooking.guest_name || 'ללא שם'}* (${occupancy.inBooking.guest_phone || 'ללא טלפון'})`;
    }
    return reply;
  }

  // 7. Departure hour / Checkout time
  if (/שעת עזיבה|מתי יוצא|מתי עוזב|שעת פינוי|שעת יציאה/i.test(q)) {
    let reply = `🕚 *שעת צ'ק-אאוט רשמית היא עד 11:00 בבוקר.*`;
    if (occupancy.outBooking) {
      reply += `\n• אורח יוצא: *${occupancy.outBooking.guest_name || 'ללא שם'}* (${occupancy.outBooking.guest_phone || 'ללא טלפון'})`;
    }
    return reply;
  }

  // 8. Cleaner / Assigned staff
  if (/מי מנקה|איזה מנקה|עובד|עובדת|מנקה משויך/i.test(q)) {
    const staff = unit?.assigned_staff || 'לא משויך עדיין';
    let reply = `🧹 *צוות ניקיון עבור חדר ${roomLabel}:*\n• מנקה: *${staff}*`;
    if (unit?.cleaning_started_at) {
      reply += `\n• התחלת ניקיון: ${unit.cleaning_started_at}`;
    }
    return reply;
  }

  // 9. Notes inquiry
  if (/הער[הו]ת/i.test(q)) {
    const unitNote = unit?.custom_reason;
    if (unitNote) {
      return `📝 *הערות עבור חדר ${roomLabel}:*\n"${unitNote}"`;
    }
    return `אין הערות רשומות עבור חדר *${roomLabel}*.`;
  }

  // 10. Lockbox code query
  if (/כספת|קוד כספת|קוד מפתח/i.test(q)) {
    return `🔑 קוד כספת מפתח עבור *${roomLabel}* הוא: *${lockbox}*`;
  }

  // 11. Equipment Standard query
  if (/תקן ציוד|תקן חדר|מה התקן|ציוד תקני/i.test(q)) {
    const cfg = ROOM_CONFIGURATIONS[unit?.id || room?.id || ''];
    const isFamily = Boolean(cfg?.sleeping_places && cfg.sleeping_places > 2);
    const std = isFamily ? 'משפחה (עד 6 אורחים)' : 'זוגי (2 אורחים)';
    return `📋 *תקן ציוד עבור חדר ${roomLabel} (${std}):*\n` +
      `• כלי מטבח: צלחות גדולות (${isFamily ? 6 : 2}), כוסות (${isFamily ? 6 : 2}), מאגים (${isFamily ? 6 : 2}), כוסות יין (${isFamily ? 6 : 2}), סכו״ם מלא (${isFamily ? 6 : 2})${isFamily ? ', קעריות קטנות (4)' : ''}, סיר (1), מחבת (1).\n` +
      `• מוצרי חשמל: מקרר, מיקרוגל, קומקום, כיריים חשמליות, מכונת אספרסו (יעד תקן).\n` +
      `• פלטת שבת / מיחם: לפי דרישה מראש בלבד (אינם קבועים בבקתה).\n` +
      `• עמדת קפה: נס קפה (${isFamily ? 6 : 4}), קפה שחור (${isFamily ? 6 : 4}), תה רגיל (${isFamily ? 6 : 4}), תה מסאלה (${isFamily ? 6 : 4}), סוכר וממתיק (${isFamily ? 12 : 8}), מלחייה ופלפלייה.\n` +
      `• מגבות: 2 מגבות גוף/בריכה + מגבת פנים לכל אורח.\n` +
      `• טואלטיקה: שמפו, סבון גוף, קרם גוף, סבון מוצק (כמות = אורחים × לילות), נייר טואלט (מינימום 3).`;
  }

  // 12. Room Shortages query
  if (/מה חסר|חוסרים|חסר בחדר/i.test(q)) {
    return `🔍 *בדיקת חוסרים עבור חדר ${roomLabel}:*\n` +
      `• מכונת אספרסו: סטטוס אימות נדרש (יעד תקן: 1 לבקתה).\n` +
      `• שקיות אשפה רזרבה: יעד תקן חדש (2 גדולות + 2 קטנות).\n` +
      `• מסננת מטבח וקערת ערבוב: ברשימת רכש תפעולית (כמויות TBD).\n` +
      `• לדיווח חוסר ספציפי או השלמה בחדר, סמנו בלוח התפעול או עדכנו בהערת חדר.`;
  }

  // 13. Preparation quantities for booking
  if (/כמה להכין|כמה מגבות|כמה קפסולות|כמה מצעים/i.test(q)) {
    const b = occupancy.activeBooking;
    const adults = Math.max(0, Number(b?.adults_count) || 2);
    const children = Math.max(0, Number(b?.children_count) || 0);
    const guests = Math.max(1, adults + children);
    const totalTowels = guests * 2;
    const faceTowels = guests;
    return `🧺 *הכנה לשהות (${guests} אורחים בחדר ${roomLabel}):*\n` +
      `• מגבות: ${totalTowels} מגבות גוף/בריכה ו-${faceTowels} מגבות פנים.\n` +
      `• קפסולות אספרסו: 4 יח׳ (אם מותקנת מכונת אספרסו מאומתת בחדר בלבד).\n` +
      `• טואלטיקה: בקבוקון שמפו, סבון, קרם וסבון מוצק לאדם ללילה.`;
  }

  return null;
}

export function matchComplex(text: string): ComplexDefinition | null {
  const norm = String(text || '').toLowerCase();
  for (const c of COMPLEXES) {
    if (norm.includes(c.officialName.toLowerCase())) return c;
    for (const nick of c.nicknames) {
      if (new RegExp(`(?:^|[\\s.,?!למבכשל\\-])${nick}(?:$|[\\s.,?!])`, 'i').test(norm)) {
        return c;
      }
    }
  }
  return null;
}

export function extractDateRange(text: string, today: string): { from: string; to: string; label: string } | null {
  const str = String(text || '').toLowerCase();

  // 1. Full date range like 23/10 - 24/10 or 23.10 - 24.10
  const fullRangeMatch = str.match(/(\d{1,2})[\/.](\d{1,2})\s*[-–]\s*(\d{1,2})[\/.](\d{1,2})/);
  if (fullRangeMatch) {
    const d1 = parseInt(fullRangeMatch[1], 10);
    const m1 = parseInt(fullRangeMatch[2], 10);
    const d2 = parseInt(fullRangeMatch[3], 10);
    const m2 = parseInt(fullRangeMatch[4], 10);
    const year = parseInt(today.slice(0, 4), 10);
    const from = `${year}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    const to = `${year}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
    return { from, to, label: `${d1}/${m1}-${d2}/${m2}` };
  }

  // 2. Day-range with single month like 23-24/10 or 23-24.10 or (23-24/10)
  const rangeMatch = str.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/);
  if (rangeMatch) {
    const d1 = parseInt(rangeMatch[1], 10);
    const d2 = parseInt(rangeMatch[2], 10);
    const month = parseInt(rangeMatch[3], 10);
    const year = rangeMatch[4] ? (rangeMatch[4].length === 2 ? 2000 + parseInt(rangeMatch[4], 10) : parseInt(rangeMatch[4], 10)) : parseInt(today.slice(0, 4), 10);
    const mStr = String(month).padStart(2, '0');
    const from = `${year}-${mStr}-${String(d1).padStart(2, '0')}`;
    const to = `${year}-${mStr}-${String(d2).padStart(2, '0')}`;
    return { from, to, label: `${d1}-${d2}/${month}` };
  }

  // 3. Single date like 23/10 or 23.10
  const singleDateMatch = str.match(/(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/);
  if (singleDateMatch) {
    const d = parseInt(singleDateMatch[1], 10);
    const m = parseInt(singleDateMatch[2], 10);
    const year = singleDateMatch[3] ? (singleDateMatch[3].length === 2 ? 2000 + parseInt(singleDateMatch[3], 10) : parseInt(singleDateMatch[3], 10)) : parseInt(today.slice(0, 4), 10);
    const from = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { from, to: from, label: `${d}/${m}` };
  }

  // 4. Weekend (סופ״ש / סופש / סוף שבוע / weekend)
  if (/סופ״ש|סופש|סוף שבוע|weekend/i.test(str)) {
    const curr = new Date(`${today}T12:00:00Z`);
    const dayOfWeek = curr.getUTCDay(); // 0 = Sun, ..., 5 = Fri, 6 = Sat
    let diffToFri = (5 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 6) diffToFri = -1; // today is Saturday -> weekend is Fri-Sat
    const fri = new Date(curr);
    fri.setUTCDate(curr.getUTCDate() + diffToFri);
    const sat = new Date(fri);
    sat.setUTCDate(fri.getUTCDate() + 1);
    const from = fri.toISOString().slice(0, 10);
    const to = sat.toISOString().slice(0, 10);
    const d1 = fri.getUTCDate();
    const d2 = sat.getUTCDate();
    const m = fri.getUTCMonth() + 1;
    return { from, to, label: `${d1}-${d2}/${m}` };
  }

  // 5. Today / Tomorrow
  if (/היום/i.test(str)) {
    return { from: today, to: today, label: 'היום' };
  }
  if (/מחר/i.test(str)) {
    const curr = new Date(`${today}T12:00:00Z`);
    curr.setUTCDate(curr.getUTCDate() + 1);
    const tom = curr.toISOString().slice(0, 10);
    return { from: tom, to: tom, label: 'מחר' };
  }

  return null;
}

export function isComplexCheckinsQuestion(question: string): boolean {
  const q = String(question || '').toLowerCase();
  if (!matchComplex(q)) return false;
  // Must ask for plural check-ins OR check-ins with weekend/date range/all rooms
  const hasPluralCheckins = /כניסות/i.test(q);
  const hasWeekendOrDate = /סופ״ש|סופש|סוף שבוע|weekend|\d{1,2}[-–\/.]\d{1,2}/i.test(q);
  const hasAllRooms = /לכל חדר|בכל חדר|כל החדרים|לפי חדר/i.test(q);
  return (hasPluralCheckins && (hasWeekendOrDate || hasAllRooms || !/מי נכנס/i.test(q))) ||
         (hasWeekendOrDate && /כניס|מי מגיע|מי נכנס/i.test(q));
}

export function answerComplexCheckinsQuestion(
  question: string,
  allRooms: RoomEntry[],
  bookings: BookingRow[],
  today: string
): string | null {
  const q = String(question || '').toLowerCase().trim();
  const isCheckin = /כניס(?:ה|ות|ים)|מי\s+(?:נכנס|מגיע|בא)(?:ים)?|צ['׳]?ק[- ]?אין|arrivals?|check-?ins?/i.test(q);
  if (!isCheckin) return null;

  const complex = matchComplex(q);
  if (!complex) return null;

  const dateRange = extractDateRange(q, today);
  if (!dateRange) return null;

  const complexRooms = allRooms
    .filter((r) => complex.roomIds.includes(r.id) && r.usage !== 'STAFF_ACCOMMODATION' && r.usage !== 'OFFICE')
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'he', { numeric: true }));

  if (complexRooms.length === 0) return null;

  const lines: string[] = [];
  for (const r of complexRooms) {
    const unitBookings = bookings.filter(
      (b) =>
        b.unit_id === r.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        b.check_in_date &&
        b.check_in_date >= dateRange.from &&
        b.check_in_date <= dateRange.to
    );

    if (unitBookings.length === 0) {
      lines.push(`• ${r.name}: אין כניסה`);
    } else {
      const bDesc = unitBookings
        .map((b) => {
          const inDate = shortDate(b.check_in_date);
          const nights = nightCount(b) || 'לילה 1';
          let guests = 'לא ידוע';
          const hasHeadcount =
            (b.adults_count != null && b.adults_count > 0) ||
            (b.children_count != null && b.children_count > 0);
          if (hasHeadcount) {
            const total = (b.adults_count || 0) + (b.children_count || 0);
            guests = total === 1 ? 'אורח 1' : `${total} אורחים`;
          }
          return `כניסה ${inDate}, ${nights}, ${guests}`;
        })
        .join('; ');
      lines.push(`• ${r.name}: ${bDesc}`);
    }
  }

  return `📋 *כניסות ב${complex.officialName} (${dateRange.label}):*\n${lines.join('\n')}`;
}

/** Manager menu option 6 (Ran 2026-10-22): WiFi of the room on screen only. Never invents credentials. */
export function formatRoomWifi(roomLabel: string, unitId?: string | null): string {
  const w = unitId ? getWifiForUnit(unitId) : null;
  if (!w) return `📶 אין אצלי פרטי וויפי שמורים ל*${roomLabel}*.`;
  return `📶 *פרטי רשת WiFi · ${roomLabel}*\n• רשת: *${w.ssid}*\n• סיסמה: *${w.password}*`;
}

/** Words that pick menu option 5 / 6 while a room is on screen. */
export function roomMenuPick(text: string): 'guest' | 'wifi' | null {
  const t = String(text || '').trim();
  if (/^5\.?$/.test(t)) return 'guest';
  if (/^6\.?$/.test(t)) return 'wifi';
  if (/^(?:ה)?(?:וויפי|ווייפי|ויפי|וייפי|wi-?fi|ไวไฟ|วายฟาย)\??$|פרטי\s*(?:ה)?רשת|סיסמ[אה]\s*(?:ל|של\s*)?(?:ה)?(?:רשת|וויפי|ויפי|wi-?fi|אינטרנט)|(?:מה|מה ה)\s*(?:וויפי|ויפי|wi-?fi)|רשת\s*wi-?fi/i.test(t)) return 'wifi';
  return null;
}

/** Ran 2026-10-28 ("כולם"): manager answered "על איזה מתחם?" with all complexes. */
export function isAllComplexesReply(text: string): boolean {
  return /^\s*(?:ב?כולם|ה?כל|ב?כל\s+ה?מתחמים|ב?כל\s+ה?מקומות|את\s+כולם)\s*[.!?]*\s*$/.test(String(text || ''));
}

export function answerAllComplexesCheckins(
  question: string,
  allRooms: RoomEntry[],
  bookings: BookingRow[],
  today: string
): string | null {
  const parts: string[] = [];
  for (const c of COMPLEXES) {
    const a = answerComplexCheckinsQuestion(`${question} ${c.officialName}`, allRooms, bookings, today);
    if (a) parts.push(a);
  }
  return parts.length ? parts.join('\n\n') : null;
}
