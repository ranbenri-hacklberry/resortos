import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import ffmpeg from 'fluent-ffmpeg';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, type Lang } from '../config.js';

export interface Transcript {
  text: string;
  language: string;
  duration_ms: number;
}

export const isAudioMessage = (m: WAMessage): boolean => !!m.message?.audioMessage;

export const extractText = (m: WAMessage): string | null =>
  m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? m.message?.reactionMessage?.text ?? null;

/** Convert an Opus/OGG buffer to 16 kHz mono WAV (what Whisper expects). Returns the wav path. */
export async function oggToWav(buf: Buffer): Promise<string> {
  await mkdir(config.tmpDir, { recursive: true });
  const id = randomUUID();
  const inPath = path.join(config.tmpDir, `${id}.ogg`);
  const outPath = path.join(config.tmpDir, `${id}.wav`);
  await writeFile(inPath, buf);
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .format('wav')
        .on('end', () => resolve())
        .on('error', reject)
        .save(outPath);
    });
  } finally {
    await unlink(inPath).catch(() => {});
  }
  return outPath;
}

/**
 * Persistent Python worker (JSON-lines RPC over stdio). The model is loaded once and kept warm,
 * which is what makes sub-second transcription possible.
 */
export class Transcriber {
  private proc?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (t: Transcript) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  ready = false;

  start(): void {
    if (this.proc) return;
    const proc = spawn(config.stt.python, [config.stt.script, '--model', config.stt.model], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;
    proc.on('error', (err) => {
      process.stderr.write(`[stt] spawn error: ${err.message}\n`);
      this.ready = false;
      this.proc = undefined;
    });
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg: { id?: string; ready?: boolean; error?: string } & Partial<Transcript>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.ready) {
        this.ready = true;
        return;
      }
      const p = msg.id ? this.pending.get(msg.id) : undefined;
      if (!p || !msg.id) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve({ text: msg.text ?? '', language: msg.language ?? 'unknown', duration_ms: msg.duration_ms ?? 0 });
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[stt] ${d}`));
    proc.on('exit', () => {
      this.ready = false;
      this.proc = undefined;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('transcriber exited'));
        this.pending.delete(id);
      }
      setTimeout(() => this.start(), 2000).unref();
    });
  }

  stop(): void {
    const p = this.proc;
    this.proc = undefined;
    p?.removeAllListeners('exit');
    p?.kill();
  }

  transcribe(wavPath: string, languageHint?: Lang): Promise<Transcript> {
    this.start();
    const proc = this.proc!;
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('transcription timeout'));
      }, config.stt.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ id, path: wavPath, language_hint: languageHint ?? null }) + '\n');
    });
  }
}

/** Full pipeline: WhatsApp audio message -> text. Temp files are always cleaned up. */
export async function transcribeVoiceNote(
  msg: WAMessage,
  transcriber: Pick<Transcriber, 'transcribe'>,
  languageHint?: Lang,
): Promise<Transcript> {
  const buf = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
  const wav = await oggToWav(buf);
  try {
    return await transcriber.transcribe(wav, languageHint);
  } finally {
    await unlink(wav).catch(() => {});
  }
}
