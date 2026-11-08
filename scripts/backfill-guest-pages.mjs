#!/usr/bin/env node
/**
 * One-off: publish guest pages for upcoming bookings missing on the checkout mailbox.
 * Dry run by default; pass --apply to publish. Idempotent, no SMS, no charges.
 * Run on the Studio (needs the server env): node scripts/backfill-guest-pages.mjs [--apply]
 */
import { rest } from '../server/guestComms.js';
import { fetchMailboxBooking } from '../server/checkoutMailbox.js';
import { autoPublishGuestPages, needsGuestPage } from '../server/autoPublishGuestPages.js';

const apply = process.argv.includes('--apply');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const rows = await rest(`hotelos_bookings?check_out_date=gte.${today}&deleted_at=is.null&select=*&limit=5000`);
const candidates = (rows || []).filter((r) => needsGuestPage(r, today));
const missing = [];
for (const row of candidates) {
  const page = await fetchMailboxBooking(row.checkout_token).catch(() => 'error');
  if (!page) missing.push(row);
}
console.log(`upcoming=${rows.length} eligible=${candidates.length} missing_page=${missing.length}`);
for (const r of missing) console.log(`  ${r.id} ${r.unit_id} ${r.check_in_date}`);
if (!apply) { console.log('dry run — pass --apply to publish'); process.exit(0); }
const res = await autoPublishGuestPages(missing, { today, load: async () => missing });
console.log(JSON.stringify({ published: res.published, failed: res.failed, errors: res.errors }, null, 2));
