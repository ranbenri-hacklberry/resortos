import { israelToday } from './cabinAccess';
import { stripLegendBadge, getUnitSign } from './fieldUnitCatalog';
import { lockboxCodeForUnit } from './guestProfileSeed';
import { formatStayHourLabel, parseStayHoursFromNotes, stayHoursFromBooking } from './kinorotStayHours';
import { unitFullName } from './units';
import { isUnavailableHoldBooking } from './unavailableHold';
import { isEffectivelyOccupied } from './unitStatus';

export const DUTY_PRINT_AREAS = [
  {
    id: 'all',
    label: 'כל המתחמים',
    hint: 'אותו דבר כמו ביומן'
  },
  {
    id: 'givat',
    label: 'גבעה · כיפה · מיאליס · קאסה נובה',
    hint: 'צימר בגבעה, כיפת שמיים, מיאליס וקאסה נובה'
  },
  {
    id: 'ramot',
    label: 'צימרים רמות',
    hint: 'נורית, טאג׳ מאהל, מול הנוף, נופים בלבן, טוסקנה, חצר מוסיקלית, מאיה'
  }
];

export function dutyPrintAreaOf(unitId, unitName = '') {
  const id = String(unitId || '');
  const name = String(unitName || '');
  if (
    id.startsWith('hill-')
    || id.startsWith('dome-')
    || id === 'mialis-villa'
    || id.startsWith('suite-')
    || id === 'lab-kinneret'
    || id === 'k826'
    || id === 'k827'
  ) return 'givat';
  if (name.includes('קאסה') || name.includes('מיאליס') || name.includes('גבעה') || name.includes('כיפת') || name.includes('כיפה')) {
    return 'givat';
  }
  return 'ramot';
}

export function dutyPrintAreaLabel(area) {
  return DUTY_PRINT_AREAS.find((row) => row.id === area)?.label || '';
}

export const BOARD_AREA_FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'ramot', label: 'רמות' },
  { id: 'givat', label: 'גבעת יואב / נאות גולן / נוב' }
];

export function unitMatchesBoardArea(unit, area) {
  if (!area || area === 'all') return true;
  return dutyPrintAreaOf(unit?.id, unit?.name) === area;
}

