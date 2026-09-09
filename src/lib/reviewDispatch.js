const BUSINESS_STORE = 'resortos-review-businesses';

export const PLACE_FINDER = 'https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder';
export const MAX_LOCATIONS = 10;

export function isPlaceFinderSample(input) {
  const s = String(input || '');
  return /gmp-place-autocomplete|placePrediction\.toPlace|Place Autocomplete widget/.test(s);
}

export function extractPlaceId(input) {
  const s = String(input || '').trim();
  if (!s || isPlaceFinderSample(s)) return '';
  if (/^ChIJ[A-Za-z0-9_-]+$/.test(s)) return s;
  const fromParam = s.match(/[?&]place[_-]?id=([^&]+)/i);
  if (fromParam) return decodeURIComponent(fromParam[1]);
  const fromQuery = s.match(/query_place_id=([^&]+)/i);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  const fromMaps = s.match(/place_id[=:]([^&\s]+)/i);
  if (fromMaps) return decodeURIComponent(fromMaps[1]);
  const chij = s.match(/(ChIJ[A-Za-z0-9_-]+)/);
  if (chij) return chij[1];
  return '';
}

export function extractGpageToken(input) {
  const match = String(input || '').match(/g\.page\/r\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : '';
}

export function reviewUrlFromPlaceId(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return '';
  return `https://search.google.com/local/writereview?placeid=${id}&hl=he`;
}

export function parseReviewTarget(input) {
  const s = String(input || '').trim();
  if (!s || isPlaceFinderSample(s)) return null;
  const gpage = extractGpageToken(s);
  if (gpage) {
    return { key: `gpage:${gpage}`, url: `https://g.page/r/${gpage}/review`, placeId: '' };
  }
  const placeId = extractPlaceId(s);
  if (placeId) {
    return { key: placeId, url: reviewUrlFromPlaceId(placeId), placeId };
  }
  return null;
}

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-z0-9-]/g, '')
    .slice(0, 24);
  return base || 'biz';
}

export function makeLocation({ label, placeId, reviewUrl, id }) {
  const pid = String(placeId || '').trim();
  return {
    id: id || `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: String(label || '').trim() || 'כתובת',
    placeId: pid,
    reviewUrl: reviewUrl || reviewUrlFromPlaceId(pid)
  };
}

export function businessLocations(business) {
  if (!business) return [];
  if (Array.isArray(business.locations) && business.locations.length) {
    return business.locations.filter((row) => row?.placeId).slice(0, MAX_LOCATIONS);
  }
  if (business.placeId) {
    return [makeLocation({
      id: `${business.id || 'biz'}-loc`,
      label: business.address || business.name,
      placeId: business.placeId,
      reviewUrl: business.reviewUrl
    })];
  }
  return [];
}

export function normalizeBusiness(input) {
  const name = String(input?.name || '').trim();
  if (!name) return null;
  const locations = businessLocations(input)
    .map((row) => makeLocation(row))
    .filter((row) => row.placeId)
    .slice(0, MAX_LOCATIONS);
  if (!locations.length) return null;
  const first = locations[0];
  return {
    id: String(input.id || `${slugify(name)}-${Date.now().toString(36)}`),
    name,
    locations,
    placeId: first.placeId,
    reviewUrl: first.reviewUrl
  };
}

export function normalizeBusinessList(list) {
  if (!Array.isArray(list)) return [];
  const rows = list.map(normalizeBusiness).filter(Boolean);
  if (rows.length <= 1) return rows;
  const locations = [];
  for (const biz of rows) {
    for (const loc of businessLocations(biz)) {
      if (locations.some((row) => row.placeId === loc.placeId)) continue;
      if (locations.length >= MAX_LOCATIONS) break;
      locations.push(loc);
    }
  }
  const merged = normalizeBusiness({ ...rows[0], locations });
  return merged ? [merged] : rows.slice(0, 1);
}

export function loadBusinesses() {
  try {
    const raw = JSON.parse(localStorage.getItem(BUSINESS_STORE) || '[]');
    return normalizeBusinessList(raw);
  } catch {
    return [];
  }
}

export function saveBusinesses(list) {
  const next = normalizeBusinessList(list);
  localStorage.setItem(BUSINESS_STORE, JSON.stringify(next));
  return next;
}

export function upsertBusiness(input) {
  const incoming = normalizeBusiness(input);
  if (!incoming) return null;
  return saveBusinesses([incoming])[0] || incoming;
}

export function encodeShareToken(business) {
  const payload = JSON.stringify({ n: business.name, p: business.placeId });
  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeShareToken(token) {
  try {
    const padded = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(padded)));
    const data = JSON.parse(json);
    const placeId = extractPlaceId(data.p || '');
    const name = String(data.n || '').trim();
    if (!name || !placeId) return null;
    return {
      id: `share-${placeId.slice(-8)}`,
      name,
      placeId,
      reviewUrl: reviewUrlFromPlaceId(placeId)
    };
  } catch {
    return null;
  }
}

export function businessSharePath(business) {
  return `#/b/${encodeShareToken(business)}`;
}

export function formatPhoneForWhatsApp(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('972')) return clean;
  if (clean.startsWith('0')) return '972' + clean.slice(1);
  if (clean.length === 9) return '972' + clean;
  return clean;
}

export function normalizeOwnerPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits[0] !== '0') digits = `0${digits}`;
  if (!/^0\d{8,9}$/.test(digits)) return '';
  return digits;
}

export function buildReviewMessage({ guestName, businessName, reviewUrl }) {
  const greeting = guestName.trim() ? `היי ${guestName.trim()}` : 'היי';
  if (!reviewUrl) {
    return `${greeting}, שמחנו מאוד לארח אתכם ב${businessName}! 🌿✨
נהניתם מהחוויה? נשמח לדירוג קצר בגוגל.`;
  }
  return `${greeting}, שמחנו מאוד לארח אתכם ב${businessName}! 🌿✨
נהניתם מהחוויה? נשמח מאוד אם תקדישו 20 שניות לפרגן לנו בדירוג קצר בגוגל:

${reviewUrl}

תודה רבה ונתראה שוב בקרוב! 🌄`;
}
