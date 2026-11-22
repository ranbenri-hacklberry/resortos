/**
 * HTTP Gateway for Cardcom Invoice Ingest
 *
 * Exposes endpoints for:
 * - Checking mailbox status
 * - Triggering invoice ingest
 * - Looking up invoice for a specific payment
 */

import {
  ingestCardcomInvoices,
  ingestInvoiceForPayment,
  getIngestStatus
} from './cardcomInvoiceIngest.js';
import { invoiceMailboxConfigured } from './cardcomInvoiceFetch.js';

function json(res, status, body) {
  res.status(status).json(body);
}

function requireAuth(req) {
  const token = req.headers['x-invoice-ingest-token'] || req.headers['x-agent-token'];
  const expected = process.env.INVOICE_INGEST_TOKEN || process.env.DISPATCH_TOKEN;
  if (expected && token !== expected) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

async function handleStatus(req, res) {
  try {
    const status = await getIngestStatus();
    json(res, 200, status);
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
  }
}

async function handleIngest(req, res) {
  try {
    requireAuth(req);
    
    const force = req.body?.force === true || req.query?.force === '1';
    const daysBack = Number(req.body?.daysBack || req.query?.daysBack) || 7;
    
    const result = await ingestCardcomInvoices({ force, daysBack });
    json(res, 200, result);
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
  }
}

async function handleLookup(req, res) {
  try {
    requireAuth(req);
    
    const { payment, guestEmail, bookingId } = req.body || {};
    if (!payment) {
      return json(res, 400, { error: 'Payment object required' });
    }
    
    const result = await ingestInvoiceForPayment(payment, guestEmail, bookingId);
    json(res, 200, result);
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
  }
}

export async function tryHandleCardcomInvoice(req, res) {
  const path = String(req.url || '').split('?')[0];
  const method = req.method?.toUpperCase();
  
  if (!path.startsWith('/api/cardcom-invoice')) return false;
  
  if (path === '/api/cardcom-invoice/status' && method === 'GET') {
    await handleStatus(req, res);
    return true;
  }
  
  if (path === '/api/cardcom-invoice/ingest' && method === 'POST') {
    await handleIngest(req, res);
    return true;
  }
  
  if (path === '/api/cardcom-invoice/lookup' && method === 'POST') {
    await handleLookup(req, res);
    return true;
  }
  
  return false;
}

export function registerCardcomInvoiceRoutes(app) {
  app.get('/api/cardcom-invoice/status', handleStatus);
  app.post('/api/cardcom-invoice/ingest', handleIngest);
  app.post('/api/cardcom-invoice/lookup', handleLookup);
}
