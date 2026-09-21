import { sendMicropaySms } from './micropaySms.js';
import {
  farewellSms,
  checkoutReminderSms,
  shouldSkipCheckoutReminder,
  templateById
} from '../src/lib/guestComms.js';
import { unitFullName } from '../src/lib/units.js';

const BOOKING_TABLE = 'hotelos_bookings';
const COMMS_TABLE = 'guest_communications';

function studioBase() {
  return String(process.env.SUPABASE_URL || process.env.STUDIO_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function studioKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'postgres').trim();
}

async function rest(path, options = {}) {
  const url = `${studioBase()}/rest/v1/${path.replace(/^\//, '')}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: studioKey(),
      Authorization: `Bearer ${studioKey()}`,
      Prefer: options.prefer || 'return=representation',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || text || 'REST_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

function israelIsoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export async function listGuestComms(bookingId) {
  if (!bookingId) return [];
  const rows = await rest(
    `${COMMS_TABLE}?booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function insertGuestComm(row) {
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
  const rows = await rest(COMMS_TABLE, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function markBookingSelfDeparted(bookingId, at = new Date().toISOString()) {
  if (!bookingId) return null;
  const rows = await rest(`${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      booking_status: 'CHECKED_OUT',
      checkout_status: 'self_departed',
      checked_out_at: at,
      updated_at: at
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function sendAndLogGuestSms({
  booking,
  phone,
  message,
  metadata = {},
  channel = 'sms'
}) {
  const recipient = String(phone || booking?.guest_phone || '').trim();
  const content = String(message || '').trim();
  if (!booking?.id || !content) {
    const err = new Error('INVALID_GUEST_SMS');
    err.status = 400;
    throw err;
  }
  let status = 'sent';
  let sentAt = new Date().toISOString();
  let error = null;
  try {
    await sendMicropaySms({ phone: recipient, message: content });
  } catch (err) {
    status = 'failed';
    sentAt = null;
    error = err.message || String(err);
  }
  const row = await insertGuestComm({
    booking_id: booking.id,
    tenant_id: booking.tenant_id,
    channel,
    direction: 'outbound',
    recipient_phone: recipient,
    content,
    status,
    sent_at: sentAt,
    metadata: { ...metadata, error }
  });
  if (status === 'failed') {
    const fail = new Error(error || 'SMS_FAILED');
    fail.status = 502;
    fail.comm = row;
    throw fail;
  }
  return row;
}

export async function sendFarewellForBooking(booking) {
  const unitName = unitFullName(booking.unit_id, booking.unit_id);
  return sendAndLogGuestSms({
    booking,
    phone: booking.guest_phone,
    message: farewellSms({ unitName }),
    metadata: { kind: 'farewell', template: 'farewell' }
  });
}

/** Fire optional local router webhook (ADB streamer cleanup etc.). */
export async function fireCheckoutRouterWebhook(booking, env = process.env) {
  const url = String(env.CHECKOUT_ROUTER_WEBHOOK_URL || '').trim();
  if (!url) return { skipped: true };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.CHECKOUT_ROUTER_WEBHOOK_SECRET
          ? { 'x-resortos-checkout': String(env.CHECKOUT_ROUTER_WEBHOOK_SECRET) }
          : {})
      },
      body: JSON.stringify({
        event: 'guest_self_checkout',
        booking_id: booking.id,
        unit_id: booking.unit_id,
        checked_out_at: booking.checked_out_at || new Date().toISOString()
      }),
      signal: AbortSignal.timeout(8000)
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.warn('[checkout router webhook]', err.message || err);
    return { ok: false, error: err.message || String(err) };
  }
}

export async function runScheduledCheckoutReminders(now = new Date(), env = process.env) {
  if (String(env.CHECKOUT_REMINDER_SMS || '1') === '0') {
    return { sent: 0, skipped: true };
  }
  const today = israelIsoDate(now);
  const rows = await rest(
    `${BOOKING_TABLE}?deleted_at=is.null&check_out_date=eq.${today}`
    + `&booking_status=neq.CANCELED&booking_status=neq.CHECKED_OUT`
    + `&checkout_token=not.is.null`
    + `&select=id,tenant_id,unit_id,guest_name,guest_phone,check_out_date,booking_status,checkout_token,checkout_status,checked_out_at,wifi_presence_status,stay`
    + `&limit=80`
  );
  const list = Array.isArray(rows) ? rows : [];
  let sent = 0;
  const errors = [];
  for (const booking of list) {
    if (shouldSkipCheckoutReminder(booking, now)) continue;
    const already = await rest(
      `${COMMS_TABLE}?booking_id=eq.${encodeURIComponent(booking.id)}`
      + `&metadata->>kind=eq.checkout_reminder&select=id&limit=1`
    );
    if (Array.isArray(already) && already.length) continue;
    const unitName = unitFullName(booking.unit_id, booking.unit_id);
    const message = checkoutReminderSms({
      unitName,
      token: booking.checkout_token
    });
    try {
      await sendAndLogGuestSms({
        booking,
        phone: booking.guest_phone,
        message,
        metadata: { kind: 'checkout_reminder', template: 'checkout_reminder' }
      });
      sent += 1;
    } catch (err) {
      errors.push({ id: booking.id, error: err.message || String(err) });
    }
  }
  return { sent, candidates: list.length, errors };
}

export async function handleListGuestComms(req, res) {
  try {
    const bookingId = String(req.query.booking_id || req.params.bookingId || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'BOOKING_REQUIRED' });
    const rows = await listGuestComms(bookingId);
    return res.json({ rows });
  } catch (err) {
    console.error('[guest comms list]', err.message);
    return res.status(err.status || 500).json({ error: 'COMMS_LIST_FAILED' });
  }
}

export async function handleSendGuestComm(req, res) {
  try {
    const bookingId = String(req.body?.booking_id || '').trim();
    const templateId = String(req.body?.template_id || '').trim();
    let message = String(req.body?.message || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'BOOKING_REQUIRED' });
    const rows = await rest(
      `${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}&deleted_at=is.null&select=*&limit=1`
    );
    const booking = Array.isArray(rows) ? rows[0] : null;
    if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
    if (templateId && !message) {
      const tpl = templateById(templateId);
      if (!tpl) return res.status(400).json({ error: 'UNKNOWN_TEMPLATE' });
      message = tpl.build({
        unitName: unitFullName(booking.unit_id, booking.unit_id),
        gateCode: booking.stay?.gate_code || '',
        checkoutUrl: booking.checkout_token
          ? `https://resortos.app/stay/${booking.checkout_token}`
          : ''
      });
    }
    if (!message) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
    const row = await sendAndLogGuestSms({
      booking,
      phone: req.body?.phone || booking.guest_phone,
      message,
      channel: req.body?.channel || 'sms',
      metadata: {
        kind: req.body?.kind || templateId || 'manual',
        template: templateId || null,
        actor: req.staff?.username || req.staff?.name || 'staff'
      }
    });
    return res.json({ ok: true, row });
  } catch (err) {
    console.error('[guest comms send]', err.message);
    return res.status(err.status || 500).json({
      error: err.message || 'COMMS_SEND_FAILED',
      row: err.comm || null
    });
  }
}

