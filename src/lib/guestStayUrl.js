export const DEFAULT_GUEST_ORIGIN = 'https://resortos.app';
const CUSTOM_DOMAIN_KEY = 'hotelos-custom-domain';

const LEGACY_GUEST_HOSTS = new Set([
  'resortos-db7.pages.dev',
  'www.resortos-db7.pages.dev',
  'hotelos-9gg.pages.dev',
  'www.hotelos-9gg.pages.dev',
  'www.resortos.app'
]);

/**
 * Guests open stay links off our network. A LAN, Tailscale or plain-IP host does not fail
 * there — it hangs on a blank loading screen with no error, so those hosts are never sent.
 */
function reachableFromAnyPhone(hostname) {
  if (!hostname) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.ts.net')) return false;
  return hostname.includes('.');
}

export function isGuestStayHost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  return host === 'resortos.app' || host === 'www.resortos.app' || host.endsWith('.pages.dev');
}

export function normalizeGuestOrigin(raw) {
  const stored = String(raw || '').trim();
  if (!stored) return DEFAULT_GUEST_ORIGIN;
  try {
    const url = new URL(stored.includes('://') ? stored : `https://${stored}`);
    if (url.protocol !== 'https:') return DEFAULT_GUEST_ORIGIN;
    if (!reachableFromAnyPhone(url.hostname)) return DEFAULT_GUEST_ORIGIN;
    if (LEGACY_GUEST_HOSTS.has(url.hostname.toLowerCase())) return DEFAULT_GUEST_ORIGIN;
    return url.origin;
  } catch (_) {
    return DEFAULT_GUEST_ORIGIN;
  }
}

export function guestStayOrigin() {
  let stored = '';
  try {
    stored = localStorage.getItem(CUSTOM_DOMAIN_KEY) || '';
  } catch (_) {
    return DEFAULT_GUEST_ORIGIN;
  }
  const origin = normalizeGuestOrigin(stored);
  if (stored && origin !== stored.replace(/\/$/, '')) {
    try {
      localStorage.setItem(CUSTOM_DOMAIN_KEY, origin);
    } catch (_) {}
  }
  return origin;
}

export function guestStayUrl(token) {
  return `${guestStayOrigin()}/stay/${encodeURIComponent(token)}`;
}

export function agentPortalUrl() {
  return `${guestStayOrigin()}/agent`;
}
