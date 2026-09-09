import { db } from './resortos-db';
import { supabase } from './supabaseClient';
import { findOverlappingBooking, isActiveBooking } from './bookingOverlap';
import { stayExpiresAt, stayLinkExpired } from './stayAccess';
import { israelToday } from './cabinAccess';
import { publishGuestMailbox } from './guestCheckoutApi';
import { guestStayOrigin } from './guestStayUrl';
import { bookingStatusRank, hasRecordedReceipt, paymentStatusRank } from './bookingPaid';
import { buildStaySnapshot } from './staySnapshot';
import { canonicalUnitSeed, DEFAULT_RESORT_UNITS, FORCE_DOCUMENT_NAMES, isPhantomUnitId, isRetiredUnitId, matchCanonicalUnitId } from './units';
import { syncResortOperationHistory } from './resortOperations';
import { ensureGuestProfiles } from './guestProfileSeed';
import { clearingPaidAgorot, clearingProofCount, isCanceledBooking, shouldApplyIncomingBooking as shouldApplyIncomingBookingBase } from './bookingMerge';

const BOOKING_PAGE_SIZE = 1000;
const BOOKING_SNAP_PREFIX = 'resortos_bookings_snap_v1:';

function bookingSnapKey(tenantId) {
  return `${BOOKING_SNAP_PREFIX}${tenantId}`;
}

function compactBookingSnap(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    unit_id: row.unit_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone || '',
    check_in_date: row.check_in_date,
    check_out_date: row.check_out_date,
    adults_count: row.adults_count,
    children_count: row.children_count,
    booking_status: row.booking_status,
    payment_status: row.payment_status,
    payment_mode: row.payment_mode,
    total_price_agorot: row.total_price_agorot,
    deposit_agorot: row.deposit_agorot,
    checkout_token: row.checkout_token,
    channel_source: row.channel_source,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at || null
  };
}

function saveBookingSnapshot(tenantId, rows) {
  if (typeof localStorage === 'undefined' || !tenantId) return;
  const live = (rows || []).filter((row) => row && !row.deleted_at && row.booking_status !== 'CANCELED');
  if (live.length < 8) return;
  try {
    const prev = JSON.parse(localStorage.getItem(bookingSnapKey(tenantId)) || '{}');
    if (Array.isArray(prev.rows) && prev.rows.length > live.length) return;
    localStorage.setItem(bookingSnapKey(tenantId), JSON.stringify({
      at: new Date().toISOString(),
      rows: live.map(compactBookingSnap)
    }));
  } catch (_) {}
}

async function restoreBookingSnapshot(tenantId) {
  if (typeof localStorage === 'undefined' || !tenantId) return 0;
  let packed;
  try {
    packed = JSON.parse(localStorage.getItem(bookingSnapKey(tenantId)) || '');
  } catch {
    return 0;
  }
  const rows = Array.isArray(packed?.rows) ? packed.rows : [];
  if (!rows.length) return 0;
  await applyIncomingBookings(rows);
  return rows.length;
}

async function fetchAllTenantBookings(tenantId, columns = '*') {
  if (!tenantId || !supabase) return [];
  const all = [];
  for (let from = 0; ; from += BOOKING_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('hotelos_bookings')
      .select(columns)
      .eq('tenant_id', tenantId)
      .range(from, from + BOOKING_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < BOOKING_PAGE_SIZE) break;
  }
  return all;
}

/** Only stays that overlap [fromYmd, toYmd) — enough to paint the occupancy board. */
async function fetchBookingsOverlapping(tenantId, fromYmd, toYmd) {
  if (!tenantId || !supabase || !fromYmd || !toYmd) return [];
  const all = [];
  for (let from = 0; ; from += BOOKING_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('hotelos_bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .lt('check_in_date', toYmd)
      .gte('check_out_date', fromYmd)
      .range(from, from + BOOKING_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < BOOKING_PAGE_SIZE) break;
  }
  return all;
}

async function applyIncomingBookings(rows) {
  const incoming = [];
  const toDelete = [];
  for (const bookingData of rows || []) {
    if (!bookingData?.id) continue;
    if (isRetiredUnitId(bookingData.unit_id) || isPhantomUnitId(bookingData.unit_id)) {
      toDelete.push(bookingData.id);
      continue;
    }
    incoming.push(bookingData);
  }
  if (!incoming.length && !toDelete.length) return;
  await db.transaction('rw', db.bookings, async () => {
    if (toDelete.length) await db.bookings.bulkDelete(toDelete);
    const existingRows = await db.bookings.bulkGet(incoming.map((row) => row.id));
    const puts = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const bookingData = incoming[i];
      const existing = existingRows[i];
      if (!existing || shouldApplyIncomingBooking(existing, bookingData)) {
        puts.push(mergeBookingRow(existing, bookingData));
        continue;
      }
      let next = existing;
      if (filledPhone(bookingData.guest_phone) && !filledPhone(existing.guest_phone)) {
        next = { ...next, guest_phone: bookingData.guest_phone };
      }
      next = fillMissingMoney(next, bookingData);
      if (
        clearingProofCount(bookingData) > clearingProofCount(existing)
        || clearingPaidAgorot(bookingData) > clearingPaidAgorot(existing)
      ) {
        next = mergeBookingRow(next, bookingData);
      }
      if (next !== existing) puts.push(next);
    }
    if (puts.length) await db.bookings.bulkPut(puts);
  });
}

