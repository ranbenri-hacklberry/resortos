import { dueAgorotOf, isFullyPaid, kinorotSettlementKind } from './bookingPaid';
import { isBookingComBooking } from './kinorotChannel';
import { bookingGuestCounts } from './dailyDutyReport';
import { lockboxCodeForUnit } from './guestProfileSeed';
import { isUnavailableHoldBooking } from './unavailableHold';
import { formatStayHourLabel, stayHoursFromBooking } from './kinorotStayHours';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ymd(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function displayDate(value) {
  const match = ymd(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${Number(match[3])}/${Number(match[2])}/${match[1].slice(2)}`;
}

function nightsOf(booking) {
  const start = ymd(booking?.check_in_date);
  const end = ymd(booking?.check_out_date);
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function kinorotResid(booking) {
  const match = String(booking?.special_requests || '').match(/kinorot:(\d+)/);
  return match ? match[1] : '';
}

export function guestNotes(booking) {
  return String(booking?.special_requests || '')
    .replace(/kinorot:\d+/g, '')
    .replace(/\|pax:\d+\+\d+\+\d+/g, '')
    .replace(/\|pay:[a-z_]+/gi, '')
    .replace(/\|(?:in|out):[^|]*/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ils(agorot) {
  const n = Math.round(Number(agorot) || 0) / 100;
  if (!n) return '';
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
}

function roomKind(unit) {
  const name = `${unit?.name || ''} ${unit?.unit_type || ''}`;
  if (/סוויט/.test(name) || String(unit?.unit_type || '') === 'suite') return 'suite';
  return 'room';
}

function roomLabel(unit, fallbackId) {
  const name = String(unit?.name || fallbackId || '').trim();
  const code = lockboxCodeForUnit(unit);
  if (code && name) return `${name} · כספת ${code}`;
  if (code) return `כספת ${code}`;
  return name;
}

function paymentKind(booking) {
  const mode = String(booking?.payment_mode || '');
  const notes = String(booking?.special_requests || '');
  const payments = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  const sourceOf = (row) => `${row?.source || ''} ${row?.accountKey || ''} ${row?.accountLabel || ''}`.toUpperCase();
  const cashRecorded = payments.some((row) => sourceOf(row).includes('CASH') || String(row?.accountLabel || '').includes('מזומן'));
  const cardRecorded = Boolean(booking?.stay?.hyp?.paid)
    || payments.some((row) => /HYP|CARD|MAX|DESK|אשראי/.test(sourceOf(row)));
  if (kinorotSettlementKind(booking) === 'voucher' || mode === 'VOUCHER' || /\|pay:voucher\b/.test(notes)) {
    return { payKind: 'voucher', cashReceived: false };
  }
  const cashExpected = mode === 'CASH'
    || mode === 'CASH_TRUST'
    || booking?.payment_status === 'PENDING_CASH'
    || /מזומן/.test(notes)
    || /\|pay:cash\b/i.test(notes);
  if (cashExpected) return { payKind: 'cash', cashReceived: isFullyPaid(booking) && cashRecorded };
  const cardExpected = cardRecorded
    || mode === 'CARD'
    || mode === 'CREDIT_FULL'
    || mode === 'CREDIT_DEPOSIT'
    || /אשראי/.test(notes);
  if (isFullyPaid(booking) && cardExpected) return { payKind: 'card', cashReceived: false };
  return { payKind: '', cashReceived: false };
}

function liveStay(booking) {
  return Boolean(
    booking
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(booking)
  );
}

export function guestFileFacts(booking, { units = [], bookings = [] } = {}) {
  const unit = (units || []).find((row) => row.id === booking?.unit_id) || null;
  const resid = kinorotResid(booking);
  const related = (bookings || []).filter((row) => (
    liveStay(row)
    && resid
    && kinorotResid(row) === resid
    && ymd(row.check_in_date) === ymd(booking?.check_in_date)
    && ymd(row.check_out_date) === ymd(booking?.check_out_date)
  ));
  const rooms = related.length ? related : (liveStay(booking) ? [booking] : []);
  const roomNames = rooms.map((row) => {
    const match = (units || []).find((unitRow) => unitRow.id === row.unit_id);
    return roomLabel(match, row.unit_id);
  }).filter(Boolean);
  const counts = bookingGuestCounts(booking);
  const notes = guestNotes(booking);
  const due = dueAgorotOf(booking);
  const total = Number(booking?.total_price_agorot) || 0;
  const settlement = kinorotSettlementKind(booking);
  const paid = isFullyPaid(booking);
  const pay = paymentKind(booking);
  const hours = stayHoursFromBooking(booking);
  return {
    guestName: String(booking?.guest_name || '').trim(),
    phone: String(booking?.guest_phone || '').trim(),
    nights: nightsOf(booking),
    guests: counts.total,
    roomCount: roomNames.length || 1,
    arrival: displayDate(booking?.check_in_date),
    departure: displayDate(booking?.check_out_date),
    checkInHour: formatStayHourLabel(hours.checkin),
    checkOutHour: formatStayHourLabel(hours.checkout),
    roomKind: roomKind(unit),
    roomNames,
    notes,
    breakfast: /ארוחת בוקר/.test(notes),
    bookingCom: isBookingComBooking(booking),
    paid,
    settlement,
    amount: ils(due > 0 ? due : total),
    dueLabel: due > 0 ? 'לתשלום בהגעה' : (total > 0 || settlement ? 'שולם' : ''),
    payKind: pay.payKind,
    cashReceived: pay.cashReceived
  };
}

function box(on) {
  return on ? '☑' : '☐';
}

export function buildGuestFileHtml(booking, context = {}) {
  const facts = guestFileFacts(booking, context);
  const kind = facts.roomKind;
  const amountLine = [facts.dueLabel, facts.amount].filter(Boolean).join(' · ') || '—';
  const rooms = facts.roomNames.join(' · ') || '—';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>תיק אורח · ${esc(facts.guestName || 'אורח')}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 26px; margin: 0; }
    .hint { font-size: 14px; margin-top: 4px; }
    .room-line { font-size: 28px; font-weight: 900; line-height: 1.25; margin: 12px 0 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    section { border: 1px solid #222; padding: 10px 12px; }
    h2 { font-size: 16px; margin: 0 0 8px; }
    p { margin: 4px 0; font-size: 14px; line-height: 1.45; }
    .guest-facts { font-size: 20px; }
    .guest-facts h2 { font-size: 20px; }
    .line { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #ddd; padding: 5px 0; font-size: 20px; }
    .line b { font-size: 22px; }
    .muted { color: #444; font-size: 13px; }
    .cash-due { font-size: 26px; font-weight: 900; line-height: 1.3; margin: 8px 0; }
    .paid-card { font-size: 22px; font-weight: 900; }
    .checkin { font-size: 20px; font-weight: 800; }
    .checkin h2, .checkin p { font-size: 20px; font-weight: 800; }
    .checks { margin-top: 8px; }
    .notes-split { display: flex; flex-direction: column; height: 100%; padding: 0; box-sizing: border-box; }
    .notes-top, .notes-bottom { flex: 1; padding: 10px 12px; }
    .notes-bottom { border-top: 1px solid #222; font-size: 20px; font-weight: 800; display: flex; align-items: center; }
    button { margin-top: 16px; font: inherit; font-weight: 700; padding: 8px 14px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>תיק אורח</h1>
  <div class="hint">יש לפתוח תיק זה יום לפני הגעת האורח</div>
  <p class="room-line">מספר חדר סופי: ${esc(rooms)}</p>
  <div class="grid">
    <section class="guest-facts">
      <h2>1. פרטי אורח</h2>
      <div class="line"><span>שם</span><b>${esc(facts.guestName || '—')}</b></div>
      <div class="line"><span>מספר טלפון</span><b dir="ltr">${esc(facts.phone || '—')}</b></div>
      <div class="line"><span>מספר לילות</span><b>${facts.nights || '—'}</b></div>
      <div class="line"><span>כמות אורחים</span><b>${facts.guests || '—'}</b></div>
      <div class="line"><span>כמות חדרים</span><b>${facts.roomCount}</b></div>
      <div class="line"><span>תאריך הגעה</span><b>${esc(facts.arrival || '—')}</b></div>
      <div class="line"><span>שעת כניסה</span><b>${esc(facts.checkInHour || '—')}</b></div>
      <div class="line"><span>תאריך עזיבה</span><b>${esc(facts.departure || '—')}</b></div>
      <div class="line"><span>שעת יציאה</span><b>${esc(facts.checkOutHour || '—')}</b></div>
    </section>
    <section>
      <h2>2. פרטי הזמנה</h2>
      <p>היקף סוג חדר: ${box(kind === 'room')} חדר &nbsp; ${box(false)} מרפסת &nbsp; ${box(kind === 'suite')} סוויטה</p>
      <p class="muted">${box(false)} אישור הזמנה מצורף</p>
    </section>
  </div>
  <section style="margin-top:12px">
    <h2>3. פרטי תשלום</h2>
    ${facts.bookingCom ? '<p>ההזמנה מבוקינג. יש להוסיף מע״מ ולכתוב את הסכום.</p>' : ''}
    ${facts.payKind === 'voucher' ? '<p class="paid-card">שובר נפדה</p>' : ''}
    ${facts.payKind === 'card' ? `<p class="paid-card">שולם באשראי${facts.amount ? ` · ${esc(facts.amount)}` : ''}</p>` : ''}
    ${facts.payKind === 'cash' ? `<p class="cash-due">${box(facts.cashReceived)} צריך לקבל מזומן מהלקוח${facts.amount ? ` · ${esc(facts.amount)}` : ''}</p>` : ''}
    ${facts.payKind === '' ? `<p><b>הסכום שהלקוח צריך לשלם:</b> ${esc(amountLine)}</p>` : ''}
  </section>
  <div class="grid">
    <section>
      <h2>4. משימות בוקר לפני הגעת האורח</h2>
      <p>${box(false)} בבוקר ההגעה לשלוח: «היי, מצפים להגעה שלכם היום! מהי שעת ההגעה המשוערת?»</p>
      <p class="muted">תשובת האורח: ________________</p>
      <p>${box(false)} להעביר למנהל התפעול צ׳ק ליסט «נוהל בדיקת חדר»</p>
      <p>${box(false)} קיבלתי בחזרה את הצ׳ק ליסט, אין תקלות, צורף לתיק</p>
      <p>${box(facts.roomNames.length > 0)} חדרים משויכים: ${esc(rooms)}</p>
      <p class="muted">האורח בחר חדר: ________________</p>
    </section>
    <section class="notes-split">
      <div class="notes-top">
        <h2>5. הערות / הבטחות</h2>
        <p>${esc(facts.notes || '—')}</p>
      </div>
      <div class="notes-bottom">${box(facts.breakfast)} ארוחת בוקר</div>
    </section>
  </div>
  <section class="checkin" style="margin-top:12px">
    <h2>6. צ׳ק אין — נוהל הגעת אורח</h2>
    <p>${box(false)} שירות עם חיוך, להציע שתייה, לשבת בלובי</p>
    <p>${box(false)} להציג את המחיר לפני החיוב</p>
    <p class="checks">${box(facts.paid)} סגירת תשלום &nbsp; ${box(false)} צילום ת.ז &nbsp; ${box(false)} צירוף לתיק &nbsp; ${box(false)} קבלת החדר + קבלה</p>
  </section>
  <button type="button" onclick="print()">הדפסה</button>
</body>
</html>`;
}

export function printGuestFile(booking, context = {}) {
  const html = buildGuestFileHtml(booking, context);
  const popup = window.open('', '_blank', 'width=900,height=800');
  if (!popup) {
    window.alert('צריך לאשר חלון קופץ כדי לפתוח את תיק האורח.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
  popup.focus();
}
