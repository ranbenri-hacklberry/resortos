import { json, errorJson, fetchPostgrest } from '../_db.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  if (request.method !== 'GET') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  // Aggregate funnel metrics
  const res = await fetchPostgrest(
    '/properties?select=crm_status,is_public,first_touch_sent_at',
    { method: 'GET' },
    env
  );

  if (!res || !res.ok) {
    return json({
      source: 'fallback',
      kpis: {
        total: 0,
        lead_identified: 0,
        touched: 0,
        portal_free_active: 0,
        upsell_pitch_sent: 0,
        verified_subscriber: 0,
        opt_out: 0,
        conversion_touched_to_free: 0,
        conversion_free_to_upsell: 0,
        conversion_upsell_to_verified: 0
      }
    });
  }

  const properties = await res.json();
  const total = properties.length;
  let leadIdentified = 0;
  let touched = 0;
  let portalFreeActive = 0;
  let upsellPitchSent = 0;
  let verifiedSubscriber = 0;
  let optOut = 0;

  for (const p of properties) {
    if (p.crm_status === 'Lead_Identified') leadIdentified++;
    if (p.crm_status === 'Portal_Free_Active') portalFreeActive++;
    if (p.crm_status === 'Upsell_Pitch_Sent') upsellPitchSent++;
    if (p.crm_status === 'Verified_Subscriber') verifiedSubscriber++;
    if (p.crm_status === 'Opt_Out') optOut++;
    if (p.first_touch_sent_at) touched++;
  }

  const touchedBase = Math.max(touched, 1);
  const freeBase = Math.max(portalFreeActive, 1);
  const upsellBase = Math.max(upsellPitchSent, 1);

  return json({
    source: 'live',
    kpis: {
      total,
      lead_identified: leadIdentified,
      touched,
      portal_free_active: portalFreeActive,
      upsell_pitch_sent: upsellPitchSent,
      verified_subscriber: verifiedSubscriber,
      opt_out: optOut,
      conversion_touched_to_free: Math.round((portalFreeActive / touchedBase) * 100),
      conversion_free_to_upsell: Math.round((upsellPitchSent / freeBase) * 100),
      conversion_upsell_to_verified: Math.round((verifiedSubscriber / upsellBase) * 100)
    }
  });
}
