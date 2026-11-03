import { dutyUnitGroup, unitMatchesBoardArea } from './dailyDutyReport';
import { fieldUnitDisplayName } from './fieldUnitCatalog';
import { priorityDeskGuests } from './priorityStay';
import { lodgingKey } from './priorityStatus';
import { unitAccessGroup } from './units';

/** Phone Operations area pills. Same partition as the desk board filters. */
export const PHONE_AREA_FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'ramot', label: 'רמות' },
  { id: 'givat', label: 'גבעת יואב והשאר' },
  { id: 'pilot', label: 'פיילוט' }
];

const CLEANING_KEYS = new Set(['DIRTY', 'IN_PROGRESS', 'NEEDS_COMPLETIONS']);

export function phoneOpsCompound(unit) {
  const byId = unitAccessGroup(unit?.id);
  if (byId && byId !== 'יחידות נוספות') return byId;
  const byName = dutyUnitGroup(unit?.id, unit?.name || '');
  return byName && byName !== 'יחידות נוספות' ? byName : (byId || 'יחידות נוספות');
}

export function phoneOpsUnitLabel(unit) {
  const name = fieldUnitDisplayName(unit);
  const compound = phoneOpsCompound(unit);
  const head = String(compound || '').split('·')[0].trim();
  if (!head || head === 'יחידות נוספות' || name.includes(head)) return name;
  return `${name} · ${head}`;
}

export function phoneOpsMatchesArea(unit, area) {
  return unitMatchesBoardArea(unit, area);
}

function needsCleaning(unit) {
  return CLEANING_KEYS.has(unit?.operational_status);
}

function inStay(unit, bookings, day) {
  if (lodgingKey(unit) === 'OCCUPIED') return true;
  const desk = priorityDeskGuests(bookings, unit?.id, day);
  return Boolean(desk.staying || desk.departing);
}

/** One section per unit: arrivals, then cleaning without an arrival, then occupied, then vacant. */
export function phoneOpsSection(unit, bookings, day) {
  const desk = priorityDeskGuests(bookings, unit?.id, day);
  if (desk.arriving) return 'arriving';
  if (needsCleaning(unit)) return 'cleaning';
  if (inStay(unit, bookings, day)) return 'occupied';
  return 'vacant';
}
