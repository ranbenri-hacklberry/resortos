import { phoneSearchTail } from './guestPhone.js';

export const GUEST_CTX_PREFIX = 'guestctx:';
export const GUEST_CTX_ALL_KEY = `${GUEST_CTX_PREFIX}all`;

export function guestCtxKey(tail) {
  return `${GUEST_CTX_PREFIX}${String(tail || '')}`;
}

export function stayPayRank(row) {
  const status = String(row?.payment_status || '').toUpperCase();
  const stay = row?.stay && typeof row.stay === 'object' ? row.stay : {};
  const clearing = Array.isArray(row?.clearing_payments)
    ? row.clearing_payments.reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0)
    : 0;
  if (stay.hyp?.paid || status === 'PAID' && clearing > 0) return 40;
  if (clearing > 0 || status === 'DEPOSIT_PAID' || status === 'PARTIAL') return 30;
  if (status === 'PENDING_CASH' || stay.cash_expected) return 20;
  return 10;
}

export function mergeDeskAwareStays(incoming, previous) {
  const prevById = new Map((previous || []).filter((row) => row?.id).map((row) => [row.id, row]));
  return (incoming || []).map((row) => {
    const prev = prevById.get(row.id);
    if (!prev || stayPayRank(row) >= stayPayRank(prev)) return row;
    return {
      ...row,
      checkout_token: row.checkout_token || prev.checkout_token,
      payment_status: prev.payment_status,
      payment_mode: prev.payment_mode || row.payment_mode,
      clearing_payments: prev.clearing_payments || row.clearing_payments,
      stay: { ...(row.stay || {}), ...(prev.stay || {}) },
      updated_at: prev.updated_at || row.updated_at
    };
  });
}

export function compactStayRow(row) {
  const stay = row?.stay && typeof row.stay === 'object' ? row.stay : {};
  const clearing = Array.isArray(row?.clearing_payments) ? row.clearing_payments : [];
  return {
    id: row.id || null,
    unit_id: row.unit_id,
    guest_name: row.guest_name || '',
    guest_phone: row.guest_phone || '',
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    booking_status: row.booking_status,
    payment_status: row.payment_status || 'UNPAID',
    payment_mode: row.payment_mode || '',
    checkout_token: row.checkout_token || '',
    total_price_agorot: Number(row.total_price_agorot) || 0,
    deposit_agorot: Number(row.deposit_agorot) || 0,
    adults_count: Number(row.adults_count) || 0,
    children_count: Number(row.children_count) || 0,
    special_requests: row.special_requests || '',
    updated_at: row.updated_at || '',
    clearing_payments: clearing.map((item) => ({
      source: item?.source || '',
      amount_agorot: Number(item?.amount_agorot) || 0,
      date: item?.date || '',
      at: item?.at || item?.date || ''
    })),
    stay: {
      hyp: stay.hyp?.paid ? { paid: true } : undefined,
      hyp_deposit: stay.hyp_deposit?.paid ? { paid: true } : undefined,
      cash_expected: Boolean(stay.cash_expected),
      cash_collected_at: stay.cash_collected_at || null
    }
  };
}

export function blockedRangeFromRow(row) {
  const status = String(row?.booking_status || '').toUpperCase();
  if (status === 'CANCELED' || status === 'CANCELLED' || status === 'CHECKED_OUT') return null;
  if (!row?.unit_id || !row?.check_in_date || !row?.check_out_date) return null;
  return {
    unitId: row.unit_id,
    checkIn: row.check_in_date,
    checkOut: row.check_out_date,
    status: row.booking_status
  };
}

export function blockedRangesFromRows(rows) {
  const seen = new Set();
  const list = [];
  for (const row of rows || []) {
    const range = blockedRangeFromRow(row);
    if (!range) continue;
    const key = `${range.unitId}|${range.checkIn}|${range.checkOut}|${range.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(range);
  }
  return list;
}

export function guestFacingStayRow(row) {
  const packed = compactStayRow(row);
  return {
    id: packed.id,
    unit_id: packed.unit_id,
    guest_name: packed.guest_name,
    guest_phone: packed.guest_phone,
    check_in_date: packed.check_in_date,
    check_out_date: packed.check_out_date,
    booking_status: packed.booking_status,
    adults_count: packed.adults_count,
    children_count: packed.children_count,
    special_requests: packed.special_requests
  };
}

export function groupRowsByPhoneTail(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const tail = phoneSearchTail(row.guest_phone);
    if (!tail) continue;
    const list = groups.get(tail) || [];
    list.push(guestFacingStayRow(row));
    groups.set(tail, list);
  }
  return groups;
}
