import { formatIlsFromAgorot, normalizeClearingPayment } from './clearingPayments';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayOf(payment) {
  return String(payment?.date || payment?.collected_at || '').slice(0, 10);
}

function isCashPayment(payment) {
  const source = String(payment?.source || '').toUpperCase();
  const key = String(payment?.accountKey || '').toUpperCase();
  return source === 'CASH' || key === 'CASH';
}

export function cashPaymentsOnDate(bookings, units, dateStr) {
  const day = String(dateStr || '').slice(0, 10);
  const rows = [];
  for (const booking of bookings || []) {
    if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') continue;
    const stored = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
    const unit = (units || []).find((row) => row.id === booking.unit_id);
    for (const raw of stored) {
      const payment = normalizeClearingPayment(raw);
      if (!isCashPayment(payment) || dayOf(payment) !== day) continue;
      if (!(Number(payment.amount_agorot) > 0)) continue;
      rows.push({
        payerName: payment.payer_name || booking.guest_name || '',
        payerId: payment.payer_id || '',
        guestName: booking.guest_name || '',
        unitName: unit?.name || booking.unit_id || '',
        amountAgorot: Number(payment.amount_agorot),
        collector: payment.collector || '',
        at: payment.collected_at || payment.date || ''
      });
    }
  }
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return rows;
}

export function cashDayTotalAgorot(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.amountAgorot) || 0), 0);
}

function displayDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso || '';
  return `${Number(match[3])}.${Number(match[2])}.${match[1]}`;
}

export function buildCashDayReportHtml(bookings, units, dateStr) {
  const rows = cashPaymentsOnDate(bookings, units, dateStr);
  const total = cashDayTotalAgorot(rows);
  const body = rows.length
    ? rows.map((row) => `<tr>
      <td>${esc(row.payerName || '—')}</td>
      <td dir="ltr">${esc(row.payerId || '—')}</td>
      <td>${esc(formatIlsFromAgorot(row.amountAgorot))}</td>
      <td>${esc(row.unitName || '—')}</td>
      <td>${esc(row.guestName && row.guestName !== row.payerName ? row.guestName : '')}</td>
      <td>${esc(row.collector || '')}</td>
    </tr>`).join('')
    : '<tr><td colspan="6">אין תשלומי מזומן ביום הזה</td></tr>';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>מזומן ${esc(displayDate(dateStr))}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 26px; margin: 0; }
    p { font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #222; padding: 8px 10px; text-align: right; font-size: 16px; }
    th { background: #f3f4f6; }
    tfoot td { font-weight: 900; font-size: 18px; }
    button { margin-top: 16px; font: inherit; font-weight: 700; padding: 8px 14px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>דוח מזומן יומי</h1>
  <p>${esc(displayDate(dateStr))} · ${rows.length} תשלומים</p>
  <table>
    <thead>
      <tr><th>שם המשלם</th><th>תעודת זהות</th><th>סכום</th><th>חדר</th><th>אורח</th><th>גבה</th></tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="2">סה״כ</td><td>${esc(formatIlsFromAgorot(total))}</td><td colspan="3"></td></tr></tfoot>
  </table>
  <button type="button" onclick="print()">הדפסה</button>
</body>
</html>`;
}

export function printCashDayReport(bookings, units, dateStr) {
  const html = buildCashDayReportHtml(bookings, units, dateStr);
  const popup = window.open('', '_blank', 'width=900,height=800');
  if (!popup) {
    window.alert('צריך לאשר חלון קופץ כדי להפיק את דוח המזומן.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
  popup.focus();
}