function parseDateStr(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  const result = new Date(year, (month || 1) - 1, day || 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultReportDate() {
  return israelToday();
}

export function hebrewDateLabel(dateStr) {
  const d = parseDateStr(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr || '';
  return d.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  });
}

function nightsBetween(startStr, endStr) {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

function shortDate(dateStr) {
  const [, month, day] = String(dateStr || '').split('-');
  if (!day) return '';
  return `${Number(day)}.${Number(month)}`;
}

function formatPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 12) digits = `0${digits.slice(3)}`;
  if (digits.length >= 9) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return '';
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function dutyUnitGroup(unitId, unitName) {
  return unitGroup(unitId, unitName);
}

function unitGroup(unitId, unitName) {
  const id = String(unitId || '');
  if (id.startsWith('hill-') || id.startsWith('dome-') || id === 'mialis-villa' || id.startsWith('suite-')) {
    return 'גבעת יואב / מיאליס';
  }
  if (/^k67[1-9]$/.test(id) || id === 'k671') return 'בתי נורית · רמות';
  if (/^k80[8-9]$/.test(id) || id === 'k810' || id === 'k811') return "טאג' מאהל · רמות";
  if (/^k68[0-4]$/.test(id)) return 'מול הנוף · רמות';
  if (id === 'k685' || id === 'k686') return 'נופים בלבן · רמות';
  if (/^k68[7-9]$/.test(id)) return 'בקתות טוסקנה · רמות';
  if (/^k69[0-2]$/.test(id)) return 'החצר המוסיקלית · רמות';
  if (/^k69[3-5]$/.test(id)) return 'בקתות מאיה · רמות';
  if (/^k62[0-3]$/.test(id) || id === 'k618' || id === 'k619') return 'סייסטה · רמות';
  if (id === 'k826' || id === 'k827') return 'קאסה נובה · נוב';
  const name = String(unitName || '');
  if (name.includes('נורית')) return 'בתי נורית · רמות';
  if (name.includes("טאג'")) return "טאג' מאהל · רמות";
  if (name.includes('מול הנוף')) return 'מול הנוף · רמות';
  if (name.includes('נופים בלבן')) return 'נופים בלבן · רמות';
  if (name.includes('טוסקנה')) return 'בקתות טוסקנה · רמות';
  if (name.includes('מוסיקלית')) return 'החצר המוסיקלית · רמות';
  if (name.includes('מאיה')) return 'בקתות מאיה · רמות';
  if (name.includes('סייסטה')) return 'סייסטה · רמות';
  if (name.includes('קאסה')) return 'קאסה נובה · נוב';
  return 'יחידות נוספות';
}

function isListedBooking(booking) {
  return Boolean(
    booking &&
    !booking.deleted_at &&
    booking.booking_status !== 'CANCELED' &&
    !isUnavailableHoldBooking(booking) &&
    booking.unit_id &&
    booking.check_in_date &&
    booking.check_out_date
  );
}

function bookingDay(value) {
  return String(value || '').slice(0, 10);
}

function dutyStayHours(booking) {
  const fromToken = stayHoursFromBooking(booking);
  const fromNotes = parseStayHoursFromNotes(
    `${booking?.special_requests || ''} ${booking?.stay?.special_requests || ''}`
  );
  return {
    checkout: formatStayHourLabel(fromToken.checkout || fromNotes.checkout) || '11:00',
    checkin: formatStayHourLabel(fromToken.checkin || fromNotes.checkin) || '15:00'
  };
}

function toDutyRow(booking, unitsById, otherDate) {
  const unit = unitsById.get(booking.unit_id);
  const unitName = unit?.name || unitFullName(booking.unit_id, booking.unit_id);
  const people = guestPeople(booking);
  const hours = dutyStayHours(booking);
  return {
    bookingId: booking.id,
    unitId: booking.unit_id,
    unitName,
    area: dutyPrintAreaOf(booking.unit_id, unitName),
    sort: Number.isFinite(Number(unit?.sort_order)) ? Number(unit.sort_order) : 999,
    guest: booking.guest_name || '',
    phone: formatPhone(booking.guest_phone),
    otherDate: shortDate(otherDate),
    nights: nightsBetween(booking.check_in_date, booking.check_out_date),
    people,
    peopleLabel: people.label,
    guestTotal: people.total,
    needsCrib: Boolean(
      booking?.baby_cot_required
      || booking?.stay?.baby_cot_required
      || people.infants > 0
      || /תינוק|לול|crib|cot|infant/i.test(`${booking?.special_requests || ''} ${booking?.stay?.special_requests || ''}`)
    ),
    peopleKey: String(booking.id || '').replace(/^kin_[^_]+_/, '') || booking.id,
    checkoutHour: hours.checkout,
    checkinHour: hours.checkin,
    bookingStatus: booking.booking_status || ''
  };
}

function inPrintArea(row, area) {
  return !area || area === 'all' || row.area === area;
}

export function collectRows(bookings, units, dateStr, field, area = '') {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  const day = bookingDay(dateStr);
  return (bookings || [])
    .filter((booking) => isListedBooking(booking) && bookingDay(booking[field]) === day)
    .map((booking) => toDutyRow(
      booking,
      unitsById,
      field === 'check_out_date' ? booking.check_in_date : booking.check_out_date
    ))
    .filter((row) => inPrintArea(row, area))
    .sort((a, b) => a.sort - b.sort || a.unitName.localeCompare(b.unitName, 'he'));
}

export function occupiesCalendarDay(booking, dateStr) {
  if (!isListedBooking(booking) || booking.booking_status === 'CHECKED_OUT') return false;
  const day = bookingDay(dateStr);
  const cin = bookingDay(booking.check_in_date);
  const cout = bookingDay(booking.check_out_date);
  return Boolean(cin && cout && day >= cin && day < cout);
}

export function collectOccupying(bookings, units, dateStr, area = '') {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  return (bookings || [])
    .filter((booking) => occupiesCalendarDay(booking, dateStr))
    .map((booking) => toDutyRow(booking, unitsById, booking.check_out_date))
    .filter((row) => inPrintArea(row, area))
    .sort((a, b) => a.sort - b.sort || a.unitName.localeCompare(b.unitName, 'he'));
}

/** Field duty board rows: checkouts | checkins | occupied | vacant. */
export function listDutyBoardRows({ bookings, units, dateStr, tab }) {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));

  if (tab === 'checkouts') {
    const turnaround = turnaroundUnitIds(bookings, dateStr);
    return collectRows(bookings, units, dateStr, 'check_out_date')
      .filter((row) => !turnaround.has(row.unitId));
  }

  if (tab === 'checkins') {
    // Today's arrivals stay on כניסות for the whole day — even after staff marks תפוס.
    return collectRows(bookings, units, dateStr, 'check_in_date');
  }

  if (tab === 'vacant') {
    const day = bookingDay(dateStr);
    const arrivingUnits = new Set(
      (bookings || [])
        .filter((booking) => isListedBooking(booking) && bookingDay(booking.check_in_date) === day)
        .map((booking) => booking.unit_id)
    );
    return (units || [])
      .filter((unit) => (
        unit?.id
        && !isEffectivelyOccupied(unit, bookings, dateStr)
        && !arrivingUnits.has(unit.id)
      ))
      .map((unit) => {
        const unitName = unit.name || unitFullName(unit.id, unit.id);
        return {
          bookingId: `vacant:${unit.id}`,
          unitId: unit.id,
          unitName,
          area: dutyPrintAreaOf(unit.id, unitName),
          sort: Number.isFinite(Number(unit.sort_order)) ? Number(unit.sort_order) : 999,
          guest: 'פנוי',
          phone: '',
          otherDate: '',
          nights: 0,
          people: { adults: 0, children: 0, infants: 0, total: 0, label: '' },
          peopleLabel: '',
          guestTotal: 0,
          needsCrib: false,
          peopleKey: unit.id,
          checkoutHour: '',
          checkinHour: '',
          vacant: true
        };
      })
      .sort((a, b) => a.sort - b.sort || a.unitName.localeCompare(b.unitName, 'he'));
  }

  // occupied (alias: midstays) — everyone currently in the unit.
  return collectOccupiedDutyRows(bookings, units, dateStr);
}

