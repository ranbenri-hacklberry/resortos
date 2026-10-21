/**
 * Manager-only explicit room hold ("תפיסת חדר / לא זמין").
 *
 * Flow: manager names a room -> preview -> explicit "אשר סגירה" (or "בטל סגירה"),
 * pending expires after 15 minutes, bare "כן" does nothing.
 * The write reuses the SAME server path as the office board / existing night hold:
 * POST /api/ops/units/:id/hold -> server/kinorotHold.js (one night, today -> tomorrow).
 * After the write we re-read bookings (Kinorot calendar sync) to verify the hold.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RoomEntry } from '../config.js';
import type { BookingRow } from '../integration/resortos.js';
import { resolveRoomByAlias } from '../llm/client.js';

export const HOLD_CONFIRM_WORD = 'אשר סגירה';
export const HOLD_CANCEL_WORD = 'בטל סגירה';
const PENDING_TTL_MS = 15 * 60 * 1000;

/** Complex code letters (A/29 ... G/23) -> Hebrew complex name. */
export const COMPLEX_CODES: Record<string, string> = {
  A: 'מול הנוף', B: 'נופים בלבן', C: 'טוסקנה', D: 'החצר המוסיקלית', E: 'טאג׳ מאהל', F: 'מאיה', G: 'בתי נורית',
};
const COMPLEX_NUM: Record<string, string> = { A: '29', B: '28', C: '27', D: '26', E: '25', F: '24', G: '23' };

const TRIGGER = /(?:^|\s)(?:תסגר(?:י|ו)?|לסגור|סגרי|תפסי|תתפסי|לתפוס|תפוס\s+את|לא\s+זמין|חסמי|תחסמי|לחסום)(?=\s|$|[.,!])/;

export type HoldDate = { kind: 'today' } | { kind: 'other'; label: string };

export interface PendingHold { roomId: string; date: string; at: number; by: string; source: string }

export interface RoomHoldDeps {
  rooms: () => RoomEntry[];
  today: () => string;
  listBookings?: (p?: { from?: string; to?: string }) => Promise<BookingRow[]>;
  holdNight?: (p: { unitId: string; reportedBy: string }) => Promise<{ ok: true; verified: boolean; resId?: string; checkIn?: string; checkOut?: string } | { ok: false; skipped: string }>;
  audit: (entry: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
}

const pending = new Map<string, PendingHold>();
export function _clearPendingHolds() { pending.clear(); }

export function fileAudit(path: string) {
  return (entry: Record<string, unknown>) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
    } catch { /* audit must never break the chat */ }
  };
}

export function isHoldRequest(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw || /[?？]/.test(raw)) return false;
  return TRIGGER.test(raw);
}

export function parseHoldDate(text: string): HoldDate {
  const t = String(text || '');
  if (/מחרתיים/.test(t)) return { kind: 'other', label: 'מחרתיים' };
  if (/מחר/.test(t)) return { kind: 'other', label: 'מחר' };
  const d = t.match(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/);
  if (d) return { kind: 'other', label: d[0] };
  return { kind: 'today' };
}

