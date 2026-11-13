export async function fetchKinorotAudit(params = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.resId) q.set('res_id', String(params.resId));
  if (params.guest) q.set('guest', String(params.guest));
  const response = await fetch(`/api/kinorot/audit?${q.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error || `KINOROT_AUDIT_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}
