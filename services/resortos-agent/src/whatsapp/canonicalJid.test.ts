import { describe, it, expect } from 'vitest';
import { canonicalJid, resolveStaffPhone } from './client.js';

describe('canonicalJid', () => {
  it('routes Barak LID and phone numbers to his unified @lid JID', () => {
    expect(canonicalJid('208190587302068')).toBe('208190587302068@lid');
    expect(canonicalJid('208190587302068@lid')).toBe('208190587302068@lid');
    expect(canonicalJid('208190587302068:0@lid')).toBe('208190587302068@lid');
    expect(canonicalJid('972503934696@s.whatsapp.net')).toBe('208190587302068@lid');
    expect(canonicalJid('0503934696')).toBe('208190587302068@lid');
  });

  it('routes Rani and Adam LIDs and phone numbers to their unified @lid JIDs', () => {
    expect(canonicalJid('170626836910125@lid')).toBe('170626836910125@lid');
    expect(canonicalJid('972548317887@s.whatsapp.net')).toBe('170626836910125@lid');
    expect(canonicalJid('054-831-7887')).toBe('170626836910125@lid');
    expect(canonicalJid('249438949924982@lid')).toBe('249438949924982@lid');
  });

  it('normalizes non-LID Israeli 05x numbers to 9725x@s.whatsapp.net', () => {
    expect(canonicalJid('0529690024')).toBe('972529690024@s.whatsapp.net');
    expect(canonicalJid('050-610-2416')).toBe('972506102416@s.whatsapp.net');
  });

  it('resolves staff LIDs back to canonical phone digits via resolveStaffPhone', () => {
    expect(resolveStaffPhone('170626836910125@lid')).toBe('972548317887');
    expect(resolveStaffPhone('208190587302068@lid')).toBe('972503934696');
  });

  it('preserves group JIDs', () => {
    expect(canonicalJid('120363023456789@g.us')).toBe('120363023456789@g.us');
  });
});
