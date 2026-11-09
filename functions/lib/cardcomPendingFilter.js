/**
 * Cardcom "unassigned terminal deals" filter (server-side only).
 *
 * Rule (Ran): a Cardcom deal counts as unassigned ONLY if it has
 *   - no assigned booking (no selected_booking_id, not linked in cardcom_seen_deals / clearing_payments), AND
 *   - no Cardcom document (document_number / invoice_number).
 * Deals paid through a booking payment link (LowProfile) on the shared terminal 184288 already
 * carry a Cardcom document, so they are never unassigned. Same for ₪1 tests that were invoiced.
 *
 * Cancellations / refunds: when a cancel/refund shares the original charge's Cardcom
 * transaction id, RRN, or approval number, BOTH the original charge and the cancel drop
 * from the unassigned list.
 */

export function hasCardcomDocument(match) {
  if (!match) return false;
  return Boolean(String(match.document_number || match.invoice_number || match.documentNumber || '').trim());
}

function dealKeys(row) {
  const keys = new Set();
  for (const k of [
    row?.deal_id,
    row?.dealId,
    row?.original_deal_id,
    row?.originalDealId,
    row?.rrn,
    row?.RRN,
    row?.shva_rrn,
    row?.approval,
    row?.approval_number,
    row?.approvalNumber
  ]) {
    const v = String(k || '').trim();
    if (v) keys.add(v);
  }
  return keys;
}

/**
 * Build a set of deal ids / RRNs / approvals that are cancelled or that cancel another deal.
 * @param {Array} cancelRows rows with is_refund/is_cancel or status cancelled/refunded
 */
export function cancelledDealKeySet(cancelRows = []) {
  const keys = new Set();
  for (const row of Array.isArray(cancelRows) ? cancelRows : []) {
    for (const k of dealKeys(row)) keys.add(k);
  }
  return keys;
}

export function isCancelledByPair(match, cancelledKeys) {
  if (!match || !cancelledKeys || typeof cancelledKeys.has !== 'function' || cancelledKeys.size === 0) {
    return false;
  }
  for (const k of dealKeys(match)) {
    if (cancelledKeys.has(k)) return true;
  }
  return false;
}

export function isUnassignedPendingMatch(match, { linkedDealIds, cancelledKeys } = {}) {
  if (!match || match.status !== 'pending') return false;
  if (String(match.selected_booking_id || '').trim()) return false;
  if (hasCardcomDocument(match)) return false;
  const id = String(match.deal_id || match.dealId || '').trim();
  if (!id) return false;
  if (linkedDealIds && typeof linkedDealIds.has === 'function' && linkedDealIds.has(id)) return false;
  if (isCancelledByPair(match, cancelledKeys)) return false;
  return true;
}

export function filterUnassignedPendingMatches(list, options = {}) {
  return (Array.isArray(list) ? list : []).filter((m) => isUnassignedPendingMatch(m, options));
}

/** Deal ids already recorded as linked (seen rows with status 'linked' or a linked_booking_id). */
export function linkedDealIdsFromSeen(seenRows) {
  const ids = new Set();
  for (const s of Array.isArray(seenRows) ? seenRows : []) {
    const id = String(s?.deal_id || '').trim();
    if (!id) continue;
    if (s.status === 'linked' || String(s.linked_booking_id || '').trim()) ids.add(id);
  }
  return ids;
}

/** Keys from seen rows marked cancelled/refunded (and orig:/rrn: tags in entry_mode). */
export function cancelledKeysFromSeen(seenRows) {
  const rows = [];
  for (const s of Array.isArray(seenRows) ? seenRows : []) {
    const st = String(s?.status || '').toLowerCase();
    const isCancel = st === 'cancelled' || st === 'canceled' || st === 'refunded' || st === 'credit' || s?.is_refund || s?.is_cancel;
    if (!isCancel) continue;
    const enriched = { ...s };
    const mode = String(s?.entry_mode || '');
    for (const part of mode.split('|')) {
      if (part.startsWith('orig:')) enriched.original_deal_id = part.slice(5);
      if (part.startsWith('rrn:')) enriched.rrn = part.slice(4);
    }
    if (s?.approval_number && !enriched.approval) enriched.approval = s.approval_number;
    rows.push(enriched);
  }
  return cancelledDealKeySet(rows);
}
