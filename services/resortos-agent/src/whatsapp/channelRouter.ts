import { EventEmitter } from 'node:events';
import pino from 'pino';
import type { ChannelId, InboundEnvelope, SendResult, TakeoverRecord, WaStatus, WhatsAppChannelAdapter } from './types.js';

export interface ChannelRouterOptions {
  /** Optional fallback timeout for legacy calls. */
  humanTakeoverTimeoutMs?: number;
  /** Primary fallback channel id. Default: 'resortos' */
  defaultChannelId?: ChannelId;
  logger?: pino.Logger;
}

export class ChannelRouter extends EventEmitter {
  private readonly channels = new Map<ChannelId, WhatsAppChannelAdapter>();
  private readonly chatQueues = new Map<string, Promise<unknown>>();
  private readonly seenMessages = new Set<string>();
  private readonly seenQueue: string[] = [];
  private readonly takeoverMap = new Map<string, TakeoverRecord>();

  readonly defaultChannelId: ChannelId;
  readonly log: pino.Logger;

  constructor(opts: ChannelRouterOptions = {}) {
    super();
    this.defaultChannelId = opts.defaultChannelId ?? 'resortos';
    this.log = opts.logger || pino({ level: process.env.LOG_LEVEL ?? 'info' });
  }

  private takeoverKey(channelId: ChannelId, target: string): string {
    let clean = String(target || '').replace(/@.*$/, '').replace(/\D/g, '');
    if (clean.startsWith('05')) {
      clean = '972' + clean.slice(1);
    }
    return `${channelId}:${clean || target}`;
  }

  registerChannel(adapter: WhatsAppChannelAdapter): this {
    if (this.channels.has(adapter.channelId)) {
      this.log.warn({ channelId: adapter.channelId }, 'Overwriting existing channel adapter');
    }
    this.channels.set(adapter.channelId, adapter);

    adapter.on('message', (envelope) => this.handleInbound(envelope));
    adapter.on('status_change', (status) => {
      this.emit('channel_status', { channelId: adapter.channelId, status });
    });
    adapter.on('logged_out', () => {
      this.emit('channel_logged_out', adapter.channelId);
    });

    this.log.info(
      { channelId: adapter.channelId, name: adapter.displayName, phone: adapter.phoneNumber },
      'Registered WhatsApp channel',
    );
    return this;
  }

  getChannel(channelId: ChannelId): WhatsAppChannelAdapter | undefined {
    return this.channels.get(channelId);
  }

  listChannels(): { id: ChannelId; name: string; phone: string; status: WaStatus }[] {
    return Array.from(this.channels.values()).map((ch) => ({
      id: ch.channelId,
      name: ch.displayName,
      phone: ch.phoneNumber,
      status: ch.status,
    }));
  }

