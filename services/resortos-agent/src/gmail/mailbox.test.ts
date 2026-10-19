import { describe, expect, it } from 'vitest';
import { imapQuote, normalizeAppPassword, unseenCount } from './mailbox.js';

describe('gmail mailbox', () => {
  it('strips the spaces Google shows in an app password', () => {
    expect(normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
  });

  it('quotes the mailbox address for IMAP', () => {
    expect(imapQuote('mialisran@gmail.com')).toBe('"mialisran@gmail.com"');
  });

  it('reads the unseen count from a STATUS reply', () => {
    const raw = '* STATUS INBOX (UNSEEN 4)\r\nA2 OK STATUS completed\r\n';
    expect(unseenCount(raw)).toBe(4);
  });
});