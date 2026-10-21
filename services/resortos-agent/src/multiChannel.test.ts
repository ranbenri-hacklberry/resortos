import { describe, it, expect, vi } from 'vitest';
import { createPipeline, type PipelineDeps } from './pipeline.js';
import { ChannelRouter } from './whatsapp/channelRouter.js';
import type { InboundEnvelope, WhatsAppChannelAdapter, WaStatus } from './whatsapp/types.js';
import { EventEmitter } from 'node:events';

class MockChannelAdapter extends EventEmitter implements WhatsAppChannelAdapter {
  readonly channelId: string;
  readonly phoneNumber: string;
  readonly displayName: string;
  status: WaStatus = 'open';
  sentTexts: { jid: string; text: string }[] = [];

  constructor(channelId: string, phoneNumber: string, displayName: string) {
    super();
    this.channelId = channelId;
    this.phoneNumber = phoneNumber;
    this.displayName = displayName;
  }

  async start(): Promise<void> {
    this.status = 'open';
  }

  async stop(): Promise<void> {
    this.status = 'closed';
  }

  async sendText(rawJid: string, text: string) {
    this.sentTexts.push({ jid: rawJid, text });
    return {
      messageId: `mock-${Date.now()}-${Math.random()}`,
      channelId: this.channelId,
      sentTo: rawJid,
      timestamp: Date.now(),
    };
  }

  async sendImage(rawJid: string, _buffer: Buffer, caption?: string) {
    this.sentTexts.push({ jid: rawJid, text: caption || '[image]' });
    return {
      messageId: `mock-img-${Date.now()}`,
      channelId: this.channelId,
      sentTo: rawJid,
      timestamp: Date.now(),
    };
  }

  simulateInbound(p: {
    messageId: string;
    senderPhone: string;
    text: string;
    fromMe?: boolean;
  }) {
    const envelope: InboundEnvelope = {
      channelId: this.channelId,
      messageId: p.messageId,
      remoteJid: `${p.senderPhone}@s.whatsapp.net`,
      senderPhone: p.senderPhone,
      timestamp: Date.now(),
      fromMe: Boolean(p.fromMe),
      text: p.text,
      isAudio: false,
      rawMessage: {
        key: {
          remoteJid: `${p.senderPhone}@s.whatsapp.net`,
          fromMe: Boolean(p.fromMe),
          id: p.messageId,
        },
        message: {
          conversation: p.text,
        },
      } as any,
    };
    this.emit('message', envelope);
    return envelope;
  }
}

