import { describe, it, expect, vi } from 'vitest';
import { ChannelRouter } from './channelRouter';
import { ChannelAdapter, InboundEnvelope, SendResult } from './types';
import { GUEST_SMS_TEMPLATES, templateById } from '../../../../src/lib/guestComms.js';

class MockAdapter implements ChannelAdapter {
  channelId: any;
  accountPhone: string;
  displayName: string;
  status: any = 'connected';
  sentTexts: { jid: string; text: string }[] = [];

  constructor(channelId: any, phone: string, name: string) {
    this.channelId = channelId;
    this.accountPhone = phone;
    this.displayName = name;
  }

  async sendText(jid: string, text: string): Promise<SendResult> {
    this.sentTexts.push({ jid, text });
    return {
      messageId: `msg-${Date.now()}`,
      channelId: this.channelId,
      sentTo: jid,
      timestamp: Date.now(),
    };
  }

  async sendImage(jid: string, _buf: Buffer, caption?: string): Promise<SendResult> {
    this.sentTexts.push({ jid, text: caption || '' });
    return {
      messageId: `img-${Date.now()}`,
      channelId: this.channelId,
      sentTo: jid,
      timestamp: Date.now(),
    };
  }

  simulateInbound(p: { messageId: string; senderPhone: string; text: string; fromMe?: boolean }) {
    const envelope: InboundEnvelope = {
      channelId: this.channelId,
      accountPhone: this.accountPhone,
      messageId: p.messageId,
      remoteJid: `${p.senderPhone}@s.whatsapp.net`,
      senderPhone: p.senderPhone,
      senderName: 'Guest',
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
        message: { conversation: p.text },
      } as any,
    };
    (this as any).emit('message', envelope);
    return envelope;
  }
}

// Minimal EventEmitter helper for mock
(MockAdapter.prototype as any).on = function (event: string, listener: Function) {
  this._listeners = this._listeners || {};
  this._listeners[event] = this._listeners[event] || [];
  this._listeners[event].push(listener);
};
(MockAdapter.prototype as any).emit = function (event: string, ...args: any[]) {
  if (!this._listeners?.[event]) return;
  for (const fn of this._listeners[event]) fn(...args);
};

