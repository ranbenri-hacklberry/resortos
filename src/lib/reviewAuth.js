const SESSION_KEY = 'resortos-review-session';
export const REVIEWS_ORIGIN = 'https://whastar.link';

function isNativeShell() {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  return window.location.protocol === 'https:' && window.location.hostname === 'localhost';
}

function reviewsUrl(path) {
  return `${isNativeShell() ? REVIEWS_ORIGIN : ''}${path}`;
}

function authHeaders(token, jsonBody = false) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (jsonBody) headers['content-type'] = 'application/json';
  return headers;
}

export function readSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (raw?.token && raw?.user) return raw;
  } catch (_) {}
  return null;
}

export function writeSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function parseError(response) {
  try {
    const data = await response.json();
    return data.error || 'REQUEST_FAILED';
  } catch (_) {
    return 'REQUEST_FAILED';
  }
}

export async function fetchReviewConfig() {
  const response = await fetch(reviewsUrl('/api/reviews/config'));
  if (!response.ok) return { googleClientId: '', mapsEnabled: false };
  return response.json();
}

export async function searchReviewPlaces(query) {
  const session = readSession();
  const path = session?.token ? '/api/reviews/places' : '/api/reviews/places-demo';
  const response = await fetch(reviewsUrl(path), {
    method: 'POST',
    headers: authHeaders(session?.token, true),
    body: JSON.stringify({ input: String(query || '').trim() })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function searchReviewPlacesPublic(query) {
  const response = await fetch(reviewsUrl('/api/reviews/places-demo'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: String(query || '').trim() })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function fetchReviewPlaceAudit(placeId) {
  const response = await fetch(reviewsUrl('/api/reviews/place-audit'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ placeId: String(placeId || '').trim() })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function registerReviewUser(name, password, phone, terms) {
  const response = await fetch(reviewsUrl('/api/reviews/register'), {
    method: 'POST',
    headers: authHeaders('', true),
    body: JSON.stringify({
      name,
      password,
      phone,
      acceptedTerms: Boolean(terms?.acceptedTerms),
      termsVersion: terms?.termsVersion || ''
    })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return writeSession(await response.json());
}

export async function loginReviewUser(name, password) {
  const response = await fetch(reviewsUrl('/api/reviews/login'), {
    method: 'POST',
    headers: authHeaders('', true),
    body: JSON.stringify({ name, password })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return writeSession(await response.json());
}

export async function loginReviewGoogle(credential, extras = {}) {
  const response = await fetch(reviewsUrl('/api/reviews/google'), {
    method: 'POST',
    headers: authHeaders('', true),
    body: JSON.stringify({
      credential,
      name: extras.name || '',
      phone: extras.phone || '',
      acceptedTerms: Boolean(extras.acceptedTerms),
      termsVersion: extras.termsVersion || ''
    })
  });
  if (!response.ok) throw new Error(await parseError(response));
  const data = await response.json();
  if (data.needsProfile) return data;
  return writeSession(data);
}

export async function fetchReviewMe(token) {
  const response = await fetch(reviewsUrl('/api/reviews/me'), { headers: authHeaders(token) });
  if (response.status === 401) {
    writeSession(null);
    return null;
  }
  if (!response.ok) throw new Error(await parseError(response));
  const data = await response.json();
  const current = readSession();
  return writeSession({ token: current?.token || token, user: data.user });
}

export async function saveReviewBusinesses(token, businesses) {
  const response = await fetch(reviewsUrl('/api/reviews/businesses'), {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ businesses })
  });
  if (!response.ok) throw new Error(await parseError(response));
  const data = await response.json();
  const current = readSession();
  return writeSession({ token: current?.token || token, user: data.user });
}

export async function logoutReviewUser(token) {
  try {
    await fetch(reviewsUrl('/api/reviews/logout'), { method: 'POST', headers: authHeaders(token) });
  } catch (_) {}
  writeSession(null);
}

export const AUTH_ERRORS = {
  NAME_INVALID: 'שם קצר מדי או ארוך מדי.',
  PASSWORD_SHORT: 'הסיסמה חייבת להכיל לפחות 6 תווים.',
  NAME_TAKEN: 'השם הזה כבר תפוס. בחרו שם אחר או התחברו.',
  LOGIN_FAILED: 'שם או סיסמה שגויים.',
  GOOGLE_FAILED: 'הכניסה עם Google לא הצליחה. נסו שוב או הירשמו עם סיסמה.',
  UNAUTHORIZED: 'יש להתחבר מחדש.',
  REVIEWS_UNAVAILABLE: 'שרת ההרשמה לא זמין כרגע.',
  PHONE_INVALID: 'נא להזין מספר טלפון ישראלי תקין.',
  TERMS_REQUIRED: 'יש לאשר את הסכם השימוש כדי להמשיך.',
  MAPS_UNAVAILABLE: 'חיפוש גוגל מפות לא זמין כרגע. נסו שוב בעוד רגע.',
  MAPS_BILLING: 'חיפוש גוגל מפות דורש חשבון Google Cloud פעיל.'
};
