import { json, errorJson, fetchPostgrest, getPostgrestConfig } from './_db.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  if (request.method !== 'GET') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  const { tenantId } = getPostgrestConfig(env);

  // Query resort_public_catalog view which guarantees zero private access codes
  const path = `/resort_public_catalog?tenant_id=eq.${tenantId}&is_active=neq.false&order=sort_order.asc`;
  const res = await fetchPostgrest(path, { method: 'GET' }, env);

  if (!res || !res.ok) {
    // If DB is unreachable, return cached/fallback notice
    return json({
      source: 'fallback',
      message: 'Studio DB unreachable, using client catalog cache'
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  const data = await res.json();
  return json({
    source: 'live',
    catalog: data || []
  }, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  });
}
