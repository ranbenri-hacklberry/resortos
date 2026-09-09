import { normalizeAllowedUnitIds } from './units';

const TOKEN_KEY = 'hotelos-session-token';

function withAllowedUnits(user) {
  if (!user) return user;
  return {
    ...user,
    allowed_units: normalizeAllowedUnitIds(user.allowed_units)
  };
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

async function authFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/auth${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(12000)
  });
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const err = new Error(data?.error || 'AUTH_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function loginStaff(username, password) {
  const result = await authFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (!result?.token || !result?.user) {
    throw new Error('INVALID_CREDENTIALS');
  }
  setStoredToken(result.token);
  result.user = withAllowedUnits(result.user);
  return result;
}

export async function fetchStaffMe() {
  const result = await authFetch('/me');
  return withAllowedUnits(result?.user || null);
}

export async function logoutStaff() {
  try {
    await authFetch('/logout', { method: 'POST' });
  } catch {
    /* still clear local session */
  }
  setStoredToken('');
}

export async function listStaff() {
  const result = await authFetch('/staff');
  const list = Array.isArray(result?.staff) ? result.staff : [];
  return list.map(withAllowedUnits);
}

export async function createStaffAccount(payload) {
  const result = await authFetch('/staff', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      allowed_units: normalizeAllowedUnitIds(payload?.allowed_units)
    })
  });
  if (result?.user) result.user = withAllowedUnits(result.user);
  return result;
}

export async function fetchAttendanceSettings() {
  const result = await authFetch('/attendance/settings');
  return result?.settings || null;
}

export async function saveAttendanceSettings(payload) {
  return authFetch('/attendance/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function updateStaffAccount(id, payload) {
  const result = await authFetch(`/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...payload,
      allowed_units: normalizeAllowedUnitIds(payload?.allowed_units)
    })
  });
  if (result?.user) result.user = withAllowedUnits(result.user);
  return result;
}

export async function deactivateStaffAccount(id) {
  return authFetch(`/staff/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST'
  });
}

export async function revealStaffPassword(id) {
  return authFetch(`/staff/${encodeURIComponent(id)}/password`);
}

export async function listAgents() {
  try {
    const result = await authFetch('/agents');
    return Array.isArray(result?.agents) ? result.agents : [];
  } catch {
    return [];
  }
}

export async function upsertAgentAccount(payload) {
  return authFetch('/agents', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  });
}

export async function deactivateAgentAccount(id) {
  return authFetch(`/agents/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}
