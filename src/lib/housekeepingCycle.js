import { israelToday } from './cabinAccess';
import { db } from './resortos-db';
import { allCompletionsDone, completionsFromUnit, completionsReason, NEEDS_COMPLETIONS, writeCompletionsIntoSop } from './roomCompletions';
import { isUnavailableHoldBooking } from './unavailableHold';
import { isInventoryUnit } from './units';
import { isEffectivelyOccupied, isExpiredPendingInspect, unitOpsChoice } from './unitStatus';

function inspectedReadyToday(unit, today) {
  if (unit?.operational_status !== 'READY') return false;
  const inspections = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  const last = inspections[inspections.length - 1];
  if (!last || last.reopened) return false;
  return israelToday(new Date(last.at)) === today;
}

function hasSameDayCleanMark(unit, today) {
  if (inspectedReadyToday(unit, today)) return true;
  const inspections = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  const last = inspections[inspections.length - 1];
  if (!last || last.reopened || !isCalendarCleanMark(last)) return false;
  return israelToday(new Date(last.at)) === today;
}

function staffHeldCleanToday(unit, today) {
  if (hasSameDayCleanMark(unit, today)) return true;
  if (unit?.operational_status !== 'READY' && unit?.operational_status !== NEEDS_COMPLETIONS) return false;
  return Boolean(unit.updated_at && israelToday(new Date(unit.updated_at)) === today);
}

async function freshUnit(unit) {
  if (!unit?.id) return unit;
  try {
    const row = await db.units.get(unit.id);
    return row || unit;
  } catch (_) {
    return unit;
  }
}

export function isReadyForArrival(unit, today = israelToday()) {
  return inspectedReadyToday(unit, today);
}

export function isCalendarCleanMark(inspection) {
  return Boolean(inspection && (inspection.source === 'calendar' || inspection.note === 'סומן נקי מהיומן'));
}

export function isManagerInspection(inspection) {
  if (!inspection || inspection.reopened || isCalendarCleanMark(inspection)) return false;
  const ratings = inspection.ratings && typeof inspection.ratings === 'object' ? inspection.ratings : {};
  return Object.values(ratings).some((value) => Number(value) > 0);
}

export function lastInspectionRecord(unitOrTask) {
  if (Array.isArray(unitOrTask?.qualityInspections) && unitOrTask.qualityInspections.length) {
    return unitOrTask.qualityInspections[unitOrTask.qualityInspections.length - 1];
  }
  if (unitOrTask?.lastInspection) return unitOrTask.lastInspection;
  const list = Array.isArray(unitOrTask?.quality_inspections) ? unitOrTask.quality_inspections : [];
  return list.length ? list[list.length - 1] : null;
}

/** Manager already passed the cabin — drop it from ops tasks, keep arrivals on the daily board. */
export function passedManagerInspection(unitOrTask) {
  return isManagerInspection(lastInspectionRecord(unitOrTask));
}

export async function markCabinCleanedForInspection({ tenantId, unit, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  const nowIso = new Date().toISOString();
  const prev = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: 'READY',
    operational_domain: 'HOUSEKEEPING',
    custom_reason: 'ממתין לביקורת מנהל',
    is_escalated: false,
    cleaning_started_at: null,
    quality_inspections: [
      ...prev,
      {
        at: nowIso,
        ratings: {},
        note: 'סומן נקי מהיומן',
        failed_fields: [],
        reopened: false,
        source: 'calendar'
      }
    ],
    sop_progress: unit.sop_progress,
    updated_at: nowIso
  }, { force: true, waitRemote: true });
}

export async function applyCalendarOccupancy({ tenantId, unit, occupancy, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  const next = occupancy === 'OCCUPIED' ? 'OCCUPIED' : occupancy === 'VACANT' ? 'VACANT' : null;
  if (!next) return;
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    staff_occupancy: next,
    updated_at: new Date().toISOString()
  });
}

export async function applyAssignedStaff({ tenantId, unit, assignedStaff, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  const name = String(assignedStaff || '').trim();
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    assigned_staff: name || null,
    updated_at: new Date().toISOString()
  });
}

export async function applyCalendarUnitStatus({ tenantId, unit, status, pushUnitToCloud, completions }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  if (status === 'READY') {
    await markCabinCleanedForInspection({ tenantId, unit, pushUnitToCloud });
    return;
  }
  if (status === 'DIRTY') {
    await reopenCabinCleaning({ tenantId, unit, pushUnitToCloud });
    return;
  }
  if (status === NEEDS_COMPLETIONS) {
    await persistRoomCompletions({
      tenantId,
      unit,
      items: completions == null ? completionsFromUnit(unit) : completions,
      pushUnitToCloud
    });
    return;
  }
  const choice = unitOpsChoice(status);
  if (!choice) return;
  const nowIso = new Date().toISOString();
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: choice.key,
    operational_domain: choice.domain,
    custom_reason: choice.reason,
    is_escalated: choice.key === 'MAINTENANCE_ALERT',
    cleaning_started_at: choice.key === 'IN_PROGRESS' ? nowIso : null,
    updated_at: nowIso
  }, { force: true, waitRemote: true });
}

export async function persistRoomCompletions({ tenantId, unit, items, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  const list = Array.isArray(items) ? items : completionsFromUnit(unit);
  const sop = writeCompletionsIntoSop(unit.sop_progress, list);
  if (allCompletionsDone(list)) {
    await markCabinCleanedForInspection({
      tenantId,
      unit: { ...unit, sop_progress: sop },
      pushUnitToCloud
    });
    return;
  }
  const nowIso = new Date().toISOString();
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: NEEDS_COMPLETIONS,
    operational_domain: 'HOUSEKEEPING',
    custom_reason: completionsReason(list),
    sop_progress: sop,
    is_escalated: false,
    cleaning_started_at: null,
    updated_at: nowIso
  }, { force: true, waitRemote: true });
}

