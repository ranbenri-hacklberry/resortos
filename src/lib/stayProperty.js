import { PROPERTY_SEED, UNIT_PROPERTY as SEED_UNIT_PROPERTY } from './guestProfileSeed';

const DEFAULT_HOST_PHONE = '0548076123';

/**
 * Canonical place for a unit — from guest PROPERTY_SEED.nav (query / placeId / waze).
 * Falls back to Hebrew listing names so Waze/Maps never invent fake coordinates.
 */
function unitPlace(unitId) {
  const id = String(unitId || '');
  const propertyId = SEED_UNIT_PROPERTY[id];
  const nav = PROPERTY_SEED[propertyId]?.content?.nav || {};
  if (nav.query || nav.placeId || nav.waze) {
    return {
      query: String(nav.query || '').trim(),
      placeId: String(nav.placeId || '').trim(),
      waze: String(nav.waze || '').trim()
    };
  }

  // Safety fallback if seed row is missing
  if (id.startsWith('dome-')) {
    return { query: 'כיפת השמיים גבעת יואב', placeId: 'ChIJowoxPLsRHBURo64q7zHS1pk', waze: '' };
  }
  if (id === 'k826' || id === 'k827') {
    return { query: 'קאסה נובה נוב', placeId: '', waze: '' };
  }
  return { query: 'צימר בגבעה גבעת יואב', placeId: 'ChIJ19h0kHsRHBURwfbIlIF6slA', waze: '' };
}

export function hostPhone() {
  return DEFAULT_HOST_PHONE;
}

export function unitNav(unitId) {
  return unitPlace(unitId);
}

/** Prefer saved Waze deep-link when we have one; otherwise search the same listing query. */
export function wazeUrl(unitId) {
  const place = unitPlace(unitId);
  if (place.waze) return place.waze;
  if (!place.query) return '';
  return `https://waze.com/ul?q=${encodeURIComponent(place.query)}&navigate=yes`;
}

export function googleMapsUrl(unitId) {
  const place = unitPlace(unitId);
  if (!place.query && !place.placeId) return '';
  const params = new URLSearchParams({
    api: '1',
    destination: place.query || place.placeId,
    travelmode: 'driving'
  });
  if (place.placeId) params.set('destination_place_id', place.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleReviewUrl(unitId) {
  const { placeId, query } = unitPlace(unitId);
  if (!placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || '')}`;
  }
  return `https://search.google.com/local/writereview?placeid=${placeId}&hl=he`;
}

export function toDialPhone(raw) {
  return String(raw || '').replace(/[^0-9+*#]/g, '');
}

/** WhatsApp only makes sense for Israeli mobiles — landlines and *NNNN service lines get no chip. */
export function toWhatsAppPhone(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  const local = digits.startsWith('972') ? '0' + digits.slice(3) : digits;
  if (!/^05\d{8}$/.test(local)) return '';
  return '972' + local.slice(1);
}

export function guestHostWhatsAppHref(text = '') {
  const wa = toWhatsAppPhone(hostPhone());
  if (!wa) return '';
  const params = new URLSearchParams({ phone: wa, type: 'phone_number', app_absent: '0' });
  if (text) params.set('text', text);
  return `https://api.whatsapp.com/send/?${params.toString()}`;
}
