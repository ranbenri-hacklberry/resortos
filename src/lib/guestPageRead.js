import { readFileSync } from 'fs';
import { isFullyPaid } from './bookingPaid.js';
import { LATE_FREE_DAY } from './cabinAccess.js';
import { guestStayUrl } from './guestStayUrl.js';
import { formatStayHourLabel, stayHoursFromBooking } from './kinorotStayHours.js';
import { ATTRACTIONS } from './areaGuide.js';
import {
  CATALOG_LOCKBOX,
  CATALOG_WIFI,
  RAMOT_GATE_CODE,
  UNIT_DISPLAY_NAMES,
  UNIT_PROPERTY,
  UNIT_WIFI
} from '../../functions/lib/unitNames.js';

/** Same Hebrew label as i18n INSTAY_CALL_ME, the in-stay call button. */
function hebrewCallButton() {
  try {
    const source = readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
    const match = source.match(/"INSTAY_CALL_ME":\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    // The label is only needed when the MCP server can read the guest i18n file.
  }
  return '📞 חזרו אליי';
}

export const GUEST_CALL_BUTTON = hebrewCallButton();

const PROPERTY_NAMES = {
  hill: 'צימר בגבעה',
  kipat: 'כיפת שמיים',
  mialis: 'מיאליס ריזורט',
  nurit: 'בתי נורית',
  taj: "טאג' מאהל",
  mool: 'מול הנוף',
  nofim: 'נופים בלבן',
  toscana: 'בקתות טוסקנה',
  musical: 'החצר המוסיקלית',
  maya: 'בקתות מאיה',
  'casa-nova': 'קאסה נובה'
};

const PROPERTY_NAV = {
  hill: {
    query: 'צימר בגבעה גבעת יואב',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8011237,35.6845369'
  },
  kipat: {
    query: 'כיפת השמיים גבעת יואב',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8022197,35.6830016'
  },
  mialis: {
    query: 'מיאליס ריזורט גבעת יואב',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7834989,35.6869576'
  },
  nurit: {
    query: 'בתי נורית מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gs4p2',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.850371,35.664408'
  },
  taj: {
    query: "טאג' מאהל מושב רמות",
    waze: 'https://waze.com/ul/hsvc6gsskp',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.852592,35.667799'
  },
  mool: {
    query: 'מול הנוף ברמות',
    waze: 'https://waze.com/ul/hsvc6gtk3v',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.856309,35.667694'
  },
  nofim: {
    query: 'נופים בלבן מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gt4ct',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.854897,35.665635'
  },
  toscana: {
    query: 'בקתות טוסקנה מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gsutg',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.854241,35.667930'
  },
  musical: {
    query: 'החצר המוסיקלית מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gsdq7',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.852962,35.664861'
  },
  maya: {
    query: 'בקתות מאיה מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gs4k0',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.849829,35.664732'
  },
  'casa-nova': {
    query: 'קאסה נובה מושב נוב',
    waze: 'https://waze.com/ul?ll=32.8277487,35.7808935&navigate=yes',
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8277487,35.7808935'
  }
};

export const UNIT_NAV_OVERRIDES = {
  // כיפת שמיים
  'dome-red': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8022197,35.6830016',
    waze: 'https://waze.com/ul?ll=32.8022197,35.6830016&navigate=yes'
  },
  'dome-green': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8021462,35.6828917',
    waze: 'https://waze.com/ul?ll=32.8021462,35.6828917&navigate=yes'
  },
  'dome-blue': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8023302,35.6831226',
    waze: 'https://waze.com/ul?ll=32.8023302,35.6831226&navigate=yes'
  },

  // מיאליס
  'suite-1': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7835566,35.6868208',
    waze: 'https://waze.com/ul?ll=32.7835566,35.6868208&navigate=yes'
  },
  'suite-2': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7836233,35.6868252',
    waze: 'https://waze.com/ul?ll=32.7836233,35.6868252&navigate=yes'
  },
  'mialis-villa': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.7834989,35.6869576',
    waze: 'https://waze.com/ul?ll=32.7834989,35.6869576&navigate=yes'
  },

  // קאסה נובה
  k826: {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8277487,35.7808935',
    waze: 'https://waze.com/ul?ll=32.8277487,35.7808935&navigate=yes'
  },
  k827: {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8277491,35.7809611',
    waze: 'https://waze.com/ul?ll=32.8277491,35.7809611&navigate=yes'
  },

  // צימר בגבעה
  'hill-1': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8011237,35.6845369',
    waze: 'https://waze.com/ul?ll=32.8011237,35.6845369&navigate=yes'
  },
  'hill-2': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8012232,35.6846325',
    waze: 'https://waze.com/ul?ll=32.8012232,35.6846325&navigate=yes'
  },
  'hill-3': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8013035,35.6845212',
    waze: 'https://waze.com/ul?ll=32.8013035,35.6845212&navigate=yes'
  },
  'hill-4': {
    maps: 'https://www.google.com/maps/dir/?api=1&destination=32.8011534,35.6844202',
    waze: 'https://waze.com/ul?ll=32.8011534,35.6844202&navigate=yes'
  }
};

export const GUEST_PRINT_ABSENT = {
  print_url: null,
  print_text: null,
  reason: 'אין דף הדפסה של דף האורח. work-order.html הוא הזמנת עבודה מספק, ו-qr-stickers.html הוא דף מדבקות לצוות.'
};

export function guestPageUrl(token) {
  const value = String(token || '').trim();
  return value ? guestStayUrl(value) : '';
}

