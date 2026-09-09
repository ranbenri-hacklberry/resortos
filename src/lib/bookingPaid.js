import { normalizeClearingPayment } from './clearingPayments';

export function paymentStatusRank(status) {
  const s = String(status || 'UNPAID').toUpperCase();
  if (s === 'PAID') return 40;
  if (s === 'DEPOSIT_PAID' || s === 'PARTIAL') return 30;
  if (s === 'PENDING_CASH' || s === 'PENDING_BANK') return 20;
  return 10;
}

export function bookingStatusRank(status) {
  const s = String(status || '');
  if (s === 'CANCELED') return 0;
  if (s === 'CHECKED_OUT') return 50;
  if (s === 'CHECKED_IN') return 40;
  if (s === 'CONFIRMED') return 30;
  if (s === 'PENDING') return 10;
  return 20;
}

export function recordedClearingPayments(booking) {
  const stored = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  return stored.map(normalizeClearingPayment);
}

export function hasRecordedReceipt(booking) {
  if (booking?.stay?.hyp?.paid || booking?.stay?.hyp_deposit?.paid) return true;
  return recordedClearingPayments(booking).some((row) => Number(row.amount_agorot) > 0);
}

export function recordedPaidAgorot(booking) {
  const clearing = recordedClearingPayments(booking).reduce(
    (sum, row) => sum + (Number(row.amount_agorot) || 0),
    0
  );
  if (booking?.stay?.hyp?.paid) {
    return Math.max(Number(booking?.total_price_agorot) || 0, clearing);
  }
  if (booking?.payment_status === 'PAID' && hasRecordedReceipt(booking)) {
    return Math.max(Number(booking?.total_price_agorot) || 0, clearing);
  }
  if (
    booking?.stay?.hyp_deposit?.paid
    || booking?.payment_status === 'DEPOSIT_PAID'
    || booking?.payment_status === 'PARTIAL'
  ) {
    return Math.max(Number(booking?.deposit_agorot) || 0, clearing);
  }
  return clearing;
}

export function paidIlsOfBooking(booking, totalIls = 0, depositIls = 0) {
  const paid = recordedPaidAgorot(booking) / 100;
  if (booking?.stay?.hyp?.paid || (booking?.payment_status === 'PAID' && hasRecordedReceipt(booking))) {
    return Math.max(Number(totalIls) || 0, paid);
  }
  if (paid > 0) return paid;
  if (
    booking?.stay?.hyp_deposit?.paid
    || booking?.payment_status === 'DEPOSIT_PAID'
    || booking?.payment_status === 'PARTIAL'
  ) {
    return Number(depositIls) || 0;
  }
  return 0;
}

export function dueAgorotOf(booking) {
  const total = Number(booking?.total_price_agorot) || 0;
  return Math.max(0, total - recordedPaidAgorot(booking));
}

export function kinorotSettlementKind(booking) {
  const mode = String(booking?.payment_mode || '');
  const req = String(booking?.special_requests || '');
  if (mode === 'VOUCHER' || /\|pay:voucher\b/.test(req)) return 'voucher';
  if (mode === 'COMP' || /\|pay:comp\b/.test(req)) return 'comp';
  return '';
}

export function isFullyPaid(booking) {
  if (kinorotSettlementKind(booking)) return true;
  if (booking?.stay?.hyp?.paid) return true;
  if (booking?.payment_status === 'PAID' && !hasRecordedReceipt(booking)) return false;
  if (booking?.payment_status === 'PAID') return true;
  const total = Number(booking?.total_price_agorot) || 0;
  if (total <= 0) return false;
  return dueAgorotOf(booking) <= 50;
}

export function paymentStatusAfterPaid(totalAgorot, paidAgorot) {
  const total = Number(totalAgorot) || 0;
  const paid = Number(paidAgorot) || 0;
  if (total > 0 && paid + 50 >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

export function canEnterRoom(booking) {
  return Boolean(booking)
    && booking.booking_status === 'CHECKED_IN'
    && isFullyPaid(booking);
}

export function hasBankTransferProof(booking) {
  const proof = booking?.stay?.payment_proof || booking?.payment_proof || '';
  return String(proof).startsWith('data:image/') || booking?.bank_transfer_receipt_url === 'uploaded';
}

export function awaitingBankReview(booking) {
  if (!booking || isFullyPaid(booking)) return false;
  if (booking.payment_status === 'PENDING_BANK') return true;
  return booking.payment_mode === 'BANK_TRANSFER' && hasBankTransferProof(booking);
}

/** Cash promised at the cabin — calendar banknote until money is actually collected. */
export function awaitingCashCollection(booking) {
  if (!booking || isFullyPaid(booking) || kinorotSettlementKind(booking)) return false;
  if (booking.stay?.cash_collected_at) return false;
  const mode = String(booking.payment_mode || '');
  const status = String(booking.payment_status || '');
  if (booking.stay?.cash_expected) return true;
  if (status === 'PENDING_CASH') return true;
  if (mode === 'CASH_TRUST') return true;
  if (mode === 'CASH' && !hasRecordedReceipt(booking) && status !== 'PAID') return true;
  return false;
}
