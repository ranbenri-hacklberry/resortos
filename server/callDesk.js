/** Who may take a guest call, and how a WhatsApp reply moves it. */

export const CALLERS = [
  { id: 'rani', name: 'רני', phones: ['972548317887', '0548317887', '170626836910125', '972506102416', '0506102416'] },
  { id: 'zuki', name: 'צוקי', phones: ['972529690024', '0529690024'] },
  { id: 'barak', name: 'ברק', phones: ['972515262609', '0515262609'] }
];

export const OFFICE_IDS = ['rani'];
export const OFFICE_WAIT_MS = 3 * 60 * 1000;

export function phoneTail(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits.slice(3).slice(-9);
  if (digits.startsWith('0')) return digits.slice(1).slice(-9);
  return digits.slice(-9);
}

export function callerById(id) {
  return CALLERS.find((row) => row.id === id) || null;
}

export function callerByPhone(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  if (!raw) return null;
  return CALLERS.find((row) => row.phones.some((item) => {
    const digits = item.replace(/\D/g, '');
    if (digits === raw) return true;
    const left = phoneTail(digits);
    const right = phoneTail(raw);
    return Boolean(left && right && left.length >= 7 && left === right);
  })) || null;
}

export function otherCallers(id) {
  return ['rani', 'zuki', 'barak'].filter((item) => item !== id).map(callerById);
}

export function whatsAppPhone(caller) {
  const match = (caller?.phones || []).find((p) => {
    const d = String(p).replace(/\D/g, '');
    return (d.startsWith('9725') && d.length === 12) || (d.startsWith('05') && d.length === 10);
  });
  const first = match || caller?.phones?.[0] || '';
  let digits = first.replace(/\D/g, '');
  if (digits.startsWith('05')) return `972${digits.slice(1)}`;
  return digits;
}

export function offerText(call, caller) {
  const others = otherCallers(caller.id);
  const who = [call?.guest_name, call?.cabin, call?.guest_phone].filter(Boolean).join(' · ');
  return [
    'אורח מבקש שיחה',
    who,
    '1 אני מתקשר',
    `2 להעביר ל${others[0].name}`,
    `3 להעביר ל${others[1].name}`
  ].join('\n');
}

export function closeText() {
  return 'קיבלת את השיחה. כשתסיים:\n1 נפתר\n2 יש הערה\n3 לפתוח משימה';
}

export function guestMorningText(call) {
  const name = String(call?.guest_name || '').trim();
  return `שלום${name ? ` ${name}` : ''}, קיבלנו את הבקשה לשיחה. נחזור אליך בבוקר.`;
}

export function israelClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday || '',
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
  };
}

/** Weekdays, and Friday before candle-lighting, and only until 21:00. */
export function inBarakWindow(now = new Date(), candlesMinutes = 18 * 60) {
  const clock = israelClock(now);
  if (clock.minutes >= 21 * 60) return false;
  if (clock.weekday === 'Sat') return false;
  if (clock.weekday === 'Fri' && clock.minutes >= candlesMinutes) return false;
  return true;
}

export function applyWhatsAppReply(call, phone, text) {
  const caller = callerByPhone(phone);
  const trimmed = String(text || '').trim();
  if (!call || call.acked_at || !caller || !trimmed) return { reply: '' };
  if ((call.phase === 'note' || call.phase === 'task') && call.ownerId === caller.id) {
    return call.phase === 'note'
      ? { reply: 'ההערה נשמרה. תודה.', close: 'note', note: trimmed, actor: caller }
      : { reply: 'פתחתי משימה. תודה.', close: 'task', task: trimmed, actor: caller };
  }
  const digit = trimmed.match(/^([123])$/)?.[1] || '';
  if (!digit) return { reply: '' };
  const waiting = call.phase !== 'taken' && call.phase !== 'note' && call.phase !== 'task';
  if (waiting) {
    if (digit === '1') return { reply: closeText(), take: caller };
    const target = otherCallers(caller.id)[digit === '2' ? 0 : 1];
    return { reply: `העברתי את השיחה ל${target.name}.`, transferTo: target, actor: caller };
  }
  if (call.phase === 'taken' && call.ownerId === caller.id) {
    if (digit === '1') return { reply: 'נרשם שהשיחה נפתרה.', close: 'resolved', actor: caller };
    if (digit === '2') return { reply: 'כתוב את ההערה.', ask: 'note', actor: caller };
    return { reply: 'מה המשימה?', ask: 'task', actor: caller };
  }
  return { reply: '' };
}
