import { israelToday } from '../../lib/cabinAccess';
import { bookingHasCrib, bookingPeopleLabel } from '../../lib/dailyDutyReport';
import { isManagerInspection, lastInspectionRecord } from '../../lib/housekeepingCycle';
import { formatStayHourLabel, stayHoursFromBooking } from '../../lib/kinorotStayHours';
import { coveringUnavailableHold, isUnavailableHoldBooking, unavailableHoldLabel } from '../../lib/unavailableHold';
import { priorityRoomStatus, stayCoversTonight } from '../../lib/unitStatus';
import { createSeedCabins } from './model';
import { requestedBedSetup } from './bedInventory';
import { todayTask } from './roomWorkflow';

export function displayPhone(raw) {
  const text = String(raw || '').trim();
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith('972')) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return text;
}

export function heStayDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!day || !month) return '';
  return `${Number(day)}.${Number(month)}${year ? `.${year.slice(2)}` : ''}`;
}

export function cabinShells() {
  return createSeedCabins().map((cabin) => ({
    ...cabin,
    status: 'ready',
    guest: null,
    cleanerName: '',
    vacatedAt: '',
    cleanedBy: '',
    inspectedBy: '',
    telemetry: { doorLocked: true, presence: false, acPower: false, acTemp: 24, vocIndex: 40 },
  }));
}

function activeBookings(bookings, unitId) {
  return (bookings || []).filter((row) => (
    row
    && row.unit_id === unitId
    && !row.deleted_at
    && row.booking_status !== 'CANCELED'
  ));
}

export function currentStay(bookings, unitId, today = israelToday()) {
  const rows = activeBookings(bookings, unitId);
  return rows.find((row) => row.booking_status === 'CHECKED_IN')
    || rows.find((row) => stayCoversTonight(row, today))
    || rows.find((row) => row.check_in_date === today && row.booking_status !== 'CHECKED_OUT')
    || null;
}

export function holdLabelOf(booking) {
  if (!booking) return '';
  return unavailableHoldLabel(booking.guest_name)
    || unavailableHoldLabel(booking.special_requests)
    || '';
}

export function commandStatus(unit, booking) {
  if (holdLabelOf(booking)) return 'hold';
  const room = priorityRoomStatus(unit);
  if (room.key === 'alert') return 'alert';
  if (room.key === 'occupied') return 'occupied';
  if (room.key === 'inspect') return 'inspection';
  if (room.key === 'dirty' || room.key === 'in_progress') return 'dirty';
  return 'ready';

}

function heClock(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jerusalem',
  });
}

function staySnapshot(booking) {
  if (!booking) return null;
  const hours = stayHoursFromBooking(booking);
  const phone = String(booking.guest_phone || '').trim();
  const requests = [];
  if (bookingHasCrib(booking)) requests.push('לול לתינוק');
  return {
    name: String(booking.guest_name || 'אורח').trim() || 'אורח',
    phone,
    checkIn: heStayDate(booking.check_in_date),
    checkOut: heStayDate(booking.check_out_date),
    plannedCheckIn: formatStayHourLabel(hours.checkin),
    plannedCheckOut: formatStayHourLabel(hours.checkout),
    actualCheckOut: heClock(booking.stay?.manager_checked_out_at),
    checkedInAt: booking.stay?.guest_checked_in_at || '',
    bookingId: booking.id,
    checkedIn: booking.booking_status === 'CHECKED_IN',
    checkedOut: booking.booking_status === 'CHECKED_OUT',
    party: (() => {
      const label = bookingPeopleLabel(booking);
      return label && label !== '—' ? label : '';
    })(),
    requests,
    bedRequest: requestedBedSetup(booking),
    bedChosen: String(booking.stay?.bed_setup || '').trim(),
    bedPrepDone: booking.stay?.bed_prep_done === true,
  };
}

function dayBookings(bookings, unitId) {
  return activeBookings(bookings, unitId).filter((row) => !isUnavailableHoldBooking(row) && !holdLabelOf(row));
}

export function dayContext(bookings, unit, unitId, status, today = israelToday()) {
  const rows = dayBookings(bookings, unitId);
  const departingBooking = rows.find((row) => row.check_out_date === today && row.check_in_date !== today) || null;
  const arrivingBooking = rows.find((row) => row.check_in_date === today && row.id !== departingBooking?.id) || null;
  const departing = staySnapshot(departingBooking);
  const arriving = staySnapshot(arrivingBooking);
  const approval = lastInspectionRecord(unit);
  const approvedToday = Boolean(
    isManagerInspection(approval)
    && approval?.at
    && israelToday(new Date(approval.at)) === today
  );
  return {
    departing,
    arriving,
    departingBooking,
    arrivingBooking,
    approvedToday,
    task: todayTask({ status, departing, arriving }),
    staff: String(unit?.assigned_staff || '').trim(),
    notes: String(unit?.custom_reason || '').trim(),
    cleaningStarted: heClock(unit?.cleaning_started_at),
  };
}

function guestOf(booking) {
  if (!booking) return null;
  const phone = String(booking.guest_phone || '').trim();
  return {
    name: String(booking.guest_name || 'אורח').trim() || 'אורח',
    phone,
    checkIn: heStayDate(booking.check_in_date),
    checkOut: heStayDate(booking.check_out_date),
    bookingId: booking.id,
    checkedIn: booking.booking_status === 'CHECKED_IN',
  };
}

export function overlayLiveCabins(units, bookings, today = israelToday()) {
  const byId = new Map((units || []).map((unit) => [unit.id, unit]));
  return cabinShells().map((shell) => {
    const unit = byId.get(shell.id) || null;
    const hold = coveringUnavailableHold(bookings, shell.id, today);
    const booking = hold || currentStay(bookings, shell.id, today);
    const holdLabel = holdLabelOf(booking);
    const status = holdLabel ? 'hold' : commandStatus(unit, booking);
    const day = holdLabel ? null : dayContext(bookings, unit, shell.id, status, today);
    return {
      ...shell,
      status,
      holdLabel,
      guest: holdLabel ? null : guestOf(booking),
      booking: booking || null,
      day,
      task: day?.task || null,
      unit,
      cleanerName: unit?.assigned_staff || '',
    };
  });
}