/** Resolve "נורית 3", "בתי נורית 3", "G/23 3", "G3", "מול הנוף 2". */
export function resolveHoldRoom(text: string, rooms: RoomEntry[]): string | null {
  let t = ` ${String(text || '')} `;
  t = t.replace(/([\u24B6-\u24BC])\s*\d{2}\s*(?:חדר|בקתה|יחידה)?\s*(\d)(?!\d)/g, (_m, c, n) => ` ${String.fromCharCode(c.charCodeAt(0) - 0x24B6 + 65)}${n} `);
  // complex code like G/23 3 or G 3 -> "G3"
  t = t.replace(/\b([A-Ga-g])\s*\/\s*\d{2}\s*(?:חדר|בקתה|יחידה)?\s*(\d)\b/g, (_m, l, n) => ` ${l.toUpperCase()}${n} `);
  const code = t.match(/\b([A-Ga-g])\s*(\d)\b/);
  if (code) {
    const id = resolveRoomByAlias(`${code[1].toUpperCase()}${code[2]}`, rooms);
    if (id) return id;
  }
  // Hebrew: longest alias contained in the text
  const clean = t.replace(/[.,!׳']/g, ' ').replace(/\s+/g, ' ');
  let best: { id: string; len: number } | null = null;
  for (const r of rooms) {
    for (const a of [...(r.aliases || []), r.name || '']) {
      const al = String(a || '').replace(/[.,!·׳']/g, ' ').replace(/\s+/g, ' ').trim();
      if (al.length < 3 || !/\d/.test(al)) continue;
      const re = new RegExp(`(?:^|\\s)${al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`);
      if (re.test(clean) && (!best || al.length > best.len)) best = { id: r.id, len: al.length };
    }
  }
  if (best) return best.id;
  // property + number ("נורית 3", "מול הנוף 2")
  for (const r of rooms) {
    const prop = String(r.property || '').trim();
    if (!prop) continue;
    const short = prop.replace(/^בתי\s+/, '');
    const m = clean.match(new RegExp(`(?:${prop}|${short})\\s*(?:חדר|בקתה|יחידה)?\\s*(\\d)`));
    if (m) {
      const same = rooms.filter((x) => String(x.property || '').trim() === prop);
      const hit = same.find((x) => new RegExp(`(?:^|\\D)${m[1]}$`).test(String(x.letterCode || x.name || '')));
      if (hit) return hit.id;
    }
  }
  return null;
}

export function roomLabel(roomId: string, rooms: RoomEntry[]): string {
  const r = rooms.find((x) => x.id === roomId);
  const letter = String(r?.letterCode || '').toUpperCase().charAt(0);
  const code = letter && COMPLEX_NUM[letter] ? ` (${letter}/${COMPLEX_NUM[letter]})` : '';
  return `${r?.name || roomId}${code}`;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function activeOn(b: BookingRow, night: string) {
  const cin = String(b.check_in_date || '').slice(0, 10);
  const cout = String(b.check_out_date || '').slice(0, 10);
  return !b.deleted_at && b.booking_status !== 'CANCELED' && cin <= night && night < cout;
}

export function previewText(label: string, date: string): string {
  return `🔒 סגירת חדר (לא זמין)\n*${label}*\nלילה אחד: ${date} → ${nextDay(date)}\nתיפתח הזמנה "לא זמין" ביומן כינורות (אותו מסלול כמו בפריוריטי).\nלאישור כתוב *${HOLD_CONFIRM_WORD}*, לביטול *${HOLD_CANCEL_WORD}*. הבקשה תפוג בעוד 15 דקות.`;
}

/**
 * Returns a reply when the message belongs to this flow, null otherwise.
 * Caller must only call it for managers.
 */
export async function handleManagerRoomHold(text: string, key: string, by: string, deps: RoomHoldDeps, now = Date.now()): Promise<string | null> {
  const raw = String(text || '').trim();
  const rooms = deps.rooms();
  const p = pending.get(key);
  if (p && now - p.at > PENDING_TTL_MS) {
    pending.delete(key);
    deps.audit({ event: 'expired', key, by, roomId: p.roomId, date: p.date });
  }
  const live = pending.get(key);

  if (raw === HOLD_CANCEL_WORD || raw.startsWith(HOLD_CANCEL_WORD)) {
    deps.audit({ event: 'cancel', key, by, message: raw, roomId: live?.roomId });
    if (!live) return 'אין סגירת חדר שממתינה לאישור.';
    pending.delete(key);
    return `בוטל. *${roomLabel(live.roomId, rooms)}* לא נסגר.`;
  }

  if (raw === HOLD_CONFIRM_WORD || raw.startsWith(HOLD_CONFIRM_WORD)) {
    deps.audit({ event: 'confirm', key, by, message: raw, roomId: live?.roomId, date: live?.date });
    if (!live) return 'אין סגירת חדר שממתינה לאישור (או שעברו 15 דקות). שלח שוב את הבקשה.';
    pending.delete(key);
    const label = roomLabel(live.roomId, rooms);
    if (live.date !== deps.today()) {
      deps.audit({ event: 'result', ok: false, reason: 'date_changed', roomId: live.roomId, date: live.date });
      return `התאריך התחלף מאז הבקשה. *${label}* לא נסגר, שלח שוב.`;
    }
    if (!deps.holdNight) {
      deps.audit({ event: 'result', ok: false, reason: 'no_hold_api', roomId: live.roomId });
      return `הסגירה לא זמינה כרגע. *${label}* לא נסגר.`;
    }
    // availability re-check right before the write
    const before = deps.listBookings ? await deps.listBookings({ from: live.date, to: live.date }) : [];
    const busy = before.find((b) => b.unit_id === live.roomId && activeOn(b, live.date));
    if (busy) {
      deps.audit({ event: 'result', ok: false, reason: 'occupied', roomId: live.roomId, bookingId: busy.id });
      return `*${label}* תפוס בלילה הזה (${busy.guest_name || 'הזמנה קיימת'}). לא סגרתי.`;
    }
    try {
      const res = await deps.holdNight({ unitId: live.roomId, reportedBy: by });
      if (!res.ok) {
        deps.audit({ event: 'result', ok: false, reason: res.skipped, roomId: live.roomId });
        return res.skipped === 'in_progress' ? `הסגירה של *${label}* כבר בתהליך.` : `לא סגרתי את *${label}* (${res.skipped}).`;
      }
      const resId = res.resId || '';
      let seen: BookingRow | undefined;
      for (let i = 0; i < 3 && !seen && deps.listBookings; i++) {
        if (i > 0 && deps.sleep) await deps.sleep(5000);
        const after = await deps.listBookings({ from: live.date, to: live.date });
        seen = after.find((b) => b.unit_id === live.roomId && activeOn(b, live.date)
          && (resId ? String(b.id).endsWith(`_${resId}`) : true));
      }
      const verified = Boolean(seen) || res.verified;
      deps.audit({ event: 'result', ok: true, verified, chloeSeen: Boolean(seen), serverVerified: res.verified, resId, roomId: live.roomId, date: live.date, bookingId: seen?.id });
      return verified
        ? `✅ *${label}* סגור (לא זמין) ללילה ${live.date} ביומן כינורות.\nמספר הזמנה בכינורות: ${resId || 'לא הוחזר'}`
        : `⚠️ כינורות שמר הזמנה${resId ? ` ${resId}` : ''} ל*${label}*, אבל עדיין לא ראיתי אותה ביומן. כדאי לבדוק בכינורות.`;
    } catch (err) {
      const msg = String((err as Error)?.message || err).slice(0, 200);
      deps.audit({ event: 'result', ok: false, reason: 'error', error: msg, roomId: live.roomId });
      const known = /כינורות|תפוס|לא מחובר|לא הגיב/.test(msg) ? `${msg}. ` : '';
      return `❌ ${known}*${label}* לא נסגר.`;
    }
  }

  if (!isHoldRequest(raw)) return null;
  const roomId = resolveHoldRoom(raw, rooms);
  if (!roomId) return null; // let the existing in-room flow handle bare "לא זמין"
  deps.audit({ event: 'request', key, by, message: raw, roomId });
  const when = parseHoldDate(raw);
  const label = roomLabel(roomId, rooms);
  if (when.kind === 'other') {
    deps.audit({ event: 'rejected', reason: 'date_not_supported', roomId, date: when.label });
    return `כרגע אפשר לסגור רק ללילה של היום (כמו בפריוריטי). ${when.label} עדיין לא נתמך, *${label}* לא נסגר.`;
  }
  const date = deps.today();
  const bookings = deps.listBookings ? await deps.listBookings({ from: date, to: date }) : [];
  const busy = bookings.find((b) => b.unit_id === roomId && activeOn(b, date));
  if (busy) {
    deps.audit({ event: 'rejected', reason: 'occupied', roomId, bookingId: busy.id });
    return `*${label}* כבר תפוס הלילה (${busy.guest_name || 'הזמנה קיימת'}). לא אפשר לסגור.`;
  }
  pending.set(key, { roomId, date, at: now, by, source: raw });
  return previewText(label, date);
}
