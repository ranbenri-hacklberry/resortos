/**
 * Cardcom CreateDate/DealDate is Israel local wall-clock WITHOUT a timezone.
 * Historically we stored it with a +00:00 / Z suffix, which shifts display by ~2h
 * when rendered in Asia/Jerusalem. Normalize on ingest and correct legacy rows
 * only through this code path (no ad-hoc DB writes).
 */

function israelOffsetMsAt(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - utcMs;
}

/** Interpret a timezone-less Cardcom wall clock as Asia/Jerusalem → ISO UTC. */
export function israelWallTimeToIso(wall) {
  const str = String(wall || '').trim();
  const m = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] || 0);
  let utc = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = israelOffsetMsAt(utc);
  utc = Date.UTC(y, mo - 1, d, h, mi, s) - off;
  const off2 = israelOffsetMsAt(utc);
  if (off2 !== off) {
    utc = Date.UTC(y, mo - 1, d, h, mi, s) - off2;
  }
  return new Date(utc).toISOString();
}

/**
 * Normalize any Cardcom deal_time value to a true UTC ISO string.
 * - Explicit non-zero offset: keep as absolute instant.
 * - No timezone (Cardcom local): treat as Asia/Jerusalem wall clock.
 * - Legacy bug: same wall digits tagged +00:00 / Z → reinterpret as Israel local.
 */
export function normalizeCardcomDealTime(raw, { correctUtcTaggedLegacy = true } = {}) {
  if (raw == null || raw === '') return new Date().toISOString();
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? new Date().toISOString() : raw.toISOString();
  }
  const str = String(raw).trim();

  // Legacy: Israel wall incorrectly persisted as UTC.
  if (
    correctUtcTaggedLegacy &&
    /[Tt]\d{2}:\d{2}/.test(str) &&
    /([zZ]|[+]00:?00)$/.test(str)
  ) {
    const face = str.replace(/([zZ]|[+]00:?00)$/, '');
    const fixed = israelWallTimeToIso(face);
    if (fixed) return fixed;
  }

  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(str)) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? str : d.toISOString();
  }

  const fromWall = israelWallTimeToIso(str);
  if (fromWall) return fromWall;

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? str : d.toISOString();
}

/** dd.mm HH:MM in Asia/Jerusalem for popup UI. */
export function formatCardcomDealDateTimeHe(raw) {
  if (!raw) return '';
  const iso = normalizeCardcomDealTime(raw);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  return `${parts.day}.${parts.month} ${parts.hour}:${parts.minute}`;
}
