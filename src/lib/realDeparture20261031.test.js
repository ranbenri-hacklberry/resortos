// Ran 2026-10-31: CHECKED_OUT only on a real departure. A departing stay that is still CHECKED_IN/CONFIRMED
// on its checkout date must NOT block a same-day arrival anywhere (availability, iCal, overlap RPC/constraint).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDueOut, stayDisplayState } from './dueOut.js';
import { findOverlappingBooking, staysOverlap } from './bookingOverlap.js';
import { buildCheckoutLogEvent, checkoutSourceOf, CHECKOUT_SOURCE } from './roomLog.js';

const departing = { id: 'kin_test_1', unit_id: 'k808', check_in_date: '2026-10-30', check_out_date: '2026-10-31', booking_status: 'CHECKED_IN' };

vi.mock('../../functions/lib/calendarReplica.js', () => ({ loadCalendarReplica: vi.fn(async () => ({ blocked: [departing] })) }));
const pgRows = { rows: [] };
vi.mock('../../functions/api/_db.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    getPostgrestConfig: () => ({ baseUrl: 'http://fake.invalid', tenantId: 't1' }),
    fetchPostgrest: vi.fn(async () => ({ ok: true, json: async () => pgRows.rows })),
  };
});

describe('due_out display state', () => {
  it('checkout today and not CHECKED_OUT → due_out', () => {
    expect(isDueOut(departing, '2026-10-31')).toBe(true);
    expect(stayDisplayState({ ...departing, booking_status: 'CONFIRMED' }, '2026-10-31')).toBe('due_out');
  });
  it('real checkout, other days, cancelled → not due_out', () => {
    expect(isDueOut({ ...departing, booking_status: 'CHECKED_OUT' }, '2026-10-31')).toBe(false);
    expect(stayDisplayState({ ...departing, booking_status: 'CHECKED_OUT' }, '2026-10-31')).toBe('checked_out');
    expect(isDueOut(departing, '2026-10-30')).toBe(false);
    expect(isDueOut({ ...departing, booking_status: 'CANCELED' }, '2026-10-31')).toBe(false);
    expect(isDueOut({ ...departing, deleted_at: '2026-10-31' }, '2026-10-31')).toBe(false);
  });
});

describe('same-day arrival vs a departing stay still CHECKED_IN', () => {
  it('availability API: unit is available from the checkout date', async () => {
    const { onRequest } = await import('../../functions/api/availability.js');
    const free = await (await onRequest({ request: new Request('https://x/api/availability?unit_id=k808&from=2026-10-31&to=2026-11-01'), env: {} })).json();
    expect(free.available).toBe(true);
    const busy = await (await onRequest({ request: new Request('https://x/api/availability?unit_id=k808&from=2026-10-30&to=2026-10-31'), env: {} })).json();
    expect(busy.available).toBe(false);
  });
  it('iCal feed: DTEND is the (exclusive) checkout date, so the checkout day is free', async () => {
    pgRows.rows = [departing];
    const { onRequest } = await import('../../functions/api/ical/[unitId].js');
    const body = await (await onRequest({ params: { unitId: 'k808.ics' }, env: {} })).text();
    expect(body).toContain('DTSTART;VALUE=DATE:20261030');
    expect(body).toContain('DTEND;VALUE=DATE:20261031');
  });
  it('overlap helper (same predicate as RPC + exclusion constraint) does not block', () => {
    expect(findOverlappingBooking([departing], 'k808', '2026-10-31', '2026-11-01')).toBeUndefined();
    expect(findOverlappingBooking([departing], 'k808', '2026-10-30', '2026-11-01')).toBeTruthy();
    expect(staysOverlap('2026-10-31', '2026-11-01', departing.check_in_date, departing.check_out_date)).toBe(false);
  });
  it('RPC + exclusion constraint SQL use half-open ranges', () => {
    const rpc = readFileSync(new URL('../../server/migration_public_booking_rpc.sql', import.meta.url), 'utf8');
    expect(rpc).toMatch(/check_in_date < p_check_out\s+AND check_out_date > p_check_in/);
    const excl = readFileSync(new URL('../../server/migration_booking_no_overlap.sql', import.meta.url), 'utf8');
    expect(excl).toContain("daterange(check_in_date, check_out_date, '[)')");
  });
});

describe('room log source for Chloe guest_message checkouts', () => {
  it('labels guest_message as WhatsApp guest', () => {
    const b = { id: 'kin_x', checkout_status: 'guest_message', checked_out_at: '2026-10-31T09:05:00Z', guest_name: 'T' };
    expect(checkoutSourceOf(b)).toBe('guest_message');
    expect(buildCheckoutLogEvent(b).actor).toBe(CHECKOUT_SOURCE.guest_message);
    expect(buildCheckoutLogEvent(b).at).toBe('2026-10-31T09:05:00Z');
  });
});
