import { israelToday } from './cabinAccess.js';
import { guestStayUrl } from './guestStayUrl.js';

export const CHECKOUT_STATUSES = ['staying', 'self_departed', 'auto_departed', 'overdue'];
export const WIFI_PRESENCE = ['active', 'idle', 'disconnected'];

export const GUEST_SMS_TEMPLATES = [
  {
    id: 'gate',
    label: 'קוד לשער',
    build: ({ gateCode } = {}) => (
      gateCode
        ? `שלום! קוד השער לכניסה לרכב: ${gateCode}. נסיעה בטוחה.`
        : 'שלום! אנא פנו אלינו לקבלת קוד השער לכניסת הרכב.'
    )
  },
  {
    id: 'late_checkout',
    label: 'צ׳ק-אאוט מאוחר',
    build: () => 'שלום! אפשר לתאם צ׳ק-אאוט מאוחר דרך דף האירוח שלכם. נשמח לעזור.'
  },
  {
    id: 'cleaning',
    label: 'הודעת ניקיון',
    build: ({ unitName } = {}) => (
      `שלום! צוות הניקיון יגיע ל-${unitName || 'הבקתה'} לאחר העזיבה. תודה מראש על סגירת הדלת.`
    )
  },
  {
    id: 'checkout_reminder',
    label: 'תזכורת צ׳ק-אאוט',
    build: ({ unitName, checkoutUrl } = {}) => (
      `בוקר טוב! היום יום העזיבה מ-${unitName || 'הבקתה'}. `
      + 'החל מ-08:00 אפשר לסמן צ׳ק-אאוט בדף החדר (קישור):\n'
      + (checkoutUrl || '')
    )
  },
  {
    id: 'farewell',
    label: 'סמס פרידה',
    build: ({ unitName } = {}) => (
      `תודה שהתארחתם אצלנו${unitName ? ` ב-${unitName}` : ''}! `
      + 'נסיעה טובה ובטוחה הביתה. נשמח לראותכם שוב.'
    )
  }
];

/** Israel wall-clock hour 0–23. */
export function israelHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hour12: false
    }).formatToParts(now).find((part) => part.type === 'hour')?.value || 0
  );
}

export function israelMinute(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      minute: '2-digit'
    }).formatToParts(now).find((part) => part.type === 'minute')?.value || 0
  );
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return israelToday(d);
}

export function effectiveCheckoutDate(booking, stay = booking?.stay) {
  const out = booking?.check_out_date;
  if (!out) return null;
  if (stay?.late_until === '11:00+1' || stay?.late_until === 'next') return addDaysIso(out, 1);
  return out;
}

/** Self-checkout CTA is active from 08:00 Israel on departure day. */
export function selfCheckoutWindow(booking, stay = booking?.stay, now = new Date()) {
  const day = effectiveCheckoutDate(booking, stay);
  const today = israelToday(now);
  if (!day) return { open: false, reason: 'no_date', day: null };
  if (today < day) return { open: false, reason: 'before_day', day };
  if (today > day) return { open: true, reason: 'past_day', day };
  if (israelHour(now) < 8) return { open: false, reason: 'before_0800', day };
  return { open: true, reason: 'ok', day };
}

export function firstNameOnly(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0];
}

/** Derive staff-facing presence badge from booking + optional wifi field. */
export function guestPresenceBadge(booking, now = new Date()) {
  const stay = booking?.stay || {};
  const status = String(booking?.checkout_status || '').toLowerCase();
  const wifi = String(booking?.wifi_presence_status || stay.wifi_presence_status || 'active').toLowerCase();
  const selfAt = booking?.checked_out_at || stay.self_checked_out_at;
  const autoAt = stay.auto_checked_out_at || stay.manager_checked_out_at;

  if (status === 'self_departed' || selfAt) {
    return { key: 'self_departed', label: 'צ׳ק-אאוט עצמי', color: '#38BDF8', tone: 'blue' };
  }
  if (status === 'auto_departed' || autoAt || booking?.booking_status === 'CHECKED_OUT') {
    return { key: 'auto_departed', label: 'עזב', color: '#94A3B8', tone: 'muted' };
  }

  const day = effectiveCheckoutDate(booking, stay);
  const today = israelToday(now);
  const overdue = Boolean(
    day
    && today >= day
    && israelHour(now) >= 11
    && booking?.booking_status !== 'CHECKED_OUT'
    && !selfAt
  );
  if (status === 'overdue' || overdue) {
    return { key: 'overdue', label: 'חריגה', color: '#F87171', tone: 'red' };
  }
  if (wifi === 'disconnected' || wifi === 'idle') {
    return {
      key: wifi,
      label: wifi === 'disconnected' ? 'עזיבה שקטה' : 'לא פעיל',
      color: '#FBBF24',
      tone: 'orange'
    };
  }
  if (booking?.booking_status === 'CHECKED_IN') {
    return { key: 'active', label: 'בבקתה', color: '#4ADE80', tone: 'green' };
  }
  return { key: 'staying', label: 'בשהייה', color: '#4ADE80', tone: 'green' };
}

export function resolveCheckoutStatus(booking, now = new Date()) {
  const stay = booking?.stay || {};
  if (stay.self_checked_out_at || booking?.checkout_status === 'self_departed') return 'self_departed';
  if (stay.auto_checked_out_at || stay.manager_checked_out_at || booking?.checkout_status === 'auto_departed') {
    return 'auto_departed';
  }
  if (booking?.booking_status === 'CHECKED_OUT') return 'auto_departed';
  const badge = guestPresenceBadge(booking, now);
  if (badge.key === 'overdue') return 'overdue';
  return 'staying';
}

export function checkoutReminderSms({ unitName, token }) {
  const tpl = GUEST_SMS_TEMPLATES.find((row) => row.id === 'checkout_reminder');
  return tpl.build({
    unitName,
    checkoutUrl: token ? guestStayUrl(token) : ''
  });
}

export function farewellSms({ unitName }) {
  return GUEST_SMS_TEMPLATES.find((row) => row.id === 'farewell').build({ unitName });
}

/** Skip 09:45 reminder when wifi says quietly left for ≥30 minutes. */
export function shouldSkipCheckoutReminder(booking, now = new Date()) {
  if (booking?.checked_out_at || booking?.stay?.self_checked_out_at) return true;
  if (booking?.booking_status === 'CHECKED_OUT') return true;
  const wifi = String(booking?.wifi_presence_status || booking?.stay?.wifi_presence_status || '');
  if (wifi !== 'disconnected') return false;
  const since = booking?.stay?.wifi_disconnected_at || booking?.metadata?.wifi_disconnected_at;
  if (!since) return true;
  const ms = now.getTime() - new Date(since).getTime();
  return Number.isFinite(ms) && ms >= 30 * 60 * 1000;
}

export function templateById(id) {
  return GUEST_SMS_TEMPLATES.find((row) => row.id === id) || null;
}
