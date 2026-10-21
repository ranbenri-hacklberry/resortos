import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pino from 'pino';
import { config, loadRooms } from './config.js';
import { currentStaff, refreshStaff } from './staff/liveStaff.js';
import { canonicalJid } from './whatsapp/client.js';
import { Transcriber, transcribeVoiceNote, isAudioMessage, extractText } from './whatsapp/media.js';
import { OllamaClient } from './llm/client.js';
import { ResortOSClient } from './integration/resortos.js';
import { createPipeline } from './pipeline.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';
import { resolveRoomByAlias } from './llm/client.js';
import { gmailStatus } from './gmail/mailbox.js';
import { ChannelRouter } from './whatsapp/channelRouter.js';
import { BaileysChannelAdapter } from './whatsapp/baileysChannelAdapter.js';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const router = new ChannelRouter({ logger: log, defaultChannelId: 'resortos' });

// 1. Primary Channel: ResortOS / Chloe (phone: 051-526-2612 / 972515262612)
// Preserves existing auth directory 'auth_info_baileys'
const resortosAdapter = new BaileysChannelAdapter(config.channels.resortos, log);
router.registerChannel(resortosAdapter);

// 2. Secondary Channel: Mialees (phone: 050-950-6222 / 972509506222)
// Uses isolated auth directory 'data/auth_mialees'. Enabled via ENABLE_MIALEES_CHANNEL=1.
if (config.channels.mialees.enabled) {
  const mialeesAdapter = new BaileysChannelAdapter(config.channels.mialees, log);
  router.registerChannel(mialeesAdapter);
  log.info({ channel: 'mialees', phone: config.channels.mialees.phoneNumber }, 'Mialees channel enabled and registered');
} else {
  log.info({ channel: 'mialees' }, 'Mialees channel disabled by configuration (ENABLE_MIALEES_CHANNEL != 1)');
}

const stt = new Transcriber();
const llm = new OllamaClient();
const resortos = new ResortOSClient();

const pipeline = createPipeline({
  send: (jid, text, channelId) => router.sendText(channelId, jid, text, { isBot: true }),
  sendImage: (jid, buf, caption, channelId) => router.sendImage(channelId, jid, buf, caption, { isBot: true }),
  isAudio: isAudioMessage,
  extractText,
  transcribe: (m, hint) => transcribeVoiceNote(m, stt, hint),
  llm,
  resortos,
  cleaners: currentStaff,
  rooms: loadRooms,
  log,
});

// Central inbound ingress:
// ChannelRouter already handles deduplication, human-takeover detection, and FIFO chat queues.
router.on('inbound', async (envelope) => {
  try {
    await refreshStaff();
    await pipeline.handleInbound(envelope);
  } catch (e) {
    log.error({ err: String(e), channelId: envelope.channelId, jid: envelope.remoteJid }, 'Inbound pipeline error');
  }
});

// If inbound message arrives while chat is under human takeover:
// Log the communication in database for staff visibility and unread indicator, but do NOT trigger AI reply!
router.on('inbound_silenced', async (envelope) => {
  try {
    const booking = await resortos.findActiveBookingByPhone(envelope.senderPhone);
    if (booking?.id) {
      await resortos.logGuestComm({
        bookingId: booking.id,
        tenantId: (booking.tenant_id as string) || null,
        channel: 'whatsapp',
        direction: 'inbound',
        phone: envelope.senderPhone,
        content: envelope.text || '',
        status: 'received',
        metadata: { channel: envelope.channelId, silenced: true },
      });
    }
    log.info(
      { channelId: envelope.channelId, phone: envelope.senderPhone, bookingId: booking?.id },
      'Inbound message logged under human takeover mode (AI auto-reply suppressed)',
    );
  } catch (e) {
    log.error({ err: String(e) }, 'Failed to record silenced inbound communication');
  }
});

// Synchronize takeover changes with persistence
router.on('takeover_changed', async (rec) => {
  try {
    await resortos.upsertTakeover(rec);
  } catch (e) {
    log.error({ err: String(e) }, 'Failed to persist takeover state change');
  }
});

