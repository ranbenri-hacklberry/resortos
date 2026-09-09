function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS'
    }
  });
}

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hashPassword(password, saltBytes) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 100000 },
    key,
    256
  );
  return bytesToB64(new Uint8Array(bits));
}

function nameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function publicUser(row) {
  let businesses = [];
  try {
    businesses = JSON.parse(row.businesses_json || '[]');
  } catch (_) {
    businesses = [];
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    businesses: normalizeBusinessList(businesses),
    termsVersion: row.terms_version || '',
    termsAcceptedAt: row.terms_accepted_at || ''
  };
}

function makeLocation(row) {
  const placeId = String(row?.placeId || '').trim();
  if (!placeId) return null;
  return {
    id: String(row.id || `loc_${Date.now()}`),
    label: String(row.label || row.address || '').trim() || 'כתובת',
    placeId,
    reviewUrl: String(row.reviewUrl || `https://search.google.com/local/writereview?placeid=${placeId}&hl=he`)
  };
}

function normalizeBusiness(row) {
  if (!row || !String(row.name || '').trim()) return null;
  let locations = Array.isArray(row.locations) ? row.locations.map(makeLocation).filter(Boolean) : [];
  if (!locations.length && row.placeId) {
    const loc = makeLocation({
      id: `${row.id || 'biz'}-loc`,
      label: row.address || row.name,
      placeId: row.placeId,
      reviewUrl: row.reviewUrl
    });
    if (loc) locations = [loc];
  }
  locations = locations.slice(0, 10);
  if (!locations.length) return null;
  return {
    id: String(row.id || `b_${Date.now()}`),
    name: String(row.name).trim(),
    locations,
    placeId: locations[0].placeId,
    reviewUrl: locations[0].reviewUrl
  };
}

