import { describe, it, expect } from 'vitest';
import { formatManagerInitialCard, getRoomOccupancy } from './managerQuestions.js';

const today = '2026-10-22';
const bookings: any[] = [{ id: 'b1', unit_id: 'k690', guest_name: 'אורח בדיקה', check_in_date: today, check_out_date: '2026-10-23', booking_status: 'CONFIRMED' }];
const occ = getRoomOccupancy('k690', bookings, today);

describe('room card occupied state (Ran 2026-10-22, D1)', () => {
  it('checked-in room (staff_occupancy OCCUPIED) shows מאוכלס with the guest name', () => {
    const card = formatManagerInitialCard('חצר מוזיקלית 1', '0000', { id: 'k690', operational_status: 'READY', staff_occupancy: 'OCCUPIED' } as any, occ);
    expect(card).toContain('🏠 מאוכלס (אורח בדיקה)');
    expect(card).not.toContain('צ׳ק אין היום');
    expect(card).not.toContain('מוכן לאורח');
  });
  it('same-day booking not yet checked in still shows צ׳ק אין היום', () => {
    const card = formatManagerInitialCard('חצר מוזיקלית 1', '0000', { id: 'k690', operational_status: 'READY' } as any, occ);
    expect(card).toContain('🟢 צ׳ק אין היום (אורח בדיקה)');
    expect(card).not.toContain('מאוכלס');
  });
});
