import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  acceptedGuestPaymentChoice,
  checkoutPayUrl,
  confirmChargePlan,
  confirmShouldStartCardCharge,
  guestCheckoutResumeStep,
  bookingMayShowStay,
  guestCheckoutResumeView,
  guestCheckoutShowsStay,
  persistGuestPaymentChoice
} from './guestPaymentFlow.js';

const cardcom = 'https://secure.cardcom.solutions/pay/lp';

describe('guest payment view after method selection', () => {
  it('credit card continues into Cardcom and does not open the stay guide', () => {
    expect(confirmChargePlan({ choice: 'CREDIT_CARD' })).toEqual({
      pay: true,
      embedReceipt: true,
      next: 'cardcom'
    });
    const booking = {
      payment: { iframe_url: cardcom, pay_url: cardcom },
      balance_payment_preference: 'CREDIT_CARD',
      stay: {
        id_photo_received_at: '2026-11-06T10:00:00Z',
        payment_choice: 'CREDIT_CARD',
        checkout_completed_at: '2026-11-06T10:05:00Z'
      }
    };
    expect(checkoutPayUrl(booking)).toBe(cardcom);
    expect(guestCheckoutShowsStay({
      payFrame: checkoutPayUrl(booking),
      booking
    })).toBe(false);
  });

  it('after ID, an unpaid card choice reopens payment options instead of the stay guide', () => {
    const booking = {
      booking_status: 'CONFIRMED',
      payment_status: 'UNPAID',
      payment_mode: '',
      balance_payment_preference: 'CREDIT_CARD',
      total_price_agorot: 135000,
      deposit_agorot: 27000,
      stay: {
        id_photo_received_at: '2026-11-06T11:29:34.361Z',
        checkout_completed_at: '2026-11-06T11:29:42.170Z',
        payment_choice: 'CREDIT_CARD',
        balance_payment_preference: 'CREDIT_CARD',
        cabin_ready: true,
        operational_status: 'READY'
      }
    };
    expect(guestCheckoutShowsStay({ booking })).toBe(false);
    expect(guestCheckoutShowsStay({ booking, isSubmitted: true })).toBe(false);
    expect(guestCheckoutResumeStep(booking)).toBe(3);
    const paid = {
      ...booking,
      payment_status: 'PAID',
      stay: { ...booking.stay, hyp: { paid: true } }
    };
    expect(guestCheckoutShowsStay({ booking: paid })).toBe(true);
    expect(guestCheckoutResumeStep(paid)).toBe(1);
    expect(guestCheckoutShowsStay({
      booking: { ...booking, payment_status: 'PAID' }
    })).toBe(false);
  });

  it('does not treat the API default credit-card preference as a finished payment', () => {
    expect(guestCheckoutShowsStay({
      booking: {
        balance_payment_preference: 'CREDIT_CARD',
        payment_status: 'UNPAID',
        total_price_agorot: 120000,
        stay: { id_photo_received_at: '2026-11-06T10:00:00Z' }
      }
    })).toBe(false);
  });

  it('bank transfer shows bank details instead of the area guide', () => {
    expect(confirmChargePlan({ choice: 'BANK_TRANSFER' })).toEqual({
      pay: false,
      embedReceipt: false,
      next: 'bank'
    });
    expect(guestCheckoutShowsStay({ bankFollowup: true })).toBe(false);
  });

  it('cash and voucher stay on their own path and do not open the stay guide', () => {
    expect(confirmChargePlan({ choice: 'CASH' })).toEqual({ pay: false, embedReceipt: false, next: 'cash' });
    expect(confirmChargePlan({ choice: 'VOUCHER' })).toEqual({ pay: false, embedReceipt: false, next: 'voucher' });
    expect(confirmChargePlan({ choice: 'CREDIT_CARD', prepaid: true }).next).toBe('stay');
    expect(guestCheckoutShowsStay({ isSubmitted: true })).toBe(false);
    expect(guestCheckoutShowsStay({ cashFollowup: true, booking: { booking_status: 'CHECKED_IN' } })).toBe(false);
  });

  it('already-paid is not a method and cannot open the unpaid stay guide', () => {
    expect(acceptedGuestPaymentChoice('ALREADY_PAID')).toBe('');
    expect(acceptedGuestPaymentChoice('CREDIT_CARD')).toBe('CREDIT_CARD');
    expect(confirmChargePlan({ choice: 'ALREADY_PAID' })).toEqual({
      pay: false,
      embedReceipt: false,
      next: 'methods'
    });
    const booking = {
      booking_status: 'CONFIRMED',
      payment_status: 'UNPAID',
      payment_mode: 'ALREADY_PAID',
      total_price_agorot: 135000,
      deposit_agorot: 27000,
      stay: {
        id_photo_received_at: '2026-11-06T11:29:34.361Z',
        checkout_completed_at: '2026-11-06T13:03:00.000Z',
        payment_choice: 'ALREADY_PAID',
        cabin_ready: true,
        operational_status: 'READY'
      }
    };
    expect(guestCheckoutShowsStay({ booking, isSubmitted: true })).toBe(false);
    expect(guestCheckoutResumeStep(booking)).toBe(3);
    expect(guestCheckoutResumeView(booking)).toBe('methods');
  });

  it('a later visit with a saved unpaid cash or bank choice stays on that path', () => {
    const cash = {
      payment_status: 'UNPAID',
      stay: {
        id_photo_received_at: '2026-11-06T10:00:00Z',
        checkout_completed_at: '2026-11-06T10:05:00Z',
        payment_choice: 'CASH'
      }
    };
    const bank = {
      payment_status: 'UNPAID',
      stay: {
        id_photo_received_at: '2026-11-06T10:00:00Z',
        checkout_completed_at: '2026-11-06T10:05:00Z',
        payment_choice: 'BANK_TRANSFER'
      }
    };
    expect(guestCheckoutShowsStay({ booking: cash, isSubmitted: true })).toBe(false);
    expect(guestCheckoutShowsStay({ booking: bank, isSubmitted: true })).toBe(false);
    expect(guestCheckoutResumeView(cash)).toBe('cash');
    expect(guestCheckoutResumeView(bank)).toBe('bank');
    expect(guestCheckoutResumeStep({
      stay: { id_photo_received_at: '2026-11-06T10:00:00Z' }
    })).toBe(3);
  });

  it('a recorded receipt or an in-house guest still sees the stay page', () => {
    expect(guestCheckoutShowsStay({ paidReturn: true })).toBe(false);
    expect(guestCheckoutShowsStay({
      paidReturn: true,
      booking: {
        payment_status: 'PAID',
        clearing_payments: [{ amount_agorot: 135000, source: 'HYP', ref: 'auth' }]
      }
    })).toBe(true);
    expect(guestCheckoutShowsStay({
      booking: { booking_status: 'CHECKED_IN', payment_status: 'UNPAID', stay: {} }
    })).toBe(true);
    expect(guestCheckoutShowsStay({
      booking: { payment_status: 'UNPAID', channel_source: 'booking.com', stay: {} }
    })).toBe(true);
    expect(guestCheckoutShowsStay({
      booking: { is_cabin_portal: true, payment_status: 'UNPAID' }
    })).toBe(true);
  });

  it('the charge flag follows the chosen method, not a stale cash mode', () => {
    expect(confirmShouldStartCardCharge({
      pay: false,
      paymentMode: 'CREDIT_DEPOSIT',
      paymentChoice: 'CREDIT_CARD'
    })).toBe(false);
    expect(confirmShouldStartCardCharge({
      pay: true,
      paymentMode: 'CREDIT_DEPOSIT',
      paymentChoice: 'CREDIT_CARD'
    })).toBe(true);
    expect(confirmShouldStartCardCharge({
      pay: true,
      paymentMode: 'CASH_TRUST',
      paymentChoice: 'CASH'
    })).toBe(false);
    expect(confirmShouldStartCardCharge({
      pay: true,
      paymentMode: 'CREDIT_DEPOSIT',
      paymentChoice: 'BANK_TRANSFER'
    })).toBe(false);
    expect(confirmShouldStartCardCharge({
      pay: true,
      paymentMode: 'VOUCHER',
      paymentChoice: 'VOUCHER'
    })).toBe(false);
  });

  it('confirm does not store an already-paid choice', () => {
    expect(persistGuestPaymentChoice({
      requested: 'ALREADY_PAID',
      previousChoice: 'ALREADY_PAID',
      previousMode: 'ALREADY_PAID'
    })).toEqual({
      choice: '',
      paymentMode: 'CREDIT_DEPOSIT',
      balancePreference: ''
    });
    expect(persistGuestPaymentChoice({ requested: 'CASH' })).toMatchObject({
      choice: 'CASH',
      paymentMode: 'CASH_TRUST'
    });
    expect(persistGuestPaymentChoice({ requested: 'BANK' })).toMatchObject({
      choice: 'BANK_TRANSFER',
      paymentMode: 'CREDIT_DEPOSIT'
    });
    const checkout = readFileSync(new URL('../components/GuestCheckout.jsx', import.meta.url), 'utf8');
    const pages = readFileSync(new URL('../../functions/api/checkout/[[path]].js', import.meta.url), 'utf8');
    const node = readFileSync(new URL('../../server/guestCheckout.js', import.meta.url), 'utf8');
    expect(checkout.includes('GUEST_PAY_ALREADY_PAID_TITLE')).toBe(false);
    expect(checkout.includes("setBalancePref('ALREADY_PAID')")).toBe(false);
    expect(pages.includes("ALREADY_PAID' ? 'ALREADY_PAID'")).toBe(false);
    expect(node.includes("ALREADY_PAID' ? 'ALREADY_PAID'")).toBe(false);
    expect(pages.includes('persistGuestPaymentChoice')).toBe(true);
    expect(node.includes('persistGuestPaymentChoice')).toBe(true);
  });
});


