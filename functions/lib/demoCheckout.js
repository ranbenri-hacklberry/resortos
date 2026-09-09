import { DEFAULT_TENANT_ID } from '../api/_db.js';

export const DEMO_STAY_AGOROT = 500;
export const DEMO_DEPOSIT_AGOROT = 100;

function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

function shiftIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return israelToday(date);
}

function demoToken() {
  const raw = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}${Math.random()}`;
  return `tok_demo_${String(raw).replace(/-/g, '').slice(0, 16)}`;
}

export function buildDemoCheckoutRow(stage = 'form') {
  const today = israelToday();
  const token = demoToken();
  const now = new Date().toISOString();
  const forStay = stage === 'stay';
  const checkIn = forStay ? today : shiftIso(today, 2);
  const checkOut = shiftIso(checkIn, 2);
  const stay = forStay
    ? {
      cabin_ready: false,
      folio: [],
      checkout_time: '11:00',
      baby_cot_required: true,
      demo: true,
      hyp_deposit: { paid: true, at: now, amount: '1.00' },
      hyp_intent: { purpose: 'deposit', terminal: 'B', stage: 'confirm', amount: 1, status: 'paid' }
    }
    : {
      cabin_ready: false,
      folio: [],
      checkout_time: '11:00',
      baby_cot_required: true,
      demo: true
    };
  const out = new Date(`${checkOut}T23:59:59`);
  out.setDate(out.getDate() + 2);
  return {
    id: `demo_${token.slice(9)}`,
    tenant_id: DEFAULT_TENANT_ID,
    unit_id: 'k671',
    guest_name: 'אורחת דמו',
    guest_email: forStay ? 'demo@resortos.app' : '',
    guest_phone: '0500000000',
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults_count: 2,
    children_count: 1,
    baby_cot_required: true,
    total_price_agorot: DEMO_STAY_AGOROT,
    deposit_agorot: DEMO_DEPOSIT_AGOROT,
    booking_status: forStay ? 'CONFIRMED' : 'PENDING',
    payment_status: forStay ? 'DEPOSIT_PAID' : 'UNPAID',
    payment_mode: 'CREDIT_DEPOSIT',
    channel_source: 'DEMO',
    checkout_token: token,
    special_requests: '',
    expires_at: out.toISOString(),
    created_at: now,
    updated_at: now,
    link_sent_at: now,
    stay
  };
}
