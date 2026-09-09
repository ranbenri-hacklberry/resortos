import { HYP_RETURN_ORIGIN, parseHypQuery } from '../lib/hypPay.js';
import { serveGuestPortal } from '../lib/serveGuestPortal.js';

const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;

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
  const { request, params } = context;
  const token = [].concat(params.path || []).filter(Boolean)[0] || '';
  const url = new URL(request.url);
  if (url.searchParams.has('hyp')) {
    return serveGuestPortal(context);
  }
  const search = await searchFromRequest(request);
  const returned = parseHypQuery(search);
  const hasHypReturn = Boolean(
    search &&
    (returned.CCode != null && returned.CCode !== '') &&
    (returned.Id || returned.Order || returned.order || returned.id)
  );
  if (TOKEN_RE.test(token) && hasHypReturn) {
    const target = new URL(`/api/checkout/${encodeURIComponent(token)}/hyp`, HYP_RETURN_ORIGIN);
    target.search = search;
    return Response.redirect(target.toString(), 302);
  }
  return serveGuestPortal(context);
}
