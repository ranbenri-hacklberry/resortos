import { israelToday } from './cabinAccess';
import { formatStayHourLabel, stayHoursFromBooking } from './kinorotStayHours';
import { unitFullName } from './units';
import { isUnavailableHoldBooking } from './unavailableHold';

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
  { id: 'givat', label: 'גבעה / נוב / נאות גולן' }
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

function toDutyRow(booking, unitsById, otherDate) {
  const unit = unitsById.get(booking.unit_id);
  const unitName = unit?.name || unitFullName(booking.unit_id, booking.unit_id);
  return {
    unitId: booking.unit_id,
    unitName,
    area: dutyPrintAreaOf(booking.unit_id, unitName),
    sort: Number.isFinite(Number(unit?.sort_order)) ? Number(unit.sort_order) : 999,
    guest: booking.guest_name || '',
    phone: formatPhone(booking.guest_phone),
    otherDate: shortDate(otherDate),
    nights: nightsBetween(booking.check_in_date, booking.check_out_date),
    people: guestPeople(booking),
    peopleKey: String(booking.id || '').replace(/^kin_[^_]+_/, '') || booking.id,
    checkoutHour: formatStayHourLabel(stayHoursFromBooking(booking).checkout),
    checkinHour: formatStayHourLabel(stayHoursFromBooking(booking).checkin)
  };
}

function inPrintArea(row, area) {
  return !area || area === 'all' || row.area === area;
}

function collectRows(bookings, units, dateStr, field, area = '') {
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

function occupiesCalendarDay(booking, dateStr) {
  if (!isListedBooking(booking) || booking.booking_status === 'CHECKED_OUT') return false;
  const day = bookingDay(dateStr);
  const cin = bookingDay(booking.check_in_date);
  const cout = bookingDay(booking.check_out_date);
  return Boolean(cin && cout && day >= cin && day < cout);
}

function collectOccupying(bookings, units, dateStr, area = '') {
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  return (bookings || [])
    .filter((booking) => occupiesCalendarDay(booking, dateStr))
    .map((booking) => toDutyRow(booking, unitsById, booking.check_out_date))
    .filter((row) => inPrintArea(row, area))
    .sort((a, b) => a.sort - b.sort || a.unitName.localeCompare(b.unitName, 'he'));
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
