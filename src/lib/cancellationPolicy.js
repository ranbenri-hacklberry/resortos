// Central cancellation policy (DRAFT). NOT wired into guest pages, Chloe, charging or bookings.
import policyDoc from '../../config/policies/cancellation-policy.json' with { type: 'json' };
import { israelDateTime } from './stayAccess.js';

export const POLICY = policyDoc;
export const DEFAULT_CHECKIN = '15:00';

export function getPolicyVersion(version, doc = POLICY) {
  return doc.versions.find((v) => v.version === version) || null;
}

/** Version a booking is bound to: the one stored on the booking, never re-resolved retroactively. */
export function policyForBooking(booking, doc = POLICY) {
  const pinned = booking?.cancellation_policy_version;
  return pinned ? getPolicyVersion(pinned, doc) : null;
}

function minusDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Boundary instant: (check-in date − N calendar days) at check-in hour, Asia/Jerusalem. */
export function boundaryAt(checkInYmd, days, checkinTime) {
  return israelDateTime(minusDays(checkInYmd, days), checkinTime || DEFAULT_CHECKIN);
}

export function decisiveArrivalAt(checkInYmd, checkinTime) {
  return boundaryAt(checkInYmd, 0, checkinTime);
}

/**
 * Pure quote. Returns { status, tierId, feePercent, fee, refund }.
 * status: 'CHARGE' | 'REQUIRES_MANAGER_APPROVAL'. Never charges anything itself.
 * checkinTime: booking's check-in hour if set, else 15:00.
 */
export function quoteCancellation({ version, total, checkInYmd, checkinTime, cancelAt, exception, noShow }, doc = POLICY) {
  const v = typeof version === 'object' ? version : getPolicyVersion(version, doc);
  if (!v) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'NO_POLICY_VERSION' };
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount < 0) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'BAD_TOTAL' };
  if (exception) {
    const ex = v.exceptions.find((e) => e.id === exception);
    return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'EXCEPTION', exceptionId: ex?.id || exception, proposedRefund: ex ? amount : null };
  }
  const charge = (tierId, pct, extra = {}) => {
    const fee = Math.round(amount * pct) / 100;
    return { status: 'CHARGE', tierId, feePercent: pct, fee, refund: Math.round((amount - fee) * 100) / 100, ...extra };
  };
  const arrival = decisiveArrivalAt(checkInYmd, checkinTime);
  if (!arrival || !(cancelAt instanceof Date)) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'BAD_INPUT' };
  const hoursBefore = (arrival - cancelAt) / 3600000;
  if (noShow || cancelAt >= arrival) {
    if (!v.no_show?.defined) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'NO_SHOW_UNDEFINED' };
    return charge('no_show', v.no_show.fee_percent, { hoursBefore });
  }
  // tiers ordered by min_days_before desc; cancel at or before boundary(min) qualifies.
  const tiers = [...v.tiers].sort((a, b) => b.min_days_before - a.min_days_before);
  for (const t of tiers) {
    if (t.fee_percent == null || t.min_days_before == null) continue;
    const b = boundaryAt(checkInYmd, t.min_days_before, checkinTime);
    if (cancelAt <= b) return charge(t.id, t.fee_percent, { hoursBefore });
  }
  return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'NO_TIER' };
}
