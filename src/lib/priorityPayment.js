import { kinorotSettlementKind } from './bookingPaid';
import { mergeClearingPayments, normalizeClearingPayment } from './clearingPayments';
import { db } from './resortos-db';
import { pushBookingToCloud } from './cloudDb';

export const PAYMENT_STATUSES = [
  { key: 'UNPAID', label: 'לא שולם' },
  { key: 'PAID', label: 'שולם' },
  { key: 'PARTIAL', label: 'שולם חלקית' }
];

export const PAYMENT_METHODS = [
  { key: 'CASH', label: 'מזומן', mode: 'CASH' },
  { key: 'CARD', label: 'אשראי', mode: 'CARD' },
  { key: 'BANK', label: 'העברה בנקאית / ביט', mode: 'BANK_TRANSFER' },
  { key: 'BOOKING', label: 'Booking.com', mode: 'BOOKING' },
  { key: 'VOUCHER', label: 'שובר', mode: 'VOUCHER' }
];

export function priorityStatusKey(booking) {
  if (!booking) return '';
  const status = String(booking.payment_status || '').toUpperCase();
  if (status === 'PAID') return 'PAID';
  if (status === 'PARTIAL' || status === 'DEPOSIT_PAID') return 'PARTIAL';
  return 'UNPAID';
}

export function priorityMethodLabel(methodKey) {
  return PAYMENT_METHODS.find((row) => row.key === methodKey)?.label || 'לא צוין';
}

export function priorityMethodKey(booking) {
  if (!booking) return '';
  if (kinorotSettlementKind(booking) === 'voucher') return 'VOUCHER';
  const mode = String(booking.payment_mode || '').toUpperCase();
  if (mode === 'CASH' || mode === 'CASH_TRUST') return 'CASH';
  if (mode === 'BANK_TRANSFER') return 'BANK';
  if (mode === 'BOOKING') return 'BOOKING';
  if (mode === 'CARD' || mode === 'CREDIT_FULL' || mode === 'CREDIT_DEPOSIT') return 'CARD';
  const payments = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
  const last = payments.map(normalizeClearingPayment).filter((row) => row.amount_agorot > 0).at(-1);
  if (last?.source === 'CASH' || last?.accountKey === 'CASH') return 'CASH';
  if (last?.source === 'BANK' || last?.accountKey === 'BANK') return 'BANK';
  if (last?.source === 'HYP' || last?.source === 'MAX') return 'CARD';
  return '';
}

