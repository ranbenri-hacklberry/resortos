import { israelToday } from './cabinAccess';
import { stayYmd } from './calendarOccupancy';
import { isArrivalAfterCheckin } from './stayAccess';
import { coveringUnavailableHold, isUnavailableHoldBooking, unavailableHoldLabel } from './unavailableHold';

export const UNIT_STATUS_BADGES = {
  OCCUPIED: { key: 'OCCUPIED', label: 'מאוכלס', color: '#6D28D9', bg: '#EDE9FE' },
  READY: { key: 'READY', label: 'מוכן', color: '#047857', bg: '#D1FAE5' },
  DIRTY: { key: 'DIRTY', label: 'לניקוי', color: '#C2410C', bg: '#FFEDD5' },
  IN_PROGRESS: { key: 'IN_PROGRESS', label: 'בניקיון', color: '#3730A3', bg: '#E0E7FF' },
  MAINTENANCE_ALERT: { key: 'MAINTENANCE_ALERT', label: 'תקלה', color: '#B91C1C', bg: '#FEE2E2' },
  GARDENING: { key: 'GARDENING', label: 'גינון', color: '#047857', bg: '#D1FAE5' },
  LEAVING: { key: 'LEAVING', label: 'יציאה', color: '#0369A1', bg: '#E0F2FE' },
  UNAVAILABLE: { key: 'UNAVAILABLE', label: 'לא פנויה', color: '#57534E', bg: '#E7E5E4' }
};

const UNIT_NAME_FRAMES = {
  READY: {
    border: '#4ADE80',
    bgLight: '#E8F8EF',
    bgDark: '#16382A',
    textLight: '#14532D',
    textDark: '#BBF7D0'
  },
  DIRTY: {
    border: '#FB923C',
    bgLight: '#FFEDD5',
    bgDark: '#3D2412',
    textLight: '#9A3412',
    textDark: '#FED7AA'
  },
  MAINTENANCE_ALERT: {
    border: '#F87171',
    bgLight: '#FEE2E2',
    bgDark: '#3F1D1D',
    textLight: '#7F1D1D',
    textDark: '#FECACA'
  },
  OCCUPIED: {
    border: '#8B5CF6',
    bgLight: '#EDE9FE',
    bgDark: '#2A1848',
    textLight: '#5B21B6',
    textDark: '#DDD6FE'
  },
  IN_PROGRESS: {
    border: '#818CF8',
    bgLight: '#E0E7FF',
    bgDark: '#1E1B4B',
    textLight: '#312E81',
    textDark: '#C7D2FE'
  },
  GARDENING: {
    border: '#34D399',
    bgLight: '#D1FAE5',
    bgDark: '#064E3B',
    textLight: '#065F46',
    textDark: '#A7F3D0'
  },
  LEAVING: {
    border: '#38BDF8',
    bgLight: '#E0F2FE',
    bgDark: '#0C4A6E',
    textLight: '#075985',
    textDark: '#BAE6FD'
  },
  UNAVAILABLE: {
    border: '#A8A29E',
    bgLight: '#E7E5E4',
    bgDark: '#292524',
    textLight: '#44403C',
    textDark: '#D6D3D1'
  }
};

export function unitNameFrame(statusKey, isLight) {
  const frame = UNIT_NAME_FRAMES[statusKey] || UNIT_NAME_FRAMES.READY;
  const text = isLight ? frame.textLight : frame.textDark;
  return {
    bg: isLight ? frame.bgLight : frame.bgDark,
    border: frame.border,
    prefix: text,
    name: text
  };
}

export function staffOccupancyOf(unit) {
  const value = String(unit?.staff_occupancy || '').toUpperCase();
  if (value === 'OCCUPIED' || value === 'VACANT') return value;
  return null;
}

export function isEffectivelyOccupied(unit, bookings, today = israelToday()) {
  if (coveringUnavailableHold(bookings, unit?.id, today)) return false;
  if (staffOccupancyOf(unit) === 'VACANT') return false;
  if (staffOccupancyOf(unit) === 'OCCUPIED') return true;
  return isUnitOccupied(bookings, unit?.id, today);
}

