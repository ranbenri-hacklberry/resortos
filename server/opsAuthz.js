/** Authorization rules for the local Edge ops gateway. Identity comes from hotelos_me. */

export function tenantOf(user) {
  return String(user?.tenant_id || user?.business_id || '').trim();
}

export function roleOf(user) {
  return String(user?.role || '').toUpperCase();
}

export function isOpsLead(user) {
  const role = roleOf(user);
  return role === 'MANAGER' || role === 'OPS_MANAGER' || role === 'PRIORITY';
}

export function isPriorityRole(user) {
  return roleOf(user) === 'PRIORITY';
}

export function isFinanceRole(user) {
  return roleOf(user) === 'FINANCE';
}

/** Manager, ops lead, and Priority (manager-level unit scope, Priority screen only). */
export function hasFullUnitScope(user) {
  return isOpsLead(user) || isPriorityRole(user);
}

export function allowedUnitIds(user) {
  const raw = user?.allowed_units;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
}

/** Empty allowed_units means the whole property. Leads always see every unit. */
export function unitAllowed(user, unitId) {
  const id = String(unitId || '').trim();
  if (!id) return false;
  if (hasFullUnitScope(user)) return true;
  const allowed = allowedUnitIds(user);
  if (!allowed.length) return true;
  return allowed.includes(id);
}

export function visibleOpsRows(user, rows, idField) {
  return (rows || []).filter((row) => unitAllowed(user, row?.[idField]));
}

export function canUseOps(user) {
  if (!user?.id || user.is_active === false) return false;
  return Boolean(tenantOf(user));
}

export function actorFrom(user) {
  return {
    id: String(user.id),
    name: String(user.display_name || user.username || '').trim() || 'צוות'
  };
}