const BOOKING_KEYS = [
  'id',
  'tenant_id',
  'unit_id',
  'guest_name',
  'guest_email',
  'guest_phone',
  'check_in_date',
  'check_out_date',
  'adults_count',
  'children_count',
  'total_price_agorot',
  'deposit_agorot',
  'booking_status',
  'payment_status',
  'payment_mode',
  'clearing_payments',
  'balance_payment_preference',
  'balance_paid',
  'balance_paid_at',
  'balance_payment_method',
  'bank_transfer_receipt_url',
  'cash_collected_by',
  'channel_source',
  'agent_id',
  'locked_until',
  'hyp_deal_id',
  'checkout_token',
  'special_requests',
  'expires_at',
  'cancellation_reason',
  'created_at',
  'updated_at',
  'deleted_at',
  'version'
];

function isRealBooking(booking) {
  return Boolean(
    booking &&
    booking.id &&
    booking.tenant_id &&
    booking.unit_id &&
    booking.check_in_date
  );
}

function shouldApplyIncomingBooking(existing, incoming) {
  return shouldApplyIncomingBookingBase(existing, incoming, israelToday(), {
    paymentStatusRank,
    bookingStatusRank
  });
}

function filledPhone(value) {
  const phone = String(value || '').trim();
  return phone || '';
}

function keepGuestPhone(preferred, fallback) {
  return filledPhone(preferred) || filledPhone(fallback) || preferred || fallback || '';
}

function fillMissingMoney(existing, incoming) {
  if (!existing || !incoming) return existing;
  const localPrice = Number(existing.total_price_agorot) || 0;
  const incomingPrice = Number(incoming.total_price_agorot) || 0;
  if (localPrice > 0 || incomingPrice <= 0) return existing;
  const localStatus = existing.payment_status || 'UNPAID';
  return {
    ...existing,
    total_price_agorot: incomingPrice,
    deposit_agorot: Number(incoming.deposit_agorot) > 0
      ? incoming.deposit_agorot
      : existing.deposit_agorot,
    payment_status: localStatus === 'UNPAID' || !localStatus
      ? (incoming.payment_status || localStatus)
      : localStatus
  };
}

function mergeBookingRow(base, incoming) {
  const merged = { ...(base || {}), ...(incoming || {}) };
  merged.guest_phone = keepGuestPhone(incoming?.guest_phone, base?.guest_phone);
  const baseStay = base?.stay && typeof base.stay === 'object' ? base.stay : {};
  const incomingStay = incoming?.stay && typeof incoming.stay === 'object' ? incoming.stay : {};
  merged.stay = { ...baseStay, ...incomingStay };
  if (baseStay.hyp_deposit?.paid && !incomingStay.hyp_deposit?.paid) merged.stay.hyp_deposit = baseStay.hyp_deposit;
  if (incomingStay.hyp_deposit?.paid) merged.stay.hyp_deposit = incomingStay.hyp_deposit;
  if (baseStay.hyp?.paid && !incomingStay.hyp?.paid) merged.stay.hyp = baseStay.hyp;
  if (incomingStay.hyp?.paid) merged.stay.hyp = incomingStay.hyp;
  if (Array.isArray(incoming?.clearing_payments) && incoming.clearing_payments.length) {
    merged.clearing_payments = incoming.clearing_payments;
  } else   if (Array.isArray(base?.clearing_payments) && base.clearing_payments.length) {
    merged.clearing_payments = base.clearing_payments;
  }
  if (isCanceledBooking(incoming)) {
    merged.booking_status = 'CANCELED';
    merged.deleted_at = incoming.deleted_at || merged.deleted_at || new Date().toISOString();
    return merged;
  }
  if (incomingStay.payment_proof) merged.stay.payment_proof = incomingStay.payment_proof;
  if (incomingStay.payment_proof_at) merged.stay.payment_proof_at = incomingStay.payment_proof_at;
  const incomingBankReview = incoming?.payment_status === 'PENDING_BANK'
    || Boolean(incomingStay.payment_proof);
  if (incomingBankReview && paymentStatusRank(base?.payment_status) < 40) {
    merged.payment_status = 'PENDING_BANK';
    merged.payment_mode = incoming?.payment_mode || base?.payment_mode || 'BANK_TRANSFER';
  } else if (paymentStatusRank(base?.payment_status) > paymentStatusRank(incoming?.payment_status)) {
    const incomingNewer = Date.parse(incoming?.updated_at || '') > Date.parse(base?.updated_at || '');
    if (!incomingNewer || hasRecordedReceipt(base)) {
      merged.payment_status = base.payment_status;
    }
  }
  if (bookingStatusRank(base?.booking_status) > bookingStatusRank(incoming?.booking_status)) {
    const incomingNewer = Date.parse(incoming?.updated_at || '') > Date.parse(base?.updated_at || '');
    if (!incomingNewer) {
      merged.booking_status = base.booking_status;
    }
  }
  if (
    merged.stay?.hyp_deposit?.paid
    && paymentStatusRank(merged.payment_status) < 30
    && merged.payment_status !== 'PENDING_BANK'
  ) {
    merged.payment_status = 'DEPOSIT_PAID';
  }
  if (merged.stay?.hyp?.paid && paymentStatusRank(merged.payment_status) < 40) {
    merged.payment_status = 'PAID';
  }
  if (paymentStatusRank(merged.payment_status) >= 30 && merged.booking_status === 'PENDING') {
    merged.booking_status = 'CONFIRMED';
  }
  if (!(Number(base?.total_price_agorot) > 0) && Number(incoming?.total_price_agorot) > 0) {
    merged.total_price_agorot = incoming.total_price_agorot;
    if (Number(incoming.deposit_agorot) > 0) merged.deposit_agorot = incoming.deposit_agorot;
  }
  return merged;
}

