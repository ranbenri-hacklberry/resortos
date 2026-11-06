import { describe, expect, it } from 'vitest';
import {
  checkoutPayUrl,
  confirmChargePlan,
  confirmShouldStartCardCharge,
  guestCheckoutResumeStep,
  guestCheckoutShowsStay
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
    expect(guestCheckoutShowsStay({
      booking: { ...booking, payment_status: 'PAID' }
    })).toBe(true);
    expect(guestCheckoutResumeStep({ ...booking, payment_status: 'PAID' })).toBe(1);
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

  it('cash, voucher, and already-paid do not start a card charge', () => {
    expect(confirmChargePlan({ choice: 'CASH' })).toMatchObject({ pay: false, next: 'stay' });
    expect(confirmChargePlan({ choice: 'VOUCHER' })).toMatchObject({ pay: false, next: 'stay' });
    expect(confirmChargePlan({ choice: 'ALREADY_PAID' })).toMatchObject({ pay: false, next: 'stay' });
    expect(confirmChargePlan({ choice: 'CREDIT_CARD', prepaid: true }).next).toBe('stay');
    expect(guestCheckoutShowsStay({ isSubmitted: true })).toBe(true);
  });

  it('a later visit that already saved a choice can keep the stay page', () => {
    expect(guestCheckoutShowsStay({
      booking: {
        payment_status: 'UNPAID',
        stay: {
          id_photo_received_at: '2026-11-06T10:00:00Z',
          checkout_completed_at: '2026-11-06T10:05:00Z',
          payment_choice: 'CASH'
        }
      }
    })).toBe(true);
    expect(guestCheckoutShowsStay({
      booking: {
        payment_status: 'UNPAID',
        stay: {
          id_photo_received_at: '2026-11-06T10:00:00Z',
          checkout_completed_at: '2026-11-06T10:05:00Z',
          payment_choice: 'BANK_TRANSFER'
        }
      }
    })).toBe(true);
    expect(guestCheckoutResumeStep({
      stay: { id_photo_received_at: '2026-11-06T10:00:00Z' }
    })).toBe(3);
  });

  it('a paid return or in-house guest still sees the stay page', () => {
    expect(guestCheckoutShowsStay({ paidReturn: true })).toBe(true);
    expect(guestCheckoutShowsStay({
      booking: { booking_status: 'CHECKED_IN', stay: {} }
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
});
