import { onRequest as checkoutOnRequest } from '../../checkout/[[path]].js';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, PUT, OPTIONS',
        'access-control-allow-headers': 'content-type, x-hotelos-mailbox'
      }
    });
  }
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return Response.json({ error: 'METHOD' }, { status: 405 });
  }
  const next = new Request(new URL('/api/checkout/publish', request.url), {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  return checkoutOnRequest({ ...context, request: next, params: { path: ['publish'] } });
}
