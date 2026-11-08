/**
 * Floating Chloe WhatsApp on guest pre-check-in screens.
 * Sits on the inline-start corner so it stays off the primary (inline-end) pay button.
 * Hidden while Cardcom's iframe is open and while the receipt redirect replaces the page.
 */

export const GUEST_WA_FAB_EDGE = 'inline-start';

const PRECHECK = new Set(['loading', 'error', 'form', 'pre']);

export function guestWhatsAppFabVisible({
  cardcom = false,
  redirecting = false,
  surface = 'form'
} = {}) {
  if (cardcom || redirecting) return false;
  return PRECHECK.has(surface);
}

/** True while GuestCheckout is about to hand the browser to the Cardcom return URL. */
export function isCardcomRedirectSearch(search = '') {
  const raw = String(search || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw.replace(/^\?/, '');
  const params = new URLSearchParams(q);
  if (params.get('hyp')) return false;
  const ccode = params.get('CCode');
  if (ccode == null || ccode === '') return false;
  return Boolean(params.get('Id') || params.get('Order'));
}
