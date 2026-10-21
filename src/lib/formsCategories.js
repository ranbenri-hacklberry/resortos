// Category helpers for the Priority forms/documents center.
// 'operations' merges the former 'hospitality' + 'reports' tabs; old ids redirect.
export const CATEGORY_ALIASES = { hospitality: 'operations', reports: 'operations' };
export const CATEGORY_GROUPS = { operations: ['hospitality', 'reports'] };

export function resolveCategory(id) {
  const key = String(id || '').trim();
  return CATEGORY_ALIASES[key] || key || 'all';
}

export function itemInCategory(item, categoryId) {
  const cat = resolveCategory(categoryId);
  if (cat === 'all') return true;
  const group = CATEGORY_GROUPS[cat];
  return group ? group.includes(item.category) || item.category === cat : item.category === cat;
}

/** Deep link support: ?formsCategory=<id> or #forms/<id>; old ids map to merged tab. */
export function categoryFromLocation(loc) {
  if (!loc) return 'all';
  try {
    const q = new URLSearchParams(loc.search || '').get('formsCategory');
    if (q) return resolveCategory(q);
  } catch { /* ignore */ }
  const m = String(loc.hash || '').match(/^#forms\/([\w-]+)/);
  return m ? resolveCategory(m[1]) : 'all';
}
