import {
  ackMailboxToken,
  confirmMailboxBooking,
  fetchMailboxBooking,
  isMailboxConfigured,
  publishBookingToMailbox,
  pullConfirmedFromMailbox
} from './checkoutMailbox.js';
import { stayExpiresAt, stayLinkExpired } from '../src/lib/stayAccess.js';
import { scheduleGuestContextPush } from './guestContext.js';

const BOOKING_TABLE = 'hotelos_bookings';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function supabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function isValidToken(token) {
  return typeof token === 'string' && /^tok_[A-Za-z0-9_-]+$/.test(token);
}

function publicBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    unit_id: row.unit_id,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    guest_phone: row.guest_phone,
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    adults_count: row.adults_count,
    children_count: row.children_count,
    baby_cot_required: Boolean(row.baby_cot_required || row.stay?.baby_cot_required),
    link_sent_at: row.link_sent_at || row.stay?.link_sent_at || row.created_at || null,
    total_price_agorot: row.total_price_agorot,
    deposit_agorot: row.deposit_agorot,
    booking_status: row.booking_status,
    payment_status: row.payment_status,
    payment_mode: row.payment_mode,
    clearing_payments: Array.isArray(row.clearing_payments) ? row.clearing_payments : [],
    channel_source: row.channel_source,
    agent_id: row.agent_id || row.stay?.agent_id || null,
    locked_until: row.locked_until || null,
    hyp_deal_id: row.hyp_deal_id || null,
    checkout_token: row.checkout_token,
    special_requests: row.special_requests,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stay: row.stay || null
  };
}

function isExpired(row) {
  return stayLinkExpired(row);
}