  async startAll(): Promise<void> {
    const promises = Array.from(this.channels.values()).map((ch) =>
      ch.start().catch((err) => {
        this.log.error({ channelId: ch.channelId, err: String(err) }, 'Failed to start channel');
      }),
    );
    await Promise.all(promises);
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.channels.values()).map((ch) =>
      ch.stop().catch((err) => {
        this.log.error({ channelId: ch.channelId, err: String(err) }, 'Failed to stop channel');
      }),
    );
    await Promise.all(promises);
  }

  /**
   * Disables or stops a single channel dynamically without affecting other active channels.
   */
  async stopChannel(channelId: ChannelId): Promise<boolean> {
    const ch = this.channels.get(channelId);
    if (!ch) return false;
    await ch.stop();
    return true;
  }

  /** Check if a chat is currently under human takeover (persistent until manager toggle or checkout). */
  isHumanTakeover(channelId: ChannelId, target: string): boolean {
    const key = this.takeoverKey(channelId, target);
    const rec = this.takeoverMap.get(key);
    return Boolean(rec?.botDisabled);
  }

  getTakeover(channelId: ChannelId, target: string): TakeoverRecord | undefined {
    return this.takeoverMap.get(this.takeoverKey(channelId, target));
  }

  listTakeovers(): TakeoverRecord[] {
    return Array.from(this.takeoverMap.values());
  }

  loadTakeoverStates(records: TakeoverRecord[]): void {
    for (const rec of records) {
      if (rec.botDisabled) {
        const key = this.takeoverKey(rec.channelId, rec.chatId);
        this.takeoverMap.set(key, rec);
      }
    }
    this.log.info({ count: this.takeoverMap.size }, 'Loaded active human takeover states');
  }

  /** Mark a chat as taken over by a human operator (persistent). */
  setHumanTakeover(
    channelId: ChannelId,
    target: string,
    opts: { reason?: string; bookingId?: string; updatedBy?: string } = {},
  ): TakeoverRecord {
    const key = this.takeoverKey(channelId, target);
    const clean = String(target || '').replace(/@.*$/, '').replace(/\D/g, '');
    const rec: TakeoverRecord = {
      channelId,
      chatId: clean || target,
      bookingId: opts.bookingId,
      botDisabled: true,
      reason: opts.reason || 'manual_reply',
      updatedBy: opts.updatedBy || 'operator',
      updatedAt: Date.now(),
    };
    this.takeoverMap.set(key, rec);
    this.log.info({ channelId, target, reason: rec.reason }, 'Human takeover activated (bot disabled)');
    this.emit('takeover_changed', rec);
    return rec;
  }

  /** Clear human takeover (e.g. if manager flips toggle back on or "!bot" command). */
  clearHumanTakeover(
    channelId: ChannelId,
    target: string,
    opts: { reason?: string; updatedBy?: string } = {},
  ): TakeoverRecord {
    const key = this.takeoverKey(channelId, target);
    const existing = this.takeoverMap.get(key);
    const clean = String(target || '').replace(/@.*$/, '').replace(/\D/g, '');
    const rec: TakeoverRecord = {
      channelId,
      chatId: clean || target,
      bookingId: existing?.bookingId,
      botDisabled: false,
      reason: opts.reason || 'manager_toggle',
      updatedBy: opts.updatedBy || 'manager',
      updatedAt: Date.now(),
    };
    this.takeoverMap.delete(key);
    this.log.info({ channelId, target, reason: rec.reason }, 'Human takeover cleared (bot resumed)');
    this.emit('takeover_changed', rec);
    return rec;
  }

  /** Clear human takeover when a booking checks out. Only clears matches for this specific bookingId. */
  clearTakeoverByBookingId(bookingId: string): TakeoverRecord[] {
    if (!bookingId) return [];
    const cleared: TakeoverRecord[] = [];
    for (const [key, rec] of this.takeoverMap.entries()) {
      if (rec.bookingId === bookingId) {
        this.takeoverMap.delete(key);
        const updated: TakeoverRecord = {
          ...rec,
          botDisabled: false,
          reason: 'checkout',
          updatedAt: Date.now(),
        };
        cleared.push(updated);
        this.log.info({ channelId: rec.channelId, chatId: rec.chatId, bookingId }, 'Takeover cleared on checkout');
        this.emit('takeover_changed', updated);
      }
    }
    return cleared;
  }

  /** Central inbound ingress pipeline */
  private handleInbound(envelope: InboundEnvelope): void {
    const dedupKey = `${envelope.channelId}:${envelope.messageId}`;
    if (this.seenMessages.has(dedupKey)) {
      this.log.debug({ dedupKey }, 'Duplicate message discarded');
      return;
    }
    this.seenMessages.add(dedupKey);
    this.seenQueue.push(dedupKey);
    if (this.seenQueue.length > 2000) {
      const oldest = this.seenQueue.shift();
      if (oldest) this.seenMessages.delete(oldest);
    }

    // 1. If message was sent from the device itself (human operator / staff WhatsApp web):
    if (envelope.fromMe) {
      this.log.info(
        { channelId: envelope.channelId, remoteJid: envelope.remoteJid },
        'Human operator outbound message detected; pausing bot auto-replies for this chat',
      );
      this.setHumanTakeover(envelope.channelId, envelope.remoteJid, {
        reason: 'manual_reply',
        updatedBy: 'operator_whatsapp',
      });
      return;
    }

    // 2. Check if bot reactivation command was sent by user
    if (envelope.text?.trim() === '!bot' || envelope.text?.trim() === 'הפעל בוט') {
      this.clearHumanTakeover(envelope.channelId, envelope.remoteJid, {
        reason: 'manager_toggle',
        updatedBy: 'user_command',
      });
      void this.sendText(envelope.channelId, envelope.remoteJid, '🤖 סוכנת ה-AI חזרה לפעולה. במה אוכל לעזור?');
      return;
    }

    // 3. If human takeover is active, drop message from AI handling but emit 'inbound_silenced' for DB logging & unread badge
    if (this.isHumanTakeover(envelope.channelId, envelope.remoteJid)) {
      this.log.info(
        { channelId: envelope.channelId, remoteJid: envelope.remoteJid },
        'Chat is in human takeover mode; skipping automated AI response',
      );
      this.emit('inbound_silenced', envelope);
      return;
    }

    // 4. Sequential FIFO processing per channel + remoteJid
    const queueKey = `${envelope.channelId}:${envelope.remoteJid}`;
    const prev = this.chatQueues.get(queueKey) || Promise.resolve();
    const next = prev
      .then(async () => {
        this.emit('inbound', envelope);
      })
      .catch((err) => {
        this.log.error({ err: String(err), queueKey }, 'Error in channel chat queue');
      });

    this.chatQueues.set(queueKey, next);
    next.finally(() => {
      if (this.chatQueues.get(queueKey) === next) {
        this.chatQueues.delete(queueKey);
      }
    });
  }

  /**
   * Route outbound text to the specified channel (or fallback to defaultChannelId).
   * If `opts?.isBot` is true, verifies that human takeover was not activated while the reply was being prepared.
   */
  async sendText(
    channelId: ChannelId | undefined,
    rawJid: string,
    text: string,
    opts?: { isBot?: boolean },
  ): Promise<SendResult> {
    const targetChannelId = channelId && this.channels.has(channelId) ? channelId : this.defaultChannelId;

    if (opts?.isBot && this.isHumanTakeover(targetChannelId, rawJid)) {
      this.log.warn(
        { channelId: targetChannelId, rawJid },
        'Aborting automated AI reply right before send: chat was switched to manual mode',
      );
      return {
        messageId: `aborted-${Date.now()}`,
        channelId: targetChannelId,
        sentTo: rawJid,
        timestamp: Date.now(),
      };
    }

    const adapter = this.channels.get(targetChannelId);
    if (!adapter) {
      throw new Error(`WhatsApp channel ${targetChannelId} not registered or available`);
    }
    return adapter.sendText(rawJid, text);
  }

  /**
   * Route outbound image to the specified channel (or fallback to defaultChannelId).
   */
  async sendImage(
    channelId: ChannelId | undefined,
    rawJid: string,
    buffer: Buffer,
    caption?: string,
    opts?: { isBot?: boolean },
  ): Promise<SendResult> {
    const targetChannelId = channelId && this.channels.has(channelId) ? channelId : this.defaultChannelId;

    if (opts?.isBot && this.isHumanTakeover(targetChannelId, rawJid)) {
      this.log.warn(
        { channelId: targetChannelId, rawJid },
        'Aborting automated AI image reply right before send: chat was switched to manual mode',
      );
      return {
        messageId: `aborted-img-${Date.now()}`,
        channelId: targetChannelId,
        sentTo: rawJid,
        timestamp: Date.now(),
      };
    }

    const adapter = this.channels.get(targetChannelId);
    if (!adapter) {
      throw new Error(`WhatsApp channel ${targetChannelId} not registered or available`);
    }
    return adapter.sendImage(rawJid, buffer, caption);
  }

  /** Overall health status of all channels */
  getHealth(): {
    ok: boolean;
    channels: Record<string, { status: WaStatus; name: string; phone: string }>;
  } {
    const channelStatuses: Record<string, { status: WaStatus; name: string; phone: string }> = {};
    let atLeastOneOpen = false;

    for (const [id, ch] of this.channels) {
      channelStatuses[id] = {
        status: ch.status,
        name: ch.displayName,
        phone: ch.phoneNumber,
      };
      if (ch.status === 'open') atLeastOneOpen = true;
    }

    return {
      ok: atLeastOneOpen,
      channels: channelStatuses,
    };
  }
}
