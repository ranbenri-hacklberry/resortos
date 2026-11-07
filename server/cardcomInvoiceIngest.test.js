import assert from 'node:assert/strict';
import test, { describe, it, beforeEach, afterEach } from 'node:test';
import { createMockImapClient } from './cardcomInvoiceFetch.js';
import {
  matchPaymentToInvoice,
  findPaymentsMissingInvoice,
  shouldCheckMailbox,
  attachInvoiceToPayment,
  parseCardcomInvoiceEmail,
  isCardcomSender
} from '../functions/lib/cardcomInvoiceMailbox.js';

const mockEmails = [
  {
    from: 'noreply@cardcom.co.il',
    subject: 'חשבונית מס קבלה',
    body: 'מספר מסמך: 6\nמספר עסקה: 269149464\nסכום: 650.00 ₪\nhttps://secure.cardcom.solutions/doc/6',
    date: '2026-11-05'
  },
  {
    from: 'invoices@cardcom.solutions',
    subject: 'TaxInvoiceAndReceipt #42',
    body: 'Document Number: 42\nDeal Number: 111222333\nAmount: 1200.00 ILS',
    date: '2026-11-04'
  }
];

const mockBookings = [
  {
    id: 'b1',
    guest_name: 'Test Guest',
    guest_email: '',
    clearing_payments: [
      { gateway: 'cardcom', txn: '269149464', amount_agorot: 65000 }
    ]
  },
  {
    id: 'b2',
    guest_name: 'Another Guest',
    guest_email: 'guest@example.com',
    clearing_payments: [
      { gateway: 'cardcom', txn: '111222333', amount_agorot: 120000, invoice: 'DOC-1' }
    ]
  },
  {
    id: 'b3',
    guest_name: 'Third Guest',
    guest_email: 'mialeesresort@mialees.com',
    clearing_payments: [
      { source: 'CARD', txn: '999888777', amount_agorot: 50000 }
    ]
  }
];

describe('invoice matching', () => {
  it('finds payments missing invoice', () => {
    const missing = findPaymentsMissingInvoice(mockBookings);
    assert.strictEqual(missing.length, 2);
    assert.strictEqual(missing[0].bookingId, 'b1');
    assert.strictEqual(missing[1].bookingId, 'b3');
  });

  it('matches payment by deal number', () => {
    const payment = { txn: '269149464', amount_agorot: 65000 };
    const invoice = { dealNumber: '269149464', documentNumber: '6', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), true);
  });

  it('does not match mismatched deal numbers', () => {
    const payment = { txn: '269149464', amount_agorot: 65000 };
    const invoice = { dealNumber: '111111111', documentNumber: '7', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), false);
  });

  it('matches by amount when no deal number', () => {
    const payment = { amount_agorot: 65000 };
    const invoice = { documentNumber: '8', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), true);
  });

  it('shouldCheckMailbox returns true for empty guest email', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, ''), true);
  });

  it('shouldCheckMailbox returns true for fallback email', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, 'mialeesresort@mialees.com'), true);
  });

  it('shouldCheckMailbox returns false when invoice exists', () => {
    const payment = { txn: '123', invoice: 'DOC-1' };
    assert.strictEqual(shouldCheckMailbox(payment, ''), false);
  });

  it('shouldCheckMailbox returns false for real guest email', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, 'guest@example.com'), false);
  });

  it('attachInvoiceToPayment adds invoice fields', () => {
    const payment = { txn: '269149464', amount_agorot: 65000 };
    const invoice = { documentNumber: '6', documentUrl: 'https://example.com/doc/6' };
    const result = attachInvoiceToPayment(payment, invoice);
    
    assert.strictEqual(result.invoice, '6');
    assert.strictEqual(result.document_number, '6');
    assert.strictEqual(result.document_url, 'https://example.com/doc/6');
    assert.strictEqual(result.invoice_match_source, 'mailbox_ingest');
    assert.ok(result.invoice_matched_at);
  });
});

describe('email processing flow', () => {
  it('processes Cardcom email through full flow', () => {
    const email = mockEmails[0];
    
    assert.strictEqual(isCardcomSender(email.from), true);
    
    const parsed = parseCardcomInvoiceEmail(email.body, email.subject);
    assert.strictEqual(parsed.documentNumber, '6');
    assert.strictEqual(parsed.dealNumber, '269149464');
    assert.strictEqual(parsed.amount, 650);
    
    const missing = findPaymentsMissingInvoice(mockBookings);
    const matchedEntry = missing.find((entry) =>
      matchPaymentToInvoice(entry.payment, parsed)
    );
    
    assert.ok(matchedEntry);
    assert.strictEqual(matchedEntry.bookingId, 'b1');
  });

  it('skips non-Cardcom senders', () => {
    assert.strictEqual(isCardcomSender('sales@example.com'), false);
    assert.strictEqual(isCardcomSender('support@stripe.com'), false);
  });

  it('recognizes various Cardcom sender patterns', () => {
    assert.strictEqual(isCardcomSender('noreply@cardcom.co.il'), true);
    assert.strictEqual(isCardcomSender('invoices@secure.cardcom.solutions'), true);
    assert.strictEqual(isCardcomSender('support@cardcom.com'), true);
  });
});

describe('ingest result structure', () => {
  it('validates ingest result shape with mock data', async () => {
    const mockClient = createMockImapClient(mockEmails);
    
    const fetchResult = await mockClient.fetchCardcomInvoiceEmails();
    
    assert.ok(Array.isArray(fetchResult.emails));
    assert.strictEqual(typeof fetchResult.count, 'number');
    assert.strictEqual(typeof fetchResult.searched, 'number');
    assert.strictEqual(fetchResult.count, mockEmails.length);
  });
});