/** Field-settable ops statuses. Occupied/vacant is a separate staff toggle. */
export const UNIT_OPS_CHOICES = [
  { key: 'DIRTY', domain: 'HOUSEKEEPING', reason: 'ניקוי לאחר יציאה והכנה לכניסה', hint: 'ממתין למשק בית' },
  { key: 'IN_PROGRESS', domain: 'HOUSEKEEPING', reason: 'ניקיון בביצוע', hint: 'הצוות בפנים' },
  { key: 'READY', domain: 'HOUSEKEEPING', reason: 'ממתין לביקורת מנהל', hint: 'נקי — אפשר כניסה' },
  { key: 'MAINTENANCE_ALERT', domain: 'MAINTENANCE', reason: 'תקלת אחזקה פתוחה ביחידה', hint: 'לא מוכן לאורח' },
  { key: 'GARDENING', domain: 'GARDENING', reason: 'עבודת גינון פתוחה', hint: 'חצר / בריכה' }
];

export function unitOpsChoice(status) {
  return UNIT_OPS_CHOICES.find((row) => row.key === status) || null;
}

export function isCurrentlyInHouse(booking, today = israelToday()) {
  if (!booking || booking.deleted_at) return false;
  if (isUnavailableHoldBooking(booking)) return false;
  if (booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return false;
  const cin = stayYmd(booking.check_in_date);
  const cout = stayYmd(booking.check_out_date);
  if (!cin || !cout) return false;
  // Arrival day is not occupied until they have already slept a night.
  if (cin >= today) return false;
  if (cout <= today) return false;
  return true;
}

export function isUnitOccupied(bookings, unitId, today = israelToday()) {
  return (bookings || []).some((booking) => booking.unit_id === unitId && isCurrentlyInHouse(booking, today));
}

export function shouldAutoOccupyUnit() {
  return false;
}

export function bookingsMarkingNight(bookings, unitId, dateStr) {
  return (bookings || []).filter((booking) => (
    booking?.unit_id === unitId && isCurrentlyInHouse(booking, dateStr)
  ));
}

export function vacateBookingOnDate(booking, dateStr, nowIso = new Date().toISOString()) {
  if (!booking || booking.check_in_date >= dateStr) return booking;
  const stay = booking.stay && typeof booking.stay === 'object' ? booking.stay : {};
  return {
    ...booking,
    booking_status: 'CHECKED_OUT',
    stay: { ...stay, manager_checked_out_at: nowIso },
    updated_at: nowIso
  };
}

export function reviveVacatedArrival(booking, today = israelToday()) {
  if (!booking || booking.deleted_at || booking.booking_status !== 'CHECKED_OUT') return null;
  if (!booking.check_in_date || booking.check_in_date < today) return null;
  if (!booking.check_out_date || booking.check_out_date <= booking.check_in_date) return null;
  const stay = booking.stay && typeof booking.stay === 'object' ? { ...booking.stay } : {};
  delete stay.manager_checked_out_at;
  return {
    ...booking,
    booking_status: 'CONFIRMED',
    stay,
    updated_at: new Date().toISOString()
  };
}

export function hasCheckoutToday(bookings, unitId, today = israelToday()) {
  return (bookings || []).some((booking) => (
    booking.unit_id === unitId
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(booking)
    && booking.check_out_date === today
  ));
}

export function hasCompletedCheckoutToday(bookings, unitId, today = israelToday()) {
  return (bookings || []).some((booking) => (
    booking.unit_id === unitId
    && !booking.deleted_at
    && booking.booking_status === 'CHECKED_OUT'
    && !isUnavailableHoldBooking(booking)
    && booking.check_out_date === today
  ));
}

export function hasArrivalToday(bookings, unitId, today = israelToday()) {
  return (bookings || []).some((booking) => (
    booking.unit_id === unitId
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(booking)
    && booking.check_in_date === today
  ));
}

export function stayCoversTonight(booking, today = israelToday()) {
  if (!booking || booking.deleted_at) return false;
  if (booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return false;
  if (isUnavailableHoldBooking(booking)) return false;
  if (!booking.check_in_date || !booking.check_out_date) return false;
  return booking.check_in_date <= today && today < booking.check_out_date;
}

export function unitDisplayStatus(unit, bookings, today = israelToday(), now = new Date()) {
  const hold = coveringUnavailableHold(bookings, unit?.id, today);
  if (hold) {
    return {
      ...UNIT_STATUS_BADGES.UNAVAILABLE,
      label: unavailableHoldLabel(hold.guest_name) || UNIT_STATUS_BADGES.UNAVAILABLE.label
    };
  }
  const occupied = isEffectivelyOccupied(unit, bookings, today, now);
  const ops = unit?.operational_status || 'READY';
  const tonight = (bookings || []).some((booking) => (
    booking.unit_id === unit?.id && stayCoversTonight(booking, today)
  ));
  const turnoverToday = hasCompletedCheckoutToday(bookings, unit?.id, today);

  const leavingToday = hasCheckoutToday(bookings, unit?.id, today)
    && !hasCompletedCheckoutToday(bookings, unit?.id, today)
    && !isUnitOccupied(bookings, unit?.id, today);

  if (ops === 'MAINTENANCE_ALERT') return UNIT_STATUS_BADGES.MAINTENANCE_ALERT;
  if (ops === 'GARDENING') return UNIT_STATUS_BADGES.GARDENING;
  if (occupied) return UNIT_STATUS_BADGES.OCCUPIED;
  if (ops === 'IN_PROGRESS') return UNIT_STATUS_BADGES.IN_PROGRESS;
  if (ops === 'DIRTY') return UNIT_STATUS_BADGES.DIRTY;
  if (leavingToday) return UNIT_STATUS_BADGES.LEAVING;
  if (ops === 'READY') return UNIT_STATUS_BADGES.READY;
  return tonight ? UNIT_STATUS_BADGES.READY : UNIT_STATUS_BADGES.DIRTY;
}

export function lastInspectionOf(unit) {
  const list = Array.isArray(unit?.quality_inspections) ? unit.quality_inspections : [];
  return list.length ? list[list.length - 1] : null;
}

export function isAwaitingManagerInspect(unit) {
  if (unit?.operational_status !== 'READY') return false;
  const last = lastInspectionOf(unit);
  const ratings = last?.ratings && typeof last.ratings === 'object' ? last.ratings : {};
  const managerRated = Object.values(ratings).some((value) => Number(value) > 0);
  if (managerRated && last && !last.reopened) return false;
  const reason = String(unit.custom_reason || '');
  if (reason.includes('ביקורת')) return true;
  return Boolean(
    last
    && !last.reopened
    && (last.source === 'calendar' || last.note === 'סומן נקי מהיומן')
  );
}

export function isExpiredPendingInspect(unit, today = israelToday()) {
  if (!isAwaitingManagerInspect(unit)) return false;
  const last = lastInspectionOf(unit);
  const at = last?.at || unit.updated_at;
  if (!at) return false;
  return israelToday(new Date(at)) < today;
}

export function hideHousekeepingTaskWhileOccupied(unit, bookings, today = israelToday(), now = new Date()) {
  const ops = unit?.operational_status || 'READY';
  if (ops === 'MAINTENANCE_ALERT' || ops === 'GARDENING') return false;
  const clock = israelToday(now) === today ? now : new Date(`${today}T12:00:00+03:00`);
  if (isEffectivelyOccupied(unit, bookings, today, clock)) return true;
  const checkoutToday = hasCompletedCheckoutToday(bookings, unit?.id, today);
  const arrivalToday = hasArrivalToday(bookings, unit?.id, today);
  if (ops === 'DIRTY' || ops === 'IN_PROGRESS') {
    return !checkoutToday && !arrivalToday;
  }
  if (ops === 'READY' && isExpiredPendingInspect(unit, today)) return true;
  if (ops === 'READY' && isAwaitingManagerInspect(unit) && checkoutToday) return false;
  return true;
}
