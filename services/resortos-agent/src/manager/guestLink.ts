import type { BookingRow } from '../integration/resortos.js';

export interface GuestLinkChoice {
  bookingId: string;
  phone: string;
  stayUrl: string;
  guestName: string;
  label: string;
}

export function stayUrlOf(booking?: { checkout_token?: string | null } | null): string {
  const token = String(booking?.checkout_token || '').trim();
  return token ? `https://resortos.app/stay/${token}` : '';
}

/** Israeli mobile as 05xxxxxxxx, or empty when the text is not a mobile number. */
export function displayPhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 12 && digits[3] === '5') return `0${digits.slice(3, 12)}`;
  if (digits.startsWith('05') && digits.length >= 10) return digits.slice(0, 10);
  if (digits.length === 9 && digits.startsWith('5')) return `0${digits}`;
  return '';
}

export function phoneFromReply(raw: string): string {
  const match = String(raw || '').match(/(?:\+?972[\s\-]?|0)5\d(?:[\s\-]?\d){7}|5\d(?:[\s\-]?\d){7}/);
  return match ? displayPhone(match[0]) : '';
}

export function guestLinkSms(unitName: string, stayUrl: string): string {
  return `שלום! הקישור לדף האורח ב-${unitName}:\n${stayUrl}`;
}

export function guestLinkConfirm(name: string, phone: string): string {
  return `לשלוח קישור לדף האורח של ${name} בסמס למספר ${phone}?\nהשב *כן* לאישור, או כתוב מספר אחר.`;
}

export function guestLinkPickText(choices: GuestLinkChoice[]): string {
  const lines = choices.map((choice, index) => {
    const phone = choice.phone || 'אין מספר';
    return `${index + 1} - ${choice.label}: ${choice.guestName} · ${phone}`;
  });
  return `למי לשלוח את קישור דף האורח בסמס?\n${lines.join('\n')}`;
}

export function linkChoice(booking: BookingRow, label: string): GuestLinkChoice | null {
  const stayUrl = stayUrlOf(booking);
  if (!booking.id || !stayUrl) return null;
  return {
    bookingId: booking.id,
    phone: displayPhone(booking.guest_phone),
    stayUrl,
    guestName: booking.guest_name || 'האורח',
    label,
  };
}
