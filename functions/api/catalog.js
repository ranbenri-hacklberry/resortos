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

  // Explicit Whitelist of Safe Public Columns - NEVER include reference_image_urls or internal CRM fields
  const SAFE_PUBLIC_COLUMNS = [
    'id', 'slug', 'name', 'hebrew_name', 'tagline', 'description',
    'region', 'village', 'address', 'geo_lat', 'geo_lng',
    'whatsapp_number', 'phone', 'email', 'hero_image', 'gallery_images',
    'amenities', 'claimed_status', 'direct_booking_enabled', 'property_public_path'
  ].join(',');

  // Query public_properties view with strict projection, fallback to filtered properties
  let path = `/public_properties?select=${SAFE_PUBLIC_COLUMNS}&order=hebrew_name.asc`;
  let res = await fetchPostgrest(path, { method: 'GET' }, env);

  if (!res || !res.ok) {
    // Fallback direct table query with strict filter: is_public=true AND crm_status!=Opt_Out
    path = `/properties?select=${SAFE_PUBLIC_COLUMNS}&is_public=eq.true&crm_status=neq.Opt_Out&order=hebrew_name.asc`;
    res = await fetchPostgrest(path, { method: 'GET' }, env);
  }

  if (!res || !res.ok) {
    // If DB is unreachable, return cached/fallback notice
    return json({
      source: 'fallback',
      message: 'Studio DB unreachable, using client catalog cache'
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  const rawData = await res.json();
  // Second-layer runtime whitelist sanitization to guarantee zero leakage
  const sanitizedCatalog = (Array.isArray(rawData) ? rawData : []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    hebrew_name: p.hebrew_name,
    tagline: p.tagline,
    description: p.description,
    region: p.region,
    village: p.village,
    address: p.address,
    geo_lat: p.geo_lat,
    geo_lng: p.geo_lng,
    whatsapp_number: p.whatsapp_number,
    phone: p.phone,
    email: p.email,
    hero_image: p.hero_image,
    gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images : [],
    amenities: Array.isArray(p.amenities) ? p.amenities : [],
    claimed_status: p.claimed_status,
    direct_booking_enabled: Boolean(p.direct_booking_enabled),
    property_public_path: p.property_public_path || null
  }));

  return json({
    source: 'live',
    catalog: sanitizedCatalog
  }, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  });
}
