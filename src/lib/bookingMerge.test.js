import { describe, expect, it } from 'vitest';
import { shouldApplyIncomingBooking } from './bookingMerge.js';
import { bookingStatusRank, paymentStatusRank } from './bookingPaid.js';

const ranks = {
  paymentStatusRank: () => 0,
  bookingStatusRank: () => 0
};

const realRanks = { paymentStatusRank, bookingStatusRank };

describe('shouldApplyIncomingBooking', () => {
  it('always writes a new id', () => {
    expect(shouldApplyIncomingBooking(null, { id: 'kin_680_70233' }, '2026-09-03', ranks)).toBe(true);
  });

  it('revives a locally canceled Kinorot stay when Postgres is live', () => {
    const existing = {
      id: 'kin_680_70233',
      booking_status: 'CANCELED',
      deleted_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    };
    const incoming = {
      id: 'kin_680_70233',
      booking_status: 'CONFIRMED',
      deleted_at: null,
      check_in_date: '2026-09-03',
      check_out_date: '2026-09-05',
      updated_at: '2026-09-03T09:54:56.000Z'
    };
    expect(shouldApplyIncomingBooking(existing, incoming, '2026-09-03', ranks)).toBe(true);
  });

  it('does not revive a locally canceled manual stay from an older cloud copy', () => {
    const existing = {
      id: 'bk_local',
      booking_status: 'CANCELED',
      deleted_at: '2026-09-03T10:00:00.000Z',
      updated_at: '2026-09-03T10:00:00.000Z'
    };
    const incoming = {
      id: 'bk_local',
      booking_status: 'CONFIRMED',
      deleted_at: null,
      updated_at: '2026-09-02T10:00:00.000Z'
    };
    expect(shouldApplyIncomingBooking(existing, incoming, '2026-09-03', ranks)).toBe(false);
  });

  it('applies a Studio row that gained Hyp references even if timestamps are older', () => {
    const existing = {
      id: 'kin_824_72914',
      payment_status: 'PAID',
      booking_status: 'CHECKED_IN',
      updated_at: '2026-09-07T16:00:00.000Z',
      clearing_payments: [{ source: 'KINOROT', txn: 'note' }]
    };
    const incoming = {
      id: 'kin_824_72914',
      payment_status: 'PAID',
      booking_status: 'CHECKED_IN',
      updated_at: '2026-09-07T12:00:00.000Z',
      clearing_payments: [{ source: 'HYP', ref: '0439905', txn: '475835790' }]
    };
    expect(shouldApplyIncomingBooking(existing, incoming, '2026-09-07', realRanks)).toBe(true);
  });

  it('lets a newer Studio UNPAID row overwrite a stale local PAID', () => {
    const existing = {
      id: 'kin_700_73094',
      payment_status: 'PAID',
      booking_status: 'CHECKED_IN',
      updated_at: '2026-09-03T10:00:00.000Z'
    };
    const incoming = {
      id: 'kin_700_73094',
      payment_status: 'UNPAID',
      booking_status: 'CONFIRMED',
      updated_at: '2026-09-04T08:00:00.000Z'
    };
    expect(shouldApplyIncomingBooking(existing, incoming, '2026-09-04', realRanks)).toBe(true);
  });

  it('applies incoming cash even when there is no Hyp approval number', () => {
    const existing = {
      id: 'kin_cash',
      payment_status: 'UNPAID',
      booking_status: 'CHECKED_IN',
      updated_at: '2026-09-07T16:00:00.000Z',
      clearing_payments: []
    };
    const incoming = {
      id: 'kin_cash',
      payment_status: 'PAID',
      booking_status: 'CHECKED_IN',
      updated_at: '2026-09-07T12:00:00.000Z',
      clearing_payments: [{ source: 'CASH', amount_agorot: 150000 }]
    };
    expect(shouldApplyIncomingBooking(existing, incoming, '2026-09-07', realRanks)).toBe(true);
  });
});
