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

/* ── Checkout events (Ran 2026-10-21): one checkout = one entry, id `checkout:<bookingId>`. ── */
export const CHECKOUT_SOURCE = { guest: 'אורח מהדף', guest_message: 'אורח בוואטסאפ', manager: 'מנהל', sync: 'סנכרון' };

export function checkoutSourceOf(booking) {
  const s = booking?.stay || {};
  if (s.self_checked_out_at || booking?.checkout_status === 'self_departed' || s.checkout_status === 'self_departed') return 'guest';
  if (booking?.checkout_status === 'guest_message') return 'guest_message';
  if (s.manager_checked_out_at) return 'manager';
  return 'sync';
}

export function checkoutAtOf(booking, source = checkoutSourceOf(booking)) {
  const s = booking?.stay || {};
  if (source === 'guest' || source === 'guest_message') return s.self_checked_out_at || booking?.checked_out_at || booking?.updated_at || new Date().toISOString();
  if (source === 'manager') return s.manager_checked_out_at || booking?.checked_out_at || booking?.updated_at || new Date().toISOString();
  // Sync rows: updated_at is bumped on every sync run, so cap at the booked checkout time (11:00 Israel).
  const candidates = [booking?.checked_out_at, booking?.updated_at].filter(Boolean);
  const booked = booking?.check_out_date ? israelWallToIso(booking.check_out_date, '11:00') : null;
  if (booked) candidates.push(booked);
  const times = candidates.map((v) => new Date(v)).filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) return new Date().toISOString();
  return new Date(Math.min(...times.map((d) => d.getTime()))).toISOString();
}

/** 'YYYY-MM-DD' + 'HH:MM' Israel wall time → ISO (handles DST). */
export function israelWallToIso(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess);
  const [h, m] = parts.split(':').map(Number);
  const [wh, wm] = hhmm.split(':').map(Number);
  const offsetMin = (h * 60 + m) - (wh * 60 + wm);
  return new Date(guess.getTime() - ((offsetMin + 1440 * 2) % 1440 > 720 ? offsetMin - 1440 : offsetMin) * 60000).toISOString();
}

function lateLabel(stay) {
  const v = String(stay?.late_until || stay?.checkout_time || '').trim();
  if (!v || v === '11:00') return '';
  if (v === 'next' || /\+1$/.test(v)) {
    const t = v.replace('+1', '').trim();
    return /^\d{1,2}:\d{2}$/.test(t) ? `צ׳ק-אאוט מאוחר – למחרת עד ${t}` : 'צ׳ק-אאוט מאוחר – למחרת';
  }
  return /^\d{1,2}:\d{2}$/.test(v) ? `צ׳ק-אאוט מאוחר עד ${v}` : '';
}

export function checkoutLogId(bookingId) {
  return `checkout:${bookingId}`;
}

/** Room-log event for a booking that is CHECKED_OUT. Returns null when not checked out / no id. */
export function buildCheckoutLogEvent(booking, { source } = {}) {
  if (!booking?.id) return null;
  const src = source || checkoutSourceOf(booking);
  const at = checkoutAtOf(booking, src);
  const name = String(booking.guest_name || '').trim();
  const late = lateLabel(booking.stay);
  const text = ['צ׳ק-אאוט', name, late].filter(Boolean).join(' · ');
  return {
    id: checkoutLogId(booking.id),
    at,
    kind: 'checkout',
    actor: CHECKOUT_SOURCE[src] || CHECKOUT_SOURCE.sync,
    text,
    quote: '',
    booking_id: booking.id
  };
}

export function hasCheckoutLog(sop, bookingId) {
  const list = Array.isArray(sop?.roomLog) ? sop.roomLog : [];
  return list.some((row) => row?.id === checkoutLogId(bookingId));
}
