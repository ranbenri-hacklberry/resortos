import { israelToday } from './cabinAccess';
import { lockboxCodeForUnit } from './guestProfileSeed';
import { formatStayHourLabel, stayHoursFromBooking } from './kinorotStayHours';
import { isUnavailableHoldBooking } from './unavailableHold';
import { hasCheckoutToday, isEffectivelyOccupied } from './unitStatus';

const GENERIC_TURNOVER = /^(ניקוי לאחר יציאה והכנה לכניסה|ניקיון בביצוע|נקי · השלמות)$/;

export function isGenericTurnoverReason(reason) {
  return GENERIC_TURNOVER.test(String(reason || '').trim());
}

export function formatIsraelClock(iso) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(at);
}

function checkoutActualAt(booking) {
  const stay = booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
  return booking?.checked_out_at
    || stay.self_checked_out_at
    || stay.auto_checked_out_at
    || stay.manager_checked_out_at
    || '';
}

function guestStayBookings(bookings, unitId) {
  return (bookings || []).filter((row) => (
    row.unit_id === unitId
    && !row.deleted_at
    && row.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(row)
  ));
}

export function housekeepingRoomStatusLabel({ unit, bookings = [], today = israelToday() } = {}) {
  const unitBookings = guestStayBookings(bookings, unit?.id);
  const leaving = unitBookings.find((row) => row.check_out_date === today);
  if (leaving || hasCheckoutToday(bookings, unit?.id, today)) {
    const actual = formatIsraelClock(checkoutActualAt(leaving));
    const scheduled = formatStayHourLabel(stayHoursFromBooking(leaving || {}).checkout) || '11:00';
    return `צ׳ק אאוט · ${actual || scheduled}`;
  }
  const arriving = unitBookings.find((row) => row.check_in_date === today);
  if (arriving) {
    const hour = formatStayHourLabel(stayHoursFromBooking(arriving).checkin) || '15:00';
    return `כניסה · ${hour}`;
  }
  if (!isEffectivelyOccupied(unit, bookings, today)) return 'פנוי';
  return '';
}

export function housekeepingTaskCopy({ unit, bookings = [], today = israelToday() } = {}) {
  const stored = String(unit?.custom_reason || unit?.task_description || '').trim();
  const status = housekeepingRoomStatusLabel({ unit, bookings, today });
  const reason = (!stored || isGenericTurnoverReason(stored)) ? (status || stored) : stored;
  return {
    reason,
    status,
    lockbox: lockboxCodeForUnit(unit)
  };
}

/** Lockbox is only for entering a specific cabin — not garden or complex-wide tasks. */
export function taskNeedsRoomLockbox(task = {}) {
  if (task.scoped) return false;
  const domain = String(task.domain || '').toUpperCase();
  if (domain === 'GARDENING') return false;
  const unitId = String(task.unit?.id || task.id || '').trim();
  if (!unitId || unitId.startsWith('scope:')) return false;
  return Boolean(lockboxCodeForUnit(task.unit || { id: unitId }));
}
