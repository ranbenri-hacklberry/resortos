const TOKEN_KEY = 'resortos-agent-token';

export function agentApiBase() {
  const fromEnv = import.meta.env.VITE_AGENT_API_URL;
  if (fromEnv && /^https?:\/\//.test(fromEnv)) return fromEnv.replace(/\/$/, '');
  return '';
}

export function readAgentToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function writeAgentToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

async function agentFetch(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const token = readAgentToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${agentApiBase()}/api/agent/${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || data.error || 'AGENT_API_FAILED');
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const agentLogin = (phone, pin) => agentFetch('login', { method: 'POST', body: { phone, pin } });
export const agentLogout = () => agentFetch('logout', { method: 'POST' });
export const agentMe = () => agentFetch('me');
export const agentAvailability = (from, to) => agentFetch(`calendar?from=${from}&to=${to}`);
export const agentReserve = (body) => agentFetch('reserve', { method: 'POST', body });
export const agentSoftLock = (body) => agentFetch('soft-lock', { method: 'POST', body: { ...body, start_hyp: false } });
export const agentHypSession = (body) => agentFetch('create-hyp-session', { method: 'POST', body });
export const agentVerify = (body) => agentFetch('verify-payment', { method: 'POST', body });
