/**
 * Record a Cardcom card payment on its ResortOS booking (hotelos_bookings), idempotently.
 *
 * Used by both writers of a guest-page (LowProfile) payment:
 *   - the Cloudflare guest checkout (webhook / return)  -> functions/api/checkout
 *   - the Studio terminal poller (ListTransactions)      -> server/syncCardcomTerminal.js
 *
 * Rules:
 * - Keyed by the exact Cardcom deal id. A deal is recorded on a booking at most once,
 *   no matter how many times (or from which side) it is reported.
 * - payment_status is recomputed from total − recorded payments. It is never downgraded.
 * - This module NEVER creates a Cardcom document. It only records the document number
 *   Cardcom already issued with the charge (LowProfile), so no invoice exists without a
 *   persisted receipt row.
 * - Writes use optimistic concurrency on updated_at so two writers cannot both append.
 * - Never log keys, tokens or document URLs.
 */

// Cardcom LowProfile UIDefinition.CustomFields ids (1–25, value ≤ 50 chars).
// ListTransactions returns them on the deal, so the poller can match exactly.
export const CARDCOM_REF_FIELD_IDS = Object.freeze({ token: 1, bookingId: 2, test: 3 });
export const CARDCOM_TEST_MARKER = 'TEST';
const MAX_FIELD_LEN = 50;
const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;

function cleanRef(value) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_FIELD_LEN);
}

export function buildCardcomRefCustomFields({ token, bookingId, test } = {}) {
  const fields = [];
  const t = cleanRef(token);
  const b = cleanRef(bookingId);
  if (t && TOKEN_RE.test(t)) fields.push({ Id: CARDCOM_REF_FIELD_IDS.token, Value: t });
  if (b && b !== t) fields.push({ Id: CARDCOM_REF_FIELD_IDS.bookingId, Value: b });
  if (test === true) fields.push({ Id: CARDCOM_REF_FIELD_IDS.test, Value: CARDCOM_TEST_MARKER });
  return fields;
}

/** Tolerant parser: Cardcom returns an array of {Id, Value}, but accept objects keyed by id too. */
export function parseCardcomCustomFields(raw) {
  const byId = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = Number(item?.Id ?? item?.id ?? item?.FieldId);
      const value = String(item?.Value ?? item?.value ?? '').trim();
      if (Number.isFinite(id) && value) byId.set(id, value);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const id = Number(String(key).replace(/\D/g, ''));
      const text = String(value ?? '').trim();
      if (Number.isFinite(id) && id > 0 && text) byId.set(id, text);
    }
  }
  const token = cleanRef(byId.get(CARDCOM_REF_FIELD_IDS.token));
  const bookingId = cleanRef(byId.get(CARDCOM_REF_FIELD_IDS.bookingId));
  const test = String(byId.get(CARDCOM_REF_FIELD_IDS.test) || '').toUpperCase() === CARDCOM_TEST_MARKER;
  return {
    token: TOKEN_RE.test(token) ? token : '',
    bookingId,
    test
  };
}

/** Exact booking reference carried by a normalized Cardcom deal (custom fields, then ReturnValue). */
export function cardcomBookingRef(deal) {
  const fields = deal?.customFields || parseCardcomCustomFields(deal?.CustomFields);
  const returnValue = cleanRef(deal?.returnValue);
  const token = fields.token || (TOKEN_RE.test(returnValue) ? returnValue : '');
  return { token, bookingId: fields.bookingId || '', test: Boolean(fields.test) };
}

export function hasCardcomBookingRef(ref) {
  return Boolean(ref && (ref.token || ref.bookingId));
}

