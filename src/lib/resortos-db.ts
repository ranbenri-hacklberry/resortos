import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from './supabaseClient';
import { fetchGuestCheckout } from './guestCheckoutApi';
import { stayLinkExpired } from './stayAccess';

// =============================================================================
// 1. DOMAIN ENTITY INTERFACES (Matching ResortOS Postgres Schema)
// =============================================================================

export interface QualityInspection {
  at: string;
  ratings: Record<string, number>;
  note: string;
  failed_fields: string[];
  reopened: boolean;
}

export interface Unit {
  id: string;
  tenant_id: string;
  name: string;
  unit_code?: string;
  unit_type: 'cabin' | 'suite' | 'room' | 'villa' | string;
  max_occupancy: number;
  base_price_agorot: number;
  cleaning_fee_agorot: number;
  ical_feed_url?: string;
  image_urls?: string[];
  operational_status?: string;
  operational_domain?: string;
  custom_reason?: string;
  assigned_staff?: string;
  is_escalated?: boolean;
  cleaning_started_at?: string | null;
  quality_inspections?: QualityInspection[];
  rework_count?: number;
  last_failed_fields?: string[];
  sop_progress?: {
    templateId?: string | null;
    steps?: Array<{ id: string; label?: Record<string, string> }>;
    doneIds?: string[];
  };
  current_operation_id?: string | null;
  sort_order?: number;
  is_active: boolean;
  name_i18n?: Record<string, string>;
  reason_i18n?: Record<string, string>;
  text_source_lang?: string;
  property_id?: string;
  content?: Record<string, any>;
  access?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  version: number;
}

export interface Booking {
  id: string;
  tenant_id: string;
  unit_id: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  check_in_date: string;
  check_out_date: string;
  adults_count: number;
  children_count: number;
  total_price_agorot: number;
  deposit_agorot: number;
  booking_status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELED' | string;
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED' | string;
  payment_mode?: 'CREDIT_DEPOSIT' | 'CREDIT_FULL' | 'CASH_TRUST' | string;
  clearing_payments?: Array<Record<string, unknown>>;
  channel_source: 'DIRECT' | 'AIRBNB' | 'BOOKING_COM' | 'ICAL' | string;
  checkout_token?: string;
  special_requests?: string;
  expires_at?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  version: number;
}

export interface Property {
  id: string;
  tenant_id: string;
  name: string;
  village?: string;
  cluster?: string;
  sort_order?: number;
  content?: Record<string, any>;
  access?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Promotion {
  id: string;
  tenant_id: string;
  unit_id: string;
  target_date: string;
  discount_percentage: number;
  original_price_agorot: number;
  discounted_price_agorot: number;
  is_active: boolean;
  created_at: string;
}

export interface SyncMeta {
  key: string; // e.g. "sync_seq_<tenant_id>"
  last_synced_seq: number;
  last_synced_at: string;
}

// Interface representing the remote PostgreSQL sync_changes_log payload
export interface RemoteChangeLog {
  seq: number;
  tenant_id: string;
  table_name: 'units' | 'bookings' | 'promotions' | string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'SOFT_DELETE' | string;
  payload: Record<string, any>;
  created_at: string;
}

// =============================================================================
// 2. DEXIE.JS DATABASE CLASS (HotelOSLocalDB)
// =============================================================================

export class HotelOSLocalDB extends Dexie {
  units!: Table<Unit, string>;
  properties!: Table<Property, string>;
  bookings!: Table<Booking, string>;
  promotions!: Table<Promotion, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('HotelOSLocalDB');
    
    // Schema definition with indexes optimized for offline hospitality queries
    this.version(3).stores({
      units: 'id, tenant_id, unit_type, is_active, updated_at, [tenant_id+deleted_at]',
      bookings: 'id, tenant_id, unit_id, checkout_token, check_in_date, check_out_date, booking_status, updated_at, [tenant_id+deleted_at]',
      promotions: 'id, tenant_id, unit_id, target_date, [tenant_id+unit_id+target_date]',
      syncMeta: 'key'
    });
    this.version(4).stores({
      units: 'id, tenant_id, unit_type, is_active, updated_at, property_id, [tenant_id+deleted_at]',
      properties: 'id, tenant_id, cluster, updated_at',
      bookings: 'id, tenant_id, unit_id, checkout_token, check_in_date, check_out_date, booking_status, updated_at, [tenant_id+deleted_at]',
      promotions: 'id, tenant_id, unit_id, target_date, [tenant_id+unit_id+target_date]',
      syncMeta: 'key'
    });
  }
}

