import { israelToday } from './cabinAccess';

export const GUEST_DEMO_PHASES = [
  { id: 'pre', label: 'לפני צ׳ק-אין' },
  { id: 'stay', label: 'אחרי צ׳ק-אין' },
  { id: 'post', label: 'אחרי צ׳ק-אאוט' }
];

export function normalizeDemoPhase(value) {
  return GUEST_DEMO_PHASES.some((row) => row.id === value) ? value : 'pre';
}

function shiftIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return israelToday(date);
}

const DEMO_CODES = {
  cabin_ready: true,
  door_pin: '2310',
  gate_code: '#2464',
  gate_mode: 'code',
  wifi_ssid: 'MIALEES RESORT',
  wifi_password: 'MIAL2026',
  wifi_networks: [{ ssid: 'MIALEES RESORT', password: 'MIAL2026' }],
  folio: [],
  checkout_time: '11:00',
  field_rep_phone: '0547136676',
  guest_checked_in_at: '2026-08-20T12:00:00.000Z'
};

/** Local demo booking — no checkout_token, so the real mailbox is never called. */
export function demoGuestBooking(phase) {
  const today = israelToday();
  const base = {
    id: 'demo_stay',
    guest_name: 'אורחת דמו',
    guest_phone: '0500000000',
    unit_id: 'k671',
    adults_count: 2,
    children_count: 1,
    total_price_agorot: 500,
    deposit_agorot: 100,
    payment_status: 'PAID',
    payment_mode: 'CREDIT_DEPOSIT',
    channel_source: 'DIRECT'
  };

  if (phase === 'stay') {
    return {
      ...base,
      check_in_date: today,
      check_out_date: shiftIso(today, 2),
      booking_status: 'CHECKED_IN',
      stay: { ...DEMO_CODES, baby_cot_required: true }
    };
  }

  if (phase === 'post') {
    return {
      ...base,
      check_in_date: shiftIso(today, -3),
      check_out_date: shiftIso(today, -1),
      booking_status: 'CHECKED_OUT',
      stay: {
        ...DEMO_CODES,
        self_checked_out_at: new Date().toISOString()
      }
    };
  }

  return {
    ...base,
    check_in_date: shiftIso(today, 2),
    check_out_date: shiftIso(today, 4),
    booking_status: 'CONFIRMED',
    stay: { cabin_ready: false, folio: [], checkout_time: '11:00', baby_cot_required: true }
  };
}
