const DEFAULT_HOST_PHONE = '0548076123';

const HILL_PLACE = {
  placeId: 'ChIJ19h0kHsRHBURwfbIlIF6slA',
  query: 'צימר בגבעה גבעת יואב'
};

const DOME_PLACE = {
  placeId: 'ChIJowoxPLsRHBURo64q7zHS1pk',
  query: 'כיפת השמיים גבעת יואב'
};

const RAMOT_PLACES = {
  k671: 'בתי נורית מושב רמות',
  k673: 'בתי נורית מושב רמות',
  k674: 'בתי נורית מושב רמות',
  k675: 'בתי נורית מושב רמות',
  k676: 'בתי נורית מושב רמות',
  k677: 'בתי נורית מושב רמות',
  k678: 'בתי נורית מושב רמות',
  k679: 'בתי נורית מושב רמות',
  k808: "טאג' מאהל מושב רמות",
  k809: "טאג' מאהל מושב רמות",
  k810: "טאג' מאהל מושב רמות",
  k811: "טאג' מאהל מושב רמות",
  k680: 'מול הנוף ברמות',
  k681: 'מול הנוף ברמות',
  k682: 'מול הנוף ברמות',
  k683: 'מול הנוף ברמות',
  k684: 'מול הנוף ברמות',
  k685: 'נופים בלבן מושב רמות',
  k686: 'נופים בלבן מושב רמות',
  k687: 'בקתות טוסקנה מושב רמות',
  k688: 'בקתות טוסקנה מושב רמות',
  k689: 'בקתות טוסקנה מושב רמות',
  k690: 'החצר המוסיקלית מושב רמות',
  k691: 'החצר המוסיקלית מושב רמות',
  k692: 'החצר המוסיקלית מושב רמות',
  k693: 'בקתות מאיה מושב רמות',
  k694: 'בקתות מאיה מושב רמות',
  k695: 'בקתות מאיה מושב רמות',
  k618: 'סייסטה ברמות',
  k619: 'סייסטה ברמות',
  k620: 'סייסטה ברמות',
  k621: 'סייסטה ברמות',
  k622: 'סייסטה ברמות',
  k623: 'סייסטה ברמות'
};

const NOV_PLACES = {
  k826: 'קאסה נובה נוב',
  k827: 'קאסה נובה נוב'
};

function unitPlace(unitId) {
  const id = String(unitId || '');
  if (id.startsWith('dome-')) return DOME_PLACE;
  if (NOV_PLACES[id]) return { query: NOV_PLACES[id] };
  if (RAMOT_PLACES[id]) return { query: RAMOT_PLACES[id] };
  return HILL_PLACE;
}

export function hostPhone() {
  return DEFAULT_HOST_PHONE;
}

export function unitNav(unitId) {
  return unitPlace(unitId);
}

/** Waze has no Google Place ID; search the same listing so it does not pin to fake coordinates. */
export function wazeUrl(unitId) {
  const place = unitPlace(unitId);
  return `https://waze.com/ul?q=${encodeURIComponent(place.query)}&navigate=yes`;
}

export function googleMapsUrl(unitId) {
  const place = unitPlace(unitId);
  const params = new URLSearchParams({
    api: '1',
    destination: place.query,
    travelmode: 'driving'
  });
  if (place.placeId) params.set('destination_place_id', place.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleReviewUrl(unitId) {
  const { placeId } = unitPlace(unitId);
  if (!placeId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(unitPlace(unitId).query)}`;
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
