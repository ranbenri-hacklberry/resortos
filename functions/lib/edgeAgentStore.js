import { UNIT_DISPLAY_NAMES } from './unitNames.js';

function datesOverlap(aIn, aOut, bIn, bOut) {
  return Boolean(aIn && aOut && bIn && bOut && aIn < bOut && bIn < aOut);
}
import { loadCalendarReplica } from './calendarReplica.js';
import { hashAgentPin, isEdgePinHash, normalizeAgentPhone, pinPepper } from './edgeAgentCrypto.js';

const DEMO_PHONE = '0500000001';
const DEMO_PIN = '2468';
const DEMO_ID = '00000000-0000-0000-0000-0000000000a1';

export const EDGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS edge_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  commission_rate REAL DEFAULT 0.10,
  is_active INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_agents_phone ON edge_agents(phone);
CREATE TABLE IF NOT EXISTS edge_soft_locks (
  id TEXT PRIMARY KEY,
  cabin_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_soft_locks_lookup ON edge_soft_locks(cabin_id, start_date, end_date, expires_at);
`;

const GUEST_BOOKING_TABLE = `CREATE TABLE IF NOT EXISTS guest_bookings (
  token TEXT PRIMARY KEY,
  booking_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const INBOX_TABLE = `CREATE TABLE IF NOT EXISTS checkout_inbox (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
)`;

export async function ensureEdgeTables(env) {
  if (!env?.STAY_DB) return false;
  try {
    await env.STAY_DB.exec(EDGE_SCHEMA);
  } catch (_) {
    for (const stmt of EDGE_SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.STAY_DB.prepare(stmt).run();
    }
  }
  await env.STAY_DB.prepare(GUEST_BOOKING_TABLE).run();
  await env.STAY_DB.prepare(INBOX_TABLE).run();
  return true;
}

export async function seedDemoAgent(env) {
  const pepper = pinPepper(env);
  if (!env?.STAY_DB || !pepper) return;
  const existing = await env.STAY_DB.prepare(
    'SELECT id FROM edge_agents WHERE phone = ?1 OR id = ?2 LIMIT 1'
  ).bind(DEMO_PHONE, DEMO_ID).first();
  if (existing?.id) return;
  const pinHash = await hashAgentPin(DEMO_PHONE, DEMO_PIN, pepper);
  await env.STAY_DB.prepare(
    `INSERT INTO edge_agents (id, name, phone, pin_hash, commission_rate, is_active, updated_at)
     VALUES (?1, ?2, ?3, ?4, 0.10, 1, ?5)`
  ).bind(DEMO_ID, 'סוכן דמו', DEMO_PHONE, pinHash, Math.floor(Date.now() / 1000)).run();
}

export async function upsertEdgeAgents(env, agents) {
  if (!env?.STAY_DB || !Array.isArray(agents)) return 0;
  let n = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const row of agents) {
    const id = String(row.id || '').trim();
    const phone = normalizeAgentPhone(row.phone);
    const pinHash = String(row.pin_hash || row.pin_edge_hash || '');
    if (!id || phone.length < 9 || !isEdgePinHash(pinHash)) continue;
    await env.STAY_DB.prepare('DELETE FROM edge_agents WHERE phone = ?1 AND id != ?2').bind(phone, id).run();
    await env.STAY_DB.prepare(
      `INSERT INTO edge_agents (id, name, phone, pin_hash, commission_rate, is_active, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         pin_hash = excluded.pin_hash,
         commission_rate = excluded.commission_rate,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      String(row.name || 'סוכן'),
      phone,
      pinHash,
      Number(row.commission_rate) || 0.1,
      row.is_active === false || row.is_active === 0 ? 0 : 1,
      now
    ).run();
    n += 1;
  }
  return n;
}

export async function findEdgeAgent(env, phone, pin) {
  const digits = normalizeAgentPhone(phone);
  if (digits.length < 9) return null;
  const row = await env.STAY_DB.prepare(
    'SELECT * FROM edge_agents WHERE phone = ?1 AND is_active = 1 LIMIT 1'
  ).bind(digits).first();
  if (!row?.pin_hash) return null;
  const pepper = pinPepper(env);
  const hashed = await hashAgentPin(digits, pin, pepper);
  if (hashed !== row.pin_hash) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    commission_rate: Number(row.commission_rate) || 0.1
  };
}

export async function loadActiveLocks(env) {
  const now = Math.floor(Date.now() / 1000);
  await env.STAY_DB.prepare('DELETE FROM edge_soft_locks WHERE expires_at <= ?1').bind(now).run();
  const result = await env.STAY_DB.prepare(
    'SELECT id, cabin_id, start_date, end_date, agent_id, expires_at FROM edge_soft_locks WHERE expires_at > ?1'
  ).bind(now).all();
  return result?.results || [];
}

export async function listPublicLocks(env) {
  const locks = await loadActiveLocks(env);
  if (!locks.length) return [];
  const agents = await env.STAY_DB.prepare('SELECT id, name FROM edge_agents').all();
  const names = Object.fromEntries((agents?.results || []).map((row) => [row.id, row.name]));
  return locks.map((lock) => ({
    cabin_id: lock.cabin_id,
    start_date: lock.start_date,
    end_date: lock.end_date,
    expires_at: new Date(Number(lock.expires_at) * 1000).toISOString(),
    agent_name: names[lock.agent_id] || 'סוכן'
  }));
}

export function unitName(id) {
  return UNIT_DISPLAY_NAMES[id] || id;
}

export function agentHypInvoice({ agent, extras = {}, cabinIds = [], depositIls, startDate, endDate }) {
  const ids = [...new Set((cabinIds.length ? cabinIds : extras.cabin_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const parties = Array.isArray(extras.cabin_parties) ? extras.cabin_parties : [];
  const names = extras.cabin_names || ids.map(unitName).join(' · ');
  const dates = startDate && endDate ? `${startDate}–${endDate}` : '';
  const amount = Math.round(Number(depositIls || 0) * 100) / 100;
  const count = Math.max(1, ids.length || 1);
  const share = Math.round((amount / count) * 100) / 100;
  const bookerId = String(extras.booker_cabin_id || ids[0] || '');
  if (extras.pay_split === 'per_cabin' && amount > 0) {
    const party = parties.find((row) => row.cabin_id === bookerId);
    const bits = [party?.name || unitName(bookerId) || names, 'מקדמה להזמנה'];
    if (party) {
      bits.splice(1, 0, `${party.adults || 0} מבוגרים`);
      if (party.children) bits.push(`${party.children} ילדים`);
    }
    const products = [{ Description: bits.filter(Boolean).join(' · '), Quantity: 1, UnitCost: amount }];
    const info = [`סוכן ${agent?.name || ''}`.trim(), names, dates, 'מקדמה', 'תשלום לפי בקתה'].filter(Boolean).join(' · ');
    const heshDesc = `[0~${products[0].Description}~1~${Number(amount).toFixed(2)}]`;
    return { info, productName: names ? `${names} · מקדמה` : 'מקדמה', products, heshDesc };
  }
  const products = (ids.length ? ids : ['']).map((id, index) => {
    const party = parties.find((row) => row.cabin_id === id);
    const bits = [party?.name || unitName(id) || names];
    if (party) {
      bits.push(`${party.adults || 0} מבוגרים`);
      if (party.children) bits.push(`${party.children} ילדים`);
      if (party.crib) bits.push('מיטת תינוק');
    }
    bits.push('מקדמה');
    const unitCost = index === count - 1
      ? Math.round((amount - share * (count - 1)) * 100) / 100
      : share;
    return { Description: bits.filter(Boolean).join(' · '), Quantity: 1, UnitCost: unitCost };
  });
  const info = [`סוכן ${agent?.name || ''}`.trim(), names, dates, 'מקדמה'].filter(Boolean).join(' · ');
  const heshDesc = products.map((row, index) => `[${index}~${row.Description}~1~${Number(row.UnitCost).toFixed(2)}]`).join('');
  return { info, productName: names ? `${names} · מקדמה` : 'מקדמה', products, heshDesc };
}

export function replicaUnits(packed) {
  if (Array.isArray(packed?.units) && packed.units.length) {
    return packed.units.map((unit) => ({
      cabin_id: unit.cabin_id || unit.id,
      cabin_name: unit.cabin_name || unit.name || unitName(unit.cabin_id || unit.id),
      base_price: Number(unit.base_price != null ? unit.base_price : (Number(unit.base_price_agorot || 85000) / 100)),
      base_price_agorot: Number(unit.base_price_agorot) || Math.round(Number(unit.base_price || 850) * 100)
    })).filter((unit) => unit.cabin_id);
  }
  return Object.entries(UNIT_DISPLAY_NAMES).map(([cabin_id, cabin_name], index) => ({
    cabin_id,
    cabin_name,
    base_price: index < 4 ? 850 : 850,
    base_price_agorot: 85000
  }));
}

export function replicaBlocked(packed) {
  const list = [];
  const seen = new Set();
  const push = (cabinId, start, end) => {
    if (!cabinId || !start || !end) return;
    const key = `${cabinId}|${start}|${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ cabin_id: cabinId, start_date: start, end_date: end });
  };
  for (const row of packed?.blocked || []) {
    push(row.cabin_id || row.unitId || row.unit_id, row.start_date || row.checkIn || row.check_in_date, row.end_date || row.checkOut || row.check_out_date);
  }
  const byTail = packed?.byTail && typeof packed.byTail === 'object' ? packed.byTail : {};
  for (const rows of Object.values(byTail)) {
    for (const row of rows || []) {
      const status = String(row.booking_status || '').toUpperCase();
      if (status === 'CANCELED' || status === 'CANCELLED' || status === 'CHECKED_OUT') continue;
      push(row.unit_id, row.check_in_date, row.check_out_date);
    }
  }
  return list;
}

export async function sanitizedCalendar(env, from, to) {
  const packed = await loadCalendarReplica(env);
  const units = replicaUnits(packed);
  const blocked = replicaBlocked(packed);
  const locks = await loadActiveLocks(env);
  for (const lock of locks) {
    blocked.push({
      cabin_id: lock.cabin_id,
      start_date: lock.start_date,
      end_date: lock.end_date,
      locked: true
    });
  }
  const days = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (const unit of units) {
    for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
      const date = new Date(t).toISOString().slice(0, 10);
      const next = new Date(t + 86400000).toISOString().slice(0, 10);
      const taken = blocked.some((row) => row.cabin_id === unit.cabin_id && datesOverlap(date, next, row.start_date, row.end_date));
      days.push({
        cabin_id: unit.cabin_id,
        cabin_name: unit.cabin_name,
        date,
        is_available: !taken,
        daily_rate: unit.base_price
      });
    }
  }
  return {
    from,
    to,
    units,
    blocked: blocked.map((row) => ({ cabin_id: row.cabin_id, start_date: row.start_date, end_date: row.end_date })),
    days,
    syncedAt: packed?.syncedAt || null
  };
}

