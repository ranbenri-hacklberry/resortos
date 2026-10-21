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
const AUTOMATION_TABLE = 'chat_automation_state';
const AGENT_BASE = process.env.RESORTOS_AGENT_URL || 'http://127.0.0.1:8787';

function studioBase() {
  return String(process.env.SUPABASE_URL || process.env.STUDIO_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function studioKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'postgres').trim();
}

export async function studioRest(path, options = {}) { return rest(path, options); }

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

export function normalizeChatId(phoneOrJid) {
  if (!phoneOrJid) return '';
  const digits = String(phoneOrJid).replace(/@.*$/, '').replace(/\D/g, '');
  if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
  return digits || String(phoneOrJid).trim();
}

export async function getChatAutomationState({ channelId = 'resortos', phone, bookingId }) {
  const chatId = normalizeChatId(phone);
  try {
    let query = `${AUTOMATION_TABLE}?channel_id=eq.${encodeURIComponent(channelId)}`;
    if (chatId) {
      query += `&chat_id=eq.${encodeURIComponent(chatId)}`;
    } else if (bookingId) {
      query += `&booking_id=eq.${encodeURIComponent(bookingId)}`;
    } else {
      return { bot_disabled: false, channel_id: channelId };
    }
    const rows = await rest(`${query}&limit=1`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      bot_disabled: Boolean(row?.bot_disabled),
      channel_id: row?.channel_id || channelId,
      chat_id: row?.chat_id || chatId,
      booking_id: row?.booking_id || bookingId || null,
      updated_by: row?.updated_by || null,
      updated_at: row?.updated_at || null,
      reason: row?.reason || null,
    };
  } catch (err) {
    console.warn('[getChatAutomationState]', err.message);
    return { bot_disabled: false, channel_id: channelId, chat_id: chatId };
  }
}

