import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lidSenderPn, matchesCleaner } from './pipeline.js';

describe('pipeline wiring regressions (Ran 2026-10-21)', () => {
  it('invoice text commands get otherPending from pending check / room session (the "1" on a room card fix)', () => {
    const src = readFileSync(path.join(__dirname, 'pipeline.ts'), 'utf8');
    expect(src).toMatch(/invoiceIntake\.handleText\(invPhone[\s\S]{0,120}otherPending: Boolean\(getPendingCheck\(senderPhone\)\) \|\| sessionStates\.has\(sessionKey\)/);
  });
});

describe('קוסטה (maintenance) is recognised as staff with ops access', () => {
  const cleaners = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'cleaners.json'), 'utf8'));
  const costa = cleaners.find((c: any) => c.phone === '972533932462');
  const tzuki = cleaners.find((c: any) => c.phone === '972529690024');
  it('is in cleaners.json at the same role as צוקי', () => {
    expect(costa).toBeTruthy();
    expect(costa.name).toBe('קוסטה');
    expect(costa.role).toBe(tzuki.role);
  });
  it('matches by phone, local 05x, and by the phone WhatsApp attaches to an @lid sender', () => {
    expect(matchesCleaner(costa, '972533932462@s.whatsapp.net')).toBe(true);
    expect(matchesCleaner(costa, '0533932462')).toBe(true);
    const pn = lidSenderPn({ key: { remoteJid: '274762009972934@lid', senderPn: '972533932462@s.whatsapp.net' } });
    expect(pn).toBe('972533932462');
    expect(matchesCleaner(costa, pn)).toBe(true);
    expect(lidSenderPn({ key: { remoteJid: '972533932462@s.whatsapp.net' } })).toBe('');
    expect(lidSenderPn({ key: { remoteJid: '274762009972934@lid' } })).toBe('');
  });
});
