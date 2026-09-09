import { cabinCatalog } from './cabinCatalog.js';

export function defaultCabinParty() {
  return { adults: 2, children: 0, crib: false, occupant_name: '', occupant_phone: '' };
}

export function digitsPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function normalizeCabinParties(cabinIds, parties = {}) {
  return (cabinIds || []).map((id) => {
    const cabin = cabinCatalog(id) || {};
    const max = Math.max(1, Number(cabin.maxOccupancy) || 6);
    const raw = parties[id] || parties[cabin.id] || {};
    const adults = Math.max(1, Math.min(max, Math.floor(Number(raw.adults) || 2)));
    const children = Math.max(0, Math.min(max - adults, Math.floor(Number(raw.children) || 0)));
    return {
      cabin_id: id,
      name: cabin.name || id,
      adults,
      children,
      crib: Boolean(raw.crib),
      occupant_name: String(raw.occupant_name || '').trim(),
      occupant_phone: digitsPhone(raw.occupant_phone),
      max
    };
  });
}

export function cabinPartyTotals(list) {
  return (list || []).reduce((sum, row) => ({
    adults: sum.adults + Number(row.adults || 0),
    children: sum.children + Number(row.children || 0),
    cribs: sum.cribs + (row.crib ? 1 : 0)
  }), { adults: 0, children: 0, cribs: 0 });
}

export function cabinPartyError(list) {
  for (const row of list || []) {
    if (row.adults < 1) return `ב${row.name} חייב להיות לפחות מבוגר אחד`;
    if (row.adults + row.children > row.max) {
      return `${row.name} עד ${row.max} אורחים (בלי מיטת תינוק)`;
    }
    if ((list || []).length > 1 && digitsPhone(row.occupant_phone).length < 9) {
      return `חסר טלפון של מי שמתארח ב${row.name}`;
    }
  }
  return '';
}

export function cabinPartySummaryHe(list) {
  return (list || []).map((row) => {
    const bits = [`${row.name}: ${row.adults} מבוגרים`];
    if (row.children) bits.push(`${row.children} ילדים`);
    if (row.crib) bits.push('מיטת תינוק');
    if (row.occupant_name) bits.push(row.occupant_name);
    if (row.occupant_phone) bits.push(row.occupant_phone);
    return bits.join(', ');
  }).join(' · ');
}

export function applyStayCabin(booking, unitId) {
  if (!booking) return booking;
  const ids = [...new Set([].concat(
    booking.stay?.cabin_ids || booking.cabin_ids || booking.unit_id
  ).map((id) => String(id || '').trim()).filter(Boolean))];
  const id = ids.includes(String(unitId || '')) ? String(unitId) : String(booking.unit_id || ids[0] || '');
  const party = (booking.stay?.cabin_parties || []).find((row) => row.cabin_id === id);
  return {
    ...booking,
    unit_id: id || booking.unit_id,
    guest_name: party?.occupant_name || booking.guest_name,
    guest_phone: party?.occupant_phone || booking.guest_phone
  };
}

export function stayLinksForParties(token, parties, origin = 'https://resortos.app') {
  const base = `${String(origin || 'https://resortos.app').replace(/\/$/, '')}/stay/${encodeURIComponent(token)}`;
  return (parties || []).map((row) => ({
    cabin_id: row.cabin_id,
    name: row.name || row.cabin_id,
    occupant_name: row.occupant_name || '',
    occupant_phone: row.occupant_phone || '',
    url: `${base}?unit=${encodeURIComponent(row.cabin_id)}`
  }));
}
