import { describe, expect, it } from 'vitest';
import { housekeepingRoomStatusLabel, housekeepingTaskCopy, isGenericTurnoverReason, taskNeedsRoomLockbox } from './housekeepingTaskMeta.js';

const unit = { id: 'k810', name: "טאג' מאהל · בקתה 3", operational_status: 'DIRTY' };

describe('housekeepingTaskMeta', () => {
  it('treats the default turnover phrase as generic', () => {
    expect(isGenericTurnoverReason('ניקוי לאחר יציאה והכנה לכניסה')).toBe(true);
    expect(isGenericTurnoverReason('חוסר: מגבות')).toBe(false);
  });

  it('labels leftover dirty vacant as vacant', () => {
    expect(housekeepingRoomStatusLabel({
      unit: { ...unit, staff_occupancy: 'VACANT' },
      bookings: [],
      today: '2026-09-16'
    })).toBe('פנוי');
  });

  it('uses the real 15:00 arrival, not a שיפוץ hold checkout', () => {
    expect(housekeepingRoomStatusLabel({
      unit: { id: 'k685', operational_status: 'DIRTY' },
      bookings: [
        {
          id: 'hold',
          unit_id: 'k685',
          guest_name: 'תפוס שיפוץ',
          check_in_date: '2026-09-15',
          check_out_date: '2026-09-17',
          booking_status: 'CHECKED_OUT'
        },
        {
          id: 'in',
          unit_id: 'k685',
          guest_name: 'שאדהי',
          check_in_date: '2026-09-17',
          check_out_date: '2026-09-18',
          booking_status: 'CONFIRMED',
          special_requests: '|in:15:00|out:13:00'
        }
      ],
      today: '2026-09-17'
    })).toBe('כניסה · 15:00');
  });

  it('labels checkout with scheduled hour, or actual clock when they already left', () => {
    expect(housekeepingRoomStatusLabel({
      unit,
      bookings: [{
        id: 'b1',
        unit_id: 'k810',
        check_in_date: '2026-09-14',
        check_out_date: '2026-09-16',
        booking_status: 'CONFIRMED',
        checkout_time: '11:00'
      }],
      today: '2026-09-16'
    })).toBe('צ׳ק אאוט · 11:00');

    expect(housekeepingRoomStatusLabel({
      unit,
      bookings: [{
        id: 'b2',
        unit_id: 'k810',
        check_in_date: '2026-09-14',
        check_out_date: '2026-09-16',
        booking_status: 'CHECKED_OUT',
        stay: { self_checked_out_at: '2026-09-16T06:42:00.000Z' }
      }],
      today: '2026-09-16'
    })).toBe('צ׳ק אאוט · 09:42');
  });

  it('replaces the generic reason and shows the full 4-digit lockbox', () => {
    const copy = housekeepingTaskCopy({
      unit: { ...unit, custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה', staff_occupancy: 'VACANT' },
      bookings: [],
      today: '2026-09-16'
    });
    expect(copy.reason).toBe('פנוי');
    expect(copy.lockbox).toBe('2530');
  });

  it('shows a lockbox only when staff need to enter a cabin', () => {
    expect(taskNeedsRoomLockbox({ id: 'k810', domain: 'HOUSEKEEPING' })).toBe(true);
    expect(taskNeedsRoomLockbox({ id: 'k810', domain: 'MAINTENANCE' })).toBe(true);
    expect(taskNeedsRoomLockbox({ id: 'k810', domain: 'GARDENING' })).toBe(false);
    expect(taskNeedsRoomLockbox({ id: 'scope:mool:1', domain: 'MANAGER', scoped: true })).toBe(false);
    expect(taskNeedsRoomLockbox({ domain: 'GARDENING', scoped: true, propertyId: 'mool' })).toBe(false);
  });
});
