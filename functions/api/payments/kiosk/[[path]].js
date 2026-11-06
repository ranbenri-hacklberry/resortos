import { errorJson, json } from '../../_db.js';
import { basaltPageResponse, handleBasaltRequest } from '../../../lib/basalt.js';
import {
  completeKioskTap,
  confirmKioskLink,
  createKioskLink,
  kioskAuthState,
  kioskDoneHtml,
  kioskWebhookFields,
  prepareKioskTap,
  readKioskOrder
} from '../../../lib/kioskCart.js';

function text(body, status = 200, contentType = 'text/plain; charset=utf-8') {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType, 'cache-control': 'no-store' }
  });
}

function routeError(err) {
  const code = err?.code || 'KIOSK_ERROR';
  const status = code === 'UNAUTHORIZED' || code === 'BAD_PIN' ? 401
    : code === 'NOT_FOUND' ? 404
      : code === 'IN_PROGRESS' || code === 'ATTEMPT_MISMATCH' || code === 'DEVICE_MISMATCH' || code === 'FORK' || code === 'IDEMPOTENCY_MISMATCH' ? 409
        : code === 'CARDCOM_NOT_CONFIGURED' || code === 'UNCONFIGURED' ? 503
          : code === 'CARDCOM_TIMEOUT' ? 504
            : code === 'CLOSED_LOOP' || code === 'FROZEN' ? 403
              : code === 'INSUFFICIENT' ? 402
                : 400;
  return json({
    ok: false,
    status: 'error',
    error: code,
    message: err?.message || 'שגיאה'
  }, status);
}

async function readBody(request) {
  const url = new URL(request.url);
  const fromQuery = Object.fromEntries(url.searchParams.entries());
  if (request.method.toUpperCase() === 'GET') return fromQuery;
  const type = String(request.headers.get('content-type') || '');
  if (type.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return { ...fromQuery, ...(body && typeof body === 'object' ? body : {}) };
  }
  const raw = await request.text();
  if (!raw) return fromQuery;
  try {
    if (raw.trim().startsWith('{')) return { ...fromQuery, ...JSON.parse(raw) };
  } catch {
    return fromQuery;
  }
  return { ...fromQuery, ...Object.fromEntries(new URLSearchParams(raw).entries()) };
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

  if (action === 'webhook' && (method === 'POST' || method === 'GET')) {
    try {
      const fields = kioskWebhookFields(await readBody(request));
      if (fields.orderId || fields.lowProfileId) await confirmKioskLink(env, fields);
      return text('ok');
    } catch (err) {
      console.error('[kiosk webhook]', err?.code || err?.message || err);
      if (err?.code === 'CARDCOM_TIMEOUT') return text('retry', 503);
      return text('ok');
    }
  }

  if (action === 'basalt' && pathParts[1] === 'page' && method === 'GET') {
    try {
      return await basaltPageResponse(env, request);
    } catch (err) {
      if (err?.code) return routeError(err);
      console.error('[basalt page]', err?.message || err);
      return routeError(err || new Error('שגיאת שרת'));
    }
  }

  if (action === 'done' && (method === 'GET' || method === 'POST')) {
    let result = { status: 'unknown' };
    try {
      result = await confirmKioskLink(env, kioskWebhookFields(await readBody(request)));
    } catch (err) {
      console.error('[kiosk done]', err?.code || err?.message || err);
    }
    return text(kioskDoneHtml(result), 200, 'text/html; charset=utf-8');
  }

  const auth = kioskAuthState(env, request.headers.get('authorization'));
  if (auth === 'unconfigured') {
    return json({ ok: false, status: 'error', error: 'UNCONFIGURED', message: 'קיוסק עדיין לא הוגדר בשרת' }, 503);
  }
  if (auth !== 'ok') return errorJson('לא מורשה', 401, 'UNAUTHORIZED');

  try {
    if (action === 'orders' && method === 'GET') {
      const orderId = new URL(request.url).searchParams.get('orderId') || pathParts[1] || '';
      const order = await readKioskOrder(env, orderId);
      if (!order) return errorJson('ההזמנה לא נמצאה', 404, 'NOT_FOUND');
      return json(order);
    }
    if (action === 'basalt') {
      const body = method === 'GET'
        ? Object.fromEntries(new URL(request.url).searchParams.entries())
        : await readBody(request);
      return await handleBasaltRequest(env, pathParts, method, body);
    }
    if (method !== 'POST') return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
    const body = await readBody(request);
    if (action === 'prepare') return json(await prepareKioskTap(env, body));
    if (action === 'complete') return json(await completeKioskTap(env, body));
    if (action === 'link' && pathParts[1] === 'status') return json(await confirmKioskLink(env, body));
    if (action === 'link-status') return json(await confirmKioskLink(env, body));
    if (action === 'link') return json(await createKioskLink(env, body));
    return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
  } catch (err) {
    if (err?.code) return routeError(err);
    console.error('[kiosk]', err?.message || err);
    return routeError(err || new Error('שגיאת שרת'));
  }
}