describe('stay guide gate - no old unpaid success screen', () => {
  it('deposit-paid / partial bookings do not open the stay guide', () => {
    const deposit = {
      payment_status: 'DEPOSIT_PAID',
      total_price_agorot: 70000,
      deposit_agorot: 56000,
      clearing_payments: [{ amount_agorot: 56000, method: 'cash' }],
      stay: { id_photo_received_at: '2026-11-08T12:00:00Z' },
      booking_status: 'CONFIRMED'
    };
    const partial = { ...deposit, payment_status: 'PARTIAL' };
    expect(bookingMayShowStay(deposit)).toBe(false);
    expect(bookingMayShowStay(partial)).toBe(false);
    expect(guestCheckoutShowsStay({ booking: deposit })).toBe(false);
    expect(guestCheckoutResumeView(deposit)).toBe('methods');
  });

  it('fully paid or in-house still opens the stay guide', () => {
    const paid = {
      payment_status: 'PAID',
      total_price_agorot: 70000,
      clearing_payments: [{ amount_agorot: 70000, method: 'cash' }],
      booking_status: 'CONFIRMED'
    };
    const inHouse = {
      payment_status: 'DEPOSIT_PAID',
      total_price_agorot: 70000,
      booking_status: 'CHECKED_IN',
      stay: { guest_checked_in_at: '2026-11-08T15:00:00Z' }
    };
    expect(bookingMayShowStay(paid)).toBe(true);
    expect(bookingMayShowStay(inHouse)).toBe(true);
  });
});

describe('regression: old manual-payment success copy must stay gone', () => {
  const forbidden = 'נציגנו ייצור איתך קשר';
  const sources = [
    'src/i18n.js',
    'src/components/GuestStay.jsx',
    'src/components/GuestCheckout.jsx',
    'src/lib/guestPaymentFlow.js'
  ];

  it('guest source files must not contain the old staff-contact success phrase', () => {
    for (const rel of sources) {
      const text = readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
      expect(text, rel).not.toContain(forbidden);
      expect(text, rel).not.toContain('GUEST_ID_RECEIVED');
      expect(text, rel).not.toContain('GUEST_PAID_CONFIRMED');
    }
  });

  it('built guest bundle (if present) must not contain the old phrase or keys', () => {
    const distDir = new URL('../../dist/assets/', import.meta.url);
    let files = [];
    try {
      files = readdirSync(distDir).filter((name) => /^(guest-|guestStayUrl-).*\.js$/.test(name));
    } catch {
      return;
    }
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const text = readFileSync(new URL(name, distDir), 'utf8');
      expect(text, name).not.toContain(forbidden);
      expect(text, name).not.toContain('GUEST_ID_RECEIVED');
      expect(text, name).not.toContain('GUEST_PAID_CONFIRMED');
    }
  });
});
