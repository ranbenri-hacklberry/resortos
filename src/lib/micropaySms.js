export const MICROPAY_SMS_URL = 'https://www.micropay.co.il/extApi/scheduleSms.php';

/** Local Israeli mobile for Micropay `list` (digits only, leading 0). */
export function toMicropayPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 11) return `0${digits.slice(3)}`;
  if (digits.startsWith('0') && digits.length >= 9) return digits;
  if (digits.length === 9) return `0${digits}`;
  return '';
}

export function micropaySender(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^[A-Za-z][A-Za-z0-9]{1,10}$/.test(value)) return value;
  return value.replace(/\D/g, '');
}

export function parseMicropayResponse(body) {
  if (body == null) return { ok: false, message: 'ERROR', description: 'empty' };
  if (typeof body === 'string') {
    const text = body.trim();
    if (text.startsWith('{')) {
      try {
        return parseMicropayResponse(JSON.parse(text));
      } catch {
        /* fall through */
      }
    }
    if (/^OK\b/i.test(text)) {
      return { ok: true, message: 'OK', taskId: text.replace(/^OK\s*/i, '').trim() };
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
      return { ok: true, message: 'OK', credit: text };
    }
    const code = text.split(/\s+/)[0] || 'ERROR';
    return { ok: false, message: code, description: text };
  }
  const message = String(body.message || '');
  const credit = body.data?.credit;
  if (message === 'OK' || message === 'CODE_SENT' || credit != null) {
    return {
      ok: true,
      message: message || 'OK',
      taskId: String(body.data?.taskId || ''),
      credit
    };
  }
  return {
    ok: false,
    message: message || 'ERROR',
    description: String(body.data?.description || ''),
    credit
  };
}

export function guestStaySmsText({ unitName, checkInDate, checkoutUrl }) {
  const [year, month, day] = String(checkInDate || '').split('-');
  const when = day ? `${day}/${month}/${year}` : (checkInDate || '');
  return `שלום! להשלמת אישור ההזמנה ב-${unitName} לתאריך ${when}, לחצו על הקישור:\n${checkoutUrl}`;
}
