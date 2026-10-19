import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export type Lang = 'th' | 'ar' | 'he';
export const SUPPORTED_LANGS: Lang[] = ['th', 'ar', 'he'];

export interface CleanerProfile {
  /** Digits only, international format, e.g. 972501234567 */
  phone: string;
  name: string;
  role?: string;
  language: Lang;
  /** WhatsApp Linked Device ID if assigned, e.g. 208190587302068 */
  lid?: string;
}

export type RoomUsage = 'GUEST_ACCOMMODATION' | 'STAFF_ACCOMMODATION' | 'OFFICE' | 'STORAGE' | 'SERVICE_AREA';

export interface RoomEntry {
  /** ResortOS unit id (e.g. k680) - internal DB identifier, never shown to staff */
  id: string;
  /** Official display name in Hebrew (e.g. מול הנוף · בקתה 1) */
  name?: string;
  /** Complex name (e.g. מול הנוף) */
  property?: string | null;
  /** English letter code used by Thai staff (e.g. B1, A2, G5) */
  letterCode?: string | null;
  /** Key safe lockbox pin code (e.g. 2810) */
  lockbox?: string | null;
  /** Usage classification */
  usage?: RoomUsage;
  /** Whether room is available for guest reservations */
  booking_enabled?: boolean;
  /** Free-form names/aliases in any language, used for resolving room_raw */
  aliases: string[];
}

export function isBookableRoom(room?: RoomEntry | null): boolean {
  if (!room) return false;
  if (room.booking_enabled === false) return false;
  if (room.usage && room.usage !== 'GUEST_ACCOMMODATION') return false;
  return true;
}

export function isStaffRoom(room?: RoomEntry | null): boolean {
  return room?.usage === 'STAFF_ACCOMMODATION' || room?.id === 'k678' || room?.id === 'k679';
}

export function isOfficeRoom(room?: RoomEntry | null): boolean {
  return room?.usage === 'OFFICE' || room?.id === 'pilot-office';
}

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

for (const file of [process.env.AGENT_ENV_FILE, path.join(ROOT, '.env'), path.resolve(ROOT, '../../.env')]) {
  if (file) loadEnvFile(file);
}

const env = (k: string, d: string): string => process.env[k] ?? d;

function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN && existsSync(process.env.PYTHON_BIN)) return process.env.PYTHON_BIN;
  for (const candidate of [
    path.join(ROOT, '.venv', 'bin', 'python'),
    path.join(ROOT, '.venv', 'bin', 'python3.11'),
    '/opt/homebrew/opt/python@3.11/bin/python3.11',
    '/opt/homebrew/bin/python3',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return path.join(ROOT, '.venv', 'bin', 'python');
}

export const config = {
  port: Number(env('AGENT_PORT', '8787')),
  authDir: env('AUTH_DIR', path.join(ROOT, 'auth_info_baileys')),
  tmpDir: env('TMP_DIR', path.join(ROOT, 'tmp')),
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  ollama: {
    url: env('OLLAMA_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'gemma4:12b'),
    timeoutMs: Number(env('OLLAMA_TIMEOUT_MS', '120000')),
    keepAlive: env('OLLAMA_KEEP_ALIVE', '24h'),
  },
  stt: {
    python: resolvePythonBin(),
    script: path.join(ROOT, 'src', 'stt', 'transcriber.py'),
    model: env('WHISPER_MODEL', 'mlx-community/whisper-large-v3-turbo'),
    timeoutMs: Number(env('STT_TIMEOUT_MS', '30000')),
  },
  resortos: {
    baseUrl: env('RESORTOS_URL', 'http://127.0.0.1:4038'),
    /** Approved agent-connection credential (ros_agent_…). Create it with `npm run connect`. */
    token: env('RESORTOS_TOKEN', ''),
    timeoutMs: Number(env('RESORTOS_TIMEOUT_MS', '2000')),
  },
  supabase: {
    url: env('SUPABASE_URL', 'http://127.0.0.1:54321'),
    key: env('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'),
  },
  /** Shared secret expected from ResortOS on POST /api/cleaners/dispatch (header x-agent-token). Empty = no auth. */
  dispatchToken: env('DISPATCH_TOKEN', ''),
  typing: {
    minMs: Number(env('TYPING_MIN_MS', '800')),
    maxMs: Number(env('TYPING_MAX_MS', '3500')),
    msPerChar: Number(env('TYPING_MS_PER_CHAR', '35')),
  },
  gmail: {
    user: env('GMAIL_USER', ''),
    appPassword: env('GMAIL_APP_PASSWORD', ''),
  },
};

function loadJson<T>(file: string, fallback: T): T {
  const p = path.join(config.dataDir, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

/** data/cleaners.json: CleanerProfile[] */
export const loadCleaners = (): CleanerProfile[] => loadJson<CleanerProfile[]>('cleaners.json', []);
/** data/rooms.json: RoomEntry[] */
export const loadRooms = (): RoomEntry[] => loadJson<RoomEntry[]>('rooms.json', []);
