import { israelToday } from './cabinAccess';
import { bookingGuestCounts } from './dailyDutyReport';
import { lockboxCodeForUnit } from './guestProfileSeed';
import { stayYmd } from './calendarOccupancy';
import { hideHousekeepingTaskWhileOccupied, isAwaitingManagerInspect } from './unitStatus';
import { unitFullName, visibleInventory } from './units';

export const FIELD_STAFF_PATHS = new Set(['/staff', '/ops']);
export const FIELD_STAFF_HOSTS = new Set(['ops.resortos.app', 'ops.resortos.co.il']);

export function isFieldStaffPath(pathname = typeof window === 'undefined' ? '' : window.location.pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  return FIELD_STAFF_PATHS.has(path);
}

export function isFieldOpsHost(hostname = typeof window === 'undefined' ? '' : window.location.hostname) {
  const host = String(hostname || '').toLowerCase();
  return FIELD_STAFF_HOSTS.has(host) || host.startsWith('ops.') || host.endsWith('.trycloudflare.com');
}

export function isFieldStaffMode(pathname, hostname) {
  return isFieldStaffPath(pathname) || isFieldOpsHost(hostname);
}

export const FAULT_CHIPS = [
  { key: 'FIELD_CHIP_AC', value: 'מזגן לא מקרר' },
  { key: 'FIELD_CHIP_BULB', value: 'נורה שרופה' },
  { key: 'FIELD_CHIP_LEAK', value: 'נזילה' },
  { key: 'FIELD_CHIP_JACUZZI', value: 'ג׳קוזי' },
  { key: 'FIELD_CHIP_REMOTE', value: 'שלט חסר' }
];

export const SHORTAGE_CHIPS = [
  { key: 'FIELD_CHIP_TOWELS', value: 'מגבות' },
  { key: 'FIELD_CHIP_SHEETS', value: 'סדינים' },
  { key: 'FIELD_CHIP_TOILET', value: 'נייר טואלט' },
  { key: 'FIELD_CHIP_SOAP', value: 'סבון / שמפו' },
  { key: 'FIELD_CHIP_HAND_SOAP', value: 'סבון ידיים' },
  { key: 'FIELD_CHIP_PAPER', value: 'נייר מטבח' },
  { key: 'FIELD_CHIP_BAGS', value: 'שקיות אשפה' },
  { key: 'FIELD_CHIP_COFFEE', value: 'קפה / תה / סוכר' },
  { key: 'FIELD_CHIP_CAPSULES', value: 'קפסולות אספרסו' },
  { key: 'FIELD_CHIP_DISH_SOAP', value: 'סבון כלים' },
  { key: 'FIELD_CHIP_REMOTE', value: 'שלט חסר' }
];

export const FIELD_REASON_KEYS = [
  { value: 'תקלת אחזקה פתוחה', key: 'FIELD_REASON_MAINT_OPEN' },
  { value: 'עבודת גינון פתוחה', key: 'FIELD_REASON_GARDEN_OPEN' },
  { value: 'טופל', key: 'FIELD_REASON_DONE' },
  { value: 'חוסר בציוד', key: 'FIELD_REASON_SHORTAGE_DEFAULT' },
  { value: 'ממתין לביקורת מנהל', key: 'FIELD_REASON_INSPECT' },
  { value: 'ניקוי לאחר יציאה והכנה לכניסה', key: 'FIELD_REASON_TURNOVER' }
];

const ALL_FIELD_PHRASES = [...FAULT_CHIPS, ...SHORTAGE_CHIPS, ...FIELD_REASON_KEYS];

function matchFieldPhrase(part, t) {
  const raw = String(part || '').trim();
  if (!raw) return '';
  const hit = ALL_FIELD_PHRASES.find((row) => (
    row.value === raw || (typeof t === 'function' && t(row.key) === raw)
  ));
  return hit && typeof t === 'function' ? t(hit.key) : (hit?.value || raw);
}

export function canonicalFieldPhrase(text, chips, t) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const list = chips || ALL_FIELD_PHRASES;
  const hit = list.find((row) => row.value === raw || (typeof t === 'function' && t(row.key) === raw));
  return hit?.value || raw;
}

export function translateFieldReason(reason, t) {
  const raw = String(reason || '').trim();
  if (!raw) return '';
  return raw.split(' · ').map((part) => {
    const shortage = part.match(/^(?:חוסר|Shortage|نقص|ของขาด)\s*:\s*(.*)$/i);
    if (shortage) {
      const rest = matchFieldPhrase(shortage[1], t);
      return `${typeof t === 'function' ? t('FIELD_SHORTAGE_PREFIX') : 'חוסר'}: ${rest}`;
    }
    return matchFieldPhrase(part, t);
  }).join(' · ');
}

