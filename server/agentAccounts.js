import { hashAgentPin, pinPepper } from './edgeAgentPin.js';
import { scheduleGuestContextPush } from './guestContext.js';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function digitsPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function staffAgentEmail(staffId) {
  return `staff:${String(staffId || '').trim()}`;
}

export function publicAgent(row) {
  if (!row) return null;
  const email = String(row.email || '');
  const staffId = email.startsWith('staff:') ? email.slice(6) : '';
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    commission_rate: Number(row.commission_rate) || 0,
    is_active: row.is_active !== false,
    staff_id: staffId || null,
    kind: staffId ? 'staff' : 'sales'
  };
}

async function studio(path, { method = 'GET', body } = {}) {
  const key = serviceKey();
  if (!key) {
    const err = new Error('STUDIO_UNAVAILABLE');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const err = new Error((data && data.message) || `STUDIO_${response.status}`);
    err.status = response.status >= 500 ? 503 : response.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function loadAgents() {
  const rows = await studio('resort_agents?select=id,name,phone,email,commission_rate,is_active,updated_at&order=name.asc');
  return Array.isArray(rows) ? rows : [];
}

function findConflict(rows, phone, id) {
  const digits = digitsPhone(phone);
  return rows.find((row) => row.is_active !== false && digitsPhone(row.phone) === digits && row.id !== id) || null;
}

export async function upsertResortAgent({ id, name, phone, pin, commissionRate, staffId, isActive = true }) {
  const pepper = pinPepper();
  if (!pepper) {
    const err = new Error('AGENT_PIN_MISSING');
    err.status = 503;
    throw err;
  }
  const display = String(name || '').trim();
  const digits = digitsPhone(phone);
  const pin4 = String(pin || '').replace(/\D/g, '').slice(0, 4);
  if (!display || digits.length < 9) {
    const err = new Error('INVALID');
    err.status = 400;
    throw err;
  }
  const rows = await loadAgents();
  const email = staffId ? staffAgentEmail(staffId) : '';
  const existing = id
    ? rows.find((row) => row.id === id)
    : (email && rows.find((row) => row.email === email))
      || rows.find((row) => digitsPhone(row.phone) === digits);
  if (findConflict(rows, digits, existing?.id)) {
    const err = new Error('PHONE_TAKEN');
    err.status = 409;
    throw err;
  }
  if (!existing && pin4.length !== 4) {
    const err = new Error('WEAK_PIN');
    err.status = 400;
    throw err;
  }
  if (pin4 && pin4.length !== 4) {
    const err = new Error('WEAK_PIN');
    err.status = 400;
    throw err;
  }
  const payload = {
    name: display,
    phone: digits,
    email: email || existing?.email || null,
    commission_rate: commissionRate == null
      ? (existing ? Number(existing.commission_rate) || 0.1 : (staffId ? 0 : 0.1))
      : Number(commissionRate),
    is_active: isActive !== false
  };
  if (pin4) payload.pin_edge_hash = hashAgentPin(digits, pin4, pepper);
  let saved;
  if (existing?.id) {
    const patched = await studio(`resort_agents?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      body: payload
    });
    saved = Array.isArray(patched) ? patched[0] : patched;
  } else {
    const created = await studio('resort_agents', { method: 'POST', body: payload });
    saved = Array.isArray(created) ? created[0] : created;
  }
  scheduleGuestContextPush();
  return publicAgent(saved || { ...existing, ...payload });
}

export async function deactivateResortAgent(id) {
  const patched = await studio(`resort_agents?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { is_active: false }
  });
  scheduleGuestContextPush();
  return Array.isArray(patched) ? patched[0] : patched;
}
