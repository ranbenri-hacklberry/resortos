import { describe, it, expect } from 'vitest';
import { validateIsraeliId } from './israeliIdValidator.js';

describe('Israeli ID Validator (Luhn / Modulo 10)', () => {
  it('validates authentic 9-digit Israeli IDs', () => {
    // 012345674: 0*1+1*2+2*1+3*2+4*1+5*2(1)+6*1+7*2(5)+4*1 = 30 -> 30 % 10 === 0
    const res1 = validateIsraeliId('012345674');
    expect(res1.isValid).toBe(true);
    expect(res1.paddedId).toBe('012345674');
    expect(res1.checkDigit).toBe(4);
    expect(res1.calculatedCheckDigit).toBe(4);
    expect(res1.error).toBeUndefined();

    // 123456782: 1*1+2*2+3*1+4*2+5*1+6*2(3)+7*1+8*2(7)+2*1 = 40 -> 40 % 10 === 0
    const res2 = validateIsraeliId('123456782');
    expect(res2.isValid).toBe(true);
    expect(res2.paddedId).toBe('123456782');
    expect(res2.checkDigit).toBe(2);
    expect(res2.calculatedCheckDigit).toBe(2);
  });

  it('validates authentic short IDs by zero-padding to 9 digits', () => {
    // 12345674 is 8 digits, padded to 012345674
    const res = validateIsraeliId('12345674');
    expect(res.isValid).toBe(true);
    expect(res.paddedId).toBe('012345674');
    expect(res.checkDigit).toBe(4);
  });

  it('handles formatted ID strings with hyphens and spaces', () => {
    const res = validateIsraeliId('012-34567-4');
    expect(res.isValid).toBe(true);
    expect(res.paddedId).toBe('012345674');

    const res2 = validateIsraeliId(' 1234 5678 2 ');
    expect(res2.isValid).toBe(true);
    expect(res2.paddedId).toBe('123456782');
  });

  it('detects invalid check digits', () => {
    // 012345675 instead of 012345674
    const res = validateIsraeliId('012345675');
    expect(res.isValid).toBe(false);
    expect(res.checkDigit).toBe(5);
    expect(res.calculatedCheckDigit).toBe(4);
    expect(res.error).toContain('Invalid check digit: expected 4, received 5');
  });

  it('rejects all zeros', () => {
    const res = validateIsraeliId('000000000');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('ID cannot be all zeros');

    const res2 = validateIsraeliId('0');
    expect(res2.isValid).toBe(false);
    expect(res2.error).toBe('ID cannot be all zeros');
  });

  it('rejects IDs longer than 9 digits', () => {
    const res = validateIsraeliId('1234567890');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('exceeds maximum length of 9 digits');
  });

  it('rejects empty or non-numeric inputs', () => {
    expect(validateIsraeliId('').isValid).toBe(false);
    expect(validateIsraeliId('   ').isValid).toBe(false);
    expect(validateIsraeliId('abcdef').isValid).toBe(false);
    expect(validateIsraeliId(null).isValid).toBe(false);
    expect(validateIsraeliId(undefined).isValid).toBe(false);
  });
});
