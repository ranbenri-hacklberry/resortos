import { json, errorJson, fetchPostgrest, getPostgrestConfig } from './_db.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  if (request.method !== 'GET') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  const url = new URL(request.url);
  const propertyId = url.searchParams.get('property_id');
  const { tenantId } = getPostgrestConfig(env);

  let query = `/resort_booking_restrictions?tenant_id=eq.${tenantId}&is_active=eq.true`;
  if (propertyId) {
    query += `&or=(property_id.is.null,property_id.eq.${encodeURIComponent(propertyId)})`;
  }

  const res = await fetchPostgrest(query, { method: 'GET' }, env);

  if (!res || !res.ok) {
    // If DB is unreachable, return fallback default weekend restriction
    return json({
      source: 'fallback',
      restrictions: [
        {
          property_id: propertyId || null,
          name: 'סופ״ש מינימום 2 לילות (ברירת מחדל)',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          min_nights: 2,
          price_multiplier: 1.0,
          is_active: true
        }
      ]
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  const data = await res.json();
  return json({
    source: 'live',
    restrictions: data || []
  }, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  });
}