/** Dirty / in-progress first, completions next, ready last — so clean cabins drop to the bottom. */
export function dutyOpsSortRank(statusKey) {
  const key = String(statusKey || '').toUpperCase();
  if (key === 'DIRTY' || key === 'IN_PROGRESS' || key === 'LEAVING') return 0;
  if (key === 'MAINTENANCE_ALERT' || key === 'GARDENING') return 1;
  if (key === 'NEEDS_COMPLETIONS') return 2;
  if (key === 'UNAVAILABLE') return 3;
  if (key === 'OCCUPIED') return 4;
  if (key === 'READY') return 9;
  return 5;
}

export function sortDutyBoardRows(rows, statusKeyOf) {
  return [...(rows || [])].sort((a, b) => {
    const delta = dutyOpsSortRank(statusKeyOf?.(a)) - dutyOpsSortRank(statusKeyOf?.(b));
    if (delta) return delta;
    return (Number(a.sort) || 0) - (Number(b.sort) || 0)
      || String(a.unitName || '').localeCompare(String(b.unitName || ''), 'he');
  });
}

function preferredOccupiedBooking(unitBookings, dateStr) {
  const day = bookingDay(dateStr);
  // Mid-stays only — arrival-day guests belong on the check-ins tab.
  return unitBookings.find((booking) => (
    occupiesCalendarDay(booking, dateStr)
    && bookingDay(booking.check_in_date) !== day
    && bookingDay(booking.check_out_date) !== day
  )) || null;
}

