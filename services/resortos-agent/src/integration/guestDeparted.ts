/**
 * Real departure via Chloe (Ran 2026-10-31): when a guest tells Chloe they left on/after the checkout date,
 * reuse the Studio self-checkout write path (POST /api/guest/self-checkout-effects → markBookingSelfDeparted)
 * with source=guest_message. Studio sets CHECKED_OUT + checkout_status='guest_message' + checked_out_at,
 * skips the farewell SMS (Chloe already replied) and never overwrites an existing checkout.
 */
export interface GuestDepartedInput {
  bookingId: string;
  unitId?: string | null;
  at?: string;
}

export function createGuestDepartedMarker(opts: { baseUrl: string; secret?: string; fetchImpl?: typeof fetch }) {
  const f = opts.fetchImpl || fetch;
  return async (p: GuestDepartedInput): Promise<boolean> => {
    const secret = String(opts.secret || '').trim();
    if (!secret || !p.bookingId) return false;
    const res = await f(`${opts.baseUrl.replace(/\/$/, '')}/api/guest/self-checkout-effects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hotelos-mailbox': secret },
      body: JSON.stringify({ source: 'guest_message', booking_id: p.bookingId, unit_id: p.unitId || null, checked_out_at: p.at || new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  };
}
