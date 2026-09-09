import { israelToday } from './cabinAccess';
import { isInventoryUnit } from './units';
import { isEffectivelyOccupied, isExpiredPendingInspect, unitOpsChoice } from './unitStatus';

function inspectedReadyToday(unit, today) {
  if (unit?.operational_status !== 'READY') return false;
  const inspections = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  const last = inspections[inspections.length - 1];
  if (!last || last.reopened) return false;
  return israelToday(new Date(last.at)) === today;
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
    updated_at: nowIso
  });
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

export async function applyCalendarUnitStatus({ tenantId, unit, status, pushUnitToCloud }) {
  if (!tenantId || !unit?.id || typeof pushUnitToCloud !== 'function') return;
  if (status === 'READY') {
    await markCabinCleanedForInspection({ tenantId, unit, pushUnitToCloud });
    return;
  }
  if (status === 'DIRTY') {
    await reopenCabinCleaning({ tenantId, unit, pushUnitToCloud });
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
  });
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
  });
}

export function turnoverNeed(unit, bookings, today = israelToday()) {
  if (!isInventoryUnit(unit)) return null;
  if (unit.operational_status === 'MAINTENANCE_ALERT' || unit.operational_status === 'GARDENING') return null;
  if (unit.operational_status === 'IN_PROGRESS' || unit.operational_status === 'DIRTY') return null;
  if (inspectedReadyToday(unit, today)) return null;

  const active = (bookings || []).filter((row) => (
    row.unit_id === unit.id &&
    !row.deleted_at &&
    row.booking_status !== 'CANCELED'
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
  if (unit.updated_at && israelToday(new Date(unit.updated_at)) === today) return false;
  if (isEffectivelyOccupied(unit, bookings, today)) return true;
  const active = (bookings || []).filter((row) => (
    row.unit_id === unit.id &&
    !row.deleted_at &&
    row.booking_status !== 'CANCELED'
  ));
  const todayMove = active.some((row) => row.check_out_date === today || row.check_in_date === today);
  return !todayMove;
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
    const need = turnoverNeed(unit, bookings, today);
    if (!need) continue;
    if (unit.operational_status === 'DIRTY' && unit.custom_reason === need.reason) continue;
    await pushUnitToCloud({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name,
      operational_status: 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: need.reason,
      is_escalated: false,
      cleaning_started_at: null,
      updated_at: nowIso
    });
  }
}
