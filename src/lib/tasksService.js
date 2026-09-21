import { supabase } from './supabaseClient';
import { pushUnitToCloud } from './cloudDb';
import { translateToAllLanguages } from './translator';
import { visibleInventory } from './units';
import { enrichTaskData, resolveFieldUnit } from './fieldUnitCatalog';

export const FIELD_TENANT_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Resolve a cabin/unit from spoken hints (property + number / Thai sign / aliases).
 */
export function resolveUnitForTask(units, hints = {}, spokenText = '') {
  const list = visibleInventory(units || []);
  const resolved = resolveFieldUnit(list, hints, spokenText);
  if (resolved?.unit) return resolved.unit;

  if (hints.unit_id) {
    const byId = list.find((row) => row.id === hints.unit_id);
    if (byId) return byId;
  }

  const num = hints.unit_number == null || hints.unit_number === '' ? null : Number(hints.unit_number);
  if (!Number.isFinite(num)) return null;

  const exact = list.filter((row) => {
    const name = String(row.name || '');
    return (
      new RegExp(`(?:בקתה|cabin|צימר|suite|סוויטה)\\s*${num}\\b`, 'i').test(name)
      || new RegExp(`(?:^|[^0-9])${num}(?:$|[^0-9])`).test(name)
    );
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const cabinish = exact.find((row) => /בקתה|cabin/i.test(row.name || ''));
    return cabinish || exact[0];
  }
  return null;
}

function statusForCategory(category, isIssue, unit) {
  const cat = String(category || 'general').toLowerCase();
  if (cat === 'inventory') {
    const keepDirty = unit?.operational_status === 'DIRTY' || unit?.operational_status === 'IN_PROGRESS';
    return {
      operational_status: keepDirty ? unit.operational_status : 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      prefix: 'חוסר: '
    };
  }
  if (cat === 'cleaning') {
    return {
      operational_status: 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      prefix: ''
    };
  }
  if (isIssue || cat === 'maintenance') {
    return {
      operational_status: 'MAINTENANCE_ALERT',
      operational_domain: 'MAINTENANCE',
      prefix: ''
    };
  }
  return {
    operational_status: 'DIRTY',
    operational_domain: 'HOUSEKEEPING',
    prefix: ''
  };
}

/**
 * Persist a voice-detected staff task onto the Field Ops board (unit_operations)
 * and best-effort into public.tasks when available.
 */
export async function createStaffTask({
  unit_number,
  unit_id,
  property_id,
  property_name,
  unit_label,
  title_he,
  title_translated,
  target_lang = 'th',
  category = 'general',
  priority = 'normal',
  is_issue = false,
  spoken_text = '',
  image_urls = null,
  units = [],
  tenantId = FIELD_TENANT_ID,
  actor = null
} = {}) {
  const title = String(title_he || '').trim();
  if (!title) throw new Error('EMPTY_TASK');

  const unit = resolveUnitForTask(units, {
    unit_id,
    unit_number,
    property_id,
    property_name,
    unit_label
  }, spoken_text || title);
  if (!unit?.id) throw new Error('UNIT_NOT_FOUND');

  const mapped = statusForCategory(category, is_issue, unit);
  let reason = title;
  if (mapped.prefix && !reason.startsWith('חוסר')) reason = `${mapped.prefix}${reason}`;
  if (priority === 'urgent' && !/דחוף|urgent/i.test(reason)) {
    reason = `דחוף · ${reason}`;
  }

  const enriched = enrichTaskData({
    unit_id: unit.id,
    unit_number,
    property_id,
    task_he: reason,
    task_translated: title_translated
  }, { units, spokenText: spoken_text || title });

  // Prefixed Thai sign so housekeepers spot the cabin quickly.
  if (enriched.thai_sign || enriched.thai_label) {
    const tag = [enriched.thai_sign, enriched.thai_label, enriched.sign_he]
      .filter(Boolean)
      .join(' ');
    if (tag && !reason.includes(tag)) {
      reason = `${tag} · ${reason}`;
    }
  }

  const reason_i18n = await translateToAllLanguages(reason, 'he');
  if (title_translated && target_lang) {
    reason_i18n[target_lang] = title_translated;
  }
  if (enriched.thai_label) {
    reason_i18n.th = reason_i18n.th
      ? `${enriched.thai_sign || ''} ${enriched.thai_label} · ${reason_i18n.th}`.trim()
      : `${enriched.thai_sign || ''} ${enriched.thai_label} · ${title_translated || title}`.trim();
  }

  const photos = Array.isArray(image_urls)
    ? image_urls.filter((url) => typeof url === 'string' && url.trim())
    : [];
  const nextImages = photos.length
    ? photos
    : (Array.isArray(unit.image_urls) ? unit.image_urls : []);

  await pushUnitToCloud({
    id: unit.id,
    tenant_id: tenantId,
    name: unit.name,
    operational_status: mapped.operational_status,
    operational_domain: mapped.operational_domain,
    custom_reason: reason,
    reason_i18n,
    text_source_lang: 'he',
    is_escalated: priority === 'urgent' || Boolean(is_issue),
    cleaning_started_at: mapped.operational_status === 'DIRTY' ? (unit.cleaning_started_at || null) : null,
    assigned_staff: actor?.name || unit.assigned_staff || null,
    image_urls: nextImages,
    updated_at: new Date().toISOString()
  }, { actor });

  // Optional legacy/personal tasks table — ignore schema mismatches.
  let legacy = null;
  try {
    const insert = {
      title: reason,
      description: reason,
      status: 'pending',
      business_id: tenantId
    };
    if (unit_number != null) insert.unit_number = Number(unit_number);
    if (title_translated) insert.title_translated = title_translated;
    if (target_lang) insert.target_lang = target_lang;
    if (category) insert.category = category;
    if (priority) insert.priority = priority;
    const { data, error } = await supabase.from('tasks').insert([insert]).select().single();
    if (!error) legacy = data;
  } catch (_) {}

  return {
    unit,
    reason,
    enriched,
    legacy,
    board: 'field_ops'
  };
}
