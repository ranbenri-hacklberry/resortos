import { json, errorJson, fetchPostgrest, getPostgrestConfig } from './_db.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400, 'BAD_REQUEST');
  }

  const {
    unit_id,
    check_in_date,
    check_out_date,
    guest_name,
    guest_phone,
    guest_email,
    adults_count = 2,
    children_count = 0,
    babies_count = 0,
    total_price_agorot = 0,
    deposit_agorot = 0,
    special_requests = '',
    is_buyout = false,
    property_id = null
  } = body;

  if (!unit_id || !check_in_date || !check_out_date || !guest_name || !guest_phone) {
    return errorJson('חסרים שדות חובה לביצוע הזמנה', 400, 'MISSING_FIELDS');
  }

  if (check_out_date <= check_in_date) {
    return errorJson('תאריך היציאה חייב להיות אחרי תאריך הכניסה', 400, 'INVALID_DATES');
  }

  const { tenantId } = getPostgrestConfig(env);

  // Format pax string precisely for staff Gantt and duty manager: pax:{adults}+{children}+{infants}
  const adultsNum = Number(adults_count) || 2;
  const childrenNum = Number(children_count) || 0;
  const babiesNum = Number(babies_count) || 0;
  const paxTag = `pax:${adultsNum}+${childrenNum}+${babiesNum}`;
  const formattedSpecialRequests = special_requests
    ? `${paxTag} | ${String(special_requests).trim()}`
    : paxTag;

  // Prepare RPC payload for atomic stored procedure
  const rpcPayload = {
    p_tenant_id: tenantId,
    p_unit_id: String(unit_id).trim(),
    p_guest_name: String(guest_name).trim(),
    p_guest_phone: String(guest_phone).trim(),
    p_guest_email: guest_email ? String(guest_email).trim() : null,
    p_check_in: check_in_date,
    p_check_out: check_out_date,
    p_adults: adultsNum,
    p_children: childrenNum,
    p_total_price_agorot: Number(total_price_agorot) || 0,
    p_deposit_agorot: Number(deposit_agorot) || 0,
    p_special_requests: formattedSpecialRequests,
    p_is_buyout: Boolean(is_buyout),
    p_property_id: property_id ? String(property_id).trim() : null
  };

  // Call atomic PostgreSQL RPC
  const res = await fetchPostgrest('/rpc/create_public_booking', {
    method: 'POST',
    body: JSON.stringify(rpcPayload)
  }, env);

  if (!res) {
    // Database is unreachable — NEVER false-positive accept an unrecorded stay!
    return errorJson(
      'זמנית לא ניתן להתחבר ליומן התפוסה לנעילת התאריכים. אנא השלימו את ההזמנה ישירות בוואטסאפ של המתחם.',
      503,
      'STUDIO_DB_UNAVAILABLE'
    );
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.message || '';

    if (message.includes('DATES_OVERLAP_CONFLICT') || message.includes('BUYOUT_UNIT_OCCUPIED')) {
      return errorJson(
        'התאריכים שנבחרו כבר נתפסו עבור יחידה זו. אנא בחרו תאריכים אחרים.',
        409,
        'DATES_OVERLAP_CONFLICT'
      );
    }

    return errorJson(
      `שגיאה ביצירת ההזמנה: ${message || 'שגיאת שרת פנימית'}`,
      res.status || 500,
      'BOOKING_CREATION_FAILED'
    );
  }

  const bookingResult = await res.json();

  return json({
    success: true,
    booking: bookingResult
  }, 201, {
    'Cache-Control': 'no-store'
  });
}
