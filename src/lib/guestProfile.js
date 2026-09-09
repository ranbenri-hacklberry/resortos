/** @typedef {'code' | 'dial' | 'call'} GateMode */

/**
 * @typedef {object} GateAccess
 * @property {GateMode} mode
 * @property {string} [code]
 * @property {string} [phone]
 * @property {boolean} [nightCall]
 */

/**
 * @typedef {object} WifiNetwork
 * @property {string | null} [ssid]
 * @property {string} password
 */

/**
 * @typedef {object} GuestAccess
 * @property {GateAccess} [gate]
 * @property {WifiNetwork[]} [wifi]
 * @property {string} [lockbox]
 * @property {{ code: string, expiry?: string }} [smart_lock]
 */

/**
 * @typedef {object} GuestGuides
 * @property {string[]} [jacuzzi]
 * @property {string[]} [tv]
 * @property {string[]} [lock]
 */

/**
 * @typedef {object} GuestContent
 * @property {string} [check_in]
 * @property {string} [check_out]
 * @property {string} [arrival]
 * @property {{ query?: string, placeId?: string, waze?: string, maps?: string }} [nav]
 * @property {GuestGuides} [guides]
 */

export const FALLBACK_JACUZZI = [
  'סוגרים את הפקק או המכסה של הג׳קוזי.',
  'ממלאים מים עד מעל הסילונים.',
  'מפעילים את המנועים בכפתור האדום / בלוח החשמל, ואז את הסילונים בכפתורים בג׳קוזי.'
];

export const FALLBACK_TV = [
  'מדליקים את הטלוויזיה בכפתור בשלט או בטלוויזיה עצמה.',
  'מדליקים את ממיר YES בלחיצה על הכפתור YES בשלט.'
];

export const LOCK_STEPS = [
  'בסיום היציאה מחזירים את המפתח לכספת הקטנה.',
  'סוגרים את הכספת ומוודאים שהיא נעולה.'
];

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeGate(gate) {
  if (!gate || typeof gate !== 'object') return null;
  const mode = gate.mode === 'call' || gate.mode === 'dial' || gate.mode === 'code' ? gate.mode : null;
  if (!mode) return null;
  return {
    mode,
    code: gate.code || gate.value || null,
    phone: gate.phone || null,
    nightCall: Boolean(gate.nightCall)
  };
}

function normalizeWifi(list) {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((row) => ({
      ssid: row?.ssid ? String(row.ssid) : null,
      password: String(row?.password || '')
    }))
    .filter((row) => row.password);
}

/** Shallow property defaults, with nested override for gate / wifi / guides / nav. */
export function mergeGuestProfile(property, unit) {
  const pAccess = asObject(property?.access);
  const uAccess = asObject(unit?.access);
  const pContent = asObject(property?.content);
  const uContent = asObject(unit?.content);

  const wifi = hasOwn(uAccess, 'wifi') ? normalizeWifi(uAccess.wifi) || [] : (normalizeWifi(pAccess.wifi) || []);
  const gate = normalizeGate(uAccess.gate) || normalizeGate(pAccess.gate);
  const lockbox = uAccess.lockbox || pAccess.lockbox || null;
  const smartLock = uAccess.smart_lock || pAccess.smart_lock || null;

  return {
    content: {
      ...pContent,
      ...uContent,
      nav: { ...asObject(pContent.nav), ...asObject(uContent.nav) },
      guides: { ...asObject(pContent.guides), ...asObject(uContent.guides) }
    },
    access: {
      ...pAccess,
      ...uAccess,
      gate,
      wifi,
      lockbox,
      smart_lock: smartLock
    }
  };
}

export function isFilledJson(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).length > 0;
}

export function guidesFromContent(content) {
  const guides = asObject(content?.guides);
  return [
    { id: 'jacuzzi', title: 'הפעלת הג׳קוזי', steps: Array.isArray(guides.jacuzzi) && guides.jacuzzi.length ? guides.jacuzzi : FALLBACK_JACUZZI },
    { id: 'tv', title: 'הפעלת הטלוויזיה', steps: Array.isArray(guides.tv) && guides.tv.length ? guides.tv : FALLBACK_TV },
    { id: 'lock', title: 'החזרת המפתח לכספת', steps: Array.isArray(guides.lock) && guides.lock.length ? guides.lock : LOCK_STEPS }
  ];
}

/**
 * Minimal runtime check so access/content do not become a junk drawer.
 * Shape matches the intended Zod schemas (gate / wifi / lockbox / guides).
 */
export function parseGuestAccess(value) {
  const raw = asObject(value);
  const gate = normalizeGate(raw.gate);
  const parsed = {
    gate: gate || undefined,
    wifi: hasOwn(raw, 'wifi') ? normalizeWifi(raw.wifi) || [] : undefined,
    lockbox: raw.lockbox ? String(raw.lockbox) : undefined,
    smart_lock: raw.smart_lock && raw.smart_lock.code
      ? { code: String(raw.smart_lock.code), expiry: raw.smart_lock.expiry || undefined }
      : undefined
  };
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
}

export function parseGuestContent(value) {
  const raw = asObject(value);
  const guides = asObject(raw.guides);
  const nav = asObject(raw.nav);
  return {
    check_in: raw.check_in || undefined,
    check_out: raw.check_out || undefined,
    arrival: raw.arrival || undefined,
    nav: Object.keys(nav).length ? nav : undefined,
    guides: Object.keys(guides).length ? guides : undefined
  };
}