export function collectOccupiedDutyRows(bookings, units, dateStr) {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  const day = bookingDay(dateStr);
  const active = (bookings || []).filter((booking) => (
    isListedBooking(booking) && booking.booking_status !== 'CHECKED_OUT'
  ));
  const arrivingToday = new Set(
    active
      .filter((booking) => bookingDay(booking.check_in_date) === day)
      .map((booking) => booking.unit_id)
  );
  const rows = [];
  for (const unit of (units || [])) {
    if (!unit?.id || !isEffectivelyOccupied(unit, bookings, dateStr)) continue;
    // Arrival-day units stay on כניסות — don't also list them under מאוכלסים.
    if (arrivingToday.has(unit.id)) continue;
    const unitBookings = active.filter((booking) => booking.unit_id === unit.id);
    const booking = preferredOccupiedBooking(unitBookings, dateStr);
    if (booking) {
      rows.push(toDutyRow(booking, unitsById, booking.check_out_date));
      continue;
    }
    // Staff marked occupied without a matching booking row.
    const unitName = unit.name || unitFullName(unit.id, unit.id);
    rows.push({
      bookingId: `occupied:${unit.id}`,
      unitId: unit.id,
      unitName,
      area: dutyPrintAreaOf(unit.id, unitName),
      sort: Number.isFinite(Number(unit.sort_order)) ? Number(unit.sort_order) : 999,
      guest: 'מאוכלס',
      phone: '',
      otherDate: '',
      nights: 0,
      people: { adults: 0, children: 0, infants: 0, total: 0, label: '' },
      peopleLabel: '',
      guestTotal: 0,
      needsCrib: false,
      peopleKey: unit.id,
      checkoutHour: '',
      checkinHour: '',
      occupied: true
    });
  }
  return rows.sort((a, b) => a.sort - b.sort || a.unitName.localeCompare(b.unitName, 'he'));
}

/** Unit ids with both a checkout and a check-in on the same calendar day. */
export function turnaroundUnitIds(bookings, dateStr) {
  const leaving = new Set(collectRows(bookings, [], dateStr, 'check_out_date').map((row) => row.unitId));
  const arriving = new Set(collectRows(bookings, [], dateStr, 'check_in_date').map((row) => row.unitId));
  return new Set([...leaving].filter((id) => arriving.has(id)));
}

function inAssignedUnits(unitId, unitIds) {
  if (!Array.isArray(unitIds) || !unitIds.length) return true;
  return unitIds.includes(unitId);
}

function isDirtyVacant(unit, bookings, dateStr) {
  const ops = String(unit?.operational_status || '').toUpperCase();
  if (ops !== 'DIRTY' && ops !== 'IN_PROGRESS') return false;
  return !isEffectivelyOccupied(unit, bookings, dateStr);
}

function cabinShortName(unitId, unitName) {
  const sign = getUnitSign(unitId);
  if (sign?.he) return stripLegendBadge(sign.he);
  const full = stripLegendBadge(unitName || unitFullName(unitId, unitId));
  const parts = full.split('·').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || full;
}

const COMPLEX_ORDER = [
  'גבעת יואב / מיאליס',
  'קאסה נובה · נוב',
  'בתי נורית · רמות',
  "טאג' מאהל · רמות",
  'מול הנוף · רמות',
  'נופים בלבן · רמות',
  'בקתות טוסקנה · רמות',
  'החצר המוסיקלית · רמות',
  'בקתות מאיה · רמות',
  'סייסטה · רמות',
  'יחידות נוספות'
];

