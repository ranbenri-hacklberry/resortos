import { formatIlsFromAgorot, normalizeClearingPayment } from './clearingPayments';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayOf(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : String(dateStr).slice(0, 10);
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(iso);
  return `${Number(match[3])}/${Number(match[2])}`;
}

function formatNumber(num) {
  const val = Math.round(Number(num) || 0);
  return val.toLocaleString('he-IL');
}

function isCashPayment(payment) {
  const source = String(payment?.source || '').toUpperCase();
  const key = String(payment?.accountKey || '').toUpperCase();
  return source === 'CASH' || key === 'CASH';
}

function getComplexName(unitName = '', unitId = '') {
  const name = String(unitName || '');
  const id = String(unitId || '');
  if (name.includes('מול הנוף') || id.startsWith('k681') || id.startsWith('k682') || id.startsWith('k683') || id.startsWith('k684')) return 'מול הנוף';
  if (name.includes('טוסקנה') || id.startsWith('k687') || id.startsWith('k688') || id.startsWith('k689')) return 'טוסקנה';
  if (name.includes('טאג') || id.startsWith('k811') || id.startsWith('k812')) return 'טאג׳ מהאל';
  if (name.includes('מאיה') || id.startsWith('k693') || id.startsWith('k694')) return 'בקתות מאיה';
  if (name.includes('נורית') || id.startsWith('k685') || id.startsWith('k686')) return 'בתי נורית';
  if (name.includes('נופים בלבן') || id.startsWith('k801') || id.startsWith('k802')) return 'נופים בלבן';
  if (name.includes('חצר מוסיקלית')) return 'חצר מוסיקלית';
  if (name.includes('כיפת שמיים')) return 'כיפת שמיים';
  if (name.includes('צימר בגבעה')) return 'צימר בגבעה';
  if (name.includes('קאסה נובה')) return 'קאסה נובה';
  if (name.includes('מיאליס')) return 'מיאליס';
  return name.split('·')[0].split('-')[0].trim() || 'לא צוין';
}

export function extractAllCashBookings(bookings = [], units = []) {
  const unitMap = new Map((units || []).map((u) => [u.id, u]));
  const results = [];

  for (const booking of bookings || []) {
    if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') continue;

    const stored = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
    let cashAgorot = 0;
    let cardAgorot = 0;
    let cashDates = [];

    for (const raw of stored) {
      const p = normalizeClearingPayment(raw);
      const agorot = Number(p.amount_agorot) || 0;
      if (isCashPayment(p)) {
        cashAgorot += agorot;
        const d = dayOf(p.collected_at || p.date);
        if (d && !cashDates.includes(d)) cashDates.push(d);
      } else if (agorot > 0) {
        cardAgorot += agorot;
      }
    }

    const isCashMode = String(booking.payment_mode || '').toUpperCase() === 'CASH';
    const totalPrice = Math.round(Number(booking.total_price) || 0);
    const paidAmount = Math.round(Number(booking.paid_amount) || 0);

    if (isCashMode && cashAgorot === 0 && (paidAmount > 0 || totalPrice > 0)) {
      const amount = paidAmount > 0 ? paidAmount : totalPrice;
      cashAgorot = Math.round(amount * 100);
      const d = dayOf(booking.check_in_date);
      if (d && !cashDates.includes(d)) cashDates.push(d);
    }

    if (cashAgorot <= 0 && !isCashMode) continue;

    const unit = unitMap.get(booking.unit_id);
    const checkIn = dayOf(booking.check_in_date);
    const checkOut = dayOf(booking.check_out_date);
    const primaryDate = cashDates[0] || checkIn || '';

    // Calculate nights
    let nights = 1;
    if (checkIn && checkOut) {
      const dIn = new Date(checkIn);
      const dOut = new Date(checkOut);
      const diff = Math.round((dOut - dIn) / (1000 * 60 * 60 * 24));
      if (diff > 0) nights = diff;
    }

    const cashShekels = Math.round(cashAgorot / 100);
    const cardShekels = Math.round(cardAgorot / 100);
    const unitName = unit?.name || booking.unit_id || '';
    const complex = getComplexName(unitName, booking.unit_id);

    // Clean unit name and remove any kXXX symbols
    let cleanUnitName = unitName.replace(/\s*\([kK]\d+\)/gi, '').replace(/\s*[kK]\d+/gi, '').trim();
    let stayDetails = cleanUnitName;
    if (complex && !cleanUnitName.includes(complex)) {
      stayDetails = `${complex} · ${cleanUnitName}`;
    }
    if (nights > 1) {
      stayDetails += ` | ${nights} לילות`;
    }

    results.push({
      bookingId: booking.id,
      externalId: booking.external_booking_id || '',
      unitId: booking.unit_id || '',
      unitName,
      complex,
      stayDetails,
      checkIn,
      checkOut,
      primaryDate,
      guestName: booking.guest_name || 'אורח',
      guestPhone: booking.guest_phone || '',
      guestIdNumber: booking.guest_id_number || (stored.find((p) => p.payer_id)?.payer_id) || '',
      totalPrice,
      cashPaid: cashShekels,
      cardPaid: cardShekels,
      notes: booking.kinorot_notes || booking.internal_notes || ''
    });
  }

  results.sort((a, b) => (a.checkIn || a.primaryDate).localeCompare(b.checkIn || b.primaryDate));
  return results;
}

