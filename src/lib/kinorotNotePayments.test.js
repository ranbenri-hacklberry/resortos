import { describe, expect, it } from 'vitest';
import {
  preserveKinorotCollector,
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
    expect(row.method).toBe('card');
    expect(row.accountKey).toBe('MAX');
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

  it('keeps the cabin price when the payment line is only the deposit', () => {
    const html = `
      <div>סה״כ ₪260.00 מקדמה ₪1,040.00 יתרת תשלום</div>
      <div>מחיר יחידה כמות ₪1,300.00 בקתה 1</div>
      <div>הערות 19/10בוצע חיוב מקדמה באשראי 260 שח</div>
    `;
    const parsed = parseResviewPayment(html);
    expect(parsed.total).toBe(1300);
    expect(parsed.paid).toBe(260);
    expect(moneyFromKinorotPayment(parsed, '75344')).toMatchObject({
      total_price_agorot: 130000,
      deposit_agorot: 26000,
      payment_status: 'DEPOSIT_PAID'
    });
  });

  it('keeps a card deposit and a cash balance as separate clearing rows', () => {
    const text = '6.10 חויב מקדמה באשראי 320 שולם במזומן 1280 לצוקי';
    const rows = clearingPaymentsFromKinorotNotes(
      parseKinorotNotePayments(text, { todayIso: '2026-10-12' }),
      { resid: '74513', last4: '3310' }
    );
    expect(rows.map((row) => [row.method, row.accountKey, row.amount_agorot, row.last4])).toEqual([
      ['card', 'MAX', 32000, '3310'],
      ['cash', 'CASH', 128000, '']
    ]);
  });

  it('parses Lian\'s exact note: 560 cash + 140 Bit as PAID with balance 0', () => {
    const note = 'כניסה ב  15\nיציאה ב 11\n8.11 מזומן 560 אדם\n09.11 שולם בביט 140';
    const events = parseKinorotNotePayments(note, { todayIso: '2026-11-09' });
    expect(events).toEqual([
      { date: '2026-11-08', method: 'cash', amount: 560 },
      { date: '2026-11-09', method: 'app', amount: 140 }
    ]);
    const money = moneyFromKinorotPayment({ total: 700, notePayments: events }, '74692');
    expect(money.payment_status).toBe('PAID');
    expect(money.total_price_agorot).toBe(70000);
    expect(money.clearing_payments.map((row) => [row.method, row.amount_agorot])).toEqual([
      ['cash', 56000],
      ['app', 14000]
    ]);
    const paid = money.clearing_payments.reduce((sum, row) => sum + row.amount_agorot, 0);
    expect(paid).toBe(70000);
  });

  it('parses Bit/PayBox/bank transfer variants including spaced "ב bit"', () => {
    expect(parseKinorotNotePayments('09.11 שולם בביט 140', { todayIso: '2026-11-09' })).toEqual([
      { date: '2026-11-09', method: 'app', amount: 140 }
    ]);
    expect(parseKinorotNotePayments('09.11 שולם בפייבוקס 140', { todayIso: '2026-11-09' })[0].method).toBe('app');
    expect(parseKinorotNotePayments('09.11 שולם בהעברה 140', { todayIso: '2026-11-09' })[0].method).toBe('bank');
    const spaced = parseKinorotNotePayments('09.11 שולם ב bit 140', { todayIso: '2026-11-09' });
    expect(spaced.some((row) => row.method === 'app' && row.amount === 140)).toBe(true);
  });

  it('preserves a corrected collector when the same Kinorot txn is rebuilt', () => {
    const events = parseKinorotNotePayments('8.11 שולם במזומן 560', { todayIso: '2026-11-09' });
    const built = clearingPaymentsFromKinorotNotes(events, {
      resid: '74692',
      existingPayments: [{
        txn: 'kinorot_note_74692_2026-11-08_56000_cash',
        collector: 'ברק',
        source: 'KINOROT',
        amount_agorot: 56000
      }]
    });
    expect(built[0].collector).toBe('ברק');
    expect(preserveKinorotCollector(
      [{ txn: 'kinorot_note_74692_2026-11-08_56000_cash', collector: 'ברק' }],
      [{ txn: 'kinorot_note_74692_2026-11-08_56000_cash', collector: 'כינורות' }]
    )[0].collector).toBe('ברק');
  });

});