function groupJobsByComplex(jobs) {
  const buckets = new Map();
  for (const job of jobs) {
    const title = job.group || 'יחידות נוספות';
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title).push(job);
  }
  const kindRank = { leftover_in: 0, leftover: 1, turnover: 2, checkout: 3, checkin: 4 };
  for (const rows of buckets.values()) {
    rows.sort((a, b) => (
      (kindRank[a.kind] - kindRank[b.kind])
      || a.sort - b.sort
      || a.cabinName.localeCompare(b.cabinName, 'he')
    ));
  }
  const urgency = (title) => {
    const rows = buckets.get(title) || [];
    if (rows.some((job) => job.kind === 'leftover_in')) return 0;
    if (rows.some((job) => job.kind === 'leftover')) return 1;
    return 2;
  };
  const titles = [...buckets.keys()].sort((a, b) => {
    const ua = urgency(a);
    const ub = urgency(b);
    if (ua !== ub) return ua - ub;
    const ia = COMPLEX_ORDER.indexOf(a);
    const ib = COMPLEX_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'he');
  });
  return titles.map((title) => ({ title, rows: buckets.get(title) }));
}

/**
 * One cleaning job per cabin. Leftover dirty+vacant with a check-in today comes first.
 * `unitIds` is the future team assignment — empty means the whole roster.
 */
export function collectHousekeepingDutyJobs({ bookings, units, dateStr, area = 'all', unitIds } = {}) {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  const checkouts = collectRows(bookings, units, dateStr, 'check_out_date', area)
    .filter((row) => inAssignedUnits(row.unitId, unitIds));
  const checkins = collectRows(bookings, units, dateStr, 'check_in_date', area)
    .filter((row) => inAssignedUnits(row.unitId, unitIds));
  const outByUnit = new Map(checkouts.map((row) => [row.unitId, row]));
  const inByUnit = new Map(checkins.map((row) => [row.unitId, row]));
  const jobs = [];
  const seen = new Set();

  const pushJob = (unitId, kind, leaving, arriving, unit) => {
    if (!unitId || seen.has(unitId)) return;
    const unitName = stripLegendBadge(unit?.name || leaving?.unitName || arriving?.unitName || unitFullName(unitId, unitId));
    if (!inPrintArea({ unitId, unitName, area: dutyPrintAreaOf(unitId, unitName) }, area)) return;
    seen.add(unitId);
    jobs.push({
      unitId,
      unitName,
      cabinName: cabinShortName(unitId, unitName),
      group: unitGroup(unitId, unitName),
      sort: Number.isFinite(Number(unit?.sort_order)) ? Number(unit.sort_order) : (leaving?.sort || arriving?.sort || 999),
      lockbox: lockboxCodeForUnit(unit || { id: unitId }),
      kind,
      checkoutHour: leaving?.checkoutHour || '',
      checkinHour: arriving?.checkinHour || '',
      leftover: kind === 'leftover_in' || kind === 'leftover',
      people: (arriving || leaving)?.people || { adults: 0, children: 0, infants: 0, total: 0, label: '' },
      needsCrib: Boolean(arriving?.needsCrib || (!arriving && leaving?.needsCrib))
    });
  };

  for (const unit of (units || [])) {
    if (!unit?.id || !inAssignedUnits(unit.id, unitIds)) continue;
    if (!isDirtyVacant(unit, bookings, dateStr)) continue;
    const leaving = outByUnit.get(unit.id) || null;
    if (leaving) continue;
    const arriving = inByUnit.get(unit.id) || null;
    pushJob(unit.id, arriving ? 'leftover_in' : 'leftover', null, arriving, unit);
  }

  for (const row of [...checkouts, ...checkins]) {
    if (seen.has(row.unitId)) continue;
    const leaving = outByUnit.get(row.unitId) || null;
    const arriving = inByUnit.get(row.unitId) || null;
    const unit = unitsById.get(row.unitId) || { id: row.unitId, name: row.unitName };
    if (!leaving && arriving) {
      const ops = String(unit.operational_status || '').toUpperCase();
      if (ops === 'READY') continue;
    }
    const kind = leaving && arriving ? 'turnover' : (leaving ? 'checkout' : 'checkin');
    pushJob(row.unitId, kind, leaving, arriving, unit);
  }

  const kindRank = { leftover_in: 0, leftover: 1, turnover: 2, checkout: 3, checkin: 4 };
  return jobs.sort((a, b) => (
    (kindRank[a.kind] - kindRank[b.kind])
    || a.sort - b.sort
    || a.cabinName.localeCompare(b.cabinName, 'he')
  ));
}