export function cashPaymentsOnDate(bookings = [], units = [], dateStr = '') {
  const day = dayOf(dateStr);
  const rows = [];
  for (const booking of bookings || []) {
    if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') continue;
    const stored = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
    const unit = (units || []).find((row) => row.id === booking.unit_id);
    for (const raw of stored) {
      const payment = normalizeClearingPayment(raw);
      if (!isCashPayment(payment) || dayOf(payment.date || payment.collected_at) !== day) continue;
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

export function cashDayTotalAgorot(rows = []) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.amountAgorot) || 0), 0);
}

export function buildCashDayReportHtml(bookings, units, initialDateStr = '') {
  const allRows = extractAllCashBookings(bookings, units);
  const initialDay = dayOf(initialDateStr);

  const datesSet = new Set();
  allRows.forEach((r) => {
    if (r.checkIn) datesSet.add(r.checkIn);
    if (r.primaryDate) datesSet.add(r.primaryDate);
  });
  const availableDates = Array.from(datesSet).sort();

  const initialDateHasRows = initialDay && allRows.some((r) => r.checkIn === initialDay || r.primaryDate === initialDay);
  const defaultSelection = initialDateHasRows ? initialDay : 'all';

  const rowsJson = JSON.stringify(allRows).replace(/</g, '\\u003c');
  const availableDatesJson = JSON.stringify(availableDates);

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>גביית מזומן · ResortOS</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media screen {
      .screen-bar {
        max-width: 820px;
        margin: 16px auto 12px auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #1e293b;
        color: #ffffff;
        padding: 10px 16px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .page-card {
        max-width: 820px;
        margin: 0 auto 32px auto;
        background: #ffffff;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        border-radius: 4px;
        overflow: hidden;
      }
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .page-card {
        box-shadow: none;
        margin: 0;
        border-radius: 0;
      }
    }

    .top-banner {
      background: #25394e;
      color: #ffffff;
      padding: 24px 36px;
      margin: 0 0 28px 0;
    }
    .banner-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0 0 8px 0;
    }
    .banner-subtitle {
      font-size: 13.5px;
      color: #9cb3c9;
      font-weight: 400;
      margin: 0;
    }

    .page-wrap {
      padding: 0 36px 36px 36px;
    }

    .section-title {
      font-size: 19px;
      font-weight: 800;
      color: #644a36;
      margin: 0 0 16px 0;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 8px;
      margin-bottom: 28px;
    }
    th {
      font-size: 12.5px;
      font-weight: 700;
      color: #1e293b;
      padding: 0 14px 6px 14px;
      text-align: right;
    }
    th.col-amount {
      text-align: left;
    }
    td {
      background: #e7e2dc;
      padding: 10px 14px;
      font-size: 12px;
      color: #1e293b;
      vertical-align: middle;
    }
    tr td:first-child {
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
    }
    tr td:last-child {
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
    }
    .guest-name {
      font-weight: 600;
    }
    .sub-id {
      font-size: 11px;
      color: #555555;
      margin-top: 2px;
    }
    .amount-val {
      font-size: 13.5px;
      font-weight: 700;
      text-align: left;
      direction: ltr;
    }

    .summary-section {
      margin-top: 24px;
      padding: 0 4px;
    }
    .summary-title {
      font-size: 17px;
      font-weight: 800;
      color: #2b2b2b;
      margin-bottom: 6px;
    }
    .grand-total {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .summary-count {
      font-size: 12.5px;
      color: #555555;
      margin-bottom: 24px;
    }
    .notes-title {
      font-size: 14px;
      font-weight: 800;
      color: #644a36;
      margin: 0 0 6px 0;
    }
    .notes-content {
      font-size: 11.5px;
      color: #444444;
      line-height: 1.6;
    }

    /* Screen toolbar controls */
    .tb-select {
      background: #334155;
      color: #ffffff;
      border: 1px solid #475569;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .tb-btn {
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .tb-btn:hover { background: #059669; }
    .tb-btn-close { background: #475569; margin-right: 8px; }
    .tb-btn-close:hover { background: #64748b; }
  </style>
</head>
<body>

  <div class="screen-bar no-print">
    <div>
      <label for="dateFilter" style="font-size: 12px; font-weight: 600; margin-left: 6px;">סינון מועד אירוח:</label>
      <select id="dateFilter" class="tb-select" onchange="renderReport(this.value)">
        <option value="all">כל תנועות המזומן בדוח (${allRows.length} יחידות)</option>
      </select>
    </div>
    <div>
      <button type="button" class="tb-btn" onclick="window.print()">🖨️ הדפסה / PDF</button>
      <button type="button" class="tb-btn tb-btn-close" onclick="window.close()">✕ סגור</button>
    </div>
  </div>

  <div class="page-card">
    <div class="top-banner">
      <div class="banner-title">גביית מזומן</div>
      <div class="banner-subtitle" id="bannerSubtitle">על פי רישומי המערכת</div>
    </div>

    <div class="page-wrap">
      <div class="section-title">פירוט הרשומות</div>

      <table>
        <thead>
          <tr>
            <th style="width: 80px;">תאריך</th>
            <th style="width: 260px;">מתחם ופרטי האירוח</th>
            <th>שם ותעודת זהות</th>
            <th class="col-amount" style="width: 120px;">סכום בש״ח</th>
          </tr>
        </thead>
        <tbody id="tableBody"></tbody>
      </table>

      <div class="summary-section">
        <div class="summary-title">סיכום כספי</div>
        <div class="grand-total" id="grandTotal">סך הכול: ₪${(Math.round(allRows.reduce((s, r) => s + (r.cashPaid || 0), 0))).toLocaleString('he-IL')} ש״ח</div>
        <div class="summary-count" id="summaryCount">${allRows.length} רשומות בדוח</div>

        <div class="notes-title">הערות</div>
        <div class="notes-content" id="notesContent">
          תשלומי מזומן נקלטו ועודכנו בתיקי ההזמנה במערכת ResortOS.
        </div>
      </div>
    </div>
  </div>

  <script>
    const allData = ${rowsJson};
    const availableDates = ${availableDatesJson};
    const defaultSelection = "${defaultSelection}";

    function formatNumber(num) {
      return (Math.round(num || 0)).toLocaleString('he-IL');
    }

    function formatDateShort(iso) {
      if (!iso) return '—';
      const m = String(iso).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
      if (!m) return iso;
      return Number(m[3]) + '/' + Number(m[2]);
    }

    function initDates() {
      const select = document.getElementById('dateFilter');
      availableDates.forEach(date => {
        const count = allData.filter(r => r.checkIn === date || r.primaryDate === date).length;
        const opt = document.createElement('option');
        opt.value = date;
        opt.textContent = 'אירוחי ' + formatDateShort(date) + ' (' + count + ' יחידות)';
        select.appendChild(opt);
      });
      select.value = defaultSelection;
    }

    function renderReport(selectedDate) {
      let filtered = allData;
      if (selectedDate && selectedDate !== 'all') {
        filtered = allData.filter(r => r.checkIn === selectedDate || r.primaryDate === selectedDate);
        document.getElementById('bannerSubtitle').textContent = 'על פי רישומי המערכת | תאריך אירוח: ' + formatDateShort(selectedDate);
      } else {
        const firstDate = allData[0]?.checkIn || allData[0]?.primaryDate;
        const lastDate = allData[allData.length - 1]?.checkIn || allData[allData.length - 1]?.primaryDate;
        const rangeText = (firstDate && lastDate && firstDate !== lastDate)
          ? 'תאריכים: ' + formatDateShort(firstDate) + ' עד ' + formatDateShort(lastDate)
          : 'תקבולים פעילים';
        document.getElementById('bannerSubtitle').textContent = 'על פי רישומי המערכת | ' + rangeText;
      }

      const withId = filtered.filter(r => !!r.guestIdNumber);
      const withoutId = filtered.filter(r => !r.guestIdNumber);

      const tableRows = withId.length > 0 ? withId : filtered;
      const totalCash = filtered.reduce((s, r) => s + (r.cashPaid || 0), 0);
      const tableCash = tableRows.reduce((s, r) => s + (r.cashPaid || 0), 0);
      const withoutIdCash = withoutId.reduce((s, r) => s + (r.cashPaid || 0), 0);

      document.getElementById('grandTotal').textContent = 'סך הכול: ' + formatNumber(tableCash) + ' ש״ח';
      document.getElementById('summaryCount').textContent = tableRows.length + ' רשומות בעלות תעודת זהות';

      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';

      if (tableRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; background:#f8fafc;">אין תנועות מזומן לתאריך הנבחר</td></tr>';
      } else {
        tableRows.forEach(r => {
          const tr = document.createElement('tr');
          const idText = r.guestIdNumber ? ('ת״ז: ' + r.guestIdNumber) : '';
          const dateStr = formatDateShort(r.checkIn || r.primaryDate);

          tr.innerHTML = '<td>' + dateStr + '</td>'
            + '<td>' + (r.stayDetails || '—') + '</td>'
            + '<td>'
            +   '<div class="guest-name">' + r.guestName + '</div>'
            +   (idText ? '<div class="sub-id">' + idText + '</div>' : '')
            + '</td>'
            + '<td class="amount-val">' + formatNumber(r.cashPaid) + '</td>';
          tbody.appendChild(tr);
        });
      }

      // Update notes section
      let notesHtml = '';
      if (withoutId.length > 0) {
        notesHtml += '<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; margin-bottom:8px;">';
        notesHtml += '<strong>רשומות ללא תעודת זהות (סה״כ ' + formatNumber(withoutIdCash) + ' ש״ח):</strong><br />';
        withoutId.forEach(r => {
          notesHtml += '• ' + r.guestName + ' – ' + (r.complex || '') + ' ' + (r.stayDetails || '') + ': <strong>' + formatNumber(r.cashPaid) + ' ש״ח</strong> במזומן.<br />';
        });
        notesHtml += 'סה״כ כללי שנגבה במזומן (כולל רשומות ללא ת״ז): <strong>' + formatNumber(totalCash) + ' ש״ח</strong>.<br />';
        notesHtml += '</div>';
      }
      notesHtml += '<div>תשלומי המזומן נקלטו ועודכנו בתיקי ההזמנה במערכת ResortOS.</div>';
      document.getElementById('notesContent').innerHTML = notesHtml;
    }

    initDates();
    renderReport(defaultSelection);
  </script>
</body>
</html>`;
}

export function printCashDayReport(bookings, units, dateStr) {
  const html = buildCashDayReportHtml(bookings, units, dateStr);
  const popup = window.open('', '_blank', 'width=880,height=850');
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
