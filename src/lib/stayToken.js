import { isGuestStayHost } from './guestStayUrl';

const STORAGE_KEY = 'hotelos-stay-token';
const DEMO_FORM_KEY = 'resortos-demo-form-token';
const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;

export function isGuestFormDemoPath(pathname = typeof window === 'undefined' ? '' : window.location.pathname, search = typeof window === 'undefined' ? '' : window.location.search) {
  const path = String(pathname || '').replace(/\/$/, '').toLowerCase();
  const params = new URLSearchParams(search || '');
  return path.endsWith('/checkout/demo')
    || path.endsWith('/demo/form')
    || params.get('form') === '1';
}

export function isGuestDemoPath(pathname = typeof window === 'undefined' ? '' : window.location.pathname, search = typeof window === 'undefined' ? '' : window.location.search) {
  if (isGuestFormDemoPath(pathname, search)) return false;
  const path = String(pathname || '').replace(/\/$/, '').toLowerCase();
  const params = new URLSearchParams(search || '');
  return path === '/demo'
    || path.endsWith('/stay/demo')
    || params.get('demo') === '1'
    || params.get('preview') === '1';
}

function cleanToken(value) {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[.,;:!?)"'\]]+$/g, '')
    .trim();
}

function validToken(value) {
  const clean = cleanToken(value);
  return TOKEN_RE.test(clean) ? clean : '';
}

export function persistStayToken(token) {
  const clean = validToken(token);
  if (!clean || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, clean);
  } catch (_) {}
}

export function persistDemoFormToken(token) {
  const clean = validToken(token);
  if (!clean || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(DEMO_FORM_KEY, JSON.stringify({ token: clean, at: Date.now() }));
  } catch (_) {}
}

export function readDemoFormToken() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    const data = JSON.parse(sessionStorage.getItem(DEMO_FORM_KEY) || 'null');
    if (!data?.token || Date.now() - Number(data.at || 0) > 2 * 60 * 60 * 1000) return '';
    return validToken(data.token);
  } catch {
    return '';
  }
}

export function resolveStayToken() {
  if (typeof window === 'undefined') return '';
  if (isGuestDemoPath()) return '';

  const params = new URLSearchParams(window.location.search);
  const fromQuery = validToken(params.get('token'));
  const pathMatch = window.location.pathname.match(/\/(?:stay|checkout)\/(tok_[A-Za-z0-9_-]+)/i);
  const fromPath = validToken(pathMatch && pathMatch[1]);
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const fromHash = validToken(hashParams.get('token'));
  const token = fromQuery || fromPath || fromHash;
  const onGuestHost = typeof window !== 'undefined' && (
    isGuestStayHost(window.location.hostname) ||
    window.location.pathname.endsWith('guest.html')
  );

  if (token) {
    if (onGuestHost) persistStayToken(token);
    return token;
  }

  if (!onGuestHost) return '';

  try {
    return validToken(localStorage.getItem(STORAGE_KEY));
  } catch (_) {
    return '';
  }
}
