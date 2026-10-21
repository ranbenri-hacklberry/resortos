import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import type { CleanerProfile, RoomEntry } from './config.js';
import realRooms from '../data/rooms.json' with { type: 'json' };
import { alertRecipients, alertRoomLabel, createAlertMemory, displaySender, isWhatIsThis, SCAN_ALERT_COOLDOWN_MS } from './manager/scanAlert.js';
import { resolveStaffPhone } from './whatsapp/client.js';

const realCleaners: CleanerProfile[] = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'cleaners.json'), 'utf8'));
const ADAM = '972543387383';

function makeDeps(over: Partial<PipelineDeps> = {}) {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    send: vi.fn(async (jid: string, text: string) => void sent.push([jid, text])),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn(),
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      startCleaning: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
      listBookings: vi.fn(async () => []),
    } as any,
    cleaners: () => realCleaners,
    rooms: () => realRooms as RoomEntry[],
    log: { info() {}, warn() {}, error() {} },
    ...over,
  } as any;
  return Object.assign(deps, { sent });
}
const msg = (jid: string, text: string) => ({ key: { remoteJid: jid, fromMe: false, id: Math.random().toString(36) }, message: { conversation: text } }) as any;

describe('unknown-scan alert fixes (Ran 2026-10-21)', () => {
  it('fix 1: room label is not doubled', () => {
    expect(alertRoomLabel({ name: 'בקתות מאיה · בקתה 3' } as any)).toBe('בקתות מאיה · בקתה 3');
    expect(alertRoomLabel({ name: 'F3' } as any)).toBe('בקתה F3');
    expect(alertRoomLabel(null)).toBe('היחידה');
  });
  it('fix 2: never shows a raw @lid', () => {
    expect(displaySender('999999999999@lid')).toBe('מספר לא מזוהה');
    expect(displaySender('999999999999@lid', '972501112233')).toBe('0501112233');
    expect(displaySender('274762009972934@lid')).toBe('0533932462');
    expect(displaySender('972501112233@s.whatsapp.net')).toBe('0501112233');
  });
  it('fix 3: Costa LID maps to his phone in the LID map and cleaners.json', () => {
    expect(resolveStaffPhone('274762009972934@lid')).toBe('972533932462');
    expect(realCleaners.find((c) => c.name === 'קוסטה')?.lid).toBe('274762009972934');
  });
  it('fix 3: Costa scanning START_F3 from his @lid gets the staff flow, no unknown alert', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('274762009972934@lid', 'START_F3'));
    expect(deps.sent.some(([, t]) => t.includes('מספר לא מזוהה'))).toBe(false);
    expect(deps.sent.some(([, t]) => t.includes('אפשר שם מלא ותאריכי הגעה'))).toBe(false);
    expect(deps.sent[0]?.[1]).toContain("אפשרויות לחדר"); // staff room card
  });
  it('fix 4+5 + אדם opt-out: one alert per scanner per 10 min, no @lid, not to אדם, "מה זה" explains it', async () => {
    const deps = makeDeps();
    const p = createPipeline(deps);
    await p.handleInbound(msg('111122223333444@lid', 'START_F3'));
    const alerts = deps.sent.filter(([, t]) => t.includes('סריקה ממספר לא מזוהה'));
    const expected = alertRecipients(realCleaners).length;
    expect(expected).toBeGreaterThan(0);
    expect(alerts.length).toBe(expected);
    expect(alerts.some(([j]) => j.startsWith(ADAM))).toBe(false);
    for (const [, t] of alerts) { expect(t).not.toContain('@lid'); expect(t).not.toMatch(/בבקתה בקתות/); }
    deps.sent.length = 0;
    await p.handleInbound(msg('111122223333444@lid', 'START_F3'));
    expect(deps.sent.filter(([, t]) => t.includes('סריקה ממספר לא מזוהה')).length).toBe(0);
    const mgr = alertRecipients(realCleaners)[0];
    deps.sent.length = 0;
    await p.handleInbound(msg(`${mgr.phone}@s.whatsapp.net`, 'מה זה'));
    expect(deps.sent[0]?.[1]).toContain('זו התראה ששלחתי');
  });
  it('cooldown and memory expire', () => {
    let t = 0; const m = createAlertMemory(() => t);
    expect(m.shouldAlert('a')).toBe(true); expect(m.shouldAlert('a')).toBe(false);
    t += SCAN_ALERT_COOLDOWN_MS + 1; expect(m.shouldAlert('a')).toBe(true);
    m.remember('x', 'A'); expect(m.recent('x')).toBe('A'); t += 16 * 60 * 1000; expect(m.recent('x')).toBeNull();
    expect(isWhatIsThis('מה זה?')).toBe(true); expect(isWhatIsThis('?')).toBe(true); expect(isWhatIsThis('מה זה המחיר')).toBe(false);
  });
  it('אדם is opted out of automatic alerts via config but stays MANAGER', () => {
    const adam = realCleaners.find((c) => c.phone === ADAM)!;
    expect(adam.role).toBe('MANAGER');
    expect(adam.noAlerts).toBe(true);
    expect(alertRecipients(realCleaners).some((c) => c.phone === ADAM)).toBe(false);
  });
});
