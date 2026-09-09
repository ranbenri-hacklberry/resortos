import { supabase } from './supabaseClient';
import { housekeepingSopSteps } from './cabinSetup';

export const SOP_IDS = {
  HOUSEKEEPING: 'turnover-clean',
  MAINTENANCE: 'maintenance-fix',
  GARDENING: 'garden-path'
};

export const DEFAULT_SOP_TEMPLATES = [
  {
    id: SOP_IDS.HOUSEKEEPING,
    domain: 'HOUSEKEEPING',
    title: {
      he: 'ניקוי לאחר יציאה והכנה לכניסה',
      en: 'Checkout clean and prepare for arrival',
      ar: 'تنظيف بعد المغادرة وتجهيز للدخول',
      th: 'ทำความสะอาดหลังออกและเตรียมเข้าพัก'
    },
    steps: housekeepingSopSteps()
  },
  {
    id: SOP_IDS.MAINTENANCE,
    domain: 'MAINTENANCE',
    title: {
      he: 'טיפול בתקלת אחזקה',
      en: 'Maintenance repair',
      ar: 'معالجة عطل الصيانة',
      th: 'ซ่อมบำรุง'
    },
    steps: [
      { id: 'locate', label: { he: 'איתור התקלה ובדיקת בטיחות', en: 'Locate the fault and check safety', ar: 'تحديد العطل وفحص السلامة', th: 'หาจุดเสียและตรวจความปลอดภัย' } },
      { id: 'repair', label: { he: 'תיקון או החלפת החלק', en: 'Repair or replace the part', ar: 'إصلاح القطعة أو استبدالها', th: 'ซ่อมหรือเปลี่ยนอะไหล่' } },
      { id: 'cleanup', label: { he: 'ניקוי אזור העבודה', en: 'Clean the work area', ar: 'تنظيف منطقة العمل', th: 'ทำความสะอาดพื้นที่ทำงาน' } },
      { id: 'retest', label: { he: 'בדיקת תקינות חוזרת', en: 'Retest that it works', ar: 'إعادة فحص التشغيل', th: 'ทดสอบการทำงานอีกครั้ง' } }
    ]
  },
  {
    id: SOP_IDS.GARDENING,
    domain: 'GARDENING',
    title: {
      he: 'טיפול בחצר ובשביל הכניסה',
      en: 'Garden and entrance path',
      ar: 'العناية بالحديقة وممر المدخل',
      th: 'ดูแลสวนและทางเข้า'
    },
    steps: [
      { id: 'trim', label: { he: 'גיזום שביל הכניסה', en: 'Trim the entrance path', ar: 'تقليم ممر المدخل', th: 'ตัดแต่งทางเข้า' } },
      { id: 'water', label: { he: 'השקיה', en: 'Water the plants', ar: 'الري', th: 'รดน้ำต้นไม้' } },
      { id: 'clear', label: { he: 'פינוי גזם ועלים', en: 'Clear clippings and leaves', ar: 'إزالة الأغصان والأوراق', th: 'เก็บกิ่งและใบไม้' } }
    ]
  }
];

export function sopIdForDomain(domain) {
  return SOP_IDS[domain] || null;
}

export function emptySopProgress() {
  return { templateId: null, steps: [], doneIds: [] };
}

export function normalizeSopProgress(raw) {
  if (!raw || typeof raw !== 'object') return emptySopProgress();
  return {
    templateId: raw.templateId || raw.template_id || null,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    doneIds: Array.isArray(raw.doneIds) ? raw.doneIds : (Array.isArray(raw.done_ids) ? raw.done_ids : [])
  };
}

export function snapshotFromTemplate(template) {
  if (!template) return emptySopProgress();
  return {
    templateId: template.id,
    steps: (template.steps || []).map((step) => ({
      id: step.id,
      label: step.label || { he: step.id }
    })),
    doneIds: []
  };
}

export function findTemplate(templates, domain, templateId) {
  const list = Array.isArray(templates) && templates.length ? templates : DEFAULT_SOP_TEMPLATES;
  if (templateId) {
    const hit = list.find((row) => row.id === templateId);
    if (hit) return hit;
  }
  const byDomain = list.find((row) => row.domain === domain);
  return byDomain || null;
}

export function mergeTemplateSteps(seed, stored) {
  if (!stored) return seed;
  const have = new Map((stored.steps || []).map((step) => [step.id, step]));
  const steps = (seed.steps || []).map((step) => have.get(step.id) || step);
  for (const step of stored.steps || []) {
    if (!steps.some((row) => row.id === step.id)) steps.push(step);
  }
  return { ...stored, title: stored.title || seed.title, steps };
}

export function mergeSopProgress(progress, template) {
  const current = normalizeSopProgress(progress);
  if (!template) return current;
  if (!current.steps.length) return snapshotFromTemplate(template);
  const have = new Set(current.steps.map((step) => step.id));
  const extra = (template.steps || []).filter((step) => !have.has(step.id));
  if (!extra.length) return current;
  return {
    ...current,
    templateId: current.templateId || template.id,
    steps: [...current.steps, ...extra.map((step) => ({ id: step.id, label: step.label || { he: step.id } }))]
  };
}

export function ensureTaskSop(task, templates) {
  const current = normalizeSopProgress(task?.sopProgress);
  const template = findTemplate(templates, task?.domain, current.templateId || sopIdForDomain(task?.domain));
  return mergeSopProgress(current, template);
}

export function stepLabel(step, lang = 'he') {
  const map = step?.label || {};
  return map[lang] || map.he || step?.id || '';
}

export function templateTitle(template, lang = 'he') {
  const map = template?.title || {};
  return map[lang] || map.he || template?.id || '';
}

export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => (n < 10 ? `0${n}` : String(n));
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function rowToTemplate(row) {
  return {
    id: row.id,
    domain: row.domain,
    title: row.title || {},
    steps: Array.isArray(row.steps) ? row.steps : []
  };
}

export async function fetchSopTemplates(tenantId) {
  if (!tenantId) return DEFAULT_SOP_TEMPLATES;
  try {
    const { data, error } = await supabase
      .from('sop_templates')
      .select('id, domain, title, steps, updated_at')
      .eq('tenant_id', tenantId);
    if (error) throw error;
    if (data?.length) {
      const byId = new Map(data.map((row) => [row.id, rowToTemplate(row)]));
      return DEFAULT_SOP_TEMPLATES.map((seed) => mergeTemplateSteps(seed, byId.get(seed.id)));
    }
    await seedSopTemplates(tenantId);
    return DEFAULT_SOP_TEMPLATES;
  } catch (err) {
    console.warn('[SOP TEMPLATES FETCH]', err?.message || err);
    return DEFAULT_SOP_TEMPLATES;
  }
}

export async function seedSopTemplates(tenantId) {
  if (!tenantId) return;
  const now = new Date().toISOString();
  const rows = DEFAULT_SOP_TEMPLATES.map((template) => ({
    id: template.id,
    tenant_id: tenantId,
    domain: template.domain,
    title: template.title,
    steps: template.steps,
    updated_at: now
  }));
  const { error } = await supabase.from('sop_templates').upsert(rows);
  if (error) console.warn('[SOP TEMPLATES SEED]', error.message);
}

export async function saveSopTemplate(tenantId, template) {
  if (!tenantId || !template?.id) return;
  const { error } = await supabase.from('sop_templates').upsert({
    id: template.id,
    tenant_id: tenantId,
    domain: template.domain,
    title: template.title,
    steps: template.steps,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}
