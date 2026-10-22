import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisconnectReason, type WAMessage } from '@whiskeysockets/baileys';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { OllamaClient, normalizeIntent } from './llm/client.js';
import { ResortOSClient, ResortOSError, AWAITING_INSPECTION_REASON } from './integration/resortos.js';
import { decideReconnect } from './whatsapp/monitor.js';
import type { CleanerProfile, RoomEntry } from './config.js';
import realRooms from '../data/rooms.json' with { type: 'json' };

const cleaners: CleanerProfile[] = [
  { phone: '66812345678', name: 'Somchai', language: 'th' },
  { phone: '962791234567', name: 'Khaled', language: 'ar' },
];
const rooms: RoomEntry[] = [
  { id: 'k680', name: 'מול הנוף · בקתה 1', aliases: ['מול הנוף 1', 'มูล 1'] },
  { id: 'k681', name: 'מול הנוף · בקתה 2', aliases: ['מול הנוף 2', 'มูล 2'] },
];

function makeDeps(over: Partial<PipelineDeps> = {}): PipelineDeps & { sent: Array<[string, string]> } {
  const sent: Array<[string, string]> = [];
  const deps: PipelineDeps = {
    send: vi.fn(async (jid, text) => void sent.push([jid, text])),
    isAudio: (m) => !!m.message?.audioMessage,
    extractText: (m) => m.message?.conversation ?? null,
    transcribe: vi.fn(async () => ({ text: 'ทำความสะอาด มูล 1 เสร็จแล้วค่ะ', language: 'th', duration_ms: 310 })),
    llm: { extractIntent: vi.fn(), translateTask: vi.fn() },
    resortos: {
      markRoomReady: vi.fn(async () => ({ ok: true as const })),
      startCleaning: vi.fn(async () => ({ ok: true as const })),
      reportMaintenance: vi.fn(async () => ({})),
      reportSupplies: vi.fn(async () => ({})),
    },
    cleaners: () => cleaners,
    rooms: () => rooms,
    log: { info() {}, warn() {}, error() {} },
    ...over,
  };
  return Object.assign(deps, { sent });
}

describe('manager voice transcript (Ran 2026-10-22)', () => {
  const voice = (jid: string, forwarded = false) => ({
    key: { remoteJid: jid, fromMe: false, id: 'V' + jid },
    message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 42, ptt: true, ...(forwarded ? { contextInfo: { isForwarded: true } } : {}) } },
  } as unknown as WAMessage);

  it('replies to Ran only with the transcript of a forwarded voice note', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [{ phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' }];
    deps.transcribe = vi.fn(async () => ({ text: 'יש מניין בשבע', language: 'he', duration_ms: 1 })) as any;
    const pipeline = createPipeline(deps);
    const r = await pipeline.handleInbound(voice('972548317887@s.whatsapp.net', true));
    expect(r.handled).toBe(true);
    const toRan = deps.sent.filter(([j]) => j === '972548317887@s.whatsapp.net');
    expect(toRan.some(([, t]) => t === 'תמלול: יש מניין בשבע')).toBe(true);
    expect(deps.sent.every(([j, t]) => j === '972548317887@s.whatsapp.net' || !t.includes('יש מניין בשבע'))).toBe(true);
  });

  it('does not echo transcripts to another manager', async () => {
    const deps = makeDeps();
    deps.cleaners = () => [{ phone: '972506983399', name: 'מנהל', role: 'MANAGER', language: 'he' }];
    deps.transcribe = vi.fn(async () => ({ text: 'שלום', language: 'he', duration_ms: 1 })) as any;
    const pipeline = createPipeline(deps);
    await pipeline.handleInbound(voice('972506983399@s.whatsapp.net'));
    expect(deps.sent.some(([, t]) => t.startsWith('תמלול:'))).toBe(false);
  });
});
