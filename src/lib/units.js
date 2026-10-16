/** Fallback seed only — live inventory comes from public.resort_units. */
export const DEFAULT_RESORT_UNITS = [
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 0, unit_type: 'suite', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k827', name: 'קאסה נובה · Bloom', sort_order: 1, unit_type: 'suite', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 70000 },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 4, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 70000 },
  { id: 'hill-3', name: 'צימר בגבעה 3', sort_order: 5, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 70000 },
  { id: 'hill-4', name: 'צימר בגבעה 4', sort_order: 6, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 70000 },
  { id: 'dome-blue', name: 'כיפת שמיים כחול', sort_order: 7, unit_type: 'dome', max_occupancy: 2, base_price_agorot: 120000 },
  { id: 'dome-red', name: 'כיפת שמיים אדום', sort_order: 8, unit_type: 'dome', max_occupancy: 2, base_price_agorot: 120000 },
  { id: 'dome-green', name: 'כיפת שמיים ירוק', sort_order: 9, unit_type: 'dome', max_occupancy: 2, base_price_agorot: 120000 },
  { id: 'mialis-villa', name: 'וילה מיאליס ריזורט', sort_order: 10, unit_type: 'villa', max_occupancy: 23, base_price_agorot: 280000 },
  { id: 'suite-1', name: 'סוויטה 1 (הירוקה)', sort_order: 11, unit_type: 'suite', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'suite-2', name: 'סוויטה 2 (הורודה)', sort_order: 12, unit_type: 'suite', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k671', name: 'Ⓖ23 בתי נורית 1', sort_order: 13, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 50000 },
  { id: 'k673', name: 'Ⓖ23 בתי נורית 2', sort_order: 14, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k674', name: 'Ⓖ23 בתי נורית 3', sort_order: 15, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k675', name: 'Ⓖ23 בתי נורית 4', sort_order: 16, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 50000 },
  { id: 'k676', name: 'Ⓖ23 בתי נורית 5', sort_order: 17, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k677', name: 'Ⓖ23 בתי נורית 6', sort_order: 18, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k678', name: 'Ⓖ23 בתי נורית 7', sort_order: 19, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 50000, usage: 'STAFF_ACCOMMODATION', booking_enabled: false },
  { id: 'k679', name: 'Ⓖ23 בתי נורית 8', sort_order: 20, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 50000, usage: 'STAFF_ACCOMMODATION', booking_enabled: false },
  { id: 'k808', name: "Ⓔ27 טאג' מאהל · בקתה 1", sort_order: 21, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 80000 },
  { id: 'k809', name: "Ⓔ27 טאג' מאהל · בקתה 2", sort_order: 22, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 80000 },
  { id: 'k810', name: "Ⓔ27 טאג' מאהל · בקתה 3", sort_order: 23, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 80000 },
  { id: 'k811', name: "Ⓔ27 טאג' מאהל · בקתה 4", sort_order: 24, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 80000 },
  { id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', sort_order: 25, unit_type: 'cabin', max_occupancy: 5, base_price_agorot: 50000 },
  { id: 'k681', name: 'Ⓐ29 מול הנוף · בקתה 2', sort_order: 26, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k682', name: 'Ⓐ29 מול הנוף · בקתה 3', sort_order: 27, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 80000 },
  { id: 'k683', name: 'Ⓐ29 מול הנוף · בקתה 4', sort_order: 28, unit_type: 'cabin', max_occupancy: 5, base_price_agorot: 50000 },
  { id: 'k684', name: 'Ⓐ29 מול הנוף · בקתה 5', sort_order: 29, unit_type: 'cabin', max_occupancy: 5, base_price_agorot: 50000 },
  { id: 'k685', name: 'Ⓑ28 נופים בלבן · בקתה 1', sort_order: 30, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 75000 },
  { id: 'k686', name: 'Ⓑ28 נופים בלבן · בקתה 2', sort_order: 31, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 75000 },
  { id: 'k687', name: 'Ⓒ27 טוסקנה · 1', sort_order: 32, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 60000 },
  { id: 'k688', name: 'Ⓒ27 טוסקנה · 2', sort_order: 33, unit_type: 'cabin', max_occupancy: 4, base_price_agorot: 60000 },
  { id: 'k689', name: 'Ⓒ27 טוסקנה · 3', sort_order: 34, unit_type: 'cabin', max_occupancy: 7, base_price_agorot: 85000 },
  { id: 'k690', name: 'Ⓓ26 חצר מוסיקלית · בקתה 1', sort_order: 35, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 60000 },
  { id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · בקתה 2', sort_order: 36, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 60000 },
  { id: 'k692', name: 'Ⓓ26 חצר מוסיקלית · בקתה 3', sort_order: 37, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 60000 },
  { id: 'k693', name: 'Ⓕ24 בקתות מאיה · בקתה 1', sort_order: 38, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 75000 },
  { id: 'k694', name: 'Ⓕ24 בקתות מאיה · בקתה 2', sort_order: 39, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 60000 },
  { id: 'k695', name: 'Ⓕ24 בקתות מאיה · בקתה 3', sort_order: 40, unit_type: 'cabin', max_occupancy: 2, base_price_agorot: 75000 }
];

/** @deprecated use DEFAULT_RESORT_UNITS — kept so existing imports keep working */
export const CANONICAL_UNITS = DEFAULT_RESORT_UNITS;

const NAME_TO_ID = Object.fromEntries(
  DEFAULT_RESORT_UNITS.flatMap((unit) => [
    [unit.name, unit.id],
    [unit.id, unit.id]
  ])
);
NAME_TO_ID['מיאליס וילה'] = 'mialis-villa';
NAME_TO_ID['וילה מיאליס'] = 'mialis-villa';
NAME_TO_ID['סוויטה 1'] = 'suite-1';
NAME_TO_ID['סוויטה 2'] = 'suite-2';
NAME_TO_ID['סוויטה מיאליס ירוקה'] = 'suite-1';
NAME_TO_ID['סוויטה מיאליס ורודה'] = 'suite-2';
NAME_TO_ID['בתי נורית · בקתה 1'] = 'k671';
NAME_TO_ID['בתי נורית · בקתה 2'] = 'k673';
NAME_TO_ID['בתי נורית · בקתה 3'] = 'k674';
NAME_TO_ID['בתי נורית · בקתה 4'] = 'k675';
NAME_TO_ID['בתי נורית · בקתה 5'] = 'k676';
NAME_TO_ID['בתי נורית · בקתה 6'] = 'k677';
NAME_TO_ID['בתי נורית · בקתה 7'] = 'k678';
NAME_TO_ID['בתי נורית · בקתה 8'] = 'k679';

export const FORCE_DOCUMENT_NAMES = new Set([
  'mialis-villa', 'suite-1', 'suite-2',
  'k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679',
  'k690', 'k691', 'k692'
]);
NAME_TO_ID['טוסקנה · פירנצה 1'] = 'k687';
NAME_TO_ID['טוסקנה · פירנצה 2'] = 'k688';
NAME_TO_ID['טוסקנה · שאטו'] = 'k689';
NAME_TO_ID['Ⓒ27 טוסקנה · פירנצה 1'] = 'k687';
NAME_TO_ID['Ⓒ27 טוסקנה · פירנצה 2'] = 'k688';
NAME_TO_ID['Ⓒ27 טוסקנה · שאטו'] = 'k689';

export const RETIRED_UNIT_IDS = new Set([
  'u1', 'u2', 'u3', 'u4',
  'k618', 'k619', 'k620', 'k621', 'k622', 'k623',
  'lab-kinneret'
]);

export const STAFF_UNIT_IDS = new Set(['k678', 'k679']);
export const OFFICE_UNIT_IDS = new Set(['pilot-office']);

export const CANONICAL_OFFICE_UNIT = {
  id: 'pilot-office',
  name: 'משרד',
  sort_order: 99,
  unit_type: 'office',
  max_occupancy: 0,
  base_price_agorot: 0,
  usage: 'OFFICE',
  booking_enabled: false
};

export const CANONICAL_MANAGED_SPACES = [
  ...DEFAULT_RESORT_UNITS,
  CANONICAL_OFFICE_UNIT
];

NAME_TO_ID['pilot-office'] = 'pilot-office';
NAME_TO_ID['משרד'] = 'pilot-office';
NAME_TO_ID['המשרד'] = 'pilot-office';
NAME_TO_ID['משרד ראשי'] = 'pilot-office';

export function isPhantomUnitId(id) {
  return String(id || '').startsWith('u_t_');
}

export function isRetiredUnitId(id) {
  return RETIRED_UNIT_IDS.has(String(id || ''));
}

export function unitUsage(unitOrId) {
  const id = typeof unitOrId === 'object' ? String(unitOrId?.id || '') : String(unitOrId || '');
  if (typeof unitOrId === 'object' && unitOrId) {
    if (unitOrId.usage) return unitOrId.usage;
    if (unitOrId.content?.usage) return unitOrId.content.usage;
    if (unitOrId.unit_type === 'office') return 'OFFICE';
    if (unitOrId.unit_type === 'staff' || unitOrId.unit_type === 'staff_accommodation') return 'STAFF_ACCOMMODATION';
  }
  if (STAFF_UNIT_IDS.has(id)) return 'STAFF_ACCOMMODATION';
  if (OFFICE_UNIT_IDS.has(id)) return 'OFFICE';
  return 'GUEST_ACCOMMODATION';
}

export function isBookingEligible(unitOrId) {
  if (typeof unitOrId === 'object' && unitOrId) {
    if (unitOrId.booking_enabled === false) return false;
    if (unitOrId.content?.booking_enabled === false) return false;
  }
  return unitUsage(unitOrId) === 'GUEST_ACCOMMODATION';
}

export function isManagedUnit(unit) {
  return isInventoryUnit(unit);
}

export function isBookableUnit(unit) {
  return isInventoryUnit(unit) && isBookingEligible(unit);
}

export function isInventoryUnit(unit) {
  if (!unit?.id || unit.deleted_at || unit.is_active === false) return false;
  if (isPhantomUnitId(unit.id) || isRetiredUnitId(unit.id)) return false;
  return true;
}

export function inventoryUnits(units) {
  const list = (units || []).filter(isInventoryUnit);
  return list.sort((a, b) => {
    const sa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 100;
    const sb = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 100;
    if (sa !== sb) return sa - sb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'he');
  });
}

export function getManagedUnits(units) {
  return inventoryUnits(units);
}

export function getManagedSpaces(spaces) {
  const list = spaces && spaces.length ? spaces : CANONICAL_MANAGED_SPACES;
  return list.filter(isInventoryUnit);
}

export function getBookableUnits(units) {
  return inventoryUnits(units).filter(isBookableUnit);
}

export function normalizeAllowedUnitIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
}

export function canSeeAllUnits(allowedUnitIds) {
  return normalizeAllowedUnitIds(allowedUnitIds).length === 0;
}

export function visibleInventory(units, allowedUnitIds) {
  const list = inventoryUnits(units);
  const allowed = normalizeAllowedUnitIds(allowedUnitIds);
  if (!allowed.length) return list;
  const allowedSet = new Set(allowed);
  const filtered = list.filter((unit) => allowedSet.has(unit.id));
  // Never blank the occupancy board because of a stale/mismatched ACL list.
  return filtered.length ? filtered : list;
}

/** Always have rows to paint — live Dexie first, then the canonical seed. */
export function calendarInventory(units, allowedUnitIds, tenantId) {
  const live = visibleInventory(units, allowedUnitIds);
  if (live.length) return live;
  return inventoryUnits(
    DEFAULT_RESORT_UNITS.map((unit) => ({
      ...unit,
      tenant_id: tenantId,
      is_active: true
    }))
  );
}

export function unitAccessGroup(unitId) {
  const id = String(unitId || '');
  if (id === 'mialis-villa' || id.startsWith('suite-')) return 'מיאליס';
  if (id.startsWith('hill-')) return 'צימר בגבעה';
  if (id.startsWith('dome-')) return 'כיפת שמיים';
  if (/^k67[1-9]$/.test(id)) return 'Ⓖ בתי נורית · רמות';
  if (/^k80[8-9]$/.test(id) || id === 'k810' || id === 'k811') return "Ⓔ טאג' מאהל · רמות";
  if (/^k68[0-4]$/.test(id)) return 'Ⓐ מול הנוף · רמות';
  if (id === 'k685' || id === 'k686') return 'Ⓑ נופים בלבן · רמות';
  if (/^k68[7-9]$/.test(id)) return 'Ⓒ בקתות טוסקנה · רמות';
  if (/^k69[0-2]$/.test(id)) return 'Ⓓ החצר המוסיקלית · רמות';
  if (/^k69[3-5]$/.test(id)) return 'Ⓕ בקתות מאיה · רמות';
  if (id === 'k826' || id === 'k827') return 'קאסה נובה · נוב';
  return 'יחידות נוספות';
}

export function groupedInventoryUnits(units) {
  const groups = [];
  const index = new Map();
  for (const unit of inventoryUnits(units)) {
    const title = unitAccessGroup(unit.id);
    if (!index.has(title)) {
      const group = { title, units: [] };
      index.set(title, group);
      groups.push(group);
    }
    index.get(title).units.push(unit);
  }
  return groups;
}

function nameTokens(value) {
  return String(value || '')
    .replace(/['׳"]/g, '')
    .split(/[\s·]+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+$/.test(part));
}

function tokensMatch(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.startsWith(y) || y.startsWith(x)) return true;
  const stripHe = (word) => word.replace(/^ה/, '');
  if (stripHe(x) === stripHe(y)) return true;
  if (
    x.length >= 3
    && y.length >= 3
    && x.slice(0, -1) === y.slice(0, -1)
    && 'הת'.includes(x.slice(-1))
    && 'הת'.includes(y.slice(-1))
  ) {
    return true;
  }
  if (x.length >= 3 && y.endsWith(x)) return true;
  if (y.length >= 3 && x.endsWith(y)) return true;
  return false;
}

/** Extra property word(s) to show above the short calendar label. */
export function unitCalendarPrefix(fullName, shortName) {
  const property = String(fullName || '').split('·')[0].trim();
  const leftover = nameTokens(property).filter(
    (word) => !nameTokens(shortName).some((short) => tokensMatch(word, short))
  );
  return leftover.join(' ');
}

/** Two calendar lines from the full inventory name: property+number / (detail unused — lockbox is separate). */
export function unitCalendarLines(fullName) {
  let name = String(fullName || '').trim();
  if (!name) return { primary: '', secondary: '' };
  // Calendar labels skip the word "בקתה" — only complex + cabin number.
  // (No \b — JS word boundaries don't work with Hebrew.)
  name = name
    .replace(/בקתה/gi, ' ')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (name.includes('·')) {
    const [left, ...rest] = name.split('·');
    const right = rest.join('·').replace(/·/g, ' ').trim();
    const primary = [left.trim(), right].filter(Boolean).join(' ');
    return { primary, secondary: '' };
  }

  const words = name.split(/\s+/).filter(Boolean);
  // Keep trailing cabin number on the same line: "בתי נורית 1"
  if (words.length >= 2 && /^\d+[א-תA-Za-z]?$/.test(words[words.length - 1])) {
    return { primary: words.join(' '), secondary: '' };
  }
  if (words.length >= 2) {
    return { primary: words.slice(0, -1).join(' '), secondary: words[words.length - 1] };
  }
  return { primary: name, secondary: '' };
}

export function unitFullName(unitOrId, fallback = '') {
  if (unitOrId && typeof unitOrId === 'object') {
    return unitOrId.name || unitFullName(unitOrId.id, fallback);
  }
  const id = String(unitOrId || '');
  const hit = DEFAULT_RESORT_UNITS.find((unit) => unit.id === id);
  return hit?.name || fallback || id;
}

export function cleanGuestCabinName(raw) {
  let name = String(raw || '').trim();
  if (!name) return '';

  const hit = DEFAULT_RESORT_UNITS.find((u) => u.id === name);
  if (hit) name = hit.name;

  // Remove circled characters e.g. Ⓔ, Ⓖ, Ⓐ, Ⓓ, Ⓒ, Ⓑ
  name = name.replace(/[\u24B6-\u24E9\u2460-\u2473]/g, '');
  // Remove letter-number prefixes like E27, E 27, G23, A29, D26, C27, B1, etc.
  name = name.replace(/^[A-Za-z]\s*\d{1,2}\s*/, '');
  // Remove leading standalone numbers if any
  name = name.replace(/^\d+\s+/, '');

  // Handle Musical Courtyard (חצר מוסיקלית / מוזיקלית) -> 1, 2, 3
  if (name.includes('מוסיקלית') || name.includes('מוזיקלית')) {
    if (name.includes('1')) return 'חצר מוזיקלית 1';
    if (name.includes('2')) return 'חצר מוזיקלית 2';
    if (name.includes('3')) return 'חצר מוזיקלית 3';
    return 'חצר מוזיקלית';
  }

  // Clean dots "·" and "בקתה"
  name = name
    .replace(/\s*·\s*בקתה\s*/g, ' ')
    .replace(/\s*·\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return name;
}

/** Guest-facing cabin name: phonetic in EN/AR, Hebrew source name otherwise. */
export function localizedUnitName(unitId, t, fallback = '') {
  const id = typeof unitId === 'object' ? unitId?.id : unitId;
  const hebrew = unitFullName(unitId, fallback);
  const base = (!id || typeof t !== 'function') ? hebrew : t(`${id}_name`, { defaultValue: hebrew });
  return cleanGuestCabinName(base);
}

export function unitMaxOccupancy(unitOrId, fallback = 6) {
  if (unitOrId && typeof unitOrId === 'object' && Number(unitOrId.max_occupancy) > 0) {
    return Math.max(1, Number(unitOrId.max_occupancy));
  }
  const id = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
  const hit = DEFAULT_RESORT_UNITS.find((unit) => unit.id === id);
  return Math.max(1, Number(hit?.max_occupancy) || fallback);
}

/** Full inventory name for guest WhatsApp — never the calendar short label. */
export function whatsAppUnitName(unit, t) {
  const id = unit?.id || '';
  const fallback = unit?.name || unitFullName(id, '');
  if (id && typeof t === 'function') return t(`${id}_name`, { defaultValue: fallback });
  return fallback || id;
}

export function matchCanonicalUnitId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (NAME_TO_ID[raw]) return NAME_TO_ID[raw];
  const hit = DEFAULT_RESORT_UNITS.find((unit) => raw.includes(unit.name) || raw === unit.id);
  return hit?.id || null;
}

export function canonicalUnitSeed(tenantId, now = new Date().toISOString()) {
  return DEFAULT_RESORT_UNITS.map((unit) => {
    const usage = unit.usage || unitUsage(unit.id);
    const booking_enabled = unit.booking_enabled !== undefined ? unit.booking_enabled : isBookingEligible(unit.id);
    return {
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name,
      sort_order: unit.sort_order,
      unit_type: unit.unit_type || 'cabin',
      max_occupancy: unit.max_occupancy || 4,
      base_price_agorot: unit.base_price_agorot,
      cleaning_fee_agorot: 0,
      is_active: !isRetiredUnitId(unit.id),
      usage,
      booking_enabled,
      content: {
        usage,
        booking_enabled
      },
      created_at: now,
      updated_at: now,
      version: 1
    };
  });
}