// Export singleton instance
export const db = new HotelOSLocalDB();

// =============================================================================
// 3. INCREMENTAL SYNC ENGINE (pullIncrementalSync)
// =============================================================================

export async function pullIncrementalSync(tenantId: string): Promise<{ syncedCount: number; newSeq: number }> {
  if (!tenantId) {
    throw new Error('HOTELOS SYNC ERROR: tenantId is required for pullIncrementalSync');
  }

  const metaKey = `sync_seq_${tenantId}`;

  const meta = await db.syncMeta.get(metaKey);
  const lastSyncedSeq = meta ? meta.last_synced_seq : 0;

  let changeLogs = [];
  try {
    const { data, error } = await supabase
      .from('sync_changes_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .gt('seq', lastSyncedSeq)
      .order('seq', { ascending: true })
      .limit(1000);

    if (error) {
      console.warn('[HOTELOS SYNC INFO] PostgREST sync query info:', error.message || error);
      return { syncedCount: 0, newSeq: lastSyncedSeq };
    }
    changeLogs = data || [];
  } catch (err) {
    console.warn('[HOTELOS SYNC INFO] Offline mode active - operating on local Dexie IndexedDB.');
    return { syncedCount: 0, newSeq: lastSyncedSeq };
  }

  if (!changeLogs || changeLogs.length === 0) {
    return { syncedCount: 0, newSeq: lastSyncedSeq };
  }

  let highestSeq = lastSyncedSeq;

  await db.transaction('rw', [db.units, db.bookings, db.promotions, db.syncMeta], async () => {
    for (const log of changeLogs as RemoteChangeLog[]) {
      const { table_name, action, payload, seq } = log;

      if (seq > highestSeq) {
        highestSeq = seq;
      }

      if (table_name === 'units') {
        if (action === 'SOFT_DELETE' || payload.deleted_at) {
          await db.units.put({
            ...(payload as Unit),
            deleted_at: payload.deleted_at || new Date().toISOString()
          });
        } else {
          await db.units.put(payload as Unit);
        }
      } else if (table_name === 'bookings') {
        if (action === 'SOFT_DELETE' || payload.deleted_at || payload.booking_status === 'CANCELED') {
          await db.bookings.put({
            ...(payload as Booking),
            booking_status: payload.booking_status || 'CANCELED',
            deleted_at: payload.deleted_at || new Date().toISOString()
          });
        } else {
          await db.bookings.put(payload as Booking);
        }
      } else if (table_name === 'promotions') {
        await db.promotions.put(payload as Promotion);
      }
    }

    await db.syncMeta.put({
      key: metaKey,
      last_synced_seq: highestSeq,
      last_synced_at: new Date().toISOString()
    });
  });

  return { syncedCount: changeLogs.length, newSeq: highestSeq };
}

// =============================================================================
// 4. BACKGROUND SYNC MANAGER & SUPABASE REALTIME SUBSCRIPTION
// =============================================================================

export interface SyncEngineOptions {
  pollingIntervalMs?: number;
  enableRealtime?: boolean;
  onError?: (err: any) => void;
}

export function startResortOSSyncEngine(
  tenantId: string,
  options: SyncEngineOptions = {}
): () => void {
  const { pollingIntervalMs = 5000, enableRealtime = true, onError } = options;

  let isSyncing = false;
  let timerId: any = null;
  let realtimeChannel: any = null;

  const triggerSync = async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      await pullIncrementalSync(tenantId);
    } catch (err) {
      if (onError) onError(err);
      else console.error('HOTELOS BACKGROUND SYNC FAILURE:', err);
    } finally {
      isSyncing = false;
    }
  };

  triggerSync();

  timerId = setInterval(triggerSync, pollingIntervalMs);

  if (enableRealtime && supabase) {
    realtimeChannel = supabase
      .channel(`sync_changes_log:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_changes_log',
          filter: `tenant_id=eq.${tenantId}`
        },
        () => {
          triggerSync();
        }
      )
      .subscribe();
  }

  return () => {
    if (timerId) clearInterval(timerId);
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  };
}

// =============================================================================
// 5. REACT REACTIVITY HOOKS (0ms Local IndexedDB Reactivity)
// =============================================================================

export function useLiveUnits(tenantId: string): Unit[] {
  return (
    useLiveQuery(
      async () => {
        if (!tenantId) return [];
        const byTenant = await db.units
          .where('tenant_id')
          .equals(tenantId)
          .filter(unit => !unit.deleted_at && unit.is_active !== false)
          .toArray();
        if (byTenant.length) return byTenant;
        return (await db.units.toArray()).filter((unit) => (
          !unit.deleted_at
          && unit.is_active !== false
          && (!unit.tenant_id || unit.tenant_id === tenantId)
        ));
      },
      [tenantId]
    ) ?? []
  );
}

const lastLiveBookings = new Map<string, Booking[]>();

export function useLiveBookings(tenantId: string, unitId?: string): Booking[] {
  const key = `${tenantId || ''}:${unitId || ''}`;
  const rows = useLiveQuery(
    async () => {
      if (!tenantId) return [];
      const results = await db.bookings.where('tenant_id').equals(tenantId).toArray();
      return results.filter((b) => {
        if (b.deleted_at) return false;
        if (unitId && b.unit_id !== unitId) return false;
        return true;
      });
    },
    [tenantId, unitId]
  );
  if (rows === undefined) return lastLiveBookings.get(key) || [];
  lastLiveBookings.set(key, rows);
  return rows;
}

function isExpiredBooking(booking: Booking): boolean {
  return stayLinkExpired(booking);
}

/**
 * Resolves a guest checkout token from Dexie, then private Supabase.
 * Returns undefined while loading, null when missing/expired. Never invents a booking.
 */
export function useLiveBookingByToken(token: string): Booking | null | undefined {
  return useLiveQuery(
    async () => {
      if (!token) return null;

      const bookings = await db.bookings.where('checkout_token').equals(token).toArray();
      const existing = bookings.find(b => !b.deleted_at);

      try {
        const guestRow = await fetchGuestCheckout(token);
        if (guestRow && !guestRow.deleted_at && !isExpiredBooking(guestRow as Booking)) {
          const remote = guestRow as Booking;
          const changed = !existing ||
            existing.updated_at !== remote.updated_at ||
            existing.booking_status !== remote.booking_status;
          if (changed) {
            setTimeout(() => {
              db.bookings.put(remote).catch(() => {});
            }, 0);
          }
          return remote;
        }
      } catch (_) {}

      if (existing && !isExpiredBooking(existing)) return existing;

      const onPublicGuestHost = typeof window !== 'undefined' && (
        window.location.hostname.includes('pages.dev') ||
        window.location.hostname.endsWith('.ts.net')
      );
      if (onPublicGuestHost) return null;

      try {
        const { data, error } = await supabase
          .from('hotelos_bookings')
          .select('*')
          .eq('checkout_token', token)
          .maybeSingle();

        if (!error && data && !data.deleted_at) {
          if (isExpiredBooking(data as Booking)) return null;
          const remote = data as Booking;
          setTimeout(() => {
            db.bookings.put(remote).catch(() => {});
          }, 0);
          return remote;
        }
      } catch (_) {
        // Guest device cannot reach private Supabase — show expired/invalid, do not fabricate
      }

      return null;
    },
    [token]
  );
}

export function useLivePromotions(tenantId: string): Promotion[] {
  return (
    useLiveQuery(
      async () => {
        if (!tenantId) return [];
        return await db.promotions
          .where('tenant_id')
          .equals(tenantId)
          .filter(p => p.is_active)
          .toArray();
      },
      [tenantId]
    ) ?? []
  );
}

export function useResortOSSyncStatus(tenantId: string): SyncMeta | undefined {
  return useLiveQuery(
    async () => {
      if (!tenantId) return undefined;
      return await db.syncMeta.get(`sync_seq_${tenantId}`);
    },
    [tenantId]
  );
}
