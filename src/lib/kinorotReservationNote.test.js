import { describe, expect, it } from 'vitest';
import {
  appendCashPaidNote,
  cashPaidNoteLine,
  kinorotReservationId,
  reservationFormFields,
  withReservationNote
} from './kinorotReservationNote';

const form = `
<form id="reservation-form" action="reservationnew-page-3-080726.php">
  <input type="hidden" name="res" value="74003">
  <input name="guestname" value="אורח">
  <input name="checkin" value="2026-10-14">
  <input name="checkout" value="2026-10-15">
  <input name="price[]" value="0">
  <select name="unit[]"><option value="685" selected>יחידה</option></select>
  <select name="adult[]"><option value="2">2</option><option value="0">0</option></select>
  <textarea name="note">הערה קיימת</textarea>
  <input type="checkbox" name="skip" value="1">
  <input type="checkbox" name="keep" value="1" checked>
  <input type="file" name="order_img_file[]">
</form>`;

describe('kinorot reservation note', () => {
  it('reads the saved reservation fields and the current note', () => {
    const fields = reservationFormFields(form);
    expect(Object.fromEntries(fields)).toMatchObject({
      res: '74003',
      guestname: 'אורח',
      checkin: '2026-10-14',
      'unit[]': '685',
      'adult[]': '2',
      note: 'הערה קיימת',
      keep: '1'
    });
    expect(fields.some(([name]) => name === 'skip' || name === 'order_img_file[]')).toBe(false);
  });

  it('replaces only the note', () => {
    const next = withReservationNote(reservationFormFields(form), 'הערה חדשה');
    expect(next.find(([name]) => name === 'note')[1]).toBe('הערה חדשה');
    expect(next.find(([name]) => name === 'guestname')[1]).toBe('אורח');
  });

  it('adds who received the cash, with the date and time, once', () => {
    const at = new Date('2026-10-14T17:01:00Z');
    expect(cashPaidNoteLine(15000, { by: 'רני', at })).toBe('שולם מזומן 150 ש״ח · קיבל רני · 14/10/2026 20:01');
    const once = appendCashPaidNote('הערה קיימת', 15000, { by: 'רני', at });
    expect(once).toBe('הערה קיימת\nשולם מזומן 150 ש״ח · קיבל רני · 14/10/2026 20:01');
    expect(appendCashPaidNote(once, 15000, { by: 'רני', at })).toBe(once);
  });

  it('reads the Kinorot reservation id from the booking', () => {
    expect(kinorotReservationId({ id: 'kin_685_74003' })).toBe('74003');
  });
});
