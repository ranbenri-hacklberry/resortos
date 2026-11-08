import { guestStayUrl } from '../../src/lib/guestStayUrl.js';
import { templateById } from '../../src/lib/guestComms.js';
import { toMicropayPhone, parseMicropayResponse } from '../../src/lib/micropaySms.js';
import { unitFullName } from '../../src/lib/units.js';
import { sendMicropaySms, signSessionToken, verifySessionToken } from '../api/dashboard/[[path]].js';

/** Studio PostgREST that desk.resortos.app publishes at /pg. Desk SMS rows live here. */
export const STUDIO_COMMS_POSTGREST = 'https://desk.resortos.app/pg';

/** Same publishable key the desk bundle already ships. Service role in env wins. */
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const COMMS_TABLE = 'guest_communications';
const BOOKING_TABLE = 'hotelos_bookings';
const AUTOMATION_TABLE = 'chat_automation_state';

export function commsDbConfig(env = {}) {
  const override = String(env.GUEST_COMMS_POSTGREST_URL || '').trim().replace(/\/$/, '');
  return {
    baseUrl: override || STUDIO_COMMS_POSTGREST,
    apiKey: String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || PUBLISHABLE_KEY).trim()
  };
}

export async function signDashboardSession(env, user) {
  return signSessionToken(env, user);
}

export async function verifyDashboardSession(env, token) {
  return verifySessionToken(env, token);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
    }
  });
}

function pathParts(params) {
  const raw = params?.path;
  if (Array.isArray(raw)) return raw.map((part) => String(part || '')).filter(Boolean);
  if (!raw) return [];
  return String(raw).split('/').filter(Boolean);
}

export function normalizeChatId(phoneOrJid) {
  if (!phoneOrJid) return '';
  const digits = String(phoneOrJid).replace(/@.*$/, '').replace(/\D/g, '');
  if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
  return digits || String(phoneOrJid).trim();
}

