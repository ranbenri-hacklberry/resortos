import { errorJson, json } from '../_db.js';
import { deskLoginNames } from '../../lib/deskStaff.js';
import { loadCalendarReplica } from '../../lib/calendarReplica.js';
import { compactStayRow } from '../../lib/guestContextStore.js';
import { createHypPaymentPage } from '../../lib/hypPay.js';
import { UNIT_DISPLAY_NAMES } from '../../lib/unitNames.js';
import { onRequest as checkoutOnRequest, persistGuestRow, readBooking } from '../checkout/[[path]].js';

const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;

function hypReady(env, terminal) {
  const t = String(terminal || 'A').toUpperCase() === 'B' ? 'B' : 'A';
  const masof = String(env?.[`HYP_${t}_MASOF`] || (t === 'A' ? env?.HYP_MASOF : '') || (t === 'B' ? '4502315932' : '4502210929')).replace(/\D/g, '');
  const key = String(env?.[`HYP_${t}_KEY`] || (t === 'A' ? env?.HYP_KEY : '') || '').trim();
  const passp = String(env?.[`HYP_${t}_PASSP`] || (t === 'A' ? env?.HYP_PASSP : '') || '').trim();
  return masof.length >= 8 && Boolean(key && passp);
}

function replicaStays(replica) {
  const stays = Array.isArray(replica?.stays) ? replica.stays.filter((row) => row && typeof row === 'object') : [];
  if (stays.length) return stays;
  const byTail = replica?.byTail && typeof replica.byTail === 'object' ? replica.byTail : {};
  const out = [];
  for (const list of Object.values(byTail)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && typeof row === 'object') out.push(row);
    }
  }
  return out;
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || 'desk')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signSession(env, name) {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = `${encodeURIComponent(name || 'desk')}|${exp}`;
  const sig = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || env.HOTELOS_DESK_PIN || 'desk', payload);
  return `${payload}.${sig}`;
}

async function readSession(env, request) {
  const raw = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  const expected = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || env.HOTELOS_DESK_PIN || 'desk', payload);
  if (sig !== expected) return null;
  const [name, exp] = payload.split('|');
  if (Number(exp) < Date.now()) return null;
  try {
    return { name: decodeURIComponent(name || 'desk') };
  } catch {
    return { name: name || 'desk' };
  }
}

function unitName(id, units) {
  const hit = (units || []).find((unit) => unit && (unit.cabin_id === id || unit.id === id));
  return hit?.cabin_name || hit?.name || UNIT_DISPLAY_NAMES[id] || id;
}

function stayOf(row) {
  return row?.stay && typeof row.stay === 'object' ? row.stay : {};
}

function paidIls(row) {
  const stay = stayOf(row);
  const clearing = Array.isArray(row?.clearing_payments) ? row.clearing_payments : [];
  const fromClearing = clearing.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0) / 100;
  if (fromClearing > 0) return fromClearing;
  const total = Number(row.total_price_agorot || 0) / 100;
  const deposit = Number(row.deposit_agorot || 0) / 100;
  if (stay.hyp?.paid && String(row.payment_status || '').toUpperCase() === 'PAID') return Math.max(total, fromClearing);
  if (stay.hyp_deposit?.paid || row?.payment_status === 'DEPOSIT_PAID' || row?.payment_status === 'PARTIAL') {
    return Math.max(deposit, fromClearing);
  }
  return fromClearing;
}

function isRecordedPaid(row) {
  const mode = String(row?.payment_mode || '');
  if (mode === 'VOUCHER' || mode === 'COMP') return true;
  const total = Number(row?.total_price_agorot) || 0;
  if (!(total > 0)) return false;
  return paidIls(row) * 100 + 50 >= total;
}

function paymentLabel(item) {
  const source = String(item?.source || item?.accountKey || '').toUpperCase();
  if (source === 'CASH') return 'מזומן';
  if (source === 'BANK') return 'העברה';
  if (source === 'HYP' || source.startsWith('HYP') || source === 'CARD') return 'אשראי';
  if (source === 'VOUCHER') return 'שובר';
  return 'תשלום';
}

