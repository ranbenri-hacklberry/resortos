/**
 * Client API layer for MIALEES RESORT and multi-property booking engine.
 * Calls relative endpoints (/api/...) on Cloudflare Edge without exposing any DB credentials.
 * Implements strict zero-guessing on availability errors (503 -> WhatsApp banner).
 * Features 15-minute client cache (900,000 ms) with manual re-sync option.
 */

export const AVAILABILITY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const availabilityCache = new Map();

/**
 * Direct authoritative Cloudflare Edge origin with CORS enabled (Access-Control-Allow-Origin: *).
 * Used when relative proxy fails or on external deployments.
 */
const DIRECT_API_BASE = 'https://resortos.app';

async function smartFetch(urlPath, options = {}) {
  // 1. Try local/relative path first (benefits from same-origin proxy or Cloudflare Pages)
  try {
    const res = await fetch(urlPath, options);
    // If not a 502/504 Bad Gateway / Gateway Timeout (e.g. proxy failure)
    if (res.status !== 502 && res.status !== 504) {
      return res;
    }
    console.warn('[smartFetch] Relative fetch returned', res.status, '- attempting direct fallback to', DIRECT_API_BASE);
  } catch (err) {
    console.warn('[smartFetch] Relative fetch network error - attempting direct fallback to', DIRECT_API_BASE, err?.message || err);
  }

  // 2. Direct fallback to authoritative resortos.app origin (CORS enabled)
  const fullUrl = `${DIRECT_API_BASE}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
  return fetch(fullUrl, options);
}

export function clearAvailabilityCache(propertyId) {
  const normalizedPropertyId = propertyId === 'mialees' ? 'mialis' : propertyId;
  if (normalizedPropertyId) {
    for (const key of availabilityCache.keys()) {
      if (key.startsWith(`${normalizedPropertyId}:`)) {
        availabilityCache.delete(key);
      }
    }
  } else {
    availabilityCache.clear();
  }
}

export function getAvailabilityCacheInfo(propertyId, unitId) {
  const normalizedPropertyId = propertyId === 'mialees' ? 'mialis' : propertyId;
  const prefix = `${normalizedPropertyId || 'all'}:${unitId || 'all'}:`;
  for (const [k, entry] of availabilityCache.entries()) {
    if (k.startsWith(prefix)) {
      return {
        cached: true,
        lastSyncedAt: entry.timestamp,
        ageMs: Date.now() - entry.timestamp,
        expiresInMs: Math.max(0, AVAILABILITY_CACHE_TTL_MS - (Date.now() - entry.timestamp))
      };
    }
  }
  return { cached: false, lastSyncedAt: null, ageMs: null, expiresInMs: 0 };
}

export async function fetchLiveAvailability({ unitId, propertyId, from, to, forceRefresh = false }) {
  // Normalize property ID alias if needed (e.g. mialees -> mialis)
  const normalizedPropertyId = propertyId === 'mialees' ? 'mialis' : propertyId;
  const cacheKey = `${normalizedPropertyId || 'all'}:${unitId || 'all'}:${from || ''}:${to || ''}`;
  const now = Date.now();

  // If cached and fresh (< 15 mins) and not forceRefresh, return immediately
  if (!forceRefresh && availabilityCache.has(cacheKey)) {
    const entry = availabilityCache.get(cacheKey);
    if (now - entry.timestamp < AVAILABILITY_CACHE_TTL_MS) {
      return {
        ...entry.data,
        fromCache: true,
        lastSyncedAt: entry.timestamp
      };
    }
  }

  const params = new URLSearchParams();
  if (unitId) params.set('unit_id', unitId);
  if (normalizedPropertyId) params.set('property_id', normalizedPropertyId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  try {
    const res = await smartFetch(`/api/availability?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (res.status === 503) {
      const err = await res.json().catch(() => ({}));
      if (availabilityCache.has(cacheKey)) {
        const stale = availabilityCache.get(cacheKey);
        return {
          ...stale.data,
          fromCache: true,
          isStale: true,
          lastSyncedAt: stale.timestamp,
          warning: 'הוצגה תמונת יומן אחרונה (חיבור הרשת במתחם ממתין לחידוש)'
        };
      }
      return {
        ok: false,
        isOffline: true,
        message: err.message || 'זמנית לא ניתן לאמת זמינות מול היומן. אנא פנו ישירות בוואטסאפ של המתחם.',
        blockedRanges: [],
        lastSyncedAt: null
      };
    }

    if (!res.ok) {
      if (availabilityCache.has(cacheKey)) {
        const stale = availabilityCache.get(cacheKey);
        return {
          ...stale.data,
          fromCache: true,
          isStale: true,
          lastSyncedAt: stale.timestamp
        };
      }
      return {
        ok: false,
        isOffline: true,
        message: 'זמנית לא ניתן לאמת זמינות מול היומן. אנא פנו ישירות בוואטסאפ של המתחם לבדיקה מהירה.',
        blockedRanges: [],
        lastSyncedAt: null
      };
    }

    const data = await res.json();
    const result = {
      ok: true,
      isOffline: false,
      blockedRanges: data.blockedRanges || [],
      fromCache: false,
      lastSyncedAt: now
    };

    // Store in cache
    availabilityCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch (err) {
    console.warn('[Availability API Fetch]', err?.message || err);
    if (availabilityCache.has(cacheKey)) {
      const stale = availabilityCache.get(cacheKey);
      return {
        ...stale.data,
        fromCache: true,
        isStale: true,
        lastSyncedAt: stale.timestamp,
        warning: 'הוצגה תמונת יומן אחרונה'
      };
    }
    return {
      ok: false,
      isOffline: true,
      message: 'לא התקבלה תגובה מיומן התפוסה. ניתן לבצע בדיקה וסגירה מיידית בוואטסאפ.',
      blockedRanges: [],
      lastSyncedAt: null
    };
  }
}

