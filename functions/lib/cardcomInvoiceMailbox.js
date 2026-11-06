/**
 * Cardcom Invoice Mailbox Ingest
 *
 * When a Cardcom webhook arrives without an attached invoice (because the guest
 * had no email), the invoice is sent to FALLBACK_INVOICE_EMAIL. This module
 * checks the mailbox for matching invoices and ingests them into the system.
 *
 * Environment variables:
 * - CARDCOM_INVOICE_MAILBOX_USER: Email address for the invoice mailbox (mialeesresort@mialees.com)
 * - CARDCOM_INVOICE_MAILBOX_PASSWORD: Gmail app password for the mailbox
 */

import { FALLBACK_INVOICE_EMAIL } from './cardcomTapCore.js';

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;

export function invoiceMailboxConfigured(env) {
  const user = String(env?.CARDCOM_INVOICE_MAILBOX_USER || env?.GMAIL_INVOICE_USER || '').trim().toLowerCase();
  const pass = String(env?.CARDCOM_INVOICE_MAILBOX_PASSWORD || env?.GMAIL_INVOICE_APP_PASSWORD || '').replace(/\s+/g, '');
  return Boolean(user && pass);
}

export function invoiceMailboxCreds(env) {
  const user = String(env?.CARDCOM_INVOICE_MAILBOX_USER || env?.GMAIL_INVOICE_USER || '').trim().toLowerCase();
  const pass = String(env?.CARDCOM_INVOICE_MAILBOX_PASSWORD || env?.GMAIL_INVOICE_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) {
    const err = new Error('Invoice mailbox not configured');
    err.code = 'MAILBOX_NOT_CONFIGURED';
    throw err;
  }
  return { user, pass };
}

const CARDCOM_SENDER_PATTERNS = [
  /cardcom/i,
  /קארדקום/,
  /secure\.cardcom\.solutions/i,
  /noreply@cardcom/i
];

