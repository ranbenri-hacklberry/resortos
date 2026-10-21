import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const expect = (v) => ({
  toBe: (x) => assert.equal(v, x),
  toMatch: (re) => assert.match(v, re),
  toContain: (x) => assert.ok(String(v).includes(x), `${v} !contains ${x}`),
  toHaveLength: (n) => assert.equal(v.length, n),
  toMatchObject: (o) => { for (const k of Object.keys(o)) assert.deepEqual(v[k], o[k]); }
});
import { buildCheckoutLogEvent, checkoutSourceOf, roomLogClock } from '../src/lib/roomLog.js';
import { logCheckoutToRoom, syncCheckoutRoomLogs } from './roomCheckoutLog.js';

const b = (o = {}) => ({ id: 'kin_688_1', unit_id: 'k688', guest_name: 'יוליה', booking_status: 'CHECKED_OUT', check_out_date: '2026-10-22', stay: {}, updated_at: '2026-10-22T08:05:00Z', ...o });

function fakeDb(units) {
  const calls = [];
  const rest = async (path, opts = {}) => {
    calls.push({ path, opts });
    if (path.startsWith('unit_operations') && !opts.method) {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)[1]);
      return units[id] ? [{ id, sop_progress: units[id] }] : [];
    }
    if (path.startsWith('unit_operations') && opts.method === 'PATCH') {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)[1]);
      units[id] = JSON.parse(opts.body).sop_progress; return null;
    }
    return units.__bookings || [];
  };
  return { rest, calls, units };
}

describe('checkout room-log event', () => {
  it('source detection', () => {
    expect(checkoutSourceOf(b({ stay: { self_checked_out_at: 'x' } }))).toBe('guest');
    expect(checkoutSourceOf(b({ checkout_status: 'self_departed' }))).toBe('guest');
    expect(checkoutSourceOf(b({ stay: { manager_checked_out_at: 'x' } }))).toBe('manager');
    expect(checkoutSourceOf(b())).toBe('sync');
  });
  it('builds entry with source, name and time', () => {
    const e = buildCheckoutLogEvent(b({ stay: { self_checked_out_at: '2026-10-22T07:42:00Z' } }));
    expect(e).toMatchObject({ id: 'checkout:kin_688_1', kind: 'checkout', actor: 'אורח מהדף', text: 'צ׳ק-אאוט · יוליה', at: '2026-10-22T07:42:00Z' });
    expect(roomLogClock(e.at)).toMatch(/10:42/);
  });
  it('late checkout', () => {
    expect(buildCheckoutLogEvent(b({ stay: { manager_checked_out_at: 'z', late_until: '13:00' } })).text).toBe('צ׳ק-אאוט · יוליה · צ׳ק-אאוט מאוחר עד 13:00');
    expect(buildCheckoutLogEvent(b({ stay: { late_until: 'next' } })).text).toContain('למחרת');
  });
});

describe('sync time', () => {
  it('caps sync time at booked 11:00 Israel', () => {
    const e = buildCheckoutLogEvent(b({ updated_at: '2026-10-22T10:15:00Z' }));
    expect(e.actor).toBe('סנכרון');
    expect(e.at).toBe('2026-10-22T08:00:00.000Z');
    const w = buildCheckoutLogEvent(b({ check_out_date: '2026-12-01', updated_at: '2026-12-01T12:00:00Z' }));
    expect(w.at).toBe('2026-12-01T09:00:00.000Z');
  });
  it('skips placeholders/blocks', async () => {
    const db = fakeDb({ k688: {} });
    expect((await logCheckoutToRoom(b({ guest_name: 'תפוס' }), { rest: db.rest })).skipped).toMatch(/non-guest/);
    expect((await logCheckoutToRoom(b({ guest_name: 'לא זמין' }), { rest: db.rest })).skipped).toMatch(/non-guest/);
  });
});

describe('logCheckoutToRoom / poller', () => {
  it('one checkout = one entry', async () => {
    const db = fakeDb({ k688: { roomLog: [{ id: 'a', kind: 'enter' }] } });
    expect((await logCheckoutToRoom(b(), { rest: db.rest })).logged).toBe(true);
    expect((await logCheckoutToRoom(b({ stay: { manager_checked_out_at: 'y' } }), { rest: db.rest })).skipped).toBe('exists');
    expect(db.units.k688.roomLog.filter((r) => r.kind === 'checkout')).toHaveLength(1);
    expect(db.units.k688.roomLog[0].id).toBe('a');
  });
  it('skips siesta and unknown unit row', async () => {
    const db = fakeDb({});
    expect((await logCheckoutToRoom(b(), { rest: db.rest })).skipped).toBe('no unit row');
    expect((await logCheckoutToRoom(b({ guest_name: 'סיאסטה' }), { rest: db.rest })).skipped).toBe('siesta');
  });
  it('poller logs each recent checkout once', async () => {
    const db = fakeDb({ k688: {}, k684: { roomLog: [] }, __bookings: [b(), b({ id: 'kin_684_2', unit_id: 'k684', guest_name: 'צור' })] });
    const r1 = await syncCheckoutRoomLogs({ rest: db.rest, now: new Date('2026-10-22T09:00:00Z') });
    expect(r1.filter((x) => x.logged)).toHaveLength(2);
    expect(db.calls[0].path).toContain('check_out_date=gte.2026-10-21');
    const r2 = await syncCheckoutRoomLogs({ rest: db.rest, now: new Date('2026-10-22T09:02:00Z') });
    expect(r2.filter((x) => x.logged)).toHaveLength(0);
  });
});
