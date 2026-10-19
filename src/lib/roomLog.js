/** Append-only room history stored on the unit. The priority card reads it. */

export function roomLogClock(iso, now = new Date()) {
  const date = new Date(iso || now);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function event(kind, at, actor, text, quote) {
  return {
    id: `${at}:${kind}:${text}`.slice(0, 180),
    at,
    kind,
    actor: actor || '',
    text,
    quote: quote || ''
  };
}

function statusLine(status, reason) {
  if (status === 'DIRTY') return 'ממתין לניקיון';
  if (status === 'IN_PROGRESS') return 'בניקיון';
  if (status === 'MAINTENANCE_ALERT') return 'תקלה';
  if (status === 'READY' && /אושר/.test(reason || '')) return 'אישר שהחדר מוכן';
  if (status === 'READY' && /ביקורת|בדיקה/.test(reason || '')) return 'סיים ניקיון, ממתין לאישור מנהל';
  if (status === 'READY') return 'מוכן לאורח';
  return status || 'עודכן';
}

/**
 * Events for one save. A cleaner entry starts the default cycle.
 * quote is the message exactly as it was written.
 */
export function buildRoomLogEvents(existing, next, quote, at = new Date().toISOString()) {
  const prevStatus = existing?.operational_status || '';
  const nextStatus = next?.operational_status || '';
  const prevReason = String(existing?.custom_reason || '');
  const nextReason = String(next?.custom_reason || '');
  const actor = next?.room_log_actor || next?.assigned_staff || existing?.assigned_staff || '';
  const note = String(quote || '').trim();
  const events = [];
  const cashAgorot = Math.round(Number(next?.room_log_cash?.amount_agorot) || 0);
  if (cashAgorot > 0) {
    const shekels = cashAgorot / 100;
    const label = `₪${shekels.toLocaleString('he-IL', { maximumFractionDigits: shekels % 1 ? 2 : 0 })}`;
    events.push(event('cash', at, next.room_log_cash.actor || actor, `גבה מזומן ${label}`, note));
  }

  if (nextStatus === 'IN_PROGRESS' && prevStatus !== 'IN_PROGRESS') {
    events.push(event('enter', at, actor, 'נכנס לניקיון', note));
  } else if (prevStatus === 'IN_PROGRESS' && nextStatus && nextStatus !== 'IN_PROGRESS') {
    events.push(event('leave', at, actor, 'יצא מהחדר', note));
  }

  const managerReady = nextStatus === 'READY' && /אושר/.test(nextReason) && prevReason !== nextReason;
  if (managerReady) {
    events.push(event('ready', at, actor, 'אישר שהחדר מוכן', note));
  } else if (nextStatus && nextStatus !== prevStatus && nextStatus !== 'IN_PROGRESS' && !(prevStatus === 'IN_PROGRESS' && events.some((row) => row.kind === 'leave'))) {
    events.push(event('status', at, actor, statusLine(nextStatus, nextReason), note));
  } else if (!events.length && nextReason && nextReason !== prevReason) {
    events.push(event('report', at, actor, nextReason, note || nextReason));
  }

  const prevStay = existing?.staff_occupancy || '';
  const nextStay = next?.staff_occupancy || '';
  if (nextStay && nextStay !== prevStay) {
    events.push(event('stay', at, actor, nextStay === 'OCCUPIED' ? 'סומן מאוכלס' : 'סומן פנוי', note));
  }

  if (note && !events.length) {
    events.push(event('report', at, actor, note, note));
  } else if (note) {
    for (const row of events) {
      if (!row.quote) row.quote = note;
    }
  }
  return events;
}

export function appendRoomLog(sop, events) {
  const base = sop && typeof sop === 'object' ? sop : {};
  const prev = Array.isArray(base.roomLog) ? base.roomLog : [];
  const next = [...prev];
  for (const row of events || []) {
    if (!next.some((item) => item.id === row.id)) next.push(row);
  }
  return { ...base, roomLog: next.slice(-200) };
}

/** Default window: from the latest cleaner entry. Older cycles stay available. */
export function visibleRoomLog(events, scope = 'cycle') {
  const list = Array.isArray(events) ? events : [];
  if (scope === 'all') return list;
  let start = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.kind === 'enter') {
      start = i;
      break;
    }
  }
  return start >= 0 ? list.slice(start) : list;
}
