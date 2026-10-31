/** Display-only state (Ran 2026-10-31): checkout day and not yet really departed. Never written to the DB. */
export function isDueOut(b: { check_out_date?: string | null; booking_status?: string | null; deleted_at?: string | null } | null | undefined, today: string): boolean {
  if (!b || b.deleted_at) return false;
  const st = String(b.booking_status || '').toUpperCase();
  return String(b.check_out_date || '').slice(0, 10) === today && st !== 'CHECKED_OUT' && st !== 'CANCELED' && st !== 'CANCELLED';
}