export async function refreshBookingFromGuestMailbox(booking) {
  const token = booking?.checkout_token;
  if (!booking?.id || !token || booking.booking_status === 'CANCELED') return booking;
  try {
    const response = await fetch(`${guestStayOrigin()}/api/checkout/${encodeURIComponent(token)}`);
    if (!response.ok) return booking;
    const remote = await response.json();
    if (!remote) return booking;
    const next = mergeBookingRow(booking, remote);
    const gotBankProof = Boolean(
      remote?.stay?.payment_proof
      && remote.stay.payment_proof !== booking?.stay?.payment_proof
    );
    const becameBankPending = remote?.payment_status === 'PENDING_BANK'
      && booking?.payment_status !== 'PENDING_BANK';
    if (
      !gotBankProof
      && !becameBankPending
      && paymentStatusRank(next.payment_status) <= paymentStatusRank(booking.payment_status)
      && bookingStatusRank(next.booking_status) <= bookingStatusRank(booking.booking_status)
      && !remote.stay?.hyp_deposit?.paid
    ) {
      return booking;
    }
    next.id = booking.id;
    next.updated_at = new Date().toISOString();
    await db.bookings.put(next);
    await pushBookingToCloud(next, { allowOverlap: true });
    return next;
  } catch (_) {
    return booking;
  }
}

function toBookingRow(booking) {
  const row = {};
  for (const key of BOOKING_KEYS) {
    if (booking[key] !== undefined) row[key] = booking[key];
  }
  return row;
}

/**
 * Upserts a booking to local Dexie and the private Supabase instance (LAN / Tailscale).
 * Non-booking payloads are ignored so operations events cannot leak or pollute the ledger.
 */
async function publishBookingStay(booking, unitOverride) {
  if (!booking?.checkout_token || booking.booking_status === 'CANCELED') return;
  const unit = unitOverride || await db.units.get(booking.unit_id);
  const all = await db.bookings.toArray();
  const propertyId = unit?.property_id;
  const property = propertyId ? await db.properties.get(propertyId) : null;
  await publishGuestMailbox({
    ...booking,
    expires_at: stayExpiresAt(booking),
    stay: buildStaySnapshot(booking, unit, all, property)
  });
}

async function relatedStayBookings(unit) {
  if (!unit?.id) return [];
  const local = await db.bookings.toArray();
  let cloud = [];
  try {
    const query = supabase
      .from('hotelos_bookings')
      .select('*')
      .eq('unit_id', unit.id)
      .is('deleted_at', null);
    const scoped = unit.tenant_id ? query.eq('tenant_id', unit.tenant_id) : query;
    const { data } = await scoped.limit(200);
    cloud = data || [];
  } catch (_) {}
  const map = new Map();
  for (const row of [...cloud, ...local]) {
    if (row?.id) map.set(row.id, { ...map.get(row.id), ...row });
  }
  return [...map.values()].filter(
    (booking) =>
      booking.unit_id === unit.id &&
      booking.checkout_token &&
      booking.booking_status !== 'CANCELED' &&
      !stayLinkExpired(booking)
  );
}

