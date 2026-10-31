import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPipeline, type PipelineDeps } from '../pipeline.js';
import type { CleanerProfile, RoomEntry } from '../config.js';
import { handleManagerWifi, isManagerWifiQuestion, resolveWifiComplex, clearWifiPending, WIFI_PENDING_TTL_MS } from './managerWifi.js';
import { formatManagerInitialCard, getRoomOccupancy, formatRoomWifi, roomMenuPick } from './managerQuestions.js';

const manager: CleanerProfile = { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' };
const guestWorker: CleanerProfile = { phone: '66812345678', name: 'Somchai', language: 'th' };
const rooms: RoomEntry[] = [
  { id: 'k690', name: 'חצר מוזיקלית 1', property: 'חצר מוזיקלית', letterCode: 'D1', lockbox: '4321', aliases: ['d1'] } as any,
];
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const booking = { id: 'b1', unit_id: 'k690', guest_name: 'עמית מלכה', guest_phone: '972501234008', check_in_date: today, check_out_date: '2099-01-01', adults_count: 2, children_count: 1 } as any;

function makeDeps(): PipelineDeps & { sent: Array<[string, string]> } {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    send: vi.fn(async (jid, text) => void sent.push([jid, text])),
    isAudio: (m) => !!m.message?.audioMessage,
    extractText: (m) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: '', language: 'he', duration_ms: 1 })),
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      startCleaning: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
      listUnits: vi.fn(async () => [{ id: 'k690', operational_status: 'READY', staff_occupancy: 'OCCUPIED' }]),
      listBookings: vi.fn(async () => [booking]),
    } as any,
    cleaners: () => [manager, guestWorker],
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
  };
  return Object.assign(deps, { sent });
}
const say = (p: any, from: string, text: string) =>
  p.handleInbound({ key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } } as any);

beforeEach(() => clearWifiPending());

describe('manager WiFi question (Ran 2026-10-22)', () => {
  it('recognises loose Hebrew / English / Thai phrasing', () => {
    for (const q of ['מה הוויפי', 'סיסמה לרשת', 'wifi של טאג׳ מאהל', 'what is the wifi', 'รหัสไวไฟ', 'וויפי?']) {
      expect(isManagerWifiQuestion(q), q).toBe(true);
    }
    for (const q of ['מה הקוד כספת של תזמורת 1?', 'מי נכנס לבתי נורית בסופ״ש', 'D1']) {
      expect(isManagerWifiQuestion(q), q).toBe(false);
    }
  });

  it('resolves names and codes', () => {
    expect(resolveWifiComplex('wifi של טאג׳ מאהל')?.key).toBe('taj');
    expect(resolveWifiComplex('ויפי E/25')?.key).toBe('taj');
    expect(resolveWifiComplex('wifi D1')?.key).toBe('musical');
    expect(resolveWifiComplex('e', { followUp: true })?.key).toBe('taj');
    expect(resolveWifiComplex('23', { followUp: true })?.key).toBe('nurit');
  });

  it('named complex -> SSID + password', () => {
    const r = handleManagerWifi('m', 'מה הוויפי בבתי נורית')!;
    expect(r).toContain('MIALEES RESORT');
    expect(r).toContain('Mial2026');
  });

  it('unnamed -> asks which complex, follow-up answers, then clears', () => {
    const ask = handleManagerWifi('m', 'מה הוויפי')!;
    expect(ask).toContain('איזה מתחם');
    expect(ask).toContain('E/25 טאג׳ מאהל');
    expect(ask).not.toMatch(/סייסטה|Siesta/i);
    const ans = handleManagerWifi('m', 'טאג׳ מאהל')!;
    expect(ans).toContain('LUTUS');
    expect(handleManagerWifi('m', 'E')).toBeNull();
  });

  it('pending intent expires after 10 minutes and is per manager', () => {
    const t0 = 1_000_000;
    handleManagerWifi('m1', 'מה הוויפי', t0);
    expect(handleManagerWifi('m2', 'E', t0 + 1000)).toBeNull();
    expect(handleManagerWifi('m1', 'E', t0 + WIFI_PENDING_TTL_MS + 1)).toBeNull();
  });

  it('pipeline: manager unnamed then "E" (no WhatsApp, local simulation)', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await say(p, manager.phone, 'מה הוויפי');
    expect(deps.sent.at(-1)![1]).toContain('איזה מתחם');
    await say(p, manager.phone, 'E');
    expect(deps.sent.at(-1)![1]).toContain('LUTUS');
  });

  it('pipeline: a non-manager never gets the manager WiFi flow', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await say(p, guestWorker.phone, 'מה הוויפי').catch(() => null);
    expect(deps.sent.map((s) => s[1]).join('\n')).not.toContain('איזה מתחם הוויפי');
  });
});

describe('room card options 5/6 (Ran 2026-10-22)', () => {
  it('card body is unchanged: no guest phone or WiFi inside it', () => {
    const occ = getRoomOccupancy('k690', [booking], today);
    const card = formatManagerInitialCard('חצר מוזיקלית 1', '4321', { id: 'k690', staff_occupancy: 'OCCUPIED' } as any, occ, rooms[0]);
    expect(card).not.toContain('Music yard');
    expect(card).not.toContain('0501234008');
  });

  it('menu picks', () => {
    expect(roomMenuPick('5')).toBe('guest');
    expect(roomMenuPick('6')).toBe('wifi');
    expect(roomMenuPick('וויפי')).toBe('wifi');
    expect(roomMenuPick('פרטי רשת')).toBe('wifi');
    expect(roomMenuPick('הוסף הערה')).toBeNull();
    expect(formatRoomWifi('X', 'unknown-unit')).toContain('אין אצלי');
  });

  it('pipeline: card shows options 5/6; 6 -> WiFi only; 5 / "פרטי לקוח" -> guest only', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await say(p, manager.phone, 'D1');
    const card = deps.sent.at(-1)![1];
    expect(card).toContain('5 - פרטי לקוח');
    expect(card).toContain('6 - פרטי רשת WiFi');
    expect(card).not.toContain('Music yard');
    await say(p, manager.phone, '6');
    const wifi = deps.sent.at(-1)![1];
    expect(wifi).toContain('Music yard');
    expect(wifi).not.toContain('עמית');
    await say(p, manager.phone, '5');
    const g = deps.sent.at(-1)![1];
    expect(g).toContain('עמית מלכה');
    expect(g).not.toContain('Music yard');
    await say(p, manager.phone, 'וויפי');
    expect(deps.sent.at(-1)![1]).toContain('Music yard');
  });
});
