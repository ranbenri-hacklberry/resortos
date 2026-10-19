import { describe, expect, it } from 'vitest';
import { paymentStatusChoice, proposeCashCollection } from './cashCollection.js';

describe('cash collection phrase', () => {
  it('reads the amount from the collection words', () => {
    expect(proposeCashCollection('גביתי 1000 מזומן')?.shekels).toBe(1000);
    expect(proposeCashCollection('התקבל 1,500')?.shekels).toBe(1500);
    expect(proposeCashCollection('נגבה 2000')?.shekels).toBe(2000);
    expect(proposeCashCollection('גביה 750')?.shekels).toBe(750);
  });

  it('ignores a question and a status update', () => {
    expect(proposeCashCollection('כמה מזומן התקבל?')).toBeNull();
    expect(proposeCashCollection('נורית 3 מוכן')).toBeNull();
    expect(proposeCashCollection('גביתי')).toBeNull();
  });

  it('reads the payment status choice after the collection', () => {
    expect(paymentStatusChoice('1')).toBe('PARTIAL');
    expect(paymentStatusChoice('שולם חלקית')).toBe('PARTIAL');
    expect(paymentStatusChoice('2')).toBe('PAID');
    expect(paymentStatusChoice('שולם')).toBe('PAID');
    expect(paymentStatusChoice('לא')).toBe('keep');
    expect(paymentStatusChoice('כן')).toBeNull();
  });
});
