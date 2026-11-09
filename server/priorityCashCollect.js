/**
 * Record a Priority desk cash collection using the authenticated staff user.
 * Client-supplied collector / reported_by fields are ignored on purpose.
 */
import { mergeClearingPayments, normalizeClearingPayment } from '../src/lib/clearingPayments.js';

export function sessionCollectorName(staffUser) {
  const user = staffUser || {};
  return String(user.display_name || user.name || user.username || 'משרד').trim() || 'משרד';
}

function clearingSum(booking) {
  return (Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [])
    .reduce((sum, row) => sum + (Number(normalizeClearingPayment(row).amount_agorot) || 0), 0);
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
  const next = {
    ...booking,
    clearing_payments: mergeClearingPayments(booking.clearing_payments, payment),
    cash_collected_by: payment.collector,
    cash_receipt_at: booking.cash_receipt_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const covered = clearingSum(next);
  next.payment_status = covered <= 0
    ? 'UNPAID'
    : (total > 0 && covered + 50 >= total ? 'PAID' : 'PARTIAL');
  next.payment_mode = next.payment_status === 'PAID' || next.payment_status === 'PARTIAL'
    ? (String(next.payment_mode || '').includes('CARD') ? 'CARD_CASH' : 'CASH')
    : (next.payment_mode || 'CASH');
  return { booking: next, collectedAgorot: amount };
}

export function buildPriorityCashPatch(booking, {
  today,
  staffUser,
  totalAgorot,
  collectedAgorot
} = {}) {
  if (!booking) {
    const err = new Error('BOOKING_REQUIRED');
    err.status = 400;
    throw err;
  }
  const collector = sessionCollectorName(staffUser);
  let next = { ...booking };
  if (Number.isFinite(totalAgorot)) next.total_price_agorot = totalAgorot;
  const total = Number(next.total_price_agorot) || 0;
  const already = clearingSum(next);
  const specified = Number.isFinite(collectedAgorot) ? collectedAgorot : null;
  const remainder = Math.max(0, total - already);
  const amount = specified == null ? remainder : specified;
  const written = amount > 0
    ? withCashReceipt(next, today, collector, amount)
    : { booking: next, collectedAgorot: 0 };
  return {
    booking: written.booking,
    collectedAgorot: written.collectedAgorot,
    collector,
    patch: {
      clearing_payments: written.booking.clearing_payments,
      payment_status: written.booking.payment_status,
      payment_mode: written.booking.payment_mode,
      total_price_agorot: written.booking.total_price_agorot,
      cash_collected_by: written.booking.cash_collected_by,
      cash_receipt_at: written.booking.cash_receipt_at,
      updated_at: written.booking.updated_at || new Date().toISOString()
    }
  };
}
