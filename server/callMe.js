import fs from 'node:fs';
import { appendRoomLog } from '../src/lib/roomLog.js';
import { ackGuestCall, fetchGuestCalls, isMailboxConfigured } from './checkoutMailbox.js';
import { sendMicropaySms } from './micropaySms.js';
import {
  OFFICE_IDS,
  OFFICE_WAIT_MS,
  applyWhatsAppReply,
  callerById,
  callerByPhone,
  closeText,
  guestMorningText,
  inBarakWindow,
  offerText,
  whatsAppPhone
} from './callDesk.js';

const FILE = process.env.CALL_ME_FILE || '/tmp/resortos-guest-calls.json';
const AGENT_URL = (process.env.RESORTOS_AGENT_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(rows) {
  fs.writeFileSync(FILE, JSON.stringify(rows));
}

let candlesMinutes = 18 * 60;
let candlesAt = 0;

async function refreshCandles() {
  if (Date.now() - candlesAt < 6 * 60 * 60 * 1000) return candlesMinutes;
  try {
    const response = await fetch('https://www.hebcal.com/shabbat?cfg=json&geonameid=294514&M=on', {
      signal: AbortSignal.timeout(4000)
    });
    const data = await response.json();
    const candles = (data.items || []).find((item) => item.category === 'candles');
    if (candles?.date) {
      const clock = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date(candles.date));
      const hour = Number(clock.find((part) => part.type === 'hour')?.value);
      const minute = Number(clock.find((part) => part.type === 'minute')?.value);
      if (Number.isFinite(hour) && Number.isFinite(minute)) candlesMinutes = hour * 60 + minute;
    }
  } catch {
    /* keep the last candle-lighting time */
  }
  candlesAt = Date.now();
  return candlesMinutes;
}

