/**
 * Client API layer for MIALEES RESORT and multi-property booking engine.
 * Calls relative endpoints (/api/...) on Cloudflare Edge without exposing any DB credentials.
 * Implements strict zero-guessing on availability errors (503 -> WhatsApp banner).
 */

export async function fetchLiveAvailability({ unitId, propertyId, from, to }) {
  const params = new URLSearchParams();
  if (unitId) params.set('unit_id', unitId);
  if (propertyId) params.set('property_id', propertyId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  try {
    const res = await fetch(`/api/availability?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });

    if (res.status === 503) {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        isOffline: true,
        message: err.message || 'זמנית לא ניתן לאמת זמינות מול היומן. אנא פנו ישירות בוואטסאפ של המתחם.',
        blockedRanges: []
      };
    }

    if (!res.ok) {
      return { ok: false, isOffline: false, blockedRanges: [] };
    }

    const data = await res.json();
    return {
      ok: true,
      isOffline: false,
      blockedRanges: data.blockedRanges || []
    };
  } catch (err) {
    console.warn('[Availability API Fetch]', err?.message || err);
    return {
      ok: false,
      isOffline: true,
      message: 'לא התקבלה תגובה מיומן התפוסה. ניתן לבצע בדיקה וסגירה מיידית בוואטסאפ.',
      blockedRanges: []
    };
  }
}

export async function fetchLiveRestrictions(propertyId) {
  try {
    const res = await fetch(`/api/restrictions?property_id=${encodeURIComponent(propertyId || '')}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
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
    const res = await fetch('/api/bookings', {
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
    const res = await fetch(`/api/checkout/${encodeURIComponent(token)}/stay`, {
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

