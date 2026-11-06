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

/**
 * Stay portal (Maps / Waze / area guide) replaces checkout only when this visit
 * is done with payment, or the guest is already in-house.
 * An active Cardcom frame or bank-details step wins over that page.
 * A default CREDIT_CARD preference on the public booking is not a completed choice.
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
  if (isSubmitted || paidReturn) return true;
  if (!booking) return false;
  if (booking.is_cabin_portal) return true;
  if (booking.booking_status === 'CHECKED_IN' || booking.booking_status === 'CHECKED_OUT') return true;
  const hasId = Boolean(booking.stay?.id_photo_received_at || booking.stay?.id_scan);
  if (!hasId) return false;
  if (skipPayment) return true;
  const choice = String(booking.stay?.payment_choice || '').trim();
  if (!booking.stay?.checkout_completed_at || !choice) return false;
  return true;
}
