import { describe, it, expect } from 'vitest';
import { canonicalJid, resolveStaffPhone } from './client.js';

describe('canonicalJid', () => {
  it('Barak old LID/phone mapping is gone (Ran 2026-10-28: new number)', () => {
    expect(canonicalJid('972503934696')).toBe('972503934696@s.whatsapp.net');
    expect(canonicalJid('972515262609')).toBe('972515262609@s.whatsapp.net');
  });

  it('routes Rani and Adam LIDs and phone numbers to their unified @lid JIDs', () => {
    expect(canonicalJid('170626836910125@lid')).toBe('170626836910125@lid');
    expect(canonicalJid('972548317887@s.whatsapp.net')).toBe('170626836910125@lid');
    expect(canonicalJid('054-831-7887')).toBe('170626836910125@lid');
    expect(canonicalJid('249438949924982@lid')).toBe('249438949924982@lid');
  });

  it('normalizes non-LID Israeli 05x numbers to 9725x@s.whatsapp.net', () => {
    expect(canonicalJid('0521234567')).toBe('972521234567@s.whatsapp.net');
    expect(canonicalJid('050-610-2416')).toBe('972506102416@s.whatsapp.net');
  });

  it('resolves staff LIDs back to canonical phone digits via resolveStaffPhone', () => {
    expect(resolveStaffPhone('170626836910125@lid')).toBe('972548317887');
  });

  it('preserves group JIDs', () => {
    expect(canonicalJid('120363023456789@g.us')).toBe('120363023456789@g.us');
  });
});