export async function setChatAutomationState({
  channelId = 'resortos',
  phone,
  bookingId,
  botDisabled,
  reason = 'manual_reply',
  updatedBy = 'staff',
}) {
  let chatId = normalizeChatId(phone);
  if (!chatId && bookingId) {
    try {
      const rows = await rest(`${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}&select=guest_phone&limit=1`);
      if (Array.isArray(rows) && rows[0]?.guest_phone) {
        chatId = normalizeChatId(rows[0].guest_phone);
      }
    } catch {
      // non-fatal
    }
  }
  if (!chatId && !bookingId) return { ok: false, error: 'chat_id or booking_id required' };

  try {
    if (chatId) {
      await rest(`${AUTOMATION_TABLE}?on_conflict=channel_id,chat_id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          channel_id: channelId,
          chat_id: chatId,
          booking_id: bookingId || null,
          bot_disabled: Boolean(botDisabled),
          reason,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        }),
      });
    } else if (bookingId) {
      await rest(`${AUTOMATION_TABLE}?booking_id=eq.${encodeURIComponent(bookingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          bot_disabled: Boolean(botDisabled),
          reason,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    // Sync with resortos-agent in memory
    try {
      await fetch(`${AGENT_BASE}/api/channels/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          chat_id: chatId,
          booking_id: bookingId,
          bot_disabled: Boolean(botDisabled),
          reason,
          updated_by: updatedBy,
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Agent sync is non-blocking
    }

    return { ok: true, bot_disabled: Boolean(botDisabled), channel_id: channelId, chat_id: chatId, booking_id: bookingId };
  } catch (err) {
    console.error('[setChatAutomationState]', err.message);
    throw err;
  }
}

export async function getUnreadCommsSummary() {
  const todayDate = israelIsoDate(); // e.g. "2026-10-21"
  const todayStartIso = `${todayDate}T00:00:00+03:00`;

  try {
    const disabledChatIds = new Set();
    const disabledBookingIds = new Set();
    try {
      const stateRows = await rest(
        `${AUTOMATION_TABLE}?bot_disabled=eq.true&select=chat_id,booking_id`
      );
      if (Array.isArray(stateRows)) {
        for (const s of stateRows) {
          if (s.chat_id) disabledChatIds.add(normalizeChatId(s.chat_id));
          if (s.booking_id) disabledBookingIds.add(String(s.booking_id));
        }
      }
    } catch {
      // non-fatal
    }

    const rows = await rest(
      `${COMMS_TABLE}?direction=eq.inbound&read_at=is.null&created_at=gte.${encodeURIComponent(todayStartIso)}&select=id,booking_id,recipient_phone,channel,created_at`
    );
    const list = Array.isArray(rows) ? rows : [];

    const unread_by_booking = {};
    const unread_by_phone = {};
    let filteredCount = 0;

    for (const r of list) {
      const clean = r.recipient_phone ? normalizeChatId(r.recipient_phone) : '';
      const isManual = (r.booking_id && disabledBookingIds.has(String(r.booking_id))) ||
                       (clean && disabledChatIds.has(clean));
      if (!isManual) continue;

      filteredCount += 1;
      if (r.booking_id) {
        unread_by_booking[r.booking_id] = (unread_by_booking[r.booking_id] || 0) + 1;
      }
      if (clean) {
        unread_by_phone[clean] = (unread_by_phone[clean] || 0) + 1;
      }
    }

    return {
      today: todayDate,
      total_unread: filteredCount,
      unread_by_booking,
      unread_by_phone,
    };
  } catch (err) {
    console.warn('[getUnreadCommsSummary]', err.message);
    return { today: todayDate, total_unread: 0, unread_by_booking: {}, unread_by_phone: {} };
  }
}

export async function markGuestCommsRead({ messageIds = [] }) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return { ok: true, marked: 0 };
  }
  const nowIso = new Date().toISOString();
  let marked = 0;
  for (const id of messageIds) {
    try {
      await rest(`${COMMS_TABLE}?id=eq.${encodeURIComponent(id)}&read_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ read_at: nowIso }),
      });
      marked += 1;
    } catch {
      // non-fatal
    }
  }
  return { ok: true, marked };
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
  bookingId,
  phone,
  message,
  metadata = {},
  channel = 'sms',
  skipBcc = false
}) {
  const bId = String(booking?.id || bookingId || '').trim();
  const recipient = String(phone || booking?.guest_phone || '').trim();
  const content = String(message || '').trim();
  if (!bId || !content) {
    const err = new Error('INVALID_GUEST_SMS');
    err.status = 400;
    throw err;
  }
  let status = 'sent';
  let sentAt = new Date().toISOString();
  let error = null;
  try {
    await sendMicropaySms({ phone: recipient, message: content, skipBcc });
  } catch (err) {
    status = 'failed';
    sentAt = null;
    error = err.description ? `${err.message}: ${err.description}` : (err.message || String(err));
  }
  const row = await insertGuestComm({
    booking_id: bId,
    tenant_id: booking?.tenant_id || null,
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

export async function sendManagerGuestLink({ bookingId, phone, message, actor }) {
  const id = String(bookingId || '').trim();
  const content = String(message || '').trim();
  const recipient = String(phone || '').trim();
  if (!id || !content || !recipient) {
    if (id) {
      await insertGuestComm({
        booking_id: id,
        channel: 'sms',
        direction: 'outbound',
        recipient_phone: recipient || null,
        content,
        status: 'failed',
        metadata: { kind: 'guest_link', actor: actor || 'agent', error: !recipient ? 'SMS_PHONE_INVALID' : 'INVALID_GUEST_SMS' }
      }).catch(() => {});
    }
    const err = new Error(!recipient ? 'SMS_PHONE_INVALID' : 'INVALID_GUEST_SMS');
    err.status = 400;
    throw err;
  }
  const rows = await rest(
    `${BOOKING_TABLE}?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*&limit=1`
  );
  const booking = Array.isArray(rows) ? rows[0] : null;
  if (!booking) {
    await insertGuestComm({
      booking_id: id,
      channel: 'sms',
      direction: 'outbound',
      recipient_phone: recipient,
      content,
      status: 'failed',
      metadata: { kind: 'guest_link', actor: actor || 'agent', error: 'NOT_FOUND' }
    }).catch(() => {});
    const err = new Error('NOT_FOUND');
    err.status = 404;
    throw err;
  }
  const url = booking.checkout_token ? `https://resortos.app/stay/${booking.checkout_token}` : '';
  if (!url || !content.includes(url)) {
    await insertGuestComm({
      booking_id: id,
      tenant_id: booking.tenant_id || null,
      channel: 'sms',
      direction: 'outbound',
      recipient_phone: recipient,
      content,
      status: 'failed',
      metadata: { kind: 'guest_link', actor: actor || 'agent', error: 'LINK_MISMATCH' }
    }).catch(() => {});
    const err = new Error('LINK_MISMATCH');
    err.status = 400;
    throw err;
  }
  return sendAndLogGuestSms({
    booking,
    phone: recipient,
    message: content,
    metadata: { kind: 'guest_link', actor: actor || 'agent' }
  });
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

/** Legacy entry point — delegates to the permanent mechanism (dry-run by default). */
export async function runScheduledCheckoutReminders(now = new Date(), env = process.env) {
  const { runCheckoutReminderJob } = await import('./checkoutReminderJob.js');
  return runCheckoutReminderJob({ mode: 'send', now, env });
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
    const channelId = req.body?.channel_id || req.body?.channelId || 'resortos';
    if (!bookingId) return res.status(400).json({ error: 'BOOKING_REQUIRED' });
    const rows = await rest(
      `${BOOKING_TABLE}?id=eq.${encodeURIComponent(bookingId)}&deleted_at=is.null&select=*&limit=1`
    );
    const booking = Array.isArray(rows) ? rows[0] : null;
    const recipientPhone = req.body?.phone || booking?.guest_phone || '';

    // Turn off Chloe auto-reply BEFORE sending manual message from staff!
    if (recipientPhone || bookingId) {
      try {
        await setChatAutomationState({
          channelId,
          phone: recipientPhone,
          bookingId,
          botDisabled: true,
          reason: 'manual_reply',
          updatedBy: req.staffUser?.username || req.staff?.username || req.staff?.name || 'staff',
        });
      } catch (e) {
        console.warn('[handleSendGuestComm] failed to set takeover before send:', e.message);
      }
    }

    if (!booking && !recipientPhone) {
      await insertGuestComm({
        booking_id: bookingId,
        channel: req.body?.channel || 'sms',
        direction: 'outbound',
        recipient_phone: null,
        content: message,
        status: 'failed',
        metadata: {
          kind: req.body?.kind || templateId || 'manual',
          template: templateId || null,
          actor: req.staffUser?.username || req.staff?.username || req.staff?.name || 'staff',
          error: 'NOT_FOUND'
        }
      }).catch(() => {});
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (templateId && !message) {
      const tpl = templateById(templateId);
      if (!tpl) return res.status(400).json({ error: 'UNKNOWN_TEMPLATE' });
      message = tpl.build({
        unitName: unitFullName(booking?.unit_id, booking?.unit_id),
        gateCode: booking?.stay?.gate_code || '',
        checkoutUrl: booking?.checkout_token
          ? `https://resortos.app/stay/${booking.checkout_token}`
          : ''
      });
    }
    if (!message) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });

    if (req.body?.channel === 'whatsapp') {
      let sentStatus = 'sent';
      try {
        const resp = await fetch(`${AGENT_BASE}/api/messages/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: recipientPhone,
            text: message,
            channel_id: channelId,
            booking_id: bookingId,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) sentStatus = 'failed';
      } catch {
        sentStatus = 'failed';
      }

      const row = await insertGuestComm({
        booking_id: bookingId,
        tenant_id: booking?.tenant_id || null,
        channel: 'whatsapp',
        direction: req.body?.direction || 'outbound',
        recipient_phone: recipientPhone,
        content: message,
        status: sentStatus,
        sent_at: sentStatus === 'sent' ? new Date().toISOString() : null,
        metadata: {
          kind: req.body?.kind || 'whatsapp',
          channel: channelId,
          actor: req.staffUser?.username || req.staff?.username || req.staff?.name || 'staff'
        }
      });
      return res.json({ ok: true, row, channel_id: channelId });
    }

    if (req.body?.channel === 'phone') {
      const row = await insertGuestComm({
        booking_id: bookingId,
        tenant_id: booking?.tenant_id || null,
        channel: 'phone',
        direction: req.body?.direction || 'outbound',
        recipient_phone: recipientPhone,
        content: message,
        status: req.body?.status || 'logged',
        sent_at: new Date().toISOString(),
        metadata: {
          kind: req.body?.kind || 'call',
          actor: req.staffUser?.username || req.staff?.username || req.staff?.name || 'staff'
        }
      });
      return res.json({ ok: true, row });
    }

    const row = await sendAndLogGuestSms({
      booking,
      bookingId,
      phone: recipientPhone,
      message,
      channel: req.body?.channel || 'sms',
      metadata: {
        kind: req.body?.kind || templateId || 'manual',
        template: templateId || null,
        actor: req.staffUser?.username || req.staff?.username || req.staff?.name || 'staff'
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

  // Clear human takeover on checkout for this specific booking
  if (booking?.id) {
    try {
      await setChatAutomationState({
        bookingId: booking.id,
        botDisabled: false,
        reason: 'checkout',
        updatedBy: 'system_checkout',
      });
    } catch (err) {
      console.warn('[checkout takeover reset]', err.message);
    }
  }

  try {
    await sendFarewellForBooking({ ...booking, checked_out_at: at });
  } catch (err) {
    console.warn('[farewell sms]', err.message);
  }
  try {
    const { logCheckoutToRoom } = await import('./roomCheckoutLog.js');
    let full = booking;
    try {
      const rows = await rest(`${BOOKING_TABLE}?id=eq.${encodeURIComponent(booking.id)}&select=id,unit_id,guest_name,channel_source,stay,checkout_status,checked_out_at,updated_at`);
      if (Array.isArray(rows) && rows[0]) full = { ...rows[0], ...booking, guest_name: rows[0].guest_name, stay: rows[0].stay };
    } catch {}
    await logCheckoutToRoom({ ...full, unit_id: full.unit_id || booking.unit_id, checked_out_at: at }, { source: 'guest' });
  } catch (err) {
    console.warn('[checkout room-log]', err.message);
  }
  await fireCheckoutRouterWebhook({ ...booking, checked_out_at: at });
}
