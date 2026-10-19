import { describe, expect, it } from 'vitest';
import { guestStaySmsText, parseMicropayResponse, toMicropayPhone } from './micropaySms.js';

describe('micropay SMS helpers', () => {
  it('normalizes Israeli numbers for the list param', () => {
    expect(toMicropayPhone('054-807-6123')).toBe('0548076123');
    expect(toMicropayPhone('+972548076123')).toBe('0548076123');
    expect(toMicropayPhone('972548076123')).toBe('0548076123');
    expect(toMicropayPhone('')).toBe('');
  });

  it('parses a plain credit number', () => {
    expect(parseMicropayResponse('1840')).toEqual({ ok: true, message: 'OK', credit: '1840' });
  });

  it('parses OK text and JSON', () => {
    expect(parseMicropayResponse('OK 34556')).toEqual({ ok: true, message: 'OK', taskId: '34556' });
    expect(parseMicropayResponse({
      status: 1,
      action: 'sendsms',
      message: 'OK',
      data: { taskId: '34556' }
    }).ok).toBe(true);
  });

  it('treats parameter errors as failure', () => {
    const parsed = parseMicropayResponse('ERROR --> Description: token parameter, invalid or missing');
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe('ERROR');
  });

  it('builds a short Hebrew stay link', () => {
    const text = guestStaySmsText({
      unitName: 'מול הנוף · בקתה 1',
      checkInDate: '2026-09-03',
      checkoutUrl: 'https://resortos.app/s/abc'
    });
    expect(text).toContain('03/09/2026');
    expect(text).toContain('https://resortos.app/s/abc');
  });

  it('detects guest stay link messages for BCC to 0506102416', async () => {
    const { GUEST_LINK_BCC_PHONE, isGuestStayLinkMessage } = await import('../../server/micropaySms.js');
    expect(GUEST_LINK_BCC_PHONE).toBe('0506102416');
    expect(isGuestStayLinkMessage('שלום! הקישור לדף האורח ב-רמות 1:\nhttps://resortos.app/stay/tok123')).toBe(true);
    expect(isGuestStayLinkMessage('שלום! קוד השער לכניסה לרכב: 1234.')).toBe(false);
  });
});
