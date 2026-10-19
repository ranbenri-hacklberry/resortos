import { describe, expect, it } from 'vitest';
import { displayPhone, guestLinkConfirm, guestLinkSms, phoneFromReply, stayUrlOf } from './guestLink.js';

describe('guest stay link', () => {
  it('builds the stay url from the checkout token', () => {
    expect(stayUrlOf({ checkout_token: 'tok-1' })).toBe('https://resortos.app/stay/tok-1');
    expect(stayUrlOf({ checkout_token: '' })).toBe('');
  });

  it('reads an Israeli mobile from a reply', () => {
    expect(displayPhone('972503934696')).toBe('0503934696');
    expect(phoneFromReply('המספר 050-393-4696')).toBe('0503934696');
    expect(phoneFromReply('כן')).toBe('');
  });

  it('asks before the SMS and puts the link in the text', () => {
    expect(guestLinkConfirm('נועה', '0523334455')).toContain('0523334455');
    expect(guestLinkConfirm('נועה', '0523334455')).toContain('כן');
    const sms = guestLinkSms('נופים בלבן 1', 'https://resortos.app/stay/tok-1');
    expect(sms).toContain('https://resortos.app/stay/tok-1');
    expect(sms).toContain('נופים בלבן 1');
  });
});