async function postgrest(env, path, options = {}) {
  const { baseUrl, apiKey } = commsDbConfig(env);
  const headers = {
    Accept: 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.prefer ? { Prefer: options.prefer } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${baseUrl}/rest/v1/${String(path || '').replace(/^\//, '')}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || 'COMMS_DB_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function db(env, path, options, deps) {
  if (deps.db) return deps.db(path, options);
  return postgrest(env, path, options);
}

function actorOf(session) {
  return session?.username || session?.display_name || 'dashboard';
}

async function listComms(env, bookingId, deps) {
  const rows = await db(
    env,
    `${COMMS_TABLE}?booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.asc`,
    {},
    deps
  );
  return Array.isArray(rows) ? rows : [];
}

async function insertComm(env, row, deps) {
  const payload = {
    booking_id: row.booking_id,
    tenant_id: row.tenant_id || null,
    channel: row.channel || 'sms',
    direction: row.direction || 'outbound',
    recipient_phone: row.recipient_phone || null,
    content: String(row.content || ''),
    status: row.status || 'scheduled',
    scheduled_at: row.scheduled_at || null,
    sent_at: row.sent_at || null,
    metadata: row.metadata || {}
  };
  const rows = await db(env, COMMS_TABLE, {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  }, deps);
  return Array.isArray(rows) ? rows[0] : rows;
}

async function loadBooking(env, bookingId, deps) {
  const rows = await db(
    env,
    // Full row: the mailbox publish rejects rows without dates (INVALID_BOOKING), which is what
    // broke "send guest link" from the mobile dashboard.
    `${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}&deleted_at=is.null&select=*&limit=1`,
    {},
    deps
  );
  return Array.isArray(rows) ? rows[0] : null;
}

function stayOf(booking) {
  return booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
}

async function defaultSendSms(env, phone, message) {
  const result = await sendMicropaySms(env, phone, message);
  const parsed = parseMicropayResponse(result?.raw);
  if (!result?.ok || parsed.ok === false) {
    const err = new Error(parsed.message || 'SMS_FAILED');
    err.status = 502;
    err.description = parsed.description || result?.raw || '';
    throw err;
  }
  return result;
}

async function defaultPublish(booking) {
  const { publishBookingToMailbox } = await import('../../server/checkoutMailbox.js');
  return publishBookingToMailbox(booking);
}

async function sendComm(request, env, session, deps) {
  const body = await request.json().catch(() => ({}));
  const bookingId = String(body.booking_id || '').trim();
  const templateId = String(body.template_id || '').trim();
  let message = String(body.message || '').trim();
  const channel = String(body.channel || 'sms');
  if (!bookingId) return json({ error: 'BOOKING_REQUIRED' }, 400);

  const booking = await loadBooking(env, bookingId, deps);
  const recipientPhone = body.phone || booking?.guest_phone || '';
  if (!booking && !recipientPhone) return json({ error: 'NOT_FOUND' }, 404);

  if (templateId && !message) {
    const tpl = templateById(templateId);
    if (!tpl) return json({ error: 'UNKNOWN_TEMPLATE' }, 400);
    message = tpl.build({
      unitName: unitFullName(booking?.unit_id, booking?.unit_id),
      gateCode: stayOf(booking).gate_code || '',
      checkoutUrl: booking?.checkout_token ? guestStayUrl(booking.checkout_token) : ''
    });
  }
  if (!message) return json({ error: 'MESSAGE_REQUIRED' }, 400);
  if (channel === 'whatsapp') return json({ error: 'WHATSAPP_DESK_ONLY' }, 501);

  const kind = body.kind || templateId || 'manual';
  const actor = actorOf(session);
  const isStayLink = kind === 'stay_link' || templateId === 'checkin' || templateId === 'stay_link';
  if (isStayLink && booking?.checkout_token) {
    try {
      await (deps.publish || defaultPublish)(booking);
    } catch (err) {
      const row = await insertComm(env, {
        booking_id: bookingId,
        tenant_id: booking?.tenant_id || null,
        channel: channel || 'sms',
        direction: 'outbound',
        recipient_phone: recipientPhone,
        content: message,
        status: 'failed',
        metadata: { kind, template: templateId || null, actor, error: `PUBLISH_FAILED: ${err.message || err}` }
      }, deps).catch(() => null);
      return json({ error: 'PUBLISH_FAILED', row }, err.status || 502);
    }
  }

  if (channel === 'phone') {
    const row = await insertComm(env, {
      booking_id: bookingId,
      tenant_id: booking?.tenant_id || null,
      channel: 'phone',
      direction: body.direction || 'outbound',
      recipient_phone: recipientPhone,
      content: message,
      status: body.status || 'logged',
      sent_at: new Date().toISOString(),
      metadata: { kind: body.kind || 'call', actor }
    }, deps);
    return json({ ok: true, row });
  }

  let status = 'sent';
  let sentAt = new Date().toISOString();
  let error = null;
  const localPhone = toMicropayPhone(recipientPhone);
  if (!localPhone) {
    status = 'failed';
    sentAt = null;
    error = 'SMS_PHONE_INVALID';
  } else {
    try {
      await (deps.sendSms || defaultSendSms)(env, localPhone, message);
    } catch (err) {
      status = 'failed';
      sentAt = null;
      error = err.description ? `${err.message}: ${err.description}` : (err.message || 'SMS_FAILED');
    }
  }

  const row = await insertComm(env, {
    booking_id: bookingId,
    tenant_id: booking?.tenant_id || null,
    channel: 'sms',
    direction: 'outbound',
    recipient_phone: recipientPhone,
    content: message,
    status,
    sent_at: sentAt,
    metadata: {
      kind,
      template: templateId || null,
      actor,
      error
    }
  }, deps);

  if (status === 'failed') return json({ error: error || 'SMS_FAILED', row }, 502);
  return json({ ok: true, row });
}

async function markRead(request, env, deps) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.message_ids) ? body.message_ids : [];
  const nowIso = new Date().toISOString();
  let marked = 0;
  for (const id of ids) {
    if (!id) continue;
    try {
      await db(env, `${COMMS_TABLE}?id=eq.${encodeURIComponent(id)}&read_at=is.null`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { read_at: nowIso }
      }, deps);
      marked += 1;
    } catch {
      // non-fatal
    }
  }
  return json({ ok: true, marked });
}

