import {
  createHypInvoiceLink,
  getHypLowProfileResult,
  hypCheckoutTokenFromParams,
  hypLowProfileIdFromParams,
  hypParentBreakoutResponse,
  HYP_RETURN_ORIGIN,
  parseHypQuery
} from '../../../lib/hypPay.js';
import { onRequest as checkoutOnRequest } from '../../checkout/[[path]].js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function isAdmin(request, env) {
  const secret = env.CHECKOUT_MAILBOX_SECRET;
  if (!secret) return false;
  return (request.headers.get('x-hotelos-mailbox') || '') === secret;
}

async function searchFromRequest(request) {
  const url = new URL(request.url);
  if (url.search && url.search.length > 1) return url.search.slice(1);
  if (request.method === 'POST') {
    const ct = String(request.headers.get('content-type') || '');
    if (ct.includes('application/x-www-form-urlencoded')) return (await request.text()).trim();
    if (ct.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (typeof body.query === 'string') return String(body.query).replace(/^\?/, '');
      return new URLSearchParams(body).toString();
    }
  }
  return '';
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const segments = [].concat(params.path || []).filter(Boolean);
  const action = segments[0] || '';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-hotelos-mailbox'
      }
    });
  }

  if (action === 'create' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || body.bookingId || '').trim();
    if (!/^tok_[A-Za-z0-9_-]+$/.test(token)) return json({ error: 'INVALID_TOKEN' }, 400);
    const innerUrl = new URL(`/api/checkout/${token}`, request.url);
    const inner = new Request(innerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        guest_name: body.clientName || body.guest_name || '',
        guest_email: body.email || body.guest_email || '',
        special_requests: body.special_requests || '',
        pay: true,
        purpose: body.purpose || ''
      })
    });
    return checkoutOnRequest({ ...context, request: inner, params: { path: [token] } });
  }

  if (action === 'success' && (method === 'GET' || method === 'POST')) {
    const search = await searchFromRequest(request);
    const returned = parseHypQuery(search);
    const token = hypCheckoutTokenFromParams(returned);
    if (!/^tok_[A-Za-z0-9_-]+$/.test(token)) {
      return hypParentBreakoutResponse(`${HYP_RETURN_ORIGIN}/?hyp=missing`);
    }
    const target = new URL(`/api/checkout/${token}/hyp`, HYP_RETURN_ORIGIN);
    if (search) target.search = search;
    return hypParentBreakoutResponse(target.toString());
  }

  if (action === 'lp' && (method === 'GET' || method === 'POST')) {
    const search = await searchFromRequest(request);
    const returned = parseHypQuery(search);
    const token = hypCheckoutTokenFromParams(returned);
    const lpId = hypLowProfileIdFromParams(returned);
    if (lpId && /^tok_[A-Za-z0-9_-]+$/.test(token)) {
      try {
        const lp = await getHypLowProfileResult(env, lpId, { order: token });
        const innerSearch = new URLSearchParams({
          ...lp.params,
          LowProfileId: lpId,
          ReturnValue: token,
          Order: token
        }).toString();
        const innerUrl = new URL(`/api/checkout/${token}/hyp?${innerSearch}`, request.url);
        await checkoutOnRequest({
          ...context,
          request: new Request(innerUrl, { method: 'GET' }),
          params: { path: [token, 'hyp'] }
        });
      } catch (err) {
        console.warn('[hyp lp webhook]', err?.message || err);
      }
    }
    return new Response('ok', { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  if (action === 'invoice-link' && method === 'POST') {
    if (!isAdmin(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
    const body = await request.json().catch(() => ({}));
    try {
      const created = await createHypInvoiceLink(env, {
        transId: body.transId || body.Id,
        terminal: body.terminal || 'A'
      });
      return json({ url: created.url, transId: created.transId, terminal: created.terminal });
    } catch (err) {
      return json({ error: err.code || 'HYP_INVOICE_FAILED', message: String(err.message || err) }, 502);
    }
  }

  return json({ error: 'NOT_FOUND' }, 404);
}