async function sendWhatsApp(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits || !text) return false;
  if (digits.startsWith('05')) digits = `972${digits.slice(1)}`;
  try {
    const response = await fetch(`${AGENT_URL}/api/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits, text }),
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) return true;
  } catch (err) {
    console.warn('[call-me whatsapp]', err.message);
  }
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  try {
    await sendMicropaySms({ phone: local, message: text });
    return true;
  } catch (err) {
    console.warn('[call-me sms]', err.message);
    return false;
  }
}

const RANI_PARALLEL_SMS_PHONE = '0506102416';

async function offerCaller(call, caller) {
  if ((caller.id === 'zuki' || caller.id === 'barak') && call.transferredTo !== caller.id) {
    // Tsuki and Barak are strictly on-demand: only receive a message when explicitly transferred
    return;
  }
  const sent = Array.isArray(call.offered) ? call.offered : [];
  if (sent.includes(caller.id)) return;
  const text = offerText(call, caller);
  const ok = await sendWhatsApp(whatsAppPhone(caller), text);
  let smsOk = false;
  if (caller.id === 'rani') {
    try {
      await sendMicropaySms({ phone: RANI_PARALLEL_SMS_PHONE, message: text });
      smsOk = true;
    } catch (err) {
      console.warn('[call-me parallel sms]', err.message);
    }
  }
  if (ok || smsOk) call.offered = sent.concat(caller.id);
}

async function closeCall(call, actor, text) {
  const at = new Date().toISOString();
  call.acked_at = call.acked_at || at;
  call.phase = 'closed';
  call.closed = text;
  try {
    await ackGuestCall(call.token);
  } catch (err) {
    console.warn('[call-me ack]', err.message);
  }
  if (!call.loggedAck) {
    try {
      await logRoom(call.unit_id, actor?.name || 'משרד', text, `callback:${call.token}`, at);
      call.loggedAck = true;
    } catch (err) {
      console.warn('[call-me ack log]', err.message);
    }
  }
}

async function openTask(call, actor, description) {
  const unit = String(call.unit_id || '').trim();
  if (!unit) return;
  try {
    await rest(`unit_operations?id=eq.${encodeURIComponent(unit)}`, {
      method: 'PATCH',
      body: {
        operational_status: 'MAINTENANCE_ALERT',
        operational_domain: 'MAINTENANCE',
        custom_reason: description,
        is_escalated: true,
        assigned_staff: actor?.name || '',
        updated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.warn('[call-me task]', err.message);
  }
}

async function rest(path, { method = 'GET', body } = {}) {
  const key = dbKey();
  if (!key) throw new Error('NO_DB');
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 180) || 'DB');
  return text ? JSON.parse(text) : null;
}

async function logRoom(unitId, actor, text, id, at = new Date().toISOString()) {
  const unit = String(unitId || '').trim();
  if (!unit) return;
  const rows = await rest(`unit_operations?id=eq.${encodeURIComponent(unit)}&select=id,sop_progress`);
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (!existing) return;
  const sop = appendRoomLog(existing.sop_progress, [{
    id,
    at,
    kind: 'call',
    actor: String(actor || '').slice(0, 40),
    text,
    quote: ''
  }]);
  await rest(`unit_operations?id=eq.${encodeURIComponent(unit)}`, {
    method: 'PATCH',
    body: { sop_progress: sop, updated_at: at }
  });
}

export function openGuestCalls() {
  return Object.values(readStore()).filter((row) => row && !row.acked_at);
}

export async function syncGuestCalls() {
  if (!isMailboxConfigured()) return openGuestCalls();
  const remote = await fetchGuestCalls();
  const local = readStore();
  for (const call of remote) {
    if (!call?.token) continue;
    const prev = local[call.token] || {};
    const next = { ...prev, ...call, acked_at: call.acked_at || prev.acked_at || '' };
    if (!next.loggedRequest) {
      try {
        await logRoom(next.unit_id, next.guest_name, 'ביקש שיתקשרו אליו', `callreq:${next.token}`, next.requested_at);
        next.loggedRequest = true;
      } catch (err) {
        console.warn('[call-me log]', err.message);
      }
    }
    if (!next.acked_at && !next.officePinged) {
      for (const id of OFFICE_IDS) {
        const caller = callerById(id);
        if (caller) await offerCaller(next, caller);
      }
      next.officePinged = true;
      next.phase = next.phase || 'offer';
    }
    if (next.acked_at && !next.loggedAck) {
      try {
        await logRoom(next.unit_id, next.ownerName || 'משרד', 'חזרו אל האורח', `callback:${next.token}`, next.acked_at);
        next.loggedAck = true;
      } catch (err) {
        console.warn('[call-me ack log]', err.message);
      }
    }
    local[next.token] = next;
  }
  writeStore(local);
  return openGuestCalls();
}

export async function confirmGuestCall(token) {
  const key = String(token || '');
  if (!/^[a-f0-9]{18}$/.test(key)) {
    const err = new Error('INVALID_TOKEN');
    err.status = 400;
    throw err;
  }
  await ackGuestCall(key);
  const local = readStore();
  const row = local[key] || { token: key };
  await closeCall(row, { name: 'משרד' }, 'השיחה נפתרה');
  local[key] = row;
  writeStore(local);
  return row;
}

export async function createLocalGuestCall({ bookingId, unitId, guestName, guestPhone, cabin } = {}) {
  const local = readStore();
  const now = new Date().toISOString();
  const existing = Object.values(local).find(
    (c) => c && !c.acked_at && c.booking_id && c.booking_id === bookingId && Date.now() - Date.parse(c.requested_at || 0) < 10 * 60 * 1000
  );
  if (existing) return existing;

  const token = Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const next = {
    token,
    booking_id: String(bookingId || ''),
    unit_id: String(unitId || ''),
    guest_name: String(guestName || ''),
    guest_phone: String(guestPhone || ''),
    cabin: String(cabin || '').slice(0, 80),
    requested_at: now,
    acked_at: '',
    phase: 'offer',
  };
  try {
    await logRoom(next.unit_id, next.guest_name, 'ביקש שיתקשרו אליו', `callreq:${next.token}`, next.requested_at);
    next.loggedRequest = true;
  } catch (err) {
    console.warn('[call-me log]', err.message);
  }
  for (const id of OFFICE_IDS) {
    const caller = callerById(id);
    if (caller) await offerCaller(next, caller);
  }
  next.officePinged = true;
  local[next.token] = next;
  writeStore(local);
  return next;
}

export async function transferGuestCall(token, toId) {
  const target = callerById(toId);
  const local = readStore();
  const row = local[String(token || '')];
  if (!target || !row || row.acked_at) {
    const err = new Error('CALL_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  row.offered = (row.offered || []).filter((id) => id !== target.id);
  row.phase = 'offer';
  row.ownerId = '';
  row.ownerName = '';
  row.transferredTo = target.id;
  row.transferredName = target.name;
  row.transferredAt = new Date().toISOString();
  await offerCaller(row, target);
  try {
    await logRoom(row.unit_id, 'משרד', `השיחה הועברה ל${target.name}`, `callto:${row.token}:${target.id}`);
  } catch (err) {
    console.warn('[call-me transfer]', err.message);
  }
  local[row.token] = row;
  writeStore(local);
  return row;
}

export async function replyFromWhatsApp(phone, text) {
  const caller = callerByPhone(phone);
  if (!caller) return { reply: '' };
  const local = readStore();
  const row = Object.values(local)
    .filter((call) => {
      if (!call || call.acked_at) return false;
      if (call.phase === 'taken' || call.phase === 'note' || call.phase === 'task') return call.ownerId === caller.id;
      return (call.offered || []).includes(caller.id);
    })
    .sort((a, b) => String(a.requested_at || '').localeCompare(String(b.requested_at || '')))[0];
  if (!row) return { reply: '' };
  const result = applyWhatsAppReply(row, phone, text);
  if (!result.reply) return { reply: '' };
  if (result.take) {
    row.phase = 'taken';
    row.ownerId = result.take.id;
    row.ownerName = result.take.name;
    try {
      await logRoom(row.unit_id, result.take.name, 'לקח את השיחה', `calltake:${row.token}:${result.take.id}`);
    } catch (err) {
      console.warn('[call-me take]', err.message);
    }
  }
  if (result.transferTo) {
    row.offered = (row.offered || []).filter((id) => id !== result.transferTo.id);
    row.phase = 'offer';
    row.ownerId = '';
    row.ownerName = '';
    row.transferredTo = result.transferTo.id;
    row.transferredName = result.transferTo.name;
    row.transferredAt = new Date().toISOString();
    await offerCaller(row, result.transferTo);
    try {
      await logRoom(row.unit_id, result.actor?.name || 'משרד', `השיחה הועברה ל${result.transferTo.name}`, `callto:${row.token}:${result.transferTo.id}`);
    } catch (err) {
      console.warn('[call-me transfer]', err.message);
    }
  }
  if (result.ask) {
    row.phase = result.ask;
  }
  if (result.close) {
    if (result.close === 'task') await openTask(row, result.actor, result.task);
    const label = result.close === 'note'
      ? `הערה מהשיחה: ${result.note}`
      : result.close === 'task'
        ? `נפתחה משימה: ${result.task}`
        : 'השיחה נפתרה';
    await closeCall(row, result.actor, label);
  }
  local[row.token] = row;
  writeStore(local);
  return { reply: result.reply || closeText() };
}

export function startGuestCallPoller() {
  if (!isMailboxConfigured()) {
    console.warn('[call-me] mailbox secret missing');
    return;
  }
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await syncGuestCalls();
    } catch (err) {
      console.warn('[call-me]', err.message);
    } finally {
      ticking = false;
    }
  };
  tick();
  setInterval(tick, 4000);
}
