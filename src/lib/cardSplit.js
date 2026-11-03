import { mergeClearingPayments, normalizeClearingPayment } from './clearingPayments';

const LOCKED_MODES = new Set(['BOOKING', 'AIRBNB', 'VOUCHER', 'COMP', 'BANK_TRANSFER']);

function bucket(raw) {
  const row = normalizeClearingPayment(raw);
  const method = String(raw?.method || '').toLowerCase();
  const txn = String(row.txn || '');
  const source = String(row.source || '');
  if (source === 'CASH' || row.accountKey === 'CASH' || method === 'cash' || /_cash$/.test(txn)) return 'cash';
  if (source === 'BANK' || row.accountKey === 'BANK' || method === 'bank' || /_bank$/.test(txn)) return 'bank';
  if (source === 'VOUCHER' || method === 'voucher') return 'voucher';
  if (source === 'BOOKING') return 'booking';
  if (source === 'AIRBNB') return 'airbnb';
  if (
    source === 'CARD'
    || source === 'HYP'
    || source === 'MAX'
    || source === 'KINOROT'
    || row.accountKey === 'MAX'
    || method === 'card'
    || /_card$/.test(txn)
  ) return 'card';
  return 'other';
}

function totals(payments) {
  const sums = { card: 0, cash: 0, other: 0 };
  for (const raw of payments || []) {
    const key = bucket(raw);
    const amount = Number(normalizeClearingPayment(raw).amount_agorot) || 0;
    if (key === 'card') sums.card += amount;
    else if (key === 'cash') sums.cash += amount;
    else sums.other += amount;
  }
  return sums;
}

export function addCardSplit(booking, { today, amountAgorot, last4, approval } = {}) {
  if (!booking) return { booking: null };
  const amount = Math.round(Number(amountAgorot) || 0);
  const tail = String(last4 || '').replace(/\D/g, '').slice(-4);
  const auth = String(approval || '').trim();
  if (!(amount > 0)) {
    const error = new Error('הסכום לא תקין');
    error.code = 'amount';
    throw error;
  }
  if (tail.length !== 4) {
    const error = new Error('צריך 4 ספרות של הכרטיס');
    error.code = 'last4';
    throw error;
  }
  const row = {
    source: 'CARD',
    accountKey: 'MAX',
    method: 'card',
    amount_agorot: amount,
    date: today || '',
    last4: tail,
    ref: auth,
    txn: `priority_card_${booking.id}_${today || 'na'}_${tail}_${Date.now()}`
  };
  const clearing_payments = mergeClearingPayments(booking.clearing_payments, row);
  const parts = totals(clearing_payments);
  const covered = parts.card + parts.cash + parts.other;
  const total = Number(booking.total_price_agorot) || 0;
  const payment_status = covered <= 0
    ? 'UNPAID'
    : (total > 0 && covered + 50 >= total ? 'PAID' : 'PARTIAL');
  const mode = String(booking.payment_mode || '').toUpperCase();
  let payment_mode = booking.payment_mode || '';
  if (!LOCKED_MODES.has(mode)) {
    payment_mode = parts.card > 0 && parts.cash > 0 ? 'CARD_CASH' : 'CARD';
  }
  return {
    booking: {
      ...booking,
      clearing_payments,
      payment_status,
      payment_mode,
      updated_at: new Date().toISOString()
    }
  };
}