function publicPayments(row) {
  return (Array.isArray(row?.clearing_payments) ? row.clearing_payments : []).map((item, index) => ({
    index,
    source: item.source || '',
    label: paymentLabel(item),
    amount_ils: Math.round((Number(item.amount_agorot) || 0) / 100),
    at: item.at || item.date || '',
    ref: item.ref || '',
    note: item.note || item.ref || ''
  }));
}

function statusAfterPayments(totalAgorot, payments, mode) {
  const paid = (payments || []).reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
  if (mode === 'VOUCHER' || mode === 'COMP') return 'PAID';
  if (totalAgorot > 0 && paid + 50 >= totalAgorot) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

function coversDay(row, day) {
  if (!row || typeof row !== 'object') return false;
  const cin = String(row.check_in_date || '');
  const cout = String(row.check_out_date || '');
  if (!cin || !day) return false;
  if (cin === day) return true;
  return Boolean(cout && cin <= day && day < cout);
}

function publicStay(row, units) {
  if (!row || typeof row !== 'object') return null;
  const stay = stayOf(row);
  const total = Math.round((Number(row.total_price_agorot) || 0) / 100);
  const deposit = Math.round((Number(row.deposit_agorot) || 0) / 100);
  const paid = Math.round(paidIls(row));
  const mode = String(row.payment_mode || '');
  const cashExpected = Boolean(stay.cash_expected || row.payment_status === 'PENDING_CASH' || mode === 'CASH_TRUST')
    && !stay.cash_collected_at
    && paid < Math.max(total, 1);
  return {
    id: row.id,
    checkout_token: row.checkout_token || '',
    guest_name: row.guest_name || 'אורח',
    guest_phone: row.guest_phone || '',
    unit_id: row.unit_id,
    unit_name: unitName(row.unit_id, units),
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    booking_status: row.booking_status,
    payment_status: row.payment_status || 'UNPAID',
    payment_mode: mode,
    total_ils: total,
    deposit_ils: deposit,
    paid_ils: paid,
    due_ils: Math.max(0, total - paid),
    charge_ils: deposit > 0 ? deposit : Math.max(0, total - paid),
    cash_expected: cashExpected,
    recorded_paid: isRecordedPaid(row),
    partial: String(row.payment_status || '').toUpperCase() === 'PARTIAL' || (paid > 0 && paid < total),
    payments: publicPayments(row),
    is_voucher: mode === 'VOUCHER' || Boolean(stay.voucher_photo),
    voucher_photo: stay.voucher_photo || '',
    voucher_company_redeemed: Boolean(stay.voucher_company_redeemed),
    bank_photo: stay.payment_proof || ''
  };
}

function payRank(row) {
  if (isRecordedPaid(row) || stayOf(row).hyp?.paid) return 40;
  const status = String(row?.payment_status || '').toUpperCase();
  if (status === 'DEPOSIT_PAID' || status === 'PARTIAL' || stayOf(row).hyp_deposit?.paid) return 30;
  if (status === 'PENDING_CASH' || stayOf(row).cash_expected) return 20;
  return 10;
}

function mergeReplicaLive(found, live, token) {
  if (!live) {
    return {
      ...found,
      checkout_token: token,
      check_out_date: found.check_out_date || found.check_in_date
    };
  }
  const preferLive = payRank(live) >= payRank(found);
  return {
    ...found,
    ...live,
    id: found.id || live.id,
    unit_id: found.unit_id || live.unit_id,
    guest_name: found.guest_name || live.guest_name,
    guest_phone: found.guest_phone || live.guest_phone,
    check_in_date: found.check_in_date || live.check_in_date,
    check_out_date: found.check_out_date || live.check_out_date || found.check_in_date,
    checkout_token: token,
    payment_status: preferLive ? (live.payment_status || found.payment_status) : (found.payment_status || live.payment_status),
    payment_mode: preferLive ? (live.payment_mode || found.payment_mode) : (found.payment_mode || live.payment_mode),
    total_price_agorot: Math.max(Number(found.total_price_agorot) || 0, Number(live.total_price_agorot) || 0),
    deposit_agorot: Math.max(Number(found.deposit_agorot) || 0, Number(live.deposit_agorot) || 0),
    clearing_payments: preferLive
      ? (live.clearing_payments || found.clearing_payments)
      : (found.clearing_payments || live.clearing_payments),
    stay: preferLive ? { ...stayOf(found), ...stayOf(live) } : { ...stayOf(live), ...stayOf(found) }
  };
}

async function patchGuestContextStay(env, booking) {
  if (!env?.STAY_DB || !booking) return;
  const replica = await loadCalendarReplica(env);
  if (!replica) return;
  const packed = compactStayRow(booking);
  const stays = replicaStays(replica).map((row) => (
    row.id === booking.id || (booking.checkout_token && row.checkout_token === booking.checkout_token)
      ? { ...row, ...packed }
      : row
  ));
  const now = new Date().toISOString();
  const payload = JSON.stringify({ ...replica, stays, syncedAt: now });
  await env.STAY_DB.prepare(
    'INSERT OR REPLACE INTO guest_context (id, payload, synced_at) VALUES (?1, ?2, ?3)'
  ).bind('all', payload, now).run();
}

async function saveDeskRow(env, token, next) {
  const stored = {
    ...next,
    checkout_token: token,
    mailbox_acked: false,
    updated_at: new Date().toISOString()
  };
  const saved = await persistGuestRow(env, token, stored);
  if (!saved) return null;
  await patchGuestContextStay(env, stored).catch(() => {});
  checkoutCall(env, 'publish', 'PUT', stored, {
    'x-hotelos-mailbox': env.CHECKOUT_MAILBOX_SECRET || ''
  }).catch(() => {});
  return stored;
}

async function checkoutCall(env, path, method, body, extraHeaders = {}) {
  const request = new Request(`https://resortos.app/api/checkout/${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: body == null ? undefined : JSON.stringify(body)
  });
  return checkoutOnRequest({
    request,
    env,
    params: { path: String(path || '').split('/').filter(Boolean) }
  });
}

async function ensureDeskBooking(env, body) {
  const replica = await loadCalendarReplica(env);
  const found = replicaStays(replica).find((row) => (
    (body.checkout_token && row.checkout_token === body.checkout_token) || row.id === body.id
  ));
  if (!found) return { error: errorJson('ההזמנה לא נמצאה', 404, 'NOT_FOUND') };
  const token = TOKEN_RE.test(found.checkout_token)
    ? found.checkout_token
    : (TOKEN_RE.test(body.checkout_token) ? body.checkout_token : `tok_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`);
  const existing = await readBooking(env, token);
  const booking = mergeReplicaLive(found, existing, token);
  const saved = await persistGuestRow(env, token, { ...booking, mailbox_acked: false });
  if (!saved) return { error: errorJson('לא הצלחנו לשמור את ההזמנה', 502, 'PUBLISH_FAILED') };
  await patchGuestContextStay(env, booking).catch(() => {});
  return { replica, token, booking };
}

export async function onRequest(context) {
  try {
    const { request, env, params } = context;
    const method = request.method.toUpperCase();
    const head = [].concat(params.path || []).filter(Boolean)[0] || '';
    if (method === 'OPTIONS') return json({ ok: true });

    if (head === 'login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const replica = await loadCalendarReplica(env);
      const hash = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || 'desk', password);
      const staff = (replica?.deskStaff || []).find((row) => (
        deskLoginNames(row).includes(username) && row.pass === hash
      ));
      if (!staff) return errorJson('שם משתמש או סיסמה שגויים', 401, 'BAD_LOGIN');
      const token = await signSession(env, staff.username || 'desk');
      return json({ token, name: staff.display_name || staff.username });
    }

    const session = await readSession(env, request);
    if (!session) return errorJson('צריך להתחבר מחדש', 401, 'UNAUTHORIZED');

    if (head === 'bookings' && method === 'GET') {
      const day = new URL(request.url).searchParams.get('day')
        || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
      const replica = await loadCalendarReplica(env);
      const units = replica?.units || [];
      const rows = replicaStays(replica).filter((row) => {
        const status = String(row.booking_status || '').toUpperCase();
        if (status === 'CANCELED' || status === 'CANCELLED') return false;
        const hay = `${row.guest_name || ''} ${row.special_requests || ''}`;
        if (/שיפוץ|סגור/.test(hay)) return false;
        return coversDay(row, day);
      });
      const merged = await Promise.all(rows.map(async (row) => {
        const token = TOKEN_RE.test(row.checkout_token) ? row.checkout_token : '';
        const live = token ? await readBooking(env, token) : null;
        return mergeReplicaLive(row, live, token || row.checkout_token);
      }));
      merged.sort((a, b) => (String(a.unit_id || '') < String(b.unit_id || '') ? -1 : 1));
      return json({
        day,
        syncedAt: replica?.syncedAt || null,
        hyp: { a: hypReady(env, 'A'), b: hypReady(env, 'B') },
        bookings: merged.map((row) => publicStay(row, units)).filter(Boolean)
      });
    }

    if ((head === 'charge' || head === 'mark' || head === 'cash' || head === 'voucher' || head === 'deposit' || head === 'unpay' || head === 'total') && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const loaded = await ensureDeskBooking(env, body);
      if (loaded.error) return loaded.error;
      const { replica, token, booking } = loaded;
      const dueNow = Math.max(0, (Number(booking.total_price_agorot) || 0) / 100 - paidIls(booking));
      const amount = Math.max(0, Number(body.amount_ils) || dueNow || Number(booking.deposit_agorot || 0) / 100 || 0);

      if (head === 'total') {
        const totalIls = Math.max(0, Number(body.total_ils) || 0);
        const stored = await saveDeskRow(env, token, {
          ...booking,
          checkout_token: token,
          total_price_agorot: Math.round(totalIls * 100),
          payment_status: statusAfterPayments(Math.round(totalIls * 100), booking.clearing_payments, booking.payment_mode)
        });
        if (!stored) return errorJson('המחיר לא נשמר', 502, 'TOTAL_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }

      if (head === 'unpay') {
        const live = (await readBooking(env, token)) || booking;
        const payments = Array.isArray(live.clearing_payments) ? [...live.clearing_payments] : [];
        const idx = Number.isInteger(Number(body.index)) ? Number(body.index) : payments.length - 1;
        const nextPayments = payments.filter((_, i) => i !== idx);
        const stay = { ...stayOf(live), ...stayOf(booking) };
        const removed = payments[idx];
        if (String(removed?.source || '').toUpperCase() === 'CASH' && !nextPayments.some((item) => String(item.source || '').toUpperCase() === 'CASH')) {
          stay.cash_expected = false;
          delete stay.cash_collected_at;
        }
        if (String(removed?.source || '').toUpperCase() === 'BANK' && !nextPayments.some((item) => String(item.source || '').toUpperCase() === 'BANK')) {
          delete stay.payment_proof;
        }
        if (body.voucher === true) {
          stay.voucher_photo = '';
          stay.voucher_company_redeemed = false;
        }
        if (stay.hyp?.paid && !nextPayments.some((item) => String(item.source || '').toUpperCase() === 'HYP')) {
          stay.hyp = { ...(stay.hyp || {}), paid: false };
        }
        const mode = body.voucher === true ? '' : (live.payment_mode === 'VOUCHER' && !nextPayments.length ? '' : live.payment_mode);
        const next = {
          ...live,
          ...booking,
          checkout_token: token,
          clearing_payments: nextPayments,
          payment_mode: nextPayments.length ? mode : '',
          payment_status: statusAfterPayments(Number(live.total_price_agorot) || 0, nextPayments, nextPayments.length ? mode : ''),
          stay
        };
        const stored = await saveDeskRow(env, token, next);
        if (!stored) return errorJson('הביטול לא נשמר', 502, 'UNPAY_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }

      if (head === 'cash') {
        const undo = body.undo === true;
        const stay = { ...stayOf(booking) };
        let next;
        if (undo) {
          stay.cash_expected = false;
          delete stay.cash_collected_at;
          const mode = String(booking.payment_mode || '');
          next = {
            ...booking,
            checkout_token: token,
            payment_mode: mode === 'CASH_TRUST' || mode === 'CASH' ? '' : mode,
            payment_status: booking.payment_status === 'PENDING_CASH' ? 'UNPAID' : booking.payment_status,
            stay
          };
        } else {
          stay.cash_expected = true;
          delete stay.cash_collected_at;
          next = {
            ...booking,
            checkout_token: token,
            payment_mode: 'CASH_TRUST',
            payment_status: booking.payment_status === 'PAID' ? 'PAID' : 'PENDING_CASH',
            stay
          };
        }
        const stored = await saveDeskRow(env, token, next);
        if (!stored) return errorJson('העדכון לא נשמר', 502, 'CASH_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }

      if (head === 'voucher') {
        const photo = String(body.photo || stayOf(booking).voucher_photo || '');
        if (photo && !photo.startsWith('data:image/')) {
          return errorJson('הצילום לא תקין', 400, 'BAD_PHOTO');
        }
        const stay = {
          ...stayOf(booking),
          voucher_photo: photo,
          voucher_company_redeemed: body.company_redeemed === true,
          voucher_updated_at: new Date().toISOString()
        };
        const next = {
          ...booking,
          checkout_token: token,
          payment_mode: 'VOUCHER',
          stay,
          updated_at: new Date().toISOString()
        };
        const stored = await saveDeskRow(env, token, next);
        if (!stored) return errorJson('השובר לא נשמר', 502, 'VOUCHER_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }

      if (head === 'deposit') {
        const depositIls = Math.max(0, Number(body.deposit_ils) || 0);
        const depositAgorot = Math.round(depositIls * 100);
        const live = (await readBooking(env, token)) || booking;
        const payments = Array.isArray(live.clearing_payments) ? [...live.clearing_payments] : [];
        const already = payments.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
        if (depositAgorot > already + 50) {
          payments.push({
            source: 'DESK',
            amount_agorot: depositAgorot - already,
            date: new Date().toISOString().slice(0, 10),
            note: 'מקדמה מהדלפק'
          });
        }
        const totalAgorot = Number(live.total_price_agorot) || 0;
        const nextPaid = payments.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
        const next = {
          ...live,
          ...booking,
          checkout_token: token,
          deposit_agorot: depositAgorot || live.deposit_agorot,
          clearing_payments: payments,
          payment_status: totalAgorot > 0 && nextPaid + 50 >= totalAgorot
            ? 'PAID'
            : (nextPaid > 0 ? 'DEPOSIT_PAID' : (live.payment_status || 'UNPAID')),
          stay: { ...stayOf(live), ...stayOf(booking) }
        };
        const stored = await saveDeskRow(env, token, next);
        if (!stored) return errorJson('המקדמה לא נשמרה', 502, 'DEPOSIT_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }
      if (head === 'mark') {
        const live = (await readBooking(env, token)) || booking;
        const paidAgorot = Math.round(amount * 100);
        const payments = Array.isArray(live.clearing_payments) ? [...live.clearing_payments] : [];
        const methodName = String(body.method || 'CARD').toUpperCase();
        const isCash = methodName === 'CASH';
        const isBank = methodName === 'BANK';
        const photo = String(body.photo || '');
        if (isBank && photo && !photo.startsWith('data:image/')) {
          return errorJson('הצילום לא תקין', 400, 'BAD_PHOTO');
        }
        const paidAt = String(body.at || '').trim();
        const atDate = paidAt ? new Date(paidAt.includes('T') && !/[Z+-]/.test(paidAt.slice(-6)) ? `${paidAt}:00+03:00` : paidAt) : new Date();
        const atIso = Number.isNaN(atDate.getTime()) ? new Date().toISOString() : atDate.toISOString();
        const ref = String(body.ref || '').trim();
        payments.push({
          source: isCash ? 'CASH' : (isBank ? 'BANK' : 'CARD'),
          amount_agorot: paidAgorot,
          date: atIso.slice(0, 10),
          at: atIso,
          ref,
          note: String(body.note || (isCash ? 'מזומן בדלפק' : isBank ? 'העברה בנקאית' : 'אשראי שהתקבל'))
        });
        const totalAgorot = Number(live.total_price_agorot) || paidAgorot;
        const nextPaid = payments.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
        const stay = {
          ...stayOf(live),
          ...stayOf(booking),
          ...(isCash ? { cash_expected: false, cash_collected_at: new Date().toISOString() } : {}),
          ...(isBank && photo ? { payment_proof: photo, payment_proof_at: new Date().toISOString() } : {})
        };
        const marked = {
          ...live,
          ...booking,
          checkout_token: token,
          clearing_payments: payments,
          payment_mode: isCash ? 'CASH' : (isBank ? 'BANK_TRANSFER' : (booking.payment_mode || live.payment_mode || 'CARD')),
          payment_status: statusAfterPayments(totalAgorot, payments, isCash ? 'CASH' : (isBank ? 'BANK_TRANSFER' : 'CARD')),
          stay
        };
        const stored = await saveDeskRow(env, token, marked);
        if (!stored) return errorJson('העדכון לא נשמר', 502, 'MARK_FAILED');
        return json({ ok: true, booking: publicStay(stored, replica?.units || []) });
      }

      const terminal = String(body.terminal || '').toUpperCase() === 'B' ? 'B' : 'A';
      if (!hypReady(env, terminal)) {
        return errorJson(`מסוף ${terminal === 'B' ? 'B מקדמות' : 'A יתרות'} לא מחובר.`, 503, 'HYP_MISSING');
      }
      try {
        const created = await createHypPaymentPage(env, {
          purpose: terminal === 'B' ? 'deposit' : 'balance',
          terminal,
          amount,
          order: token,
          clientName: booking.guest_name || 'Guest',
          email: booking.guest_email || '',
          cell: booking.guest_phone || '',
          info: [booking.guest_name, booking.unit_id, 'desk'].filter(Boolean).join(' · ').slice(0, 80),
          tokenize: true,
          sendHesh: false,
          invoice: false,
          lockTerminal: true,
          lpTimeoutMs: 20000
        });
        const payUrl = created.payUrl || created.iframeUrl || '';
        if (!payUrl) return errorJson('לא נפתח דף סליקה במסוף', 422, 'CHARGE_FAILED');
        await persistGuestRow(env, token, {
          ...booking,
          checkout_token: token,
          hyp_terminal: terminal,
          stay: {
            ...stayOf(booking),
            hyp_terminal: terminal,
            hyp_intent: {
              purpose: terminal === 'B' ? 'deposit' : 'balance',
              terminal,
              stage: 'desk',
              amount,
              status: 'redirected',
              at: new Date().toISOString(),
              lowProfileId: created.lowProfileId || ''
            }
          }
        }).catch(() => null);
        return json({ payUrl, checkout_token: token, terminal, booking: publicStay({ ...booking, checkout_token: token }, replica?.units || []) });
      } catch (err) {
        const code = Number(err?.hypCode);
        const raw = String(err?.message || '').slice(0, 160);
        let message = raw || 'לא נפתח דף סליקה במסוף';
        if (err?.code === 'HYP_AMOUNT') message = 'מלאו סכום לחיוב גדול מחצי שקל.';
        else if (code === 603 || /603/.test(raw)) {
          message = raw && !/^CCode=/i.test(raw)
            ? `Cardcom דחה את הסליקה (603): ${raw}`
            : 'Cardcom דחה את דף הסליקה (603). נסו מסוף B אם A נכשל.';
        } else if (code === 902 || /CCode=902/i.test(raw)) {
          message = 'מסוף Hyp דחה את החתימה הישנה. רעננו את הדף ונסו שוב.';
        } else if (Number.isFinite(code) && code !== 0) {
          message = `Hyp לא פתח סליקה (${code}).`;
        } else if (/timeout|aborted|FETCH_FAILED|HYP_LP|LP_FAILED/i.test(`${err?.code || ''} ${raw}`)) {
          message = 'Cardcom לא החזיר דף סליקה בזמן. נסו שוב.';
        }
        return errorJson(message, 422, 'CHARGE_FAILED');
      }
    }

    return errorJson('Not found', 404, 'NOT_FOUND');
  } catch (err) {
    return errorJson(String(err?.message || err).slice(0, 180) || 'לא הצלחנו לטעון את הדלפק. רעננו ונסו שוב.', 500, 'DESK_CRASH');
  }
}
