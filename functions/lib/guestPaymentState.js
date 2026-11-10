/**
 * Paid state on the guest mailbox row is authoritative.
 *
 * A publish from ResortOS (e.g. a unit turning READY) rebuilds the stay snapshot from the
 * ResortOS booking, which may not know yet about a payment the guest just made on the guest
 * page. Such a publish may update operational fields, but it must never clear or downgrade
 * payment state that the mailbox row already holds.
 */

const STATUS_RANK = { UNPAID: 0, PENDING: 1, PENDING_CASH: 1, DEPOSIT_PAID: 2, PARTIAL: 2, PAID: 3 };

// Stay keys that carry payment state. buildStaySnapshot sends them as null when ResortOS
// does not have them, which used to wipe the mailbox copy.
export const STAY_PAYMENT_KEYS = Object.freeze([
  'hyp',
  'hyp_deposit',
  'hyp_intent',
  'hyp_card',
  'cabin_paid',
  'balance_paid',
  'payment_choice',
  'payment_proof',
  'checkin_quote'
]);

function rank(status) {
  const key = String(status || '').toUpperCase();
  return Object.prototype.hasOwnProperty.call(STATUS_RANK, key) ? STATUS_RANK[key] : null;
}

function isEmpty(value) {
  return value === null || value === undefined || value === false || value === '';
}

function isPaidObject(value) {
  return Boolean(value && typeof value === 'object' && value.paid === true);
}

function paymentKey(row) {
  return String(row?.deal_number || row?.txn || row?.idempotency_key || '').trim();
}

export function mergeClearingPayments(existingRows, incomingRows) {
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const existing = Array.isArray(existingRows) ? existingRows : [];
  if (!existing.length) return incoming.slice();
  const keys = new Set(incoming.map(paymentKey).filter(Boolean));
  const merged = incoming.slice();
  for (const row of existing) {
    const key = paymentKey(row);
    if (key && keys.has(key)) continue;
    if (!key && incoming.length) continue; // unkeyed legacy rows: trust the incoming list when it has any
    merged.push(row);
    if (key) keys.add(key);
  }
  return merged;
}

export function mailboxHasPayment(row) {
  if (!row) return false;
  return Boolean(
    row.payment_status === 'PAID'
    || row.payment_status === 'DEPOSIT_PAID'
    || row.payment_status === 'PARTIAL'
    || row.balance_paid
    || row.stay?.balance_paid
    || row.stay?.hyp?.paid
    || row.stay?.hyp_deposit?.paid
    || (Array.isArray(row.clearing_payments) && row.clearing_payments.length > 0)
  );
}

/** Returns `next` with any payment state from `existing` that `next` would have lost restored. */
export function protectPaymentState(existing, next) {
  if (!existing || !next) return next;
  const out = { ...next };

  const prevRank = rank(existing.payment_status);
  const nextRank = rank(out.payment_status);
  if (prevRank !== null && (nextRank === null ? !out.payment_status : nextRank < prevRank)) {
    out.payment_status = existing.payment_status;
  }
  if (existing.balance_paid && !out.balance_paid) {
    out.balance_paid = true;
    out.balance_paid_at = out.balance_paid_at || existing.balance_paid_at || null;
    out.balance_payment_method = out.balance_payment_method || existing.balance_payment_method || null;
  }
  if (existing.hyp_deal_id && !out.hyp_deal_id) out.hyp_deal_id = existing.hyp_deal_id;
  if (existing.payment && !out.payment) out.payment = existing.payment;
  out.clearing_payments = mergeClearingPayments(existing.clearing_payments, out.clearing_payments);

  const prevStay = existing.stay && typeof existing.stay === 'object' ? existing.stay : {};
  const stay = { ...(out.stay && typeof out.stay === 'object' ? out.stay : {}) };
  for (const key of STAY_PAYMENT_KEYS) {
    const before = prevStay[key];
    if (isEmpty(before)) continue;
    const after = stay[key];
    if (isEmpty(after) || (isPaidObject(before) && !isPaidObject(after))) {
      stay[key] = before;
    }
  }
  out.stay = stay;
  return out;
}
