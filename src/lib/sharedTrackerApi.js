import { getStoredToken } from './staffAuth';

export async function fetchSharedTracker() {
  const token = getStoredToken();
  if (!token) return null;
  const response = await fetch('/api/auth/tracker', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return null;
  return response.json();
}

export async function saveSharedTracker(payload) {
  const token = getStoredToken();
  if (!token) return null;
  const response = await fetch('/api/auth/tracker', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return null;
  return response.json();
}