export async function handleStayStatus(req, res) {
  try {
    const bookingId = String(req.query.booking_id || req.body?.booking_id || '').trim();
    const cabinId = String(req.query.cabin_id || req.body?.cabin_id || req.query.unit_id || '').trim();
    let booking = null;
    if (bookingId) {
      const rows = await rest(
        `${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}&deleted_at=is.null&select=*&limit=1`
      );
      booking = Array.isArray(rows) ? rows[0] : null;
    } else if (cabinId) {
      const today = israelIsoDate();
      const rows = await rest(
        `${BOOKING_TABLE}?unit_id=eq.${encodeURIComponent(cabinId)}&deleted_at=is.null`
        + `&check_in_date=lte.${today}&check_out_date=gte.${today}`
        + `&booking_status=neq.CANCELED&order=check_in_date.desc&limit=1`
      );
      booking = Array.isArray(rows) ? rows[0] : null;
    }
    if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
    const { guestPresenceBadge, resolveCheckoutStatus } = await import('../src/lib/guestComms.js');
    return res.json({
      booking_id: booking.id,
      unit_id: booking.unit_id,
      booking_status: booking.booking_status,
      checkout_status: resolveCheckoutStatus(booking),
      checked_out_at: booking.checked_out_at || booking.stay?.self_checked_out_at || null,
      wifi_presence_status: booking.wifi_presence_status || booking.stay?.wifi_presence_status || 'active',
      presence: guestPresenceBadge(booking)
    });
  } catch (err) {
    console.error('[stay status]', err.message);
    return res.status(err.status || 500).json({ error: 'STAY_STATUS_FAILED' });
  }
}

export async function handleSelfCheckoutSideEffects(booking) {
  const at = booking.checked_out_at || new Date().toISOString();
  try {
    await markBookingSelfDeparted(booking.id, at);
  } catch (err) {
    console.warn('[self checkout mark]', err.message);
  }
  try {
    await sendFarewellForBooking({ ...booking, checked_out_at: at });
  } catch (err) {
    console.warn('[farewell sms]', err.message);
  }
  await fireCheckoutRouterWebhook({ ...booking, checked_out_at: at });
}
