/**
 * Guest ID scan results per booking (Ran 2026-10-24). Stores ONLY decision + name + reasons + timestamps.
 * Never the image, never the ID number. Local JSON under DATA_DIR.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import type { IdScanResult } from './grokIdScan.js';

export interface GuestIdRecord { decision?: string; name?: string | null; reasons?: string[]; scanned_at?: string; asked_at?: string }
const file = () => path.join(process.env.GUEST_ID_STORE_DIR || config.dataDir, 'guest-id-scans.json');
const read = (): Record<string, GuestIdRecord> => { try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}; } catch { return {}; } };
function write(all: Record<string, GuestIdRecord>) {
  mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(tmp, file());
}
export const guestIdEnabled = () => process.env.CHLOE_GUEST_ID_SCAN === '1';
export function getGuestId(bookingId: string): GuestIdRecord | null { return read()[bookingId] || null; }
/** True when the booking already has an ID on file (accepted or waiting for manual review). */
export function hasGuestId(bookingId: string, booking?: { stay?: { id_photo_received_at?: string } } | null): boolean {
  if (booking?.stay?.id_photo_received_at) return true;
  const r = getGuestId(bookingId);
  return Boolean(r?.decision && r.decision !== 'reject');
}
export function saveGuestIdScan(bookingId: string, r: IdScanResult) {
  const all = read();
  const ex = r.extraction;
  const name = ex ? [ex.first_name || ex.first_name_en, ex.last_name || ex.last_name_en].filter(Boolean).join(' ') || null : null;
  all[bookingId] = { ...all[bookingId], decision: r.decision, name, reasons: r.reasons.slice(0, 8), scanned_at: new Date().toISOString() };
  write(all);
}
/** Ask at most once per 12h per booking. Returns true if we should ask now (and records it). */
export function shouldAskForId(bookingId: string, now = Date.now()): boolean {
  const all = read();
  const last = Date.parse(all[bookingId]?.asked_at || '') || 0;
  if (now - last < 12 * 3600_000) return false;
  all[bookingId] = { ...all[bookingId], asked_at: new Date(now).toISOString() };
  write(all);
  return true;
}
export const ID_REQUEST_TEXT = '📸 כדי להשלים את הצ׳ק־אין, נשמח שתצלמו כאן את תעודת הזהות (או דרכון) של המזמין/ה ותשלחו בהודעה. התמונה לא נשמרת אצלנו — נשמרים רק השם ואישור הבדיקה.';
export function idReplyFor(r: IdScanResult): string {
  if (r.decision === 'accept') return '✅ תודה! התעודה התקבלה ואומתה מול ההזמנה.';
  if (r.decision === 'reject' && r.checks.is_official === false && r.extraction) return '🙏 נראה שזו לא תעודה מזהה. אפשר לשלוח צילום של תעודת זהות, רישיון נהיגה או דרכון?';
  if (!r.ok) return '🙏 תודה! לא הצלחנו לקרוא את התמונה כרגע — הצוות יבדוק אותה. אם אפשר, שלחו שוב צילום ברור, בלי השתקפויות.';
  return '🙏 תודה! קיבלנו את התעודה, הצוות יעבור עליה ויאשר.';
}
