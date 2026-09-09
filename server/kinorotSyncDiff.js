function ymd(value) {
  return String(value || '').slice(0, 10);
}

function normName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function guestChanged(prev, next) {
  const a = normName(prev);
  const b = normName(next);
  if (!a || !b || a === 'אורח' || b === 'אורח') return false;
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
}

function slim(row) {
  return {
    id: row.id,
    unit_id: row.unit_id,
    guest_name: row.guest_name || 'אורח',
    check_in_date: ymd(row.check_in_date),
    check_out_date: ymd(row.check_out_date)
  };
}

export function isLiveKinRow(row) {
  return Boolean(row)
    && !row.deleted_at
    && String(row.booking_status || '') !== 'CANCELED';
}

export function summarizeKinorotDiff({ incoming = [], existing = [], today }) {
  const byId = new Map((existing || []).map((row) => [row.id, row]));
  const incomingIds = new Set((incoming || []).map((row) => row.id));
  const created = [];
  const updated = [];

  for (const row of incoming || []) {
    const prev = byId.get(row.id);
    if (!isLiveKinRow(prev)) {
      created.push(slim(row));
      continue;
    }
    const fields = [];
    if (ymd(prev.check_in_date) !== ymd(row.check_in_date)) {
      fields.push({ field: 'check_in', from: ymd(prev.check_in_date), to: ymd(row.check_in_date) });
    }
    if (ymd(prev.check_out_date) !== ymd(row.check_out_date)) {
      fields.push({ field: 'check_out', from: ymd(prev.check_out_date), to: ymd(row.check_out_date) });
    }
    if (String(prev.unit_id || '') !== String(row.unit_id || '')) {
      fields.push({ field: 'unit', from: prev.unit_id, to: row.unit_id });
    }
    if (guestChanged(prev.guest_name, row.guest_name)) {
      fields.push({ field: 'guest', from: prev.guest_name, to: row.guest_name });
    }
    if (fields.length) updated.push({ ...slim(row), fields });
  }

  const removed = (existing || []).filter((row) => (
    isLiveKinRow(row)
    && !incomingIds.has(row.id)
    && (!today || ymd(row.check_out_date) >= today)
  )).map(slim);

  return {
    created,
    updated,
    removed,
    total: created.length + updated.length + removed.length
  };
}

export function kinorotChangeCount(changes) {
  if (!changes) return 0;
  return (changes.created?.length || 0)
    + (changes.updated?.length || 0)
    + (changes.removed?.length || 0);
}