const DOCUMENT_NUMBER_PATTERNS = [
  /מספר מסמך[:\s]*(\d+)/i,
  /Document\s*(?:Number|No\.?)[:\s]*(\d+)/i,
  /DocumentNumber[:\s]*(\d+)/i,
  /חשבונית[:\s#]*(\d+)/i,
  /TaxInvoiceAndReceipt[:\s#]*(\d+)/i
];

const DEAL_NUMBER_PATTERNS = [
  /מספר עסקה[:\s]*(\d+)/i,
  /Deal\s*(?:Number|No\.?)[:\s]*(\d+)/i,
  /DealNumber[:\s]*(\d+)/i,
  /עסקה[:\s#]*(\d+)/i,
  /Transaction[:\s#]*(\d+)/i
];

const AMOUNT_PATTERNS = [
  /סכום[:\s]*([\d,]+\.?\d*)\s*(?:₪|ש"ח|ILS)?/i,
  /Amount[:\s]*([\d,]+\.?\d*)\s*(?:₪|NIS|ILS)?/i,
  /Total[:\s]*([\d,]+\.?\d*)\s*(?:₪|NIS|ILS)?/i,
  /₪\s*([\d,]+\.?\d*)/
];

const DOCUMENT_URL_PATTERNS = [
  /(https?:\/\/secure\.cardcom\.solutions\/[^\s"<>]+)/i,
  /(https?:\/\/[^\s"<>]*cardcom[^\s"<>]*\/doc[^\s"<>]*)/i
];

export function parseCardcomInvoiceEmail(emailBody, emailSubject = '') {
  const text = `${emailSubject}\n${emailBody}`;
  
  let documentNumber = null;
  for (const pattern of DOCUMENT_NUMBER_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      documentNumber = match[1].trim();
      break;
    }
  }

  let dealNumber = null;
  for (const pattern of DEAL_NUMBER_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      dealNumber = match[1].trim();
      break;
    }
  }

  let amount = null;
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const raw = match[1].replace(/,/g, '');
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  let documentUrl = null;
  for (const pattern of DOCUMENT_URL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      documentUrl = match[1].trim();
      break;
    }
  }

  return { documentNumber, dealNumber, amount, documentUrl };
}

export function isCardcomSender(from) {
  const sender = String(from || '').toLowerCase();
  return CARDCOM_SENDER_PATTERNS.some((pattern) => pattern.test(sender));
}

export function matchPaymentToInvoice(payment, invoice) {
  if (!payment || !invoice) return false;
  const paymentDeal = String(payment.deal_number || payment.txn || '').trim();
  const invoiceDeal = String(invoice.dealNumber || '').trim();
  if (paymentDeal && invoiceDeal) {
    return paymentDeal === invoiceDeal;
  }
  const paymentAmount = Number(payment.amount_agorot) || 0;
  const invoiceAmount = Math.round((Number(invoice.amount) || 0) * 100);
  if (paymentAmount > 0 && invoiceAmount > 0 && Math.abs(paymentAmount - invoiceAmount) < 100) {
    return true;
  }
  return false;
}

export function findPaymentsMissingInvoice(bookings) {
  const missing = [];
  for (const booking of bookings || []) {
    const payments = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
    for (const payment of payments) {
      const hasInvoice = Boolean(payment.invoice || payment.document_number || payment.documentNumber);
      const isCardcom = String(payment.gateway || '').toLowerCase() === 'cardcom';
      const isCard = String(payment.source || payment.accountKey || '').toUpperCase() === 'CARD';
      if (!hasInvoice && (isCardcom || isCard)) {
        missing.push({
          bookingId: booking.id,
          payment,
          guestEmail: booking.guest_email || '',
          guestName: booking.guest_name || ''
        });
      }
    }
  }
  return missing;
}

export function attachInvoiceToPayment(payment, invoice) {
  if (!payment || !invoice?.documentNumber) return payment;
  return {
    ...payment,
    invoice: invoice.documentNumber,
    document_number: invoice.documentNumber,
    document_url: invoice.documentUrl || payment.document_url || '',
    invoice_matched_at: new Date().toISOString(),
    invoice_match_source: 'mailbox_ingest'
  };
}

export function shouldCheckMailbox(payment, guestEmail) {
  if (!payment) return false;
  const hasInvoice = Boolean(payment.invoice || payment.document_number);
  if (hasInvoice) return false;
  const email = String(guestEmail || '').trim().toLowerCase();
  if (!email || email === FALLBACK_INVOICE_EMAIL.toLowerCase()) return true;
  return false;
}

export async function processInvoiceEmail(emailData, { loadBookings, patchBooking, log } = {}) {
  const { from, subject, body, date } = emailData;
  
  if (!isCardcomSender(from)) {
    log?.info?.({ from }, 'Skipping non-Cardcom email');
    return { skipped: true, reason: 'not_cardcom_sender' };
  }

  const parsed = parseCardcomInvoiceEmail(body, subject);
  if (!parsed.documentNumber) {
    log?.info?.({ subject }, 'No document number found in email');
    return { skipped: true, reason: 'no_document_number' };
  }

  log?.info?.({ ...parsed, date }, 'Parsed Cardcom invoice email');

  if (!loadBookings || !patchBooking) {
    return { parsed, skipped: true, reason: 'no_db_access' };
  }

  const bookings = await loadBookings();
  const missing = findPaymentsMissingInvoice(bookings);
  
  let matched = null;
  for (const entry of missing) {
    if (matchPaymentToInvoice(entry.payment, parsed)) {
      matched = entry;
      break;
    }
  }

  if (!matched) {
    log?.info?.({ parsed }, 'No matching payment found for invoice');
    return { parsed, skipped: true, reason: 'no_matching_payment' };
  }

  const booking = bookings.find((b) => b.id === matched.bookingId);
  if (!booking) {
    return { parsed, skipped: true, reason: 'booking_not_found' };
  }

  const updatedPayments = (booking.clearing_payments || []).map((p) => {
    if (matchPaymentToInvoice(p, parsed)) {
      return attachInvoiceToPayment(p, parsed);
    }
    return p;
  });

  await patchBooking(matched.bookingId, { clearing_payments: updatedPayments });
  log?.info?.({ bookingId: matched.bookingId, documentNumber: parsed.documentNumber }, 'Invoice attached to payment');

  return {
    attached: true,
    bookingId: matched.bookingId,
    documentNumber: parsed.documentNumber,
    documentUrl: parsed.documentUrl
  };
}

export const MAILBOX_CONFIG = {
  fallbackEmail: FALLBACK_INVOICE_EMAIL,
  imapHost: IMAP_HOST,
  imapPort: IMAP_PORT,
  searchDaysBack: 7,
  maxEmails: 50
};
