import { MICROPAY_SMS_URL, micropaySender, parseMicropayResponse, toMicropayPhone } from '../src/lib/micropaySms.js';

export function micropayConfig() {
  return {
    token: String(process.env.MICROPAY_TOKEN || '').trim(),
    from: micropaySender(process.env.MICROPAY_FROM || ''),
    url: String(process.env.MICROPAY_URL || MICROPAY_SMS_URL).trim() || MICROPAY_SMS_URL
  };
}

function httpError(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

async function micropayRequest(payload) {
  const cfg = micropayConfig();
  if (!cfg.token) throw httpError('MICROPAY_TOKEN_MISSING', 503);
  const response = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: cfg.token, ...payload }),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  const parsed = parseMicropayResponse(text);
  if (!parsed.ok) {
    const status = parsed.message === 'NOT_ENOUGH_CREDIT' ? 402 : (parsed.message === 'ERROR' ? 502 : 502);
    throw httpError(parsed.message || 'SMS_SEND_FAILED', status, { description: parsed.description });
  }
  return parsed;
}

export async function sendMicropaySms({ phone, message, from } = {}) {
  const cfg = micropayConfig();
  const list = toMicropayPhone(phone);
  const sender = micropaySender(from || cfg.from);
  const msg = String(message || '').trim();
  if (!list) throw httpError('SMS_PHONE_INVALID', 400);
  if (!sender) throw httpError('MICROPAY_FROM_MISSING', 503);
  if (!msg || msg.length > 1400) throw httpError('SMS_MESSAGE_INVALID', 400);
  return micropayRequest({ from: sender, msg, list });
}

export async function fetchMicropayCredit() {
  return micropayRequest({ act: 'credit' });
}
