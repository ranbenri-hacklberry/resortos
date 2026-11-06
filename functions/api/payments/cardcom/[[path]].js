import { errorJson, json } from '../../_db.js';
import {
  clientError,
  createInvoice,
  createPaymentLink,
  loadBooking,
  manualCharge,
  paymentLinkStatus,
  prepareDevice,
  processTap,
  quoteCharge,
  sessionFromRequest
} from '../../../lib/cardcomTap.js';
import { bookingSummary, attachDocument } from '../../../lib/cardcomTapCore.js';
import {
  invoiceMailboxConfigured,
  matchPaymentToInvoice,
  attachInvoiceToPayment
} from '../../../lib/cardcomInvoiceMailbox.js';
import { fetchPostgrest } from '../../_db.js';

function routeError(err) {
  const status = err.code === 'UNAUTHORIZED' ? 401
    : err.code === 'CARDCOM_NOT_CONFIGURED' ? 503
      : err.code === 'CARDCOM_TIMEOUT' ? 504
        : 400;
  return errorJson(err.message || 'שגיאה', status, err.code || 'CARDCOM_ERROR');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const pathParts = [].concat(params?.path || []).filter(Boolean);
  const action = pathParts[0] || '';

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const session = await sessionFromRequest(env, request);
    if (!session) return errorJson('לא מחובר', 401, 'UNAUTHORIZED');

    if (action === 'booking' && method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') || '';
      const loaded = await loadBooking(env, id);
      if (!loaded) return errorJson('ההזמנה לא נמצאה', 404, 'BOOKING_NOT_FOUND');
      return json({ ok: true, booking: bookingSummary(loaded.booking) });
    }

    if (method !== 'POST') return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
    const body = await request.json().catch(() => ({}));

    if (action === 'quote') return json(await quoteCharge(env, body));
    if (action === 'prepare') return json(await prepareDevice(env, body));
    if (action === 'process') return json(await processTap(env, body));
    if (action === 'invoice') return json(await createInvoice(env, body));
    if (action === 'link' && pathParts[1] === 'status') return json(await paymentLinkStatus(env, body));
    if (action === 'link') return json(await createPaymentLink(env, body));
    if (action === 'link-status') return json(await paymentLinkStatus(env, body));
    if (action === 'manual') return json(await manualCharge(env, body));

    if (action === 'attach-invoice') {
      const bookingId = String(body.bookingId || body.booking_id || '').trim();
      const dealNumber = String(body.dealNumber || body.deal_number || body.txn || '').trim();
      const documentNumber = String(body.documentNumber || body.document_number || body.invoice || '').trim();
      const documentUrl = String(body.documentUrl || body.document_url || '').trim();
      
      if (!bookingId) return errorJson('חסר מזהה הזמנה', 400, 'MISSING_BOOKING_ID');
      if (!documentNumber) return errorJson('חסר מספר חשבונית', 400, 'MISSING_DOCUMENT_NUMBER');

      const loaded = await loadBooking(env, bookingId);
      if (!loaded) return errorJson('ההזמנה לא נמצאה', 404, 'BOOKING_NOT_FOUND');
      
      const booking = loaded.booking;
      const payments = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
      
      let matchIdx = -1;
      if (dealNumber) {
        matchIdx = payments.findIndex((p) => {
          const txn = String(p.txn || p.deal_number || '').trim();
          return txn && txn === dealNumber;
        });
      }
      
      if (matchIdx < 0) {
        matchIdx = payments.findIndex((p) => {
          const hasInvoice = Boolean(p.invoice || p.document_number);
          const isCardcom = String(p.gateway || '').toLowerCase() === 'cardcom';
          const isCard = String(p.source || p.accountKey || '').toUpperCase() === 'CARD';
          return !hasInvoice && (isCardcom || isCard);
        });
      }
      
      if (matchIdx < 0) {
        return errorJson('לא נמצא תשלום מתאים', 404, 'NO_MATCHING_PAYMENT');
      }
      
      const updatedPayments = payments.map((p, idx) => {
        if (idx !== matchIdx) return p;
        return {
          ...p,
          invoice: documentNumber,
          document_number: documentNumber,
          document_url: documentUrl || p.document_url || '',
          invoice_attached_at: new Date().toISOString(),
          invoice_attach_source: 'api'
        };
      });
      
      const response = await fetchPostgrest(
        `/hotelos_bookings?id=eq.${encodeURIComponent(booking.id || bookingId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            clearing_payments: updatedPayments,
            updated_at: new Date().toISOString()
          })
        },
        env
      );
      
      if (!response?.ok) {
        return errorJson('עדכון החשבונית נכשל', 500, 'PATCH_FAILED');
      }
      
      return json({
        ok: true,
        bookingId,
        documentNumber,
        documentUrl,
        paymentIndex: matchIdx,
        message: 'החשבונית צורפה לתשלום'
      });
    }

    if (action === 'mailbox-status') {
      return json({
        ok: true,
        configured: invoiceMailboxConfigured(env),
        fallbackEmail: 'mialeesresort@mialees.com'
      });
    }

    return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
  } catch (err) {
    if (err?.code) {
      const body = clientError(err);
      return json(body, err.code === 'UNAUTHORIZED' ? 401 : 400);
    }
    console.error('[cardcom]', err?.message || err);
    return routeError(err || new Error('שגיאת שרת'));
  }
}
