/**
 * Cardcom "unassigned terminal deals" filter (server-side only).
 *
 * Rule (Ran): a Cardcom deal counts as unassigned ONLY if it has
 *   - no assigned booking (no selected_booking_id, not linked in cardcom_seen_deals / clearing_payments), AND
 *   - no Cardcom document (document_number / invoice_number).
 * Deals paid through a booking payment link (LowProfile) on the shared terminal 184288 already
 * carry a Cardcom document, so they are never unassigned. Same for ₪1 tests that were invoiced.
 */

export function hasCardcomDocument(match) {
  if (!match) return false;
  return Boolean(String(match.document_number || match.invoice_number || match.documentNumber || '').trim());
}

export function isUnassignedPendingMatch(match, { linkedDealIds } = {}) {
  if (!match || match.status !== 'pending') return false;
  if (String(match.selected_booking_id || '').trim()) return false;
  if (hasCardcomDocument(match)) return false;
  const id = String(match.deal_id || match.dealId || '').trim();
  if (!id) return false;
  if (linkedDealIds && typeof linkedDealIds.has === 'function' && linkedDealIds.has(id)) return false;
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
