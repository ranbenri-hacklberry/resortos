import { db } from '../../lib/resortos-db';
import { pushBookingToCloud, pushUnitToCloud } from '../../lib/cloudDb';
import { applyAssignedStaff, applyCalendarOccupancy, applyCalendarUnitStatus, lastInspectionRecord, openTurnoverAfterCheckout, reopenCabinCleaning } from '../../lib/housekeepingCycle';

function pushUnit(patch, options) {
  return pushUnitToCloud(patch, { waitRemote: true, skipStayPublish: true, force: true, ...options });
}

export async function setCabinHouseStatus({ tenantId, cabin, kind }) {
  const unit = cabin?.unit || { id: cabin?.id, name: cabin?.displayName, tenant_id: tenantId };
  if (!tenantId || !unit?.id) return;
  if (kind === 'dirty') {
    await applyCalendarUnitStatus({ tenantId, unit, status: 'DIRTY', pushUnitToCloud: pushUnit });
    return;
  }
  if (kind === 'inspection') {
    await applyCalendarUnitStatus({ tenantId, unit, status: 'READY', pushUnitToCloud: pushUnit });
    return;
  }
  if (kind === 'ready') {
    const prev = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
    await pushUnit({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name || cabin.displayName,
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: '',
      is_escalated: false,
      cleaning_started_at: null,
      quality_inspections: [
        ...prev,
        {
          at: new Date().toISOString(),
          ratings: { clean: 5 },
          note: 'אושר בחמ״ל',
          failed_fields: [],
          reopened: false,
          source: 'command',
        },
      ],
    });
  }
}

export async function toggleCabinStay({ tenantId, cabin }) {
  const booking = cabin?.booking;
  const unit = cabin?.unit || { id: cabin?.id, name: cabin?.displayName, tenant_id: tenantId };
  if (!tenantId || !booking?.id) return;
  const nowIso = new Date().toISOString();
  if (booking.booking_status === 'CHECKED_IN') {
    const next = {
      ...booking,
      booking_status: 'CHECKED_OUT',
      stay: { ...(booking.stay || {}), manager_checked_out_at: nowIso },
      updated_at: nowIso,
    };
    await db.bookings.put(next);
    await pushBookingToCloud(next, { allowOverlap: true });
    await openTurnoverAfterCheckout({ tenantId, unit, pushUnitToCloud: pushUnit, skipStayPublish: true });
    return;
  }
  const next = {
    ...booking,
    booking_status: 'CHECKED_IN',
    stay: { ...(booking.stay || {}), guest_checked_in_at: booking.stay?.guest_checked_in_at || nowIso },
    updated_at: nowIso,
  };
  await db.bookings.put(next);
  await pushBookingToCloud(next, { allowOverlap: true });
  await applyCalendarOccupancy({ tenantId, unit, occupancy: 'OCCUPIED', pushUnitToCloud: pushUnit });
}

function unitOf(cabin, tenantId) {
  return cabin?.unit || { id: cabin?.id, name: cabin?.displayName, tenant_id: tenantId };
}

async function saveBooking(booking, patch) {
  const next = {
    ...booking,
    ...patch,
    stay: { ...(booking.stay || {}), ...(patch.stay || {}) },
    updated_at: new Date().toISOString(),
  };
  await db.bookings.put(next);
  await pushBookingToCloud(next, { allowOverlap: true });
  return next;
}

export async function runCabinStep({ tenantId, cabin, action }) {
  const unit = unitOf(cabin, tenantId);
  if (!tenantId || !unit?.id) return;
  if (action === 'checkout' || action === 'checkin') {
    await toggleCabinStay({ tenantId, cabin });
    return;
  }
  if (String(action).startsWith('assign:')) {
    const name = decodeURIComponent(String(action).slice('assign:'.length));
    await applyAssignedStaff({ tenantId, unit, assignedStaff: name, pushUnitToCloud: pushUnit });
    return;
  }
  if (action === 'finish-clean') {
    const cleaner = String(cabin?.day?.staff || cabin?.cleanerName || unit.assigned_staff || '').trim();
    if (!cleaner) return;
    await applyCalendarUnitStatus({ tenantId, unit, status: 'READY', pushUnitToCloud: pushUnit });
    return;
  }
  if (action === 'approve') {
    await setCabinHouseStatus({ tenantId, cabin, kind: 'ready' });
    return;
  }
  if (action === 'undo-start') {
    await reopenCabinCleaning({ tenantId, unit, pushUnitToCloud: pushUnit });
    return;
  }
  if (action === 'undo-finish' || action === 'undo-ready') {
    const prev = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
    const last = lastInspectionRecord(unit);
    const inspections = last
      ? prev.map((row) => (row === last ? { ...row, reopened: true } : row))
      : prev;
    if (action === 'undo-ready') {
      await pushUnit({
        id: unit.id,
        tenant_id: tenantId,
        name: unit.name || cabin.displayName,
        operational_status: 'READY',
        operational_domain: 'HOUSEKEEPING',
        custom_reason: 'ממתין לביקורת מנהל',
        is_escalated: false,
        cleaning_started_at: null,
        quality_inspections: inspections,
      });
      return;
    }
    await pushUnit({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name || cabin.displayName,
      operational_status: 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה',
      is_escalated: false,
      cleaning_started_at: null,
      assigned_staff: null,
      quality_inspections: inspections,
    });
    return;
  }
  if (action === 'undo-checkout') {
    const booking = cabin.day?.departingBooking;
    if (!booking || booking.booking_status !== 'CHECKED_OUT') return;
    if (cabin.day?.arrivingBooking?.booking_status === 'CHECKED_IN') return;
    await saveBooking(booking, {
      booking_status: 'CHECKED_IN',
      stay: { manager_checked_out_at: null },
    });
    await applyCalendarOccupancy({ tenantId, unit, occupancy: 'OCCUPIED', pushUnitToCloud: pushUnit });
    await pushUnit({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name || cabin.displayName,
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: '',
      is_escalated: false,
      cleaning_started_at: null,
    });
    return;
  }
  if (action === 'undo-checkin') {
    const booking = cabin.day?.arrivingBooking || cabin.booking;
    if (!booking || booking.booking_status !== 'CHECKED_IN') return;
    await saveBooking(booking, {
      booking_status: 'CONFIRMED',
      stay: { guest_checked_in_at: null },
    });
    await applyCalendarOccupancy({ tenantId, unit, occupancy: 'VACANT', pushUnitToCloud: pushUnit });
    return;
  }
  const arriving = cabin.day?.arrivingBooking;
  if (!arriving) return;
  if (action === 'bed-done') {
    await saveBooking(arriving, {
      stay: { bed_prep_done: true, bed_prep_at: new Date().toISOString() },
    });
    return;
  }
  if (String(action).startsWith('bed-setup:')) {
    const setupId = String(action).slice('bed-setup:'.length);
    if (!setupId) return;
    await saveBooking(arriving, { stay: { bed_setup: setupId, bed_prep_done: false } });
  }
}