describe('Human Takeover & Message Alerts Verification', () => {
  it('1. Setting human takeover disables auto-reply for that specific channel and chat', () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    expect(router.isHumanTakeover('resortos', '0501112233')).toBe(false);

    router.setHumanTakeover('resortos', '0501112233', {
      reason: 'manager_toggle',
      bookingId: 'book-100',
    });

    expect(router.isHumanTakeover('resortos', '0501112233')).toBe(true);
    // Normalized format (with 972) should also be recognized
    expect(router.isHumanTakeover('resortos', '972501112233@s.whatsapp.net')).toBe(true);
  });

  it('2. Inbound messages from guest in manual mode emit inbound_silenced and skip bot reply', async () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    router.setHumanTakeover('resortos', '972501112233', { reason: 'manual_reply' });

    const inboundSpy = vi.fn();
    const silencedSpy = vi.fn();
    router.on('inbound', inboundSpy);
    router.on('inbound_silenced', silencedSpy);

    adapter.simulateInbound({
      messageId: 'msg-g-1',
      senderPhone: '972501112233',
      text: 'שלום, מתי ארוחת בוקר?',
    });

    await new Promise((r) => setTimeout(r, 20));

    // Normal inbound event (which calls LLM pipeline) MUST NOT fire
    expect(inboundSpy).not.toHaveBeenCalled();
    // Inbound silenced event (which logs to DB and raises unread badge) MUST fire
    expect(silencedSpy).toHaveBeenCalledTimes(1);
    expect(silencedSpy.mock.calls[0][0].text).toBe('שלום, מתי ארוחת בוקר?');
  });

  it('3. Outbound staff message (fromMe: true) automatically silences Chloe', async () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    expect(router.isHumanTakeover('resortos', '972509998877')).toBe(false);

    adapter.simulateInbound({
      messageId: 'msg-staff-out',
      senderPhone: '972509998877',
      text: 'שלום, כאן רני מהקבלה, הבריכה מוכנה',
      fromMe: true, // message sent from WhatsApp Web / mobile
    });

    expect(router.isHumanTakeover('resortos', '972509998877')).toBe(true);
  });

  it('4. Return to auto-reply has NO timer timeout; requires explicit manager action or checkout', () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    router.setHumanTakeover('resortos', '972509998877', { reason: 'manager_toggle' });
    expect(router.isHumanTakeover('resortos', '972509998877')).toBe(true);

    // Explicit manager toggle clears takeover
    router.clearHumanTakeover('resortos', '972509998877', { reason: 'manager_toggle' });
    expect(router.isHumanTakeover('resortos', '972509998877')).toBe(false);
  });

  it('5. Checkout clears takeover ONLY for that specific booking', () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    // Guest A booking
    router.setHumanTakeover('resortos', '972501111111', { bookingId: 'booking-A' });
    // Guest B booking
    router.setHumanTakeover('resortos', '972502222222', { bookingId: 'booking-B' });

    // Checkout booking-A
    const cleared = router.clearTakeoverByBookingId('booking-A');
    expect(cleared.length).toBe(1);
    expect(cleared[0].bookingId).toBe('booking-A');

    // Guest A is now restored to auto-reply
    expect(router.isHumanTakeover('resortos', '972501111111')).toBe(false);
    // Guest B is STILL in manual takeover
    expect(router.isHumanTakeover('resortos', '972502222222')).toBe(true);
  });

  it('6. Collision prevention: automated replies with isBot: true are aborted if chat switched to manual in-flight', async () => {
    const router = new ChannelRouter();
    const adapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    router.registerChannel(adapter as any);

    // Normal send without isBot succeeds
    await router.sendText('resortos', '972505554433', 'Manual staff msg');
    expect(adapter.sentTexts.length).toBe(1);

    // Switch chat to manual mode
    router.setHumanTakeover('resortos', '972505554433', { reason: 'staff_intervention' });

    // In-flight bot reply arriving after switch
    const botResult = await router.sendText('resortos', '972505554433', 'Automated LLM reply', { isBot: true });
    expect(botResult.messageId).toContain('aborted');
    // Adapter sentTexts length remains 1 (aborted reply was NOT dispatched)
    expect(adapter.sentTexts.length).toBe(1);
  });

  it('7. Multi-WhatsApp: ResortOS and Mialees channels maintain completely independent takeover states', () => {
    const router = new ChannelRouter();
    const resortosAdapter = new MockAdapter('resortos', '972515262612', 'ResortOS');
    const mialeesAdapter = new MockAdapter('mialees', '972509506222', 'מיאליס');
    router.registerChannel(resortosAdapter as any);
    router.registerChannel(mialeesAdapter as any);

    const guestPhone = '972508887766';

    // Put guest in manual mode only on Mialees channel
    router.setHumanTakeover('mialees', guestPhone, { reason: 'mialees_staff' });

    expect(router.isHumanTakeover('mialees', guestPhone)).toBe(true);
    // ResortOS channel remains in automated Chloe mode!
    expect(router.isHumanTakeover('resortos', guestPhone)).toBe(false);
  });

  it('8. SMS Templates: checkin and stay_link templates exist and build without UNKNOWN_TEMPLATE error', () => {
    const checkinTpl = templateById('checkin');
    const stayLinkTpl = templateById('stay_link');

    expect(checkinTpl).not.toBeNull();
    expect(stayLinkTpl).not.toBeNull();

    const output = checkinTpl!.build({
      unitName: 'בקתה 1',
      checkoutUrl: 'https://resortos.app/stay/tok123',
    });

    expect(output).toContain('בקתה 1');
    expect(output).toContain('https://resortos.app/stay/tok123');
  });
});
