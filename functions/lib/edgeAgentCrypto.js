export function normalizeAgentPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function normalizeAgentPin(pin) {
  return String(pin || '').replace(/\D/g, '').slice(0, 4);
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return bytesToHex(buf);
}

export function pinPepper(env) {
  return String(env?.AGENT_PIN_PEPPER || env?.CHECKOUT_MAILBOX_SECRET || '').trim();
}

export function sessionSecret(env) {
  return String(env?.AGENT_SESSION_SECRET || env?.CHECKOUT_MAILBOX_SECRET || '').trim();
}

export async function hashAgentPin(phone, pin, pepper) {
  const digits = normalizeAgentPhone(phone);
  const pin4 = normalizeAgentPin(pin);
  return `sha256:${await sha256Hex(`${pepper}:${digits}:${pin4}`)}`;
}

export function isEdgePinHash(value) {
  return /^sha256:[0-9a-f]{64}$/i.test(String(value || ''));
}

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(text) {
  const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(sig);
}

export async function signAgentSession(agent, secret, ttlSec = 14 * 24 * 3600) {
  const payload = {
    agent_id: agent.id,
    agent_name: agent.name,
    commission_rate: Number(agent.commission_rate) || 0.1,
    exp: Math.floor(Date.now() / 1000) + ttlSec
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

export async function readAgentSession(token, secret) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot < 8 || !secret) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmacHex(secret, body);
  if (sig.length !== expected.length) return null;
  let ok = 0;
  for (let i = 0; i < expected.length; i += 1) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body));
    if (!payload?.agent_id || Number(payload.exp) * 1000 < Date.now()) return null;
    return {
      id: payload.agent_id,
      name: payload.agent_name,
      commission_rate: Number(payload.commission_rate) || 0.1
    };
  } catch {
    return null;
  }
}

export const AGENT_COOKIE = 'resortos_agent';

export function cookieHeader(token, maxAge = 14 * 24 * 3600) {
  const parts = [
    `${AGENT_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ];
  return parts.join('; ');
}

export function clearCookieHeader() {
  return `${AGENT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function tokenFromRequest(request) {
  const header = String(request.headers.get('authorization') || '');
  const bearer = header.match(/^Bearer\s+(\S+)/i);
  if (bearer) return bearer[1];
  const cookie = String(request.headers.get('cookie') || '');
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${AGENT_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}