router.on('channel_logged_out', (channelId) => {
  log.fatal({ channelId }, 'CRITICAL: WhatsApp channel logged out. Manual re-pairing required.');
});

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export async function health() {
  const [ollama, mem] = [await llm.ping(), process.memoryUsage()];
  const rHealth = router.getHealth();
  const ok = rHealth.ok && ollama.ok;
  const gmail = await gmailStatus();
  return {
    ok,
    whatsapp: rHealth.channels.resortos?.status || 'idle',
    channels: rHealth.channels,
    takeovers_active: router.listTakeovers().length,
    gmail: { configured: gmail.configured, connected: gmail.connected, email: gmail.email, unseen: gmail.unseen },
    stt: { ready: stt.ready },
    ollama: { ...ollama, model: config.ollama.model },
    memory: {
      rss_mb: Math.round(mem.rss / 1048576),
      heap_used_mb: Math.round(mem.heapUsed / 1048576),
    },
    uptime_s: Math.round(process.uptime()),
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const h = await health();
      return send(res, h.ok ? 200 : 503, h);
    }
    if (req.method === 'GET' && req.url === '/api/channels') {
      return send(res, 200, { channels: router.listChannels() });
    }
    if (req.method === 'GET' && req.url === '/api/channels/takeover') {
      return send(res, 200, { takeovers: router.listTakeovers() });
    }
    if (req.method === 'POST' && req.url === '/api/channels/takeover') {
      const body = await readJson(req);
      const channelId = body.channel_id || 'resortos';
      const chatId = body.chat_id || body.phone || '';
      const bookingId = body.booking_id;
      const botDisabled = Boolean(body.bot_disabled);
      const reason = body.reason || 'manager_toggle';
      const updatedBy = body.updated_by || 'staff';

      if (!chatId && !bookingId) return send(res, 400, { error: 'chat_id or booking_id required' });

      if (botDisabled) {
        router.setHumanTakeover(channelId, chatId, { reason, bookingId, updatedBy });
      } else {
        if (bookingId) router.clearTakeoverByBookingId(bookingId);
        if (chatId) router.clearHumanTakeover(channelId, chatId, { reason, updatedBy });
      }
      return send(res, 200, { ok: true, bot_disabled: botDisabled, channel_id: channelId, chat_id: chatId });
    }
    if (req.method === 'GET' && req.url === '/api/gmail/status') {
      return send(res, 200, await gmailStatus(true));
    }
    if (req.method === 'POST' && req.url === '/api/cleaners/dispatch') {
      if (config.dispatchToken && req.headers['x-agent-token'] !== config.dispatchToken) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, await pipeline.handleDispatch(await readJson(req)));
    }
    if (req.method === 'POST' && req.url === '/api/cleaners/room-exit') {
      if (config.dispatchToken && req.headers['x-agent-token'] !== config.dispatchToken) return send(res, 401, { error: 'unauthorized' });
      const body = await readJson(req);
      const phone = body.cleaner_phone ?? body.phone;
      const roomId = body.room_id ?? body.room;
      const channelId = body.channel_id ?? body.channel;
      return send(res, 200, await pipeline.triggerRoomExit({ cleanerPhone: phone, roomId, channelId }));
    }
    if (req.method === 'POST' && req.url === '/api/cleaners/send-qr') {
      const body = await readJson(req);
      const roomCode = body.room ?? body.room_code;
      const phone = body.phone ? String(body.phone).replace(/\D/g, '') : '972506983399';
      const channelId = body.channel_id ?? body.channel ?? 'resortos';
      const rooms = loadRooms();
      const resolvedId = resolveRoomByAlias(roomCode, rooms);
      if (!resolvedId) return send(res, 404, { error: 'room not found' });
      const r = rooms.find((x) => x.id === resolvedId);
      if (!r) return send(res, 404, { error: 'room not found' });
      const png = await generateRoomQrPng(r);
      const caption = `🔲 קוד QR לסריקה עבור חדר: ${r.letterCode || r.name}\n` +
        `📍 מתחם: ${r.property || ''}\n` +
        `🔑 קוד כספת מפתח: ${r.lockbox || 'ללא'}\n\n` +
        `הדפס והדבק על הכספת. עובד שיסרוק יפעיל את שעון הניקיון ויקבל את קוד הכספת מיידית.`;
      await router.sendImage(channelId, `${phone}@s.whatsapp.net`, png, caption);
      return send(res, 200, { ok: true, room: r.letterCode || r.name, lockbox: r.lockbox, sentTo: phone, channel: channelId });
    }
    if (req.method === 'POST' && (req.url === '/api/messages/send' || req.url === '/api/alerts/send')) {
      const body = await readJson(req);
      const text = String(body.text || body.message || '').trim();
      const explicitJid = String(body.jid || '').trim();
      const phone = String(body.phone || '').trim();
      const channelId = body.channel_id || body.channel || 'resortos';
      if (!text) return send(res, 400, { error: 'text required' });
      const target = explicitJid || phone;
      if (!target) return send(res, 400, { error: 'phone or jid required' });
      const targetJid = canonicalJid(target);
      await router.sendText(channelId, targetJid, text);
      if (body.booking_id) {
        void resortos.logGuestComm({
          bookingId: String(body.booking_id),
          direction: 'outbound',
          phone: phone || targetJid,
          content: text,
          status: 'sent',
          channel: channelId,
        });
      }
      return send(res, 200, { ok: true, sentTo: targetJid, channel: channelId });
    }
    send(res, 404, { error: 'not found' });
  } catch (e: any) {
    log.error({ err: String(e) }, 'http error');
    send(res, e?.status ?? 500, { error: String(e?.message ?? e) });
  }
});

// Bind to loopback only: this service controls WhatsApp accounts.
server.listen(config.port, '127.0.0.1', () => log.info(`resortos-agent listening on 127.0.0.1:${config.port}`));
stt.start();
void router.startAll();

// Restore persisted active takeover states on startup
void resortos.listActiveTakeovers().then((takeovers) => {
  router.loadTakeoverStates(takeovers as any);
}).catch((e) => {
  log.warn({ err: String(e) }, 'Failed to restore active takeovers on startup');
});

void llm.warmup().then(
  () => log.info({ model: config.ollama.model }, 'ollama model warm'),
  (e) => log.warn({ err: String(e) }, 'ollama warmup failed'),
);

const shutdown = () => {
  stt.stop();
  void router.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => log.error({ err: String(err) }, 'unhandled rejection'));
process.on('uncaughtException', (err) => log.error({ err: String(err) }, 'uncaught exception'));
