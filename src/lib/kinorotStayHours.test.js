import { describe, expect, it } from 'vitest';
import {
  MOTZASH,
  appendStayHoursToken,
  formatStayHourLabel,
  notesFromResviewHtml,
  parseStayHoursFromNotes,
  stayHoursFromBooking
} from './kinorotStayHours.js';

describe('kinorot stay hours', () => {
  it('reads clock and motzash from free-text notes', () => {
    expect(parseStayHoursFromNotes('כניסה 15:00 יציאה 12:00')).toEqual({ checkout: '12:00', checkin: '15:00' });
    expect(parseStayHoursFromNotes('הגעה:15:00 יציאה :13:00')).toEqual({ checkout: '13:00', checkin: '15:00' });
    expect(parseStayHoursFromNotes('כניסה ב15 יציאה ב13')).toEqual({ checkout: '13:00', checkin: '15:00' });
    expect(parseStayHoursFromNotes('הגעה בשעה 15:00 יציאה בשעה 17:00')).toEqual({ checkout: '17:00', checkin: '15:00' });
    expect(parseStayHoursFromNotes('כניסה ב15 יציאה במוצ"ש פלטה')).toEqual({ checkout: MOTZASH, checkin: '15:00' });
    expect(parseStayHoursFromNotes('כניסה 15 יציאה מוצאש')).toEqual({ checkout: MOTZASH, checkin: '15:00' });
  });

  it('pulls the notes block out of a resview page', () => {
    const html = '<div>הערות</div><div>כניסה ב15 יציאה ב13</div><div>שולם במזומן 1200</div>';
    expect(parseStayHoursFromNotes(notesFromResviewHtml(html))).toEqual({ checkout: '13:00', checkin: '15:00' });
  });

  it('stores and reads hours on special_requests', () => {
    const extra = appendStayHoursToken('kinorot:12|pax:2+0+0', { checkout: '13:00', checkin: '15:00' });
    expect(extra).toBe('kinorot:12|pax:2+0+0|out:13:00|in:15:00');
    expect(stayHoursFromBooking({ special_requests: extra })).toEqual({ checkout: '13:00', checkin: '15:00' });
    expect(formatStayHourLabel(MOTZASH)).toBe('מוצ״ש');
  });
});
