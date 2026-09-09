import { getStoredToken } from './staffAuth';

async function smsFetch(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/sms${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'SMS_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function sendStaffSms({ phone, message }) {
  return smsFetch('/send', {
    method: 'POST',
    body: JSON.stringify({ phone, message })
  });
}

export function fetchSmsCredit() {
  return smsFetch('/credit');
}
