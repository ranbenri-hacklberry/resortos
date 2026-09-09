import { sendMicropaySms } from './micropaySms.js';
import {
  sameDayAlertPhones,
  sameDayBookingSmsText,
  sameDayCreatedBookings
} from '../src/lib/sameDayKinorotSms.js';

export async function notifySameDayKinorotBookings(created, today, env = process.env) {
  if (String(env.KINOROT_SAME_DAY_SMS || '1') === '0') {
    return { sent: 0, skipped: true };
  }
  const rows = sameDayCreatedBookings(created, today);
  const phones = sameDayAlertPhones(env);
  if (!rows.length || !phones.length) {
    return { sent: 0, rows: rows.length, phones: phones.length };
  }
  const errors = [];
  let sent = 0;
  for (const row of rows) {
    const message = sameDayBookingSmsText(row);
    for (const phone of phones) {
      try {
        await sendMicropaySms({ phone, message });
        sent += 1;
      } catch (err) {
        errors.push({ phone, id: row.id, error: err.message || String(err) });
      }
    }
  }
  return { sent, rows: rows.length, phones: phones.length, errors };
}
