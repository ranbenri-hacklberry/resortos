import { describe, it, expect } from 'vitest';
import { unackedCheckoutToday, guestDepartedAt } from './unitStatus';

const today = '2026-10-29';
const unit = (updated_at) => ({ id: 'u1', operational_status: 'READY', updated_at });
const bk = (extra) => ({ id: 'b1', unit_id: 'u1', check_in_date: '2026-10-28', check_out_date: today, booking_status: 'CHECKED_IN', ...extra });

describe('unackedCheckoutToday', () => {
  it('departed today and not acknowledged -> pill', () => {
    const b = bk({ checked_out_at: '2026-10-29T08:40:00Z', checkout_status: 'self_departed' });
    expect(unackedCheckoutToday(unit('2026-10-29T06:00:00Z'), [b], today)).toBe('2026-10-29T08:40:00Z');
  });
  it('stay.self_checked_out_at counts as departure', () => {
    const b = bk({ stay: { self_checked_out_at: '2026-10-29T08:40:00Z' } });
    expect(unackedCheckoutToday(unit(null), [b], today)).toBeTruthy();
  });
  it('manual status change after departure -> normal', () => {
    const b = bk({ checked_out_at: '2026-10-29T08:40:00Z' });
    expect(unackedCheckoutToday(unit('2026-10-29T09:00:00Z'), [b], today)).toBeNull();
  });
  it('Kinorot CHECKED_OUT without checked_out_at -> normal', () => {
    const b = bk({ booking_status: 'CHECKED_OUT' });
    expect(unackedCheckoutToday(unit('2026-10-29T06:00:00Z'), [b], today)).toBeNull();
  });
  it('manager vacate alone is not a guest departure', () => {
    expect(guestDepartedAt(bk({ stay: { manager_checked_out_at: '2026-10-29T08:00:00Z' } }))).toBeNull();
  });
  it('departure not today -> normal', () => {
    const b = bk({ check_out_date: '2026-10-28', checked_out_at: '2026-10-28T08:40:00Z' });
    expect(unackedCheckoutToday(unit('2026-10-27T06:00:00Z'), [b], today)).toBeNull();
  });
  it('canceled booking ignored', () => {
    const b = bk({ booking_status: 'CANCELED', checked_out_at: '2026-10-29T08:40:00Z' });
    expect(unackedCheckoutToday(unit(null), [b], today)).toBeNull();
  });
});
