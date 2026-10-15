import { KINOROT_PLACE_TO_UNIT } from '../../server/kinorotPlaces.js';

export function kinorotPlaceId(unitId) {
  const placeId = Object.entries(KINOROT_PLACE_TO_UNIT).find(([, id]) => id === unitId)?.[0] || '';
  return placeId;
}

export function holdThroughTomorrow(today) {
  const checkIn = String(today || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    throw new Error('תאריך לא תקין');
  }
  const date = new Date(`${checkIn}T12:00:00`);
  date.setDate(date.getDate() + 1);
  const checkOut = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  return { checkIn, checkOut };
}

export function unitOptionFromHtml(html, placeId) {
  const id = String(placeId || '');
  if (!id) return null;
  const tag = String(html || '').match(new RegExp(`<option\\b[^>]*value="${id}"[^>]*>`, 'i'))?.[0] || '';
  if (!tag) return null;
  const attr = (name) => tag.match(new RegExp(`data-${name}="([^"]*)"`, 'i'))?.[1] || '';
  const realId = attr('realid');
  const compId = attr('compid');
  if (!realId || !compId) return null;
  return { placeId: id, realId, compId };
}

export function unavailableHoldFields({ option, checkIn, checkOut, guestName = 'לא זמין' }) {
  return {
    guestname: guestName,
    guestnumid: '',
    guestphone: '',
    guestphone2: '',
    guestmail: '',
    guestaddress: '',
    checkin: checkIn,
    checkout: checkOut,
    doctype: 'חדשה',
    discount: '0',
    totalpay: '0',
    total_hosting: '0',
    vat: '0',
    before_vat: '0',
    total_with_vat: '0',
    remaining: '0',
    units_count: '1',
    compid: option.compId,
    voucher_total: '0',
    hpback: '1',
    res: '',
    terms_id: '1',
    'unit[]': option.placeId,
    'realid[]': option.realId,
    'unit_compid[]': option.compId,
    'adult[]': '0',
    'children[]': '0',
    'baby[]': '0',
    'unit_checkin[]': checkIn,
    'unit_checkout[]': checkOut,
    'unit_nights[]': '1',
    'price[]': '0',
    'price_hidden[]': '0'
  };
}

export function reservationIdFromLocation(location) {
  return String(location || '').match(/[?&]res=(\d+)/)?.[1] || '';
}
