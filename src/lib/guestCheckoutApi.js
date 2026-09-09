function guestApiBase() {
  const fromEnv = import.meta.env.VITE_GUEST_API_URL;
  if (fromEnv && /^https?:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('pages.dev')) {
    return '';
  }
  return '';
}

function abortAfter(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function fetchGuestCheckout(token, unitId) {
  if (!token) return null;
  const q = unitId ? `?unit=${encodeURIComponent(unitId)}` : '';
  const response = await fetch(`${guestApiBase()}/api/checkout/${encodeURIComponent(token)}${q}`, {
    signal: abortAfter(12000)
  });
  if (response.status === 404) {
    const error = new Error('NOT_FOUND');
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (response.status === 410) {
    const error = new Error('EXPIRED');
    error.code = 'EXPIRED';
    throw error;
  }
  if (!response.ok) throw new Error('LOOKUP_FAILED');
  return response.json();
}

export async function startDemoCheckout(stage = 'form') {
  const response = await fetch(`${guestApiBase()}/api/checkout/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'DEMO_START_FAILED');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function confirmGuestCheckout(token, payload) {
  const response = await fetch(`${guestApiBase()}/api/checkout/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'CONFIRM_FAILED');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function startHostCardCharge(booking) {
  if (!booking?.checkout_token) {
    const error = new Error('MISSING_TOKEN');
    error.status = 400;
    throw error;
  }
  const response = await fetch('/api/guest/mailbox/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking),
    signal: abortAfter(20000)
  });
  const data = await response.json().catch(() => ({}));
  const payUrl = data?.payment?.pay_url || data?.payment?.iframe_url || '';
  if (!response.ok || !payUrl) {
    const error = new Error(data.message || data.error || 'CHARGE_START_FAILED');
    error.status = response.status;
    throw error;
  }
  return { payUrl, booking: data };
}

export async function stayAction(token, payload) {
  const response = await fetch(`${guestApiBase()}/api/checkout/${encodeURIComponent(token)}/stay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'STAY_ACTION_FAILED');
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return response.json();
}

const lastPublish = new Map();

export async function publishGuestMailbox(booking) {
  if (!booking?.checkout_token) return;
  const fingerprint = JSON.stringify({
    token: booking.checkout_token,
    status: booking.booking_status,
    name: booking.guest_name,
    email: booking.guest_email,
    phone: booking.guest_phone,
    unit: booking.unit_id,
    in: booking.check_in_date,
    out: booking.check_out_date,
    deposit: booking.deposit_agorot || 0,
    total: booking.total_price_agorot || 0,
    ready: booking.stay?.cabin_ready || false,
    ops: booking.stay?.operational_status || '',
    late: booking.stay?.late_until || null,
    outAt: booking.stay?.self_checked_out_at || null,
    folio: Array.isArray(booking.stay?.folio) ? booking.stay.folio.length : 0,
    adults: booking.adults_count,
    children: booking.children_count,
    cot: Boolean(booking.stay?.baby_cot_required)
  });
  if (lastPublish.get(booking.checkout_token) === fingerprint) return;
  const response = await fetch('/api/guest/mailbox/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking),
    signal: abortAfter(12000)
  });
  if (!response.ok) {
    const error = new Error('PUBLISH_FAILED');
    error.status = response.status;
    console.warn('[HOTELOS MAILBOX] publish failed', response.status);
    throw error;
  }
  lastPublish.set(booking.checkout_token, fingerprint);
}
