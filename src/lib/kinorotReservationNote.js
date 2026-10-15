function decode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
    || String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i'));
  return match ? decode(match[1]) : '';
}

function reservationFormHtml(html) {
  return String(html || '').match(/<form\b[^>]*id="reservation-form"[\s\S]*?<\/form>/i)?.[0] || '';
}

export function reservationFormFields(html) {
  const form = reservationFormHtml(html);
  const fields = [];
  const pattern = /<(input|textarea|select)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi;
  for (const match of form.matchAll(pattern)) {
    const tag = match[0];
    const kind = match[1].toLowerCase();
    const open = tag.match(/^<[^>]+>/)?.[0] || tag;
    const name = attr(open, 'name');
    if (!name) continue;
    if (kind === 'input') {
      const type = (attr(open, 'type') || 'text').toLowerCase();
      if (['submit', 'button', 'file', 'image', 'reset'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(open)) continue;
      fields.push([name, attr(open, 'value')]);
      continue;
    }
    if (kind === 'textarea') {
      const inner = tag.replace(/^<textarea\b[^>]*>/i, '').replace(/<\/textarea>$/i, '');
      fields.push([name, decode(inner)]);
      continue;
    }
    const options = [...tag.matchAll(/<option\b[^>]*>/gi)].map((item) => item[0]);
    const chosen = options.find((option) => /\bselected\b/i.test(option)) || options[0];
    if (chosen) fields.push([name, attr(chosen, 'value')]);
  }
  return fields;
}

export function withReservationNote(fields, note) {
  let replaced = false;
  const next = (fields || []).map(([name, value]) => {
    if (name !== 'note') return [name, value];
    replaced = true;
    return [name, String(note || '')];
  });
  if (!replaced) next.push(['note', String(note || '')]);
  return next;
}

export function kinorotReservationId(booking) {
  const fromId = String(booking?.id || '').match(/_(\d+)$/);
  if (fromId) return fromId[1];
  return String(booking?.special_requests || '').match(/kinorot:(\d+)/)?.[1] || '';
}

function cashPaidStamp(at = new Date()) {
  const date = new Date(at);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour')}:${pick('minute')}`;
}

export function cashPaidNoteLine(agorot, { by = '', at = new Date() } = {}) {
  const shekels = Math.round(Number(agorot) || 0) / 100;
  const amount = shekels > 0
    ? ` ${shekels.toLocaleString('he-IL', { maximumFractionDigits: shekels % 1 ? 2 : 0 })} ש״ח`
    : '';
  const who = String(by || '').trim() || 'משרד';
  return `שולם מזומן${amount} · קיבל ${who} · ${cashPaidStamp(at)}`;
}

export function appendCashPaidNote(note, agorot, options = {}) {
  const line = cashPaidNoteLine(agorot, options);
  const text = String(note || '').replace(/\r\n/g, '\n').trim();
  if (text.split('\n').some((row) => row.trim() === line)) return text;
  return text ? `${text}\n${line}` : line;
}

export function reservationNoteFromHtml(html) {
  const note = reservationFormFields(html).find(([name]) => name === 'note');
  return note ? note[1] : '';
}
