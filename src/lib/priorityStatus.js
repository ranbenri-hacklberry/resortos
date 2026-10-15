import { applyAssignedStaff, applyCalendarOccupancy, applyCalendarUnitStatus } from './housekeepingCycle';
import { UNIT_OPS_CHOICES, UNIT_STATUS_BADGES, unitOpsChoice } from './unitStatus';

export const LODGING_CHOICES = [
  { key: 'OCCUPIED', label: 'תפוס' },
  { key: 'VACANT', label: 'פנוי' }
];

export const CLEANING_CHOICES = UNIT_OPS_CHOICES.map((choice) => ({
  key: choice.key,
  label: UNIT_STATUS_BADGES[choice.key]?.label || choice.hint
}));

const SAVE_OPTIONS = { waitRemote: true, throwOnError: true };

export function lodgingKey(unit) {
  return unit?.staff_occupancy === 'OCCUPIED' ? 'OCCUPIED' : 'VACANT';
}

export function lodgingLabel(key) {
  return LODGING_CHOICES.find((choice) => choice.key === key)?.label || 'פנוי';
}

export function cleaningKey(unit) {
  return unitOpsChoice(unit?.operational_status) ? unit.operational_status : '';
}

export function cleaningLabel(key) {
  return CLEANING_CHOICES.find((choice) => choice.key === key)?.label || '';
}

function withCleanerOverride(unit, draft) {
  const next = { ...(draft || {}) };
  const assigning = String(next.staff || '').trim() && next.staff !== (unit?.assigned_staff || '');
  if (!assigning) return next;
  const cleanNow = next.clean || cleaningKey(unit);
  if (cleanNow === 'READY') next.clean = 'DIRTY';
  return next;
}

export async function savePriorityStatusDrafts({ tenantId, units, drafts, pushUnitToCloud }) {
  const saved = [];
  const failed = [];
  for (const [unitId, draft] of Object.entries(drafts || {})) {
    const unit = (units || []).find((row) => row.id === unitId);
    if (!unit) {
      failed.push({ unitId, error: 'היחידה לא נמצאה', remain: { ...draft } });
      continue;
    }
    const nextDraft = withCleanerOverride(unit, draft);
    const remain = {};
    let error = '';
    if (nextDraft.weekMark === 'ready' || nextDraft.weekMark === 'inspect') {
      try {
        if (nextDraft.weekMark === 'ready') {
          await pushUnitToCloud({
            id: unit.id,
            tenant_id: tenantId,
            name: unit.name,
            operational_status: 'READY',
            operational_domain: 'HOUSEKEEPING',
            custom_reason: 'מוכן לאורח',
            is_escalated: false,
            cleaning_started_at: null,
            updated_at: new Date().toISOString()
          }, SAVE_OPTIONS);
        } else {
          await applyCalendarUnitStatus({
            tenantId,
            unit,
            status: 'READY',
            pushUnitToCloud,
            saveOptions: SAVE_OPTIONS
          });
        }
      } catch (err) {
        remain.clean = 'READY';
        remain.weekMark = nextDraft.weekMark;
        error = err?.message || 'השמירה נכשלה';
      }
    } else if (nextDraft.clean && nextDraft.clean !== cleaningKey(unit)) {
      try {
        await applyCalendarUnitStatus({
          tenantId,
          unit,
          status: nextDraft.clean,
          pushUnitToCloud,
          saveOptions: SAVE_OPTIONS
        });
      } catch (err) {
        remain.clean = nextDraft.clean;
        if (nextDraft.weekMark) remain.weekMark = nextDraft.weekMark;
        error = err?.message || 'השמירה נכשלה';
      }
    }
    if (nextDraft.stay && nextDraft.stay !== lodgingKey(unit)) {
      try {
        await applyCalendarOccupancy({
          tenantId,
          unit,
          occupancy: nextDraft.stay,
          pushUnitToCloud,
          saveOptions: SAVE_OPTIONS
        });
      } catch (err) {
        remain.stay = nextDraft.stay;
        error = error || err?.message || 'השמירה נכשלה';
      }
    }
    if (nextDraft.staff != null && nextDraft.staff !== (unit.assigned_staff || '')) {
      try {
        await applyAssignedStaff({
          tenantId,
          unit,
          assignedStaff: nextDraft.staff,
          pushUnitToCloud,
          saveOptions: SAVE_OPTIONS
        });
      } catch (err) {
        remain.staff = nextDraft.staff;
        error = error || err?.message || 'השמירה נכשלה';
      }
    }
    if (remain.clean || remain.stay || remain.weekMark || remain.staff != null) {
      failed.push({ unitId, name: unit.name || unitId, error: error || 'השמירה נכשלה', remain });
    } else {
      saved.push(unitId);
    }
  }
  return { saved, failed };
}
