/**
 * What happens immediately after the guest confirms a payment method.
 * Card continues into Cardcom. Bank shows account details. Cash, voucher,
 * and already-paid do not open a card terminal.
 * The stay / area-guide page is not the next step for card or bank.
 */
export function confirmChargePlan({ choice, prepaid = false } = {}) {
  const value = String(choice || '').toUpperCase();
  if (prepaid || value === 'CASH' || value === 'VOUCHER' || value === 'ALREADY_PAID') {
    return { pay: false, embedReceipt: false, next: 'stay' };
  }
  if (value === 'BANK_TRANSFER' || value === 'BANK') {
    return { pay: false, embedReceipt: false, next: 'bank' };
  }
  return { pay: true, embedReceipt: true, next: 'cardcom' };
}

/** Server-side: start a Cardcom charge only when this confirmation still owes a card payment. */
export function confirmShouldStartCardCharge({ pay, paymentMode, paymentChoice } = {}) {
  if (pay === false) return false;
  const mode = String(paymentMode || '').toUpperCase();
  const choice = String(paymentChoice || '').toUpperCase();
  if (mode === 'CASH_TRUST' || choice === 'CASH') return false;
  if (mode === 'VOUCHER' || choice === 'VOUCHER') return false;
  if (mode === 'ALREADY_PAID' || choice === 'ALREADY_PAID') return false;
  if (mode === 'BANK_TRANSFER' || choice === 'BANK_TRANSFER' || choice === 'BANK') return false;
  if (mode === 'BOOKING') return false;
  return true;
}

export function checkoutPayUrl(booking) {
  const payment = booking?.payment;
  if (!payment || typeof payment !== 'object') return '';
  return String(payment.iframe_url || payment.pay_url || '').trim();
}

function savedPaymentChoice(booking) {
  return String(booking?.stay?.payment_choice || '').trim().toUpperCase();
}

function cardChoice(choice) {
  return choice === 'CREDIT_CARD' || choice === 'CARD' || choice === 'CREDIT' || choice === 'SAVED_CARD';
}

/** Card was selected, but no money has been recorded yet. The guide must not replace payment. */
export function unpaidCardChoice(booking) {
  if (!booking) return false;
  const status = String(booking.payment_status || '').toUpperCase();
  if (status === 'PAID' || status === 'DEPOSIT_PAID' || status === 'PARTIAL' || status === 'PENDING_BANK' || status === 'PENDING_CASH') {
    return false;
  }
  if (booking.stay?.hyp?.paid || booking.stay?.hyp_deposit?.paid || booking.balance_paid || booking.stay?.balance_paid) {
    return false;
  }
  return cardChoice(savedPaymentChoice(booking));
}

/**
 * A later stay-link visit may show the guide only after the payment path is finished:
 * money recorded, or a non-card method was actually saved (cash, bank, voucher, already paid).
 * An ID photo plus an unpaid credit-card choice is not finished, even if checkout_completed_at is set.
 */
export function paymentPathFinished(booking) {
  if (!booking) return false;
  if (unpaidCardChoice(booking)) return false;
  const status = String(booking.payment_status || '').toUpperCase();
  if (status === 'PAID' || status === 'DEPOSIT_PAID' || status === 'PARTIAL' || status === 'PENDING_BANK' || status === 'PENDING_CASH') {
    return true;
  }
  if (booking.stay?.hyp?.paid || booking.stay?.hyp_deposit?.paid || booking.balance_paid || booking.stay?.balance_paid) {
    return true;
  }
  const choice = savedPaymentChoice(booking);
  if (!booking.stay?.checkout_completed_at || !choice || cardChoice(choice)) return false;
  return choice === 'CASH' || choice === 'BANK_TRANSFER' || choice === 'BANK' || choice === 'VOUCHER' || choice === 'ALREADY_PAID';
}

export function guestHasId(booking) {
  return Boolean(booking?.stay?.id_photo_received_at || booking?.stay?.id_scan);
}

/** After the ID is on file and payment is still open, reopen on the payment-method step. */
export function guestCheckoutResumeStep(booking) {
  if (!guestHasId(booking) || paymentPathFinished(booking)) return 1;
  return 3;
}

/**
 * Stay portal (Maps / Waze / area guide) replaces checkout only when payment is
 * finished, the guest is already in-house, or this session just completed a non-card method.
 * Uploading an ID, or saving an unpaid card choice, stays on the payment step.
 */
export function guestCheckoutShowsStay({
  payFrame = '',
  bankFollowup = false,
  isSubmitted = false,
  paidReturn = false,
  booking = null,
  skipPayment = false
} = {}) {
  if (payFrame || bankFollowup) return false;
  if (paidReturn) return true;
  if (isSubmitted && !unpaidCardChoice(booking)) return true;
  if (!booking) return false;
  if (booking.is_cabin_portal) return true;
  if (booking.booking_status === 'CHECKED_IN' || booking.booking_status === 'CHECKED_OUT') return true;
  if (skipPayment && !unpaidCardChoice(booking)) return true;
  return paymentPathFinished(booking);
}
