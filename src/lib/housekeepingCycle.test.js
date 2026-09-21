import { describe, expect, it, vi } from 'vitest';
import { applyAssignedStaff, applyCalendarOccupancy, applyCalendarUnitStatus, isStaleHousekeeping, passedManagerInspection, persistRoomCompletions, turnoverNeed } from './housekeepingCycle.js';
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

  it('does not overwrite a same-day staff clean mark or a completions list', () => {
    const bookings = [{
      id: 'today',
      unit_id: 'k671',
      check_in_date: '2026-08-25',
      check_out_date: '2026-08-27',
      booking_status: 'CONFIRMED'
    }];
    expect(turnoverNeed({
      ...unit,
      operational_status: 'READY',
      updated_at: '2026-08-25T09:20:00.000Z',
      quality_inspections: [{ at: '2026-08-25T09:20:00.000Z', source: 'calendar', reopened: false }]
    }, bookings, '2026-08-25')).toBeNull();
    expect(turnoverNeed({
      ...unit,
      operational_status: 'NEEDS_COMPLETIONS',
      custom_reason: 'נקי · השלמות · מגבות',
      sop_progress: { completions: [{ id: 'c1', text: 'מגבות', done: false }] }
    }, bookings, '2026-08-25')).toBeNull();
  });

  it('ignores סגור / שיפוץ blocks when opening or keeping a cleaning task', () => {
    const closed = [
      {
        id: 'kin_689_1',
        unit_id: 'k689',
        guest_name: 'סגור',
        check_in_date: '2026-09-05',
        check_out_date: '2026-09-17',
        booking_status: 'CHECKED_OUT'
      },
      {
        id: 'kin_689_2',
        unit_id: 'k689',
        guest_name: 'סגור',
        check_in_date: '2026-09-17',
        check_out_date: '2026-09-20',
        booking_status: 'CONFIRMED'
      }
    ];
    expect(turnoverNeed({ id: 'k689', name: 'שאטו', is_active: true, operational_status: 'READY' }, closed, '2026-09-17')).toBeNull();
    expect(isStaleHousekeeping({
      id: 'k689',
      name: 'שאטו',
      is_active: true,
      operational_status: 'DIRTY',
      custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה',
      updated_at: '2026-09-17T09:19:41.891Z'
    }, closed, '2026-09-17')).toBe(false);
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

  it('moves a completions list to ready once every item is done', async () => {
    const pushed = [];
    const pushUnitToCloud = vi.fn(async (row) => { pushed.push(row); });
    await persistRoomCompletions({
      tenantId: 't1',
      unit,
      items: [{ id: 'c1', text: 'מגבות', done: false }],
      pushUnitToCloud
    });
    expect(pushed.at(-1).operational_status).toBe('NEEDS_COMPLETIONS');
    await persistRoomCompletions({
      tenantId: 't1',
      unit,
      items: [{ id: 'c1', text: 'מגבות', done: true }],
      pushUnitToCloud
    });
    expect(pushed.at(-1).operational_status).toBe('READY');
    expect(pushed.at(-1).quality_inspections?.at(-1)?.source).toBe('calendar');
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

  it('sets assigned staff without wiping housekeeping status', async () => {
    const pushed = [];
    const pushUnitToCloud = vi.fn(async (row) => { pushed.push(row); });
    await applyAssignedStaff({
      tenantId: 't1',
      unit: { ...unit, operational_status: 'DIRTY' },
      assignedStaff: 'אוסנת',
      pushUnitToCloud
    });
    expect(pushed[0].assigned_staff).toBe('אוסנת');
    expect(pushed[0].operational_status).toBeUndefined();
  });
});

describe('passed manager inspection', () => {
  it('treats rated manager feedback as passed and ignores a calendar clean mark', () => {
    expect(passedManagerInspection({
      operational_status: 'READY',
      custom_reason: 'ממתין לביקורת מנהל',
      quality_inspections: [{ at: '2026-09-16T08:00:00.000Z', source: 'calendar', ratings: {}, reopened: false }]
    })).toBe(false);
    expect(passedManagerInspection({
      operational_status: 'READY',
      lastInspection: { at: '2026-09-16T10:00:00.000Z', ratings: { clean: 5 }, reopened: false }
    })).toBe(true);
    expect(passedManagerInspection({
      qualityInspections: [{ at: '2026-09-16T10:00:00.000Z', ratings: { clean: 2 }, reopened: true }]
    })).toBe(false);
  });
});
