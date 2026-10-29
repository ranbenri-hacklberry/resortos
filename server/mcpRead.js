import { dueAgorotOf, kinorotSettlementKind, recordedClearingPayments, recordedPaidAgorot } from '../src/lib/bookingPaid.js';
import { docWordCount } from '../src/lib/priorityDocs.js';

/** Booking money is stored in agorot. 120000 agorot = 1200.00 ILS. */
export function ilsFromAgorot(agorot) {
  const n = Math.round(Number(agorot) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function maskAccountNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return `••••${digits}`;
  return `••••${digits.slice(-4)}`;
}

export function htmlToText(html, max = 8000) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return { text, complete: true };
  return { text: text.slice(0, max), complete: false };
}

export function isManager(user) {
  return String(user?.role || '').toUpperCase() === 'MANAGER' && user?.is_active !== false && Boolean(user?.id);
}

/** Guest-page reads: every manager, and the Priority user. Not the operations manager. */
export function canReadGuestPage(user) {
  const role = String(user?.role || '').toUpperCase();
  return Boolean(user?.id) && user?.is_active !== false && (role === 'MANAGER' || role === 'PRIORITY');
}

export function parseDate(value, name) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error('BAD_DATE');
    err.status = 400;
    err.field = name;
    throw err;
  }
  return text;
}

export function pageOf(rows, { cursor = '', limit = 50, max = 100 } = {}) {
  const size = Math.min(max, Math.max(1, Number(limit) || 50));
  let offset = 0;
  if (cursor) {
    const match = String(cursor).match(/^o:(\d+)$/);
    if (!match) {
      const err = new Error('BAD_CURSOR');
      err.status = 400;
      throw err;
    }
    offset = Number(match[1]);
  }
  const slice = rows.slice(offset, offset + size);
  const next = offset + size < rows.length ? `o:${offset + size}` : null;
  return {
    items: slice,
    count: slice.length,
    total: rows.length,
    complete: next == null,
    next_cursor: next
  };
}

export function projectCatalog(row) {
  return {
    id: row.id,
    name: row.name || '',
    property_id: row.property_id || '',
    unit_type: row.unit_type || '',
    max_occupancy: row.max_occupancy ?? null,
    base_price_ils: ilsFromAgorot(row.base_price_agorot),
    currency: 'ILS',
    source_unit: 'agorot',
    divisor: 100,
    is_active: row.is_active !== false,
    sort_order: row.sort_order ?? null
  };
}

export function projectUnit(row) {
  return {
    id: row.id,
    name: row.name || '',
    operational_status: row.operational_status || '',
    operational_domain: row.operational_domain || '',
    custom_reason: row.custom_reason || '',
    assigned_staff: row.assigned_staff || '',
    staff_occupancy: row.staff_occupancy || '',
    is_escalated: Boolean(row.is_escalated),
    cleaning_started_at: row.cleaning_started_at || null,
    updated_at: row.updated_at || null
  };
}

export function projectBooking(row) {
  return {
    id: row.id,
    unit_id: row.unit_id,
    guest_name: row.guest_name || '',
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    adults_count: row.adults_count ?? null,
    children_count: row.children_count ?? null,
    booking_status: row.booking_status || '',
    payment_status: row.payment_status || '',
    is_birthday: Boolean(row.is_birthday),
    birthday_note: row.birthday_note || null,
    upsell_description: row.upsell_description || null,
    upsell_price: row.upsell_price != null ? Number(row.upsell_price) : null
  };
}

export function projectPayment(raw) {
  const row = recordedClearingPayments({ clearing_payments: [raw] })[0] || {};
  const agorot = Math.round(Number(row.amount_agorot) || 0);
  return {
    method: row.source || row.accountKey || '',
    amount_ils: ilsFromAgorot(agorot),
    amount_agorot: agorot,
    date: String(row.date || row.collected_at || '').slice(0, 10),
    txn: row.txn || '',
    invoice: row.invoice || '',
    currency: 'ILS',
    source_unit: 'agorot',
    divisor: 100
  };
}

export function projectBookingMoney(booking) {
  const payments = recordedClearingPayments(booking).map((row) => projectPayment(row));
  const receiptAgorot = payments.filter((row) => row.amount_agorot > 0).reduce((sum, row) => sum + row.amount_agorot, 0);
  const refundAgorot = payments.filter((row) => row.amount_agorot < 0).reduce((sum, row) => sum + row.amount_agorot, 0);
  const canceled = booking?.booking_status === 'CANCELED' || Boolean(booking?.deleted_at);
  return {
    id: booking.id,
    unit_id: booking.unit_id,
    guest_name: booking.guest_name || '',
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    booking_status: booking.booking_status || '',
    payment_status: booking.payment_status || '',
    payment_mode: booking.payment_mode || '',
    settlement: kinorotSettlementKind(booking) || null,
    canceled,
    booking_value_ils: ilsFromAgorot(booking.total_price_agorot),
    deposit_required_ils: ilsFromAgorot(booking.deposit_agorot),
    receipts_ils: ilsFromAgorot(receiptAgorot),
    refunds_ils: ilsFromAgorot(refundAgorot),
    recorded_paid_ils: ilsFromAgorot(recordedPaidAgorot(booking)),
    balance_ils: ilsFromAgorot(dueAgorotOf(booking)),
    currency: 'ILS',
    source_unit: 'agorot',
    divisor: 100,
    vat: 'not_recorded',
    payments
  };
}

