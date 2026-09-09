import { getPostgrestConfig, fetchPostgrest } from '../_db.js';

/**
 * Cloudflare Pages Function: RFC 5545 compliant iCal calendar feed
 * Route: /api/ical/:unitId or /api/ical/:unitId.ics
 * Live queries actual bookings from hotelos_bookings table.
 * Zero guest PII is exposed.
 */

function formatIcalDate(isoDate) {
  return String(isoDate || '').replace(/[-:]/g, '').split('T')[0];
}

function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

export async function onRequest(context) {
  const { params, env } = context;
  let rawUnitId = params.unitId || 'default';
  const unitId = rawUnitId.replace(/\.ics$/i, '');

  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const { tenantId } = getPostgrestConfig(env);

  let activeBookings = [];

  // Query live active bookings from hotelos_bookings
  const query = `/hotelos_bookings?tenant_id=eq.${tenantId}&unit_id=eq.${encodeURIComponent(unitId)}&deleted_at=is.null&booking_status=not.in.(CANCELED,CHECKED_OUT)&select=id,check_in_date,check_out_date,channel_source`;
  const res = await fetchPostgrest(query, { method: 'GET' }, env);

  if (res && res.ok) {
    const rows = await res.json().catch(() => []);
    activeBookings = Array.isArray(rows) ? rows : [];
  }

  // Build standard RFC 5545 iCalendar stream
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResortOS//Calendar Sync 2.0//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Resort Unit ${unitId}`,
    'X-WR-TIMEZONE:Asia/Jerusalem'
  ];

  for (const b of activeBookings) {
    const uid = `${b.id || 'b'}-${unitId}@resortos.co`;
    const checkIn = formatIcalDate(b.check_in_date);
    const checkOut = formatIcalDate(b.check_out_date);

    if (checkIn && checkOut) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${checkIn}`);
      lines.push(`DTEND;VALUE=DATE:${checkOut}`);
      // Zero PII: Strictly generic summary
      lines.push('SUMMARY:Reserved');
      lines.push('STATUS:CONFIRMED');
      lines.push('TRANSP:OPAQUE');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');

  const icsBody = lines.map(foldLine).join('\r\n') + '\r\n';

  return new Response(icsBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${unitId}.ics"`,
      'Cache-Control': 'public, max-age=900, s-maxage=900',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
