// Central cancellation policy (DRAFT). NOT wired into guest pages, Chloe, charging or bookings.
import policyDoc from '../../config/policies/cancellation-policy.json' with { type: 'json' };
import { israelDateTime } from './stayAccess.js';

export const POLICY = policyDoc;

export function getPolicyVersion(version, doc = POLICY) {
  return doc.versions.find((v) => v.version === version) || null;
}

/** Version a booking is bound to: the one stored on the booking, never re-resolved retroactively. */
export function policyForBooking(booking, doc = POLICY) {
  const pinned = booking?.cancellation_policy_version;
  if (pinned) return getPolicyVersion(pinned, doc);
  return null; // legacy bookings have no pinned policy -> handled manually
}

export function decisiveArrivalAt(checkInYmd, checkinTime, v) {
  return israelDateTime(checkInYmd, checkinTime || v?.decisive_arrival?.default_checkin_time || '15:00');
}

export function hoursBeforeArrival(arrivalAt, cancelAt) {
  return (arrivalAt.getTime() - cancelAt.getTime()) / 3600000;
}

function inTier(t, h) {
  const lowOk = t.min_exclusive ? h > t.min_hours_before : h >= t.min_hours_before;
  if (!lowOk) return false;
  if (t.max_hours_before == null) return true;
  return t.max_inclusive ? h <= t.max_hours_before : h < t.max_hours_before;
}

/**
 * Pure quote. Returns { status, tierId, feePercent, fee, refund }.
 * status: 'CHARGE' | 'REQUIRES_MANAGER_APPROVAL'. Never charges anything itself.
 */
export function quoteCancellation({ version, total, checkInYmd, checkinTime, cancelAt, exception }, doc = POLICY) {
  const v = typeof version === 'object' ? version : getPolicyVersion(version, doc);
  if (!v) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'NO_POLICY_VERSION' };
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount < 0) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'BAD_TOTAL' };
  if (exception) {
    const ex = v.exceptions.find((e) => e.id === exception);
    return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'EXCEPTION', exceptionId: ex?.id || exception, proposedRefund: ex ? amount : null };
  }
  const arrival = decisiveArrivalAt(checkInYmd, checkinTime, v);
  if (!arrival) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'BAD_ARRIVAL' };
  const h = hoursBeforeArrival(arrival, cancelAt);
  if (h < 0) return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'NO_SHOW_UNDEFINED', hoursBefore: h };
  const tier = v.tiers.find((t) => inTier(t, h));
  if (!tier || tier.requires_manager_approval || tier.fee_percent == null) {
    return { status: 'REQUIRES_MANAGER_APPROVAL', reason: 'UNDEFINED_WINDOW', tierId: tier?.id || null, hoursBefore: h, autoCharge: false };
  }
  const fee = Math.round(amount * tier.fee_percent) / 100;
  return { status: 'CHARGE', tierId: tier.id, feePercent: tier.fee_percent, fee, refund: Math.round((amount - fee) * 100) / 100, hoursBefore: h };
}
