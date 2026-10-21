import { EventEmitter } from 'node:events';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import type { ChannelConfig, ChannelId, InboundEnvelope, SendResult, WaStatus, WhatsAppChannelAdapter } from './types.js';
import { decideReconnect, KeepAlive, statusCodeOf } from './monitor.js';
import { canonicalJid, resolveStaffPhone } from './client.js';

export class BaileysChannelAdapter extends EventEmitter implements WhatsAppChannelAdapter {
  readonly channelId: ChannelId;
  readonly phoneNumber: string;
  readonly displayName: string;
  readonly authDir: string;
  private readonly browserName: [string, string, string];

  private sock?: WASocket;
  private attempt = 0;
  private stopped = false;
  private keepAlive?: KeepAlive;
  private sentMessages = new Map<string, NonNullable<WAMessage['message']>>();

  status: WaStatus = 'idle';
  readonly log: pino.Logger;

  constructor(cfg: ChannelConfig, baseLogger?: pino.Logger) {
    super();
    this.channelId = cfg.id;
    this.phoneNumber = cfg.phoneNumber;
    this.displayName = cfg.name;
    this.authDir = cfg.authDir;
    this.browserName = cfg.browserName || ['ResortOS Agent', this.displayName, '1.0.0'];

    const parentLog = baseLogger || pino({ level: process.env.LOG_LEVEL ?? 'info' });
    this.log = parentLog.child({ channel: this.channelId, phone: this.phoneNumber });
  }

  private setStatus(newStatus: WaStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('status_change', newStatus);
    }
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.setStatus('connecting');

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    let version: [number, number, number] | undefined;
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('version timeout')), 5000)),
      ]);
      version = latest.version;
    } catch (e) {
      this.log.warn({ err: String(e) }, 'Baileys version fetch skipped');
    }

    const baileysLog = pino({ level: 'silent' });

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      logger: baileysLog,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLog) },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 20_000,
      browser: this.browserName,
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        return this.sentMessages.get(key.id);
      },
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        this.setStatus('qr');
        this.log.info(`[${this.displayName}] New QR Code generated. Scan with WhatsApp:`);
        qrcode.generate(qr, { small: true });
        this.emit('qr', qr);
      }
      if (connection === 'open') {
        this.attempt = 0;
        this.setStatus('open');
        this.keepAlive?.stop();
        this.keepAlive = new KeepAlive(
          () => sock.sendPresenceUpdate('available'),
          25_000,
          (e) => this.log.debug({ e }, 'keepalive failed'),
        );
        this.keepAlive.start();
        this.log.info({ name: this.displayName }, 'WhatsApp channel connected');
        this.emit('authenticated');
      }
      if (connection === 'close') {
        this.keepAlive?.stop();
        const decision = decideReconnect(statusCodeOf(lastDisconnect?.error), this.attempt++);
        if (decision.action === 'stop') {
          this.setStatus('logged_out');
          this.log.fatal({ reason: decision.reason }, 'WhatsApp channel logged out');
          this.emit('logged_out');
          return;
        }
        this.setStatus('closed');
        this.log[decision.level]({ delayMs: decision.delayMs }, 'WhatsApp socket closed, reconnecting');
        if (!this.stopped) {
          setTimeout(() => void this.start().catch((e) => this.log.error(e)), decision.delayMs);
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (!m.message) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;

        const envelope = this.wrapMessage(m as WAMessage);
        this.emit('message', envelope);
      }
    });

    sock.ev.on('messages.reaction', (reactions) => {
      for (const r of reactions) {
        if (!r.reaction?.text) continue;
        const jid = r.key.remoteJid;
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;

        const synthMsg: WAMessage = {
          key: {
            remoteJid: jid,
            fromMe: false,
            id: r.key.id || `react-${Date.now()}`,
          },
          message: {
            conversation: r.reaction.text,
            reactionMessage: {
              key: r.reaction.key,
              text: r.reaction.text,
              senderTimestampMs: r.reaction.senderTimestampMs,
            },
          },
        };
        const envelope = this.wrapMessage(synthMsg);
        this.emit('message', envelope);
      }
    });
  }

  private wrapMessage(m: WAMessage): InboundEnvelope {
    const rawJid = m.key.remoteJid || '';
    const text =
      m.message?.conversation ??
      m.message?.extendedTextMessage?.text ??
      m.message?.imageMessage?.caption ??
      m.message?.reactionMessage?.text ??
      null;

    const isAudio = Boolean(m.message?.audioMessage);
    const hasMedia = Boolean(
      m.message?.imageMessage ||
      m.message?.audioMessage ||
      m.message?.videoMessage ||
      m.message?.documentMessage,
    );

    const senderPhone = resolveStaffPhone(rawJid);
    const ts = typeof m.messageTimestamp === 'number'
      ? m.messageTimestamp * 1000
      : Number(m.messageTimestamp?.toString() || Date.now());

    return {
      channelId: this.channelId,
      messageId: m.key.id || `msg-${Date.now()}`,
      remoteJid: rawJid,
      senderPhone,
      timestamp: ts,
      fromMe: Boolean(m.key.fromMe),
      text,
      isAudio,
      rawMessage: m,
    };
  }

  private rememberSentMessage(sent?: WAMessage) {
    if (!sent?.key?.id || !sent.message) return;
    this.sentMessages.set(sent.key.id, sent.message);
    if (this.sentMessages.size > 512) {
      const oldest = this.sentMessages.keys().next().value;
      if (oldest) this.sentMessages.delete(oldest);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.keepAlive?.stop();
    this.setStatus('closed');
    this.sock?.end(undefined);
  }

  async sendText(rawJid: string, text: string): Promise<SendResult> {
    if (!this.sock || this.status !== 'open') {
      throw new Error(`WhatsApp socket for channel ${this.channelId} is not open (status: ${this.status})`);
    }
    const jid = canonicalJid(rawJid);
    void this.sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const sent = await this.sock.sendMessage(jid, { text });
    this.rememberSentMessage(sent);
    void this.sock.sendPresenceUpdate('paused', jid).catch(() => {});

    this.log.info({ jid, chars: text.length }, 'WhatsApp message sent');
    return {
      messageId: sent?.key?.id || '',
      channelId: this.channelId,
      sentTo: jid,
      timestamp: Date.now(),
    };
  }

  async sendImage(rawJid: string, buffer: Buffer, caption?: string): Promise<SendResult> {
    if (!this.sock || this.status !== 'open') {
      throw new Error(`WhatsApp socket for channel ${this.channelId} is not open (status: ${this.status})`);
    }
    const jid = canonicalJid(rawJid);
    const sent = await this.sock.sendMessage(jid, { image: buffer, caption });
    this.rememberSentMessage(sent);

    this.log.info({ jid, bytes: buffer.length }, 'WhatsApp image sent');
    return {
      messageId: sent?.key?.id || '',
      channelId: this.channelId,
      sentTo: jid,
      timestamp: Date.now(),
    };
  }

  get socket(): WASocket | undefined {
    return this.sock;
  }
}
