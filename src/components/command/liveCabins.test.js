import { describe, expect, it } from 'vitest';
import { commandStatus, currentStay, displayPhone, overlayLiveCabins } from './liveCabins';

describe('live command cabins', () => {
  it('shows the full phone', () => {
    expect(displayPhone('0548076123')).toBe('054-807-6123');
    expect(displayPhone('054-807-6123')).toBe('054-807-6123');
    expect(displayPhone('972548076123')).toBe('054-807-6123');
  });

  it('prefers the checked-in stay and maps housekeeping', () => {
    const bookings = [
      { id: 'old', unit_id: 'k680', booking_status: 'CHECKED_OUT', check_in_date: '2026-10-01', check_out_date: '2026-10-08', guest_name: 'יצא', guest_phone: '0500000000' },
      { id: 'now', unit_id: 'k680', booking_status: 'CHECKED_IN', check_in_date: '2026-10-08', check_out_date: '2026-10-12', guest_name: 'משפחת אור', guest_phone: '0541001840' },
    ];
    expect(currentStay(bookings, 'k680', '2026-10-09')?.id).toBe('now');
    expect(commandStatus({ operational_status: 'DIRTY' }, bookings[1])).toBe('dirty');
    expect(commandStatus({ operational_status: 'DIRTY', staff_occupancy: 'OCCUPIED' }, bookings[1])).toBe('occupied');
    expect(commandStatus({ operational_status: 'DIRTY' }, { booking_status: 'CHECKED_OUT' })).toBe('dirty');
    expect(commandStatus({ operational_status: 'IN_PROGRESS' }, null)).toBe('dirty');
    expect(commandStatus({ operational_status: 'READY', custom_reason: 'מוכן לאורח', quality_inspections: [{ at: '2026-10-09T08:00:00.000Z', source: 'calendar', ratings: {}, reopened: false }] }, null)).toBe('ready');
    expect(commandStatus({ operational_status: 'READY', custom_reason: 'ממתין לביקורת מנהל', quality_inspections: [{ at: '2026-10-09T08:00:00.000Z', source: 'calendar', ratings: {}, reopened: false }] }, null)).toBe('inspection');
    const cabins = overlayLiveCabins(
      [{ id: 'k680', operational_status: 'READY', staff_occupancy: 'OCCUPIED' }],
      bookings,
      '2026-10-09',
    );
    const cabin = cabins.find((row) => row.id === 'k680');
    expect(cabin.guest.phone).toBe('0541001840');
    expect(cabin.guest.name).toBe('משפחת אור');
    expect(cabin.guest.checkedIn).toBe(true);
    expect(cabin.status).toBe('occupied');
    expect(cabin.task).toBeNull();
    expect(cabins).toHaveLength(28);
  });

  it('marks a calendar hold with its own name instead of occupied', () => {
    const bookings = [
      { id: 'reno', unit_id: 'k671', booking_status: 'CHECKED_IN', check_in_date: '2026-10-01', check_out_date: '2026-10-20', guest_name: 'שיפוצים', guest_phone: '' },
      { id: 'closed', unit_id: 'k673', booking_status: 'CONFIRMED', check_in_date: '2026-10-09', check_out_date: '2026-10-12', guest_name: 'סגור' },
      { id: 'away', unit_id: 'k674', booking_status: 'CONFIRMED', check_in_date: '2026-10-09', check_out_date: '2026-10-11', guest_name: 'לא זמין' },
    ];
    expect(commandStatus({ operational_status: 'READY', staff_occupancy: 'OCCUPIED' }, bookings[0])).toBe('hold');
    const cabins = overlayLiveCabins([], bookings, '2026-10-09');
    const reno = cabins.find((row) => row.id === 'k671');
    const closed = cabins.find((row) => row.id === 'k673');
    const away = cabins.find((row) => row.id === 'k674');
    expect(reno.status).toBe('hold');
    expect(reno.holdLabel).toBe('שיפוצים');
    expect(reno.guest).toBeNull();
    expect(closed.holdLabel).toBe('סגור');
    expect(away.holdLabel).toBe('לא זמין');
    expect(cabins.find((row) => row.id === 'k680').status).toBe('ready');
  });

  it('shows turnover on an occupied room that also has an arrival today', () => {
    const bookings = [
      { id: 'out', unit_id: 'k676', booking_status: 'CHECKED_IN', check_in_date: '2026-10-08', check_out_date: '2026-10-10', guest_name: 'יוצא', guest_phone: '0501111111', special_requests: '|out:11:00' },
      { id: 'in', unit_id: 'k676', booking_status: 'CONFIRMED', check_in_date: '2026-10-10', check_out_date: '2026-10-12', guest_name: 'נכנס', guest_phone: '0502222222', special_requests: '|in:15:00|לול', adults_count: 2 },
    ];
    const cabin = overlayLiveCabins(
      [{ id: 'k676', operational_status: 'READY' }],
      bookings,
      '2026-10-10',
    ).find((row) => row.id === 'k676');
    expect(cabin.status).toBe('ready');
    expect(cabin.task).toBeNull();
    expect(cabin.day.departing.name).toBe('יוצא');
    expect(cabin.day.arriving.name).toBe('נכנס');
    expect(cabin.day.arriving.requests.join(' ')).toContain('לול');
    expect(cabin.day.arriving.party).toBe('2 מבוגרים');
    expect(cabin.day.arriving.requests.join(' ')).not.toContain('מבוגרים');
  });
});