import type { RoomEntry } from '../config.js';
import type { BookingRow, UnitRow } from '../integration/resortos.js';

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
  const outBooking = roomBookings.find((b) => b.check_out_date === today);
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
  if (status === 'IN_PROGRESS') return 'בניקיון 🟡';
  if (status === 'DIRTY') return 'ממתין לניקיון 🔴';
  if (status === 'MAINTENANCE_ALERT') return 'תקלת תחזוקה ⚠️';
  return 'לא ידוע ⚪';
}

/**
 * Format concise 4-line initial card for manager upon scanning room QR or querying room:
 * 1. Room label (e.g. נופים בלבן 1 (B1))
 * 2. Lockbox code
 * 3. Cleaning status
 * 4. Occupancy status
 */
export function formatManagerInitialCard(
  roomLabel: string,
  lockbox: string,
  unit: UnitRow | undefined,
  occupancy: RoomOccupancyInfo,
  room?: RoomEntry
): string {
  const cleaningLabel = getCleaningStatusLabel(unit?.operational_status, unit?.custom_reason);
  let card = `📋 *${roomLabel}*\n`;
  if (room?.usage === 'STAFF_ACCOMMODATION' || room?.id === 'k678' || room?.id === 'k679') {
    card += `🏷️ ייעוד: *מגורי עובדים (סגור לאורחים)*\n`;
  } else if (room?.usage === 'OFFICE' || room?.id === 'pilot-office') {
    card += `🏷️ ייעוד: *משרד ראשי*\n`;
  }
  card += `🔑 קוד כספת: *${lockbox}*\n` +
    `🧹 סטטוס ניקיון: ${cleaningLabel}\n` +
    `👥 סטטוס תפוסה: ${occupancy.statusSummary}`;
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
  const stayUrl = b.checkout_token ? `https://resortos.app/stay/${b.checkout_token}` : '';

  return `👥 *${headerTitle} (${roomLabel}):*\n` +
    `• *שם אורח:* ${b.guest_name || 'ללא שם'}\n` +
    `• *טלפון:* ${b.guest_phone || 'ללא טלפון'}\n` +
    `• *תאריכים:* ${b.check_in_date || ''} ⬅️ ${b.check_out_date || ''}\n` +
    `• *הרכב:* ${pax}\n` +
    `• *תשלום:* ${payment}` +
    (stayUrl ? `\n• *דף אורח:* ${stayUrl}` : '');
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

  // 0. Usage / Classification inquiry
  if (/ייעוד|סוג חדר|מגורי עובדים|עובדים|צוות|משרד/i.test(q)) {
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

  // 3. Who is in the room / guest details / occupancy inquiry
  if (/מי בחדר|מי האורח|איזה אורח|מי שוהה|פרטי אורח|מי נמצא/i.test(q)) {
    const b = occupancy.stayingBooking || occupancy.inBooking || occupancy.outBooking;
    if (b) {
      const phase = b === occupancy.inBooking
        ? "צ'ק-אין היום"
        : b === occupancy.outBooking
        ? "צ'ק-אאוט היום"
        : "שוהה כעת";
      return formatBookingDetails(b, `אורח בחדר (${phase})`, roomLabel);
    }
    return `החדר *${roomLabel}* פנוי כעת ואין אורח רשום להיום.`;
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

  return null;
}