export function sumAgorot(rows, pick) {
  return rows.reduce((sum, row) => sum + (Math.round(Number(pick(row)) || 0)), 0);
}

export function financeSummary(bookings, { from = '', to = '', propertyId = '', unitProperty = () => '' } = {}) {
  const inRange = bookings.filter((row) => {
    if (row.deleted_at) return false;
    if (propertyId && unitProperty(row.unit_id) !== propertyId) return false;
    if (from && String(row.check_in_date) < from) return false;
    if (to && String(row.check_in_date) > to) return false;
    return true;
  });
  const active = inRange.filter((row) => row.booking_status !== 'CANCELED');
  const canceled = inRange.filter((row) => row.booking_status === 'CANCELED');
  const value = sumAgorot(active, (row) => row.total_price_agorot);
  const paid = active.reduce((sum, row) => sum + recordedPaidAgorot(row), 0);
  const due = active.reduce((sum, row) => sum + dueAgorotOf(row), 0);
  let receiptAgorot = 0;
  let refundAgorot = 0;
  for (const row of active) {
    for (const payment of recordedClearingPayments(row)) {
      const amount = Math.round(Number(payment.amount_agorot) || 0);
      const date = String(payment.date || payment.collected_at || '').slice(0, 10);
      if (from && date && date < from) continue;
      if (to && date && date > to) continue;
      if (amount > 0) receiptAgorot += amount;
      if (amount < 0) refundAgorot += amount;
    }
  }
  return {
    currency: 'ILS',
    source_unit: 'agorot',
    divisor: 100,
    vat: 'not_recorded_on_bookings',
    date_basis: 'check_in_date for booking value and balance; payment date for receipts and refunds',
    includes_canceled: false,
    filters: { from: from || null, to: to || null, property_id: propertyId || null },
    bookings: active.length,
    canceled_bookings: canceled.length,
    booking_value_ils: ilsFromAgorot(value),
    recorded_paid_ils: ilsFromAgorot(paid),
    balance_ils: ilsFromAgorot(due),
    receipts_ils: ilsFromAgorot(receiptAgorot),
    refunds_ils: ilsFromAgorot(refundAgorot),
    profit: null,
    profit_reason: 'אין דוח רווח. מע״מ לא שמור על שווי ההזמנה, וההוצאות נשמרות בנפרד בשקלים.'
  };
}

export function projectExpense(row) {
  return {
    id: row.id,
    supplier: row.supplier || '',
    invoice_no: row.invoice_no || '',
    date: row.date || '',
    subtotal_ils: row.subtotal == null ? null : Number(row.subtotal).toFixed(2),
    vat_ils: row.vat == null ? null : Number(row.vat).toFixed(2),
    total_ils: row.total == null ? null : Number(row.total).toFixed(2),
    currency: 'ILS',
    source_unit: 'shekel',
    category: row.category || '',
    site: row.site || '',
    paid: row.paid
  };
}

export function projectBankAccount(account) {
  const parsed = account?.parsedAccount || {};
  return {
    id: account.id,
    connection_id: account.connectionId || '',
    provider_id: account.providerId || '',
    account_type: account.accountType || '',
    account_name: account.accountName || '',
    product: account.product || '',
    currency: account.currency || account.displayBalance?.currency || 'ILS',
    account_number_masked: maskAccountNumber(parsed.number || account.accountNumber),
    bank: parsed.bank || '',
    branch: parsed.branch || '',
    owner_name: account.ownerName || '',
    credit_limit: account.creditLimit ?? null,
    display_balance: account.displayBalance || null,
    source: 'open_finance',
    amount_unit: 'major_currency_unit'
  };
}

export function projectBankTransaction(tx) {
  return {
    id: tx.id,
    account_id: tx.accountId || '',
    provider_id: tx.providerId || '',
    account_type: tx.type || '',
    merchant: tx.merchantName || '',
    description: typeof tx.description === 'string' ? tx.description : '',
    amount: tx.amount,
    currency: tx.currency || 'ILS',
    amount_unit: 'major_currency_unit',
    category: tx.category || '',
    transaction_date: String(tx.transactionDate || '').slice(0, 10),
    booking_date: String(tx.bookingDate || '').slice(0, 10),
    reference: tx.reference || '',
    source: 'open_finance'
  };
}

export function projectDocument(doc, { includeText = false } = {}) {
  const text = htmlToText(doc?.html || '');
  const base = {
    id: doc.id,
    title: doc.title || '',
    updated_at: doc.updatedAt || '',
    words: docWordCount(doc?.html || ''),
    library: 'priority_docs'
  };
  if (!includeText) return base;
  return { ...base, text: text.text, complete: text.complete };
}

export function fetchedAt(now = new Date()) {
  return {
    fetched_at: now.toISOString(),
    timezone: 'Asia/Jerusalem'
  };
}
