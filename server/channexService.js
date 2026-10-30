import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

export function getChannexConfig() {
  loadEnvFile();
  return {
    apiKey: String(process.env.CHANNEX_API_KEY || '').trim(),
    env: String(process.env.CHANNEX_ENV || 'staging').trim(),
    baseUrl: String(process.env.CHANNEX_BASE_URL || 'https://staging.channex.io/api/v1').replace(/\/$/, ''),
    propertyId: String(process.env.CHANNEX_PROPERTY_ID || '63f69619-d362-4beb-b04c-d5940e7182df').trim(),
    groupId: String(process.env.CHANNEX_GROUP_ID || 'd0be3979-bb62-44a4-9005-20e418b76ba7').trim(),
    officeRoomTypeId: String(process.env.CHANNEX_OFFICE_ROOM_TYPE_ID || '6bb61a89-bd66-47ac-b961-3608b1e1b8ee').trim(),
    officeRatePlanId: String(process.env.CHANNEX_OFFICE_RATE_PLAN_ID || 'aebdeca7-cc46-4bd6-80f9-c54467fc3e7e').trim(),
    officeUnitId: String(process.env.CHANNEX_OFFICE_UNIT_ID || 'pilot-office').trim(),
    tenantId: String(process.env.HOTELOS_TENANT_ID || '22222222-2222-2222-2222-222222222222').trim(),
  };
}

export function isChannexConfigured() {
  const cfg = getChannexConfig();
  return Boolean(cfg.apiKey && cfg.propertyId);
}

function studioBase() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function studioKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

