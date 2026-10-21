import { describe, expect, it } from 'vitest';
import { POLICY, quoteCancellation, boundaryAt, decisiveArrivalAt, policyForBooking, getPolicyVersion } from './cancellationPolicy.js';

const V = '1.1.2-draft';
const MIN = 60000;
const q = (checkInYmd, cancelAt, extra = {}) => quoteCancellation({ version: V, total: 1000, checkInYmd, cancelAt, ...extra });

describe('policy record', () => {
  it('1.1.1-draft current, older kept, not active, legal review required', () => {
    expect(POLICY.current_version).toBe(V);
    expect(POLICY.active_version).toBeNull();
    expect(getPolicyVersion('1.0.0-draft')).not.toBeNull();
    expect(POLICY.version_history.map((h) => h.version)).toEqual(['1.0.0-draft', '1.1.0-draft', '1.1.1-draft', V]);
    const v = getPolicyVersion(V);
    expect(v.status).toBe('PENDING_APPROVAL');
    expect(v.tiers_status).toBe('APPROVED');
    expect(v.legal_review).toBe('REQUIRED_BEFORE_BINDING_PUBLICATION');
    expect(v.non_refundable_rate.enabled).toBe(false);
    expect(v.tiers.some((t) => t.id === 'gap_24_48')).toBe(false);
  });
});

describe('boundaries in winter (no DST), check-in 2026-12-20', () => {
  const D = '2026-12-20';
  it('boundary instants are date−N at 15:00 Israel (UTC+2)', () => {
    expect(boundaryAt(D, 15).toISOString()).toBe('2026-12-05T13:00:00.000Z');
    expect(boundaryAt(D, 8).toISOString()).toBe('2026-12-12T13:00:00.000Z');
    expect(boundaryAt(D, 2).toISOString()).toBe('2026-12-18T13:00:00.000Z');
    expect(decisiveArrivalAt(D).toISOString()).toBe('2026-12-20T13:00:00.000Z');
  });
  it.each([[15, 'free', 'd8_14'], [8, 'd8_14', 'd2_7'], [2, 'd2_7', 'lt2']])('exactly %sd 15:00 and ±1 min', (n, at, after) => {
    const b = boundaryAt(D, n).getTime();
    expect(q(D, new Date(b - MIN)).tierId).toBe(at);
    expect(q(D, new Date(b)).tierId).toBe(at);
    expect(q(D, new Date(b + MIN)).tierId).toBe(after);
  });
  it('fees by tier', () => {
    expect(q(D, new Date('2026-11-01T10:00:00Z')).fee).toBe(0);
    expect(q(D, new Date('2026-12-10T10:00:00Z')).fee).toBe(200);
    expect(q(D, new Date('2026-12-15T10:00:00Z')).fee).toBe(700);
    const r = q(D, new Date('2026-12-19T10:00:00Z'));
    expect([r.tierId, r.fee, r.refund]).toEqual(['lt2', 1000, 0]);
  });
  it('booking check-in hour overrides 15:00', () => {
    expect(boundaryAt(D, 2, '17:00').toISOString()).toBe('2026-12-18T15:00:00.000Z');
    expect(q(D, new Date('2026-12-18T14:00:00Z'), { checkinTime: '17:00' }).tierId).toBe('d2_7');
    expect(q(D, new Date('2026-12-18T14:00:00Z')).tierId).toBe('lt2');
  });
});

describe('DST: real hours differ from nominal 360/192/48', () => {
  it('autumn (Israel back to UTC+2 on 2026-10-25): 2-day boundary = 49h, 8d = 193h', () => {
    const D = '2026-10-26';
    const arr = decisiveArrivalAt(D);
    expect((arr - boundaryAt(D, 2)) / 3600000).toBe(49);
    expect((arr - boundaryAt(D, 8)) / 3600000).toBe(193);
    // 48.5 real hours before arrival is AFTER the calendar boundary -> 100%
    expect(q(D, new Date(arr - 48.5 * 3600000)).tierId).toBe('lt2');
  });
  it('spring (Israel to UTC+3 on 2027-03-26): 2-day boundary = 47h, 15d = 359h', () => {
    const D = '2027-03-27';
    const arr = decisiveArrivalAt(D);
    expect((arr - boundaryAt(D, 2)) / 3600000).toBe(47);
    expect((arr - boundaryAt(D, 15)) / 3600000).toBe(359);
    // 47.5 real hours before (<48 nominal) is still ON/BEFORE the calendar boundary -> 70%
    expect(q(D, new Date(arr - 47.5 * 3600000)).tierId).toBe('d2_7');
    expect(q(D, new Date(arr - 359.5 * 3600000)).tierId).toBe('free');
  });
});

describe('no-show, exceptions, rounding, legacy', () => {
  it('no-show = 100%', () => {
    const D = '2026-12-20';
    expect(q(D, decisiveArrivalAt(D))).toMatchObject({ tierId: 'no_show', fee: 1000 });
    expect(q(D, new Date('2026-12-21T08:00:00Z'))).toMatchObject({ tierId: 'no_show', fee: 1000 });
    expect(q(D, new Date('2026-11-01T00:00:00Z'), { noShow: true }).fee).toBe(1000);
  });
  it('war/pandemic always manual', () => {
    const r = q('2026-12-20', new Date('2026-12-19T10:00:00Z'), { exception: 'war_or_global_pandemic' });
    expect(r.status).toBe('REQUIRES_MANAGER_APPROVAL');
    expect(r.proposedRefund).toBe(1000);
  });
  it('rounding to agorot', () => {
    const r = quoteCancellation({ version: V, total: 1234.57, checkInYmd: '2026-12-20', cancelAt: new Date('2026-12-15T10:00:00Z') });
    expect([r.fee, r.refund]).toEqual([864.2, 370.37]);
    const s = quoteCancellation({ version: V, total: 333.33, checkInYmd: '2026-12-20', cancelAt: new Date('2026-12-10T10:00:00Z') });
    expect([s.fee, s.refund]).toEqual([66.67, 266.66]);
  });
  it('legacy bookings without pinned version get no policy', () => {
    expect(policyForBooking({ id: 'old' })).toBeNull();
    expect(policyForBooking({ cancellation_policy_version: V }).version).toBe(V);
  });
  it('invalid input never charges', () => {
    expect(quoteCancellation({ version: 'x', total: 1, checkInYmd: '2026-12-20', cancelAt: new Date() }).status).toBe('REQUIRES_MANAGER_APPROVAL');
    expect(q('2026-12-20', new Date(), { total: -1 }).status).toBe('REQUIRES_MANAGER_APPROVAL');
  });
});
