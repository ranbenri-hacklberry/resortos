import { describe, it, expect } from 'vitest';
import { answerGuestQuestion, isKeyReturnQuestion, checkoutGuide } from './guestKnowledge.js';
import { T } from './i18n.js';

// Ran 2026-10-31: key goes back to the key box, close it, turn one wheel. Never send the lockbox code here.
const ctx = () => ({
  booking: { id: 'kin_test1', guest_name: 'בדיקה', check_out_date: '2026-10-31' } as any,
  unitId: 'k688', roomName: 'טוסקנה · 2', stayUrl: 'https://resortos.app/stay/tok_test',
  room: { lockbox: '9731', usage: 'GUEST' } as any,
});
const noCode = (r: string) => expect(r).not.toMatch(/9731/);
const instr = (r: string) => { expect(r).toContain('מחזירים את המפתח לתיבת המפתחות'); expect(r).toContain('גלגל אחד למספר אחר'); };

describe('key return at checkout (Ran 2026-10-31)', () => {
  it("real case 'צ׳ק-אאוט\\nהאם להשאיר את המפתח בדלת?'", () => {
    const r = answerGuestQuestion('צ׳ק-אאוט\nהאם להשאיר את המפתח בדלת?', ctx())!;
    instr(r); noCode(r); expect(r).toContain('אין להשאיר את המפתח בדלת');
  });
  for (const q of ['מה עושים עם המפתח כשעוזבים?', 'איפה להשאיר מפתח?', 'משאירים את המפתח בבקתה?']) {
    it(q, () => { const r = answerGuestQuestion(q, ctx())!; instr(r); noCode(r); });
  }
  it('English / Russian variants', () => {
    const en = answerGuestQuestion('Where should we leave the key when we check out?', ctx())!;
    expect(en).toContain('turn one wheel'); noCode(en);
    const ru = answerGuestQuestion('Куда оставить ключ при выезде?', ctx())!;
    expect(ru).toContain('одно колёсико'); noCode(ru);
  });
  it('plain lockbox code request is unaffected', () => {
    expect(isKeyReturnQuestion('מה הקוד של הכספת?')).toBe(false);
    expect(isKeyReturnQuestion('איפה המפתח?')).toBe(false);
  });
  it('checkout FAQ carries the key-return line', () => {
    expect(checkoutGuide('13:00')).toContain('גלגל אחד למספר אחר');
    expect(T.checkout('en', undefined, '11:00')).toContain('turn one wheel');
  });
});