export function formatPriorityShekels(agorot) {
  const shekels = Math.round(Number(agorot || 0)) / 100;
  const text = Number.isInteger(shekels)
    ? shekels.toLocaleString('he-IL')
    : shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ₪`;
}

export function parsePriorityShekels(raw) {
  const text = String(raw ?? '').replace(/₪/g, '').replace(/\s/g, '').trim();
  if (!text) return null;
  const grouped = text.match(/^(\d{1,3}(?:,\d{3})+)(\.\d+)?$/);
  const plain = text.match(/^(\d+)(\.\d+)?$/);
  const match = grouped || plain;
  if (!match) return null;
  const shekels = Number(`${match[1].replace(/,/g, '')}${match[2] || ''}`);
  if (!Number.isFinite(shekels) || shekels < 0) return null;
  return Math.round(shekels * 100);
}

function clearingIsCash(raw) {
  const row = normalizeClearingPayment(raw);
  const method = String(raw?.method || '').toLowerCase();
  const txn = String(row.txn || '');
  return row.source === 'CASH' || row.accountKey === 'CASH' || method === 'cash' || /_cash$/.test(txn);
}

export function cashCollectedAgorot(booking) {
  return (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .filter(clearingIsCash)
    .reduce((sum, raw) => sum + (Number(normalizeClearingPayment(raw).amount_agorot) || 0), 0);
}

export function priorityPayLabel({ status, method, amountAgorot, collectedAgorot = 0 }) {
  if (!status) return '';
  const collected = method === 'CASH' && Number(collectedAgorot) > 0
    ? ` · נגבה ${formatPriorityShekels(collectedAgorot)}`
    : '';
  if (status === 'PAID') {
    const methodLabel = PAYMENT_METHODS.find((row) => row.key === method)?.label || '';
    return `${methodLabel ? `שולם (${methodLabel})` : 'שולם'}${collected}`;
  }
  const money = Number(amountAgorot) > 0 ? ` (${formatPriorityShekels(amountAgorot)})` : '';
  if (status === 'PARTIAL') return `שולם חלקית${money}${collected}`;
  return `לא שולם${money}${collected}`;
}

export function priorityPayTone(status) {
  if (status === 'PAID') return 'pay-ok';
  if (status === 'PARTIAL') return 'pay-wait';
  if (status === 'UNPAID') return 'pay-bad';
  return '';
}

function clearingSum(booking) {
  return (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .reduce((sum, row) => sum + (Number(normalizeClearingPayment(row).amount_agorot) || 0), 0);
}

function methodMode(methodKey) {
  return PAYMENT_METHODS.find((row) => row.key === methodKey)?.mode || '';
}

function withCashReceipt(booking, today, collector, amountAgorot) {
  const total = Number(booking.total_price_agorot) || 0;
  const amount = Number.isFinite(amountAgorot) ? amountAgorot : Math.max(0, total - clearingSum(booking));
  if (!(amount > 0)) return { booking, collectedAgorot: 0 };
  const payment = {
    source: 'CASH',
    accountKey: 'CASH',
    amount_agorot: amount,
    date: today,
    collector: collector || 'משרד',
    payer_name: booking.guest_name || '',
    collected_at: `${today}T12:00:00`,
    txn: `priority_cash_${booking.id}_${today}`
  };
  return {
    booking: {
      ...booking,
      clearing_payments: mergeClearingPayments(booking.clearing_payments, payment),
      cash_collected_by: payment.collector,
      cash_receipt_at: booking.cash_receipt_at || new Date().toISOString()
    },
    collectedAgorot: amount
  };
}

export function applyPriorityPayment(booking, { totalAgorot, statusKey, methodKey, today, collector, collectedAgorot } = {}) {
  if (!booking) return { booking: null, collectedAgorot: 0 };
  let next = {
    ...booking,
    updated_at: new Date().toISOString()
  };
  if (Number.isFinite(totalAgorot)) next.total_price_agorot = totalAgorot;
  if (statusKey) next.payment_status = statusKey;
  if (methodKey && methodMode(methodKey)) next.payment_mode = methodMode(methodKey);
  const cash = next.payment_mode === 'CASH' || next.payment_mode === 'CASH_TRUST';
  if (cash && Number.isFinite(collectedAgorot)) {
    const total = Number(next.total_price_agorot) || 0;
    if (!statusKey && collectedAgorot > 0) {
      next.payment_status = collectedAgorot < total ? 'PARTIAL' : 'PAID';
    }
    return withCashReceipt(next, today, collector, collectedAgorot);
  }
  if (next.payment_status === 'PAID' && cash) {
    return withCashReceipt(next, today, collector);
  }
  return { booking: next, collectedAgorot: 0 };
}

export function collectPriorityCash(booking, { today, collector, totalAgorot, collectedAgorot } = {}) {
  const total = Number.isFinite(totalAgorot) ? totalAgorot : Number(booking?.total_price_agorot) || 0;
  const specified = Number.isFinite(collectedAgorot) ? collectedAgorot : null;
  const statusKey = specified == null
    ? 'PAID'
    : (specified > 0 && specified < total ? 'PARTIAL' : specified > 0 ? 'PAID' : 'UNPAID');
  return applyPriorityPayment(booking, {
    totalAgorot: total,
    statusKey,
    methodKey: 'CASH',
    today,
    collector,
    collectedAgorot: specified == null ? undefined : specified
  });
}

export function paymentDraftDirty(row, draft) {
  if (!row?.bookingId || !draft) return false;
  if (draft.payStatus && draft.payStatus !== row.payStatus) return true;
  if (draft.payMethod && draft.payMethod !== row.payMethod) return true;
  if (draft.amountText != null) {
    const parsed = String(draft.amountText).trim() === '' ? 0 : parsePriorityShekels(draft.amountText);
    if (parsed != null && parsed !== Number(row.amountAgorot || 0)) return true;
  }
  if (draft.collectedText != null) {
    const parsed = String(draft.collectedText).trim() === '' ? 0 : parsePriorityShekels(draft.collectedText);
    if (parsed != null && parsed !== Number(row.cashCollectedAgorot || 0)) return true;
  }
  return false;
}

async function persistPriorityBooking(booking) {
  await db.bookings.put(booking);
  await pushBookingToCloud(booking, { allowOverlap: true });
}

export async function savePriorityPaymentDrafts({
  rows,
  bookings,
  drafts,
  today,
  collector,
  persistBooking = persistPriorityBooking
}) {
  const saved = [];
  const failed = [];
  for (const [unitId, draft] of Object.entries(drafts || {})) {
    const row = (rows || []).find((item) => item.id === unitId);
    if (!paymentDraftDirty(row, draft)) continue;
    const booking = (bookings || []).find((item) => item.id === row.bookingId);
    if (!booking) {
      failed.push({ unitId, name: row?.name || unitId, error: 'אין הזמנה פעילה' });
      continue;
    }
    const parsed = draft.amountText == null
      ? null
      : (String(draft.amountText).trim() === '' ? 0 : parsePriorityShekels(draft.amountText));
    const collected = draft.collectedText == null
      ? null
      : (String(draft.collectedText).trim() === '' ? 0 : parsePriorityShekels(draft.collectedText));
    if ((draft.amountText != null && parsed == null) || (draft.collectedText != null && collected == null)) {
      failed.push({ unitId, name: row.name || unitId, error: 'הסכום לא תקין' });
      continue;
    }
    try {
      const { booking: next } = applyPriorityPayment(booking, {
        totalAgorot: parsed == null ? undefined : parsed,
        statusKey: draft.payStatus || undefined,
        methodKey: draft.payMethod || undefined,
        collectedAgorot: collected == null ? undefined : collected,
        today,
        collector
      });
      await persistBooking(next);
      saved.push(unitId);
    } catch (err) {
      failed.push({ unitId, name: row.name || unitId, error: err?.message || 'השמירה נכשלה' });
    }
  }
  return { saved, failed };
}