function lockboxLine(job) {
  return job.lockbox ? `כספת מפתח ${job.lockbox}` : 'כספת מפתח חסרה';
}

function checkoutHourLabel(hour) {
  const raw = String(hour || '11:00').trim() || '11:00';
  return raw.replace(/^0/, '').replace(/:00$/, '') || '11';
}

function peopleLine(job) {
  const people = job.people || {};
  const parts = [];
  if (people.adults > 0) parts.push(hebrewCount(people.adults, 'מבוגר', 'מבוגרים'));
  if (people.children > 0) parts.push(hebrewCount(people.children, 'ילד', 'ילדים'));
  if (people.infants > 0) parts.push(hebrewCount(people.infants, 'תינוק', 'תינוקות'));
  if (job.needsCrib) parts.push('מיטת תינוק');
  return parts.join(' · ');
}

function formatHousekeepingJob(job, index) {
  const lines = [`${index}. ${job.cabinName || job.unitName}`];
  const bits = [];
  if (job.kind === 'checkout' || job.kind === 'turnover') {
    bits.push(`יציאה ב-${checkoutHourLabel(job.checkoutHour)}`);
  }
  if (job.kind === 'leftover_in' || job.kind === 'leftover') {
    bits.push('מלוכלך ופנוי');
  }
  bits.push(lockboxLine(job));
  lines.push(bits.join(' · '));
  const guests = peopleLine(job);
  if (guests) lines.push(guests);
  return lines.join('\n');
}

function formatComplexBlocks(jobs) {
  return groupJobsByComplex(jobs).map((group) => (
    `*${group.title}*\n${group.rows.map((job, i) => formatHousekeepingJob(job, i + 1)).join('\n\n')}`
  )).join('\n\n');
}

export function buildHousekeepingWhatsAppText({
  bookings,
  units,
  dateStr,
  area = 'all',
  unitIds,
  teamName = ''
} = {}) {
  const jobs = collectHousekeepingDutyJobs({ bookings, units, dateStr, area, unitIds });
  const dateLabel = hebrewDateLabel(dateStr);
  const areaLabel = area && area !== 'all' ? dutyPrintAreaLabel(area) : '';
  const headerBits = ['ניקיון היום', dateLabel, areaLabel, teamName].filter(Boolean);
  if (!jobs.length) {
    return `${headerBits.join(' · ')}\nאין בקתות לניקיון.`;
  }
  return `${headerBits.join(' · ')}\nסה״כ ${jobs.length} בקתות לניקיון\n\n${formatComplexBlocks(jobs)}`;
}

export async function shareHousekeepingWhatsApp(text) {
  const message = String(text || '').trim();
  if (!message) return { ok: false, copied: false };
  const encoded = encodeURIComponent(message);
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
      copied = true;
    }
  } catch {
    copied = false;
  }
  const url = `https://api.whatsapp.com/send/?text=${encoded}`;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) window.location.assign(url);
  return { ok: true, copied };
}

function hebrewCount(count, one, many) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return '';
  return `${n} ${n === 1 ? one : many}`;
}

