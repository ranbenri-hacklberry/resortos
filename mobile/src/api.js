import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './config';

const TOKEN_KEY = 'resortos_dashboard_token_v1';
const USER_KEY = 'resortos_dashboard_user_v1';
const DEVICE_KEY = 'resortos_device_uuid_v1';
const TAP_SESSION_KEY = 'resortos_tap_session_v1';
const PENDING_KEY = 'resortos_tap_pending_v1';

export async function getToken() {
  return (await SecureStore.getItemAsync(TOKEN_KEY)) || '';
}

export async function getUser() {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(token, user) {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  if (user) {
    const text = typeof user === 'string' ? user : JSON.stringify(user);
    await SecureStore.setItemAsync(USER_KEY, text);
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getDeviceUuid() {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  if (global.crypto?.getRandomValues) global.crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  await SecureStore.setItemAsync(DEVICE_KEY, uuid);
  return uuid;
}

export const tapSessionStore = {
  async get() {
    return SecureStore.getItemAsync(TAP_SESSION_KEY);
  },
  async set(value) {
    await SecureStore.setItemAsync(TAP_SESSION_KEY, value);
  },
  async del() {
    await SecureStore.deleteItemAsync(TAP_SESSION_KEY);
  }
};

export async function getPendingCharge() {
  const raw = await SecureStore.getItemAsync(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setPendingCharge(value) {
  if (!value) {
    await SecureStore.deleteItemAsync(PENDING_KEY);
    return;
  }
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(value));
}

export async function api(method, path, body) {
  const token = await getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: 'אין רשת' };
  }
  const data = await res.json().catch(() => ({ ok: false, code: 'BAD_RESPONSE', message: 'תשובה לא תקינה' }));
  if (res.status === 401) data.unauthorized = true;
  return data;
}

export async function loginWithPassword(username, password) {
  const res = await fetch(`${API_BASE}/api/dashboard/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (data.token) await saveSession(data.token, data.user);
  return data;
}

export async function sendOtp(phone) {
  const res = await fetch(`${API_BASE}/api/dashboard/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone })
  });
  return res.json().catch(() => ({ ok: false, message: 'לא הצלחנו לשלוח קוד' }));
}

export async function verifyOtp(phone, otp, challenge) {
  const res = await fetch(`${API_BASE}/api/dashboard/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone, otp, challenge })
  });
  const data = await res.json().catch(() => ({ ok: false }));
  if (data.token) await saveSession(data.token, data.user);
  return data;
}
