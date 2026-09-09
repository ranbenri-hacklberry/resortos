const STORE = 'hotelos-guest-theme';

/** Brand Book Mialees Resort 2025 */
export const GUEST_BRAND = {
  wine: '#26130F',
  mocha: '#736055',
  cloudy: '#BFB3A8',
  cream: '#FDFBF7',
  pinkDream: '#F2E4E9',
  candy: '#F2D5DD',
  deepPink: '#59454A',
  fontBody: "'Heebo', 'Assistant', system-ui, sans-serif",
  fontMark: "'Montserrat', 'Heebo', sans-serif"
};

const LIGHT_BG = GUEST_BRAND.cream;
const DARK_BG = GUEST_BRAND.wine;

export function readGuestTheme(fallback = 'light') {
  try {
    const stored = localStorage.getItem(STORE);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) {}
  return fallback === 'dark' ? 'dark' : 'light';
}

export function persistGuestTheme(theme) {
  try {
    localStorage.setItem(STORE, theme === 'dark' ? 'dark' : 'light');
  } catch (_) {}
}

export function applyGuestTheme(theme) {
  const isLight = theme !== 'dark';
  const bg = isLight ? LIGHT_BG : DARK_BG;
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.documentElement.style.background = bg;
  document.body.style.background = bg;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bg);
}

export function guestThemeStyles(theme) {
  const isLight = theme !== 'dark';
  return {
    wrapperBg: isLight ? LIGHT_BG : DARK_BG,
    cardBg: isLight ? LIGHT_BG : DARK_BG,
    inputBg: isLight ? '#FFFFFF' : '#3A221C',
    inputBorder: isLight ? GUEST_BRAND.cloudy : 'rgba(242, 228, 233, 0.18)',
    textPrimary: isLight ? GUEST_BRAND.wine : GUEST_BRAND.pinkDream,
    textMuted: isLight ? GUEST_BRAND.mocha : GUEST_BRAND.cloudy,
    accent: isLight ? GUEST_BRAND.wine : GUEST_BRAND.candy,
    accentSoft: isLight ? GUEST_BRAND.candy : 'rgba(242, 213, 221, 0.18)',
    cta: isLight ? GUEST_BRAND.wine : GUEST_BRAND.candy,
    ctaText: isLight ? '#FFF' : GUEST_BRAND.wine,
    success: isLight ? GUEST_BRAND.mocha : GUEST_BRAND.candy,
    warning: '#B45309',
    font: GUEST_BRAND.fontBody,
    shadow: 'none'
  };
}

/** Staff placeholders like "הזמנה בטיפול (WhatsApp)" must not appear in the guest name field. */
export function usableGuestName(raw) {
  const name = String(raw || '').trim();
  if (!name) return '';
  if (/whatsapp|ווטסאפ|וואטסאפ/i.test(name)) return '';
  return name;
}

/** Same /stay/:token link: after deposit/confirm, skip the checkout form. */
export function guestShouldSeeStayPortal(booking) {
  if (!booking) return false;
  const status = booking.booking_status;
  if (status === 'CONFIRMED' || status === 'CHECKED_IN' || status === 'CHECKED_OUT') return true;
  const pay = booking.payment_status;
  if (pay === 'DEPOSIT_PAID' || pay === 'PAID' || pay === 'PARTIAL') return true;
  if (booking.stay?.hyp_deposit?.paid || booking.stay?.hyp?.paid) return true;
  if (booking.stay?.hyp_intent?.status === 'paid') return true;
  return false;
}

export const HOLD_MS = 15 * 60 * 1000;

/** Countdown starts when the WhatsApp checkout link is sent — not when the guest opens it. */
export function holdStartedAt(booking) {
  return booking?.stay?.link_sent_at || booking?.link_sent_at || booking?.created_at || null;
}

export function holdRemainingMs(startedAt, now = Date.now()) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return HOLD_MS;
  return Math.max(0, start + HOLD_MS - now);
}

export function formatHoldClock(ms) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
