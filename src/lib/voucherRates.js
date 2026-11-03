import { kinorotSettlementKind } from './bookingPaid';

/** After the 25% discount. Source: ~/resortos-private/vouchers/נופש-ברמה-2026.md */
const RATES = {
  standard: { midweek: 412.5, midweekMany: 375, thursday: 600, weekend: 1350 },
  nofim: { midweek: 525, midweekMany: 487.5, thursday: 750, weekend: 1650 },
  chateau: { midweek: 562.5, midweekMany: 525, thursday: 750, weekend: 1650 },
  mayaPrivate: { midweek: 562.5, midweekMany: 525, thursday: 750, weekend: 1800 },
  dome: { midweek: 562.5, midweekMany: 525, thursday: 750, weekend: 1650 }
};

const SHARED_POOL = new Set(['nurit', 'taj', 'mool', 'toscana', 'musical', 'hill']);

function familyOf(unitId) {
  const id = String(unitId || '');
  if (/^k67[1-9]$/.test(id)) return 'nurit';
  if (/^k80[8-9]$/.test(id) || id === 'k810' || id === 'k811') return 'taj';
  if (/^k68[0-4]$/.test(id)) return 'mool';
  if (id === 'k685' || id === 'k686') return 'nofim';
  if (/^k68[7-9]$/.test(id)) return 'toscana';
  if (/^k69[0-2]$/.test(id)) return 'musical';
  if (/^k69[3-5]$/.test(id)) return 'maya';
  if (id.startsWith('hill-')) return 'hill';
  if (id.startsWith('dome-')) return 'kipat';
  return '';
}

function tierOf(unitId) {
  const id = String(unitId || '');
  const family = familyOf(id);
  if (id === 'k689') return 'chateau';
  if (family === 'nofim') return 'nofim';
  if (id === 'k693' || id === 'k695') return 'mayaPrivate';
  if (family === 'kipat') return 'dome';
  if (family) return 'standard';
  return '';
}

function nightDates(checkIn, checkOut) {
  const start = String(checkIn || '').slice(0, 10);
  const end = String(checkOut || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start) return [];
  const days = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor < last && days.length < 21) {
    days.push(cursor.getDay());
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function shekelsFor(tier, days) {
  const rates = RATES[tier];
  if (!rates || !days.length) return 0;
  const midweek = (day) => day >= 0 && day <= 3;
  if (days.length === 2 && (days[0] === 4 || days[0] === 5)) return rates.weekend;
  if (days.length === 1 && days[0] === 4) return rates.thursday;
  if (days.every(midweek)) {
    return days.length === 1 ? rates.midweek : rates.midweekMany * days.length;
  }
  return days.reduce((sum, day) => sum + (day === 4 ? rates.thursday : midweek(day) ? rates.midweek : 0), 0)
    + (days.includes(5) && days.includes(6) ? rates.weekend : 0);
}

export function voucherStayValue(booking) {
  const tier = tierOf(booking?.unit_id);
  const days = nightDates(booking?.check_in_date, booking?.check_out_date);
  const shekels = shekelsFor(tier, days);
  if (!(shekels > 0)) return null;
  const shared = SHARED_POOL.has(familyOf(booking?.unit_id));
  const corrective = shared && days.length === 1 && days[0] >= 0 && days[0] <= 3;
  return {
    agorot: Math.round(shekels * 100),
    label: corrective ? 'שובר חוויה מתקנת · מיאליס' : 'שובר נופש ברמה',
    corrective
  };
}

export function voucherChargeForBooking(booking) {
  const mode = String(booking?.payment_mode || '').toUpperCase();
  if (kinorotSettlementKind(booking) !== 'voucher' && mode !== 'VOUCHER') return null;
  const priced = voucherStayValue(booking);
  if (!priced) return null;
  return {
    source: 'VOUCHER',
    method: 'voucher',
    accountKey: 'VOUCHER',
    accountLabel: priced.label,
    amount_agorot: priced.agorot,
    date: String(booking?.check_in_date || '').slice(0, 10),
    txn: `voucher_${booking?.id || priced.label}`
  };
}
