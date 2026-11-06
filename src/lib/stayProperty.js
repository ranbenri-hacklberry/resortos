import { PROPERTY_SEED, UNIT_PROPERTY as SEED_UNIT_PROPERTY, UNIT_OVERRIDES } from './guestProfileSeed';

const DEFAULT_HOST_PHONE = '0515262612';

/**
 * Per-unit GPS navigation overrides (exact Google Maps directions + Waze deep-links).
 */
export const UNIT_NAV_OVERRIDES = {
  // כיפת שמיים
  'dome-red': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8022197,35.6830016',
    waze: 'https://waze.com/ul?ll=32.8022197,35.6830016&navigate=yes'
  },
  'dome-green': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8021462,35.6828917',
    waze: 'https://waze.com/ul?ll=32.8021462,35.6828917&navigate=yes'
  },
  'dome-blue': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8023302,35.6831226',
    waze: 'https://waze.com/ul?ll=32.8023302,35.6831226&navigate=yes'
  },

  // מיאליס
  'suite-1': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7835566,35.6868208',
    waze: 'https://waze.com/ul?ll=32.7835566,35.6868208&navigate=yes'
  },
  'suite-2': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7836233,35.6868252',
    waze: 'https://waze.com/ul?ll=32.7836233,35.6868252&navigate=yes'
  },
  'mialis-villa': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7834989,35.6869576',
    waze: 'https://waze.com/ul?ll=32.7834989,35.6869576&navigate=yes'
  },

  // קאסה נובה (היום אין ניווט בכלל — עדיפות גבוהה)
  k826: {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8277487,35.7808935',
    waze: 'https://waze.com/ul?ll=32.8277487,35.7808935&navigate=yes'
  },
  k827: {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8277491,35.7809611',
    waze: 'https://waze.com/ul?ll=32.8277491,35.7809611&navigate=yes'
  },

  // צימר בגבעה
  'hill-1': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8011237,35.6845369',
    waze: 'https://waze.com/ul?ll=32.8011237,35.6845369&navigate=yes'
  },
  'hill-2': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8012232,35.6846325',
    waze: 'https://waze.com/ul?ll=32.8012232,35.6846325&navigate=yes'
  },
  'hill-3': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8013035,35.6845212',
    waze: 'https://waze.com/ul?ll=32.8013035,35.6845212&navigate=yes'
  },
  'hill-4': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8011534,35.6844202',
    waze: 'https://waze.com/ul?ll=32.8011534,35.6844202&navigate=yes'
  }
};

/**
 * Canonical place for a unit — from unit override or guest PROPERTY_SEED.nav (maps / waze / query / placeId).
 * Falls back to Hebrew listing names so Waze/Maps never invent fake coordinates.
 */
function unitPlace(unitId) {
  const id = String(unitId || '');
  const propertyId = SEED_UNIT_PROPERTY[id];
  const propNav = PROPERTY_SEED[propertyId]?.content?.nav || {};
  const overrideNav = UNIT_NAV_OVERRIDES[id] || UNIT_OVERRIDES[id]?.content?.nav || {};

  const maps = String(overrideNav.maps || propNav.maps || '').trim();
  const waze = String(overrideNav.waze || propNav.waze || '').trim();
  const query = String(overrideNav.query || propNav.query || '').trim();
  const placeId = String(overrideNav.placeId || propNav.placeId || '').trim();

  if (propNav.unavailable && !maps && !waze && !query && !placeId) {
    return { query: '', placeId: '', waze: '', maps: '', unavailable: true };
  }
  if (maps || waze || query || placeId) {
    return {
      query,
      placeId,
      waze,
      maps,
      unavailable: false
    };
  }

  // Safety fallback if seed row is missing
  if (id.startsWith('dome-')) {
    return { query: 'כיפת השמיים גבעת יואב', placeId: 'ChIJowoxPLsRHBURo64q7zHS1pk', waze: '', maps: '' };
  }
  if (id === 'k826' || id === 'k827') {
    return { query: 'קאסה נובה מושב נוב', placeId: '', waze: '', maps: '' };
  }
  return { query: 'צימר בגבעה גבעת יואב', placeId: 'ChIJ19h0kHsRHBURwfbIlIF6slA', waze: '', maps: '' };
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
  if (place.unavailable) return null;
  if (place.waze) return place.waze;
  if (!place.query) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(place.query)}&navigate=yes`;
}

export function googleMapsUrl(unitId) {
  const place = unitPlace(unitId);
  if (place.unavailable) return null;
  if (place.maps) return place.maps;
  if (!place.query && !place.placeId) return null;
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