async function rest(path, options = {}) {
  const key = supabaseAnonKey();
  if (!key) {
    const err = new Error('Supabase anon key is not configured');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
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
    const err = new Error((data && data.message) || response.statusText);
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function findByToken(token) {
  const rows = await rest(
    `${BOOKING_TABLE}?checkout_token=eq.${encodeURIComponent(token)}&deleted_at=is.null&select=*&limit=1`
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

async function applyMailboxRemote(local, remote) {
  if (!local || !remote) return remote || local;
  const next = {
    ...local,
    ...remote,
    id: local.id,
    tenant_id: local.tenant_id || remote.tenant_id,
    guest_name: remote.guest_name || local.guest_name,
    guest_email: remote.guest_email || local.guest_email,
    guest_phone: remote.guest_phone || local.guest_phone,
    booking_status: remote.booking_status || local.booking_status,
    payment_status: remote.payment_status || local.payment_status,
    payment_mode: remote.payment_mode || local.payment_mode,
    clearing_payments: Array.isArray(remote.clearing_payments) && remote.clearing_payments.length
      ? remote.clearing_payments
      : (local.clearing_payments || [])
  };
  next.stay = {
    ...((local.stay && typeof local.stay === 'object') ? local.stay : {}),
    ...((remote.stay && typeof remote.stay === 'object') ? remote.stay : {})
  };
  if (remote.stay?.hyp_deposit?.paid) next.stay.hyp_deposit = remote.stay.hyp_deposit;
  if (remote.stay?.hyp?.paid) next.stay.hyp = remote.stay.hyp;
  if (remote.stay?.hyp_deposit?.paid && next.payment_status === 'UNPAID') {
    next.payment_status = 'DEPOSIT_PAID';
  }
  if (remote.stay?.hyp?.paid) next.payment_status = 'PAID';
  if (
    (next.payment_status === 'DEPOSIT_PAID' || next.payment_status === 'PAID' || next.payment_status === 'PARTIAL' || remote.stay?.hyp_deposit?.paid)
    && next.booking_status === 'PENDING'
  ) {
    next.booking_status = 'CONFIRMED';
  }
  if (remote.payment_status === 'PENDING_BANK' && local.payment_status !== 'PAID') {
    next.payment_status = 'PENDING_BANK';
    next.payment_mode = remote.payment_mode || next.payment_mode || 'BANK_TRANSFER';
  } else if (next.payment_status === 'UNPAID' && (local.payment_status === 'DEPOSIT_PAID' || local.payment_status === 'PAID')) {
    next.payment_status = local.payment_status;
  }
  next.updated_at = new Date().toISOString();
  return next;
}

function deskMailboxChanged(local, remote) {
  if (!remote) return false;
  if (String(remote.payment_status || '') !== String(local.payment_status || '')) return true;
  if (String(remote.payment_mode || '') !== String(local.payment_mode || '')) return true;
  if (Boolean(remote.stay?.cash_expected) !== Boolean(local.stay?.cash_expected)) return true;
  const remoteClear = Array.isArray(remote.clearing_payments) ? remote.clearing_payments.length : 0;
  const localClear = Array.isArray(local.clearing_payments) ? local.clearing_payments.length : 0;
  return remoteClear > localClear;
}

function mailboxLooksPaid(remote) {
  const status = String(remote?.payment_status || '');
  return Boolean(
    remote?.booking_status === 'CONFIRMED'
    || remote?.booking_status === 'CHECKED_IN'
    || status === 'PAID'
    || status === 'DEPOSIT_PAID'
    || status === 'PARTIAL'
    || status === 'PENDING_CASH'
    || status === 'PENDING_BANK'
    || remote?.stay?.hyp_deposit?.paid
    || remote?.stay?.hyp?.paid
  );
}

async function upsertHotelosBooking(booking) {
  if (!booking?.id) return null;
  const row = publicBooking(booking);
  delete row.baby_cot_required;
  delete row.link_sent_at;
  row.booking_status = booking.booking_status === 'PENDING' && mailboxLooksPaid(booking)
    ? 'CONFIRMED'
    : (booking.booking_status || 'CONFIRMED');
  row.payment_status = booking.payment_status || 'UNPAID';
  row.payment_mode = booking.payment_mode || row.payment_mode || null;
  row.clearing_payments = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : (row.clearing_payments || []);
  row.updated_at = booking.updated_at || new Date().toISOString();
  const rows = await rest(`${BOOKING_TABLE}?on_conflict=id`, {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify(row)
  });
  scheduleGuestContextPush();
  return Array.isArray(rows) ? rows[0] : rows;
}

function isAgentMailbox(remote) {
  return Boolean(
    remote
    && (
      remote.channel_source === 'AGENT'
      || remote.type === 'agent_booking'
      || remote.stay?.type === 'agent_booking'
    )
  );
}

function agentAlertText(remote) {
  const cabin = remote.cabin_name || remote.unit_id || remote.cabin_id || '';
  const agent = remote.agent_name || remote.stay?.agent_name || 'סוכן';
  const start = remote.start_date || remote.check_in_date;
  const end = remote.end_date || remote.check_out_date;
  const deposit = remote.deposit_amount
    || Math.round((Number(remote.deposit_agorot) || 0) / 100);
  const guests = remote.stay?.cabin_parties?.length
    ? remote.stay.cabin_parties.map((row) => {
      const bits = [`${row.name || row.cabin_id}: ${row.adults || 0} מבוגרים`];
      if (row.children) bits.push(`${row.children} ילדים`);
      if (row.crib) bits.push('מיטת תינוק');
      return bits.join(', ');
    }).join(' · ')
    : `${remote.adults_count || 2} מבוגרים, ${remote.children_count || 0} ילדים${remote.stay?.baby_cot_required || remote.baby_cot_required ? ' · מיטת תינוק' : ''}`;
  return `🔔 הזמנה חדשה מסוכן: ${agent} | בקתה: ${cabin} | תאריכים: ${start} עד ${end} | אורחים: ${guests} | מקדמה: ${deposit} ₪ | נא לעדכן בכינורות`;
}

async function notifyAgentBooking(remote) {
  const text = agentAlertText(remote);
  const hook = String(process.env.AGENT_BOOKING_WEBHOOK || '').trim();
  if (hook) {
    try {
      await fetch(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000)
      });
    } catch (err) {
      console.warn('[agent notify]', err.message);
    }
  }
  console.log('[agent booking]', text);
}

async function insertAgentCommission(booking) {
  if (!booking?.agent_id || !booking?.id) return;
  const rate = Number(booking.commission_rate || booking.stay?.commission_rate || 0.1);
  const amount = Math.round((Number(booking.total_price_agorot) || 0) * rate);
  try {
    await rest('agent_commissions', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: JSON.stringify({
        agent_id: booking.agent_id,
        booking_id: booking.id,
        commission_amount_agorot: amount,
        status: 'PENDING_PAYOUT'
      })
    });
  } catch (err) {
    console.warn('[agent commission]', err.message);
  }
}

async function ingestPaidAgentBooking(remote) {
  const token = remote.checkout_token;
  if (!isValidToken(token) || !mailboxLooksPaid(remote)) return null;
  const existing = await findByToken(token);
  const booking = {
    ...(existing || {}),
    ...remote,
    id: existing?.id || remote.id || `agt_${token.slice(4, 16)}`,
    tenant_id: existing?.tenant_id || remote.tenant_id || '22222222-2222-2222-2222-222222222222',
    unit_id: remote.unit_id || remote.cabin_id,
    check_in_date: remote.check_in_date || remote.start_date,
    check_out_date: remote.check_out_date || remote.end_date,
    booking_status: 'CONFIRMED',
    payment_status: remote.payment_status === 'PAID' ? 'PAID' : 'DEPOSIT_PAID',
    channel_source: 'AGENT',
    agent_id: remote.agent_id || remote.stay?.agent_id || existing?.agent_id || null,
    checkout_token: token,
    updated_at: new Date().toISOString()
  };
  const cabinIds = [...new Set([].concat(
    remote.stay?.cabin_ids || remote.cabin_ids || booking.unit_id
  ).map((id) => String(id || '').trim()).filter(Boolean))];
  const parties = Array.isArray(remote.stay?.cabin_parties) ? remote.stay.cabin_parties : [];
  const partyFor = (unitId) => parties.find((row) => row.cabin_id === unitId) || parties[0] || null;
  const firstParty = partyFor(booking.unit_id);
  if (firstParty) {
    booking.adults_count = firstParty.adults;
    booking.children_count = firstParty.children;
  }
  const saved = await upsertHotelosBooking(booking);
  for (const unitId of cabinIds.slice(1)) {
    const party = partyFor(unitId);
    await upsertHotelosBooking({
      ...booking,
      id: `${booking.id}_${unitId}`,
      unit_id: unitId,
      checkout_token: `${token}_${unitId}`.slice(0, 80),
      adults_count: party?.adults ?? booking.adults_count,
      children_count: party?.children ?? booking.children_count,
      guest_name: party?.occupant_name || booking.guest_name,
      guest_phone: party?.occupant_phone || booking.guest_phone,
      total_price_agorot: remote.stay?.pay_split === 'per_cabin'
        ? (remote.stay?.cabin_quotes || []).find((row) => row.cabin_id === unitId)?.total_agorot ?? booking.total_price_agorot
        : booking.total_price_agorot,
      deposit_agorot: remote.stay?.pay_split === 'per_cabin' ? 0 : booking.deposit_agorot,
      payment_status: remote.stay?.pay_split === 'per_cabin' ? 'UNPAID' : booking.payment_status
    });
  }
  await notifyAgentBooking(remote);
  await ackMailboxToken(token).catch(() => {});
  scheduleGuestContextPush();
  return saved;
}

async function syncAgentBookingsFromMailbox() {
  const inbox = await pullConfirmedFromMailbox();
  for (const remote of inbox) {
    if (!isAgentMailbox(remote) || !mailboxLooksPaid(remote)) continue;
    try {
      await ingestPaidAgentBooking(remote);
    } catch (err) {
      console.warn('[agent mailbox]', remote.checkout_token, err.message);
    }
  }
}

export async function getGuestCheckout(req, res) {
  const token = req.params.token;
  if (!isValidToken(token)) {
    return res.status(400).json({ error: 'INVALID_TOKEN' });
  }
  try {
    const row = await findByToken(token);
    if (isMailboxConfigured() && row && row.booking_status !== 'CANCELED' && !isExpired(row)) {
      const unpaid = row.booking_status === 'PENDING'
        || row.payment_status === 'UNPAID'
        || !row.payment_status;
      if (unpaid) {
        const remote = await fetchMailboxBooking(token);
        if (remote && mailboxLooksPaid(remote)) {
          const merged = await applyMailboxRemote(row, remote);
          const saved = await upsertHotelosBooking(merged);
          if (remote.booking_status === 'CONFIRMED' || remote.booking_status === 'CHECKED_IN' || mailboxLooksPaid(remote)) {
            ackMailboxToken(token).catch(() => {});
          }
          return res.json(publicBooking(saved || merged));
        }
      }
    }
    if (row && row.booking_status !== 'CANCELED' && !isExpired(row)) {
      return res.json(publicBooking(row));
    }
    if (isMailboxConfigured() && (!row || row.booking_status === 'PENDING')) {
      const remote = await fetchMailboxBooking(token);
      if (remote) return res.json(publicBooking(remote));
    }
    if (!row || row.booking_status === 'CANCELED') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (isExpired(row)) {
      return res.status(410).json({ error: 'EXPIRED' });
    }
    return res.json(publicBooking(row));
  } catch (err) {
    console.error('[guest checkout get]', err.message);
    return res.status(err.status || 500).json({ error: 'LOOKUP_FAILED' });
  }
}

export async function confirmGuestCheckout(req, res) {
  const token = req.params.token;
  if (!isValidToken(token)) {
    return res.status(400).json({ error: 'INVALID_TOKEN' });
  }

  const guestName = String(req.body?.guest_name || '').trim();
  const guestEmail = String(req.body?.guest_email || '').trim();
  const specialRequests = String(req.body?.special_requests || '').trim();

  if (!guestName) {
    return res.status(400).json({ error: 'MISSING_GUEST_FIELDS' });
  }

  try {
    const payload = {
      guest_name: guestName,
      guest_email: guestEmail,
      special_requests: specialRequests
    };
    let saved = null;
    if (isMailboxConfigured()) {
      saved = await confirmMailboxBooking(token, payload);
    }
    const row = await findByToken(token);
    if (row) {
      const updated = {
        ...row,
        ...payload,
        booking_status: row.booking_status === 'PENDING' ? 'CONFIRMED' : row.booking_status,
        payment_status: row.payment_status && row.payment_status !== 'UNPAID' ? row.payment_status : 'UNPAID',
        expires_at: stayExpiresAt({ ...row, ...payload }),
        updated_at: new Date().toISOString()
      };
      const rows = await rest(
        `${BOOKING_TABLE}?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            guest_name: guestName,
            guest_email: guestEmail,
            special_requests: specialRequests,
            booking_status: row.booking_status === 'PENDING' ? 'CONFIRMED' : row.booking_status,
            payment_status: row.payment_status && row.payment_status !== 'UNPAID' ? row.payment_status : 'UNPAID',
            expires_at: stayExpiresAt(updated),
            updated_at: updated.updated_at
          })
        }
      );
      saved = Array.isArray(rows) ? rows[0] : (rows || updated);
      if (isMailboxConfigured() && token) {
        ackMailboxToken(token).catch(() => {});
      }
    } else if (saved) {
      await upsertHotelosBooking(saved);
      if (isMailboxConfigured()) ackMailboxToken(token).catch(() => {});
    }
    if (!saved && !row) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    return res.json(publicBooking(saved || row));
  } catch (err) {
    console.error('[guest checkout confirm]', err.message);
    return res.status(err.status || 500).json({ error: 'CONFIRM_FAILED' });
  }
}

export async function publishGuestMailbox(req, res) {
  try {
    const booking = req.body;
    if (!booking?.checkout_token) {
      return res.status(400).json({ error: 'INVALID_BOOKING' });
    }
    const saved = await publishBookingToMailbox(booking);
    return res.json(saved || { ok: true });
  } catch (err) {
    console.error('[guest mailbox publish]', err.message);
    return res.status(err.status || 500).json({ error: 'PUBLISH_FAILED' });
  }
}

async function syncPendingTokensFromMailbox() {
  const pending = await rest(
    `${BOOKING_TABLE}?booking_status=eq.PENDING&deleted_at=is.null&select=id,checkout_token,booking_status,payment_status,payment_mode,check_in_date&order=check_in_date.asc&limit=20`
  );
  const rows = Array.isArray(pending) ? pending : [];
  for (const row of rows) {
    const token = row?.checkout_token;
    if (!isValidToken(token)) continue;
    try {
      const remote = await fetchMailboxBooking(token);
      if (!remote) continue;
      const shouldUpsert = mailboxLooksPaid(remote);
      if (!shouldUpsert) continue;
      const patch = await applyMailboxRemote(row, remote);
      if (remote.stay?.payment_proof) {
        const note = remote.payment_mode === 'BANK_TRANSFER'
          ? 'bank_proof'
          : (remote.payment_mode || '');
        const base = String(patch.special_requests || '').replace(/\|pay:[^|]*/g, '');
        patch.special_requests = `${base}|pay:${note}`.replace(/^\|/, '');
      }
      await upsertHotelosBooking(patch);
      if (mailboxLooksPaid(remote) || remote.booking_status === 'CONFIRMED' || remote.booking_status === 'CHECKED_IN') {
        ackMailboxToken(token).catch(() => {});
      }
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) {
        console.warn('[checkout mailbox token]', token.slice(0, 12), err.message);
      }
    }
  }
}

function israelIsoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

function shiftIsoDate(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return israelIsoDate(date);
}

async function syncInHouseMailboxUpdates() {
  const today = israelIsoDate();
  const from = shiftIsoDate(today, -1);
  const to = shiftIsoDate(today, 3);
  const open = await rest(
    `${BOOKING_TABLE}?deleted_at=is.null&checkout_token=not.is.null&booking_status=neq.CANCELED&booking_status=neq.CHECKED_OUT&payment_status=neq.PAID&check_in_date=gte.${from}&check_in_date=lte.${to}&select=id,checkout_token,booking_status,payment_status,payment_mode,check_in_date,special_requests,clearing_payments,stay&order=check_in_date.asc&limit=40`
  );
  const rows = Array.isArray(open) ? open : [];
  for (const row of rows) {
    const token = row?.checkout_token;
    if (!isValidToken(token)) continue;
    try {
      const remote = await fetchMailboxBooking(token);
      if (!remote) continue;
      if (remote.payment_status !== 'PENDING_BANK' && !remote.stay?.payment_proof && !deskMailboxChanged(row, remote)) continue;
      const patch = await applyMailboxRemote(row, remote);
      if (remote.stay?.payment_proof) {
        const base = String(patch.special_requests || '').replace(/\|pay:[^|]*/g, '');
        patch.special_requests = `${base}|pay:bank_proof`.replace(/^\|/, '');
      }
      await upsertHotelosBooking(patch);
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) {
        console.warn('[checkout mailbox stay]', token.slice(0, 12), err.message);
      }
    }
  }
}

export function startCheckoutMailboxPoller() {
  if (!isMailboxConfigured()) {
    console.warn('Checkout mailbox secret missing — guest confirms will not sync from Cloudflare');
    return;
  }
  let ticking = false;
  let pausedUntil = 0;
  async function tick() {
    if (ticking) return;
    if (Date.now() < pausedUntil) return;
    ticking = true;
    try {
      // Known tokens only. Never hit /inbox (that used KV.list and burned the free quota).
      await syncPendingTokensFromMailbox();
      await syncInHouseMailboxUpdates();
      await syncAgentBookingsFromMailbox();
    } catch (err) {
      if (err.status === 429) pausedUntil = Date.now() + 30 * 60 * 1000;
      console.warn('[checkout mailbox poll]', err.status || '', err.message);
    } finally {
      ticking = false;
    }
  }
  setInterval(tick, 7000);
}

export function allowPublicCheckoutCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}
