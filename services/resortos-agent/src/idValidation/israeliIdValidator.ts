/**
 * Israeli ID Validation (Modulo 10 / Luhn Algorithm)
 *
 * An official Israeli ID number consists of up to 9 digits.
 * If shorter than 9 digits, it must be zero-padded on the left to 9 digits.
 *
 * Algorithm:
 * 1. Multiply each digit alternately by 1 and 2:
 *    Weights: [1, 2, 1, 2, 1, 2, 1, 2, 1]
 * 2. If the product of digit * weight > 9, sum its digits (equivalent to product - 9).
 * 3. Sum all resulting values.
 * 4. The number is valid if and only if the total sum is divisible by 10 (sum % 10 === 0).
 */

import type { IsraeliIdValidationResult } from './types.js';

export function validateIsraeliId(id: string | number | null | undefined): IsraeliIdValidationResult {
  if (id === null || id === undefined) {
    return { isValid: false, paddedId: '', error: 'ID is required' };
  }

  const raw = String(id).trim();
  const digitsOnly = raw.replace(/\D/g, '');

  if (!digitsOnly) {
    return { isValid: false, paddedId: '', error: 'No numeric digits found' };
  }

  if (digitsOnly.length > 9) {
    return { isValid: false, paddedId: digitsOnly, error: 'ID exceeds maximum length of 9 digits' };
  }

  if (/^0+$/.test(digitsOnly)) {
    return { isValid: false, paddedId: '000000000', error: 'ID cannot be all zeros' };
  }

  const paddedId = digitsOnly.padStart(9, '0');

  let totalSum = 0;
  let first8Sum = 0;

  for (let i = 0; i < 9; i++) {
    const digit = Number(paddedId[i]);
    const weight = (i % 2 === 0) ? 1 : 2;
    let product = digit * weight;

    if (product > 9) {
      product -= 9; // Equivalent to Math.floor(product / 10) + (product % 10)
    }

    totalSum += product;
    if (i < 8) {
      first8Sum += product;
    }
  }

  const checkDigit = Number(paddedId[8]);
  // The 9th digit has weight 1, so calculated check digit is (10 - (first8Sum % 10)) % 10
  const calculatedCheckDigit = (10 - (first8Sum % 10)) % 10;
  const isValid = totalSum % 10 === 0;

  return {
    isValid,
    paddedId,
    checkDigit,
    calculatedCheckDigit,
    error: isValid ? undefined : `Invalid check digit: expected ${calculatedCheckDigit}, received ${checkDigit}`,
  };
}
