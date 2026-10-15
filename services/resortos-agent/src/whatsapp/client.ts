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
import { config } from '../config.js';
import { decideReconnect, KeepAlive, statusCodeOf } from './monitor.js';

export type WaStatus = 'idle' | 'connecting' | 'qr' | 'open' | 'closed' | 'logged_out';

/**
 * Events:
 *  - 'qr' (qr: string)
 *  - 'authenticated' ()          fired every time the socket reaches `open`
 *  - 'message' (msg: WAMessage)  inbound, non-self, non-status messages only
 *  - 'logged_out' ()             critical
 */
export class WhatsAppClient extends EventEmitter {
  private sock?: WASocket;
  private attempt = 0;
  private stopped = false;
  private keepAlive?: KeepAlive;
  status: WaStatus = 'idle';
  readonly log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  async start(): Promise<void> {
    this.stopped = false;
    this.status = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const baileysLog = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      logger: baileysLog,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLog) },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 20_000,
      browser: ['ResortOS Agent', 'Chrome', '1.0.0'],
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        this.status = 'qr';
        qrcode.generate(qr, { small: true });
        this.emit('qr', qr);
      }
      if (connection === 'open') {
        this.attempt = 0;
        this.status = 'open';
        this.keepAlive?.stop();
        this.keepAlive = new KeepAlive(() => sock.sendPresenceUpdate('available'), 25_000, (e) =>
          this.log.debug({ e }, 'keepalive failed'),
        );
        this.keepAlive.start();
        this.log.info('WhatsApp connected');
        this.emit('authenticated');
      }
      if (connection === 'close') {
        this.keepAlive?.stop();
        const decision = decideReconnect(statusCodeOf(lastDisconnect?.error), this.attempt++);
        if (decision.action === 'stop') {
          this.status = 'logged_out';
          this.log.fatal(decision.reason);
          this.emit('logged_out');
          return;
        }
        this.status = 'closed';
        this.log[decision.level]({ delayMs: decision.delayMs }, 'WhatsApp socket closed, reconnecting');
        if (!this.stopped) setTimeout(() => void this.start().catch((e) => this.log.error(e)), decision.delayMs);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;
        if (m.key.remoteJid === 'status@broadcast' || m.key.remoteJid?.endsWith('@g.us')) continue;
        this.emit('message', m as WAMessage);
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.keepAlive?.stop();
    this.sock?.end(undefined);
  }

  /** Human-like send: composing presence proportional to text length, then paused, then message. */
  async sendText(jid: string, text: string): Promise<void> {
    if (!this.sock || this.status !== 'open') throw new Error('WhatsApp socket not open');
    const { minMs, maxMs, msPerChar } = config.typing;
    const delay = Math.min(maxMs, Math.max(minMs, text.length * msPerChar)) * (0.8 + Math.random() * 0.4);
    await this.sock.presenceSubscribe(jid).catch(() => {});
    await this.sock.sendPresenceUpdate('composing', jid).catch(() => {});
    await new Promise((r) => setTimeout(r, delay));
    await this.sock.sendPresenceUpdate('paused', jid).catch(() => {});
    await this.sock.sendMessage(jid, { text });
    this.log.info({ jid, chars: text.length }, 'WhatsApp message sent');
  }

  /** Send an image message with optional caption */
  async sendImage(jid: string, buffer: Buffer, caption?: string): Promise<void> {
    if (!this.sock || this.status !== 'open') throw new Error('WhatsApp socket not open');
    await this.sock.sendMessage(jid, { image: buffer, caption });
  }

  get socket(): WASocket | undefined {
    return this.sock;
  }
}

export const phoneToJid = (phone: string): string => `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
export const jidToPhone = (jid: string): string => jid.split('@')[0].split(':')[0];
