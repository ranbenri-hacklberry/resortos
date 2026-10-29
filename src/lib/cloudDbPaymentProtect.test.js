import { describe, expect, it } from 'vitest';
import { mergeBookingRow } from './cloudDb.js';

describe('mergeBookingRow payment protection against Kinorot sync', () => {
  it('never overwrites PAID with incoming UNPAID even if incoming is newer', () => {
    const local = {
      id: 'kin_123',
      guest_name: 'ישראל ישראלי',
      payment_status: 'PAID',
      payment_mode: 'CASH',
      total_price_agorot: 100000,
      updated_at: '2026-10-25T10:00:00.000Z'
    };
    const incomingKinorot = {
      id: 'kin_123',
      guest_name: 'ישראל ישראלי',
      payment_status: 'UNPAID',
      payment_mode: null,
      total_price_agorot: 100000,
      updated_at: '2026-10-25T12:00:00.000Z'
    };
    const merged = mergeBookingRow(local, incomingKinorot);
    expect(merged.payment_status).toBe('PAID');
    expect(merged.payment_mode).toBe('CASH');
  });

  it('never overwrites PARTIAL (e.g. after upsell) with incoming UNPAID', () => {
    const local = {
      id: 'kin_456',
      guest_name: 'שרה כהן',
      payment_status: 'PARTIAL',
      payment_mode: 'CARD',
      total_price_agorot: 120000,
      upsell_description: 'ארוחת בוקר וקישוט בלונים',
      upsell_price: 200,
      updated_at: '2026-10-25T10:00:00.000Z'
    };
    const incomingKinorot = {
      id: 'kin_456',
      guest_name: 'שרה כהן',
      payment_status: 'UNPAID',
      payment_mode: null,
      total_price_agorot: 100000,
      updated_at: '2026-10-25T12:00:00.000Z'
    };
    const merged = mergeBookingRow(local, incomingKinorot);
    expect(merged.payment_status).toBe('PARTIAL');
    expect(merged.payment_mode).toBe('CARD');
    expect(merged.total_price_agorot).toBe(120000);
    expect(merged.upsell_description).toBe('ארוחת בוקר וקישוט בלונים');
    expect(merged.upsell_price).toBe(200);
  });

  it('preserves birthday details and upsells across sync merges', () => {
    const local = {
      id: 'kin_789',
      is_birthday: true,
      birthday_note: 'עוגת שוקולד ויין ליום הולדת 40',
      upsell_description: 'צק אאוט מאוחר',
      upsell_price: 150
    };
    const incomingKinorot = {
      id: 'kin_789',
      guest_phone: '0501234567'
    };
    const merged = mergeBookingRow(local, incomingKinorot);
    expect(merged.is_birthday).toBe(true);
    expect(merged.birthday_note).toBe('עוגת שוקולד ויין ליום הולדת 40');
    expect(merged.upsell_description).toBe('צק אאוט מאוחר');
    expect(merged.upsell_price).toBe(150);
    expect(merged.guest_phone).toBe('0501234567');
  });

  it('merges clearing payments and preserves local desk payments', () => {
    const local = {
      id: 'kin_999',
      clearing_payments: [
        { source: 'CASH', amount_agorot: 50000, ref: 'cash_1' }
      ]
    };
    const incomingKinorot = {
      id: 'kin_999',
      clearing_payments: [
        { source: 'KINOROT', amount_agorot: 50000, ref: 'kin_ref' }
      ]
    };
    const merged = mergeBookingRow(local, incomingKinorot);
    expect(merged.clearing_payments).toHaveLength(2);
    expect(merged.clearing_payments.some((p) => p.source === 'CASH')).toBe(true);
    expect(merged.clearing_payments.some((p) => p.source === 'KINOROT')).toBe(true);
  });
});