export function datesHeld(blocked, cabinId, start, end) {
  return (blocked || []).some((row) => row.cabin_id === cabinId && datesOverlap(start, end, row.start_date, row.end_date));
}

export async function createSoftLocks(env, { agent, cabinIds, startDate, endDate }) {
  const ids = [...new Set((cabinIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    const err = new Error('NO_CABINS');
    err.status = 400;
    throw err;
  }
  const locks = [];
  try {
    for (const cabinId of ids) {
      locks.push(await createSoftLock(env, { agent, cabinId, startDate, endDate }));
    }
  } catch (err) {
    for (const lock of locks) {
      await env.STAY_DB.prepare('DELETE FROM edge_soft_locks WHERE id = ?1').bind(lock.id).run().catch(() => {});
    }
    throw err;
  }
  return locks;
}

export async function createSoftLock(env, { agent, cabinId, startDate, endDate }) {
  const now = Math.floor(Date.now() / 1000);
  await env.STAY_DB.prepare('DELETE FROM edge_soft_locks WHERE expires_at <= ?1').bind(now).run();
  const calendar = await sanitizedCalendar(env, startDate, endDate);
  if (datesHeld(calendar.blocked, cabinId, startDate, endDate)) {
    const err = new Error('DATES_OVERLAP');
    err.status = 409;
    throw err;
  }
  const id = crypto.randomUUID();
  const expiresAt = now + 900;
  await env.STAY_DB.prepare(
    `INSERT INTO edge_soft_locks (id, cabin_id, start_date, end_date, agent_id, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(id, cabinId, startDate, endDate, agent.id, expiresAt).run();
  const again = await env.STAY_DB.prepare(
    `SELECT id FROM edge_soft_locks
     WHERE cabin_id = ?1 AND start_date < ?3 AND end_date > ?2 AND expires_at > ?4`
  ).bind(cabinId, startDate, endDate, now).all();
  const hits = again?.results || [];
  if (hits.length > 1) {
    await env.STAY_DB.prepare('DELETE FROM edge_soft_locks WHERE id = ?1').bind(id).run();
    const err = new Error('DATES_OVERLAP');
    err.status = 409;
    throw err;
  }
  return { id, cabin_id: cabinId, start_date: startDate, end_date: endDate, agent_id: agent.id, expires_at: expiresAt };
}

export function checkoutToken() {
  return `tok_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function writeAgentMailbox(env, token, row) {
  const now = new Date().toISOString();
  await env.STAY_DB.prepare(
    `INSERT INTO guest_bookings (token, booking_json, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(token) DO UPDATE SET booking_json = excluded.booking_json, updated_at = excluded.updated_at`
  ).bind(token, JSON.stringify(row), now).run();
  await env.STAY_DB.prepare(
    'INSERT OR IGNORE INTO checkout_inbox (token, created_at) VALUES (?1, ?2)'
  ).bind(token, now).run();
}

function cabinPartyList(extras) {
  const rows = Array.isArray(extras.cabin_parties) ? extras.cabin_parties : [];
  return rows.map((row) => ({
    cabin_id: String(row.cabin_id || ''),
    name: String(row.name || row.cabin_id || ''),
    adults: Math.max(1, Number(row.adults) || 2),
    children: Math.max(0, Number(row.children) || 0),
    crib: Boolean(row.crib),
    occupant_name: String(row.occupant_name || '').trim(),
    occupant_phone: String(row.occupant_phone || '').replace(/\D/g, '')
  })).filter((row) => row.cabin_id);
}

export function agentMailboxRow({ lock, agent, extras, token, bookingId, totalAgorot, depositAgorot }) {
  const totalIls = Math.round((Number(totalAgorot) || 0) / 100);
  const depositIls = Math.round((Number(depositAgorot) || 0) / 100);
  const parties = cabinPartyList(extras);
  const adults = parties.reduce((sum, row) => sum + row.adults, 0) || Number(extras.adults) || 2;
  const children = parties.reduce((sum, row) => sum + row.children, 0) || Number(extras.children) || 0;
  const babyCot = parties.some((row) => row.crib) || Boolean(extras.baby_cot_required);
  return {
    id: bookingId,
    tenant_id: '22222222-2222-2222-2222-222222222222',
    unit_id: lock.cabin_id,
    guest_name: extras.guest_name || '',
    guest_phone: extras.guest_phone || '',
    guest_email: extras.guest_email || '',
    check_in_date: lock.start_date,
    check_out_date: lock.end_date,
    adults_count: adults,
    children_count: children,
    baby_cot_required: babyCot,
    total_price_agorot: totalAgorot,
    deposit_agorot: depositAgorot,
    booking_status: 'PENDING',
    payment_status: 'UNPAID',
    payment_mode: 'CREDIT_DEPOSIT',
    channel_source: 'AGENT',
    checkout_token: token,
    agent_id: agent.id,
    locked_until: new Date(lock.expires_at * 1000).toISOString(),
    special_requests: extras.notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    type: 'agent_booking',
    total_price: totalIls,
    deposit_amount: depositIls,
    commission_rate: Number(agent.commission_rate) || 0.1,
    agent_name: agent.name,
    cabin_id: lock.cabin_id,
    cabin_ids: extras.cabin_ids || [lock.cabin_id],
    cabin_name: extras.cabin_names || unitName(lock.cabin_id),
    cabin_names: extras.cabin_names || unitName(lock.cabin_id),
    start_date: lock.start_date,
    end_date: lock.end_date,
    stay: {
      cabin_ready: false,
      folio: [],
      checkout_time: '11:00',
      type: 'agent_booking',
      agent_name: agent.name,
      agent_id: agent.id,
      cabin_ids: extras.cabin_ids || [lock.cabin_id],
      cabin_names: extras.cabin_names || unitName(lock.cabin_id),
      cabin_parties: parties,
      baby_cot_required: babyCot,
      pay_split: extras.pay_split === 'per_cabin' ? 'per_cabin' : 'together',
      booker_cabin_id: extras.booker_cabin_id || lock.cabin_id,
      cabin_quotes: Array.isArray(extras.cabin_quotes) ? extras.cabin_quotes : []
    }
  };
}
