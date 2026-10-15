import { isPaintedStay, stayYmd } from './calendarOccupancy';
import { coveringUnavailableHold, unavailableHoldLabel } from './unavailableHold';

export const ARRIVAL_TODAY_LABEL = 'צ׳ק-אין היום';

function paintedOnUnit(bookings, unitId) {
  return (bookings || []).filter((row) => row?.unit_id === unitId && isPaintedStay(row));
}

function nextDateLabel(ymd) {
  const day = stayYmd(ymd);
  if (!day) return '';
  const [, month, date] = day.split('-');
  return `${Number(date)}.${Number(month)}`;
}

/** Current row guest: in-house (including checkout today) or an arrival today. Never a future stay. */
export function selectPriorityStay(bookings, unitId, today) {
  const rows = paintedOnUnit(bookings, unitId);
  const inHouse = rows
    .filter((row) => {
      const cin = stayYmd(row.check_in_date);
      const cout = stayYmd(row.check_out_date);
      return cin && cout && cin < today && cout >= today;
    })
    .sort((a, b) => stayYmd(b.check_in_date).localeCompare(stayYmd(a.check_in_date)))[0] || null;
  const arrival = rows
    .filter((row) => stayYmd(row.check_in_date) === today && stayYmd(row.check_out_date) >= today)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
  const active = inHouse || arrival;
  const next = rows
    .filter((row) => row.id !== active?.id && stayYmd(row.check_in_date) >= today)
    .filter((row) => !(active && stayYmd(active.check_in_date) === today && stayYmd(row.check_in_date) <= today))
    .sort((a, b) => stayYmd(a.check_in_date).localeCompare(stayYmd(b.check_in_date)))[0] || null;
  const hold = active ? null : coveringUnavailableHold(bookings, unitId, today);
  return {
    booking: active,
    arrivalToday: Boolean(arrival && active?.id === arrival.id),
    nextStay: nextDateLabel(next?.check_in_date),
    hold,
    holdLabel: hold ? (unavailableHoldLabel(hold.guest_name) || 'לא זמין') : ''
  };
}

/** Same-day turnover: who leaves today, who arrives today, and who stays another night. */
export function priorityDeskGuests(bookings, unitId, today) {
  const rows = paintedOnUnit(bookings, unitId);
  const departing = rows
    .filter((row) => stayYmd(row.check_in_date) < today && stayYmd(row.check_out_date) === today)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
  const arriving = rows
    .filter((row) => stayYmd(row.check_in_date) === today && row.id !== departing?.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
  const staying = rows
    .filter((row) => {
      const cin = stayYmd(row.check_in_date);
      const cout = stayYmd(row.check_out_date);
      return cin && cout && cin < today && cout > today && row.id !== departing?.id;
    })
    .sort((a, b) => stayYmd(b.check_in_date).localeCompare(stayYmd(a.check_in_date)))[0] || null;
  let roomStatus = '';
  if (departing && arriving) roomStatus = 'החלפה';
  else if (departing) roomStatus = 'צ׳ק אאוט';
  else if (arriving) roomStatus = 'צ׳ק אין';
  else if (staying) roomStatus = 'בשהייה';
  return { departing, arriving, staying, roomStatus };
}

/** One unit-day on the rolling board: empty, stay, arrival, departure, a same-day swap, or a departure into a closed block. */
export function priorityDayCell(bookings, unitId, day) {
  const { departing, arriving, staying } = priorityDeskGuests(bookings, unitId, day);
  if (departing && arriving) return { kind: 'swap', out: departing, inn: arriving };
  if (departing) {
    const hold = coveringUnavailableHold(bookings, unitId, day);
    if (hold) {
      return {
        kind: 'swap-hold',
        out: departing,
        hold,
        holdLabel: unavailableHoldLabel(hold.guest_name) || 'לא זמין'
      };
    }
    return { kind: 'out', guest: departing };
  }
  if (arriving) return { kind: 'in', guest: arriving };
  if (staying) return { kind: 'stay', guest: staying };
  return { kind: 'empty' };
}

/** A vacant cabin does not show the guest. An arrival today still does, until someone marks it vacant. */
export function priorityShowsGuest({ stayKey, arrivalToday, holdLabel, stayDraft } = {}) {
  if (holdLabel && !stayDraft) return false;
  if (arrivalToday && !stayDraft) return true;
  return (stayDraft || stayKey) === 'OCCUPIED';
}