export async function fetchLiveRestrictions(propertyId) {
  const normalizedPropertyId = propertyId === 'mialees' ? 'mialis' : propertyId;
  try {
    const res = await smartFetch(`/api/restrictions?property_id=${encodeURIComponent(normalizedPropertyId || '')}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.restrictions || [];
  } catch (err) {
    console.warn('[Restrictions API Fetch]', err?.message || err);
    return null;
  }
}

export async function createLiveBooking(bookingPayload) {
  try {
    const res = await smartFetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      return {
        success: false,
        conflict: true,
        message: data.message || 'התאריכים שנבחרו נתפסו זה עתה ע״י אורח אחר. אנא בחרו תאריכים חלופיים בלוח.'
      };
    }

    if (res.status === 503 || !res.ok) {
      return {
        success: false,
        offline: res.status === 503,
        message: data.message || 'זמנית לא ניתן היה לנעול את התאריכים ביומן. אנא פנו בוואטסאפ לסגירה מיידית.'
      };
    }

    return {
      success: true,
      booking: data.booking,
      payment: data.payment
    };
  } catch (err) {
    console.warn('[Create Booking API Fetch]', err?.message || err);
    return {
      success: false,
      offline: true,
      message: 'שגיאת תקשורת עם שרת ההזמנות. אנא פנו ישירות בוואטסאפ לסגירה מיידית.'
    };
  }
}

/**
 * Start Hyp deposit payment checkout for a booking token
 * Calls POST /api/checkout/:token/stay with action: 'guest_deposit'
 */
export async function startCheckoutPayment({ token, guestName, guestEmail }) {
  if (!token) return { success: false, message: 'חסר מזהה הזמנה' };

  try {
    const res = await smartFetch(`/api/checkout/${encodeURIComponent(token)}/stay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'guest_deposit',
        guest_name: guestName,
        guest_email: guestEmail,
        pay: true
      }),
      signal: AbortSignal.timeout(8000)
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.payment?.pay_url) {
      return {
        success: true,
        payUrl: data.payment.pay_url,
        stayUrl: `/stay/${encodeURIComponent(token)}`
      };
    }

    return {
      success: false,
      status: res.status,
      stayUrl: `/stay/${encodeURIComponent(token)}`,
      message: data.message || 'קישור הסליקה עדיין מתעדכן'
    };
  } catch (err) {
    console.warn('[Checkout Payment API Fetch]', err?.message || err);
    return {
      success: false,
      stayUrl: `/stay/${encodeURIComponent(token)}`,
      message: 'לא ניתן היה לפתוח את דף הסליקה כעת. קישור המעקב נשמר.'
    };
  }
}

