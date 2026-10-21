import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { sendManagerSms } from './integration/managerSms.js';
import { config, loadRooms } from './config.js';
import { currentStaff, refreshStaff } from './staff/liveStaff.js';
import { WhatsAppClient, canonicalJid } from './whatsapp/client.js';
import { Transcriber, transcribeVoiceNote, isAudioMessage, extractText } from './whatsapp/media.js';
import { OllamaClient } from './llm/client.js';
import { ResortOSClient } from './integration/resortos.js';
import { createPipeline } from './pipeline.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';
import { resolveRoomByAlias } from './llm/client.js';
import { gmailStatus } from './gmail/mailbox.js';
import { createInvoiceIntake } from './invoice/intake.js';
import { createInventoryClient } from './manager/inventoryQuestion.js';
import { downloadInvoiceMedia } from './whatsapp/media.js';

const wa = new WhatsAppClient();
const stt = new Transcriber();
const llm = new OllamaClient();
const resortos = new ResortOSClient();
const log = wa.log;

const invoiceIntake = createInvoiceIntake({
  ...config.invoiceIntake,
  bridgeUrl: config.resortos.baseUrl,
  tmpDir: config.tmpDir,
  log,
  suggest: {
    enabled: config.invoiceIntake.nameSuggest,
    cropBin: config.invoiceIntake.cropBin,
    // same model / num_ctx / keep_alive as Chloe's chat calls, so the loaded model is reused (no reload)
    ollama: { url: config.ollama.url, model: config.ollama.model, keepAlive: config.ollama.keepAlive, numCtx: 4096 },
  },
});
log.info({ enabled: config.invoiceIntake.enabled, nameSuggest: config.invoiceIntake.nameSuggest, grok: config.invoiceIntake.grok ? config.invoiceIntake.grok.model : 'off', allowlist: config.invoiceIntake.allowlist.map((p) => '***' + p.replace(/\D/g, '').slice(-4)) }, 'invoice intake config');

const inventory = createInventoryClient({ bridgeUrl: config.resortos.baseUrl, businessId: config.invoiceIntake.businessId });

const pipeline = createPipeline({
  invoiceIntake,
  inventory,
  downloadMedia: downloadInvoiceMedia,
  send: (jid, text) => wa.sendText(jid, text),
  notifyManagerSms: (message: string) => sendManagerSms(message),
  sendImage: (jid, buf, caption) => wa.sendImage(jid, buf, caption),
  isAudio: isAudioMessage,
  extractText,
  transcribe: (m, hint) => transcribeVoiceNote(m, stt, hint),
  llm,
  resortos,
  cleaners: currentStaff,
  rooms: loadRooms,
  log,
});

// Process messages sequentially per chat JID to preserve order within a conversation
// without blocking different users or rooms concurrently.
const chatQueues = new Map<string, Promise<unknown>>();
wa.on('message', (m) => {
  const jid = m.key.remoteJid || 'global';
  const prev = chatQueues.get(jid) || Promise.resolve();
  const next = prev
    .then(() => refreshStaff())
    .then(() => pipeline.handleInbound(m))
    .catch((e) => log.error({ err: String(e), jid }, 'Inbound pipeline error'));
  chatQueues.set(jid, next);
  next.finally(() => {
    if (chatQueues.get(jid) === next) chatQueues.delete(jid);
  });
});
wa.on('logged_out', () => log.fatal('CRITICAL: WhatsApp session logged out. Manual re-pairing required.'));

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
  const ok = wa.status === 'open' && ollama.ok;
  const gmail = await gmailStatus();
  return {
    ok,
    whatsapp: wa.status,
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
      return send(res, 200, await pipeline.triggerRoomExit({ cleanerPhone: phone, roomId }));
    }
    if (req.method === 'POST' && req.url === '/api/cleaners/send-qr') {
      const body = await readJson(req);
      const roomCode = body.room ?? body.room_code;
      const phone = body.phone ? String(body.phone).replace(/\D/g, '') : '972506983399';
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
      await wa.sendImage(`${phone}@s.whatsapp.net`, png, caption);
      return send(res, 200, { ok: true, room: r.letterCode || r.name, lockbox: r.lockbox, sentTo: phone });
    }
    if (req.method === 'POST' && (req.url === '/api/messages/send' || req.url === '/api/alerts/send')) {
      const body = await readJson(req);
      const text = String(body.text || body.message || '').trim();
      const explicitJid = String(body.jid || '').trim();
      const phone = String(body.phone || '').trim();
      if (!text) return send(res, 400, { error: 'text required' });
      const target = explicitJid || phone;
      if (!target) return send(res, 400, { error: 'phone or jid required' });
      const targetJid = canonicalJid(target);
      await wa.sendText(targetJid, text);
      if (body.booking_id) {
        void resortos.logGuestComm({
          bookingId: String(body.booking_id),
          direction: 'outbound',
          phone: phone || targetJid,
          content: text,
          status: 'sent',
        });
      }
      return send(res, 200, { ok: true, sentTo: targetJid });
    }
    send(res, 404, { error: 'not found' });
  } catch (e: any) {
    log.error({ err: String(e) }, 'http error');
    send(res, e?.status ?? 500, { error: String(e?.message ?? e) });
  }
});

// Bind to loopback only: this service controls a WhatsApp account.
server.listen(config.port, '127.0.0.1', () => log.info(`resortos-agent listening on 127.0.0.1:${config.port}`));
stt.start();
void wa.start();
void llm.warmup().then(
  () => log.info({ model: config.ollama.model }, 'ollama model warm'),
  (e) => log.warn({ err: String(e) }, 'ollama warmup failed'),
);

const shutdown = () => {
  stt.stop();
  void wa.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => log.error({ err: String(err) }, 'unhandled rejection'));
process.on('uncaughtException', (err) => log.error({ err: String(err) }, 'uncaught exception'));
