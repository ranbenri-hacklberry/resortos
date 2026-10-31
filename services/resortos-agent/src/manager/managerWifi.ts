/**
 * Manager-only Wi-Fi questions (Ran 2026-10-22).
 * Named complex/room -> SSID + password. Unnamed -> ask which complex, remember a short
 * pending intent per manager (10 min) and treat the follow-up ("טאג׳ מאהל", "E") as the answer.
 * Never used for guests. Siesta is not handled.
 */
import { COMPLEXES, type ComplexDefinition } from './managerFuzzyMatcher.js';
import { matchComplex } from './managerQuestions.js';
import { PROPERTY_WIFI, type WifiInfo } from '../guest/guestKnowledge.js';
import { WIFI_RE, LOCKBOX_RE, GATE_RE } from '../guest/keywords.js';

/** Letter / number codes used by the team: A/29 ... G/23. */
export const COMPLEX_CODES: Record<string, { letter: string; num: number; key: string }> = {
  A: { letter: 'A', num: 29, key: 'mool' },
  B: { letter: 'B', num: 28, key: 'nofim' },
  C: { letter: 'C', num: 27, key: 'toscana' },
  D: { letter: 'D', num: 26, key: 'musical' },
  E: { letter: 'E', num: 25, key: 'taj' },
  F: { letter: 'F', num: 24, key: 'maya' },
  G: { letter: 'G', num: 23, key: 'nurit' },
};

const THAI_WIFI_RE = /ไวไฟ|วายฟาย|wi-?fi|อินเทอร์เน็ต|อินเตอร์เน็ต|รหัสเน็ต|รหัสไวไฟ|รหัสวายฟาย/i;
const LOOSE_WIFI_RE = /(?:^|[\s,.?!])(?:ה|ל|של\s*)?(?:וויפי|ווייפי|ויפי|וייפי|וואיפיי|וואי\s?פיי?)(?:$|[\s,.?!])|סיסמ[אה]\s+(?:ל|של\s*)?(?:ה)?(?:רשת|אינטרנט|וויפי|ויפי)|\bwi-?fi\b|\bwireless\b|\bnetwork\s+password\b/i;

export function isManagerWifiQuestion(text?: string | null): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 120) return false;
  const loose = LOOSE_WIFI_RE.test(t) || THAI_WIFI_RE.test(t);
  if (loose) return true;
  if (!WIFI_RE.test(t)) return false;
  // "סיסמה"/"רשת" alone are too generic when the message is about a safe or the gate.
  if (LOCKBOX_RE.test(t) || GATE_RE.test(t)) return false;
  return true;
}

function complexByKey(key: string): ComplexDefinition | undefined {
  return COMPLEXES.find((c) => c.key === key);
}

/** Resolve a complex from Hebrew names, letter codes (E, E2, E/25) or 25-style codes. */
export function resolveWifiComplex(text: string, opts: { followUp?: boolean } = {}): ComplexDefinition | null {
  const t = String(text || '').trim();
  const named = matchComplex(t);
  if (named) return named;
  const slash = t.match(/(?<![A-Za-z])([A-Ga-g])\s*\/\s*(2[3-9])(?!\d)/);
  if (slash) return complexByKey(COMPLEX_CODES[slash[1].toUpperCase()].key) || null;
  const letterRe = opts.followUp ? /(?<![A-Za-z])([A-Ga-g])(?:\s*\d{1,2})?(?![A-Za-z])/ : /(?<![A-Za-z])([A-G])(?:\s*\d{1,2})?(?![A-Za-z])/;
  const letter = t.match(letterRe);
  if (letter) return complexByKey(COMPLEX_CODES[letter[1].toUpperCase()].key) || null;
  const num = opts.followUp ? t.match(/^\s*(2[3-9])\s*$/) : t.match(/(?<!\d)\/\s*(2[3-9])(?!\d)/);
  if (num) {
    const code = Object.values(COMPLEX_CODES).find((c) => c.num === Number(num[1]));
    if (code) return complexByKey(code.key) || null;
  }
  return null;
}

export function wifiForComplex(c: ComplexDefinition): WifiInfo | null {
  return PROPERTY_WIFI[c.key] || null;
}

export function formatComplexWifi(c: ComplexDefinition): string {
  const w = wifiForComplex(c);
  if (!w) return `אין אצלי פרטי וויפי שמורים ל*${c.officialName}*.`;
  return `📶 *וויפי · ${c.officialName}*\n• רשת: *${w.ssid}*\n• סיסמה: *${w.password}*`;
}

export function wifiComplexPrompt(): string {
  const lines = Object.values(COMPLEX_CODES).map((code) => {
    const c = complexByKey(code.key);
    return `• ${code.letter}/${code.num} ${c?.officialName || ''}`;
  });
  return `📶 של איזה מתחם הוויפי?\n${lines.join('\n')}`;
}

export const WIFI_PENDING_TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, number>();

export function clearWifiPending(managerKey?: string): void {
  if (managerKey) pending.delete(managerKey); else pending.clear();
}

export function hasWifiPending(managerKey: string, now = Date.now()): boolean {
  const at = pending.get(managerKey);
  if (at === undefined) return false;
  if (now - at > WIFI_PENDING_TTL_MS) { pending.delete(managerKey); return false; }
  return true;
}

/**
 * Returns a reply for a manager message, or null to let the other manager flows handle it.
 * Callers must only pass authorized managers.
 */
export function handleManagerWifi(managerKey: string, text: string, now = Date.now()): string | null {
  const t = String(text || '').trim();
  if (!t) return null;
  if (isManagerWifiQuestion(t)) {
    const c = resolveWifiComplex(t);
    if (c) { pending.delete(managerKey); return formatComplexWifi(c); }
    pending.set(managerKey, now);
    return wifiComplexPrompt();
  }
  if (hasWifiPending(managerKey, now)) {
    const c = t.length <= 40 ? resolveWifiComplex(t, { followUp: true }) : null;
    pending.delete(managerKey);
    if (c) return formatComplexWifi(c);
  }
  return null;
}