/** Same window as the guest checkout API: after check-in, or when the room is ready and the stay is settled. */
export function lockboxVisibleToGuest(booking) {
  const stay = booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
  const status = String(booking?.booking_status || '');
  const inStay = status === 'CHECKED_IN' || status === 'CHECKED_OUT' || Boolean(stay.guest_checked_in_at);
  const ready = Boolean(stay.cabin_ready) || String(stay.operational_status || '').toUpperCase() === 'READY';
  return Boolean(booking) && (inStay || (ready && isFullyPaid(booking)));
}

function lockboxByUnit() {
  try {
    const source = readFileSync(new URL('./guestProfileSeed.js', import.meta.url), 'utf8');
    const block = source.match(/export const LOCKBOX_BY_UNIT = \{([\s\S]*?)\n\};/);
    const map = {};
    if (block) {
      for (const match of block[1].matchAll(/['"]?([A-Za-z0-9-]+)['"]?\s*:\s*'([^']*)'/g)) {
        map[match[1]] = match[2];
      }
    }
    if (Object.keys(map).length) return map;
  } catch {
    // GuestInStay reads LOCKBOX_BY_UNIT. The catalog is the same list for Kinorot units.
  }
  return CATALOG_LOCKBOX;
}

const LOCKBOX_BY_UNIT = lockboxByUnit();

function gateModeFor(unitId) {
  const propertyId = UNIT_PROPERTY[unitId] || '';
  if (String(unitId).startsWith('k')) return 'code';
  if (propertyId === 'hill' || propertyId === 'kipat' || propertyId === 'mialis') return 'dial';
  if (propertyId === 'casa-nova') return 'call';
  return '';
}

/** Same resolution as GuestInStay: the booking's own codes, then the fixed unit code. */
export function guestAccessCodes(booking) {
  const stay = booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
  const unitId = String(booking?.unit_id || stay.unit_id || '');
  return {
    door_code: stay.door_pin || LOCKBOX_BY_UNIT[unitId] || CATALOG_LOCKBOX[unitId] || '',
    gate_code: stay.gate_code || (String(booking?.unit_id || '').startsWith('k') ? RAMOT_GATE_CODE : ''),
    gate_mode: stay.gate_mode || gateModeFor(unitId)
  };
}

function wifiFor(unitId) {
  if (Array.isArray(UNIT_WIFI[unitId]) && UNIT_WIFI[unitId].length) return UNIT_WIFI[unitId];
  const propertyId = UNIT_PROPERTY[unitId] || '';
  return CATALOG_WIFI[propertyId] || [];
}

function guestNameFor(booking) {
  const full = String(booking?.guest_name || '').trim();
  const status = String(booking?.booking_status || '');
  if (status === 'CHECKED_IN' || status === 'CHECKED_OUT') return full.split(/\s+/)[0] || full;
  return full;
}

function hoursFor(booking) {
  const parsed = stayHoursFromBooking(booking);
  return {
    check_in: formatStayHourLabel(parsed.checkin) || '15:00',
    check_out: formatStayHourLabel(parsed.checkout) || '11:00'
  };
}

export function projectGuestPage(booking) {
  const unitId = String(booking?.unit_id || '');
  const propertyId = UNIT_PROPERTY[unitId] || '';
  const hours = hoursFor(booking);
  const visible = lockboxVisibleToGuest(booking);
  const access = guestAccessCodes(booking);
  const nav = { ...(PROPERTY_NAV[propertyId] || {}), ...(UNIT_NAV_OVERRIDES[unitId] || {}) };
  return {
    booking_id: booking?.id || '',
    guest_name: guestNameFor(booking),
    property_id: propertyId,
    property_name: PROPERTY_NAMES[propertyId] || '',
    unit_id: unitId,
    unit_name: UNIT_DISPLAY_NAMES[unitId] || unitId,
    check_in_date: String(booking?.check_in_date || '').slice(0, 10),
    check_out_date: String(booking?.check_out_date || '').slice(0, 10),
    check_in_hour: hours.check_in,
    check_out_hour: hours.check_out,
    guest_page_url: guestPageUrl(booking?.checkout_token),
    print_url: null,
    arrival: nav,
    access: {
      door_code: access.door_code,
      gate_code: access.gate_code,
      gate_mode: access.gate_mode,
      visible_to_guest_now: visible
    },
    wifi: wifiFor(unitId).map((row) => ({ ssid: row.ssid || '', password: row.password || '' })),
    house_rules: {
      check_in: '15:00',
      check_out: '11:00',
      check_out_shabbat: propertyId === 'casa-nova' ? 'צאת השבת' : '13:00',
      late_checkout_motzash_ils: 250,
      late_options: LATE_FREE_DAY.map((row) => ({ until: row.until, price_ils: row.price }))
    },
    guides: ['jacuzzi', 'tv', 'lock'],
    attractions: ATTRACTIONS.map((row) => ({
      title: row.title,
      kind: row.kind || '',
      hours: row.hours || '',
      waze: row.wazeUrl || ''
    })),
    call_button: GUEST_CALL_BUTTON
  };
}

export function projectGuestPageSummary(booking) {
  const page = projectGuestPage(booking);
  return {
    booking_id: page.booking_id,
    guest_name: page.guest_name,
    property_name: page.property_name,
    unit_name: page.unit_name,
    check_in_date: page.check_in_date,
    check_out_date: page.check_out_date,
    guest_page_url: page.guest_page_url,
    print_url: null
  };
}
