import { awaitingBankReview, isFullyPaid } from './bookingPaid';
import { isUnavailableHoldBooking } from './unavailableHold';

export function stayYmd(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function shiftYmd(ymd, days) {
  const raw = stayYmd(ymd);
  if (!raw) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const dt = new Date(year, month - 1, day + Number(days || 0));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function daysBetween(startStr, endStr) {
  const start = stayYmd(startStr);
  const end = stayYmd(endStr);
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function nightsBetween(startStr, endStr) {
  return Math.max(1, daysBetween(startStr, endStr));
}

export function isStayInHouseNow(booking, today) {
  if (!booking || booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return false;
  const cin = stayYmd(booking.check_in_date);
  const cout = stayYmd(booking.check_out_date);
  return Boolean(cin && cout && today && cin <= today && today < cout);
}

/** Payment first; paid guests who are in-house now are purple. */
export function stayCardTone(booking, { today } = {}) {
  const cin = stayYmd(booking?.check_in_date);
  const departed = booking?.booking_status === 'CHECKED_OUT' && cin && today && cin < today;
  if (departed) return 'past';
  if (isFullyPaid(booking) && isStayInHouseNow(booking, today)) return 'inhouse';
  if (isFullyPaid(booking)) return 'paid';
  if (awaitingBankReview(booking)) return 'bank';
  return 'unpaid';
}

/** Non-canceled stay with valid dates (includes past checkouts for calendar paint). */
export function isPaintedStay(booking) {
  return Boolean(
    booking &&
    !booking.deleted_at &&
    booking.booking_status !== 'CANCELED' &&
    !isUnavailableHoldBooking(booking) &&
    stayYmd(booking.check_in_date) &&
    stayYmd(booking.check_out_date)
  );
}

/** Still open as of today (check-out today or later). Used by ops / duty, not calendar paint. */
export function isActiveStay(booking, todayStr) {
  const cout = stayYmd(booking?.check_out_date);
  return isPaintedStay(booking) && cout && cout >= todayStr;
}

export function coveringStayOnDate(bookings, dateStr, todayStr) {
  return (bookings || []).find((booking) => {
    const cin = stayYmd(booking.check_in_date);
    const cout = stayYmd(booking.check_out_date);
    return isPaintedStay(booking) && cin <= dateStr && dateStr < cout;
  }) || null;
}

export function bookingsStartingOnDate(bookings, dateStr, todayStr) {
  return (bookings || []).filter((booking) => (
    isPaintedStay(booking) && stayYmd(booking.check_in_date) === dateStr
  ));
}

export function checkoutStubOnDate(bookings, dateStr, todayStr) {
  return (bookings || []).find((booking) => (
    isPaintedStay(booking)
    && stayYmd(booking.check_out_date) === dateStr
    && booking.booking_status !== 'CHECKED_OUT'
  )) || null;
}

/**
 * Mid-day slice inside one date column.
 * Check-in occupies noon→next day, checkout occupies previous day→noon.
 */
export function stayCellSlice(booking, dateStr, { calendarStartStr, calendarEndStr } = {}) {
  const cin = stayYmd(booking?.check_in_date);
  const cout = stayYmd(booking?.check_out_date);
  const day = stayYmd(dateStr);
  const winStart = stayYmd(calendarStartStr);
  const winEnd = stayYmd(calendarEndStr);
  if (!cin || !cout || !day) return null;
  if (day === cout) {
    return { role: 'checkout', showLabel: false, showMeta: true };
  }
  if (day < cin || day >= cout) return null;
  const clippedIn = Boolean(winStart && cin < winStart && day === winStart);
  const lastVisible = Boolean(winEnd && cout >= winEnd && day === shiftYmd(winEnd, -1));
  if (day === cin) return { role: 'checkin', showLabel: true, showMeta: false };
  return { role: 'middle', showLabel: clippedIn, showMeta: lastVisible };
}

export function staySlicesOnCell(bookings, dateStr, todayStr, opts = {}) {
  const covering = coveringStayOnDate(bookings, dateStr, todayStr);
  const leaving = (bookings || []).find((booking) => (
    isPaintedStay(booking)
    && stayYmd(booking.check_out_date) === dateStr
    && (!covering || covering.id !== booking.id)
  ));
  const slices = [];
  if (leaving) {
    const slice = stayCellSlice(leaving, dateStr, opts);
    if (slice) slices.push({ booking: leaving, ...slice });
  }
  if (covering) {
    const slice = stayCellSlice(covering, dateStr, opts);
    if (slice) slices.push({ booking: covering, ...slice });
  }
  return slices;
}

/**
 * Occupying stay for hit-testing. Visual paint uses staySlicesOnCell (mid-day).
 */
export function barsToDrawOnCell(bookings, dateStr, todayStr, { isFirstColumn = false, isToday = false } = {}) {
  const covering = coveringStayOnDate(bookings, dateStr, todayStr);
  const starts = bookingsStartingOnDate(bookings, dateStr, todayStr);
  const bars = [];
  const seen = new Set();
  for (const booking of starts) {
    if (!booking?.id || seen.has(booking.id)) continue;
    seen.add(booking.id);
    bars.push(booking);
  }
  if (isFirstColumn && covering && stayYmd(covering.check_in_date) < dateStr && !seen.has(covering.id)) {
    bars.push(covering);
  }
  const occupying = covering || starts[0] || (isToday ? checkoutStubOnDate(bookings, dateStr, todayStr) : null);
  return { occupying, bars };
}

/**
 * One continuous bar, pixel-placed on the unit row (not inside a day cell).
 * Survives mobile overflow clipping and stays visible next to the unit names.
 */
export function spanBarPixels(booking, calendarStartStr, daysCount, cellPx = 72, unitColPx = 112) {
  const cin = stayYmd(booking?.check_in_date);
  const cout = stayYmd(booking?.check_out_date);
  const winStart = stayYmd(calendarStartStr);
  const winEnd = shiftYmd(winStart, daysCount);
  if (!cin || !cout || !winStart || cout <= winStart || cin >= winEnd) return null;

  const visibleStart = cin < winStart ? winStart : cin;
  const visibleEnd = cout > winEnd ? winEnd : cout;
  if (visibleEnd <= visibleStart) return null;

  const startIndex = daysBetween(winStart, visibleStart);
  const visibleNights = daysBetween(visibleStart, visibleEnd);
  const clippedStart = cin < winStart;
  const clippedEnd = cout > winEnd;
  const right = unitColPx + startIndex * cellPx + (clippedStart ? 2 : cellPx * 0.5);
  let width = visibleNights * cellPx - 4;
  if (clippedStart && !clippedEnd) width = visibleNights * cellPx - cellPx * 0.5 - 2;
  if (!clippedStart && clippedEnd) width = visibleNights * cellPx - cellPx * 0.5 - 4;
  if (clippedStart && clippedEnd) width = visibleNights * cellPx - 4;
  const oneNight = visibleNights <= 1;
  return {
    right,
    width: Math.max(oneNight ? 62 : 28, width),
    nights: visibleNights
  };
}
