export const STAFF_ROLES = ['MANAGER', 'OPS_MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'WORK_LEAD', 'MAINTENANCE', 'GARDENING', 'PRIORITY', 'FINANCE'];

export function isOwnerManager(role) {
  return role === 'MANAGER';
}

export function isReception(role) {
  return role === 'RECEPTION';
}

export function canOpenDesk(role) {
  return role === 'RECEPTION' || role === 'MANAGER';
}

export function isOpsLead(role) {
  return role === 'MANAGER' || role === 'OPS_MANAGER';
}

export function isPriorityOnly(role) {
  return role === 'PRIORITY';
}

/** Finance-only staff. The role on the employee row is the source of truth. */
export function isFinanceOnly(role) {
  return String(role || '').toUpperCase() === 'FINANCE';
}

/** Status edits on the Priority screen. Priority matches a manager; other roles stay as they are. */
export function canEditPriorityStatuses(role) {
  return role === 'MANAGER' || role === 'OPS_MANAGER' || role === 'PRIORITY';
}

export function canSeeFinancials(role, username = '', displayName = '') {
  const r = String(role || '').toUpperCase();
  const u = String(username || '').toLowerCase();
  const d = String(displayName || '').toLowerCase();
  return (
    r === 'MANAGER' ||
    r === 'OPS_MANAGER' ||
    r === 'OWNER' ||
    r === 'FINANCE' ||
    isFinanceOnly(role) ||
    u === 'max' ||
    u.includes('מקס') ||
    d.includes('מקס') ||
    u === 'ran' ||
    u.includes('רני') ||
    d.includes('רני') ||
    u.includes('owner')
  );
}

export function operationsViewRole(role) {
  return role === 'OPS_MANAGER' ? 'MANAGER' : (role || 'HOUSEKEEPING');
}