function toAgorot(ils) {
  const n = Number(ils);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function paymentDealId(row) {
  return String(row?.deal_number || row?.txn || '').trim();
}

const STATUS_RANK = { UNPAID: 0, PENDING: 1, PENDING_CASH: 1, DEPOSIT_PAID: 2, PARTIAL: 2, PAID: 3 };

/** payment_status from total − recorded payments. Never downgrades an existing status. */
export function recomputePaymentFields(booking, { now } = {}) {
  const rows = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  const paid = rows.reduce((sum, r) => sum + (Number(r?.amount_agorot) || 0), 0);
  const total = Number(booking?.total_price_agorot) || 0;
  const current = String(booking?.payment_status || 'UNPAID').toUpperCase();
  let next = current;
  if (total > 0 && paid + 1 >= total) next = 'PAID';
  else if (paid > 0 && (STATUS_RANK[current] ?? 0) < STATUS_RANK.PARTIAL) next = 'PARTIAL';
  if ((STATUS_RANK[next] ?? 0) < (STATUS_RANK[current] ?? 0)) next = current;
  const out = {
    payment_status: next,
    balance_agorot: Math.max(0, total - paid),
    paid_agorot: paid
  };
  if (next === 'PAID') {
    out.balance_paid = true;
    out.balance_paid_at = booking?.balance_paid_at || now || new Date().toISOString();
    out.balance_payment_method = booking?.balance_payment_method || 'CREDIT_CARD';
  }
  return out;
}

/**
 * Pure: add (or complete) the Cardcom payment row on a booking.
 * payment: { dealId, amount (ILS), approval, last4, documentNumber, at, channel, payerName }
 */
export function applyCardcomBookingPayment(booking, payment, { now } = {}) {
  const dealId = String(payment?.dealId || '').trim();
  if (!dealId) {
    const err = new Error('CARDCOM_DEAL_ID_REQUIRED');
    err.code = 'CARDCOM_DEAL_ID_REQUIRED';
    throw err;
  }
  const at = payment.at || now || new Date().toISOString();
  const existing = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments.slice() : [];
  const idx = existing.findIndex((row) => paymentDealId(row) === dealId);
  const approval = String(payment.approval || '').trim();
  const last4 = String(payment.last4 || '').replace(/\D/g, '').slice(-4);
  const documentNumber = String(payment.documentNumber || '').trim();
  let changed = false;
  let entry;

  if (idx >= 0) {
    const prev = existing[idx];
    entry = {
      ...prev,
      approval: prev.approval || approval,
      ref: prev.ref || prev.approval || approval,
      last4: prev.last4 || last4,
      document_number: prev.document_number || prev.invoice || documentNumber,
      invoice: prev.invoice || prev.document_number || documentNumber
    };
    changed = ['approval', 'ref', 'last4', 'document_number', 'invoice'].some((k) => (entry[k] || '') !== (prev[k] || ''));
    existing[idx] = entry;
  } else {
    const amountAgorot = toAgorot(payment.amount);
    if (!(amountAgorot > 0)) {
      const err = new Error('CARDCOM_AMOUNT_REQUIRED');
      err.code = 'CARDCOM_AMOUNT_REQUIRED';
      throw err;
    }
    entry = {
      gateway: 'cardcom',
      channel: String(payment.channel || 'guest_page'),
      source: 'CARD',
      method: 'CARD',
      acquirer: 'CARDCOM',
      deal_number: dealId,
      txn: dealId,
      approval,
      ref: approval,
      last4,
      amount_agorot: amountAgorot,
      amount_ils: amountAgorot / 100,
      document_number: documentNumber,
      invoice: documentNumber,
      payer_name: String(payment.payerName || booking?.guest_name || ''),
      at,
      date: String(at).slice(0, 10),
      recorded_via: String(payment.recordedVia || 'cardcom_guest_page'),
      recorded_at: now || new Date().toISOString()
    };
    existing.push(entry);
    changed = true;
  }

  const next = { ...booking, clearing_payments: existing };
  const fields = recomputePaymentFields(next, { now });
  next.payment_status = fields.payment_status;
  if (fields.balance_paid) {
    next.balance_paid = true;
    next.balance_paid_at = fields.balance_paid_at;
    next.balance_payment_method = fields.balance_payment_method;
  }
  if (!next.payment_mode) next.payment_mode = 'CARD';
  if (!next.hyp_deal_id) next.hyp_deal_id = dealId;
  return {
    booking: next,
    entry,
    duplicate: idx >= 0,
    changed: changed || next.payment_status !== booking?.payment_status
  };
}

function bookingLookupPath(ref) {
  const token = cleanRef(ref?.token);
  const id = cleanRef(ref?.bookingId);
  const ors = [];
  if (token) ors.push(`checkout_token.eq.${token}`, `id.eq.${token}`);
  if (id) ors.push(`id.eq.${id}`, `checkout_token.eq.${id}`);
  if (!ors.length) return '';
  return `/hotelos_bookings?or=(${ors.join(',')})&deleted_at=is.null&select=*&limit=2`;
}

async function readJson(res) {
  if (!res) return null;
  try { return await res.json(); } catch { return null; }
}

/**
 * Load the booking, apply the payment, and PATCH it with optimistic concurrency.
 * restFetch(path, init) -> Response-like ({ ok, status, json() }) for PostgREST paths
 * starting with "/hotelos_bookings...".
 */
export async function recordCardcomPaymentOnBooking({ restFetch, ref, payment, maxAttempts = 4, now } = {}) {
  if (typeof restFetch !== 'function') return { ok: false, reason: 'NO_DB' };
  const path = bookingLookupPath(ref);
  if (!path) return { ok: false, reason: 'NO_BOOKING_REF' };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await restFetch(path, { method: 'GET' });
    if (!res?.ok) return { ok: false, reason: 'DB_READ_FAILED', status: res?.status || 0 };
    const rows = await readJson(res);
    const list = Array.isArray(rows) ? rows : [];
    const token = cleanRef(ref?.token);
    const booking = (token && list.find((r) => r.checkout_token === token)) || list[0];
    if (!booking?.id) return { ok: false, reason: 'BOOKING_NOT_FOUND' };

    const applied = applyCardcomBookingPayment(booking, payment, { now });
    if (!applied.changed) {
      return {
        ok: true,
        recorded: false,
        duplicate: true,
        bookingId: booking.id,
        paymentStatus: applied.booking.payment_status
      };
    }

    const stamp = now || new Date().toISOString();
    const guard = booking.updated_at
      ? `updated_at=eq.${encodeURIComponent(booking.updated_at)}`
      : 'updated_at=is.null';
    const patch = {
      clearing_payments: applied.booking.clearing_payments,
      payment_status: applied.booking.payment_status,
      payment_mode: applied.booking.payment_mode,
      hyp_deal_id: applied.booking.hyp_deal_id,
      updated_at: stamp
    };
    if (applied.booking.balance_paid) {
      patch.balance_paid = true;
      patch.balance_paid_at = applied.booking.balance_paid_at;
      patch.balance_payment_method = applied.booking.balance_payment_method;
    }
    const write = await restFetch(
      `/hotelos_bookings?id=eq.${encodeURIComponent(booking.id)}&${guard}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      }
    );
    if (!write?.ok) return { ok: false, reason: 'DB_WRITE_FAILED', status: write?.status || 0, bookingId: booking.id };
    const written = await readJson(write);
    if (Array.isArray(written) && written.length === 1) {
      return {
        ok: true,
        recorded: !applied.duplicate,
        duplicate: applied.duplicate,
        bookingId: booking.id,
        paymentStatus: applied.booking.payment_status
      };
    }
    // 0 rows: someone else updated the booking since we read it. Re-read and retry.
  }
  return { ok: false, reason: 'DB_CONFLICT' };
}