export function bookingGuestCounts(booking) {
  const extra = String(booking?.special_requests || '');
  const parsed = extra.match(/pax:(\d+)\+(\d+)\+(\d+)/);
  let adults = Math.max(0, Number(booking?.adults_count) || 0);
  let children = Math.max(0, Number(booking?.children_count) || 0);
  let infants = Math.max(0, Number(booking?.infants_count) || 0);
  if (parsed) {
    adults = Number(parsed[1]) || 0;
    children = Number(parsed[2]) || 0;
    infants = Number(parsed[3]) || 0;
  }
  const total = adults + children + infants;
  return { adults, children, infants, total };
}

function guestPeople(booking) {
  const counts = bookingGuestCounts(booking);
  if (counts.total <= 0) return { ...counts, label: '—' };
  const parts = [
    hebrewCount(counts.adults, 'מבוגר', 'מבוגרים'),
    hebrewCount(counts.children, 'ילד', 'ילדים'),
    hebrewCount(counts.infants, 'תינוק', 'תינוקות')
  ].filter(Boolean);
  return { ...counts, label: parts.join(' · ') };
}

export function bookingPeopleLabel(booking) {
  return guestPeople(booking).label;
}

export function guestCardFirstName(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'אורח';
  return raw.split(' ')[0];
}

export function bookingHasCrib(booking) {
  if (booking?.baby_cot_required || booking?.stay?.baby_cot_required) return true;
  if (bookingGuestCounts(booking).infants > 0) return true;
  const extra = `${booking?.special_requests || ''} ${booking?.stay?.special_requests || ''}`;
  return /תינוק|לול|crib|cot|infant/i.test(extra);
}

export function bookingGuestHeadcount(booking) {
  const counts = bookingGuestCounts(booking);
  return Math.max(0, counts.adults + counts.children);
}

function groupRows(rows) {
  const groups = [];
  const index = new Map();
  for (const row of rows) {
    const title = unitGroup(row.unitId, row.unitName);
    if (!index.has(title)) {
      const group = { title, rows: [] };
      index.set(title, group);
      groups.push(group);
    }
    index.get(title).rows.push(row);
  }
  return groups;
}

function tableHtml(groups, otherLabel, markA, markB, { showPeople = false, hourField = '' } = {}) {
  let n = 0;
  if (!groups.length) {
    return '<p class="empty">אין שורות ליום הזה</p>';
  }
  const peopleHead = showPeople ? '<th>אנשים</th>' : '';
  const hourHead = hourField ? '<th>שעה</th>' : '';
  return groups.map((group) => {
    const body = group.rows.map((row) => {
      n += 1;
      const peopleCell = showPeople ? `<td class="people">${esc(row.people?.label || '—')}</td>` : '';
      const hourCell = hourField
        ? `<td class="hour">${esc(row[hourField] || '—')}</td>`
        : '';
      return `<tr>
        <td class="num">${n}</td>
        <td class="unit">${esc(row.unitName)}</td>
        <td>${esc(row.guest)}</td>
        <td class="phone">${esc(row.phone || '—')}</td>
        ${peopleCell}
        ${hourCell}
        <td>${esc(row.otherDate)}</td>
        <td>${row.nights}</td>
        <td class="box"></td>
        <td class="box"></td>
      </tr>`;
    }).join('');
    return `<h2>${esc(group.title)} <span>${group.rows.length}</span></h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>יחידה</th>
            <th>אורח</th>
            <th>טלפון</th>
            ${peopleHead}
            ${hourHead}
            <th>${esc(otherLabel)}</th>
            <th>לילות</th>
            <th>${esc(markA)}</th>
            <th>${esc(markB)}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>`;
  }).join('');
}

