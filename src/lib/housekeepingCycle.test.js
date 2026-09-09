import { describe, expect, it, vi } from 'vitest';
import { applyCalendarOccupancy, applyCalendarUnitStatus, isStaleHousekeeping, turnoverNeed } from './housekeepingCycle.js';
import { hideHousekeepingTaskWhileOccupied, isExpiredPendingInspect } from './unitStatus.js';

const unit = { id: 'k671', name: 'נורית 1', is_active: true, operational_status: 'READY' };

describe('today-only turnover tasks', () => {
  it('does not reopen dirty from an old checkout', () => {
    const bookings = [{
      id: 'old',
      unit_id: 'k671',
      check_in_date: '2026-08-20',
      check_out_date: '2026-08-22',
      booking_status: 'CHECKED_OUT'
    }];
    expect(turnoverNeed(unit, bookings, '2026-08-25')).toBeNull();
    expect(isStaleHousekeeping({ ...unit, operational_status: 'DIRTY' }, bookings, '2026-08-25')).toBe(true);
    expect(isStaleHousekeeping({
      ...unit,
      operational_status: 'DIRTY',
      updated_at: '2026-08-25T08:00:00.000Z'
    }, bookings, '2026-08-25')).toBe(false);
    expect(hideHousekeepingTaskWhileOccupied({ ...unit, operational_status: 'DIRTY' }, bookings, '2026-08-25')).toBe(true);
    expect(hideHousekeepingTaskWhileOccupied(unit, bookings, '2026-08-25')).toBe(true);
  });

  it('clears leftover dirty while guests are still in-house, but keeps a same-day staff mark', () => {
    const bookings = [{
      id: 'stay',
      unit_id: 'k671',
      check_in_date: '2026-08-20',
      check_out_date: '2026-08-28',
      booking_status: 'CHECKED_IN'
    }];
    expect(turnoverNeed(unit, bookings, '2026-08-25')).toBeNull();
    expect(isStaleHousekeeping({
      ...unit,
      operational_status: 'DIRTY',
      updated_at: '2026-08-24T08:00:00.000Z'
    }, bookings, '2026-08-25')).toBe(true);
    expect(isStaleHousekeeping({
      ...unit,
      operational_status: 'DIRTY',
      updated_at: '2026-08-25T08:00:00.000Z'
    }, bookings, '2026-08-25')).toBe(false);
  });

  it('keeps a checkout-day cleaning task', () => {
    const bookings = [{
      id: 'today',
      unit_id: 'k671',
      check_in_date: '2026-08-23',
      check_out_date: '2026-08-25',
      booking_status: 'CHECKED_OUT'
    }];
    expect(turnoverNeed(unit, bookings, '2026-08-25')).toEqual({ reason: 'ניקוי לאחר יציאה והכנה לכניסה' });
    expect(hideHousekeepingTaskWhileOccupied({ ...unit, operational_status: 'DIRTY' }, bookings, '2026-08-25')).toBe(false);
    expect(hideHousekeepingTaskWhileOccupied(unit, bookings, '2026-08-25')).toBe(true);
    expect(hideHousekeepingTaskWhileOccupied(unit, [{ ...bookings[0], booking_status: 'CHECKED_IN' }], '2026-08-25')).toBe(true);
  });

  it('does not overwrite gardening with a turnover dirty task', () => {
    const bookings = [{
      id: 'today',
      unit_id: 'k671',
      check_in_date: '2026-08-23',
      check_out_date: '2026-08-25',
      booking_status: 'CHECKED_OUT'
    }];
    expect(turnoverNeed({ ...unit, operational_status: 'GARDENING' }, bookings, '2026-08-25')).toBeNull();
  });
});

describe('pending manager inspect expiry', () => {
  it('closes inspect the day after the task was done', () => {
    const waiting = {
      ...unit,
      custom_reason: 'ממתין לביקורת מנהל',
      quality_inspections: [{
        at: '2026-08-24T12:00:00.000Z',
        ratings: {},
        note: 'סומן נקי מהיומן',
        source: 'calendar',
        reopened: false
      }]
    };
    const bookings = [{
      id: 'today',
      unit_id: 'k671',
      check_in_date: '2026-08-23',
      check_out_date: '2026-08-25',
      booking_status: 'CHECKED_OUT'
    }];
    expect(isExpiredPendingInspect(waiting, '2026-08-25')).toBe(true);
    expect(hideHousekeepingTaskWhileOccupied(waiting, bookings, '2026-08-25')).toBe(true);
    expect(isExpiredPendingInspect({
      ...waiting,
      quality_inspections: [{ ...waiting.quality_inspections[0], at: '2026-08-25T08:00:00.000Z' }]
    }, '2026-08-25')).toBe(false);
  });
});

describe('calendar field status', () => {
  it('marks ready through the inspection path and opens a fault ticket', async () => {
    const pushed = [];
    const pushUnitToCloud = vi.fn(async (row) => { pushed.push(row); });
    await applyCalendarUnitStatus({
      tenantId: 't1',
      unit,
      status: 'READY',
      pushUnitToCloud
    });
    expect(pushed[0].operational_status).toBe('READY');
    expect(pushed[0].quality_inspections?.at(-1)?.source).toBe('calendar');

    await applyCalendarUnitStatus({
      tenantId: 't1',
      unit,
      status: 'MAINTENANCE_ALERT',
      pushUnitToCloud
    });
    const fault = pushed.at(-1);
    expect(fault.operational_status).toBe('MAINTENANCE_ALERT');
    expect(fault.operational_domain).toBe('MAINTENANCE');
    expect(fault.is_escalated).toBe(true);
  });

  it('flips staff occupancy without wiping housekeeping', async () => {
    const pushed = [];
    const pushUnitToCloud = vi.fn(async (row) => { pushed.push(row); });
    await applyCalendarOccupancy({
      tenantId: 't1',
      unit: { ...unit, operational_status: 'DIRTY' },
      occupancy: 'OCCUPIED',
      pushUnitToCloud
    });
    expect(pushed[0].staff_occupancy).toBe('OCCUPIED');
    expect(pushed[0].operational_status).toBeUndefined();
  });
});
