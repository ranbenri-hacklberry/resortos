import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';

// Ran 2026-10-22: wrong-room QR never leaks the assigned room or a lockbox code. Mocked data only.
const MANAGER = '972500000001';
const ADAM = '972500000002';
const GUEST = '972500000099';
function mk() {
  const sent: [string, string][] = [];
  const deps = {
    send: vi.fn(async (j: string, t: string) => void sent.push([j, t])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(async () => ({ action: 'UNKNOWN' })), translateTask: vi.fn(async (t: string) => t) },
    resortos: {
      markRoomReady: vi.fn(), reportMaintenance: vi.fn(), reportSupplies: vi.fn(), updateUnitStatus: vi.fn(),
      listUnits: vi.fn(async () => [{ id: 'tz1', operational_status: 'READY' }, { id: 'tz2', operational_status: 'READY' }]),
      listBookings: vi.fn(async () => [{ id: 'bk-t', unit_id: 'tz1', guest_name: 'אורח בדיקה', guest_phone: '050-0000099',
        check_in_date: '2020-01-01', check_out_date: '2099-01-01', booking_status: 'CONFIRMED', checkout_token: 'tok_t' }]),
    },
    cleaners: () => [
      { phone: MANAGER, name: 'מנהל', role: 'MANAGER', language: 'he' },
      { phone: ADAM, name: 'אדם', role: 'MANAGER', language: 'he', noAlerts: true },
    ],
    rooms: () => [
      { id: 'tz1', name: 'בדיקה 1', property: 'מתחם בדיקה', letterCode: 'Z1', lockbox: '4321#', aliases: ['z1'] },
      { id: 'tz2', name: 'בדיקה 2', property: 'מתחם בדיקה', letterCode: 'Z2', lockbox: '8765#', aliases: ['z2'] },
    ],
    log: { info() {}, warn() {}, error() {} },
  } as any as PipelineDeps;
  const p = createPipeline(deps);
  const scan = (t: string) => p.handleInbound({ key: { remoteJid: `${GUEST}@s.whatsapp.net`, fromMe: false }, message: { conversation: t } } as any);
  return { sent, scan };
}

describe('wrong-room QR (flag-off live path)', () => {
  it('guest gets no room name, no code, no stay link', async () => {
    const { sent, scan } = mk();
    await scan('START_Z2');
    const g = sent.filter(([j]) => j.startsWith(GUEST)).map(([, t]) => t).join('\n');
    expect(g).toContain('לא תואם להזמנה');
    expect(g).not.toMatch(/4321|8765|בדיקה 1|tok_t/);
  });
  it('managers are notified without codes; Adam (noAlerts) gets nothing; deduped on repeat scans', async () => {
    const { sent, scan } = mk();
    await scan('START_Z2');
    await scan('START_Z2');
    const staff = sent.filter(([j]) => !j.startsWith(GUEST));
    expect(staff.filter(([j]) => j.startsWith(MANAGER))).toHaveLength(1);
    expect(staff.some(([j]) => j.startsWith(ADAM))).toBe(false);
    expect(staff.map(([, t]) => t).join('\n')).not.toMatch(/4321|8765/);
  });
  it('correct-room scan is unchanged (code delivered when READY)', async () => {
    const { sent, scan } = mk();
    await scan('START_Z1');
    const g = sent.filter(([j]) => j.startsWith(GUEST)).map(([, t]) => t).join('\n');
    expect(g).toContain('4321#');
  });
});
