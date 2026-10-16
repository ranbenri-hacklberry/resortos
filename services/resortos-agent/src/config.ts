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
  role?: 'MANAGER' | 'OPS_MANAGER' | 'HOUSEKEEPING' | 'MAINTENANCE';
  language: Lang;
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

const env = (k: string, d: string): string => process.env[k] ?? d;

export const config = {
  port: Number(env('AGENT_PORT', '8787')),
  authDir: env('AUTH_DIR', path.join(ROOT, 'auth_info_baileys')),
  tmpDir: env('TMP_DIR', path.join(ROOT, 'tmp')),
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  ollama: {
    url: env('OLLAMA_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'Julioa/Qwen3.8-27B-UD-Q3_K_XL:latest'),
    timeoutMs: Number(env('OLLAMA_TIMEOUT_MS', '120000')),
    keepAlive: env('OLLAMA_KEEP_ALIVE', '24h'),
  },
  stt: {
    python: env('PYTHON_BIN', path.join(ROOT, '.venv', 'bin', 'python')),
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