export async function reopenCabinCleaning({ tenantId, unit, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: 'DIRTY',
    operational_domain: 'HOUSEKEEPING',
    custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה',
    is_escalated: false,
    cleaning_started_at: null,
    updated_at: new Date().toISOString()
  }, { force: true, waitRemote: true });
}

export function turnoverNeed(unit, bookings, today = israelToday()) {
  if (!isInventoryUnit(unit)) return null;
  if (unit.operational_status === 'MAINTENANCE_ALERT' || unit.operational_status === 'GARDENING') return null;
  if (unit.operational_status === 'IN_PROGRESS' || unit.operational_status === 'DIRTY') return null;
  if (unit.operational_status === NEEDS_COMPLETIONS) return null;
  // Already marked clean today (field/calendar) — never re-open dirty on refresh.
  if (staffHeldCleanToday(unit, today)) return null;
  if (inspectedReadyToday(unit, today)) return null;

  const active = (bookings || []).filter((row) => (
    row.unit_id === unit.id &&
    !row.deleted_at &&
    row.booking_status !== 'CANCELED' &&
    !isUnavailableHoldBooking(row)
  ));

  const stillInHouse = isEffectivelyOccupied(unit, bookings, today);
  if (stillInHouse) return null;

  const departingToday = active.some((row) => row.check_out_date === today);
  const arriving = active.some((row) => row.check_in_date === today);

  if (departingToday || arriving) {
    return { reason: 'ניקוי לאחר יציאה והכנה לכניסה' };
  }
  return null;
}

export function isStaleHousekeeping(unit, bookings, today = israelToday()) {
  if (!isInventoryUnit(unit)) return false;
  const ops = unit.operational_status;
  if (ops !== 'DIRTY' && ops !== 'IN_PROGRESS') return false;
  if (ops === 'MAINTENANCE_ALERT' || unit.operational_domain === 'MAINTENANCE') return false;
  const updatedToday = Boolean(unit.updated_at && israelToday(new Date(unit.updated_at)) === today);
  if (isEffectivelyOccupied(unit, bookings, today)) return !updatedToday;
  const active = (bookings || []).filter((row) => (
    row.unit_id === unit.id &&
    !row.deleted_at &&
    row.booking_status !== 'CANCELED' &&
    !isUnavailableHoldBooking(row)
  ));
  const todayMove = active.some((row) => row.check_out_date === today || row.check_in_date === today);
  if (todayMove) return false;
  if (updatedToday) return false;
  return true;
}

export async function sweepStaleHousekeeping({ tenantId, units, bookings, pushUnitToCloud }) {
  if (!tenantId || !Array.isArray(units) || typeof pushUnitToCloud !== 'function') return;
  const today = israelToday();
  const nowIso = new Date().toISOString();
  for (const unit of units) {
    if (!isStaleHousekeeping(unit, bookings, today)) continue;
    await pushUnitToCloud({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name,
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: '',
      is_escalated: false,
      cleaning_started_at: null,
      updated_at: nowIso
    });
  }
}

export async function openTurnoverAfterCheckout({ tenantId, unit, pushUnitToCloud, skipStayPublish = false }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  if (unit.operational_status === 'MAINTENANCE_ALERT') return;
  if (unit.operational_status === 'IN_PROGRESS' || unit.operational_status === 'DIRTY') return;
  if (unit.operational_status === NEEDS_COMPLETIONS) return;
  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: 'DIRTY',
    operational_domain: 'HOUSEKEEPING',
    custom_reason: 'ניקוי לאחר יציאה והכנה לכניסה',
    is_escalated: false,
    cleaning_started_at: null,
    updated_at: new Date().toISOString()
  }, { skipStayPublish });
}

export async function sweepExpiredPendingInspect({ tenantId, units, pushUnitToCloud }) {
  if (!tenantId || !Array.isArray(units) || typeof pushUnitToCloud !== 'function') return;
  const today = israelToday();
  const nowIso = new Date().toISOString();
  for (const unit of units) {
    if (!isInventoryUnit(unit) || !isExpiredPendingInspect(unit, today)) continue;
    const prev = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
    await pushUnitToCloud({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name,
      operational_status: 'READY',
      operational_domain: unit.operational_domain || 'HOUSEKEEPING',
      custom_reason: 'טופל',
      is_escalated: false,
      cleaning_started_at: null,
      quality_inspections: [
        ...prev,
        {
          at: nowIso,
          ratings: {},
          note: 'נסגר אוטומטית — עבר יום הביצוע ללא ביקורת מנהל',
          failed_fields: [],
          reopened: false,
          source: 'auto_expire'
        }
      ],
      updated_at: nowIso
    });
  }
}

export async function ensureTurnoverCleaning({ tenantId, units, bookings, pushUnitToCloud }) {
  if (!tenantId || !Array.isArray(units)) return;
  await sweepStaleHousekeeping({ tenantId, units, bookings, pushUnitToCloud });
  await sweepExpiredPendingInspect({ tenantId, units, pushUnitToCloud });
  const today = israelToday();
  const nowIso = new Date().toISOString();
  for (const unit of units) {
    const live = await freshUnit(unit);
    const need = turnoverNeed(live, bookings, today);
    if (!need) continue;
    if (staffHeldCleanToday(live, today)) continue;
    if (live.operational_status === 'DIRTY' && live.custom_reason === need.reason) continue;
    await pushUnitToCloud({
      id: live.id,
      tenant_id: tenantId,
      name: live.name,
      operational_status: 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: need.reason,
      is_escalated: false,
      cleaning_started_at: null,
      updated_at: nowIso
    });
  }
}
