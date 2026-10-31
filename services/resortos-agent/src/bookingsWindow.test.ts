import { describe, it, expect, vi } from 'vitest';
import { ResortOSClient } from './integration/resortos.js';
import { getRoomOccupancy } from './manager/managerQuestions.js';

const ymd = (d: number) => {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const x = new Date(`${t}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10);
};
const today = ymd(0);

// Emulates /api/ops/bookings: check_in_date < to AND check_out_date >= from, oldest first, limit 1000.
function fakeServer(rows: any[]) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const from = u.searchParams.get('from'); const to = u.searchParams.get('to');
    let out = rows.slice();
    if (from && to) out = out.filter((b) => b.check_in_date < to && b.check_out_date >= from);
    out.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
    return new Response(JSON.stringify({ ok: true, bookings: out.slice(0, 1000) }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}
const old = Array.from({ length: 1200 }, (_, i) => ({ id: `old${i}`, unit_id: 'k680', guest_phone: '0500000000', check_in_date: '2025-11-01', check_out_date: '2025-11-02', booking_status: 'CONFIRMED' }));
const arrivingToday = { id: 'b1', unit_id: 'k690', guest_name: 'אורח בדיקה', guest_phone: '0501234567', check_in_date: today, check_out_date: ymd(1), booking_status: 'CONFIRMED' };
const arrivingTomorrow = { id: 'b2', unit_id: 'k691', guest_name: 'מחר', guest_phone: '0507654321', check_in_date: ymd(1), check_out_date: ymd(2), booking_status: 'CONFIRMED' };

describe('bookings window (Ran 2026-10-22, D1)', () => {
  it('room card shows today\'s check-in as arriving, not vacant', async () => {
    const c = new ResortOSClient(fakeServer([...old, arrivingToday, arrivingTomorrow]) as any);
    const occ = getRoomOccupancy('k690', await c.listBookings({ from: today, to: today }), today);
    expect(occ.statusSummary).toContain('כניסה היום');
    expect(occ.activeBooking?.id).toBe('b1');
  });
  it('tomorrow\'s arrival is not occupied today', async () => {
    const c = new ResortOSClient(fakeServer([...old, arrivingToday, arrivingTomorrow]) as any);
    const rows = await c.listBookings({ from: today, to: today });
    expect(rows.some((b) => b.id === 'b2')).toBe(false);
    expect(getRoomOccupancy('k691', rows, today).statusSummary).toBe('פנוי ⚪');
  });
  it('guest checking in today is found by phone even with >1000 older bookings', async () => {
    const c = new ResortOSClient(fakeServer([...old, arrivingToday, arrivingTomorrow]) as any);
    expect((await c.findActiveBookingByPhone('050-1234567'))?.id).toBe('b1');
    const all = await c.listBookings();
    expect(all.some((b) => b.id === 'b1')).toBe(true);
  });
});
