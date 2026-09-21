import { describe, expect, it } from 'vitest';
import { jewishHolidayMarker, jewishHolidayShort } from './jewishHolidays.js';

describe('jewishHolidays', () => {
  it('marks Sukkot 2026 for Israel', () => {
    expect(jewishHolidayShort('2026-09-25')).toBe('ערב סוכ׳');
    expect(jewishHolidayShort('2026-09-26')).toBe('חג סוכ׳');
    expect(jewishHolidayShort('2026-09-27')).toBe('חוה״מ');
    expect(jewishHolidayShort('2026-10-01')).toBe('חוה״מ');
    expect(jewishHolidayShort('2026-10-02')).toBe('ערב חג ב׳');
    expect(jewishHolidayMarker('2026-10-03')).toMatchObject({
      id: 'second',
      label: 'חג שני (שמיני עצרת / שמחת תורה)'
    });
    expect(jewishHolidayShort('2026-09-24')).toBe('');
  });
});
