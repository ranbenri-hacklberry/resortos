import { describe, it, expect } from 'vitest';
import { guestSmsUnitName, templateById, farewellSms, checkoutReminderSms } from './guestComms.js';

describe('guestSmsUnitName', () => {
  it('strips internal letter+number codes', () => {
    expect(guestSmsUnitName('Ⓓ26 חצר מוסיקלית · בקתה 2')).toBe('חצר מוסיקלית 2');
    expect(guestSmsUnitName('Ⓖ23 בתי נורית 1')).toBe('בתי נורית 1');
    expect(guestSmsUnitName("Ⓔ25 טאג' מאהל · בקתה 3")).toBe("טאג' מאהל 3");
    expect(guestSmsUnitName('Ⓒ27 טוסקנה · 1')).toBe('טוסקנה 1');
    expect(guestSmsUnitName('D26 חצר מוסיקלית')).toBe('חצר מוסיקלית');
    expect(guestSmsUnitName('כיפת שמים אדום D2')).toBe('כיפת שמים אדום');
    expect(guestSmsUnitName('כיפת שמיים כחול (B1)')).toBe('כיפת שמיים כחול');
  });
  it('keeps real names', () => {
    expect(guestSmsUnitName('כיפת שמיים ירוק')).toBe('כיפת שמיים ירוק');
    expect(guestSmsUnitName('קאסה נובה · Aura')).toBe('קאסה נובה Aura');
    expect(guestSmsUnitName('סוויטה 1 (הירוקה)')).toBe('סוויטה 1 (הירוקה)');
    expect(guestSmsUnitName('')).toBe('');
  });
  it('is applied by guest SMS templates', () => {
    const msg = templateById('checkin').build({ unitName: 'Ⓓ26 חצר מוסיקלית · בקתה 2', checkoutUrl: 'https://x/stay/tok_a' });
    expect(msg).toContain('ל-חצר מוסיקלית 2');
    expect(msg).not.toMatch(/Ⓓ|26/);
    expect(farewellSms({ unitName: 'Ⓖ23 בתי נורית 4' })).toContain('ב-בתי נורית 4');
    expect(checkoutReminderSms({ unitName: 'Ⓐ29 מול הנוף · בקתה 5', token: '' })).toContain('מ-מול הנוף 5');
    expect(templateById('cleaning').build({ unitName: 'Ⓑ28 נופים בלבן · בקתה 1' })).toContain('ל-נופים בלבן 1');
  });
});
