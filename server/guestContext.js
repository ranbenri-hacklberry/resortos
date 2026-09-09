import { createHmac } from 'crypto';
import { guestContextPayload, israelToday } from '../functions/lib/guestContext.js';
import { compactStayRow } from '../functions/lib/guestContextStore.js';
import { canOpenDesk, publicDeskStaff } from '../functions/lib/deskStaff.js';
import { normalizeGuestPhone } from '../functions/lib/guestPhone.js';
import { hashAgentPin, pinPepper } from './edgeAgentPin.js';

function shiftIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function apiKeyOk(req) {
  const expected = String(process.env.GROK_BOT_API_KEY || process.env.GUEST_CONTEXT_API_KEY || '').trim();
  const provided = String(req.get('x-api-key') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')).trim();
  return Boolean(expected) && expected === provided;
}

function studioBase() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function studioKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

async function studioGet(path) {
  const key = studioKey();
  const res = await fetch(`${studioBase()}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`STUDIO_${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function studioBookings(sinceDate) {
  const tenantId = process.env.HOTELOS_TENANT_ID || '22222222-2222-2222-2222-222222222222';
  const params = new URLSearchParams({
    tenant_id: `eq.${tenantId}`,
    deleted_at: 'is.null',
    check_out_date: `gte.${sinceDate}`,
    select: 'id,unit_id,guest_name,guest_phone,check_in_date,check_out_date,booking_status,payment_status,payment_mode,checkout_token,total_price_agorot,deposit_agorot,adults_count,children_count,special_requests,clearing_payments,updated_at',
    order: 'check_in_date.asc',
    limit: '2000'
  });
  const rows = await studioGet(`hotelos_bookings?${params.toString().replace(/\+/g, '%20')}`);
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, stay: row.stay && typeof row.stay === 'object' ? row.stay : {} }));
}

async function studioUnits() {
  try {
    const rows = await studioGet('resort_units?is_active=eq.true&select=id,name,base_price_agorot,sort_order,property_id&order=sort_order.asc');
    return (Array.isArray(rows) ? rows : []).map((unit) => ({
      cabin_id: unit.id,
      cabin_name: unit.name,
      base_price: Math.round((Number(unit.base_price_agorot) || 85000) / 100),
      base_price_agorot: Number(unit.base_price_agorot) || 85000,
      property_id: unit.property_id || null,
      sort_order: unit.sort_order
    }));
  } catch {
    return [];
  }
}

function deskPassHash(password) {
  const secret = String(process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
  return createHmac('sha256', secret || 'desk').update(String(password || '')).digest('hex');
}

async function studioDeskStaff() {
  try {
    const rows = await studioGet(
      'employees?is_active=eq.true&username=not.is.null&select=id,name,username,role,login_secret'
    );
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => canOpenDesk(row.role) && row.login_secret)
      .map((row) => publicDeskStaff(row, deskPassHash(row.login_secret)));
  } catch {
    return [];
  }
}

async function studioAgents() {
  const pepper = pinPepper();
  try {
    const rows = await studioGet(
      'resort_agents?is_active=eq.true&select=id,name,phone,pin_edge_hash,commission_rate'
    );
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const phone = String(row.phone || '').replace(/\D/g, '');
      let pinHash = String(row.pin_edge_hash || '');
      if (!pinHash.startsWith('sha256:') && phone === '0500000001' && pepper) {
        pinHash = hashAgentPin(phone, '2468', pepper);
      }
      return {
        id: String(row.id),
        name: row.name,
        phone,
        pin_hash: pinHash,
        commission_rate: Number(row.commission_rate) || 0.1,
        is_active: 1
      };
    }).filter((row) => row.pin_hash.startsWith('sha256:'));
  } catch {
    if (!pepper) return [];
    return [{
      id: '00000000-0000-0000-0000-0000000000a1',
      name: 'סוכן דמו',
      phone: '0500000001',
      pin_hash: hashAgentPin('0500000001', '2468', pepper),
      commission_rate: 0.1,
      is_active: 1
    }];
  }
}

export async function getGuestByPhone(req, res) {
  if (!apiKeyOk(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const raw = String(req.query.phone || req.query.sender || req.query.wa || req.query.wa_id || '');
  const parsed = normalizeGuestPhone(raw);
  if (!parsed.tail) return res.json({ found: false, phone: '', suggestions: [] });
  try {
    const rows = (await studioBookings(shiftIso(israelToday(), -2)))
      .filter((row) => normalizeGuestPhone(row.guest_phone).tail === parsed.tail);
    return res.json(guestContextPayload(rows, raw));
  } catch (err) {
    return res.status(err.status || 503).json({ error: 'CALENDAR_UNAVAILABLE', found: false, phone: parsed.e164 });
  }
}

export async function publishGuestContext() {
  const mailboxUrl = String(process.env.CHECKOUT_MAILBOX_URL || 'https://resortos.app').replace(/\/$/, '');
  const secret = String(process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
  if (!secret) throw new Error('CHECKOUT_MAILBOX_SECRET is not configured');
  const [rows, units, agents, deskStaff] = await Promise.all([
    studioBookings(shiftIso(israelToday(), -2)).then((list) => list.map(compactStayRow)),
    studioUnits(),
    studioAgents(),
    studioDeskStaff()
  ]);
  const res = await fetch(`${mailboxUrl}/api/guest-context-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hotelos-mailbox': secret
    },
    body: JSON.stringify({ rows, units, agents, deskStaff })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GUEST_CONTEXT_SYNC_${res.status}: ${body.slice(0, 180)}`);
  }
  return res.json();
}

let pushTimer = null;
let lastDirtyAt = '';

export function scheduleGuestContextPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    publishGuestContext().catch((err) => console.warn('[guest-context]', err.message));
  }, 250);
}

export async function pushGuestContextNow(req, res) {
  try {
    scheduleGuestContextPush();
    return res.json({ ok: true, queued: true });
  } catch (err) {
    return res.status(500).json({ error: 'PUSH_FAILED', message: String(err.message || err) });
  }
}

async function dirtyStamp() {
  try {
    const rows = await studioGet('hotelos_calendar_dirty?select=bumped_at&id=eq.1');
    return Array.isArray(rows) && rows[0]?.bumped_at ? String(rows[0].bumped_at) : '';
  } catch {
    return '';
  }
}

export function startGuestContextSync() {
  const heartbeat = () => {
    publishGuestContext().catch((err) => console.warn('[guest-context]', err.message));
  };
  heartbeat();
  const heart = setInterval(heartbeat, 60 * 1000);
  const watch = setInterval(async () => {
    const stamp = await dirtyStamp();
    if (stamp && stamp !== lastDirtyAt) {
      lastDirtyAt = stamp;
      scheduleGuestContextPush();
    }
  }, 2000);
  return { heart, watch };
}
