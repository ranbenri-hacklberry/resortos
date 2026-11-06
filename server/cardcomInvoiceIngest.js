/**
 * Cardcom Invoice Ingest Service
 *
 * Wires the mailbox fetch to the parse/match helpers and attaches invoices
 * to payments in the database.
 */

import {
  parseCardcomInvoiceEmail,
  isCardcomSender,
  matchPaymentToInvoice,
  findPaymentsMissingInvoice,
  attachInvoiceToPayment,
  shouldCheckMailbox
} from '../functions/lib/cardcomInvoiceMailbox.js';
import {
  fetchCardcomInvoiceEmailsCached,
  invoiceMailboxConfigured,
  checkMailboxStatus
} from './cardcomInvoiceFetch.js';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

async function fetchBookings({ from, limit = 500 } = {}) {
  const key = dbKey();
  if (!key) {
    throw new Error('Database not configured');
  }
  
  const fromDate = from || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    select: 'id,guest_name,guest_email,clearing_payments,payment_status',
    'check_in_date': `gte.${fromDate}`,
    'deleted_at': 'is.null',
    limit: String(limit)
  });
  
  const response = await fetch(`${supabaseUrl()}/rest/v1/hotelos_bookings?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch bookings: ${response.status}`);
  }
  
  return response.json();
}

async function patchBooking(bookingId, patch) {
  const key = dbKey();
  if (!key) {
    throw new Error('Database not configured');
  }
  
  const response = await fetch(
    `${supabaseUrl()}/rest/v1/hotelos_bookings?id=eq.${encodeURIComponent(bookingId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to patch booking ${bookingId}: ${response.status}`);
  }
  
  return true;
}

export async function ingestCardcomInvoices({ force = false, daysBack = 7 } = {}) {
  if (!invoiceMailboxConfigured()) {
    return { success: false, error: 'Mailbox not configured', attached: 0 };
  }
  
  const fetchResult = await fetchCardcomInvoiceEmailsCached({ force, daysBack });
  const emails = fetchResult.emails || [];
  
  if (!emails.length) {
    return { success: true, message: 'No Cardcom emails found', attached: 0, cached: fetchResult.cached };
  }
  
  const bookings = await fetchBookings();
  const missing = findPaymentsMissingInvoice(bookings);
  
  if (!missing.length) {
    return { 
      success: true, 
      message: 'No payments missing invoices',
      attached: 0,
      emailsFound: emails.length,
      cached: fetchResult.cached
    };
  }
  
  const attached = [];
  const skipped = [];
  
  for (const email of emails) {
    if (!isCardcomSender(email.from)) {
      skipped.push({ email: email.subject, reason: 'not_cardcom_sender' });
      continue;
    }
    
    const parsed = parseCardcomInvoiceEmail(email.body, email.subject);
    if (!parsed.documentNumber) {
      skipped.push({ email: email.subject, reason: 'no_document_number' });
      continue;
    }
    
    let matchedEntry = null;
    for (const entry of missing) {
      if (!shouldCheckMailbox(entry.payment, entry.guestEmail)) continue;
      if (matchPaymentToInvoice(entry.payment, parsed)) {
        matchedEntry = entry;
        break;
      }
    }
    
    if (!matchedEntry) {
      skipped.push({ 
        email: email.subject, 
        documentNumber: parsed.documentNumber,
        reason: 'no_matching_payment' 
      });
      continue;
    }
    
    const booking = bookings.find((b) => b.id === matchedEntry.bookingId);
    if (!booking) continue;
    
    const updatedPayments = (booking.clearing_payments || []).map((p) => {
      if (matchPaymentToInvoice(p, parsed)) {
        return attachInvoiceToPayment(p, parsed);
      }
      return p;
    });
    
    try {
      await patchBooking(matchedEntry.bookingId, { clearing_payments: updatedPayments });
      
      const idx = missing.findIndex((m) => m.bookingId === matchedEntry.bookingId);
      if (idx >= 0) missing.splice(idx, 1);
      
      attached.push({
        bookingId: matchedEntry.bookingId,
        guestName: matchedEntry.guestName,
        documentNumber: parsed.documentNumber,
        documentUrl: parsed.documentUrl
      });
    } catch (err) {
      skipped.push({
        email: email.subject,
        documentNumber: parsed.documentNumber,
        reason: 'patch_failed',
        error: err.message
      });
    }
  }
  
  return {
    success: true,
    attached: attached.length,
    attachedDetails: attached,
    skipped: skipped.length,
    skippedDetails: skipped.slice(0, 10),
    emailsFound: emails.length,
    paymentsMissing: missing.length,
    cached: fetchResult.cached
  };
}

export async function ingestInvoiceForPayment(payment, guestEmail, bookingId) {
  if (!shouldCheckMailbox(payment, guestEmail)) {
    return { success: false, reason: 'mailbox_check_not_needed' };
  }
  
  if (!invoiceMailboxConfigured()) {
    return { success: false, reason: 'mailbox_not_configured' };
  }
  
  const fetchResult = await fetchCardcomInvoiceEmailsCached({ force: false });
  const emails = fetchResult.emails || [];
  
  for (const email of emails) {
    if (!isCardcomSender(email.from)) continue;
    
    const parsed = parseCardcomInvoiceEmail(email.body, email.subject);
    if (!parsed.documentNumber) continue;
    
    if (matchPaymentToInvoice(payment, parsed)) {
      return {
        success: true,
        matched: true,
        invoice: {
          documentNumber: parsed.documentNumber,
          documentUrl: parsed.documentUrl,
          amount: parsed.amount,
          dealNumber: parsed.dealNumber
        }
      };
    }
  }
  
  return { success: true, matched: false, reason: 'no_matching_invoice' };
}

export async function getIngestStatus() {
  const mailboxStatus = invoiceMailboxConfigured() 
    ? await checkMailboxStatus()
    : { configured: false, connected: false };
  
  let bookingsStatus = { available: false };
  try {
    const bookings = await fetchBookings({ limit: 1 });
    bookingsStatus = { available: true, count: bookings.length };
  } catch (err) {
    bookingsStatus = { available: false, error: err.message };
  }
  
  return {
    mailbox: mailboxStatus,
    database: bookingsStatus,
    ready: mailboxStatus.configured && mailboxStatus.connected && bookingsStatus.available
  };
}
