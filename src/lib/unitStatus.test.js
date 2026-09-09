import { describe, expect, it } from 'vitest';
import { bookingsMarkingNight, isEffectivelyOccupied, shouldAutoOccupyUnit, unitDisplayStatus, unitNameFrame, vacateBookingOnDate } from './unitStatus.js';

describe('unit name frames', () => {
  it('uses green ready, orange dirty, red fault, purple occupied', () => {
    expect(unitNameFrame('READY', false).border).toBe('#4ADE80');
    expect(unitNameFrame('DIRTY', false).border).toBe('#FB923C');
    expect(unitNameFrame('MAINTENANCE_ALERT', false).border).toBe('#F87171');
    expect(unitNameFrame('OCCUPIED', false).border).toBe('#8B5CF6');
    expect(unitNameFrame('UNAVAILABLE', false).border).toBe('#A8A29E');
  });

  it('marks checkout day as leaving, never occupied', () => {
    const leaving = [{
      id: 'out',
      unit_id: 'k680',
      check_in_date: '2026-09-03',
      check_out_date: '2026-09-04',
      booking_status: 'CHECKED_IN'
    }];
    expect(unitDisplayStatus({ id: 'k680', operational_status: 'READY' }, leaving, '2026-09-04').key).toBe('LEAVING');
    expect(unitDisplayStatus({ id: 'k680', operational_status: 'DIRTY', staff_occupancy: 'OCCUPIED' }, leaving, '2026-09-04').key).toBe('OCCUPIED');
    expect(unitDisplayStatus({ id: 'k680', operational_status: 'READY' }, [{
      ...leaving[0],
      booking_status: 'CONFIRMED'
    }], '2026-09-04').key).toBe('LEAVING');
  });

  it('never shows ready or leftover cleaning once a guest has already slept in', () => {
    const bookings = [{
      id: 'stay',
      unit_id: 'k671',
      check_in_date: '2026-09-01',
      check_out_date: '2026-09-04',
      booking_status: 'CHECKED_IN'
    }];
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'DIRTY' }, bookings, '2026-09-02').key).toBe('OCCUPIED');
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'IN_PROGRESS' }, bookings, '2026-09-02').key).toBe('OCCUPIED');
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'READY' }, bookings, '2026-09-02').key).toBe('OCCUPIED');
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'MAINTENANCE_ALERT' }, bookings, '2026-09-02').key).toBe('MAINTENANCE_ALERT');
  });

  it('marks mid-stay occupied from the stay dates, not only a staff flip', () => {
    const tarek = [{
      id: 'tarek',
      unit_id: 'dome-green',
      check_in_date: '2026-09-03',
      check_out_date: '2026-09-05',
      booking_status: 'CONFIRMED'
    }];
    expect(unitDisplayStatus({ id: 'dome-green', operational_status: 'READY' }, tarek, '2026-09-04').key).toBe('OCCUPIED');
    expect(unitDisplayStatus({
      id: 'dome-green',
      operational_status: 'DIRTY'
    }, tarek, '2026-09-04').key).toBe('OCCUPIED');
  });

  it('does not mark arrival-day stays occupied before check-in hour', () => {
    const omer = [{
      id: 'omer',
      unit_id: 'k681',
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05',
      booking_status: 'CHECKED_IN'
    }];
    const before = new Date('2026-09-04T11:59:00.000Z');
    expect(unitDisplayStatus({ id: 'k681', operational_status: 'READY' }, omer, '2026-09-04', before).key).toBe('READY');
  });

  it('marks arrival-day occupied only when staff flips it', () => {
    const omer = [{
      id: 'omer',
      unit_id: 'k681',
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05',
      booking_status: 'CONFIRMED',
      special_requests: 'kinorot:1|in:15:00'
    }];
    const after = new Date('2026-09-04T12:01:00.000Z');
    expect(unitDisplayStatus({ id: 'k681', operational_status: 'READY' }, omer, '2026-09-04', after).key).toBe('READY');
    expect(unitDisplayStatus({
      id: 'k681',
      operational_status: 'READY',
      staff_occupancy: 'OCCUPIED'
    }, omer, '2026-09-04', after).key).toBe('OCCUPIED');
  });

  it('keeps dirty after checkout; ready only when staff marked it', () => {
    const arriving = [{
      id: 'in',
      unit_id: 'hill-2',
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05',
      booking_status: 'CONFIRMED'
    }];
    const turnover = [
      {
        id: 'out',
        unit_id: 'hill-2',
        check_in_date: '2026-09-02',
        check_out_date: '2026-09-04',
        booking_status: 'CHECKED_OUT'
      },
      arriving[0]
    ];
    const morning = new Date('2026-09-04T08:00:00.000Z');
    expect(unitDisplayStatus({ id: 'hill-2', operational_status: 'DIRTY' }, arriving, '2026-09-04', morning).key).toBe('DIRTY');
    expect(unitDisplayStatus({ id: 'hill-2', operational_status: 'READY' }, arriving, '2026-09-04', morning).key).toBe('READY');
    expect(unitDisplayStatus({ id: 'hill-2', operational_status: 'DIRTY' }, turnover, '2026-09-04', morning).key).toBe('DIRTY');
    expect(unitDisplayStatus({ id: 'hill-2', operational_status: 'READY' }, turnover, '2026-09-04', morning).key).toBe('READY');
  });

  it('does not let a stale vacant flag hide a guest who is still in', () => {
    const bookings = [{
      id: 'stay',
      unit_id: 'k671',
      check_in_date: '2026-09-03',
      check_out_date: '2026-09-06',
      booking_status: 'CHECKED_IN'
    }];
    const unit = { id: 'k671', operational_status: 'DIRTY', staff_occupancy: 'VACANT' };
    expect(isEffectivelyOccupied(unit, bookings, '2026-09-04')).toBe(false);
    expect(unitDisplayStatus(unit, bookings, '2026-09-04').key).toBe('DIRTY');
    expect(isEffectivelyOccupied({ id: 'k671', operational_status: 'READY' }, bookings, '2026-09-04')).toBe(true);
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'READY' }, bookings, '2026-09-04').key).toBe('OCCUPIED');
  });

  it('never auto-occupies from check-in hour', () => {
    const unit = { id: 'k681', operational_status: 'READY' };
    const stay = [{
      id: 'omer',
      unit_id: 'k681',
      check_in_date: '2026-09-04',
      check_out_date: '2026-09-05',
      booking_status: 'CONFIRMED',
      special_requests: 'kinorot:1|in:15:00'
    }];
    const after = new Date('2026-09-04T12:01:00.000Z');
    expect(shouldAutoOccupyUnit(unit, stay, '2026-09-04', after)).toBe(false);
  });

  it('lets staff flip vacant and occupied without a booking', () => {
    const vacant = { id: 'k671', operational_status: 'READY', staff_occupancy: 'VACANT' };
    const taken = { id: 'k671', operational_status: 'READY', staff_occupancy: 'OCCUPIED' };
    expect(isEffectivelyOccupied(taken, [], '2026-09-02')).toBe(true);
    expect(isEffectivelyOccupied(vacant, [], '2026-09-02')).toBe(false);
    expect(unitDisplayStatus(taken, [], '2026-09-02').key).toBe('OCCUPIED');
    expect(unitDisplayStatus(vacant, [], '2026-09-02').key).toBe('READY');
  });

  it('ends today on the calendar when staff marks vacant', () => {
    const stay = {
      id: 'stay',
      unit_id: 'k671',
      check_in_date: '2026-09-01',
      check_out_date: '2026-09-04',
      booking_status: 'CHECKED_IN'
    };
    expect(bookingsMarkingNight([stay], 'k671', '2026-09-02')).toHaveLength(1);
    const vacated = vacateBookingOnDate(stay, '2026-09-02', '2026-09-02T08:00:00.000Z');
    expect(vacated.check_out_date).toBe('2026-09-04');
    expect(vacated.booking_status).toBe('CHECKED_OUT');
    expect(bookingsMarkingNight([vacated], 'k671', '2026-09-02')).toHaveLength(0);
    const arriving = {
      id: 'in',
      unit_id: 'k671',
      check_in_date: '2026-09-02',
      check_out_date: '2026-09-04',
      booking_status: 'CONFIRMED'
    };
    expect(bookingsMarkingNight([arriving], 'k671', '2026-09-02')).toHaveLength(0);
    expect(vacateBookingOnDate(arriving, '2026-09-02').booking_status).toBe('CONFIRMED');
  });
});