function normalizeBusinessList(list) {
  if (!Array.isArray(list)) return [];
  const rows = list.map(normalizeBusiness).filter(Boolean);
  if (rows.length <= 1) return rows;
  const locations = [];
  for (const biz of rows) {
    for (const loc of biz.locations || []) {
      if (!loc?.placeId || locations.some((row) => row.placeId === loc.placeId)) continue;
      if (locations.length >= 10) break;
      locations.push(loc);
    }
  }
  const merged = normalizeBusiness({ ...rows[0], locations });
  return merged ? [merged] : rows.slice(0, 1);
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS review_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      password_salt TEXT,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      email TEXT,
      phone TEXT,
      businesses_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`)
  ]);
  for (const sql of [
    'ALTER TABLE review_users ADD COLUMN terms_version TEXT',
    'ALTER TABLE review_users ADD COLUMN terms_accepted_at TEXT',
    'ALTER TABLE review_users ADD COLUMN phone TEXT'
  ]) {
    try {
      await db.prepare(sql).run();
    } catch (_) {}
  }
}

async function createSession(db, userId) {
  const token = `rev_${crypto.randomUUID().replace(/-/g, '')}`;
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('INSERT INTO review_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run();
  return token;
}

async function userFromRequest(db, request) {
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const sess = await db.prepare('SELECT user_id, expires_at FROM review_sessions WHERE token = ?').bind(token).first();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) return null;
  return db.prepare('SELECT * FROM review_users WHERE id = ?').bind(sess.user_id).first();
}

function routeKey(pathname) {
  const parts = String(pathname || '').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.slice(2).join('/') || '';
}

const demoHits = new Map();

function allowDemoSearch(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const now = Date.now();
  const hits = (demoHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= 40) return false;
  hits.push(now);
  demoHits.set(ip, hits);
  return true;
}

const GEO_PLACE_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'archipelago',
  'colloquial_area',
  'continent',
  'country',
  'geocode',
  'intersection',
  'locality',
  'natural_feature',
  'neighborhood',
  'plus_code',
  'political',
  'postal_code',
  'postal_code_prefix',
  'postal_town',
  'route',
  'street_address',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'sublocality_level_3',
  'sublocality_level_4',
  'sublocality_level_5'
]);

function normalizePlaceId(raw) {
  return String(raw || '').replace(/^places\//, '').trim();
}

function isBusinessPlaceTypes(types) {
  const list = Array.isArray(types) ? types.map(String) : [];
  if (list.includes('establishment') || list.includes('point_of_interest')) return true;
  if (!list.length) return true;
  if (list.some((type) => GEO_PLACE_TYPES.has(type))) return false;
  return true;
}

const ISRAEL_LOCATION_BIAS = {
  rectangle: {
    low: { latitude: 29.45, longitude: 34.22 },
    high: { latitude: 33.35, longitude: 35.92 }
  }
};

function suggestionFromParts({ placeId, name, address }) {
  const id = normalizePlaceId(placeId);
  if (!id) return null;
  const label = String(name || '').trim() || 'עסק בגוגל מפות';
  return {
    placeId: id,
    name: label,
    address: String(address || '').trim(),
    label
  };
}

async function googleJson(env, url, body, fieldMask) {
  const key = env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return { error: 'MAPS_UNAVAILABLE', status: 503 };
  const google = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(body)
  });
  const data = await google.json().catch(() => ({}));
  if (!google.ok) {
    const message = String(data?.error?.message || '');
    if (/billing/i.test(message)) return { error: 'MAPS_BILLING', status: 503 };
    return { error: 'MAPS_UNAVAILABLE', status: 503 };
  }
  return { data };
}

function suggestionsFromAutocomplete(data) {
  return (Array.isArray(data?.suggestions) ? data.suggestions : [])
    .map((row) => {
      const pred = row?.placePrediction;
      if (!isBusinessPlaceTypes(pred?.types)) return null;
      return suggestionFromParts({
        placeId: pred?.placeId,
        name: pred?.structuredFormat?.mainText?.text || pred?.text?.text,
        address: pred?.structuredFormat?.secondaryText?.text
      });
    })
    .filter(Boolean);
}

function suggestionsFromTextSearch(data) {
  return (Array.isArray(data?.places) ? data.places : [])
    .map((place) => {
      if (!isBusinessPlaceTypes(place?.types)) return null;
      return suggestionFromParts({
        placeId: place?.id || place?.name,
        name: place?.displayName?.text,
        address: place?.formattedAddress
      });
    })
    .filter(Boolean);
}

function mergeSuggestions(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.placeId || seen.has(item.placeId)) continue;
      seen.add(item.placeId);
      out.push(item);
    }
  }
  return out;
}

const TEXT_FIELD_MASK = 'places.id,places.name,places.displayName,places.formattedAddress,places.types';

function textSearchBody(query, extra = {}) {
  return {
    textQuery: query,
    languageCode: 'he',
    regionCode: 'IL',
    pageSize: 8,
    ...extra
  };
}

async function googlePlaceSuggestions(env, input) {
  const query = String(input || '').trim().slice(0, 120);
  if (!query) return { suggestions: [] };

  const [auto, text] = await Promise.all([
    googleJson(
      env,
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        input: query,
        languageCode: 'he',
        includedRegionCodes: ['il'],
        regionCode: 'IL'
      },
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types'
    ),
    googleJson(
      env,
      'https://places.googleapis.com/v1/places:searchText',
      textSearchBody(query),
      TEXT_FIELD_MASK
    )
  ]);

  if (auto.error && text.error) return auto;
  let suggestions = mergeSuggestions(
    suggestionsFromAutocomplete(auto.error ? {} : auto.data),
    suggestionsFromTextSearch(text.error ? {} : text.data)
  );

  if (suggestions.length < 3) {
    const [lodging, food] = await Promise.all([
      googleJson(
        env,
        'https://places.googleapis.com/v1/places:searchText',
        textSearchBody(query, { includedType: 'lodging', locationBias: ISRAEL_LOCATION_BIAS }),
        TEXT_FIELD_MASK
      ),
      googleJson(
        env,
        'https://places.googleapis.com/v1/places:searchText',
        textSearchBody(query, { includedType: 'restaurant', locationBias: ISRAEL_LOCATION_BIAS }),
        TEXT_FIELD_MASK
      )
    ]);
    suggestions = mergeSuggestions(
      suggestions,
      suggestionsFromTextSearch(lodging.error ? {} : lodging.data),
      suggestionsFromTextSearch(food.error ? {} : food.data)
    );
  }

  return { suggestions: suggestions.slice(0, 8) };
}

async function googleGet(env, url, fieldMask) {
  const key = env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return { error: 'MAPS_UNAVAILABLE', status: 503 };
  const headers = { 'X-Goog-Api-Key': key };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  const google = await fetch(url, { headers });
  const data = await google.json().catch(() => ({}));
  if (!google.ok) {
    const message = String(data?.error?.message || '');
    if (/billing/i.test(message)) return { error: 'MAPS_BILLING', status: 503 };
    return { error: 'MAPS_UNAVAILABLE', status: 503 };
  }
  return { data };
}

function daysSince(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

function heDaysAgo(days) {
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return 'לפני כשבוע';
  if (days < 31) return `לפני ${Math.round(days / 7)} שבועות`;
  if (days < 60) return 'לפני כחודש';
  return `לפני ${Math.round(days / 30)} חודשים`;
}

function scoreLabel(score) {
  if (score >= 80) return 'טוב';
  if (score >= 60) return 'בינוני';
  if (score >= 40) return 'דורש שיפור';
  return 'חלש';
}

function parseRelativeReviewDays(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/hour|שעה|שעות|דק|minute|היום|today|just/.test(s)) return 0;
  if (/yesterday|אתמול/.test(s)) return 1;
  const num = Number((s.match(/(\d+)/) || [])[1] || 1);
  if (/day|ימ/.test(s)) return num;
  if (/week|שבוע/.test(s)) return num * 7;
  if (/month|חודש/.test(s)) return num * 30;
  if (/year|שנה|שנים/.test(s)) return num * 365;
  return null;
}

function buildPlaceAudit(place, photoUrl) {
  const name = String(place?.displayName?.text || '').trim() || 'עסק בגוגל מפות';
  const address = String(place?.formattedAddress || '').trim();
  const rating = Number(place?.rating) || 0;
  const reviewCount = Number(place?.userRatingCount) || 0;
  const photosReturned = Array.isArray(place?.photos);
  const photos = photosReturned ? place.photos : [];
  const photoCount = photos.length;
  const hasHours = Boolean(place?.regularOpeningHours?.weekdayDescriptions?.length || place?.regularOpeningHours?.periods?.length);
  const hasWebsite = Boolean(place?.websiteUri);
  const hasPhone = Boolean(place?.nationalPhoneNumber || place?.internationalPhoneNumber);
  const reviewsReturned = Array.isArray(place?.reviews);
  const reviews = reviewsReturned ? place.reviews : [];
  const newestIso = reviews.map((row) => row?.publishTime).filter(Boolean).sort().pop();
  let lastReviewDays = newestIso ? daysSince(newestIso) : null;
  if (lastReviewDays == null) {
    const relatives = reviews.map((row) => parseRelativeReviewDays(row?.relativePublishTimeDescription)).filter((n) => n != null);
    if (relatives.length) lastReviewDays = Math.min(...relatives);
  }
  const photosKnown = photosReturned;
  const recencyKnown = lastReviewDays != null;

  let recencyPts = 0;
  let recencyStatus = 'unknown';
  let recencyDetail = 'גוגל החזיר מספר ביקורות, אבל לא את תאריך הביקורת האחרונה. לא מסיקים מזה שהכרטיס לא פעיל.';
  if (reviewCount === 0) {
    recencyPts = 0;
    recencyStatus = 'fail';
    recencyDetail = 'אין ביקורות בכרטיס. בלי ביקורות שוטפות קשה לבלוט במפות.';
  } else if (recencyKnown) {
    if (lastReviewDays <= 14) {
      recencyPts = 16;
      recencyStatus = 'ok';
      recencyDetail = `הביקורת האחרונה נכתבה ${heDaysAgo(lastReviewDays)}. קצב טוב — שמרו על זה כל שבוע.`;
    } else if (lastReviewDays <= 45) {
      recencyPts = 10;
      recencyStatus = 'warn';
      recencyDetail = `הביקורת האחרונה נכתבה ${heDaysAgo(lastReviewDays)}. אלגוריתם המפות מתעדף עסקים עם ביקורות שוטפות.`;
    } else {
      recencyPts = 3;
      recencyStatus = 'fail';
      recencyDetail = `הביקורת האחרונה נכתבה ${heDaysAgo(lastReviewDays)}. בלי ביקורות חדשות הכרטיס נדחק אחורה.`;
    }
  }

  const ratingPts = !rating ? 0 : rating >= 4.6 ? 18 : rating >= 4.3 ? 14 : rating >= 4 ? 10 : rating >= 3.5 ? 6 : 3;
  const volumePts = reviewCount >= 50 ? 18 : reviewCount >= 25 ? 14 : reviewCount >= 10 ? 10 : reviewCount >= 1 ? 6 : 0;
  const hoursPts = hasHours ? 10 : 0;
  const webPts = hasWebsite ? 8 : 0;
  const phonePts = hasPhone ? 6 : 0;
  const photoPts = !photosKnown ? 0 : photoCount >= 8 ? 12 : photoCount >= 4 ? 8 : photoCount >= 1 ? 5 : 0;
  const linkPts = 0;
  const earned = linkPts + ratingPts + volumePts + (recencyKnown || reviewCount === 0 ? recencyPts : 0) + hoursPts + webPts + phonePts + (photosKnown ? photoPts : 0);
  const maxPts = 12 + 18 + 18 + (recencyKnown || reviewCount === 0 ? 16 : 0) + 10 + 8 + 6 + (photosKnown ? 12 : 0);
  const score = maxPts ? Math.min(100, Math.round((earned / maxPts) * 100)) : 0;

  const hoursWebStatus = hasHours && hasWebsite ? 'ok' : hasHours || hasWebsite ? 'warn' : 'fail';
  const hoursWebDetail = hasHours && hasWebsite
    ? 'שעות הפתיחה מוגדרות וקישור לאתר מחובר.'
    : hasHours
      ? 'שעות הפתיחה מוגדרות, אבל חסר קישור לאתר.'
      : hasWebsite
        ? 'יש אתר, אבל שעות הפתיחה חסרות בכרטיס.'
        : 'חסרות שעות פתיחה וגם קישור לאתר.';

  let photoStatus = 'unknown';
  let photoDetail = 'גוגל לא החזיר את גלריית התמונות בחיבור הנוכחי — לא מסיקים מזה שאין תמונות בכרטיס.';
  if (photosKnown) {
    photoStatus = photoCount >= 5 ? 'ok' : photoCount >= 1 ? 'warn' : 'fail';
    photoDetail = photoCount >= 5
      ? `מצאנו ${photoCount} תמונות בכרטיס. אפשר להמשיך לרענן.`
      : photoCount >= 1
        ? `רק ${photoCount} תמונות בכרטיס. כרטיסים עם יותר תמונות נראים אמינים יותר.`
        : 'אין תמונות בכרטיס. בלי תמונה ראשית קשה לבלוט במפות.';
  }

  const volumeStatus = reviewCount >= 25 ? 'ok' : reviewCount >= 8 ? 'warn' : 'fail';
  const volumeDetail = reviewCount >= 25
    ? `${reviewCount} ביקורות — בסיס טוב. השלב הבא הוא קצב שבועי.`
    : reviewCount >= 1
      ? `${reviewCount} ביקורות בלבד. כרטיסים עם עשרות ביקורות מנצחים בחיפוש המקומי.`
      : 'אין ביקורות בכרטיס. בלי דירוגים קשה להופיע גבוה במפות.';

  const checks = [
    {
      id: 'direct_link',
      title: 'קישור ישיר לדירוג',
      status: 'fail',
      detail: 'אין קישור שמקפיץ ללקוח ישר את חלונית 5 הכוכבים בגוגל. זה הפער ש-WhaStar סוגר בוואטסאפ וב-QR.'
    },
    {
      id: 'cadence',
      title: 'תדירות ביקורות',
      status: recencyStatus,
      detail: recencyDetail
    },
    {
      id: 'hours_web',
      title: 'שעות פעילות ואתר',
      status: hoursWebStatus,
      detail: hoursWebDetail
    },
    {
      id: 'photos',
      title: 'תמונות בכרטיס',
      status: photoStatus,
      detail: photoDetail
    },
    {
      id: 'volume',
      title: 'כמות ביקורות',
      status: volumeStatus,
      detail: volumeDetail
    }
  ];

  return {
    placeId: normalizePlaceId(place?.id || place?.name),
    name,
    address,
    photoUrl: photoUrl || '',
    rating,
    reviewCount,
    lastReviewLabel: lastReviewDays == null ? '' : heDaysAgo(lastReviewDays),
    score,
    scoreLabel: scoreLabel(score),
    checks
  };
}

async function googlePlaceAudit(env, placeId) {
  const id = normalizePlaceId(placeId);
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(id)) return { error: 'PLACE_INVALID', status: 400 };
  const details = await googleGet(
    env,
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=he&regionCode=IL`,
    'id,name,displayName,formattedAddress,rating,userRatingCount,photos,photos.name,photos.widthPx,regularOpeningHours,websiteUri,nationalPhoneNumber,internationalPhoneNumber,reviews,reviews.publishTime,reviews.relativePublishTimeDescription,googleMapsUri'
  );
  if (details.error) return details;
  const place = details.data || {};
  let photoUrl = '';
  const photoName = place?.photos?.[0]?.name;
  if (photoName) {
    const media = await googleGet(
      env,
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=900&skipHttpRedirect=true`
    );
    photoUrl = String(media.data?.photoUri || '');
  }
  return { audit: buildPlaceAudit(place, photoUrl) };
}

const TERMS_VERSION = '2026-08-15';

function acceptedCurrentTerms(body) {
  return body?.acceptedTerms === true && String(body.termsVersion || '') === TERMS_VERSION;
}

function normalizeOwnerPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits[0] !== '0') digits = `0${digits}`;
  if (!/^0\d{8,9}$/.test(digits)) return '';
  return digits;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (!env.REVIEWS_DB) return json({ error: 'REVIEWS_UNAVAILABLE' }, 503);

  await ensureSchema(env.REVIEWS_DB);
  const db = env.REVIEWS_DB;
  const path = routeKey(new URL(request.url).pathname);
  let body = {};
  if (request.method !== 'GET') {
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
  }

  if (path === 'config' && request.method === 'GET') {
    return json({
      googleClientId: env.GOOGLE_CLIENT_ID || '',
      mapsEnabled: Boolean(env.GOOGLE_MAPS_API_KEY),
      termsVersion: TERMS_VERSION
    });
  }

  if (path === 'places-demo' && request.method === 'POST') {
    if (!allowDemoSearch(request)) return json({ error: 'MAPS_UNAVAILABLE' }, 429);
    const input = String(body.input || '').trim();
    if (input.length < 2) return json({ suggestions: [] });
    const result = await googlePlaceSuggestions(env, input);
    if (result.error) return json({ error: result.error }, result.status);
    return json({ suggestions: result.suggestions.slice(0, 8) });
  }

  if (path === 'place-audit' && request.method === 'POST') {
    if (!allowDemoSearch(request)) return json({ error: 'MAPS_UNAVAILABLE' }, 429);
    const result = await googlePlaceAudit(env, body.placeId);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result.audit);
  }

  if (path === 'register' && request.method === 'POST') {
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const phone = normalizeOwnerPhone(body.phone);
    if (name.length < 2 || name.length > 60) return json({ error: 'NAME_INVALID' }, 400);
    if (password.length < 6) return json({ error: 'PASSWORD_SHORT' }, 400);
    if (!phone) return json({ error: 'PHONE_INVALID' }, 400);
    if (!acceptedCurrentTerms(body)) return json({ error: 'TERMS_REQUIRED' }, 400);
    const key = nameKey(name);
    const existing = await db.prepare('SELECT id FROM review_users WHERE name_key = ?').bind(key).first();
    if (existing) return json({ error: 'NAME_TAKEN' }, 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(password, salt);
    const id = `u_${crypto.randomUUID()}`;
    await db.prepare(
      'INSERT INTO review_users (id, name, name_key, password_salt, password_hash, phone, businesses_json, created_at, terms_version, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, key, bytesToB64(salt), hash, phone, '[]', new Date().toISOString(), TERMS_VERSION, new Date().toISOString()).run();
    const row = await db.prepare('SELECT * FROM review_users WHERE id = ?').bind(id).first();
    const token = await createSession(db, id);
    return json({ token, user: publicUser(row) });
  }

  if (path === 'login' && request.method === 'POST') {
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const row = await db.prepare('SELECT * FROM review_users WHERE name_key = ?').bind(nameKey(name)).first();
    if (!row || !row.password_hash || !row.password_salt) return json({ error: 'LOGIN_FAILED' }, 401);
    const hash = await hashPassword(password, b64ToBytes(row.password_salt));
    if (hash !== row.password_hash) return json({ error: 'LOGIN_FAILED' }, 401);
    const token = await createSession(db, row.id);
    return json({ token, user: publicUser(row) });
  }

  if (path === 'google' && request.method === 'POST') {
    const credential = String(body.credential || '');
    const clientId = env.GOOGLE_CLIENT_ID || '';
    if (!credential) return json({ error: 'GOOGLE_FAILED' }, 400);
    const verify = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const payload = await verify.json();
    if (!verify.ok || (clientId && payload.aud !== clientId) || !payload.sub) {
      return json({ error: 'GOOGLE_FAILED' }, 401);
    }
    let row = await db.prepare('SELECT * FROM review_users WHERE google_sub = ?').bind(payload.sub).first();
    if (!row && payload.email) {
      row = await db.prepare('SELECT * FROM review_users WHERE email = ?').bind(String(payload.email).toLowerCase()).first();
      if (row) {
        await db.prepare('UPDATE review_users SET google_sub = ? WHERE id = ?').bind(payload.sub, row.id).run();
        row = await db.prepare('SELECT * FROM review_users WHERE id = ?').bind(row.id).first();
      }
    }
    const requestedName = String(body.name || '').trim();
    const phone = normalizeOwnerPhone(body.phone);
    const hasTerms = acceptedCurrentTerms(body);
    const suggestedName = requestedName || String(row?.name || payload.name || payload.email || '').trim();
    const nameOk = suggestedName.length >= 2 && suggestedName.length <= 60;
    const profileReady = nameOk && Boolean(phone) && hasTerms;

    function profileNeeded(extra = {}) {
      return json({
        needsProfile: true,
        email: String(row?.email || payload.email || ''),
        suggestedName,
        missing: {
          name: !nameOk,
          phone: !phone && !row?.phone,
          terms: !hasTerms && !row?.terms_accepted_at,
          ...extra
        }
      });
    }

    if (row) {
      const complete = Boolean(row.phone) && Boolean(row.terms_accepted_at);
      if (complete && !requestedName && !phone && !hasTerms) {
        const token = await createSession(db, row.id);
        return json({ token, user: publicUser(row) });
      }
      if (!profileReady && !(complete && hasTerms && (phone || row.phone) && nameOk)) {
        return profileNeeded();
      }
      let nextName = row.name;
      let nextKey = row.name_key;
      if (requestedName && nameOk) {
        const newKey = nameKey(requestedName);
        const clash = await db.prepare('SELECT id FROM review_users WHERE name_key = ?').bind(newKey).first();
        if (clash && clash.id !== row.id) return json({ error: 'NAME_TAKEN' }, 409);
        nextName = requestedName;
        nextKey = newKey;
      }
      const nextPhone = phone || row.phone || '';
      if (!nextPhone) return profileNeeded({ phone: true });
      const now = new Date().toISOString();
      await db.prepare(
        'UPDATE review_users SET name = ?, name_key = ?, phone = ?, google_sub = ?, email = ?, terms_version = ?, terms_accepted_at = ? WHERE id = ?'
      ).bind(
        nextName,
        nextKey,
        nextPhone,
        payload.sub,
        payload.email || row.email || '',
        hasTerms ? TERMS_VERSION : (row.terms_version || TERMS_VERSION),
        hasTerms ? now : (row.terms_accepted_at || now),
        row.id
      ).run();
      row = await db.prepare('SELECT * FROM review_users WHERE id = ?').bind(row.id).first();
      const token = await createSession(db, row.id);
      return json({ token, user: publicUser(row) });
    }

    if (!profileReady) return profileNeeded();
    const key = nameKey(suggestedName);
    const clash = await db.prepare('SELECT id FROM review_users WHERE name_key = ?').bind(key).first();
    if (clash) return json({ error: 'NAME_TAKEN' }, 409);
    const id = `u_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO review_users (id, name, name_key, google_sub, email, phone, businesses_json, created_at, terms_version, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, suggestedName, key, payload.sub, payload.email || '', phone, '[]', now, TERMS_VERSION, now).run();
    row = await db.prepare('SELECT * FROM review_users WHERE id = ?').bind(id).first();
    const token = await createSession(db, id);
    return json({ token, user: publicUser(row) });
  }

  const user = await userFromRequest(db, request);
  if (!user) return json({ error: 'UNAUTHORIZED' }, 401);

  if (path === 'me' && request.method === 'GET') {
    return json({ user: publicUser(user) });
  }

  if (path === 'logout' && request.method === 'POST') {
    const header = request.headers.get('authorization') || '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (token) await db.prepare('DELETE FROM review_sessions WHERE token = ?').bind(token).run();
    return json({ ok: true });
  }

  if (path === 'places' && request.method === 'POST') {
    const input = String(body.input || '').trim();
    if (input.length < 2) return json({ suggestions: [] });
    const result = await googlePlaceSuggestions(env, input);
    if (result.error) return json({ error: result.error }, result.status);
    return json({ suggestions: result.suggestions });
  }

  if (path === 'businesses' && request.method === 'PUT') {
    const list = Array.isArray(body.businesses) ? body.businesses : [];
    const clean = normalizeBusinessList(list);
    await db.prepare('UPDATE review_users SET businesses_json = ? WHERE id = ?')
      .bind(JSON.stringify(clean), user.id)
      .run();
    return json({ user: { ...publicUser(user), businesses: clean } });
  }

  return json({ error: 'NOT_FOUND' }, 404);
}
