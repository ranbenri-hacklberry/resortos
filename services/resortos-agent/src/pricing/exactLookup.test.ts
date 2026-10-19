import { describe, expect, it } from 'vitest';
import { lookupExact, normalizeExactText } from './exactLookup.js';

describe('exact phrase lookup', () => {
  it('matches a known question after trimming spaces and a trailing question mark', () => {
    expect(normalizeExactText('  מה ממתין לבדיקה?  ')).toBe('מה ממתין לבדיקה');
    expect(lookupExact('מה ממתין לבדיקה?')).toBe('inspection');
    expect(lookupExact('קוד השער')).toBe('gate');
    expect(lookupExact('סטטוס יומי')).toBe('daily');
  });

  it('does not match when any extra word is present', () => {
    expect(lookupExact('מה ממתין לבדיקה היום')).toBeNull();
    expect(lookupExact('מה קוד השער בבקשה')).toBeNull();
    expect(lookupExact('סטטוס יומי בבקשה')).toBeNull();
    expect(lookupExact('')).toBeNull();
  });
});
