/**
 * Beds that actually exist in each room.
 * Leave this empty until the owner supplies the list. Do not guess quantities,
 * joining pairs, or sofa beds.
 *
 * Shape, once a room is known:
 * {
 *   beds: [{ type: 'double' | 'single' | 'sofa', count: number, joins: 'main' | null }],
 *   setups: [{ id: 'joined', label: 'מיטה זוגית' }, { id: 'split', label: 'שתי מיטות נפרדות' }]
 * }
 */
export const ROOM_BED_INVENTORY = {};

export function bedInventoryFor(unitId) {
  const row = ROOM_BED_INVENTORY[unitId];
  if (!row || !Array.isArray(row.setups) || row.setups.length === 0) return null;
  return row;
}

export function requestedBedSetup(booking) {
  const stay = booking?.stay && typeof booking.stay === 'object' ? booking.stay : {};
  const explicit = String(stay.bed_setup || booking?.bed_setup || '').trim();
  if (explicit) return explicit;
  const notes = `${booking?.special_requests || ''} ${stay.notes || ''} ${stay.special_requests || ''}`;
  if (/מיטות\s*נפרדות|הפרד(?:ה|ות)/.test(notes)) return 'split';
  if (/מיטה\s*זוגית|מיטות\s*צמודות|הצמד/.test(notes)) return 'joined';
  if (/ספה\s*נפתחת|ספת\s*אורחים/.test(notes)) return 'sofa';
  return '';
}

export function resolveBedPrep({ inventory, request = '', chosen = '', done = false } = {}) {
  const asked = String(chosen || request || '').trim();
  if (!inventory || !Array.isArray(inventory.setups) || inventory.setups.length === 0) {
    return {
      status: 'awaiting-inventory',
      label: 'רשימת המיטות לחדר עדיין לא הוזנה',
      request: asked,
      options: [],
    };
  }
  const options = inventory.setups;
  const match = options.find((row) => row.id === asked || row.label === asked) || null;
  if (done && (match || (!asked && options.length === 1))) {
    const option = match || options[0];
    return { status: 'done', label: option.label, option, options, request: asked };
  }
  if (asked && !match) {
    return {
      status: 'review',
      label: 'הבקשה לא תואמת את המיטות בחדר',
      request: asked,
      options,
    };
  }
  if (match) {
    return { status: 'confirmed', label: match.label, option: match, options, request: asked };
  }
  if (options.length === 1) {
    return { status: 'only', label: options[0].label, option: options[0], options, request: '' };
  }
  return { status: 'pending', label: 'ממתין לאישור סידור', options, request: '' };
}

const BED_REQUEST_LABEL = {
  split: 'מיטות נפרדות',
  joined: 'מיטה זוגית',
  sofa: 'ספה נפתחת',
};

export function bedPrepLine(prep) {
  if (!prep) return 'סידור מיטות: אין מידע';
  if (prep.status === 'done' || prep.status === 'confirmed' || prep.status === 'only') {
    return `סידור מיטות: ${prep.label}${prep.status === 'done' ? ' · הושלם' : ''}`;
  }
  if (prep.status === 'review') return 'סידור מיטות: הבקשה לא תואמת את החדר';
  if (prep.status === 'pending') return 'סידור מיטות: ממתין לבחירה';
  if (prep.request) return `סידור מיטות: ${BED_REQUEST_LABEL[prep.request] || prep.request}`;
  return 'סידור מיטות: אין מידע';
}
