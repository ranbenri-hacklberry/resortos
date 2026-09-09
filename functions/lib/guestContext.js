import { normalizeGuestPhone } from './guestPhone.js';
import { UNIT_DISPLAY_NAMES } from './unitNames.js';

export function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function mapBookingStatus(raw) {
  const status = String(raw || '').toUpperCase();
  if (status === 'CHECKED_IN') return 'checked_in';
  if (status === 'CHECKED_OUT') return 'checked_out';
  if (status === 'CANCELED' || status === 'CANCELLED') return 'cancelled';
  return 'confirmed';
}

export function unitDisplayName(unitId, liveName = '') {
  const id = String(unitId || '');
  return String(liveName || '').trim() || UNIT_DISPLAY_NAMES[id] || id;
}

export function partySize(row) {
  return Math.max(0, Number(row?.adults_count) || 0) + Math.max(0, Number(row?.children_count) || 0);
}

export function pickGuestStay(rows, today = israelToday()) {
  const list = Array.isArray(rows) ? rows : [];
  const live = list.filter((row) => mapBookingStatus(row.booking_status) !== 'cancelled');
  const current = live
    .filter((row) => row.check_in_date <= today && today <= row.check_out_date)
    .sort((a, b) => {
      const rank = (row) => (String(row.booking_status).toUpperCase() === 'CHECKED_IN' ? 0 : 1);
      const diff = rank(a) - rank(b);
      if (diff) return diff;
      return String(a.check_in_date).localeCompare(String(b.check_in_date));
    });
  if (current[0]) return { primary: current[0], reason: 'active' };

  const upcoming = live
    .filter((row) => row.check_in_date > today)
    .sort((a, b) => String(a.check_in_date).localeCompare(String(b.check_in_date)));
  if (upcoming[0]) return { primary: upcoming[0], reason: 'upcoming' };

  return { primary: null, reason: 'none' };
}

export function guestContextPayload(rows, phoneRaw, unitNames = {}) {
  const parsed = normalizeGuestPhone(phoneRaw);
  const list = Array.isArray(rows) ? rows : [];
  const { primary } = pickGuestStay(list);
  const reservations = list.map((row) => toReservation(row, unitNames));
  if (!primary) {
    return {
      found: false,
      phone: parsed.e164,
      suggestions: reservations.slice(-3).reverse()
    };
  }
  const chosen = toReservation(primary, unitNames);
  return {
    found: true,
    guestName: chosen.guestName,
    phone: parsed.e164,
    unitId: chosen.unitId,
    unitName: chosen.unitName,
    checkIn: chosen.checkIn,
    checkOut: chosen.checkOut,
    status: chosen.status,
    partySize: chosen.partySize,
    notes: chosen.notes,
    reservations
  };
}

export function toReservation(row, unitNames = {}) {
  const unitId = String(row.unit_id || '');
  return {
    guestName: String(row.guest_name || '').trim(),
    phone: String(row.guest_phone || '').trim(),
    unitId,
    unitName: unitDisplayName(unitId, unitNames[unitId]),
    checkIn: row.check_in_date,
    checkOut: row.check_out_date,
    status: mapBookingStatus(row.booking_status),
    partySize: partySize(row),
    notes: String(row.special_requests || '').trim()
  };
}