describe('Multi-WhatsApp End-to-End Pipeline Routing', () => {
  it('routes replies strictly to the originating channel (resortos vs mialees)', async () => {
    const router = new ChannelRouter({ defaultChannelId: 'resortos' });

    // Primary ResortOS channel (051-526-2612)
    const resortosAdapter = new MockChannelAdapter('resortos', '972515262612', 'ResortOS / Chloe');
    router.registerChannel(resortosAdapter);

    // Mialees channel (050-950-6222)
    const mialeesAdapter = new MockChannelAdapter('mialees', '972509506222', 'מיאליס');
    router.registerChannel(mialeesAdapter);

    const loggedComms: any[] = [];

    const deps: PipelineDeps = {
      send: (jid, text, channelId) => router.sendText(channelId, jid, text),
      sendImage: (jid, buf, caption, channelId) => router.sendImage(channelId, jid, buf, caption),
      isAudio: () => false,
      extractText: (m) => m.message?.conversation || null,
      transcribe: async () => ({ text: '', language: 'he' }),
      llm: {
        extractIntent: vi.fn(async () => ({
          action: 'UNKNOWN',
          room_id: null,
          room_raw: null,
          issue_description_hebrew: null,
          acknowledgement_reply_cleaner_language: '',
        })),
        translateTask: vi.fn(async (text) => text),
      },
      resortos: {
        markRoomReady: vi.fn(),
        reportMaintenance: vi.fn(),
        reportSupplies: vi.fn(),
        logGuestComm: vi.fn(async (p) => {
          loggedComms.push(p);
        }),
      },
      cleaners: () => [
        { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' },
      ],
      rooms: () => [
        { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', aliases: ['b1'] },
      ],
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const pipeline = createPipeline(deps);

    // Bind router inbound event to pipeline
    router.on('inbound', async (envelope) => {
      await pipeline.handleInbound(envelope);
    });

    // 1. Send message to Chloe on resortos channel: "שלום"
    resortosAdapter.simulateInbound({
      messageId: 'msg-resortos-1',
      senderPhone: '972548317887',
      text: 'שלום',
    });

    // Allow async tick for queue processing
    await new Promise((r) => setTimeout(r, 50));

    expect(resortosAdapter.sentTexts.length).toBe(1);
    expect(resortosAdapter.sentTexts[0].text).toContain('שלום רני');
    expect(mialeesAdapter.sentTexts.length).toBe(0); // Nothing sent to Mialees!

    // 2. Send message to Chloe on mialees channel: "היי"
    mialeesAdapter.simulateInbound({
      messageId: 'msg-mialees-1',
      senderPhone: '972548317887',
      text: 'היי',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mialeesAdapter.sentTexts.length).toBe(1);
    expect(mialeesAdapter.sentTexts[0].text).toContain('היי רני');
    expect(resortosAdapter.sentTexts.length).toBe(1); // ResortOS unchanged!
  });

  it('maintains completely isolated conversation sessions per channel for the same phone', async () => {
    const router = new ChannelRouter({ defaultChannelId: 'resortos' });
    const resortosAdapter = new MockChannelAdapter('resortos', '972515262612', 'ResortOS');
    const mialeesAdapter = new MockChannelAdapter('mialees', '972509506222', 'מיאליס');
    router.registerChannel(resortosAdapter);
    router.registerChannel(mialeesAdapter);

    const deps: PipelineDeps = {
      send: (jid, text, channelId) => router.sendText(channelId, jid, text),
      isAudio: () => false,
      extractText: (m) => m.message?.conversation || null,
      transcribe: async () => ({ text: '', language: 'he' }),
      llm: {
        extractIntent: vi.fn(),
        translateTask: vi.fn(async (t) => t),
      },
      resortos: {
        markRoomReady: vi.fn(),
        reportMaintenance: vi.fn(),
        reportSupplies: vi.fn(),
      },
      cleaners: () => [
        { phone: '972548317887', name: 'רני', role: 'MANAGER', language: 'he' },
      ],
      rooms: () => [
        { id: 'k685', name: 'נופים בלבן 1', property: 'נופים בלבן', letterCode: 'B1', aliases: ['b1'] },
      ],
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const pipeline = createPipeline(deps);

    // Set a session for Rani on resortos channel
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    }, 'resortos');

    // Rani's session on resortos channel exists:
    expect(pipeline.getSession('972548317887', 'resortos')).toMatchObject({
      role: 'MANAGER',
      state: 'AWAITING_ACTION',
      roomId: 'k685',
    });

    // Rani's session on mialees channel is isolated and empty!
    expect(pipeline.getSession('972548317887', 'mialees')).toBeUndefined();

    // Now set a session on mialees channel
    pipeline.setSession('972548317887', {
      role: 'MANAGER',
      state: 'SELECT_STATUS',
      roomId: 'k685',
    }, 'mialees');

    expect(pipeline.getSession('972548317887', 'mialees')?.state).toBe('SELECT_STATUS');
    expect(pipeline.getSession('972548317887', 'resortos')?.state).toBe('AWAITING_ACTION');
  });

  it('routes dispatch commands with explicit channel_id to that channel', async () => {
    const router = new ChannelRouter({ defaultChannelId: 'resortos' });
    const resortosAdapter = new MockChannelAdapter('resortos', '972515262612', 'ResortOS');
    const mialeesAdapter = new MockChannelAdapter('mialees', '972509506222', 'מיאליס');
    router.registerChannel(resortosAdapter);
    router.registerChannel(mialeesAdapter);

    const deps: PipelineDeps = {
      send: (jid, text, channelId) => router.sendText(channelId, jid, text),
      isAudio: () => false,
      extractText: (m) => m.message?.conversation || null,
      transcribe: async () => ({ text: '', language: 'he' }),
      llm: {
        extractIntent: vi.fn(),
        translateTask: vi.fn(async (t) => `[TR] ${t}`),
      },
      resortos: {
        markRoomReady: vi.fn(),
        reportMaintenance: vi.fn(),
        reportSupplies: vi.fn(),
      },
      cleaners: () => [
        { phone: '972501112233', name: 'סומצאי', role: 'CLEANER', language: 'th' },
      ],
      rooms: () => [],
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const pipeline = createPipeline(deps);

    // Dispatch to cleaner via mialees channel
    await pipeline.handleDispatch({
      cleaner_phone: '972501112233',
      message_he: 'נא לנקות את החדר',
      channel_id: 'mialees',
    });

    expect(mialeesAdapter.sentTexts.length).toBe(1);
    expect(mialeesAdapter.sentTexts[0].jid).toBe('972501112233@s.whatsapp.net');
    expect(mialeesAdapter.sentTexts[0].text).toBe('[TR] נא לנקות את החדר');
    expect(resortosAdapter.sentTexts.length).toBe(0);

    // Dispatch to cleaner via default resortos channel
    await pipeline.handleDispatch({
      cleaner_phone: '972501112233',
      message_he: 'הודעה לעובד',
    });

    expect(resortosAdapter.sentTexts.length).toBe(1);
    expect(resortosAdapter.sentTexts[0].text).toBe('[TR] הודעה לעובד');
  });
});
