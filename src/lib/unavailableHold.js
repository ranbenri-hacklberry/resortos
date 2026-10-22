/** Final letters fold so שיפוצים matches the same block as שיפוץ. */
function foldFinals(value) {
  return String(value || '')
    .replace(/ץ/g, 'צ')
    .replace(/ן/g, 'נ')
    .replace(/ם/g, 'מ')
    .replace(/ף/g, 'פ')
    .replace(/ך/g, 'כ');
}

export function unavailableHoldLabel(text) {
  const folded = foldFinals(text);
  // Staff housing (Ran 2026-10-21): still a block, but shown as מגורי צוות. Checked before לא זמין.
  if (/מגורי\s*צוות/.test(String(text || ''))) return 'מגורי צוות';
  if (folded.includes('שיפוצ')) return String(text || '').includes('שיפוצים') ? 'שיפוצים' : 'שיפוץ';
  if (folded.includes('לא למכיר') || folded.includes('לא להשכר')) return 'לא למכירה';
  if (folded.includes('לא זמינ') || folded.includes('לא פנו')) return 'לא זמין';
  if (folded.includes('לא נקי')) return 'לא נקי';
  if (folded.includes('סגור')) return 'סגור';
  if (folded.includes('לא תקינ') || folded.includes('מקולקל') || folded.includes('בריכה לא עובד') || folded.includes('תקלה בבריכ') || folded.includes('תחזוק')) return 'מקולקל';
  if (folded.includes('תפוס')) return 'תפוס';
  if (folded.includes('חסומ') || folded.includes('בעלימ')) return 'לא זמין';
  return '';
}

export function isUnavailableHoldText(value) {
  return Boolean(unavailableHoldLabel(value));
}

export function isKinorotSourced(booking) {
  const id = String(booking?.id || '');
  const channel = String(booking?.channel_source || '');
  const extra = String(booking?.special_requests || '');
  return id.startsWith('kin_')
    || extra.includes('kinorot:')
    || /kinorot|resview|כינור/i.test(channel);
}

function holdHay(booking) {
  return [booking?.guest_name, booking?.special_requests].filter(Boolean).join(' ');
}

export function isUnavailableHoldBooking(booking) {
  if (!booking || booking.deleted_at || booking.booking_status === 'CANCELED') return false;
  return Boolean(unavailableHoldLabel(holdHay(booking)));
}

function overlapsRange(booking, rangeStart, rangeEnd) {
  const cin = String(booking?.check_in_date || '');
  const cout = String(booking?.check_out_date || '');
  if (!cin || !cout || !rangeStart || !rangeEnd) return false;
  return cin < rangeEnd && cout > rangeStart;
}

/** Drop closed/renovation-only cabins from the board so real stays pack tighter. */
export function hideClosedOrRenovationUnit(unit, bookings, { today, rangeStart, rangeEnd } = {}) {
  const mine = (bookings || []).filter((booking) => (
    booking?.unit_id === unit?.id
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
  ));
  const inRange = mine.filter((booking) => overlapsRange(booking, rangeStart, rangeEnd));
  if (inRange.some((booking) => !isUnavailableHoldBooking(booking))) return false;
  if (coveringUnavailableHold(bookings, unit?.id, today || '')) return true;
  return inRange.some(isUnavailableHoldBooking);
}

export function isUnavailableHoldCollectionRow(row) {
  return Boolean(unavailableHoldLabel(`${row?.guestName || ''} ${row?.notes || ''}`));
}

const NURIT_UNITS = new Set(['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679']);

function realStayCovers(bookings, unitId, today) {
  return (bookings || []).some((booking) => (
    booking?.unit_id === unitId
    && !booking.deleted_at
    && booking.booking_status !== 'CANCELED'
    && !isUnavailableHoldBooking(booking)
    && booking.check_in_date
    && booking.check_out_date
    && booking.check_in_date <= today
    && today < booking.check_out_date
  ));
}

function complexClosureHold(bookings, unitId, today) {
  if (!NURIT_UNITS.has(unitId) || realStayCovers(bookings, unitId, today)) return null;
  return (bookings || []).find((booking) => (
    booking?.unit_id !== unitId
    && NURIT_UNITS.has(booking.unit_id)
    && isUnavailableHoldBooking(booking)
    && foldFinals(holdHay(booking)).includes('מתחמ סגור')
    && booking.check_in_date
    && booking.check_out_date
    && booking.check_in_date <= today
    && today < booking.check_out_date
  )) || null;
}

export function coveringUnavailableHold(bookings, unitId, today) {
  const direct = (bookings || []).find((booking) => (
    booking.unit_id === unitId
    && isUnavailableHoldBooking(booking)
    && booking.check_in_date
    && booking.check_out_date
    && booking.check_in_date <= today
    && today < booking.check_out_date
  )) || null;
  return direct || complexClosureHold(bookings, unitId, today);
}
