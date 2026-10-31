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
      browser: ['ResortOS Agent', 'Chrome', '1.0.0'],
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

    sock.ev.on('messages.reaction', (reactions) => {
      for (const r of reactions) {
        if (!r.reaction?.text) continue;
        const jid = r.key.remoteJid;
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;
        const synthMsg = {
          key: {
            remoteJid: jid,
            fromMe: false,
            id: r.key.id,
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
        this.emit('message', synthMsg as unknown as WAMessage);
      }
    });
  }

  private sentMessages = new Map<string, NonNullable<WAMessage['message']>>();

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
    this.sock?.end(undefined);
  }

  /** Fast direct send: non-blocking presence update and immediate message delivery. */
  async sendText(rawJid: string, text: string): Promise<void> {
    if (!this.sock || this.status !== 'open') throw new Error('WhatsApp socket not open');
    const jid = canonicalJid(rawJid);
    void this.sock.sendPresenceUpdate('composing', jid).catch(() => {});
    const sent = await this.sock.sendMessage(jid, { text });
    this.rememberSentMessage(sent);
    void this.sock.sendPresenceUpdate('paused', jid).catch(() => {});
    this.log.info({ jid, origJid: rawJid !== jid ? rawJid : undefined, chars: text.length }, 'WhatsApp message sent');
  }

  /** Send an image message with optional caption */
  async sendImage(rawJid: string, buffer: Buffer, caption?: string): Promise<void> {
    if (!this.sock || this.status !== 'open') throw new Error('WhatsApp socket not open');
    const jid = canonicalJid(rawJid);
    const sent = await this.sock.sendMessage(jid, { image: buffer, caption });
    this.rememberSentMessage(sent);
  }

  get socket(): WASocket | undefined {
    return this.sock;
  }
}

export const KNOWN_STAFF_LIDS: Record<string, string> = {
  '170626836910125': '972548317887', // רני
  '249438949924982': '972543387383', // אדם
  '250947087413293': '972557778344', // טופ
  '87338780737753': '972559495515',  // שיבה
  '37500030603279': '972559281657',  // טאו
  '217588009308323': '972529690024', // צוקי
  '274762009972934': '972533932462', // קוסטה (Ran confirmed 2026-10-21)
};

export const STAFF_PHONE_TO_LID: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_STAFF_LIDS).map(([lid, phone]) => [phone, lid]),
);

/** Resolve any raw JID or LID or phone string to its canonical phone number digits if known. */
export function resolveStaffPhone(raw: string): string {
  const baseDigits = String(raw || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (KNOWN_STAFF_LIDS[baseDigits]) {
    return KNOWN_STAFF_LIDS[baseDigits];
  }
  if (baseDigits.startsWith('05') && baseDigits.length === 10) {
    return `972${baseDigits.slice(1)}`;
  }
  return baseDigits;
}

/**
 * Normalize any incoming target (phone, local 05x, LID, or raw JID) to a safe, valid WhatsApp JID.
 * For staff whose WhatsApp chats operate under @lid, always route to `<lid>@lid` so inbound and outbound
 * messages share the exact same Signal session and never trigger "Waiting for this message" ghost errors!
 */
export function canonicalJid(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('EMPTY_JID');

  const [userPart, domainPart] = trimmed.split('@');
  if (domainPart === 'g.us') {
    return `${userPart}@g.us`;
  }

  const baseDigits = (userPart || '').split(':')[0].replace(/\D/g, '');

  // 1. If raw is already a known staff LID, keep it on @lid
  if (KNOWN_STAFF_LIDS[baseDigits]) {
    return `${baseDigits}@lid`;
  }

  // 2. Normalize Israeli 05x to 9725x
  const normalizedPhone =
    baseDigits.startsWith('05') && baseDigits.length === 10
      ? `972${baseDigits.slice(1)}`
      : baseDigits;

  // 3. If this phone number belongs to a staff member with an active @lid session, route to @lid!
  if (STAFF_PHONE_TO_LID[normalizedPhone]) {
    return `${STAFF_PHONE_TO_LID[normalizedPhone]}@lid`;
  }

  if (domainPart === 'lid') {
    return `${baseDigits}@lid`;
  }

  if (normalizedPhone.startsWith('972') && normalizedPhone.length >= 11 && normalizedPhone.length <= 13) {
    return `${normalizedPhone}@s.whatsapp.net`;
  }

  if (domainPart) {
    return `${baseDigits}@${domainPart}`;
  }

  return `${normalizedPhone}@s.whatsapp.net`;
}

export const phoneToJid = (phone: string): string => canonicalJid(phone);
export const jidToPhone = (jid: string): string => resolveStaffPhone(jid);
