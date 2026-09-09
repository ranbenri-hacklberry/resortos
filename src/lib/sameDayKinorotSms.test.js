import { describe, expect, it } from 'vitest';
import {
  sameDayAlertPhones,
  sameDayBookingSmsText,
  sameDayCreatedBookings
} from './sameDayKinorotSms.js';

describe('same-day Kinorot SMS', () => {
  it('keeps only new arrivals for today and skips שיפוץ / סגור', () => {
    const rows = sameDayCreatedBookings([
      { id: 'kin_671_1', unit_id: 'k671', guest_name: 'דנה', check_in_date: '2026-09-06', check_out_date: '2026-09-08', special_requests: 'kinorot:1' },
      { id: 'kin_672_2', unit_id: 'k672', guest_name: 'מחר', check_in_date: '2026-09-07', check_out_date: '2026-09-08', special_requests: 'kinorot:2' },
      { id: 'kin_687_3', unit_id: 'k687', guest_name: 'סגור', check_in_date: '2026-09-06', check_out_date: '2026-09-10', special_requests: 'kinorot:3' }
    ], '2026-09-06');
    expect(rows.map((row) => row.id)).toEqual(['kin_671_1']);
  });

  it('texts Max and Costa by default', () => {
    expect(sameDayAlertPhones({})).toEqual(['0506102416', '0533932462']);
  });

  it('writes a short Hebrew SMS with the cabin name', () => {
    expect(sameDayBookingSmsText({
      unit_id: 'k687',
      guest_name: 'יוסי לוי',
      check_in_date: '2026-09-06',
      check_out_date: '2026-09-08'
    })).toBe('הזמנה חדשה להיום\nטוסקנה · פירנצה 1\nיוסי לוי\nכניסה 6/9 יציאה 8/9');
  });
});