async function studioRest(pathAndQuery, options = {}) {
  const key = studioKey();
  const url = `${studioBase()}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'resolution=merge-duplicates,return=representation',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = new Error((data && data.message) || `STUDIO_${res.status}: ${String(text).slice(0, 160)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function channexRequest(endpoint, options = {}) {
  const cfg = getChannexConfig();
  if (!cfg.apiKey) {
    throw new Error('CHANNEX_API_KEY is not configured');
  }

  const url = `${cfg.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'user-api-key': cfg.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message || (data.errors && JSON.stringify(data.errors)))) || `HTTP_${res.status}`;
    const err = new Error(`Channex API error: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

let syncStatusCache = {
  configured: false,
  lastSyncAt: null,
  lastSuccess: false,
  lastError: null,
  pulledBookings: 0,
  pushedAvailabilityDays: 0,
};

export function getIsraelTodayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

export function shiftDateIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mapChannexBookingToRow(booking, cfg) {
  const attrs = booking.attributes || booking;
  const rawId = attrs.id || booking.id || attrs.booking_id;
  const canonicalId = `channex_${rawId}`;

  const room = Array.isArray(attrs.rooms) && attrs.rooms.length > 0 ? attrs.rooms[0] : null;
  const isCancelled = attrs.status === 'cancelled' || room?.is_cancelled === true;

  const customer = attrs.customer || {};
  const guestName = [customer.name, customer.surname].filter(Boolean).join(' ').trim() || 'אורח Channex';
  const guestEmail = customer.mail || null;
  const guestPhone = customer.phone || null;

  const checkIn = attrs.arrival_date || room?.checkin_date;
  const checkOut = attrs.departure_date || room?.checkout_date;

  const adults = Number(attrs.occupancy?.adults || room?.occupancy?.adults) || 2;
  const children = Number(attrs.occupancy?.children || room?.occupancy?.children) || 0;

  const amountStr = String(attrs.amount || room?.amount || '0');
  const totalPriceAgorot = Math.round(parseFloat(amountStr || '0') * 100);

  const otaSource = attrs.ota_name ? `channex:${attrs.ota_name}` : 'channex';

  return {
    id: canonicalId,
    tenant_id: cfg.tenantId,
    unit_id: cfg.officeUnitId,
    guest_name: guestName,
    guest_email: guestEmail,
    guest_phone: guestPhone,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults_count: adults,
    children_count: children,
    total_price_agorot: totalPriceAgorot,
    deposit_agorot: 0,
    booking_status: isCancelled ? 'CANCELED' : 'CONFIRMED',
    payment_status: isCancelled ? 'UNPAID' : (attrs.payment_type ? 'PAID' : 'UNPAID'),
    payment_mode: attrs.payment_type || 'CHANNEX',
    channel_source: otaSource,
    special_requests: attrs.notes || null,
    cancellation_reason: isCancelled ? (attrs.cancellation_reason || 'channex_cancellation') : null,
    updated_at: new Date().toISOString(),
  };
}

export async function pullChannexBookings() {
  const cfg = getChannexConfig();
  if (!isChannexConfigured()) {
    throw new Error('Channex is not configured');
  }

  const endpoint = `/bookings?filter[property_id]=${encodeURIComponent(cfg.propertyId)}`;
  const resp = await channexRequest(endpoint);
  const items = Array.isArray(resp?.data) ? resp.data : [];

  let upsertedCount = 0;
  const upserted = [];

  for (const item of items) {
    const attrs = item.attributes || item;
    // Check if relevant for the office room type or test property
    const rooms = attrs.rooms || [];
    const matchesRoom = rooms.some((r) => !r.room_type_id || r.room_type_id === cfg.officeRoomTypeId);
    if (!matchesRoom && rooms.length > 0) continue;

    const row = mapChannexBookingToRow(item, cfg);
    if (!row.check_in_date || !row.check_out_date) continue;

    const res = await studioRest('hotelos_bookings?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify(row),
    });

    upsertedCount++;
    upserted.push(row);
  }

  return {
    total: items.length,
    upsertedCount,
    bookings: upserted,
  };
}

export async function fetchOfficeBookingsForWindow(startDate, endDate) {
  const cfg = getChannexConfig();
  const params = new URLSearchParams({
    tenant_id: `eq.${cfg.tenantId}`,
    unit_id: `eq.${cfg.officeUnitId}`,
    deleted_at: 'is.null',
    booking_status: 'neq.CANCELED',
    check_out_date: `gte.${startDate}`,
    check_in_date: `lte.${endDate}`,
    select: 'id,unit_id,check_in_date,check_out_date,booking_status',
  });

  const rows = await studioRest(`hotelos_bookings?${params.toString().replace(/\+/g, '%20')}`);
  return Array.isArray(rows) ? rows : [];
}

export function buildAvailabilityRanges(startDate, daysCount, activeBookings) {
  const bookedDates = new Set();

  for (const b of activeBookings) {
    let curr = b.check_in_date;
    while (curr < b.check_out_date) {
      bookedDates.add(curr);
      curr = shiftDateIso(curr, 1);
    }
  }

  const daily = [];
  for (let i = 0; i < daysCount; i++) {
    const d = shiftDateIso(startDate, i);
    daily.push({
      date: d,
      availability: bookedDates.has(d) ? 0 : 1,
    });
  }

  // Group contiguous days with same availability
  const ranges = [];
  let currentRange = null;

  for (const item of daily) {
    if (!currentRange) {
      currentRange = {
        date_from: item.date,
        date_to: item.date,
        availability: item.availability,
      };
    } else if (currentRange.availability === item.availability) {
      currentRange.date_to = item.date;
    } else {
      ranges.push(currentRange);
      currentRange = {
        date_from: item.date,
        date_to: item.date,
        availability: item.availability,
      };
    }
  }
  if (currentRange) {
    ranges.push(currentRange);
  }

  return { daily, ranges };
}

export async function pushChannexAvailability(daysAhead = 45) {
  const cfg = getChannexConfig();
  if (!isChannexConfigured()) {
    throw new Error('Channex is not configured');
  }

  const todayIso = getIsraelTodayIso();
  const endDateIso = shiftDateIso(todayIso, daysAhead);

  const bookings = await fetchOfficeBookingsForWindow(todayIso, endDateIso);
  const { ranges } = buildAvailabilityRanges(todayIso, daysAhead, bookings);

  const values = ranges.map((r) => ({
    property_id: cfg.propertyId,
    room_type_id: cfg.officeRoomTypeId,
    date_from: r.date_from,
    date_to: r.date_to,
    availability: r.availability,
  }));

  const payload = { values };
  const resp = await channexRequest('/availability', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    ok: true,
    rangesCount: ranges.length,
    daysAhead,
    ranges,
    channexResponse: resp,
  };
}

export async function handleChannexWebhook(payload) {
  const cfg = getChannexConfig();
  console.log('[channex webhook] received:', JSON.stringify(payload).slice(0, 300));

  let bookingData = null;
  if (payload?.data?.attributes) {
    bookingData = payload.data;
  } else if (payload?.booking_id || payload?.id) {
    const id = payload.booking_id || payload.id;
    try {
      const resp = await channexRequest(`/bookings/${id}`);
      bookingData = resp?.data;
    } catch (err) {
      console.warn(`[channex webhook] could not fetch booking ${id}:`, err.message);
    }
  }

  if (bookingData) {
    const row = mapChannexBookingToRow(bookingData, cfg);
    await studioRest('hotelos_bookings?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify(row),
    });
    console.log(`[channex webhook] upserted booking ${row.id} status=${row.booking_status}`);

    // Trigger guest context and availability refresh
    try {
      const { scheduleGuestContextPush } = await import('./guestContext.js');
      scheduleGuestContextPush();
    } catch {}

    try {
      await pushChannexAvailability(45);
    } catch (e) {
      console.warn('[channex webhook] availability push error:', e.message);
    }
  }

  return { ok: true, handled: Boolean(bookingData) };
}

export async function syncChannexOffice() {
  const cfg = getChannexConfig();
  if (!isChannexConfigured()) {
    syncStatusCache = {
      ...syncStatusCache,
      configured: false,
      lastSyncAt: new Date().toISOString(),
      lastSuccess: false,
      lastError: 'CHANNEX_NOT_CONFIGURED',
    };
    return { ok: false, error: 'CHANNEX_NOT_CONFIGURED' };
  }

  try {
    const pullResult = await pullChannexBookings();
    const pushResult = await pushChannexAvailability(45);

    try {
      const { scheduleGuestContextPush } = await import('./guestContext.js');
      scheduleGuestContextPush();
    } catch {}

    syncStatusCache = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastSuccess: true,
      lastError: null,
      pulledBookings: pullResult.upsertedCount,
      pushedAvailabilityDays: 45,
    };

    return {
      ok: true,
      pull: pullResult,
      push: pushResult,
      timestamp: syncStatusCache.lastSyncAt,
    };
  } catch (err) {
    syncStatusCache = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastSuccess: false,
      lastError: err.message || String(err),
      pulledBookings: 0,
      pushedAvailabilityDays: 0,
    };
    throw err;
  }
}