export async function pushBookingToCloud(booking, options = {}) {
  if (!isRealBooking(booking)) return;
  if (isRetiredUnitId(booking.unit_id) || isPhantomUnitId(booking.unit_id)) {
    try {
      await db.bookings.delete(booking.id);
      await supabase.from('hotelos_bookings').delete().eq('id', booking.id);
    } catch (_) {}
    return;
  }
  try {
    if (!options.allowOverlap && isActiveBooking(booking) && booking.check_out_date) {
      const local = await db.bookings.toArray();
      const localConflict = findOverlappingBooking(
        local,
        booking.unit_id,
        booking.check_in_date,
        booking.check_out_date,
        booking.id
      );
      if (localConflict) {
        console.warn('[HOTELOS SYNC PUSH] overlap blocked', localConflict.id);
        return;
      }
      const { data } = await supabase
        .from('hotelos_bookings')
        .select('id, unit_id, check_in_date, check_out_date, booking_status, deleted_at')
        .eq('unit_id', booking.unit_id)
        .is('deleted_at', null)
        .neq('id', booking.id);
      const cloudConflict = findOverlappingBooking(
        data || [],
        booking.unit_id,
        booking.check_in_date,
        booking.check_out_date,
        booking.id
      );
      if (cloudConflict) {
        console.warn('[HOTELOS SYNC PUSH] overlap blocked', cloudConflict.id);
        return;
      }
    }
    await db.bookings.put(booking);
    const { data: cloudRow } = await supabase
      .from('hotelos_bookings')
      .select('*')
      .eq('id', booking.id)
      .maybeSingle();
    if (cloudRow && !shouldApplyIncomingBooking(cloudRow, booking)) {
      await db.bookings.put(mergeBookingRow(booking, cloudRow));
      return;
    }
    if (cloudRow?.booking_status === 'CONFIRMED' && booking.booking_status === 'PENDING') {
      await db.bookings.put({
        ...booking,
        guest_name: cloudRow.guest_name || booking.guest_name,
        guest_email: cloudRow.guest_email || booking.guest_email,
        guest_phone: keepGuestPhone(cloudRow.guest_phone, booking.guest_phone),
        special_requests: cloudRow.special_requests || booking.special_requests,
        booking_status: 'CONFIRMED',
        updated_at: cloudRow.updated_at || booking.updated_at
      });
      return;
    }
    const row = toBookingRow(booking);
    row.guest_phone = keepGuestPhone(row.guest_phone, cloudRow?.guest_phone);
    const { error } = await supabase.from('hotelos_bookings').upsert(row);
    if (error) {
      console.warn('[HOTELOS SYNC PUSH]', error.message);
    } else {
      fetch('/api/guest-context-push', { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.warn('[HOTELOS SYNC PUSH]', err);
  }
}

export async function pushBookingsToCloud(bookings, options = {}) {
  const list = (bookings || []).filter((booking) => isRealBooking(booking));
  if (!list.length) return;
  const live = list.filter((booking) => !isRetiredUnitId(booking.unit_id) && !isPhantomUnitId(booking.unit_id));
  if (!live.length) return;
  try {
    await db.bookings.bulkPut(live);
    const rows = live.map((booking) => {
      const row = toBookingRow(booking);
      row.guest_phone = filledPhone(row.guest_phone);
      return row;
    });
    const { error } = await supabase.from('hotelos_bookings').upsert(rows);
    if (error) console.warn('[HOTELOS SYNC PUSH BULK]', error.message);
    else fetch('/api/guest-context-push', { method: 'POST' }).catch(() => {});
  } catch (err) {
    if (options.fallback !== false) {
      for (const booking of live) {
        await pushBookingToCloud(booking, { allowOverlap: true });
      }
    } else {
      console.warn('[HOTELOS SYNC PUSH BULK]', err);
    }
  }
}

const CANONICAL_NAME_BY_ID = Object.fromEntries(DEFAULT_RESORT_UNITS.map((unit) => [unit.id, unit.name]));

const FALLBACK_UNIT_NAMES = {
  'hill-1': 'צימר בגבעה 1',
  'hill-2': 'צימר בגבעה 2',
  'hill-3': 'צימר בגבעה 3',
  'hill-4': 'צימר בגבעה 4',
  'dome-blue': 'כיפת שמיים כחול',
  'dome-red': 'כיפת שמיים אדום',
  'dome-green': 'כיפת שמיים ירוק',
  'mialis-villa': 'וילה מיאליס ריזורט',
  'suite-1': 'סוויטה 1 (הירוקה)',
  'lab-kinneret': 'בקתת כנרת',
  'suite-2': 'סוויטה 2 (הורודה)',
  'k671': 'בתי נורית 1',
  'k673': 'בתי נורית 2',
  'k674': 'בתי נורית 3',
  'k675': 'בתי נורית 4',
  'k676': 'בתי נורית 5',
  'k677': 'בתי נורית 6',
  'k678': 'בתי נורית 7',
  'k679': 'בתי נורית 8',
  'k808': "טאג' מאהל · בקתה 1",
  'k809': "טאג' מאהל · בקתה 2",
  'k810': "טאג' מאהל · בקתה 3",
  'k811': "טאג' מאהל · בקתה 4",
  'k680': 'מול הנוף · בקתה 1',
  'k681': 'מול הנוף · בקתה 2',
  'k682': 'מול הנוף · בקתה 3',
  'k683': 'מול הנוף · בקתה 4',
  'k684': 'מול הנוף · בקתה 5',
  'k685': 'נופים בלבן · בקתה 1',
  'k686': 'נופים בלבן · בקתה 2',
  'k687': 'טוסקנה · פירנצה 1',
  'k688': 'טוסקנה · פירנצה 2',
  'k689': 'טוסקנה · שאטו',
  'k690': 'חצר מוסיקלית · חליל',
  'k691': 'חצר מוסיקלית · מיתר',
  'k692': 'חצר מוסיקלית · פעמון',
  'k693': 'בקתות מאיה · בקתה 1',
  'k694': 'בקתות מאיה · בקתה 2',
  'k695': 'בקתות מאיה · בקתה 3',
  'k618': 'סייסטה · משפחתית 1',
  'k619': 'סייסטה · משפחתית 2',
  'k620': 'סייסטה · רומנטית 3',
  'k621': 'סייסטה · רומנטית 4',
  'k622': 'סייסטה · בת הים 5',
  'k623': 'סייסטה · בת הים 6',
  'k826': 'קאסה נובה · Aura',
  'k827': 'קאסה נובה · Bloom'
};

async function ensureUnitRow(booking) {
  if (!booking?.unit_id || !booking?.tenant_id) return;
  if (isPhantomUnitId(booking.unit_id) || isRetiredUnitId(booking.unit_id)) return;
  const existing = await db.units.get(booking.unit_id);
  if (existing) return;
  const now = new Date().toISOString();
  await db.units.put({
    id: booking.unit_id,
    tenant_id: booking.tenant_id,
    name: FALLBACK_UNIT_NAMES[booking.unit_id] || booking.unit_id,
    unit_type: 'cabin',
    max_occupancy: 4,
    base_price_agorot: 85000,
    cleaning_fee_agorot: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
    version: 1
  });
}

export async function syncResortUnitsToDexie(tenantId) {
  if (!tenantId) return [];
  try {
    let { data, error } = await supabase
      .from('resort_units')
      .select('id, tenant_id, name, sort_order, unit_type, max_occupancy, base_price_agorot, is_active, updated_at, property_id, content, access')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });
    if (error) {
      const fallback = await supabase
        .from('resort_units')
        .select('id, tenant_id, name, sort_order, unit_type, max_occupancy, base_price_agorot, is_active, updated_at')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      console.warn('[RESORT UNITS PULL]', error.message);
      return [];
    }
    const now = new Date().toISOString();
    const remoteIds = new Set();
    const puts = [];
    for (const row of data || []) {
      if (isPhantomUnitId(row.id)) continue;
      remoteIds.add(row.id);
    }
    await db.transaction('rw', db.units, async () => {
      const existingRows = await db.units.bulkGet([...remoteIds]);
      const existingById = new Map(existingRows.filter(Boolean).map((unit) => [unit.id, unit]));
      for (const row of data || []) {
        if (isPhantomUnitId(row.id)) continue;
        const existing = existingById.get(row.id);
        puts.push({
          unit_type: row.unit_type || existing?.unit_type || 'cabin',
          max_occupancy: row.max_occupancy || existing?.max_occupancy || 4,
          base_price_agorot: row.base_price_agorot || existing?.base_price_agorot || 0,
          cleaning_fee_agorot: existing?.cleaning_fee_agorot || 0,
          version: existing?.version || 1,
          ...existing,
          id: row.id,
          tenant_id: row.tenant_id || tenantId,
          name: row.name || existing?.name,
          sort_order: row.sort_order,
          is_active: row.is_active !== false,
          deleted_at: row.is_active === false ? (existing?.deleted_at || now) : null,
          property_id: row.property_id || existing?.property_id,
          content: row.content || existing?.content || {},
          access: row.access || existing?.access || {},
          operational_status: existing?.id === row.id ? existing?.operational_status : undefined,
          updated_at: existing?.updated_at || row.updated_at || now
        });
      }
      if (puts.length) await db.units.bulkPut(puts);
      if (remoteIds.size) {
        const local = await db.units.toArray();
        const stale = [];
        for (const unit of local) {
          const sameTenant = !unit.tenant_id || unit.tenant_id === tenantId;
          if (!sameTenant) continue;
          if (isPhantomUnitId(unit.id) || remoteIds.has(unit.id)) continue;
          stale.push(unit.id);
        }
        if (stale.length) await db.units.bulkDelete(stale);
      }
    });
    return data || [];
  } catch (err) {
    console.warn('[RESORT UNITS PULL]', err?.message || err);
    return [];
  }
}

async function seedResortUnitsIfEmpty(tenantId) {
  const now = new Date().toISOString();
  const rows = canonicalUnitSeed(tenantId, now).map((unit, index) => ({
    tenant_id: tenantId,
    id: unit.id,
    name: unit.name,
    sort_order: unit.sort_order || index + 1,
    unit_type: unit.unit_type || 'cabin',
    max_occupancy: unit.max_occupancy || 4,
    base_price_agorot: unit.base_price_agorot || 0,
    is_active: true,
    updated_at: now
  }));
  const { error } = await supabase.from('resort_units').upsert(rows);
  if (error) console.warn('[RESORT UNITS SEED]', error.message);
}

export async function ensureCanonicalUnits(tenantId, options = {}) {
  if (!tenantId) return;
  if (!options.skipPurge) await purgeRetiredDemoData(tenantId);
  let remote = await syncResortUnitsToDexie(tenantId);
  if (!remote.length) {
    await seedResortUnitsIfEmpty(tenantId);
    remote = await syncResortUnitsToDexie(tenantId);
  }
  if (options.pullOnly) return remote;
  await ensureGuestProfiles(tenantId).catch((err) => {
    console.warn('[GUEST PROFILES]', err?.message || err);
  });
  const now = new Date().toISOString();
  for (const unit of remote) {
    if (isPhantomUnitId(unit.id)) continue;
    const existing = await db.units.get(unit.id);
    const canonicalName = CANONICAL_NAME_BY_ID[unit.id];
    const nextName = (FORCE_DOCUMENT_NAMES.has(unit.id) && canonicalName)
      ? canonicalName
      : (existing?.name || unit.name || canonicalName);
    if (existing && nextName && existing.name !== nextName) {
      await db.units.put({ ...existing, name: nextName, updated_at: now });
    }
    await pushUnitToCloud({
      id: unit.id,
      tenant_id: tenantId,
      name: nextName,
      operational_status: existing?.operational_status,
      operational_domain: existing?.operational_domain,
      custom_reason: existing?.custom_reason,
      assigned_staff: existing?.assigned_staff,
      is_escalated: existing?.is_escalated,
      cleaning_started_at: existing?.cleaning_started_at,
      quality_inspections: existing?.quality_inspections,
      rework_count: existing?.rework_count,
      last_failed_fields: existing?.last_failed_fields,
      image_urls: existing?.image_urls,
      name_i18n: existing?.name_i18n,
      reason_i18n: existing?.reason_i18n,
      text_source_lang: existing?.text_source_lang,
      sop_progress: existing?.sop_progress,
      current_operation_id: existing?.current_operation_id,
      updated_at: existing?.updated_at || now
    });
  }
}

async function purgeRetiredDemoData(tenantId) {
  const units = await db.units.toArray();
  for (const unit of units) {
    if (!isRetiredUnitId(unit.id)) continue;
    await db.units.delete(unit.id);
  }
  const bookings = await db.bookings.toArray();
  for (const booking of bookings) {
    if (!isRetiredUnitId(booking.unit_id)) continue;
    await db.bookings.delete(booking.id);
  }
  try {
    await supabase.from('unit_operations').delete().in('id', ['u1', 'u2', 'u3', 'u4']);
    await supabase.from('hotelos_bookings').delete().in('unit_id', ['u1', 'u2', 'u3', 'u4']);
    await supabase.from('resort_operations').delete().in('unit_id', ['u1', 'u2', 'u3', 'u4']);
  } catch (_) {}
  if (tenantId) {
    try {
      await supabase.from('unit_operations').delete().eq('tenant_id', tenantId).in('id', ['u1', 'u2', 'u3', 'u4']);
    } catch (_) {}
  }
}

export async function retirePhantomUnits(tenantId) {
  if (!tenantId) return;
  await purgeRetiredDemoData(tenantId);
  const now = new Date().toISOString();
  const nameByPhantom = {};

  try {
    const { data: ops } = await supabase
      .from('unit_operations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .limit(2000);
    for (const row of ops || []) {
      if (isPhantomUnitId(row.id)) nameByPhantom[row.id] = row.name;
    }
  } catch (_) {}

  const units = await db.units.toArray();
  for (const unit of units) {
    if (isPhantomUnitId(unit.id)) nameByPhantom[unit.id] = nameByPhantom[unit.id] || unit.name;
  }

  const bookings = await db.bookings.toArray();
  let cloudBookings = [];
  try {
    cloudBookings = await fetchAllTenantBookings(tenantId);
  } catch (_) {}

  const allBookings = [...bookings];
  for (const row of cloudBookings) {
    if (!allBookings.some((item) => item.id === row.id)) allBookings.push(row);
  }

  for (const booking of allBookings) {
    if (!isPhantomUnitId(booking.unit_id) || booking.deleted_at) continue;
    const mappedId = matchCanonicalUnitId(nameByPhantom[booking.unit_id]) || matchCanonicalUnitId(booking.unit_id);
    if (!mappedId) continue;
    const updated = { ...booking, unit_id: mappedId, updated_at: now };
    await db.bookings.put(updated);
    await pushBookingToCloud(updated, { allowOverlap: true });
  }

  for (const unit of units) {
    if (!isPhantomUnitId(unit.id)) continue;
    await db.units.put({
      ...unit,
      is_active: false,
      deleted_at: unit.deleted_at || now,
      updated_at: now
    });
  }

  for (const phantomId of Object.keys(nameByPhantom)) {
    try {
      await supabase.from('unit_operations').delete().eq('id', phantomId);
    } catch (_) {}
  }
}

/**
 * Pulls tenant bookings from the local Supabase and merges into Dexie.
 */
export async function syncCloudBookingsToDexie(tenantId, options = {}) {
  if (!tenantId) return { ok: false, count: 0 };
  const local = await db.bookings.where('tenant_id').equals(tenantId).toArray().catch(() => []);
  const liveLocal = (local || []).filter((row) => !row.deleted_at && row.booking_status !== 'CANCELED');
  if (!liveLocal.length) {
    await restoreBookingSnapshot(tenantId).catch(() => 0);
  }
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      let data = options.from && options.to
        ? await fetchBookingsOverlapping(tenantId, options.from, options.to)
        : await fetchAllTenantBookings(tenantId);
      if (!data.length && options.from && options.to) {
        data = await fetchAllTenantBookings(tenantId);
      }
      if (!data.length) {
        if (attempt < 2) continue;
        if (liveLocal.length) return { ok: true, count: liveLocal.length, keptLocal: true };
        return { ok: false, count: 0, error: 'EMPTY_PULL' };
      }
      await applyIncomingBookings(data);
      saveBookingSnapshot(tenantId, data);
      return { ok: true, count: data.length };
    } catch (err) {
      lastError = String(err?.message || err);
      console.warn('[HOTELOS SYNC PULL]', lastError);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  return { ok: false, count: 0, error: lastError };
}

/** Pull Studio, then push any local rows that are newer or missing in the cloud. */
export async function reconcileBookingsWithCloud(tenantId) {
  if (!tenantId) return;
  await syncCloudBookingsToDexie(tenantId);
  try {
    const data = await fetchAllTenantBookings(tenantId, 'id, updated_at, booking_status, deleted_at');
    const cloudById = new Map(data.map((row) => [row.id, row]));
    const local = await db.bookings.toArray();
    const toPush = [];
    for (const booking of local) {
      if (booking.tenant_id !== tenantId || booking.deleted_at || !isRealBooking(booking)) continue;
      if (isRetiredUnitId(booking.unit_id) || isPhantomUnitId(booking.unit_id)) continue;
      const cloud = cloudById.get(booking.id);
      if (!cloud || shouldApplyIncomingBooking(cloud, booking)) {
        toPush.push(booking);
      }
    }
    if (toPush.length) {
      await pushBookingsToCloud(toPush, { allowOverlap: true, fallback: false });
    }
  } catch (err) {
    console.warn('[HOTELOS SYNC RECONCILE]', err?.message || err);
  }
}

/**
 * Subscribes to Postgres changes on the private Supabase instance.
 */
export function subscribeToRealtimeCloudBookings(tenantId, onBookingReceived) {
  if (!tenantId || !supabase) return () => {};

  const channel = supabase
    .channel(`bookings:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'hotelos_bookings',
        filter: `tenant_id=eq.${tenantId}`
      },
      async (payload) => {
        const bookingData = payload.new;
        if (!bookingData?.id) return;
        try {
          const existing = await db.bookings.get(bookingData.id);
          if (!shouldApplyIncomingBooking(existing, bookingData)) {
            let next = existing;
            if (existing && filledPhone(bookingData.guest_phone) && !filledPhone(existing.guest_phone)) {
              next = { ...next, guest_phone: bookingData.guest_phone };
            }
            next = fillMissingMoney(next, bookingData);
            if (existing && (
              clearingProofCount(bookingData) > clearingProofCount(existing)
              || clearingPaidAgorot(bookingData) > clearingPaidAgorot(existing)
            )) {
              next = mergeBookingRow(next, bookingData);
            }
            if (next && next !== existing) {
              await db.bookings.put(next);
              if (onBookingReceived) onBookingReceived(next);
            }
            return;
          }
          await db.bookings.put(mergeBookingRow(existing, bookingData));
          if (onBookingReceived) onBookingReceived(bookingData);
        } catch (_) {}
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Looks up a checkout token on the private Supabase (guest phone → Mac Studio).
 */
export async function fetchBookingByCheckoutToken(token) {
  if (!token) return null;
  try {
    const { data, error } = await supabase
      .from('hotelos_bookings')
      .select('*')
      .eq('checkout_token', token)
      .maybeSingle();

    if (error || !data || data.deleted_at) return null;
    if (stayLinkExpired(data)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

const UNIT_OPS_KEYS = [
  'id',
  'tenant_id',
  'name',
  'operational_status',
  'operational_domain',
  'custom_reason',
  'assigned_staff',
  'is_escalated',
  'cleaning_started_at',
  'quality_inspections',
  'rework_count',
  'last_failed_fields',
  'image_urls',
  'name_i18n',
  'reason_i18n',
  'text_source_lang',
  'sop_progress',
  'current_operation_id',
  'staff_occupancy',
  'created_at',
  'updated_at'
];

function toUnitOpsRow(unit) {
  const row = {};
  for (const key of UNIT_OPS_KEYS) {
    if (unit[key] !== undefined) row[key] = unit[key];
  }
  if (!row.id) return null;
  row.quality_inspections = Array.isArray(row.quality_inspections) ? row.quality_inspections : [];
  row.last_failed_fields = Array.isArray(row.last_failed_fields) ? row.last_failed_fields : [];
  row.image_urls = Array.isArray(row.image_urls) ? row.image_urls : [];
  row.sop_progress = row.sop_progress && typeof row.sop_progress === 'object' ? row.sop_progress : {};
  row.rework_count = Number(row.rework_count) || 0;
  row.is_escalated = Boolean(row.is_escalated);
  row.updated_at = row.updated_at || new Date().toISOString();
  return row;
}

function opsFieldsFromRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    operational_status: row.operational_status,
    operational_domain: row.operational_domain,
    custom_reason: row.custom_reason,
    assigned_staff: row.assigned_staff,
    is_escalated: Boolean(row.is_escalated),
    cleaning_started_at: row.cleaning_started_at || null,
    quality_inspections: Array.isArray(row.quality_inspections) ? row.quality_inspections : [],
    rework_count: Number(row.rework_count) || 0,
    last_failed_fields: Array.isArray(row.last_failed_fields) ? row.last_failed_fields : [],
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
    name_i18n: row.name_i18n,
    reason_i18n: row.reason_i18n,
    text_source_lang: row.text_source_lang,
    sop_progress: row.sop_progress && typeof row.sop_progress === 'object' ? row.sop_progress : {},
    current_operation_id: row.current_operation_id || null,
    staff_occupancy: row.staff_occupancy || null,
    updated_at: row.updated_at,
    created_at: row.created_at
  };
}

async function applyOpsRowToDexie(row) {
  if (!row?.id) return;
  if (isRetiredUnitId(row.id)) {
    await db.units.delete(row.id);
    return;
  }
  if (isPhantomUnitId(row.id)) {
    const phantom = await db.units.get(row.id);
    if (phantom && phantom.is_active !== false) {
      await db.units.put({
        ...phantom,
        is_active: false,
        deleted_at: phantom.deleted_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    return;
  }
  const existing = await db.units.get(row.id);
  const ops = opsFieldsFromRow(row);
  const existingUpdated = existing?.updated_at || '';
  const incomingUpdated = ops.updated_at || '';
  if (existing && existingUpdated && incomingUpdated && incomingUpdated < existingUpdated) {
    return;
  }
  await db.units.put({
    unit_type: existing?.unit_type || 'suite',
    max_occupancy: existing?.max_occupancy || 2,
    base_price_agorot: existing?.base_price_agorot || 0,
    cleaning_fee_agorot: existing?.cleaning_fee_agorot || 0,
    is_active: existing?.is_active !== false,
    version: existing?.version || 1,
    ...existing,
    ...ops
  });
}

/**
 * Upserts operations state to Dexie and the shared Postgres table `unit_operations`.
 * This is what other staff devices read (not browser-only IndexedDB).
 */
export async function pushUnitToCloud(patch, options = {}) {
  if (!patch?.id) return;
  if (isRetiredUnitId(patch.id) || isPhantomUnitId(patch.id)) {
    try {
      await db.units.delete(patch.id);
      await supabase.from('unit_operations').delete().eq('id', patch.id);
    } catch (_) {}
    return;
  }
  try {
    const existing = await db.units.get(patch.id);
    const merged = {
      ...existing,
      ...patch,
      id: patch.id,
      tenant_id: patch.tenant_id || existing?.tenant_id,
      name: patch.name || existing?.name,
      updated_at: patch.updated_at || new Date().toISOString()
    };
    if (!merged.created_at) merged.created_at = existing?.created_at || merged.updated_at;
    const localRow = {
      unit_type: merged.unit_type || 'suite',
      max_occupancy: merged.max_occupancy || 2,
      base_price_agorot: merged.base_price_agorot || 0,
      cleaning_fee_agorot: merged.cleaning_fee_agorot || 0,
      is_active: merged.is_active !== false,
      version: merged.version || 1,
      ...merged
    };
    await db.units.put(localRow);

    const persistRemote = async () => {
      const statusChanged = existing?.operational_status !== merged.operational_status
        || JSON.stringify(existing?.quality_inspections || []) !== JSON.stringify(merged.quality_inspections || []);
      let next = merged;
      if (statusChanged) {
        const withHistory = await syncResortOperationHistory(existing, merged, options.actor || null);
        next = { ...merged, ...withHistory };
        await db.units.put({ ...localRow, ...next });
      }
      const row = toUnitOpsRow(next);
      if (!row || !row.tenant_id) return;
      const { error } = await supabase.from('unit_operations').upsert(row);
      if (error) {
        console.warn('[HOTELOS UNIT OPS PUSH]', error.message);
        return;
      }
      if (statusChanged && !options.skipStayPublish) {
        const related = await relatedStayBookings(next);
        for (const booking of related) {
          await publishBookingStay(booking, next).catch((err) => {
            console.warn('[HOTELOS STAY PUBLISH]', booking.id, err?.message || err);
          });
        }
      }
    };
    if (options.waitRemote) await persistRemote();
    else void persistRemote().catch((err) => console.warn('[HOTELOS UNIT OPS PUSH]', err));
  } catch (err) {
    console.warn('[HOTELOS UNIT OPS PUSH]', err);
  }
}

export async function syncUnitOpsToDexie(tenantId) {
  if (!tenantId) return;
  try {
    const { data, error } = await supabase
      .from('unit_operations')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(2000);
    if (error || !data) {
      if (error) console.warn('[HOTELOS UNIT OPS PULL]', error.message);
      return;
    }
    for (const row of data) {
      await applyOpsRowToDexie(row);
    }
  } catch (_) {}
}

export function subscribeToRealtimeUnitOps(tenantId) {
  if (!tenantId || !supabase) return () => {};

  const channel = supabase
    .channel(`unit_operations:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'unit_operations',
        filter: `tenant_id=eq.${tenantId}`
      },
      async (payload) => {
        if (payload.eventType === 'DELETE') return;
        await applyOpsRowToDexie(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
