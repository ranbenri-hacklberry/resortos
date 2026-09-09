import { describe, expect, it } from 'vitest';
import { coveringStayOnDate, isPaintedStay } from './calendarOccupancy.js';
import { mergeKinorotArrivals } from './bookingFinance.js';
import { unitDisplayStatus } from './unitStatus.js';
import { hideClosedOrRenovationUnit, isUnavailableHoldBooking } from './unavailableHold.js';

const hold = {
  id: 'kin_671_1',
  unit_id: 'k671',
  guest_name: 'שיפוץ גג',
  check_in_date: '2026-09-01',
  check_out_date: '2026-09-20',
  booking_status: 'CONFIRMED',
  special_requests: 'kinorot:1|pax:0+0+0'
};

const guest = {
  id: 'kin_671_2',
  unit_id: 'k672',
  guest_name: 'דנה כהן',
  check_in_date: '2026-09-04',
  check_out_date: '2026-09-06',
  booking_status: 'CONFIRMED',
  special_requests: 'kinorot:2|pax:2+0+0'
};

describe('unavailable Kinorot holds', () => {
  it('detects שיפוץ / סגור from Kinorot, not a normal guest', () => {
    expect(isUnavailableHoldBooking(hold)).toBe(true);
    expect(isUnavailableHoldBooking({ ...hold, guest_name: 'סגור' })).toBe(true);
    expect(isUnavailableHoldBooking(guest)).toBe(false);
    expect(isUnavailableHoldBooking({ ...hold, id: 'local-1', special_requests: '' })).toBe(true);
  });

  it('keeps the calendar empty and the unit name on שיפוץ', () => {
    expect(isPaintedStay(hold)).toBe(false);
    expect(coveringStayOnDate([hold], '2026-09-06', '2026-09-06')).toBe(null);
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'READY' }, [hold], '2026-09-06').key).toBe('UNAVAILABLE');
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'READY' }, [hold], '2026-09-06').label).toBe('שיפוץ');
    expect(unitDisplayStatus({ id: 'k671', operational_status: 'DIRTY' }, [hold], '2026-09-06').key).toBe('UNAVAILABLE');
  });

  it('hides holds from collection arrivals', () => {
    const rows = mergeKinorotArrivals([
      { id: 'c1', stayDate: '2026-09-05', guestName: 'סגור לשיפוץ', property: 'בתי נורית', amount: 0, status: 'unpaid' }
    ], [hold, guest], [{ id: 'k671', name: 'נורית 1' }, { id: 'k672', name: 'נורית 2' }], { today: '2026-09-06' });
    expect(rows.some((row) => /שיפוץ|סגור/.test(row.guestName || ''))).toBe(false);
    expect(rows.some((row) => row.source === 'kinorot-arrival' && row.guestName === 'דנה כהן')).toBe(true);
    expect(rows.some((row) => row.guestName === 'שיפוץ גג')).toBe(false);
  });

  it('hides cabins that only have סגור / שיפוץ in the window', () => {
    const range = { today: '2026-09-06', rangeStart: '2026-09-01', rangeEnd: '2026-09-25' };
    expect(hideClosedOrRenovationUnit({ id: 'k671' }, [hold], range)).toBe(true);
    expect(hideClosedOrRenovationUnit({ id: 'k672' }, [guest], range)).toBe(false);
    expect(hideClosedOrRenovationUnit({ id: 'k671' }, [hold, {
      ...guest,
      id: 'real',
      unit_id: 'k671',
      guest_name: 'אורח'
    }], range)).toBe(false);
  });
});
