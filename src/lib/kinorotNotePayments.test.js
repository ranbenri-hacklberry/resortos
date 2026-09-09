import { describe, expect, it } from 'vitest';
import {
  clearingPaymentsFromKinorotNotes,
  moneyFromKinorotPayment,
  parseKinorotNotePayments
} from './kinorotNotePayments.js';
import { parseResviewPayment } from '../../functions/lib/kinorotZcredit.js';

describe('kinorot note payments', () => {
  it('reads date, method and amount from confirmation notes', () => {
    const text = 'הערות כניסה ב 15 יציאה ב 11 20% מקדמה השאר בהגעה 3.9 שולם באשראי 1800 תנאי הזמנה';
    expect(parseKinorotNotePayments(text, { todayIso: '2026-09-04' })).toEqual([
      { date: '2026-09-03', method: 'card', amount: 1800 }
    ]);
  });

  it('reads Kinorot charge notes as card payments', () => {
    const text = 'הערות כניסה ב 15 יציאה ב 12 20% מקדמה השאר בהגעה 6.9 חויב באשראי 2880 (רתם) 4.9 חויב מקדמה באשראי 720 תנאי הזמנה';
    expect(parseKinorotNotePayments(text, { todayIso: '2026-09-07' })).toEqual([
      { date: '2026-09-06', method: 'card', amount: 2880 },
      { date: '2026-09-04', method: 'card', amount: 720 }
    ]);
  });

  it('reads feminine bank-transfer notes as paid', () => {
    const text = 'הערות כניסה ב 15 יציאה ב 11 20% מקדמה השאר בהגעה 6.9 שילמה בהעברה בנקאית 800 תנאי הזמנה';
    expect(parseKinorotNotePayments(text, { todayIso: '2026-09-07' })).toEqual([
      { date: '2026-09-06', method: 'bank', amount: 800 }
    ]);
    expect(moneyFromKinorotPayment({
      total: 800,
      notePayments: [{ date: '2026-09-06', method: 'bank', amount: 800 }]
    })).toMatchObject({
      payment_status: 'PAID',
      payment_mode: 'BANK_TRANSFER'
    });
  });

  it('keeps cash and transfer lines', () => {
    const text = '12.8 שולם במזומן 400 1.9 שולם בהעברה 700';
    expect(parseKinorotNotePayments(text, { todayIso: '2026-09-04' })).toEqual([
      { date: '2026-08-12', method: 'cash', amount: 400 },
      { date: '2026-09-01', method: 'bank', amount: 700 }
    ]);
  });

  it('records cash notes as received for the calendar', () => {
    const [row] = clearingPaymentsFromKinorotNotes(
      [{ date: '2026-09-04', method: 'cash', amount: 1500 }],
      { resid: '73094' }
    );
    expect(row.amount_agorot).toBe(150000);
    const html = `
      <div>סה״כ ₪1,500.00 מקדמה ₪1,500.00 יתרת תשלום ₪0.00</div>
      <div>הערות 4.9 שולם במזומן 1500 תנאי הזמנה</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.paid).toBe(1500);
    expect(parsed.due).toBe(0);
  });

  it('builds a stable Kinorot clearing row', () => {
    const [row] = clearingPaymentsFromKinorotNotes(
      [{ date: '2026-09-03', method: 'card', amount: 1800 }],
      { resid: '70541', last4: '0146' }
    );
    expect(row.source).toBe('KINOROT');
    expect(row.amount_agorot).toBe(180000);
    expect(row.last4).toBe('0146');
    expect(row.txn).toContain('70541');
  });

  it('marks an ambassador voucher note as paid', () => {
    const html = `
      <div>סה״כ ₪600.00 מקדמה ₪0.00</div>
      <div>הערות שובר שגרירים בלב תנאי הזמנה</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.voucherRedeemed).toBe(true);
    expect(moneyFromKinorotPayment(parsed).payment_mode).toBe('VOUCHER');
  });

  it('marks a Kinorot quantity-line voucher as paid', () => {
    const html = `
      <div>מחיר יחידה כמות שובר בקתה 3</div>
      <div>סה״כ ₪0.00 מקדמה ₪0.00 יתרת תשלום</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.voucherRedeemed).toBe(true);
    expect(moneyFromKinorotPayment(parsed).payment_mode).toBe('VOUCHER');
  });

  it('marks a redeemed Kinorot voucher as paid', () => {
    const html = `
      <div>שובר נפדה ✔ בקתה רומנטית 1</div>
      <div>סה״כ ₪0.00 מקדמה ₪0.00 יתרת תשלום</div>
      <div>הערות כניסה ב15:00 יציאה ב11:00</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.voucherRedeemed).toBe(true);
    expect(moneyFromKinorotPayment(parsed)).toMatchObject({
      payment_status: 'PAID',
      payment_mode: 'VOUCHER'
    });
  });

  it('marks complimentary Kinorot notes as paid without a charge', () => {
    const html = `
      <div>סה״כ ₪0.00 מקדמה ₪0.00</div>
      <div>הערות רפא נא - ללא תשלום (שיתוף פעולה עם לנה)</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.complimentary).toBe(true);
    expect(moneyFromKinorotPayment(parsed)).toMatchObject({
      payment_status: 'PAID',
      payment_mode: 'COMP'
    });
  });

  it('parses a resview page with notes + zero balance', () => {
    const html = `
      <div>סה״כ ₪1,800.00 מקדמה ₪1,800.00 יתרת תשלום ₪0.00</div>
      <div>פרטי אשראי **** 0146</div>
      <div>הערות</div>
      <div>כניסה ב 15 יציאה ב 11 20% מקדמה השאר בהגעה 3.9 שולם באשראי 1800</div>
      <div>תנאי הזמנה</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.total).toBe(1800);
    expect(parsed.paid).toBe(1800);
    expect(parsed.due).toBe(0);
    expect(parsed.notePayments).toEqual([
      { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), method: 'card', amount: 1800 }
    ]);
  });
});
