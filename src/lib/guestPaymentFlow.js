import { isFullyPaid } from './bookingPaid.js';

const GUEST_METHOD_CHOICES = ['CREDIT_CARD', 'CASH', 'BANK_TRANSFER', 'VOUCHER'];

/** Guest methods the checkout form may offer. "Already paid" is not one of them. */
export function acceptedGuestPaymentChoice(choice) {
  const value = String(choice || '').toUpperCase();
  if (value === 'CARD' || value === 'CREDIT' || value === 'SAVED_CARD') return 'CREDIT_CARD';
  if (value === 'BANK') return 'BANK_TRANSFER';
  if (GUEST_METHOD_CHOICES.includes(value)) return value;
  return '';
}

/**
 * What confirm may store. ALREADY_PAID is dropped so a later visit cannot reopen the stay guide from it.
 */
export function persistGuestPaymentChoice({ requested = '', previousChoice = '', previousMode = '' } = {}) {
  const raw = String(requested || '').trim().toUpperCase();
  const rejected = raw === 'ALREADY_PAID';
  const choice = rejected
    ? ''
    : (acceptedGuestPaymentChoice(requested) || acceptedGuestPaymentChoice(previousChoice));
  let paymentMode = 'CREDIT_DEPOSIT';
  if (choice === 'CASH') paymentMode = 'CASH_TRUST';
  else if (choice === 'VOUCHER') paymentMode = 'VOUCHER';
  else if (!choice) {
    const prior = String(previousMode || '').trim().toUpperCase();
    paymentMode = prior && prior !== 'ALREADY_PAID' ? prior : 'CREDIT_DEPOSIT';
  }
  const balancePreference = choice === 'VOUCHER'
    ? 'CREDIT_CARD'
    : (choice === 'CREDIT_CARD' || choice === 'BANK_TRANSFER' || choice === 'CASH' ? choice : '');
  return { choice, paymentMode, balancePreference };
}

/**
 * What happens immediately after the guest confirms a payment method.
 * Card continues into Cardcom. Bank shows account details. Cash stays on the cash path.
 * None of those unpaid choices open the stay guide. "Already paid" is ignored.
 */
export function confirmChargePlan({ choice, prepaid = false } = {}) {
  const value = acceptedGuestPaymentChoice(choice);
  if (prepaid && value) return { pay: false, embedReceipt: false, next: 'stay' };
  if (value === 'CASH') return { pay: false, embedReceipt: false, next: 'cash' };
  if (value === 'VOUCHER') return { pay: false, embedReceipt: false, next: 'voucher' };
  if (value === 'BANK_TRANSFER') return { pay: false, embedReceipt: false, next: 'bank' };
  if (value === 'CREDIT_CARD') return { pay: true, embedReceipt: true, next: 'cardcom' };
  return { pay: false, embedReceipt: false, next: 'methods' };
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

/**
 * The stay guide is for guests who are in-house or fully paid.
 * A deposit, partial clearing row, or saved payment choice is not enough.
 */
export function bookingMayShowStay(booking) {
  if (!booking) return false;
  if (booking.is_cabin_portal) return true;
  const stayStatus = String(booking.booking_status || '');
  if (stayStatus === 'CHECKED_IN' || stayStatus === 'CHECKED_OUT') return true;
  if (booking.stay?.guest_checked_in_at) return true;
  // Partial deposit / clearing rows must NOT open the stay guide; that resurfaced the
  // old staff-will-contact success box. Only fully settled money (or in-house) may land
  // on Maps / area guide.
  if (isFullyPaid(booking)) return true;
  return false;
}

/** @deprecated Choice plus checkout_completed_at is not enough. Use bookingMayShowStay. */
export function paymentPathFinished(booking) {
  return bookingMayShowStay(booking);
}

export function guestHasId(booking) {
  return Boolean(booking?.stay?.id_photo_received_at || booking?.stay?.id_scan);
}

/** After the ID is on file and money is still open, reopen on the payment-method step. */
export function guestCheckoutResumeStep(booking) {
  if (!guestHasId(booking) || bookingMayShowStay(booking)) return 1;
  return 3;
}

/** Where an unpaid stay link should land. Already-paid is not a destination. */
export function guestCheckoutResumeView(booking) {
  if (bookingMayShowStay(booking)) return 'stay';
  const choice = acceptedGuestPaymentChoice(savedPaymentChoice(booking));
  if (choice === 'BANK_TRANSFER') return 'bank';
  if (choice === 'CASH') return 'cash';
  if (choice === 'VOUCHER') return 'voucher';
  if (guestHasId(booking)) return 'methods';
  return 'form';
}

/**
 * Stay portal (Maps / Waze / area guide / unpaid banner) only when money is recorded
 * or the guest is already in-house. Choosing a method, including "already paid", does not open it.
 */
export function guestCheckoutShowsStay({
  payFrame = '',
  bankFollowup = false,
  cashFollowup = false,
  voucherFollowup = false,
  paidReturn = false,
  booking = null
} = {}) {
  if (payFrame || bankFollowup || cashFollowup || voucherFollowup) return false;
  if (!bookingMayShowStay(booking)) return false;
  if (paidReturn) return true;
  return true;
}
