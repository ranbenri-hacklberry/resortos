import { fetchPostgrest } from '../api/_db.js';

export function cardFromHypParams(params = {}) {
  const token = String(params.HK || params.Token || params.CCToken || params.token || '').trim();
  const last4 = String(params.L4digit || params.last4 || '').replace(/\D/g, '').slice(-4);
  const expMonth = String(params.Tmonth || params.TMonth || params.exp_month || '').replace(/\D/g, '').padStart(2, '0').slice(-2);
  const expYear = String(params.Tyear || params.TYear || params.exp_year || '').replace(/\D/g, '').slice(-2);
  return {
    token,
    last_4: last4,
    card_brand: String(params.Brand || params.brand || params.card_brand || '').trim() || null,
    exp_month: expMonth || null,
    exp_year: expYear || null
  };
}

export function publicCard(card) {
  if (!card || typeof card !== 'object') return null;
  return {
    gateway: card.gateway || 'hyp',
    last_4: card.last_4 || card.last4 || '',
    card_brand: card.card_brand || card.brand || '',
    exp_month: card.exp_month || '',
    exp_year: card.exp_year || '',
    has_token: Boolean(card.token || card.has_token)
  };
}

export function stripCardSecrets(stay) {
  if (!stay || typeof stay !== 'object') return stay;
  const next = { ...stay };
  if (next.hyp_card) next.hyp_card = publicCard(next.hyp_card);
  if (next.hyp_deposit && typeof next.hyp_deposit === 'object') {
    const { token, HK, CCToken, ...rest } = next.hyp_deposit;
    next.hyp_deposit = rest;
  }
  if (next.hyp && typeof next.hyp === 'object') {
    const { token, HK, CCToken, ...rest } = next.hyp;
    next.hyp = rest;
  }
  return next;
}

export async function persistReservationPaymentMethod(env, booking, card) {
  const token = String(card?.token || '').trim();
  if (!token || !booking?.id) return false;
  const row = {
    booking_id: booking.id,
    checkout_token: booking.checkout_token || null,
    gateway: card.gateway || 'hyp',
    token,
    last_4: String(card.last_4 || '').slice(-4),
    card_brand: card.card_brand || null,
    exp_month: card.exp_month || null,
    exp_year: card.exp_year || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };
  const res = await fetchPostgrest('/reservation_payment_methods', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row)
  }, env);
  if (res && !res.ok) {
    console.warn('[payment_methods]', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}
