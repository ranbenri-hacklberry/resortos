import { supabase } from './supabaseClient';
import { db } from './resortos-db';
import { israelToday } from './cabinAccess';

const OPEN_STATUSES = new Set(['DIRTY', 'MAINTENANCE_ALERT', 'GARDENING', 'IN_PROGRESS']);

function historyStatus(operationalStatus) {
  if (operationalStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (operationalStatus === 'READY') return 'DONE';
  return 'OPEN';
}

async function relatedBookingId(unit) {
  if (!unit?.id || !unit?.tenant_id) return null;
  try {
    const today = israelToday();
    const rows = await db.bookings.where('tenant_id').equals(unit.tenant_id).toArray();
    const active = rows.filter((row) => (
      row.unit_id === unit.id &&
      !row.deleted_at &&
      row.booking_status !== 'CANCELED'
    ));
    const departing = active.find((row) => (
      row.check_out_date === today || row.booking_status === 'CHECKED_OUT'
    ));
    if (departing?.id) return departing.id;
    const arriving = active.find((row) => row.check_in_date === today);
    if (arriving?.id) return arriving.id;
    const staying = active.find((row) => (
      today >= row.check_in_date && today < row.check_out_date
    ));
    return staying?.id || null;
  } catch (_) {
    return null;
  }
}

/**
 * Keeps unit_operations as the live snapshot and writes one resort_operations
 * row per job (open → in progress → done). A new job starts when a unit
 * leaves READY or has no current_operation_id.
 */
function actorFields(next, actor) {
  const name = actor?.name || next.assigned_staff || null;
  const id = actor?.id ? String(actor.id) : null;
  return { name, id };
}

export async function syncResortOperationHistory(prev, next, actor = null) {
  const tenantId = next?.tenant_id;
  const unitId = next?.id;
  if (!tenantId || !unitId || !next.operational_status) return next;
  const who = actorFields(next, actor);

  const prevStatus = prev?.operational_status || null;
  const nextStatus = next.operational_status;
  const prevOpen = OPEN_STATUSES.has(prevStatus);
  const nextOpen = OPEN_STATUSES.has(nextStatus);
  let operationId = next.current_operation_id || prev?.current_operation_id || null;
  if (prevStatus === 'READY' && nextOpen) operationId = null;

  if (!operationId) {
    try {
      const { data: openRow } = await supabase
        .from('resort_operations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('unit_id', unitId)
        .is('completed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openRow?.id) operationId = openRow.id;
    } catch (_) {}
  }

  const openingNew = nextOpen && !operationId;

  try {
    if (openingNew) {
      const bookingId = await relatedBookingId(next);
      const { data, error } = await supabase
        .from('resort_operations')
        .insert({
          tenant_id: tenantId,
          unit_id: unitId,
          booking_id: bookingId,
          domain: next.operational_domain || 'HOUSEKEEPING',
          status: historyStatus(nextStatus),
          reason: next.custom_reason || null,
          assigned_staff: who.name || next.assigned_staff || null,
          started_at: next.cleaning_started_at || (nextStatus === 'IN_PROGRESS' ? next.updated_at : null),
          sop_progress: next.sop_progress || {},
          quality_inspections: Array.isArray(next.quality_inspections) ? next.quality_inspections : [],
          rework_count: Number(next.rework_count) || 0,
          updated_at: next.updated_at || new Date().toISOString()
        })
        .select('id')
        .single();
      if (error) {
        console.warn('[RESORT OPERATION OPEN]', error.message);
      } else if (data?.id) {
        operationId = data.id;
      }
    } else if (operationId && nextOpen) {
      const { error } = await supabase
        .from('resort_operations')
        .update({
          status: historyStatus(nextStatus),
          domain: next.operational_domain || 'HOUSEKEEPING',
          reason: next.custom_reason || null,
          assigned_staff: who.name || next.assigned_staff || null,
          started_at: next.cleaning_started_at || null,
          sop_progress: next.sop_progress || {},
          quality_inspections: Array.isArray(next.quality_inspections) ? next.quality_inspections : [],
          rework_count: Number(next.rework_count) || 0,
          updated_at: next.updated_at || new Date().toISOString()
        })
        .eq('id', operationId);
      if (error) console.warn('[RESORT OPERATION UPDATE]', error.message);
    } else if (operationId && nextStatus === 'READY' && prevStatus !== 'READY') {
      const { error } = await supabase
        .from('resort_operations')
        .update({
          status: 'DONE',
          completed_at: next.updated_at || new Date().toISOString(),
          completed_by: who.id,
          completed_by_name: who.name,
          assigned_staff: who.name || next.assigned_staff || null,
          sop_progress: next.sop_progress || {},
          quality_inspections: Array.isArray(next.quality_inspections) ? next.quality_inspections : [],
          rework_count: Number(next.rework_count) || 0,
          updated_at: next.updated_at || new Date().toISOString()
        })
        .eq('id', operationId);
      if (error) console.warn('[RESORT OPERATION CLOSE]', error.message);
    } else if (!operationId && nextStatus === 'READY' && prevStatus !== 'READY') {
      const bookingId = await relatedBookingId(next);
      const { error } = await supabase
        .from('resort_operations')
        .insert({
          tenant_id: tenantId,
          unit_id: unitId,
          booking_id: bookingId,
          domain: next.operational_domain || 'HOUSEKEEPING',
          status: 'DONE',
          reason: next.custom_reason || null,
          assigned_staff: who.name || next.assigned_staff || null,
          completed_at: next.updated_at || new Date().toISOString(),
          completed_by: who.id,
          completed_by_name: who.name,
          started_at: next.cleaning_started_at || null,
          sop_progress: next.sop_progress || {},
          quality_inspections: Array.isArray(next.quality_inspections) ? next.quality_inspections : [],
          rework_count: Number(next.rework_count) || 0,
          updated_at: next.updated_at || new Date().toISOString()
        });
      if (error) console.warn('[RESORT OPERATION CLOSE INSERT]', error.message);
    }
  } catch (err) {
    console.warn('[RESORT OPERATION HISTORY]', err?.message || err);
  }

  return { ...next, current_operation_id: operationId || next.current_operation_id || null };
}
