import { createHash } from 'crypto';
import { UNIT_DISPLAY_NAMES } from '../functions/lib/unitNames.js';
import { normalizeStaffPhone } from '../src/lib/staffPhones.js';

const ELIGIBLE = new Set(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);

export function toE164(raw) {
  const local = normalizeStaffPhone(raw);
  if (!/^05\d{8}$/.test(local)) return '';
  return `+972${local.slice(1)}`;
}

export function maskPhone(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `+${digits.slice(0, 3)} ••••${digits.slice(-4)}`;
}

export function addDays(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Server-side booking query for the sync window (same window as isEligibleBooking). */
export function bookingsWindowQuery(tenant, today) {
  const from = addDays(today, -3);
  const to = addDays(today, 14);
  return 'hotelos_bookings?select=id,unit_id,guest_name,guest_phone,check_in_date,check_out_date,booking_status,deleted_at'
    + `&tenant_id=eq.${tenant}&deleted_at=is.null`
    + `&booking_status=in.(${[...ELIGIBLE].join(',')})`
    + `&check_out_date=gte.${from}&check_in_date=lte.${to}`
    + '&order=check_in_date.asc,id.asc';
}

/** Parse a PostgREST Content-Range total ("0-9/42" -> 42, "*\/0" -> 0). Unknown -> null. */
export function contentRangeTotal(header) {
  const m = /\/(\d+)\s*$/.exec(String(header || ''));
  return m ? Number(m[1]) : null;
}

/** A scan is complete only when the server's exact total is known and every row was received. */
export function isScanComplete(received, total) {
  return Number.isInteger(total) && total >= 0 && received === total;
}

export function isEligibleBooking(booking, today) {
  if (!booking || booking.deleted_at) return false;
  const status = String(booking.booking_status || '');
  if (!ELIGIBLE.has(status)) return false;
  const checkIn = String(booking.check_in_date || '');
  const checkOut = String(booking.check_out_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return false;
  const soon = addDays(today, 14);
  const retainFrom = addDays(today, -3);
  const arriving = checkIn >= today && checkIn <= soon;
  const inHouse = checkIn <= today && checkOut > today;
  const recentCheckout = checkOut <= today && checkOut >= retainFrom;
  if (status === 'CHECKED_IN') return true;
  if (status === 'CHECKED_OUT') return recentCheckout;
  return arriving || inHouse || recentCheckout;
}

function stayRank(booking, today) {
  const inHouse = booking.check_in_date <= today && booking.check_out_date > today;
  if (booking.booking_status === 'CHECKED_IN' || inHouse) return 0;
  if (booking.check_in_date >= today) return 1;
  return 2;
}

export function chooseStay(bookings, today) {
  return [...bookings].sort((a, b) => {
    const rank = stayRank(a, today) - stayRank(b, today);
    if (rank) return rank;
    if (stayRank(a, today) === 2) return String(b.check_out_date).localeCompare(String(a.check_out_date));
    return String(a.check_in_date).localeCompare(String(b.check_in_date));
  })[0] || null;
}

function dateLabel(checkIn, checkOut) {
  const [, monthIn, dayIn] = checkIn.split('-');
  const [, monthOut, dayOut] = checkOut.split('-');
  if (monthIn === monthOut) return `${dayIn}–${dayOut}/${monthIn}`;
  return `${dayIn}/${monthIn}–${dayOut}/${monthOut}`;
}

function callScreenUnit(unit) {
  return String(unit || '').replace(/\s*·\s*בקתה\s+/g, ' · ');
}

export function contactDraft(booking, extras = []) {
  const unit = UNIT_DISPLAY_NAMES[booking.unit_id] || String(booking.unit_id || '');
  const guest = String(booking.guest_name || '').replace(/\s+/g, ' ').trim();
  const dates = dateLabel(booking.check_in_date, booking.check_out_date);
  const displayName = `${guest} | ${callScreenUnit(unit)}`;
  const lines = [
    `ResortOS ${booking.id}`,
    unit,
    dates,
    `כניסה ${booking.check_in_date}`,
    `יציאה ${booking.check_out_date}`
  ];
  for (const extra of extras) {
    const name = UNIT_DISPLAY_NAMES[extra.unit_id] || extra.unit_id;
    lines.push(`גם ${name} ${extra.check_in_date}–${extra.check_out_date}`);
  }
  return { displayName, notes: lines.join('\n'), bookingId: booking.id, unit };
}

export function contentHash(draft, e164) {
  return createHash('sha256')
    .update(`${e164}\n${draft.displayName}\n${draft.notes}`, 'utf8')
    .digest('hex');
}

function byPhone(bookings, today) {
  const groups = new Map();
  const skipped = [];
  for (const booking of bookings) {
    if (!isEligibleBooking(booking, today)) continue;
    const e164 = toE164(booking.guest_phone);
    if (!e164) {
      skipped.push({ booking_id: booking.id, reason: 'INVALID_PHONE' });
      continue;
    }
    const list = groups.get(e164) || [];
    list.push(booking);
    groups.set(e164, list);
  }
  return { groups, skipped };
}

/**
 * Decide sync actions. Removals are emitted only when the booking scan is complete.
 * A Google contact that ResortOS did not create becomes a conflict and is never written.
 */
export function planContacts({
  bookings = [],
  mappings = [],
  googleContacts = [],
  today,
  scanComplete = false,
  googleRead = false
} = {}) {
  const { groups, skipped } = byPhone(bookings, today);
  const mapped = new Map(mappings.map((row) => [row.phone_e164, row]));
  const found = new Map(googleContacts.map((row) => [row.phone_e164, row]));
  const actions = [];
  const wanted = new Set();

  for (const [e164, stays] of groups) {
    wanted.add(e164);
    const primary = chooseStay(stays, today);
    const extras = stays.filter((row) => row.id !== primary.id);
    const draft = contactDraft(primary, extras);
    const hash = contentHash(draft, e164);
    const mapping = mapped.get(e164);
    const existing = found.get(e164);
    const managed = Boolean((mapping?.managed && mapping.google_resource_name) || existing?.managed);
    const resourceName = (mapping?.managed && mapping.google_resource_name) || (existing?.managed ? existing.resource_name : '');
    const foreign = Boolean(existing && !existing.managed && existing.resource_name !== mapping?.google_resource_name);
    if (foreign || (mapping?.conflict && !googleRead)) {
      actions.push({
        action: 'conflict',
        phone_e164: e164,
        phone_masked: maskPhone(e164),
        display_name: draft.displayName,
        existing_name: existing?.display_name || mapping?.conflict_name || '',
        booking_id: primary.id,
        content_hash: hash
      });
      continue;
    }
    if (managed && mapping?.content_hash === hash && !mapping.last_error) {
      actions.push({ action: 'unchanged', phone_e164: e164, phone_masked: maskPhone(e164), display_name: draft.displayName, booking_id: primary.id, content_hash: hash, google_resource_name: resourceName });
      continue;
    }
    actions.push({
      action: managed ? 'update' : 'create',
      phone_e164: e164,
      phone_masked: maskPhone(e164),
      display_name: draft.displayName,
      notes: draft.notes,
      booking_id: primary.id,
      content_hash: hash,
      google_resource_name: resourceName
    });
  }

  const removes = [];
  const blockedRemoves = [];
  for (const mapping of mappings) {
    if (!mapping.managed || !mapping.google_resource_name) continue;
    if (wanted.has(mapping.phone_e164)) continue;
    const item = {
      action: 'remove',
      phone_e164: mapping.phone_e164,
      phone_masked: maskPhone(mapping.phone_e164),
      google_resource_name: mapping.google_resource_name,
      booking_id: mapping.booking_id || ''
    };
    if (scanComplete) removes.push(item);
    else blockedRemoves.push(item);
  }

  const counts = {
    create: actions.filter((row) => row.action === 'create').length,
    update: actions.filter((row) => row.action === 'update').length,
    unchanged: actions.filter((row) => row.action === 'unchanged').length,
    conflict: actions.filter((row) => row.action === 'conflict').length,
    remove: removes.length,
    blocked_remove: blockedRemoves.length,
    skip: skipped.length
  };
  return {
    actions: [...actions, ...removes],
    blocked_removes: blockedRemoves,
    skipped,
    counts,
    scan_complete: Boolean(scanComplete),
    google_read: Boolean(googleRead),
    deletions_allowed: Boolean(scanComplete)
  };
}

/** Live Google writes. Creates and updates wait for a successful contact read so a foreign contact is not overwritten. Deletes wait for a full booking scan. */
export function writesFor(plan, { liveEnabled = false, connected = false } = {}) {
  if (!liveEnabled || !connected || !plan) return [];
  return (plan.actions || []).filter((row) => {
    if (row.action === 'remove') return Boolean(plan.scan_complete);
    if (!plan.google_read) return false;
    return row.action === 'create' || row.action === 'update';
  });
}
