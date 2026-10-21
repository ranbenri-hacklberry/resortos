// Regulations & agreements list (תקנונים והסכמים). Add future entries to REGULATIONS.
// The cancellation policy entry is derived from the central policy JSON (no parallel storage).
import policyDoc from '../../config/policies/cancellation-policy.json' with { type: 'json' };

function cancellationPolicyEntry(doc = policyDoc) {
  const v = doc.versions.find((x) => x.version === doc.current_version) || doc.versions[0];
  const base = `/regulations/cancellation-policy-v${v.version}`;
  const isDraft = doc.active_version !== v.version;
  return {
    id: 'reg-cancellation-policy',
    category: 'regulations',
    title: `מדיניות ביטולים והחזרים — גרסה \u2066${v.version}\u2069`,
    subtitle: isDraft ? `טיוטה · ${v.status} · נדרשת בדיקה משפטית` : 'מדיניות פעילה',
    description: v.guest_text_he,
    formatBadge: isDraft ? 'DRAFT · PENDING_APPROVAL' : 'פעיל',
    tagColor: isDraft ? 'amber' : 'blue',
    url: `${base}.pdf`,
    htmlUrl: `${base}.html`,
    downloadName: `מדיניות_ביטולים_והחזרים_${v.version}.pdf`,
    isHtml: false,
    updatedAt: String(v.updated_at || '').slice(0, 10),
    parties: `Priority Docs: ${v.document?.doc_id || '—'}`,
    priorityDocId: v.document?.doc_id || null,
    sheetPreviewType: 'contract',
    isDraft
  };
}

export const REGULATIONS = [cancellationPolicyEntry()];
export { cancellationPolicyEntry };
