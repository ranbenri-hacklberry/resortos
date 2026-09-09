import { onRequest as checkoutOnRequest } from '../checkout/[[path]].js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function stayProxy(context, action, extra = {}) {
  const { request } = context;
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || body.reservationId || extra.token || '').trim();
  if (!/^tok_[A-Za-z0-9_-]+$/.test(token)) return json({ error: 'INVALID_TOKEN' }, 400);
  const innerUrl = new URL(`/api/checkout/${token}/stay`, request.url);
  const inner = new Request(innerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, ...extra, action, token })
  });
  return checkoutOnRequest({ ...context, request: inner, params: { path: [token, 'stay'] } });
}

export async function onRequest(context) {
  const { request, params } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type'
      }
    });
  }
  if (request.method !== 'POST') return json({ error: 'NOT_FOUND' }, 404);
  const action = [].concat(params.path || []).filter(Boolean)[0] || '';
  if (action === 'verify-cash-pin') return stayProxy(context, 'guest_checkin_cash_pin');
  if (action === 'upload-transfer-receipt') return stayProxy(context, 'guest_checkin_bank');
  return json({ error: 'NOT_FOUND' }, 404);
}