function reportCss() {
  return `
    :root { font-family: "Helvetica Neue", Arial, sans-serif; color: #1c1917; }
    body { margin: 24px; background: #fff; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1c1917; padding-bottom: 12px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 22px; }
    .sub { margin-top: 4px; font-size: 14px; }
    .meta { font-size: 13px; color: #57534e; text-align: left; }
    .actions { margin: 0 0 16px; }
    button { font: inherit; font-weight: 700; padding: 8px 14px; border: 1px solid #1c1917; background: #1c1917; color: #fff; border-radius: 8px; cursor: pointer; }
    h2 { font-size: 14px; margin: 18px 0 8px; display: flex; gap: 8px; align-items: baseline; }
    h2 span { font-weight: 600; color: #78716c; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e7e5e4; padding: 7px 6px; text-align: right; }
    th { font-size: 11px; letter-spacing: .04em; color: #78716c; font-weight: 700; }
    .num { width: 28px; color: #78716c; }
    .unit { font-weight: 700; }
    .phone { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    .people { font-weight: 700; text-align: center; }
    .hour { font-weight: 800; white-space: nowrap; }
    .box { width: 42px; }
    .box::after { content: ""; display: inline-block; width: 14px; height: 14px; border: 1.5px solid #1c1917; border-radius: 3px; vertical-align: middle; }
    .empty { color: #78716c; }
    .block + .block { margin-top: 28px; padding-top: 8px; border-top: 1px solid #e7e5e4; }
    footer { margin-top: 22px; font-size: 12px; color: #78716c; }
    @media print {
      body { margin: 12mm; }
      .actions { display: none; }
      tr { break-inside: avoid; }
    }
  `;
}

export function dailyDutyCounts(bookings, units, dateStr, area = '') {
  return {
    checkouts: collectRows(bookings, units, dateStr, 'check_out_date', area).length,
    checkins: collectRows(bookings, units, dateStr, 'check_in_date', area).length,
    occupying: collectOccupying(bookings, units, dateStr, area).length
  };
}

export function buildDailyDutyHtml({ dateStr, kind, bookings, units, area = 'all' }) {
  const label = hebrewDateLabel(dateStr);
  const areaLabel = dutyPrintAreaLabel(area);
  const checkouts = collectRows(bookings, units, dateStr, 'check_out_date', area);
  const checkins = collectRows(bookings, units, dateStr, 'check_in_date', area);
  const showOut = kind === 'checkouts' || kind === 'both';
  const showIn = kind === 'checkins' || kind === 'both';
  const title = kind === 'checkins'
    ? `כניסות · ${areaLabel} · ${label}`
    : kind === 'checkouts'
      ? `יציאות · ${areaLabel} · ${label}`
      : `דוח יומי · ${areaLabel} · ${label}`;
  const counts = [];
  if (showOut) counts.push(`${checkouts.length} יציאות`);
  if (showIn) {
    const seen = new Set();
    let people = 0;
    for (const row of checkins) {
      const key = row.peopleKey || `${row.unitId}:${row.guest}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people += row.people?.total || 0;
    }
    counts.push(`${checkins.length} כניסות`);
    counts.push(`${people} אנשים`);
  }

  let body = '';
  if (showOut) {
    body += `<section class="block"><h1>יציאות · שעת יציאה לפי הזמנה</h1>${tableHtml(groupRows(checkouts), 'כניסה', 'יצאו', 'נקי', { hourField: 'checkoutHour' })}</section>`;
  }
  if (showIn) {
    body += `<section class="block"><h1>כניסות · צ׳ק-אין אחה״צ</h1>${tableHtml(groupRows(checkins), 'יציאה', 'הגיעו', 'מוכן', { showPeople: true })}</section>`;
  }

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${reportCss()}</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">הדפסה</button></div>
  <header>
    <div>
      <h1>${esc(title)}</h1>
      <div class="sub">${esc([areaLabel, ...counts].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="meta">ResortOS</div>
  </header>
  ${body}
  <footer>הופק מיומן ResortOS · ${esc(label)}</footer>
</body>
</html>`;
}

export function printDailyDutyReport(options) {
  const html = buildDailyDutyHtml(options);
  const popup = window.open('', '_blank', 'width=900,height=800');
  if (!popup) {
    window.alert('צריך לאשר חלון קופץ כדי להדפיס את הדוח.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
  popup.focus();
  window.setTimeout(() => {
    try { popup.print(); } catch (_) {}
  }, 250);
}
