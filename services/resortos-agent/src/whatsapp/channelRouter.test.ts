import { describe, it, expect, vi } from 'vitest';
import { ChannelRouter } from './channelRouter.js';
import type { InboundEnvelope, SendResult, WaStatus, WhatsAppChannelAdapter } from './types.js';
import { EventEmitter } from 'node:events';

class MockAdapter extends EventEmitter implements WhatsAppChannelAdapter {
  status: WaStatus = 'open';
  sentTexts: { jid: string; text: string }[] = [];
  sentImages: { jid: string; caption?: string }[] = [];

  constructor(
    readonly channelId: string,
    readonly phoneNumber: string,
    readonly displayName: string,
  ) {
    super();
  }

  async start(): Promise<void> {
    this.status = 'open';
    this.emit('authenticated');
  }

  async stop(): Promise<void> {
    this.status = 'closed';
    this.emit('status_change', 'closed');
  }

  async sendText(rawJid: string, text: string): Promise<SendResult> {
    this.sentTexts.push({ jid: rawJid, text });
    return {
      messageId: `sent-${Date.now()}`,
      channelId: this.channelId,
      sentTo: rawJid,
      timestamp: Date.now(),
    };
  }

  async sendImage(rawJid: string, buffer: Buffer, caption?: string): Promise<SendResult> {
    this.sentImages.push({ jid: rawJid, caption });
    return {
      messageId: `sent-img-${Date.now()}`,
      channelId: this.channelId,
      sentTo: rawJid,
      timestamp: Date.now(),
    };
  }

  simulateInbound(env: Partial<InboundEnvelope>): void {
    const remoteJid = env.remoteJid || '972501234567@s.whatsapp.net';
    const senderPhone = env.senderPhone || remoteJid.split('@')[0].replace(/\D/g, '');
    const full: InboundEnvelope = {
      channelId: this.channelId,
      messageId: `msg-${Math.random()}`,
      remoteJid,
      senderPhone,
      timestamp: Date.now(),
      fromMe: false,
      text: 'שלום',
      isAudio: false,
      rawMessage: {} as any,
      ...env,
    };
    this.emit('message', full);
  }
}

describe('ChannelRouter', () => {
  it('registers multiple independent channels', () => {
    const router = new ChannelRouter();
    const chA = new MockAdapter('resortos', '972515262612', 'ResortOS / Chloe');
    const chB = new MockAdapter('mialees', '972509506222', 'מיאליס');

    router.registerChannel(chA);
    router.registerChannel(chB);

    const list = router.listChannels();
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.id === 'resortos')?.phone).toBe('972515262612');
    expect(list.find((x) => x.id === 'mialees')?.name).toBe('מיאליס');
  });

  it('routes outbound text replies to the exact originating channel', async () => {
    const router = new ChannelRouter();
    const chA = new MockAdapter('resortos', '972515262612', 'ResortOS');
    const chB = new MockAdapter('mialees', '972509506222', 'מיאליס');

    router.registerChannel(chA);
    router.registerChannel(chB);

    await router.sendText('mialees', '972548317887@s.whatsapp.net', 'תשובה ממיאליס');
    await router.sendText('resortos', '972548317887@s.whatsapp.net', 'תשובה מריזורטוס');

    expect(chB.sentTexts).toEqual([{ jid: '972548317887@s.whatsapp.net', text: 'תשובה ממיאליס' }]);
    expect(chA.sentTexts).toEqual([{ jid: '972548317887@s.whatsapp.net', text: 'תשובה מריזורטוס' }]);
  });

  it('deduplicates messages with the same messageId on the same channel', async () => {
    const router = new ChannelRouter();
    const chA = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(chA);

    const received: InboundEnvelope[] = [];
    router.on('inbound', (env) => received.push(env));

    chA.simulateInbound({ messageId: 'msg-101', text: 'הודעה ראשונה' });
    chA.simulateInbound({ messageId: 'msg-101', text: 'הודעה כפולה' });

    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('הודעה ראשונה');
  });

  it('pauses automated AI handling when human operator sends message (fromMe)', () => {
    const router = new ChannelRouter();
    const chA = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(chA);

    const received: InboundEnvelope[] = [];
    router.on('inbound', (env) => received.push(env));

    const customerJid = '972509998877@s.whatsapp.net';

    // 1. Human operator writes from phone
    chA.simulateInbound({ remoteJid: customerJid, fromMe: true, text: 'היי כאן נציג אנושי' });
    expect(received).toHaveLength(0); // Never delivered to AI pipeline
    expect(router.isHumanTakeover('resortos', customerJid)).toBe(true);

    // 2. Customer replies, but takeover is active -> dropped from AI
    chA.simulateInbound({ remoteJid: customerJid, fromMe: false, text: 'תודה רבה' });
    expect(received).toHaveLength(0);

    // 3. Reactivation command
    chA.simulateInbound({ remoteJid: customerJid, fromMe: false, text: '!bot' });
    expect(router.isHumanTakeover('resortos', customerJid)).toBe(false);
    expect(chA.sentTexts[0].text).toContain('סוכנת ה-AI חזרה לפעולה');
  });

  it('can stop a single channel without affecting others', async () => {
    const router = new ChannelRouter();
    const chA = new MockAdapter('resortos', '972515262612', 'ResortOS');
    const chB = new MockAdapter('mialees', '972509506222', 'מיאליס');

    router.registerChannel(chA);
    router.registerChannel(chB);

    await router.stopChannel('mialees');

    expect(chB.status).toBe('closed');
    expect(chA.status).toBe('open');

    const health = router.getHealth();
    expect(health.ok).toBe(true); // Still ok because resortos is open
    expect(health.channels.resortos.status).toBe('open');
    expect(health.channels.mialees.status).toBe('closed');
  });
});
