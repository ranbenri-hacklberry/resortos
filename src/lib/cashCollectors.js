const CASH_COLLECTOR_ROLES = new Set(['MANAGER', 'OPS_MANAGER']);

export const DEFAULT_CASH_COLLECTOR = 'ברק';

function labelOf(person) {
  return String(person?.display_name || person?.name || person?.username || '').trim();
}

/** Managers who can be recorded as the person who collected cash. Barak is first. */
export function cashCollectorChoices(staff = []) {
  const people = (Array.isArray(staff) ? staff : []).filter((person) => person?.is_active !== false);
  const managers = people.filter((person) => CASH_COLLECTOR_ROLES.has(String(person?.role || '').toUpperCase()));
  const ops = managers.find((person) => String(person?.role || '').toUpperCase() === 'OPS_MANAGER')
    || managers.find((person) => /ברק|barak/i.test(`${person?.username || ''} ${labelOf(person)}`));
  const names = [];
  const add = (name) => {
    const text = String(name || '').trim();
    if (!text || names.includes(text)) return;
    names.push(text);
  };
  add(ops ? labelOf(ops) : DEFAULT_CASH_COLLECTOR);
  managers
    .map(labelOf)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'he'))
    .forEach(add);
  return names.length ? names : [DEFAULT_CASH_COLLECTOR];
}
