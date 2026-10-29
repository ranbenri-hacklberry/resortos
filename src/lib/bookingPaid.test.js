import { describe, expect, it } from 'vitest';
import {
  awaitingCashCollection,
  hasRecordedReceipt,
  isFullyPaid,
  recordedPaidAgorot,
  applyBookingUpsell
} from './bookingPaid.js';

describe('status-only PAID without a receipt', () => {
  const jackie = {
    payment_status: 'PAID',
    booking_status: 'CHECKED_IN',
    total_price_agorot: 180000,
    deposit_agorot: 0,
    clearing_payments: [],
    stay: {}
  };

  it('does not treat Kinorot cash / empty clearing as paid', () => {
    expect(hasRecordedReceipt(jackie)).toBe(false);
    expect(isFullyPaid(jackie)).toBe(false);
    expect(recordedPaidAgorot(jackie)).toBe(0);
  });

  it('does not treat deposit-equals-price as paid', () => {
    const michal = {
      payment_status: 'PAID',
      total_price_agorot: 118000,
      deposit_agorot: 118000,
      clearing_payments: [],
      stay: {}
    };
    expect(isFullyPaid(michal)).toBe(false);
    expect(recordedPaidAgorot(michal)).toBe(0);
  });

  it('treats a redeemed voucher as paid without a clearing row', () => {
    expect(isFullyPaid({
      ...jackie,
      payment_mode: 'VOUCHER',
      total_price_agorot: 0
    })).toBe(true);
  });

  it('treats Booking.com OTA as paid without a Kinorot clearing row', () => {
    expect(isFullyPaid({
      ...jackie,
      payment_mode: 'BOOKING',
      channel_source: 'booking_com',
      guest_email: 'guest@guest.booking.com'
    })).toBe(true);
  });

  it('trusts a clearing row', () => {
    const paid = {
      ...jackie,
      clearing_payments: [{ amount_agorot: 180000, method: 'CARD', source: 'HY' }]
    };
    expect(hasRecordedReceipt(paid)).toBe(true);
    expect(isFullyPaid(paid)).toBe(true);
  });
});

describe('awaiting cash collection', () => {
  it('shows until cash is collected, then hides', () => {
    const due = {
      payment_mode: 'CASH_TRUST',
      payment_status: 'PENDING_CASH',
      total_price_agorot: 85000,
      stay: { cash_expected: true }
    };
    expect(awaitingCashCollection(due)).toBe(true);
    expect(awaitingCashCollection({
      ...due,
      payment_mode: 'CASH',
      payment_status: 'PAID',
      clearing_payments: [{ amount_agorot: 85000, source: 'CASH' }],
      stay: { cash_expected: false, cash_collected_at: '2026-09-08T08:00:00.000Z' }
    })).toBe(false);
  });
});

describe('applyBookingUpsell', () => {
  it('increases total price and turns a paid booking into PARTIAL when upsell price is added', () => {
    const booking = {
      id: 'b-100',
      total_price_agorot: 100000,
      payment_status: 'PAID',
      clearing_payments: [{ amount_agorot: 100000, source: 'CASH' }]
    };
    const updated = applyBookingUpsell(booking, {
      is_birthday: true,
      birthday_note: 'עוגה ובלונים',
      upsell_description: 'ארוחת בוקר',
      upsell_price: 200
    });
    expect(updated.total_price_agorot).toBe(120000);
    expect(updated.payment_status).toBe('PARTIAL');
    expect(updated.is_birthday).toBe(true);
    expect(updated.birthday_note).toBe('עוגה ובלונים');
    expect(updated.upsell_description).toBe('ארוחת בוקר');
    expect(updated.upsell_price).toBe(200);
  });

  it('restores PAID status when upsell price is removed', () => {
    const booking = {
      id: 'b-101',
      total_price_agorot: 120000,
      payment_status: 'PARTIAL',
      upsell_price: 200,
      clearing_payments: [{ amount_agorot: 100000, source: 'CASH' }]
    };
    const updated = applyBookingUpsell(booking, {
      upsell_price: null
    });
    expect(updated.total_price_agorot).toBe(100000);
    expect(updated.payment_status).toBe('PAID');
    expect(updated.upsell_price).toBeNull();
  });
});

