import assert from 'node:assert/strict';
import test, { describe, it, beforeEach, afterEach } from 'node:test';
import {
  invoiceMailboxConfigured,
  createMockImapClient
} from './cardcomInvoiceFetch.js';
import {
  parseCardcomInvoiceEmail
} from '../functions/lib/cardcomInvoiceMailbox.js';

describe('invoiceMailboxConfigured', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CARDCOM_INVOICE_MAILBOX_USER;
    delete process.env.CARDCOM_INVOICE_MAILBOX_PASSWORD;
    delete process.env.GMAIL_INVOICE_USER;
    delete process.env.GMAIL_INVOICE_APP_PASSWORD;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it('returns false when no credentials are set', () => {
    assert.strictEqual(invoiceMailboxConfigured(), false);
  });

  it('returns true when CARDCOM credentials are set', () => {
    process.env.CARDCOM_INVOICE_MAILBOX_USER = 'test@example.com';
    process.env.CARDCOM_INVOICE_MAILBOX_PASSWORD = 'testpass';
    assert.strictEqual(invoiceMailboxConfigured(), true);
  });

  it('returns true when GMAIL credentials are set', () => {
    process.env.GMAIL_INVOICE_USER = 'test@example.com';
    process.env.GMAIL_INVOICE_APP_PASSWORD = 'testpass';
    assert.strictEqual(invoiceMailboxConfigured(), true);
  });

  it('returns false when only user is set', () => {
    process.env.CARDCOM_INVOICE_MAILBOX_USER = 'test@example.com';
    assert.strictEqual(invoiceMailboxConfigured(), false);
  });

  it('returns false when only password is set', () => {
    process.env.CARDCOM_INVOICE_MAILBOX_PASSWORD = 'testpass';
    assert.strictEqual(invoiceMailboxConfigured(), false);
  });
});

describe('createMockImapClient', () => {
  it('returns mock emails from fetchCardcomInvoiceEmails', async () => {
    const mockEmails = [
      {
        from: 'noreply@cardcom.co.il',
        subject: 'חשבונית מס קבלה',
        body: 'מספר מסמך: 6\nמספר עסקה: 269149464\nסכום: 650.00 ₪',
        date: '2026-11-05'
      }
    ];
    
    const client = createMockImapClient(mockEmails);
    const result = await client.fetchCardcomInvoiceEmails();
    
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.emails[0].from, 'noreply@cardcom.co.il');
    assert.strictEqual(result.searched, 7);
  });

  it('returns connected status from checkMailboxStatus', async () => {
    const mockEmails = [{ from: 'test@cardcom.co.il', subject: 'Test', body: 'Test' }];
    const client = createMockImapClient(mockEmails);
    const status = await client.checkMailboxStatus();
    
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.exists, 1);
  });
});

describe('IMAP email parsing', () => {
  it('parses Hebrew Cardcom invoice email', () => {
    const body = `
חשבונית מס קבלה
מספר מסמך: 6
מספר עסקה: 269149464
סכום: 650.00 ₪
לצפייה: https://secure.cardcom.solutions/doc/123
    `;
    
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.documentNumber, '6');
    assert.strictEqual(result.dealNumber, '269149464');
    assert.strictEqual(result.amount, 650);
    assert.strictEqual(result.documentUrl, 'https://secure.cardcom.solutions/doc/123');
  });

  it('parses English Cardcom invoice email', () => {
    const body = `
Tax Invoice and Receipt
Document Number: 42
Deal Number: 987654321
Amount: 1,500.00 ILS
View at: https://secure.cardcom.solutions/doc/abc
    `;
    
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.documentNumber, '42');
    assert.strictEqual(result.dealNumber, '987654321');
    assert.strictEqual(result.amount, 1500);
  });
});
