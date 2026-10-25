import { randomInt, timingSafeEqual } from 'crypto';
import { toMicropayPhone } from '../src/lib/micropaySms.js';
import { sha256 } from './mcpAuth.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS = 3;
const MAX_ATTEMPTS = 5;
const BLOCKED_PHONES = new Set(['0548076123']);

function hashEq(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createOtpGate({
  findManager,
  sendSms,
  now = () => new Date(),
  nextCode = () => String(randomInt(0, 1000000)).padStart(6, '0')
} = {}) {
  const pending = new Map();
  const sends = new Map();

  return {
    async request(phone) {
      const normalized = toMicropayPhone(phone);
      if (!normalized || BLOCKED_PHONES.has(normalized)) return { accepted: true };
      const stamp = now().getTime();
      const recent = (sends.get(normalized) || []).filter((at) => stamp - at < SEND_WINDOW_MS);
      if (recent.length >= MAX_SENDS) {
        const err = new Error('RATE_LIMIT');
        err.status = 429;
        throw err;
      }
      const user = await findManager(normalized);
      if (!user?.id || String(user.role || '').toUpperCase() !== 'MANAGER' || user.is_active === false) {
        return { accepted: true };
      }
      const code = nextCode();
      pending.set(normalized, {
        hash: sha256(code),
        expires: stamp + OTP_TTL_MS,
        attempts: 0,
        user: {
          id: String(user.id),
          username: String(user.username || ''),
          display_name: String(user.display_name || user.name || user.username || ''),
          role: 'MANAGER',
          tenant_id: String(user.tenant_id || user.business_id || ''),
          allowed_units: Array.isArray(user.allowed_units) ? user.allowed_units : [],
          is_active: true
        }
      });
      recent.push(stamp);
      sends.set(normalized, recent);
      try {
        await sendSms(normalized, code);
      } catch (err) {
        pending.delete(normalized);
        sends.set(normalized, recent.filter((at) => at !== stamp));
        const wrapped = new Error('SMS_SEND_FAILED');
        wrapped.status = Number(err.status) || 502;
        throw wrapped;
      }
      return { accepted: true };
    },
    verify(phone, code) {
      const normalized = toMicropayPhone(phone);
      const row = pending.get(normalized);
      if (!row || row.expires <= now().getTime()) {
        const err = new Error('OTP_INVALID');
        err.status = 401;
        throw err;
      }
      row.attempts += 1;
      const ok = hashEq(sha256(String(code || '').trim()), row.hash);
      if (!ok || row.attempts > MAX_ATTEMPTS) {
        if (row.attempts >= MAX_ATTEMPTS) pending.delete(normalized);
        const err = new Error('OTP_INVALID');
        err.status = 401;
        throw err;
      }
      pending.delete(normalized);
      return row.user;
    }
  };
}
