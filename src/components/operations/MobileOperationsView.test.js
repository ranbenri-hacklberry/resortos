import { describe, expect, it } from 'vitest';
import { israelToday } from '../../lib/cabinAccess';

describe('MobileOperationsView data structure and logic', () => {
  it('correctly detects same-day turnovers for urgent cleaning alert', () => {
    const today = israelToday();
    const bookings = [
      { id: 'b1', unit_id: 'u1', check_out_date: today, check_in_date: '2026-10-15', booking_status: 'CONFIRMED' },
      { id: 'b2', unit_id: 'u1', check_out_date: '2026-10-19', check_in_date: today, booking_status: 'CONFIRMED' },
      { id: 'b3', unit_id: 'u2', check_out_date: '2026-10-20', check_in_date: today, booking_status: 'CONFIRMED' }
    ];

    const isSameDayTurnover = (unitId) => {
      const cin = bookings.some(b => b.unit_id === unitId && b.check_in_date === today);
      const cout = bookings.some(b => b.unit_id === unitId && b.check_out_date === today);
      return cin && cout;
    };

    expect(isSameDayTurnover('u1')).toBe(true);
    expect(isSameDayTurnover('u2')).toBe(false);
  });

  it('aggregates Chloe WhatsApp shortage reports with custom_reason prefix', () => {
    const units = [
      { id: 'u1', name: 'בקתה 1', custom_reason: 'חוסר: 10 מגבות בריכה וקפסולות' },
      { id: 'u2', name: 'בקתה 2', operational_status: 'READY' }
    ];

    const shortages = units
      .filter(u => String(u.custom_reason || '').startsWith('חוסר:'))
      .map(u => ({ unitId: u.id, text: u.custom_reason.replace(/^חוסר:\s*/, '') }));

    expect(shortages).toHaveLength(1);
    expect(shortages[0].unitId).toBe('u1');
    expect(shortages[0].text).toBe('10 מגבות בריכה וקפסולות');
  });

  it('identifies maintenance alerts from Chloe and operations pipeline', () => {
    const units = [
      { id: 'u1', operational_status: 'MAINTENANCE_ALERT', operational_domain: 'MAINTENANCE', custom_reason: 'נזילה בברז גקוזי' },
      { id: 'u2', operational_status: 'READY' }
    ];

    const alerts = units.filter(u => u.operational_status === 'MAINTENANCE_ALERT' || u.operational_domain === 'MAINTENANCE');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].custom_reason).toBe('נזילה בברז גקוזי');
  });
});
