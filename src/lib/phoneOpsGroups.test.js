import { describe, expect, it } from 'vitest';
import { phoneOpsMatchesArea, phoneOpsSection, phoneOpsUnitLabel } from './phoneOpsGroups.js';

const day = '2026-11-03';

describe('phone operations groups', () => {
  it('keeps the desk area partition and labels a unit with its compound', () => {
    expect(phoneOpsMatchesArea({ id: 'k671', name: 'נורית 1' }, 'ramot')).toBe(true);
    expect(phoneOpsMatchesArea({ id: 'hill-1', name: 'גבעה 1' }, 'givat')).toBe(true);
    expect(phoneOpsMatchesArea({ id: 'k826', name: 'קאסה נובה' }, 'givat')).toBe(true);
    expect(phoneOpsMatchesArea({ id: 'pilot-office', name: 'משרד' }, 'pilot')).toBe(true);
    expect(phoneOpsMatchesArea({ id: 'k671', name: 'נורית 1' }, 'pilot')).toBe(false);
    expect(phoneOpsUnitLabel({ id: 'hill-1', name: 'גבעה 1' })).toContain('גבעה');
  });

  it('orders a unit into arrivals, then cleaning without an arrival, then occupied, then vacant', () => {
    const arriving = { id: 'k680', name: 'מול הנוף 1', operational_status: 'DIRTY', staff_occupancy: 'VACANT' };
    const cleaning = { id: 'k681', name: 'מול הנוף 2', operational_status: 'DIRTY', staff_occupancy: 'VACANT' };
    const occupied = { id: 'k671', name: 'נורית 1', operational_status: 'READY', staff_occupancy: 'OCCUPIED' };
    const vacant = { id: 'hill-1', name: 'גבעה 1', operational_status: 'READY', staff_occupancy: 'VACANT' };
    const bookings = [
      { id: 'in', unit_id: 'k680', guest_name: 'נכנס', check_in_date: day, check_out_date: '2026-11-06', booking_status: 'CONFIRMED' },
      { id: 'stay', unit_id: 'k671', guest_name: 'שוהה', check_in_date: '2026-11-01', check_out_date: '2026-11-06', booking_status: 'CONFIRMED' }
    ];
    expect(phoneOpsSection(arriving, bookings, day)).toBe('arriving');
    expect(phoneOpsSection(cleaning, bookings, day)).toBe('cleaning');
    expect(phoneOpsSection(occupied, bookings, day)).toBe('occupied');
    expect(phoneOpsSection(vacant, bookings, day)).toBe('vacant');
  });
});
