import { fetchPostgrest } from '../api/_db.js';

export async function verifyStaffPin(env, pin) {
  const digits = String(pin || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length !== 4) return null;
  const res = await fetchPostgrest('/rpc/hotelos_verify_staff_pin', {
    method: 'POST',
    body: JSON.stringify({ p_pin: digits })
  }, env);
  if (res && res.ok) {
    const data = await res.json().catch(() => null);
    if (data?.id) return data;
  }
  const fallback = String(env?.HOTELOS_CASH_PIN || '').replace(/\D/g, '');
  if (fallback.length === 4 && fallback === digits) {
    return { id: null, display_name: 'נציג', username: 'field' };
  }
  return null;
}
