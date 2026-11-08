/**
 * Push guest stay pages to the checkout mailbox (resortos.app) for bookings as they are ingested.
 * Idempotent: the mailbox /publish endpoint no-ops on identical rows and never downgrades a paid
 * stay. Only creates/refreshes guest pages — no SMS, no charges.
 */
const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;
const STAFF_UNIT_IDS = new Set(['k678', 'k679']);
const CANCELLED = new Set(['CANCELLED', 'CANCELED']);

export function needsGuestPage(row, today) {
  if (!row?.id || !row.unit_id || !row.check_in_date || !row.check_out_date) return false;
  if (!TOKEN_RE.test(String(row.checkout_token || ''))) return false;
  if (STAFF_UNIT_IDS.has(row.unit_id)) return false;
  if (CANCELLED.has(String(row.booking_status || '').toUpperCase())) return false;
  if (row.deleted_at) return false;
  if (today && String(row.check_out_date).slice(0, 10) < String(today).slice(0, 10)) return false;
  return true;
}

async function defaultLoad(ids) {
  const { rest } = await import('./guestComms.js');
  const list = ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
  const rows = await rest(`hotelos_bookings?id=in.(${encodeURIComponent(list)})&deleted_at=is.null&select=*`);
  return Array.isArray(rows) ? rows : [];
}

async function defaultPublish(row) {
  const { publishBookingToMailbox } = await import('./checkoutMailbox.js');
  return publishBookingToMailbox(row);
}

export async function autoPublishGuestPages(rows, { today, load = defaultLoad, publish = defaultPublish, concurrency = 4 } = {}) {
  const ids = [...new Set((rows || []).filter((r) => needsGuestPage(r, today)).map((r) => r.id))];
  const out = { attempted: ids.length, published: 0, failed: 0, skipped: 0, errors: [] };
  if (!ids.length) return out;
  // Publish the stored DB row (it carries payments/notes), not the raw scrape.
  const stored = await load(ids);
  const queue = stored.filter((r) => needsGuestPage(r, today));
  out.skipped = ids.length - queue.length;
  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      const row = queue[i++];
      try {
        await publish(row);
        out.published += 1;
      } catch (err) {
        out.failed += 1;
        out.errors.push({ id: row.id, error: String(err?.message || err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return out;
}
