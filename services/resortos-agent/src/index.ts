import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config, loadCleaners, loadRooms } from './config.js';
import { WhatsAppClient } from './whatsapp/client.js';
import { Transcriber, transcribeVoiceNote, isAudioMessage, extractText } from './whatsapp/media.js';
import { OllamaClient } from './llm/client.js';
import { ResortOSClient } from './integration/resortos.js';
import { createPipeline } from './pipeline.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';
import { resolveRoomByAlias } from './llm/client.js';

const wa = new WhatsAppClient();
const stt = new Transcriber();
const llm = new OllamaClient();
const resortos = new ResortOSClient();
const log = wa.log;

const pipeline = createPipeline({
  send: (jid, text) => wa.sendText(jid, text),
  sendImage: (jid, buf, caption) => wa.sendImage(jid, buf, caption),
  isAudio: isAudioMessage,
  extractText,
  transcribe: (m, hint) => transcribeVoiceNote(m, stt, hint),
  llm,
  resortos,
  cleaners: loadCleaners,
  rooms: loadRooms,
  log,
});

// Process messages sequentially so the single local LLM/STT is never overloaded.
let queue: Promise<unknown> = Promise.resolve();
wa.on('message', (m) => {
  queue = queue.then(() => pipeline.handleInbound(m)).catch((e) => log.error(e));
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
  return {
    ok,
    whatsapp: wa.status,
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
    if (req.method === 'POST' && req.url === '/api/cleaners/dispatch') {
      if (config.dispatchToken && req.headers['x-agent-token'] !== config.dispatchToken) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, await pipeline.handleDispatch(await readJson(req)));
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

const shutdown = () => {
  stt.stop();
  void wa.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
