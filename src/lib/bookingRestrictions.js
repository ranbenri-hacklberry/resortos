import { supabase } from './supabaseClient';
import { propertyIdForUnit } from './guestProfileSeed';

function inRange(date, start, end) {
  return Boolean(date && start && end && date >= start && date <= end);
}

function stayOverlapsRestriction(checkIn, checkOut, start, end) {
  return Boolean(checkIn && checkOut && start && end && start < checkOut && end >= checkIn);
}

export function stayNights(checkIn, checkOut) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function propertyIdFromUnit(unit) {
  if (!unit) return null;
  if (typeof unit === 'string') return propertyIdForUnit(unit);
  return unit.property_id || propertyIdForUnit(unit.id);
}

export function matchingRestrictions(restrictions, { propertyId, checkIn, checkOut }) {
  return (restrictions || []).filter((row) => {
    if (row?.is_active === false) return false;
    if (row.property_id && propertyId && row.property_id !== propertyId) return false;
    if (row.property_id && !propertyId) return false;
    return stayOverlapsRestriction(checkIn, checkOut, row.start_date, row.end_date);
  });
}

function heDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!d) return iso || '';
  return `${d}/${m}/${y}`;
}

export function evaluateStayRestrictions({ restrictions, propertyId, checkIn, checkOut }) {
  const nights = stayNights(checkIn, checkOut);
  const hits = matchingRestrictions(restrictions, { propertyId, checkIn, checkOut });
  const minRule = hits.reduce((best, row) => (
    !best || Number(row.min_nights) > Number(best.min_nights) ? row : best
  ), null);
  const minNights = Math.max(1, Number(minRule?.min_nights) || 1);
  const cta = hits.filter((row) => row.closed_to_arrival && inRange(checkIn, row.start_date, row.end_date));
  const ctd = hits.filter((row) => row.closed_to_departure && inRange(checkOut, row.start_date, row.end_date));
  const multiplier = hits.reduce((max, row) => Math.max(max, Number(row.price_multiplier) || 1), 1);
  const ok = nights >= minNights && cta.length === 0 && ctd.length === 0 && nights > 0;
  return {
    ok,
    nights,
    minNights,
    minRule,
    cta,
    ctd,
    multiplier,
    hits,
    checkIn,
    checkOut
  };
}

export function requiredMinNights(restrictions, propertyId, checkIn) {
  let nights = 1;
  for (let i = 0; i < 8; i += 1) {
    const checkOut = addDaysIso(checkIn, nights);
    const result = evaluateStayRestrictions({ restrictions, propertyId, checkIn, checkOut });
    if (result.cta.length) return result.minNights;
    if (result.nights >= result.minNights) return Math.max(1, result.minNights);
    nights = Math.max(result.minNights, nights + 1);
  }
  return nights;
}

export function restrictionAlert(result) {
  if (!result) return null;
  if (result.nights <= 0) return 'תאריך יציאה חייב להיות אחרי תאריך כניסה.';
  if (result.cta.length) {
    return `אין צ׳ק-אין ב־${heDate(result.checkIn)} (${result.cta[0].name}).`;
  }
  if (result.ctd.length) {
    return `אין צ׳ק-אאוט ב־${heDate(result.checkOut)} (${result.ctd[0].name}).`;
  }
  if (result.nights < result.minNights) {
    const label = result.minRule?.name ? ` (${result.minRule.name})` : '';
    return `מינימום ${result.minNights} לילות לתקופה הזו${label}.`;
  }
  return null;
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    min_nights: Number(row.min_nights) || 1,
    price_multiplier: Number(row.price_multiplier) || 1,
    closed_to_arrival: Boolean(row.closed_to_arrival),
    closed_to_departure: Boolean(row.closed_to_departure),
    is_active: row.is_active !== false,
    property_id: row.property_id || ''
  };
}

export async function listBookingRestrictions(tenantId) {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from('resort_booking_restrictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });
  if (error) {
    console.warn('[BOOKING RESTRICTIONS]', error.message);
    return [];
  }
  return (data || []).map(mapRow);
}

export async function saveBookingRestriction(tenantId, rule) {
  const row = {
    tenant_id: tenantId,
    property_id: rule.property_id || null,
    name: String(rule.name || '').trim(),
    start_date: rule.start_date,
    end_date: rule.end_date,
    min_nights: Math.max(1, Number(rule.min_nights) || 1),
    closed_to_arrival: Boolean(rule.closed_to_arrival),
    closed_to_departure: Boolean(rule.closed_to_departure),
    price_multiplier: Math.max(0.01, Number(rule.price_multiplier) || 1),
    is_active: rule.is_active !== false,
    updated_at: new Date().toISOString()
  };
  if (!row.name) throw new Error('MISSING_NAME');
  if (!row.start_date || !row.end_date || row.end_date < row.start_date) throw new Error('BAD_DATES');
  const query = rule.id
    ? supabase.from('resort_booking_restrictions').update(row).eq('id', rule.id)
    : supabase.from('resort_booking_restrictions').insert(row);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  return mapRow(data);
}

export function subscribeBookingRestrictions(tenantId, onChange) {
  if (!tenantId || typeof onChange !== 'function') return () => {};
  const channel = supabase
    .channel(`resort_booking_restrictions:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'resort_booking_restrictions',
        filter: `tenant_id=eq.${tenantId}`
      },
      () => { onChange(); }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function deleteBookingRestriction(id) {
  if (!id) return;
  const { error } = await supabase.from('resort_booking_restrictions').delete().eq('id', id);
  if (error) throw error;
}
