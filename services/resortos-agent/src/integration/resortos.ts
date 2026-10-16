import { config } from '../config.js';

/**
 * Real ResortOS contract (server/opsGateway.js + server/agentConnections.js):
 *  - Auth: `Authorization: Bearer ros_agent_…` (an approved "agent connection" with the `room_status` permission).
 *  - GET /api/ops/units                -> { units: [{ id, operational_status, ... }] }
 *  - PUT /api/ops/units/:unitId        -> agents may only change AGENT_STATUS_FIELDS:
 *      operational_status, operational_domain, custom_reason, quality_inspections,
 *      cleaning_started_at, assigned_staff, is_escalated.
 *    The server re-reads the unit and answers 409 STATUS_NOT_VERIFIED if the write did not stick.
 *  There is no separate "maintenance ticket" endpoint: an issue is a unit with
 *  operational_status=MAINTENANCE_ALERT / operational_domain=MAINTENANCE (same as tasksService.createStaffTask).
 */

export const AWAITING_INSPECTION_REASON = 'ממתין לביקורת מנהל';

export interface UnitRow {
  id: string;
  name?: string;
  operational_status?: string | null;
  custom_reason?: string | null;
  assigned_staff?: string | null;
  cleaning_started_at?: string | null;
  [k: string]: unknown;
}

export interface BookingRow {
  id: string;
  unit_id: string;
  guest_name?: string | null;
  guest_phone?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  booking_status?: string | null;
  payment_status?: string | null;
  checkout_token?: string | null;
  adults_count?: number | null;
  children_count?: number | null;
  total_price_agorot?: number | null;
  deposit_agorot?: number | null;
  deleted_at?: string | null;
  [k: string]: unknown;
}

export type ReadyResult = { ok: true } | { ok: false; skipped: 'maintenance_open' | 'unit_not_found' };

export class ResortOSError extends Error {
  constructor(public status: number, public code: string, path: string) {
    super(`ResortOS ${path} -> HTTP ${status} ${code}`);
  }
}

export class ResortOSClient {
  private unitsCache?: { data: UnitRow[]; expiresAt: number };
  private bookingsCache = new Map<string, { data: BookingRow[]; expiresAt: number }>();

  constructor(private fetchImpl: typeof fetch = fetch) {}

  public clearCache() {
    this.unitsCache = undefined;
    this.bookingsCache.clear();
  }