function isKnownPhrase(part, t) {
  const raw = String(part || '').trim();
  if (!raw) return true;
  return ALL_FIELD_PHRASES.some((row) => (
    row.value === raw || (typeof t === 'function' && t(row.key) === raw)
  ));
}

export function isCatalogFieldReason(reason, t) {
  const raw = String(reason || '').trim();
  if (!raw) return true;
  return raw.split(' · ').every((part) => {
    const shortage = part.match(/^(?:חוסר|Shortage|نقص|ของขาด)\s*:\s*(.*)$/i);
    return isKnownPhrase(shortage ? shortage[1] : part, t);
  });
}

export function guessFieldSourceLang(text, fallback = 'he') {
  const raw = String(text || '');
  if (/[\u0590-\u05FF]/.test(raw)) return 'he';
  if (/[\u0E00-\u0E7F]/.test(raw)) return 'th';
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar';
  if (isCatalogFieldReason(raw)) return 'he';
  return fallback || 'he';
}

export function fieldTaskKind(unit) {
  const ops = unit?.operational_status || 'READY';
  if (ops === 'MAINTENANCE_ALERT') return 'maintenance';
  if (ops === 'GARDENING') return 'gardening';
  if (ops === 'DIRTY' || ops === 'IN_PROGRESS') return 'open';
  if (ops === 'READY' && String(unit.custom_reason || '').includes('טופל')) return 'done';
  if (isAwaitingManagerInspect(unit)) return 'inspect';
  return null;
}

function stayForCleaningCard(unitBookings, today) {
  const checkin = unitBookings.find((row) => stayYmd(row.check_in_date) === today);
  if (checkin) return { stay: checkin, stayKind: 'in' };
  const occupying = unitBookings.find((row) => (
    stayYmd(row.check_in_date) <= today && stayYmd(row.check_out_date) > today
  ));
  if (occupying) return { stay: occupying, stayKind: 'in' };
  const checkout = unitBookings.find((row) => stayYmd(row.check_out_date) === today);
  if (checkout) return { stay: checkout, stayKind: 'out' };
  const upcoming = unitBookings
    .filter((row) => stayYmd(row.check_in_date) > today)
    .sort((a, b) => stayYmd(a.check_in_date).localeCompare(stayYmd(b.check_in_date)))[0];
  return upcoming ? { stay: upcoming, stayKind: 'in' } : { stay: null, stayKind: '' };
}

export function listFieldStaffTasks(units, bookings = [], today = israelToday(), allowedUnitIds) {
  return visibleInventory(units, allowedUnitIds).flatMap((unit) => {
    const kind = fieldTaskKind(unit);
    if (!kind) return [];
    const cleaning = kind === 'open' || kind === 'inspect';
    if (cleaning && hideHousekeepingTaskWhileOccupied(unit, bookings, today)) return [];
    const unitBookings = (bookings || []).filter((row) => (
      row.unit_id === unit.id && !row.deleted_at && row.booking_status !== 'CANCELED'
    ));
    const checkout = unitBookings.find((row) => stayYmd(row.check_out_date) === today);
    const checkin = unitBookings.find((row) => stayYmd(row.check_in_date) === today);
    const { stay, stayKind } = stayForCleaningCard(unitBookings, today);
    const guests = bookingGuestCounts(stay);
    const reason = unit.custom_reason
      || (kind === 'maintenance'
        ? 'תקלת אחזקה פתוחה'
        : (kind === 'inspect' ? 'ממתין לביקורת מנהל' : 'ניקוי לאחר יציאה והכנה לכניסה'));
    return [{
      id: unit.id,
      unit,
      name: unitFullName(unit),
      reason,
      kind,
      cleaning,
      open: kind !== 'inspect' && kind !== 'done',
      stayKind: stayKind || (checkout ? 'out' : (checkin ? 'in' : '')),
      stayGuest: stay?.guest_name || checkout?.guest_name || checkin?.guest_name || '',
      stayLine: checkout
        ? `יציאה היום${checkout.guest_name ? ` · ${checkout.guest_name}` : ''}`
        : (checkin ? `כניסה היום${checkin.guest_name ? ` · ${checkin.guest_name}` : ''}` : ''),
      guests,
      lockbox: cleaning ? lockboxCodeForUnit(unit) : ''
    }];
  });
}

export function fieldStaffCounts(tasks) {
  const list = tasks || [];
  return {
    open: list.filter((row) => row.open).length,
    inspect: list.filter((row) => !row.open).length
  };
}
