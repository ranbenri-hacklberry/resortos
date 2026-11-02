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
import { bookingSummary } from '../../../lib/cardcomTapCore.js';

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
