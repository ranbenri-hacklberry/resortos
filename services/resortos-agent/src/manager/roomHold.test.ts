import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { RoomEntry } from '../config.js';
import { _clearPendingHolds, handleManagerRoomHold, isHoldRequest, parseHoldDate, resolveHoldRoom, type RoomHoldDeps } from './roomHold.js';

const raw = JSON.parse(readFileSync(new URL('../../data/rooms.json', import.meta.url), 'utf8'));
const rooms: RoomEntry[] = Array.isArray(raw) ? raw : raw.rooms;
const TODAY = '2026-10-21';

function mkDeps(over: Partial<RoomHoldDeps> = {}) {
  const audit = vi.fn();
  const bookings: any[] = [];
  const deps: RoomHoldDeps = {
    rooms: () => rooms,
    today: () => TODAY,
    listBookings: vi.fn(async () => bookings),
    holdNight: vi.fn(async () => {
      bookings.push({ id: 'kin_999_80001', unit_id: 'k674', guest_name: 'לא זמין', check_in_date: TODAY, check_out_date: '2026-10-22' });
      return { ok: true as const, verified: true, resId: '80001' };
    }),
    audit,
    ...over,
  };
  return { deps, audit, bookings };
}

describe('room hold parsing', () => {
  it('detects explicit close requests and ignores questions', () => {
    expect(isHoldRequest('תסגרי את נורית 3 להיום')).toBe(true);
    expect(isHoldRequest('לא זמין מול הנוף 2 מחר')).toBe(true);
    expect(isHoldRequest('למה נורית 3 לא זמין?')).toBe(false);
    expect(isHoldRequest('נורית 3 מוכן')).toBe(false);
  });
  it('resolves rooms by name and complex code', () => {
    expect(resolveHoldRoom('תסגרי את נורית 3 להיום', rooms)).toBe('k674');
    expect(resolveHoldRoom('לא זמין מול הנוף 2', rooms)).toBe('k681');
    expect(resolveHoldRoom('תסגרי G/23 3', rooms)).toBe('k674');
    expect(resolveHoldRoom('תסגרי Ⓐ29 5', rooms)).toBe('k684');
    expect(resolveHoldRoom('תסגרי A5', rooms)).toBe('k684');
    expect(resolveHoldRoom('תסגרי את החדר', rooms)).toBeNull();
  });
  it('defaults to today and flags other dates', () => {
    expect(parseHoldDate('תסגרי נורית 3')).toEqual({ kind: 'today' });
    expect(parseHoldDate('תסגרי נורית 3 מחר').kind).toBe('other');
    expect(parseHoldDate('תסגרי נורית 3 ב-25/10').kind).toBe('other');
  });
});

describe('room hold flow', () => {
  beforeEach(() => _clearPendingHolds());

  it('previews, needs the explicit word, writes via holdNight and verifies', async () => {
    const { deps, audit } = mkDeps();
    const preview = await handleManagerRoomHold('תסגרי את נורית 3 להיום', 'm1', 'רן', deps);
    expect(preview).toContain('אשר סגירה');
    expect(preview).toContain('G/23');
    expect(deps.holdNight).not.toHaveBeenCalled();
    expect(await handleManagerRoomHold('כן', 'm1', 'רן', deps)).toBeNull();
    expect(deps.holdNight).not.toHaveBeenCalled();
    const done = await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps);
    expect(deps.holdNight).toHaveBeenCalledWith({ unitId: 'k674', reportedBy: 'רן' });
    expect(done).toContain('✅');
    expect(done).toContain('80001');
    const events = audit.mock.calls.map((c) => c[0].event);
    expect(events).toEqual(['request', 'confirm', 'result']);
    expect(audit.mock.calls[0][0].message).toBe('תסגרי את נורית 3 להיום');
  });

  it('cancel word drops the pending hold', async () => {
    const { deps } = mkDeps();
    await handleManagerRoomHold('תסגרי את נורית 3', 'm1', 'רן', deps);
    expect(await handleManagerRoomHold('בטל סגירה', 'm1', 'רן', deps)).toContain('בוטל');
    expect(await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps)).toContain('אין סגירת חדר');
    expect(deps.holdNight).not.toHaveBeenCalled();
  });

  it('expires after 15 minutes', async () => {
    const { deps } = mkDeps();
    const t0 = 1_000_000;
    await handleManagerRoomHold('תסגרי את נורית 3', 'm1', 'רן', deps, t0);
    expect(await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps, t0 + 16 * 60 * 1000)).toContain('אין סגירת חדר');
    expect(deps.holdNight).not.toHaveBeenCalled();
  });

  it('refuses an occupied room', async () => {
    const { deps, bookings } = mkDeps();
    bookings.push({ id: 'b1', unit_id: 'k674', guest_name: 'אורח', check_in_date: '2026-10-20', check_out_date: '2026-10-23' });
    expect(await handleManagerRoomHold('תסגרי את נורית 3', 'm1', 'רן', deps)).toContain('תפוס');
    expect(await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps)).toContain('אין סגירת חדר');
    expect(deps.holdNight).not.toHaveBeenCalled();
  });

  it('does not write for a future date', async () => {
    const { deps } = mkDeps();
    expect(await handleManagerRoomHold('לא זמין מול הנוף 2 מחר', 'm1', 'רן', deps)).toContain('לא נסגר');
    expect(await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps)).toContain('אין סגירת חדר');
  });

  it('reports a Kinorot failure clearly', async () => {
    const { deps, audit } = mkDeps({ holdNight: vi.fn(async () => { throw new Error('הלילה הזה כבר תפוס בכינורות'); }) });
    await handleManagerRoomHold('תסגרי את נורית 3', 'm1', 'רן', deps);
    const out = await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps);
    expect(out).toContain('❌');
    expect(out).toContain('לא נסגר');
    expect(audit.mock.calls.at(-1)![0]).toMatchObject({ event: 'result', ok: false });
  });

  it('warns when the hold is not visible in the calendar', async () => {
    const { deps } = mkDeps({ holdNight: vi.fn(async () => ({ ok: true as const, verified: false, resId: '80002' })) });
    await handleManagerRoomHold('תסגרי את נורית 3', 'm1', 'רן', deps);
    const out = await handleManagerRoomHold('אשר סגירה', 'm1', 'רן', deps);
    expect(out).toContain('⚠️');
    expect(out).toContain('80002');
  });

  it('ignores unrelated text and bare "לא זמין" without a room', async () => {
    const { deps } = mkDeps();
    expect(await handleManagerRoomHold('מה המצב?', 'm1', 'רן', deps)).toBeNull();
    expect(await handleManagerRoomHold('לא זמין', 'm1', 'רן', deps)).toBeNull();
  });
});