export async function getChannexStatus() {
  const cfg = getChannexConfig();
  const configured = isChannexConfigured();

  let propertyTitle = 'ResortOS Sandbox';
  let roomTitle = 'Office Pilot - TEST ONLY';
  let rateTitle = 'Office Pilot Test Rate';
  let connectionHealthy = false;

  if (configured) {
    try {
      const prop = await channexRequest(`/properties/${cfg.propertyId}`);
      if (prop?.data?.attributes?.title) {
        propertyTitle = prop.data.attributes.title;
        connectionHealthy = true;
      }
    } catch {
      connectionHealthy = false;
    }
  }

  return {
    configured,
    connectionHealthy,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    propertyId: cfg.propertyId,
    propertyName: propertyTitle,
    roomTypeId: cfg.officeRoomTypeId,
    roomName: roomTitle,
    ratePlanId: cfg.officeRatePlanId,
    ratePlanName: rateTitle,
    unitId: cfg.officeUnitId,
    unitName: 'משרד (Office Pilot)',
    lastSyncAt: syncStatusCache.lastSyncAt,
    lastSuccess: syncStatusCache.lastSuccess,
    lastError: syncStatusCache.lastError,
    pulledBookings: syncStatusCache.pulledBookings,
    pushedAvailabilityDays: syncStatusCache.pushedAvailabilityDays,
  };
}
