import { hasNextGuestToday } from './cabinAccess';
import { isFullyPaid } from './bookingPaid';
import { guidesFromContent, mergeGuestProfile } from './guestProfile';
import { propertyIdForUnit, seedProperty, seedUnitOverride } from './guestProfileSeed';
import { fieldRepPhone } from './fieldRep';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function overlayDocumentAccess(base, seeded, options = {}) {
  const next = { ...asObject(base) };
  const src = asObject(seeded);
  if (Object.prototype.hasOwnProperty.call(src, 'wifi')) next.wifi = src.wifi;
  else if (options.dropUnspecifiedWifi) delete next.wifi;
  if (src.lockbox) next.lockbox = src.lockbox;
  else delete next.lockbox;
  if (src.gate) next.gate = src.gate;
  return next;
}

export function guestBundleForUnit(unit, property) {
  const unitId = unit?.id || unit?.unit_id;
  const propertyId = property?.id || unit?.property_id || propertyIdForUnit(unitId);
  const seeded = seedProperty(propertyId) || { content: {}, access: {} };
  const override = seedUnitOverride(unitId);
  const merged = mergeGuestProfile(
    {
      content: { ...seeded.content, ...asObject(property?.content) },
      access: overlayDocumentAccess(
        { ...seeded.access, ...asObject(property?.access) },
        seeded.access
      )
    },
    {
      content: { ...asObject(override.content), ...asObject(unit?.content) },
      access: overlayDocumentAccess(
        { ...asObject(override.access), ...asObject(unit?.access) },
        override.access,
        { dropUnspecifiedWifi: true }
      )
    }
  );
  return merged;
}

export function buildStaySnapshot(booking, unit, bookings, property) {
  const inHouse = booking?.booking_status === 'CHECKED_IN' && isFullyPaid(booking);
  const ready = inHouse;
  const prev = booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
  const bundle = guestBundleForUnit({ ...unit, id: booking?.unit_id || unit?.id }, property);
  const networks = ready ? (bundle.access.wifi || []) : [];
  const gate = bundle.access.gate || null;
  return {
    cabin_ready: ready,
    operational_status: unit?.operational_status || 'DIRTY',
    door_pin: ready ? (bundle.access.lockbox || null) : null,
    gate_mode: gate?.mode || null,
    gate_code: ready ? (gate?.code || null) : null,
    gate_night_call: Boolean(gate?.nightCall),
    wifi_networks: networks,
    wifi_ssid: networks[0]?.ssid || null,
    wifi_password: networks[0]?.password || null,
    guides: guidesFromContent(bundle.content),
    nav: bundle.content.nav || null,
    arrival: bundle.content.arrival || null,
    has_next_guest_today: hasNextGuestToday(booking, bookings),
    folio: Array.isArray(prev.folio) ? prev.folio : [],
    checkout_time: prev.checkout_time || bundle.content.check_out || '11:00',
    late_until: prev.late_until || null,
    self_checked_out_at: prev.self_checked_out_at || null,
    feedback_stars: prev.feedback_stars || null,
    feedback_text: prev.feedback_text || null,
    feedback_google: prev.feedback_google ?? null,
    feedback_done: Boolean(prev.feedback_done),
    field_rep_phone: fieldRepPhone(booking?.unit_id || unit?.id),
    hyp_terminal: booking?.hyp_terminal || prev.hyp_terminal || prev.hyp_intent?.terminal || null,
    hyp_intent: prev.hyp_intent || null,
    hyp_deposit: prev.hyp_deposit || null,
    hyp: prev.hyp || null,
    hyp_card: prev.hyp_card || null,
    custom_nightly_rate_ils: prev.custom_nightly_rate_ils || null,
    balance_payment_preference: booking?.balance_payment_preference || prev.balance_payment_preference || null,
    payment_proof: prev.payment_proof || null
  };
}
