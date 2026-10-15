export const STAFF_ROLES = ['MANAGER', 'OPS_MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING', 'PRIORITY'];

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

/** Status edits on the Priority screen. Priority matches a manager; other roles stay as they are. */
export function canEditPriorityStatuses(role) {
  return role === 'MANAGER' || role === 'OPS_MANAGER' || role === 'PRIORITY';
}

export function canSeeFinancials(role) {
  return role === 'MANAGER';
}

export function operationsViewRole(role) {
  return role === 'OPS_MANAGER' ? 'MANAGER' : (role || 'HOUSEKEEPING');
}