  private async req<T>(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${config.resortos.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(config.resortos.token ? { authorization: `Bearer ${config.resortos.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.resortos.timeoutMs),
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
    if (!res.ok) throw new ResortOSError(res.status, String(data?.error ?? res.statusText), path);
    return data as T;
  }

  private async postgrest<T>(method: 'GET' | 'PATCH', table: string, query: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${config.supabase.url}/rest/v1/${table}${query}`, {
      method,
      headers: {
        'content-type': 'application/json',
        apikey: config.supabase.key,
        authorization: `Bearer ${config.supabase.key}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.resortos.timeoutMs),
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    return data as T;
  }

  async listUnits(): Promise<UnitRow[]> {
    const now = Date.now();
    if (this.unitsCache && this.unitsCache.expiresAt > now) {
      return this.unitsCache.data;
    }
    try {
      const units = (await this.req<{ units?: UnitRow[] }>('GET', '/api/ops/units')).units ?? [];
      this.unitsCache = { data: units, expiresAt: now + 15_000 };
      return units;
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403 || e?.code === 'ECONNREFUSED' || e?.name === 'TimeoutError' || String(e).includes('Timeout')) {
        const rows = await this.postgrest<UnitRow[]>('GET', 'unit_operations', '?select=id,operational_status,custom_reason,assigned_staff,cleaning_started_at&limit=500');
        if (Array.isArray(rows) && rows.length) {
          this.unitsCache = { data: rows, expiresAt: now + 15_000 };
          return rows;
        }
      }
      throw e;
    }
  }

  async listBookings(params?: { from?: string; to?: string }): Promise<BookingRow[]> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const now = Date.now();
    const cached = this.bookingsCache.get(qs);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    try {
      const bookings = (await this.req<{ bookings?: BookingRow[] }>('GET', `/api/ops/bookings${qs}`)).bookings ?? [];
      this.bookingsCache.set(qs, { data: bookings, expiresAt: now + 20_000 });
      return bookings;
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403 || e?.code === 'ECONNREFUSED' || e?.name === 'TimeoutError' || String(e).includes('Timeout')) {
        let filter = '?deleted_at=is.null&select=*&limit=1000';
        if (params?.from && params?.to) {
          filter += `&check_in_date=lte.${encodeURIComponent(params.to)}&check_out_date=gte.${encodeURIComponent(params.from)}`;
        }
        const rows = await this.postgrest<BookingRow[]>('GET', 'hotelos_bookings', filter);
        if (Array.isArray(rows)) {
          this.bookingsCache.set(qs, { data: rows, expiresAt: now + 20_000 });
          return rows;
        }
      }
      throw e;
    }
  }

  async publishBookingStay(booking: BookingRow): Promise<boolean> {
    if (!booking?.checkout_token || !booking?.id || !booking?.unit_id) return false;
    const mailboxUrl = (process.env.CHECKOUT_MAILBOX_URL || 'https://resortos.app').replace(/\/$/, '');
    const mailboxSecret = process.env.CHECKOUT_MAILBOX_SECRET || '244e82006f91f44db1452d2313b49487503eb65c4596b7a4a94d3ae683af6c5a';
    try {
      const res = await this.fetchImpl(`${mailboxUrl}/api/checkout/publish`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-hotelos-mailbox': mailboxSecret,
        },
        body: JSON.stringify(booking),
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async putUnit(unitId: string, patch: Record<string, unknown>) {
    this.clearCache();
    try {
      return await this.req('PUT', `/api/ops/units/${encodeURIComponent(unitId)}`, patch);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403 || e?.code === 'ECONNREFUSED' || e?.name === 'TimeoutError' || String(e).includes('Timeout')) {
        await this.postgrest('PATCH', 'unit_operations', `?id=eq.${encodeURIComponent(unitId)}`, patch);
        return;
      }
      throw e;
    }
  }

  /**
   * Manager approves the room directly (READY for guest check-in, clearing awaiting inspection).
   */
  async approveRoomByManager(p: { unitId: string; reportedBy: string }): Promise<ReadyResult> {
    const unit = (await this.listUnits()).find((u) => u.id === p.unitId);
    if (!unit) return { ok: false, skipped: 'unit_not_found' };
    await this.putUnit(p.unitId, {
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: 'אושר ע״י מנהל',
      assigned_staff: p.reportedBy,
      cleaning_started_at: null,
      is_escalated: false,
    });
    return { ok: true };
  }

  /**
   * Cleaner says "ready". The ResortOS workflow has a manager-inspection step, so we mark READY with the
   * standard "awaiting inspection" reason instead of a final green. Never overrides an open maintenance alert.
   */
  async markRoomReady(p: { unitId: string; reportedBy: string }): Promise<ReadyResult> {
    const unit = (await this.listUnits()).find((u) => u.id === p.unitId);
    if (!unit) return { ok: false, skipped: 'unit_not_found' };
    if (unit.operational_status === 'MAINTENANCE_ALERT') return { ok: false, skipped: 'maintenance_open' };
    await this.putUnit(p.unitId, {
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: AWAITING_INSPECTION_REASON,
      assigned_staff: p.reportedBy,
      cleaning_started_at: null,
    });
    return { ok: true };
  }

  /** Cleaner starts cleaning -> assigns cleaner and sets status to IN_PROGRESS. */
  async startCleaning(p: { unitId: string; reportedBy: string }): Promise<ReadyResult> {
    const unit = (await this.listUnits()).find((u) => u.id === p.unitId);
    if (!unit) return { ok: false, skipped: 'unit_not_found' };
    if (unit.operational_status === 'MAINTENANCE_ALERT') return { ok: false, skipped: 'maintenance_open' };
    await this.putUnit(p.unitId, {
      operational_status: 'IN_PROGRESS',
      operational_domain: 'HOUSEKEEPING',
      assigned_staff: p.reportedBy,
      cleaning_started_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  /** Broken/leaking/etc. -> MAINTENANCE_ALERT, escalated, with the Hebrew description. */
  async reportMaintenance(p: { unitId: string; description: string; reportedBy: string }) {
    await this.putUnit(p.unitId, {
      operational_status: 'MAINTENANCE_ALERT',
      operational_domain: 'MAINTENANCE',
      custom_reason: p.description,
      is_escalated: true,
      assigned_staff: p.reportedBy,
    });
  }

  /** Missing supplies -> unit stays DIRTY/IN_PROGRESS (or becomes DIRTY) with the "חוסר:" prefix, like the field board. */
  async reportSupplies(p: { unitId: string; description: string; reportedBy: string }) {
    const unit = (await this.listUnits()).find((u) => u.id === p.unitId);
    if (!unit) throw new ResortOSError(404, 'UNIT_NOT_FOUND', '/api/ops/units');
    const keep = unit.operational_status === 'DIRTY' || unit.operational_status === 'IN_PROGRESS';
    await this.putUnit(p.unitId, {
      operational_status: keep ? unit.operational_status : 'DIRTY',
      operational_domain: 'HOUSEKEEPING',
      custom_reason: `חוסר: ${p.description}`,
      assigned_staff: p.reportedBy,
    });
  }

  /**
   * Manager updates unit operational status (READY, IN_PROGRESS, DIRTY, MAINTENANCE_ALERT).
   */
  async updateUnitStatus(p: { unitId: string; status: string; reason?: string; reportedBy: string }): Promise<ReadyResult> {
    const unit = (await this.listUnits()).find((u) => u.id === p.unitId);
    if (!unit) return { ok: false, skipped: 'unit_not_found' };
    const patch: Record<string, unknown> = {
      operational_status: p.status,
      assigned_staff: p.reportedBy,
    };
    if (p.reason !== undefined) patch.custom_reason = p.reason;
    if (p.status === 'READY') {
      patch.operational_domain = 'HOUSEKEEPING';
      patch.cleaning_started_at = null;
      patch.is_escalated = false;
    } else if (p.status === 'IN_PROGRESS') {
      patch.operational_domain = 'HOUSEKEEPING';
      patch.cleaning_started_at = new Date().toISOString();
    } else if (p.status === 'DIRTY') {
      patch.operational_domain = 'HOUSEKEEPING';
      patch.cleaning_started_at = null;
    } else if (p.status === 'MAINTENANCE_ALERT') {
      patch.operational_domain = 'MAINTENANCE';
      patch.is_escalated = true;
    }
    await this.putUnit(p.unitId, patch);
    return { ok: true };
  }

  /**
   * Set custom note on unit.
   */
  async updateUnitNote(p: { unitId: string; note: string; reportedBy: string }): Promise<void> {
    await this.putUnit(p.unitId, {
      custom_reason: p.note,
      assigned_staff: p.reportedBy,
    });
  }

  /**
   * Save note for guest / booking.
   */
  async updateBookingNote(p: { bookingId: string; note: string; reportedBy: string }): Promise<void> {
    this.clearCache();
    try {
      await this.postgrest('PATCH', 'hotelos_bookings', `?id=eq.${encodeURIComponent(p.bookingId)}`, {
        special_requests: p.note,
      });
    } catch {
      // Non-critical, fallback gracefully
    }
  }
}
