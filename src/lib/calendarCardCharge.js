import { paymentStatusAfterPaid, recordedPaidAgorot } from './bookingPaid';
import { HYP_TERMINAL_A, HYP_TERMINAL_B, hypPaymentFromRow, mergeClearingPayments } from './clearingPayments';

export function calendarChargeIls(booking) {
  const explicit = Number(booking?.charge_amount_ils);
  if (explicit > 0.5) return Math.round(explicit * 100) / 100;
  return 0;
}

export function applyCalendarCardPayment(booking, { params = {}, terminal = '', lowProfileId = '', paidAt = '' } = {}) {
  const amount = Number(params.Amount);
  const terminalId = String(terminal).toUpperCase() === 'A'
    ? HYP_TERMINAL_A
    : String(terminal).toUpperCase() === 'B'
      ? HYP_TERMINAL_B
      : '';
  const payment = hypPaymentFromRow({
    txn: params.Id || lowProfileId || `card_${Date.now()}`,
    ref: params.ACode || '',
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    last4: params.L4digit || '',
    brand: params.Brand || '',
    invoice: params.Hesh || '',
    terminalId,
    date: String(paidAt || new Date().toISOString()).slice(0, 10),
    acquirer: 'MAX'
  });
  const next = {
    ...booking,
    clearing_payments: mergeClearingPayments(booking?.clearing_payments, payment),
    payment_mode: 'CARD',
    updated_at: new Date().toISOString(),
    stay: {
      ...(booking?.stay || {}),
      hyp_intent: {
        ...((booking?.stay || {}).hyp_intent || {}),
        status: 'paid',
        terminal: String(terminal || '').toUpperCase(),
        lowProfileId: lowProfileId || booking?.stay?.hyp_intent?.lowProfileId || '',
        amount: Number.isFinite(amount) ? amount : booking?.stay?.hyp_intent?.amount,
        at: new Date().toISOString()
      }
    }
  };
  next.payment_status = paymentStatusAfterPaid(next.total_price_agorot, recordedPaidAgorot(next));
  if (next.payment_status === 'PAID') {
    next.stay = { ...next.stay, hyp: { ...((booking?.stay || {}).hyp || {}), paid: true } };
  }
  return next;
}
