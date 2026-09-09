export function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/** Village vehicle gate is locked overnight (22:00–06:00 Israel). Daytime arrivals do not need a night-call. */
export function isVillageGateNight(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hour12: false
    }).formatToParts(now).find((part) => part.type === 'hour')?.value || 0
  );
  return hour >= 22 || hour < 6;
}

export function isCabinGuestReady(unit) {
  if (!unit || unit.operational_status !== 'READY') return false;
  const inspections = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  const last = inspections[inspections.length - 1];
  if (!last) return false;
  return last.reopened !== true;
}

export function hasNextGuestToday(booking, bookings, today = israelToday()) {
  if (!booking) return false;
  return (bookings || []).some((row) => (
    row.id !== booking.id &&
    row.unit_id === booking.unit_id &&
    !row.deleted_at &&
    row.booking_status !== 'CANCELED' &&
    row.check_in_date === today &&
    booking.check_out_date === today
  ));
}

export function hasOpenOpsWork(unit) {
  const status = unit?.operational_status;
  return status === 'DIRTY' || status === 'IN_PROGRESS' || status === 'MAINTENANCE_ALERT' || status === 'GARDENING';
}

export function publicStay(stay) {
  if (!stay) {
    return { cabin_ready: false, operational_status: 'DIRTY', folio: [], checkout_time: '11:00' };
  }
  if (stay.cabin_ready) return stay;
  return {
    ...stay,
    door_pin: null,
    gate_code: null,
    gate_mode: stay.gate_mode || null,
    gate_night_call: Boolean(stay.gate_night_call),
    wifi_ssid: null,
    wifi_password: null,
    wifi_networks: []
  };
}

export const CABIN_STORE = [
  {
    id: 'jachnun',
    title: 'ג׳חנון אסלי לשבת בבוקר',
    desc: 'אפייה איטית כל הלילה, ביצה חומה, רסק טרי וסחוג ירוק. מוגש לשבת 08:30–10:30.',
    price: 38,
    kind: 'jachnun'
  },
  {
    id: 'towel',
    title: 'מגבת שטח וכנרת צבעונית',
    desc: 'מגבת חוף נעימה. מושלמת למעיינות ולכנרת – שלכם לקחת הביתה.',
    price: 19,
    kind: 'qty'
  },
  {
    id: 'bbq',
    title: 'ערכת מנגל מושלמת',
    desc: 'שק פחמים (2 ק״ג), מדליק פחמים, גפרורים ומנפנף. ממתין בעמדת המנגל.',
    price: 35,
    kind: 'once'
  },
  {
    id: 'wine',
    title: 'יין מקומי · יקבי הגולן',
    desc: 'ממתין צונן במקרר הבקתה לפתיחה מיידית.',
    price: 69,
    kind: 'once'
  }
];

export function jachnunOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    hour12: false
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  if (weekday === 'Fri') return hour < 18;
  if (weekday === 'Sat') return false;
  return true;
}

export const LATE_NEXT_GUEST = [
  { until: '12:00', price: 60 },
  { until: '13:00', price: 120 },
  { until: '14:00', price: 180 }
];

export const LATE_FREE_DAY = [
  { until: '18:00', price: 250, label: 'until_18' },
  { until: 'next', price: 390, label: 'extra_night' }
];
