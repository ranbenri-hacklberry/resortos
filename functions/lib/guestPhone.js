/** Normalize Israeli mobiles and WhatsApp sender ids to E.164 + a search tail. */

export function stripWhatsAppSender(raw) {
  return String(raw || '')
    .trim()
    .replace(/@c\.us$/i, '')
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/^whatsapp:/i, '');
}

export function normalizeGuestPhone(raw) {
  const cleaned = stripWhatsAppSender(raw);
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return { e164: '', tail: '', local: '' };

  let national = digits;
  if (digits.startsWith('972')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);

  const tail = national.slice(-9);
  if (tail.length < 8) return { e164: '', tail, local: '' };

  return {
    e164: `+972${tail}`,
    tail,
    local: tail.length === 9 ? `0${tail}` : ''
  };
}

export function phoneSearchTail(raw) {
  return normalizeGuestPhone(raw).tail;
}
