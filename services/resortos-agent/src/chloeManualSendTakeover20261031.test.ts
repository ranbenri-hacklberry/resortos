import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { ChannelRouter } from './whatsapp/channelRouter.js';
import { shouldTakeoverOnManualSend } from './integration/manualSendTakeover.js';
import type { CleanerProfile } from './config.js';

const staff = [
  { name: 'Manager', phone: '972500000001', role: 'manager' },
  { name: 'Cleaner', phone: '972500000002', role: 'cleaner' },
] as unknown as CleanerProfile[];
const guestJid = '972541112233@s.whatsapp.net';

class Adapter extends EventEmitter {
  channelId = 'resortos'; phoneNumber = '972500009999'; displayName = 'R'; status = 'open' as const;
  sent: { jid: string; text: string }[] = [];
  async start() {} async stop() {}
  async sendText(jid: string, text: string) { this.sent.push({ jid, text }); return { messageId: 'm', channelId: 'resortos', sentTo: jid, timestamp: Date.now() }; }
  async sendImage(jid: string) { return { messageId: 'i', channelId: 'resortos', sentTo: jid, timestamp: Date.now() }; }
  inbound(from: string, text: string, id: string) {
    this.emit('message', { channelId: 'resortos', messageId: id, remoteJid: `${from}@s.whatsapp.net`, senderPhone: from, timestamp: Date.now(), fromMe: false, text, isAudio: false, rawMessage: { key: { remoteJid: `${from}@s.whatsapp.net`, id }, message: { conversation: text } } });
  }
}

/** Same flow as index.ts /api/messages/send + /api/alerts/send. */
async function httpSend(router: ChannelRouter, url: string, body: any) {
  const jid = body.jid || `${body.phone}@s.whatsapp.net`;
  await router.sendText('resortos', jid, body.text);
  if (shouldTakeoverOnManualSend({ url, body, targetJid: jid, staff })) router.setHumanTakeover('resortos', jid, { reason: 'manual_send', updatedBy: 'http_send' });
}

function setup() {
  const router = new ChannelRouter({ defaultChannelId: 'resortos', logger: { info() {}, debug() {}, warn() {}, error() {}, fatal() {} } as any });
  const a = new Adapter();
  router.registerChannel(a as any);
  const handled = vi.fn();
  router.on('inbound', handled);
  return { router, a, handled };
}

describe('manual http_send puts guest chat in takeover (Ran 2026-10-31)', () => {
  it('after http_send to a guest, the next guest message gets no auto-reply', async () => {
    const { router, a, handled } = setup();
    await httpSend(router, '/api/messages/send', { phone: '972541112233', text: 'היי, כאן רן' });
    expect(router.isHumanTakeover('resortos', guestJid)).toBe(true);
    expect(router.getTakeover('resortos', guestJid)?.reason).toBe('manual_send');
    const silenced = vi.fn(); router.on('inbound_silenced', silenced);
    a.inbound('972541112233', 'תודה, מתי הצ׳ק אין?', 'g1');
    await new Promise((r) => setTimeout(r, 20));
    expect(handled).not.toHaveBeenCalled();
    expect(silenced).toHaveBeenCalledTimes(1);
    expect(a.sent).toHaveLength(1);
  });

  it('alerts to managers do not trigger takeover', async () => {
    const { router } = setup();
    await httpSend(router, '/api/alerts/send', { phone: '972500000001', text: 'alert' });
    await httpSend(router, '/api/alerts/send', { phone: '972541112233', text: 'alert' });
    await httpSend(router, '/api/messages/send', { phone: '972500000001', text: 'manager note' });
    await httpSend(router, '/api/messages/send', { phone: '0500000002', text: 'cleaner task' });
    await httpSend(router, '/api/messages/send', { jid: '120363000000@g.us', text: 'thai group' });
    expect(router.listTakeovers()).toEqual([]);
  });

  it('keep_auto:true opts out (system notifications)', async () => {
    const { router } = setup();
    await httpSend(router, '/api/messages/send', { phone: '972541112233', text: 'auto', keep_auto: true });
    expect(router.isHumanTakeover('resortos', guestJid)).toBe(false);
  });

  it('index.ts wires the rule into the send endpoint', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/shouldTakeoverOnManualSend\(\{ url: String\(req\.url\), body, targetJid, staff: currentStaff\(\) \}\)/);
    expect(src).toMatch(/reason: 'manual_send'/);
  });
});
