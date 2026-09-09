export const MOTZASH = 'motzash';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function notesFromResviewHtml(html) {
  const text = stripHtml(html);
  const match = text.match(/הערות\s+(.+?)(?:\s+שולם|\s+לחייב|\s+מקדמה|\s+תנאי הזמנה|\s+חוקי המתחם|$)/);
  return match ? match[1].trim() : '';
}

function clockFromMatch(match) {
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2] || 0);
  if (!Number.isFinite(hour) || hour < 6 || hour > 22) return '';
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseStayHoursFromNotes(notes) {
  const text = String(notes || '');
  let checkout = '';
  let checkin = '';
  if (/יציאה.{0,24}מוצ["״׳']?ש|יציאה\s*מוצאש/.test(text)) {
    checkout = MOTZASH;
  } else {
    const out = text.match(/יציאה\s*:?\s*(?:ב(?:שעה)?\s*)?(\d{1,2})(?::(\d{2}))?/);
    checkout = clockFromMatch(out);
  }
  const inn = text.match(/(?:כניסה|הגעה)\s*:?\s*(?:ב(?:שעה)?\s*)?(\d{1,2})(?::(\d{2}))?/);
  checkin = clockFromMatch(inn);
  return { checkout, checkin };
}

export function formatStayHourLabel(value) {
  const raw = String(value || '').trim();
  if (raw === MOTZASH || raw === 'מוצש' || raw === 'מוצ״ש') return 'מוצ״ש';
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hour, minute] = raw.split(':');
    return `${String(Number(hour)).padStart(2, '0')}:${minute}`;
  }
  return '';
}

export function stayHoursFromBooking(booking) {
  const extra = String(booking?.special_requests || '');
  const checkout = String(booking?.checkout_time || (extra.match(/\|out:([^|]+)/) || [])[1] || '').trim();
  const checkin = String(booking?.checkin_time || (extra.match(/\|in:([^|]+)/) || [])[1] || '').trim();
  return { checkout, checkin };
}

export function appendStayHoursToken(base, hours = {}) {
  let next = String(base || '').replace(/\|out:[^|]*/g, '').replace(/\|in:[^|]*/g, '');
  if (hours.checkout) next += `|out:${hours.checkout}`;
  if (hours.checkin) next += `|in:${hours.checkin}`;
  return next;
}