async function automationGet(url, env, deps) {
  const channelId = url.searchParams.get('channel_id') || url.searchParams.get('channel') || 'resortos';
  const phone = url.searchParams.get('phone') || '';
  const bookingId = url.searchParams.get('booking_id') || '';
  const chatId = normalizeChatId(phone);
  let query = `${AUTOMATION_TABLE}?channel_id=eq.${encodeURIComponent(channelId)}`;
  if (chatId) query += `&chat_id=eq.${encodeURIComponent(chatId)}`;
  else if (bookingId) query += `&booking_id=eq.${encodeURIComponent(bookingId)}`;
  else return json({ bot_disabled: false, channel_id: channelId });
  try {
    const rows = await db(env, `${query}&limit=1`, {}, deps);
    const row = Array.isArray(rows) ? rows[0] : null;
    return json({
      bot_disabled: Boolean(row?.bot_disabled),
      channel_id: row?.channel_id || channelId,
      chat_id: row?.chat_id || chatId,
      booking_id: row?.booking_id || bookingId || null
    });
  } catch {
    return json({ bot_disabled: false, channel_id: channelId, chat_id: chatId });
  }
}

async function automationSet(request, env, session, deps) {
  const body = await request.json().catch(() => ({}));
  const channelId = body.channel_id || 'resortos';
  const bookingId = body.booking_id || null;
  let chatId = normalizeChatId(body.phone);
  if (!chatId && bookingId) {
    const booking = await loadBooking(env, bookingId, deps).catch(() => null);
    chatId = normalizeChatId(booking?.guest_phone);
  }
  if (!chatId && !bookingId) return json({ error: 'chat_id or booking_id required' }, 400);
  const patch = {
    bot_disabled: Boolean(body.bot_disabled),
    reason: body.reason || 'manager_toggle',
    updated_by: actorOf(session),
    updated_at: new Date().toISOString()
  };
  if (chatId) {
    await db(env, `${AUTOMATION_TABLE}?on_conflict=channel_id,chat_id`, {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: {
        channel_id: channelId,
        chat_id: chatId,
        booking_id: bookingId,
        ...patch
      }
    }, deps);
  } else {
    await db(env, `${AUTOMATION_TABLE}?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    }, deps);
  }
  return json({
    ok: true,
    bot_disabled: patch.bot_disabled,
    channel_id: channelId,
    chat_id: chatId,
    booking_id: bookingId
  });
}

export async function handleGuestComms(context, deps = {}) {
  const { request, env = {}, params = {} } = context;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return json({ ok: true });

  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const session = await verifyDashboardSession(env, token);
  if (!session) return json({ error: 'UNAUTHORIZED' }, 401);

  const [head] = pathParts(params);
  const url = new URL(request.url);

  try {
    if (!head && method === 'GET') {
      const bookingId = String(url.searchParams.get('booking_id') || '').trim();
      if (!bookingId) return json({ error: 'BOOKING_REQUIRED' }, 400);
      const rows = await listComms(env, bookingId, deps);
      return json({ rows });
    }
    if (head === 'send' && method === 'POST') return sendComm(request, env, session, deps);
    if (head === 'mark-read' && method === 'POST') return markRead(request, env, deps);
    if (head === 'automation-state' && method === 'GET') return automationGet(url, env, deps);
    if (head === 'automation-state' && method === 'POST') return automationSet(request, env, session, deps);
    return json({ error: 'NOT_FOUND' }, 404);
  } catch (err) {
    return json({ error: err.message || 'COMMS_FAILED' }, err.status || 500);
  }
}
