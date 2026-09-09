import { toMicropayPhone } from './micropaySms.js';
import { isUnavailableHoldBooking } from './unavailableHold.js';
import { unitFullName } from './units.js';

export const DEFAULT_SAME_DAY_SMS_PHONES = ['0506102416', '0533932462'];

export function sameDayAlertPhones(env = process.env) {
  const raw = String(env.KINOROT_SAME_DAY_SMS_PHONES || '').trim();
  const listed = (raw ? raw.split(/[,\s]+/) : DEFAULT_SAME_DAY_SMS_PHONES)
    .map((phone) => toMicropayPhone(phone))
    .filter(Boolean);
  return [...new Set(listed)];
}

export function sameDayCreatedBookings(created, today) {
  const day = String(today || '').slice(0, 10);
  return (created || []).filter((row) => {
    if (!row || !day) return false;
    if (String(row.check_in_date || '').slice(0, 10) !== day) return false;
    if (isUnavailableHoldBooking(row)) return false;
    return true;
  });
}

function heDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  return day ? `${Number(day)}/${Number(month)}` : String(iso || '');
}

export function sameDayBookingSmsText(row) {
  const unit = unitFullName(row?.unit_id, row?.unit_id);
  const guest = String(row?.guest_name || 'אורח').replace(/\s+/g, ' ').trim() || 'אורח';
  return [
    'הזמנה חדשה להיום',
    unit,
    guest,
    `כניסה ${heDate(row?.check_in_date)} יציאה ${heDate(row?.check_out_date)}`
  ].join('\n');
}
