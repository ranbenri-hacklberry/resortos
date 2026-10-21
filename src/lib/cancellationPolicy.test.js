import { describe, expect, it } from 'vitest';
import { POLICY, quoteCancellation, decisiveArrivalAt, policyForBooking, getPolicyVersion } from './cancellationPolicy.js';

const V = '1.0.0-draft';
const q = (cancelAt, extra = {}) => quoteCancellation({ version: V, total: 1000, checkInYmd: '2026-12-20', cancelAt, ...extra });
// 2026-12-20 15:00 Israel (UTC+2, winter) = 13:00Z
const ARR = Date.parse('2026-12-20T13:00:00Z');
const before = (h) => new Date(ARR - h * 3600000);

describe('cancellation policy draft', () => {
  it('is a single versioned draft, not active, non-refundable disabled', () => {
    expect(POLICY.policy_id).toBe('resortos-cancellation-standard');
    expect(POLICY.active_version).toBeNull();
    const v = getPolicyVersion(V);
    expect(v.status).toBe('PENDING_APPROVAL');
    expect(v.non_refundable_rate.enabled).toBe(false);
    expect(v.no_show.defined).toBe(false);
  });
  it('decisive arrival = check-in day 15:00 Asia/Jerusalem', () => {
    expect(decisiveArrivalAt('2026-12-20').toISOString()).toBe('2026-12-20T13:00:00.000Z');
    expect(decisiveArrivalAt('2026-07-20').toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(decisiveArrivalAt('2026-12-20', '16:00').toISOString()).toBe('2026-12-20T14:00:00.000Z');
  });
  it.each([
    [30 * 24, 'free', 0], [15 * 24, 'free', 0], [15 * 24 - 0.01, 'd8_14', 200], [14 * 24, 'd8_14', 200],
    [8 * 24, 'd8_14', 200], [8 * 24 - 0.01, 'd2_7', 700], [7 * 24, 'd2_7', 700], [7.5 * 24, 'd2_7', 700],
    [48, 'd2_7', 700], [24, 'last24', 1000], [23, 'last24', 1000], [0, 'last24', 1000]
  ])('%s hours before -> %s fee %s', (h, tier, fee) => {
    const r = q(before(h));
    expect(r.status).toBe('CHARGE');
    expect(r.tierId).toBe(tier);
    expect(r.fee).toBe(fee);
    expect(r.refund).toBe(1000 - fee);
  });
  it.each([47.99, 36, 24.01])('gap window %s h requires manager approval, no charge', (h) => {
    const r = q(before(h));
    expect(r.status).toBe('REQUIRES_MANAGER_APPROVAL');
    expect(r.reason).toBe('UNDEFINED_WINDOW');
    expect(r.fee).toBeUndefined();
    expect(r.autoCharge).toBe(false);
  });
  it('after arrival (no-show) is undefined -> manager approval', () => {
    expect(q(before(-1)).reason).toBe('NO_SHOW_UNDEFINED');
  });
  it('war / pandemic exception never auto-charges', () => {
    const r = q(before(10), { exception: 'war_or_global_pandemic' });
    expect(r.status).toBe('REQUIRES_MANAGER_APPROVAL');
    expect(r.proposedRefund).toBe(1000);
  });
  it('charge amounts are rounded to agorot', () => {
    const r = quoteCancellation({ version: V, total: 1234.57, checkInYmd: '2026-12-20', cancelAt: before(100) });
    expect(r.fee).toBe(864.2);
    expect(r.refund).toBe(370.37);
  });
  it('DST: elapsed hours across the Oct 25 2026 clock change', () => {
    // arrival 2026-10-26 15:00 (+02) = 13:00Z; cancel 2026-10-24 15:00 (+03) = 12:00Z -> 49 real hours
    const r = quoteCancellation({ version: V, total: 1000, checkInYmd: '2026-10-26', cancelAt: new Date('2026-10-24T12:00:00Z') });
    expect(r.hoursBefore).toBe(49);
    expect(r.tierId).toBe('d2_7');
    // same wall-clock 15:00 two days before in spring (Mar 27 2026 DST start) -> 47 real hours -> gap
    const s = quoteCancellation({ version: V, total: 1000, checkInYmd: '2027-03-28', cancelAt: new Date('2027-03-26T13:00:00Z') });
    expect(s.hoursBefore).toBe(47);
    expect(s.status).toBe('REQUIRES_MANAGER_APPROVAL');
  });
  it('existing bookings: no pinned version -> no policy applied retroactively', () => {
    expect(policyForBooking({ id: 'old' })).toBeNull();
    expect(policyForBooking({ cancellation_policy_version: V }).version).toBe(V);
  });
  it('invalid input never produces a charge', () => {
    expect(quoteCancellation({ version: 'nope', total: 1000, checkInYmd: '2026-12-20', cancelAt: before(1) }).status).toBe('REQUIRES_MANAGER_APPROVAL');
    expect(q(before(1), { total: -5 }).status).toBe('REQUIRES_MANAGER_APPROVAL');
  });
});
