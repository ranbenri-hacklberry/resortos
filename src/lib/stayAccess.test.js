import { describe, expect, it } from 'vitest';
import {
  applyPaidArrivalCheckin,
  guestCheckinAt,
  israelDateTime,
  isArrivalAfterCheckin,
  shouldAutoGuestCheckin,
  stayLinkExpired,
  stayPhase
} from './stayAccess.js';

const sapir = {
  id: 'kin_824_72226',
  check_in_date: '2026-09-05',
  check_out_date: '2026-09-06',
  booking_status: 'CONFIRMED',
  payment_status: 'PAID',
  total_price_agorot: 290000,
  special_requests: 'kinorot:72226|pax:5+0+0|out:15:00|in:15:00',
  clearing_payments: [{ amount_agorot: 290000 }],
  stay: {}
};

describe('guest check-in clock', () => {
  it('maps 15:00 Israel to the right UTC instant', () => {
    expect(israelDateTime('2026-09-05', '15:00')?.toISOString()).toBe('2026-09-05T12:00:00.000Z');
    expect(israelDateTime('2026-01-15', '15:00')?.toISOString()).toBe('2026-01-15T13:00:00.000Z');
  });

  it('treats arrival as in-room only after the check-in hour', () => {
    expect(isArrivalAfterCheckin(sapir, '2026-09-05', new Date('2026-09-05T11:59:00.000Z'))).toBe(false);
    expect(isArrivalAfterCheckin(sapir, '2026-09-05', new Date('2026-09-05T12:00:00.000Z'))).toBe(true);
    expect(isArrivalAfterCheckin(sapir, '2026-09-04', new Date('2026-09-05T12:00:00.000Z'))).toBe(false);
  });

  it('uses the booking check-in hour from Kinorot notes', () => {
    expect(guestCheckinAt(sapir)?.toISOString()).toBe('2026-09-05T12:00:00.000Z');
    expect(stayPhase(sapir, new Date('2026-09-05T11:59:00.000Z'))).toBe('pre');
    expect(stayPhase(sapir, new Date('2026-09-05T12:00:00.000Z'))).toBe('stay');
  });
});

describe('stay link expiry', () => {
  const now = new Date('2026-09-07T10:39:00.000Z');
  it('keeps a same-day or in-progress stay link alive', () => {
    expect(stayLinkExpired({
      check_in_date: '2026-09-07',
      check_out_date: '2026-09-08',
      booking_status: 'CONFIRMED'
    }, now)).toBe(false);
    expect(stayLinkExpired({
      check_in_date: '2026-09-07',
      check_out_date: '2026-09-07',
      booking_status: 'PENDING'
    }, now)).toBe(false);
  });

  it('expires only after the day following checkout', () => {
    expect(stayLinkExpired({
      check_in_date: '2026-09-05',
      check_out_date: '2026-09-06',
      booking_status: 'CONFIRMED'
    }, now)).toBe(false);
    expect(stayLinkExpired({
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05',
      booking_status: 'CONFIRMED'
    }, now)).toBe(true);
  });
});

describe('auto guest check-in', () => {
  it('waits until paid and check-in hour', () => {
    const unpaid = { ...sapir, payment_status: 'UNPAID', clearing_payments: [] };
    expect(shouldAutoGuestCheckin(unpaid, new Date('2026-09-05T12:05:00.000Z'))).toBe(false);
    expect(shouldAutoGuestCheckin(sapir, new Date('2026-09-05T11:59:00.000Z'))).toBe(false);
    expect(shouldAutoGuestCheckin(sapir, new Date('2026-09-05T12:00:00.000Z'))).toBe(true);
    expect(applyPaidArrivalCheckin(sapir, new Date('2026-09-05T12:00:00.000Z'))?.booking_status).toBe('CHECKED_IN');
  });

  it('does not reopen a guest already in', () => {
    const inStay = {
      ...sapir,
      booking_status: 'CHECKED_IN',
      stay: { guest_checked_in_at: '2026-09-05T12:01:00.000Z' }
    };
    expect(shouldAutoGuestCheckin(inStay, new Date('2026-09-05T13:00:00.000Z'))).toBe(false);
    expect(applyPaidArrivalCheckin(inStay)).toBe(null);
  });
});
