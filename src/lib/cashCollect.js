import { mergeClearingPayments } from './clearingPayments.js';

/** Adds one cash collection. A later collection the same day is another receipt. */
export function addCashCollection(booking, { amountAgorot, collector, at, today }) {
  const amount = Math.round(Number(amountAgorot) || 0);
  if (!booking?.id || !(amount > 0)) return { booking, collectedAgorot: 0 };
  const when = at || new Date().toISOString();
  const day = today || String(when).slice(0, 10);
  const payment = {
    source: 'CASH',
    accountKey: 'CASH',
    amount_agorot: amount,
    date: day,
    collector: collector || 'משרד',
    payer_name: booking.guest_name || '',
    collected_at: when,
    txn: `whatsapp_cash_${booking.id}_${when}`
  };
  const clearing_payments = mergeClearingPayments(booking.clearing_payments, payment);
  return {
    booking: {
      ...booking,
      clearing_payments,
      payment_mode: booking.payment_mode || 'CASH',
      cash_collected_by: payment.collector,
      cash_receipt_at: when,
      updated_at: when
    },
    collectedAgorot: amount
  };
}

/** Payment status changes only after an explicit choice. */
export function applyPaymentStatus(booking, status, at) {
  if (!booking?.id || (status !== 'PARTIAL' && status !== 'PAID')) return booking;
  const when = at || new Date().toISOString();
  return { ...booking, payment_status: status, updated_at: when };
}
