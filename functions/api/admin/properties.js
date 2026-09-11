import { json, errorJson, fetchPostgrest, getPostgrestConfig } from '../_db.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  const url = new URL(request.url);

  // 1. GET: List properties with CRM filtering
  if (request.method === 'GET') {
    const crmStatus = url.searchParams.get('crm_status');
    const region = url.searchParams.get('region');
    const isPublic = url.searchParams.get('is_public');
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    let queryPath = `/properties?select=id,slug,name,hebrew_name,village,region,whatsapp_number,phone,claimed_status,crm_status,is_public,reference_image_urls,source,source_url,first_touch_sent_at,last_inbound_at,last_outbound_at,opted_out_at,property_public_path,created_at,updated_at&order=updated_at.desc&limit=${limit}&offset=${offset}`;

    if (crmStatus && crmStatus !== 'all') {
      queryPath += `&crm_status=eq.${encodeURIComponent(crmStatus)}`;
    }
    if (region && region !== 'all') {
      queryPath += `&region=eq.${encodeURIComponent(region)}`;
    }
    if (isPublic !== null && isPublic !== undefined && isPublic !== 'all') {
      queryPath += `&is_public=eq.${isPublic === 'true'}`;
    }
    if (search) {
      queryPath += `&or=(hebrew_name.ilike.*${encodeURIComponent(search)}*,village.ilike.*${encodeURIComponent(search)}*,whatsapp_number.ilike.*${encodeURIComponent(search)}*)`;
    }

    const res = await fetchPostgrest(queryPath, { method: 'GET' }, env);

    if (!res || !res.ok) {
      return json({
        source: 'fallback',
        properties: [],
        message: 'Studio DB unreachable'
      }, 200);
    }

    const properties = await res.json();
    return json({
      source: 'live',
      properties: properties.map((p) => ({
        ...p,
        has_reference_images: Array.isArray(p.reference_image_urls) && p.reference_image_urls.length > 0,
        reference_images_count: Array.isArray(p.reference_image_urls) ? p.reference_image_urls.length : 0
      }))
    });
  }

  // 2. PATCH: Update CRM status or visibility
  if (request.method === 'PATCH') {
    const id = url.searchParams.get('id');
    if (!id) {
      return errorJson('Missing property id', 400, 'MISSING_ID');
    }

    const body = await request.json().catch(() => ({}));
    const allowedKeys = [
      'crm_status',
      'is_public',
      'first_touch_sent_at',
      'last_outbound_at',
      'last_inbound_at',
      'opted_out_at',
      'property_public_path'
    ];

    const patchPayload = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        patchPayload[key] = body[key];
      }
    }

    if (patchPayload.crm_status === 'Opt_Out' && !patchPayload.opted_out_at) {
      patchPayload.opted_out_at = new Date().toISOString();
      patchPayload.is_public = false;
    }

    const res = await fetchPostgrest(`/properties?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(patchPayload)
    }, env);

    if (!res || !res.ok) {
      return errorJson('Failed to update property', 500, 'UPDATE_FAILED');
    }

    const updated = await res.json();
    return json({ success: true, property: updated[0] || null });
  }

  return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}
