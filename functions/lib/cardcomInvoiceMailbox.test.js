import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import {
  parseCardcomInvoiceEmail,
  isCardcomSender,
  matchPaymentToInvoice,
  findPaymentsMissingInvoice,
  attachInvoiceToPayment,
  shouldCheckMailbox,
  invoiceMailboxConfigured
} from './cardcomInvoiceMailbox.js';

describe('parseCardcomInvoiceEmail', () => {
  it('extracts document number from Hebrew email', () => {
    const body = 'חשבונית מס קבלה מספר מסמך: 6 עבור עסקה 269149464';
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.documentNumber, '6');
  });

  it('extracts deal number from email', () => {
    const body = 'מספר עסקה: 269149464 סכום: 650.00 ₪';
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.dealNumber, '269149464');
  });

  it('extracts amount from email', () => {
    const body = 'סכום: 650.00 ₪';
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.amount, 650);
  });

  it('extracts amount with comma formatting', () => {
    const body = 'Total: 1,500.00 ILS';
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.amount, 1500);
  });

  it('extracts document URL', () => {
    const body = 'צפה בחשבונית: https://secure.cardcom.solutions/doc/12345';
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.documentUrl, 'https://secure.cardcom.solutions/doc/12345');
  });

  it('parses complete Cardcom email', () => {
    const body = `
      חשבונית מס קבלה
      מספר מסמך: 123
      מספר עסקה: 269149464
      סכום: 650.00 ₪
      לצפייה: https://secure.cardcom.solutions/doc/xyz
    `;
    const result = parseCardcomInvoiceEmail(body);
    assert.strictEqual(result.documentNumber, '123');
    assert.strictEqual(result.dealNumber, '269149464');
    assert.strictEqual(result.amount, 650);
    assert.strictEqual(result.documentUrl, 'https://secure.cardcom.solutions/doc/xyz');
  });
});

describe('isCardcomSender', () => {
  it('recognizes cardcom.co.il sender', () => {
    assert.strictEqual(isCardcomSender('noreply@cardcom.co.il'), true);
  });

  it('recognizes Cardcom Solutions sender', () => {
    assert.strictEqual(isCardcomSender('invoices@secure.cardcom.solutions'), true);
  });

  it('rejects non-cardcom sender', () => {
    assert.strictEqual(isCardcomSender('sales@example.com'), false);
  });
});

describe('matchPaymentToInvoice', () => {
  it('matches by deal number', () => {
    const payment = { txn: '269149464', amount_agorot: 65000 };
    const invoice = { dealNumber: '269149464', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), true);
  });

  it('matches by deal_number field', () => {
    const payment = { deal_number: '269149464', amount_agorot: 65000 };
    const invoice = { dealNumber: '269149464', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), true);
  });

  it('matches by amount when deal numbers missing', () => {
    const payment = { amount_agorot: 65000 };
    const invoice = { amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), true);
  });

  it('does not match different amounts', () => {
    const payment = { amount_agorot: 50000 };
    const invoice = { amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), false);
  });

  it('does not match different deal numbers', () => {
    const payment = { txn: '111111', amount_agorot: 65000 };
    const invoice = { dealNumber: '222222', amount: 650 };
    assert.strictEqual(matchPaymentToInvoice(payment, invoice), false);
  });
});

describe('findPaymentsMissingInvoice', () => {
  it('finds card payments without invoice', () => {
    const bookings = [{
      id: 'b1',
      guest_email: '',
      clearing_payments: [
        { source: 'CARD', txn: '123', amount_agorot: 65000 },
        { source: 'CARD', txn: '456', amount_agorot: 30000, invoice: 'DOC-1' }
      ]
    }];
    const missing = findPaymentsMissingInvoice(bookings);
    assert.strictEqual(missing.length, 1);
    assert.strictEqual(missing[0].bookingId, 'b1');
    assert.strictEqual(missing[0].payment.txn, '123');
  });

  it('finds cardcom gateway payments without invoice', () => {
    const bookings = [{
      id: 'b2',
      clearing_payments: [
        { gateway: 'cardcom', txn: '789', amount_agorot: 45000 }
      ]
    }];
    const missing = findPaymentsMissingInvoice(bookings);
    assert.strictEqual(missing.length, 1);
  });

  it('returns empty for bookings with all invoices', () => {
    const bookings = [{
      id: 'b3',
      clearing_payments: [
        { source: 'CARD', invoice: 'DOC-2', amount_agorot: 65000 }
      ]
    }];
    const missing = findPaymentsMissingInvoice(bookings);
    assert.strictEqual(missing.length, 0);
  });
});

describe('attachInvoiceToPayment', () => {
  it('attaches invoice fields to payment', () => {
    const payment = { txn: '123', amount_agorot: 65000 };
    const invoice = { documentNumber: '6', documentUrl: 'https://example.com/doc/6' };
    const result = attachInvoiceToPayment(payment, invoice);
    
    assert.strictEqual(result.invoice, '6');
    assert.strictEqual(result.document_number, '6');
    assert.strictEqual(result.document_url, 'https://example.com/doc/6');
    assert.strictEqual(result.invoice_match_source, 'mailbox_ingest');
  });

  it('preserves existing payment fields', () => {
    const payment = { txn: '123', amount_agorot: 65000, last4: '7717' };
    const invoice = { documentNumber: '6' };
    const result = attachInvoiceToPayment(payment, invoice);
    
    assert.strictEqual(result.txn, '123');
    assert.strictEqual(result.amount_agorot, 65000);
    assert.strictEqual(result.last4, '7717');
  });

  it('returns original payment if no document number', () => {
    const payment = { txn: '123' };
    const invoice = {};
    const result = attachInvoiceToPayment(payment, invoice);
    assert.deepStrictEqual(result, payment);
  });
});

describe('shouldCheckMailbox', () => {
  it('returns true when no email and no invoice', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, ''), true);
  });

  it('returns true when fallback email and no invoice', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, 'mialeesresort@mialees.com'), true);
  });

  it('returns false when payment has invoice', () => {
    const payment = { txn: '123', invoice: 'DOC-1' };
    assert.strictEqual(shouldCheckMailbox(payment, ''), false);
  });

  it('returns false when guest has real email', () => {
    const payment = { txn: '123' };
    assert.strictEqual(shouldCheckMailbox(payment, 'guest@example.com'), false);
  });
});

describe('invoiceMailboxConfigured', () => {
  it('returns true when credentials set', () => {
    const env = {
      CARDCOM_INVOICE_MAILBOX_USER: 'test@example.com',
      CARDCOM_INVOICE_MAILBOX_PASSWORD: 'apppassword'
    };
    assert.strictEqual(invoiceMailboxConfigured(env), true);
  });

  it('returns false when user missing', () => {
    const env = {
      CARDCOM_INVOICE_MAILBOX_PASSWORD: 'apppassword'
    };
    assert.strictEqual(invoiceMailboxConfigured(env), false);
  });

  it('returns false when password missing', () => {
    const env = {
      CARDCOM_INVOICE_MAILBOX_USER: 'test@example.com'
    };
    assert.strictEqual(invoiceMailboxConfigured(env), false);
  });

  it('accepts alternative env var names', () => {
    const env = {
      GMAIL_INVOICE_USER: 'test@example.com',
      GMAIL_INVOICE_APP_PASSWORD: 'apppassword'
    };
    assert.strictEqual(invoiceMailboxConfigured(env), true);
  });
});
