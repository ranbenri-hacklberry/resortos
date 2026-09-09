import { propertyIdForUnit, seedProperty } from './guestProfileSeed.js';

/** Field / emergency phones by village group. */
export const FIELD_REP_PHONES = {
  ramot: '0547136676',
  other: '0507597944'
};

export function formatIlPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return String(raw || '');
}

export function fieldRepCluster(unitId) {
  const propertyId = propertyIdForUnit(unitId);
  const seeded = seedProperty(propertyId);
  if (seeded?.cluster === 'ramot') return 'ramot';
  return 'other';
}

export function fieldRepPhone(unitId) {
  return FIELD_REP_PHONES[fieldRepCluster(unitId)] || FIELD_REP_PHONES.other;
}

export function fieldRepLabel(unitId) {
  return fieldRepCluster(unitId) === 'ramot' ? 'רמות' : 'גבעת יואב / נאות גולן / נוב';
}
