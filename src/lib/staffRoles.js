export const STAFF_ROLES = ['MANAGER', 'OPS_MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING'];

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

export function canSeeFinancials(role) {
  return role === 'MANAGER';
}

export function operationsViewRole(role) {
  return role === 'OPS_MANAGER' ? 'MANAGER' : (role || 'HOUSEKEEPING');
}
